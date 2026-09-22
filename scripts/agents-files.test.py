import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('agents_files', Path(__file__).with_name('agents-files.py'))
agents = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agents)

ROOT = '# Repo\n\nUse `mise exec --` for tooling. Run `mise run verify` before delivery.\n'
APP = '# App\n\nRead [the index](docs/index.md) and `docs/index.md` first. Run `npm run check`.\n'


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='glide-agents-')
        self.root = Path(self.temporary.name)
        self.write('mise.toml', '[tasks.verify]\nrun = "true"\n\n[tasks."docs-check"]\nrun = "true"\n')
        self.write('AGENTS.md', ROOT)
        self.link('CLAUDE.md')
        self.write('apps/app/AGENTS.md', APP)
        self.write('apps/app/CLAUDE.md', '\n@AGENTS.md\n\nClaude-specific notes.\n')
        self.write('apps/app/docs/index.md', '# Index\n')
        self.write('apps/app/package.json', '{"scripts": {"check": "true", "test": "true"}}')
        self.write('apps/app/mise.toml', '[tasks.lint]\nrun = "true"\n')

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')

    def link(self, name, target='AGENTS.md'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() or path.is_symlink():
            path.unlink()
        os.symlink(target, path)

    def files(self):
        return [str(path.relative_to(self.root)) for path in self.root.rglob('*') if path.is_file() or path.is_symlink()]

    def failures(self, check=None, files=None):
        found = agents.check(self.root, self.files() if files is None else files)
        return [line for line in found if check is None or f'[{check}]' in line]


class CleanTree(Fixture):
    def test_valid_tree_passes(self):
        self.assertEqual(self.failures(), [])


class Budget(Fixture):
    def test_root_over_400_words_fails(self):
        self.write('AGENTS.md', ROOT + 'word ' * 400)
        self.assertEqual(len(self.failures('budget')), 1)
        self.assertIn('the root limit is 400', self.failures('budget')[0])

    def test_application_limit_is_600(self):
        self.write('apps/app/AGENTS.md', APP + 'word ' * 570)
        self.assertEqual(self.failures('budget'), [])
        self.write('apps/app/AGENTS.md', APP + 'word ' * 600)
        self.assertIn('apps/app/AGENTS.md: [budget]', self.failures('budget')[0])

    def test_combined_bytes_along_the_path(self):
        self.write('AGENTS.md', ROOT + 'x' * 20000)
        self.write('apps/app/AGENTS.md', APP + 'y' * 13000)
        failures = self.failures('budget')
        self.assertEqual(len(failures), 1)
        self.assertIn('AGENTS.md -> apps/app/AGENTS.md', failures[0])

    def test_chain_includes_intermediate_files(self):
        self.assertEqual(agents.chain('apps/app/AGENTS.md', {'AGENTS.md', 'apps/AGENTS.md', 'apps/app/AGENTS.md', 'other/AGENTS.md'}), ['AGENTS.md', 'apps/AGENTS.md', 'apps/app/AGENTS.md'])


class Links(Fixture):
    def test_missing_markdown_link_fails(self):
        self.write('apps/app/AGENTS.md', APP + '\nSee [gone](docs/gone.md#part) and [ok](docs/index.md#index) and [web](https://example.test/x).\n')
        failures = self.failures('links')
        self.assertEqual(len(failures), 1)
        self.assertIn("'docs/gone.md#part'", failures[0])

    def test_reference_links_and_root_relative_links(self):
        self.write('apps/app/AGENTS.md', APP + '\n[ref]: ../../missing.md\n\n[up](../../AGENTS.md)\n')
        failures = self.failures('links')
        self.assertEqual(len(failures), 1)
        self.assertIn('missing.md', failures[0])

    def test_backticked_path_under_an_existing_folder_must_exist(self):
        self.write('apps/app/AGENTS.md', APP + '\nContracts live in `docs/contracts/`.\n')
        self.assertIn('`docs/contracts/`', self.failures('links')[0])

    def test_backticked_path_may_resolve_from_the_repository_root(self):
        self.write('apps/app/AGENTS.md', APP + '\nSee `apps/app/docs/index.md` and `mise.toml`.\n')
        self.assertEqual(self.failures('links'), [])

    def test_backticks_that_are_not_repository_paths_are_ignored(self):
        self.write('apps/app/AGENTS.md', APP + '\nUse `net/http/httptest`, `webgrip/homelab-cluster`, `cmd/*`, `docs/<topic>.md`, `fix:`/`feat:`, `go test ./x/`, `https://a.test/b`, `// @ts-check`.\n')
        self.assertEqual(self.failures('links'), [])

    def test_links_inside_code_are_ignored(self):
        self.write('apps/app/AGENTS.md', APP + '\n```md\n[gone](gone.md)\n```\n\n`[gone](gone.md)`\n')
        self.assertEqual(self.failures('links'), [])


class Commands(Fixture):
    def test_unknown_mise_task_fails(self):
        self.write('AGENTS.md', ROOT + 'Then `mise run deploy`.\n')
        failures = self.failures('commands')
        self.assertEqual(len(failures), 1)
        self.assertIn('`mise run deploy` names no task in mise.toml', failures[0])

    def test_quoted_tasks_and_nearest_mise_toml(self):
        self.write('apps/app/AGENTS.md', APP + 'Run `mise run docs-check`, `mise run lint` and `mise run verify`.\n')
        self.assertEqual(self.failures('commands'), [])
        self.write('AGENTS.md', ROOT + 'Run `mise run lint`.\n')
        self.assertEqual(len(self.failures('commands')), 1)

    def test_npm_scripts_resolve_in_the_nearest_package(self):
        self.write('apps/app/AGENTS.md', APP + 'Then `npm run typecheck`.\n')
        failures = self.failures('commands')
        self.assertEqual(len(failures), 1)
        self.assertIn('apps/app/package.json', failures[0])

    def test_npm_prefix_resolves_from_the_repository_root(self):
        self.write('AGENTS.md', ROOT + 'Run `npm --prefix apps/app run check` and `npm --prefix apps/app run build`.\n')
        failures = self.failures('commands')
        self.assertEqual(len(failures), 1)
        self.assertIn('npm --prefix apps/app run build', failures[0])

    def test_npm_without_a_package_fails(self):
        self.write('AGENTS.md', ROOT + 'Run `npm run check`.\n')
        self.assertIn('has no package.json', self.failures('commands')[0])


class Bridge(Fixture):
    def test_missing_bridge_fails(self):
        (self.root / 'apps/app/CLAUDE.md').unlink()
        failures = self.failures('bridge')
        self.assertEqual(len(failures), 1)
        self.assertIn('apps/app/CLAUDE.md: [bridge] missing', failures[0])

    def test_untracked_bridge_fails(self):
        files = [name for name in self.files() if name != 'CLAUDE.md']
        self.assertIn('CLAUDE.md: [bridge] missing', self.failures('bridge', files)[0])

    def test_bridge_file_must_import_agents_first(self):
        self.write('apps/app/CLAUDE.md', '# Claude\n\n@AGENTS.md\n')
        self.assertIn("'# Claude', not @AGENTS.md", self.failures('bridge')[0])

    def test_symlink_must_target_agents(self):
        self.write('README.md', '# Readme\n')
        self.link('CLAUDE.md', 'README.md')
        self.assertIn("points to 'README.md'", self.failures('bridge')[0])


class Unicode(Fixture):
    def test_every_listed_range_is_rejected(self):
        for character in ['\u200b', '\u200f', '\u202a', '\u202e', '\u2060', '\u2064', '\u2066', '\u2069', '\ufeff']:
            self.write('apps/app/AGENTS.md', APP + f'Hidden{character}text.\n')
            failures = self.failures('unicode')
            self.assertEqual(len(failures), 1, hex(ord(character)))
            self.assertIn(f'U+{ord(character):04X}', failures[0])

    def test_agent_directories_and_rule_files_are_scanned(self):
        for name in ['.claude/settings.json', 'apps/app/.openhands/skills/x.md', '.agents/skills/y.md', '.cursorrules', 'apps/app/CLAUDE.md']:
            self.write(name, '@AGENTS.md\nline\u200d\n')
        failures = self.failures('unicode')
        self.assertEqual(len(failures), 5)
        self.assertIn('.agents/skills/y.md: [unicode] line 2 column 5', ''.join(failures))

    def test_other_files_and_visible_unicode_are_allowed(self):
        self.write('docs/page.md', 'zero\u200bwidth\n')
        self.write('apps/app/AGENTS.md', APP + 'Arrows \u2192 and dashes \u2014 are fine.\n')
        self.assertEqual(self.failures('unicode'), [])


class Duplication(Fixture):
    def test_shared_sentence_fails_even_when_wrapped_differently(self):
        self.write('AGENTS.md', ROOT + '\nA deterministic demo must say so and never invent model calls.\n')
        self.write('apps/app/AGENTS.md', APP + '\n- A deterministic  demo must say so\n  and never invent model calls.\n')
        failures = self.failures('duplication')
        self.assertEqual(len(failures), 1)
        self.assertIn('"A deterministic demo must say so and never invent model calls."', failures[0])

    def test_short_sentences_may_repeat(self):
        self.write('AGENTS.md', ROOT + '\nTrunk is `development`. Use conventional commits.\n')
        self.write('apps/app/AGENTS.md', APP + '\nTrunk is `development`. Use conventional commits.\n')
        self.assertEqual(self.failures('duplication'), [])

    def test_sentences_split_on_blocks(self):
        found = agents.sentences('# Heading words one two three four five six\n\nFirst sentence has exactly eight words in it. Short one.\n\n| a | b |\n')
        self.assertIn('First sentence has exactly eight words in it.', found)
        self.assertNotIn('Short one.', found)


if __name__ == '__main__':
    unittest.main()
