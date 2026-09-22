import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('docs_rules', Path(__file__).with_name('docs-rules.py'))
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)


class HistoryClassification(unittest.TestCase):
    def test_records_are_history(self):
        for path in [
            'research/2026-09-12-execution-boundary.md',
            'research/old/#stale',
            'vloer/research/evidence/delivery-2026-09-11/README.md',
            'vloer/adrs/0001-the-human-workbench-beside-ploeg.md',
            'vloer/adrs/0001-the-human-workbench-beside-ploeg/',
            'adr/adr-0001-glide-contains-independent-applications.md',
            'vloer/design/gap-register.md',
            'ploeg/design/',
            'ploeg/backlog.md',
            'vloer/operations/backlog/',
            'vloer/operations/iteration-0.2.0.md',
            'migration-proposal.md',
            'ploeg/openspec/changes/x/design.md',
        ]:
            self.assertTrue(rules.historical(path), path)

    def test_current_pages_and_ledger_indexes_are_not_history(self):
        for path in ['index.md', 'index.html', '', 'workflows/local-demo.md', 'vloer/operations/live/', 'adr/index.md', 'adr/', 'vloer/adrs/README.md', 'vloer/adrs/', 'reference/decisions.md']:
            self.assertFalse(rules.historical(path), path)


class Anchors(unittest.TestCase):
    def test_heading_slugs_follow_python_markdown(self):
        markdown = '# Run the `unified` workbench\n\n## Recovery\n\n## Recovery\n\n### R8\n\n## `kagent` / `kars` / agent-sandbox\n\n## See [the guide](x.md) & more\n\n```md\n## Not a heading\n```\n'
        found = rules.anchors(markdown)
        for anchor in ['run-the-unified-workbench', 'recovery', 'recovery_1', 'r8', 'kagent-kars-agent-sandbox', 'see-the-guide-more']:
            self.assertIn(anchor, found)
        self.assertNotIn('not-a-heading', found)

    def test_explicit_and_html_ids(self):
        found = rules.anchors('## Title {#custom}\n\n<a id="legacy"></a>\n')
        self.assertIn('custom', found)
        self.assertIn('legacy', found)
        self.assertNotIn('title', found)


class HistoryBanner(unittest.TestCase):
    def test_banner_follows_the_title_and_front_matter_is_merged(self):
        staged = rules.mark_history('---\nstatus: proposed\ndate: 2026-09-10\n---\n\n# Decision\n\nBody\n', 'vloer/adrs/0017-x.md')
        self.assertEqual(staged, '---\nstatus: proposed\ndate: 2026-09-10\nsearch:\n  exclude: true\n---\n\n# Decision\n\n> Record from 2026-09-10; not current guidance.\n\nBody\n')

    def test_date_sources_and_unknown_date(self):
        self.assertIn('Record from 2026-09-12;', rules.mark_history('# Audit\n', 'vloer/research/2026-09-12-documentation-audit.md'))
        self.assertIn('Record from 2026-09-09;', rules.mark_history('# 0001 — Title\n\nDate: 2026-09-09. Status: accepted.\n', 'vloer/adrs/0001-title.md'))
        self.assertIn('Record from 2026-09-11;', rules.mark_history('# Evidence\n', 'vloer/research/evidence/delivery-2026-09-11/README.md'))
        staged = rules.mark_history('Intro without a title\n', 'ploeg/backlog.md')
        self.assertTrue(staged.startswith('---\nsearch:\n  exclude: true\n---\n> Record; not current guidance.\n'))

    def test_existing_search_setting_is_kept(self):
        staged = rules.mark_history('---\nsearch:\n  exclude: false\n---\n# Page\n', 'research/page.md')
        self.assertEqual(staged.count('search:'), 1)


class Orphans(unittest.TestCase):
    def test_nav_pages_and_one_hop_links_are_reachable(self):
        nav = rules.nav_pages([{'Start': 'index.md'}, {'Apps': [{'Vloer': 'vloer/index.md'}, 'https://example.test/']}])
        self.assertEqual(nav, {'index.md', 'vloer/index.md'})
        links = {'vloer/index.md': {'vloer/live.md'}, 'vloer/live.md': {'vloer/deep.md'}}
        pages = ['index.md', 'vloer/index.md', 'vloer/live.md', 'vloer/deep.md', 'vloer/research/old.md']
        self.assertEqual(rules.orphans(pages, nav, links), ['vloer/deep.md'])


if __name__ == '__main__':
    unittest.main()
