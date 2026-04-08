# CLAUDE CODE PROMPT: Generate Full Backend for Bank Statement Converter (Vercel Deployment)

## PROJECT CONTEXT

**Frontend Repository:** https://github.com/gauravbodar/secureconverter  
**Current Stack:** React + Vite + Tailwind CSS  
**Deployment Target:** Vercel (frontend + backend together)  
**Domain:** Will be transferred from Hostinger to Vercel  

**Goal:** Generate a complete serverless backend that integrates with the existing frontend, handles MailerLite signups, PDF parsing, user authentication, and payments.

---

## ARCHITECTURE OVERVIEW

```
Frontend (React/Vite) ← API Calls → Backend (Vercel Serverless Functions)
                                    ↓
                          MailerLite (Email)
                          Supabase (Database)
                          Stripe (Payments)
```

---

## BACKEND REQUIREMENTS

### 1. VERCEL SERVERLESS FUNCTIONS STRUCTURE

Create these API endpoints as Vercel serverless functions:

```
api/
├── mailerlite-signup.js          (POST - waitlist signup)
├── auth/
│   ├── register.js               (POST - user registration)
│   ├── login.js                  (POST - user login)
│   └── verify-token.js           (POST - JWT verification)
├── conversion/
│   ├── upload.js                 (POST - handle file upload)
│   └── convert.js                (POST - PDF to CSV conversion)
├── user/
│   ├── profile.js                (GET - get user profile)
│   └── usage.js                  (GET - get conversion quota/usage)
├── payment/
│   ├── create-checkout.js        (POST - Stripe checkout)
│   └── webhook.js                (POST - Stripe webhook handler)
└── health.js                     (GET - health check)
```

---

## DETAILED ENDPOINT SPECIFICATIONS

### A. MAILERLITE ENDPOINTS

**Endpoint:** `POST /api/mailerlite-signup`
- **Purpose:** Add email to MailerLite waitlist
- **Input:** `{ email, firstName }`
- **Output:** `{ success, alreadySubscribed, message }`
- **Auth:** Public (no auth required)
- **Rate Limit:** 10 requests per minute per IP
- **Integration:** Use MailerLite Connect API v2
- **Validation:**
  - Email format validation
  - First name: min 2 chars, max 50 chars
  - Duplicate email handling (return 200 if already exists)

**MailerLite Config:**
- API Key from env: `MAILERLITE_API_KEY`
- Group/Audience ID from env: `MAILERLITE_GROUP_ID`
- Endpoint: `https://connect.mailerlite.com/api/subscribers`
- Auth: Bearer token in header

---

### B. AUTHENTICATION ENDPOINTS

**Endpoint:** `POST /api/auth/register`
- **Purpose:** Create new user account
- **Input:** `{ email, password, firstName }`
- **Output:** `{ success, userId, token, expiresIn }`
- **Auth:** Public
- **Database:** Store in Supabase `users` table
- **Security:**
  - Hash password with bcrypt (salt rounds: 10)
  - Validate email format
  - Check for duplicate email
  - Password min 8 chars, complexity rules
- **JWT Token:**
  - Secret from env: `JWT_SECRET`
  - Expires in: 7 days
  - Payload: `{ userId, email, iat, exp }`

**Endpoint:** `POST /api/auth/login`
- **Purpose:** Authenticate user and return JWT
- **Input:** `{ email, password }`
- **Output:** `{ success, userId, token, expiresIn, user: { email, firstName, plan } }`
- **Auth:** Public
- **Logic:**
  - Find user by email in Supabase
  - Compare password hash using bcrypt
  - Return JWT on success
  - Return 401 on failure

**Endpoint:** `POST /api/auth/verify-token`
- **Purpose:** Verify JWT token validity
- **Input:** `{ token }` (in Authorization header: Bearer token)
- **Output:** `{ valid, userId, email }`
- **Auth:** Required (Bearer token)
- **Logic:**
  - Verify JWT signature
  - Check expiration
  - Return user data if valid

---

### C. FILE CONVERSION ENDPOINTS

**Endpoint:** `POST /api/conversion/upload`
- **Purpose:** Handle bank statement PDF file upload (max 10MB)
- **Input:** FormData with file (multipart/form-data)
- **Output:** `{ success, uploadId, filename, fileSize, uploadedAt }`
- **Auth:** Required (Bearer token)
- **Logic:**
  - Validate file is PDF (MIME type check)
  - Validate file size (max 10MB)
  - Store temporarily in `/tmp` (or Vercel's ephemeral storage)
  - Generate unique uploadId (uuid)
  - Return uploadId to client for next step
  - **Security:** Use uploaded file name sanitization

**Endpoint:** `POST /api/conversion/convert`
- **Purpose:** Parse PDF and convert to CSV
- **Input:** `{ uploadId }`
- **Output:** `{ success, csvData, filename, downloadUrl }`
- **Auth:** Required (Bearer token)
- **Dependencies:**
  - PDF parsing library: `pdfjs-dist` or `pdf-lib`
  - CSV generation: `csv-stringify`
- **Logic:**
  - Retrieve file from temp storage using uploadId
  - Parse PDF using pdfjs-dist
  - Extract text/tables from bank statement
  - Identify columns: Date, Description, Debit, Credit, Balance
  - Handle multiple Australian bank formats (NAB, Westpac, CBA, ANZ)
  - Generate CSV output
  - Store CSV in Vercel storage OR return as response
  - Delete original PDF from temp storage
  - Track usage for user (increment conversion count)
  - Return CSV download link or CSV data
- **Bank Statement Parsing:**
  - NAB format detection
  - Westpac format detection
  - Commonwealth Bank format detection
  - ANZ format detection
  - Generic fallback parser
- **Output CSV Format:**
  - Columns: `Date,Description,Debit,Credit,Balance`
  - Date format: YYYY-MM-DD
  - Currency as numbers (no $ symbol)
  - Proper escaping for special chars

---

### D. USER PROFILE ENDPOINTS

**Endpoint:** `GET /api/user/profile`
- **Purpose:** Get user profile and account info
- **Auth:** Required (Bearer token)
- **Output:**
```json
{
  "success": true,
  "user": {
    "userId": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "plan": "free",
    "createdAt": "2026-04-01T00:00:00Z",
    "stripeCustomerId": "cus_xyz"
  }
}
```

**Endpoint:** `GET /api/user/usage`
- **Purpose:** Get user's conversion quota and usage
- **Auth:** Required (Bearer token)
- **Output:**
```json
{
  "success": true,
  "usage": {
    "conversionsThisMonth": 5,
    "conversionLimit": 10,
    "plan": "free",
    "remainingConversions": 5,
    "resetDate": "2026-05-01"
  }
}
```

---

### E. PAYMENT ENDPOINTS

**Endpoint:** `POST /api/payment/create-checkout`
- **Purpose:** Create Stripe checkout session
- **Input:** `{ planId }` (e.g., "pro-monthly", "pro-yearly")
- **Auth:** Required (Bearer token)
- **Output:** `{ success, checkoutUrl, sessionId }`
- **Logic:**
  - Get user from token
  - Create Stripe checkout session
  - Set up recurring subscription
  - Include success/cancel URLs
  - Return Stripe checkout URL
- **Plans:**
  - Free: 10 conversions/month (no payment)
  - Pro Monthly: $9/month, unlimited conversions
  - Pro Yearly: $79/year, unlimited conversions

**Endpoint:** `POST /api/payment/webhook`
- **Purpose:** Handle Stripe webhook events
- **Input:** Stripe webhook payload (signed)
- **Auth:** Stripe signature verification (not JWT)
- **Logic:**
  - Verify Stripe signature (env: `STRIPE_WEBHOOK_SECRET`)
  - Handle events:
    - `checkout.session.completed` → Update user plan to Pro
    - `customer.subscription.deleted` → Downgrade to Free
    - `invoice.payment_failed` → Send notification
  - Update Supabase user record
  - Return 200 status

---

### F. HEALTH CHECK

**Endpoint:** `GET /api/health`
- **Purpose:** Simple health check
- **Auth:** Public
- **Output:** `{ status: "ok", timestamp }`

---

## DATABASE SCHEMA (Supabase)

### Table: `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  firstName VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  plan VARCHAR(20) DEFAULT 'free', -- free, pro
  stripe_customer_id VARCHAR(255),
  subscription_id VARCHAR(255),
  conversions_this_month INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_conversion_at TIMESTAMP
);
```

### Table: `conversions`
```sql
CREATE TABLE conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255),
  file_size INT,
  bank_type VARCHAR(50), -- nab, westpac, cba, anz
  conversion_time_ms INT,
  status VARCHAR(50), -- success, failed
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## ENVIRONMENT VARIABLES REQUIRED

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SECRET=your_supabase_service_role_key

# MailerLite
MAILERLITE_API_KEY=mlsn_xxx
MAILERLITE_GROUP_ID=xxx

# Authentication
JWT_SECRET=your_super_secret_jwt_key

# Stripe
STRIPE_PUBLIC_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App Config
NEXT_PUBLIC_API_URL=https://yourdomain.com
NODE_ENV=production
```

---

## IMPLEMENTATION REQUIREMENTS

### Dependencies to Install
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.0.0",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.0",
    "pdfjs-dist": "^3.11.174",
    "csv-stringify": "^6.3.0",
    "stripe": "^12.0.0",
    "uuid": "^9.0.0"
  }
}
```

### Middleware
- **JWT Authentication Middleware:** Verify token on protected routes
- **Rate Limiting:** Implement rate limit for signup/login (10 req/min per IP)
- **CORS:** Enable CORS for your domain only
- **Error Handling:** Standardized error responses with proper HTTP status codes

### File Organization
```
api/
├── middleware/
│   ├── auth.js          (JWT verification)
│   ├── rateLimit.js     (Rate limiting)
│   └── corsHeaders.js   (CORS headers)
├── lib/
│   ├── supabase.js      (Supabase client)
│   ├── stripe.js        (Stripe client)
│   ├── mailerlite.js    (MailerLite client)
│   ├── jwt.js           (JWT utilities)
│   └── pdf-parser.js    (PDF parsing logic)
├── utils/
│   ├── validators.js    (Input validation)
│   ├── errors.js        (Error handling)
│   └── response.js      (Standardized responses)
└── [other endpoints as above]
```

---

## SECURITY REQUIREMENTS

1. **Password Hashing:**
   - Use bcrypt with salt rounds 10
   - Never store plain text passwords

2. **JWT Tokens:**
   - Sign with HS256
   - Include exp claim
   - Verify signature on every request

3. **API Key Protection:**
   - All API keys in environment variables
   - Never commit .env files
   - Use Vercel secrets for sensitive data

4. **Input Validation:**
   - Email format validation (regex)
   - File type validation (MIME type)
   - File size validation
   - SQL injection prevention (use Supabase prepared statements)

5. **Rate Limiting:**
   - Auth endpoints: 10 requests/minute per IP
   - Conversion endpoints: 30 requests/minute per user
   - File upload: 100MB/minute per user

6. **HTTPS Only:**
   - All endpoints require HTTPS
   - No mixed content
   - Secure cookies (httpOnly, sameSite)

---

## ERROR HANDLING

Return standardized error responses:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE",
  "status": 400
}
```

Error codes:
- `INVALID_EMAIL`
- `WEAK_PASSWORD`
- `USER_EXISTS`
- `INVALID_CREDENTIALS`
- `UNAUTHORIZED`
- `FILE_TOO_LARGE`
- `INVALID_FILE_TYPE`
- `CONVERSION_FAILED`
- `PAYMENT_FAILED`
- `RATE_LIMIT_EXCEEDED`

---

## LOGGING & MONITORING

- Log all API calls with timestamp and user ID
- Log errors with full stack trace
- Monitor Stripe webhook failures
- Track PDF parsing success rate by bank type

---

## TESTING REQUIREMENTS

Before deployment, test:
1. ✓ MailerLite signup endpoint (duplicate handling)
2. ✓ User registration (password hashing, validation)
3. ✓ User login (correct/incorrect credentials)
4. ✓ JWT verification
5. ✓ File upload (valid/invalid file types)
6. ✓ PDF parsing (all 4 bank formats)
7. ✓ CSV generation (correct format)
8. ✓ User quota enforcement
9. ✓ Stripe checkout creation
10. ✓ Stripe webhook handling

---

## DEPLOYMENT TO VERCEL

- Vercel automatically detects `/api` folder as serverless functions
- No additional configuration needed
- Environment variables set in Vercel project settings
- Auto-deploy on git push to main branch

---

## FRONTEND INTEGRATION POINTS

Frontend should call:
- `POST /api/mailerlite-signup` (from waitlist page)
- `POST /api/auth/register` (from registration page)
- `POST /api/auth/login` (from login page)
- `POST /api/conversion/upload` (from upload form)
- `POST /api/conversion/convert` (after file upload)
- `GET /api/user/profile` (from dashboard)
- `GET /api/user/usage` (from dashboard)
- `POST /api/payment/create-checkout` (from pricing page)

All requests should include: `Authorization: Bearer {JWT_TOKEN}`

---

## DELIVERABLES

1. ✓ Complete serverless function structure for Vercel
2. ✓ All 10+ API endpoints implemented
3. ✓ Database schema and migrations (Supabase)
4. ✓ Authentication system (JWT + password hashing)
5. ✓ PDF parsing for all 4 Australian bank formats
6. ✓ CSV generation with proper formatting
7. ✓ MailerLite integration
8. ✓ Stripe payment integration
9. ✓ User quota/usage tracking
10. ✓ Error handling and validation
11. ✓ Rate limiting
12. ✓ Logging and monitoring
13. ✓ Environment variable documentation
14. ✓ Deployment-ready code

---

## NOTES

- **API Key Exposure:** MailerLite API key needs subscriber-write permission only (safe for waitlist)
- **File Storage:** Use Vercel's ephemeral storage for temp files (auto-cleaned) or Supabase Storage
- **PDF Parsing:** Start with popular banks (NAB, Westpac, CBA, ANZ), fallback to generic parser
- **Stripe:** Use test keys for development, live keys for production
- **Database:** Supabase provides PostgreSQL with free tier (perfect for this project)

---

## NEXT STEPS AFTER IMPLEMENTATION

1. Set up Supabase account and get credentials
2. Create Stripe account and get API keys
3. Add MailerLite credentials to Vercel
4. Deploy to Vercel (automatic from GitHub)
5. Test all endpoints
6. Set up custom domain with Vercel
7. Configure Stripe webhook URLs
8. Set up monitoring/logging (Sentry or similar)

---

This prompt is comprehensive and production-ready. Claude Code will generate a fully functional backend.