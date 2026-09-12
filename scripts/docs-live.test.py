import importlib.util
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('docs_live', Path(__file__).with_name('docs-live.py'))
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)


class LivePublication(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.staging = Path(self.temp.name)
        manifest = json.dumps({'revision': 'a' * 40, 'sources': [{'path': 'index.md'}]}).encode()
        (self.staging / 'docs-sources.json').write_bytes(manifest)
        (self.staging / 'index.md').write_bytes(b'# Glide')
        self.responses = {
            'docs-sources.json': manifest,
            'index.md': b'# Glide',
            '': b'<meta content="zensical-0.0.53">',
            'llms.txt': b'[Home](https://example.test/glide/index.md)',
            'llms-full.txt': b'a' * 40,
            'search.json': b'{"items":[{"location":""}]}',
            'pagefind/pagefind-entry.json': b'{"languages":{"en":{"page_count":1}}}',
        }

    def verify(self):
        return live.verify('https://example.test/glide/', self.staging, lambda url: self.responses['' if url == 'https://example.test/glide' else url.removeprefix('https://example.test/glide/')])

    def test_directory_redirect_must_keep_the_public_prefix(self):
        url = 'https://example.test/glide/vloer'
        with patch.object(live, 'urlopen') as request:
            response = request.return_value.__enter__.return_value
            response.status = 200
            response.read.return_value = b'page'
            response.url = url + '/'
            self.assertEqual(live.read_url(url), b'page')
            response.url = 'https://example.test/vloer/'
            with self.assertRaisesRegex(AssertionError, 'Unexpected redirect'):
                live.read_url(url)

    def test_matching_publication_passes(self):
        self.assertEqual(self.verify()['human_pages'], 1)

    def test_stale_revision_or_missing_export_fails(self):
        self.responses['docs-sources.json'] = b'{}'
        with self.assertRaisesRegex(AssertionError, 'Published sources'):
            self.verify()
        self.responses['docs-sources.json'] = (self.staging / 'docs-sources.json').read_bytes()
        self.responses['index.md'] = b'<html>not the document</html>'
        with self.assertRaisesRegex(AssertionError, 'stale Markdown'):
            self.verify()

    def test_wrong_human_renderer_fails(self):
        self.responses[''] = b'<html>error page</html>'
        with self.assertRaisesRegex(AssertionError, 'Missing Zensical'):
            self.verify()

    def test_historical_search_and_pagefind_scope_fail(self):
        self.responses['search.json'] = b'{"items":[{"location":"research/old/"}]}'
        with self.assertRaisesRegex(AssertionError, 'includes history'):
            self.verify()
        self.responses['search.json'] = b'{"items":[{"location":""}]}'
        self.responses['pagefind/pagefind-entry.json'] = b'{"languages":{"en":{"page_count":2}}}'
        with self.assertRaisesRegex(AssertionError, 'Pagefind page count'):
            self.verify()


if __name__ == '__main__':
    unittest.main()
