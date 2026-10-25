import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversationBounds, entriesOf, readConversation } from '../extensions/claude-code/scripts/conversation.mjs';

const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const hook = join(plugin, 'scripts/unfold-hook.mjs');
const channel = join(plugin, 'channel/unfold-channel.mjs');
const sessionId = 'conversation-session-1';
const cwd = '/home/dev/project';

const line = (value: Record<string, unknown>) => JSON.stringify({ uuid: randomUUID(), timestamp: '2026-10-25T10:00:00.000Z', isSidechain: false, cwd, ...value });
const prompt = (content: unknown, extra: Record<string, unknown> = {}) => line({ type: 'user', message: { role: 'user', content }, ...extra });
const assistant = (...content: unknown[]) => line({ type: 'assistant', message: { role: 'assistant', content } });

test('a transcript line gives the person’s prompt, the agent’s text and one redacted line per tool call, and nothing else', () => {
  assert.deepEqual(entriesOf(prompt('Fix the runner, the key is sk-ant-abc123def456ghi789')).map(entry => [entry.kind, entry.text]), [['prompt', 'Fix the runner, the key is [redacted]']]);
  assert.deepEqual(entriesOf(prompt([{ type: 'text', text: 'Look at this\n<system-reminder>internal</system-reminder>' }, { type: 'image', source: {} }])).map(entry => entry.text), ['Look at this']);
  assert.deepEqual(entriesOf(prompt('<command-name>/review</command-name><command-args>42</command-args>')).map(entry => entry.text), ['/review']);
  assert.deepEqual(entriesOf(prompt([{ type: 'tool_result', tool_use_id: 't1', content: 'kubectl output with a secret' }])), [], 'tool output never appears');
  assert.deepEqual(entriesOf(prompt('Caveat: hook output', { isMeta: true })), []);
  assert.deepEqual(entriesOf(prompt('subagent prompt', { isSidechain: true })), []);
  assert.deepEqual(entriesOf(assistant({ type: 'thinking', thinking: 'my private plan' })), [], 'thinking never appears');
  const reply = entriesOf(assistant({ type: 'text', text: 'Done. **Two** files changed.' }));
  assert.deepEqual(reply.map(entry => [entry.kind, entry.text]), [['reply', 'Done. **Two** files changed.']]);
  const tools = entriesOf(assistant(
    { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'curl -H "Authorization: Bearer abc" https://x | jq .', description: 'Fetch the status' } },
    { type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: `${cwd}/src/app.ts`, old_string: 'secret old', new_string: 'secret new' } },
  ), cwd);
  assert.deepEqual(tools.map(entry => [entry.kind, entry.text]), [['tool', 'Bash: Fetch the status'], ['tool', 'Edit: Edit src/app.ts']]);
  assert.notEqual(tools[0].id, tools[1].id, 'each part of one message has its own id');
  assert.deepEqual(entriesOf('{"type":"ai-title","aiTitle":"x"}'), []);
  assert.deepEqual(entriesOf('not json'), []);
});

test('reading from a cursor gives only what was written since, starts over when the transcript shrank, and keeps the newest entries within its bounds', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-conversation-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const transcript = join(dir, 'session.jsonl');
  await writeFile(transcript, `${prompt('first')}\n${assistant({ type: 'text', text: 'one' })}\n`);
  const first = readConversation(transcript, { cwd });
  assert.deepEqual(first.entries.map(entry => entry.text), ['first', 'one']);
  assert.equal(first.truncated, false);
  await appendFile(transcript, `${prompt('second')}\n{"type":"assistant","message":{"content":[{"type":"text","text":"half`);
  const second = readConversation(transcript, { after: first.cursor, cwd });
  assert.deepEqual(second.entries.map(entry => entry.text), ['second'], 'a line still being written waits for the next read');
  await appendFile(transcript, ` done"}]}}\n`);
  assert.deepEqual(readConversation(transcript, { after: second.cursor, cwd }).entries.map(entry => entry.text), ['half done']);
  await writeFile(transcript, `${prompt('rewritten')}\n`);
  const restarted = readConversation(transcript, { after: second.cursor + 1000, cwd });
  assert.equal(restarted.restarted, true);
  assert.deepEqual(restarted.entries.map(entry => entry.text), ['rewritten']);
  await writeFile(transcript, `${Array.from({ length: 260 }, (_, index) => prompt(`p${index} ${'x'.repeat(600)}`)).join('\n')}\n`);
  const bounded = readConversation(transcript, { cwd });
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.entries.length <= conversationBounds.entries);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded.entries)) <= conversationBounds.answerBytes);
  assert.match(bounded.entries.at(-1)!.text, /^p259 /);
});

async function fakeUnfold() {
  const answers: { path: string; body: any }[] = [];
  const polls: string[] = [];
  const want = randomUUID();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      res.writeHead(200, { 'content-type': 'application/json' });
      const path = String(req.url);
      if (path === '/api/linked-sessions/events') { res.end(JSON.stringify({ session: { link: '', workItems: [] }, context: '' })); return; }
      if (path === `/api/linked-sessions/${sessionId}/conversation/wants`) {
        polls.push(String(req.headers.authorization));
        if (polls.length === 1) { res.end(JSON.stringify({ wants: [{ id: want, after: null }] })); return; }
        setTimeout(() => res.end(JSON.stringify({ wants: [] })), 200);
        return;
      }
      if (path.includes('/conversation/answers/')) answers.push({ path, body });
      res.end('{}');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, want, answers, polls, close: () => new Promise<void>(done => server.close(() => done())) };
}

function runHook(payload: Record<string, unknown>, env: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [hook], { env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', reject);
    child.on('close', () => resolve());
    child.stdin.end(JSON.stringify({ session_id: sessionId, cwd: env.HOME, ...payload }));
  });
}

async function until<T>(check: () => T | undefined, ms = 5000): Promise<T | undefined> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const found = check(); if (found) return found; await new Promise(done => setTimeout(done, 50)); }
  return undefined;
}

test('the channel server answers a conversation read from the transcript the hooks found, with the owner’s credential, and stays silent with UNFOLD_CONVERSATION=0', async t => {
  const unfold = await fakeUnfold();
  const home = await mkdtemp(join(tmpdir(), 'unfold-relay-'));
  t.after(async () => { await unfold.close(); await rm(home, { recursive: true, force: true }); });
  const transcript = join(home, 'session.jsonl');
  await writeFile(transcript, `${prompt('relay me')}\n${assistant({ type: 'text', text: 'relayed' }, { type: 'tool_use', id: 't', name: 'Read', input: { file_path: join(home, 'notes.md') } })}\n${prompt([{ type: 'tool_result', tool_use_id: 't', content: 'file body never relayed' }])}\n`);
  const env = { HOME: home, CLAUDE_PLUGIN_DATA: join(home, 'data'), UNFOLD_URL: unfold.url, UNFOLD_TOKEN: 'vle_test' };
  await runHook({ hook_event_name: 'SessionStart', source: 'startup', transcript_path: transcript }, env);

  const off = spawn(process.execPath, [channel], { env: { PATH: process.env.PATH ?? '', ...env, UNFOLD_CONVERSATION: '0' }, stdio: ['pipe', 'ignore', 'ignore'] });
  await new Promise(done => setTimeout(done, 400));
  off.stdin.end(); off.kill();
  assert.equal(unfold.polls.length, 0, 'UNFOLD_CONVERSATION=0 never polls');

  const on = spawn(process.execPath, [channel], { env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['pipe', 'ignore', 'ignore'] });
  t.after(() => { on.stdin.end(); on.kill(); });
  const answer = await until(() => unfold.answers[0]);
  assert.ok(answer, 'the channel answered the read');
  assert.equal(answer.path, `/api/linked-sessions/${sessionId}/conversation/answers/${unfold.want}`);
  assert.equal(unfold.polls[0], 'Bearer vle_test');
  assert.deepEqual(answer.body.entries.map((entry: { kind: string; text: string }) => [entry.kind, entry.text]), [['prompt', 'relay me'], ['reply', 'relayed'], ['tool', 'Read: Read notes.md']]);
  assert.equal(JSON.stringify(answer.body).includes('file body never relayed'), false);
  assert.ok(Number.isSafeInteger(answer.body.cursor) && answer.body.cursor > 0);
  assert.ok(await until(() => unfold.polls.length >= 2 || undefined), 'it keeps polling after answering');
});
