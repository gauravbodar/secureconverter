# NAB Parser — Forensic Bug Report & Rewrite Specification
## Based on: 7311-20220630-statement.pdf (Real 5-page statement)

---

## Verdict: Parser requires a full rewrite of the extraction logic.

The current output has **14 rows**. The correct output has approximately **70 transactions**.
Every single column has errors. The bugs are systematic, not edge cases.

---

## Section 1 — Statement Facts (Ground Truth)

| Field | Value |
|-------|-------|
| Account holder | AKSHAR PURSHOTTAM PTY LTD |
| Account type | BUSINESS EVERYDAY AC / NAB QUICKBIZ OVERDRAFT |
| BSB | 082-908 |
| Account number | 31-519-7311 |
| Statement period | 1 June 2022 to 30 June 2022 |
| Statement number | 41 |
| Opening balance | $12,204.06 Dr |
| Total credits | $25,568.19 |
| Total debits | $25,467.81 |
| Closing balance | $12,103.68 Dr |
| Pages | 5 |

**Balance validation:**
`12,204.06 + 25,467.81 - 25,568.19 = 12,103.68` ✓

---

## Section 2 — Bug Inventory (All 9 Bugs)

### BUG 1: Wrong year in date field
- **Current output:** `02/06/2026`
- **Expected:** `02/06/2022`
- **Root cause:** Parser is using current system year (2026) instead of extracting the statement year from the PDF header
- **Fix:** Extract year from "Statement starts 1 June 2022" / "Statement ends 30 June 2022" in the header. Use that year for ALL date parsing.

---

### BUG 2: Year "2022" prepended to every description
- **Current output:** `2022NABATM Dep 02nd13:28 Canberra`
- **Expected:** `NABATM Dep 02nd13:28 Canberra`
- **Root cause:** Year string being concatenated onto description text
- **Fix:** Strip any leading year pattern (`/^\d{4}/`) from all description fields

---

### BUG 3: Page 1 entirely missing (9+ transactions lost)
- **Current output:** First row is `02/06/2022` — June 1 not present at all
- **Expected:** All 9 transactions dated 01/06/2022 must appear
- **Root cause:** Page 1 parser is failing silently, likely because the "Brought forward" opening line or the "Important" insurance notice block is confusing the state machine
- **Fix:** See Section 3 — Page 1 Structure Rules below

---

### BUG 4: ~80% of transactions missing (14 rows instead of ~70)
- **Current output:** 14 rows
- **Expected:** ~70 rows
- **Root cause:** Multiple failures — multi-line descriptions not joined, same-date transactions collapsed to one, debit transactions being dropped entirely
- **Fix:** See Section 3 — Transaction Extraction Rules

---

### BUG 5: Debit column is empty for all 14 rows
- **Current output:** Debit column blank on every row
- **Expected:** Most rows should have a debit value (card purchases, fees, transfers out)
- **Root cause:** Parser is not reading the Debits column at all — only capturing the number that appears at the END of a text block (which is the amount, not the balance)
- **Fix:** See Section 4 — Column Detection

---

### BUG 6: Credit column almost entirely empty
- **Current output:** Only 1 row has a credit value (row 10, Springbank Rise 21/06, value 602.00)
- **Expected:** Many rows should have credits (ATM deposits, linked account transfers, Springbank Rise rent credits)
- **Root cause:** Same as Bug 5 — column detection is broken

---

### BUG 7: Balance column is wrong — showing amount instead of running balance
- **Current output:** Row 2 shows `balance=1030.00` — this is the NABATM Dep credit amount, not the balance
- **Expected:** Row 2 balance should be approximately `11,425.98` (the running balance after 2 Jun transactions)
- **Root cause:** Parser is treating the last number it finds as the balance, but that number is actually the transaction amount. The running balance only appears explicitly at the END of a group of same-date transactions (or at "Carried forward" lines)
- **Fix:** See Section 5 — Balance Rules

---

### BUG 8: Multi-line descriptions not joined
NAB wraps long merchant names across two lines. Examples from the PDF:

```
V4897 31/05 Woolwort Hs/Hibberson St Gun
Gahlin 74278242151............. 6.07
```
Should be: `V4897 31/05 Woolworths/Hibberson St Gungahlin 74278242151`

```
V2712 29/05 Aldi STO Res - Casey Cas
Ey 74940522150........... 30.21
```
Should be: `V2712 29/05 Aldi STO Res - Casey 74940522150`

```
May 22 Tyro Fees
166111 ......... 276.25
```
Should be: `May 22 Tyro Fees 166111`

- **Fix:** When a line contains no date and no debit/credit amount (only continuation text), concatenate it to the previous transaction's description before the amount appears

---

### BUG 9: Page noise parsed as transactions
These lines must be IGNORED — they are structural page elements, not transactions:

| Line pattern | Reason to ignore |
|-------------|-----------------|
| `Brought forward` | Opening balance carry-over header |
| `Carried forward` | Page-end balance carry-over |
| `Transaction Details (continued)` | Page continuation header |
| `Date Particulars Debits Credits Balance` | Column header row |
| `Statement number 41 Page X of 5` | Page footer |
| `NAB Business Everyday Account` | Page header |
| `For further information call the Business Servicing Team on 13 10 12` | Footer |
| `Account Details BSB Number Account Number ...` | Page 3/5 header block |
| `Identifying a transaction made using your NAB Visa Debit card...` | Explanatory notes (page 5) |
| `Summary of Government Charges` | Government charges section header |
| `Please Note: As At Today, Your Current Dr Interest Rate Is 13.000% pa` | Rate notice — NOT a transaction |
| `Important As part of your loan agreement...` | Insurance notice block — NOT a transaction |
| `181/72/08/M013491/...` | Internal document reference codes |
| `(:GERQ1)` / `(:GERQ2)` / `(:GERQ3)` | Internal control codes |

---

## Section 3 — Page 1 Structure (Special Handling Required)

Page 1 has a unique structure that must be handled as a special case:

```
[Header block — skip all of this]
Account Balance Summary
Opening balance $12,204.06 Dr  ← EXTRACT as openingBalance
Total credits $25,568.19       ← EXTRACT as totalCredits (for validation)
Total debits $25,467.81        ← EXTRACT as totalDebits (for validation)
Closing balance $12,103.68 Dr  ← EXTRACT as closingBalance
Statement starts 1 June 2022   ← EXTRACT year and from-date
Statement ends 30 June 2022    ← EXTRACT to-date

[Account holder block — skip]
[Outlet Details block — skip]
[Account Details block — EXTRACT BSB + account number]
[For Your Information notice — SKIP ENTIRE BLOCK]

[Transaction Details — START PARSING HERE]
Date Particulars Debits Credits Balance   ← SKIP column header
1 Jun 2022 Brought forward 12,204.06 Dr  ← SKIP (= opening balance already captured)
1 Jun 2022 Important                       ← SKIP + SKIP NEXT 8 LINES (insurance notice)
```

The "Important" notice block spans multiple lines and ends before "Springbank Rise 166111". The parser must skip this entire block. Detection: when the word "Important" appears on a line by itself after a date, skip lines until a line ending in a dollar amount is found.

### Page 1 Transactions (Expected — use for test validation)

```
01/06/2022, Springbank Rise 166111, , 590.00
01/06/2022, Online B3658037334 Linked Acc Trns Akshar Pursh, , 300.00
01/06/2022, May 22 Tyro Fees 166111, 276.25,
01/06/2022, V4897 31/05 Woolworths/Hibberson St Gungahlin 74278242151, 6.07,
01/06/2022, V2712 29/05 Aldi STO Res - Casey 74940522150, 30.21,
01/06/2022, V4897 31/05 Boost Juice Pty Ltd Chadstone 74201332151, 30.80,
01/06/2022, V4897 31/05 7-ELEVEN 2307 Casey 74564452151, 60.47,
01/06/2022, V2712 31/05 Big W/Hibberson & Gozzard Gungahlin 74278242151, 129.40,
01/06/2022, V2712 31/05 The Coffee Galleria Pty L Silverwate 02171188446, 303.80,
```
Balance after page 1: 12,751.06 Dr

---

## Section 4 — Column Detection Rules

NAB statement columns: `Date | Particulars | Debits | Credits | Balance`

The challenge is that pdf-parse extracts text linearly. Position in the line determines which column an amount belongs to.

### Amount Classification Strategy

For each line with a dollar amount, determine Debit vs Credit using these rules IN ORDER:

**Rule 1 — Keyword-based (highest confidence)**
| Description contains | Column |
|---------------------|--------|
| `NABATM Dep`, `Coin Deposit`, `Springbank Rise`, `Online B...Linked Acc Trns`, `Gaurav Bodar` | Credit |
| `Interest Charged`, `Account Fees`, `Service Fee`, `Transaction Fees`, `Flat Monthly Fee` | Debit |
| `V4897`, `V2712` (Visa card prefix) | Debit |
| `Internet Transfer`, `Internet Bpay`, `EFTPOS`, `SPD...AAMI`, `Bank Guarantee` | Debit |
| `Gap Licencefee`, `Lease Pay`, `001-...`, `Jigar Patel`, `Frank Demarco` (outgoing) | Debit |
| `Schwepps`, `G61020007...Goodman Fielder`, `Ccfa` | Debit |
| `15004512 J.J. Richards` | Debit |

**Rule 2 — Position-based (use x-coordinate from pdfjs-dist)**
The NAB statement has consistent column x-positions:
- Debits column right-edge: approximately x=400-450 (relative to page)
- Credits column right-edge: approximately x=500-550
- Balance column right-edge: approximately x=580-620
Use `pdfjs-dist` item positioning to read actual x-coordinates and assign to the correct column.

**Rule 3 — Dot-length heuristic (fallback)**
NAB uses dots to fill space between description and amount:
- SHORT dots (3-15 chars) + amount → Debits column (amount is closer to left)
- LONG dots (20+ chars) → Credits column (amount is further right)
- Amount appears AFTER a balance figure on same line → it IS the balance

---

## Section 5 — Balance Rules

### Key insight: NAB only prints the running balance intermittently

The balance is printed:
1. On the "Brought forward" line (= opening balance)
2. On the LAST transaction line for each date group
3. On "Carried forward" lines (= same value as last transaction for that page)

**DO NOT** use the "Carried forward" balance as a separate transaction.

**DO** use the balance that appears with a transaction as the running balance for that date group.

Example from page 1:
```
01/06 Woolworths....... 6.07          ← no balance shown
01/06 Aldi............. 30.21         ← no balance shown
01/06 Boost Juice...... 30.80         ← no balance shown
01/06 7-ELEVEN......... 60.47         ← no balance shown
01/06 Big W............ 129.40        ← no balance shown
01/06 Coffee Galleria.. 303.80  12,751.06 Dr   ← balance shown on LAST line of this date
```

**Balance filling rule:** When a balance appears on the last transaction of a date group, assign that balance to ALL transactions in that date group (since the running balance for intermediate transactions isn't printed).

**Alternative (preferred):** Compute the running balance yourself:
- Start from opening balance
- For each transaction in order: if credit → balance -= amount; if debit → balance += amount
- This is more accurate than relying on the printed balance per-row

### "Dr" suffix handling
All balances in this statement end in "Dr" (overdraft). Strip the "Dr" suffix and store as a positive number. The account_type field can note "overdraft".

---

## Section 6 — Date Handling Rules

### Date format in NAB statements
- Full date: `2 Jun 2022`, `13 Jun 2022`, `30 Jun 2022`
- Abbreviated date in Visa lines: `31/05` (in `V4897 31/05 Woolworths`) — this is the card transaction date, NOT the posting date. Use the POSTING date (the date shown in the Date column) for the transaction date.

### Date inheritance
Multiple transactions appear under ONE date header. Example:
```
2 Jun 2022  NABATM Dep....... 1,030.00      ← date shown
            Springbank Rise.. 690.00         ← NO date — inherits 2 Jun 2022
            SPD013601197 AAMI 244.09         ← NO date — inherits 2 Jun 2022
            EFTPOS 01/06...   4.00           ← NO date — inherits 2 Jun 2022
            ... (8 more transactions)        ← all inherit 2 Jun 2022
```

**Rule:** When a transaction line has no date, it inherits the most recently seen date.

### Year extraction
Extract year from `Statement starts 1 June 2022` in the header.
Do NOT use system year. Do NOT derive from any other source.

---

## Section 7 — Special Transaction Types

### Multi-line descriptions (most common NAB issue)
Pattern: Line 1 has start of description, Line 2 has continuation + amount
```
V2712 31/05 The Coff ee Galleria Pty Lsil    ← line 1: description start (note: PDF splits "Coffee" and "Silverwate")
verwate 02171188446 ............ 303.80       ← line 2: continuation + amount
```
**Rule:** If a line has no date AND no amount, it is a description continuation — append to previous line's description, then continue looking for the amount on the next line.

**Indicators that a line is a continuation (not a new transaction):**
- No date at the start
- Does not start with a known standalone transaction pattern
- Contains only text characters (no dollar amounts)

### Visa card transactions
Pattern: `V{cardnum} {DD/MM} {merchant} {place} {reference_number}....... {amount}`
- `V4897` = card ending 4897
- `V2712` = card ending 2712
- `{DD/MM}` = card transaction date (use posting date from Date column)
- Everything including the reference number is the description

### NABATM Deposit
Pattern: `NABATM Dep {DDth HH:MM} {Location}....... {amount}`
Always a Credit.

### Springbank Rise 166111
Appears on almost every day. Always a Credit. This is rent received from a tenant.

### Coin Deposit
Pattern: `Coin Deposit......... {amount}`
Always a Credit.

### Fee block (30 Jun 2022)
The TRANSACTION SUMMARY block on 30 Jun has a different layout:
```
30 Jun 2022 TRANSACTION SUMMARY QUANTITY U/COST FEE
  Express Business Dep. (EBD)  2  $0.60  $1.20
  NAB ATM Deposit               5  $0.00  $0.00
  Electronic Deposit            22 $0.00  $0.00
  Electronic Withdrawal         26 $0.00  $0.00
Transaction Fees $1.20
Flat Monthly Fee $10.00
Less Free Eligible Trans.(max 30) $1.20
Total Fees Charged $10.00
```
Then after this block, the actual debit transactions:
```
Springbank Rise 166111 ......... 706.00       ← Credit
Interest Charged ............... 125.44       ← Debit
Account Fees ................... 10.00        ← Debit
Service Fee .................... 20.00        ← Debit
V4897 29/06 Aao Jee Indian Bazaa Aama Roo 74564452180... 47.71  ← Debit
```
**Rule:** Skip the TRANSACTION SUMMARY block entirely. Parse the transactions that follow it normally.

---

## Section 8 — Expected Row Count

| Date | Transactions |
|------|-------------|
| 01 Jun | 9 |
| 02 Jun | 8 |
| 03 Jun | 4 |
| 06 Jun | 12 |
| 07 Jun | 2 |
| 08 Jun | 3 |
| 09 Jun | 5 |
| 10 Jun | 1 |
| 13 Jun | 1 |
| 14 Jun | 7 |
| 15 Jun | 5 |
| 16 Jun | 5 |
| 17 Jun | 7 |
| 20 Jun | 7 |
| 21 Jun | 1 |
| 22 Jun | 4 |
| 23 Jun | 2 |
| 24 Jun | 1 |
| 27 Jun | 9 |
| 28 Jun | 5 |
| 29 Jun | 2 |
| 30 Jun | 5 |
| **TOTAL** | **~106** |

---

## Section 9 — Validation Checksums

Run these after parsing to verify correctness:

```javascript
const EXPECTED = {
  openingBalance: 12204.06,
  closingBalance: 12103.68,
  totalCredits: 25568.19,
  totalDebits: 25467.81,
  statementPeriod: { from: '2022-06-01', to: '2022-06-30' },
  bank: 'National Australia Bank',
  accountNumber: '31-519-7311',
  bsb: '082-908',
  accountHolder: 'AKSHAR PURSHOTTAM PTY LTD'
};

// Validate
const sumCredits = transactions.reduce((s, t) => s + (t.credit || 0), 0);
const sumDebits  = transactions.reduce((s, t) => s + (t.debit  || 0), 0);
assert(Math.abs(sumCredits - EXPECTED.totalCredits) < 0.02, 'Credits mismatch');
assert(Math.abs(sumDebits  - EXPECTED.totalDebits)  < 0.02, 'Debits mismatch');
assert(Math.abs(openingBalance + sumDebits - sumCredits - EXPECTED.closingBalance) < 0.02, 'Balance mismatch');
```

---

## Section 10 — Recommended Rewrite Approach

The current text-extraction approach (linear text scan) cannot handle NAB reliably because:
1. Column position (debit vs credit) is lost in linear text
2. Multi-page headers pollute the transaction stream
3. Multi-line descriptions require look-ahead logic

### Recommended approach: pdfjs-dist with x-coordinate positioning

```javascript
import * as pdfjsLib from 'pdfjs-dist';

async function extractNABTransactions(pdfBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const allItems = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // content.items has: str, transform[4]=x, transform[5]=y, width, height
    allItems.push(...content.items.map(item => ({
      text: item.str.trim(),
      x: Math.round(item.transform[4]),
      y: Math.round(item.transform[5]),
      page: pageNum
    })));
  }

  // Group by y-coordinate (same y = same line)
  // Sort by x within each line
  // Apply column rules: x < DEBIT_COL_X = description, DEBIT_COL_X < x < CREDIT_COL_X = debit, etc.
  // ...
}
```

Column x-coordinate boundaries (approximate — calibrate against actual PDF):
- Description ends at x ≈ 350
- Debit amount right-edge at x ≈ 430
- Credit amount right-edge at x ≈ 510
- Balance right-edge at x ≈ 590

Run the extractor once and log all x-values to calibrate the actual boundaries for this NAB format.

---

## Section 11 — Page 1 Expected Output (Authoritative Test)

This is the definitive expected output for page 1. Use as a unit test:

```csv
date,description,debit,credit,balance
2022-06-01,Springbank Rise 166111,,590.00,
2022-06-01,Online B3658037334 Linked Acc Trns Akshar Pursh,,300.00,
2022-06-01,May 22 Tyro Fees 166111,276.25,,
2022-06-01,V4897 31/05 Woolworths/Hibberson St Gungahlin 74278242151,6.07,,
2022-06-01,V2712 29/05 Aldi STO Res Casey 74940522150,30.21,,
2022-06-01,V4897 31/05 Boost Juice Pty Ltd Chadstone 74201332151,30.80,,
2022-06-01,V4897 31/05 7-ELEVEN 2307 Casey 74564452151,60.47,,
2022-06-01,V2712 31/05 Big W/Hibberson & Gozzard Gungahlin 74278242151,129.40,,
2022-06-01,V2712 31/05 The Coffee Galleria Pty L Silverwate 02171188446,303.80,,12751.06
```
Notes on the above:
- Balance only shown on the last row of each date group (as it appears in the PDF)
- All dates are ISO format YYYY-MM-DD
- No "Dr" suffix anywhere
- No year prefix in descriptions

---

## Section 12 — CLAUDE.md Update Required

After fixing the NAB parser, update Section 3 of CLAUDE.md:
- Change NAB status from "code complete — 2 checks pending" to current accurate status
- Add the validation checksums from Section 9 as the NAB test spec
- Note that pdfjs-dist positional approach is required (not pdf-parse text scan)


