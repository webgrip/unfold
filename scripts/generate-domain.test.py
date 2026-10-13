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


class UnfoldModelAdrReferences(unittest.TestCase):
    def generate(self, text):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'docs/domain').mkdir(parents=True)
            (root / 'docs/adr').mkdir(parents=True)
            (root / 'docs/adr/adr-0002-ploeg-is-the-only-engine.md').write_text('# 0002')
            (root / 'apps/ploeg/docs/adrs').mkdir(parents=True)
            (root / 'apps/ploeg/docs/adrs/0079-cards.md').write_text('# 0079')
            (root / 'docs/domain/model.yaml').write_text(text)
            return subprocess.run([sys.executable, str(GENERATOR), 'docs/domain/model.yaml', '-o', str(root / 'out')], cwd=root, capture_output=True, text=True)

    def model(self, definition, owner='unfold'):
        return f"project: Unfold\nowner: {owner}\nterms:\n  - name: Work Item\n    context: Work\n    definition: >\n      {definition}\n"

    def test_a_qualified_reference_to_an_existing_record_passes(self):
        result = self.generate(self.model('Decided in system ADR-0002 and Ploeg ADR-0079.'))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_a_bare_reference_is_refused_with_the_term_that_holds_it(self):
        result = self.generate(self.model('Decided in ADR-0002.'))
        self.assertEqual(result.returncode, 1)
        self.assertIn("terms[Work Item].definition: 'ADR-0002' names no ledger", result.stderr)

    def test_a_reference_to_a_record_the_ledger_lacks_is_refused(self):
        result = self.generate(self.model('Decided in Ploeg ADR-0002.'))
        self.assertEqual(result.returncode, 1)
        self.assertIn("'Ploeg ADR-0002' is not in the Ploeg ledger", result.stderr)

    def test_another_owners_model_keeps_its_own_ledger_words(self):
        result = self.generate(self.model('Decided in ADR-0002.', owner='ploeg'))
        self.assertEqual(result.returncode, 0, result.stderr)


class CombinedGlossaryClash(unittest.TestCase):
    def combine(self, unfold):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'docs/domain').mkdir(parents=True)
            (root / 'apps/ploeg/docs/domain').mkdir(parents=True)
            (root / 'docs/domain/model.yaml').write_text(unfold)
            (root / 'apps/ploeg/docs/domain/model.yaml').write_text(PLOEG)
            return subprocess.run([sys.executable, str(GENERATOR), '--glossary', 'docs/reference/glossary.md', '--stdout', 'docs/domain/model.yaml', 'apps/ploeg/docs/domain/model.yaml'], cwd=root, capture_output=True, text=True)

    def test_a_term_both_models_define_names_the_importing_model_as_the_one_to_change(self):
        result = self.combine(UNFOLD.replace('references:', 'imports:\n  - model: ../../apps/ploeg/docs/domain/model.yaml\n    terms: [Work Item]\nreferences:', 1) + """  - name: Run
    context: Work
    definition: Unfold's own reading of a Run.
""")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')
        self.assertIn("'Run' is defined by Unfold (docs/domain/model.yaml) and Ploeg (apps/ploeg/docs/domain/model.yaml).", result.stderr)
        self.assertIn('Owner rule: Ploeg owns a term when Ploeg stores it or its API names it; otherwise Unfold owns it.', result.stderr)
        self.assertIn("Suggested owner: Ploeg, because Unfold imports from Ploeg's model", result.stderr)
        self.assertIn("1. In docs/domain/model.yaml, add 'Run' to the terms of the import of ../../apps/ploeg/docs/domain/model.yaml.", result.stderr)
        self.assertIn("2. Delete 'Run' from the terms in docs/domain/model.yaml.", result.stderr)
        self.assertIn("3. Move anything only Unfold's definition said into one of Unfold's terms that links to 'Run'", result.stderr)

    def test_a_clash_without_an_import_asks_for_an_owner_decision(self):
        result = self.combine(UNFOLD + """  - name: Run
    context: Work
    definition: Unfold's own reading of a Run.
""")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Neither model imports the other.', result.stderr)
        self.assertNotIn('Suggested owner', result.stderr)


if __name__ == '__main__':
    unittest.main()
