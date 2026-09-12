import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { WorkspaceManager } from '../src/runtime/workspace.ts';
import { OpenCodeRuntime } from '../src/runtime/opencode.ts';
import { WorkerRelay } from '../src/runtime/relay.ts';

const image = process.argv[2] ?? 'de-vloer-agent:1.18.30';
const transport = process.argv.includes('--pull') ? 'pull' : 'publish';
const relay = new WorkerRelay();
const relayServer = createServer(async (req, res) => { if (!(await relay.handle(req, res, new URL(req.url ?? '/', 'http://localhost')))) { res.writeHead(404); res.end(); } });
await new Promise(resolve => relayServer.listen(0, '127.0.0.1', resolve));
const directory = await mkdtemp(join(tmpdir(), 'vloer-docker-probe-'));
const exportRoot = join(directory, 'export');
const repositoryPath = join(exportRoot, 'source.git');
execFileSync('git', ['init', '--initial-branch=development', join(directory, 'work')], { stdio: 'ignore' });
await writeFile(join(directory, 'work', 'README.md'), 'Harmless protocol fixture.\n');
execFileSync('git', ['-C', join(directory, 'work'), 'add', 'README.md']);
execFileSync('git', ['-C', join(directory, 'work'), '-c', 'user.name=Probe', '-c', 'user.email=probe@localhost', 'commit', '-m', 'fixture'], { stdio: 'ignore' });
execFileSync('git', ['clone', '--bare', join(directory, 'work'), repositoryPath], { stdio: 'ignore' });
const expectedBase = execFileSync('git', ['-C', join(directory, 'work'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const freePort = () => new Promise(resolve => { const probe = createTcpServer(); probe.listen(0, '0.0.0.0', () => { const port = probe.address().port; probe.close(() => resolve(port)); }); });
const gitPort = await freePort();
const daemon = spawn('git', ['daemon', '--reuseaddr', '--export-all', `--base-path=${exportRoot}`, `--port=${gitPort}`, '--listen=0.0.0.0', '--verbose'], { stdio: ['ignore', 'ignore', 'pipe'] });
let daemonReady = false;
daemon.stderr.on('data', chunk => { if (String(chunk).includes('Ready to rumble')) daemonReady = true; });
for (let i = 0; i < 50 && !daemonReady; i++) await new Promise(resolve => setTimeout(resolve, 100));
let providerRequests = 0;
const sink = createServer((req, res) => { providerRequests++; res.writeHead(503); res.end('No inference permitted'); });
await new Promise(resolve => sink.listen(0, '0.0.0.0', resolve));
const repository = { id: 'fixture', name: 'Fixture', description: 'Probe fixture', url: `git://host.docker.internal:${gitPort}/source.git`, baseBranch: 'development', verify: ['node', '--test'] };
const config = {
  mode: 'live', dataDir: join(directory, 'state'), repositories: [repository],
  runtime: { kind: 'opencode', backend: 'docker', backends: ['docker'], timeoutMs: 60000, agentEnvironment: ['VLOER_PROBE_ALLOWED'] },
  docker: { image, cpus: 1, memoryMb: 1024, pidsLimit: 256, gatewayUrl: `http://host.docker.internal:${sink.address().port}/v1`, provisionTimeoutMs: 120000, transport, relayUrl: `http://host.docker.internal:${relayServer.address().port}` },
  models: [{ id: 'coding', name: 'Probe coding alias', providerId: 'litellm', modelId: 'probe-coding' }],
  litellm: { baseUrl: `http://127.0.0.1:${sink.address().port}/v1` },
};
const session = { id: 'docker-probe', title: 'Docker protocol probe', branch: 'vloer/docker-probe', placement: 'docker' };
const manager = new WorkspaceManager(config, { relay });
const transportFetch = () => manager.transport(workspace) ?? fetch;
let workspace;
const started = Date.now();
try {
  try { workspace = await manager.prepare(session, repository, { key: 'noncredential-probe-placeholder' }, new AbortController().signal); }
  catch (error) { console.error('prepare failed:', error.category, '\n' + (error.detail ?? error.message)); throw error; }
  const readyMs = Date.now() - started;
  assert.equal(workspace.backend, 'docker');
  assert.equal(workspace.directory, '/workspace/repository');
  assert.equal(workspace.metadata.baseSha, expectedBase, 'the clone container must report the fixture base commit');
  const inspect = JSON.parse(execFileSync('docker', ['inspect', workspace.metadata.container], { encoding: 'utf8' }))[0];
  assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(inspect.HostConfig.CapDrop, ['ALL']);
  assert.equal(inspect.HostConfig.Privileged, false);
  assert.equal(inspect.Config.Env.some(entry => entry.startsWith('LITELLM_MASTER_KEY=')), false);
  assert.equal(inspect.Config.Env.some(entry => entry.startsWith('VLOER_PROBE_ALLOWED=')), false, 'an allow-listed name absent from the server environment is not passed');
  if (transport === 'pull') { assert.deepEqual(inspect.HostConfig.PortBindings ?? {}, {}); assert.equal(workspace.endpoint, `relay://${session.id}`); } else assert.equal(inspect.HostConfig.PortBindings['4096/tcp'][0].HostIp, '127.0.0.1');
  const basic = manager.credentials(workspace);
  const headers = { authorization: 'Basic ' + Buffer.from(`${basic.username}:${basic.password}`).toString('base64'), 'content-type': 'application/json' };
  const request = async (path, method = 'GET', body) => {
    const url = new URL(path, transport === 'pull' ? 'http://workspace' : workspace.endpoint);
    url.searchParams.set('directory', workspace.directory);
    const response = await transportFetch()(url, { method, headers, redirect: 'error', body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    assert.equal(response.ok, true, `${method} ${path}: HTTP ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };
  const health = await request('/global/health');
  assert.equal(health.version, '1.18.30');
  assert.equal((await transportFetch()((transport === 'pull' ? 'http://workspace' : workspace.endpoint) + '/global/health')).status, 401);
  const nativeConfig = await request('/config');
  assert.equal(nativeConfig.model, 'litellm/probe-coding');
  assert.equal(nativeConfig.provider.litellm.options.apiKey, 'noncredential-probe-placeholder');
  assert.equal(nativeConfig.provider.litellm.options.baseURL, config.litellm.baseUrl);
  const providers = await request('/provider');
  assert.ok(providers.all.some(provider => provider.id === 'litellm' && provider.models['probe-coding']));
  const events = [];
  let interceptedPrompts = 0;
  const noInferenceFetch = async (input, init) => {
    if (new URL(String(input)).pathname.endsWith('/prompt_async')) { interceptedPrompts++; throw new Error('Probe stopped before inference submission'); }
    return fetch(input, init);
  };
  const guardedManager = Object.create(manager, { transport: { value: ws => { const inner = manager.transport(ws); return inner ? (input, init) => (new URL(String(input)).pathname.endsWith('/prompt_async') ? noInferenceFetch(input, init) : inner(input, init)) : undefined; } } });
  const runtime = new OpenCodeRuntime(config, guardedManager, noInferenceFetch);
  await assert.rejects(runtime.execute({ session, repository, workspace, run: { id: 'probe-run' }, role: { id: 'reviewer', name: 'Reviewer', mode: 'read' }, prompt: 'Protocol check only', signal: new AbortController().signal, emit: event => events.push(event) }), error => error.category === 'prompt_acceptance_unknown' && error.stage === 'prompt');
  assert.equal(interceptedPrompts, 1);
  const nativeId = events.find(event => event.type === 'native.session').data.nativeId;
  const created = await request('/session/' + nativeId);
  assert.equal(created.permission.find(rule => rule.permission === 'task').action, 'deny');
  const paths = ['/session/status', '/permission', '/question', `/session/${nativeId}/children`, `/session/${nativeId}/message`, `/session/${nativeId}/diff`];
  for (const path of paths) await request(path);
  const sse = await transportFetch()(new URL('/event?directory=' + encodeURIComponent(workspace.directory), transport === 'pull' ? 'http://workspace' : workspace.endpoint), { headers, signal: AbortSignal.timeout(5000) });
  assert.equal(sse.headers.get('content-type').startsWith('text/event-stream'), true);
  const reader = sse.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /server.connected/);
  await reader.cancel();
  await runtime.interrupt(workspace);
  await request('/session/' + nativeId, 'DELETE');
  const hostRepository = workspace.metadata.hostDirectory;
  await writeFile(join(hostRepository, 'PROBE.md'), 'Written on the host after the container cloned the fixture.\n');
  const candidate = await manager.captureCandidate({ ...session, workspace }, repository);
  assert.equal(candidate.status, 'ready', JSON.stringify(candidate));
  assert.equal(candidate.baseSha, expectedBase);
  assert.equal(candidate.fileCount, 1);
  const stopped = JSON.parse(execFileSync('docker', ['inspect', workspace.metadata.container], { encoding: 'utf8' }))[0].State.Running;
  assert.equal(stopped, false, 'capture must observe a stopped writer container');
  await manager.dispose(workspace);
  const remaining = execFileSync('docker', ['ps', '-a', '--filter', `name=${workspace.metadata.container}`, '--format', '{{.Names}}'], { encoding: 'utf8' }).trim();
  assert.equal(remaining, '');
  assert.equal(providerRequests, 0);
  console.log(JSON.stringify({ image, transport, version: health.version, readyMs, cloneInsideContainer: true, baseShaMatched: true, hardenedHostConfig: true, masterKeyAbsent: true, unauthenticatedDenied: true, managedConfigParsed: true, providerAliasRegistered: true, adapterNativeSessionCreated: true, readPermissionAccepted: true, reconciliationEndpoints: paths, eventStreamConnected: true, nativeAbortAccepted: true, candidateCaptured: candidate.status, containerRemoved: true, inferenceRequests: providerRequests, promptSubmissionsPrevented: interceptedPrompts }));
} finally {
  if (workspace) await manager.dispose(workspace).catch(() => {});
  daemon.kill('SIGTERM');
  await new Promise(resolve => sink.close(resolve));
  await new Promise(resolve => relayServer.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
