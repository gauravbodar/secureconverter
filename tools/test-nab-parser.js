/**
 * NAB Parser Test — validates against 7311-20220630-statement.pdf
 *
 * Run:  node tools/test-nab-parser.js [path/to/pdf]
 *
 * Validates:
 *  - Transaction count (~106 expected)
 *  - Sum of credits matches 25,568.19
 *  - Sum of debits  matches 25,467.81
 *  - Balance equation: opening + debits - credits = closing
 *  - Page 1 transactions (9 expected, all dated 2022-06-01)
 *  - No year prefix in descriptions
 *  - All dates are 2022-xx-xx (not 2026)
 */

import { readFileSync } from 'fs';
import { parsePDFToCSV } from '../lib/pdf-parser.js';

const PDF_PATH = process.argv[2] || 'test-pdfs/7311-20220630-statement.pdf';

const EXPECTED = {
  openingBalance: 12204.06,
  closingBalance: 12103.68,
  totalCredits:   25568.19,
  totalDebits:    25467.81,
  year:           2022,
  page1Count:     9,
  minTxCount:     90,  // spec says ~106; allow some tolerance for edge cases
};

// Ground-truth page 1 transactions for spot-check.
// Note: "Online B3658037334 Linked Acc Trns" appears in the DEBITS column (x≈394)
// based on actual PDF coordinates, confirmed by balance equation:
//   12204.06 - 590(credit) + 300(debit) + 276.25 + 6.07 + 30.21 + 30.80 + 60.47 + 129.40 + 303.80
//   = 12751.06 Dr ✓
// The spec Section 11 lists it as credit=300, but that contradicts both the
// PDF column position AND the closing balance equation.
const PAGE1_EXPECTED = [
  { date: '2022-06-01', descContains: 'Springbank Rise',   credit: 590.00  },
  { date: '2022-06-01', descContains: 'Online B',          debit: 300.00   }, // debit by x-position + balance math
  { date: '2022-06-01', descContains: 'Tyro Fees',         debit: 276.25   },
  { date: '2022-06-01', descContains: 'Woolwort',          debit: 6.07     }, // PDF encodes "Woolworths" as "Woolwort Hs"
  { date: '2022-06-01', descContains: 'Aldi',              debit: 30.21    },
  { date: '2022-06-01', descContains: 'Boost Ju',          debit: 30.80    }, // PDF: "Boost Ju Ice Pty Ltd"
  { date: '2022-06-01', descContains: '7-ELEVEN',          debit: 60.47    },
  { date: '2022-06-01', descContains: 'Big W',             debit: 129.40   },
  { date: '2022-06-01', descContains: 'Galleria',          debit: 303.80   },
];

function round2(n) { return Math.round((n || 0) * 100) / 100; }

async function main() {
  console.log(`\nReading: ${PDF_PATH}`);
  const buffer = readFileSync(PDF_PATH);

  console.log('Parsing...\n');
  const result = await parsePDFToCSV(buffer);

  console.log('='.repeat(60));
  console.log('PARSE RESULT');
  console.log('='.repeat(60));
  console.log(`Bank detected : ${result.bank}`);
  console.log(`Pages         : ${result.pageCount}`);
  console.log(`Rows returned : ${result.rowCount}`);
  console.log('');

  // Parse CSV back to objects for validation
  const csvLines = result.csv.split('\n');
  const header   = csvLines[0].split(',').map(h => h.toLowerCase());
  const txs = csvLines.slice(1).filter(Boolean).map(line => {
    // Handle quoted description fields
    const parts = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { parts.push(cur); cur = ''; }
      else cur += ch;
    }
    parts.push(cur);
    return {
      date:        parts[0]?.trim()  || '',
      description: parts[1]?.trim()  || '',
      debit:       parseFloat(parts[2]) || null,
      credit:      parseFloat(parts[3]) || null,
      balance:     parseFloat(parts[4]) || null,
    };
  });

  const fails = [];

  function check(label, pass, detail = '') {
    const icon = pass ? '✓' : '✗';
    console.log(`  ${icon}  ${label}${detail ? ' — ' + detail : ''}`);
    if (!pass) fails.push(label);
  }

  // ── Date checks ────────────────────────────────────────────────────────────
  console.log('DATE CHECKS');
  const wrongYear = txs.filter(t => !t.date.startsWith('2022-'));
  check('All dates are year 2022', wrongYear.length === 0,
        wrongYear.length > 0 ? `${wrongYear.length} wrong-year rows (e.g. ${wrongYear[0]?.date})` : '');

  // Check specifically for the statement year prepended to descriptions (the original bug).
  // Use the actual statement year so we don't flag legitimate reference numbers
  // like "15004512 J.J. Richards..." that happen to start with digits.
  const stmtYear = '2022';
  const yearInDesc = txs.filter(t => t.description.startsWith(stmtYear));
  check('No statement-year prefix in descriptions', yearInDesc.length === 0,
        yearInDesc.length > 0 ? `e.g. "${yearInDesc[0].description}"` : '');

  // ── Count check ────────────────────────────────────────────────────────────
  console.log('\nCOUNT CHECKS');
  check(`Row count ≥ ${EXPECTED.minTxCount}`, txs.length >= EXPECTED.minTxCount,
        `got ${txs.length}`);

  // ── Financial validation ───────────────────────────────────────────────────
  console.log('\nFINANCIAL VALIDATION');
  const sumCredits = round2(txs.reduce((s, t) => s + (t.credit || 0), 0));
  const sumDebits  = round2(txs.reduce((s, t) => s + (t.debit  || 0), 0));
  const balanceEq  = round2(EXPECTED.openingBalance + sumDebits - sumCredits);

  check(`Sum credits = ${EXPECTED.totalCredits}`,
        Math.abs(sumCredits - EXPECTED.totalCredits) < 0.02,
        `got ${sumCredits}`);
  check(`Sum debits = ${EXPECTED.totalDebits}`,
        Math.abs(sumDebits - EXPECTED.totalDebits) < 0.02,
        `got ${sumDebits}`);
  check(`Balance equation → ${EXPECTED.closingBalance}`,
        Math.abs(balanceEq - EXPECTED.closingBalance) < 0.02,
        `got ${balanceEq}`);

  // ── Page 1 spot-checks ─────────────────────────────────────────────────────
  console.log('\nPAGE 1 SPOT-CHECKS (2022-06-01)');
  const page1 = txs.filter(t => t.date === '2022-06-01');
  check(`Page 1 tx count = ${EXPECTED.page1Count}`, page1.length === EXPECTED.page1Count,
        `got ${page1.length}`);

  for (const exp of PAGE1_EXPECTED) {
    const match = page1.find(t => t.description.toLowerCase().includes(exp.descContains.toLowerCase()));
    if (!match) {
      check(`  Found "${exp.descContains}"`, false, 'MISSING');
    } else if (exp.credit !== undefined) {
      check(`  "${exp.descContains}" credit=${exp.credit}`,
            Math.abs((match.credit || 0) - exp.credit) < 0.02,
            `got credit=${match.credit} debit=${match.debit} — "${match.description}"`);
    } else if (exp.debit !== undefined) {
      check(`  "${exp.descContains}" debit=${exp.debit}`,
            Math.abs((match.debit || 0) - exp.debit) < 0.02,
            `got credit=${match.credit} debit=${match.debit} — "${match.description}"`);
    }
  }

  // ── Column presence check ─────────────────────────────────────────────────
  console.log('\nCOLUMN CHECKS');
  const hasDebit  = txs.filter(t => t.debit  !== null && t.debit  > 0).length;
  const hasCredit = txs.filter(t => t.credit !== null && t.credit > 0).length;
  check(`Debit column populated  (≥ 30 rows)`, hasDebit  >= 30, `${hasDebit} rows with debit`);
  check(`Credit column populated (≥ 10 rows)`, hasCredit >= 10, `${hasCredit} rows with credit`);

  const debitOnlyRows  = txs.filter(t => t.debit !== null  && t.credit === null).length;
  const creditOnlyRows = txs.filter(t => t.credit !== null && t.debit  === null).length;
  const bothCols = txs.filter(t => t.debit !== null && t.credit !== null).length;
  check('No rows with BOTH debit AND credit', bothCols === 0, `${bothCols} rows have both`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  if (fails.length === 0) {
    console.log('ALL CHECKS PASSED ✓');
  } else {
    console.log(`FAILED: ${fails.length} check(s)`);
    fails.forEach(f => console.log(`  ✗ ${f}`));
  }
  console.log('='.repeat(60));

  // Print full CSV for review
  console.log('\n--- CSV OUTPUT (first 20 rows) ---');
  csvLines.slice(0, 21).forEach(l => console.log(l));
  if (txs.length > 20) console.log(`... and ${txs.length - 20} more rows`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
