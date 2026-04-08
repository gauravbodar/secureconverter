import bcrypt from 'bcryptjs';
import { setCors } from '../middleware/corsHeaders.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { supabase } from '../lib/supabase.js';
import { signToken } from '../lib/jwt.js';
import { isValidEmail, isValidPassword, isValidName, normalizeEmail } from '../utils/validators.js';
import { success, Errors } from '../utils/response.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  authLimiter(req, res, async () => {
    const { email, password, firstName } = req.body || {};

    if (!isValidEmail(email))       return Errors.INVALID_EMAIL(res);
    if (!isValidPassword(password)) return Errors.WEAK_PASSWORD(res);
    if (!isValidName(firstName))    return res.status(400).json({ success: false, error: 'First name must be 2–50 characters.', code: 'INVALID_NAME' });

    const normEmail = normalizeEmail(email);

    try {
      // Check duplicate
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

    } catch (err) {
      console.error('[auth/register]', err);
      return Errors.INTERNAL(res);
    }
  });
}
