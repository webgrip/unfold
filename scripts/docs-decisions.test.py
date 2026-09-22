import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('docs_decisions', Path(__file__).with_name('docs-decisions.py'))
decisions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decisions)


class DecisionRegister(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        system = self.base / 'docs/adr'
        ploeg = self.base / 'apps/ploeg/docs/adrs'
        vloer = self.base / 'apps/vloer/docs/adrs'
        for folder in [system, ploeg, vloer]:
            folder.mkdir(parents=True)
        (system / 'adr-0000-template.md').write_text('---\nstatus: proposed\ndate: 2026-01-01\n---\n\n# Template\n')
        (system / 'adr-0001-first.md').write_text('---\nstatus: accepted\ndate: 2026-09-12\n---\n\n# First system decision\n')
        (system / 'adr-0002-second.md').write_text('---\nstatus: accepted\ndate: 2026-09-22\nsupersedes: 0001\n---\n\n# Second system decision\n')
        (ploeg / '0001-ledger.md').write_text('---\nstatus: accepted\ndate: 2026-07-29\nsupersedes: none\n---\n\n# Ploeg ledger\n')
        (ploeg / '0002-open.md').write_text('---\nstatus: proposed\ndate: 2026-08-01\n---\n\n# Open question | with a pipe\n')
        (ploeg / '0003-old.md').write_text('---\nstatus: superseded by ADR-0001\ndate: 2026-07-01\n---\n\n# Old choice\n')
        (vloer / '0001-inline.md').write_text('# 0001 — Inline record\n\nDate: 2026-09-09. Status: accepted for v0.1.\n')
        (vloer / '0002-inline-proposal.md').write_text('# 0002 — Inline proposal\n\nDate: 2026-09-10. Status: proposed; nothing implemented.\n')
        (self.base / 'apps/ploeg/pkg').mkdir(parents=True)
        (self.base / 'apps/ploeg/pkg/open.go').write_text('package pkg\n')
        (self.base / 'docs/reference').mkdir(parents=True)
        self.evidence = self.base / decisions.EVIDENCE
        self.evidence.write_text('checked: 2026-09-22\nploeg:\n  "0002":\n    implemented: partial\n    note: Half done\n    evidence: apps/ploeg/pkg/open.go\n')

    def test_accepted_proposed_and_rest_are_separate_tables(self):
        page = decisions.render(self.base)
        accepted, rest = page.split('## Proposed')
        proposed, other = rest.split('## Other statuses')
        self.assertIn('mise run docs-decisions', page.split('## Accepted')[0])
        self.assertIn('| System | [0001](../adr/adr-0001-first.md) | First system decision | 2026-09-12 | System [0002](../adr/adr-0002-second.md) |', accepted)
        self.assertIn('| Vloer | [0001](../../apps/vloer/docs/adrs/0001-inline.md) | Inline record | 2026-09-09 | — |', accepted)
        self.assertNotIn('Template', page)
        self.assertIn('| Ploeg | [0002](../../apps/ploeg/docs/adrs/0002-open.md) | Open question \\| with a pipe | 2026-08-01 | partial | Half done ([source](../../apps/ploeg/pkg/open.go)) |', proposed)
        self.assertIn('| Vloer | [0002](../../apps/vloer/docs/adrs/0002-inline-proposal.md) | Inline proposal | 2026-09-10 | unknown | — |', proposed)
        self.assertIn('| Ploeg | [0003](../../apps/ploeg/docs/adrs/0003-old.md) | Old choice | superseded by ADR-0001 | 2026-07-01 | Ploeg [0001](../../apps/ploeg/docs/adrs/0001-ledger.md) |', other)
        self.assertLess(page.index('| System | [0001]'), page.index('| Ploeg | [0001]'))
        self.assertLess(page.index('| Ploeg | [0001]'), page.index('| Vloer | [0001]'))

    def test_evidence_must_name_a_proposed_record_and_an_existing_file(self):
        self.assertEqual(decisions.unknown_evidence(self.base), [])
        self.evidence.write_text('ploeg:\n  "0001":\n    implemented: maybe\n    evidence: apps/missing.go\n')
        problems = decisions.unknown_evidence(self.base)
        self.assertIn('ploeg 0001: not a proposed record', problems)
        self.assertIn('ploeg 0001: implemented must be yes, partial or no', problems)
        self.assertIn('ploeg 0001: missing evidence apps/missing.go', problems)


if __name__ == '__main__':
    unittest.main()
