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

## 1. Confirmed Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React 18 + Vite | NOT Next.js. Entry: `index.html` + `src/` |
| **Styling** | Tailwind CSS 3 + Radix UI + shadcn/ui | Components in `src/components/` |
| **Animation** | Framer Motion | Already in `package.json` |
| **Icons** | lucide-react | Already in use |
| **Backend** | Vercel Serverless Functions (JavaScript) | Files live in `/api/*.js` |
| **Database** | Supabase | `@supabase/supabase-js` + migrations in `supabase/migrations/` |
| **Auth** | Supabase Auth | Email + password |
| **PDF Parsing** | `pdf-parse` + `pdfjs-dist` | JavaScript only — do NOT introduce Python or pdfplumber |
| **Payments** | Stripe (`stripe` v14) | Already installed |
| **Deployment** | Vercel | `vercel.json` configured |
| **Local path** | `C:\AWS\securestatement` | Claude Code working directory |

### Design System
- **Primary:** Deep Navy Blue (`#0066cc` or equivalent dark navy)
- **Background:** Crisp White (`#ffffff`)
- **Accent:** Light Grey (`#f5f5f5`), Dark Grey (`#333333`)
- **Tone:** Professional, trustworthy, minimalist
- **Max-width:** 1200px, padding 4rem desktop / 2rem mobile

---

## 2. Repository Structure

```
C:\AWS\securestatement\
├── CLAUDE.md                        <- This file
├── index.html                       <- Vite entry point
├── vite.config.js
├── tailwind.config.js
├── vercel.json
├── package.json
├── .env.example
│
├── src/                             <- React frontend
│   ├── App.jsx                      <- Routes
│   └── components/
│
├── api/                             <- Vercel serverless functions (JS)
│
├── lib/                             <- Shared JS utilities (parsers live here)
├── middleware/
├── utils/
├── tools/
│
├── supabase/
│   └── migrations/
│
└── test-pdfs/                       <- Synthetic PDFs only — no real statements
```

---

## 3. Parser Status — Current State (as of April 2026)

### CBA Parser — COMPLETE ✅
All checks pass against synthetic test PDF:

| Check | Result |
|-------|--------|
| `02/07/2025,Direct Credit 158824 CHALFONT CONSULT,,6600.00,6379.99` | PASS |
| `02/07/2025,Direct Credit 143439 HAYSPERS,,6600.00,12979.99` | PASS |
| `03/07/2025,Return THE GOOD GUYS FYSHWICK AU,,449.00,13428.99` | PASS |
| `27/08/2025,Return GO RENTALS AUCKLAND NZ,,55.49,7894.19` | PASS |
| `11/09/2025,Credit from xx7797,,5000.00,10161.24` | PASS |
| Year on ALL rows = 2025 | PASS |

**Do not touch the CBA parser unless a new bug is reported against a real statement.**

---

### NAB Parser — COMPLETE ✅
Validated against real 5-page statement: `7311-20220630-statement.pdf` (June 2022, AKSHAR PURSHOTTAM PTY LTD).

**Full rewrite completed April 2026 using pdfjs-dist coordinate method.**

| Check | Result |
|-------|--------|
| Row count: 110 transactions | PASS |
| Sum credits = $25,568.19 | PASS |
| Sum debits = $25,467.81 | PASS |
| Balance equation: 12204.06 + 25467.81 - 25568.19 = 12103.68 | PASS |
| All dates are year 2022 (not system year) | PASS |
| No year prefix in descriptions | PASS |
| Page 1 count = 9 transactions | PASS |
| All 9 page 1 transactions correct (date, description, amount) | PASS |
| Debit column populated (80 rows) | PASS |
| Credit column populated (30 rows) | PASS |

**Architecture:** coordinate-based (pdfjs-dist x/y positions), NOT text scan.
- Column right-edges calibrated from header row: Debits≈394, Credits≈465, Balance≈549
- Date inheritance: transactions without a date inherit the previous date
- Multi-line descriptions: text-only continuation lines joined to the previous transaction
- X-filter: items at x < 90 (margin reference codes like "044483", "/I") excluded
- "Important" insurance block skipped; TRANSACTION SUMMARY block (30 Jun) skipped
- Statement year extracted from "Statement starts 1 June 2022" (never uses system year)

**Note on `keywordDirection` function:** kept in code for the fallback text parser only.
Do NOT apply keyword overrides on the coordinate parser — x-position is authoritative.
The spec's Section 4 keyword rule "Online B...Linked Acc Trns → Credit" is WRONG for
at least one transaction in this statement (it's a debit by x-position and balance math).

**Test script:** `tools/test-nab-parser.js` — run with the real PDF to verify.

---

### Westpac Parser — NOT STARTED
### ANZ Parser — NOT STARTED

Build these next (Phase 1). Use the same parser interface as CBA and NAB (Section 5).

### Bank Classifier — verify location
Check `lib/` for an existing classifier that routes to the correct parser by bank. If it exists, extend it for Westpac and ANZ. If it doesn't exist, create `lib/classifier.js`.

---

## 4. Parser Interface Contract (all parsers must match this)

```javascript
/**
 * @param {Buffer} pdfBuffer - Raw PDF file buffer
 * @returns {Promise<ParsedStatement>}
 */
export async function parse(pdfBuffer) {
  return {
    bank: "Commonwealth Bank",        // string
    accountName: "John Smith",        // string
    accountNumber: "XXX-XXX 1234",   // always masked
    bsb: "062-000",                  // always masked
    statementPeriod: {
      from: "2025-03-01",            // ISO date YYYY-MM-DD
      to: "2025-03-31"
    },
    openingBalance: 1250.00,          // number
    closingBalance: 980.40,           // number
    transactions: [
      {
        date: "2025-03-01",          // ISO date — never prepend year to description
        description: "COLES 0456 SYDNEY",  // clean description only
        debit: 45.60,                // number | null
        credit: null,                // number | null
        balance: 1204.40             // number
      }
    ]
  };
}
```

### Parser Rules (learned from CBA/NAB fixes)
- **Never prepend the year to description fields** — year belongs in `date` only
- **Two-pass page handling** — always parse page 1 data even when subsequent pages have headers; do not skip page 1 transactions
- **Balance-delta fallback** — when a row has no explicit debit/credit amount, derive amount from `current_balance - previous_balance`
- **Validation:** `openingBalance + sum(credits) - sum(debits) = closingBalance` (tolerance ±$0.01)
- **No null `date` or `description`** fields allowed in output

---

## 5. Standard CSV Output Schema

```
date,description,debit,credit,balance,reference,accountName,accountNumber,bsb,bankName,currency
2025-03-01,COLES 0456 SYDNEY,45.60,,1204.40,,John Smith,XXX-XXX 1234,062-000,Commonwealth Bank,AUD
```

---

## 6. Plans & Pricing

| Plan | Price | Limits & Features |
|------|-------|------------------|
| **Free – Anonymous** | $0 | 3 pages per session, no login, no history, CSV export |
| **Free – Registered** | $0 | 6 pages/24hrs, single upload, CSV export, last 10 files |
| **Pro** | $19/month | Unlimited pages (fair-use), bulk upload, CSV + XLSX, full history, faster queue |
| **Accountant** | $49/month | Pro + client folders, 5 team members, API access, webhooks |
| **Enterprise** | **No price shown** | -> "Book a Call" CTA only -> AI Agent Service proposal |

**Enterprise must never display a dollar amount.**

---

## 7. Supported Banks

### Tier 1 — MVP
- **CBA** ✅ Complete
- **NAB** ✅ Complete — validated against real 5-page PDF (June 2022)
- **Westpac** — TODO
- **ANZ** — TODO

### Tier 2 — Phase 2 only (do not start until instructed)
Macquarie, Bankwest, Suncorp, Bendigo, BOQ, ING

### Tier 3 — Phase 3 only
AMP, ME Bank, HSBC, Judo

---

## 8. Parsing Pipeline (Per Upload)

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
10. PDF auto-deleted after 7 days
```

---

## 9. API Endpoints (`/api/*.js`)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/convert` | POST | Optional | Upload PDF, parse, return download |
| `/api/auth/signup` | POST | None | Register (Supabase) |
| `/api/auth/login` | POST | None | Login (Supabase) |
| `/api/user/quota` | GET | Required | Pages used / remaining |
| `/api/user/history` | GET | Required | Conversion history |
| `/api/billing/subscribe` | POST | Required | Stripe subscription |
| `/api/billing/portal` | POST | Required | Stripe billing portal |
| `/api/mailerlite-signup` | POST | None | Waitlist / email capture |

---

## 10. Quota Enforcement

| User | Quota |
|------|-------|
| Anonymous | 3 pages per session (IP + cookie) |
| Free registered | 6 pages per 24-hour rolling window |
| Pro | Unlimited, flag abuse >500 pages/day |
| Accountant | Same as Pro, shared pool across team |
| Enterprise | Manual — no automated quota |

On breach: friendly error + upgrade CTA. Never a raw error.

---

## 11. Supabase Schema

```sql
profiles (id, email, plan, pages_used_today, quota_reset_at, created_at)
conversions (id, user_id, filename, bank_detected, page_count, status, created_at, expires_at)
transactions (id, conversion_id, date, description, debit, credit, balance, bank_name)
subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
```

RLS must be enabled on all tables.

---

## 12. Security & Privacy

- HTTPS everywhere (Vercel-enforced)
- PDFs auto-deleted after 7 days
- Users can manually delete files at any time
- Server-side access control only — users see only their own files
- No PII or transaction content in logs
- Stripe handles all card data — never store payment details

---

## 13. Landing Page Copy (AU-Optimised — use exactly this)

**Headline:** Convert Australian bank statements to CSV in seconds
**Subheadline:** Upload your CBA, NAB, Westpac, ANZ and other Australian bank PDFs and instantly download clean CSV files ready for Xero, Excel, or your accountant.
**Primary CTA:** [Upload Statement] — No signup required
**Secondary CTA:** [See Pricing]

**3 benefit tiles:**
1. Built for Australian banks — Optimised parsers for CBA, NAB, Westpac, ANZ and more
2. Perfect for accountants & brokers — Structured data for reconciliation, loan assessment, and compliance
3. Fast, secure, and simple — Drag, drop, convert. Encrypted in transit and at rest.

**How It Works:**
1. Upload your PDF bank statement
2. We detect the bank and parse the transactions
3. Download CSV/XLSX or send it to your accountant

**FAQ:**
- Which banks? CBA, NAB, Westpac, ANZ — more added regularly.
- Is my data secure? Encrypted in transit and at rest. Delete files any time.
- Do I need an account? No. Try anonymously. Register free for more features.
- What formats? CSV (all plans), XLSX (Pro+), JSON (Accountant/API).

---

## 14. Enterprise Section — AI Agent Service

### Pricing Page Copy
```
Enterprise — Let's Talk

Need more than a converter?
We build custom AI agents that automate your entire back-office workflow —
invoicing, lead follow-up, client onboarding, report generation.

Built in 2 weeks. Done-for-you. No tech team required.

[Book a Free Discovery Call]
```

### Book a Call
- Calendly embed OR contact form (name + email + company + message)
- On submit: notify Gaurav via email
- No complex CRM — simple for MVP

### What the Call Leads To
- Setup fee: $3,000–$5,000 (10-day delivery)
- Retainer: $500–$1,000/month
- Use cases: Invoicing, Lead Follow-Up, Report Generation, Onboarding
- Stack: Claude + n8n + Gmail API + Airtable + Xero/Stripe

---

## 15. Roadmap

### Phase 1 — Current Sprint
- [x] CBA parser — COMPLETE
- [x] NAB parser — COMPLETE, validated against real PDF
- [ ] Westpac parser
- [ ] ANZ parser
- [ ] Landing page (copy from Section 13)
- [ ] Anonymous upload + convert flow
- [ ] Registered auth (Supabase)
- [ ] CSV export
- [ ] Stripe subscriptions
- [ ] Dashboard + file history
- [ ] Quota enforcement
- [ ] Enterprise "Book a Call" section

### Phase 2
- [ ] Bulk upload, client folders, XLSX export, email delivery, Tier 2 banks

### Phase 3
- [ ] API + webhooks, categorisation, Tier 3 banks

---

## 16. Synthetic Test Data Rules

**Never commit real bank statements.**

Synthetic PDFs in `test-pdfs/` must:
- Balance reconcile: `opening + credits - debits = closing` (±$0.01)
- Use fake realistic descriptions: "COLES 0456 SYDNEY", "RENT PAYMENT", "PAYROLL ABC PTY LTD"
- Include short (5–10 txns) and long (50–100 txns) variants per bank
- Cover debits, credits, fees, interest, refunds

---

## 17. Working Rules for Claude Code

1. **CBA parser is complete — do not touch it** unless a new bug is reported against a real statement.
2. **NAB parser is code-complete** — verify the 2 pending checks against the real 5-page PDF before marking done.
3. **Parser rules** — never prepend year to descriptions, always two-pass pages, always use balance-delta fallback (Section 4).
4. **JavaScript only** — `pdf-parse` / `pdfjs-dist`. No Python.
5. **All parsers match the interface in Section 4** — same return shape.
6. **Check for existing files before creating** — classifier, Supabase client, Stripe helpers may already exist in `lib/`.
7. **Enterprise = Book a Call only** — never show a price.
8. **Supabase for all data, Stripe for all payments** — no alternatives.
9. **Vercel serverless only** — no separate Express server.
10. **RLS enabled** on all Supabase tables.
11. **No real bank PDFs in repo** — synthetic test data only.
12. **Do not start Tier 2+ banks** without explicit instruction.

