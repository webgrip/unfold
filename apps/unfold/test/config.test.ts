import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, placements } from '../src/config.ts';

const base = {
  mode: 'live', dataDir: '.unfold-test',
  models: [{ id: 'coding', name: 'Coding', providerId: 'gateway', modelId: 'coding' }],
  repositories: [{ id: 'app', name: 'App', description: '', url: 'https://forge.example/app.git', baseBranch: 'main', verify: ['npm', 'test'] }],
};

async function load(t: test.TestContext, value: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'config.json');
  await writeFile(file, JSON.stringify({ ...base, dataDir: join(directory, 'data'), ...value }));
  return loadConfig(['--config', file]);
}

test('live configuration rejects an external OpenCode endpoint that could never receive a session credential', async t => {
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backend: 'external', endpoint: 'https://opencode.example', timeoutMs: 60000 } }), /external OpenCode endpoint, which cannot run a live session/);
  const previous = process.env.OPENCODE_URL;
  process.env.OPENCODE_URL = 'https://opencode.example';
  t.after(() => { if (previous === undefined) delete process.env.OPENCODE_URL; else process.env.OPENCODE_URL = previous; });
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backend: 'local', timeoutMs: 60000 } }), /^Error: OPENCODE_URL selects an external OpenCode endpoint/);
});

test('a single backend keeps its previous shape and becomes the only placement', async t => {
  const config = await load(t, { runtime: { kind: 'opencode', backend: 'local', binary: 'opencode', timeoutMs: 60000 } });
  assert.deepEqual(config.runtime.backends, ['local']);
  assert.equal(config.docker, undefined);
  assert.deepEqual(placements(config).map(item => item.id), ['local']);
});

test('docker and kubernetes placements require their configuration blocks and the first listed backend becomes the default', async t => {
  const config = await load(t, { runtime: { kind: 'opencode', backends: ['docker', 'local'], timeoutMs: 60000, agentEnvironment: ['FORGE_READ_TOKEN'] }, docker: { image: 'unfold-agent:1.18.30', memoryMb: 1024 } });
  assert.equal(config.runtime.backend, 'docker');
  assert.deepEqual(config.runtime.backends, ['docker', 'local']);
  assert.equal(config.docker?.image, 'unfold-agent:1.18.30');
  assert.equal(config.docker?.memoryMb, 1024);
  assert.equal(config.docker?.cpus, 2);
  assert.deepEqual(config.runtime.agentEnvironment, ['FORGE_READ_TOKEN']);
  assert.deepEqual(placements(config).map(item => [item.id, item.default]), [['docker', true], ['local', false]]);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['docker'], timeoutMs: 60000 } }), /docker\.image/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['kubernetes'], timeoutMs: 60000 } }), /kubernetes configuration block/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['cloud'], timeoutMs: 60000 } }), /runtime\.backends/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['local'], timeoutMs: 60000, agentEnvironment: ['LITELLM_MASTER_KEY'] } }), /must not pass LITELLM_MASTER_KEY/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['local'], timeoutMs: 60000, agentEnvironment: ['lower'] } }), /uppercase/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['docker'], timeoutMs: 60000 }, docker: { image: 'unfold-agent:1.18.30', user: 'root' } }), /docker\.user/);
});

test('gatewayPolicy lists providers and regions as lowercase names', async () => {
  const { loadConfig } = await import('../src/config.ts');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'unfold-policy-'));
  try {
    const base = { mode: 'demo', dataDir: dir, publicDir: new URL('../public', import.meta.url).pathname };
    await writeFile(join(dir, 'ok.json'), JSON.stringify({ ...base, gatewayPolicy: { providers: ['anthropic', 'fireworks_ai'], regions: ['eu'] } }));
    process.env.UNFOLD_CONFIG = join(dir, 'ok.json');
    assert.deepEqual(loadConfig([]).gatewayPolicy, { providers: ['anthropic', 'fireworks_ai'], regions: ['eu'] });
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ ...base, gatewayPolicy: { providers: ['Anthropic Inc'] } }));
    process.env.UNFOLD_CONFIG = join(dir, 'bad.json');
    assert.throws(() => loadConfig([]), /gatewayPolicy.providers/);
  } finally { delete process.env.UNFOLD_CONFIG; await rm(dir, { recursive: true, force: true }); }
});

test('observability names a Grafana, dashboards by uid and datasources by uid', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'unfold-observability-'));
  try {
    const base = { mode: 'demo', dataDir: dir, publicDir: new URL('../public', import.meta.url).pathname };
    await writeFile(join(dir, 'ok.json'), JSON.stringify({ ...base, observability: { grafanaUrl: 'https://grafana.example/', dashboards: { spend: 'litellm' }, tracesDatasource: 'victoriatraces' } }));
    assert.deepEqual(loadConfig(['--config', join(dir, 'ok.json')]).observability, { grafanaUrl: 'https://grafana.example', dashboards: { spend: 'litellm' }, tracesDatasource: 'victoriatraces' });
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ ...base, observability: { grafanaUrl: 'https://grafana.example', dashboards: { spend: 'not a uid' } } }));
    assert.throws(() => loadConfig(['--config', join(dir, 'bad.json')]), /observability.dashboards/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an OIDC subject namespace is kept without its trailing slash, and an empty one is refused', async t => {
  const oidc = { issuer: 'https://auth.example/application/o/unfold/', clientId: 'unfold' };
  assert.equal((await load(t, { auth: { oidc } })).auth.oidc!.subjectNamespace, undefined);
  assert.equal((await load(t, { auth: { oidc: { ...oidc, subjectNamespace: 'https://auth.example/application/o/vloer/' } } })).auth.oidc!.subjectNamespace, 'https://auth.example/application/o/vloer');
  await assert.rejects(load(t, { auth: { oidc: { ...oidc, subjectNamespace: ' ' } } }), /auth.oidc.subjectNamespace must be a non-empty string/);
});

test('the insight export defaults off, needs a collector URL for faro and otlp, and takes an aggregate or events level', async t => {
  const keys = ['UNFOLD_INSIGHT_EXPORT', 'UNFOLD_INSIGHT_EXPORT_URL', 'UNFOLD_INSIGHT_EXPORT_LEVEL'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  for (const key of keys) delete process.env[key];
  assert.equal((await load(t, {})).insight, undefined, 'off with no URL leaves the sink unset');
  process.env.UNFOLD_INSIGHT_EXPORT = 'faro';
  process.env.UNFOLD_INSIGHT_EXPORT_URL = 'http://alloy-gateway.observability.svc.cluster.local:12347/collect';
  assert.deepEqual((await load(t, {})).insight, { export: 'faro', url: 'http://alloy-gateway.observability.svc.cluster.local:12347/collect', level: 'aggregate' });
  process.env.UNFOLD_INSIGHT_EXPORT_LEVEL = 'events';
  assert.equal((await load(t, {})).insight?.level, 'events');
  process.env.UNFOLD_INSIGHT_EXPORT = 'otlp';
  assert.equal((await load(t, {})).insight?.export, 'otlp');
  delete process.env.UNFOLD_INSIGHT_EXPORT_URL;
  await assert.rejects(load(t, {}), /UNFOLD_INSIGHT_EXPORT_URL is required/);
  process.env.UNFOLD_INSIGHT_EXPORT_URL = 'http://collector.example/collect';
  process.env.UNFOLD_INSIGHT_EXPORT = 'console';
  await assert.rejects(load(t, {}), /UNFOLD_INSIGHT_EXPORT must be off, faro or otlp/);
  process.env.UNFOLD_INSIGHT_EXPORT = 'faro';
  process.env.UNFOLD_INSIGHT_EXPORT_LEVEL = 'every';
  await assert.rejects(load(t, {}), /UNFOLD_INSIGHT_EXPORT_LEVEL must be aggregate or events/);
});

test('product events are recorded unless UNFOLD_INSIGHT_EVENTS is off', async t => {
  const previous = process.env.UNFOLD_INSIGHT_EVENTS;
  t.after(() => { if (previous === undefined) delete process.env.UNFOLD_INSIGHT_EVENTS; else process.env.UNFOLD_INSIGHT_EVENTS = previous; });
  delete process.env.UNFOLD_INSIGHT_EVENTS;
  assert.equal((await load(t, {})).productEvents, true);
  process.env.UNFOLD_INSIGHT_EVENTS = 'off';
  assert.equal((await load(t, {})).productEvents, false);
  process.env.UNFOLD_INSIGHT_EVENTS = 'sometimes';
  await assert.rejects(load(t, {}), /UNFOLD_INSIGHT_EVENTS must be on or off/);
});

test('a repository opts into gateway MCP tools with one LiteLLM team and its access groups, and is off by default', async t => {
  const runtime = { kind: 'opencode', backend: 'local', timeoutMs: 60000 };
  const gateway = { baseUrl: 'https://gateway.example/v1' };
  const mcp = { litellmTeamId: 'agents-orders', accessGroups: ['observability-read-orders'] };
  assert.equal((await load(t, { runtime, litellm: gateway })).repositories[0].mcp, undefined);
  const config = await load(t, { runtime, litellm: gateway, repositories: [{ ...base.repositories[0], mcp }] });
  assert.deepEqual(config.repositories[0].mcp, mcp);
  for (const invalid of [{}, { litellmTeamId: 'agents-orders' }, { ...mcp, accessGroups: [] }, { ...mcp, accessGroups: ['a', 'a'] }, { ...mcp, accessGroups: ['bad group'] }, { ...mcp, litellmTeamId: '' }, { ...mcp, tools: ['*'] }, ['agents-orders']]) {
    await assert.rejects(load(t, { runtime, litellm: gateway, repositories: [{ ...base.repositories[0], mcp: invalid }] }), /mcp requires litellmTeamId/);
  }
  if (!process.env.LITELLM_BASE_URL) await assert.rejects(load(t, { runtime, repositories: [{ ...base.repositories[0], mcp }] }), /LiteLLM gateway base URL/);
});
