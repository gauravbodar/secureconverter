/**
 * Bank Statement PDF Parser
 * Supports: NAB, Westpac, Commonwealth Bank (CBA), ANZ, and a generic fallback.
 *
 * Strategy:
 * 1. Extract raw text from PDF using pdf-parse
 * 2. Detect bank type from header text
 * 3. Scan lines for transaction rows (lines starting with a recognisable date)
 * 4. Extract Date, Description, Debit, Credit, Balance columns
 * 5. Generate CSV output
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ─── Date pattern variants ────────────────────────────────────────────────────

const DATE_DMY_SLASH  = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;  // 01/01/2026 or 1/1/26
const DATE_DMY_DASH   = /^\d{1,2}-\d{1,2}-\d{2,4}/;     // 01-01-2026
const DATE_MONTH_TEXT = /^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i;
const DATE_ANY = new RegExp(
  `(${DATE_DMY_SLASH.source}|${DATE_DMY_DASH.source}|${DATE_MONTH_TEXT.source})`
);

// ─── Bank detection ───────────────────────────────────────────────────────────

function detectBank(text) {
  const upper = text.slice(0, 3000).toUpperCase();
  if (upper.includes('NATIONAL AUSTRALIA BANK') || upper.includes('NAB.COM.AU') || /\bNAB\b/.test(upper)) return 'nab';
  if (upper.includes('WESTPAC')) return 'westpac';
  if (upper.includes('COMMONWEALTH BANK') || upper.includes('COMMBANK') || upper.includes('NETBANK')) return 'cba';
  if (upper.includes('AUSTRALIA AND NEW ZEALAND BANKING') || /\bANZ\b/.test(upper)) return 'anz';
  return 'generic';
}

// ─── Date normalisation ───────────────────────────────────────────────────────

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normaliseDate(raw) {
  raw = raw.trim();

  // DD Mon YYYY
  const textMatch = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/i);
  if (textMatch) {
    const [, d, m, y] = textMatch;
    const mm = MONTH_MAP[m.toLowerCase()];
    if (mm) return `${y}-${mm}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return raw; // return as-is if unrecognised
}

// ─── Amount normalisation ─────────────────────────────────────────────────────

function normaliseAmount(raw) {
  if (!raw) return '';
  // Remove $, commas, trailing DR/CR labels
  let s = raw.replace(/[$,]/g, '').replace(/\s*(DR|CR)\s*$/i, '').trim();
  if (raw.toUpperCase().endsWith('DR')) s = `-${s}`;
  return s;
}

// ─── Core line parser ─────────────────────────────────────────────────────────

/**
 * Attempt to parse a text line as a bank transaction.
 * Returns { date, description, debit, credit, balance } or null.
 */
function parseLine(line) {
  const trimmed = line.trim();
  if (!DATE_ANY.test(trimmed)) return null;

  // Extract date token (the first word-group that matches a date)
  const dateMatch = trimmed.match(new RegExp(DATE_ANY.source));
  if (!dateMatch) return null;

  const rawDate = dateMatch[0];
  const rest    = trimmed.slice(rawDate.length).trim();

  // Find all money-like tokens from the end of the line
  // Money token: optional - or +, digits, optional comma, dot, 2 decimal places
  const moneyRe = /(-?[\d,]+\.\d{2}(?:\s*(?:DR|CR))?)/gi;
  const tokens = rest.match(moneyRe) || [];

  // The description is what's left after stripping trailing money tokens
  let descEnd = rest.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const lastIdx = rest.lastIndexOf(tokens[i], descEnd);
    if (lastIdx !== -1) descEnd = lastIdx;
  }
  const description = rest.slice(0, descEnd).trim().replace(/\s+/g, ' ');

  // Assign columns based on how many money tokens we found
  let debit = '', credit = '', balance = '';
  if (tokens.length === 1) {
    balance = normaliseAmount(tokens[0]);
  } else if (tokens.length === 2) {
    // Either (debit|credit, balance) depending on bank
    debit   = normaliseAmount(tokens[0]);
    balance = normaliseAmount(tokens[1]);
  } else if (tokens.length >= 3) {
    debit   = normaliseAmount(tokens[0]);
    credit  = normaliseAmount(tokens[1]);
    balance = normaliseAmount(tokens[2]);
  }

  // If debit contains a 'CR' suffix it's actually a credit
  if (tokens[0]?.toUpperCase().includes('CR')) {
    credit = debit.replace(/^-/, '');
    debit  = '';
  }

  if (!description) return null;

  return {
    date:        normaliseDate(rawDate),
    description,
    debit:       debit.startsWith('-') ? debit.slice(1) : debit,
    credit,
    balance,
  };
}

// ─── Bank-specific pre-processors ─────────────────────────────────────────────

function preprocessNAB(lines) {
  // NAB sometimes merges date and description on the same line with spaces
  return lines;
}

function preprocessWestpac(lines) {
  return lines;
}

function preprocessCBA(lines) {
  // CBA often has "Date" and "Amount" columns, sometimes with combined debit/credit column
  return lines;
}

function preprocessANZ(lines) {
  return lines;
}

const preprocessors = {
  nab: preprocessNAB,
  westpac: preprocessWestpac,
  cba: preprocessCBA,
  anz: preprocessANZ,
  generic: (lines) => lines,
};

// ─── Header / footer line filter ─────────────────────────────────────────────

const SKIP_PATTERNS = [
  /^page\s+\d+/i,
  /^account\s+(number|name|type)/i,
  /^(date|description|debit|credit|balance|transaction|opening|closing)\s*$/i,
  /^bsb/i,
  /^\s*$/,
  /^[-=]{3,}/, // separator lines
];

function shouldSkip(line) {
  return SKIP_PATTERNS.some((p) => p.test(line.trim()));
}

// ─── CSV generator ────────────────────────────────────────────────────────────

function toCSV(rows) {
  const header = 'Date,Description,Debit,Credit,Balance\n';
  const body = rows
    .map(({ date, description, debit, credit, balance }) => {
      const desc = description.includes(',') ? `"${description.replace(/"/g, '""')}"` : description;
      return `${date},${desc},${debit},${credit},${balance}`;
    })
    .join('\n');
  return header + body;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a PDF buffer and return CSV string + metadata.
 * @param {Buffer} buffer - Raw PDF file contents
 * @returns {{ csv: string, bank: string, rowCount: number, pageCount: number }}
 */
export async function parsePDFToCSV(buffer) {
  let pdfData;
  try {
    pdfData = await pdfParse(buffer);
  } catch (err) {
    throw new Error(`PDF read failed: ${err.message}`);
  }

  const fullText  = pdfData.text || '';
  const pageCount = pdfData.numpages || 1;
  const bank      = detectBank(fullText);

  const rawLines  = fullText.split('\n');
  const lines     = preprocessors[bank](rawLines);

  const transactions = [];

  for (const line of lines) {
    if (shouldSkip(line)) continue;
    const row = parseLine(line);
    if (row) transactions.push(row);
  }

  if (transactions.length === 0) {
    throw new Error('No transactions found. The PDF may not be a supported bank statement format.');
  }

  return {
    csv:      toCSV(transactions),
    bank,
    rowCount: transactions.length,
    pageCount,
  };
}
