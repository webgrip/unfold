import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const portOffset = Number.parseInt(process.env.PLOEG_TEST_PG_PORT_OFFSET ?? '', 10) || 0;

const gate = (scope, command, args, options = {}) => ({ scope, command, args, ...options });
const vloer = task => gate('apps/vloer', 'npm', ['run', ...task.split(' ')]);
const helm = [];
for (const [scope, name, variants] of [
  ['vloer', 'de-vloer', ['', 'values.live.example.yaml']],
  ['ploeg', 'ploeg', ['', 'ci/executor-values.yaml', 'ci/executor-cronjob-values.yaml', 'ci/executor-gitlab-values.yaml']],
]) {
  const chart = `ops/helm/${name}`;
  for (const variant of variants) {
    const values = variant ? ['-f', `${chart}/${variant}`] : [];
    helm.push(gate(`apps/${scope}`, 'helm', ['lint', chart, ...values]));
    helm.push(gate(`apps/${scope}`, 'helm', ['template', name, chart, ...values], { discardStdout: true }));
  }
}

const groups = [
  { name: 'vloer', gates: ['typecheck', 'test', 'check', 'design:check', 'brand:check', 'license:check', 'backlog -- check'].map(vloer) },
  { name: 'vloer-extension', gates: ['extension:build', 'extension:test', 'extension:package', 'extension:verify'].map(vloer) },
  {
    name: 'ploeg',
    gates: [
      gate('apps/ploeg', 'gofmt', ['-l', '.'], { emptyStdout: true }),
      ...['vet', 'build', 'test'].map(task => gate('apps/ploeg', 'go', [task, './...'])),
      ...['brand-marks.sh', 'license-check.sh'].map(script => gate('apps/ploeg', 'bash', [`scripts/${script}`])),
      gate('apps/ploeg', 'openspec', ['validate', '--all', '--strict']),
    ],
  },
  { name: 'helm', gates: [...helm, gate('apps/ploeg', 'sh', ['scripts/helm-golden.sh', 'check'])] },
  {
    name: 'release',
    gates: [
      gate('.', 'python3', ['scripts/verify-import.py']),
      gate('.', 'uv', ['run', '--frozen', 'python', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_release*.py']),
      gate('.', process.execPath, ['--test', 'scripts/fake-litellm.test.mjs']),
    ],
  },
  { name: 'integration', gates: [gate('.', process.execPath, ['scripts/integration.mjs'], { env: { PLOEG_TEST_PG_PORT_OFFSET: String(portOffset + 1) } })] },
  { name: 'docs', gates: [gate('.', 'uv', ['run', '--frozen', 'python', 'scripts/docs.py', '--check'])] },
];

const running = new Set();
let failed = false;

function execute(step) {
  step.label = `${step.command === process.execPath ? 'node' : step.command} ${step.args.join(' ')}`;
  if (failed) {
    step.status = 'skipped';
    return Promise.resolve();
  }
  const started = performance.now();
  return new Promise(done => {
    const child = spawn('mise', ['exec', '--', step.command, ...step.args], {
      cwd: resolve(root, step.scope),
      env: { ...process.env, ...step.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const chunks = [];
    let stdout = '';
    child.stdout.on('data', chunk => {
      if (step.emptyStdout) stdout += chunk;
      if (!step.discardStdout) chunks.push(chunk);
    });
    child.stderr.on('data', chunk => chunks.push(chunk));
    running.add(child);
    const finish = (status, error) => {
      running.delete(child);
      step.seconds = (performance.now() - started) / 1000;
      step.output = Buffer.concat(chunks).toString('utf8');
      if (error) step.output += `${error.message}\n`;
      if (step.emptyStdout && stdout.trim()) step.output += `${step.label} reported files that need formatting\n`;
      if (step.status !== 'cancelled') step.status = status === 0 && !error && !(step.emptyStdout && stdout.trim()) ? 'passed' : 'failed';
      if (step.status === 'failed' && !failed) cancel();
      done();
    };
    step.child = child;
    child.on('error', error => finish(null, error));
    child.on('close', status => finish(status));
  });
}

function cancel() {
  failed = true;
  for (const group of groups) for (const step of group.gates) {
    if (step.child && running.has(step.child)) {
      step.status = 'cancelled';
      try {
        process.kill(-step.child.pid, 'SIGTERM');
      } catch {}
    }
  }
}

async function runGroup(group) {
  const started = performance.now();
  for (const step of group.gates) await execute(step);
  group.seconds = (performance.now() - started) / 1000;
}

function report(group) {
  const lines = [`=== ${group.name} (${group.seconds.toFixed(1)}s)`];
  for (const step of group.gates) {
    const time = step.seconds === undefined ? '' : ` (${step.seconds.toFixed(1)}s)`;
    lines.push(`--- ${step.status.toUpperCase()} ${step.scope}: ${step.label}${time}`);
    if (step.output && step.status !== 'cancelled') lines.push(step.output.replace(/\n?$/, ''));
  }
  return `${lines.join('\n')}\n`;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  cancel();
  process.exitCode = 130;
});

const started = performance.now();
const finished = groups.map(runGroup);
for (const [index, group] of groups.entries()) {
  await finished[index];
  process.stdout.write(report(group));
}
const total = ((performance.now() - started) / 1000).toFixed(1);
const failures = groups.flatMap(group => group.gates.filter(step => step.status === 'failed').map(step => `${group.name}: ${step.scope}: ${step.label}`));
console.log(`\n=== Summary (${total}s wall)`);
for (const group of groups) {
  const counts = {};
  for (const step of group.gates) counts[step.status] = (counts[step.status] || 0) + 1;
  console.log(`${group.name.padEnd(16)} ${group.seconds.toFixed(1).padStart(6)}s  ${Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(', ')}`);
}
if (failures.length) {
  console.log(`\nFailed gates:\n${failures.map(line => `  ${line}`).join('\n')}`);
  process.exitCode = 1;
} else if (!process.exitCode) console.log('\nAll gates passed.');
