import copy
import json
import os
import tempfile
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch

import publish_release
import release_registry
from release_registry import SafeRedirect, copy_chart, copy_image, digest, verify_image


class MemoryRegistry:
    def __init__(self, host='source'):
        self.host = host
        self.manifests = {}
        self.blobs = {}
        self.writes = []

    def manifest(self, repository, reference, missing=False):
        if (repository, reference) not in self.manifests and not missing:
            raise RuntimeError('missing fixture manifest')
        return self.manifests.get((repository, reference))

    def blob(self, repository, reference):
        return self.blobs[reference]

    def upload_blob(self, repository, data):
        self.blobs[digest(data)] = data
        self.writes.append(('blob', repository))

    def upload_manifest(self, repository, version, data):
        self.manifests[repository, version] = data
        self.writes.append(('manifest', repository))


def fixture():
    registry = MemoryRegistry()
    index = {'annotations': {'org.opencontainers.image.source': 'https://github.com/webgrip/glide'}, 'manifests': []}
    for arch in ['amd64', 'arm64']:
        config = json.dumps({'config': {'Labels': {'org.opencontainers.image.source': 'https://github.com/webgrip/glide', 'org.opencontainers.image.version': '0.3.0-rc.8', 'org.opencontainers.image.revision': 'selected-sha'}}}).encode()
        manifest = json.dumps({'config': {'digest': digest(config)}}).encode()
        registry.blobs[digest(config)] = config
        registry.manifests['webgrip/ploegd', digest(manifest)] = manifest
        index['manifests'].append({'platform': {'os': 'linux', 'architecture': arch}, 'digest': digest(manifest)})
    registry.manifests['webgrip/ploegd', '0.3.0-rc.8'] = json.dumps(index).encode()
    return registry


class DistributionTests(unittest.TestCase):
    def test_accepts_only_supported_application_prereleases(self):
        self.assertEqual(publish_release.release_tag('ploeg', '0.3.0-rc.8'), 'ploeg-v0.3.0-rc.8')
        for application, version in [('other', '0.3.0-rc.8'), ('ploeg', '1.0.0-rc.1'), ('vloer', '0.3.0'), ('ploeg', '0.3.0-beta.1'), ('vloer', '0.3.0-rc.0'), ('vloer', '0.03.0-rc.8'), ('vloer', '0.3.0-rc.8;echo bad')]:
            with self.assertRaises(ValueError):
                publish_release.release_tag(application, version)

    def test_every_image_platform_must_identify_the_glide_release(self):
        source = fixture()
        verify_image(source, 'webgrip/ploegd', '0.3.0-rc.8', 'selected-sha')
        with self.assertRaises(RuntimeError):
            verify_image(source, 'webgrip/ploegd', '0.3.0-rc.8', 'another-sha')
        for mutation in ['source', 'platform']:
            changed = copy.deepcopy(source)
            index = json.loads(changed.manifests['webgrip/ploegd', '0.3.0-rc.8'])
            if mutation == 'source':
                index['annotations']['org.opencontainers.image.source'] = 'https://github.com/webgrip/ploeg'
            else:
                index['manifests'].pop()
            changed.manifests['webgrip/ploegd', '0.3.0-rc.8'] = json.dumps(index).encode()
            with self.assertRaises(RuntimeError):
                verify_image(changed, 'webgrip/ploegd', '0.3.0-rc.8', 'selected-sha')

    def test_chart_copy_preserves_bytes_and_retries_without_replacing(self):
        source, target = MemoryRegistry(), MemoryRegistry('target')
        config, layer = b'{"version":"0.3.0-rc.8"}', b'packaged-chart'
        manifest = json.dumps({'mediaType': 'application/vnd.oci.image.manifest.v1+json', 'config': {'digest': digest(config), 'mediaType': 'application/vnd.cncf.helm.config.v1+json'}, 'layers': [{'digest': digest(layer)}]}).encode()
        source.manifests['webgrip/charts/ploeg', '0.3.0-rc.8'] = manifest
        source.blobs = {digest(config): config, digest(layer): layer}
        self.assertEqual(copy_chart(source, target, 'webgrip/charts/ploeg', '0.3.0-rc.8'), digest(manifest))
        self.assertEqual(len(target.writes), 3)
        copy_chart(source, target, 'webgrip/charts/ploeg', '0.3.0-rc.8')
        self.assertEqual(len(target.writes), 3)
        target.manifests['webgrip/charts/ploeg', '0.3.0-rc.8'] = b'other-version-content'
        with self.assertRaises(RuntimeError):
            copy_chart(source, target, 'webgrip/charts/ploeg', '0.3.0-rc.8')
        self.assertEqual(len(target.writes), 3)

    def test_unsigned_source_and_failed_accessory_copy_fail_publication(self):
        source, target = fixture(), fixture()
        target.host = 'target'
        with patch.object(release_registry, 'verify_signature', side_effect=RuntimeError('unsigned')):
            with self.assertRaisesRegex(RuntimeError, 'unsigned'):
                copy_image(source, target, 'webgrip/ploegd', '0.3.0-rc.8', 'selected-sha')
        with patch.object(release_registry, 'verify_signature'), patch.object(release_registry, 'command', side_effect=RuntimeError('copy failed')):
            with self.assertRaisesRegex(RuntimeError, 'copy failed'):
                copy_image(source, target, 'webgrip/ploegd', '0.3.0-rc.8', 'selected-sha')
        with patch.object(release_registry, 'verify_signature') as verify, patch.object(release_registry, 'command') as command:
            copy_image(source, target, 'webgrip/ploegd', '0.3.0-rc.8', 'selected-sha')
            self.assertEqual(verify.call_count, 2)
            self.assertEqual(command.call_count, 1)
            self.assertEqual(command.call_args.args[:3], ('cosign', 'copy', '--only=sig,att,sbom'))

    def test_every_chart_names_glide_as_its_source_and_home(self):
        root = Path(__file__).resolve().parent.parent
        for path in ['apps/ploeg/ops/helm/ploeg', 'apps/vloer/ops/helm/de-vloer']:
            with self.subTest(chart=path):
                metadata = release_registry.command('helm', 'show', 'chart', str(root / path)).splitlines()
                self.assertIn('home: https://forgejo.webgrip.dev/webgrip/glide', metadata)
                self.assertEqual(metadata[metadata.index('sources:') + 1], '- https://github.com/webgrip/glide')

    def test_redirects_never_forward_credentials_to_another_host(self):
        request = urllib.request.Request('https://forgejo.webgrip.dev/asset', headers={'Authorization': 'fixture'})
        redirected = SafeRedirect().redirect_request(request, None, 302, '', {}, 'https://storage.example.invalid/asset')
        self.assertFalse(redirected.has_header('Authorization'))
        redirected = SafeRedirect().redirect_request(request, None, 302, '', {}, 'https://forgejo.webgrip.dev/other')
        self.assertEqual(redirected.get_header('Authorization'), 'fixture')

    def test_go_export_is_repeatable_and_contains_the_exact_application_tree(self):
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                git = publish_release.git
                git('init', '-b', 'development')
                git('config', 'user.name', 'Fixture')
                git('config', 'user.email', 'fixture@example.invalid')
                os.makedirs('apps/ploeg/pkg')
                with open('apps/ploeg/go.mod', 'w') as target:
                    target.write('module github.com/webgrip/ploeg\n')
                with open('apps/ploeg/pkg/sample.go', 'w') as target:
                    target.write('package sample\n')
                git('add', 'apps')
                git('commit', '-m', 'fixture')
                parent = git('rev-parse', 'HEAD')
                git('tag', 'ploeg-v0.3.0-rc.8')
                first = publish_release.export_commit('ploeg-v0.3.0-rc.8', parent)
                second = publish_release.export_commit('ploeg-v0.3.0-rc.8', parent)
                self.assertEqual(first, second)
                self.assertEqual(git('rev-parse', first[0] + '^{tree}'), git('rev-parse', 'HEAD:apps/ploeg'))
                self.assertEqual(git('show', first[0] + ':go.mod'), 'module github.com/webgrip/ploeg')
            finally:
                os.chdir(previous)


if __name__ == '__main__':
    unittest.main()
