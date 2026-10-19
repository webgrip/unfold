import hashlib
import importlib.util
import io
import json
import os
import stat
import tarfile
import tempfile
import threading
import unittest
import unittest.mock
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('ploeg_contract', Path(__file__).with_name('ploeg-contract.py'))
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)

COMMIT = 'a' * 40
CHART_YAML = '''apiVersion: v2
name: unfold
version: 0.4.0-rc.101
appVersion: 0.4.0-rc.101
dependencies:
  - name: other
    version: 9.9.9
    repository: oci://example.invalid/charts
  - name: ploeg
    version: {version}
    repository: {repository}
    condition: ploeg.enabled
'''
CHART_LOCK = '''dependencies:
- name: ploeg
  repository: {repository}
  version: {version}
digest: sha256:{digest}
generated: "2026-10-19T00:00:00Z"
'''
FAKE_HELM = '''#!/usr/bin/env python3
import json, os, pathlib, re, sys
chart = pathlib.Path(sys.argv[-1])
version = re.search(r'name: ploeg\\n\\s+version: (\\S+)', (chart / 'Chart.yaml').read_text())[1]
registry = json.loads(pathlib.Path(os.environ['HELM_REGISTRY_CONFIG']).read_text())
pathlib.Path(os.environ['FAKE_HELM_LOG']).write_text(json.dumps({'args': sys.argv[1:], 'registry': registry, 'docker': os.environ['DOCKER_CONFIG'] == str(pathlib.Path(os.environ['HELM_REGISTRY_CONFIG']).parent)}))
(chart / 'Chart.lock').write_text(f'dependencies:\\n- name: ploeg\\n  repository: oci://ghcr.io/ploeg-hq/charts\\n  version: {version}\\ndigest: sha256:fake\\n')
'''
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
        self.chart(version)

    def chart(self, version, lock=None, repository=contract.CHART_REPOSITORY):
        chart = self.root / contract.CHART
        chart.mkdir(parents=True, exist_ok=True)
        (chart / 'Chart.yaml').write_text(CHART_YAML.format(version=version, repository=repository))
        (chart / 'Chart.lock').write_text(CHART_LOCK.format(version=lock or version, repository=repository, digest='0' * 64))

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

    def test_the_check_names_a_chart_dependency_or_lock_on_another_release(self):
        pinned = self.registry.publish('0.2.0-rc.25', bundle('0.2.0-rc.25'))
        self.pin('0.2.0-rc.25', pinned)
        contract.fetch(self.root, self.registry.client())
        self.assertEqual(contract.problems(self.root), [])
        self.chart('0.2.0-rc.24')
        found = contract.problems(self.root)
        self.assertIn(f'{contract.CHART}/Chart.yaml depends on the ploeg chart 0.2.0-rc.24, but {contract.PIN} pins 0.2.0-rc.25; move both with mise run ploeg-pin 0.2.0-rc.25', found)
        self.assertIn(f'{contract.CHART}/Chart.lock depends on the ploeg chart 0.2.0-rc.24, but {contract.PIN} pins 0.2.0-rc.25; move both with mise run ploeg-pin 0.2.0-rc.25', found)
        self.chart('0.2.0-rc.25', lock='0.2.0-rc.24')
        self.assertEqual(contract.problems(self.root), [f'{contract.CHART}/Chart.lock depends on the ploeg chart 0.2.0-rc.24, but {contract.PIN} pins 0.2.0-rc.25; move both with mise run ploeg-pin 0.2.0-rc.25'])
        self.chart('0.2.0-rc.25', repository='oci://example.invalid/ploeg-hq/charts')
        self.assertEqual(len([problem for problem in contract.problems(self.root) if 'takes ploeg from oci://example.invalid/ploeg-hq/charts' in problem]), 2)
        (self.root / contract.CHART / 'Chart.yaml').write_text('apiVersion: v2\nname: unfold\nversion: 0.4.0-rc.101\n')
        (self.root / contract.CHART / 'Chart.lock').unlink()
        self.assertEqual(contract.problems(self.root), [
            f'{contract.CHART}/Chart.yaml lists no ploeg dependency; the Unfold chart carries the Ploeg release it was tested with (system ADR-0043)',
            f'{contract.CHART}/Chart.lock is missing; run mise run ploeg-pin 0.2.0-rc.25',
        ])

    def test_pin_moves_the_chart_dependency_and_its_lock_with_the_other_two_pins(self):
        pinned = self.registry.publish('0.2.0-rc.26', bundle('0.2.0-rc.26'))
        self.pin('0.2.0-rc.25', 'sha256:' + '0' * 64)
        tools = Path(self.temp.name) / 'bin'
        tools.mkdir()
        for name, script in [('helm', FAKE_HELM), ('go', '#!/bin/sh\nexit 0\n')]:
            (tools / name).write_text(script)
            (tools / name).chmod(stat.S_IRWXU)
        log = Path(self.temp.name) / 'helm.json'
        environment = {'PATH': f'{tools}{os.pathsep}{os.environ["PATH"]}', 'FAKE_HELM_LOG': str(log)}
        with unittest.mock.patch.dict(os.environ, environment):
            self.assertEqual(contract.pin(self.root, self.registry.client(), '0.2.0-rc.26'), pinned)
        chart = (self.root / contract.CHART / 'Chart.yaml').read_text()
        self.assertEqual(chart, CHART_YAML.format(version='0.2.0-rc.26', repository=contract.CHART_REPOSITORY), 'only the ploeg dependency moves; the chart\'s own version and other dependencies stay')
        self.assertEqual(contract.chart_dependency((self.root / contract.CHART / 'Chart.lock').read_text())['version'], '0.2.0-rc.26')
        helm = json.loads(log.read_text())
        self.assertEqual(helm['args'], ['dependency', 'update', contract.CHART])
        self.assertEqual(helm['registry'], {'auths': {'ghcr.io': {}}}, 'the public chart is pulled anonymously, never with a stale local credential')
        self.assertTrue(helm['docker'])

    def test_pin_refuses_a_chart_that_does_not_take_ploeg_from_its_registry(self):
        self.registry.publish('0.2.0-rc.26', bundle('0.2.0-rc.26'))
        self.pin('0.2.0-rc.25', 'sha256:' + '0' * 64)
        self.chart('0.2.0-rc.25', repository='oci://example.invalid/charts')
        with self.assertRaisesRegex(contract.ContractError, 'must list ploeg from oci://ghcr.io/ploeg-hq/charts'):
            contract.move_chart_dependency(self.root, '0.2.0-rc.26')


if __name__ == '__main__':
    unittest.main()
