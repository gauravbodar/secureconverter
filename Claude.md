# CLAUDE.md — SecureStatementConverter Master System Specification
> **Version:** 1.0 | **Date:** June 2026 | **Owner:** Gaurav Bodar
> **This file is the authoritative handoff to Claude Code for all autonomous build cycles.**
> Claude Code must read this file at the start of every session before touching any code.

---

## 1. Project Identity

| Field | Value |
|---|---|
| Product | SecureStatementConverter |
| Domain | securestatementconverter.com |
| Vercel URL | secureconverter-five.vercel.app |
| GitHub | github.com/gauravbodar/secureconverter |
| Stack | React 18 + Vite → Vercel · Python pdfplumber → Railway · Supabase · Stripe |
| Current Phase | Phase 1 MVP — CBA + NAB parsers, sign-off ready |

---

## 2. Non-Negotiable Constraints

These rules override all other instructions. Never violate them.

1. **No third-party PDF parsing APIs.** All PDF parsing runs on Railway (Python/pdfplumber). Financial data never leaves our infrastructure. This is the "Secure" brand promise.
2. **No scope creep before validation.** Do not add new bank parsers or features until CBA and NAB are validated with real users.
3. **Sequential story execution.** Complete one story fully before starting the next. Never work on two stories in parallel.
4. **Test first.** Run existing tests, capture output, then fix. Never speculatively rewrite working code.
5. **No breaking changes to auth or quota flow** without explicit written instruction from Gaurav.

---

## 3. Tech Stack — Full Reference

### Frontend (Vercel)
- React 18 + Vite
- Tailwind CSS + shadcn/ui components (components.json present)
- Supabase JS client for auth
- Stripe.js for payment UI
- Source: `/src/`

### Backend API (Vercel Serverless Functions)
- Node.js serverless functions
- Location: `/api/`
- Handles: auth callbacks, quota enforcement, parse job dispatch, Stripe webhooks
- Middleware: `/middleware/`

### Parsing Engine (Railway — Python)
- Python + pdfplumber
- Separate Railway deployment (not in this repo — Railway service)
- Called via HTTP from Vercel API functions
- **CBA parser:** complete, validated against ground-truth checksums
- **NAB parser:** complete, validated against ground-truth checksums

### Database & Auth
- Supabase (Postgres)
- Auth: email/password + magic link
- Migrations: `/supabase/migrations/`
- Key tables: `users`, `files`, `parse_jobs`, `quotas`, `subscriptions`

### Payments
- Stripe subscriptions
- Plans: Free / Pro ($19/mo) / Accountant ($49/mo) / Enterprise (custom)
- Webhooks handled in `/api/stripe/`

### Other
- `/lib/` — shared utilities
- `/utils/` — helper functions
- `/plugins/` — extensible parser plugin architecture
- `/tools/` — development/testing tools
- `/test-pdfs/` — synthetic test statements (CBA + NAB)
- `/public/` — static assets

---

## 4. Current Completion State

### ✅ Done
- [x] Supabase auth (email/password, NOT NULL constraints handled)
- [x] Quota enforcement flow (pages per 24hr window, per plan)
- [x] File upload UI
- [x] CBA parser (pdfplumber, dollar-sign debit/credit detection)
- [x] NAB parser (dynamic column boundary detection)
- [x] End-to-end upload → parse → download flow (debugged)
- [x] Stripe subscription integration
- [x] Basic dashboard + file history

### 🔴 Remaining for Sign-Off (Phase 1 Complete)
- [ ] **TASK-001:** CBA parser — expose as documented REST endpoint, return JSON with transaction schema
- [ ] **TASK-002:** NAB parser — expose as documented REST endpoint, return JSON with transaction schema
- [ ] **TASK-003:** CSV + XLSX export download from dashboard
- [ ] **TASK-004:** Quota UI — show pages used / pages remaining with upgrade CTA
- [ ] **TASK-005:** Error states — friendly error messages for parse failures, unsupported formats
- [ ] **TASK-006:** Landing page — final copy aligned to AU accountant audience (see PRD.md)
- [ ] **TASK-007:** End-to-end smoke test — CBA statement → parse → CSV download (ground-truth checksum validation)
- [ ] **TASK-008:** End-to-end smoke test — NAB statement → parse → CSV download (ground-truth checksum validation)

---

## 5. Parser Specification

### Standard Transaction Output Schema
Every parser must return this exact JSON structure:

```json
{
  "bank_name": "Commonwealth Bank",
  "account_name": "string",
  "account_number": "XXX-XXX 1234",
  "bsb": "062-000",
  "statement_period": {
    "from": "2025-03-01",
    "to": "2025-03-31"
  },
  "opening_balance": 0.00,
  "closing_balance": 0.00,
  "currency": "AUD",
  "transactions": [
    {
      "date": "2025-03-01",
      "description": "string",
      "debit": null,
      "credit": 0.00,
      "balance": 0.00,
      "reference": "optional string"
    }
  ],
  "transaction_count": 0,
  "parse_metadata": {
    "parser_version": "1.0",
    "pages_parsed": 0,
    "parse_duration_ms": 0
  }
}
```

### CBA Parser Key Facts
- Dollar sign (`$`) position encodes debit/credit direction — this is the core detection mechanism
- Uses pdfplumber x-coordinate reading, not hardcoded column positions
- Test file checksums are established in `/test-pdfs/`

### NAB Parser Key Facts
- Dynamic column boundary detection — reads x-coordinates of header words per PDF
- More robust than hardcoded values
- Test file checksums are established in `/test-pdfs/`

### REST API Endpoint (Railway)
```
POST /parse
Content-Type: multipart/form-data

Body:
  file: <PDF binary>
  bank: "cba" | "nab" | "auto"

Response: JSON (schema above)
```

---

## 6. Quota Rules

| Plan | Pages / 24hr | Bulk Upload | History |
|---|---|---|---|
| Anonymous | 3 | No | No |
| Free (registered) | 6 | No | Last 10 |
| Pro ($19/mo) | Unlimited (fair-use) | Yes | Full |
| Accountant ($49/mo) | Unlimited (fair-use) | Yes | Full + Client Folders |

Anonymous tracking: session cookie + IP (no fingerprinting beyond this).

---

## 7. Environment Variables Required

```bash
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
VITE_STRIPE_PUBLISHABLE_KEY=

# Railway Parser Service
PARSER_SERVICE_URL=  # e.g. https://your-service.railway.app

# Plans
STRIPE_PRO_PRICE_ID=
STRIPE_ACCOUNTANT_PRICE_ID=
```

---

## 8. Working Rules for Claude Code

1. **Read this file first.** Every session starts here.
2. **Pick one TASK from Section 4.** Work it to completion before moving on.
3. **Run tests after every change.** Use `/tools/` and `/test-pdfs/` for validation.
4. **Commit with task ID.** e.g. `git commit -m "TASK-001: expose CBA parser as REST endpoint"`
5. **Update Section 4 checkboxes** when a task is complete.
6. **Never modify** `/supabase/migrations/` without explicit instruction.
7. **Never hardcode** API keys, URLs, or environment-specific values.
8. **Parser changes** must pass ground-truth checksum tests before commit.

---

## 9. Definition of Done — Phase 1 Sign-Off

Phase 1 is complete when ALL of the following are true:

- [ ] CBA and NAB parsers return correct JSON for all test PDFs in `/test-pdfs/`
- [ ] CSV and XLSX downloads work from the dashboard
- [ ] Quota enforcement blocks correctly at plan limits
- [ ] Stripe subscription creates/cancels correctly
- [ ] Landing page is live at securestatementconverter.com with AU-optimised copy
- [ ] Four beta testers (2 accountants, 2 mortgage brokers) have successfully parsed real statements
- [ ] Zero parse errors on the ground-truth test set

---

## 10. Next Phases (Do Not Build Yet)

- **Phase 2:** BAS Automation Agent (GST categorisation, BAS worksheet, accountant approval workflow)
- **Phase 3:** Content Engine (AI social media automation for accountants + brokers)
- **Phase 4:** Wealth OS (12-month horizon)
