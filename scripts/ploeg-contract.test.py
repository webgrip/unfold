import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('ploeg_contract', Path(__file__).with_name('ploeg-contract.py'))
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)

COMMIT = 'a' * 40
TOKEN = 'anonymous-pull'


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def archive(files):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:gz') as bundle:
        for name, content in files.items():
            data = content.encode()
            member = tarfile.TarInfo(name)
            member.size = len(data)
            bundle.addfile(member, io.BytesIO(data))
    return buffer.getvalue()


def bundle(version, extra=None):
    files = {
        'ploeg-contract.json': json.dumps({'schemaVersion': 1, 'name': 'ploeg-contract', 'version': version, 'commit': COMMIT}),
        'files.txt': 'docs/contracts/operator-api.v1.schema.json\npkg/store/store_test.go\n',
        'docs/contracts/operator-api.v1.schema.json': '{"enum": ["queued"]}',
    }
    files.update(extra or {})
    return archive(files)


def manifest(layer, artifact_type=contract.ARTIFACT_TYPE):
    return json.dumps({
        'schemaVersion': 2,
        'mediaType': 'application/vnd.oci.image.manifest.v1+json',
        'artifactType': artifact_type,
        'config': {'mediaType': 'application/vnd.oci.empty.v1+json', 'digest': digest(b'{}'), 'size': 2},
        'layers': [{'mediaType': contract.LAYER_TYPE, 'digest': digest(layer), 'size': len(layer)}],
    }).encode()


class FakeRegistry:
    def __init__(self):
        self.blobs, self.tags, self.requests = {}, {}, []
        registry = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                registry.requests.append(self.path)
                if self.path.startswith('/token'):
                    return self.reply(200, json.dumps({'token': TOKEN}).encode())
                if self.headers.get('Authorization') != f'Bearer {TOKEN}':
                    self.send_response(401)
                    self.send_header('WWW-Authenticate', f'Bearer realm="http://{self.headers["Host"]}/token",service="fake",scope="repository:ploeg-hq/ploeg-contract:pull"')
                    self.end_headers()
                    return
                prefix = '/v2/ploeg-hq/ploeg-contract/'
                path = self.path[len(prefix):]
                if path.startswith('tags/list'):
                    return self.reply(200, json.dumps({'tags': list(registry.tags)}).encode())
                kind, _, reference = path.partition('/')
                reference = registry.tags.get(reference, reference) if kind == 'manifests' else reference
                body = registry.blobs.get(reference)
                return self.reply(200, body) if body is not None else self.reply(404, b'{}')

            def reply(self, status, body):
                self.send_response(status)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def publish(self, version, layer, artifact_type=contract.ARTIFACT_TYPE):
        body = manifest(layer, artifact_type)
        self.blobs[digest(body)] = body
        self.blobs[digest(layer)] = layer
        self.tags[version] = digest(body)
        return digest(body)

    def client(self):
        return contract.Registry(mirror=f'127.0.0.1:{self.server.server_port}/ploeg-hq')

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class Checkout(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / contract.GO_MODULE).mkdir(parents=True)
        self.registry = FakeRegistry()
        self.addCleanup(self.registry.close)

    def pin(self, version, pinned):
        (self.root / contract.PIN).write_text(json.dumps({'contract': f'{contract.REPOSITORY}:{version}@{pinned}'}))
        (self.root / contract.GO_MODULE / 'go.mod').write_text(f'module example.invalid/demo\n\ngo 1.26.0\n\nrequire {contract.MODULE} v{version}\n')

    def test_fetch_unpacks_the_pinned_bundle_once_and_the_checks_pass(self):
        pinned = self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25'))
        self.pin('0.2.0-rc.25', pinned)
        self.assertEqual(contract.fetch(self.root, self.registry.client()), ('0.2.0-rc.25', pinned, True))
        self.assertTrue((self.root / contract.UNPACKED / 'docs/contracts/operator-api.v1.schema.json').is_file())
        self.assertTrue(any(request.startswith('/token?') for request in self.registry.requests), 'the client answers the registry\'s bearer challenge anonymously')
        self.assertEqual(contract.fetch(self.root, self.registry.client()), ('0.2.0-rc.25', pinned, False))
        self.assertEqual(contract.problems(self.root, self.registry.client()), [])

    def test_a_bundle_whose_bytes_differ_from_the_pin_is_refused(self):
        pinned = self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25'))
        self.pin('0.2.0-rc.25', 'sha256:' + '0' * 64)
        self.registry.blobs['sha256:' + '0' * 64] = self.registry.blobs[pinned]
        with self.assertRaisesRegex(contract.ContractError, 'not the pinned'):
            contract.fetch(self.root, self.registry.client())
        layer = json.loads(self.registry.blobs[pinned])['layers'][0]['digest']
        self.registry.blobs[layer] = bundle('0.2.0-rc.25', {'docs/extra.md': 'tampered'})
        self.pin('0.2.0-rc.25', pinned)
        with self.assertRaisesRegex(contract.ContractError, 'does not match its manifest'):
            contract.fetch(self.root, self.registry.client())
        self.assertFalse((self.root / contract.UNPACKED).exists())

    def test_an_artifact_that_is_not_a_contract_bundle_is_refused(self):
        self.pin('0.2.0-rc.25', self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25'), artifact_type='application/vnd.cncf.helm.config.v1+json'))
        with self.assertRaisesRegex(contract.ContractError, 'not a Ploeg contract bundle'):
            contract.fetch(self.root, self.registry.client())

    def test_a_bundle_that_escapes_its_directory_or_names_another_version_is_refused(self):
        self.pin('0.2.0-rc.25', self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25', {'../outside.txt': 'x'})))
        with self.assertRaisesRegex(contract.ContractError, 'unsafe entry'):
            contract.fetch(self.root, self.registry.client())
        self.assertFalse((self.root / 'apps/outside.txt').exists())
        self.pin('0.2.0-rc.26', self.registry.publish('0.2.0-rc.26', bundle('0.2.0-rc.25')))
        with self.assertRaisesRegex(contract.ContractError, "describes Ploeg '0.2.0-rc.25', not 0.2.0-rc.26"):
            contract.fetch(self.root, self.registry.client())

    def test_the_retired_submodule_checkout_is_named_and_left_alone(self):
        self.pin('0.2.0-rc.25', self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25')))
        old = self.root / contract.UNPACKED
        old.mkdir(parents=True)
        (old / '.git').write_text('gitdir: ../../.git/modules/apps/ploeg\n')
        with self.assertRaisesRegex(contract.ContractError, 'retired Ploeg submodule.*rm -rf apps/ploeg'):
            contract.fetch(self.root, self.registry.client())
        self.assertTrue((old / '.git').is_file())

    def test_the_checks_name_a_go_module_on_another_release_a_missing_bundle_and_a_moved_tag(self):
        pinned = self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25'))
        self.pin('0.2.0-rc.25', pinned)
        (self.root / contract.GO_MODULE / 'go.mod').write_text(f'module example.invalid/demo\n\nrequire (\n\t{contract.MODULE} v0.2.0-rc.24\n)\n')
        found = contract.problems(self.root)
        self.assertIn(f'{contract.GO_MODULE}/go.mod requires {contract.MODULE} v0.2.0-rc.24, but {contract.PIN} pins the contract of 0.2.0-rc.25; move both to one release', found)
        self.assertIn(f'{contract.UNPACKED} does not hold the pinned contract bundle 0.2.0-rc.25; run mise run ploeg-contract', found)
        self.pin('0.2.0-rc.25', pinned)
        contract.fetch(self.root, self.registry.client())
        moved = self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25', {'docs/late.md': 'retagged'}))
        self.assertEqual(contract.problems(self.root, self.registry.client()), [f'{self.registry.client().reference}:0.2.0-rc.25 is {moved}, but {contract.PIN} pins {pinned}; pin the published bundle'])
        self.assertEqual(contract.problems(self.root), [])

    def test_a_malformed_pin_says_what_it_must_hold(self):
        (self.root / contract.PIN).write_text(json.dumps({'contract': 'ghcr.io/someone-else/ploeg-contract:0.2.0@sha256:' + '0' * 64}))
        self.assertRegex(contract.problems(self.root)[0], r'must hold \{"contract": "ghcr\.io/ploeg-hq/ploeg-contract:')

    def test_the_newest_release_orders_candidates_before_their_stable_version(self):
        for version in ['0.2.0-rc.9', '0.2.0', '0.2.0-rc.10', '0.1.9', 'latest', '0.2.1-rc.1', 'sha256-abc.sig']:
            self.registry.tags[version] = 'sha256:' + '0' * 64
        self.assertEqual(self.registry.client().versions(), ['0.1.9', '0.2.0-rc.9', '0.2.0-rc.10', '0.2.0', '0.2.1-rc.1'])


    def test_behind_names_a_newer_release_and_passes_on_the_newest(self):
        pinned = self.registry.publish('0.2.0-rc.27', bundle('0.2.0-rc.27'))
        self.pin('0.2.0-rc.27', pinned)
        self.assertIsNone(contract.behind(self.root, self.registry.client()))
        self.registry.tags['0.2.0-rc.9'] = 'sha256:' + '0' * 64
        self.assertIsNone(contract.behind(self.root, self.registry.client()), 'rc.9 sorts below rc.27')
        self.registry.publish('0.2.0-rc.28', bundle('0.2.0-rc.28'))
        self.assertRegex(contract.behind(self.root, self.registry.client()), r'pins Ploeg 0\.2\.0-rc\.27, but 0\.2\.0-rc\.28 is the newest release')
        self.registry.tags['0.2.0'] = 'sha256:' + '0' * 64
        self.assertRegex(contract.behind(self.root, self.registry.client()), r'but 0\.2\.0 is the newest release')

if __name__ == '__main__':
    unittest.main()
