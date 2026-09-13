import hashlib
import os
import sys
from pathlib import Path

from publish_release import FORGEJO, api, fetch_asset, release_tag
from release_registry import require_same


version = sys.argv[1]
tag = release_tag('vloer', version)
token = os.environ['WEBGRIP_CI_TOKEN']
release = api(f'{FORGEJO}/releases/tags/{tag}', token)
name = f'de-vloer-{version}.vsix'
assets = {a['name']: a for a in release['assets']}
content = fetch_asset(assets[name], token)
checksum = fetch_asset(assets[name + '.sha256'], token).decode().strip()
require_same(checksum.split(), [hashlib.sha256(content).hexdigest(), name], 'canonical VSIX checksum')
(Path('apps/vloer/extensions/vscode') / name).write_bytes(content)
