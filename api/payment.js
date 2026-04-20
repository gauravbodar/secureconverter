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
  // Authenticate via Supabase Auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return Errors.UNAUTHORIZED(res);

  const token = authHeader.slice(7).trim();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Errors.UNAUTHORIZED(res);
  req.user = { userId: user.id, email: user.email };

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body.', code: 'BAD_REQUEST' });
  }

  // plan = 'pro' | 'accountant'
  const { plan: planKey } = body;
  const plan = PLANS[planKey];

  if (!plan || !plan.priceId) {
    return res.status(400).json({
      success: false,
      error: `Invalid or unconfigured plan "${planKey}". Valid options: pro, accountant.`,
      code: 'INVALID_PLAN',
    });
  }

  // Look up email from Supabase Auth (profiles table)
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', req.user.userId)
    .single();

  const email = profile?.email || req.user.email;
  if (!email) return Errors.UNAUTHORIZED(res);

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    customer_email:       email,
    line_items:           [{ price: plan.priceId, quantity: 1 }],
    metadata:             { userId: req.user.userId, plan: planKey },
    success_url:          `${APP_URL}/?payment=success`,
    cancel_url:           `${APP_URL}/pricing`,
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
        const plan    = session.metadata?.plan || 'pro'; // 'pro' | 'accountant'
        if (userId) {
          await supabase
            .from('profiles')
            .update({ plan })
            .eq('id', userId);
          console.log(`[webhook] User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        // Find user by email from Stripe customer object
        const customer = await stripe.customers.retrieve(sub.customer);
        if (customer && !customer.deleted && customer.email) {
          await supabase
            .from('profiles')
            .update({ plan: 'free' })
            .eq('email', customer.email);
          console.log(`[webhook] Customer ${customer.email} downgraded to free`);
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
