// Vercel deploys /api/* serverless functions at the same domain as the frontend.
// Empty base URL means relative paths, which works on any Vercel deployment.
export const BACKEND_BASE_URL = '';
export const CONVERT_ENDPOINT = `${BACKEND_BASE_URL}/api/conversion/convert`;
export const UNLOCK_ENDPOINT  = `${BACKEND_BASE_URL}/api/user/unlock`;