import { verifyToken } from '../lib/jwt.js';
import { Errors } from '../utils/response.js';

/**
 * Extracts and verifies the JWT from the Authorization header.
 * On success, attaches `req.user = { userId, email }` and calls next().
 * On failure, responds with 401.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Errors.UNAUTHORIZED(res);
  }

  const token = authHeader.slice(7).trim();

  try {
    const payload = await verifyToken(token);
    req.user = { userId: payload.userId, email: payload.email };
    return next();
  } catch {
    return Errors.UNAUTHORIZED(res);
  }
}

/**
 * Optional auth: attaches user if token present, continues regardless.
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = await verifyToken(authHeader.slice(7).trim());
      req.user = { userId: payload.userId, email: payload.email };
    } catch {
      req.user = null;
    }
  }
  return next();
}
