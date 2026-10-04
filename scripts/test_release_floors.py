import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import publish_chart  # noqa: E402
import publish_release  # noqa: E402
import release_floors  # noqa: E402


ROOT = Path(__file__).resolve().parent.parent
CASES = json.loads((ROOT / 'scripts/fixtures/release-floor-cases.json').read_text())


def outcome(run):
    try:
        run()
    except ValueError as error:
        return str(error)
    return None


class ReleaseFloorTests(unittest.TestCase):
    def test_versions_order_by_semantic_version_precedence(self):
        for left, right, expected in CASES['order']:
            with self.subTest(left=left, right=right):
                self.assertEqual(release_floors.compare(left, right), expected)
                self.assertEqual(release_floors.compare(right, left), -expected)

    def test_malformed_versions_are_rejected_instead_of_ordered(self):
        for version in CASES['malformed']:
            with self.subTest(version=version):
                self.assertIsNone(release_floors.parse(version))
                with self.assertRaisesRegex(ValueError, 'Not a semantic version'):
                    release_floors.compare(version, '0.4.0')

    def test_component_versions_clear_the_floor_withdrawn_versions_and_existing_tags(self):
        for case in CASES['decisions']:
            with self.subTest(**case):
                message = outcome(lambda: release_floors.refuse_occupied(case['component'], case['version'], CASES['floors'], case['tags']))
                if case['refused'] is None:
                    self.assertIsNone(message)
                else:
                    self.assertIn(case['refused'], message or '')

    def test_train_versions_clear_every_component_floor(self):
        for case in CASES['trains']:
            with self.subTest(**case):
                message = outcome(lambda: release_floors.refuse_occupied_train(case['train'], case['version'], CASES['floors'], case['tags']))
                if case['refused'] is None:
                    self.assertIsNone(message)
                else:
                    self.assertIn(case['refused'], message or '')

    def test_recorded_floors_cover_every_version_published_before_the_audit(self):
        recorded = release_floors.load()
        self.assertTrue((ROOT / recorded['evidence']).is_file())
        for component in ['ploeg', 'unfold']:
            self.assertGreaterEqual(release_floors.compare(recorded['components'][component]['floor'], '0.4.0-rc.34'), 0)
            for published in ['0.4.0-rc.34', '0.4.0-rc.32', '0.4.0-rc.1', '0.3.0-rc.16', '0.2.0']:
                with self.subTest(component=component, version=published), self.assertRaisesRegex(ValueError, 'at or below its release floor'):
                    release_floors.refuse_occupied(component, published, recorded)
        with self.assertRaisesRegex(ValueError, 'already occupied'):
            release_floors.refuse_occupied('ploeg', '1.0.0-rc.1', recorded)
        self.assertEqual(recorded['trains']['unfold']['components'], ['unfold'])
        self.assertIn('github.com/ploeg-hq/ploeg', recorded['components']['ploeg']['retired'])

    def test_a_retired_component_keeps_its_floor_but_no_train_may_version_it_again(self):
        record = release_floors.load()
        with self.assertRaisesRegex(ValueError, 'at or below its release floor'):
            release_floors.refuse_occupied('ploeg', '0.4.0-rc.34', record)
        with self.assertRaisesRegex(ValueError, 'existing tag unfold-v0.4.0-rc.35'):
            release_floors.refuse_occupied('ploeg', '0.4.0-rc.35', record, ['unfold-v0.4.0-rc.35'])
        record['trains']['unfold']['components'] = ['ploeg', 'unfold']
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'floors.json'
            path.write_text(json.dumps(record))
            with self.assertRaisesRegex(ValueError, 'train unfold versions ploeg, which is retired'):
                release_floors.load(path)

    def test_a_record_with_an_occupied_version_below_its_floor_is_refused(self):
        broken = json.loads(json.dumps(CASES['floors']))
        broken['components']['ploeg']['occupied_above_floor'] = {'0.4.0-rc.1': 'below the floor'}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'floors.json'
            path.write_text(json.dumps(broken))
            with self.assertRaisesRegex(ValueError, 'as occupied above its floor'):
                release_floors.load(path)


class PublishersRefuseOccupiedVersions(unittest.TestCase):
    def test_the_distribution_publisher_refuses_before_any_registry_or_forge_call(self):
        calls = []
        with patch.object(publish_release, 'git', lambda *args, **kwargs: calls.append(args) or 'sha'), \
                patch.object(publish_release, 'api', lambda *args, **kwargs: calls.append(args)), \
                patch.dict('os.environ', {}, clear=True):
            for version in ['0.4.0-rc.34', '0.4.0-rc.33', '0.4.0-rc.8']:
                with self.subTest(version=version), self.assertRaisesRegex(ValueError, 'release floor'):
                    publish_release.publish('unfold', version)
        self.assertEqual(calls, [])

    def test_the_chart_publisher_refuses_before_reading_the_chart_or_registry(self):
        with patch.object(publish_chart, 'command', lambda *args, **kwargs: self.fail(f'unexpected command {args}')), \
                patch.dict('os.environ', {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'release floor'):
                publish_chart.publish('unfold', '0.4.0-rc.34')

    def test_a_version_above_the_floor_reaches_the_publisher(self):
        def git(*args, **kwargs):
            raise RuntimeError('reached git')

        with patch.object(publish_release, 'git', git), self.assertRaisesRegex(RuntimeError, 'reached git'):
            publish_release.publish('unfold', '0.4.0-rc.36')

    def test_publishable_tags_keep_the_unfold_name_and_lie_above_the_floor(self):
        self.assertEqual(publish_release.publishable_tag('unfold', '0.5.0-rc.1'), 'unfold-v0.5.0-rc.1')
        with self.assertRaisesRegex(ValueError, 'only Unfold, as 0.x.y-rc.N'):
            publish_release.publishable_tag('unfold', '1.0.0-rc.1')
        with self.assertRaisesRegex(ValueError, 'release floor 0.4.0-rc.34'):
            publish_release.publishable_tag('unfold', '0.4.0-rc.34')


class RetiredPloegPublisher(unittest.TestCase):
    def forbid(self, owner, *names):
        for name in names:
            patcher = patch.object(owner, name, lambda *args, _name=name, **kwargs: self.fail(f'retired Ploeg publisher reached {_name}{args}'))
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_publishing_ploeg_fails_before_any_git_network_registry_or_file_side_effect(self):
        self.forbid(publish_release, 'git', 'api', 'request', 'command', 'copy_image', 'copy_chart', 'attach_forgejo', 'mirror_release', 'link_package', 'refuse_occupied')
        self.forbid(publish_chart, 'command', 'Registry')
        with patch.dict('os.environ', {}, clear=True):
            for version in ['0.4.0-rc.36', '0.5.0-rc.1', '0.1.0', '1.0.0']:
                with self.subTest(version=version):
                    with self.assertRaisesRegex(ValueError, 'no longer versions or publishes Ploeg: github.com/ploeg-hq/ploeg'):
                        publish_release.publish('ploeg', version)
                    with self.assertRaisesRegex(ValueError, 'no longer versions or publishes Ploeg'):
                        publish_chart.publish('ploeg', version)
                    with self.assertRaisesRegex(ValueError, 'no longer versions or publishes Ploeg'):
                        publish_release.publishable_tag('ploeg', version)

    def test_the_go_module_export_and_its_actions_switch_are_gone(self):
        source = (ROOT / 'scripts/publish_release.py').read_text()
        for retired in ['export_module', 'export_commit', 'github.com/webgrip/ploeg', 'actions/permissions', 'PUBLISHES_LAST', 'ploegd']:
            with self.subTest(retired=retired):
                self.assertNotIn(retired, source)


if __name__ == '__main__':
    unittest.main()
