import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DockerClient, DockerWorkspaces, agentEnvironment, containerSpecs, demultiplex } from '../src/runtime/docker.ts';
import { WorkspaceManager, managedConfig, sessionPlacement } from '../src/runtime/workspace.ts';
import { workspaceName } from '../src/runtime/kubernetes.ts';
import { WorkerRelay } from '../src/runtime/relay.ts';
import { RuntimeFailure } from '../src/failures.ts';
import type { AppConfig, Repository, Session } from '../src/types.ts';

const repository = { id: 'repo', name: 'Repo', description: '', url: 'https://forge.example/project.git', baseBranch: 'main', verify: ['npm', 'test'] } as Repository;
const session = { id: 'docker-session', branch: 'vloer/docker-session', ownerId: 'alice', placement: 'docker' } as Session;
const credential = { key: 'sk-session-only', alias: 'alias', reference: 'alias', budgetUsd: 5 };

function configuration(dataDir: string, socketPath: string): AppConfig {
  return {
    mode: 'live', dataDir, repositories: [repository], models: [{ id: 'code', name: 'Coding', providerId: 'gateway', modelId: 'coding' }],
    runtime: { kind: 'opencode', backend: 'docker', backends: ['docker', 'local'], timeoutMs: 20_000, agentEnvironment: ['FORGE_READ_TOKEN', 'ABSENT_VALUE'] },
    docker: { image: 'registry.example/agent:1.18.30', socketPath, cpus: 1, memoryMb: 512, pidsLimit: 64, provisionTimeoutMs: 8000 },
    litellm: { baseUrl: 'https://gateway.example/v1', adminUrl: 'https://gateway.example', masterKey: 'MASTER-NEVER-AGENT', models: ['coding'], ttl: '4h' },
  } as AppConfig;
}

function frame(kind: number, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8); header[0] = kind; header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

type FakeContainer = { name: string; spec: any; running: boolean; exitCode: number; logs: Buffer; port?: number; worker?: ChildProcess };
const workerScript = fileURLToPath(new URL('../ops/agent/relay-worker.mjs', import.meta.url));

async function fakeEngine(directory: string, options: { cloneExit?: number; agentExit?: number; baseSha?: string } = {}) {
  const socketPath = join(directory, 'docker.sock');
  const containers = new Map<string, FakeContainer>();
  const calls: string[] = [];
  const healthServers: import('node:http').Server[] = [];
  const read = (req: IncomingMessage) => new Promise<string>(resolve => { let text = ''; req.on('data', chunk => { text += chunk; }); req.on('end', () => resolve(text)); });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://docker');
    calls.push(`${req.method} ${url.pathname}`);
    const reply = (status: number, body?: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? undefined : JSON.stringify(body)); };
    const match = url.pathname.match(/^\/containers\/([^/]+)(?:\/(json|start|wait|stop|logs))?$/);
    if (req.method === 'POST' && url.pathname === '/containers/create') {
      const spec = JSON.parse(await read(req));
      const name = url.searchParams.get('name')!;
      if (containers.has(name)) return reply(409, { message: 'name already in use' });
      containers.set(name, { name, spec, running: false, exitCode: 0, logs: Buffer.alloc(0) });
      return reply(201, { Id: name });
    }
    if (!match) return reply(404, { message: 'unknown route' });
    const container = containers.get(decodeURIComponent(match[1]));
    if (!container) return reply(404, { message: 'no such container' });
    if (req.method === 'POST' && match[2] === 'start') {
      container.running = true;
      if (container.spec.Labels['dev.webgrip.de-vloer/purpose'] === 'clone') {
        const exit = options.cloneExit ?? 0;
        await mkdir(join(directory, 'workspaces', session.id, 'repository', '.git'), { recursive: true });
        container.logs = Buffer.concat([frame(2, 'cloning into /workspace/repository with token=never-shown\n'), frame(1, JSON.stringify({ baseSha: options.baseSha ?? 'a'.repeat(40) }) + '\n')]);
        container.running = false; container.exitCode = exit;
      } else {
        const exit = options.agentExit;
        if (exit !== undefined) { container.running = false; container.exitCode = exit; container.logs = frame(2, 'opencode failed to start: Authorization: Bearer leaked-token\n'); }
        else {
          const health = createServer((request, response) => {
            const expected = 'Basic ' + Buffer.from(container.spec.Env.find((entry: string) => entry.startsWith('OPENCODE_SERVER_USERNAME=')).slice(25) + ':' + container.spec.Env.find((entry: string) => entry.startsWith('OPENCODE_SERVER_PASSWORD=')).slice(25)).toString('base64');
            response.writeHead(request.headers.authorization === expected ? 200 : 401); response.end('{}');
          });
          await new Promise<void>(resolve => health.listen(0, '127.0.0.1', () => resolve()));
          healthServers.push(health);
          container.port = (health.address() as any).port;
          const env = Object.fromEntries(container.spec.Env.map((entry: string) => entry.split(/=(.*)/s).slice(0, 2)));
          if (env.VLOER_RELAY_URL) container.worker = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH ?? '', VLOER_RELAY_URL: env.VLOER_RELAY_URL, VLOER_RELAY_TOKEN: env.VLOER_RELAY_TOKEN, VLOER_RELAY_TARGET: `http://127.0.0.1:${container.port}` }, stdio: ['ignore', 'ignore', 'ignore'] });
        }
      }
      return reply(204);
    }
    if (req.method === 'POST' && match[2] === 'wait') return reply(200, { StatusCode: container.exitCode });
    if (req.method === 'POST' && match[2] === 'stop') { container.running = false; container.worker?.kill('SIGKILL'); return reply(204); }
    if (req.method === 'GET' && match[2] === 'logs') { res.writeHead(200, { 'content-type': 'application/vnd.docker.multiplexed-stream' }); res.end(container.logs); return; }
    if (req.method === 'GET' && match[2] === 'json') return reply(200, { Id: container.name, State: { Running: container.running, ExitCode: container.exitCode }, NetworkSettings: { Ports: container.port ? { '4096/tcp': [{ HostIp: '127.0.0.1', HostPort: String(container.port) }] } : {} } });
    if (req.method === 'DELETE') { container.worker?.kill('SIGKILL'); containers.delete(container.name); return reply(204); }
    return reply(405, { message: 'unsupported' });
  });
  await new Promise<void>(resolve => server.listen(socketPath, resolve));
  return { socketPath, containers, calls, close: async () => { for (const container of containers.values()) container.worker?.kill('SIGKILL'); for (const health of healthServers) health.close(); await new Promise(resolve => server.close(resolve)); } };
}

test('docker container specs carry only the session credential, a hardened host configuration and the explicit environment allow-list', () => {
  const config = configuration('/data', '/nonexistent.sock');
  const host = { FORGE_READ_TOKEN: 'forge-read', LITELLM_MASTER_KEY: 'MASTER-NEVER-AGENT', VLOER_ADMIN_PASSWORD: 'admin-secret', KUBERNETES_SERVICE_HOST: '10.0.0.1', PATH: '/usr/bin' };
  const specs = containerSpecs(config, session, repository, '/data/workspaces/docker-session', credential, { username: 'opencode', password: 'basic-secret' }, managedConfig(config), host);
  const serialized = JSON.stringify(specs);
  assert.equal(serialized.includes('MASTER-NEVER-AGENT'), false);
  assert.equal(serialized.includes('admin-secret'), false);
  assert.equal(serialized.includes('10.0.0.1'), false);
  assert.ok(specs.agent.Env.includes('LITELLM_API_KEY=sk-session-only'));
  assert.ok(specs.agent.Env.includes('FORGE_READ_TOKEN=forge-read'));
  assert.equal(specs.agent.Env.some((entry: string) => entry.startsWith('ABSENT_VALUE=')), false);
  assert.equal(specs.clone.Env.some((entry: string) => entry.startsWith('LITELLM_API_KEY=') || entry.startsWith('OPENCODE_SERVER_')), false);
  assert.ok(specs.clone.Env.includes('REPOSITORY_URL=https://forge.example/project.git'));
  for (const spec of [specs.clone, specs.agent]) {
    assert.equal(spec.HostConfig.ReadonlyRootfs, true);
    assert.deepEqual(spec.HostConfig.CapDrop, ['ALL']);
    assert.deepEqual(spec.HostConfig.SecurityOpt, ['no-new-privileges:true']);
    assert.deepEqual(spec.HostConfig.Binds, ['/data/workspaces/docker-session:/workspace']);
    assert.equal(spec.HostConfig.Privileged, undefined);
    assert.equal(spec.HostConfig.PidsLimit, 64);
    assert.equal(spec.HostConfig.Memory, 512 * 1024 * 1024);
    assert.equal(spec.HostConfig.NanoCpus, 1e9);
    assert.equal(JSON.stringify(spec.HostConfig).includes('docker.sock'), false);
  }
  assert.deepEqual(specs.agent.HostConfig.PortBindings, { '4096/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] });
  assert.equal(specs.agent.Cmd[0], 'opencode');
  assert.equal(specs.clone.Cmd[0], 'node');
  assert.deepEqual(agentEnvironment({ ...config, docker: { ...config.docker!, gatewayUrl: 'http://host.docker.internal:4000/v1' } }, undefined, undefined, {}, {}).filter(entry => entry.startsWith('LITELLM_')), ['LITELLM_BASE_URL=http://host.docker.internal:4000/v1']);
});

test('multiplexed docker log streams separate stdout from stderr', () => {
  const output = demultiplex(Buffer.concat([frame(1, 'out'), frame(2, 'err'), frame(1, 'put')]));
  assert.deepEqual(output, { stdout: 'output', stderr: 'err' });
});

test('docker lifecycle clones inside the image, waits for authenticated health, captures the candidate after a confirmed stop and removes the container on disposal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-docker-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const engine = await fakeEngine(directory);
  t.after(() => engine.close());
  const config = configuration(directory, engine.socketPath);
  const manager = new WorkspaceManager(config);
  assert.ok(manager.docker);
  const workspace = await manager.prepare(session, repository, credential, new AbortController().signal);
  assert.equal(workspace.backend, 'docker');
  assert.equal(workspace.directory, '/workspace/repository');
  assert.equal(workspace.metadata?.baseSha, 'a'.repeat(40));
  assert.equal(workspace.metadata?.container, workspaceName(session.id));
  assert.equal(JSON.stringify(workspace).includes('password'), false);
  assert.match(workspace.endpoint!, /^http:\/\/127\.0\.0\.1:\d+$/);
  const basic = manager.credentials(workspace)!;
  assert.equal((await fetch(workspace.endpoint + '/global/health')).status, 401);
  assert.equal((await fetch(workspace.endpoint + '/global/health', { headers: { authorization: 'Basic ' + Buffer.from(`${basic.username}:${basic.password}`).toString('base64') } })).status, 200);
  assert.equal(engine.containers.has(workspaceName(session.id) + '-clone'), false, 'the clone container is removed after it exits');
  assert.equal(engine.containers.get(workspaceName(session.id))?.running, true);

  const source = join(directory, 'workspaces', session.id, 'repository');
  await rm(source, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  execFileSync('git', ['init', '-b', 'main', source], { stdio: 'ignore' });
  await writeFile(join(source, 'README.md'), 'base\n');
  execFileSync('git', ['-C', source, 'add', 'README.md'], { stdio: 'ignore' });
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-m', 'base'], { stdio: 'ignore' });
  const baseSha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await writeFile(join(source, 'README.md'), 'changed by the agent\n');
  const captured = await manager.captureCandidate({ ...session, workspace: { ...workspace, metadata: { ...workspace.metadata, baseSha } } }, repository);
  assert.equal(captured.status, 'ready', JSON.stringify(captured));
  assert.equal(engine.containers.get(workspaceName(session.id))?.running, false, 'capture requires the writer container to be stopped');
  await manager.dispose(workspace);
  assert.equal(engine.containers.size, 0);
  assert.equal(manager.credentials(workspace), undefined);
  assert.ok(engine.calls.some(call => call.startsWith('DELETE /containers/')));
});

test('docker failures record the image, exit code and redacted container output without the socket path', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-docker-fail-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cloneFailure = await fakeEngine(directory, { cloneExit: 128 });
  t.after(() => cloneFailure.close());
  const config = configuration(directory, cloneFailure.socketPath);
  await assert.rejects(new WorkspaceManager(config).prepare(session, repository, credential, new AbortController().signal), (error: RuntimeFailure) => {
    assert.equal(error.category, 'workspace_setup');
    assert.match(error.detail!, /git clone inside registry\.example\/agent:1\.18\.30 exited with code 128\ncloning into \/workspace\/repository with token=\[redacted\]/);
    return true;
  });
  assert.equal(cloneFailure.containers.size, 0, 'failed clone containers are removed');
  await cloneFailure.close();
  const agentFailure = await fakeEngine(directory, { agentExit: 3 });
  t.after(() => agentFailure.close());
  await assert.rejects(new WorkspaceManager(configuration(directory, agentFailure.socketPath)).prepare(session, repository, credential, new AbortController().signal), (error: RuntimeFailure) => {
    assert.equal(error.category, 'workspace_setup');
    assert.match(error.detail!, /opencode serve inside registry\.example\/agent:1\.18\.30 exited with code 3 before answering \/global\/health\nopencode failed to start: Authorization: Bearer \[redacted\]/);
    return true;
  });
  assert.equal(agentFailure.containers.size, 0);
  const missing = new DockerClient(join(directory, 'absent.sock'));
  await assert.rejects(missing.request('/containers/json'), (error: RuntimeFailure) => error.category === 'missing_executable' && /Docker Engine socket/.test(error.detail!));
});

test('session placement selects an enabled backend and rejects the rest', () => {
  const config = configuration('/data', '/nonexistent.sock');
  assert.equal(sessionPlacement(config, { placement: 'local' }), 'local');
  assert.equal(sessionPlacement(config, {}), 'docker');
  assert.throws(() => sessionPlacement(config, { placement: 'kubernetes' }), /not enabled/);
  const manager = new WorkspaceManager({ ...config, runtime: { ...config.runtime, backend: 'local', backends: ['local'] } });
  assert.equal(manager.docker, undefined);
});

test('docker pull transport publishes no port, hands the container a relay token and reaches the harness through the dial-out worker', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-docker-pull-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const engine = await fakeEngine(directory);
  t.after(() => engine.close());
  const relay = new WorkerRelay();
  const relayServer: Server = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
  await new Promise<void>(resolve => relayServer.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => relayServer.close());
  const config = configuration(directory, engine.socketPath);
  config.docker = { ...config.docker!, transport: 'pull', relayUrl: `http://127.0.0.1:${(relayServer.address() as any).port}` };
  const manager = new WorkspaceManager(config, { relay });
  const workspace = await manager.prepare(session, repository, credential, new AbortController().signal).catch((error: any) => { throw new Error(`${error.category}: ${error.detail ?? error.message}`); });
  assert.equal(workspace.endpoint, `relay://${session.id}`);
  assert.equal(workspace.metadata?.transport, 'pull');
  const spec = engine.containers.get(workspaceName(session.id))!.spec;
  assert.equal(spec.ExposedPorts, undefined);
  assert.equal(spec.HostConfig.PortBindings, undefined);
  assert.deepEqual(spec.Cmd.slice(0, 3), ['node', '/usr/local/lib/de-vloer/relay-worker.mjs', '--']);
  assert.ok(spec.Env.some((entry: string) => entry === `VLOER_RELAY_URL=http://127.0.0.1:${(relayServer.address() as any).port}/api/relay/${session.id}`));
  const transport = manager.transport(workspace)!;
  const basic = manager.credentials(workspace)!;
  const health = await transport('http://workspace/global/health', { headers: { authorization: 'Basic ' + Buffer.from(`${basic.username}:${basic.password}`).toString('base64') } });
  assert.equal(health.status, 200);
  assert.equal((await transport('http://workspace/global/health')).status, 401);
  await manager.dispose(workspace).catch((error: any) => { throw new Error(`dispose: ${error.category}: ${error.detail ?? error.message}`); });
  assert.equal(relay.connected(session.id), false);
});

test('a linked repository credential reaches the clone container as a git header and never the agent container', () => {
  const config = configuration('/data', '/nonexistent.sock');
  const host = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'De Vloer', PATH: '/usr/bin' };
  config.runtime.agentEnvironment = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'];
  const linked = { ...repository, url: 'https://gitlab.example/group/project.git', access: { username: 'oauth2', password: 'link-token-never-agent' } };
  const specs = containerSpecs(config, session, linked, '/data/workspaces/docker-session', credential, { username: 'opencode', password: 'basic-secret' }, managedConfig(config), host);
  const header = 'Authorization: Basic ' + Buffer.from('oauth2:link-token-never-agent').toString('base64');
  assert.ok(specs.clone.Env.includes('GIT_CONFIG_COUNT=2'));
  assert.equal(specs.clone.Env.filter((entry: string) => entry.startsWith('GIT_CONFIG_COUNT=')).length, 1);
  assert.ok(specs.clone.Env.includes('GIT_CONFIG_KEY_1=http.https://gitlab.example/.extraheader'));
  assert.ok(specs.clone.Env.includes(`GIT_CONFIG_VALUE_1=${header}`));
  assert.ok(specs.clone.Env.includes('GIT_CONFIG_VALUE_0=De Vloer'));
  assert.equal(JSON.stringify(specs.agent).includes('link-token-never-agent'), false);
  assert.equal(JSON.stringify(specs.agent).includes(header), false);
  assert.ok(specs.agent.Env.includes('GIT_CONFIG_COUNT=1'));
});

test('the workspace manager keeps a linked credential on the validated repository it hands to a backend', async () => {
  const config = configuration('/data', '/nonexistent.sock');
  const manager = new WorkspaceManager(config);
  let received: any;
  (manager as any).docker = { prepare: async (_session: unknown, target: unknown) => { received = target; return { id: 'w', backend: 'docker', endpoint: 'http://127.0.0.1:1', directory: '/data' }; } };
  const linked = { ...repository, access: { username: 'oauth2', password: 'link-token' } };
  await manager.prepare({ ...session, placement: 'docker' }, linked, credential, new AbortController().signal);
  assert.deepEqual(received.access, { username: 'oauth2', password: 'link-token' });
  assert.equal(received.url, repository.url);
  await manager.prepare({ ...session, placement: 'docker' }, repository, credential, new AbortController().signal);
  assert.equal(received.access, undefined);
  await assert.rejects(manager.prepare({ ...session, placement: 'docker' }, { ...linked, url: 'https://elsewhere.example/other.git' }, credential, new AbortController().signal), /not configured/);
});
