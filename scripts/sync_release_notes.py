import base64
import json
import os
from pathlib import Path

from publish_release import git


ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'docs/research/2026-09-12-glide-import.json'
DESTINATION = 'https://github.com/webgrip/glide.git'


def imported_notes(manifest=MANIFEST):
    data = json.loads(Path(manifest).read_text(encoding='utf-8'))
    return {note['destination']: note['object'] for app in data['applications'] for note in app.get('notes', [])}


def local_notes():
    listing = git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/notes/')
    return dict(line.split(' ', 1) for line in listing.splitlines() if line)


def require_imported_notes(expected, actual):
    wrong = sorted(ref for ref, value in expected.items() if actual.get(ref) != value)
    if not expected or wrong:
        raise SystemExit(f'Refusing to prune GitHub notes: origin lacks {len(wrong)} of {len(expected)} imported release notes, e.g. {", ".join(wrong[:3])}')


def main():
    git('fetch', 'origin', '+refs/notes/*:refs/notes/*')
    require_imported_notes(imported_notes(), local_notes())
    authorization = base64.b64encode(('x-access-token:' + os.environ['GHCR_TOKEN']).encode()).decode()
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_CONFIG_COUNT': '2', 'GIT_CONFIG_KEY_0': 'http.https://github.com/.extraheader', 'GIT_CONFIG_VALUE_0': 'AUTHORIZATION: basic ' + authorization, 'GIT_CONFIG_KEY_1': 'credential.helper', 'GIT_CONFIG_VALUE_1': ''}
    git('push', '--prune', DESTINATION, '+refs/notes/*:refs/notes/*', env=env)
    print('Mirrored semantic-release channel notes to GitHub')


if __name__ == '__main__':
    main()
