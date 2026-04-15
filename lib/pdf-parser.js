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
    const mod = await import('pdfjs-dist/legacy/build/pdf.js');
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

// Matches "01/07/2025", "1 Jun 2022", "01 Jul 2025", "01 Jul7-ELEVEN" (no \b — CBA has no space between month and description)
const DATE_RE = /^\d{1,2}(?:\/\d{1,2}\/\d{2,4}|\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i;

const MONTH_NUM = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

/**
 * Normalise a raw date string to DD/MM/YYYY.
 * Handles:
 *   DD/MM/YYYY  DD-MM-YYYY  DD/MM/YY
 *   D Mon YYYY  DD Mon YYYY  (NAB / CBA text-month format)
 *   DD Mon      (CBA format without explicit year — year inferred from current year)
 */
function normDate(raw, year = new Date().getFullYear()) {
  const s = raw.trim();

  // Slash/dash numeric: DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const numericM = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (numericM) {
    const [, d, mo, y] = numericM;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${yyyy}`;
  }

  // Text month with year: "1 Jun 2022", "01 Jul 2025", or "1 Jun2022" (no space — pdf-parse artefact)
  const textWithYear = s.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})$/i);
  if (textWithYear) {
    const [, d, mon, y] = textWithYear;
    return `${d.padStart(2, '0')}/${MONTH_NUM[mon.toLowerCase()]}/${y}`;
  }

  // Text month without year: "01 Jul" — use provided year (statement year or current year)
  const textNoYear = s.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
  if (textNoYear) {
    const [, d, mon] = textNoYear;
    return `${d.padStart(2, '0')}/${MONTH_NUM[mon.toLowerCase()]}/${year}`;
  }

  return s; // unrecognised — return as-is
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

  // Extract statement year from header e.g. "Statement Period 1 Jul 2025 - 30 Sep 2025"
  const ym = text.match(/Statement\s+Period[^\d]*(\d{4})/i)
           || text.match(/\d{1,2}\s+\w+\s+(\d{4})\s*[-–]/);
  const statementYear = ym ? parseInt(ym[1]) : new Date().getFullYear();

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // "Value Date: DD/MM/YYYY<amounts>" — CBA puts debit/credit/balance on this line
    // e.g. "Value Date: 29/06/202590.34$$4,100.48CR"
    const vd = line.match(/^Value\s+Date:\s*(\d{2}\/\d{2}\/\d{4})(.*)/i);
    if (vd && lastTx) {
      const amtText = vd[2];
      // Balance is always "$ amount CR/DR" — extract first
      const balM2 = amtText.match(/\$\s*([\d,]+\.\d{2})\s*(?:CR|DR)\b/i);
      if (balM2) lastTx.balance = cleanAmt(balM2[1]);
      // Only set debit/credit if not already assigned by a continuation line
      if (!lastTx.debit && !lastTx.credit) {
        // Remove balance text first to avoid "$449.00$balance" matching as debit
        const amtRest = balM2 ? amtText.replace(balM2[0], '').trim() : amtText;
        const debitM2  = amtRest.match(/([\d,]+\.\d{2})\s*\$/);
        const creditM2 = amtRest.match(/\$\s*([\d,]+\.\d{2})/);
        if (debitM2) lastTx.debit = cleanAmt(debitM2[1]);
        else if (creditM2) lastTx.credit = cleanAmt(creditM2[1]);
      }
      continue;
    }

    // Skip summary rows
    if (/OPENING\s+BALANCE|CLOSING\s+BALANCE/i.test(line)) continue;

    // Continuation line (no date) — pick up amounts for the previous transaction
    if (!DATE_RE.test(line)) {
      if (lastTx && !lastTx.debit && !lastTx.credit) {
        // Remove balance ($ + amount + CR/DR) FIRST so "$6,600.00$balance CR" doesn't
        // make "6,600.00$" look like a debit when it's actually a credit.
        let lineRest = line;
        const balMc = lineRest.match(/\$\s*([\d,]+\.\d{2})\s*(?:CR|DR)\b/i);
        if (balMc) {
          if (!lastTx.balance) lastTx.balance = cleanAmt(balMc[1]);
          lineRest = lineRest.replace(balMc[0], '').trim();
        }
        // DEBIT: number followed by $  |  CREDIT: $ followed by number
        // Position check must happen BEFORE cleanAmt strips the $
        const debitMc  = lineRest.match(/([\d,]+\.\d{2})\s*\$/);
        const creditMc = lineRest.match(/\$\s*([\d,]+\.\d{2})/);
        if (debitMc) lastTx.debit = cleanAmt(debitMc[1]);
        else if (creditMc) lastTx.credit = cleanAmt(creditMc[1]);
      }
      continue;
    }

    // Extract the date token (either DD/MM/YYYY or "DD Mon YYYY" or "DD Mon")
    const dm = line.match(/^(\d{1,2}(?:\/\d{1,2}\/\d{2,4}|\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+\d{4})?))\s*([\s\S]*)/i);
    if (!dm) continue;

    const date = normDate(dm[1], statementYear);
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

// ─── PATH B: NAB — FULL REWRITE (coordinate-based with date inheritance) ─────

/** NAB page-noise patterns — these lines are structural elements, not transactions */
const NAB_NOISE_RE = [
  /^brought\s+forward/i,
  /^carried\s+forward/i,
  /^transaction\s+details\s*\(continued\)/i,
  /^date\s+particulars\s+debits/i,
  /^statement\s+number\s+\d+/i,
  /^nab\s+business\s+everyday\s+account/i,
  /^for\s+further\s+information\s+call/i,
  /^account\s+details\s+bsb/i,
  /^identifying\s+a\s+transaction\s+made/i,
  /^summary\s+of\s+government\s+charges/i,
  /^please\s+note:\s+as\s+at\s+today/i,
  /^national\s+australia\s+bank/i,
  /^nab\.com\.au/i,
  /^\d{3}\/\d{2}\/\d{2}\/[A-Z]/,   // internal codes like "181/72/08/M013491"
  /^\(:[A-Z]{4,}\d*\)/,             // control codes like "(:GERQ1)"
  /^[.\s]+$/,                        // dot-only lines
  /^important\s+as\s+part\s+of/i,   // insurance notice body
  /^account\s+balance\s+summary/i,
  /^opening\s+balance/i,
  /^total\s+credits/i,
  /^total\s+debits/i,
  /^closing\s+balance/i,
  /^statement\s+starts/i,
  /^statement\s+ends/i,
  /^account\s+holder/i,
  /^outlet\s+details/i,
  /^for\s+your\s+information/i,
  /^transaction\s+fees\s+\$/i,
  /^flat\s+monthly\s+fee\s+\$/i,
  /^less\s+free\s+eligible/i,
  /^total\s+fees\s+charged/i,
];

function isNABNoise(lineText) {
  const t = lineText.trim();
  if (!t) return true;
  return NAB_NOISE_RE.some(re => re.test(t));
}

/** Extract statement year from flat text — "Statement starts 1 June 2022" */
function extractNABYear(flatText) {
  const m = flatText.match(/Statement\s+starts?\s+\d+\s+\w+\s+(\d{4})/i)
         || flatText.match(/Statement\s+(?:Period|Ends?)\s+[^\d]*(\d{4})/i);
  return m ? parseInt(m[1]) : new Date().getFullYear();
}

/** Convert NAB date parts to ISO YYYY-MM-DD */
function nabToISO(d, mon, year) {
  const mm = MONTH_NUM[mon.toLowerCase()] ?? '01';
  return `${year}-${mm}-${String(d).padStart(2, '0')}`;
}

/**
 * Try to parse a NAB date from the first 1-3 items of a line.
 * NAB dates appear as "1 Jun 2022" — pdfjs may split into multiple items.
 * Returns { isoDate, consumed } or null.
 */
function tryParseNABDate(items, statementYear) {
  if (!items.length) return null;
  const t0 = items[0].str.trim();

  // "1 Jun 2022" all in one item
  let m = t0.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
  if (m) return { isoDate: nabToISO(m[1], m[2], m[3]), consumed: 1 };

  // "1 Jun" possibly followed by "2022" as next item
  m = t0.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
  if (m) {
    const t1 = items[1]?.str?.trim() ?? '';
    if (/^\d{4}$/.test(t1)) {
      return { isoDate: nabToISO(m[1], m[2], t1), consumed: 2 };
    }
    return { isoDate: nabToISO(m[1], m[2], statementYear), consumed: 1 };
  }

  return null;
}

/**
 * Find NAB column headers (Date | Particulars | Debits | Credits | Balance).
 * Uses the RIGHT EDGE of each header item (right-aligned amounts align to same edge).
 * Returns { debits, credits, balance } as right-edge X positions, or null.
 */
function findNABColHeaders(lines) {
  for (const line of lines) {
    const texts = line.map(i => i.str.trim().toLowerCase());
    if (texts.includes('debits') && texts.includes('credits')) {
      const cols = {};
      for (const item of line) {
        const key = item.str.trim().toLowerCase();
        if (key === 'debits' || key === 'credits' || key === 'balance') {
          cols[key] = item.transform[4] + (item.width || 0); // right edge
        }
      }
      if (cols.debits && cols.credits) {
        console.log(`[NAB] Column right-edges — Debits: ${cols.debits}, Credits: ${cols.credits}, Balance: ${cols.balance}`);
        return cols;
      }
    }
  }
  return null;
}

/** NAB amount pattern: plain positive number, optional Dr suffix */
const NAB_NUM_RE = /^[\d,]+\.\d{2}(\s*Dr)?$/i;

/**
 * Classify a number item into debits/credits/balance by comparing its
 * right edge to the column header right edges. Tolerance of 55pts.
 */
function classifyAmtCol(item, cols, tolerance = 55) {
  const rightEdge = item.transform[4] + (item.width || 0);
  let best = null, bestDist = Infinity;
  for (const [name, colX] of Object.entries(cols)) {
    const d = Math.abs(rightEdge - colX);
    if (d < bestDist && d <= tolerance) { bestDist = d; best = name; }
  }
  return best;
}

/**
 * Keyword-based credit/debit override — highest-confidence classification.
 * Applied when x-coordinate placement is ambiguous.
 */
function keywordDirection(desc) {
  if (/NABATM\s+Dep|Coin\s+Deposit|Springbank\s+Rise|Online\s+B\d+.*Linked\s+Acc|Gaurav\s+Bodar/i.test(desc))
    return 'credit';
  if (/^V\d{4}\s|Interest\s+Charged|Account\s+Fees|Service\s+Fee|Transaction\s+Fees|Flat\s+Monthly\s+Fee/i.test(desc))
    return 'debit';
  if (/Internet\s+Transfer|Internet\s+Bpay|EFTPOS|SPD.*AAMI|Bank\s+Guarantee/i.test(desc))
    return 'debit';
  return null;
}

/**
 * Parse one pdfjs line into structured fields.
 * Returns { dateStr, descParts, debit, credit, balance }.
 *
 * X-filter: items with x < 90 are ignored (except date items, which are
 * consumed before this filter runs). This excludes margin reference codes
 * like "044483", "/I", "181" that appear at x≈21.6 in NAB statements.
 */
function parseNABLineItems(items, cols, statementYear) {
  const dateResult = tryParseNABDate(items, statementYear);
  const startIdx = dateResult ? dateResult.consumed : 0;

  const descParts = [];
  let debit = null, credit = null, balance = null;

  for (let i = startIdx; i < items.length; i++) {
    const item = items[i];
    const text = item.str.trim();
    if (!text) continue;

    // Skip margin reference codes (x < 90) — dates are already consumed above
    if (item.transform[4] < 90) continue;

    // Skip dot-only leaders and standalone "Dr"/"Cr" suffix tokens
    if (/^\.{2,}$/.test(text)) continue;
    if (/^(Dr|Cr)$/i.test(text)) continue;

    if (NAB_NUM_RE.test(text)) {
      const col = classifyAmtCol(item, cols);
      const val = parseFloat(text.replace(/[,\s]/g, '').replace(/Dr$/i, ''));
      if      (col === 'debits')  debit   = val;
      else if (col === 'credits') credit  = val;
      else if (col === 'balance') balance = val;
      else descParts.push(text); // unclassified amount — keep as description text
    } else {
      // Strip embedded dot leaders and collapse whitespace
      const cleaned = text.replace(/\.{3,}/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned) descParts.push(cleaned);
    }
  }

  return {
    dateStr:   dateResult?.isoDate ?? null,
    descParts,
    debit,
    credit,
    balance,
  };
}

/**
 * Main NAB transaction builder.
 *
 * Handles:
 *  - Date inheritance: transactions without a date inherit the previous date
 *  - Multi-line descriptions: text-only continuation lines appended to previous tx
 *  - "Important" insurance block: skipped entirely
 *  - TRANSACTION SUMMARY block: skipped entirely (30 Jun fee table)
 *  - All page noise (headers, footers, "Brought/Carried forward"): ignored
 */
function buildNABTransactions(allPageLines, cols, statementYear) {
  const transactions = [];
  let currentDate  = null;
  let currentTx    = null;
  let skipImportant   = false;
  let skipTxSummary   = false;

  function pushTx() {
    if (currentTx && (currentTx.debit !== null || currentTx.credit !== null)) {
      transactions.push(currentTx);
    }
    currentTx = null;
  }

  for (const pageLines of allPageLines) {
    for (const lineItems of pageLines) {
      const lineText = lineItems.map(i => i.str).join(' ').trim();

      // Skip structural noise
      if (isNABNoise(lineText)) continue;

      // Detect start of 30 Jun TRANSACTION SUMMARY fee table
      if (/TRANSACTION\s+SUMMARY/i.test(lineText)) {
        skipTxSummary = true;
        continue;
      }

      // In summary block — exit only when we hit a line with amounts but NO $ prefix
      // (real NAB transaction amounts never use $ prefix; the summary block does)
      if (skipTxSummary) {
        const hasNABAmount = /(?<!\$|\d)[\d,]+\.\d{2}(?!\w)/.test(lineText) &&
                             !/\$[\d,]+/.test(lineText);
        if (hasNABAmount) {
          skipTxSummary = false;
          // fall through to process this line as a real transaction
        } else {
          continue;
        }
      }

      const { dateStr, descParts, debit, credit, balance } =
        parseNABLineItems(lineItems, cols, statementYear);
      const desc = descParts.join(' ').replace(/\s+/g, ' ').trim();

      // In "Important" insurance-notice skip mode — exit on first line with amounts
      if (skipImportant) {
        if (debit !== null || credit !== null) {
          skipImportant = false;
          // fall through to process this line
        } else {
          continue;
        }
      }

      // Skip "Brought forward" / "Carried forward" even when they carry a date.
      // Still update currentDate so subsequent inherited-date lines work correctly.
      if (/brought\s+forward|carried\s+forward/i.test(desc)) {
        if (dateStr) currentDate = dateStr;
        continue;
      }

      if (dateStr) {
        currentDate = dateStr;

        // "Important" notice block — skip until a real transaction with amounts appears
        if (/^important\b/i.test(desc)) {
          pushTx();
          skipImportant = true;
          continue;
        }

        if (debit !== null || credit !== null) {
          // Single-line transaction: has date AND amounts on the same line
          pushTx();
          currentTx = { date: dateStr, description: desc, debit, credit, balance };
        } else {
          // Date line with no amounts — description spans to next line(s)
          pushTx();
          currentTx = { date: dateStr, description: desc, debit: null, credit: null, balance };
        }

      } else {
        // No date on this line
        if (debit !== null || credit !== null) {
          if (currentTx && currentTx.debit === null && currentTx.credit === null) {
            // Current tx has no amounts yet — this line completes it
            if (desc) currentTx.description = (currentTx.description + ' ' + desc).trim();
            currentTx.debit   = debit;
            currentTx.credit  = credit;
            currentTx.balance = balance ?? currentTx.balance;
          } else {
            // Current tx already has amounts — new inherited-date transaction
            pushTx();
            currentTx = { date: currentDate, description: desc, debit, credit, balance };
          }
        } else if (desc) {
          // No amounts — could be description continuation OR start of new incomplete tx.
          // Rule: if currentTx already has amounts, this text starts a NEW transaction
          // (its amounts will arrive on the next line). Otherwise it's a continuation.
          if (currentTx && currentTx.debit === null && currentTx.credit === null) {
            currentTx.description = (currentTx.description + ' ' + desc).trim();
          } else {
            // Start a new incomplete transaction (current tx, if any, is already complete)
            pushTx();
            if (currentDate) {
              currentTx = { date: currentDate, description: desc, debit: null, credit: null, balance: null };
            }
            // If no currentDate yet, this is pre-transaction metadata — ignore
          }
        }
      }
    }
  }

  pushTx(); // flush final transaction

  return transactions.filter(tx => tx.debit !== null || tx.credit !== null);
}

// ─── PATH B: NAB — fallback (no pdfjs) ───────────────────────────────────────
//
// Text-only fallback when pdfjs-dist is unavailable or coordinate parse fails.
// Less accurate (no column position info) but better than returning nothing.

function parseNABFallback(text, statementYear) {
  const transactions = [];
  let currentDate = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isNABNoise(line)) continue;
    if (/TRANSACTION\s+SUMMARY/i.test(line)) continue;

    // Try to extract date
    const dm = line.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+(\d{4}))?\s*(.*)/i);
    const date = dm ? nabToISO(dm[1], dm[2], dm[3] || statementYear) : null;
    if (date) currentDate = date;

    const workLine = dm ? dm[4] : line;
    if (!currentDate) continue;

    const tokens = workLine.match(/([\d,]+\.\d{2}(?:\s*Dr)?)/gi) || [];
    if (!tokens.length) continue;

    const balanceRaw = tokens[tokens.length - 1];
    const balance    = parseFloat(cleanAmt(balanceRaw)) || null;
    const amtRaw     = tokens.length >= 2 ? tokens[tokens.length - 2] : tokens[0];
    const amount     = parseFloat(cleanAmt(amtRaw)) || null;

    const splitAt    = workLine.lastIndexOf(amtRaw);
    const description = workLine.slice(0, splitAt).replace(/\.{3,}/g, ' ').replace(/\s+/g, ' ').trim();

    if (!description && !amount) continue;
    // No column info — classify by keyword then default to debit
    const kw = keywordDirection(description);
    const debit  = kw === 'credit' ? null : amount;
    const credit = kw === 'credit' ? amount : null;

    transactions.push({ date: currentDate, description, debit, credit, balance });
  }

  return transactions;
}

// ─── PATH B: NAB — main entry ─────────────────────────────────────────────────

async function parseNAB(buffer, flatText) {
  const statementYear = extractNABYear(flatText);
  console.log(`[NAB] Statement year: ${statementYear}`);

  const pdfjs = await getPdfjs();

  if (pdfjs) {
    try {
      const loadTask = pdfjs.getDocument({
        data:            new Uint8Array(buffer),
        useWorkerFetch:  false,
        isEvalSupported: false,
        useSystemFonts:  true,
        disableFontFace: true,
      });
      const doc = await loadTask.promise;

      // Pass 1 — collect all page lines; find column headers across all pages
      const allPageLines = [];
      let cols = null;

      for (let p = 1; p <= doc.numPages; p++) {
        const page    = await doc.getPage(p);
        const content = await page.getTextContent();
        const lines   = groupByLine(content.items);
        allPageLines.push(lines);
        if (!cols) cols = findNABColHeaders(lines);
      }

      if (!cols) {
        // Scan all pages before giving up
        for (let idx = 0; idx < allPageLines.length && !cols; idx++) {
          cols = findNABColHeaders(allPageLines[idx]);
        }
      }

      if (cols) {
        const txs = buildNABTransactions(allPageLines, cols, statementYear);
        if (txs.length > 0) {
          console.log(`[NAB] Parsed ${txs.length} transactions via coordinate method`);
          return txs;
        }
      }

      console.warn('[NAB] Column headers not found or no transactions — falling back to text');
    } catch (err) {
      console.warn('[NAB] Coordinate parse failed:', err.message, '— falling back to text');
    }
  }

  return parseNABFallback(flatText, statementYear);
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
