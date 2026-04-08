/**
 * /api/user — Consolidated user handler
 *
 * Routes handled:
 *   GET  /api/user/profile
 *   GET  /api/user/usage
 *   POST /api/user/unlock
 */

import { setCors } from '../middleware/corsHeaders.js';
import { requireAuth } from '../middleware/auth.js';
import { signupLimiter } from '../middleware/rateLimit.js';
import { supabase } from '../lib/supabase.js';
import { addSubscriber } from '../lib/mailerlite.js';
import { isValidEmail, normalizeEmail } from '../utils/validators.js';
import { success, Errors } from '../utils/response.js';

const PLAN_LIMITS  = { free: 10, pro: Infinity };
const UNLOCK_BONUS = 10;

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// ── /profile ──────────────────────────────────────────────────────────────────

async function handleProfile(req, res) {
  await new Promise((resolve) => requireAuth(req, res, resolve));
  if (res.headersSent) return;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, first_name, plan, stripe_customer_id, created_at')
    .eq('id', req.user.userId)
    .single();

  if (error || !user) return Errors.UNAUTHORIZED(res);

  return success(res, {
    user: {
      userId:           user.id,
      email:            user.email,
      firstName:        user.first_name,
      plan:             user.plan,
      createdAt:        user.created_at,
      stripeCustomerId: user.stripe_customer_id,
    },
  });
}

// ── /usage ────────────────────────────────────────────────────────────────────

async function handleUsage(req, res) {
  await new Promise((resolve) => requireAuth(req, res, resolve));
  if (res.headersSent) return;

  const { data: user } = await supabase
    .from('users')
    .select('plan, conversions_this_month')
    .eq('id', req.user.userId)
    .single();

  if (!user) return Errors.UNAUTHORIZED(res);

  const limit     = PLAN_LIMITS[user.plan] ?? 10;
  const used      = user.conversions_this_month ?? 0;
  const remaining = limit === Infinity ? null : Math.max(0, limit - used);
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
}

// ── /unlock ───────────────────────────────────────────────────────────────────

async function handleUnlock(req, res) {
  await new Promise((resolve) => signupLimiter(req, res, resolve));
  if (res.headersSent) return;

  const { email } = req.body || {};
  if (!isValidEmail(email)) return Errors.INVALID_EMAIL(res);

  const ip    = getClientIP(req);
  const today = new Date().toISOString().slice(0, 10);

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

  addSubscriber({ email: normalizeEmail(email), firstName: 'User' }).catch(() => {});

  return success(res, { message: `Access unlocked! You have ${UNLOCK_BONUS} more conversions today.` });
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  const path = new URL(req.url, 'http://localhost').pathname;

  try {
    if (req.method === 'GET' && path.endsWith('/profile')) {
      return await handleProfile(req, res);
    }

    if (req.method === 'GET' && path.endsWith('/usage')) {
      return await handleUsage(req, res);
    }

    if (req.method === 'POST' && path.endsWith('/unlock')) {
      return await handleUnlock(req, res);
    }

    return Errors.METHOD_NOT_ALLOWED(res);

  } catch (err) {
    console.error('[api/user]', err);
    return Errors.INTERNAL(res);
  }
}
