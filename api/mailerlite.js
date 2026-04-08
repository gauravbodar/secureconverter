/**
 * /api/mailerlite — Waitlist signup handler
 *
 * Routes handled:
 *   POST /api/mailerlite  (also rewritten from /api/mailerlite-signup via vercel.json)
 */

import { setCors } from './middleware/corsHeaders.js';
import { signupLimiter } from './middleware/rateLimit.js';
import { addSubscriber } from './lib/mailerlite.js';
import { isValidEmail, isValidName, normalizeEmail } from './utils/validators.js';
import { success, Errors } from './utils/response.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  await new Promise((resolve) => signupLimiter(req, res, resolve));
  if (res.headersSent) return;

  const { email, firstName } = req.body || {};

  if (!isValidEmail(email)) return Errors.INVALID_EMAIL(res);
  if (!isValidName(firstName)) {
    return res.status(400).json({ success: false, error: 'First name must be 2–50 characters.', code: 'INVALID_NAME' });
  }

  try {
    const result = await addSubscriber({ email: normalizeEmail(email), firstName });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error, code: 'MAILERLITE_ERROR' });
    }

    return success(res, {
      alreadySubscribed: !!result.alreadySubscribed,
      message: result.alreadySubscribed
        ? 'You are already on the waitlist!'
        : 'Successfully added to the waitlist!',
    });
  } catch (err) {
    console.error('[api/mailerlite]', err);
    return Errors.INTERNAL(res);
  }
}
