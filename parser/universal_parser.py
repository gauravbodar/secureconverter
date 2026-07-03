"""
Universal Australian Bank Statement Parser
==========================================
Works on any bank by reading column positions from the document's own
header row, never from hardcoded coordinates.

Supported so far:
  - CBA Transaction Summary (v1.0.5)
  - CBA Your Statement (Business Transaction Account)
  - NAB Business Everyday Account

Adding a new bank = zero code changes IF its header row contains any of:
  Date, Particulars, Transaction, Details, Debit, Debits, Credit, Credits,
  Withdrawal, Withdrawals, Balance
"""

import pdfplumber
import csv
import io
import re
from datetime import datetime

# ── Column vocabulary ───────────────────────────────────────────────────────
COLUMN_ALIASES = {
    'date':        ['Date'],
    'description': ['Particulars', 'Transaction', 'Details', 'Description',
                    'Narration', 'Narrative'],
    'debit':       ['Debit', 'Debits', 'Withdrawal', 'Withdrawals'],
    'credit':      ['Credit', 'Credits', 'Deposit', 'Deposits'],
    'balance':     ['Balance'],
    # Single signed amount column (CBA Transaction Summary style)
    'amount':      ['Amount'],
}
ALL_HEADER_WORDS = {alias for aliases in COLUMN_ALIASES.values() for alias in aliases}

# ── Rows that are never transactions ────────────────────────────────────────
SKIP_FIRST_WORDS = {
    'Brought', 'Carried', 'Important', 'TRANSACTION', 'Explanatory',
    'Summary', 'Please', 'Identifying', 'Government', 'From', 'Last',
    'Note:', 'Name:',
}
SKIP_EXACT = {
    'OPENING BALANCE', 'CLOSING BALANCE', 'Opening Balance', 'Closing Balance',
}
# Some CBA statements print the marker as "<year> OPENING/CLOSING BALANCE"
# (the year lands on the same row as the marker rather than in the date
# column) — matches any year, not just one hardcoded statement's.
_BALANCE_MARKER_RE = re.compile(r'^\d{4}\s+(OPENING|CLOSING)\s+BALANCE$', re.IGNORECASE)

MONTH_MAP = {
    'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
    'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12',
    'July':'07','June':'06','August':'08','September':'09',
    'October':'10','November':'11','December':'12','January':'01',
    'February':'02','March':'03','April':'04','May':'05',
}

# Longest name first so "June"/"July" aren't truncated to "Jun"/"Jul" when
# checking whether a word STARTS WITH a month name.
_MONTH_KEYS_BY_LENGTH = sorted(set(MONTH_MAP.keys()), key=len, reverse=True)


def _fused_month_prefix(text):
    """
    Some real-world CBA "Your Statement" PDFs render the month name fused
    directly onto the following word with no space in the text layer
    ("MayCANBERRA", "May2024") rather than as its own token, so pdfplumber
    extracts it as a single word. Returns (month_key, remainder) if text
    starts with a month name followed by more characters, else (None, text).
    """
    for key in _MONTH_KEYS_BY_LENGTH:
        if text.startswith(key) and len(text) > len(key):
            return key, text[len(key):]
    return None, text

# ── Dots-only text (NAB visual separator artifact) ──────────────────────────
DOTS_RE = re.compile(r'^[.\s]+$')

# ── NAB "TRANSACTION SUMMARY" fee-breakdown block (bounded, non-transactional) ──
FEE_TABLE_START_RE = re.compile(r'TRANSACTION\s+SUMMARY\s+QUANTITY', re.IGNORECASE)
FEE_TABLE_END_RE   = re.compile(r'Total\s+Fees\s+Charged', re.IGNORECASE)

# ── CBA "Your Statement" closing reconciliation block ───────────────────────
# A two-row footer: a label line, then the four values on their own row
# (e.g. "$4,190.82 CR $162,372.07 $159,711.99 $1,530.74 CR"). Neither row is
# a transaction; the values row has no date and would otherwise misclassify
# into debit/credit/balance zones by raw x-position.
CLOSING_SUMMARY_LABEL_RE = re.compile(
    r'Opening\s+balance\s*-\s*Total\s+debits\s*\+\s*Total\s+credits\s*=\s*Closing\s+balance',
    re.IGNORECASE
)

# ── CBA "Your Statement" debit-interest-rate summary footer (bounded) ──────
# A "Your Debit Interest Rate Summary" label followed by a rate-tier table
# (header row, threshold/percentage rows) — not transactions. Its rows'
# amount-shaped values (credit limit, excess-rate threshold) would otherwise
# be misclassified as debit/credit figures by raw x-position, and its own
# "31 <Month> ..." rows can look like transaction-opening rows. Bracketed
# through to the "Important information:" disclaimer that always follows it.
INTEREST_SUMMARY_START_RE = re.compile(r'Debit\s+Interest\s+Rate\s+Summary', re.IGNORECASE)
INTEREST_SUMMARY_END_RE   = re.compile(r'Important\s+information', re.IGNORECASE)


def detect_columns(page_words):
    """
    Scan page words to find the transaction table header row.
    Returns (header_top, columns_dict) or (None, None).

    columns_dict = {
        'date': {'x0': float, 'left_bound': float, 'right_bound': float,
                 'header_text': str},
        'description': {...},
        ...
    }
    Bounds are used to classify any word to a column by its x-centre.
    """
    # Group words into rows (±3 px snap)
    rows = {}
    for w in page_words:
        key = round(w['top'])
        snapped = next((k for k in rows if abs(k - key) <= 3), None)
        if snapped is None:
            rows[key] = []
            snapped = key
        rows[snapped].append(w)

    for top, row_words in sorted(rows.items()):
        matched = {w['text']: w for w in row_words if w['text'] in ALL_HEADER_WORDS}
        if len(matched) < 2:   # need at least Date + one amount/balance column
            continue

        cols = {}
        for canonical, aliases in COLUMN_ALIASES.items():
            for alias in aliases:
                if alias in matched:
                    cols[canonical] = {
                        'x0': matched[alias]['x0'],
                        'x1': matched[alias]['x1'],
                        'header_text': alias,
                    }
                    break

        if 'date' not in cols or 'balance' not in cols:
            continue   # not a transaction table header

        # Assign inclusive left/right zone boundaries between columns
        sorted_c = sorted(cols.items(), key=lambda x: x[1]['x0'])
        for i, (name, col) in enumerate(sorted_c):
            col['left_bound'] = col['x0'] - 8
            col['right_bound'] = (sorted_c[i + 1][1]['x0'] - 5
                                  if i + 1 < len(sorted_c) else 650)

        return top, cols

    return None, None


def classify_word(word, columns):
    """Return column name for a word based on its x-centre, or None."""
    cx = (word['x0'] + word['x1']) / 2
    for name, col in columns.items():
        if col['left_bound'] <= cx <= col['right_bound']:
            return name
    return None


def parse_amount(text):
    """
    Parse any Australian bank amount string into a float.
    Handles: $1,234.56  -$1,234.56  1,234.56  $1,234.56CR  $1,234.56DR
    Returns: (float_value, is_debit_flag_or_None)
      is_debit_flag: True=debit, False=credit, None=unknown (from signed column)
    """
    if not text:
        return None, None
    t = text.strip()

    # Detect CR/DR suffix fused to number (CBA Your Statement balance style)
    fused = None
    if t.upper().endswith('CR'):
        fused = 'CR'
        t = t[:-2]
    elif t.upper().endswith('DR'):
        fused = 'DR'
        t = t[:-2]

    # Signed prefix
    is_debit = None
    if t.startswith('-'):
        is_debit = True
        t = t[1:]

    # Strip $, commas, spaces
    t = t.lstrip('$').replace(',', '').strip()

    if not t:
        return None, None
    try:
        value = float(t)
    except ValueError:
        return None, None

    # Fused suffix overrides sign
    if fused == 'DR':
        is_debit = True
    elif fused == 'CR':
        is_debit = False

    return value, is_debit


def parse_balance(text, balance_suffix_word=None):
    """
    Parse balance value. text may be '$12,280.28' or '$12,280.28CR'
    balance_suffix_word: optional next word like 'Dr' or 'Cr' (NAB style)
    Returns: (float_value, is_overdraft: bool)
    """
    if not text:
        return None, False

    value, is_debit = parse_amount(text)
    if value is None:
        return None, False

    # Resolve from suffix word if not already resolved
    if is_debit is None and balance_suffix_word:
        s = balance_suffix_word.strip().lower()
        if s == 'dr':
            is_debit = True
        elif s == 'cr':
            is_debit = False

    return value, bool(is_debit)


def parse_date(date_words, fallback_year=None):
    """
    Parse date from list of word-text strings extracted from date column.
    Handles: '01 Jul 2025', '01 Jul', '1 Jun 2022', '1 Jun'
    Returns ISO date string 'YYYY-MM-DD' or None.
    """
    texts = [w.strip() for w in date_words if w.strip()]
    day = month = year = None

    for t in texts:
        if t.isdigit():
            n = int(t)
            if 1 <= n <= 31 and day is None:
                day = f'{n:02d}'
            elif n > 31:
                year = str(n)
        elif t in MONTH_MAP:
            month = MONTH_MAP[t]

    if not (day and month):
        return None

    if not year:
        year = str(fallback_year) if fallback_year else str(datetime.now().year)

    try:
        datetime.strptime(f'{year}-{month}-{day}', '%Y-%m-%d')
        return f'{year}-{month}-{day}'
    except ValueError:
        return None


def group_words_by_row(page_words):
    """Bucket all page words into visual rows (±3 px)."""
    rows = {}
    for w in page_words:
        key = round(w['top'])
        snapped = next((k for k in rows if abs(k - key) <= 3), None)
        if snapped is None:
            rows[key] = []
            snapped = key
        rows[snapped].append(w)
    return sorted(rows.items())


def should_skip_row(row_words, columns):
    """Return True if this row should not produce a transaction."""
    desc_words = [w for w in row_words
                  if classify_word(w, columns) == 'description']
    all_words  = [w for w in row_words
                  if classify_word(w, columns) is not None]

    if not all_words:
        return True

    # Check first meaningful word in description column
    if desc_words:
        first = desc_words[0]['text']
        if first in SKIP_FIRST_WORDS:
            return True

        date_zone = [w for w in row_words if classify_word(w, columns) == 'date']
        has_day   = any(w['text'].isdigit() and 1 <= int(w['text']) <= 31 for w in date_zone)
        has_month = any(w['text'] in MONTH_MAP for w in date_zone)

        # Check combined text of first few words
        desc_texts = [w['text'] for w in desc_words[:3]]
        if has_day and not has_month:
            # Month may be fused onto this word with no space
            # ("May2024 OPENING BALANCE") — strip it so the marker
            # comparison below isn't defeated by the fusion artifact.
            _, desc_texts[0] = _fused_month_prefix(desc_texts[0])
        combined = ' '.join(desc_texts)
        if combined in SKIP_EXACT or _BALANCE_MARKER_RE.match(combined):
            return True

    return False


def is_transaction_open_row(row_words, columns):
    """
    Return True if this row starts a new transaction.
    Criteria: has a day-number word in the date column AND a month name
    somewhere on the same row.
    """
    date_zone = [w for w in row_words
                 if classify_word(w, columns) == 'date']
    desc_zone = [w for w in row_words
                 if classify_word(w, columns) == 'description']

    has_day   = any(w['text'].isdigit() and 1 <= int(w['text']) <= 31
                    for w in date_zone)
    has_month = any(w['text'] in MONTH_MAP
                    for w in date_zone + desc_zone[:2])

    if has_day and not has_month:
        # Month may be fused onto the following word with no space
        # (see _fused_month_prefix) rather than appearing as its own token.
        has_month = any(_fused_month_prefix(w['text'])[0] for w in desc_zone[:2])

    return has_day and has_month


def extract_date_from_row(row_words, columns, fallback_year=None):
    """Pull date column words and parse them."""
    date_words = [w for w in row_words
                  if classify_word(w, columns) == 'date']
    desc_words = [w for w in row_words
                  if classify_word(w, columns) == 'description']
    date_texts = [w['text'] for w in date_words]

    if not any(t in MONTH_MAP for t in date_texts):
        # Month may be fused onto the first description word with no space
        # (see _fused_month_prefix) instead of appearing in the date column.
        for w in desc_words[:2]:
            month_key, _ = _fused_month_prefix(w['text'])
            if month_key:
                date_texts.append(month_key)
                break

    return parse_date(date_texts, fallback_year=fallback_year)


def extract_description_from_row(row_words, columns):
    """Join description column words, skip dot-leader artifacts."""
    date_zone = [w for w in row_words if classify_word(w, columns) == 'date']
    has_day   = any(w['text'].isdigit() and 1 <= int(w['text']) <= 31 for w in date_zone)
    has_month = any(w['text'] in MONTH_MAP for w in date_zone)
    strip_fused_month = has_day and not has_month

    words = sorted(
        (w for w in row_words if classify_word(w, columns) == 'description'),
        key=lambda w: w['x0']
    )
    parts = []
    for i, w in enumerate(words):
        word_text = w['text']
        if i == 0 and strip_fused_month:
            # Month may be fused onto this word with no space
            # ("MayCANBERRA AIRPORT...") — strip it before it leaks into
            # the merchant description text.
            _, word_text = _fused_month_prefix(word_text)
        if DOTS_RE.match(word_text):
            continue
        # Dot-leaders are often fused directly onto a word with no
        # whitespace (e.g. "Canberra.............."), not their own token.
        cleaned = re.sub(r'\.{3,}', '', word_text).strip()
        if cleaned:
            parts.append(cleaned)
    text = ' '.join(parts)
    # Remove "Value Date: DD/MM/YYYY" — it is card-transaction metadata,
    # not part of the merchant description
    text = re.sub(r'\s*Value\s+Date:\s*\d{2}/\d{2}/\d{4}', '', text).strip()
    return text


def extract_amount_from_row(row_words, columns):
    """
    Returns (debit, credit) as float or None.
    Handles single signed amount column and dual debit/credit columns.
    """
    debit_text  = next((w['text'] for w in row_words
                        if classify_word(w, columns) == 'debit'), None)
    credit_text = next((w['text'] for w in row_words
                        if classify_word(w, columns) == 'credit'), None)
    amount_text = next((w['text'] for w in row_words
                        if classify_word(w, columns) == 'amount'), None)

    # Dual column statement
    if debit_text or credit_text:
        d_val, _ = parse_amount(debit_text)  if debit_text  else (None, None)
        c_val, _ = parse_amount(credit_text) if credit_text else (None, None)
        return d_val, c_val

    # Single signed column (CBA Transaction Summary)
    if amount_text:
        val, is_debit = parse_amount(amount_text)
        if val is None:
            return None, None
        if is_debit:
            return val, None
        return None, val

    return None, None


def extract_balance_from_row(row_words, columns):
    """
    Returns (balance_float, is_overdraft) or (None, False).
    Handles fused CR/DR suffix and separate Dr/Cr word (NAB).
    """
    bal_words = sorted(
        (w for w in row_words if classify_word(w, columns) == 'balance'),
        key=lambda w: w['x0']
    )
    if not bal_words:
        return None, False

    bal_text  = bal_words[0]['text']
    suffix_w  = bal_words[1]['text'] if len(bal_words) > 1 else None

    return parse_balance(bal_text, suffix_w)


# Matches full 4-digit years in date context (never store numbers like 2307)
_YEAR_CONTEXT_RE = re.compile(
    r'(?:'
    r'Statement\s+(?:Period|starts|ends|date)[^\d]*?(20\d{2})'   # NAB / CBA header
    r'|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*'
        r'\s+(?:\d{1,2}\s+)?(20\d{2})'                           # "30 Jun 2022"
    r'|(20\d{2})\s+(?:OPENING|Opening)'                           # "2025 OPENING BALANCE"
    r')',
    re.IGNORECASE
)

def extract_document_year(pdf_bytes):
    """
    Pre-scan the first two pages to find the statement year from
    the document header — before any transaction processing.

    Why pre-scan: CBA "Your Statement" never puts a standalone year
    in the date column. The only reliable year source is the statement
    period line in the page header (e.g. "1 Jul 2025 - 30 Sep 2025").

    Returns int year or None.
    """
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages[:2]:
                text = page.extract_text() or ''
                for m in _YEAR_CONTEXT_RE.finditer(text):
                    # Return first matched group that is not None
                    for group in m.groups():
                        if group:
                            year = int(group)
                            if 2000 <= year <= 2050:
                                return year
    except Exception:
        pass
    return None


def parse_pdf(pdf_bytes):
    """
    Main entry point. Accepts raw PDF bytes, returns list of transaction dicts:
    [{'date': 'YYYY-MM-DD', 'description': str,
      'debit': str, 'credit': str, 'balance': str}, ...]
    """
    transactions = []
    current_tx   = None
    current_date = None
    # Track year from full dates (e.g., NAB shows "1 Jun 2022")
    doc_year     = extract_document_year(pdf_bytes)
    current_year = doc_year if doc_year else datetime.now().year

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            words = page.extract_words(x_tolerance=3, y_tolerance=3)

            table_top, columns = detect_columns(words)
            if columns is None:
                continue

            # Filter to transaction area only (below header, above footer)
            tx_words = [
                w for w in words
                if w['top'] > table_top + 3
                and w['top'] < page.height - 50
                # Skip barcode / margin artifacts (x0 < 30 on left edge)
                and w['x0'] >= 14
            ]

            # NAB pages may contain a bounded fee-breakdown sub-table
            # (TRANSACTION SUMMARY ... Total Fees Charged) — not transactions.
            in_fee_table = False
            # CBA "Your Statement" pages may contain a bounded debit-interest
            # rate-summary footer table — not transactions.
            in_interest_summary = False
            # CBA "Your Statement" closing reconciliation block: the label
            # row is matched by content, then its values row (no date, no
            # reliable column alignment) is skipped unconditionally.
            skip_next_row = False
            # NAB pages may open with a multi-line "Important" compliance/
            # insurance notice, whose continuation lines don't start with a
            # skip-word themselves — bracket it until real transaction
            # content (a row with its own amount or its own date) resumes.
            in_notice_block = False

            for _, row_words in group_words_by_row(tx_words):
                # Ignore rows with no words in any column
                classified = [w for w in row_words
                              if classify_word(w, columns) is not None]
                if not classified:
                    continue

                row_text_all = ' '.join(w['text'] for w in row_words)

                if skip_next_row:
                    skip_next_row = False
                    continue

                if CLOSING_SUMMARY_LABEL_RE.search(row_text_all):
                    skip_next_row = True
                    continue

                if in_interest_summary:
                    if INTEREST_SUMMARY_END_RE.search(row_text_all):
                        in_interest_summary = False
                    continue

                if INTEREST_SUMMARY_START_RE.search(row_text_all):
                    in_interest_summary = True
                    continue

                if in_fee_table:
                    if FEE_TABLE_END_RE.search(row_text_all):
                        in_fee_table = False
                    continue

                if FEE_TABLE_START_RE.search(row_text_all):
                    # Capture the date before discarding this row — real
                    # transactions often resume later on the same page.
                    date_str = extract_date_from_row(row_words, columns,
                                                      fallback_year=current_year)
                    if date_str:
                        current_date = date_str
                        try:
                            current_year = int(date_str[:4])
                        except (ValueError, TypeError):
                            pass
                    in_fee_table = True
                    continue

                if in_notice_block:
                    # Resume once a row looks like real transaction content
                    # again — disclaimer prose never carries a dollar amount.
                    notice_debit, notice_credit = extract_amount_from_row(row_words, columns)
                    if (notice_debit is None and notice_credit is None
                            and not is_transaction_open_row(row_words, columns)):
                        continue
                    in_notice_block = False

                if should_skip_row(row_words, columns):
                    # Even a skipped row (e.g. "Brought forward") may carry
                    # the day's date prefix — capture it so subsequent
                    # same-day transactions that don't repeat the date
                    # don't lose their only anchor to it.
                    date_str = extract_date_from_row(row_words, columns,
                                                      fallback_year=current_year)
                    if date_str:
                        current_date = date_str
                        try:
                            current_year = int(date_str[:4])
                        except (ValueError, TypeError):
                            pass

                    desc_words = [w for w in row_words
                                  if classify_word(w, columns) == 'description']
                    first_word = desc_words[0]['text'] if desc_words else ''
                    if first_word == 'Important':
                        in_notice_block = True
                    continue

                # ── Does this row open a new transaction? ──────────────────
                opens_new = is_transaction_open_row(row_words, columns)

                if not opens_new:
                    if current_tx is not None:
                        already_complete = (current_tx['debit'] is not None or
                                             current_tx['credit'] is not None)
                        if already_complete:
                            row_debit, row_credit = extract_amount_from_row(row_words, columns)
                            has_row_amount = row_debit is not None or row_credit is not None
                            # CBA's "Value Date: DD/MM/YYYY" line is the one known
                            # legitimate trailing continuation of an already-complete
                            # transaction; it never carries its own amount.
                            is_trailing_metadata = 'Value Date:' in row_text_all
                            if has_row_amount or not is_trailing_metadata:
                                # current_tx already has its amount — this row is a
                                # separate same-day transaction that doesn't repeat
                                # the date column (NAB layout), or the first line of
                                # one wrapped across multiple lines. Either way it
                                # isn't more continuation text for current_tx.
                                opens_new = True
                    elif current_date is not None:
                        # current_tx was cleared at a page boundary (flushed at
                        # the previous page's end-of-page, or discarded after a
                        # "Brought forward" marker was skipped) but we're still
                        # mid-statement — a date has already been seen. NAB
                        # resumes same-day transactions across the break without
                        # repeating the date, so this dateless row is a genuine
                        # transaction continuing onto the new page, not noise.
                        opens_new = True

                if opens_new:
                    # Save previous
                    if current_tx and (current_tx['debit'] or
                                       current_tx['credit'] or
                                       current_tx['balance']):
                        transactions.append(_finalise(current_tx))

                    date_str = extract_date_from_row(row_words, columns,
                                                      fallback_year=current_year)
                    if date_str:
                        current_date = date_str
                        # Extract year for fallback
                        try:
                            current_year = int(date_str[:4])
                        except (ValueError, TypeError):
                            pass
                    else:
                        date_str = current_date  # propagate last seen date

                    desc   = extract_description_from_row(row_words, columns)
                    debit, credit = extract_amount_from_row(row_words, columns)
                    bal, overdraft = extract_balance_from_row(row_words, columns)

                    current_tx = {
                        'date':      date_str or '',
                        'description': desc,
                        'debit':     debit,
                        'credit':    credit,
                        'balance':   bal,
                        'overdraft': overdraft,
                    }

                else:
                    # ── Continuation or amount-on-second-line row ──────────
                    if current_tx is None:
                        continue

                    # Append to description (only if leftmost word is in desc zone)
                    leftmost = min(row_words, key=lambda w: w['x0'])
                    leftmost_col = classify_word(leftmost, columns)
                    if leftmost_col in ('description', 'date'):
                        # Only extend description if no amount yet on this row
                        # AND leftmost x0 >= description column left bound
                        if leftmost['x0'] >= columns['description']['left_bound'] - 5:
                            extra = extract_description_from_row(row_words, columns)
                            if extra:
                                current_tx['description'] += ' ' + extra

                    # Pick up amount if missing on opening row (NAB pattern)
                    if current_tx['debit'] is None and current_tx['credit'] is None:
                        d, c = extract_amount_from_row(row_words, columns)
                        if d is not None or c is not None:
                            current_tx['debit']  = d
                            current_tx['credit'] = c

                    # Pick up balance if missing
                    if current_tx['balance'] is None:
                        bal, overdraft = extract_balance_from_row(row_words, columns)
                        if bal is not None:
                            current_tx['balance']  = bal
                            current_tx['overdraft'] = overdraft

            # End of page — flush current tx
            if current_tx and (current_tx['debit'] or
                               current_tx['credit'] or
                               current_tx['balance']):
                transactions.append(_finalise(current_tx))
                current_tx = None

    return transactions


def _finalise(tx):
    """Convert internal transaction dict to output schema (float | None amounts)."""
    def to_amount(v):
        if v is None:
            return None
        return round(float(v), 2)

    balance = to_amount(tx.get('balance'))
    if balance is not None and tx.get('overdraft'):
        # DR (overdraft) balances are parsed as a positive magnitude plus a
        # separate overdraft flag — apply the sign here, the one place that
        # converts to the final output schema.
        balance = -balance

    return {
        'date':        tx.get('date', ''),
        'description': tx.get('description', '').strip(),
        'debit':       to_amount(tx.get('debit')),
        'credit':      to_amount(tx.get('credit')),
        'balance':     balance,
    }


def parse_to_csv(pdf_bytes):
    """Parse PDF bytes and return UTF-8 CSV string."""
    transactions = parse_pdf(pdf_bytes)
    out = io.StringIO()
    writer = csv.DictWriter(
        out,
        fieldnames=['date', 'description', 'debit', 'credit', 'balance'],
        lineterminator='\r\n'
    )
    writer.writeheader()

    def fmt(v):
        return '' if v is None else f'{v:.2f}'

    for t in transactions:
        writer.writerow({
            'date':        t['date'],
            'description': t['description'],
            'debit':       fmt(t['debit']),
            'credit':      fmt(t['credit']),
            'balance':     fmt(t['balance']),
        })
    return out.getvalue()
