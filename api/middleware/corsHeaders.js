const ALLOWED_ORIGINS = [
  'https://securestatementconverter.com',
  'https://www.securestatementconverter.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

/**
 * Set CORS headers. Returns true if it handled a preflight (OPTIONS) request.
 */
export function setCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow all origins in development; lock down in production via env
    res.setHeader('Access-Control-Allow-Origin', process.env.NODE_ENV === 'production' ? 'https://securestatementconverter.com' : '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // preflight handled
  }
  return false;
}
