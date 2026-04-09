/**
 * Bank Statement PDF Parser — v2
 *
 * PATH A — CBA: Text-pattern parsing.
 *   CBA embeds the debit/credit direction in the position of the $ sign:
 *     DEBIT:   amount BEFORE $   →  "90.34 $"
 *     CREDIT:  $ BEFORE amount   →  "$15.00"
 *     BALANCE: $ + amount + CR/DR → "$4,100.48 CR"
 *   This is determinable from flat text alone — no coordinates needed.
 *
 * PATH B — NAB: Coordinate-based parsing via pdfjs-dist.
 *   NAB amounts are plain positive numbers in either a Debits or Credits
 *   column.  Direction cannot be inferred from text alone.  pdfjs-dist
 *   getTextContent() provides X coordinates, which are compared to the
 *   positions of the "Debits" / "Credits" / "Balance" column headers.
 *   Falls back to balance-delta if column headers cannot be located.
 *
 * PATH C — Generic (Westpac / ANZ / unknown): best-effort text heuristic.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ─── pdfjs-dist — lazy-loaded for NAB coordinate extraction ──────────────────

let _pdfjs = null;

async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  try {
    const mod = await import('pdfjs-dist');
    _pdfjs = mod.default ?? mod;
    if (_pdfjs.GlobalWorkerOptions) {
      _pdfjs.GlobalWorkerOptions.workerSrc = ''; // run inline — no worker in Node.js
    }
  } catch (err) {
    console.warn('[pdf-parser] pdfjs-dist unavailable:', err.message);
    _pdfjs = null;
  }
  return _pdfjs;
}

// ─── Bank detection ───────────────────────────────────────────────────────────

function detectBank(text) {
  const sample = text.slice(0, 3000);
  const upper  = sample.toUpperCase();

  // CBA checked first — "Card xx" and BSB "06 2915" are distinctive markers
  if (
    upper.includes('COMMONWEALTH BANK') ||
    upper.includes('COMMBANK') ||
    /06 2915/.test(sample) ||
    /Card xx/i.test(sample)
  ) return 'cba';

  if (
    upper.includes('NATIONAL AUSTRALIA BANK') ||
    upper.includes('NAB.COM.AU') ||
    /\bNAB\b/.test(upper)
  ) return 'nab';

  if (upper.includes('WESTPAC')) return 'westpac';
  if (upper.includes('AUSTRALIA AND NEW ZEALAND BANKING') || /\bANZ\b/.test(upper)) return 'anz';

  return 'generic';
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;

/**
 * Normalise a raw date string to DD/MM/YYYY.
 * Handles DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY inputs.
 */
function normDate(raw) {
  const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return raw.trim();
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${yyyy}`;
}

/**
 * Strip $, commas, and trailing Dr/CR/DR — return a plain decimal string.
 * e.g. "$1,684.03 CR" → "1684.03"
 */
function cleanAmt(raw) {
  return String(raw)
    .replace(/[$,]/g, '')
    .replace(/\s*(DR|CR|Dr)\s*$/i, '')
    .trim();
}

// ─── PATH A: CBA ──────────────────────────────────────────────────────────────

function parseCBA(text) {
  const transactions = [];
  let lastTx = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // "Value Date: DD/MM/YYYY" is a continuation sub-line — append to previous tx
    const vd = line.match(/^Value\s+Date:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (vd) {
      if (lastTx) lastTx.description += ` (Value Date: ${vd[1]})`;
      continue;
    }

    // Skip summary rows
    if (/OPENING\s+BALANCE|CLOSING\s+BALANCE/i.test(line)) continue;

    // Must begin with a date
    if (!DATE_RE.test(line)) continue;

    const dm = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+([\s\S]*)/);
    if (!dm) continue;

    const date = normDate(dm[1]);
    let rest   = dm[2];

    // Step 1 — Extract balance: $amount CR/DR (balance always has CR or DR suffix)
    let balance = '';
    const balM = rest.match(/\$\s*([\d,]+\.\d{2})\s*(?:CR|DR)\b/i);
    if (balM) {
      balance = cleanAmt(balM[1]);
      // Remove matched text from rest — use index to handle duplicates safely
      const idx = rest.lastIndexOf(balM[0]);
      rest = (rest.slice(0, idx) + rest.slice(idx + balM[0].length)).trim();
    }

    // Step 2 — Detect direction from $ position in remaining text
    let debit = '', credit = '';

    // DEBIT: number followed by $ (e.g. "90.34 $")
    const debitM = rest.match(/([\d,]+\.\d{2})\s*\$/);
    if (debitM) {
      debit = cleanAmt(debitM[1]);
      rest  = rest.replace(debitM[0], '').trim();
    } else {
      // CREDIT: $ followed by number (e.g. "$15.00")
      const creditM = rest.match(/\$\s*([\d,]+\.\d{2})/);
      if (creditM) {
        credit = cleanAmt(creditM[1]);
        rest   = rest.replace(creditM[0], '').trim();
      }
    }

    const description = rest.replace(/\s+/g, ' ').trim();
    if (!description && !debit && !credit) continue;

    const tx = { date, description, debit, credit, balance };
    transactions.push(tx);
    lastTx = tx;
  }

  return transactions;
}

// ─── PATH B: NAB — coordinate helpers ────────────────────────────────────────

/**
 * Group pdfjs text items into visual lines by Y coordinate proximity.
 * PDF Y axis is bottom-up so higher Y = earlier in the document.
 */
function groupByLine(items, tolerance = 4) {
  const visible = items.filter(i => i.str.trim().length > 0);
  if (!visible.length) return [];

  const sorted = [...visible].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5]; // descending Y (top of page first)
    return Math.abs(dy) > tolerance ? dy : a.transform[4] - b.transform[4]; // tie-break by X
  });

  const lines = [];
  let cur = [sorted[0]], refY = sorted[0].transform[5];

  for (let i = 1; i < sorted.length; i++) {
    const y = sorted[i].transform[5];
    if (Math.abs(y - refY) <= tolerance) {
      cur.push(sorted[i]);
    } else {
      lines.push(cur);
      cur  = [sorted[i]];
      refY = y;
    }
  }
  lines.push(cur);
  return lines;
}

/**
 * Find the NAB table header row containing "Debits" and "Credits".
 * Returns { debits: X, credits: X, balance: X } or null.
 */
function findNABColumnHeaders(lines) {
  for (const line of lines) {
    const texts = line.map(i => i.str.trim().toLowerCase());
    if (texts.includes('debits') && texts.includes('credits')) {
      const cols = {};
      for (const item of line) {
        const key = item.str.trim().toLowerCase();
        if (key === 'debits' || key === 'credits' || key === 'balance') {
          cols[key] = item.transform[4]; // X position of column header
        }
      }
      if (cols.debits && cols.credits) return cols;
    }
  }
  return null;
}

// NAB amount: plain number optionally suffixed with "Dr" (overdraft balance)
const NAB_AMOUNT_RE = /^[\d,]+\.\d{2}(\s*Dr)?$/i;

/** Assign an X position to the nearest column within tolerance. */
function nearestCol(x, cols, tolerance = 55) {
  let best = null, bestDist = Infinity;
  for (const [name, cx] of Object.entries(cols)) {
    const d = Math.abs(x - cx);
    if (d < bestDist && d <= tolerance) { bestDist = d; best = name; }
  }
  return best;
}

// ─── PATH B: NAB — coordinate transaction parser ──────────────────────────────

function parseNABCoordinate(lines, cols) {
  const transactions = [];

  for (const line of lines) {
    const lineStr = line.map(i => i.str).join(' ');

    if (/brought\s+forward|carried\s+forward/i.test(lineStr)) continue;

    // First item on the line must be a date
    if (!DATE_RE.test(line[0]?.str?.trim() ?? '')) continue;

    const date = normDate(line[0].str.trim());
    let debit = '', credit = '', balance = '';
    const descParts = [];

    for (let i = 1; i < line.length; i++) {
      const item = line[i];
      const text = item.str.trim();
      if (!text) continue;

      if (NAB_AMOUNT_RE.test(text)) {
        const col = nearestCol(item.transform[4], cols);
        const amt = cleanAmt(text);
        if      (col === 'debits')  debit   = amt;
        else if (col === 'credits') credit  = amt;
        else if (col === 'balance') balance = amt;
        else    descParts.push(text); // unassigned — include in description
      } else {
        descParts.push(text);
      }
    }

    const description = descParts.join(' ').replace(/\s+/g, ' ').trim();
    if (!description && !debit && !credit) continue;
    transactions.push({ date, description, debit, credit, balance });
  }

  return transactions;
}

// ─── PATH B: NAB — balance-delta fallback ────────────────────────────────────
//
// Used when column headers cannot be found in the coordinate data.
// Compares the running balance between consecutive rows to infer direction.
// Works for most standard accounts.  Less reliable when multiple transactions
// share the same end-of-day balance (NAB sometimes displays this).

function parseNABBalanceDelta(text) {
  const rawRows = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || !DATE_RE.test(line)) continue;
    if (/brought\s+forward|carried\s+forward/i.test(line)) continue;

    const dm = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.*)/);
    if (!dm) continue;

    const date  = normDate(dm[1]);
    const rest  = dm[2];
    const tokens = rest.match(/([\d,]+\.\d{2}(?:\s*Dr)?)/gi) || [];
    if (!tokens.length) continue;

    const balanceRaw  = tokens[tokens.length - 1];
    const balance     = cleanAmt(balanceRaw);
    const amtRaw      = tokens.length >= 2 ? tokens[tokens.length - 2] : '';
    const amount      = amtRaw ? cleanAmt(amtRaw) : '';
    const splitAt     = amtRaw
      ? rest.lastIndexOf(amtRaw)
      : rest.lastIndexOf(tokens[0]);
    const description = rest.slice(0, splitAt).trim().replace(/\s+/g, ' ');

    rawRows.push({ date, description, amount, balance, isOverdraft: /Dr/i.test(balanceRaw) });
  }

  const transactions = [];
  let prevBal = null, prevOverdraft = false;

  for (const row of rawRows) {
    const balNum = parseFloat(row.balance);
    let debit = '', credit = '';

    if (prevBal !== null && row.amount) {
      const delta = balNum - prevBal;
      if (row.isOverdraft || prevOverdraft) {
        // Overdraft: increasing Dr balance = more debt = debit
        if (delta > 0) debit  = row.amount;
        else           credit = row.amount;
      } else {
        if (delta > 0) credit = row.amount;
        else           debit  = row.amount;
      }
    } else if (row.amount) {
      debit = row.amount; // first row — no previous balance to compare
    }

    if (row.description || debit || credit) {
      transactions.push({
        date:        row.date,
        description: row.description,
        debit,
        credit,
        balance:     row.balance,
      });
    }

    prevBal      = balNum;
    prevOverdraft = row.isOverdraft;
  }

  return transactions;
}

// ─── PATH B: NAB — main entry ─────────────────────────────────────────────────

async function parseNAB(buffer, flatText) {
  const pdfjs = await getPdfjs();

  if (pdfjs) {
    try {
      const loadTask = pdfjs.getDocument({
        data:             new Uint8Array(buffer),
        useWorkerFetch:   false,
        isEvalSupported:  false,
        useSystemFonts:   true,
        disableFontFace:  true,
      });
      const doc  = await loadTask.promise;

      let cols   = null;
      const allTx = [];

      for (let p = 1; p <= doc.numPages; p++) {
        const page    = await doc.getPage(p);
        const content = await page.getTextContent();
        const lines   = groupByLine(content.items);

        if (!cols) cols = findNABColumnHeaders(lines);
        if (cols)  allTx.push(...parseNABCoordinate(lines, cols));
      }

      if (allTx.length > 0) return allTx;

      console.warn('[pdf-parser] NAB: column headers not found — falling back to balance-delta');
    } catch (err) {
      console.warn('[pdf-parser] NAB coordinate parse failed — falling back to balance-delta:', err.message);
    }
  }

  return parseNABBalanceDelta(flatText);
}

// ─── PATH C: Generic (Westpac / ANZ / unknown) ────────────────────────────────

function parseGeneric(text) {
  const transactions = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || !DATE_RE.test(line)) continue;

    const dm = line.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.*)/);
    if (!dm) continue;

    const date   = normDate(dm[1]);
    const rest   = dm[2];
    const tokens = rest.match(/([\d,]+\.\d{2}(?:\s*(?:Dr|CR|DR))?)/gi) || [];
    if (!tokens.length) continue;

    const balance = cleanAmt(tokens[tokens.length - 1]);
    let debit = '', credit = '';

    if (tokens.length >= 2) {
      const t = tokens[tokens.length - 2];
      if (/CR/i.test(t)) credit = cleanAmt(t);
      else               debit  = cleanAmt(t);
    }

    const splitAt     = tokens.length >= 2
      ? rest.lastIndexOf(tokens[tokens.length - 2])
      : rest.lastIndexOf(tokens[0]);
    const description = rest.slice(0, splitAt).trim().replace(/\s+/g, ' ');

    if (!description && !debit && !credit) continue;
    transactions.push({ date, description, debit, credit, balance });
  }

  return transactions;
}

// ─── CSV serialiser ───────────────────────────────────────────────────────────

function toCSV(rows) {
  const lines = rows.map(({ date, description, debit, credit, balance }) => {
    const desc = /,/.test(description)
      ? `"${description.replace(/"/g, '""')}"`
      : description;
    return `${date},${desc},${debit},${credit},${balance}`;
  });
  return ['Date,Description,Debit,Credit,Balance', ...lines].join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a bank statement PDF buffer and return CSV + metadata.
 * @param {Buffer} buffer
 * @returns {{ csv: string, bank: string, rowCount: number, pageCount: number }}
 */
export async function parsePDFToCSV(buffer) {
  let flatText = '', pageCount = 1;
  try {
    const data = await pdfParse(buffer);
    flatText  = data.text    ?? '';
    pageCount = data.numpages ?? 1;
  } catch (err) {
    throw new Error(`PDF read failed: ${err.message}`);
  }

  const bank = detectBank(flatText);
  let transactions;

  switch (bank) {
    case 'cba':
      transactions = parseCBA(flatText);
      break;
    case 'nab':
      transactions = await parseNAB(buffer, flatText);
      break;
    default:
      transactions = parseGeneric(flatText);
  }

  if (!transactions.length) {
    throw new Error('No transactions found. The PDF may not be a supported bank statement format.');
  }

  return {
    csv:      toCSV(transactions),
    bank,
    rowCount: transactions.length,
    pageCount,
  };
}
