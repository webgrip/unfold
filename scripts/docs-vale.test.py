import datetime
import importlib.util
import unittest
from pathlib import Path


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


vale = load('docs_vale', 'docs-vale.py')
stale = load('docs_stale', 'docs-stale.py')


class Vocabulary(unittest.TestCase):
    def test_keeps_multi_word_capitalised_and_named_terms_only(self):
        terms = [{'name': 'Run'}, {'name': 'Work Item'}, {'name': 'Follow-Up'}, {'name': 'OpenSpec', 'context': 'Tooling'}, {'name': 'AHP'}, {'name': 'Vloer', 'context': 'System'}]
        self.assertEqual(vale.vocabulary(terms), ['AHP', 'Follow-Up', 'OpenSpec', 'Vloer', 'Work Item'])

    def test_substitutions_skip_single_words_and_qualified_entries(self):
        models = [{'retired_terms': [{'name': 'Ticket', 'use': ['Work Item']}, {'name': 'Repair Subticket', 'use': ['Follow-Up']}], 'terms': [{'name': 'Run', 'avoid': ['job (as a domain term)', 'role run']}]}]
        self.assertEqual(vale.substitutions(models), {'repair subticket': 'Follow-Up', 'role run': 'Run'})
        self.assertIn('level: warning', vale.rule({'role run': 'Run'}))
        self.assertIn('  "role run": "Run"', vale.rule({'role run': 'Run'}))

    def test_the_repository_models_generate_a_vocabulary(self):
        self.assertIn('Work Item', vale.vocabulary([term for path in vale.models for term in vale.yaml.safe_load((vale.root / path).read_text())['terms']]))


class StaleReport(unittest.TestCase):
    def test_report_warns_and_lists_old_pages(self):
        old = '---\nlast_verified: 2025-01-01\n---\n'
        text = stale.report({'docs/old.md': old}, datetime.date(2026, 9, 23), 180)
        self.assertTrue(text.startswith('warning: 1 current page(s)'))
        self.assertIn('docs/old.md: last_verified 2025-01-01 (630 days)', text)
        self.assertIn('no current page', stale.report({}, datetime.date(2026, 9, 23), 180))
        marked = stale.report({'docs/q.md': '---\nunverified: "contradicts ADR-0002"\n---\n'}, datetime.date(2026, 9, 23), 180)
        self.assertIn('1 current page(s) are marked unverified', marked)
        self.assertIn('docs/q.md: contradicts ADR-0002', marked)

    def test_repository_pages_exclude_records(self):
        pages = stale.current_pages()
        self.assertIn('docs/index.md', pages)
        self.assertFalse(any('/research/' in page or '/adr/adr-' in page for page in pages))


if __name__ == '__main__':
    unittest.main()
