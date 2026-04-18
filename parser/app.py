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

@app.route('/health')
def health():
    return jsonify({'status': 'ok'}), 200

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
