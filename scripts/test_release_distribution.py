import copy
import inspect
import json
import re
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import publish_release
import release_registry
from release_registry import SafeRedirect, copy_chart, copy_image, digest, manifest_media_type, verify_image


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
    index = {'annotations': {'org.opencontainers.image.source': 'https://github.com/webgrip/unfold'}, 'manifests': []}
    for arch in ['amd64', 'arm64']:
        config = json.dumps({'config': {'Labels': {'org.opencontainers.image.source': 'https://github.com/webgrip/unfold', 'org.opencontainers.image.version': '0.3.0-rc.8', 'org.opencontainers.image.revision': 'selected-sha'}}}).encode()
        manifest = json.dumps({'config': {'digest': digest(config)}}).encode()
        registry.blobs[digest(config)] = config
        registry.manifests['webgrip/unfold', digest(manifest)] = manifest
        index['manifests'].append({'platform': {'os': 'linux', 'architecture': arch}, 'digest': digest(manifest)})
    registry.manifests['webgrip/unfold', '0.3.0-rc.8'] = json.dumps(index).encode()
    return registry


class DistributionTests(unittest.TestCase):
    def test_accepts_only_supported_application_prereleases(self):
        self.assertEqual(publish_release.release_tag('unfold', '0.3.0-rc.8'), 'unfold-v0.3.0-rc.8')
        for application, version in [('other', '0.3.0-rc.8'), ('ploeg', '0.3.0-rc.8'), ('ploeg', '1.0.0-rc.1'), ('unfold', '0.3.0'), ('unfold', '0.3.0-beta.1'), ('unfold', '0.3.0-rc.0'), ('unfold', '0.03.0-rc.8'), ('unfold', '0.3.0-rc.8;echo bad')]:
            with self.assertRaises(ValueError):
                publish_release.release_tag(application, version)

    def test_package_links_move_to_unfold_and_retries_are_no_ops(self):
        for current, expected in [
            ('webgrip/unfold', []),
            ('webgrip/de-vloer', ['unlink', 'link/unfold']),
            (None, ['link/unfold']),
        ]:
            calls = []

            def api(url, token, method='GET', data=None, missing=False):
                if method == 'GET':
                    return [{'name': 'charts/unfold', 'repository': {'full_name': current} if current else None}, {'name': 'unfold', 'repository': None}]
                calls.append(url.rsplit('/-/', 1)[1])
                self.assertIn('/container/charts%2Funfold/-/', url)

            with self.subTest(current=current), patch.object(publish_release, 'api', api):
                publish_release.link_package('charts/unfold', 'token')
                self.assertEqual(calls, expected)

    def test_a_link_the_bot_cannot_move_does_not_stop_publication(self):
        def api(url, token, method='GET', data=None, missing=False):
            if method == 'GET':
                return [{'name': 'unfold-agent', 'repository': {'full_name': 'webgrip/de-vloer'}}]
            raise RuntimeError('POST forgejo.webgrip.dev returned HTTP 500')

        with patch.object(publish_release, 'api', api), patch('sys.stderr') as stderr:
            publish_release.link_package('unfold-agent', 'token')
        self.assertIn('stays linked to webgrip/de-vloer', ''.join(call.args[0] for call in stderr.write.call_args_list))

    def test_every_image_platform_must_identify_the_unfold_release(self):
        source = fixture()
        verify_image(source, 'webgrip/unfold', '0.3.0-rc.8', 'selected-sha')
        with self.assertRaises(RuntimeError):
            verify_image(source, 'webgrip/unfold', '0.3.0-rc.8', 'another-sha')
        for mutation in ['source', 'platform']:
            changed = copy.deepcopy(source)
            index = json.loads(changed.manifests['webgrip/unfold', '0.3.0-rc.8'])
            if mutation == 'source':
                index['annotations']['org.opencontainers.image.source'] = 'https://github.com/ploeg-hq/ploeg'
            else:
                index['manifests'].pop()
            changed.manifests['webgrip/unfold', '0.3.0-rc.8'] = json.dumps(index).encode()
            with self.assertRaises(RuntimeError):
                verify_image(changed, 'webgrip/unfold', '0.3.0-rc.8', 'selected-sha')

    def test_chart_copy_preserves_bytes_and_retries_without_replacing(self):
        source, target = MemoryRegistry(), MemoryRegistry('target')
        config, layer = b'{"version":"0.3.0-rc.8"}', b'packaged-chart'
        manifest = json.dumps({'mediaType': 'application/vnd.oci.image.manifest.v1+json', 'config': {'digest': digest(config), 'mediaType': 'application/vnd.cncf.helm.config.v1+json'}, 'layers': [{'digest': digest(layer)}]}).encode()
        source.manifests['webgrip/charts/unfold', '0.3.0-rc.8'] = manifest
        source.blobs = {digest(config): config, digest(layer): layer}
        self.assertEqual(copy_chart(source, target, 'webgrip/charts/unfold', '0.3.0-rc.8'), digest(manifest))
        self.assertEqual(len(target.writes), 3)
        copy_chart(source, target, 'webgrip/charts/unfold', '0.3.0-rc.8')
        self.assertEqual(len(target.writes), 3)
        target.manifests['webgrip/charts/unfold', '0.3.0-rc.8'] = b'other-version-content'
        with self.assertRaises(RuntimeError):
            copy_chart(source, target, 'webgrip/charts/unfold', '0.3.0-rc.8')
        self.assertEqual(len(target.writes), 3)

    def test_a_helm_manifest_without_a_media_type_uploads_as_an_oci_manifest(self):
        helm = json.dumps({'schemaVersion': 2, 'config': {'mediaType': 'application/vnd.cncf.helm.config.v1+json'}, 'layers': []}).encode()
        self.assertEqual(manifest_media_type(helm), 'application/vnd.oci.image.manifest.v1+json')
        index = json.dumps({'mediaType': 'application/vnd.oci.image.index.v1+json', 'manifests': []}).encode()
        self.assertEqual(manifest_media_type(index), 'application/vnd.oci.image.index.v1+json')

    def test_github_release_takes_its_assets_as_a_draft_then_publishes(self):
        source = {'name': 'unfold-v0.4.0-rc.8', 'body': 'notes', 'assets': [{'name': 'a.json', 'browser_download_url': 'https://forgejo.webgrip.dev/a.json'}]}
        calls = []

        def api(url, token, method='GET', data=None, missing=False):
            calls.append((method, url.rsplit('/unfold', 1)[1], data))
            if method == 'GET' and '/releases/tags/' in url:
                return None
            if method == 'GET':
                return []
            if method == 'POST':
                return {**data, 'id': 7, 'assets': [], 'upload_url': 'https://uploads.github.com/repos/webgrip/unfold/releases/7/assets{?name,label}'}
            return {'html_url': 'https://github.com/webgrip/unfold/releases/tag/unfold-v0.4.0-rc.8', **data}

        uploads = []
        with patch.object(publish_release, 'api', api), patch.object(publish_release, 'git', lambda *a, **k: 'sha' if a[0] == 'rev-parse' else 'sha\trefs/tags/unfold-v0.4.0-rc.8'), \
                patch.object(publish_release, 'fetch_asset', lambda asset, token: b'{}'), \
                patch.object(publish_release, 'request', lambda url, **k: uploads.append(url) or (b'', {})):
            url = publish_release.mirror_release('unfold-v0.4.0-rc.8', source, 'forge', 'github')
        self.assertEqual(url, 'https://github.com/webgrip/unfold/releases/tag/unfold-v0.4.0-rc.8')
        self.assertTrue(calls[2][2]['draft'])
        self.assertEqual(len(uploads), 1)
        self.assertEqual(calls[-1][:2], ('PATCH', '/releases/7'))
        self.assertFalse(calls[-1][2]['draft'])

    def test_the_unfold_publisher_takes_the_github_release_out_of_draft_itself(self):
        source = {'name': 'unfold-v0.4.0-rc.9', 'body': 'notes', 'assets': []}
        draft = {'tag_name': 'unfold-v0.4.0-rc.9', 'name': 'unfold-v0.4.0-rc.9', 'body': 'notes', 'prerelease': True, 'draft': True, 'id': 9, 'assets': [], 'html_url': 'draft-url'}
        for publish, expected in [(False, []), (True, ['PATCH'])]:
            calls = []

            def api(url, token, method='GET', data=None, missing=False):
                calls.append(method)
                if '/releases/tags/' in url:
                    return None
                if method == 'GET':
                    return [draft]
                return {**draft, **data, 'html_url': 'published-url'}

            with self.subTest(publish=publish), patch.object(publish_release, 'api', api), patch.object(publish_release, 'git', lambda *a, **k: 'sha' if a[0] == 'rev-parse' else 'sha\trefs/tags/unfold-v0.4.0-rc.9'):
                publish_release.mirror_release('unfold-v0.4.0-rc.9', source, 'forge', 'github', publish=publish)
                self.assertEqual([m for m in calls if m != 'GET'], expected)
        self.assertIs(inspect.signature(publish_release.mirror_release).parameters['publish'].default, True)
        workflow = (Path(__file__).resolve().parent.parent / '.forgejo/workflows/on_release_published.yml').read_text()
        self.assertEqual(re.findall(r'python3 scripts/publish_release\.py (\S+)', workflow), ['unfold'])
        self.assertEqual(re.findall(r'python3 scripts/publish_chart\.py (\S+)', workflow), ['unfold'])

    def test_a_published_github_release_missing_an_asset_fails_plainly(self):
        source = {'name': 'unfold-v0.4.0-rc.8', 'body': 'notes', 'assets': [{'name': 'a.json', 'browser_download_url': 'https://forgejo.webgrip.dev/a.json'}]}
        published = {'tag_name': 'unfold-v0.4.0-rc.8', 'name': 'unfold-v0.4.0-rc.8', 'body': 'notes', 'prerelease': True, 'draft': False, 'assets': []}
        with patch.object(publish_release, 'api', lambda *a, **k: published), patch.object(publish_release, 'git', lambda *a, **k: 'sha' if a[0] == 'rev-parse' else 'sha\trefs/tags/unfold-v0.4.0-rc.8'), \
                patch.object(publish_release, 'fetch_asset', lambda asset, token: b'{}'):
            with self.assertRaisesRegex(RuntimeError, 'immutable'):
                publish_release.mirror_release('unfold-v0.4.0-rc.8', source, 'forge', 'github')

    def test_unsigned_source_and_failed_accessory_copy_fail_publication(self):
        source, target = fixture(), fixture()
        target.host = 'target'
        with patch.object(release_registry, 'verify_signature', side_effect=RuntimeError('unsigned')):
            with self.assertRaisesRegex(RuntimeError, 'unsigned'):
                copy_image(source, target, 'webgrip/unfold', '0.3.0-rc.8', 'selected-sha')
        with patch.object(release_registry, 'verify_signature'), patch.object(release_registry, 'command', side_effect=RuntimeError('copy failed')):
            with self.assertRaisesRegex(RuntimeError, 'copy failed'):
                copy_image(source, target, 'webgrip/unfold', '0.3.0-rc.8', 'selected-sha')
        with patch.object(release_registry, 'verify_signature') as verify, patch.object(release_registry, 'command') as command:
            copy_image(source, target, 'webgrip/unfold', '0.3.0-rc.8', 'selected-sha')
            self.assertEqual(verify.call_count, 2)
            index = digest(source.manifests['webgrip/unfold', '0.3.0-rc.8'])
            command.assert_called_once_with('regctl', 'image', 'copy', '--referrers', '--digest-tags', f'source/webgrip/unfold@{index}', 'target/webgrip/unfold:0.3.0-rc.8')

    def test_an_existing_destination_version_with_other_content_is_never_copied_over(self):
        source, target = fixture(), fixture()
        target.host = 'target'
        target.manifests['webgrip/unfold', '0.3.0-rc.8'] = b'{"manifests":[]}'
        with patch.object(release_registry, 'verify_signature'), patch.object(release_registry, 'command') as command:
            with self.assertRaisesRegex(RuntimeError, 'immutable'):
                copy_image(source, target, 'webgrip/unfold', '0.3.0-rc.8', 'selected-sha')
            command.assert_not_called()

    def test_the_published_chart_names_unfold_as_its_source_and_home(self):
        root = Path(__file__).resolve().parent.parent
        metadata = release_registry.command('helm', 'show', 'chart', str(root / 'apps/unfold/ops/helm/unfold')).splitlines()
        self.assertIn('home: https://forgejo.webgrip.dev/webgrip/unfold', metadata)
        self.assertEqual(metadata[metadata.index('sources:') + 1], '- https://github.com/webgrip/unfold')

    def test_redirects_never_forward_credentials_to_another_host(self):
        request = urllib.request.Request('https://forgejo.webgrip.dev/asset', headers={'Authorization': 'fixture'})
        redirected = SafeRedirect().redirect_request(request, None, 302, '', {}, 'https://storage.example.invalid/asset')
        self.assertFalse(redirected.has_header('Authorization'))
        redirected = SafeRedirect().redirect_request(request, None, 302, '', {}, 'https://forgejo.webgrip.dev/other')
        self.assertEqual(redirected.get_header('Authorization'), 'fixture')

    def test_a_redirected_write_fails_instead_of_becoming_a_read(self):
        request = urllib.request.Request('https://forgejo.webgrip.dev/api/v1/repos/webgrip/old/releases/7/assets', data=b'evidence', method='POST')
        with self.assertRaises(urllib.error.HTTPError) as raised:
            SafeRedirect().redirect_request(request, None, 301, '', {}, 'https://forgejo.webgrip.dev/api/v1/repos/webgrip/unfold/releases/7/assets')
        self.assertEqual(raised.exception.code, 301)

    def test_a_command_never_waits_for_a_credential_prompt(self):
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / 'prompt'
            script.write_text('#!/bin/sh\nprintf %s "$GIT_TERMINAL_PROMPT"\nread answer\nexit 0\n')
            script.chmod(0o755)
            self.assertEqual(release_registry.command(str(script), 'probe'), '0')
            with patch.object(release_registry, 'COMMAND_TIMEOUT', 0.2):
                with self.assertRaisesRegex(RuntimeError, 'did not finish'):
                    release_registry.command('sleep', '5')


class FlakyOpener:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def open(self, req, timeout):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class Answer:
    def __init__(self, body):
        self.body = body
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.body


class RequestRetryTests(unittest.TestCase):
    def serve(self, *outcomes):
        opener = FlakyOpener(*outcomes)
        patchers = [patch.object(release_registry.urllib.request, 'build_opener', return_value=opener), patch.object(release_registry.time, 'sleep')]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        return opener

    def test_a_read_cut_off_mid_body_is_retried(self):
        opener = self.serve(release_registry.http.client.IncompleteRead(b'', 4557), Answer(b'{}'))
        self.assertEqual(release_registry.request('https://ghcr.io/v2/x/blobs/sha256:a')[0], b'{}')
        self.assertEqual(opener.calls, 2)

    def test_a_dropped_connection_and_a_server_error_are_retried_for_reads(self):
        server_error = urllib.error.HTTPError('https://ghcr.io/v2/x', 503, 'unavailable', {}, None)
        opener = self.serve(ConnectionResetError(), server_error, Answer(b'ok'))
        self.assertEqual(release_registry.request('https://ghcr.io/v2/x', method='HEAD')[0], b'ok')
        self.assertEqual(opener.calls, 3)

    def test_a_write_is_never_repeated(self):
        opener = self.serve(ConnectionResetError())
        with self.assertRaises(ConnectionResetError):
            release_registry.request('https://ghcr.io/v2/x/blobs/uploads/', method='POST', data=b'')
        self.assertEqual(opener.calls, 1)

    def test_a_read_that_keeps_failing_gives_up_after_three_attempts(self):
        cut = release_registry.http.client.IncompleteRead(b'', 1)
        opener = self.serve(cut, cut, cut)
        with self.assertRaises(release_registry.http.client.IncompleteRead):
            release_registry.request('https://ghcr.io/v2/x')
        self.assertEqual(opener.calls, 3)

    def test_a_missing_manifest_and_a_denied_read_are_answers_not_retries(self):
        not_found = urllib.error.HTTPError('https://ghcr.io/v2/x', 404, 'missing', {}, None)
        opener = self.serve(not_found)
        self.assertIsNone(release_registry.request('https://ghcr.io/v2/x', missing=True)[0])
        denied = urllib.error.HTTPError('https://ghcr.io/v2/x', 401, 'denied', {}, None)
        opener = self.serve(denied)
        with self.assertRaisesRegex(RuntimeError, 'HTTP 401'):
            release_registry.request('https://ghcr.io/v2/x')
        self.assertEqual(opener.calls, 1)

if __name__ == '__main__':
    unittest.main()
