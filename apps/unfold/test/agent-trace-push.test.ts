import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandDirectory, pushAgentTrace as pushAgentTraceWithin, pushedRemote } from '../extensions/claude-code/scripts/push-agent-trace.mjs';
import { scaledTimeout } from './timeframes.ts';

const hook = fileURLToPath(new URL('../extensions/claude-code/scripts/unfold-hook.mjs', import.meta.url));
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function remoteAndClones(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-notes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bare = join(dir, 'remote.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  const clone = (name: string) => {
    const path = join(dir, name);
    execFileSync('git', ['clone', '-q', bare, path], { stdio: 'ignore' });
    git(path, 'config', 'user.email', `${name}@example.org`); git(path, 'config', 'user.name', name);
    return path;
  };
  const a = clone('a');
  git(a, 'commit', '-q', '--allow-empty', '-m', 'root');
  git(a, 'push', '-q', 'origin', 'main');
  const b = clone('b');
  return { dir, bare, a, b };
}

const pushAgentTrace = (input: { cwd: string; command: string }) => pushAgentTraceWithin({ ...input, deadlineMs: scaledTimeout(30_000) });
const note = (dir: string, sha: string, tool: string) => execFileSync('git', ['-C', dir, 'notes', '--ref=agent-trace', 'add', '-f', '-F', '-', sha], { input: `${JSON.stringify({ version: '0.1', id: crypto.randomUUID(), timestamp: '2026-10-24T10:00:00Z', tool: { name: tool, version: '1' }, files: [] })}\n` });

test('the remote of a git push is read from the command, and commands that push no branch are left alone', () => {
  assert.equal(pushedRemote('git push origin feat/x'), 'origin');
  assert.equal(pushedRemote('cd apps && git push -u forgejo HEAD'), 'forgejo');
  assert.equal(pushedRemote('git push origin HEAD:refs/for/development -o topic=x -o "title=y"'), 'origin');
  assert.equal(pushedRemote('git push'), '');
  assert.equal(pushedRemote('git -C ../repo push --force-with-lease'), '');
  for (const command of ['git status', 'git push --dry-run origin x', 'git push origin --delete x', 'git push --mirror backup', 'git push origin refs/notes/agent-trace', 'git push --tags', 'echo git pushed']) assert.equal(pushedRemote(command), null, command);
  assert.equal(commandDirectory('git -C ../repo push', '/work/a'), '/work/a/../repo');
  assert.equal(commandDirectory('cd /srv/x && git push', '/work/a'), '/srv/x');
});

test('notes are pushed after a branch push, merged with the remote’s when another clone pushed first, and never forced', async t => {
  const { bare, a, b } = await remoteAndClones(t);
  assert.equal(pushAgentTrace({ cwd: a, command: 'git push origin main' }), 'nothing', 'no local notes, nothing to push');
  const first = git(a, 'rev-parse', 'HEAD');
  note(a, first, 'claude-code');
  assert.equal(pushAgentTrace({ cwd: a, command: 'git push origin main' }), 'pushed');
  assert.match(git(bare, 'notes', '--ref=agent-trace', 'show', first), /claude-code/);

  note(b, first, 'cursor');
  assert.equal(pushAgentTrace({ cwd: b, command: 'git push' }), 'merged', 'another tool noted the same commit in another clone, so the notes are merged before the second try');

  git(a, 'commit', '-q', '--allow-empty', '-m', 'second');
  const second = git(a, 'rev-parse', 'HEAD');
  note(a, second, 'claude-code');
  assert.equal(pushAgentTrace({ cwd: a, command: 'git push origin main' }), 'merged', 'the remote moved on, so a merges too');
  const shown = git(bare, 'notes', '--ref=agent-trace', 'show', first).split('\n');
  assert.equal(shown.length, 2, 'cat_sort_uniq keeps both tools’ records for one commit, one per line');
  assert.ok(shown.some(line => line.includes('"cursor"')) && shown.some(line => line.includes('"claude-code"')));
  assert.match(git(bare, 'notes', '--ref=agent-trace', 'show', second), /claude-code/);
  assert.equal(git(a, 'for-each-ref', 'refs/notes/'), git(a, 'for-each-ref', 'refs/notes/agent-trace'), 'the temporary ref is gone');
  assert.equal(pushAgentTrace({ cwd: a, command: 'git push nowhere main' }), 'nothing', 'an unknown remote name is not pushed to');
});

test('the hook pushes notes after a git push only with UNFOLD_PUSH_AGENT_TRACE=1, and stays silent when the push fails', async t => {
  const { dir, bare, a } = await remoteAndClones(t);
  const server = createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(done => server.close(() => done())));
  const address = server.address() as { port: number };
  const run = (env: Record<string, string>, command: string) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [hook], { env: { PATH: process.env.PATH ?? '', HOME: dir, UNFOLD_URL: `http://127.0.0.1:${address.port}`, UNFOLD_TOKEN: 'vle_test', CLAUDE_PLUGIN_DATA: join(dir, 'data'), ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify({ session_id: 'push-session-1', cwd: a, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { stdout: '' } }));
  });
  note(a, git(a, 'rev-parse', 'HEAD'), 'claude-code');
  await run({}, 'git push origin main');
  assert.equal(git(bare, 'for-each-ref', 'refs/notes/'), '', 'off by default: notes are outward-facing');
  assert.deepEqual(await run({ UNFOLD_PUSH_AGENT_TRACE: '1', UNFOLD_PUSH_AGENT_TRACE_TIMEOUT_MS: String(scaledTimeout(30_000)) }, 'git push origin main'), { code: 0, stdout: '', stderr: '' });
  assert.notEqual(git(bare, 'for-each-ref', 'refs/notes/agent-trace'), '');
  git(a, 'remote', 'set-url', 'origin', join(dir, 'missing.git'));
  assert.deepEqual(await run({ UNFOLD_PUSH_AGENT_TRACE: '1', UNFOLD_PUSH_AGENT_TRACE_TIMEOUT_MS: '3000' }, 'git push origin main'), { code: 0, stdout: '', stderr: '' });
});
