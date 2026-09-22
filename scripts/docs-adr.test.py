import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

validator = Path(__file__).with_name('validate_adr_consistency.py')


class InlineLedger(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.ledger = Path(self.temp.name) / 'adrs'
        self.ledger.mkdir()
        (self.ledger / '0001-inline.md').write_text('# 0001 — Inline record\n\nDate: 2026-09-09. Status: accepted for v0.1.\n\n## Context\n')
        (self.ledger / 'README.md').write_text('| ADR | Decision | Scope and evidence | Status | Last updated |\n| --- | --- | --- | --- | --- |\n| [0001](0001-inline.md) | Inline record | Accepted for v0.1 | accepted | 2026-09-09 |\n')

    def run_validator(self):
        return subprocess.run([sys.executable, str(validator), self.temp.name, '--adr-dir', str(self.ledger)], capture_output=True, text=True)

    def test_inline_records_are_checked_against_the_registry(self):
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        (self.ledger / 'README.md').write_text((self.ledger / 'README.md').read_text().replace('| accepted | 2026-09-09 |', '| proposed | 2026-09-10 |'))
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("status 'proposed'", result.stdout)
        self.assertIn('Last updated 2026-09-10', result.stdout)

    def test_inline_record_needs_a_date_and_legal_status(self):
        (self.ledger / '0001-inline.md').write_text('# 0001 — Inline record\n\nStatus: implemented in a prototype.\n')
        self.assertIn('no `Date: YYYY-MM-DD.` prefix', self.run_validator().stdout)
        (self.ledger / '0001-inline.md').write_text('# 0001 — Inline record\n\nDate: 2026-09-09. Status: implemented in a prototype.\n')
        self.assertIn("illegal status 'implemented in a prototype.'", self.run_validator().stdout)


if __name__ == '__main__':
    unittest.main()
