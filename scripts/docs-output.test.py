import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('docs_output', Path(__file__).with_name('docs-output.py'))
output = importlib.util.module_from_spec(spec)
spec.loader.exec_module(output)


class PublishedDocumentation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.staging = root / '.build/docs'
        self.site = root / '.build/site'
        self.staging.mkdir(parents=True)
        self.site.mkdir(parents=True)
        (root / 'mkdocs.yml').write_text('site_url: https://example.test/glide/\n')
        (self.staging / 'index.md').write_text('# Current\n\n[Page](vloer/index.md)\n')
        (self.staging / 'vloer').mkdir()
        (self.staging / 'vloer/index.md').write_text('# Vloer\n')
        (self.staging / 'llms.txt').write_text('# Glide\n\n- [Start](index.md)\n')
        (self.staging / 'docs-sources.json').write_text(json.dumps({'revision': 'a' * 40, 'sources': []}))
        for name in ['index.html', 'vloer/index.html', 'ploeg/index.html', 'research/old/index.html']:
            page = self.site / name
            page.parent.mkdir(parents=True, exist_ok=True)
            page.write_text('<body><article>page</article></body>')
        (self.site / 'search').mkdir()
        (self.site / 'search/search_index.json').write_text(json.dumps({'docs': [{'location': 'index.html'}, {'location': 'research/old/#stale'}]}))
        (self.site / 'search.json').write_text(json.dumps({'items': [{'location': 'index.html'}, {'location': 'research/old/#stale'}]}))
        output.finalize(self.site, self.staging)

    def test_publishable_site_and_curated_bundle(self):
        output.validate(self.site, self.staging)
        self.assertIn('https://example.test/glide/vloer/index.md', (self.site / 'llms-full.txt').read_text())
        self.assertIn('data-pagefind-ignore', (self.site / 'research/old/index.html').read_text())
        self.assertNotIn('data-pagefind-body', (self.site / 'research/old/index.html').read_text())
        self.assertIn('data-pagefind-body', (self.site / 'index.html').read_text())

    def test_missing_or_stale_raw_page_blocks_publish(self):
        page = self.site / 'index.md'
        page.unlink()
        with self.assertRaisesRegex(AssertionError, 'Missing or stale Markdown'):
            output.validate(self.site, self.staging)
        page.write_text('stale')
        with self.assertRaisesRegex(AssertionError, 'Missing or stale Markdown'):
            output.validate(self.site, self.staging)

    def test_missing_human_page_blocks_publish(self):
        (self.site / 'vloer/index.html').unlink()
        with self.assertRaisesRegex(AssertionError, 'Missing output'):
            output.validate(self.site, self.staging)

    def test_broken_or_external_machine_link_blocks_publish(self):
        for target, reason in [('https://example.test/glide/missing.md', 'Broken machine index'), ('https://other.test/', 'escapes site')]:
            (self.site / 'llms.txt').write_text(f'[Bad]({target})')
            with self.assertRaisesRegex(AssertionError, reason):
                output.validate(self.site, self.staging)

    def test_history_cannot_enter_default_search_or_bundle(self):
        (self.site / 'search/search_index.json').write_text(json.dumps({'docs': [{'location': 'research/old/'}]}))
        with self.assertRaisesRegex(AssertionError, 'History leaked'):
            output.validate(self.site, self.staging)
        (self.staging / 'llms.txt').write_text('[Old](research/old.md)')
        with self.assertRaisesRegex(AssertionError, 'Historical page'):
            output.finalize(self.site, self.staging)

    def test_zensical_history_blocks_publish(self):
        (self.site / 'search.json').write_text(json.dumps({'items': [{'location': 'research/old/'}]}))
        with self.assertRaisesRegex(AssertionError, 'History leaked into Zensical'):
            output.validate(self.site, self.staging)

    def test_legacy_target_must_exist(self):
        (self.staging / 'research').mkdir()
        mapping = self.staging / 'research/2026-09-12-docs-cutover.json'
        mapping.write_text(json.dumps({'redirects': [{'to': '/glide/vloer/'}]}))
        output.validate(self.site, self.staging)
        mapping.write_text(json.dumps({'redirects': [{'to': '/glide/missing/'}]}))
        with self.assertRaisesRegex(AssertionError, 'Missing legacy redirect'):
            output.validate(self.site, self.staging)

    def test_mismatched_revision_blocks_publish(self):
        (self.site / 'docs-sources.json').write_text('{}')
        with self.assertRaisesRegex(AssertionError, 'Mismatched source'):
            output.validate(self.site, self.staging)

    def test_code_examples_remain_literal(self):
        for markdown in ['`[Example](relative.md)`', '```md\n[Example](relative.md)\n```']:
            self.assertEqual(output.absolute_links(markdown, 'https://example.test/'), markdown)


if __name__ == '__main__':
    unittest.main()
