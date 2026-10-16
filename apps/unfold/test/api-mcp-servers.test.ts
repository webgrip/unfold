import test from 'node:test';
import assert from 'node:assert/strict';
import { application, login, request } from './api-support.ts';
import { mcpServerSettings } from '../src/config.ts';

const keys = ['UNFOLD_PLOEG_MCP_URL', 'UNFOLD_PLOEG_MCP_CLIENT_ID'] as const;

function withEnvironment(t: test.TestContext, values: Partial<Record<typeof keys[number], string>>) {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  for (const key of keys) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
}

test('GET /api/mcp-servers names the remote ploeg-mcp by URL and public client id, and nothing that signs in', async t => {
  const app = await application('live', config => { config.mcpServers = { ploeg: { url: 'https://mcp-ploeg.example.com/mcp', clientId: 'ploeg-mcp' } }; });
  t.after(() => app.close());
  const { cookie } = await login(app.url);

  const listed = await request(app.url, '/api/mcp-servers', { cookie });

  assert.equal(listed.status, 200, listed.text);
  assert.deepEqual(listed.body, { servers: [{ id: 'ploeg', label: 'Ploeg', type: 'http', url: 'https://mcp-ploeg.example.com/mcp', oauth: { clientId: 'ploeg-mcp' } }] });
  assert.doesNotMatch(listed.text, /headers|token|secret|env/i);
});

test('GET /api/mcp-servers lists nothing when the deployment names no ploeg-mcp', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const { cookie } = await login(app.url);

  const listed = await request(app.url, '/api/mcp-servers', { cookie });

  assert.equal(listed.status, 200, listed.text);
  assert.deepEqual(listed.body, { servers: [] });
});

test('GET /api/mcp-servers requires a signed-in person', async t => {
  const app = await application('live', config => { config.mcpServers = { ploeg: { url: 'https://mcp-ploeg.example.com/mcp', clientId: 'ploeg-mcp' } }; });
  t.after(() => app.close());

  const anonymous = await request(app.url, '/api/mcp-servers');

  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error.code, 'unauthenticated');
  assert.doesNotMatch(anonymous.text, /mcp-ploeg/);
});

test('the ploeg-mcp settings are both set or both unset, with no default domain', t => {
  withEnvironment(t, {});
  assert.equal(mcpServerSettings(), undefined);

  withEnvironment(t, { UNFOLD_PLOEG_MCP_URL: 'https://mcp-ploeg.example.com/mcp', UNFOLD_PLOEG_MCP_CLIENT_ID: 'ploeg-mcp' });
  assert.deepEqual(mcpServerSettings(), { ploeg: { url: 'https://mcp-ploeg.example.com/mcp', clientId: 'ploeg-mcp' } });

  withEnvironment(t, { UNFOLD_PLOEG_MCP_URL: 'https://mcp-ploeg.example.com/mcp' });
  assert.throws(() => mcpServerSettings(), /must be set together/);

  withEnvironment(t, { UNFOLD_PLOEG_MCP_CLIENT_ID: 'ploeg-mcp' });
  assert.throws(() => mcpServerSettings(), /must be set together/);
});

test('the ploeg-mcp URL is HTTPS without credentials, kept byte for byte, and the client id is a plain identifier', t => {
  withEnvironment(t, { UNFOLD_PLOEG_MCP_URL: 'https://mcp-ploeg.example.com/mcp/', UNFOLD_PLOEG_MCP_CLIENT_ID: 'ploeg-mcp' });
  assert.equal(mcpServerSettings()?.ploeg?.url, 'https://mcp-ploeg.example.com/mcp/');

  withEnvironment(t, { UNFOLD_PLOEG_MCP_URL: 'http://127.0.0.1:8090/mcp', UNFOLD_PLOEG_MCP_CLIENT_ID: 'ploeg-mcp' });
  assert.equal(mcpServerSettings()?.ploeg?.url, 'http://127.0.0.1:8090/mcp');

  for (const url of ['http://mcp-ploeg.example.com/mcp', 'https://user:pass@mcp-ploeg.example.com/mcp', 'https://mcp-ploeg.example.com/mcp?token=x', 'not a url']) {
    withEnvironment(t, { UNFOLD_PLOEG_MCP_URL: url, UNFOLD_PLOEG_MCP_CLIENT_ID: 'ploeg-mcp' });
    assert.throws(() => mcpServerSettings(), /UNFOLD_PLOEG_MCP_URL/, url);
  }

  withEnvironment(t, { UNFOLD_PLOEG_MCP_URL: 'https://mcp-ploeg.example.com/mcp', UNFOLD_PLOEG_MCP_CLIENT_ID: 'ploeg mcp' });
  assert.throws(() => mcpServerSettings(), /UNFOLD_PLOEG_MCP_CLIENT_ID/);
});
