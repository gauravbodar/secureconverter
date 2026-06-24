# TASKS.md — SecureStatementConverter Phase 1 Task Board
> **Owner:** Gaurav Bodar | **Sprint End:** 30 June 2026
> **Rule:** Complete tasks in order. Verify each one before moving to the next.
> **Claude Code picks up from the first 🔴 task. Gaurav verifies each ✅.**

---

## How This Works

- **Claude Code** works through tasks top to bottom
- **Gaurav** verifies each task using the acceptance criteria listed
- When Gaurav confirms ✅, Claude Code moves to the next task
- If a task fails verification, Claude Code fixes it before proceeding
- **Status:** 🔴 Not Started | 🟡 In Progress | ✅ Done | ❌ Blocked

---

## PHASE 1 — CBA + NAB Parser Sign-Off

---

### TASK-000 — Environment Health Check
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 30 min

**What to do:**
1. Check all environment variables are set in Vercel (see CLAUDE.md Section 7)
2. Verify Railway parser service is reachable: `curl -X POST {PARSER_SERVICE_URL}/health`
3. Verify Supabase connection: run a test query against `users` table
4. Verify Stripe keys are valid: list products via API
5. Run `npm run build` — confirm zero errors

**Output:** A health check report printed to console showing PASS/FAIL for each dependency.

**Gaurav verifies:**
- [ ] All env vars present in Vercel dashboard (Settings → Environment Variables)
- [ ] Railway health endpoint returns 200
- [ ] `npm run build` succeeds with zero errors
- [ ] Console report shows all PASS

---

### TASK-001 — CBA Parser REST Endpoint
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 2 hours

**What to do:**
1. Confirm CBA parser is deployed on Railway and accessible
2. Expose `POST /parse` endpoint accepting `multipart/form-data` with `file` (PDF) and `bank: "cba"`
3. Return JSON matching the schema in CLAUDE.md Section 5 exactly
4. Add `parse_metadata.parser_version`, `parse_metadata.pages_parsed`, `parse_metadata.parse_duration_ms`
5. Add error response format:
```json
{ "error": true, "code": "UNSUPPORTED_FORMAT", "message": "Human-readable message" }
```
6. Document the endpoint in `/api/README.md`

**Gaurav verifies:**
- [ ] POST to Railway URL with a CBA test PDF returns valid JSON
- [ ] JSON contains `bank_name: "Commonwealth Bank"` and correct transaction array
- [ ] `transaction_count` matches actual number of rows in response
- [ ] Error case (non-PDF file) returns structured error JSON, not a stack trace

---

### TASK-002 — NAB Parser REST Endpoint
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 2 hours
**Depends on:** TASK-001 (same endpoint pattern)

**What to do:**
1. Same as TASK-001 but for `bank: "nab"`
2. Ensure dynamic column boundary detection is working (reads x-coordinates from PDF header)
3. Add auto-detect: if `bank: "auto"`, run classifier to detect CBA vs NAB before routing
4. Return same JSON schema

**Gaurav verifies:**
- [ ] POST with NAB test PDF returns `bank_name: "National Australia Bank"`
- [ ] `bank: "auto"` correctly identifies CBA and NAB test files
- [ ] Transaction amounts match known ground-truth for NAB test file

---

### TASK-003 — CSV + XLSX Export
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 2 hours
**Depends on:** TASK-001

**What to do:**
1. After parse completes, store parsed JSON in Supabase `parse_jobs` table
2. Add `/api/export?job_id={id}&format=csv` endpoint (and `format=xlsx`)
3. CSV: RFC 4180, UTF-8, headers: `date,description,debit,credit,balance,reference`
4. XLSX: single sheet "Transactions", frozen header row, auto-width columns
5. Filename format: `{bank}_{account_last4}_{from_date}_{to_date}.{ext}`
6. XLSX only available to Pro + Accountant plans — return 403 for Free users with upgrade CTA message

**Gaurav verifies:**
- [ ] Download CSV from dashboard — opens correctly in Excel with correct columns
- [ ] Download XLSX — opens in Excel with frozen header row and readable columns
- [ ] Filename matches the format above
- [ ] Free user trying XLSX sees upgrade prompt, not an error page

---

### TASK-004 — Quota UI
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 1.5 hours
**Depends on:** Existing quota enforcement (already built)

**What to do:**
1. Add quota meter component to dashboard and upload page:
   - Progress bar: pages used / pages allowed today
   - Text: "X of Y pages used · Resets in Zhr Zmin"
   - Upgrade CTA button when > 80% used
2. On upload attempt when over limit:
   - Block upload before calling parser
   - Show modal: "You've used all X pages for today. Upgrade to Pro for unlimited uploads."
   - Include "Upgrade Now" button and "Remind me tomorrow" dismiss

**Gaurav verifies:**
- [ ] Quota bar shows correct numbers (test by uploading files until limit)
- [ ] Countdown timer ticks correctly
- [ ] Over-limit upload is blocked at UI level (not just API)
- [ ] Upgrade button links to Stripe checkout

---

### TASK-005 — Error States
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 1.5 hours

**What to do:**
Add user-friendly error handling for:
1. `UNSUPPORTED_BANK` — "We don't recognise this bank statement format. We currently support CBA and NAB."
2. `PARSE_TIMEOUT` — "Parsing took too long. Please try again with a smaller file."
3. `INVALID_PDF` — "This file doesn't appear to be a valid PDF. Please check the file and try again."
4. `QUOTA_EXCEEDED` — handled in TASK-004
5. `NETWORK_ERROR` — "We couldn't reach the parsing service. Please try again in a moment."

Each error state must:
- Show a clear icon (not a spinner)
- Give a specific, actionable message
- Offer a retry button where applicable
- Log error code to console (not sensitive data)

**Gaurav verifies:**
- [ ] Upload a non-PDF file → see `INVALID_PDF` error message (not a blank screen)
- [ ] Upload a Westpac statement → see `UNSUPPORTED_BANK` message
- [ ] All error states have retry buttons where applicable

---

### TASK-006 — Landing Page Final Copy
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 2 hours

**What to do:**
Update the landing page to match PRD.md Section 5 exactly:
1. Hero section with headline, subheadline, two CTAs
2. Trust signals row: Australian servers / X accountants / Bank logos / Auto-delete badge
3. "How it works" 3-step section
4. Pricing table: Free / Pro $19 / Accountant $49 with feature comparison
5. FAQ section (5 questions from PRD.md Section 5)
6. Footer with Privacy / Terms / Contact

**Important:** Remove the current Hostinger placeholder. DNS must point to Vercel before this task can be verified.

**Gaurav verifies:**
- [ ] securestatementconverter.com loads the React app (not Hostinger page)
- [ ] All 5 sections present and readable on mobile
- [ ] "Upload Statement" CTA goes to the upload page (not a 404)
- [ ] Pricing table shows correct prices and features

**⚠️ Gaurav action required before Claude Code can complete this:**
- Update DNS in Hostinger: point `securestatementconverter.com` CNAME to `cname.vercel-dns.com`
- Add custom domain in Vercel dashboard → Settings → Domains

---

### TASK-007 — CBA Smoke Test (Ground Truth)
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 1 hour
**Depends on:** TASK-001, TASK-003

**What to do:**
1. Use test PDF in `/test-pdfs/` (CBA)
2. Run end-to-end: upload via UI → parse → download CSV
3. Compare CSV output against known ground-truth checksums
4. Write test result to `/tools/test-results/cba-smoke-{date}.json`

**Acceptance criteria (hard):**
- Transaction count matches ground truth exactly
- Opening balance matches
- Closing balance matches
- All debit/credit amounts match (zero tolerance — no rounding errors)

**Gaurav verifies:**
- [ ] `/tools/test-results/cba-smoke-{date}.json` exists and shows PASS
- [ ] CSV downloaded from UI matches the raw JSON output
- [ ] No console errors during the parse flow

---

### TASK-008 — NAB Smoke Test (Ground Truth)
**Status:** 🔴 Not Started
**Owner:** Claude Code
**Estimated time:** 1 hour
**Depends on:** TASK-002, TASK-003

**What to do:**
Same as TASK-007 but for NAB.

**Gaurav verifies:**
- [ ] `/tools/test-results/nab-smoke-{date}.json` exists and shows PASS
- [ ] Transaction count, opening balance, closing balance all match ground truth
- [ ] Auto-detect (`bank: "auto"`) correctly identified the file as NAB

---

## PHASE 1 SIGN-OFF GATE

**Gaurav completes this checklist personally before moving to Phase 2:**

- [ ] TASK-000 through TASK-008 all show ✅
- [ ] 4 beta testers have been onboarded and can log in
- [ ] At least 1 beta tester has successfully parsed a real statement
- [ ] At least 1 paid Stripe subscription exists in the dashboard
- [ ] securestatementconverter.com is live (not Hostinger placeholder)
- [ ] No open Sentry/console errors in production

**Sign-off date:** _____________ **Signed by:** Gaurav Bodar

---

## PHASE 2 — BAS Automation Agent (Starts After Phase 1 Sign-Off)

Tasks will be defined here after Phase 1 completes. Do not start.

- [ ] TASK-101: GST categorisation engine
- [ ] TASK-102: BAS worksheet generator
- [ ] TASK-103: Accountant review + approval workflow
- [ ] TASK-104: Draft financial statements
- [ ] TASK-105: Client-facing approval portal

---

## PHASE 3 — Content Engine (Starts After Phase 2 Complete)

Tasks will be defined here after Phase 2 completes. Do not start.

---

## Appendix — Gaurav's Action Items (Not Claude Code)

These must be done by Gaurav before certain tasks can complete:

| # | Action | Blocks | Done? |
|---|---|---|---|
| A1 | Update DNS: point securestatementconverter.com to Vercel | TASK-006 | ☐ |
| A2 | Confirm Railway parser service URL and add to Vercel env vars | TASK-000 | ☐ |
| A3 | Add Stripe price IDs to Vercel env vars | TASK-004 | ☐ |
| A4 | Confirm Supabase prod project URL + keys are in Vercel | TASK-000 | ☐ |
| A5 | Email 4 beta testers with onboarding link | Phase 1 Sign-Off | ☐ |
| A6 | Enable GitHub Copilot on MacBook | Claude Code sessions | ☐ |
