import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, configuration, login, request } from './api-support.ts';
import { connect, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { customizationRefusal, gatewayCustomizationId, gatewayToolCall, pluginRefusal, readOnlyRefusal, rootConfigRefusal, sessionCustomizations, type GatewaySubject } from '../src/ahp/customizations.ts';
import { testTimeout } from './timeframes.ts';
import type { AppConfig } from '../src/types.ts';

const gatewayBase = 'http://gateway.internal.example:4000/v1';
const mcp = { litellmTeamId: 'agents-orders', accessGroups: ['observability-read-orders'] };

function gatewayConfig(change?: (config: AppConfig) => void): AppConfig {
  const config = configuration('/nonexistent', 'live');
  config.repositories = config.repositories.map(repository => ({ ...repository, mcp }));
  config.litellm = { baseUrl: gatewayBase, adminUrl: gatewayBase, masterKey: '', models: ['coding'], ttl: '1h' };
  change?.(config);
  return config;
}

const subject = (change: Partial<GatewaySubject> = {}): GatewaySubject => ({ repositoryId: 'order-service', runtime: 'opencode', status: 'running', ...change });

test('a session whose repository grants gateway tools shows one managed, top-level MCP server that follows the Run and carries no address or credential', () => {
  const config = gatewayConfig();
  const [server] = sessionCustomizations(config, subject(), 'abc', []);
  assert.equal(server.type, 'mcpServer');
  assert.equal(server.id, 'mcp-top-level:unfold:abc:litellm');
  assert.equal(server.uri, server.id, 'an mcp-top-level URI, so VS Code offers no source file to open');
  assert.equal(server.name, 'litellm');
  assert.deepEqual(server.state, { kind: 'ready' });
  assert.equal(server.enablement, undefined, 'no explicit decision: enabled');
  assert.equal(server.channel, undefined, 'no side channel: a client cannot call the tools through the host');
  assert.equal(server._meta['agentHost.mcpServerSource'], 'managed');
  assert.equal(server._meta['vscode.mcpServerDisplayName'], 'Gateway tools (observability-read-orders)');
  assert.deepEqual(server._meta['dev.webgrip.unfold'], { source: 'repository', repository: 'order-service', team: 'agents-orders', accessGroups: ['observability-read-orders'], keyScope: 'repository', clientControl: false });
  const serialized = JSON.stringify(server);
  for (const leak of ['gateway.internal.example', 'x-litellm-api-key', 'LITELLM_API_KEY', 'Bearer']) assert.ok(!serialized.includes(leak), `the advertisement does not carry ${leak}`);

  assert.deepEqual(sessionCustomizations(config, subject({ status: undefined }), 'abc', [])[0].state, { kind: 'starting' }, 'a session that has not started yet');
  assert.deepEqual(sessionCustomizations(config, subject({ status: 'queued' }), 'abc', [])[0].state, { kind: 'starting' });
  for (const status of ['waiting_input', 'exporting'] as const) assert.deepEqual(sessionCustomizations(config, subject({ status }), 'abc', [])[0].state, { kind: 'ready' });
  for (const status of ['paused', 'interrupted', 'completed', 'failed', 'cancelled'] as const) assert.deepEqual(sessionCustomizations(config, subject({ status }), 'abc', [])[0].state, { kind: 'stopped' });
});

test('no MCP server is shown where the agent is not configured with one: no grant, no gateway, the demo, the command adapter or an external OpenCode', () => {
  assert.deepEqual(sessionCustomizations(gatewayConfig(config => { config.repositories = config.repositories.map(({ mcp: _, ...repository }) => repository); }), subject(), 'abc', []), []);
  assert.deepEqual(sessionCustomizations(gatewayConfig(config => { delete config.litellm; }), subject(), 'abc', []), []);
  assert.deepEqual(sessionCustomizations(gatewayConfig(), subject({ runtime: 'demo' }), 'abc', []), []);
  assert.deepEqual(sessionCustomizations(gatewayConfig(), subject({ runtime: 'command' }), 'abc', []), []);
  assert.deepEqual(sessionCustomizations(gatewayConfig(config => { config.runtime = { ...config.runtime, backend: 'external' }; }), subject(), 'abc', []), []);
  assert.deepEqual(sessionCustomizations(gatewayConfig(), subject({ repositoryId: 'unknown' }), 'abc', []), []);
});

test('under Ploeg the server says that the key Ploeg mints is not scoped to the repository\'s access groups, until the session ends', () => {
  const execution = { id: 'x', workItemId: 'w', team: 't', state: 'running', revision: 1, generation: 1, supervision: 'human' as const, expiresAt: new Date().toISOString(), stopConfirmed: false };
  const [server] = sessionCustomizations(gatewayConfig(), subject({ execution }), 'abc', []);
  assert.equal(server.state.kind, 'error');
  assert.equal(server.state.error.errorType, 'gateway_key_unscoped');
  assert.match(server.state.error.message, /VIK-1934/);
  assert.equal(server._meta['dev.webgrip.unfold'].keyScope, 'ploeg');
  const owned = gatewayConfig(config => { config.repositories = config.repositories.map(repository => ({ ...repository, executionOwner: 'ploeg' })); });
  assert.equal(sessionCustomizations(owned, subject({ status: undefined }), 'abc', [])[0].state.kind, 'error', 'a repository Ploeg executes, before its session is bound');
  assert.deepEqual(sessionCustomizations(owned, subject({ status: 'completed' }), 'abc', [])[0].state, { kind: 'stopped' });
});

test('plugins a client publishes are listed as refused, with the reason, and never loaded', () => {
  const plugin = { type: 'plugin', id: 'p1', uri: 'file:///Users/operator/.vscode/agent-plugins/review', name: 'review', nonce: 'n1' };
  const clients = [
    { clientId: 'vscode-1', tools: [], customizations: [plugin, { ...plugin }, { type: 'plugin', id: 'p2', name: 'no uri' }, null] },
    { clientId: 'other', tools: [] },
  ];
  const listed = sessionCustomizations(gatewayConfig(), subject(), 'abc', clients);
  assert.deepEqual(listed.map(entry => entry.id), [gatewayCustomizationId('abc'), 'p1'], 'the gateway server first, then each valid plugin once');
  assert.deepEqual(listed[1], { type: 'plugin', id: 'p1', uri: plugin.uri, name: 'review', clientId: 'vscode-1', load: { kind: 'error', message: pluginRefusal }, children: [] });
  const many = Array.from({ length: 100 }, (_, index) => ({ ...plugin, id: `p${index}` }));
  assert.equal(sessionCustomizations(gatewayConfig(), subject({ runtime: 'demo' }), 'abc', [{ clientId: 'c', customizations: many }]).length, 64);
});

test('a tool OpenCode names after the gateway server is attributed to it; others are not', () => {
  assert.deepEqual(gatewayToolCall(gatewayConfig(), subject(), 'abc', 'litellm_search_logs'), { contributor: { kind: 'mcp', customizationId: 'mcp-top-level:unfold:abc:litellm' }, _meta: { mcpServerName: 'litellm', mcpToolName: 'search_logs' } });
  assert.equal(gatewayToolCall(gatewayConfig(), subject(), 'abc', 'bash'), undefined);
  assert.equal(gatewayToolCall(gatewayConfig(), subject(), 'abc', 'litellm_'), undefined);
  assert.equal(gatewayToolCall(gatewayConfig(), subject({ runtime: 'demo' }), 'abc', 'litellm_search_logs'), undefined);
});

test('the refusals: client control of MCP servers, and a plugin list in the root configuration', () => {
  for (const type of ['session/customizationToggled', 'session/mcpServerStartRequested', 'session/mcpServerStopRequested', 'session/mcpServerBackgroundRequested']) assert.equal(customizationRefusal(type), readOnlyRefusal);
  assert.equal(customizationRefusal('chat/turnStarted'), undefined);
  assert.equal(rootConfigRefusal({ customizations: [{ uri: 'file:///opt/plugins/x', displayName: 'x' }] }), pluginRefusal);
  assert.equal(rootConfigRefusal({ customizations: [] }), undefined, 'removing the last plugin is harmless');
  assert.equal(rootConfigRefusal({ trustedUris: ['file:///a'] }), undefined);
  assert.equal(rootConfigRefusal(undefined), undefined);
});

test('VS Code sees the gateway server in a session, is refused Add Remote Plugin and server control, and sees its own plugins listed as refused', { timeout: testTimeout(60_000) }, async t => {
  const server = await application('live', config => {
    config.repositories = config.repositories.map(repository => ({ ...repository, mcp }));
    config.litellm = { baseUrl: gatewayBase, adminUrl: gatewayBase, masterKey: '', models: ['coding'], ttl: '1h' };
  });
  t.after(() => server.close());
  const auth = await login(server.url);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: auth.cookie, body: { label: 'VS Code' } });
  assert.equal(issued.status, 201, issued.text);
  const vscode = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => vscode.close());
  await vscode.open;
  const clientId = randomUUID();
  await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, clientInfo: vscodeAgentsWindow, initialSubscriptions: ['ahp-root://'] });
  let seq = 0;
  const dispatch = (channel: string, action: Json) => { const clientSeq = ++seq; vscode.notify('dispatchAction', { channel, clientSeq, action }); return vscode.until(message => message.method === 'action' && message.params.origin?.clientSeq === clientSeq); };

  const added = await dispatch('ahp-root://', { type: 'root/configChanged', config: { customizations: [{ uri: 'agenthost://unfold/file/-/unfold-repositories/x', displayName: 'x' }] } });
  assert.equal(added.params.rejectionReason, pluginRefusal, 'Add Remote Plugin is refused, so VS Code does not list a plugin that would never load');
  assert.equal((await dispatch('ahp-root://', { type: 'root/configChanged', config: { trustedUris: ['file:///Users/operator/projects'] } })).params.rejectionReason, undefined);

  const session = `unfold:/${randomUUID()}`;
  await vscode.rpc('createSession', { channel: session, provider: 'unfold', config: { repository: 'order-service', crew: 'delivery', budgetUsd: 1, title: 'Gateway tools' } });
  const state = (await vscode.rpc('subscribe', { channel: session })).snapshot.state;
  const id = gatewayCustomizationId(session.slice('unfold:/'.length));
  assert.deepEqual(state.customizations.map((entry: Json) => [entry.type, entry.id, entry.state?.kind]), [['mcpServer', id, 'starting']]);
  assert.ok(!JSON.stringify(state).includes('gateway.internal.example'), 'the gateway address stays on the server');

  for (const type of ['session/mcpServerStartRequested', 'session/mcpServerStopRequested']) assert.equal((await dispatch(session, { type, id })).params.rejectionReason, readOnlyRefusal);
  assert.equal((await dispatch(session, { type: 'session/customizationToggled', id, enablement: [{ kind: 'session', enabled: false }] })).params.rejectionReason, readOnlyRefusal);

  const plugin = { type: 'plugin', id: 'local-review', uri: 'file:///Users/operator/.vscode/agent-plugins/review', name: 'review', nonce: '1' };
  const set = await dispatch(session, { type: 'session/activeClientSet', activeClient: { clientId, tools: [], customizations: [plugin] } });
  assert.equal(set.params.rejectionReason, undefined, 'the client may say what it has');
  const changed = await vscode.until(message => message.method === 'action' && message.params.channel === session && message.params.action.type === 'session/customizationsChanged');
  assert.deepEqual(changed.params.action.customizations.map((entry: Json) => [entry.id, entry.load?.message]), [[id, undefined], ['local-review', pluginRefusal]]);
  assert.equal((await vscode.rpc('subscribe', { channel: session })).snapshot.state.customizations.length, 2, 'a fresh snapshot lists the same');
});

test('a pending session with a placement the workbench does not offer shows no server rather than failing its snapshot', () => {
  assert.deepEqual(sessionCustomizations(gatewayConfig(), subject({ status: undefined, placement: 'kubernetes' }), 'abc', []), []);
});
