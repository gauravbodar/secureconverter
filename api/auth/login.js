import bcrypt from 'bcryptjs';
import { setCors } from '../middleware/corsHeaders.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { supabase } from '../lib/supabase.js';
import { signToken } from '../lib/jwt.js';
import { isValidEmail, normalizeEmail } from '../utils/validators.js';
import { success, Errors } from '../utils/response.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  authLimiter(req, res, async () => {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || !password) return Errors.INVALID_CREDENTIALS(res);

    try {
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

    } catch (err) {
      console.error('[auth/login]', err);
      return Errors.INTERNAL(res);
    }
  });
}
