import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerRelay } from '../src/runtime/relay.ts';
import { captureInPlace } from '../src/runtime/kubernetes.ts';
import type { AppConfig, Repository, Session } from '../src/types.ts';
import { scaledTimeout, settle, testTimeout, waitFor } from './timeframes.ts';

const workerScript = fileURLToPath(new URL('../ops/agent/relay-worker.mjs', import.meta.url));

async function listen(server: Server, host = '127.0.0.1'): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, host, () => resolve()));
  return (server.address() as { port: number }).port;
}

function fakeOpencode() {
  const state = { closedStreams: 0, requests: [] as string[] };
  const server = createServer((req, res) => {
    state.requests.push(`${req.method} ${req.url} ${req.headers.authorization ?? ''}`);
    if (req.headers.authorization !== 'Basic ' + Buffer.from('opencode:secret').toString('base64')) { res.writeHead(401); res.end('{}'); return; }
    if (req.url?.startsWith('/global/health')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ version: 'fake', healthy: true })); return; }
    if (req.url?.startsWith('/echo')) { let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ echoed: JSON.parse(body) })); }); return; }
    if (req.url?.startsWith('/event')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      let count = 0;
      const timer = setInterval(() => { res.write(`data: {"n":${++count}}\n\n`); }, 20);
      req.on('close', () => { clearInterval(timer); state.closedStreams++; });
      return;
    }
    if (req.url?.startsWith('/empty')) { res.writeHead(204); res.end(); return; }
    res.writeHead(404); res.end();
  });
  return { server, state };
}

function startWorker(relayUrl: string, token: string, target: string): ChildProcess {
  return spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', UNFOLD_RELAY_URL: relayUrl, UNFOLD_RELAY_TOKEN: token, UNFOLD_RELAY_TARGET: target }, stdio: ['ignore', 'ignore', 'pipe'] });
}

test('the relay delivers requests to a dial-out worker, streams responses back and cancels aborted streams', { timeout: testTimeout(30_000) }, async t => {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  const target = fakeOpencode();
  const targetPort = await listen(target.server);
  const token = relay.register('ws-1');
  const worker = startWorker(`http://127.0.0.1:${relayPort}/api/relay/ws-1`, token, `http://127.0.0.1:${targetPort}`);
  t.after(() => { worker.kill('SIGKILL'); relayServer.close(); target.server.close(); });
  await relay.waitForWorker('ws-1', new AbortController().signal, scaledTimeout(10_000));
  assert.equal(relay.connected('ws-1'), true);
  const fetcher = relay.fetcher('ws-1');
  const authorization = 'Basic ' + Buffer.from('opencode:secret').toString('base64');
  const health = await fetcher('http://workspace/global/health?directory=%2Fworkspace%2Frepository', { headers: { authorization } });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { version: 'fake', healthy: true });
  assert.ok(target.state.requests.some(line => line.startsWith('GET /global/health?directory=%2Fworkspace%2Frepository Basic')));
  const denied = await fetcher('http://workspace/global/health');
  assert.equal(denied.status, 401);
  const echoed = await fetcher('http://workspace/echo', { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'hello' }) });
  assert.equal(echoed.status, 201);
  assert.deepEqual(await echoed.json(), { echoed: { prompt: 'hello' } });
  const empty = await fetcher('http://workspace/empty', { headers: { authorization } });
  assert.equal(empty.status, 204);
  assert.equal(empty.body, null);
  const controller = new AbortController();
  const stream = await fetcher('http://workspace/event', { headers: { authorization }, signal: controller.signal });
  assert.equal(stream.headers.get('content-type'), 'text/event-stream');
  const reader = stream.body!.getReader();
  let text = '';
  while (!text.includes('{"n":3}')) text += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  await waitFor(() => target.state.closedStreams >= 1, undefined, { reason: 'aborting the relayed stream must close the upstream stream', withinMs: 20_000 });
  assert.equal(target.state.closedStreams, 1, 'aborting the relayed stream must close the upstream stream');
});

test('the relay rejects foreign tokens and fails pending requests when a workspace is unregistered', { timeout: testTimeout(20_000) }, async t => {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  t.after(() => relayServer.close());
  relay.register('ws-2');
  const wrong = await fetch(`http://127.0.0.1:${relayPort}/api/relay/ws-2/requests?wait=0`, { headers: { authorization: 'Bearer nope' } });
  assert.equal(wrong.status, 401);
  const unknown = await fetch(`http://127.0.0.1:${relayPort}/api/relay/ws-9/requests?wait=0`, { headers: { authorization: 'Bearer nope' } });
  assert.equal(unknown.status, 401);
  const pending = relay.fetcher('ws-2')('http://workspace/global/health');
  relay.unregister('ws-2');
  await assert.rejects(pending, (error: any) => error.category === 'connectivity' && /relay was closed/.test(error.detail ?? ''));
  assert.equal(relay.connected('ws-2'), false);
});

test('a warm worker waits for a pool assignment, receives its session environment over the relay and runs commands on request', { timeout: testTimeout(30_000) }, async t => {
  const relay = new WorkerRelay();
  relay.configurePool('pool-secret-token');
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  t.after(() => relayServer.close());
  const base = `http://127.0.0.1:${relayPort}/api/relay`;
  const rejected = await fetch(`${base}/pool/claim?pod=warm-1&wait=0`, { headers: { authorization: 'Bearer wrong' } });
  assert.equal(rejected.status, 401);
  const worker = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', UNFOLD_POOL_URL: `${base}/pool`, UNFOLD_POOL_TOKEN: 'pool-secret-token', UNFOLD_POD_NAME: 'warm-1', UNFOLD_RELAY_TARGET: 'http://127.0.0.1:9', UNFOLD_RELAY_KEEP_ALIVE: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => worker.kill('SIGKILL'));
  let logs = '';
  worker.stderr!.on('data', chunk => { logs += chunk; });
  await settle(300);
  assert.equal(relay.connected('ws-warm'), false, 'an unassigned warm worker relays nothing');
  const token = relay.register('ws-warm');
  relay.assign('warm-1', { sessionId: 'ws-warm', token, env: { REPOSITORY_URL: 'https://forge.example/repo.git', SESSION_MARKER: 'from-assignment' } });
  await relay.waitForWorker('ws-warm', new AbortController().signal, scaledTimeout(10_000));
  const fetcher = relay.fetcher('ws-warm');
  const status = await fetcher('http://workspace/__unfold/status');
  assert.deepEqual(await status.json(), { child: false, session: 'ws-warm', inFlight: 1 });
  const executed = await fetcher('http://workspace/__unfold/exec', { method: 'POST', body: JSON.stringify({ argv: [process.execPath, '-e', 'process.stdout.write(process.env.SESSION_MARKER + ":" + process.env.EXTRA); process.exit(3)'], env: { EXTRA: 'x' } }) });
  assert.deepEqual(await executed.json(), { exitCode: 3, stdout: 'from-assignment:x', stderr: '' });
  const ran = await fetcher('http://workspace/__unfold/run', { method: 'POST', body: JSON.stringify({ argv: [process.execPath, '-e', 'setInterval(() => {}, 1000)'] }) });
  assert.equal(ran.status, 202);
  assert.equal((await (await fetcher('http://workspace/__unfold/status')).json()).child, true);
  const stopped = await fetcher('http://workspace/__unfold/stop-child', { method: 'POST' });
  assert.deepEqual(await stopped.json(), { stopped: true });
  assert.equal((await (await fetcher('http://workspace/__unfold/status')).json()).child, false);
  assert.match(logs, /assigned session ws-warm/);
  assert.equal(logs.includes('pool-secret-token'), false);
});

const writerProgram = (file: string, label: string) => `const { appendFileSync } = require('node:fs'); appendFileSync(${JSON.stringify(file)}, '${label} ' + process.pid + '\\n'); setInterval(() => appendFileSync(${JSON.stringify(file)}, '${label}\\n'), 20);`;
const familyProgram = (file: string) => `process.on('SIGTERM', () => {}); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(`process.on('SIGTERM', () => {}); ${writerProgram(file, 'grandchild')}`)}], { stdio: 'ignore' }); ${writerProgram(file, 'child')}`;
const contents = (file: string) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } };
const writerPids = (file: string) => [...contents(file).matchAll(/^(?:child|grandchild) ([0-9]+)$/gm)].map(match => Number(match[1]));
const running = (pid: number) => { try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); return stat[stat.lastIndexOf(')') + 2] !== 'Z'; } catch { return false; } };
const sizeOf = (file: string) => { try { return statSync(file).size; } catch { return 0; } };

async function relayedWorker(t: { after(fn: () => void): void }, workspaceId: string) {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  const token = relay.register(workspaceId);
  const directory = mkdtempSync(join(tmpdir(), 'unfold-stop-'));
  const worker = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', UNFOLD_RELAY_URL: `http://127.0.0.1:${relayPort}/api/relay/${workspaceId}`, UNFOLD_RELAY_TOKEN: token, UNFOLD_RELAY_TARGET: 'http://127.0.0.1:9', UNFOLD_RELAY_KEEP_ALIVE: '1', UNFOLD_RELAY_STOP_GRACE_MS: '300' }, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => { worker.kill('SIGKILL'); relayServer.close(); for (const pid of writerPids(join(directory, 'out'))) { try { process.kill(pid, 'SIGKILL'); } catch {} } rmSync(directory, { recursive: true, force: true }); });
  await relay.waitForWorker(workspaceId, new AbortController().signal, scaledTimeout(10_000));
  return { fetcher: relay.fetcher(workspaceId), file: join(directory, 'out') };
}

async function assertNoWritesAfterStop(file: string) {
  for (const pid of writerPids(file)) assert.equal(running(pid), false, `writer ${pid} must not survive the stop`);
  const size = sizeOf(file);
  await settle(300);
  assert.equal(sizeOf(file), size, 'nothing may write to the workspace after the stop');
}

test('stopping the harness stops its whole process group, including a grandchild that ignores SIGTERM, before it reports stopped', { timeout: testTimeout(30_000) }, async t => {
  const { fetcher, file } = await relayedWorker(t, 'ws-stop');
  const ran = await fetcher('http://workspace/__unfold/run', { method: 'POST', body: JSON.stringify({ argv: [process.execPath, '-e', familyProgram(file)] }) });
  assert.equal(ran.status, 202);
  await waitFor(() => writerPids(file).length === 2 && contents(file).includes('grandchild\n'), undefined, { reason: 'the child and grandchild must both be writing', withinMs: 10_000 });
  const stopped = await fetcher('http://workspace/__unfold/stop-child', { method: 'POST' });
  assert.deepEqual(await stopped.json(), { stopped: true });
  await assertNoWritesAfterStop(file);
});

test('an exec subprocess group is stopped when its relay request is cancelled or its timeout passes', { timeout: testTimeout(30_000) }, async t => {
  const { fetcher, file } = await relayedWorker(t, 'ws-exec');
  const controller = new AbortController();
  const pending = fetcher('http://workspace/__unfold/exec', { method: 'POST', body: JSON.stringify({ argv: [process.execPath, '-e', familyProgram(file)] }), signal: controller.signal });
  pending.catch(() => {});
  await waitFor(() => writerPids(file).length === 2, undefined, { reason: 'the exec child and grandchild must both be writing', withinMs: 10_000 });
  const cancelled = writerPids(file);
  controller.abort();
  await assert.rejects(pending);
  await waitFor(() => cancelled.every(pid => !running(pid)), undefined, { reason: 'cancelling the request must stop the exec process group', withinMs: 10_000 });
  await assertNoWritesAfterStop(file);
  rmSync(file);
  const timed = await fetcher('http://workspace/__unfold/exec', { method: 'POST', body: JSON.stringify({ argv: [process.execPath, '-e', familyProgram(file)], timeoutMs: scaledTimeout(2_000) }) });
  const result = await timed.json();
  assert.equal(result.exitCode, 124);
  assert.equal(result.timedOut, true);
  assert.equal(result.stopped, undefined, 'the timed-out group was confirmed stopped');
  assert.equal(writerPids(file).length, 2);
  await assertNoWritesAfterStop(file);
});

test('in-place capture refuses to export when the worker cannot confirm the harness stopped', { timeout: testTimeout(20_000) }, async t => {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  const token = relay.register('ws-unconfirmed');
  const base = `http://127.0.0.1:${relayPort}/api/relay/ws-unconfirmed`;
  const paths: string[] = [];
  let polling = true;
  t.after(() => { polling = false; relayServer.close(); });
  void (async () => {
    while (polling) {
      const response = await fetch(`${base}/requests?wait=200`, { headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
      if (!response?.ok) { await settle(20); continue; }
      for (const request of (await response.json()).requests ?? []) {
        paths.push(request.path);
        const body = request.path.startsWith('/__unfold/stop-child') ? '{"stopped":false}' : '{}';
        await fetch(`${base}/responses/${request.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-relay-status': '200', 'x-relay-headers': '{"content-type":"application/json"}' }, body });
      }
    }
  })();
  const session = { id: 'ws-unconfirmed', workspace: { metadata: { baseSha: 'b'.repeat(40) } } } as unknown as Session;
  const candidate = await captureInPlace(relay, { dataDir: '/nonexistent' } as AppConfig, session, { id: 'repo' } as Repository, { username: 'opencode', password: 'secret' }, 'b'.repeat(40));
  assert.equal(candidate.status, 'unavailable');
  assert.equal((candidate as { reason?: string }).reason, 'stop_unconfirmed');
  assert.deepEqual(paths, ['/__unfold/stop-child'], 'no export program may start after an unconfirmed stop');
});
