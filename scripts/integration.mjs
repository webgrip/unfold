import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.build/qualification');
mkdirSync(output, { recursive: true });
const checks = [
  { name: 'standalone', cwd: 'apps/vloer', command: process.execPath, args: ['--test', 'test/api-workflow.test.ts', 'test/api-process.test.ts'] },
  { name: 'managed', cwd: 'apps/ploeg', command: 'go', args: ['test', './pkg/httpapi', '-run', '^TestOperatorWorkbenchQualification$', '-count=1', '-v'] },
];
const results = [];
for (const check of checks) {
  console.log(`Qualifying ${check.name} execution`);
  const result = spawnSync(check.command, check.args, { cwd: resolve(root, check.cwd), env: { ...process.env, PLOEG_WORKBENCH_PATH: resolve(root, 'apps/vloer') }, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024 });
  const log = (result.stdout || '') + (result.stderr || '');
  writeFileSync(resolve(output, `${check.name}.log`), log);
  if (result.error || result.status !== 0) throw new Error(`${check.name} failed: ${result.error || log}`);
  if (check.name === 'managed') assert.match(log, /--- PASS: TestOperatorWorkbenchQualification/);
  else {
    assert.match(log, /pass [1-9]/);
    assert.match(log, /real server crash/);
    assert.match(log, /pause, instructions, resume/);
    assert.doesNotMatch(log, /skipped [1-9]/);
  }
  results.push({ name: check.name, passed: true, command: [check.command, ...check.args], log: `${check.name}.log` });
}
const report = { schemaVersion: 1, at: new Date().toISOString(), runtime: 'deterministic fixture; actual HTTP, filesystem checks and PostgreSQL', modelCalls: 0, spendUsd: 0, checks: results, limits: ['No paid provider or Kubernetes qualification', 'No proof of interchangeable native harness session state'] };
writeFileSync(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
