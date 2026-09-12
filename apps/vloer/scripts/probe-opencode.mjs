import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { WorkspaceManager } from '../src/runtime/workspace.ts';
import { OpenCodeRuntime } from '../src/runtime/opencode.ts';

const directory = await mkdtemp(join(tmpdir(), 'vloer-native-probe-'));
const repositoryPath = join(directory, 'source');
execFileSync('git', ['init', '--initial-branch=development', repositoryPath], { stdio: 'ignore' });
await writeFile(join(repositoryPath, 'README.md'), 'Harmless protocol fixture.\n');
execFileSync('git', ['-C', repositoryPath, 'add', 'README.md']);
execFileSync('git', ['-C', repositoryPath, '-c', 'user.name=Probe', '-c', 'user.email=probe@localhost', 'commit', '-m', 'fixture'], { stdio: 'ignore' });
let providerRequests = 0;
const sink = createServer((req, res) => { providerRequests++; res.writeHead(503); res.end('No inference permitted'); });
await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
const repository = { id: 'fixture', name: 'Fixture', url: repositoryPath, baseBranch: 'development', verify: ['node', '--test'] };
const config = {
  dataDir: join(directory, 'state'), repositories: [repository],
  runtime: { kind: 'opencode', backend: 'local', binary: process.argv[2] ?? 'opencode', timeoutMs: 60000 },
  models: [{ id: 'coding', name: 'Probe coding alias', providerId: 'litellm', modelId: 'probe-coding' }],
  litellm: { baseUrl: `http://127.0.0.1:${sink.address().port}/v1` },
};
const session = { id: 'native-probe', title: 'Protocol probe', branch: 'vloer/probe' };
const manager = new WorkspaceManager(config);
let workspace;
try {
  workspace = await manager.prepare(session, repository, { key: 'noncredential-probe-placeholder' }, new AbortController().signal);
  const basic = manager.credentials(workspace);
  const headers = { authorization: 'Basic ' + Buffer.from(`${basic.username}:${basic.password}`).toString('base64'), 'content-type': 'application/json' };
  const request = async (path, method = 'GET', body) => {
    const url = new URL(path, workspace.endpoint);
    url.searchParams.set('directory', workspace.directory);
    const response = await fetch(url, { method, headers, redirect: 'error', body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    assert.equal(response.ok, true, `${method} ${path}: HTTP ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };
  const health = await request('/global/health');
  assert.equal(health.version, '1.18.30');
  assert.equal((await fetch(workspace.endpoint + '/global/health')).status, 401);
  const nativeConfig = await request('/config');
  assert.equal(nativeConfig.model, 'litellm/probe-coding');
  assert.equal(nativeConfig.small_model, 'litellm/probe-coding');
  assert.deepEqual(nativeConfig.enabled_providers, ['litellm']);
  assert.equal(nativeConfig.share, 'disabled');
  assert.equal(nativeConfig.autoupdate, false);
  assert.equal(nativeConfig.provider.litellm.npm, '@ai-sdk/openai-compatible');
  assert.equal(nativeConfig.provider.litellm.options.apiKey, 'noncredential-probe-placeholder');
  const providers = await request('/provider');
  assert.ok(providers.all.some(provider => provider.id === 'litellm' && provider.models['probe-coding']));
  const events = [];
  let interceptedPrompts = 0;
  const noInferenceFetch = async (input, init) => {
    if (new URL(String(input)).pathname.endsWith('/prompt_async')) { interceptedPrompts++; throw new Error('Probe stopped before inference submission'); }
    return fetch(input, init);
  };
  const runtime = new OpenCodeRuntime(config, manager, noInferenceFetch);
  await assert.rejects(runtime.execute({ session, repository, workspace, run: { id: 'probe-run' }, role: { id: 'reviewer', name: 'Reviewer', mode: 'read' }, prompt: 'Protocol check only', signal: new AbortController().signal, emit: event => events.push(event) }), error => error.category === 'prompt_acceptance_unknown' && error.stage === 'prompt');
  assert.equal(interceptedPrompts, 1);
  const nativeId = events.find(event => event.type === 'native.session').data.nativeId;
  const created = await request('/session/' + nativeId);
  assert.equal(created.permission.find(rule => rule.permission === 'task').action, 'deny');
  const paths = ['/session/status', '/permission', '/question', `/session/${nativeId}/children`, `/session/${nativeId}/message`, `/session/${nativeId}/diff`];
  for (const path of paths) await request(path);
  const sse = await fetch(new URL('/event?directory=' + encodeURIComponent(workspace.directory), workspace.endpoint), { headers, signal: AbortSignal.timeout(5000) });
  assert.equal(sse.headers.get('content-type').startsWith('text/event-stream'), true);
  const reader = sse.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /server.connected/);
  await reader.cancel();
  await runtime.interrupt(workspace);
  await request('/session/' + nativeId, 'DELETE');
  assert.equal(providerRequests, 0);
  console.log(JSON.stringify({ version: health.version, health: 'passed', unauthenticatedDenied: true, managedConfigParsed: true, providerAliasRegistered: true, adapterNativeSessionCreated: true, readPermissionAccepted: true, reconciliationEndpoints: paths, eventStreamConnected: true, nativeAbortAccepted: true, cleanupAccepted: true, inferenceRequests: providerRequests, promptSubmissionsPrevented: interceptedPrompts }));
} finally {
  if (workspace) await manager.dispose(workspace);
  await new Promise(resolve => sink.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
