import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, placements } from '../src/config.ts';

const base = {
  mode: 'live', dataDir: '.vloer-test',
  models: [{ id: 'coding', name: 'Coding', providerId: 'gateway', modelId: 'coding' }],
  repositories: [{ id: 'app', name: 'App', description: '', url: 'https://forge.example/app.git', baseBranch: 'main', verify: ['npm', 'test'] }],
};

async function load(t: test.TestContext, value: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-config-'));
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
  const config = await load(t, { runtime: { kind: 'opencode', backends: ['docker', 'local'], timeoutMs: 60000, agentEnvironment: ['FORGE_READ_TOKEN'] }, docker: { image: 'de-vloer-agent:1.18.30', memoryMb: 1024 } });
  assert.equal(config.runtime.backend, 'docker');
  assert.deepEqual(config.runtime.backends, ['docker', 'local']);
  assert.equal(config.docker?.image, 'de-vloer-agent:1.18.30');
  assert.equal(config.docker?.memoryMb, 1024);
  assert.equal(config.docker?.cpus, 2);
  assert.deepEqual(config.runtime.agentEnvironment, ['FORGE_READ_TOKEN']);
  assert.deepEqual(placements(config).map(item => [item.id, item.default]), [['docker', true], ['local', false]]);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['docker'], timeoutMs: 60000 } }), /docker\.image/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['kubernetes'], timeoutMs: 60000 } }), /kubernetes configuration block/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['cloud'], timeoutMs: 60000 } }), /runtime\.backends/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['local'], timeoutMs: 60000, agentEnvironment: ['LITELLM_MASTER_KEY'] } }), /must not pass LITELLM_MASTER_KEY/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['local'], timeoutMs: 60000, agentEnvironment: ['lower'] } }), /uppercase/);
  await assert.rejects(load(t, { runtime: { kind: 'opencode', backends: ['docker'], timeoutMs: 60000 }, docker: { image: 'de-vloer-agent:1.18.30', user: 'root' } }), /docker\.user/);
});

test('gatewayPolicy lists providers and regions as lowercase names', async () => {
  const { loadConfig } = await import('../src/config.ts');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'vloer-policy-'));
  try {
    const base = { mode: 'demo', dataDir: dir, publicDir: new URL('../public', import.meta.url).pathname };
    await writeFile(join(dir, 'ok.json'), JSON.stringify({ ...base, gatewayPolicy: { providers: ['anthropic', 'fireworks_ai'], regions: ['eu'] } }));
    process.env.VLOER_CONFIG = join(dir, 'ok.json');
    assert.deepEqual(loadConfig([]).gatewayPolicy, { providers: ['anthropic', 'fireworks_ai'], regions: ['eu'] });
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ ...base, gatewayPolicy: { providers: ['Anthropic Inc'] } }));
    process.env.VLOER_CONFIG = join(dir, 'bad.json');
    assert.throws(() => loadConfig([]), /gatewayPolicy.providers/);
  } finally { delete process.env.VLOER_CONFIG; await rm(dir, { recursive: true, force: true }); }
});

test('observability names a Grafana, dashboards by uid and datasources by uid', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'vloer-observability-'));
  try {
    const base = { mode: 'demo', dataDir: dir, publicDir: new URL('../public', import.meta.url).pathname };
    await writeFile(join(dir, 'ok.json'), JSON.stringify({ ...base, observability: { grafanaUrl: 'https://grafana.example/', dashboards: { spend: 'litellm' }, tracesDatasource: 'victoriatraces' } }));
    assert.deepEqual(loadConfig(['--config', join(dir, 'ok.json')]).observability, { grafanaUrl: 'https://grafana.example', dashboards: { spend: 'litellm' }, tracesDatasource: 'victoriatraces' });
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ ...base, observability: { grafanaUrl: 'https://grafana.example', dashboards: { spend: 'not a uid' } } }));
    assert.throws(() => loadConfig(['--config', join(dir, 'bad.json')]), /observability.dashboards/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
