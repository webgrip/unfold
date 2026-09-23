import datetime
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
            'vloer/design/00-product-system-design.md',
            'vloer/design/00-product-system-design/',
            'vloer/PRODUCT-DESIGN.md',
            'vloer/PRODUCT-DESIGN/index.html',
            'vloer/product/go-to-market.md',
            'vloer/product/go-to-market/',
            'vloer/operations/backlog.md',
            'ploeg/backlog/',
        ]:
            self.assertTrue(rules.historical(path), path)

    def test_current_pages_and_ledger_indexes_are_not_history(self):
        for path in ['index.md', 'index.html', '', 'workflows/local-demo.md', 'vloer/operations/live/', 'adr/index.md', 'adr/', 'vloer/adrs/README.md', 'vloer/adrs/', 'reference/decisions.md']:
            self.assertFalse(rules.historical(path), path)


    def test_brand_folders_are_parked_except_the_trademark_policy(self):
        for path in ['vloer/brand/README.md', 'vloer/brand/', 'vloer/brand/social-profile-copy.md', 'vloer/brand/brandbook.html', 'ploeg/brand/README.md', 'ploeg/brand/merkgids.html']:
            self.assertTrue(rules.historical(path), path)
        for path in ['vloer/brand/TRADEMARK.md', 'vloer/brand/TRADEMARK/', 'ploeg/brand/TRADEMARK.md', 'ploeg/brand/TRADEMARK.html']:
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


TODAY = datetime.date(2026, 9, 23)
VALID = '---\ntype: how-to\naudience: [owner, operator]\nowner: glide\nlast_verified: 2026-09-22\nverified_by: "mise run docs-check"\n---\n\n# Page\n'
GENERATED = '---\ntype: reference\naudience: [owner, agent]\nowner: ploeg\ngenerated_by: "mise run domain"\n---\n\n# Glossary\n'


class FrontMatter(unittest.TestCase):
    def test_checked_pages_are_current_nav_pages_and_the_required_folders(self):
        pages = ['index.md', 'extra.md', 'concepts/new.md', 'how-to/x.md', 'reference/glossary.md', 'reference/data.yaml', 'research/2026-09-12-x.md', 'vloer/index.md', 'adr/adr-0001-x.md']
        nav = {'index.md', 'vloer/index.md', 'research/2026-09-12-x.md', 'adr/adr-0001-x.md'}
        self.assertEqual(rules.checked_pages(pages, nav), ['concepts/new.md', 'how-to/x.md', 'index.md', 'reference/glossary.md', 'vloer/index.md'])

    def test_valid_verified_and_generated_pages_pass(self):
        self.assertEqual(rules.front_matter_problems(VALID, TODAY), [])
        self.assertEqual(rules.front_matter_problems(GENERATED, TODAY), [])

    def test_missing_front_matter_and_invalid_yaml(self):
        self.assertEqual(rules.front_matter_problems('# Page\n', TODAY), ['no front matter'])
        self.assertEqual(rules.front_matter_problems('---\ntype: [\n---\n# Page\n', TODAY), ['front matter is not valid YAML'])

    def test_each_field_is_validated(self):
        cases = {
            'type: how-to': ('type: record', 'type must be'),
            'audience: [owner, operator]': ('audience: owner', 'audience must be'),
            'owner: glide': ('owner: webgrip', 'owner must be'),
            'last_verified: 2026-09-22': ('last_verified: 2026-12-01', 'in the future'),
            'verified_by: "mise run docs-check"\n': ('', 'verified_by must'),
        }
        for original, (replacement, message) in cases.items():
            problems = rules.front_matter_problems(VALID.replace(original, replacement), TODAY)
            self.assertEqual(len(problems), 1, (replacement, problems))
            self.assertIn(message, problems[0])
        self.assertIn('audience must be', rules.front_matter_problems(VALID.replace('[owner, operator]', '[owner, reader]'), TODAY)[0])
        self.assertIn('YYYY-MM-DD', rules.front_matter_problems(VALID.replace('2026-09-22', 'last week'), TODAY)[0])

    def test_only_generated_reference_pages_may_omit_last_verified(self):
        unverified = VALID.replace('last_verified: 2026-09-22\nverified_by: "mise run docs-check"\n', '')
        self.assertIn('last_verified is required', rules.front_matter_problems(unverified, TODAY)[0])
        self.assertIn('last_verified is required', rules.front_matter_problems(GENERATED.replace('generated_by: "mise run domain"\n', ''), TODAY)[0])
        self.assertEqual(rules.front_matter_problems(GENERATED.replace('type: reference', 'type: explanation'), TODAY), ['generated_by is only for generated reference pages'])

    def test_an_unverified_page_states_why_instead_of_a_date(self):
        marked = VALID.replace('last_verified: 2026-09-22\nverified_by: "mise run docs-check"\n', 'unverified: "contradicts ADR-0002"\n')
        self.assertEqual(rules.front_matter_problems(marked, TODAY), [])
        self.assertEqual(rules.front_matter_problems(marked.replace('"contradicts ADR-0002"', '""'), TODAY)[0][:24], 'last_verified is require')
        self.assertEqual(rules.front_matter_problems(VALID.replace('owner: glide\n', 'owner: glide\nunverified: "x"\n'), TODAY), ['unverified excludes last_verified and generated_by'])
        self.assertEqual(rules.unverified({'a.md': marked, 'b.md': VALID}), [('a.md', 'contradicts ADR-0002')])


class Staleness(unittest.TestCase):
    def test_reports_pages_older_than_the_threshold_oldest_first(self):
        pages = {
            'fresh.md': VALID,
            'edge.md': VALID.replace('2026-09-22', '2026-03-27'),
            'old.md': VALID.replace('2026-09-22', '2026-03-26'),
            'older.md': VALID.replace('2026-09-22', '2025-01-01'),
            'generated.md': GENERATED,
            'bare.md': '# No front matter\n',
            'broken.md': '---\ntype: [\n---\n',
        }
        self.assertEqual(rules.stale(pages, TODAY), [('older.md', datetime.date(2025, 1, 1), 630), ('old.md', datetime.date(2026, 3, 26), 181)])
        self.assertEqual(rules.stale(pages, TODAY, days=1000), [])


if __name__ == '__main__':
    unittest.main()
