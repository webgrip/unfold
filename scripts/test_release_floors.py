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
        for component in ['ploeg', 'vloer']:
            self.assertGreaterEqual(release_floors.compare(recorded['components'][component]['floor'], '0.4.0-rc.34'), 0)
            for published in ['0.4.0-rc.34', '0.4.0-rc.32', '0.4.0-rc.1', '0.3.0-rc.16', '0.2.0']:
                with self.subTest(component=component, version=published), self.assertRaisesRegex(ValueError, 'at or below its release floor'):
                    release_floors.refuse_occupied(component, published, recorded)
        with self.assertRaisesRegex(ValueError, 'already occupied'):
            release_floors.refuse_occupied('ploeg', '1.0.0-rc.1', recorded)

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
            for application, version in [('ploeg', '0.4.0-rc.34'), ('vloer', '0.4.0-rc.33'), ('ploeg', '0.4.0-rc.8')]:
                with self.subTest(application=application, version=version), self.assertRaisesRegex(ValueError, 'release floor'):
                    publish_release.publish(application, version)
        self.assertEqual(calls, [])

    def test_the_chart_publisher_refuses_before_reading_the_chart_or_registry(self):
        with patch.object(publish_chart, 'command', lambda *args, **kwargs: self.fail(f'unexpected command {args}')), \
                patch.dict('os.environ', {}, clear=True):
            for application in ['ploeg', 'vloer']:
                with self.subTest(application=application), self.assertRaisesRegex(ValueError, 'release floor'):
                    publish_chart.publish(application, '0.4.0-rc.34')

    def test_a_version_above_the_floor_reaches_the_publisher(self):
        def git(*args, **kwargs):
            raise RuntimeError('reached git')

        with patch.object(publish_release, 'git', git), self.assertRaisesRegex(RuntimeError, 'reached git'):
            publish_release.publish('ploeg', '0.4.0-rc.35')

    def test_publishable_tags_keep_the_unfold_name_and_lie_above_the_floor(self):
        self.assertEqual(publish_release.publishable_tag('vloer', '0.5.0-rc.1'), 'unfold-v0.5.0-rc.1')
        self.assertEqual(publish_release.publishable_tag('ploeg', '0.4.0-rc.35'), 'unfold-v0.4.0-rc.35')
        with self.assertRaisesRegex(ValueError, 'only 0.x.y-rc.N'):
            publish_release.publishable_tag('ploeg', '1.0.0-rc.1')
        with self.assertRaisesRegex(ValueError, 'release floor 0.4.0-rc.34'):
            publish_release.publishable_tag('ploeg', '0.4.0-rc.34')


if __name__ == '__main__':
    unittest.main()
