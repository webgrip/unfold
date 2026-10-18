import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/main.ts';
import { OpenCodeRuntime } from '../src/runtime/opencode.ts';
import { WorkspaceManager } from '../src/runtime/workspace.ts';
import { KubernetesWorkspaces } from '../src/runtime/kubernetes.ts';
import { relayEndpoint, storedCredentials, type WorkerRelay } from '../src/runtime/relay.ts';
import type { AgentRuntime, AppConfig, RuntimeKind, Session, User } from '../src/types.ts';
import { configuration, createInput } from './api-support.ts';
import { testTimeout, waitFor } from './timeframes.ts';

const workerScript = fileURLToPath(new URL('../ops/agent/relay-worker.mjs', import.meta.url));
const owner: User = { id: 'owner', name: 'Owner', role: 'operator' };

async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return (server.address() as { port: number }).port;
}

function ploeg() {
  const state = { credentialRequests: 0, blocks: 0, observedUsd: 0.04, capability: 'reserved', leaseLapsed: false, execution: undefined as Record<string, any> | undefined };
  const leaseMs = 120_000;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    const lease = () => new Date(Date.now() + leaseMs).toISOString();
    if (req.method === 'POST' && req.url === '/api/v1/operator/executions') {
      state.execution ??= { id: randomBytes(16).toString('hex'), workItemId: '42', sessionId: input.sessionId, actor: String(req.headers['x-ploeg-actor']), team: input.team, demo: false, state: 'admitted', revision: 1, generation: 1, supervision: 'human', expiresAt: lease(), stopConfirmed: true };
      send({ execution: state.execution }); return;
    }
    const execution = state.execution;
    if (!execution || !req.url?.includes(execution.id)) { res.writeHead(404).end(); return; }
    if (req.url.endsWith('/commands')) {
      if (input.expectedRevision !== execution.revision || input.generation !== execution.generation) { res.writeHead(409).end(); return; }
      if (input.action === 'start' || input.action === 'resume') { execution.state = 'running'; execution.generation++; execution.stopConfirmed = false; }
      else if (input.action === 'cancel') execution.state = 'cancel_requested';
      else if (input.action === 'pause') execution.state = 'pause_requested';
      else if (input.action === 'report') { execution.state = input.state; execution.stopConfirmed = input.stopConfirmed ?? execution.stopConfirmed; }
      execution.revision++;
      execution.expiresAt = lease();
      send({ execution }); return;
    }
    if (req.url.endsWith('/spend')) { send({ capabilityState: state.capability, costStatus: 'observed', observedUsd: state.observedUsd }); return; }
    if (req.url.endsWith('/credential')) { state.credentialRequests++; state.capability = 'issued'; send({ credential: { key: randomBytes(32).toString('hex'), alias: 'restart-fixture', reference: execution.id, budgetUsd: 2 } }); return; }
    if (req.url.endsWith('/block')) { state.blocks++; state.capability = 'blocked'; send({ blocked: true }); return; }
    if (req.method === 'GET') { send({ execution: state.leaseLapsed ? { ...execution, expiresAt: new Date(Date.now() - 1000).toISOString() } : execution }); return; }
    res.writeHead(404).end();
  });
  return { state, server };
}

type NativeMessage = { info: Record<string, unknown>; parts: Record<string, unknown>[] };

function opencode(expectedPassword: () => string | undefined) {
  const state = { prompts: 0, aborts: 0, refusedCredentials: 0, sessions: new Map<string, NativeMessage[]>() };
  let serial = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://workspace');
    const json = (value: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    if (req.headers.authorization !== 'Basic ' + Buffer.from(`opencode:${expectedPassword()}`).toString('base64')) { state.refusedCredentials++; res.writeHead(401).end('{}'); return; }
    for await (const _chunk of req) {}
    if (url.pathname === '/event') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': connected\n\n'); return; }
    if (url.pathname === '/session' && req.method === 'POST') { const id = `ses_${++serial}`; state.sessions.set(id, []); json({ id }); return; }
    if (url.pathname === '/session/status' || url.pathname === '/permission' || url.pathname === '/question') { json(url.pathname === '/session/status' ? {} : []); return; }
    const match = url.pathname.match(/^\/session\/([^/]+)\/(message|prompt_async|children|diff|abort)$/);
    const messages = match ? state.sessions.get(match[1]) : undefined;
    if (!match || !messages) { res.writeHead(404).end(); return; }
    if (match[2] === 'prompt_async') { state.prompts++; messages.push({ info: { id: `msg_prompt_${state.prompts}`, role: 'user', time: { created: Date.now() } }, parts: [] }); res.writeHead(204).end(); return; }
    if (match[2] === 'abort') { state.aborts++; json(true); return; }
    json(match[2] === 'message' ? messages : []);
  });
  const answer = (text: string) => {
    [...state.sessions.values()].at(-1)!.push({ info: { id: `msg_answer_${++serial}`, role: 'assistant', time: { created: Date.now(), completed: Date.now() }, finish: 'stop', cost: 0.03 }, parts: [{ type: 'text', text }] });
  };
  return { state, server, answer };
}

function kubernetes(target: string, env: Record<string, string>) {
  const objects = new Map<string, any>();
  const workers = new Map<string, { process: ChildProcess; logs: string; exited: Promise<number | null> }>();
  const client = {
    async request(path: string, method = 'GET', body?: any) {
      if (method === 'GET') return objects.get(path.split('?')[0].endsWith('/log') ? '' : path);
      if (method === 'DELETE') {
        objects.delete(path);
        const worker = workers.get(path);
        if (worker && worker.process.exitCode === null) { worker.process.kill('SIGTERM'); await worker.exited; }
        return {};
      }
      const object = structuredClone(body);
      object.metadata.resourceVersion = '1';
      const key = method === 'POST' ? `${path}/${object.metadata.name}` : path;
      if (object.kind === 'Secret') object.data = Object.fromEntries(Object.entries(object.stringData as Record<string, string>).map(([name, value]) => [name, Buffer.from(value).toString('base64')]));
      if (object.kind === 'Pod') {
        object.status = { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] };
        const secret = objects.get(key.replace('/pods/', '/secrets/'));
        const agent = object.spec.containers.find((container: any) => container.name === 'agent');
        const relayUrl = agent.env.find((item: any) => item.name === 'UNFOLD_RELAY_URL').value;
        const started = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', UNFOLD_RELAY_URL: relayUrl, UNFOLD_RELAY_TOKEN: secret.stringData.UNFOLD_RELAY_TOKEN, UNFOLD_RELAY_TARGET: target, UNFOLD_RELAY_KEEP_ALIVE: '1', ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
        const worker = { process: started, logs: '', exited: new Promise<number | null>(resolve => started.on('exit', code => resolve(code))) };
        started.stderr!.on('data', chunk => { worker.logs += chunk; });
        workers.set(key, worker);
      }
      objects.set(key, object);
      return object;
    },
  };
  const secret = () => [...objects.values()].find(object => object.kind === 'Secret');
  const worker = () => [...workers.values()].at(-1);
  return { client, secret, worker, stop: () => { for (const { process: child } of workers.values()) child.kill('SIGKILL'); } };
}

async function workbench(t: TestContext, options: { graceMs?: number; worker?: Record<string, string> } = {}) {
  const tokenEnv = `UNFOLD_RESTART_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[tokenEnv] = randomBytes(24).toString('hex');
  const authority = ploeg();
  const ploegUrl = `http://127.0.0.1:${await listen(authority.server)}`;
  const harness = opencode(() => cluster.secret() ? Buffer.from(cluster.secret().data.OPENCODE_SERVER_PASSWORD, 'base64').toString('utf8') : undefined);
  const cluster = kubernetes(`http://127.0.0.1:${await listen(harness.server)}`, options.worker ?? {});
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-restart-'));
  const config: AppConfig = configuration(dataDir, 'live');
  config.runtime = { kind: 'opencode', backend: 'kubernetes', backends: ['kubernetes'], timeoutMs: 120_000, briefCheck: false, reconnectGraceMs: options.graceMs ?? 20_000 };
  config.kubernetes = { namespace: 'workspaces', image: 'registry.example/agent:1', storageSize: '1Gi', cpu: '1', memory: '1Gi', transport: 'pull', relayUrl: 'http://127.0.0.1:0', provisionTimeoutMs: 20_000 };
  config.ploeg = { url: ploegUrl, tokenEnv, teams: ['delivery'], userTeams: { owner: ['delivery'] } };
  config.execution = { team: 'delivery', heartbeatMs: 1000 };
  const runtimes = (relay: WorkerRelay) => new Map<RuntimeKind, AgentRuntime>([['opencode', new OpenCodeRuntime(config, new WorkspaceManager(config, { relay, kubernetes: new KubernetesWorkspaces(config, cluster.client as any, relay) }))]]);
  let app = await createApplication(config, { runtimes });
  const port = await listen(app.server);
  config.kubernetes.relayUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    cluster.stop();
    await app.close();
    await new Promise<void>(resolve => authority.server.close(() => resolve()));
    harness.server.closeAllConnections();
    await new Promise<void>(resolve => harness.server.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
    delete process.env[tokenEnv];
  });
  return {
    authority, harness, cluster,
    get app() { return app; },
    session: (id: string): Session => app.store.getSession(id)!,
    async restart() {
      await app.close();
      app = await createApplication(config, { runtimes });
      await listen(app.server, port);
    },
  };
}

const prompted = (f: Awaited<ReturnType<typeof workbench>>, id: string) => f.app.store.events(id).some(event => event.type === 'native.session' && event.data.prompted === true);

test('a running session survives a workbench restart: its worker reconnects with the credential it holds and the session completes', { timeout: testTimeout(90_000) }, async t => {
  const f = await workbench(t);
  const session = f.app.engine.create(createInput({ runtime: 'opencode', budgetUsd: 2 }) as any, owner);
  await f.app.engine.start(session.id, owner);
  await waitFor(() => prompted(f, session.id), undefined, { reason: 'the agent never received its prompt', withinMs: 30_000 });
  const before = f.session(session.id);
  assert.equal(before.status, 'running');

  await f.restart();
  await waitFor(() => f.app.store.events(session.id).some(event => event.type === 'workspace.reconnected' || event.type === 'session.interrupted'), undefined, { reason: 'the restarted workbench neither reconnected nor interrupted the session', withinMs: 30_000 });
  assert.equal(f.session(session.id).status, 'running', `the session must keep running after the restart; worker log:\n${f.cluster.worker()?.logs}`);
  assert.ok(f.app.store.events(session.id).some(event => event.type === 'workspace.waiting' && event.data.phase === 'reconnecting'), 'the gap is shown as reconnecting');
  assert.equal(f.harness.state.aborts, 0, 'the stopping workbench left the agent working');
  assert.equal(f.harness.state.refusedCredentials, 0, 'the restarted workbench recovered the workspace\'s OpenCode credentials');

  f.harness.answer('Changed the README and ran the tests.');
  await waitFor(() => f.harness.state.prompts, prompts => prompts === 2, { reason: 'the reviewer never started after the reconnected builder finished', withinMs: 30_000 });
  f.harness.answer('```json\n{"verdict":"approve","summary":"The README change is verified."}\n```');
  await waitFor(() => f.session(session.id).status, status => status === 'completed', { reason: 'the reconnected session did not complete', withinMs: 30_000 });
  const finished = f.session(session.id);
  assert.equal(finished.runs[0].status, 'completed');
  assert.equal(finished.runs[0].summary, 'Changed the README and ran the tests.');
  assert.equal(f.harness.state.prompts, 2, 'the restart never prompted the builder again; only the reviewer was prompted after it');
  assert.equal(f.authority.state.credentialRequests, 1, 'the restart reused the issued inference key instead of minting another');
  const accounted = await waitFor(() => f.session(session.id), current => current.observedUsd === f.authority.state.observedUsd, { reason: 'the gateway spend Ploeg observed never reached the session', withinMs: 15_000 });
  assert.equal(accounted.costStatus, 'observed', 'spend accounting stays observed across the restart');
  assert.equal(f.app.store.events(session.id).some(event => event.type === 'session.interrupted'), false);
  assert.equal(await waitFor(() => f.cluster.worker()!.process.exitCode, code => code !== null, { reason: 'the worker of the completed session kept running', withinMs: 15_000 }), 0);
  assert.match(f.cluster.worker()!.logs, /relay revoked the worker \(HTTP 401\); stopping/);
});

test('a cancelled session revokes its worker, which gets a 401 and stops, and a restart does not revive it', { timeout: testTimeout(90_000) }, async t => {
  const f = await workbench(t);
  const session = f.app.engine.create(createInput({ runtime: 'opencode', budgetUsd: 2 }) as any, owner);
  await f.app.engine.start(session.id, owner);
  await waitFor(() => prompted(f, session.id), undefined, { reason: 'the agent never received its prompt', withinMs: 30_000 });
  const token = f.cluster.secret().stringData.UNFOLD_RELAY_TOKEN as string;
  const cancelled = await f.app.engine.cancel(session.id, owner);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(await waitFor(() => f.cluster.worker()!.process.exitCode, code => code !== null, { reason: 'the cancelled session\'s worker kept running', withinMs: 15_000 }), 0);
  assert.match(f.cluster.worker()!.logs, /relay revoked the worker \(HTTP 401\); stopping/);
  await f.restart();
  const url = `${(f.app.server.address() as { port: number }).port}`;
  const refused = await fetch(`http://127.0.0.1:${url}/api/relay/${session.id}/requests?wait=0`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(refused.status, 401);
  assert.equal((await refused.json()).error.code, 'revoked');
  assert.equal(f.session(session.id).status, 'cancelled');
});

test('a session whose Ploeg lease ran out while the workbench was down is not reattached: its turn ends and its key is blocked', { timeout: testTimeout(90_000) }, async t => {
  const f = await workbench(t);
  const session = f.app.engine.create(createInput({ runtime: 'opencode', budgetUsd: 2 }) as any, owner);
  await f.app.engine.start(session.id, owner);
  await waitFor(() => prompted(f, session.id), undefined, { reason: 'the agent never received its prompt', withinMs: 30_000 });
  f.authority.state.leaseLapsed = true;
  await f.restart();
  await waitFor(() => f.session(session.id).status, status => status === 'interrupted', { reason: 'a session whose lease lapsed must not keep running', withinMs: 30_000 });
  assert.equal(await waitFor(() => f.cluster.worker()!.process.exitCode, code => code !== null, { reason: 'the workspace of a lapsed lease kept working', withinMs: 15_000 }), 0);
  await waitFor(() => f.authority.state.blocks, blocks => blocks > 0, { reason: 'the inference key of a lapsed lease was not blocked', withinMs: 15_000 });
  assert.equal(f.app.store.events(session.id).some(event => event.type === 'workspace.reconnected'), false);
});

test('startup recovery revokes the relay credential of a session that ended before its worker was revoked', { timeout: testTimeout(60_000) }, async t => {
  const f = await workbench(t);
  const session = f.app.engine.create(createInput({ runtime: 'opencode', budgetUsd: 2 }) as any, owner);
  const token = 'the-token-of-a-worker-whose-session-ended';
  storedCredentials(f.app.store).write(session.id, { digest: createHash('sha256').update(token).digest('hex') });
  const ended = f.session(session.id);
  ended.status = 'cancelled';
  ended.workspace = { id: session.id, backend: 'kubernetes', directory: '/workspace/repository', endpoint: relayEndpoint(session.id), metadata: { transport: 'pull' } };
  f.app.store.saveSession(ended);
  const poll = async () => {
    const response = await fetch(`http://127.0.0.1:${(f.app.server.address() as { port: number }).port}/api/relay/${session.id}/requests?wait=0`, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, code: response.ok ? undefined : (await response.json()).error.code };
  };
  assert.equal((await poll()).status, 200, 'the fixture is an ended session whose worker credential is still valid');
  await f.restart();
  assert.deepEqual(await poll(), { status: 401, code: 'revoked' });
});
