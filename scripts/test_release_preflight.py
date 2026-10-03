import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import release_preflight  # noqa: E402


ENVIRONMENT = {'GHCR_TOKEN': 'github', 'WEBGRIP_CI_TOKEN': 'forge'}
GITHUB_STATE = {'full_name': 'webgrip/unfold', 'default_branch': 'development', 'private': False, 'permissions': {'push': True}}


def forge(states):
    return lambda url: states.get(url.rsplit('/', 1)[1])


class RetiredRepositoryNames(unittest.TestCase):
    def test_deleted_and_renamed_names_hold_no_release_authority(self):
        states = {'glide': {'full_name': 'webgrip/unfold', 'has_actions': True}, 'ploeg': None, 'de-vloer': None}
        self.assertEqual(release_preflight.retired_release_authorities(forge(states)), [])

    def test_a_recreated_name_must_keep_actions_disabled(self):
        for state, expected in [
            ({'full_name': 'webgrip/ploeg', 'has_actions': False}, []),
            ({'full_name': 'webgrip/ploeg', 'has_actions': True}, ['webgrip/ploeg']),
            ({'full_name': 'webgrip/ploeg'}, ['webgrip/ploeg']),
        ]:
            with self.subTest(state=state):
                self.assertEqual(release_preflight.retired_release_authorities(forge({'ploeg': state})), expected)

    def test_every_retired_name_the_signing_role_still_binds_is_checked(self):
        self.assertEqual(sorted(release_preflight.RETIRED), ['de-vloer', 'glide', 'ploeg'])


class CanonicalIdentity(unittest.TestCase):
    def run_main(self, forge_state, github_state, retired=None):
        def api(url, token, method='GET', data=None, missing=False):
            if url == release_preflight.FORGEJO:
                return forge_state
            if url == release_preflight.GITHUB:
                return github_state
            return (retired or {}).get(url.rsplit('/', 1)[1])

        def git(*args, **kwargs):
            raise AssertionError('reached the mirror comparison')

        with patch.dict('os.environ', ENVIRONMENT, clear=True), patch.object(release_preflight, 'api', api), patch.object(release_preflight, 'git', git):
            release_preflight.main()

    def test_a_forgejo_rename_redirect_is_not_accepted_as_the_canonical_repository(self):
        with self.assertRaisesRegex(RuntimeError, 'Forgejo repository identity: expected webgrip/unfold, got webgrip/renamed'):
            self.run_main({'full_name': 'webgrip/renamed'}, GITHUB_STATE)

    def test_a_github_rename_redirect_is_not_accepted_as_the_canonical_mirror(self):
        with self.assertRaisesRegex(RuntimeError, 'GitHub repository identity: expected webgrip/unfold, got webgrip/glide'):
            self.run_main({'full_name': 'webgrip/unfold'}, {**GITHUB_STATE, 'full_name': 'webgrip/glide'})

    def test_a_retired_name_with_actions_stops_the_preflight(self):
        retired = {'de-vloer': {'full_name': 'webgrip/de-vloer', 'has_actions': True}}
        with self.assertRaisesRegex(RuntimeError, 'still run Actions under their own name: webgrip/de-vloer'):
            self.run_main({'full_name': 'webgrip/unfold'}, GITHUB_STATE, retired)

    def test_canonical_identities_with_retired_names_gone_reach_the_mirror_comparison(self):
        with self.assertRaisesRegex(AssertionError, 'reached the mirror comparison'):
            self.run_main({'full_name': 'webgrip/unfold'}, GITHUB_STATE)


if __name__ == '__main__':
    unittest.main()
