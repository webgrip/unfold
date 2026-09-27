import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SELF = Path(__file__).resolve().relative_to(ROOT).as_posix()
SCANNED = re.compile(r'^(?:\.forgejo/|scripts/|apps/[^/]+/(?:scripts|\.forgejo|ops)/|(?:apps/[^/]+/)?(?:mise\.toml|package\.json|Makefile))')
PUSH = re.compile(r'\bpush\b')
PRUNING = re.compile(r'--(?:prune|mirror|delete)\b|\s:refs/|["\']:refs/')


def tracked():
    listing = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [name for name in listing.split('\0') if name and SCANNED.match(name) and name != SELF and (ROOT / name).is_file()]


def offending_lines(matches):
    offenders = []
    for name in tracked():
        for number, line in enumerate((ROOT / name).read_text(encoding='utf-8', errors='replace').splitlines(), 1):
            if PUSH.search(line) and matches(line):
                offenders.append(f'{name}:{number}: {line.strip()}')
    return offenders


class NoAutomationDeletesOrRewritesReleaseRefs(unittest.TestCase):
    def test_nothing_pushes_with_prune_mirror_delete_or_a_deleting_refspec(self):
        self.assertEqual(offending_lines(PRUNING.search), [])

    def test_nothing_pushes_release_channel_notes(self):
        self.assertEqual(offending_lines(lambda line: 'refs/notes' in line), [])


if __name__ == '__main__':
    unittest.main()
