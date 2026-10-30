import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceEntry, evidenceKind, exitCodeOf, ledgerLimits, readLedger, recordEvidence, redact } from '../extensions/claude-code/scripts/evidence.mjs';

const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const sessionId = 'evidence-session-1';
const bash = (command: string, extra: Record<string, unknown> = {}) => ({ session_id: sessionId, hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd: '/work/homelab-cluster', tool_input: { command }, tool_response: { stdout: 'ok 12 tests\npass 12\n', stderr: '', interrupted: false }, ...extra });
const fake = (prefix: string, filler: string, length: number) => `${prefix}${filler.repeat(length)}`;

test('commands that prove something are classified, and reading or editing commands are not evidence', () => {
  assert.equal(evidenceKind('cd apps/unfold && mise exec -- npm test'), 'test');
  assert.equal(evidenceKind('node --test test/delivery-brief.test.ts'), 'test');
  assert.equal(evidenceKind('bash scripts/test-eso-grants.sh'), 'test');
  assert.equal(evidenceKind('python3 scripts/check_release_lockstep.py'), 'lint');
  assert.equal(evidenceKind('./scripts/run-flux-local-test.sh'), 'render');
  assert.equal(evidenceKind('mise exec -- helm template openbao ./chart -f values.yaml'), 'render');
  assert.equal(evidenceKind('kubectl -n ploeg get pods -o wide'), 'live');
  assert.equal(evidenceKind('curl -s https://forgejo.example/api/v1/repos/o/r/commits/abc/status'), 'ci');
  assert.equal(evidenceKind('git push origin HEAD:refs/for/main'), 'delivery');
  for (const reading of ['ls -la', 'cat README.md', 'grep -rn foo .', 'sed -i s/a/b/ file', 'git status --short', 'git log --oneline -3']) assert.equal(evidenceKind(reading), '', reading);
});

test('secrets in commands and output are redacted before anything is written', () => {
  const bearer = fake('', 'q', 16);
  const github = fake('ghp_', 'k', 30);
  const provider = fake('sk-proj-', 'm', 24);
  const jwt = [fake('eyJ', 'a', 14), fake('', 'b', 14), fake('', 'c', 14)].join('.');
  const word = fake('pw', 'z', 10);
  const cases: [string, string][] = [
    [`curl -H "Authorization: Bearer ${bearer}" https://x.example`, bearer],
    [`curl -H "Authorization: token ${github}" https://x.example`, github],
    [`bao kv put secret/app password=${word}`, word],
    [`tool --client-secret ${word} --token=${word}`, word],
    [`git clone https://user:${word}@forgejo.example/o/r.git`, word],
    [`export PROVIDER=${provider}`, provider],
    [`echo ${jwt}`, jwt],
  ];
  for (const [text, secret] of cases) {
    const clean = redact(text);
    assert.match(clean, /\[redacted\]/, text);
    assert.ok(!clean.includes(secret), `the secret leaked from ${text}`);
  }
  assert.equal(redact('kubectl -n ploeg get pods'), 'kubectl -n ploeg get pods');
});

test('a passing command, a failing one and an interrupted one each record their outcome, exit code and a short output tail', () => {
  const passed = evidenceEntry(bash('npm test'), new Date('2026-10-29T20:00:00Z'));
  assert.deepEqual(passed, { at: '2026-10-29T20:00:00.000Z', kind: 'test', command: 'npm test', cwd: 'homelab-cluster', outcome: 'passed', exitCode: 0, tail: 'ok 12 tests\npass 12' });
  const failed = evidenceEntry({ ...bash('npm test'), hook_event_name: 'PostToolUseFailure', error: `Exit code 1\nline 1\nline 2\nline 3\nnot ok 3 - token=${fake('', 'f', 12)}` });
  assert.equal(failed?.outcome, 'failed');
  assert.equal(failed?.exitCode, 1);
  assert.equal(failed?.tail, 'line 2\nline 3\nnot ok 3 - token=[redacted]');
  const interrupted = evidenceEntry({ ...bash('npm test'), hook_event_name: 'PostToolUseFailure', is_interrupt: true, error: 'Interrupted' });
  assert.equal(interrupted?.outcome, 'interrupted');
  assert.equal(interrupted?.exitCode, undefined);
  assert.equal(exitCodeOf('Exit code 137\nKilled'), 137);
  assert.equal(evidenceEntry({ ...bash('ls'), tool_name: 'Read' }), null);
  const long = evidenceEntry(bash(`npm test ${'x'.repeat(1000)}`));
  assert.ok((long?.command.length ?? 0) <= ledgerLimits.command);
});

test('the ledger numbers entries, survives being read back, and keeps only the newest entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-evidence-'));
  try {
    recordEvidence(bash('npm test'), dir);
    recordEvidence(bash('cat file'), dir);
    recordEvidence(bash('kubectl get pods'), dir);
    const entries = readLedger(join(dir, `${sessionId}.jsonl`));
    assert.deepEqual(entries.map(entry => [entry.id, entry.kind]), [['e1', 'test'], ['e2', 'live']]);
    for (let index = 0; index < ledgerLimits.entries + 5; index += 1) recordEvidence(bash('npm test'), dir);
    const kept = readLedger(join(dir, `${sessionId}.jsonl`));
    assert.equal(kept.length, ledgerLimits.entries);
    assert.equal(kept.at(-1).id, `e${ledgerLimits.entries + 7}`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the hook records evidence even when Unfold is not configured, and UNFOLD_EVIDENCE=0 turns it off', async () => {
  const data = await mkdtemp(join(tmpdir(), 'unfold-evidence-hook-'));
  const run = async (input: object, env: Record<string, string>) => {
    const child = spawn(process.execPath, [join(plugin, 'scripts/unfold-hook.mjs')], { env: { PATH: process.env.PATH ?? '', CLAUDE_PLUGIN_DATA: data, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(JSON.stringify(input));
    const [code] = await once(child, 'exit');
    assert.equal(code, 0);
  };
  try {
    await run(bash('npm test'), {});
    await run({ ...bash('npm test'), hook_event_name: 'PostToolUseFailure', error: 'Exit code 2\nboom' }, {});
    await run(bash('kubectl get pods'), { UNFOLD_EVIDENCE: '0' });
    const entries = JSON.parse(`[${(await readFile(join(data, 'evidence', `${sessionId}.jsonl`), 'utf8')).trim().split('\n').join(',')}]`);
    assert.deepEqual(entries.map((entry: { outcome: string; exitCode?: number }) => [entry.outcome, entry.exitCode]), [['passed', 0], ['failed', 2]]);
    const ledger = spawn(process.execPath, [join(plugin, 'scripts/evidence-ledger.mjs'), sessionId], { env: { PATH: process.env.PATH ?? '', CLAUDE_PLUGIN_DATA: data } });
    let printed = '';
    ledger.stdout.on('data', chunk => { printed += chunk; });
    await once(ledger, 'exit');
    assert.match(printed, /\| e1 \| .* \| test \| passed \(0\) \| `npm test` \|/);
    assert.match(printed, /\| e2 \| .* \| failed \(2\) \|/);
  } finally { await rm(data, { recursive: true, force: true }); }
});
