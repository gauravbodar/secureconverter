import { setCors } from '../middleware/corsHeaders.js';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { success, Errors } from '../utils/response.js';

const PLAN_LIMITS = { free: 10, pro: Infinity };

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return Errors.METHOD_NOT_ALLOWED(res);

  await new Promise((resolve) => requireAuth(req, res, resolve));
  if (res.headersSent) return;

  try {
    const { data: user } = await supabase
      .from('users')
      .select('plan, conversions_this_month')
      .eq('id', req.user.userId)
      .single();

    if (!user) return Errors.UNAUTHORIZED(res);

    const limit     = PLAN_LIMITS[user.plan] ?? 10;
    const used      = user.conversions_this_month ?? 0;
    const remaining = limit === Infinity ? null : Math.max(0, limit - used);

    // Next reset: first of next month
    const now       = new Date();
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .slice(0, 10);

    return success(res, {
      usage: {
        conversionsThisMonth: used,
        conversionLimit:      limit === Infinity ? 'unlimited' : limit,
        plan:                 user.plan,
        remainingConversions: remaining,
        resetDate,
      },
    });
  } catch (err) {
    console.error('[user/usage]', err);
    return Errors.INTERNAL(res);
  }
}
