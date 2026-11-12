import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cve_budget  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def match(identifier, severity, package='openssl'):
    return {'vulnerability': {'id': identifier, 'severity': severity}, 'artifact': {'name': package, 'version': '1.0'}}


class CveBudget(unittest.TestCase):
    def run_gate(self, matches, budgets, image='unfold', ignored=0):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'grype.json'
            report.write_text(json.dumps({'descriptor': {'version': '0.121.0'}, 'matches': matches, 'ignoredMatches': [{}] * ignored}))
            budget_file = Path(directory) / 'budgets.yaml'
            budget_file.write_text(budgets)
            output = Path(directory) / 'cve-budget.json'
            status = cve_budget.main(str(report), str(budget_file), image, 'ghcr.io/unfold-hq/unfold@sha256:' + 'a' * 64, str(output))
            return status, json.loads(output.read_text())

    def test_the_committed_budgets_enforce_zero_critical_and_high_for_both_images(self):
        budgets = (ROOT / 'apps/unfold/ops/security/cve-budgets.yaml').read_text()
        for image in ['unfold', 'unfold-agent']:
            status, predicate = self.run_gate([match('CVE-1', 'Medium')], budgets, image)
            self.assertEqual((status, predicate['met']), (0, True), image)
            status, predicate = self.run_gate([match('CVE-2', 'High')], budgets, image)
            self.assertEqual((status, predicate['met']), (1, False), image)

    def test_a_vulnerability_found_twice_in_one_package_counts_once(self):
        status, predicate = self.run_gate([match('CVE-3', 'High'), match('CVE-3', 'High')], 'defaults:\n  mode: enforce\n  high: 1\n')
        self.assertEqual((status, predicate['found']['high']), (0, 1))

    def test_a_reporting_budget_warns_instead_of_failing(self):
        status, predicate = self.run_gate([match('CVE-4', 'Critical')], 'defaults:\n  mode: report\n  critical: 0\n', ignored=2)
        self.assertEqual((status, predicate['met'], predicate['suppressedByVex']), (0, False, 2))

    def test_a_budget_without_a_mode_reaches_no_verdict(self):
        with self.assertRaisesRegex(ValueError, 'mode enforce or report'):
            self.run_gate([], 'defaults:\n  high: 0\n')


if __name__ == '__main__':
    unittest.main()
