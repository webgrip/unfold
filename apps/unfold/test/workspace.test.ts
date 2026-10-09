import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RuntimeFailure, classifyFailure } from '../src/failures.ts';
import { WorkspaceManager, isolatedEnvironment, managedConfig } from '../src/runtime/workspace.ts';
import { KubernetesWorkspaces, workspaceManifests, candidateExportManifest, podWait } from '../src/runtime/kubernetes.ts';
import type { AppConfig, Repository, Session } from '../src/types.ts';
import { deadlineAfter } from './timeframes.ts';

const repository = { id: 'repo', name: 'Repo', description: '', url: 'https://forge.example/project.git', baseBranch: 'main', verify: ['node', '--test'] } as Repository;
const session = { id: 'abc123', branch: 'unfold/abc123', ownerId: 'alice' } as Session;
const credential = { key: 'sk-session', alias: 'alias', reference: 'alias', budgetUsd: 5 };
function configuration(dataDir = '/data'): AppConfig {
  return {
    mode: 'live', dataDir, repositories: [repository], models: [{ id: 'code', name: 'Coding', providerId: 'gateway', modelId: 'coding' }],
    runtime: { kind: 'opencode', backend: 'kubernetes', timeoutMs: 20_000 },
    litellm: { baseUrl: 'https://gateway.example/v1', adminUrl: 'https://gateway.example', masterKey: 'MASTER-NEVER-AGENT', models: ['coding'], ttl: '4h' },
    kubernetes: { namespace: 'workspaces', image: 'registry.example/agent:1.18.30', storageSize: '4Gi', cpu: '1', memory: '1Gi' },
  } as AppConfig;
}

test('agent environment contains the session credential and no inherited operator or infrastructure credentials', () => {
  const original = process.env.LITELLM_MASTER_KEY;
  process.env.LITELLM_MASTER_KEY = 'MASTER-NEVER-AGENT';
  try {
    const env = isolatedEnvironment('/work/one', credential, configuration());
    assert.equal(env.LITELLM_API_KEY, 'sk-session');
    assert.equal(env.LITELLM_MASTER_KEY, undefined);
    assert.equal(env.KUBERNETES_SERVICE_HOST, undefined);
    assert.equal(env.UNFOLD_BOOTSTRAP_PASSWORD, undefined);
    assert.equal(JSON.stringify(env).includes('MASTER-NEVER-AGENT'), false);
    const managed = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
    assert.deepEqual(managed.enabled_providers, ['gateway']);
    assert.equal(managed.provider.gateway.options.apiKey, '{env:LITELLM_API_KEY}');
  } finally { if (original === undefined) delete process.env.LITELLM_MASTER_KEY; else process.env.LITELLM_MASTER_KEY = original; }
});

test('workspace manifests isolate API authority and default to DNS-only egress', () => {
  const config = configuration();
  const manifests = workspaceManifests(config, session, repository, credential, { username: 'opencode', password: 'basic-private' }, managedConfig(config));
  const pod = manifests.find(item => item.kind === 'Pod')!;
  const policy = manifests.find(item => item.kind === 'NetworkPolicy')!;
  assert.equal(pod.spec.automountServiceAccountToken, false);
  assert.equal(pod.spec.containers[0].securityContext.runAsNonRoot, true);
  assert.equal(pod.spec.containers[0].securityContext.readOnlyRootFilesystem, true);
  assert.equal(JSON.stringify(manifests).includes('MASTER-NEVER-AGENT'), false);
  assert.equal(policy.spec.egress.length, 1);
  assert.equal(JSON.stringify(policy).includes('0.0.0.0/0'), false);
  assert.equal(pod.spec.volumes.some((v: any) => v.hostPath), false);
  assert.equal(pod.spec.containers[0].env.some((e: any) => /MASTER|KUBERNETES|BOOTSTRAP/.test(e.name)), false);
  const clone = pod.spec.initContainers[0];
  assert.equal(clone.env.some((e: any) => e.name === 'LITELLM_API_KEY'), false);
});

test('Kubernetes lifecycle provisions real API resource shapes and retains PVC on disposal', async () => {
  const config = configuration();
  const objects = new Map<string, any>();
  const calls: string[] = [];
  const fake = { async request(path: string, method = 'GET', body?: any, missing?: boolean) {
    calls.push(method + ' ' + path);
    if (method === 'GET') return objects.get(path);
    if (method === 'DELETE') { objects.delete(path); return {}; }
    const object = structuredClone(body);
    object.metadata.resourceVersion = '1';
    if (object.kind === 'Pod') object.status = { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] };
    const key = method === 'POST' ? path + '/' + object.metadata.name : path;
    objects.set(key, object); return object;
  } };
  const manager = new KubernetesWorkspaces(config, fake as any);
  const workspace = await manager.prepare(session, repository, credential, new AbortController().signal, managedConfig(config));
  assert.equal(workspace.backend, 'kubernetes');
  assert.equal(JSON.stringify(workspace).includes('password'), false);
  assert.ok(manager.credentials(workspace)?.password);
  assert.equal(objects.size, 5);
  await manager.dispose(workspace);
  assert.equal(objects.size, 1);
  assert.equal([...objects.values()][0].kind, 'PersistentVolumeClaim');
  assert.ok(calls.some(call => call.startsWith('POST /apis/networking.k8s.io/')));
});

function pendingPodClient(status: Record<string, unknown>) {
  const objects = new Map<string, any>();
  return { async request(path: string, method = 'GET', body?: any) {
    if (method === 'GET') return objects.get(path);
    if (method === 'DELETE') { objects.delete(path); return {}; }
    const object = structuredClone(body);
    object.metadata.resourceVersion = '1';
    if (object.kind === 'Pod') object.status = structuredClone(status);
    objects.set(method === 'POST' ? path + '/' + object.metadata.name : path, object);
    return object;
  } };
}

const unschedulable = { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: '0/6 nodes are available: 1 Insufficient cpu, 2 Insufficient memory.' }] };

test('a workspace Pod no node has room for reports capacity while it waits and fails as capacity', async () => {
  const config = configuration();
  config.kubernetes!.provisionTimeoutMs = 1500;
  const manager = new KubernetesWorkspaces(config, pendingPodClient(unschedulable) as any);
  const preparing = manager.prepare(session, repository, credential, new AbortController().signal, managedConfig(config));
  const caught = preparing.catch(error => error);
  const until = deadlineAfter(1000);
  while (!manager.provisioning().length && Date.now() < until) await new Promise(done => setTimeout(done, 50));
  assert.deepEqual(manager.provisioning().map(wait => [wait.sessionId, wait.phase, wait.reason]), [[session.id, 'capacity', unschedulable.conditions[0].message]]);
  const error = await caught;
  assert.ok(error instanceof RuntimeFailure);
  assert.equal(error.category, 'capacity');
  assert.equal(error.promptAcceptance, 'not_submitted');
  assert.match(error.detail!, /Insufficient memory/);
  assert.deepEqual(manager.provisioning(), []);
});

test('pod waits read storage binding as scheduling and image pull errors as an unavailable image', () => {
  assert.deepEqual(podWait({ status: { conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: 'pod has unbound immediate PersistentVolumeClaims' }] } }), { phase: 'scheduling' });
  assert.deepEqual(podWait({ status: { conditions: [{ type: 'PodScheduled', status: 'True' }], containerStatuses: [{ state: { waiting: { reason: 'ImagePullBackOff', message: 'Back-off pulling image' } } }] } }), { phase: 'image_unavailable', reason: 'ImagePullBackOff: Back-off pulling image' });
  assert.deepEqual(podWait({ status: { conditions: [{ type: 'PodScheduled', status: 'True' }], initContainerStatuses: [{ state: { running: {} } }] } }), { phase: 'starting' });
  assert.deepEqual(podWait(undefined), { phase: 'scheduling' });
});

test('a workspace image that cannot be pulled fails as a missing executable', async () => {
  const config = configuration();
  config.kubernetes!.provisionTimeoutMs = 700;
  const manager = new KubernetesWorkspaces(config, pendingPodClient({ phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'True' }], initContainerStatuses: [{ state: { waiting: { reason: 'ErrImagePull', message: 'not found' } } }] }) as any);
  const error = await manager.prepare(session, repository, credential, new AbortController().signal, managedConfig(config)).catch(caught => caught);
  assert.equal(error.category, 'missing_executable');
  assert.match(error.detail!, /ErrImagePull: not found/);
});

test('local command workspace clones once and preserves human changes on resume', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-workspace-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source'); await mkdir(source);
  execFileSync('git', ['init', '-b', 'main', source], { stdio: 'ignore' });
  execFileSync('git', ['-C', source, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', source, 'config', 'user.email', 'test@localhost']);
  await writeFile(join(source, 'hello.txt'), 'initial');
  execFileSync('git', ['-C', source, 'add', 'hello.txt']);
  execFileSync('git', ['-C', source, 'commit', '-m', 'Initial'], { stdio: 'ignore' });
  const repo = { ...repository, url: source };
  const config = configuration(join(directory, 'data'));
  config.repositories = [repo]; config.runtime = { kind: 'command', backend: 'local', timeoutMs: 10_000 };
  const manager = new WorkspaceManager(config);
  const workspace = await manager.prepare(session, repo, credential, new AbortController().signal);
  await writeFile(join(workspace.directory, 'hello.txt'), 'human edit survives');
  await manager.dispose(workspace);
  const resumed = await manager.prepare(session, repo, credential, new AbortController().signal);
  assert.equal(await readFile(join(resumed.directory, 'hello.txt'), 'utf8'), 'human edit survives');
  await assert.rejects(manager.prepare(session, { ...repo, url: '/wrong' }, credential, new AbortController().signal), /not configured/);
  await assert.rejects(manager.prepare({ ...session, id: '../escape' }, repo, credential, new AbortController().signal), /identity/);
});

test('local OpenCode uses private authentication and dies when its owner pipe closes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-supervisor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source'); await mkdir(source);
  execFileSync('git', ['init', '-b', 'main', source], { stdio: 'ignore' });
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '--allow-empty', '-m', 'Initial'], { stdio: 'ignore' });
  const binary = join(directory, 'fake-opencode.cjs');
  await writeFile(binary, `#!/usr/bin/env node
const http=require('node:http');
if(process.env.LITELLM_MASTER_KEY)process.exit(9);
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
const auth='Basic '+Buffer.from(process.env.OPENCODE_SERVER_USERNAME+':'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');
http.createServer((req,res)=>{res.writeHead(req.headers.authorization===auth?200:401);res.end('{}')}).listen(port,'127.0.0.1');
`, { mode: 0o700 });
  const repo = { ...repository, url: source };
  const config = configuration(join(directory, 'data'));
  config.repositories = [repo]; config.runtime = { kind: 'opencode', backend: 'local', binary, timeoutMs: 5000 };
  const manager = new WorkspaceManager(config);
  config.runtime.binary = '/no-such-unfold-opencode-binary';
  await assert.rejects(manager.prepare(session, repo, credential, new AbortController().signal), error => error instanceof RuntimeFailure && error.category === 'missing_executable' && error.promptAcceptance === 'not_submitted');
  assert.equal(manager.internal.size, 0);
  config.runtime.binary = binary;
  const workspace = await manager.prepare(session, repo, credential, new AbortController().signal);
  t.after(() => manager.dispose(workspace));
  assert.equal(JSON.stringify(workspace).includes('password'), false);
  assert.equal((await fetch(workspace.endpoint! + '/global/health')).status, 401);
  const basic = manager.credentials(workspace)!;
  const auth = 'Basic ' + Buffer.from(basic.username + ':' + basic.password).toString('base64');
  assert.equal((await fetch(workspace.endpoint! + '/global/health', { headers: { authorization: auth } })).status, 200);
  manager.internal.get(workspace.id)!.process!.stdin!.end();
  let stopped = false;
  const deadline = deadlineAfter(3_000);
  while (Date.now() < deadline) {
    try { await fetch(workspace.endpoint! + '/global/health', { signal: AbortSignal.timeout(100) }); }
    catch { stopped = true; break; }
    await new Promise(done => setTimeout(done, 100));
  }
  assert.equal(stopped, true, 'closing the parent channel must stop the agent server');
});

test('workspace failures carry the failing command and its redacted output', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-failure-detail-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repo = { ...repository, url: join(directory, 'missing.git') };
  const config = configuration(join(directory, 'data'));
  config.repositories = [repo]; config.runtime = { kind: 'command', backend: 'local', timeoutMs: 10_000 };
  await assert.rejects(new WorkspaceManager(config).prepare(session, repo, credential, new AbortController().signal), (error: RuntimeFailure) => {
    assert.equal(error.category, 'workspace_setup');
    assert.match(error.detail!, /^git clone --depth 100 --branch main -- \S+\/missing\.git <workspace>\/repository exited with code 128\n/);
    assert.match(error.detail!, /does not exist|not found|No such file/i);
    assert.equal(error.detail!.includes(join(directory, 'data')), false);
    return true;
  });
  const source = join(directory, 'source'); await mkdir(source);
  execFileSync('git', ['init', '-b', 'main', source], { stdio: 'ignore' });
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '--allow-empty', '-m', 'Initial'], { stdio: 'ignore' });
  const binary = join(directory, 'failing-opencode.cjs');
  await writeFile(binary, `#!/usr/bin/env node
process.stderr.write('provider rejected key sk-live-secret at https://user:pass@gateway.example/v1\\n');
process.exit(3);
`, { mode: 0o700 });
  const launching = { ...repository, url: source };
  config.repositories = [launching]; config.runtime = { kind: 'opencode', backend: 'local', binary, timeoutMs: 5000 };
  await assert.rejects(new WorkspaceManager(config).prepare(session, launching, credential, new AbortController().signal), (error: RuntimeFailure) => {
    assert.equal(error.category, 'workspace_setup');
    assert.match(error.detail!, /serve exited with code 3 before answering \/global\/health\nprovider rejected key \[redacted\] at https:\/\/\[redacted\]@gateway\.example\/v1/);
    assert.equal(error.detail!.includes(join(directory, 'data')), false);
    return true;
  });
});

test('failure details are redacted, bounded and cannot be assigned after construction', () => {
  const escape = String.fromCharCode(27);
  const raw = `${escape}[31mfatal:${escape}[0m Authorization: Bearer opaque-token token=never-persist ${'x'.repeat(5000)}`;
  const detail = classifyFailure(new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, raw), 'workspace').detail!;
  assert.equal(detail.includes('opaque-token'), false);
  assert.equal(detail.includes('never-persist'), false);
  assert.equal(detail.includes(escape), false);
  assert.equal(detail.length, 2001);
  assert.equal(classifyFailure(new Error('raw exception text'), 'workspace').detail, undefined);
  assert.equal(classifyFailure(new RuntimeFailure('timeout', 'workspace'), 'workspace').detail, undefined);
  assert.throws(() => Object.assign(new RuntimeFailure('workspace_setup', 'workspace'), { detail: 'smuggled' }), TypeError);
});

test('agent secrets reach the agent container as envFrom while the clone container never receives them', () => {
  const config = configuration();
  config.kubernetes = { ...config.kubernetes!, agentSecrets: ['forge-read-token', 'openbao-approle'] };
  const manifests = workspaceManifests(config, session, repository, credential, { username: 'opencode', password: 'basic-private' }, managedConfig(config));
  const pod = manifests.find(item => item.kind === 'Pod')!;
  assert.deepEqual(pod.spec.containers[0].envFrom, [{ secretRef: { name: 'forge-read-token' } }, { secretRef: { name: 'openbao-approle' } }]);
  assert.equal(pod.spec.initContainers[0].envFrom, undefined);
  assert.ok(pod.spec.containers[0].env.some((e: any) => e.name === 'GIT_COMMITTER_NAME'));
});

test('the environment allow-list copies named host variables and never the reserved ones', () => {
  const config = configuration();
  config.runtime.agentEnvironment = ['FORGE_READ_TOKEN'];
  const env = isolatedEnvironment('/work/one', credential, config, { FORGE_READ_TOKEN: 'forge-read', LITELLM_MASTER_KEY: 'MASTER-NEVER-AGENT', PATH: '/usr/bin' });
  assert.equal(env.FORGE_READ_TOKEN, 'forge-read');
  assert.equal(env.LITELLM_MASTER_KEY, undefined);
});

test('pull transport manifests drop the Service and ingress, run the relay worker and carry the token only in the Secret', () => {
  const config = configuration();
  config.kubernetes = { ...config.kubernetes!, transport: 'pull', relayUrl: 'http://unfold.unfold.svc:4080' };
  const relay = { url: 'http://unfold.unfold.svc:4080/api/relay/abc123', token: 'relay-token-secret' };
  const manifests = workspaceManifests(config, session, repository, credential, { username: 'opencode', password: 'basic-private' }, managedConfig(config), relay);
  assert.deepEqual(manifests.map(item => item.kind), ['Secret', 'PersistentVolumeClaim', 'NetworkPolicy', 'Pod']);
  const pod = manifests.find(item => item.kind === 'Pod')!;
  const agent = pod.spec.containers[0];
  assert.deepEqual(agent.command.slice(0, 3), ['node', '/usr/local/lib/unfold/relay-worker.mjs', '--']);
  assert.ok(agent.command.includes('127.0.0.1'));
  assert.equal(agent.ports, undefined);
  assert.equal(agent.env.find((e: any) => e.name === 'UNFOLD_RELAY_URL')?.value, relay.url);
  assert.deepEqual(agent.env.find((e: any) => e.name === 'UNFOLD_RELAY_TOKEN')?.valueFrom, { secretKeyRef: { name: pod.metadata.name, key: 'UNFOLD_RELAY_TOKEN' } });
  assert.equal(JSON.stringify(pod).includes('relay-token-secret'), false);
  assert.equal(manifests.find(item => item.kind === 'Secret')!.stringData.UNFOLD_RELAY_TOKEN, 'relay-token-secret');
  assert.deepEqual(manifests.find(item => item.kind === 'NetworkPolicy')!.spec.ingress, []);
  const exportPod = candidateExportManifest(config, { ...session, workspace: { id: session.id, backend: 'kubernetes', directory: '/workspace/repository', metadata: { baseSha: 'a'.repeat(40) } } }, repository, relay);
  assert.deepEqual(exportPod.spec.containers[0].command.slice(0, 3), ['node', '/usr/local/lib/unfold/relay-worker.mjs', '--']);
});

test('user namespaces are opt-in and remap both the writer and the export pod', () => {
  const config = configuration();
  assert.equal(workspaceManifests(config, session, repository, credential, { username: 'opencode', password: 'p' }, managedConfig(config)).find(item => item.kind === 'Pod')!.spec.hostUsers, undefined);
  config.kubernetes = { ...config.kubernetes!, userNamespaces: true };
  assert.equal(workspaceManifests(config, session, repository, credential, { username: 'opencode', password: 'p' }, managedConfig(config)).find(item => item.kind === 'Pod')!.spec.hostUsers, false);
  assert.equal(candidateExportManifest(config, { ...session, workspace: { id: session.id, backend: 'kubernetes', directory: '/workspace/repository', metadata: { baseSha: 'a'.repeat(40) } } }, repository).spec.hostUsers, false);
});

const gatewayTools = { litellmTeamId: 'agents-orders', accessGroups: ['observability-read-orders'] };

test('managed agent configuration adds the gateway MCP server only for a repository that opts in', () => {
  const config = configuration();
  const plain = managedConfig(config);
  assert.equal('mcp' in plain, false);
  assert.deepEqual(managedConfig(config, repository), plain);
  const scoped = managedConfig(config, { mcp: gatewayTools });
  assert.deepEqual(scoped.mcp, { litellm: { type: 'remote', url: 'https://gateway.example/mcp', headers: { 'x-litellm-api-key': 'Bearer {env:LITELLM_API_KEY}' }, oauth: false, enabled: true } });
  const { mcp: _, ...rest } = scoped;
  assert.deepEqual(rest, plain);
  assert.deepEqual(scoped.permission, { '*': 'ask', external_directory: 'deny' });
  assert.equal(JSON.stringify(scoped).includes('MASTER-NEVER-AGENT'), false);
  assert.equal(JSON.stringify(scoped).includes('agents-orders'), false);
  config.litellm!.baseUrl = 'https://gateway.example/litellm/v1/';
  assert.equal((managedConfig(config, { mcp: gatewayTools }).mcp as any).litellm.url, 'https://gateway.example/litellm/mcp');
  delete config.litellm;
  assert.equal('mcp' in managedConfig(config, { mcp: gatewayTools }), false);
  const env = isolatedEnvironment('/work/one', credential, configuration(), {}, { mcp: gatewayTools });
  assert.equal(JSON.parse(env.OPENCODE_CONFIG_CONTENT).mcp.litellm.url, 'https://gateway.example/mcp');
});

test('the workspace backend receives the gateway MCP server from the configured repository whoever issued the credential', async () => {
  const config = configuration();
  config.repositories = [{ ...repository, mcp: gatewayTools }];
  const prepared: Record<string, any>[] = [];
  const backend = { async prepare(_session: Session, _repository: Repository, _credential: unknown, _signal: AbortSignal, managed: Record<string, any>) { prepared.push(managed); return { id: session.id, backend: 'kubernetes' as const, directory: '/workspace' }; } };
  const manager = new WorkspaceManager(config, { kubernetes: backend as any });
  await manager.prepare(session, repository, credential, new AbortController().signal);
  await manager.prepare(session, { ...repository, mcp: undefined }, { ...credential, key: 'sk-issued-by-ploeg' }, new AbortController().signal);
  assert.equal(prepared.length, 2);
  for (const managed of prepared) assert.equal(managed.mcp.litellm.url, 'https://gateway.example/mcp');
  config.repositories = [repository];
  await manager.prepare(session, repository, credential, new AbortController().signal);
  assert.equal('mcp' in prepared[2], false);
});
