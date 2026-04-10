# CLAUDE.md — SecureStatementConverter
## Master Project Blueprint for Claude Code

> **Treat this file as the single source of truth.** Every decision, output, and implementation must align with what is written here. Do not invent features, assumptions, or requirements without explicitly stating they are inferred. When in doubt, ask before building.

---

## 0. Project Overview — Two Tracks

| Track | Product | Purpose |
|-------|---------|---------|
| **Track 2 (this repo)** | SecureStatementConverter | SaaS website — converts Australian bank PDF statements to CSV/XLSX/JSON |
| **Track 1 (referenced)** | AI Agent Automation Service | Done-for-you AI agent builds — sold via the Enterprise tier of Track 2 |

**The connection:** When a user selects **Enterprise** on SecureStatementConverter, they hit a **Book a Call** flow. That call leads to a proposal for the **AI Agent Automation Service** — a $3,000–$5,000 setup + $500–$1,000/month retainer engagement.

---

## 1. Confirmed Tech Stack (from repo — do not change these)

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React 18 + Vite | NOT Next.js. Entry: `index.html` + `src/` |
| **Styling** | Tailwind CSS 3 + Radix UI + shadcn/ui | Components in `src/components/` |
| **Animation** | Framer Motion | Already in `package.json` |
| **Icons** | lucide-react | Already in use |
| **Backend** | Vercel Serverless Functions (JavaScript) | Files live in `/api/*.js` |
| **Database** | Supabase | `@supabase/supabase-js` + migrations in `supabase/migrations/` |
| **Auth** | Supabase Auth | Email + password |
| **PDF Parsing** | `pdf-parse` + `pdfjs-dist` | JavaScript — NOT Python. Do not introduce pdfplumber |
| **Payments** | Stripe (`stripe` v14) | Already installed |
| **Deployment** | Vercel | `vercel.json` configured |
| **Local path** | `C:\AWS\securestatement` | Claude Code working directory |

### Design System (must be consistent everywhere)
- **Primary:** Deep Navy Blue (`#0066cc` or equivalent dark navy)
- **Background:** Crisp White (`#ffffff`)
- **Accent:** Light Grey (`#f5f5f5`), Dark Grey (`#333333`)
- **Tone:** Professional, trustworthy, minimalist
- **Max-width:** 1200px, padding 4rem desktop / 2rem mobile

---

## 2. Repository Structure

```
C:\AWS\securestatement\
├── CLAUDE.md                        <- This file (place here)
├── index.html                       <- Vite entry point
├── vite.config.js
├── tailwind.config.js
├── vercel.json                      <- Vercel routing + function config
├── package.json
├── .env.example                     <- Copy to .env.local
│
├── src/                             <- React frontend
│   ├── App.jsx                      <- Routes live here
│   └── components/                  <- UI components
│
├── api/                             <- Vercel serverless functions (JS)
│   └── *.js                         <- Each file = one API endpoint
│
├── lib/                             <- Shared JS utilities
├── middleware/                      <- Vercel middleware
├── plugins/                         <- Vite plugins
├── utils/                           <- Helper functions
├── tools/                           <- Build tools
│
├── supabase/
│   └── migrations/                  <- SQL migration files
│
└── test-pdfs/                       <- Synthetic PDFs for parser testing
```

---

## 3. Product: SecureStatementConverter

### Core Function
- Accepts PDF bank statements from major Australian banks
- Parses transactions into **CSV / XLSX / JSON**
- Supports bulk uploads and client folders (Accountant tier)
- Free tier with clear paid upgrade path

### Domains
- `securestatementconverter.com` (primary)
- `securestatementconverter.com.au` (to be registered)

---

## 4. Plans & Pricing

| Plan | Price | Limits & Features |
|------|-------|------------------|
| **Free – Anonymous** | $0 | 3 pages per session, no login, no history, CSV export |
| **Free – Registered** | $0 | 6 pages/24hrs, single upload, CSV export, last 10 files |
| **Pro** | $19/month | Unlimited pages (fair-use), bulk upload, CSV + XLSX, full history, faster queue |
| **Accountant** | $49/month | Pro + client folders, 5 team members, API access, webhooks |
| **Enterprise** | **No price shown** | -> "Book a Call" CTA only -> AI Agent Service proposal |

### Pricing Rules
- **Enterprise must never show a dollar amount** — always "Let's talk" or "Book a Call"
- Show upgrade CTA whenever a user hits a quota limit
- Registration prompt appears immediately after anonymous conversion success

---

## 5. Supported Banks

### Tier 1 — MVP (build these parsers)
- **CBA** — Commonwealth Bank - Parser exists (check `lib/` or `api/` before rebuilding)
- **NAB** — National Australia Bank - Parser exists (check `lib/` or `api/` before rebuilding)
- **Westpac** — TODO
- **ANZ** — TODO

### Tier 2 — Phase 2 only
Macquarie, Bankwest, Suncorp, Bendigo, BOQ, ING

### Tier 3 — Phase 3 only
AMP, ME Bank, HSBC, Judo — add on demand

> **Rule:** Do not build Tier 2+ banks without explicit instruction. Stay in scope.

---

## 6. PDF Parsing — JavaScript Implementation

All parsing uses **JavaScript** (`pdf-parse` / `pdfjs-dist`). Do not use Python.

### Parser Interface Contract
Every bank parser must export a function matching this signature:

```javascript
/**
 * @param {Buffer} pdfBuffer - Raw PDF file buffer
 * @returns {Promise<ParsedStatement>}
 */
export async function parse(pdfBuffer) {
  return {
    bank: "Commonwealth Bank",
    accountName: "John Smith",
    accountNumber: "XXX-XXX 1234",   // always masked
    bsb: "062-000",                  // always masked
    statementPeriod: {
      from: "2025-03-01",            // ISO date
      to: "2025-03-31"
    },
    openingBalance: 1250.00,
    closingBalance: 980.40,
    transactions: [
      {
        date: "2025-03-01",          // ISO date string
        description: "COLES 0456 SYDNEY",
        debit: 45.60,                // number | null
        credit: null,                // number | null
        balance: 1204.40
      }
    ]
  };
}
```

### Bank Classifier
`lib/classifier.js` (or equivalent) auto-detects bank from PDF content and routes to the correct parser. Check if this file already exists before creating it.

### Standard Output Schema (CSV/XLSX columns)
```
date | description | debit | credit | balance | reference | accountName | accountNumber | bsb | bankName | currency
```

### Validation Rules
- `openingBalance + sum(credits) - sum(debits) = closingBalance` (tolerance 0.01)
- No null `date` or `description` fields
- All dates within the declared statement period

---

## 7. Parsing Pipeline (Per Upload)

```
1. User uploads PDF (anonymous or authenticated)
2. Quota check -> reject with upgrade CTA if exceeded
3. Store PDF temporarily (Supabase Storage)
4. Bank classifier detects bank + statement type
5. Route to bank-specific parser
6. Normalise to standard schema
7. Validate (balance reconciliation, date sanity)
8. Store parsed transactions in Supabase
9. Return CSV / XLSX / JSON to user
10. Schedule PDF auto-deletion (7 days default)
```

---

## 8. API Endpoints (Vercel Serverless — `/api/*.js`)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/convert` | POST | Optional | Upload PDF, parse, return download |
| `/api/auth/signup` | POST | None | Register user (Supabase) |
| `/api/auth/login` | POST | None | Login (Supabase) |
| `/api/user/quota` | GET | Required | Check pages used / remaining |
| `/api/user/history` | GET | Required | Conversion history |
| `/api/billing/subscribe` | POST | Required | Create Stripe subscription |
| `/api/billing/portal` | POST | Required | Stripe billing portal link |
| `/api/mailerlite-signup` | POST | None | Waitlist / email capture |

---

## 9. Quota & Plan Enforcement

| User Type | Enforcement |
|-----------|-------------|
| Anonymous | Session/IP + cookie, 3 pages per session |
| Registered Free | 6 pages per 24-hour rolling window (Supabase) |
| Pro | Unlimited with fair-use flag at >500 pages/day |
| Accountant | Same as Pro, shared across team |
| Enterprise | Manual — no automated quota |

On limit breach: friendly error + upgrade CTA. Never a raw error message.

---

## 10. Supabase Schema (Core Tables)

```sql
-- Extends Supabase auth.users
profiles (id, email, plan, pages_used_today, quota_reset_at, created_at)

-- File history
conversions (id, user_id, filename, bank_detected, page_count, status, created_at, expires_at)

-- Parsed data (can be ephemeral)
transactions (id, conversion_id, date, description, debit, credit, balance, bank_name)

-- Stripe subscriptions
subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
```

RLS (Row Level Security) must be enabled on all tables.

---

## 11. Security & Privacy Rules

- HTTPS everywhere — enforced by Vercel
- PDFs auto-deleted after 7 days (Supabase Storage lifecycle)
- Users can manually delete files at any time
- Server-side access control — users see only their own files
- Logs must NOT contain PII or transaction content
- Stripe handles all card data — never store payment details
- Supabase RLS enabled on all tables

---

## 12. Landing Page Copy (AU-Optimised — use exactly this)

### Hero
**Headline:** Convert Australian bank statements to CSV in seconds
**Subheadline:** Upload your CBA, NAB, Westpac, ANZ and other Australian bank PDFs and instantly download clean CSV files ready for Xero, Excel, or your accountant.
**Primary CTA:** [Upload Statement] — No signup required
**Secondary CTA:** [See Pricing]

### Key Benefits (3 tiles)
1. **Built for Australian banks** — Optimised parsers for CBA, NAB, Westpac, ANZ and more — no messy generic extraction
2. **Perfect for accountants & brokers** — Structured data for reconciliation, loan assessment, and compliance
3. **Fast, secure, and simple** — Drag, drop, convert. Encrypted in transit and at rest.

### How It Works (3 steps)
1. Upload your PDF bank statement
2. We detect the bank and parse the transactions
3. Download CSV/XLSX or send it to your accountant

### FAQ
- **Which banks?** CBA, NAB, Westpac, ANZ — more added regularly.
- **Is my data secure?** Encrypted in transit and at rest. Delete files any time.
- **Do I need an account?** No. Try anonymously. Register free for more features.
- **What formats?** CSV (all plans), XLSX (Pro+), JSON (Accountant/API).

---

## 13. Enterprise Section — AI Agent Service (Track 1)

### Pricing Page — Enterprise Tile Copy
```
Enterprise — Let's Talk

Need more than a converter?
We build custom AI agents that automate your entire back-office workflow —
invoicing, lead follow-up, client onboarding, report generation.

Built in 2 weeks. Done-for-you. No tech team required.

[Book a Free Discovery Call]
```

### Book a Call Implementation
- Calendly embed OR simple contact form (name + email + message + company)
- On submit: notify Gaurav via email or webhook
- Do NOT build a complex CRM — keep it simple for MVP

### What the Call Leads To (Track 1 Proposal)
| Item | Detail |
|------|--------|
| Setup fee | $3,000–$5,000 (10-day delivery) |
| Monthly retainer | $500–$1,000/month |
| Use cases | Invoicing, Lead Follow-Up, Report Generation, Onboarding |
| Tech | Claude + n8n + Gmail API + Airtable + Xero/Stripe |
| Pitch | "Live in 2 weeks. Done-for-you. Zero learning curve." |

---

## 14. Roadmap

### Phase 1 — MVP (Current Sprint)
- [ ] Landing page with AU-optimised copy (Section 12)
- [ ] Anonymous upload + convert flow (3-page limit)
- [ ] Registered user auth (Supabase email/password)
- [ ] CBA parser — verify existing, integrate
- [ ] NAB parser — verify existing, integrate
- [ ] Westpac parser
- [ ] ANZ parser
- [ ] CSV export
- [ ] Stripe subscriptions (Free, Pro, Accountant)
- [ ] Dashboard with file history
- [ ] Quota enforcement middleware
- [ ] Enterprise "Book a Call" section

### Phase 2
- [ ] Bulk upload
- [ ] Client folders (Accountant tier)
- [ ] XLSX export
- [ ] Email delivery of results
- [ ] Tier 2 banks

### Phase 3
- [ ] API + webhooks
- [ ] Advanced categorisation
- [ ] Tier 3 banks

---

## 15. Synthetic Test Data Rules

**Never commit real bank statements to this repo.**

All parser development uses synthetic data in `test-pdfs/`:
- Totals must reconcile: `opening + credits - debits = closing` (tolerance 0.01)
- Fake but realistic descriptions: "COLES 0456 SYDNEY", "RENT PAYMENT", "PAYROLL ABC PTY LTD"
- Multiple files per bank: short (5–10 txns) and long (50–100 txns)
- Cover: debits, credits, bank fees, interest, refunds

---

## 16. Existing Work — Check Before Creating

Before writing any new file, check these locations:

| What to find | Where to look |
|-------------|---------------|
| CBA parser | `lib/`, `utils/`, `api/` — search "cba" or "commonwealth" |
| NAB parser | `lib/`, `utils/`, `api/` — search "nab" |
| Bank classifier | `lib/` — search "classify" or "detect" |
| Auth middleware | `middleware/` |
| Supabase client | `lib/supabase.js` or similar |
| Stripe helpers | `lib/stripe.js` or similar |

---

## 17. Claude Code Working Rules

1. **Check for existing files first** — CBA and NAB parsers exist. Find them before writing new ones.
2. **JavaScript only for parsers** — use `pdf-parse` / `pdfjs-dist`. No Python.
3. **All parsers must match the interface in Section 6** — same return shape.
4. **Never show a price for Enterprise** — "Book a Call" only.
5. **All landing page copy must match Section 12** — do not invent new marketing copy.
6. **Supabase for all data** — no other database.
7. **Stripe for all payments** — no other payment processor.
8. **Never commit real bank PDFs** — synthetic test data only.
9. **Respect the design system** — Deep Navy Blue, White, Grey. Match existing components.
10. **Vercel serverless only for backend** — no separate Express server.
11. **Do not add Tier 2+ banks** without explicit instruction.
12. **RLS must be enabled** on all Supabase tables.

