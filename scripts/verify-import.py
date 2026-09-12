import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'docs/research/2026-09-12-glide-import.json').read_text())


def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)


for app in manifest['applications']:
    for commit in [app['sourceHead'], app['snapshotCommit'], app['relocationCommit']]:
        git('merge-base', '--is-ancestor', commit, 'HEAD')
    for tag in app['tags']:
        actual = git('rev-parse', 'refs/tags/' + tag['destination']).decode().strip()
        assert actual == tag['object'], tag['destination']
    for note in app.get('notes', []):
        assert git('rev-parse', note['destination']).decode().strip() == note['object'], note['destination']
    archive = git('archive', '--format=tar', app['relocationCommit'], app['prefix'])
    actual = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        for entry in source:
            if entry.isdir():
                continue
            content = entry.linkname.encode() if entry.issym() else source.extractfile(entry).read()
            mode = '120000' if entry.issym() else '100755' if entry.mode & 0o111 else '100644'
            name = entry.name.removeprefix(app['prefix'])
            actual[name] = {'path': name, 'mode': mode, 'sha256': hashlib.sha256(content).hexdigest()}
    expected = {entry['path']: entry for entry in app['files']}
    assert actual == expected, f"{app['name']}: imported tree differs from input snapshot"
    print(f"{app['name']}: {len(actual)} exact files, {len(app['tags'])} exact tag objects, source history reachable")
