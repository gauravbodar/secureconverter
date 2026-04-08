import { setCors } from '../middleware/corsHeaders.js';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { success, Errors } from '../utils/response.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return Errors.METHOD_NOT_ALLOWED(res);

  await new Promise((resolve) => requireAuth(req, res, resolve));
  if (res.headersSent) return;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, plan, stripe_customer_id, created_at')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) return Errors.UNAUTHORIZED(res);

    return success(res, {
      user: {
        userId:          user.id,
        email:           user.email,
        firstName:       user.first_name,
        plan:            user.plan,
        createdAt:       user.created_at,
        stripeCustomerId: user.stripe_customer_id,
      },
    });
  } catch (err) {
    console.error('[user/profile]', err);
    return Errors.INTERNAL(res);
  }
}
