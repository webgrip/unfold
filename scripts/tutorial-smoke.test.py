import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

script = Path(__file__).with_name('tutorial-smoke.sh')

LAUNCHER = '''
data="$1"; mkdir -p "$data"
trap 'rm -rf "$data"; echo "{\\"event\\":\\"unified-demo.stopped\\",\\"removedDataDir\\":\\"$data\\",\\"modelCalls\\":0,\\"spendUsd\\":0}"; exit 0' TERM
echo 'LOCAL DEMONSTRATION: fake launcher'
echo "{\\"event\\":\\"unified-demo.ready\\",\\"url\\":\\"http://127.0.0.1:9\\",\\"dataDir\\":\\"$data\\",\\"pid\\":$$,\\"modelCalls\\":0,\\"spendUsd\\":0}"
while :; do sleep 0.1; done
'''
SMOKE = '''echo '{"event":"unified-demo.smoke-passed","ok":true,"modelCalls":0}'; echo '{"event":"unified-demo.stopped","modelCalls":0}'
'''


@unittest.skipIf(os.getuid() == 0 or not shutil.which('bash'), 'needs bash and a non-root user, as PostgreSQL does')
class TutorialSmoke(unittest.TestCase):
    def run_smoke(self, *args, launcher=LAUNCHER, smoke=SMOKE, pg=True, curl=0):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            pg_bin = base / 'pg'
            pg_bin.mkdir()
            if pg:
                for name in ['initdb', 'postgres']:
                    (pg_bin / name).write_text('#!/bin/sh\n')
                    (pg_bin / name).chmod(0o755)
            (base / 'launcher.sh').write_text(launcher)
            (base / 'smoke.sh').write_text(smoke)
            tools = base / 'bin'
            tools.mkdir()
            (tools / 'curl').write_text(f'#!/bin/sh\nexit {curl}\n')
            (tools / 'curl').chmod(0o755)
            env = {**os.environ, 'PG_BIN': str(pg_bin), 'GLIDE_TUTORIAL_COMMAND': f'bash {base}/launcher.sh {base}/data', 'GLIDE_TUTORIAL_SMOKE_COMMAND': f'bash {base}/smoke.sh', 'GLIDE_TUTORIAL_TIMEOUT': '20', 'PATH': f'{tools}:/usr/bin:/bin', 'GITHUB_OUTPUT': str(base / 'output')}
            result = subprocess.run(['bash', str(script), *args], env=env, capture_output=True, text=True, timeout=120)
            output = (base / 'output').read_text() if (base / 'output').exists() else ''
            return result, output, (base / 'data').exists()

    def test_missing_postgres_skips_cleanly(self):
        result, output, _ = self.run_smoke('--check', pg=False)
        self.assertEqual(result.returncode, 0)
        self.assertIn('skipped; missing prerequisites', result.stdout)
        self.assertEqual(output, 'ready=false\n')

    def test_check_reports_present_prerequisites(self):
        result, output, _ = self.run_smoke('--check')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'ready=true\n')

    def test_waits_for_ready_then_stops_and_cleans_up(self):
        result, _, data_left = self.run_smoke()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('the documented demo started', result.stdout)
        self.assertIn('automated smoke check completed', result.stdout)
        self.assertFalse(data_left)

    def test_a_smoke_check_without_its_pass_event_fails(self):
        result, _, _ = self.run_smoke(smoke='echo \'{"event":"unified-demo.stopped"}\'\n')
        self.assertEqual(result.returncode, 1)
        self.assertIn('no unified-demo.smoke-passed', result.stderr)
        result, _, _ = self.run_smoke(smoke='echo \'{"event":"unified-demo.smoke-passed"}\'; exit 1\n')
        self.assertEqual(result.returncode, 1)
        self.assertIn('did not exit cleanly', result.stderr)

    def test_an_unanswered_workbench_fails_and_still_stops_the_launcher(self):
        result, _, data_left = self.run_smoke(curl=7)
        self.assertEqual(result.returncode, 1)
        self.assertIn('did not answer', result.stderr)
        self.assertFalse(data_left)

    def test_a_launcher_that_dies_before_ready_fails(self):
        result, _, _ = self.run_smoke(launcher='echo "Error: postgres failed"; exit 1\n')
        self.assertEqual(result.returncode, 1)
        self.assertIn('exited before unified-demo.ready', result.stderr)
        self.assertIn('postgres failed', result.stderr)


if __name__ == '__main__':
    unittest.main()
