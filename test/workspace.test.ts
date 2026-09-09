import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RuntimeFailure, classifyFailure } from '../src/failures.ts';
import { WorkspaceManager, isolatedEnvironment, managedConfig } from '../src/runtime/workspace.ts';
import { KubernetesWorkspaces, workspaceManifests } from '../src/runtime/kubernetes.ts';
import type { AppConfig, Repository, Session } from '../src/types.ts';

const repository = { id: 'repo', name: 'Repo', description: '', url: 'https://forge.example/project.git', baseBranch: 'main', verify: ['node', '--test'] } as Repository;
const session = { id: 'abc123', branch: 'vloer/abc123', ownerId: 'alice' } as Session;
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
    assert.equal(env.VLOER_BOOTSTRAP_PASSWORD, undefined);
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

test('local command workspace clones once and preserves human changes on resume', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-workspace-'));
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
  const directory = await mkdtemp(join(tmpdir(), 'vloer-supervisor-'));
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
  config.runtime.binary = '/no-such-vloer-opencode-binary';
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
  for (let i = 0; i < 30; i++) {
    try { await fetch(workspace.endpoint! + '/global/health', { signal: AbortSignal.timeout(100) }); }
    catch { stopped = true; break; }
    await new Promise(done => setTimeout(done, 100));
  }
  assert.equal(stopped, true, 'closing the parent channel must stop the agent server');
});

test('workspace failures carry the failing command and its redacted output', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-failure-detail-'));
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
