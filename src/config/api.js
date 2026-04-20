// Vercel deploys /api/* serverless functions at the same domain as the frontend.
// Empty base URL means relative paths, which works on any Vercel deployment.
export const BACKEND_BASE_URL = '';
export const CONVERT_ENDPOINT   = `${BACKEND_BASE_URL}/api/conversion/convert`;
export const UNLOCK_ENDPOINT    = `${BACKEND_BASE_URL}/api/user/unlock`;
export const SIGNUP_ENDPOINT    = `${BACKEND_BASE_URL}/api/auth/signup`;
export const LOGIN_ENDPOINT     = `${BACKEND_BASE_URL}/api/auth/login`;
export const CHECKOUT_ENDPOINT  = `${BACKEND_BASE_URL}/api/payment/create-checkout`;