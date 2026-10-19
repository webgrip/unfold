import argparse
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIN = 'apps/unfold/ploeg-release.json'
GO_MODULE = 'apps/unfold/scripts/unified-demo'
UNPACKED = 'apps/ploeg'
STAMP = '.ploeg-contract-digest'
REPOSITORY = 'ghcr.io/ploeg-hq/ploeg-contract'
MODULE = 'github.com/ploeg-hq/ploeg'
ARTIFACT_TYPE = 'application/vnd.ploeg.contract.v1+json'
LAYER_TYPE = 'application/vnd.ploeg.contract.layer.v1.tar+gzip'
MANIFEST_TYPES = 'application/vnd.oci.image.manifest.v1+json'
VERSION = re.compile(r'^0\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.([1-9][0-9]*))?$')
REFERENCE = re.compile(r'^(?P<repository>[^:@\s]+):(?P<version>[^@\s]+)@(?P<digest>sha256:[0-9a-f]{64})$')
MAX_BUNDLE_BYTES = 64 * 1024 * 1024


class ContractError(Exception):
    pass


def version_key(version):
    match = VERSION.match(version)
    minor, patch, candidate = int(match[1]), int(match[2]), match[4]
    return (minor, patch, 1 if candidate is None else 0, int(candidate or 0))


def read_pin(root):
    path = root / PIN
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        raise ContractError(f'{PIN} is missing; it pins the Ploeg release Unfold depends on')
    match = REFERENCE.match(data.get('contract', '')) if isinstance(data, dict) else None
    if not match or match['repository'] != REPOSITORY or not VERSION.match(match['version']):
        raise ContractError(f'{PIN} must hold {{"contract": "{REPOSITORY}:<0.x.y or 0.x.y-rc.N>@sha256:<digest>"}}')
    return match['version'], match['digest']


def module_version(root):
    go_mod = (root / GO_MODULE / 'go.mod').read_text()
    match = re.search(rf'^\s*(?:require\s+)?{re.escape(MODULE)}\s+(v\S+)', go_mod, re.M)
    if not match:
        raise ContractError(f'{GO_MODULE}/go.mod does not require {MODULE}')
    return match[1]


class Registry:
    def __init__(self, repository=REPOSITORY, mirror=None):
        mirror = mirror if mirror is not None else os.environ.get('UNFOLD_PLOEG_CONTRACT_REGISTRY')
        if mirror:
            repository = mirror.rstrip('/') + '/' + repository.rsplit('/', 1)[1]
        host, _, self.name = repository.partition('/')
        local = host.split(':')[0] in {'localhost', '127.0.0.1'}
        self.base = f'{"http" if local else "https"}://{host}/v2/{self.name}'
        self.reference = repository
        self.token = None

    def request(self, url, accept=None):
        request = urllib.request.Request(url, headers={'Accept': accept} if accept else {})
        if self.token:
            request.add_unredirected_header('Authorization', f'Bearer {self.token}')
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read(MAX_BUNDLE_BYTES + 1)
        except urllib.error.HTTPError as error:
            challenge = error.headers.get('WWW-Authenticate', '')
            error.close()
            if error.code == 401 and not self.token and challenge.lower().startswith('bearer '):
                self.token = anonymous_token(challenge)
                return self.request(url, accept)
            raise ContractError(f'{url} answered HTTP {error.code}') from error
        except urllib.error.URLError as error:
            raise ContractError(f'{url} is unreachable: {error.reason}') from error

    def manifest(self, reference):
        return self.request(f'{self.base}/manifests/{reference}', MANIFEST_TYPES)

    def blob(self, digest):
        return self.request(f'{self.base}/blobs/{digest}')

    def versions(self):
        tags = json.loads(self.request(f'{self.base}/tags/list?n=1000')).get('tags') or []
        return sorted((tag for tag in tags if VERSION.match(tag)), key=version_key)


def anonymous_token(challenge):
    fields = dict(re.findall(r'(\w+)="([^"]*)"', challenge))
    query = urllib.parse.urlencode({key: fields[key] for key in ('service', 'scope') if key in fields})
    with urllib.request.urlopen(f'{fields["realm"]}?{query}', timeout=60) as response:
        body = json.loads(response.read())
    return body.get('token') or body.get('access_token')


def sha256(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def bundle_layer(manifest_bytes, digest):
    if sha256(manifest_bytes) != digest:
        raise ContractError(f'the registry sent a manifest whose digest is {sha256(manifest_bytes)}, not the pinned {digest}')
    manifest = json.loads(manifest_bytes)
    if manifest.get('artifactType') != ARTIFACT_TYPE:
        raise ContractError(f'{digest} is a {manifest.get("artifactType")!r}, not a Ploeg contract bundle ({ARTIFACT_TYPE})')
    layers = manifest.get('layers') or []
    if len(layers) != 1 or layers[0].get('mediaType') != LAYER_TYPE:
        raise ContractError(f'{digest} must carry exactly one {LAYER_TYPE} layer')
    if not 0 < layers[0].get('size', 0) <= MAX_BUNDLE_BYTES:
        raise ContractError(f'{digest} declares a layer of {layers[0].get("size")} bytes')
    return layers[0]


def verified_layer(registry, digest):
    layer = bundle_layer(registry.manifest(digest), digest)
    data = registry.blob(layer['digest'])
    if len(data) != layer['size'] or sha256(data) != layer['digest']:
        raise ContractError(f'the bundle layer does not match its manifest ({layer["digest"]}, {layer["size"]} bytes)')
    return data


def extract(archive, destination):
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as bundle:
        for member in bundle.getmembers():
            parts = Path(member.name).parts
            if member.name.startswith('/') or '..' in parts or not (member.isfile() or member.isdir()):
                raise ContractError(f'the bundle holds an unsafe entry: {member.name}')
        if hasattr(tarfile, 'data_filter'):
            bundle.extractall(destination, filter='data')
        else:
            bundle.extractall(destination)


def install(root, archive, version, digest):
    target = root / UNPACKED
    if target.exists() and not (target / STAMP).is_file():
        hint = 'It is the checkout of the retired Ploeg submodule. ' if (target / '.git').exists() else ''
        raise ContractError(f'{UNPACKED} exists but holds no unpacked Ploeg contract bundle. {hint}Remove it (rm -rf {UNPACKED}) and run this again.')
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.ploeg-contract-', dir=target.parent))
    try:
        extract(archive, staging)
        described = json.loads((staging / 'ploeg-contract.json').read_text())
        if described.get('version') != version or not re.fullmatch(r'[0-9a-f]{40}', described.get('commit', '')):
            raise ContractError(f'the bundle describes Ploeg {described.get("version")!r}, not {version}')
        (staging / STAMP).write_text(f'{digest}\n')
        if target.exists():
            shutil.rmtree(target)
        staging.rename(target)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def installed(root):
    stamp = root / UNPACKED / STAMP
    if not stamp.is_file():
        return None, None
    described = json.loads((root / UNPACKED / 'ploeg-contract.json').read_text())
    return described.get('version'), stamp.read_text().strip()


def fetch(root, registry, version=None, digest=None):
    if version is None:
        version, digest = read_pin(root)
    if digest is None:
        digest = sha256(registry.manifest(version))
    if installed(root) == (version, digest):
        return version, digest, False
    install(root, verified_layer(registry, digest), version, digest)
    return version, digest, True


def problems(root, registry=None):
    found = []
    try:
        version, digest = read_pin(root)
    except ContractError as error:
        return [str(error)]
    try:
        module = module_version(root)
        if module != f'v{version}':
            found.append(f'{GO_MODULE}/go.mod requires {MODULE} {module}, but {PIN} pins the contract of {version}; move both to one release')
    except (ContractError, FileNotFoundError) as error:
        found.append(str(error))
    if installed(root) != (version, digest):
        found.append(f'{UNPACKED} does not hold the pinned contract bundle {version}; run mise run ploeg-contract')
    if registry is not None:
        try:
            published = sha256(registry.manifest(version))
            if published != digest:
                found.append(f'{registry.reference}:{version} is {published}, but {PIN} pins {digest}; pin the published bundle')
        except ContractError as error:
            found.append(f'could not resolve {registry.reference}:{version} ({error}); publish the Ploeg release first, then pin it')
    return found


def behind(root, registry):
    pinned, _ = read_pin(root)
    published = registry.versions()
    if not published:
        raise ContractError(f'{registry.reference} lists no release')
    newest = published[-1]
    if version_key(pinned) < version_key(newest):
        return f'{PIN} pins Ploeg {pinned}, but {newest} is the newest release; the pull request Ploeg\'s release opened for it has not merged (docs/operations/ci.md#the-ploeg-pin-pull-request)'
    return None


def pin(root, registry, version):
    if not VERSION.match(version):
        raise ContractError(f'{version} is not a Ploeg release version such as 0.2.0 or 0.2.0-rc.1')
    digest = sha256(registry.manifest(version))
    (root / PIN).write_text(json.dumps({'contract': f'{REPOSITORY}:{version}@{digest}'}, indent=2) + '\n')
    subprocess.run(['go', 'get', f'{MODULE}@v{version}'], cwd=root / GO_MODULE, check=True)
    subprocess.run(['go', 'mod', 'tidy'], cwd=root / GO_MODULE, check=True)
    return digest


def main(argv=None):
    parser = argparse.ArgumentParser(description='Fetch, check or move the released Ploeg that Unfold depends on.')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('fetch', help=f'unpack the pinned contract bundle into {UNPACKED}, verifying its digest')
    check = commands.add_parser('check', help='fail when the pin, the Go module and the unpacked bundle disagree')
    check.add_argument('--published', action='store_true', help='also require the registry tag to still be the pinned digest')
    moved = commands.add_parser('pin', help='pin a published release: the bundle digest and the Go module')
    moved.add_argument('version')
    unpinned = commands.add_parser('fetch-unpinned', help='unpack a release by tag, or a locally built archive, without the pin; for the weekly ploeg-ahead check only')
    unpinned.add_argument('version', help='a release version, or "latest"')
    unpinned.add_argument('--archive', type=Path, help='a bundle built by Ploeg\'s scripts/contract-bundle.sh build')
    commands.add_parser('latest', help='print the newest published release')
    commands.add_parser('behind', help='fail when a newer release is published than the one pinned; the nightly ploeg-behind check')
    args = parser.parse_args(argv)
    registry = Registry()
    try:
        if args.command == 'fetch':
            version, digest, changed = fetch(ROOT, registry)
            print(f'Ploeg contract {version} ({digest}) {"unpacked into" if changed else "already in"} {UNPACKED}')
        elif args.command == 'check':
            found = problems(ROOT, registry if args.published else None)
            if found:
                sys.exit('Ploeg dependency check failed:\n' + '\n'.join(f'- {problem}' for problem in found))
            version, digest = read_pin(ROOT)
            print(f'Ploeg {version}: contract {digest} and Go module v{version}{", published" if args.published else ""}')
        elif args.command == 'pin':
            digest = pin(ROOT, registry, args.version)
            fetch(ROOT, registry)
            print(f'Pinned Ploeg {args.version}: {REPOSITORY}:{args.version}@{digest}')
        elif args.command == 'fetch-unpinned':
            version = registry.versions()[-1] if args.version == 'latest' else args.version
            if args.archive:
                archive = args.archive.read_bytes()
                digest = sha256(archive)
                if installed(ROOT) != (version, digest):
                    install(ROOT, archive, version, digest)
            else:
                version, digest, _ = fetch(ROOT, registry, version)
            print(f'Unpinned Ploeg contract {version} ({digest}) in {UNPACKED}')
        elif args.command == 'latest':
            print(registry.versions()[-1])
        elif args.command == 'behind':
            lag = behind(ROOT, registry)
            if lag:
                sys.exit(f'Ploeg contract: {lag}')
            print(f'Ploeg {read_pin(ROOT)[0]} is the newest release')
    except ContractError as error:
        sys.exit(f'Ploeg contract: {error}')


if __name__ == '__main__':
    main()
