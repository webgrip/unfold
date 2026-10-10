import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth.ts';
import { application, login, request } from './api-support.ts';
import { action, connect, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';

const password = 'automation-password-271828';
const catalogue = 'ahp-automations://';

async function ploegServer(t: TestContext, bearer: string, state: { teams: Json[] }): Promise<string> {
  const server = createServer((req, res) => {
    const send = (value: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...value as object }));
    if (req.headers.authorization !== `Bearer ${bearer}` || req.method !== 'GET') return send({}, 401);
    if (new URL(req.url!, 'http://fixture.invalid').pathname === '/api/v1/operator/teams') return send({ teams: state.teams });
    return send({}, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

const team = (id: string, assignees: string[], pinnedScopes: string[] = [], paused = false) => ({ id, paused, queueDepth: 1, roles: [{ id: 'implementer', queueDepth: 1 }], assignees, pinnedScopes });

async function fixture(t: TestContext) {
  const env = `UNFOLD_AUTOMATIONS_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  t.after(() => { delete process.env[env]; });
  const state = { teams: [team('silver', ['silver']), team('bronze', ['bronze']), team('unfold', []), team('gold', ['gold'], ['77'])] };
  const ploeg = await ploegServer(t, bearer, state);
  const server = await application('live', config => {
    const tracker = { provider: 'vikunja' as const, baseUrl: 'http://tracker.invalid/api/v1', repositoryId: 'order-service', token: randomBytes(12).toString('hex') };
    config.taskSources = [
      { id: 'board', name: 'Board', project: '42', executionOwner: 'ploeg', ...tracker },
      { id: 'pinned', name: 'Pinned board', project: '77', executionOwner: 'ploeg', ...tracker },
      { id: 'plain', name: 'Plain', project: '43', executionOwner: 'interactive', ...tracker },
    ];
    config.ploeg = { url: ploeg, tokenEnv: env, userTeams: { 'op-1': ['silver', 'bronze', 'unfold'], 'viewer-1': ['silver'] } };
  });
  t.after(() => server.close());
  server.app.store.addUser({ id: 'op-1', name: 'op-1', role: 'operator', passwordHash: await hashPassword(password) });
  server.app.store.addUser({ id: 'viewer-1', name: 'viewer-1', role: 'viewer', passwordHash: await hashPassword(password) });
  server.app.store.addUser({ id: 'op-2', name: 'op-2', role: 'operator', passwordHash: await hashPassword(password) });
  const attach = async (name: string, clientId = name) => {
    const cookie = name === 'admin' ? (await login(server.url)).cookie : (await login(server.url, name, password)).cookie;
    const token = name === 'viewer-1'
      ? server.app.agentHost.issueToken({ id: 'viewer-1', name: 'viewer-1', role: 'viewer' })
      : (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie, body: { label: 'automations' } })).body.token;
    const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${token}`);
    t.after(() => client.close());
    await client.open;
    const initialized = await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, clientInfo: { name: 'vscode-agents-window' }, initialSubscriptions: ['ahp-root://'] });
    return { client, initialized };
  };
  return { server, state, attach };
}

test('the host advertises a read-only automation catalogue that VS Code 1.141 connects to, without create, schedules or run cancellation', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const { initialized } = await f.attach('op-1');
  assert.deepEqual(initialized.automations, {}, 'the baseline catalogue only');
  assert.equal(initialized._meta['vscode.autonomousAutomations'], true, 'without it VS Code 1.141 asks for a newer host');
  assert.equal(initialized._meta['vscode.ahpSessionUris'], undefined, 'a client that did not declare session URIs is not told it did');
});

test('a person sees one automation per board Ploeg runs and team of theirs with a tracker user, each with no operations', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const { client } = await f.attach('op-1');
  const { snapshot } = await client.rpc('subscribe', { channel: catalogue });
  assert.equal(snapshot.resource, catalogue);
  const entries: Json[] = snapshot.state.entries;
  assert.deepEqual(entries.map(entry => entry.resource), ['ahp-automation:/tracker.board.silver', 'ahp-automation:/tracker.board.bronze'], 'no team without a tracker user, no board pinned to a team outside their access, no interactive board');
  const silver = entries[0];
  assert.deepEqual(silver.operations, [], 'nothing to run, change or remove');
  assert.deepEqual(silver.runs, []);
  assert.equal(silver.definition.title, 'Board → silver');
  assert.equal(silver.definition.enabled, true);
  assert.deepEqual(silver.definition.message.origin, { kind: 'automation' });
  assert.match(silver.definition.message.text, /assigned to silver become Work Items for Ploeg team silver/);
  assert.match(silver.definition.message.text, /nothing here starts work/);
  assert.deepEqual(silver.definition.session, { provider: 'unfold', workingDirectories: ['file:///unfold-repositories/Unfold%20%C2%B7%20order-service'] }, 'VS Code projects an automation only with a provider or a folder');
  assert.deepEqual(silver.definition.triggers, [{ id: 'tracker-assignment', kind: 'event', type: 'unfold.tracker-assignment', title: 'Tracker assignment', description: 'Ploeg queues a Work Item when its tracker user is assigned to a task on this board.', events: [{ id: 'task.assignee.created', title: 'Assigned to silver' }], config: { source: 'board', team: 'silver', assignee: 'silver' } }]);
  assert.ok(!silver.definition.triggers.some((trigger: Json) => trigger.kind === 'schedule'), 'no schedule: VS Code shows the route as manual');
  assert.equal(snapshot.state._meta['dev.webgrip.unfold'].readOnly, true);

  const admin = await f.attach('admin');
  const all = (await admin.client.rpc('subscribe', { channel: catalogue })).snapshot.state.entries.map((entry: Json) => entry.resource);
  assert.deepEqual(all, ['ahp-automation:/tracker.board.silver', 'ahp-automation:/tracker.board.bronze', 'ahp-automation:/tracker.board.gold', 'ahp-automation:/tracker.pinned.gold'], 'a pinned board routes only to its team');

  const viewer = await f.attach('viewer-1');
  assert.deepEqual((await viewer.client.rpc('subscribe', { channel: catalogue })).snapshot.state.entries.map((entry: Json) => entry.resource), ['ahp-automation:/tracker.board.silver'], 'a viewer reads the routes of their own teams');

  const stranger = await f.attach('op-2');
  const empty = (await stranger.client.rpc('subscribe', { channel: catalogue })).snapshot.state;
  assert.deepEqual(empty.entries, []);
  assert.match(empty._meta['dev.webgrip.unfold'].reason, /no Ploeg team access/);
});

test('every change a client asks for is rejected, a manual run is refused, and the catalogue stays as it was', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const { client } = await f.attach('op-1');
  const before = (await client.rpc('subscribe', { channel: catalogue })).snapshot.state.entries;
  const definition = { title: 'Nightly triage', message: { text: 'Triage new issues', origin: { kind: 'automation' } }, session: { provider: 'unfold' }, enabled: true, triggers: [{ id: 'schedule', kind: 'schedule', schedule: { expression: '0 9 * * *', timeZone: 'UTC' }, misfirePolicy: 'runOnce' }] };
  client.notify('dispatchAction', { channel: catalogue, clientSeq: 1, action: { type: 'automation/createRequested', resource: 'ahp-automation:/nightly', definition } });
  client.notify('dispatchAction', { channel: catalogue, clientSeq: 2, action: { type: 'automation/updateRequested', resource: before[0].resource, changes: { enabled: false } } });
  client.notify('dispatchAction', { channel: catalogue, clientSeq: 3, action: { type: 'automation/removed', resource: before[0].resource } });
  const rejected = (seq: number) => client.until(message => message.method === 'action' && message.params.origin?.clientSeq === seq);
  assert.match((await rejected(1)).params.rejectionReason, /budgeted work that Ploeg has not authorized/);
  assert.match((await rejected(2)).params.rejectionReason, /Ploeg team routing/);
  assert.match((await rejected(3)).params.rejectionReason, /Ploeg team routing/);
  assert.ok(!client.inbox.some(message => action(message, catalogue, 'automation/set') || (action(message, catalogue, 'automation/removed') && !message.params.rejectionReason)), 'no catalogue change follows');

  await assert.rejects(client.rpc('runAutomation', { channel: catalogue, automation: before[0].resource, requestId: 'run-1' }), (error: Json) => error.code === -32009 && /does not create, change or run/.test(error.message));
  await assert.rejects(client.rpc('runAutomation', { channel: catalogue, automation: 'ahp-automation:/tracker.board.gold', requestId: 'run-2' }), (error: Json) => error.code === -32008, 'another team\'s route is unknown to this person');
  assert.deepEqual(await client.rpc('fetchAutomationRuns', { channel: catalogue, automation: before[0].resource }), {});
  const triggers = await client.rpc('listAutomationTriggerDefinitions', { channel: 'ahp-root://' });
  assert.deepEqual(triggers.items.map((item: Json) => item.type), ['unfold.tracker-assignment']);
  assert.deepEqual((await client.rpc('subscribe', { channel: catalogue })).snapshot.state.entries.map((entry: Json) => entry.resource), before.map((entry: Json) => entry.resource));
});

test('a refresh publishes a paused team as a disabled route and a team that lost its tracker user as removed, to the watching person only', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const { client } = await f.attach('op-1');
  const viewer = await f.attach('viewer-1');
  await client.rpc('subscribe', { channel: catalogue });
  await viewer.client.rpc('subscribe', { channel: catalogue });
  f.state.teams = [team('silver', ['silver'], [], true), team('bronze', []), team('unfold', []), team('gold', ['gold'], ['77'])];
  await f.server.app.agentHost.automations.refresh();
  const set = await client.until(message => action(message, catalogue, 'automation/set'));
  assert.equal(set.params.action.automation.resource, 'ahp-automation:/tracker.board.silver');
  assert.equal(set.params.action.automation.definition.enabled, false, 'a paused team takes no new work');
  const removed = await client.until(message => action(message, catalogue, 'automation/removed'));
  assert.equal(removed.params.action.resource, 'ahp-automation:/tracker.board.bronze');
  const viewerSet = await viewer.client.until(message => action(message, catalogue, 'automation/set'));
  assert.equal(viewerSet.params.action.automation.resource, 'ahp-automation:/tracker.board.silver');
  assert.ok(!viewer.client.inbox.some(message => action(message, catalogue, 'automation/removed')), 'the viewer never saw the bronze route');
  const before = client.inbox.length;
  await f.server.app.agentHost.automations.refresh();
  assert.equal(client.inbox.length, before, 'an unchanged catalogue publishes nothing');
});

test('a demo workbench advertises no automations and has no catalogue', { timeout: testTimeout(20_000) }, async t => {
  const server = await application('demo');
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'demo' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  const initialized = await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'demo', initialSubscriptions: ['ahp-root://'] });
  assert.equal(initialized.automations, undefined);
  assert.equal(initialized._meta, undefined);
  await assert.rejects(client.rpc('subscribe', { channel: catalogue }), (error: Json) => error.code === -32008);
  await assert.rejects(client.rpc('runAutomation', { channel: catalogue, automation: 'ahp-automation:/x', requestId: 'r' }), (error: Json) => error.code === -32601);
});
