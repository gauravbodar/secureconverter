/**
 * Simple in-memory rate limiter.
 *
 * NOTE: This works within a single warm Lambda instance. For multi-instance
 * production deployments, replace this with Vercel KV (Redis) or Upstash.
 */

const store = new Map(); // key → { count, resetAt }

function getKey(req, prefix) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';
  return `${prefix}:${ip}`;
}

/**
 * @param {number} maxRequests - Max requests allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @param {string} prefix - Namespace key prefix
 */
export function createRateLimiter(maxRequests, windowMs, prefix = 'rl') {
  return function rateLimitMiddleware(req, res, next) {
    const key = getKey(req, prefix);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please wait and try again.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    entry.count += 1;
    return next();
  };
}

// Pre-built limiters for common use cases
export const authLimiter = createRateLimiter(10, 60_000, 'auth');
export const conversionLimiter = createRateLimiter(30, 60_000, 'convert');
export const signupLimiter = createRateLimiter(10, 60_000, 'signup');
