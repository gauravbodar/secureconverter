import { setCors } from '../middleware/corsHeaders.js';
import { verifyToken } from '../lib/jwt.js';
import { success, Errors } from '../utils/response.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return Errors.METHOD_NOT_ALLOWED(res);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return Errors.UNAUTHORIZED(res);

  try {
    const payload = await verifyToken(authHeader.slice(7).trim());
    return success(res, { valid: true, userId: payload.userId, email: payload.email });
  } catch {
    return res.status(401).json({ success: false, valid: false, error: 'Token is invalid or expired.', code: 'UNAUTHORIZED' });
  }
}
