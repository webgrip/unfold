import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gateKey, resultCache } from './verify-cache.mjs';

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'verify-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, stdio: 'ignore' });
  const write = (path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); };
  const commit = () => { run('add', '-A'); run('commit', '-q', '-m', 'change'); };
  run('init', '-q');
  write('mise.toml', 'node = "24"\n');
  write('apps/vloer/index.ts', 'export {};\n');
  write('apps/ploeg/main.go', 'package main\n');
  commit();
  return { root, write, commit };
}

const shared = { paths: ['mise.toml'], tools: { node: '24.19.0' }, env: { GOFLAGS: '-count=1' } };
const vloerTest = { scope: 'apps/vloer', command: 'npm', args: ['run', 'test'], inputs: ['apps/vloer'] };

test('a gate keeps its key while only another application changes', t => {
  const repo = repository(t);
  const before = gateKey(repo.root, vloerTest, shared);
  repo.write('apps/ploeg/main.go', 'package main\n\nfunc main() {}\n');
  repo.commit();
  assert.equal(gateKey(repo.root, vloerTest, shared), before);
});

test('a gate gets a new key when its inputs, the shared files, its tools, its environment or its command change', t => {
  const repo = repository(t);
  const before = gateKey(repo.root, vloerTest, shared);
  assert.notEqual(gateKey(repo.root, vloerTest, { ...shared, tools: { node: '24.21.0' } }), before);
  assert.notEqual(gateKey(repo.root, vloerTest, { ...shared, env: { GOFLAGS: '' } }), before);
  assert.notEqual(gateKey(repo.root, { ...vloerTest, args: ['run', 'check'] }, shared), before);
  repo.write('mise.toml', 'node = "24.21.0"\n');
  repo.commit();
  const afterTools = gateKey(repo.root, vloerTest, shared);
  assert.notEqual(afterTools, before);
  repo.write('apps/vloer/index.ts', 'export const changed = true;\n');
  repo.commit();
  assert.notEqual(gateKey(repo.root, vloerTest, shared), afterTools);
});

test('an uncommitted or untracked input makes the gate uncacheable', t => {
  const repo = repository(t);
  repo.write('apps/vloer/index.ts', 'export const edited = true;\n');
  assert.equal(gateKey(repo.root, vloerTest, shared), undefined);
  repo.commit();
  repo.write('apps/vloer/new.ts', 'export {};\n');
  assert.equal(gateKey(repo.root, vloerTest, shared), undefined);
});

test('recorded passes are reused only when reuse is enabled, and stale markers are pruned', t => {
  const directory = mkdtempSync(join(tmpdir(), 'verify-results-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  resultCache(directory, { reuse: false }).record('fresh', 'npm run test');
  assert.equal(resultCache(directory, { reuse: false }).passed('fresh'), false);
  assert.equal(resultCache(directory, { reuse: true }).passed('fresh'), true);
  assert.equal(resultCache(directory, { reuse: true }).passed('unknown'), false);
  resultCache(directory, { reuse: false }).record('stale', 'npm run test');
  const old = new Date(Date.now() - 30 * 86_400_000);
  utimesSync(join(directory, 'stale'), old, old);
  resultCache(directory, { reuse: true, retentionDays: 14 });
  assert.equal(existsSync(join(directory, 'stale')), false);
  assert.equal(existsSync(join(directory, 'fresh')), true);
});
