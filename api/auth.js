/**
 * /api/auth — Consolidated authentication handler
 *
 * Routes handled (path parsed from req.url):
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/verify-token
 */

import bcrypt from 'bcryptjs';
import { setCors } from './middleware/corsHeaders.js';
import { authLimiter } from './middleware/rateLimit.js';
import { supabase } from './lib/supabase.js';
import { signToken, verifyToken } from './lib/jwt.js';
import { isValidEmail, isValidPassword, isValidName, normalizeEmail } from './utils/validators.js';
import { success, Errors } from './utils/response.js';

// ── helpers ───────────────────────────────────────────────────────────────────

async function handleRegister(req, res) {
  const { email, password, firstName } = req.body || {};

  if (!isValidEmail(email))       return Errors.INVALID_EMAIL(res);
  if (!isValidPassword(password)) return Errors.WEAK_PASSWORD(res);
  if (!isValidName(firstName))    return res.status(400).json({ success: false, error: 'First name must be 2–50 characters.', code: 'INVALID_NAME' });

  const normEmail = normalizeEmail(email);

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', normEmail)
    .single();

  if (existing) return Errors.USER_EXISTS(res);

  const passwordHash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from('users')
    .insert({ email: normEmail, first_name: firstName.trim(), password_hash: passwordHash })
    .select('id, email, first_name, plan')
    .single();

  if (error) throw error;

  const token = signToken({ userId: user.id, email: user.email });

  return success(res, {
    userId: user.id,
    token,
    expiresIn: '7d',
    user: { email: user.email, firstName: user.first_name, plan: user.plan },
  }, 201);
}

async function handleLogin(req, res) {
  const { email, password } = req.body || {};

  if (!isValidEmail(email) || !password) return Errors.INVALID_CREDENTIALS(res);

  const { data: user } = await supabase
    .from('users')
    .select('id, email, first_name, plan, password_hash')
    .eq('email', normalizeEmail(email))
    .single();

  if (!user) return Errors.INVALID_CREDENTIALS(res);

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return Errors.INVALID_CREDENTIALS(res);

  const token = signToken({ userId: user.id, email: user.email });

  return success(res, {
    userId: user.id,
    token,
    expiresIn: '7d',
    user: { email: user.email, firstName: user.first_name, plan: user.plan },
  });
}

async function handleVerifyToken(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return Errors.UNAUTHORIZED(res);

  try {
    const payload = await verifyToken(authHeader.slice(7).trim());
    return success(res, { valid: true, userId: payload.userId, email: payload.email });
  } catch {
    return res.status(401).json({ success: false, valid: false, error: 'Token is invalid or expired.', code: 'UNAUTHORIZED' });
  }
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  const path = new URL(req.url, 'http://localhost').pathname;

  try {
    // Rate limit auth routes
    await new Promise((resolve) => authLimiter(req, res, resolve));
    if (res.headersSent) return;

    if (req.method === 'POST' && path.endsWith('/register')) {
      return await handleRegister(req, res);
    }

    if (req.method === 'POST' && path.endsWith('/login')) {
      return await handleLogin(req, res);
    }

    if (req.method === 'POST' && path.endsWith('/verify-token')) {
      return await handleVerifyToken(req, res);
    }

    return Errors.METHOD_NOT_ALLOWED(res);

  } catch (err) {
    console.error('[api/auth]', err);
    return Errors.INTERNAL(res);
  }
}
