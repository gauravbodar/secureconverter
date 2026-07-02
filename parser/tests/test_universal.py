"""
Test suite for universal_parser.py
Run from parser/ directory: python3 -m pytest tests/test_universal.py -v
"""
import pytest, csv, io, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from universal_parser import parse_pdf, parse_to_csv, extract_document_year

FIXTURES = {
    'cba_summary':   'tests/fixtures/cba_transaction_summary.pdf',
    'cba_statement': 'tests/fixtures/cba_your_statement.pdf',
    'nab_business':  'tests/fixtures/nab_business.pdf',
}

def load(key):
    with open(FIXTURES[key], 'rb') as f:
        return f.read()


# ── Shared contract checks applied to every statement ───────────────────────

def assert_contract(txns, label):
    """Every transaction must conform to the output schema."""
    assert len(txns) > 0, f"{label}: no transactions returned"
    for i, t in enumerate(txns):
        assert set(t.keys()) == {'date','description','debit','credit','balance'}, \
            f"{label} row {i}: wrong keys {t.keys()}"
        assert isinstance(t['description'], str), \
            f"{label} row {i}: description not str"
        for field in ['debit','credit','balance']:
            v = t[field]
            assert v is None or isinstance(v, float), \
                f"{label} row {i}: {field}={repr(v)} must be float|None"
        if t['date']:
            assert len(t['date']) == 10 and t['date'][4] == '-' and t['date'][7] == '-', \
                f"{label} row {i}: date {t['date']!r} not YYYY-MM-DD"


# ── CBA Transaction Summary ──────────────────────────────────────────────────

class TestCBATransactionSummary:
    def setup_method(self):
        self.pdf   = load('cba_summary')
        self.txns  = parse_pdf(self.pdf)

    def test_contract(self):
        assert_contract(self.txns, 'CBA-Summary')

    def test_document_year(self):
        assert extract_document_year(self.pdf) == 2026

    def test_row_count(self):
        assert len(self.txns) == 18, \
            f"Expected 18, got {len(self.txns)}"

    def test_all_dates_correct_year(self):
        years = {t['date'][:4] for t in self.txns if t['date']}
        assert years == {'2026'}, f"Wrong years: {years}"

    def test_first_transaction(self):
        t = self.txns[0]
        assert t['date']   == '2026-06-06'
        assert t['debit']  is None
        assert abs(t['credit']  - 833.60) < 0.01
        assert abs(t['balance'] - 6409.30) < 0.01

    def test_last_transaction(self):
        t = self.txns[-1]
        assert t['date'] == '2026-06-19'
        assert abs(t['debit']   - 15.00)  < 0.01
        assert t['credit'] is None
        assert abs(t['balance'] - 364.93) < 0.01

    def test_debit_rows_present(self):
        debits = [t for t in self.txns if t['debit'] is not None]
        assert len(debits) > 0

    def test_credit_rows_present(self):
        credits = [t for t in self.txns if t['credit'] is not None]
        assert len(credits) > 0

    def test_no_footer_bleed(self):
        for t in self.txns:
            assert "haven't" not in t['description']
            assert 'commbank.com.au' not in t['description'].lower()
            assert 'cleared' not in t['description'].lower()

    def test_no_dot_artifacts(self):
        for t in self.txns:
            assert '......' not in t['description']

    def test_balance_chain(self):
        """Each balance = prev_balance - debit + credit (within 1 cent)."""
        for i in range(1, len(self.txns)):
            prev = self.txns[i-1]['balance']
            curr = self.txns[i]
            if prev is None or curr['balance'] is None:
                continue
            d = curr['debit']  or 0.0
            c = curr['credit'] or 0.0
            expected = round(prev - d + c, 2)
            assert abs(expected - curr['balance']) < 0.02, \
                f"Balance chain broken at row {i}: " \
                f"{prev} - {d} + {c} = {expected}, got {curr['balance']}"

    def test_csv_shape(self):
        csv_str = parse_to_csv(self.pdf)
        rows = list(csv.DictReader(io.StringIO(csv_str)))
        assert len(rows) == 18
        assert set(rows[0].keys()) == {'date','description','debit','credit','balance'}


# ── CBA Your Statement (Business Transaction Account, 10 pages) ──────────────

class TestCBAYourStatement:
    def setup_method(self):
        self.pdf  = load('cba_statement')
        self.txns = parse_pdf(self.pdf)

    def test_contract(self):
        assert_contract(self.txns, 'CBA-YourStatement')

    def test_document_year(self):
        assert extract_document_year(self.pdf) == 2025

    def test_row_count(self):
        assert len(self.txns) >= 100, \
            f"Expected 100+, got {len(self.txns)}"

    def test_all_dates_correct_year(self):
        years = {t['date'][:4] for t in self.txns if t['date']}
        assert '2026' not in years, f"Current-year fallback detected: {years}"
        assert '2025' in years or '2024' in years, \
            f"No statement year found: {years}"

    def test_no_2307_year(self):
        """2307 is a store number, never a year."""
        years = {t['date'][:4] for t in self.txns if t['date']}
        assert '2307' not in years, "Store number 2307 was parsed as year"

    def test_opening_balance_not_a_transaction(self):
        assert not any(
            'OPENING' in (t['description'] or '').upper()
            and t['debit'] is None and t['credit'] is None
            for t in self.txns
        )

    def test_closing_balance_approximately_correct(self):
        # Statement closing balance = $1,530.74
        last_bal = next(
            (t['balance'] for t in reversed(self.txns) if t['balance']),
            None
        )
        assert last_bal is not None
        assert abs(last_bal - 1530.74) < 5.0, \
            f"Closing balance {last_bal} far from expected 1530.74"

    def test_no_barcode_artifacts(self):
        for t in self.txns:
            assert 'ZZ258R3' not in (t['description'] or '')
            assert '3R852ZZ' not in (t['description'] or '')

    def test_no_value_date_in_description(self):
        for t in self.txns:
            assert 'Value Date:' not in (t['description'] or ''), \
                f"Value Date metadata leaked: {t['description']}"

    def test_debit_and_credit_separate(self):
        debits  = [t for t in self.txns if t['debit']  is not None]
        credits = [t for t in self.txns if t['credit'] is not None]
        assert len(debits)  > 0
        assert len(credits) > 0

    def test_amounts_never_both_set(self):
        both = [t for t in self.txns
                if t['debit'] is not None and t['credit'] is not None]
        assert len(both) == 0, \
            f"{len(both)} rows have both debit and credit set"


# ── NAB Business Everyday Account (5 pages) ──────────────────────────────────

class TestNABBusiness:
    def setup_method(self):
        self.pdf  = load('nab_business')
        self.txns = parse_pdf(self.pdf)

    def test_contract(self):
        assert_contract(self.txns, 'NAB-Business')

    def test_document_year(self):
        assert extract_document_year(self.pdf) == 2022

    def test_row_count(self):
        assert len(self.txns) >= 40, \
            f"Expected 40+, got {len(self.txns)}"

    def test_all_dates_correct_year(self):
        years = {t['date'][:4] for t in self.txns if t['date']}
        assert years == {'2022'}, f"Wrong years: {years}"

    def test_no_brought_carried_forward(self):
        for t in self.txns:
            desc = (t['description'] or '').lower()
            assert 'brought forward' not in desc
            assert 'carried forward' not in desc

    def test_no_important_notice(self):
        for t in self.txns:
            desc = (t['description'] or '').lower()
            assert 'loan agreement' not in desc
            assert 'moneysmart' not in desc

    def test_no_dot_artifacts(self):
        for t in self.txns:
            assert '......' not in (t['description'] or '')

    def test_gaurav_bodar_credit_present(self):
        # 6 Jun 2022: Gaurav Bodar credit of $5,000
        matches = [t for t in self.txns
                   if 'Gaurav' in (t['description'] or '')
                   or 'GAURAV' in (t['description'] or '')]
        credits = [t for t in matches if t['credit'] is not None]
        assert len(credits) > 0, "Gaurav Bodar $5,000 credit not found"

    def test_debit_and_credit_separate(self):
        debits  = [t for t in self.txns if t['debit']  is not None]
        credits = [t for t in self.txns if t['credit'] is not None]
        assert len(debits)  > 0
        assert len(credits) > 0

    def test_amounts_never_both_set(self):
        both = [t for t in self.txns
                if t['debit'] is not None and t['credit'] is not None]
        assert len(both) == 0, \
            f"{len(both)} rows have both debit and credit set"

    def test_no_transaction_fee_summary(self):
        # The 30 Jun fee summary table should not appear as transactions
        for t in self.txns:
            desc = (t['description'] or '').upper()
            assert 'EXPRESS BUSINESS DEP' not in desc
            assert 'FLAT MONTHLY FEE' not in desc
