import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { SandboxWorkspaces, sandboxClaimManifest, sandboxManifests } from '../src/runtime/sandbox.ts';
import { WorkspaceManager, managedConfig } from '../src/runtime/workspace.ts';
import { WorkerRelay } from '../src/runtime/relay.ts';
import { workspaceName } from '../src/runtime/kubernetes.ts';
import type { AppConfig, Repository, Session } from '../src/types.ts';

const repository = { id: 'repo', name: 'Repo', description: '', url: 'https://forge.example/project.git', baseBranch: 'main', verify: ['npm', 'test'] } as Repository;
const session = { id: 'sandbox-session', branch: 'vloer/sandbox-session', ownerId: 'alice', placement: 'kubernetes', runs: [] } as unknown as Session;
const credential = { key: 'sk-session', alias: 'alias', reference: 'alias', budgetUsd: 5 };

function configuration(relayUrl: string, warmPool?: string): AppConfig {
  return {
    mode: 'live', dataDir: '/data', repositories: [repository], models: [{ id: 'code', name: 'Coding', providerId: 'gateway', modelId: 'coding' }],
    runtime: { kind: 'opencode', backend: 'kubernetes', backends: ['kubernetes'], timeoutMs: 20_000 },
    litellm: { baseUrl: 'https://gateway.example/v1', adminUrl: 'https://gateway.example', masterKey: 'MASTER-NEVER-AGENT', models: ['coding'], ttl: '4h' },
    kubernetes: { namespace: 'workspaces', image: 'harbor.example/de-vloer-agent:1.0.0', storageSize: '4Gi', cpu: '1', memory: '2Gi', transport: 'pull', relayUrl, provisioner: 'sandbox', sandbox: { runtimeClassName: 'kata', warmPool, poolTokenEnv: 'TEST_POOL_TOKEN' }, provisionTimeoutMs: 15_000 },
  } as AppConfig;
}

async function listen(server: Server): Promise<number> { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve())); return (server.address() as { port: number }).port; }

function fakeWorker(relayBase: string, options: { pool?: { token: string; pod: string } ; token?: string; sessionId?: string }) {
  const state = { requests: [] as string[], env: {} as Record<string, string>, running: [] as string[][], stopped: 0 };
  let sessionId = options.sessionId; let token = options.token;
  const basicOk = (headers: Record<string, string>) => headers.authorization === 'Basic ' + Buffer.from(`opencode:${state.env.OPENCODE_SERVER_PASSWORD}`).toString('base64');
  const handle = async (request: any) => {
    state.requests.push(`${request.method} ${request.path}`);
    let status = 200; let body = '{}';
    if (request.path.startsWith('/__vloer/exec')) body = JSON.stringify({ exitCode: 0, stdout: JSON.stringify({ baseSha: 'b'.repeat(40) }) + '\n', stderr: '' });
    else if (request.path.startsWith('/__vloer/run')) { state.running.push(JSON.parse(Buffer.from(request.body, 'base64').toString()).argv); status = 202; body = '{"started":true}'; }
    else if (request.path.startsWith('/__vloer/stop-child')) { state.stopped++; body = '{"stopped":true}'; }
    else if (request.path.startsWith('/global/health')) { status = basicOk(request.headers) ? 200 : 401; body = '{"healthy":true}'; }
    else status = 404;
    await fetch(`${relayBase}/${sessionId}/responses/${request.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-relay-status': String(status), 'x-relay-headers': JSON.stringify({ 'content-type': 'application/json' }) }, body });
  };
  let stopped = false;
  const loop = async () => {
    if (options.pool) {
      while (!stopped) {
        const response = await fetch(`${relayBase}/pool/claim?pod=${options.pool.pod}&wait=500`, { headers: { authorization: `Bearer ${options.pool.token}` } });
        const { assignment } = await response.json();
        if (assignment) { sessionId = assignment.sessionId; token = assignment.token; state.env = assignment.env; break; }
      }
    }
    while (!stopped) {
      const response = await fetch(`${relayBase}/${sessionId}/requests?wait=500`, { headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
      if (!response || !response.ok) { await delay(50); continue; }
      const batch = await response.json();
      for (const request of batch.requests ?? []) void handle(request);
    }
  };
  void loop();
  return { state, stop: () => { stopped = true; } };
}

test('cold sandbox manifests put the agent pod behind Kata with a volume claim template, no Service and the relay worker', () => {
  const config = configuration('http://de-vloer.de-vloer.svc:4080');
  const manifests = sandboxManifests(config, session, repository, credential, { username: 'opencode', password: 'basic' }, managedConfig(config), { url: 'http://de-vloer.de-vloer.svc:4080/api/relay/sandbox-session', token: 'relay-token' });
  assert.deepEqual(manifests.map(item => item.kind), ['Secret', 'NetworkPolicy', 'Sandbox']);
  const sandbox = manifests[2];
  assert.equal(sandbox.apiVersion, 'agents.x-k8s.io/v1beta1');
  assert.equal(sandbox.spec.podTemplate.spec.runtimeClassName, 'kata');
  assert.equal(sandbox.spec.service, false);
  assert.equal(sandbox.spec.shutdownPolicy, 'Retain');
  assert.equal(sandbox.spec.volumeClaimTemplates[0].metadata.name, 'workspace');
  assert.equal(sandbox.spec.podTemplate.spec.volumes.some((volume: any) => volume.persistentVolumeClaim), false);
  assert.equal(sandbox.spec.podTemplate.spec.automountServiceAccountToken, false);
  assert.deepEqual(sandbox.spec.podTemplate.spec.containers[0].command.slice(0, 3), ['node', '/usr/local/lib/de-vloer/relay-worker.mjs', '--']);
  assert.equal(JSON.stringify(sandbox).includes('relay-token'), false);
  const claim = sandboxClaimManifest(configuration('http://x', 'vloer-warm'), session);
  assert.equal(claim.kind, 'SandboxClaim');
  assert.deepEqual(claim.spec.warmPoolRef, { name: 'vloer-warm' });
});

test('a cold sandbox becomes a workspace once the CRD is Ready and its worker has dialled in, and disposal removes the sandbox', { timeout: 20_000 }, async t => {
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const port = await listen(relayServer);
  t.after(() => relayServer.close());
  const relayBase = `http://127.0.0.1:${port}/api/relay`;
  const config = configuration(`http://127.0.0.1:${port}`);
  const objects = new Map<string, any>();
  let worker: ReturnType<typeof fakeWorker> | undefined;
  const fake = { async request(path: string, method = 'GET', body?: any, missing?: boolean) {
    if (method === 'GET') return objects.get(path);
    if (method === 'DELETE') { objects.delete(path); return {}; }
    const object = structuredClone(body); object.metadata.resourceVersion = '1';
    const key = method === 'POST' ? `${path}/${object.metadata.name}` : path;
    if (object.kind === 'Sandbox') {
      object.status = { conditions: [{ type: 'Ready', status: 'True' }], podIPs: ['10.1.2.3'] };
      const env = Object.fromEntries(object.spec.podTemplate.spec.containers[0].env.filter((item: any) => item.value !== undefined).map((item: any) => [item.name, item.value]));
      const secret = [...objects.values()].find(item => item.kind === 'Secret');
      worker = fakeWorker(relayBase, { token: secret.stringData.VLOER_RELAY_TOKEN, sessionId: session.id });
      worker.state.env = { ...env, OPENCODE_SERVER_PASSWORD: secret.stringData.OPENCODE_SERVER_PASSWORD };
    }
    objects.set(key, object); return object;
  } };
  t.after(() => worker?.stop());
  const manager = new WorkspaceManager(config, { relay, kubernetes: new SandboxWorkspaces(config, fake as any, relay) });
  const workspace = await manager.prepare(session, repository, credential, new AbortController().signal);
  assert.equal(workspace.backend, 'kubernetes');
  assert.equal(workspace.endpoint, `relay://${session.id}`);
  assert.equal(workspace.metadata?.provisioner, 'sandbox');
  assert.equal(workspace.metadata?.runtimeClassName, 'kata');
  assert.ok([...objects.keys()].some(key => key.includes('/sandboxes/')));
  assert.ok(worker!.state.requests.some(line => line.startsWith('GET /global/health')));
  await manager.dispose(workspace);
  assert.equal([...objects.keys()].some(key => key.includes('/sandboxes/')), false);
  assert.equal(relay.connected(session.id), false);
});

test('a warm-pool claim hands the bound pod its session over the relay, clones through exec and starts the harness', { timeout: 20_000 }, async t => {
  process.env.TEST_POOL_TOKEN = 'pool-token-for-test';
  t.after(() => { delete process.env.TEST_POOL_TOKEN; });
  const relay = new WorkerRelay();
  const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  const port = await listen(relayServer);
  t.after(() => relayServer.close());
  const relayBase = `http://127.0.0.1:${port}/api/relay`;
  const config = configuration(`http://127.0.0.1:${port}`, 'vloer-warm');
  const worker = fakeWorker(relayBase, { pool: { token: 'pool-token-for-test', pod: 'vloer-warm-abc12' } });
  t.after(() => worker.stop());
  const objects = new Map<string, any>();
  const fake = { async request(path: string, method = 'GET', body?: any) {
    if (method === 'GET') return objects.get(path);
    if (method === 'DELETE') { objects.delete(path); return {}; }
    const object = structuredClone(body); object.metadata.resourceVersion = '1';
    if (object.kind === 'SandboxClaim') object.status = { sandbox: { name: 'vloer-warm-abc12', podIPs: ['10.1.2.4'] }, conditions: [{ type: 'Ready', status: 'True' }] };
    objects.set(method === 'POST' ? `${path}/${object.metadata.name}` : path, object); return object;
  } };
  const manager = new WorkspaceManager(config, { relay, kubernetes: new SandboxWorkspaces(config, fake as any, relay) });
  const workspace = await manager.prepare(session, repository, credential, new AbortController().signal);
  assert.equal(workspace.metadata?.pod, 'vloer-warm-abc12');
  assert.equal(workspace.metadata?.baseSha, 'b'.repeat(40));
  assert.equal(worker.state.env.LITELLM_API_KEY, 'sk-session');
  assert.equal(worker.state.env.REPOSITORY_URL, repository.url);
  assert.equal(worker.state.env.WORK_BRANCH, session.branch);
  assert.equal(JSON.stringify([...objects.values()]).includes('sk-session'), false, 'the session key travels over the relay, never in a Kubernetes object');
  assert.ok(worker.state.requests.some(line => line.startsWith('POST /__vloer/exec')));
  assert.deepEqual(worker.state.running[0].slice(0, 2), ['opencode', 'serve']);
  assert.ok(worker.state.requests.some(line => line.startsWith('GET /global/health')));
  assert.equal(objects.size, 1);
  assert.equal([...objects.keys()][0].includes('/sandboxclaims/'), true);
  await manager.dispose(workspace);
  assert.equal(objects.size, 0);
});
