import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('agent_standards', Path(__file__).with_name('agent-standards.py'))
standards = importlib.util.module_from_spec(spec)
spec.loader.exec_module(standards)

CASE = {'title': 't', 'where': 'w', 'how': 'h', 'effort': 'S', 'value': 'v'}
GOOD = {
    'standards': [
        {'id': 'mcp', 'name': 'Model Context Protocol', 'layer': 'tool', 'steward': 'AAIF', 'governance': 'foundation', 'status': 'stable',
         'latest': {'version': '2026-07-28', 'date': '2026-07-28', 'url': 'https://example.org'},
         'watch': [{'kind': 'github-releases', 'ref': 'o/r', 'current': '1.0.0'}, {'kind': 'changelog-page', 'ref': 'https://e.org'}],
         'relations': {'complements': ['a2a']}, 'radar': 'adopt', 'radar_reason': 'r', 'flip_trigger': 'f',
         'decisions': ['AGENTS.md'], 'watchlist': ['T5'], 'reviewed': '2026-11-04', 'use_cases': [CASE] * 5},
        {'id': 'a2a', 'name': 'Agent2Agent', 'layer': 'agent-agent', 'steward': 'AAIF', 'governance': 'foundation', 'status': 'stable',
         'radar': 'assess', 'radar_reason': 'r', 'flip_trigger': 'f', 'reviewed': '2026-11-04', 'use_cases': [CASE] * 5},
    ],
    'concepts': [
        {'id': 'context-engineering', 'name': 'Context engineering', 'maturity': 'pattern', 'radar': 'adopt',
         'related_standards': ['mcp'], 'reviewed': '2026-11-04', 'use_cases': [CASE] * 5},
    ],
}


class Rules(unittest.TestCase):
    def broken(self, mutate, needle):
        doc = copy.deepcopy(GOOD)
        mutate(doc)
        errors = standards.check(doc)
        self.assertTrue(any(needle in error for error in errors), errors)

    def test_the_good_catalogue_passes(self):
        self.assertEqual(standards.check(GOOD), [])

    def test_each_rule_rejects_what_it_exists_to_reject(self):
        self.broken(lambda doc: doc['standards'].append(copy.deepcopy(doc['standards'][0])), 'duplicate id')
        self.broken(lambda doc: doc['standards'][0].update(id='Not_Kebab'), 'kebab-case')
        self.broken(lambda doc: doc['standards'][0].update(layer='nonsense'), 'layer')
        self.broken(lambda doc: doc['standards'][0].update(radar='maybe'), 'radar')
        self.broken(lambda doc: doc['standards'][0].update(use_cases=[CASE] * 4), 'exactly 5')
        self.broken(lambda doc: doc['standards'][0]['use_cases'].__setitem__(0, {**CASE, 'effort': 'XL'}), 'effort')
        self.broken(lambda doc: doc['standards'][0]['relations'].update(complements=['ghost']), "unknown id 'ghost'")
        self.broken(lambda doc: doc['standards'][0].update(decisions=['docs/adr/adr-9999-nothing.md']), 'does not exist')
        self.broken(lambda doc: doc['standards'][0].update(watchlist=['5']), 'is not T<number>')
        self.broken(lambda doc: doc['standards'][0]['watch'].append({'kind': 'ietf-draft', 'ref': 'draft-x'}), 'needs current')
        self.broken(lambda doc: doc['standards'][0]['watch'].append({'kind': 'carrier-pigeon', 'ref': 'x'}), 'watch kind')
        self.broken(lambda doc: doc['standards'][0].update(reviewed='last week'), 'reviewed')
        self.broken(lambda doc: doc['concepts'][0].update(maturity='vibes'), 'maturity')
        self.broken(lambda doc: doc['concepts'][0].update(related_standards=['ghost']), "unknown id 'ghost'")


class WatchLines(unittest.TestCase):
    DOC = {'standards': [{'watch': [{'kind': 'github-releases', 'ref': 'o/r', 'current': '1.0.0'},
                                    {'kind': 'ietf-draft', 'ref': 'draft-x-y', 'current': '03'},
                                    {'kind': 'rss', 'ref': 'https://e.org/feed'}]}]}

    def test_one_line_entries_match_the_renovate_shape(self):
        text = '  - {kind: github-releases, ref: o/r, current: "1.0.0"}\n  - {kind: ietf-draft, ref: draft-x-y, current: "03"}\n'
        self.assertEqual(standards.check_watch_lines(text, self.DOC), [])

    def test_a_padded_or_wrapped_entry_is_caught(self):
        padded = '  - { kind: github-releases, ref: o/r, current: "1.0.0" }\n  - {kind: ietf-draft, ref: draft-x-y, current: "03"}\n'
        wrapped = '  - {kind: github-releases, ref: o/r,\n      current: "1.0.0"}\n  - {kind: ietf-draft, ref: draft-x-y, current: "03"}\n'
        self.assertNotEqual(standards.check_watch_lines(padded, self.DOC), [])
        self.assertNotEqual(standards.check_watch_lines(wrapped, self.DOC), [])


class Rendering(unittest.TestCase):
    def test_every_layer_gets_a_page_and_stale_pages_are_found(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            for name, text in standards.pages(GOOD).items():
                (out / name).write_text(text)
            expected = {'index.md', 'concepts.md'} | {f'{layer}.md' for layer in standards.LAYERS}
            self.assertEqual({path.name for path in out.iterdir()}, expected)
            self.assertIn('[Model Context Protocol](tool.md#mcp)', (out / 'index.md').read_text())
            self.assertIn('No standard in this layer', (out / 'commerce.md').read_text())
            self.assertEqual(standards.stale(GOOD, out), [])
            changed = copy.deepcopy(GOOD)
            changed['standards'][0]['radar'] = 'hold'
            self.assertIn('index.md', standards.stale(changed, out))


class Committed(unittest.TestCase):
    def test_the_committed_catalogue_holds_every_rule_and_its_pages_are_current(self):
        if not standards.catalogue_file.exists():
            self.skipTest('no catalogue committed')
        self.assertEqual(standards.problems(), [])
        self.assertEqual(standards.stale(standards.load(standards.catalogue_file), standards.catalogue_dir), [])


if __name__ == '__main__':
    unittest.main()
