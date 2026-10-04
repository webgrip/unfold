import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';
import { resolve } from 'node:path';
import { gateKey, resultCache } from './verify-cache.mjs';
import { runGate } from './verify-gate.mjs';

const root = resolve(import.meta.dirname, '..');

const gate = (scope, command, args, options = {}) => ({ scope, command, args, ...options });
const unfold = task => gate('apps/unfold', 'npm', ['run', ...task.split(' ')]);
const site = task => gate('apps/site', 'corepack', ['pnpm', 'run', task]);
const helm = [];
for (const [scope, name, variants] of [
  ['unfold', 'unfold', ['', 'values.live.example.yaml']],
]) {
  const chart = `ops/helm/${name}`;
  for (const variant of variants) {
    const values = variant ? ['-f', `${chart}/${variant}`] : [];
    helm.push(gate(`apps/${scope}`, 'helm', ['lint', chart, ...values]));
    helm.push(gate(`apps/${scope}`, 'helm', ['template', name, chart, ...values], { discardStdout: true }));
  }
}

const groups = [
  { name: 'unfold', inputs: ['apps/unfold', 'docs'], gates: ['typecheck', 'test', 'check', 'design:check', 'brand:check', 'license:check', 'backlog -- check'].map(unfold) },
  { name: 'unfold-extension', inputs: ['apps/unfold'], gates: ['extension:build', 'extension:test', 'extension:package', 'extension:verify'].map(unfold) },
  {
    name: 'ploeg',
    inputs: ['apps/ploeg', 'apps/unfold/scripts/unified-demo', '.gitmodules', 'scripts/ploeg-pin.mjs'],
    gates: [
      gate('.', process.execPath, ['scripts/ploeg-pin.mjs']),
      gate('apps/ploeg', 'bash', ['scripts/verify.sh']),
      gate('apps/ploeg', 'go', ['build', '-o', devNull, resolve(root, 'apps/unfold/scripts/unified-demo/main.go')]),
    ],
  },
  { name: 'brand', inputs: ['scripts/build-brand.mjs', 'docs/brand', 'apps/site/src/brand', 'apps/site/src/styles/brand.css', 'README.md'], gates: [gate('.', process.execPath, ['scripts/build-brand.mjs', '--check'])] },
  { name: 'site', inputs: ['apps/site', 'apps/unfold/public', 'apps/unfold/src', 'apps/unfold/examples', 'apps/unfold/scripts/record-replay.ts', 'apps/unfold/package.json'], gates: ['format:check', 'lint', 'typecheck', 'test', 'build'].map(site) },
  { name: 'site-demo', inputs: ['apps/site', 'apps/unfold/src', 'apps/unfold/examples', 'apps/unfold/package.json'], gates: [gate('apps/site', 'node', ['scripts/demo-timeline.ts', '--check'])] },
  { name: 'helm', inputs: ['apps/unfold/ops/helm'], gates: helm },
  {
    name: 'release',
    gates: [
      gate('.', 'python3', ['scripts/verify-import.py']),
      gate('.', 'uv', ['run', '--frozen', 'python', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_release*.py']),
      gate('.', process.execPath, ['--test', 'scripts/fake-litellm.test.mjs', 'scripts/eval/eval.test.mjs', 'scripts/verify-cache.test.mjs', 'scripts/verify-gate.test.mjs', 'scripts/ci-warnings.test.mjs', 'scripts/release-repair.test.mjs', 'scripts/release-floors.test.cjs', 'scripts/ploeg-pin.test.mjs']),
    ],
  },
  { name: 'integration', gates: [gate('.', process.execPath, ['scripts/integration.mjs'])] },
  { name: 'docs', gates: [gate('.', 'uv', ['run', '--frozen', 'python', 'scripts/docs.py', '--check'])] },
];

const cpus = process.env.UNFOLD_VERIFY_CPUS;
const parallelism = cpus ? { GOMAXPROCS: cpus, GOFLAGS: `${process.env.GOFLAGS ?? ''} -p=${cpus}`.trim(), UNFOLD_TEST_CONCURRENCY: cpus } : {};

const results = process.env.UNFOLD_VERIFY_RESULTS ? resultCache(process.env.UNFOLD_VERIFY_RESULTS, { reuse: process.env.UNFOLD_VERIFY_REUSE === 'true' }) : undefined;
const toolVersions = scope => Object.fromEntries(Object.entries(JSON.parse(execFileSync('mise', ['-C', scope, 'ls', '--current', '--json'], { cwd: root, encoding: 'utf8' }))).map(([tool, installs]) => [tool, installs.map(install => install.version)]));
const shared = results && {
  paths: ['mise.toml', 'apps/unfold/mise.toml', 'apps/site/mise.toml', 'scripts/verify.mjs', 'scripts/verify-cache.mjs'],
  tools: Object.fromEntries(['.', 'apps/unfold', 'apps/ploeg', 'apps/site'].map(scope => [scope, toolVersions(scope)])),
  env: { GOFLAGS: process.env.GOFLAGS ?? '', UNFOLD_TEST_TIMEOUT_SCALE: process.env.UNFOLD_TEST_TIMEOUT_SCALE ?? '' },
};
if (shared) for (const group of groups) for (const step of group.gates) {
  if (group.inputs) step.key = gateKey(root, { scope: step.scope, command: step.command === process.execPath ? 'node' : step.command, args: step.args, inputs: group.inputs }, shared);
}

const running = new Set();
let failed = false;

function execute(step) {
  step.label = `${step.command === process.execPath ? 'node' : step.command} ${step.args.join(' ')}`;
  if (failed) {
    step.status = 'skipped';
    return Promise.resolve();
  }
  if (step.key && results.passed(step.key)) {
    step.status = 'cached';
    step.seconds = 0;
    return Promise.resolve();
  }
  const started = performance.now();
  const gate = runGate('mise', ['exec', '--', step.command, ...step.args], {
    cwd: resolve(root, step.scope),
    env: { ...process.env, ...parallelism, ...step.env },
    keepStdout: !step.discardStdout,
    captureStdout: step.emptyStdout,
  });
  step.gate = gate;
  running.add(gate);
  return gate.done.then(({ status, error, output, stdout, orphaned }) => {
    running.delete(gate);
    step.seconds = (performance.now() - started) / 1000;
    step.output = output;
    if (step.emptyStdout && stdout.trim()) step.output += `${step.label} reported files that need formatting\n`;
    if (step.status !== 'cancelled') step.status = status === 0 && !error && !orphaned && !(step.emptyStdout && stdout.trim()) ? 'passed' : 'failed';
    if (step.status === 'passed' && step.key) results.record(step.key, `${step.scope}: ${step.label}`);
    if (step.status === 'failed' && !failed) cancel();
  });
}

function cancel() {
  failed = true;
  for (const group of groups) for (const step of group.gates) {
    if (step.gate && running.has(step.gate)) {
      step.status = 'cancelled';
      step.gate.stop();
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
