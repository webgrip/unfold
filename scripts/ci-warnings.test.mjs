import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findWarnings, report } from './ci-warnings.mjs';

const captured = [
  '2026-10-01T12:01:21.5667892Z \x1b[33mmise\x1b[0m \x1b[33mWARN\x1b[0m  missing: \x1b[34mnpm:@fission-ai/openspec\x1b[0m@1.13.2',
  '\x1b[1mnpm\x1b[22m \x1b[33mwarn\x1b[39m \x1b[94mdeprecated\x1b[39m prebuild-install@7.1.3: No longer maintained.',
  ' WARN  deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported',
  'warning: `VIRTUAL_ENV=/x/.venv` does not match the project environment path `.venv` and will be ignored',
  '(node:2492591) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///a.ts is not specified',
  '(node:2492592) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///a.ts is not specified',
  '(node:2500503) ExperimentalWarning: stripTypeScriptTypes is an experimental feature and might change at any time',
  'scripts/docs.py:12: DeprecationWarning: datetime.utcnow() is deprecated',
  '::warning::No credential is configured.',
  '12:00:01 [WARN] [vite] Some chunks are larger than 500 kB',
].join('\n');

const ignored = [
  '✔ the actual release notes retain a breaking-change compatibility warning (173.133263ms)',
  '{"level":"warn","event":"login.failed","method":"oidc","code":"oidc_state"}',
  'hint: to use in all of your new repositories, which will suppress this warning,',
  'ℹ fail 0',
].join('\n');

test('each tool warning is found once, with its repeat count, and test output that mentions warnings is not', () => {
  const warnings = findWarnings(`${captured}\n${ignored}`);
  assert.deepEqual(warnings.map(warning => warning.tool), ['mise', 'npm', 'pnpm', 'uv', 'node', 'node', 'python', 'actions', 'build']);
  assert.equal(warnings[0].line, 'mise WARN  missing: npm:@fission-ai/openspec@1.13.2');
  assert.equal(warnings.find(warning => warning.line.includes('MODULE_TYPELESS')).count, 2);
});

test('an allowlisted warning is accepted and every other warning still reports', () => {
  const allowed = [{ pattern: '^\\(node\\) ExperimentalWarning: stripTypeScriptTypes', reason: 'deliberate' }];
  const warnings = findWarnings(captured, allowed);
  assert.ok(!warnings.some(warning => warning.line.includes('stripTypeScriptTypes')));
  assert.equal(warnings.length, 8);
});

test('the report is empty without warnings and counts repeats', () => {
  assert.equal(report([]), '');
  assert.equal(report([{ tool: 'npm', line: 'npm warn x', count: 3 }, { tool: 'uv', line: 'warning: y', count: 1 }]), 'npm: npm warn x (3x)\nuv: warning: y');
});

test('every allowlist entry is a valid pattern with a reason', () => {
  const allowed = JSON.parse(readFileSync(new URL('./ci-warnings-allow.json', import.meta.url), 'utf8'));
  for (const entry of allowed) {
    assert.doesNotThrow(() => new RegExp(entry.pattern), entry.pattern);
    assert.ok(entry.reason?.length > 20, entry.pattern);
  }
});

test('the command writes the report as a step output and treats a missing capture as empty', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-warnings-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'setup.log'), 'npm warn deprecated a@1.0.0: gone\n');
  const output = join(directory, 'github-output');
  writeFileSync(output, '');
  const script = new URL('./ci-warnings.mjs', import.meta.url).pathname;
  execFileSync(process.execPath, [script, directory, join(directory, 'absent')], { env: { ...process.env, GITHUB_OUTPUT: output } });
  assert.match(readFileSync(output, 'utf8'), /^report<<(UNFOLD_WARNINGS_\d+)\nnpm: npm warn deprecated a@1\.0\.0: gone\n\1\n$/);
  writeFileSync(output, '');
  execFileSync(process.execPath, [script, join(directory, 'absent')], { env: { ...process.env, GITHUB_OUTPUT: output } });
  assert.match(readFileSync(output, 'utf8'), /^report<<(UNFOLD_WARNINGS_\d+)\n\n\1\n$/);
});
