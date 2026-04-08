/**
 * POST /api/payment/webhook
 * Stripe webhook handler. Signature verification required.
 * Must receive raw body — disable body parsing.
 */

import { setCors } from '../middleware/corsHeaders.js';
import { stripe } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const sig     = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[payment/webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata?.userId;
        if (!userId) break;

        await supabase
          .from('users')
          .update({
            plan:                'pro',
            stripe_customer_id:  session.customer,
            subscription_id:     session.subscription,
            updated_at:          new Date().toISOString(),
          })
          .eq('id', userId);

        console.log(`[webhook] User ${userId} upgraded to Pro`);
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
        // TODO: Send notification email via MailerLite transactional
        break;
      }

      default:
        // Unhandled event type — safe to ignore
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[payment/webhook] handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed.' });
  }
}
