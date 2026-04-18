import os
import pdfplumber
import re
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

PARSER_SECRET = os.environ.get('PARSER_SECRET', '')

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

def detect_column_boundaries(page):
    """
    Find the header row containing Date/Particulars/Debits/Credits/Balance
    and return the x-midpoints between columns.
    Works for any bank — no hardcoded positions.
    Returns dict: {date_max, part_max, debt_max, cred_max}
    or None if no header row found on this page.
    """
    words = page.extract_words(x_tolerance=3, y_tolerance=3)

    # Find words that are column headers
    HEADER_WORDS = {
        'date': ['date'],
        'particulars': ['particulars', 'description', 'details', 'transaction'],
        'debits': ['debits', 'debit', 'withdrawals', 'withdrawal'],
        'credits': ['credits', 'credit', 'deposits', 'deposit'],
        'balance': ['balance']
    }

    found = {}
    for word in words:
        t = word['text'].lower().strip('.,: ')
        for col, variants in HEADER_WORDS.items():
            if t in variants and col not in found:
                found[col] = float(word['x0'])

    # Need at least date + one amount column to proceed
    if 'date' not in found or 'balance' not in found:
        return None

    # Build boundaries as midpoints between column header positions
    cols = {}
    if 'date' in found:
        cols['date'] = found['date']
    if 'particulars' in found:
        cols['part'] = found['particulars']
    if 'debits' in found:
        cols['debt'] = found['debits']
    if 'credits' in found:
        cols['cred'] = found['credits']
    if 'balance' in found:
        cols['bal'] = found['balance']

    # Midpoints between adjacent columns
    date_max = (cols.get('date', 0) + cols.get('part', cols.get('date', 0) + 60)) / 2 + 20
    part_max = (cols.get('part', 100) + cols.get('debt', cols.get('part', 100) + 250)) / 2 + 10
    debt_max = (cols.get('debt', 350) + cols.get('cred', cols.get('debt', 350) + 70)) / 2 + 5
    cred_max = (cols.get('cred', 430) + cols.get('bal', cols.get('cred', 430) + 70)) / 2 + 5

    return {
        'date_max': date_max,
        'part_max': part_max,
        'debt_max': debt_max,
        'cred_max': cred_max
    }


def extract_rows_by_position(page, boundaries):
    """
    Extract rows using dynamically detected column boundaries.
    boundaries comes from detect_column_boundaries() — no hardcoding.
    """
    if not boundaries:
        return []

    DATE_MAX = boundaries['date_max']
    PART_MAX = boundaries['part_max']
    DEBT_MAX = boundaries['debt_max']
    CRED_MAX = boundaries['cred_max']

    words = page.extract_words(x_tolerance=3, y_tolerance=3, keep_blank_chars=False)
    if not words:
        return []

    # Group words into lines by y-position
    lines = {}
    for word in words:
        y = round(float(word['top']) / 3) * 3
        if y not in lines:
            lines[y] = []
        lines[y].append(word)

    rows = []
    for y in sorted(lines.keys()):
        line_words = sorted(lines[y], key=lambda w: float(w['x0']))
        date_p, part_p, deb_p, cred_p, bal_p = [], [], [], [], []

        for w in line_words:
            x = float(w['x0'])
            if x < DATE_MAX:
                date_p.append(w['text'])
            elif x < PART_MAX:
                part_p.append(w['text'])
            elif x < DEBT_MAX:
                deb_p.append(w['text'])
            elif x < CRED_MAX:
                cred_p.append(w['text'])
            else:
                bal_p.append(w['text'])

        rows.append([
            ' '.join(date_p),
            ' '.join(part_p),
            ' '.join(deb_p),
            ' '.join(cred_p),
            ' '.join(bal_p),
        ])

    return rows


@app.route('/health')
def health():
    return jsonify({'status': 'ok'}), 200

@app.route('/debug', methods=['POST'])
def debug():
    """Returns word positions from page 1 — used to calibrate column boundaries."""
    secret = request.headers.get('X-Secret', '')
    if secret != os.environ.get('PARSER_SECRET', ''):
        return jsonify({'error': 'Unauthorized'}), 401

    pdf_file = request.files.get('file')
    if not pdf_file:
        return jsonify({'error': 'No file'}), 400

    with pdfplumber.open(pdf_file) as pdf:
        # Use page 2 — it starts immediately with transaction rows, no header noise
        page = pdf.pages[1]
        words = page.extract_words(x_tolerance=3, y_tolerance=3)
        return jsonify([
            {'text': w['text'], 'x0': round(float(w['x0'])), 'top': round(float(w['top']))}
            for w in words[:100]
        ])


@app.route('/parse', methods=['POST'])
def parse():
    # Validate shared secret
    if PARSER_SECRET and request.headers.get('X-Secret') != PARSER_SECRET:
        return jsonify({'error': 'Unauthorized'}), 401

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
            last_known_boundaries = None

            for page in pdf.pages:
                # Detect columns from header row — works for any bank
                boundaries = detect_column_boundaries(page)
                if not boundaries:
                    # No header on this page — reuse last known boundaries
                    boundaries = last_known_boundaries
                else:
                    last_known_boundaries = boundaries

                table = extract_rows_by_position(page, boundaries)
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

                    # Generic description cleaning (all banks)
                    desc = re.sub(r'\.{3,}.*$', '', desc).strip()   # strip trailing dot leaders
                    desc = re.sub(r'^\d{4}\s+', '', desc).strip()    # strip leading year prefix
                    desc = re.sub(r'\s+(Dr|Cr)$', '', desc).strip()  # strip trailing Dr/Cr suffix

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
    sum_credits = round(sum(t['credit'] or 0 for t in transactions), 2)
    sum_debits  = round(sum(t['debit']  or 0 for t in transactions), 2)
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
            'sumCredits': sum_credits,
            'sumDebits': sum_debits,
            'balanceChecks': balance_valid,
            'transactionCount': len(transactions)
        },
        'transactions': transactions
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
