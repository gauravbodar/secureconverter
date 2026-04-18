# CLAUDE.md — SecureStatementConverter
## Master Project Blueprint for Claude Code

> **Treat this file as the single source of truth.** Every decision, output, and implementation must align with what is written here. Do not invent features, assumptions, or requirements. When in doubt, ask before building.

---

## 0. Project Overview — Two Tracks

| Track | Product | Purpose |
|-------|---------|---------|
| **Track 2 (this repo)** | SecureStatementConverter | SaaS — converts Australian bank PDF statements to CSV/XLSX/JSON |
| **Track 1 (referenced)** | AI Agent Automation Service | Done-for-you AI agent builds — sold via Enterprise tier of Track 2 |

**Enterprise connection:** Enterprise tier → "Book a Call" → AI Agent Automation Service proposal ($3,000–$5,000 setup + $500–$1,000/month retainer).

---

## 1. Brand Promise — NON-NEGOTIABLE

**"Secure" is the entire brand.**

- Australian bank statement data NEVER leaves our infrastructure
- NO third-party parsing APIs (not bankstatementconverter.com, not OpenAI, not AWS Textract, nothing)
- NO external service ever sees a user's PDF
- Parsing runs 100% on our own servers using local Python libraries
- This is a hard architectural constraint — never route PDFs externally

---

## 2. Confirmed Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React 18 + Vite | NOT Next.js. Entry: `index.html` + `src/` |
| **Styling** | Tailwind CSS 3 + Radix UI + shadcn/ui | Deep Navy Blue + White + Grey |
| **Animation** | Framer Motion | Already in `package.json` |
| **Icons** | lucide-react | Already in use |
| **Frontend API calls** | Vercel Serverless (JS) | `/api/*.js` — auth, billing, quota, routing only |
| **PDF Parsing** | Python + pdfplumber | Runs on Railway (separate microservice) |
| **Parse routing** | `/api/convert.js` | Proxies PDF to Python service, returns JSON |
| **Database** | Supabase | `@supabase/supabase-js`, RLS on all tables |
| **Auth** | Supabase Auth | Email + password |
| **Payments** | Stripe v14 | Already installed — only payment processor |
| **Deployment — Frontend** | Vercel | `vercel.json` configured |
| **Deployment — Parser** | Railway (Python) | Flask microservice, separate repo or `/parser` folder |
| **Local path** | `C:\AWS\securestatement` | Claude Code working directory |

### Design System
- **Primary:** Deep Navy Blue (`#0A2342`)
- **Background:** Crisp White (`#FFFFFF`)
- **Accents:** Light Grey (`#F5F5F5`), Mid Grey (`#E0E0E0`)
- **Max-width:** 1200px | Desktop padding: 4rem | Mobile: 2rem

---

## 3. Parsing Architecture — THE CRITICAL CHANGE

### What changed and why

| | Old (Broken) | New (Correct) |
|--|-------------|---------------|
| Language | JavaScript | Python |
| Library | pdf-parse + pdfjs-dist | **pdfplumber** |
| Approach | Linear text scan — loses column position | Table grid extraction — reads column structure |
| Bank-specific code | One parser per bank (CBA, NAB, etc.) | **One generic extractor for ALL banks** |
| Column detection | Manual heuristics and guessing | Automatic — pdfplumber detects table columns |
| Data leaves server | No | **No — runs on our own Railway instance** |
| NAB result | 14 rows (broken) | ~70 rows (correct) |

### Delete all old parser files
When starting the Python rewrite session, **delete these files first:**
- Any `*cba*parser*`, `*nab*parser*` JavaScript files in `lib/` or `api/`
- Any `classifier.js` if it only routes to broken JS parsers
- Do NOT keep broken code alongside new code

### How pdfplumber works
```python
import pdfplumber

with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        table = page.extract_table()
        # Returns: [[date, particulars, debit, credit, balance], ...]
        # Column positions are detected from the PDF's actual table structure
        # No guessing — the table grid IS in the PDF
```

---

## 4. Python Parser Service — Full Specification

### Deployment: Flask app on Railway
- File: `parser/app.py`
- Endpoint: `POST /parse` — accepts multipart PDF, returns JSON
- Environment variable on Railway: `PARSER_SECRET` (shared with Vercel `/api/convert.js`)
- Vercel `/api/convert.js` proxies user uploads to Railway `/parse`

### Parser logic — step by step

```python
import pdfplumber
import re
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

NOISE_ROWS = {
    'brought forward', 'carried forward', 'transaction details',
    'transaction details (continued)', 'date particulars debits credits balance',
    'date', 'statement number', 'nab business everyday account',
    'for further information', 'account details', 'identifying a transaction',
    'summary of government charges', 'explanatory notes',
    'please check all entries'
}

MONTH_MAP = {
    'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
    'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12
}

def is_noise(text):
    if not text:
        return True
    t = text.strip().lower()
    if len(t) < 3:
        return True
    for noise in NOISE_ROWS:
        if t.startswith(noise):
            return True
    # Internal reference codes
    if re.match(r'^[\(:]?[A-Z0-9]{6,}', text.strip()):
        return True
    return False

def parse_amount(val):
    """Strip $, commas, Dr/Cr suffixes. Return float or None."""
    if not val or not str(val).strip():
        return None
    v = re.sub(r'[\$,\s]', '', str(val))
    v = re.sub(r'Dr$|Cr$', '', v, flags=re.IGNORECASE)
    try:
        return abs(float(v))
    except:
        return None

def parse_date(val, year):
    """Parse NAB date formats: '1 Jun 2022', '2 Jun 2022'. Return ISO string."""
    if not val:
        return None
    val = val.strip()
    # Format: "1 Jun 2022" or "1 Jun"
    m = re.match(r'(\d{1,2})\s+([A-Za-z]{3})\s*(\d{4})?', val)
    if m:
        day = int(m.group(1))
        mon = MONTH_MAP.get(m.group(2).lower())
        yr = int(m.group(3)) if m.group(3) else year
        if mon:
            return f"{yr:04d}-{mon:02d}-{day:02d}"
    return None

def extract_statement_year(pdf):
    """Get year from 'Statement starts D Month YYYY' in first page text."""
    first_text = pdf.pages[0].extract_text() or ''
    m = re.search(r'Statement starts.*?(\d{4})', first_text)
    if m:
        return int(m.group(1))
    m = re.search(r'\b(20\d{2})\b', first_text)
    if m:
        return int(m.group(1))
    return datetime.now().year  # fallback only

def extract_header_info(pdf):
    """Extract account metadata from first page."""
    text = pdf.pages[0].extract_text() or ''
    info = {}
    # Opening/closing balances
    ob = re.search(r'Opening balance\s+\$?([\d,]+\.?\d*)', text)
    cb = re.search(r'Closing balance\s+\$?([\d,]+\.?\d*)', text)
    tc = re.search(r'Total credits\s+\$?([\d,]+\.?\d*)', text)
    td = re.search(r'Total debits\s+\$?([\d,]+\.?\d*)', text)
    info['openingBalance'] = parse_amount(ob.group(1)) if ob else None
    info['closingBalance'] = parse_amount(cb.group(1)) if cb else None
    info['totalCredits']   = parse_amount(tc.group(1)) if tc else None
    info['totalDebits']    = parse_amount(td.group(1)) if td else None
    # BSB and account number
    bsb = re.search(r'BSB\s+(?:number\s+)?([\d-]+)', text)
    acc = re.search(r'Account\s+number\s+([\d-]+)', text)
    info['bsb'] = bsb.group(1) if bsb else ''
    info['accountNumber'] = acc.group(1) if acc else ''
    # Account holder
    holder = re.search(r'((?:[A-Z][A-Z\s&]+){2,})\n', text)
    info['accountName'] = holder.group(1).strip() if holder else ''
    # Statement period
    sf = re.search(r'Statement starts\s+(\d+\s+\w+\s+\d{4})', text)
    st = re.search(r'Statement ends\s+(\d+\s+\w+\s+\d{4})', text)
    info['periodFrom'] = sf.group(1) if sf else ''
    info['periodTo']   = st.group(1) if st else ''
    # Detect bank
    if 'National Australia Bank' in text or 'NAB' in text:
        info['bank'] = 'National Australia Bank'
    elif 'Commonwealth Bank' in text or 'NetBank' in text:
        info['bank'] = 'Commonwealth Bank'
    elif 'Westpac' in text:
        info['bank'] = 'Westpac'
    elif 'Australia and New Zealand' in text or 'ANZ' in text:
        info['bank'] = 'ANZ'
    else:
        info['bank'] = 'Unknown'
    return info

@app.route('/parse', methods=['POST'])
def parse():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    pdf_file = request.files['file']
    transactions = []
    header_info = {}
    year = datetime.now().year

    try:
        with pdfplumber.open(pdf_file) as pdf:
            year = extract_statement_year(pdf)
            header_info = extract_header_info(pdf)
            last_date = None

            for page in pdf.pages:
                table = page.extract_table()
                if not table:
                    continue

                for row in table:
                    if not row or all(c is None or str(c).strip() == '' for c in row):
                        continue

                    # Flatten: get text from each cell
                    cells = [str(c).strip() if c else '' for c in row]

                    # Skip noise rows
                    row_text = ' '.join(cells).strip().lower()
                    if is_noise(row_text):
                        continue
                    if is_noise(cells[0]) and is_noise(cells[1] if len(cells) > 1 else ''):
                        continue

                    # Expect: [date, description, debit, credit, balance]
                    if len(cells) < 3:
                        continue

                    date_raw = cells[0]
                    desc = cells[1] if len(cells) > 1 else ''
                    debit_raw  = cells[2] if len(cells) > 2 else ''
                    credit_raw = cells[3] if len(cells) > 3 else ''
                    bal_raw    = cells[4] if len(cells) > 4 else ''

                    # Parse date — inherit if blank
                    parsed_date = parse_date(date_raw, year)
                    if parsed_date:
                        last_date = parsed_date
                    elif not last_date:
                        continue  # Can't place this row yet

                    # Skip non-transaction description rows
                    if not desc or is_noise(desc):
                        continue

                    debit  = parse_amount(debit_raw)
                    credit = parse_amount(credit_raw)
                    balance = parse_amount(bal_raw)

                    # Must have at least an amount
                    if debit is None and credit is None:
                        continue

                    transactions.append({
                        'date': last_date,
                        'description': desc,
                        'debit': debit,
                        'credit': credit,
                        'balance': balance
                    })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # Validation checksums
    sum_credits = sum(t['credit'] or 0 for t in transactions)
    sum_debits  = sum(t['debit']  or 0 for t in transactions)
    ob = header_info.get('openingBalance') or 0
    cb = header_info.get('closingBalance') or 0
    computed_close = round(ob + sum_debits - sum_credits, 2)
    balance_valid = abs(computed_close - cb) < 0.05

    return jsonify({
        'bank': header_info.get('bank'),
        'accountName': header_info.get('accountName'),
        'accountNumber': header_info.get('accountNumber'),
        'bsb': header_info.get('bsb'),
        'statementPeriod': {
            'from': header_info.get('periodFrom'),
            'to': header_info.get('periodTo')
        },
        'openingBalance': header_info.get('openingBalance'),
        'closingBalance': header_info.get('closingBalance'),
        'validation': {
            'sumCredits': round(sum_credits, 2),
            'sumDebits': round(sum_debits, 2),
            'balanceChecks': balance_valid,
            'transactionCount': len(transactions)
        },
        'transactions': transactions
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Requirements file (`parser/requirements.txt`)
```
pdfplumber==0.11.0
flask==3.0.3
gunicorn==22.0.0
```

### Railway deployment (`parser/Procfile`)
```
web: gunicorn app:app
```

---

## 5. Vercel Proxy (`/api/convert.js`)

```javascript
// This file receives the PDF from the browser
// and forwards it to the Railway Python parser
// The PDF never goes anywhere except our own Railway instance

import formidable from 'formidable';
import fs from 'fs';
import FormData from 'form-data';

export const config = { api: { bodyParser: false } };

const PARSER_URL = process.env.PARSER_URL; // e.g. https://secureparser.railway.app
const PARSER_SECRET = process.env.PARSER_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Parse multipart upload
  const form = formidable({ maxFileSize: 20 * 1024 * 1024 });
  const [fields, files] = await form.parse(req);
  const uploadedFile = files.file?.[0];
  if (!uploadedFile) return res.status(400).json({ error: 'No file' });

  // Check quota (anonymous = 3 pages, registered = 6/day, pro = unlimited)
  // TODO: quota check against Supabase here

  // Forward to our own Python parser on Railway
  const formData = new FormData();
  formData.append('file', fs.createReadStream(uploadedFile.filepath), {
    filename: uploadedFile.originalFilename,
    contentType: 'application/pdf'
  });

  const parseRes = await fetch(`${PARSER_URL}/parse`, {
    method: 'POST',
    headers: {
      ...formData.getHeaders(),
      'X-Secret': PARSER_SECRET
    },
    body: formData
  });

  const result = await parseRes.json();

  // Convert to CSV and return
  // Or return raw JSON — let frontend handle format selection
  return res.status(200).json(result);
}
```

---

## 6. Environment Variables

```bash
# Vercel env vars
PARSER_URL=https://your-parser.railway.app   # Your Railway Python service
PARSER_SECRET=random-shared-secret           # Shared secret between Vercel and Railway

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

STRIPE_SECRET_KEY=
STRIPE_PRICE_PRO=
STRIPE_PRICE_ACCOUNTANT=
STRIPE_WEBHOOK_SECRET=
VITE_STRIPE_PUBLISHABLE_KEY=

MAILERLITE_API_KEY=
MAILERLITE_GROUP_ID=
```

---

## 7. Plans & Pricing

| Plan | Price | Limits |
|------|-------|--------|
| **Free – Anonymous** | $0 | 3 pages per session, no login, CSV only |
| **Free – Registered** | $0 | 6 pages/24hrs, CSV only, last 10 files |
| **Pro** | $19/month | Unlimited pages, CSV + XLSX, full history |
| **Accountant** | $49/month | Pro + client folders, 5 team members, API, webhooks |
| **Enterprise** | **No price** | Book a Call → AI Agent Service |

**Enterprise must never show a price.**

---

## 8. Supported Banks

**pdfplumber reads the table structure — bank-specific parsers are no longer needed.**
The same `extract_table()` call works for CBA, NAB, Westpac, ANZ and any other bank.

Post-processing differences per bank (handle in `extract_header_info`):
- CBA: "Commonwealth Bank" in text, BSB format `0xx-xxx`
- NAB: "National Australia Bank", may have "Dr" suffix on balances (overdraft)
- Westpac: "Westpac" in text
- ANZ: "Australia and New Zealand Banking" in text

**Tier 1 (MVP):** CBA, NAB, Westpac, ANZ
**Tier 2 (Phase 2):** Macquarie, Bankwest, Suncorp, Bendigo, BOQ, ING — do not start until instructed

---

## 9. Validation Checksums (NAB Test Statement)

After parsing `7311-20220630-statement.pdf`:
```
sumCredits  = 25568.19  (±0.02)
sumDebits   = 25467.81  (±0.02)
openingBal  = 12204.06
closingBal  = 12103.68
rowCount    ≈ 70+
page1Rows   = 9 (all dated 2022-06-01)
year        = 2022  (never 2026)
```

---

## 10. Standard Output Schema

```json
{
  "date": "2022-06-01",
  "description": "Springbank Rise 166111",
  "debit": null,
  "credit": 590.00,
  "balance": null
}
```

CSV columns: `date, description, debit, credit, balance, bankName, accountNumber, bsb`

---

## 11. Supabase Schema

```sql
profiles      (id, email, plan, pages_used_today, quota_reset_at, created_at)
conversions   (id, user_id, filename, bank_detected, page_count, status, created_at, expires_at)
transactions  (id, conversion_id, date, description, debit, credit, balance, bank_name)
subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
```
RLS enabled on all tables.

---

## 12. Phase 1 Remaining Build Tasks

- [ ] **Deploy Python parser to Railway** — `parser/app.py`, test against NAB real PDF
- [ ] **Wire `/api/convert.js`** — proxy to Railway, return JSON to frontend
- [ ] **Upload UI** — drag-drop PDF → loading → row count → Download CSV button
- [ ] **Quota enforcement** — anonymous 3 pages, free 6/day, pro unlimited
- [ ] **Supabase auth** — signup/login endpoints
- [ ] **Stripe plans** — Pro + Accountant checkout, webhook handler
- [ ] **Pricing page** — 4 plan cards + Enterprise "Book a Call" (no price)
- [ ] **Dashboard** — conversion history from Supabase

---

## 13. Security & Privacy

- PDFs auto-deleted after 7 days (Supabase Storage lifecycle)
- Railway Python service is internal — not publicly documented
- `PARSER_SECRET` header validates all requests from Vercel to Railway
- No PII or transaction content in logs
- RLS on all Supabase tables
- Stripe handles all card data

---

## 14. Landing Page Copy (AU-Optimised)

**Headline:** Convert Australian bank statements to CSV in seconds
**Subheadline:** Upload your CBA, NAB, Westpac, ANZ and other Australian bank PDFs and instantly download clean CSV files ready for Xero, Excel, or your accountant.
**Primary CTA:** [Upload Statement] — No signup required
**Secondary CTA:** [See Pricing]

**3 benefit tiles:**
1. Built for Australian banks — CBA, NAB, Westpac, ANZ and more
2. Perfect for accountants & brokers — reconciliation, loan assessment, compliance
3. Fast, secure, and private — your data never leaves Australian servers

---

## 15. Enterprise → Track 1 Handoff

```
Enterprise tile copy:
"Need more than a converter?
We build custom AI agents that automate your entire back-office —
invoicing, lead follow-up, client onboarding, report generation.
Built in 2 weeks. Done-for-you. No tech team required.
[Book a Free Discovery Call]"
```
On click: mailto:gaurav.bodar@gmail.com or Calendly embed.

---

## 16. Claude Code Working Rules

1. **pdfplumber only** — no pdf-parse, no pdfjs-dist, no external parsing APIs
2. **Data sovereignty** — PDFs never routed to third-party services. Ever.
3. **Delete all old JS parsers** before starting Python rewrite
4. **One generic extractor** — no bank-specific parser files
5. **Railway for Python** — Vercel runs JS only; parser runs on Railway
6. **Enterprise = no price** — "Book a Call" only
7. **Stripe only** for payments, **Supabase only** for data
8. **No real bank PDFs in repo** — synthetic test data only
9. **RLS on** all Supabase tables
10. **Tier 2+ banks** — do not start without explicit instruction

---

*SecureStatementConverter — Gaurav Bodar | April 2026 | CONFIDENTIAL*
*Architecture: React+Vite (Vercel) + Python/pdfplumber (Railway) + Supabase + Stripe*
*Data sovereignty: All processing on own infrastructure — no third-party PDF APIs*