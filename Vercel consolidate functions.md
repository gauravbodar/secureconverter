# CLAUDE CODE PROMPT: Consolidate API Functions for Vercel Hobby Plan

## PROBLEM

Current structure has 11+ separate serverless functions:
- `/api/mailerlite-signup.js`
- `/api/auth/register.js`
- `/api/auth/login.js`
- `/api/auth/verify-token.js`
- `/api/conversion/upload.js`
- `/api/conversion/convert.js`
- `/api/user/profile.js`
- `/api/user/usage.js`
- `/api/user/unlock.js`
- `/api/payment/create-checkout.js`
- `/api/payment/webhook.js`
- Plus utility/middleware files

**Vercel Hobby Plan Limit:** Maximum 12 serverless functions per deployment

**Solution:** Consolidate into 6 mega-functions that route internally

---

## NEW STRUCTURE (6 Functions)

```
api/
├── auth.js              (register, login, verify-token routes)
├── conversion.js        (upload, convert routes)
├── user.js              (profile, usage, unlock routes)
├── payment.js           (create-checkout, webhook routes)
├── mailerlite.js        (signup route)
├── health.js            (health check)
├── lib/                 (unchanged)
│   ├── supabase.js
│   ├── jwt.js
│   ├── mailerlite.js
│   ├── stripe.js
│   └── pdf-parser.js
├── utils/               (unchanged)
│   ├── response.js
│   ├── validators.js
│   └── errors.js
└── middleware/          (unchanged)
    ├── auth.js
    ├── corsHeaders.js
    └── rateLimit.js
```

---

## CONSOLIDATION RULES

### 1. `/api/auth.js` (handles 3 routes)

Should handle:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verify-token`

**Implementation:**
```javascript
export default async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  
  if (req.method === 'POST' && pathname.includes('/register')) {
    // Handle register logic
  } else if (req.method === 'POST' && pathname.includes('/login')) {
    // Handle login logic
  } else if (req.method === 'POST' && pathname.includes('/verify-token')) {
    // Handle verify-token logic
  }
}
```

---

### 2. `/api/conversion.js` (handles 2 routes)

Should handle:
- `POST /api/conversion/upload` (file upload)
- `POST /api/conversion/convert` (PDF parsing)

**Implementation:**
```javascript
export default async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  
  if (req.method === 'POST' && pathname.includes('/upload')) {
    // Handle file upload
  } else if (req.method === 'POST' && pathname.includes('/convert')) {
    // Handle PDF conversion
  }
}
```

---

### 3. `/api/user.js` (handles 3 routes)

Should handle:
- `GET /api/user/profile`
- `GET /api/user/usage`
- `POST /api/user/unlock`

**Implementation:**
```javascript
export default async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  
  if (req.method === 'GET' && pathname.includes('/profile')) {
    // Handle get profile
  } else if (req.method === 'GET' && pathname.includes('/usage')) {
    // Handle get usage
  } else if (req.method === 'POST' && pathname.includes('/unlock')) {
    // Handle unlock
  }
}
```

---

### 4. `/api/payment.js` (handles 2 routes)

Should handle:
- `POST /api/payment/create-checkout`
- `POST /api/payment/webhook`

**Implementation:**
```javascript
export default async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  
  if (req.method === 'POST' && pathname.includes('/create-checkout')) {
    // Handle Stripe checkout
  } else if (req.method === 'POST' && pathname.includes('/webhook')) {
    // Handle Stripe webhook
  }
}
```

---

### 5. `/api/mailerlite.js` (handles 1 route)

Should handle:
- `POST /api/mailerlite-signup`

**Implementation:** Keep as-is, just move to new location

---

### 6. `/api/health.js` (handles 1 route)

Should handle:
- `GET /api/health`

**Implementation:** Keep as-is

---

## ROUTING LOGIC

For each mega-function, parse the pathname to determine which handler to call:

```javascript
const path = new URL(req.url, 'http://localhost').pathname;

// Examples:
// path = "/api/auth/register" → call registerHandler
// path = "/api/auth/login" → call loginHandler
// path = "/api/conversion/upload" → call uploadHandler
// path = "/api/conversion/convert" → call convertHandler
```

---

## MIGRATION CHECKLIST

For each mega-function, you must:

1. ✓ Import all necessary dependencies from original functions
2. ✓ Import all middleware (auth, CORS, rate limiting)
3. ✓ Import all utility functions and libraries
4. ✓ Consolidate all route handlers into single function with conditional logic
5. ✓ Ensure proper error handling for each route
6. ✓ Ensure CORS headers applied to all routes
7. ✓ Ensure rate limiting applied correctly
8. ✓ Delete original nested function files (auth/register.js, etc.)
9. ✓ Keep `/api/lib`, `/api/utils`, `/api/middleware` unchanged

---

## EXAMPLE: `/api/auth.js` Full Implementation

```javascript
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import corsHeaders from '../middleware/corsHeaders.js';
import { success, error } from '../utils/response.js';
import { 
  validateEmail, 
  validatePassword, 
  validateName 
} from '../utils/validators.js';
import { hashPassword, comparePassword } from '../lib/jwt.js';
import { createUser, getUserByEmail } from '../lib/supabase.js';
import { signToken } from '../lib/jwt.js';

export default async function handler(req, res) {
  // Apply CORS headers to all responses
  const headers = corsHeaders(req);
  
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    
    // REGISTER
    if (path === '/api/auth/register' && req.method === 'POST') {
      const { email, password, firstName } = req.body;
      
      // Validate inputs
      if (!validateEmail(email)) {
        return res.status(400).json({
          ...error('INVALID_EMAIL', 'Invalid email format'),
          ...headers
        });
      }
      
      if (!validatePassword(password)) {
        return res.status(400).json({
          ...error('WEAK_PASSWORD', 'Password must be 8+ chars'),
          ...headers
        });
      }
      
      if (!validateName(firstName)) {
        return res.status(400).json({
          ...error('INVALID_NAME', 'Name must be 2-50 chars'),
          ...headers
        });
      }
      
      // Check if user exists
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(400).json({
          ...error('USER_EXISTS', 'Email already registered'),
          ...headers
        });
      }
      
      // Hash password
      const hashedPassword = await hashPassword(password);
      
      // Create user in Supabase
      const user = await createUser({
        email,
        firstName,
        password_hash: hashedPassword
      });
      
      // Generate JWT
      const token = signToken({ userId: user.id, email: user.email });
      
      return res.status(201).json({
        ...success({ userId: user.id, token, expiresIn: '7d' }),
        ...headers
      });
    }
    
    // LOGIN
    if (path === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = req.body;
      
      if (!validateEmail(email)) {
        return res.status(400).json({
          ...error('INVALID_EMAIL', 'Invalid email'),
          ...headers
        });
      }
      
      // Get user by email
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          ...error('INVALID_CREDENTIALS', 'Email or password incorrect'),
          ...headers
        });
      }
      
      // Compare password
      const validPassword = await comparePassword(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({
          ...error('INVALID_CREDENTIALS', 'Email or password incorrect'),
          ...headers
        });
      }
      
      // Generate JWT
      const token = signToken({ userId: user.id, email: user.email });
      
      return res.status(200).json({
        ...success({ 
          userId: user.id, 
          token, 
          expiresIn: '7d',
          user: {
            email: user.email,
            firstName: user.firstName,
            plan: user.plan
          }
        }),
        ...headers
      });
    }
    
    // VERIFY TOKEN
    if (path === '/api/auth/verify-token' && req.method === 'POST') {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          ...error('UNAUTHORIZED', 'No token provided'),
          ...headers
        });
      }
      
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (!decoded) {
        return res.status(401).json({
          ...error('UNAUTHORIZED', 'Invalid token'),
          ...headers
        });
      }
      
      return res.status(200).json({
        ...success({ valid: true, userId: decoded.userId, email: decoded.email }),
        ...headers
      });
    }
    
    // Route not found
    return res.status(404).json({
      ...error('NOT_FOUND', 'Route not found'),
      ...headers
    });
    
  } catch (err) {
    console.error('Auth handler error:', err);
    return res.status(500).json({
      ...error('INTERNAL_ERROR', 'Server error'),
      ...headers
    });
  }
}
```

---

## TESTING EACH CONSOLIDATED FUNCTION

After consolidation, test:

```bash
# Test auth
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test conversion
curl -X POST http://localhost:3000/api/conversion/convert \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uploadId":"xxx"}'

# Test user
curl -X GET http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test payment
curl -X POST http://localhost:3000/api/payment/create-checkout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planId":"pro-monthly"}'

# Test health
curl http://localhost:3000/api/health
```

---

## FINAL FILE STRUCTURE (After Consolidation)

```
api/
├── auth.js                  ✅ (1 function = 3 routes)
├── conversion.js            ✅ (1 function = 2 routes)
├── user.js                  ✅ (1 function = 3 routes)
├── payment.js               ✅ (1 function = 2 routes)
├── mailerlite.js            ✅ (1 function = 1 route)
├── health.js                ✅ (1 function = 1 route)
├── lib/
│   ├── supabase.js
│   ├── jwt.js
│   ├── mailerlite.js
│   ├── stripe.js
│   └── pdf-parser.js
├── utils/
│   ├── response.js
│   ├── validators.js
│   └── errors.js
└── middleware/
    ├── auth.js
    ├── corsHeaders.js
    └── rateLimit.js

❌ DELETE (no longer needed):
- /api/auth/register.js
- /api/auth/login.js
- /api/auth/verify-token.js
- /api/conversion/upload.js
- /api/conversion/convert.js
- /api/user/profile.js
- /api/user/usage.js
- /api/user/unlock.js
- /api/payment/create-checkout.js
- /api/payment/webhook.js
```

---

## DEPLOYMENT AFTER CONSOLIDATION

```bash
# Count functions (should be 6)
ls -la api/*.js | wc -l

# Push to GitHub
git add .
git commit -m "Consolidate 11 functions into 6 for Vercel Hobby plan"
git push origin main

# Vercel auto-deploys
# ✅ Build succeeds with 6 functions (under 12-function limit)
```

---

## DELIVERABLES

1. ✅ Consolidate 11 functions into 6 mega-functions
2. ✅ Maintain all routing logic (same URLs work)
3. ✅ Preserve all middleware and utilities
4. ✅ Keep proper error handling
5. ✅ Ensure CORS headers on all routes
6. ✅ Update only the API structure (frontend calls unchanged)
7. ✅ Delete old nested files
8. ✅ Test locally before deploying

---

## KEY POINTS

- **Frontend calls don't change** — All URLs stay the same
- **No frontend code changes** — Routing is transparent
- **All logic is preserved** — No features lost
- **Vercel limit solved** — 6 functions < 12 function limit
- **Still production-ready** — Fully functional

---

This consolidation lets you deploy on Vercel Hobby plan (free) without hitting the 12-function limit!