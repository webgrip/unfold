import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth.ts';
import { application, login, request } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

const at = '2026-09-30T10:00:00Z';
const password = 'handoff-password-161803';

async function listen(handler: (req: IncomingMessage, res: ServerResponse, body: any) => void, t: TestContext): Promise<string> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    handler(req, res, chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

function workItem(state: string, team = 'silver') {
  const shift = { id: '77', workItemId: '9001', team, branch: 'agent/glide-7', round: 1, budgetUsd: 5, spentUsd: 1.25, reservedUsd: 0, openedAt: at, closedAt: null, closeReason: '' };
  return { id: '9001', provider: 'vikunja', externalId: '1505', revision: at, team, state, title: 'Round the totals', description: '', url: '', priority: 0, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: at, updatedAt: at, target: null, latestShift: state === 'queued' ? null : shift, lease: null };
}

async function fixture(t: TestContext) {
  const token = randomBytes(24).toString('hex');
  const env = `VLOER_HANDOFF_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  t.after(() => { delete process.env[env]; });
  const state = {
    task: { id: 1505, project_id: 42, index: 7, identifier: 'GLIDE-7', title: 'Round the totals', description: '<p>Round <strong>half</strong> cents.</p>', done: false, updated: at, priority: 2, labels: [{ id: 1, title: 'backend', hex_color: 'e8e8e8' }], assignees: [] as { id: number; username: string; name?: string }[] },
    users: [{ id: 11, username: 'Silver', name: 'Silver team' }, { id: 12, username: 'bronze', name: 'Bronze team' }],
    writes: [] as { method: string; path: string; body: any; authorization?: string }[],
    reads: [] as string[],
    writeStatus: 0, commentStatus: 0, projectUsersStatus: 0,
    items: [] as ReturnType<typeof workItem>[],
    ploegDown: false, olderPloeg: false, itemsDown: false,
    pins: {} as Record<string, string[]>,
  };
  const vikunja = await listen((req, res, body) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (value: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    if (req.headers.authorization !== `Bearer ${token}`) return send({ message: 'unauthorized' }, 401);
    if (req.method === 'GET') {
      state.reads.push(url.pathname);
      if (url.pathname === '/api/v1/tasks/1505') return send(state.task);
      if (url.pathname === '/api/v1/tasks') return send([state.task]);
      const search = (url.searchParams.get('s') ?? '').toLowerCase();
      if (url.pathname === '/api/v1/projects/42/projectusers') return state.projectUsersStatus ? send({}, state.projectUsersStatus) : send(state.users.filter(user => user.username.toLowerCase().includes(search)));
      if (url.pathname === '/api/v1/users') return send(state.users.filter(user => user.username.toLowerCase().includes(search)));
      return send({ message: 'not found' }, 404);
    }
    state.writes.push({ method: req.method!, path: url.pathname, body, authorization: req.headers.authorization });
    const comment = url.pathname === '/api/v1/tasks/1505/comments';
    const status = comment ? state.commentStatus || state.writeStatus : state.writeStatus;
    if (status) return send({ message: `refused ${token}` }, status);
    if (req.method === 'PUT' && url.pathname === '/api/v1/tasks/1505/assignees') { const user = state.users.find(entry => entry.id === body.user_id)!; state.task.assignees.push(user); return send({ user_id: user.id }, 201); }
    const removal = /^\/api\/v1\/tasks\/1505\/assignees\/(\d+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && removal) { state.task.assignees = state.task.assignees.filter(entry => entry.id !== Number(removal[1])); return send({ message: 'ok' }); }
    if (req.method === 'PUT' && comment) return send({ id: 1, comment: body.comment }, 201);
    return send({ message: 'not found' }, 404);
  }, t);
  const ploeg = await listen((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (value: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...value as object }));
    if (req.headers.authorization !== `Bearer ${bearer}` || req.method !== 'GET') return send({}, 401);
    if (state.ploegDown) return send({}, 503);
    const team = (id: string, assignees: string[]) => ({ id, paused: false, queueDepth: 2, roles: [{ id: 'implementer', queueDepth: 1 }], ...(state.olderPloeg ? {} : { assignees, pinnedScopes: state.pins[id] ?? [] }) });
    if (url.pathname === '/api/v1/operator/teams') return send({ teams: [team('silver', ['silver']), team('bronze', ['bronze']), team('vloer', []), team('gold', ['gold'])] });
    if (url.pathname === '/api/v1/operator/work-items') {
      if (state.itemsDown) return send({}, 503);
      if (state.olderPloeg || !url.searchParams.has('provider')) return send({ error: { code: 'invalid_request' } }, 400);
      return send({ items: state.items.filter(item => item.provider === url.searchParams.get('provider') && item.externalId === url.searchParams.get('externalId')), nextCursor: null });
    }
    const item = state.items.find(entry => url.pathname === `/api/v1/operator/work-items/${entry.id}`);
    if (item) return send({ item, shifts: item.latestShift ? [item.latestShift] : [], runs: [], checkpoints: [{ id: '5', workItemId: item.id, phase: 'publish', branch: 'agent/glide-7', prUrl: 'https://forge.example/team/app/pulls/3', createdAt: at, nodeName: '', podUid: '' }], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false } });
    return send({}, 404);
  }, t);
  const server = await application('live', config => {
    config.taskSources = [
      { id: 'board', name: 'Board', provider: 'vikunja', baseUrl: `${vikunja}/api/v1`, project: '42', repositoryId: 'order-service', token, executionOwner: 'ploeg' },
      { id: 'plain', name: 'Plain', provider: 'vikunja', baseUrl: `${vikunja}/api/v1`, project: '43', repositoryId: 'order-service', token, executionOwner: 'interactive' },
    ];
    config.ploeg = { url: ploeg, tokenEnv: env, userTeams: { 'op-1': ['silver', 'bronze', 'vloer'], 'viewer-1': ['silver'] } };
  });
  t.after(() => server.close());
  server.app.store.addUser({ id: 'op-1', name: 'Op <b>One</b>', role: 'operator', passwordHash: await hashPassword(password) });
  server.app.store.addUser({ id: 'viewer-1', name: 'viewer-1', role: 'viewer', passwordHash: await hashPassword(password) });
  const operator = await login(server.url, 'Op <b>One</b>', password);
  const viewer = await login(server.url, 'viewer-1', password);
  const status = async (cookie = operator.cookie) => { const result = await request(server.url, '/api/task-sources/board/tasks/1505/ploeg?refresh=1', { cookie }); assert.equal(result.status, 200, result.text); return result.body; };
  const revision = async () => (await request(server.url, '/api/task-sources/board/tasks', { cookie: operator.cookie })).body.tasks[0].revision as string;
  const handOff = (body: Record<string, unknown>, cookie = operator.cookie) => request(server.url, '/api/task-sources/board/tasks/1505/handoff', { method: 'POST', cookie, body });
  const takeBack = (team: string, cookie = operator.cookie) => request(server.url, `/api/task-sources/board/tasks/1505/handoff?team=${team}`, { method: 'DELETE', cookie });
  return { state, server, token, bearer, operator, viewer, status, revision, handOff, takeBack };
}

test('task list and detail carry Vikunja labels, identifier and Markdown, and sources say whether they hand off', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  const page = await request(f.server.url, '/api/task-sources/board/tasks', { cookie: f.operator.cookie });
  assert.equal(page.status, 200, page.text);
  assert.deepEqual(page.body.tasks[0].labels, [{ name: 'backend', color: '#e8e8e8' }]);
  assert.equal(page.body.tasks[0].identifier, 'GLIDE-7');
  assert.equal(page.body.tasks[0].priority, 2);
  assert.equal(page.body.tasks[0].descriptionMarkdown, 'Round **half** cents.');
  const sources = await request(f.server.url, '/api/task-sources', { cookie: f.operator.cookie });
  assert.deepEqual(sources.body.map((source: { id: string; handoff: boolean }) => [source.id, source.handoff]), [['board', true], ['plain', false]]);
  const bootstrap = await request(f.server.url, '/api/bootstrap', { cookie: f.operator.cookie });
  assert.deepEqual(bootstrap.body.taskSources.map((source: { handoff: boolean }) => source.handoff), [true, false]);
  assert(!bootstrap.text.includes(f.token) && !bootstrap.text.includes(f.bearer));
});

test('status lists the caller’s assignable teams, the current hand-off and Ploeg’s work with its PR, branch and spend', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  const idle = await f.status();
  assert.equal(idle.available, true);
  assert.equal(idle.demo, false);
  assert.deepEqual(idle.handoff, { allowed: true });
  assert.deepEqual(idle.teams, [{ id: 'silver', assignee: 'silver', queueDepth: 2, paused: false, roles: ['implementer'] }, { id: 'bronze', assignee: 'bronze', queueDepth: 2, paused: false, roles: ['implementer'] }]);
  assert.deepEqual(idle.assignedTeams, []);
  assert.deepEqual(idle.workItems, []);
  assert.equal(typeof idle.fetchedAt, 'string');
  f.state.task.assignees.push({ id: 11, username: 'Silver' });
  f.state.items.push(workItem('leased'));
  const busy = await f.status();
  assert.deepEqual(busy.assignedTeams, ['silver'], 'tracker usernames match Ploeg’s lowercase routing names');
  assert.deepEqual(busy.workItems, [{ id: '9001', team: 'silver', state: 'leased', attempts: 1, updatedAt: at, prUrl: 'https://forge.example/team/app/pulls/3', branch: 'agent/glide-7', spentUsd: 1.25, budgetUsd: 5 }]);
  assert.match(busy.message, /silver/);
  const watching = await f.status(f.viewer.cookie);
  assert.equal(watching.handoff.allowed, false);
  assert.match(watching.handoff.reason, /Viewers/);
  assert.deepEqual(watching.teams.map((team: { id: string }) => team.id), ['silver']);
  assert.equal(f.state.writes.length, 0, 'reading status never changes the tracker');
});

test('status degrades when Ploeg is unreachable or too old, and never invents Ploeg records', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  f.state.ploegDown = true;
  const down = await f.status();
  assert.equal(down.available, false);
  assert.equal(down.handoff.allowed, false);
  assert.match(down.message, /Ploeg/);
  assert.deepEqual([down.teams, down.workItems, down.assignedTeams], [[], [], []]);
  f.state.ploegDown = false;
  f.state.olderPloeg = true;
  const older = await f.status();
  assert.equal(older.available, true);
  assert.deepEqual(older.teams, []);
  assert.deepEqual(older.workItems, []);
  assert.match(older.handoff.reason, /Update Ploeg/);
  assert.match(older.message, /Update Ploeg/);
  const refused = await f.handOff({ team: 'silver', revision: await f.revision() });
  assert.equal(refused.status, 404, refused.text);
  assert.equal(refused.body.error.code, 'handoff_team');
  assert(!down.message.includes(f.bearer));
});

test('the demo fixture source is not linked to Ploeg and reports no Ploeg work', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('demo', config => { config.taskSources = [{ id: 'demo-tasks', name: 'Demo fixture tasks', provider: 'demo', baseUrl: 'https://example.invalid', project: 'order-service', repositoryId: 'order-service', executionOwner: 'interactive' }]; });
  t.after(() => server.close());
  const bootstrap = await request(server.url, '/api/bootstrap');
  assert.equal(bootstrap.body.taskSources[0].handoff, false);
  const result = await request(server.url, '/api/task-sources/demo-tasks/tasks/1/ploeg');
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body.available, false);
  assert.equal(result.body.demo, true);
  assert.equal(result.body.message, 'Demo fixture tasks are not linked to Ploeg.');
  assert.deepEqual([result.body.teams, result.body.workItems, result.body.assignedTeams], [[], [], []]);
  const handoff = await request(server.url, '/api/task-sources/demo-tasks/tasks/1/handoff', { method: 'POST', body: { team: 'delivery', revision: 'x' } });
  assert.equal(handoff.status, 422, handoff.text);
});

test('hand-off assigns the team’s tracker user as the workbench, comments once and is idempotent', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  f.state.projectUsersStatus = 403;
  const revision = await f.revision();
  const result = await f.handOff({ team: 'silver', revision });
  assert.equal(result.status, 200, result.text);
  assert.deepEqual(result.body.assignedTeams, ['silver']);
  assert.equal(result.body.warnings, undefined);
  assert(f.state.reads.includes('/api/v1/users'), 'a hidden project user list falls back to user search');
  assert.deepEqual(f.state.writes.map(write => [write.method, write.path, write.body]), [
    ['PUT', '/api/v1/tasks/1505/assignees', { user_id: 11 }],
    ['PUT', '/api/v1/tasks/1505/comments', { comment: '<p>Handed to Ploeg team <code>silver</code> by Op &#60;b&#62;One&#60;/b&#62; from Vloer.</p>' }],
  ]);
  assert(f.state.writes.every(write => write.authorization === `Bearer ${f.token}`));
  const again = await f.handOff({ team: 'silver', revision });
  assert.equal(again.status, 200, again.text);
  assert.equal(f.state.writes.length, 2, 'a repeated hand-off changes nothing');
  const csrf = await request(f.server.url, '/api/task-sources/board/tasks/1505/handoff', { method: 'POST', cookie: f.operator.cookie, csrf: false, body: { team: 'bronze', revision } });
  assert.equal(csrf.status, 403, csrf.text);
  assert.equal(f.state.writes.length, 2);
});

test('hand-off refuses viewers, unsupported sources, unknown teams, closed tasks and stale revisions without writing', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  const revision = await f.revision();
  const viewer = await f.handOff({ team: 'silver', revision }, f.viewer.cookie);
  assert.equal(viewer.status, 403, viewer.text);
  const plain = await request(f.server.url, '/api/task-sources/plain/tasks/1505/handoff', { method: 'POST', cookie: f.operator.cookie, body: { team: 'silver', revision } });
  assert.equal(plain.status, 422, plain.text);
  assert.equal(plain.body.error.code, 'handoff_unsupported');
  for (const team of ['gold', 'vloer', 'nope']) {
    const unknown = await f.handOff({ team, revision });
    assert.equal(unknown.status, 404, `${team}: ${unknown.text}`);
    assert.equal(unknown.body.error.code, 'handoff_team');
  }
  const stale = await f.handOff({ team: 'silver', revision: 'a'.repeat(64) });
  assert.equal(stale.status, 409, stale.text);
  assert.equal(stale.body.error.code, 'task_changed');
  f.state.task.done = true;
  const closed = await f.handOff({ team: 'silver', revision });
  assert.equal(closed.status, 409, closed.text);
  assert.equal(closed.body.error.code, 'task_closed');
  assert.equal(f.state.writes.length, 0);
});

test('hand-off refuses a second team while another team holds the task, so live work is never re-routed', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  const revision = await f.revision();
  assert.equal((await f.handOff({ team: 'silver', revision })).status, 200);
  const assigned = await f.handOff({ team: 'bronze', revision: await f.revision() });
  assert.equal(assigned.status, 409, assigned.text);
  assert.equal(assigned.body.error.code, 'handoff_active');
  assert.match(assigned.body.error.message, /Take it back from silver/);
  f.state.task.assignees = [];
  f.state.items.push(workItem('leased', 'silver'));
  const live = await f.handOff({ team: 'bronze', revision: await f.revision() });
  assert.equal(live.status, 409, live.text);
  assert.match(live.body.error.message, /silver already holds this task \(leased\)/);
  f.state.items[0] = workItem('done', 'silver');
  const afterDone = await f.handOff({ team: 'bronze', revision: await f.revision() });
  assert.equal(afterDone.status, 200, afterDone.text);
  assert.deepEqual(afterDone.body.assignedTeams, ['bronze']);
  assert.deepEqual(f.state.writes.filter(write => write.path.endsWith('/assignees')).map(write => write.body.user_id), [11, 12], 'only the refused hand-offs wrote nothing');
});

test('take-back refuses once any team has started the task, even a team outside the caller’s access', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  assert.equal((await f.handOff({ team: 'silver', revision: await f.revision() })).status, 200);
  f.state.items.push(workItem('leased', 'gold'));
  const hidden = await f.takeBack('silver');
  assert.equal(hidden.status, 409, hidden.text);
  assert.equal(hidden.body.error.code, 'handoff_started');
  f.state.items[0] = workItem('ingested', 'silver');
  assert.equal((await f.takeBack('silver')).status, 409, 'an ingested item may still be queued by Ploeg, so it counts as started');
  f.state.items = [];
  f.state.itemsDown = true;
  const unverified = await f.takeBack('silver');
  assert.equal(unverified.status, 503, unverified.text);
  assert.equal(unverified.body.error.code, 'handoff_unverified');
  assert.equal(f.state.writes.filter(write => write.method === 'DELETE').length, 0);
});

test('hand-off fails closed when Ploeg cannot say who holds the task, and never names a hidden team', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  f.state.itemsDown = true;
  const unverified = await f.handOff({ team: 'silver', revision: await f.revision() });
  assert.equal(unverified.status, 503, unverified.text);
  assert.equal(unverified.body.error.code, 'handoff_unverified');
  f.state.itemsDown = false;
  f.state.items.push(workItem('needs_human', 'gold'));
  const hidden = await f.handOff({ team: 'silver', revision: await f.revision() });
  assert.equal(hidden.status, 409, hidden.text);
  assert.equal(hidden.body.error.code, 'handoff_active');
  assert.doesNotMatch(hidden.body.error.message, /gold/);
  f.state.items = [];
  f.state.task.assignees.push({ id: 13, username: 'gold', name: 'Gold team' });
  const assigned = await f.handOff({ team: 'silver', revision: await f.revision() });
  assert.equal(assigned.status, 409, assigned.text);
  assert.match(assigned.body.error.message, /outside your access/);
  assert.equal(f.state.writes.length, 0);
});

test('a board pinned to one Ploeg team offers only that team, because every assignment on it runs there', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  f.state.pins = { bronze: ['42'] };
  const status = await f.status();
  assert.deepEqual(status.teams.map((team: { id: string }) => team.id), ['bronze']);
  assert.equal(status.handoff.allowed, true);
  const other = await f.handOff({ team: 'silver', revision: await f.revision() });
  assert.equal(other.status, 404, other.text);
  assert.equal(other.body.error.code, 'handoff_team');
  f.state.pins = { vloer: ['42'] };
  const unassignable = await f.status();
  assert.deepEqual(unassignable.teams, []);
  assert.match(unassignable.handoff.reason, /pinned to Ploeg team vloer, which has no tracker user/);
  f.state.pins = { gold: ['42'] };
  const outside = await f.status();
  assert.deepEqual(outside.teams, []);
  assert.match(outside.handoff.reason, /outside your access/);
  assert.equal(f.state.writes.length, 0);
});

test('a tracker token without write permission is reported as such, and a failed comment is only a warning', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  f.state.writeStatus = 403;
  const forbidden = await f.handOff({ team: 'silver', revision: await f.revision() });
  assert.equal(forbidden.status, 502, forbidden.text);
  assert.equal(forbidden.body.error.code, 'task_write_forbidden');
  assert.match(forbidden.body.error.message, /token.*assignees.*comments/);
  assert(!forbidden.text.includes(f.token));
  f.state.writeStatus = 0;
  f.state.commentStatus = 500;
  const warned = await f.handOff({ team: 'silver', revision: await f.revision() });
  assert.equal(warned.status, 200, warned.text);
  assert.deepEqual(warned.body.assignedTeams, ['silver']);
  assert.equal(warned.body.warnings.length, 1);
  assert.match(warned.body.warnings[0], /comment/);
});

test('take-back removes the team’s assignee while Ploeg has not started, and refuses once it has', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  assert.equal((await f.handOff({ team: 'silver', revision: await f.revision() })).status, 200);
  f.state.items.push(workItem('leased'));
  const started = await f.takeBack('silver');
  assert.equal(started.status, 409, started.text);
  assert.equal(started.body.error.code, 'handoff_started');
  assert.match(started.body.error.message, /cancel it from the Ploeg view/);
  assert.equal(f.state.writes.length, 2);
  f.state.items[0] = workItem('queued');
  const viewer = await f.takeBack('silver', f.viewer.cookie);
  assert.equal(viewer.status, 403, viewer.text);
  const taken = await f.takeBack('silver');
  assert.equal(taken.status, 200, taken.text);
  assert.deepEqual(taken.body.assignedTeams, []);
  assert.deepEqual(f.state.writes.slice(2).map(write => [write.method, write.path, write.body]), [
    ['DELETE', '/api/v1/tasks/1505/assignees/11', undefined],
    ['PUT', '/api/v1/tasks/1505/comments', { comment: '<p>Taken back from Ploeg team <code>silver</code> by Op &#60;b&#62;One&#60;/b&#62; from Vloer.</p>' }],
  ]);
  const again = await f.takeBack('silver');
  assert.equal(again.status, 200, again.text);
  assert.equal(f.state.writes.length, 4, 'taking back an unassigned team changes nothing');
  f.state.olderPloeg = true;
  const unverified = await f.takeBack('bronze');
  assert.equal(unverified.status, 404, unverified.text);
});

test('lookup finds the configured source whose project holds a Vikunja task', { timeout: testTimeout(15_000) }, async t => {
  const f = await fixture(t);
  const found = await request(f.server.url, '/api/tasks/lookup?provider=vikunja&id=1505', { cookie: f.viewer.cookie });
  assert.equal(found.status, 200, found.text);
  assert.deepEqual(found.body, { sourceId: 'board' });
  const missing = await request(f.server.url, '/api/tasks/lookup?provider=vikunja&id=999', { cookie: f.operator.cookie });
  assert.equal(missing.status, 404, missing.text);
  for (const query of ['provider=github&id=1505', 'provider=vikunja&id=../1', 'provider=vikunja']) assert.equal((await request(f.server.url, `/api/tasks/lookup?${query}`, { cookie: f.operator.cookie })).status, 400, query);
  assert.equal((await request(f.server.url, '/api/tasks/lookup?provider=vikunja&id=1505')).status, 401);
});
