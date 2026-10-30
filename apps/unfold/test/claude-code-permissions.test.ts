import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answeredLocally, decisionOutput, permissionSummary, programs, redact, waitSettings } from '../extensions/claude-code/scripts/permission.mjs';
import { scaledTimeout } from './timeframes.ts';

const hook = fileURLToPath(new URL('../extensions/claude-code/scripts/unfold-hook.mjs', import.meta.url));
const requestId = '7d1f0c2a-3b4c-4d5e-8f60-718293a4b5c6';
const fakeGithubToken = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123'].join('_');
const fakeDigest = 'f00d'.repeat(10);
const fakeHeader = ['Authorization:', 'Bearer', 'not-a-real-value'].join(' ');

test('the summary names the tool and what it touches, never the command, file contents or a secret', () => {
  const bash = permissionSummary({ tool_name: 'Bash', cwd: '/work/repo', tool_input: { command: `curl -H "${fakeHeader}" https://api.example.org/v1 && git push origin main | tee out.log`, description: 'Push and report status with token=abc123' } });
  assert.deepEqual(bash, { tool: 'Bash', summary: 'Push and report status with token=[redacted]', detail: 'Runs curl, git push, tee' });
  assert.equal(permissionSummary({ tool_name: 'Bash', tool_input: { command: 'FOO=1 BAR=2 ./scripts/deploy.sh --prod' } }).summary, 'Run a shell command');
  assert.deepEqual(programs('sudo apt install x; (cd web && npm test)\nrm -rf "a;b"'), ['sudo apt', 'cd', 'npm test', 'rm']);
  assert.deepEqual(permissionSummary({ tool_name: 'Write', cwd: '/work/repo', tool_input: { file_path: '/work/repo/src/login.ts', content: 'const greeting = "hello";' } }), { tool: 'Write', summary: 'Write src/login.ts', detail: '' });
  assert.equal(permissionSummary({ tool_name: 'Edit', cwd: '/work/repo', tool_input: { file_path: join(homedir(), '.ssh', 'config'), new_string: 'Host *' } }).summary, 'Edit ~/.ssh/config');
  assert.equal(permissionSummary({ tool_name: 'WebFetch', tool_input: { url: 'https://docs.example.org/private?page=1', prompt: 'summarise' } }).summary, 'Fetch a page from docs.example.org');
  assert.equal(permissionSummary({ tool_name: 'WebSearch', tool_input: { query: 'my private question' } }).summary, 'Search the web');
  assert.equal(permissionSummary({ tool_name: 'mcp__github__create_issue', tool_input: { body: 'private' } }).summary, 'Call create_issue on the MCP server github');
  assert.equal(permissionSummary({ tool_name: 'Agent', tool_input: { subagent_type: 'code-reviewer', prompt: 'private' } }).summary, 'Start a subagent (code-reviewer)');
  assert.equal(permissionSummary({ tool_name: 'Bash', tool_input: { description: `x${'y'.repeat(400)}` } }).summary.length, 200);
  assert.equal(redact(`key ${fakeGithubToken} and ${fakeDigest}1 and apps/unfold/extensions/claude-code`, 300), 'key [redacted] and [redacted] and apps/unfold/extensions/claude-code');
  assert.equal(redact(`header ${fakeHeader}`, 300), 'header Authorization: Bearer [redacted]');
  assert.equal(redact('one\u0007\nline', 50), 'one line');
  assert.deepEqual(waitSettings({ UNFOLD_REMOTE_APPROVAL_WAIT_S: '5', UNFOLD_REMOTE_APPROVAL_POLL_MS: '10' }), { waitSeconds: 10, pollMs: 500 });
  assert.deepEqual(waitSettings({}), { waitSeconds: 120, pollMs: 2000 });
  assert.deepEqual(decisionOutput({ decision: 'deny', reason: 'Run the tests first' }).hookSpecificOutput?.decision, { behavior: 'deny', message: 'The person denied this from Unfold. They said: Run the tests first' });
  assert.deepEqual(decisionOutput({ state: 'expired' }), {});
});

test('a prompt answered in the terminal shows in the transcript as a result for the latest identical call', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-permission-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const transcript = join(dir, 't.jsonl');
  const call = (id: string, command: string) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { description: 'Run tests', command } }] } });
  const result = (id: string) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: '' }] } });
  await writeFile(transcript, [call('toolu_1', 'npm test'), result('toolu_1'), call('toolu_2', 'npm test')].join('\n'));
  assert.equal(answeredLocally(transcript, 'Bash', { command: 'npm test', description: 'Run tests' }), false, 'an earlier identical call that ran does not count');
  await writeFile(transcript, [call('toolu_1', 'npm test'), result('toolu_1'), call('toolu_2', 'npm test'), result('toolu_2')].join('\n'));
  assert.equal(answeredLocally(transcript, 'Bash', { command: 'npm test', description: 'Run tests' }), true);
  assert.equal(answeredLocally(join(dir, 'missing.jsonl'), 'Bash', {}), false);
});

type Step = Record<string, unknown>;

async function fakeUnfold(collects: Step[]) {
  const received: { path: string; body: any }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const path = String(req.url);
      received.push({ path, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      res.writeHead(path.endsWith('/permissions') ? 201 : 200, { 'content-type': 'application/json' });
      if (path.endsWith('/permissions')) res.end(JSON.stringify({ request: { id: requestId, state: 'pending' } }));
      else if (path.endsWith('/collect')) res.end(JSON.stringify(collects.length > 1 ? collects.shift() : collects[0] ?? { state: 'pending' }));
      else if (path.endsWith('/withdraw')) res.end(JSON.stringify({ state: 'withdrawn' }));
      else res.end(JSON.stringify({ session: { link: 'http://unfold.test/#linked-session/x', workItems: [] } }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, received, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

function runHook(payload: Record<string, unknown>, env: Record<string, string>, { terminateAfterMs = 0 } = {}): Promise<{ stdout: string; code: number | null; ms: number }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook], { env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ stdout, code, ms: Date.now() - started }));
    child.stdin.end(JSON.stringify(payload));
    if (terminateAfterMs) setTimeout(() => child.kill('SIGTERM'), terminateAfterMs);
  });
}

async function scenario(t: { after: (fn: () => Promise<void>) => void }, collects: Step[], extraEnv: Record<string, string> = {}, options = {}, transcriptLines: string[] = []) {
  const unfold = await fakeUnfold(collects);
  const dir = await mkdtemp(join(tmpdir(), 'unfold-permission-'));
  t.after(async () => { await unfold.close(); await rm(dir, { recursive: true, force: true }); });
  const transcript = join(dir, 'transcript.jsonl');
  await writeFile(transcript, transcriptLines.join('\n'));
  const env = { HOME: dir, UNFOLD_URL: unfold.url, UNFOLD_TOKEN: 'vle_test', CLAUDE_PLUGIN_DATA: join(dir, 'data'), UNFOLD_REMOTE_APPROVAL: '1', UNFOLD_REMOTE_APPROVAL_POLL_MS: '500', ...extraEnv };
  const payload = { session_id: 'plugin-permission-1', cwd: dir, transcript_path: transcript, hook_event_name: 'PermissionRequest', permission_mode: 'default', tool_name: 'Bash', tool_input: { command: 'rm -rf node_modules', description: 'Remove node_modules' } };
  const result = await runHook(payload, env, options);
  return { ...result, unfold };
}

test('the real hook reports the prompt and its summary, then returns the allow the owner gave in Unfold', async t => {
  const run = await scenario(t, [{ state: 'pending' }, { state: 'delivered', decision: 'allow' }]);
  assert.equal(run.code, 0);
  assert.deepEqual(JSON.parse(run.stdout), { systemMessage: 'Allowed from Unfold.', hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  const [waiting, created] = run.unfold.received;
  assert.deepEqual([waiting.path, waiting.body.event, waiting.body.waitingFor], ['/api/linked-sessions/events', 'waiting', 'permission_prompt']);
  assert.equal(created.path, '/api/linked-sessions/plugin-permission-1/permissions');
  assert.deepEqual(created.body, { tool: 'Bash', summary: 'Remove node_modules', detail: 'Runs rm', waitSeconds: 120 }, 'only the tool, the summary and the wait leave the machine');
  assert.doesNotMatch(JSON.stringify(run.unfold.received), /rm -rf/);
  assert.equal(run.unfold.received.filter(entry => entry.path.endsWith('/collect')).length, 2);
});

test('the real hook returns a denial with the owner’s reason for Claude', async t => {
  const run = await scenario(t, [{ state: 'delivered', decision: 'deny', reason: 'Use npm ci instead' }]);
  assert.deepEqual(JSON.parse(run.stdout).hookSpecificOutput.decision, { behavior: 'deny', message: 'The person denied this from Unfold. They said: Use npm ci instead' });
});

test('with no answer the real hook gives up after its wait, withdraws the prompt and leaves the terminal prompt to the person', async t => {
  const run = await scenario(t, [{ state: 'pending' }], { UNFOLD_REMOTE_APPROVAL_WAIT_S: '10' });
  assert.deepEqual([run.stdout, run.code], ['', 0]);
  assert.ok(run.ms >= 9000 && run.ms < scaledTimeout(15000), `waited ${run.ms} ms`);
  assert.ok(run.unfold.received.some(entry => entry.path.endsWith('/withdraw')));
  const expired = await scenario(t, [{ state: 'pending' }, { state: 'expired' }]);
  assert.deepEqual([expired.stdout, expired.code], ['', 0], 'an expired prompt decides nothing');
});

test('the real hook stops waiting when the prompt was answered in the terminal or Claude Code stops it, and says nothing', async t => {
  const transcript = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_9', name: 'Bash', input: { command: 'rm -rf node_modules', description: 'Remove node_modules' } }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_9', content: '' }] } }),
  ];
  const local = await scenario(t, [{ state: 'pending' }], {}, {}, transcript);
  assert.deepEqual([local.stdout, local.code], ['', 0]);
  assert.ok(local.ms < scaledTimeout(5000), `stopped after ${local.ms} ms`);
  assert.ok(local.unfold.received.some(entry => entry.path.endsWith('/withdraw') && entry.body.answered === true), 'the plugin says the terminal answered it');
  assert.equal(local.unfold.received.some(entry => entry.path.endsWith('/collect')), false, 'a prompt answered locally is not collected');
  const stopped = await scenario(t, [{ state: 'pending' }], {}, { terminateAfterMs: 1200 });
  assert.deepEqual([stopped.stdout, stopped.code], ['', 0]);
  assert.ok(stopped.ms < scaledTimeout(5000), `stopped after ${stopped.ms} ms`);
  assert.ok(stopped.unfold.received.some(entry => entry.path.endsWith('/withdraw')));
});

test('without UNFOLD_REMOTE_APPROVAL=1 the PermissionRequest hook sends nothing and decides nothing', async t => {
  const run = await scenario(t, [{ state: 'delivered', decision: 'allow' }], { UNFOLD_REMOTE_APPROVAL: '' });
  assert.deepEqual([run.stdout, run.code, run.unfold.received.length], ['', 0, 0]);
});
