import base64
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sign_extension_asset as signer


VERSION = '0.4.0-rc.126'
REVISION = 'a' * 40
CONTENT = b'PK\x03\x04 a VSIX'
NAMES = signer.asset_names(VERSION)
RUN = {'GITHUB_SERVER_URL': 'https://forgejo.webgrip.dev', 'GITHUB_REPOSITORY': 'webgrip/unfold', 'GITHUB_RUN_ID': '812', 'GITHUB_EVENT_NAME': 'workflow_dispatch', 'WEBGRIP_CI_TOKEN': 'forge'}


def envelope(name=NAMES['vsix'], content=CONTENT, revision=REVISION, predicate_type=signer.PROVENANCE_PREDICATE):
    statement = {'_type': 'https://in-toto.io/Statement/v0.1', 'predicateType': predicate_type, 'subject': [{'name': name, 'digest': {'sha256': hashlib.sha256(content).hexdigest()}}], 'predicate': signer.provenance(VERSION, revision, RUN)}
    return json.dumps({'payloadType': 'application/vnd.in-toto+json', 'payload': base64.b64encode(json.dumps(statement).encode()).decode(), 'signatures': [{'sig': 'x'}]}).encode()


def checksum(content=CONTENT):
    return f'{hashlib.sha256(content).hexdigest()}  {NAMES["vsix"]}\n'.encode()


class Release:
    def __init__(self, **assets):
        self.assets = {name: data for name, data in assets.items()}
        self.attached = {}

    def api(self, url, token):
        return {'id': 7, 'assets': [{'name': name, 'browser_download_url': name} for name in self.assets]}

    def fetch(self, asset, token):
        return self.assets[asset['browser_download_url']]

    def attach(self, release, name, content, token):
        self.attached[name] = content


class ExtensionSigningTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        extension = Path(self.directory.name)
        (extension / NAMES['vsix']).write_bytes(CONTENT)
        for target, value in [('EXTENSION', extension)]:
            patcher = patch.object(signer, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        for target in ['require_cosign']:
            patcher = patch.object(signer, target)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.object(signer, 'git', return_value=REVISION)
        patcher.start()
        self.addCleanup(patcher.stop)

    def published(self, release):
        return [patch.object(signer, 'api', side_effect=release.api), patch.object(signer, 'fetch_asset', side_effect=release.fetch), patch.object(signer, 'attach_forgejo', side_effect=release.attach)]

    def run_with(self, release, function, cosign):
        patches = self.published(release)
        for item in patches:
            item.start()
        try:
            with patch.object(signer, 'command', side_effect=cosign) as command, patch.object(signer, 'signing_identity', return_value='jwt'), patch.object(signer, 'signing_session', return_value='bao') as session, patch.object(signer, 'revoke_signing_session') as revoke:
                result = function(VERSION, RUN)
            return result, command, session, revoke
        finally:
            for item in patches:
                item.stop()

    def test_provenance_names_the_tagged_commit_the_workflow_and_the_run(self):
        predicate = signer.provenance(VERSION, REVISION, RUN)
        self.assertEqual(predicate['buildDefinition']['resolvedDependencies'], [{'uri': 'git+https://forgejo.webgrip.dev/webgrip/unfold@refs/tags/unfold-v0.4.0-rc.126', 'digest': {'gitCommit': REVISION}}])
        self.assertEqual(predicate['runDetails']['builder']['id'], 'https://forgejo.webgrip.dev/webgrip/unfold/.forgejo/workflows/on_release_published.yml')
        self.assertEqual(predicate['runDetails']['metadata']['invocationId'], 'https://forgejo.webgrip.dev/webgrip/unfold/actions/runs/812')

    def test_an_unsigned_vsix_is_signed_and_attested_in_openbao_then_verified_before_both_files_are_attached(self):
        release = Release(**{NAMES['vsix']: CONTENT, NAMES['checksum']: checksum()})
        calls = []
        def cosign(*args, env=None):
            calls.append((args[1], env))
            output = args[args.index('--output-signature') + 1] if '--output-signature' in args else None
            if args[1] == 'sign-blob':
                Path(output).write_bytes(b'MEUC signature')
            if args[1] == 'attest-blob':
                Path(output).write_bytes(envelope())
            return ''
        missing, _, session, revoke = self.run_with(release, signer.sign, cosign)
        self.assertEqual(missing, ['signature', 'provenance'])
        self.assertEqual([name for name, _ in calls], ['sign-blob', 'attest-blob', 'verify-blob', 'verify-blob-attestation'])
        for name, env in calls[:2]:
            self.assertEqual((env['VAULT_ADDR'], env['VAULT_TOKEN']), (signer.OPENBAO, 'bao'), name)
        for name, env in calls[2:]:
            self.assertIsNone(env, f'{name} verifies with the committed public key, without the signing session')
        session.assert_called_once_with('jwt')
        revoke.assert_called_once_with('bao')
        self.assertEqual(sorted(release.attached), sorted([NAMES['signature'], NAMES['provenance']]))

    def test_a_signed_vsix_is_not_signed_again(self):
        release = Release(**{NAMES['vsix']: CONTENT, NAMES['checksum']: checksum(), NAMES['signature']: b'sig', NAMES['provenance']: envelope()})
        missing, command, session, _ = self.run_with(release, signer.sign, lambda *args, env=None: '')
        self.assertEqual(missing, [])
        command.assert_not_called()
        session.assert_not_called()
        self.assertEqual(release.attached, {})

    def test_a_vsix_that_differs_from_the_released_checksum_is_never_signed(self):
        release = Release(**{NAMES['vsix']: CONTENT, NAMES['checksum']: checksum(b'other bytes')})
        with self.assertRaisesRegex(RuntimeError, 'canonical VSIX checksum'):
            self.run_with(release, signer.sign, lambda *args, env=None: '')

    def test_a_signature_the_committed_key_rejects_fails_and_attaches_nothing(self):
        release = Release(**{NAMES['vsix']: CONTENT, NAMES['checksum']: checksum()})
        def cosign(*args, env=None):
            if args[1] == 'verify-blob':
                raise RuntimeError('cosign verify-blob failed: invalid signature')
            if '--output-signature' in args:
                Path(args[args.index('--output-signature') + 1]).write_bytes(envelope())
            return ''
        with patch.object(signer, 'revoke_signing_session'):
            with self.assertRaisesRegex(RuntimeError, 'invalid signature'):
                self.run_with(release, signer.sign, cosign)
        self.assertEqual(release.attached, {})

    def test_verification_downloads_every_asset_and_runs_cosign_against_the_committed_key(self):
        release = Release(**{NAMES['vsix']: CONTENT, NAMES['checksum']: checksum(), NAMES['signature']: b'sig', NAMES['provenance']: envelope()})
        sha256, command, session, _ = self.run_with(release, signer.verify, lambda *args, env=None: '')
        self.assertEqual(sha256, hashlib.sha256(CONTENT).hexdigest())
        self.assertEqual([call.args[:4] for call in command.call_args_list], [('cosign', 'verify-blob', '--key', signer.PUBLIC_KEY), ('cosign', 'verify-blob-attestation', '--key', signer.PUBLIC_KEY)])
        self.assertIn(signer.PROVENANCE_TYPE, command.call_args_list[1].args)
        session.assert_not_called()

    def test_verification_fails_on_a_missing_asset_a_wrong_checksum_or_provenance_of_another_commit(self):
        complete = {NAMES['vsix']: CONTENT, NAMES['checksum']: checksum(), NAMES['signature']: b'sig', NAMES['provenance']: envelope()}
        for broken, message in [
            ({k: v for k, v in complete.items() if k != NAMES['provenance']}, 'is missing'),
            ({**complete, NAMES['checksum']: checksum(b'other')}, 'released VSIX checksum'),
            ({**complete, NAMES['provenance']: envelope(revision='b' * 40)}, 'source commit'),
            ({**complete, NAMES['provenance']: envelope(name='other.vsix')}, 'provenance subject'),
            ({**complete, NAMES['provenance']: envelope(predicate_type='https://cyclonedx.org/bom')}, 'predicate type'),
        ]:
            with self.subTest(message):
                with self.assertRaisesRegex(RuntimeError, message):
                    self.run_with(Release(**broken), signer.verify, lambda *args, env=None: '')

    def test_a_cosign_rejection_fails_verification(self):
        release = Release(**{NAMES['vsix']: CONTENT, NAMES['checksum']: checksum(), NAMES['signature']: b'sig', NAMES['provenance']: envelope()})
        def cosign(*args, env=None):
            raise RuntimeError(f'cosign {args[1]} failed: invalid signature')
        with self.assertRaisesRegex(RuntimeError, 'verify-blob failed'):
            self.run_with(release, signer.verify, cosign)


if __name__ == '__main__':
    unittest.main()
