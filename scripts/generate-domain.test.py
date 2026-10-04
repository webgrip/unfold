import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GENERATOR = Path(__file__).resolve().parent / 'generate-domain.py'

UNFOLD = """project: Unfold
owner: unfold
references:
  - label: Unfold ADR-0002
    path: ../adr/adr-0002.md
    note: Ploeg is the only engine.
terms:
  - name: Work Item
    context: Work
    definition: A unit of work.
"""

PLOEG = """project: Ploeg
owner: ploeg
references:
  - label: Unfold ADR-0002
    path: https://github.com/webgrip/unfold/blob/0000000/docs/adr/adr-0002.md
    note: Ploeg is the only engine.
  - label: Ploeg ADR-0062
    path: https://github.com/ploeg-hq/ploeg/blob/main/docs/adrs/0062.md
    note: GitHub is the project home.
terms:
  - name: Run
    context: Dispatch
    definition: One Role executing against a Work Item.
"""


class CombinedGlossaryReferences(unittest.TestCase):
    def test_a_pinned_model_may_cite_decisions_by_url_and_a_shared_decision_appears_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'docs/domain').mkdir(parents=True)
            (root / 'apps/ploeg/docs/domain').mkdir(parents=True)
            (root / 'docs/domain/model.yaml').write_text(UNFOLD)
            (root / 'apps/ploeg/docs/domain/model.yaml').write_text(PLOEG)
            glossary = subprocess.run([sys.executable, str(GENERATOR), '--glossary', 'docs/reference/glossary.md', '--stdout', 'docs/domain/model.yaml', 'apps/ploeg/docs/domain/model.yaml'], cwd=root, check=True, capture_output=True, text=True).stdout
        self.assertEqual(glossary.count('[Unfold ADR-0002]('), 1)
        self.assertIn('[Unfold ADR-0002](../adr/adr-0002.md): Ploeg is the only engine.', glossary)
        self.assertIn('[Ploeg ADR-0062](https://github.com/ploeg-hq/ploeg/blob/main/docs/adrs/0062.md): GitHub is the project home.', glossary)
        self.assertNotIn('https:/github.com', glossary)


if __name__ == '__main__':
    unittest.main()
