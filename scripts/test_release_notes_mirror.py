import os
import re
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import sync_release_notes


ROOT = Path(__file__).resolve().parent.parent
SELF = Path(__file__).resolve().relative_to(ROOT).as_posix()
MIRROR = 'scripts/sync_release_notes.py'
SCANNED = re.compile(r'^(?:\.forgejo/|scripts/|apps/[^/]+/(?:scripts|\.forgejo|ops)/|(?:apps/[^/]+/)?(?:mise\.toml|package\.json|Makefile))')
PUSH = re.compile(r'\bpush\b')
PRUNING = re.compile(r'--(?:prune|mirror|delete)\b|\s:refs/|["\']:refs/')


def tracked():
    listing = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [name for name in listing.split('\0') if name and SCANNED.match(name) and name != SELF and (ROOT / name).is_file()]


class ImportedNotesGuard(unittest.TestCase):
    def test_manifest_lists_the_imported_notes(self):
        notes = sync_release_notes.imported_notes()
        self.assertEqual(len(notes), 67)
        self.assertTrue(all(ref.startswith('refs/notes/semantic-release-') for ref in notes))

    def test_empty_or_partial_origin_blocks_the_mirror(self):
        expected = {'refs/notes/a': '1', 'refs/notes/b': '2'}
        for actual in [{}, {'refs/notes/a': '1'}, {'refs/notes/a': '1', 'refs/notes/b': '3'}]:
            with self.assertRaises(SystemExit):
                sync_release_notes.require_imported_notes(expected, actual)
        with self.assertRaises(SystemExit):
            sync_release_notes.require_imported_notes({}, {})

    def test_new_release_notes_may_join_the_imported_set(self):
        sync_release_notes.require_imported_notes({'refs/notes/a': '1'}, {'refs/notes/a': '1', 'refs/notes/new': '9'})

    def test_mirror_never_pushes_when_origin_has_no_notes(self):
        calls = []

        def git(*args, env=None, input=None):
            calls.append(args)
            return ''

        with patch.object(sync_release_notes, 'git', git), patch.dict(os.environ, {'GHCR_TOKEN': 'unused'}):
            with self.assertRaises(SystemExit):
                sync_release_notes.main()
        self.assertEqual([call[0] for call in calls], ['fetch', 'for-each-ref'])


class NoWorkflowPrunesOrigin(unittest.TestCase):
    def test_only_the_github_notes_mirror_prunes_and_only_after_the_guard(self):
        offenders = []
        for name in tracked():
            for number, line in enumerate((ROOT / name).read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                if PUSH.search(line) and PRUNING.search(line) and name != MIRROR:
                    offenders.append(f'{name}:{number}: {line.strip()}')
        self.assertEqual(offenders, [], 'Only scripts/sync_release_notes.py may push with --prune, --mirror, --delete or a deleting refspec')
        text = (ROOT / MIRROR).read_text(encoding='utf-8')
        pushes = [line for line in text.splitlines() if PUSH.search(line) and 'git(' in line]
        self.assertEqual(len(pushes), 1)
        self.assertIn('DESTINATION', pushes[0])
        self.assertEqual(sync_release_notes.DESTINATION, 'https://github.com/webgrip/glide.git')
        self.assertLess(text.index('require_imported_notes(imported_notes()'), text.index(pushes[0].strip()))

    def test_no_script_or_workflow_pushes_notes_to_origin(self):
        offenders = []
        for name in tracked():
            for number, line in enumerate((ROOT / name).read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                if PUSH.search(line) and 'refs/notes' in line and name != MIRROR:
                    offenders.append(f'{name}:{number}: {line.strip()}')
        self.assertEqual(offenders, [])


if __name__ == '__main__':
    unittest.main()
