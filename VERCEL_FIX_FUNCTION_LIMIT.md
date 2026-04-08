# CLAUDE CODE PROMPT: Move API Utilities Out of /api Folder (Fix Vercel Limit)

## PROBLEM

Vercel Hobby plan counts **every .js file in `/api` folder as a serverless function**.

Current structure has utilities/libraries in `/api`:
```
api/
├── handler files (12 functions) ✅
├── lib/ (5 files - counted as functions) ❌
├── utils/ (3 files - counted as functions) ❌
└── middleware/ (3 files - counted as functions) ❌

Total: ~23 files = exceeds 12-function limit ❌
```

---

## SOLUTION

Move all utility files OUT of `/api` folder into `/src` folder:

```
src/
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

api/
├── mailerlite-signup.js
├── auth/register.js
├── auth/login.js
├── auth/verify-token.js
├── conversion/upload.js
├── conversion/convert.js
├── user/profile.js
├── user/usage.js
├── user/unlock.js
├── payment/create-checkout.js
├── payment/webhook.js
└── health.js

TOTAL: 12 files = under limit ✅
```

---

## WHAT CLAUDE CODE NEEDS TO DO

### 1. CREATE NEW FOLDER STRUCTURE

```bash
mkdir -p src/lib
mkdir -p src/utils
mkdir -p src/middleware
```

### 2. MOVE FILES

Move these files from `api/lib/` to `src/lib/`:
- `api/lib/supabase.js` → `src/lib/supabase.js`
- `api/lib/jwt.js` → `src/lib/jwt.js`
- `api/lib/mailerlite.js` → `src/lib/mailerlite.js`
- `api/lib/stripe.js` → `src/lib/stripe.js`
- `api/lib/pdf-parser.js` → `src/lib/pdf-parser.js`

Move these files from `api/utils/` to `src/utils/`:
- `api/utils/response.js` → `src/utils/response.js`
- `api/utils/validators.js` → `src/utils/validators.js`
- `api/utils/errors.js` → `src/utils/errors.js`

Move these files from `api/middleware/` to `src/middleware/`:
- `api/middleware/auth.js` → `src/middleware/auth.js`
- `api/middleware/corsHeaders.js` → `src/middleware/corsHeaders.js`
- `api/middleware/rateLimit.js` → `src/middleware/rateLimit.js`

### 3. UPDATE IMPORT PATHS IN ALL HANDLER FILES

For every file in `/api` that has `import` statements:

**OLD import paths:**
```javascript
import { signToken } from '../lib/jwt.js';
import { success, error } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
```

**NEW import paths (relative from api/):**
```javascript
import { signToken } from '../../src/lib/jwt.js';
import { success, error } from '../../src/utils/response.js';
import { requireAuth } from '../../src/middleware/auth.js';
```

**Update in these files:**
- `api/mailerlite-signup.js` (imports from utils, lib)
- `api/auth/register.js` (imports from utils, lib, middleware)
- `api/auth/login.js` (imports from utils, lib, middleware)
- `api/auth/verify-token.js` (imports from middleware, utils)
- `api/conversion/upload.js` (imports from utils, middleware, lib)
- `api/conversion/convert.js` (imports from utils, middleware, lib)
- `api/user/profile.js` (imports from middleware, utils, lib)
- `api/user/usage.js` (imports from middleware, utils, lib)
- `api/user/unlock.js` (imports from middleware, utils, lib)
- `api/payment/create-checkout.js` (imports from middleware, utils, lib)
- `api/payment/webhook.js` (imports from middleware, utils, lib)
- `api/health.js` (if any imports)

### 4. UPDATE LIBRARY FILES TOO

Any imports WITHIN the library files also need updating.

For example, if `src/lib/jwt.js` imports from `src/utils/response.js`:

**OLD:**
```javascript
import { error } from '../utils/response.js';
```

**NEW:**
```javascript
import { error } from '../utils/response.js'; // same, since both in src/
```

Actually, since lib and utils are siblings in `src/`, their imports to each other stay the same.

### 5. DELETE EMPTY FOLDERS

After moving files, delete empty folders:
```bash
rmdir api/lib
rmdir api/utils
rmdir api/middleware
```

---

## VERIFICATION CHECKLIST

After completion, verify:

1. ✓ `/src/lib/` contains 5 files (supabase, jwt, mailerlite, stripe, pdf-parser)
2. ✓ `/src/utils/` contains 3 files (response, validators, errors)
3. ✓ `/src/middleware/` contains 3 files (auth, corsHeaders, rateLimit)
4. ✓ `/api/lib/`, `/api/utils/`, `/api/middleware/` folders are deleted
5. ✓ All handler files in `/api` import from `../../src/lib/`, `../../src/utils/`, `../../src/middleware/`
6. ✓ All files in `/src/lib/`, `/src/utils/`, `/src/middleware/` have correct internal imports
7. ✓ No broken imports (all paths resolve correctly)
8. ✓ Only 12 handler files remain directly in `/api` and subfolders

---

## TESTING

After completion, test locally:

```bash
npm run dev

# Should build without errors
# All handlers should load correctly
# No import errors in console
```

---

## FINAL STRUCTURE

```
project-root/
├── src/
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── jwt.js
│   │   ├── mailerlite.js
│   │   ├── stripe.js
│   │   └── pdf-parser.js
│   ├── utils/
│   │   ├── response.js
│   │   ├── validators.js
│   │   └── errors.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── corsHeaders.js
│   │   └── rateLimit.js
│   └── [existing React source files]
├── api/
│   ├── mailerlite-signup.js
│   ├── health.js
│   ├── auth/
│   │   ├── register.js
│   │   ├── login.js
│   │   └── verify-token.js
│   ├── conversion/
│   │   ├── upload.js
│   │   └── convert.js
│   ├── user/
│   │   ├── profile.js
│   │   ├── usage.js
│   │   └── unlock.js
│   └── payment/
│       ├── create-checkout.js
│       └── webhook.js
├── vercel.json
├── package.json
└── [other files]
```

**Total files in `/api`: 12 handler files ✅**
**Total Vercel functions counted: 12 ✅ (under limit)**

---

## IMPORTANT NOTES

1. **Import path pattern:** When in `api/auth/register.js`, to import from `src/lib/jwt.js`:
   - Go up 2 levels: `../../`
   - Then into src: `src/`
   - Final: `../../src/lib/jwt.js`

2. **Within src/ structure:** Files in `src/lib/`, `src/utils/`, `src/middleware/` are siblings:
   - From `src/lib/jwt.js` to `src/utils/response.js`: `../utils/response.js`
   - No change needed for internal src/ imports

3. **No frontend impact:** React components stay in `src/` where they are. This only moves backend utilities.

4. **Vercel deployment:** After this change, Vercel will only count the 12 handler files in `/api`. Utilities in `src/` don't count toward function limit.

---

## DELIVERABLES

1. ✅ Move `/api/lib/*` → `/src/lib/`
2. ✅ Move `/api/utils/*` → `/src/utils/`
3. ✅ Move `/api/middleware/*` → `/src/middleware/`
4. ✅ Update all import paths in handler files
5. ✅ Update all import paths in moved library files
6. ✅ Delete empty folders
7. ✅ Verify no broken imports
8. ✅ File structure matches final structure above

---

## RESULT

After this is complete:
- ✅ Only 12 Vercel functions (under limit)
- ✅ All imports work correctly
- ✅ Ready to deploy
- ✅ No code logic changes (only file organization)

This should resolve the "No more than 12 Serverless Functions" error from Vercel! 🎉