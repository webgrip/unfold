import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { application, login, request } from './api-support.ts';
import { Auth } from '../src/auth.ts';
import type { Membership } from '../src/tenancy.ts';
import type { User } from '../src/types.ts';

const personal = 'pk_8812_PERSONALTOKENOFADA';
const bot = 'pk_9001_UNFOLDBOTTOKENFIRST';
const rotated = 'pk_9001_UNFOLDBOTTOKENSECOND';
const refused = 'pk_9001_AREVOKEDTOKENXYZ';

type Call = { method: string; path: string; authorization: string };

async function fakeClickUp() {
  const calls: Call[] = [];
  const names: Record<string, string> = { [personal]: 'Ada Lovelace', [bot]: 'Unfold bot', [rotated]: 'Unfold bot' };
  const server = createServer(async (incoming: IncomingMessage, response: ServerResponse) => {
    for await (const _ of incoming) { /* drain */ }
    const raw = incoming.url ?? '/';
    const authorization = String(incoming.headers.authorization ?? '');
    calls.push({ method: incoming.method ?? 'GET', path: raw, authorization });
    const reply = (status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (!names[authorization]) return reply(401, { err: 'Token invalid', ECODE: 'OAUTH_025' });
    const path = new URL(raw, 'http://clickup.invalid').pathname;
    if (path === '/api/v2/user') return reply(200, { user: { id: 1, username: names[authorization] } });
    if (path === '/api/v2/team') return reply(200, { teams: [{ id: '9001', name: 'Acme agency' }] });
    if (path === '/api/v2/list/777') return reply(200, { id: '777', name: 'Sprint 12', folder: { id: '51', name: 'Webshop' }, space: { id: '901', name: 'Clients' }, archived: false, statuses: [{ status: 'to do', type: 'open' }] });
    if (path === '/api/v2/list/778') return authorization === personal ? reply(200, { id: '778', name: 'Private', folder: { id: '51', name: 'Webshop' }, space: { id: '901', name: 'Clients' }, archived: false, statuses: [] }) : reply(401, { err: 'Team not authorized', ECODE: 'OAUTH_027' });
    if (path === '/api/v2/list/777/task' || path === '/api/v2/list/778/task') return reply(200, { tasks: [{ id: '86c0a1', name: 'Fix the basket total', list: { id: path.split('/')[4] }, status: { status: 'to do', type: 'open' }, markdown_description: 'Pay in one step.', date_updated: '1793260800000' }], last_page: true });
    reply(404, { err: 'Not found', ECODE: 'ITEM_015' });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { calls, base: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

async function signIn(app: Awaited<ReturnType<typeof application>>, id: string, role: User['role'], memberships?: Membership[]) {
  if (!app.app.store.getUser(id)) app.app.store.addUser({ id, name: id, role, passwordHash: '', ...(memberships ? { memberships } : {}) });
  return new Auth(app.app.store, app.config).issue({ id, name: id, role }).cookie.split(';')[0];
}

const databaseBytes = (dataDir: string) => ['unfold.sqlite', 'unfold.sqlite-wal'].map(name => join(dataDir, name)).filter(existsSync).map(path => readFileSync(path).toString('latin1')).join('');
const auditEvents = (app: Awaited<ReturnType<typeof application>>) => (app.app.store.db.prepare('SELECT tenant_id, event FROM audit_records ORDER BY at, seq').all() as { tenant_id: string; event: string }[]).map(row => ({ tenant: row.tenant_id, event: JSON.parse(row.event) }));

test('an administrator adds a ClickUp connection with a bot token from the screen, saves a List under it, rotates the token and removes both', async t => {
  const fake = await fakeClickUp();
  const app = await application('live', config => { config.links = { clickup: { apiUrl: fake.base, appUrl: fake.base } }; });
  t.after(async () => { await app.close(); await fake.close(); });
  const { cookie } = await login(app.url);

  const empty = await request(app.url, '/api/tracker-connections', { cookie });
  assert.deepEqual(empty.body, { connections: [], manageTenants: ['default'] });
  const providers = await request(app.url, '/api/task-setup', { cookie });
  assert.equal(providers.body.providers[0].serviceAccount.noun, 'ClickUp user');
  assert.match(providers.body.providers[0].serviceAccount.steps.join(' '), /Settings › Apps/);

  const malformed = await request(app.url, '/api/tracker-connections', { method: 'POST', cookie, body: { provider: 'clickup', token: 'not a token' } });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'connection_token_invalid');
  assert.equal(fake.calls.length, 0, 'a value that is not a token never leaves Unfold');
  const rejected = await request(app.url, '/api/tracker-connections', { method: 'POST', cookie, body: { provider: 'clickup', token: refused } });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, 'connection_token_rejected');
  assert.equal(JSON.stringify(rejected.body).includes(refused), false);

  const created = await request(app.url, '/api/tracker-connections', { method: 'POST', cookie, body: { provider: 'clickup', token: bot } });
  assert.equal(created.status, 201, created.text);
  const connection = created.body.connection;
  assert.match(connection.id, /^tc-[a-f0-9]{12}$/);
  assert.equal(connection.account, 'Unfold bot');
  assert.equal(connection.token, 'set');
  assert.equal(connection.baseUrl, `${fake.base}/api/v2`);
  assert.equal(connection.manage, true);
  assert.equal(created.text.includes(bot), false, 'the token is never answered');
  const again = await request(app.url, '/api/tracker-connections', { method: 'POST', cookie, body: { provider: 'clickup', token: bot } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'connection_exists');

  const checked = await request(app.url, `/api/tracker-connections/${connection.id}/check`, { cookie });
  assert.deepEqual(checked.body, { ok: true, account: 'Unfold bot', checks: [{ id: 'service', status: 'ok', title: 'Unfold\'s ClickUp user', text: 'ClickUp accepts the token of Unfold bot.' }] });

  assert.equal((await request(app.url, '/api/links/clickup', { method: 'PUT', body: { token: personal }, cookie })).status, 200);
  const setup = await request(app.url, '/api/task-setup/clickup/projects/777', { cookie });
  assert.deepEqual(setup.body.checks.map((entry: any) => `${entry.id}:${entry.status}`), ['account:ok', 'project:ok', 'tasks:ok', 'service:ok']);
  assert.equal(setup.body.account, 'Ada Lovelace', 'browsing reads with the person\'s own link');
  assert.deepEqual(setup.body.connection, { id: connection.id, tenant: 'default', account: 'Unfold bot' });
  const hidden = await request(app.url, '/api/task-setup/clickup/projects/778', { cookie });
  assert.equal(hidden.body.ok, false);
  assert.deepEqual(hidden.body.checks.at(-1), { id: 'service', status: 'problem', title: 'Unfold\'s ClickUp user', text: 'The task service rejected its configured credentials or permissions.', fix: 'Give Unfold bot access to this List in ClickUp, or replace its token.', code: 'task_credentials_rejected' });

  const saved = await request(app.url, `/api/tracker-connections/${connection.id}/sources`, { method: 'POST', cookie, body: { project: '777', name: 'Sprint 12 · ClickUp', repositoryId: 'order-service' } });
  assert.equal(saved.status, 201, saved.text);
  assert.equal(saved.body.source.id, 'sprint-12-clickup');
  assert.equal(saved.body.source.executionOwner, 'ploeg');
  const twice = await request(app.url, `/api/tracker-connections/${connection.id}/sources`, { method: 'POST', cookie, body: { project: '777', name: 'Again', repositoryId: 'order-service' } });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error.code, 'source_exists');
  const badRepository = await request(app.url, `/api/tracker-connections/${connection.id}/sources`, { method: 'POST', cookie, body: { project: '778', name: 'Private', repositoryId: 'nope' } });
  assert.equal(badRepository.status, 400);
  assert.equal(badRepository.body.error.code, 'connection_invalid');

  const sources = await request(app.url, '/api/task-sources', { cookie });
  const listed = sources.body.find((entry: any) => entry.id === 'sprint-12-clickup');
  assert.equal(listed.managedBy, 'unfold');
  assert.equal(listed.connection, connection.id);
  assert.equal(listed.needsLink, null, 'a saved source reads with its connection\'s token, not a person\'s link');
  fake.calls.length = 0;
  const tasks = await request(app.url, '/api/task-sources/sprint-12-clickup/tasks', { cookie });
  assert.deepEqual(tasks.body.tasks.map((task: any) => task.id), ['86c0a1']);
  assert.deepEqual([...new Set(fake.calls.map(call => call.authorization))], [bot]);

  const inUse = await request(app.url, `/api/tracker-connections/${connection.id}`, { method: 'DELETE', cookie });
  assert.equal(inUse.status, 409);
  assert.equal(inUse.body.error.code, 'connection_in_use');

  const replaced = await request(app.url, `/api/tracker-connections/${connection.id}/token`, { method: 'PUT', cookie, body: { token: rotated } });
  assert.equal(replaced.status, 200, replaced.text);
  fake.calls.length = 0;
  await request(app.url, '/api/task-sources/sprint-12-clickup/tasks', { cookie });
  assert.deepEqual([...new Set(fake.calls.map(call => call.authorization))], [rotated], 'the new token is used at once');

  const renamed = await request(app.url, `/api/tracker-connections/${connection.id}/sources/sprint-12-clickup`, { method: 'PATCH', cookie, body: { name: 'Webshop sprint' } });
  assert.equal(renamed.body.source.name, 'Webshop sprint');
  assert.equal(renamed.body.source.project, '777');

  const bytes = databaseBytes(app.config.dataDir);
  assert.equal(bytes.includes(bot) || bytes.includes(rotated), false, 'the token is not readable in the database file');
  assert.ok(bytes.includes('Unfold bot'), 'the database file itself was read');
  assert.deepEqual(app.app.store.secretIds('tracker-connection:'), [`tracker-connection:${connection.id}`]);

  await app.restart();
  const { cookie: after } = await login(app.url);
  fake.calls.length = 0;
  const restarted = await request(app.url, '/api/task-sources/sprint-12-clickup/tasks', { cookie: after });
  assert.equal(restarted.status, 200, 'a saved source survives a restart');
  assert.deepEqual([...new Set(fake.calls.map(call => call.authorization))], [rotated]);

  assert.equal((await request(app.url, `/api/tracker-connections/${connection.id}/sources/sprint-12-clickup`, { method: 'DELETE', cookie: after })).status, 200);
  assert.equal((await request(app.url, '/api/task-sources/sprint-12-clickup/tasks', { cookie: after })).status, 404);
  assert.equal((await request(app.url, `/api/tracker-connections/${connection.id}`, { method: 'DELETE', cookie: after })).status, 200);
  assert.deepEqual(app.app.store.secretIds('tracker-connection:'), [], 'removing a connection forgets its token');

  const events = auditEvents(app);
  const entities = events.filter(entry => entry.event.entity?.type === 'Tracker connection' || entry.event.entity?.type === 'Task source').map(entry => `${entry.tenant} ${entry.event.entity.type} ${entry.event.activity_name}${entry.event.entity.data?.change ? ` ${entry.event.entity.data.change}` : ''} ${entry.event.status}`);
  assert.deepEqual(entities, [
    'default Tracker connection Create Failure', 'default Tracker connection Create Failure', 'default Tracker connection Create Success', 'default Tracker connection Create Failure',
    'default Task source Create added_from_screen Success', 'default Task source Create added_from_screen Failure', 'default Task source Create added_from_screen Failure',
    'default Tracker connection Delete Failure', 'default Tracker connection Update token_replaced Success', 'default Task source Update Success',
    'default Task source Delete Success', 'default Tracker connection Delete Success',
  ]);
  const everything = JSON.stringify(events) + JSON.stringify(app.app.store.db.prepare('SELECT * FROM action_records').all());
  assert.equal([bot, rotated, refused, personal].some(token => everything.includes(token)), false, 'no token reaches the audit trail or the action records');
});

test('only an administrator, and while tenancy is enforced only an Admin of that Tenant, changes tracker connections; others see what they reach', async t => {
  const fake = await fakeClickUp();
  const app = await application('live', config => {
    config.links = { clickup: { apiUrl: fake.base, appUrl: fake.base } };
    config.tenancy = { enforce: true };
    config.repositories = [...config.repositories, { id: 'agency-shop', name: 'Agency shop', description: '', url: 'demo://agency-shop', baseBranch: 'main', verify: ['true'], tenant: 'agency' }];
  });
  t.after(async () => { await app.close(); await fake.close(); });
  const owner = await signIn(app, 'olga', 'admin', [{ kind: 'tenant', tenant: 'agency', role: 'admin' }]);
  const outsider = await signIn(app, 'otto', 'admin', [{ kind: 'tenant', tenant: 'other', role: 'admin' }]);
  const developer = await signIn(app, 'dev', 'operator', [{ kind: 'tenant', tenant: 'agency', role: 'developer' }]);

  const wrongTenant = await request(app.url, '/api/tracker-connections', { method: 'POST', cookie: outsider, body: { provider: 'clickup', tenant: 'agency', token: bot } });
  assert.equal(wrongTenant.status, 403);
  const byDeveloper = await request(app.url, '/api/tracker-connections', { method: 'POST', cookie: developer, body: { provider: 'clickup', tenant: 'agency', token: bot } });
  assert.equal(byDeveloper.status, 403);
  assert.equal(fake.calls.length, 0, 'a refused person never makes Unfold call the tracker');

  const created = await request(app.url, '/api/tracker-connections', { method: 'POST', cookie: owner, body: { provider: 'clickup', tenant: 'agency', token: bot } });
  assert.equal(created.status, 201, created.text);
  const id = created.body.connection.id;
  const saved = await request(app.url, `/api/tracker-connections/${id}/sources`, { method: 'POST', cookie: owner, body: { project: '777', name: 'Sprint 12', repositoryId: 'agency-shop' } });
  assert.equal(saved.status, 201, saved.text);
  assert.equal(saved.body.source.tenant, 'agency');
  const otherTenantsRepository = await request(app.url, `/api/tracker-connections/${id}/sources`, { method: 'POST', cookie: owner, body: { project: '778', name: 'Private', repositoryId: 'order-service' } });
  assert.equal(otherTenantsRepository.status, 400, 'a source maps to a repository of its own Tenant');

  const seen = await request(app.url, '/api/tracker-connections', { cookie: developer });
  assert.deepEqual(seen.body.connections.map((entry: any) => [entry.id, entry.manage, entry.sources.map((source: any) => source.id)]), [[id, false, ['sprint-12']]]);
  assert.deepEqual(seen.body.manageTenants, []);
  assert.equal((await request(app.url, `/api/tracker-connections/${id}/sources/sprint-12`, { method: 'DELETE', cookie: developer })).status, 403);
  assert.equal((await request(app.url, `/api/tracker-connections/${id}/token`, { method: 'PUT', cookie: developer, body: { token: rotated } })).status, 403);
  assert.deepEqual((await request(app.url, '/api/tracker-connections', { cookie: outsider })).body.connections, [], 'another Tenant does not see it');
  assert.equal((await request(app.url, `/api/tracker-connections/${id}`, { method: 'DELETE', cookie: outsider })).status, 404, 'and cannot tell it exists');
  assert.equal((await request(app.url, '/api/task-sources/sprint-12/tasks', { cookie: outsider })).status, 404);
  assert.equal((await request(app.url, '/api/task-sources/sprint-12/tasks', { cookie: developer })).status, 200);

  const chains = auditEvents(app).filter(entry => entry.event.entity?.type === 'Tracker connection' || entry.event.entity?.type === 'Task source').map(entry => `${entry.tenant} ${entry.event.entity.type} ${entry.event.status}`);
  assert.ok(chains.includes('agency Tracker connection Success') && chains.includes('agency Task source Success'), 'changes land in the owning Tenant\'s audit chain');
  assert.ok(chains.filter(entry => entry.startsWith('agency Task source Failure')).length >= 2, 'refused changes to its connection land there too');
});

test('a connection in the server configuration wins over one saved on the screen, and a saved source is never changed through a configured one', async t => {
  const fake = await fakeClickUp();
  const app = await application('live', config => { config.links = { clickup: { apiUrl: fake.base, appUrl: fake.base } }; });
  t.after(async () => { await app.close(); await fake.close(); });
  const { cookie } = await login(app.url);
  const id = (await request(app.url, '/api/tracker-connections', { method: 'POST', cookie, body: { provider: 'clickup', token: bot } })).body.connection.id;
  assert.equal((await request(app.url, `/api/tracker-connections/${id}/sources`, { method: 'POST', cookie, body: { project: '777', name: 'Sprint 12', repositoryId: 'order-service' } })).status, 201);

  app.config.taskSources = [{ id: 'webshop', name: 'Webshop', provider: 'clickup', baseUrl: `${fake.base}/api/v2`, project: '777', repositoryId: 'order-service', executionOwner: 'ploeg' }];
  await app.restart();
  const { cookie: after } = await login(app.url);
  const sources = await request(app.url, '/api/task-sources', { cookie: after });
  assert.deepEqual(sources.body.map((entry: any) => [entry.id, entry.managedBy]), [['webshop', 'configuration']], 'the configured source reading the same List wins');
  const listed = await request(app.url, '/api/tracker-connections', { cookie: after });
  assert.deepEqual(listed.body.connections[0].sources.map((entry: any) => [entry.id, entry.state]), [['sprint-12', 'shadowed']]);
  const readOnly = await request(app.url, `/api/tracker-connections/${id}/sources/webshop`, { method: 'DELETE', cookie: after });
  assert.equal(readOnly.status, 409);
  assert.equal(readOnly.body.error.code, 'source_read_only');
});
