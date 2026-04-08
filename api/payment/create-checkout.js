import { setCors } from '../middleware/corsHeaders.js';
import { requireAuth } from '../middleware/auth.js';
import { stripe, PLANS } from '../lib/stripe.js';
import { supabase } from '../lib/supabase.js';
import { success, Errors } from '../utils/response.js';

const APP_URL = process.env.NEXT_PUBLIC_API_URL || 'https://securestatementconverter.com';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  await new Promise((resolve) => requireAuth(req, res, resolve));
  if (res.headersSent) return;

  const { planId } = req.body || {};
  const plan = PLANS[planId];

  if (!plan || !plan.priceId) {
    return res.status(400).json({ success: false, error: 'Invalid or unconfigured plan.', code: 'INVALID_PLAN' });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('email, stripe_customer_id')
      .eq('id', req.user.userId)
      .single();

    if (!user) return Errors.UNAUTHORIZED(res);

    const session = await stripe.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      customer_email:     user.stripe_customer_id ? undefined : user.email,
      customer:           user.stripe_customer_id || undefined,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      metadata:   { userId: req.user.userId, planId },
      success_url: `${APP_URL}/dashboard?payment=success`,
      cancel_url:  `${APP_URL}/pricing?payment=cancelled`,
    });

    return success(res, { checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[payment/create-checkout]', err);
    return Errors.INTERNAL(res, 'Failed to create checkout session.');
  }
}
