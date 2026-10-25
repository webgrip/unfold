import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerRelay, memoryCredentials, type WorkerCredentials } from '../src/runtime/relay.ts';
import { captureInPlace } from '../src/runtime/kubernetes.ts';
import { limitRequestBodies } from '../src/http.ts';
import { OpenCodeRuntime, type RuntimeWorkspaces } from '../src/runtime/opencode.ts';
import { executionFixture } from './runtime-fixture.ts';
import type { AppConfig, Repository, Session } from '../src/types.ts';
import { deadlineAfter, scaledTimeout, settle, testTimeout, waitFor } from './timeframes.ts';

test('a cancellation that arrives while no poll is waiting is handed to the next poll at once', { timeout: testTimeout(20_000) }, async t => {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  t.after(() => relayServer.close());
  const token = relay.register('ws-between');
  const poll = async (wait: number) => (await fetch(`http://127.0.0.1:${relayPort}/api/relay/ws-between/requests?wait=${wait}`, { headers: { authorization: `Bearer ${token}` } })).json();
  const controller = new AbortController();
  const pending = relay.fetcher('ws-between')('http://workspace/__unfold/exec', { method: 'POST', body: '{}', signal: controller.signal });
  pending.catch(() => {});
  const picked = await poll(0);
  assert.equal(picked.requests.length, 1);
  controller.abort();
  await assert.rejects(pending);
  assert.deepEqual(await poll(25_000), { requests: [], cancelled: [picked.requests[0].id] }, 'the poll after the abort carries the cancellation instead of waiting out its 25 s');
});

const workerScript = fileURLToPath(new URL('../ops/agent/relay-worker.mjs', import.meta.url));
const heldTimeouts = fileURLToPath(new URL('./held-timeouts.ts', import.meta.url));
const heldTimeoutMs = 86_400_000;

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

test('a warm worker claims only its own pod\'s assignment, with the pod token it reads from its projected volume', { timeout: testTimeout(30_000) }, async t => {
  const relay = new WorkerRelay();
  const pods: Record<string, { name: string; uid: string }> = { 'token-of-warm-1': { name: 'warm-1', uid: 'uid-1' }, 'token-of-warm-2': { name: 'warm-2', uid: 'uid-2' } };
  relay.configurePool(async token => pods[token]);
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  t.after(() => relayServer.close());
  const base = `http://127.0.0.1:${relayPort}/api/relay`;
  const claim = (token: string, pod?: string) => fetch(`${base}/pool/claim?${pod ? `pod=${pod}&` : ''}wait=0`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await claim('wrong', 'warm-1')).status, 401);
  const decoy = relay.register('ws-decoy');
  relay.assign('warm-1', { sessionId: 'ws-decoy', token: decoy, env: { LITELLM_API_KEY: 'sk-decoy' } });
  const borrowed = await claim('token-of-warm-2', 'warm-1');
  assert.equal(borrowed.status, 403, 'a pod cannot name another pod to take its assignment');
  assert.deepEqual(await (await claim('token-of-warm-2')).json(), { assignment: null }, 'without a name a pod sees only its own assignment');
  relay.unassign('warm-1');
  relay.unregister('ws-decoy');
  const directory = mkdtempSync(join(tmpdir(), 'unfold-pool-token-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const tokenFile = join(directory, 'token');
  writeFileSync(tokenFile, 'token-of-warm-1\n');
  const worker = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', UNFOLD_POOL_URL: `${base}/pool`, UNFOLD_POOL_TOKEN_FILE: tokenFile, UNFOLD_POD_NAME: 'warm-1', UNFOLD_RELAY_TARGET: 'http://127.0.0.1:9', UNFOLD_RELAY_KEEP_ALIVE: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => worker.kill('SIGKILL'));
  let logs = '';
  worker.stderr!.on('data', chunk => { logs += chunk; });
  await settle(300);
  assert.equal(relay.connected('ws-warm'), false, 'an unassigned warm worker relays nothing');
  const token = relay.register('ws-warm');
  relay.assign('warm-1', { sessionId: 'ws-warm', token, podUid: 'uid-1', env: { REPOSITORY_URL: 'https://forge.example/repo.git', SESSION_MARKER: 'from-assignment' } });
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
  assert.equal(logs.includes('token-of-warm-1'), false);
});

test('a pool claim from a pod that replaced the assigned one under the same name is refused, and an unverifiable token is a retryable 503', async t => {
  const relay = new WorkerRelay();
  let verifierDown = false;
  relay.configurePool(async token => { if (verifierDown) throw new Error('TokenReview unavailable'); return token === 'token-of-new-pod' ? { name: 'warm-1', uid: 'uid-new' } : undefined; });
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  t.after(() => relayServer.close());
  const claim = () => fetch(`http://127.0.0.1:${relayPort}/api/relay/pool/claim?pod=warm-1&wait=0`, { headers: { authorization: 'Bearer token-of-new-pod' } });
  relay.assign('warm-1', { sessionId: 'ws-old', token: relay.register('ws-old'), podUid: 'uid-old', env: {} });
  assert.equal((await claim()).status, 403);
  verifierDown = true;
  assert.equal((await claim()).status, 503);
  const unconfigured = new WorkerRelay();
  const other = createServer(async (req, res) => { await unconfigured.handle(req, res, new URL(req.url ?? '/', 'http://localhost')); });
  const otherPort = await listen(other);
  t.after(() => other.close());
  assert.equal((await fetch(`http://127.0.0.1:${otherPort}/api/relay/pool/claim?wait=0`, { headers: { authorization: 'Bearer token-of-new-pod' } })).status, 401, 'without a verifier no claim succeeds');
});

const writerProgram = (file: string, label: string) => `const { appendFileSync } = require('node:fs'); appendFileSync(${JSON.stringify(file)}, '${label} ' + process.pid + '\\n'); setInterval(() => appendFileSync(${JSON.stringify(file)}, '${label}\\n'), 20);`;
const familyProgram = (file: string) => `process.on('SIGTERM', () => {}); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(`process.on('SIGTERM', () => {}); ${writerProgram(file, 'grandchild')}`)}], { stdio: 'ignore' }); ${writerProgram(file, 'child')}`;
const contents = (file: string) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } };
const writerPids = (file: string) => [...contents(file).matchAll(/^(?:child|grandchild) ([0-9]+)$/gm)].map(match => Number(match[1]));
const signalable = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } };
const running = (pid: number) => { if (!existsSync('/proc')) return signalable(pid); try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); return stat[stat.lastIndexOf(')') + 2] !== 'Z'; } catch { return false; } };
const sizeOf = (file: string) => { try { return statSync(file).size; } catch { return 0; } };

async function relayedWorker(t: { after(fn: () => void): void }, workspaceId: string, holdTimeoutsOf?: number) {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  const token = relay.register(workspaceId);
  const directory = mkdtempSync(join(tmpdir(), 'unfold-stop-'));
  const held = holdTimeoutsOf === undefined ? {} : { UNFOLD_TEST_HELD_TIMEOUT_MS: String(holdTimeoutsOf) };
  const worker = spawn(process.execPath, [...(holdTimeoutsOf === undefined ? [] : ['--import', heldTimeouts]), workerScript], { env: { PATH: process.env.PATH ?? '', UNFOLD_RELAY_URL: `http://127.0.0.1:${relayPort}/api/relay/${workspaceId}`, UNFOLD_RELAY_TOKEN: token, UNFOLD_RELAY_TARGET: 'http://127.0.0.1:9', UNFOLD_RELAY_KEEP_ALIVE: '1', UNFOLD_RELAY_STOP_GRACE_MS: '300', ...held }, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => { worker.kill('SIGKILL'); relayServer.close(); for (const pid of writerPids(join(directory, 'out'))) { try { process.kill(pid, 'SIGKILL'); } catch {} } rmSync(directory, { recursive: true, force: true }); });
  await relay.waitForWorker(workspaceId, new AbortController().signal, scaledTimeout(10_000));
  return { fetcher: relay.fetcher(workspaceId), file: join(directory, 'out'), worker };
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
  const { fetcher, file, worker } = await relayedWorker(t, 'ws-exec', heldTimeoutMs);
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
  const timing = fetcher('http://workspace/__unfold/exec', { method: 'POST', body: JSON.stringify({ argv: [process.execPath, '-e', familyProgram(file)], timeoutMs: heldTimeoutMs }) });
  await waitFor(() => writerPids(file).length === 2, undefined, { reason: 'the timed exec child and grandchild must both be writing', withinMs: 10_000 });
  worker.kill('SIGUSR2');
  const result = await (await timing).json();
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

async function relayServing(credentials: WorkerCredentials) {
  const relay = new WorkerRelay(credentials);
  const server = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const port = await listen(server);
  const poll = async (workspaceId: string, token: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/relay/${workspaceId}/requests?wait=0`, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, code: response.ok ? undefined : (await response.json()).error.code };
  };
  return { relay, port, poll, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

test('a restarted relay accepts a running worker with the credential it holds, and the store keeps only its digest', { timeout: testTimeout(20_000) }, async t => {
  const credentials = memoryCredentials();
  const first = await relayServing(credentials);
  const token = first.relay.register('ws-restart');
  assert.equal((await first.poll('ws-restart', token)).status, 200);
  await first.close();
  assert.equal(JSON.stringify(credentials.read('ws-restart')).includes(token), false, 'the store holds a digest, never the token');
  const restarted = await relayServing(credentials);
  t.after(() => restarted.close());
  assert.equal(restarted.relay.connected('ws-restart'), false, 'no worker counts as connected before it polls again');
  assert.deepEqual(await restarted.poll('ws-restart', 'a-guessed-token'), { status: 401, code: 'unauthorized' });
  assert.deepEqual(await restarted.poll('ws-restart', token), { status: 200, code: undefined });
  assert.equal(restarted.relay.connected('ws-restart'), true);
});

test('a revoked workspace credential is refused as revoked, also after a restart, and a new registration retires the old token', { timeout: testTimeout(20_000) }, async t => {
  const credentials = memoryCredentials();
  const first = await relayServing(credentials);
  const old = first.relay.register('ws-revoked');
  const renewed = first.relay.register('ws-revoked');
  assert.deepEqual(await first.poll('ws-revoked', old), { status: 401, code: 'unauthorized' }, 'registering again retires the earlier token');
  assert.equal((await first.poll('ws-revoked', renewed)).status, 200);
  first.relay.unregister('ws-revoked');
  assert.deepEqual(await first.poll('ws-revoked', renewed), { status: 401, code: 'revoked' });
  await first.close();
  const restarted = await relayServing(credentials);
  t.after(() => restarted.close());
  assert.deepEqual(await restarted.poll('ws-revoked', renewed), { status: 401, code: 'revoked' }, 'a restart never revives a revoked credential');
  assert.deepEqual(await restarted.poll('ws-never', renewed), { status: 401, code: 'unauthorized' });
});

test('a worker rides out refusals for its grace period and stops at once when its credential is revoked', { timeout: testTimeout(30_000) }, async t => {
  const credentials = memoryCredentials();
  const serving = await relayServing(credentials);
  t.after(() => serving.close());
  const token = 'a-token-the-relay-learns-only-later';
  const worker = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', UNFOLD_RELAY_URL: `http://127.0.0.1:${serving.port}/api/relay/ws-grace`, UNFOLD_RELAY_TOKEN: token, UNFOLD_RELAY_TARGET: 'http://127.0.0.1:9', UNFOLD_RELAY_REFUSAL_GRACE_MS: '60000' }, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => worker.kill('SIGKILL'));
  let logs = '';
  worker.stderr!.on('data', chunk => { logs += chunk; });
  const exited = new Promise<number | null>(resolve => worker.on('exit', code => resolve(code)));
  await waitFor(() => /poll failed \(1\): HTTP 401/.test(logs), undefined, { reason: 'the worker must report the refused poll', withinMs: 10_000 });
  assert.equal(worker.exitCode, null, 'a refusal within the grace period does not stop the worker');
  credentials.write('ws-grace', { digest: createHash('sha256').update(token).digest('hex') });
  await waitFor(() => serving.relay.connected('ws-grace'), undefined, { reason: 'the worker must be accepted once the relay knows its credential', withinMs: 15_000 });
  serving.relay.unregister('ws-grace');
  assert.equal(await exited, 0);
  assert.match(logs, /relay revoked the worker \(HTTP 401\); stopping/);
});

test('a request body that has not arrived by the deadline is cut off, and an authorized relayed response stream is not', { timeout: testTimeout(20_000) }, async t => {
  const relay = new WorkerRelay();
  const server = createServer(async (req, res) => { if (await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost'))) return; req.resume(); req.on('end', () => { res.writeHead(200); res.end('read'); }); });
  limitRequestBodies(server, 300, req => relay.streamingUpload(req));
  const port = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const slowUpload = await new Promise<string>(resolve => {
    const upload = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/api/anything', headers: { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' } });
    upload.on('response', () => resolve('answered'));
    upload.on('error', error => resolve((error as NodeJS.ErrnoException).code ?? 'error'));
    upload.write('a body that never ends');
  });
  assert.equal(slowUpload, 'ECONNRESET', 'a body still arriving after the deadline is cut off');
  const token = relay.register('ws-stream');
  const pending = relay.fetcher('ws-stream')('http://workspace/event');
  const polled = await (await fetch(`http://127.0.0.1:${port}/api/relay/ws-stream/requests?wait=1000`, { headers: { authorization: `Bearer ${token}` } })).json();
  const upload = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: `/api/relay/ws-stream/responses/${polled.requests[0].id}`, headers: { authorization: `Bearer ${token}`, 'x-relay-status': '200', 'x-relay-headers': '{"content-type":"text/event-stream"}', 'transfer-encoding': 'chunked' } });
  upload.on('error', () => {});
  t.after(() => upload.destroy());
  const ticks = setInterval(() => upload.write('data: {}\n\n'), 100);
  t.after(() => clearInterval(ticks));
  const reader = (await pending).body!.getReader();
  let received = '';
  const until = deadlineAfter(1200);
  while (Date.now() < until) received += new TextDecoder().decode((await reader.read()).value);
  assert.ok(received.split('data:').length > 8, 'the relayed stream kept flowing past four deadlines');
});

test('a relayed response that resets mid-body is read again and the turn completes, and the relay logs the interruption with its session', { timeout: testTimeout(30_000) }, async t => {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  limitRequestBodies(relayServer, 300, req => relay.streamingUpload(req));
  const relayPort = await listen(relayServer);
  const messages: unknown[] = [];
  const counts = { event: 0, message: 0 };
  const harness = createServer(async (req, res) => {
    for await (const _chunk of req) {}
    const path = new URL(req.url ?? '/', 'http://workspace').pathname;
    const json = (value: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (path === '/event') { counts.event++; res.writeHead(200, { 'content-type': 'text/event-stream' }); const ticks = setInterval(() => res.write('data: {"type":"server.heartbeat","properties":{}}\n\n'), 100); req.on('close', () => clearInterval(ticks)); return; }
    if (path === '/session') return json({ id: 'ses_reset' });
    if (path === '/session/status') return json({});
    if (path === '/permission' || path === '/question' || path.endsWith('/children') || path.endsWith('/diff')) return json([]);
    if (path.endsWith('/prompt_async')) {
      messages.push({ info: { id: 'msg_prompt', role: 'user' }, parts: [] });
      setTimeout(() => messages.push({ info: { id: 'msg_answer', role: 'assistant', time: { created: 1, completed: 2 }, finish: 'stop', cost: 0.01 }, parts: [{ type: 'text', text: 'Done despite the reset.' }] }), 1500);
      res.writeHead(204); res.end(); return;
    }
    if (path.endsWith('/message') && ++counts.message === 3) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write(`[${JSON.stringify({ info: { id: 'msg_prompt', role: 'user' }, parts: [{ type: 'text', text: 'x'.repeat(65536) }] }).slice(0, 40000)}`);
      setTimeout(() => res.socket?.destroy(), 50);
      return;
    }
    if (path.endsWith('/message')) return json(messages);
    res.writeHead(404); res.end();
  });
  const harnessPort = await listen(harness);
  const token = relay.register('ws-reset');
  const worker = startWorker(`http://127.0.0.1:${relayPort}/api/relay/ws-reset`, token, `http://127.0.0.1:${harnessPort}`);
  const logged: string[] = [];
  const original = console.error;
  console.error = (...line: unknown[]) => { logged.push(line.map(String).join(' ')); };
  t.after(() => { console.error = original; worker.kill('SIGKILL'); relayServer.closeAllConnections(); relayServer.close(); harness.closeAllConnections(); harness.close(); });
  await relay.waitForWorker('ws-reset', new AbortController().signal, scaledTimeout(10_000));
  const workspaces: RuntimeWorkspaces = { prepare: async () => { throw new Error('prepared already'); }, credentials: () => ({ username: 'opencode', password: 'secret' }), executionEnvironment: () => ({}), dispose: async () => {}, transport: () => relay.fetcher('ws-reset') };
  const runtime = new OpenCodeRuntime({ models: [{ id: 'coding', providerId: 'litellm', modelId: 'coding', name: 'Coding' }], runtime: { timeoutMs: 20_000 } } as AppConfig, workspaces);
  const turn = executionFixture({ runtime: 'opencode', role: { id: 'builder', name: 'Builder', mode: 'write', instruction: 'Change it' }, workspace: { id: 'ws-reset', backend: 'kubernetes', directory: '/workspace/repository', endpoint: 'relay://ws-reset' }, verify: ['npm', 'test'], prompt: 'Change it', signal: new AbortController().signal, emit: () => {} });
  turn.session.id = 'ws-reset';
  const result = await runtime.execute(turn);
  assert.equal(result.summary, 'Done despite the reset.');
  assert.ok(counts.message > 3, 'the turn read its state again after the reset');
  assert.ok(logged.some(line => line.includes('"event":"runtime.observation_retried"') && line.includes('"session":"ws-reset"')), logged.join('\n'));
  assert.ok(logged.some(line => line.includes('"event":"relay.response_interrupted"') && line.includes('"session":"ws-reset"') && line.includes('/session/ses_reset/message')), logged.join('\n'));
  assert.equal(counts.event, 1, 'the relayed event stream outlived the request body deadline instead of being cut and reopened');
});

test('a caller without the token learns nothing about a workspace, and a refused poll leaves nothing behind', { timeout: testTimeout(20_000) }, async t => {
  const credentials = memoryCredentials();
  const serving = await relayServing(credentials);
  t.after(() => serving.close());
  const revoked = serving.relay.register('ws-oracle');
  serving.relay.unregister('ws-oracle');
  assert.deepEqual(await serving.poll('ws-oracle', 'a-guess'), { status: 401, code: 'unauthorized' }, 'a revoked workspace looks like any other to a caller without its token');
  assert.deepEqual(await serving.poll('ws-oracle', revoked), { status: 401, code: 'revoked' }, 'its own worker still learns it must stop');
  const token = 'a-worker-token-the-store-knows';
  const digest = createHash('sha256').update(token).digest('hex');
  credentials.write('ws-cache', { digest });
  assert.deepEqual(await serving.poll('ws-cache', 'a-wrong-token'), { status: 401, code: 'unauthorized' });
  credentials.write('ws-cache', { digest, revoked: true });
  assert.deepEqual(await serving.poll('ws-cache', token), { status: 401, code: 'revoked' }, 'the refused poll cached no registration that would outlive the stored credential');
});

test('a relayed response upload that stops sending is cut after its idle limit, and one that keeps sending is not', { timeout: testTimeout(20_000) }, async t => {
  const relay = new WorkerRelay(memoryCredentials(), 300);
  const server = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  limitRequestBodies(server, 60_000, req => relay.streamingUpload(req));
  const port = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const token = relay.register('ws-idle');
  const logged: string[] = [];
  const original = console.error;
  console.error = (...line: unknown[]) => { logged.push(line.map(String).join(' ')); };
  t.after(() => { console.error = original; });
  const relayed = async (tickMs?: number) => {
    const pending = relay.fetcher('ws-idle')('http://workspace/event');
    const polled = await (await fetch(`http://127.0.0.1:${port}/api/relay/ws-idle/requests?wait=1000`, { headers: { authorization: `Bearer ${token}` } })).json();
    const upload = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: `/api/relay/ws-idle/responses/${polled.requests[0].id}`, headers: { authorization: `Bearer ${token}`, 'x-relay-status': '200', 'x-relay-headers': '{"content-type":"text/event-stream"}', 'transfer-encoding': 'chunked' } });
    upload.on('error', () => {});
    upload.write('data: {}\n\n');
    const ticks = tickMs ? setInterval(() => upload.write('data: {}\n\n'), tickMs) : undefined;
    t.after(() => { clearInterval(ticks); upload.destroy(); });
    const reader = (await pending).body!.getReader();
    const until = Date.now() + 1500;
    try {
      while (Date.now() < until) {
        const next = await Promise.race([reader.read(), settle(Math.max(0, until - Date.now()) + 1000).then(() => 'silent' as const)]);
        if (next === 'silent') return 'stalled and still open';
        if (next.done) return 'ended';
      }
      return 'flowing';
    } catch { return 'cut'; }
  };
  assert.equal(await relayed(100), 'flowing', 'an upload that keeps sending outlives its idle limit');
  assert.equal(await relayed(), 'cut', 'a stalled upload is cut after its idle limit');
  assert.ok(logged.some(line => line.includes('"event":"relay.response_interrupted"') && line.includes('"session":"ws-idle"')), logged.join('\n'));
});

test('a request no worker picks up fails naming relay.pickup, how long it waited and that no worker ever polled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const relay = new WorkerRelay();
  relay.register('ws-unpicked');
  const pending = relay.fetcher('ws-unpicked')('http://workspace/session?directory=%2Fworkspace', { method: 'POST', body: '{}' });
  t.mock.timers.tick(30_000);
  await assert.rejects(pending, (error: any) => error.category === 'connectivity' && /^relay\.pickup fired: the workspace worker did not pick up POST \/session after 30000 ms against a limit of 30000 ms; its last poll was never$/.test(error.detail ?? ''));
});
