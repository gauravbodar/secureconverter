/**
 * /api/payment — Consolidated payment handler
 *
 * Routes handled:
 *   POST /api/payment/create-checkout
 *   POST /api/payment/webhook
 *
 * bodyParser is disabled globally so the webhook route can receive the raw body
 * needed for Stripe signature verification. The checkout route parses JSON manually.
 */

import { setCors } from '../middleware/corsHeaders.js';
import { requireAuth } from '../middleware/auth.js';
import { stripe, PLANS } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';
import { success, Errors } from '../utils/response.js';

export const config = { api: { bodyParser: false } };

const APP_URL = process.env.NEXT_PUBLIC_API_URL || 'https://securestatementconverter.com';

// ── raw body helper ───────────────────────────────────────────────────────────

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── /create-checkout ──────────────────────────────────────────────────────────

async function handleCreateCheckout(req, res, rawBody) {
  await new Promise((resolve) => requireAuth(req, res, resolve));
  if (res.headersSent) return;

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body.', code: 'BAD_REQUEST' });
  }

  const { planId } = body;
  const plan = PLANS[planId];

  if (!plan || !plan.priceId) {
    return res.status(400).json({ success: false, error: 'Invalid or unconfigured plan.', code: 'INVALID_PLAN' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('email, stripe_customer_id')
    .eq('id', req.user.userId)
    .single();

  if (!user) return Errors.UNAUTHORIZED(res);

  const session = await stripe.checkout.sessions.create({
    mode:                  'subscription',
    payment_method_types:  ['card'],
    customer_email:        user.stripe_customer_id ? undefined : user.email,
    customer:              user.stripe_customer_id || undefined,
    line_items:            [{ price: plan.priceId, quantity: 1 }],
    metadata:              { userId: req.user.userId, planId },
    success_url:           `${APP_URL}/dashboard?payment=success`,
    cancel_url:            `${APP_URL}/pricing?payment=cancelled`,
  });

  return success(res, { checkoutUrl: session.url, sessionId: session.id });
}

// ── /webhook ──────────────────────────────────────────────────────────────────

async function handleWebhook(req, res, rawBody) {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[payment/webhook] signature failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata?.userId;
        if (userId) {
          await supabase
            .from('users')
            .update({
              plan:               'pro',
              stripe_customer_id: session.customer,
              subscription_id:    session.subscription,
              updated_at:         new Date().toISOString(),
            })
            .eq('id', userId);
          console.log(`[webhook] User ${userId} upgraded to Pro`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', sub.customer)
          .single();

        if (user) {
          await supabase
            .from('users')
            .update({ plan: 'free', subscription_id: null, updated_at: new Date().toISOString() })
            .eq('id', user.id);
          console.log(`[webhook] User ${user.id} downgraded to Free`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.warn(`[webhook] Payment failed for customer ${invoice.customer}`);
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[payment/webhook] handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  const path    = new URL(req.url, 'http://localhost').pathname;
  const rawBody = await getRawBody(req);

  try {
    if (path.endsWith('/create-checkout')) {
      return await handleCreateCheckout(req, res, rawBody);
    }

    if (path.endsWith('/webhook')) {
      return await handleWebhook(req, res, rawBody);
    }

    return Errors.METHOD_NOT_ALLOWED(res);

  } catch (err) {
    console.error('[api/payment]', err);
    return Errors.INTERNAL(res);
  }
}
