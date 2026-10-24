import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineSplitter, message } from '../extensions/acp-proxy/lib/lines.mjs';
import { addedText, linkedSessionId } from '../extensions/acp-proxy/lib/reporter.mjs';
import { parseAgentTrace } from '../src/agent-trace.ts';
import { parseLinkedEvent } from '../src/linked-sessions.ts';
import { scaledTimeout } from './timeframes.ts';

const proxy = fileURLToPath(new URL('../extensions/acp-proxy/bin/unfold-acp.mjs', import.meta.url));
const fakeAgent = fileURLToPath(new URL('./fixtures/acp-fake-agent.mjs', import.meta.url));

type Received = { path: string; auth: string; body: any };

async function fakeUnfold(delayMs = 0) {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => setTimeout(() => {
      received.push({ path: String(req.url), auth: String(req.headers.authorization), body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.url === '/api/linked-sessions/events' ? { session: { link: 'http://unfold.test/#linked-session/acp-sess_fake01', workItems: [{ id: '184', how: 'explicit' }] } } : { stored: true }));
    }, delayMs));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, received, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

async function until(check: () => boolean, what: string, ms = scaledTimeout(10_000)) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(done => setTimeout(done, 10));
  }
}

function editor(env: Record<string, string>, log: string) {
  const child = spawn(process.execPath, [proxy, '--', process.execPath, fakeAgent], { env: { PATH: process.env.PATH ?? '', HOME: log, FAKE_ACP_LOG: log, ...env }, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
  const out: Buffer[] = [];
  const lines: any[] = [];
  child.stdout.on('data', chunk => out.push(chunk));
  child.stdout.on('data', lineSplitter(line => lines.push(message(line) ?? line)));
  const sent: string[] = [];
  return {
    child, lines,
    send(raw: string) { sent.push(raw); child.stdin.write(raw); },
    bytesOut: () => Buffer.concat(out),
    bytesSent: () => Buffer.from(sent.join('')),
    async response(id: unknown) { await until(() => lines.some(entry => entry?.id === id && ('result' in entry || 'error' in entry)), `response ${id}`); return lines.find(entry => entry?.id === id && 'result' in entry); },
    async exit() { child.stdin.end(); const [code] = await once(child, 'exit'); return code; },
  };
}

async function repository() {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-acp-'));
  const repo = join(dir, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feat/acp-login', repo]);
  for (const [key, value] of [['user.email', 'test@example.org'], ['user.name', 'Test'], ['commit.gpgsign', 'false']]) execFileSync('git', ['-C', repo, 'config', key, value]);
  execFileSync('git', ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'root']);
  return { dir, repo, git: (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim() };
}

async function conversation(session: ReturnType<typeof editor>, repo: string) {
  const initialize = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true}},"clientInfo":{"name":"zed","version":"0.300.0"}}}\n';
  session.send(initialize.slice(0, 25));
  await new Promise(done => setTimeout(done, 30));
  session.send(initialize.slice(25));
  await session.response(1);
  session.send(`{ "jsonrpc": "2.0", "id": "new-1", "method": "session/new", "params": { "cwd": ${JSON.stringify(repo)}, "mcpServers": [] } }\r\n`);
  await session.response('new-1');
  session.send('this line is not JSON and reaches the agent as it is\n');
  session.send(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'session/prompt', params: { sessionId: 'sess_fake01', prompt: [{ type: 'text', text: 'please edit login — PROMPT SECRET' }] } })}\n`);
  await until(() => session.lines.some(entry => entry?.method === 'session/request_permission'), 'the permission request');
  return session;
}

test('the proxy relays both directions byte for byte and reports start, working, waiting, idle, commits with Agent Trace, and end', async t => {
  const unfold = await fakeUnfold();
  const { dir, repo, git } = await repository();
  t.after(async () => { await unfold.close(); await rm(dir, { recursive: true, force: true }); });
  const session = editor({ UNFOLD_URL: `${unfold.url}/`, UNFOLD_TOKEN: 'vle_acp' }, dir);
  await conversation(session, repo);
  await until(() => unfold.received.some(entry => entry.body.event === 'waiting'), 'the waiting report');
  session.send('{"jsonrpc":"2.0","id":0,"result":{"outcome":{"outcome":"selected","optionId":"allow"}}}\n');
  await session.response(2);
  const login = git('rev-parse', 'HEAD');
  await until(() => unfold.received.some(entry => entry.body.event === 'idle'), 'the idle report');

  session.send(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'session/prompt', params: { sessionId: 'sess_fake01', prompt: [{ type: 'text', text: 'write notes' }] } })}\n`);
  await session.response(3);
  const notes = git('rev-parse', 'HEAD');
  await until(() => unfold.received.filter(entry => entry.body.event === 'idle').length === 2, 'the second idle report');
  assert.equal(await session.exit(), 3, 'the proxy exits with the agent’s exit code');

  assert.deepEqual(session.bytesOut(), await readFile(join(dir, 'agent-out')), 'the editor receives exactly the bytes the agent wrote');
  assert.deepEqual(await readFile(join(dir, 'agent-in')), session.bytesSent(), 'the agent receives exactly the bytes the editor wrote');

  const events = unfold.received.filter(entry => entry.path === '/api/linked-sessions/events');
  assert.deepEqual(events.map(entry => entry.body.event), ['start', 'prompt', 'waiting', 'prompt', 'commit', 'idle', 'prompt', 'commit', 'idle', 'end']);
  for (const entry of events) {
    assert.equal(entry.auth, 'Bearer vle_acp');
    assert.deepEqual([entry.body.harness, entry.body.sessionId, entry.body.harnessVersion, entry.body.branch, entry.body.model], ['acp', 'acp-sess_fake01', '1.2.3', 'feat/acp-login', 'fake/model-1']);
    parseLinkedEvent(entry.body, new Date());
  }
  assert.equal(events[0].body.title, 'Fake Agent · repo');
  assert.equal(events[2].body.waitingFor, 'permission_prompt');
  assert.deepEqual(events.filter(entry => entry.body.event === 'commit').map(entry => entry.body.commit), [{ sha: login, subject: 'feat: login', trailer: false }, { sha: notes, subject: 'docs: notes', trailer: false }]);

  const traces = unfold.received.filter(entry => entry.path === '/api/linked-sessions/acp-sess_fake01/traces');
  assert.equal(traces.length, 1, 'a commit with no line from a completed edit is reported without Agent Trace');
  const record = parseAgentTrace(traces[0].body);
  assert.equal(record.vcs?.revision, login);
  assert.deepEqual(record.tool, { name: 'fake-agent', version: '1.2.3' });
  assert.equal((record.metadata as Record<string, any>)['dev.unfoldhq'].harness, 'acp');
  assert.deepEqual(record.files.map(file => [file.path, file.conversations[0].ranges.map(range => [range.start_line, range.end_line])]), [['src/login.ts', [[1, 3]]]], 'the person’s line and the failed edit’s file stay out');
  assert.equal(record.files[0].conversations[0].url, 'http://unfold.test/#linked-session/acp-sess_fake01');
  assert.equal(JSON.parse(git('notes', '--ref=agent-trace', 'show', login)).id, record.id);

  const sent = JSON.stringify(unfold.received);
  for (const secret of ['PROMPT SECRET', 'TOOL OUTPUT SECRET', 'return check(user)', 'a person added']) assert.equal(sent.includes(secret), false, `${secret} never reaches Unfold`);
});

test('without UNFOLD_URL and UNFOLD_TOKEN the proxy only relays, and a slow or absent Unfold never holds a message back', async t => {
  const slow = await fakeUnfold(scaledTimeout(4000));
  const { dir, repo } = await repository();
  t.after(async () => { await slow.close(); await rm(dir, { recursive: true, force: true }); });

  const unconfigured = editor({ UNFOLD_URL: slow.url }, join(dir));
  await conversation(unconfigured, repo);
  unconfigured.send('{"jsonrpc":"2.0","id":0,"result":{"outcome":{"outcome":"selected","optionId":"allow"}}}\n');
  await unconfigured.response(2);
  assert.equal(await unconfigured.exit(), 3);
  assert.deepEqual(unconfigured.bytesOut(), await readFile(join(dir, 'agent-out')));
  assert.deepEqual(slow.received, [], 'nothing is reported without a token');

  const second = await mkdtemp(join(tmpdir(), 'unfold-acp-slow-'));
  const repo2 = await repository();
  t.after(async () => { await rm(second, { recursive: true, force: true }); await rm(repo2.dir, { recursive: true, force: true }); });
  const started = Date.now();
  const delayed = editor({ UNFOLD_URL: slow.url, UNFOLD_TOKEN: 'vle_acp', UNFOLD_HOOK_TIMEOUT_MS: '500' }, second);
  await conversation(delayed, repo2.repo);
  delayed.send('{"jsonrpc":"2.0","id":0,"result":{"outcome":{"outcome":"selected","optionId":"allow"}}}\n');
  await delayed.response(2);
  assert.ok(Date.now() - started < scaledTimeout(3500), 'the turn completes while every report to Unfold is still waiting');
  assert.equal(await delayed.exit(), 3);
  assert.deepEqual(delayed.bytesOut(), await readFile(join(second, 'agent-out')));

  const third = await mkdtemp(join(tmpdir(), 'unfold-acp-down-'));
  t.after(() => rm(third, { recursive: true, force: true }));
  const down = editor({ UNFOLD_URL: 'http://127.0.0.1:9', UNFOLD_TOKEN: 'vle_acp', UNFOLD_HOOK_TIMEOUT_MS: '500' }, third);
  await conversation(down, repo2.repo);
  assert.equal(await down.exit(), 3);
  assert.deepEqual(down.bytesOut(), await readFile(join(third, 'agent-out')));
});

test('the proxy names its usage without an agent and says when the agent cannot start', async () => {
  const usage = spawn(process.execPath, [proxy], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  usage.stderr.on('data', chunk => { stderr += chunk; });
  assert.equal((await once(usage, 'exit'))[0], 2);
  assert.match(stderr, /Usage: unfold-acp/);
  const missing = spawn(process.execPath, [proxy, '--', 'unfold-acp-no-such-agent'], { stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal((await once(missing, 'exit'))[0], 127);
});

test('ACP session ids become Linked Session ids, and a diff adds only the lines its old text lacked', () => {
  assert.equal(linkedSessionId('sess_abc123'), 'acp-sess_abc123');
  assert.match(linkedSessionId('a b/c:d'), /^acp-[0-9a-f]{40}$/);
  assert.match(linkedSessionId('x'), /^acp-[0-9a-f]{40}$/);
  assert.equal(addedText('a\n  b\nc', 'a\nb\nnew\nc'), 'new');
  assert.equal(addedText(null, 'one\ntwo'), 'one\ntwo');
  const lines: string[] = [];
  const split = lineSplitter(line => lines.push(line), 8);
  split(Buffer.from('ab')); split(Buffer.from('c\nd')); split(Buffer.from('0123456789')); split(Buffer.from('\nok\n'));
  assert.deepEqual(lines, ['abc', 'ok'], 'a line past the limit is skipped, not observed in pieces');
  assert.equal(message('[1]'), null);
  assert.equal(message('{"id":1}')?.id, 1);
});
