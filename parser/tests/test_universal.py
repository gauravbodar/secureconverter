"""
Test suite for universal_parser.py
Run from parser/ directory: python3 -m pytest tests/test_universal.py -v
"""
import pytest, csv, io, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from universal_parser import parse_pdf, parse_to_csv, extract_document_year

FIXTURES = {
    'cba_summary':      'tests/fixtures/cba_transaction_summary.pdf',
    'cba_statement':    'tests/fixtures/cba_your_statement.pdf',
    'nab_business':     'tests/fixtures/nab_business.pdf',
    'nab_page_break':   'tests/fixtures/nab_multi_page_break.pdf',
    'cba_dr_excursion': 'tests/fixtures/cba_dr_excursion.pdf',
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


def assert_balance_chain(txns, opening_balance, label):
    """
    Walk every transaction in order, verifying the running balance
    reconciles exactly. Some layouts (CBA) print a balance on every row;
    others (NAB) only print it once per same-day group, with several
    undated/no-balance rows in between — so this accumulates debit/credit
    since the last KNOWN balance rather than comparing only the current
    row's own amount against the previous row's balance. A naive
    consecutive-pair check produces false mismatches on NAB even when the
    parser output is fully correct.

    opening_balance must already carry the correct sign (negative for a
    statement that opens in overdraft/Dr). Returns the final running
    balance so callers can assert it matches the statement's closing balance.
    """
    running = opening_balance
    acc_debit = acc_credit = 0.0
    for i, t in enumerate(txns):
        acc_debit  += t['debit']  or 0.0
        acc_credit += t['credit'] or 0.0
        if t['balance'] is not None:
            expected = round(running - acc_debit + acc_credit, 2)
            assert abs(expected - t['balance']) < 0.02, \
                f"{label} row {i}: balance chain broken — " \
                f"{running} - {acc_debit} + {acc_credit} = {expected}, got {t['balance']}"
            running = t['balance']
            acc_debit = acc_credit = 0.0
    return running


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


# ── NAB Business Everyday Account, statement spanning multiple page breaks ──
# Regression coverage for BUG 1: same-day undated transactions immediately
# following a "Brought forward" marker at a page boundary were being dropped.

class TestNABMultiPageBreak:
    def setup_method(self):
        self.pdf  = load('nab_page_break')
        self.txns = parse_pdf(self.pdf)

    def test_contract(self):
        assert_contract(self.txns, 'NAB-PageBreak')

    def test_document_year(self):
        assert extract_document_year(self.pdf) == 2021

    def test_row_count_exact(self):
        # Exact, not >=: a drop and a phantom insertion can numerically
        # cancel out and hide behind a >= check, as happened with BUG 2.
        assert len(self.txns) == 113, f"Expected exactly 113, got {len(self.txns)}"

    def test_all_dates_correct_year(self):
        years = {t['date'][:4] for t in self.txns if t['date']}
        assert years == {'2021'}, f"Wrong years: {years}"

    def test_total_debits_and_credits(self):
        sum_debits  = round(sum(t['debit']  or 0 for t in self.txns), 2)
        sum_credits = round(sum(t['credit'] or 0 for t in self.txns), 2)
        assert abs(sum_debits  - 21485.87) < 0.02, f"sum debits {sum_debits}"
        assert abs(sum_credits - 30762.48) < 0.02, f"sum credits {sum_credits}"

    def test_balance_chain_reconciles_to_closing_balance(self):
        closing = assert_balance_chain(self.txns, opening_balance=-10620.57,
                                        label='NAB-PageBreak')
        assert abs(closing - (-1343.96)) < 0.02, \
            f"Final balance {closing}, expected -1343.96 (1,343.96 Dr)"

    def test_previously_dropped_transactions_present(self):
        # (description substring, amount, date). Substrings match
        # pdfplumber's actual word tokenization of this source PDF, which
        # inserts a space at some line-wrapped merchant names (e.g.
        # "Raz*aksh ardham" rather than "Raz*akshardham") — a property of
        # the source document's text layer, not something this fix touches.
        expected = [
            ('Internet Transfer July2021 Rent', 1173.50, '2021-07-15'),
            ('J.J. Richards',                     94.58, '2021-07-15'),
            ('G61020006762012 Goodman Fielder',   43.45, '2021-07-26'),
            ('Gap Licencefee Support Debit',     281.60, '2021-07-26'),
            ('001-1725289-001 Lease Pay',        690.83, '2021-07-26'),
            ('Raz*aksh',                           19.90, '2021-07-26'),
            ('Aao Jee Indian Bazaa',               23.97, '2021-07-26'),
            ('Supa Iga East Row',                  25.87, '2021-07-26'),
            ('Aldi STO Res - Canberra',            30.65, '2021-07-26'),
        ]
        for substr, amount, date in expected:
            matches = [
                t for t in self.txns
                if substr in t['description'] and t['date'] == date
                and t['debit'] is not None and abs(t['debit'] - amount) < 0.01
            ]
            assert len(matches) == 1, \
                f"Expected exactly one txn matching '{substr}' / {amount} / {date}, " \
                f"found {len(matches)}"

    def test_no_dot_artifacts(self):
        for t in self.txns:
            assert '......' not in (t['description'] or '')

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


# ── CBA "Your Statement" with a DR (overdraft) excursion and closing footer ──
# Regression coverage for BUG 2 (closing reconciliation footer parsed as a
# phantom transaction), BUG 3 ("Trustee" row dropped by an overbroad skip
# word), and BUG 4 (DR balance sign lost).

class TestCBADRExcursion:
    def setup_method(self):
        self.pdf  = load('cba_dr_excursion')
        self.txns = parse_pdf(self.pdf)

    def test_contract(self):
        assert_contract(self.txns, 'CBA-DRExcursion')

    def test_document_year(self):
        assert extract_document_year(self.pdf) == 2025

    def test_row_count_exact(self):
        # Exact, not >=: the specific gap that let BUG 2 (phantom footer
        # row) and BUG 3 (dropped Trustee row) both through undetected —
        # a drop and a phantom insertion cancelled out under a >=100 check.
        assert len(self.txns) == 177, f"Expected exactly 177, got {len(self.txns)}"

    def test_total_debits_and_credits(self):
        sum_debits  = round(sum(t['debit']  or 0 for t in self.txns), 2)
        sum_credits = round(sum(t['credit'] or 0 for t in self.txns), 2)
        assert abs(sum_debits  - 162372.07) < 0.02, f"sum debits {sum_debits}"
        assert abs(sum_credits - 159711.99) < 0.02, f"sum credits {sum_credits}"

    def test_balance_chain_reconciles_to_closing_balance(self):
        closing = assert_balance_chain(self.txns, opening_balance=4190.82,
                                        label='CBA-DRExcursion')
        assert abs(closing - 1530.74) < 0.02, \
            f"Final balance {closing}, expected 1530.74"

    def test_trustee_transaction_present(self):
        matches = [t for t in self.txns if 'Trustee' in t['description']]
        assert len(matches) == 1, f"Expected exactly one Trustee txn, found {len(matches)}"
        t = matches[0]
        assert t['date'] == '2025-07-22'
        assert abs(t['debit'] - 95.48) < 0.01
        assert t['credit'] is None

    def test_dr_excursion_balance_is_negative(self):
        matches = [t for t in self.txns if 'ALLIANZ' in t['description']]
        assert len(matches) == 1, f"Expected exactly one ALLIANZ txn, found {len(matches)}"
        t = matches[0]
        assert t['date'] == '2025-07-02'
        assert abs(t['debit'] - 1713.06) < 0.01
        assert t['balance'] is not None and t['balance'] < 0, \
            f"DR excursion balance must be negative, got {t['balance']}"
        assert abs(t['balance'] - (-220.01)) < 0.01

    def test_no_closing_summary_footer_leak(self):
        for t in self.txns:
            desc = t['description'] or ''
            assert 'Total debits'    not in desc
            assert 'Total credits'   not in desc
            assert 'Opening balance' not in desc

    def test_last_transaction_is_seaworld(self):
        t = self.txns[-1]
        assert 'SEAWORLD MAIN BEACH' in t['description']
        assert abs(t['debit'] - 119.00) < 0.01
        assert abs(t['balance'] - 1530.74) < 0.01
        assert t['date'] == '2025-09-30'

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
