/**
 * Standardized response helpers for Vercel serverless functions.
 */

export function success(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({ success: true, ...data });
}

export function error(res, message, code, statusCode = 400) {
  return res.status(statusCode).json({ success: false, error: message, code });
}

export const Errors = {
  INVALID_EMAIL:        (res) => error(res, 'Please enter a valid email address.', 'INVALID_EMAIL', 400),
  WEAK_PASSWORD:        (res) => error(res, 'Password must be at least 8 characters with a number and letter.', 'WEAK_PASSWORD', 400),
  USER_EXISTS:          (res) => error(res, 'An account with this email already exists.', 'USER_EXISTS', 409),
  INVALID_CREDENTIALS:  (res) => error(res, 'Invalid email or password.', 'INVALID_CREDENTIALS', 401),
  UNAUTHORIZED:         (res) => error(res, 'Authentication required.', 'UNAUTHORIZED', 401),
  FILE_TOO_LARGE:       (res) => error(res, 'File exceeds 10MB limit.', 'FILE_TOO_LARGE', 413),
  INVALID_FILE_TYPE:    (res) => error(res, 'Only PDF files are accepted.', 'INVALID_FILE_TYPE', 415),
  CONVERSION_FAILED:    (res) => error(res, 'Failed to parse the PDF. Please ensure it is a valid bank statement.', 'CONVERSION_FAILED', 422),
  PAYMENT_FAILED:       (res) => error(res, 'Payment processing failed.', 'PAYMENT_FAILED', 402),
  RATE_LIMIT_EXCEEDED:  (res) => error(res, 'Too many requests. Please wait and try again.', 'RATE_LIMIT_EXCEEDED', 429),
  DAILY_LIMIT_REACHED:  (res) => error(res, 'Daily conversion limit reached. Submit your email to unlock more.', 'DAILY_LIMIT_REACHED', 403),
  METHOD_NOT_ALLOWED:   (res) => error(res, 'Method not allowed.', 'METHOD_NOT_ALLOWED', 405),
  INTERNAL:             (res, msg = 'Internal server error.') => error(res, msg, 'INTERNAL_ERROR', 500),
};
