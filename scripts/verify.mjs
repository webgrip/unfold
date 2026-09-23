import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
function run(scope, command, args, options = {}) {
  console.log(`${scope}: ${command} ${args.join(' ')}`);
  const result = spawnSync('mise', ['exec', '--', command, ...args], { cwd: resolve(root, scope), stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw result.error || new Error(`Gate failed: ${command} ${args.join(' ')}`);
}
for (const task of ['typecheck', 'test', 'check', 'design:check', 'brand:check', 'license:check', 'extension:build', 'extension:test', 'extension:package', 'extension:verify']) run('apps/vloer', 'npm', ['run', task]);
run('apps/vloer', 'npm', ['run', 'backlog', '--', 'check']);
const formatting = spawnSync('gofmt', ['-l', '.'], { cwd: resolve(root, 'apps/ploeg'), encoding: 'utf8' });
if (formatting.error || formatting.status !== 0 || formatting.stdout.trim()) throw new Error(formatting.stdout || formatting.stderr || 'gofmt failed');
for (const task of ['vet', 'build', 'test']) run('apps/ploeg', 'go', [task, './...']);
for (const script of ['brand-marks.sh', 'license-check.sh']) run('apps/ploeg', 'bash', [`scripts/${script}`]);
for (const [scope, name, variants] of [
  ['vloer', 'de-vloer', ['', 'values.live.example.yaml']],
  ['ploeg', 'ploeg', ['', 'ci/executor-values.yaml', 'ci/executor-cronjob-values.yaml', 'ci/executor-gitlab-values.yaml', 'ci/monitoring-values.yaml']],
]) {
  const chart = `ops/helm/${name}`;
  for (const variant of variants) {
    const values = variant ? ['-f', `${chart}/${variant}`] : [];
    run(`apps/${scope}`, 'helm', ['lint', chart, ...values]);
    run(`apps/${scope}`, 'helm', ['template', name, chart, ...values], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
}
run('apps/ploeg', 'sh', ['scripts/helm-golden.sh', 'check']);
run('apps/ploeg', 'openspec', ['validate', '--all', '--strict']);
run('.', 'python3', ['scripts/verify-import.py']);
run('.', 'uv', ['run', '--frozen', 'python', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_release*.py']);
run('.', process.execPath, ['--test', 'scripts/fake-litellm.test.mjs']);
run('.', process.execPath, ['scripts/integration.mjs']);
run('.', 'uv', ['run', '--frozen', 'python', 'scripts/docs.py', '--check']);
