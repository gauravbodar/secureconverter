/**
 * POST /api/user/unlock
 *
 * Allows anonymous users to unlock additional conversions by submitting their email.
 * Grants +10 extra conversions for the day and adds them to MailerLite.
 */

import { setCors } from '../middleware/corsHeaders.js';
import { signupLimiter } from '../middleware/rateLimit.js';
import { supabase } from '../lib/supabase.js';
import { addSubscriber } from '../lib/mailerlite.js';
import { isValidEmail, normalizeEmail } from '../utils/validators.js';
import { success, Errors } from '../utils/response.js';

const UNLOCK_BONUS = 10;

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  await new Promise((resolve) => signupLimiter(req, res, resolve));
  if (res.headersSent) return;

  const { email } = req.body || {};
  if (!isValidEmail(email)) return Errors.INVALID_EMAIL(res);

  const ip    = getClientIP(req);
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Upsert daily_limits: raise the limit by UNLOCK_BONUS for today
    const { data: existing } = await supabase
      .from('daily_limits')
      .select('*')
      .eq('key', ip)
      .eq('date', today)
      .single();

    if (existing) {
      await supabase
        .from('daily_limits')
        .update({ unlocked: true, count: Math.max(0, existing.count - UNLOCK_BONUS) })
        .eq('id', existing.id);
    } else {
      await supabase.from('daily_limits').insert({ key: ip, date: today, count: 0, unlocked: true });
    }

    // Add to MailerLite (fire-and-forget)
    addSubscriber({ email: normalizeEmail(email), firstName: 'User' }).catch(() => {});

    return success(res, { message: `Access unlocked! You have ${UNLOCK_BONUS} more conversions today.` });
  } catch (err) {
    console.error('[user/unlock]', err);
    return Errors.INTERNAL(res);
  }
}
