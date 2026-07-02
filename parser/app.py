import io
import os
import re
import pdfplumber
from flask import Flask, request, jsonify

from universal_parser import parse_pdf, parse_amount as _parse_amount_signed

app = Flask(__name__)

PARSER_SECRET = os.environ.get('PARSER_SECRET', '')


def parse_amount(val):
    """Strip $, commas, Dr/Cr suffixes. Return absolute float or None."""
    if not val or not str(val).strip():
        return None
    value, _ = _parse_amount_signed(str(val).strip())
    return abs(value) if value is not None else None


def _signed_balance(magnitude_str, suffix):
    """Apply Dr/overdraft sign to a header-extracted balance magnitude."""
    value = parse_amount(magnitude_str)
    if value is None:
        return None
    if suffix and suffix.strip().upper() == 'DR':
        return -value
    return value


# Some statement formats (e.g. CBA "Your Statement") never print a
# standalone "Opening balance $X" header line — the only place all four
# figures appear together is a closing reconciliation block, usually on the
# last page: a label line followed by a values line in the same order.
# Matched against the full document text with newlines flattened to spaces,
# since the label and values sit on two separate physical lines.
_RECONCILIATION_RE = re.compile(
    r'Opening\s+balance\s*-\s*Total\s+debits\s*\+\s*Total\s+credits\s*=\s*Closing\s+balance'
    r'\s*\$?([\d,]+\.?\d*)\s*(CR|DR)?\s+'
    r'\$?([\d,]+\.?\d*)\s+'
    r'\$?([\d,]+\.?\d*)\s+'
    r'\$?([\d,]+\.?\d*)\s*(CR|DR)?',
    re.IGNORECASE
)


def extract_header_info(pdf):
    """Extract account metadata. Balance/credit/debit fields are searched
    case-insensitively across the whole document, since some formats only
    print them on a page other than the first (e.g. a closing summary)."""
    text = pdf.pages[0].extract_text() or ''
    full_text = '\n'.join((page.extract_text() or '') for page in pdf.pages)
    info = {}

    ob = re.search(r'Opening\s+balance\s+\$?([\d,]+\.?\d*)\s*(CR|DR)?', full_text, re.IGNORECASE)
    cb = re.search(r'Closing\s+balance\s+\$?([\d,]+\.?\d*)\s*(CR|DR)?', full_text, re.IGNORECASE)
    tc = re.search(r'Total\s+credits\s+\$?([\d,]+\.?\d*)', full_text, re.IGNORECASE)
    td = re.search(r'Total\s+debits\s+\$?([\d,]+\.?\d*)', full_text, re.IGNORECASE)

    info['openingBalance'] = _signed_balance(ob.group(1), ob.group(2)) if ob else None
    info['closingBalance'] = _signed_balance(cb.group(1), cb.group(2)) if cb else None
    info['totalCredits']   = parse_amount(tc.group(1)) if tc else None
    info['totalDebits']    = parse_amount(td.group(1)) if td else None

    # Fall back to the reconciliation block for whichever fields the simple
    # single-line patterns didn't find (never overrides a value already found).
    if None in (info['openingBalance'], info['closingBalance'],
                info['totalCredits'], info['totalDebits']):
        rec = _RECONCILIATION_RE.search(full_text.replace('\n', ' '))
        if rec:
            if info['openingBalance'] is None:
                info['openingBalance'] = _signed_balance(rec.group(1), rec.group(2))
            if info['totalDebits'] is None:
                info['totalDebits'] = parse_amount(rec.group(3))
            if info['totalCredits'] is None:
                info['totalCredits'] = parse_amount(rec.group(4))
            if info['closingBalance'] is None:
                info['closingBalance'] = _signed_balance(rec.group(5), rec.group(6))

    bsb = re.search(r'BSB\s+(?:number\s+)?([\d-]+)', text)
    acc = re.search(r'Account\s+number\s+([\d-]+)', text)
    info['bsb'] = bsb.group(1) if bsb else ''
    info['accountNumber'] = acc.group(1) if acc else ''
    holder = re.search(r'((?:[A-Z][A-Z\s&]+){2,})\n', text)
    info['accountName'] = holder.group(1).strip() if holder else ''
    sf = re.search(r'Statement starts\s+(\d+\s+\w+\s+\d{4})', text)
    st = re.search(r'Statement ends\s+(\d+\s+\w+\s+\d{4})', text)
    info['periodFrom'] = sf.group(1) if sf else ''
    info['periodTo']   = st.group(1) if st else ''
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

def compute_balance_valid(opening_balance, sum_debits, sum_credits, closing_balance, tolerance=0.05):
    """
    Reconcile a statement's closing balance from its opening balance and
    transaction sums. A debit decreases the running balance, a credit
    increases it. Returns (computed_closing_balance, is_valid).
    """
    ob = opening_balance or 0
    cb = closing_balance or 0
    computed_close = round(ob - sum_debits + sum_credits, 2)
    return computed_close, abs(computed_close - cb) < tolerance


def detect_bank(pdf_bytes):
    """Best-effort bank name from first page text."""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = pdf.pages[0].extract_text() or ''
        if 'Commonwealth Bank' in text or 'CommBank' in text:
            return 'CBA'
        if 'National Australia Bank' in text or 'NAB' in text:
            return 'NAB'
        if 'Westpac' in text:
            return 'Westpac'
        if 'ANZ' in text:
            return 'ANZ'
    except Exception:
        pass
    return 'Unknown'


@app.route('/health')
def health():
    return jsonify({'status': 'ok'}), 200


@app.route('/page-count', methods=['POST'])
def page_count():
    """Returns the number of pages in the uploaded PDF without parsing transactions."""
    if PARSER_SECRET and request.headers.get('X-Secret') != PARSER_SECRET:
        return jsonify({'error': 'Unauthorized'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    pdf_file = request.files['file']
    try:
        with pdfplumber.open(pdf_file) as pdf:
            count = len(pdf.pages)
        return jsonify({'pageCount': count}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/debug', methods=['POST'])
def debug():
    """Returns word positions from page 2 — used to calibrate column boundaries."""
    secret = request.headers.get('X-Secret', '')
    if secret != os.environ.get('PARSER_SECRET', ''):
        return jsonify({'error': 'Unauthorized'}), 401

    pdf_file = request.files.get('file')
    if not pdf_file:
        return jsonify({'error': 'No file'}), 400

    with pdfplumber.open(pdf_file) as pdf:
        page = pdf.pages[1] if len(pdf.pages) > 1 else pdf.pages[0]
        words = page.extract_words(x_tolerance=3, y_tolerance=3)
        return jsonify([
            {'text': w['text'], 'x0': round(float(w['x0'])), 'top': round(float(w['top']))}
            for w in words[:100]
        ])


@app.route('/parse', methods=['POST'])
def parse():
    if PARSER_SECRET and request.headers.get('X-Secret') != PARSER_SECRET:
        return jsonify({'error': 'Unauthorized'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    pdf_file = request.files['file']
    pdf_bytes = pdf_file.read()
    transactions = []
    header_info = {}

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            header_info = extract_header_info(pdf)
            page_count_val = len(pdf.pages)

        def to_float(s):
            return float(s) if s not in (None, '') else None

        for t in parse_pdf(pdf_bytes):
            transactions.append({
                'date':        t.get('date') or None,
                'description': t.get('description', ''),
                'debit':       to_float(t.get('debit')),
                'credit':      to_float(t.get('credit')),
                'balance':     to_float(t.get('balance')),
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if len(transactions) == 0:
        return jsonify({
            'success': False,
            'error': 'no_transactions_found',
            'code': 'PARSE_EMPTY',
            'detail': 'Statement parsed but no transactions detected.',
        }), 422

    sum_credits = round(sum(t['credit'] or 0 for t in transactions), 2)
    sum_debits  = round(sum(t['debit']  or 0 for t in transactions), 2)
    _, balance_valid = compute_balance_valid(
        header_info.get('openingBalance'), sum_debits, sum_credits,
        header_info.get('closingBalance')
    )

    return jsonify({
        'success':       True,
        'bank':          header_info.get('bank'),
        'bankCode':      detect_bank(pdf_bytes),
        'accountName':   header_info.get('accountName'),
        'accountNumber': header_info.get('accountNumber'),
        'bsb':           header_info.get('bsb'),
        'pageCount':     page_count_val,
        'rowCount':      len(transactions),
        'statementPeriod': {
            'from': header_info.get('periodFrom'),
            'to':   header_info.get('periodTo'),
        },
        'openingBalance': header_info.get('openingBalance'),
        'closingBalance': header_info.get('closingBalance'),
        'validation': {
            'sumCredits':       sum_credits,
            'sumDebits':        sum_debits,
            'balanceChecks':    balance_valid,
            'transactionCount': len(transactions),
        },
        'transactions': transactions,
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
