# PRD.md — SecureStatementConverter
## Product Requirements Document · Phase 1 · June 2026

---

## 1. Product Vision

**SecureStatementConverter** is a privacy-first, Australian-bank-optimised PDF statement converter for accountants, bookkeepers, mortgage brokers, and SMEs.

**Core promise:** Upload an Australian bank PDF statement. Get a clean CSV/XLSX in seconds. Your data never leaves Australian infrastructure.

**Target audience (primary):** Australian accountants and bookkeepers, solo and small practices.
**Target audience (secondary):** Mortgage brokers, loan assessors, SMEs.

---

## 2. Phase 1 Scope — What We Are Building

Phase 1 delivers one working, validated product that real users can pay for. Nothing beyond this list.

### 2.1 User Flows

#### Anonymous User
1. Land on homepage
2. Upload a CBA or NAB PDF statement (up to 3 pages)
3. View parsed transactions inline
4. Download CSV
5. Hit limit → see upgrade CTA with clear value prop
6. Option to register for free to get 6 pages/day

#### Registered Free User
1. Sign up (email + password)
2. Upload up to 6 pages/24hr
3. View parse history (last 10 files)
4. Download CSV
5. Hit limit → see Pro upgrade CTA

#### Pro / Accountant Subscriber
1. Subscribe via Stripe ($19 or $49/mo)
2. Unlimited uploads (fair-use)
3. Bulk upload (multiple PDFs at once) — Accountant plan only
4. CSV + XLSX export
5. Full file history
6. Client folders (Accountant plan only)

### 2.2 Parsers

| Bank | Status | Priority |
|---|---|---|
| Commonwealth Bank (CBA) | Built — needs REST endpoint + smoke test | P0 |
| NAB | Built — needs REST endpoint + smoke test | P0 |
| Westpac | Not started | Phase 2 |
| ANZ | Not started | Phase 2 |

### 2.3 Export Formats

- CSV (Phase 1 — all plans)
- XLSX (Phase 1 — Pro + Accountant)
- JSON (Phase 1 — Accountant API access)

### 2.4 Not In Phase 1

- Westpac / ANZ / other parsers
- BAS categorisation
- AI-powered transaction labelling
- Webhook delivery
- White-label portal
- Mobile app

---

## 3. Functional Requirements

### 3.1 Upload
- Accept PDF files only (MIME type: application/pdf)
- Max file size: 50MB
- Show upload progress indicator
- Auto-detect bank (CBA vs NAB) — fall back to manual selection if unsure
- Display detected bank + page count before parsing begins

### 3.2 Parsing
- Call Railway parser service via internal API
- Return structured JSON (see CLAUDE.md Section 5 for schema)
- Show inline transaction preview (date, description, debit, credit, balance)
- Parse must complete within 30 seconds (timeout + retry logic)
- On failure: show friendly error message with specific reason (unsupported format, timeout, etc.)

### 3.3 Export
- CSV: RFC 4180 compliant, UTF-8, headers match schema field names
- XLSX: single sheet, auto-column width, header row frozen
- Filename format: `{bank}_{account_last4}_{from}_{to}.csv`

### 3.4 Quota Enforcement
- Pages = total PDF pages in uploaded file
- Tracked per user per rolling 24-hour window (not calendar day)
- Anonymous: IP + session cookie (cookie expires 24hr)
- Registered: Supabase `quotas` table, reset every 24hr from first upload
- On limit: HTTP 429, UI shows pages used / pages allowed / time until reset / upgrade CTA

### 3.5 Authentication
- Email + password (Supabase)
- Magic link (Supabase) — optional, nice to have
- Session persists 7 days
- On register: send welcome email via Supabase Auth email template
- NOT NULL field fix: ensure all required Supabase user fields have fallbacks

### 3.6 Subscriptions (Stripe)
- Plans: Free (no card) / Pro $19/mo / Accountant $49/mo
- Trial: 14-day free trial on Pro (no card required)
- Webhook events handled: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- On cancel: downgrade to Free immediately (no grace period for MVP)

### 3.7 Dashboard
- File history table: filename, bank detected, pages, date, status, download links
- Quota meter: "X of Y pages used today — resets in Zhr"
- Plan badge + upgrade button
- Delete file + parsed data (GDPR-ready)

---

## 4. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Parse latency (P95) | < 15 seconds for 10-page statement |
| Uptime | 99.5% (Vercel + Railway SLAs) |
| Data retention | PDFs auto-deleted 7 days after upload |
| Parsed data retention | 90 days (user can delete anytime) |
| HTTPS | Enforced everywhere |
| Australian data residency | Railway region: Sydney (ap-southeast-2) |

---

## 5. Landing Page Requirements

### Hero
- **Headline:** Convert Australian Bank Statements to CSV in Seconds
- **Subheadline:** Built for accountants. Optimised for CBA and NAB. Your data stays on Australian servers.
- **Primary CTA:** Upload Statement — No Signup Required
- **Secondary CTA:** See Pricing

### Trust Signals (below hero)
- "Your data never leaves Australian servers"
- "Used by [N] accountants and mortgage brokers"
- Bank logos: CBA, NAB (Westpac + ANZ shown as "coming soon")
- Privacy badge: "Auto-deleted after 7 days"

### How It Works (3 steps)
1. Upload your PDF bank statement
2. We detect the bank and parse all transactions
3. Download clean CSV or XLSX — ready for Xero, Excel, or your bookkeeper

### Pricing Section
Three columns: Free / Pro $19/mo / Accountant $49/mo
Include 14-day free trial badge on Pro.

### FAQ
- Which banks do you support?
- Is my data secure?
- Do I need to create an account?
- Can I use this for BAS preparation? (answer: yes + hint at upcoming BAS agent)
- What file formats can I export?

### Footer
- Links: Privacy Policy / Terms / Contact
- "Built in Australia for Australian accountants"

---

## 6. Beta Tester Program

Four confirmed beta testers:
- 2 accountants
- 2 mortgage brokers

**Offer:** 3 months free Accountant plan in exchange for:
1. Testing real statements through the parser
2. Written testimonial for the website
3. 30-minute feedback call

**Beta success criteria:** All 4 testers successfully parse at least 5 real statements with zero errors reported.

---

## 7. Success Metrics — Phase 1 Sign-Off

| Metric | Target |
|---|---|
| Beta testers onboarded | 4 / 4 |
| Real statements parsed without error | ≥ 20 |
| Parse accuracy (vs manual check) | ≥ 99% transaction count match |
| Paying subscribers | ≥ 1 (prove payment flow works) |
| Landing page live | ✅ |
| DNS pointing to Vercel (not Hostinger placeholder) | ✅ |

---

## 8. Open Questions (Gaurav to Resolve)

| # | Question | Impact |
|---|---|---|
| Q1 | Is the Railway parser service currently deployed and reachable? | Blocks TASK-007 and TASK-008 |
| Q2 | Are Stripe price IDs configured in Vercel env vars? | Blocks subscription flow |
| Q3 | Is securestatementconverter.com DNS pointing to Vercel yet? | Blocks landing page live |
| Q4 | Which Supabase project is connected (prod vs staging)? | Blocks beta tester onboarding |
