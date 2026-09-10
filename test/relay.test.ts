import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerRelay } from '../src/runtime/relay.ts';

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
  return spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', VLOER_RELAY_URL: relayUrl, VLOER_RELAY_TOKEN: token, VLOER_RELAY_TARGET: target }, stdio: ['ignore', 'ignore', 'pipe'] });
}

test('the relay delivers requests to a dial-out worker, streams responses back and cancels aborted streams', { timeout: 30_000 }, async t => {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const relayPort = await listen(relayServer);
  const target = fakeOpencode();
  const targetPort = await listen(target.server);
  const token = relay.register('ws-1');
  const worker = startWorker(`http://127.0.0.1:${relayPort}/api/relay/ws-1`, token, `http://127.0.0.1:${targetPort}`);
  t.after(() => { worker.kill('SIGKILL'); relayServer.close(); target.server.close(); });
  await relay.waitForWorker('ws-1', new AbortController().signal, 10_000);
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
  const deadline = Date.now() + 5000;
  while (target.state.closedStreams < 1 && Date.now() < deadline) await delay(50);
  assert.equal(target.state.closedStreams, 1, 'aborting the relayed stream must close the upstream stream');
});

test('the relay rejects foreign tokens and fails pending requests when a workspace is unregistered', { timeout: 20_000 }, async t => {
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
