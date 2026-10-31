import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { application, login, request } from './api-support.ts';
import { getTask, listTasks, presentTask, TaskError, validateTaskSources } from '../src/tasks.ts';
import { clickupMarkdown } from '../src/task-providers/clickup.ts';
import { retryDelay } from '../src/task-providers/shared.ts';
import type { Repository } from '../src/types.ts';

const personal = 'pk_8812_TESTTOKENFORAFAKESERVER';
const repositories: Repository[] = [{ id: 'shop', name: 'Shop', description: '', url: 'https://forge.example/acme/shop.git', baseBranch: 'main', verify: ['npm', 'test'] }];

type Call = { method: string; path: string; authorization: string };

const task = (id: string, list: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, list: { id: list }, status: { status: 'in review', type: 'custom' }, archived: false, date_updated: '1793260800000',
  markdown_description: 'Pay in **one** step.\n\n![basket screenshot](https://t9001.p.clickup-attachments.com/basket.png)\n\n<u>Must</u> keep totals<br>right.',
  assignees: [{ id: 1, username: 'Ada Lovelace', email: 'ada@acme.example' }, { id: 2, username: 'Grace Hopper', email: 'grace@acme.example' }],
  tags: [{ name: 'checkout', tag_bg: '#ff0000' }], due_date: '1793347200000', ...extra,
});

async function fakeClickUp() {
  const calls: Call[] = [];
  let limitedOnce = false;
  const server = createServer(async (incoming: IncomingMessage, response: ServerResponse) => {
    for await (const _ of incoming) { /* drain */ }
    const raw = incoming.url ?? '/';
    calls.push({ method: incoming.method ?? 'GET', path: raw, authorization: String(incoming.headers.authorization ?? '') });
    const reply = (status: number, value: unknown, headers: Record<string, string> = {}) => { response.writeHead(status, { 'content-type': 'application/json', ...headers }); response.end(JSON.stringify(value)); };
    if (incoming.headers.authorization !== personal) return reply(401, { err: 'Token invalid', ECODE: 'OAUTH_025' });
    const url = new URL(raw, 'http://clickup.invalid');
    const path = url.pathname;
    if (path === '/api/v2/user') return reply(200, { user: { id: 1, username: 'Ada Lovelace', email: 'ada@acme.example', timezone: 'Europe/Amsterdam' } });
    if (path === '/api/v2/team') return reply(200, { teams: [{ id: '9001', name: 'Acme agency' }] });
    if (path === '/api/v2/team/9001/space') return reply(200, { spaces: [{ id: '901', name: 'Clients' }, { id: '902', name: 'Old clients', archived: true }] });
    if (path === '/api/v2/space/901/folder') return reply(200, { folders: [{ id: '51', name: 'Webshop', hidden: false }, { id: '52', name: 'hidden', hidden: true }] });
    if (path === '/api/v2/space/901/list') return reply(200, { lists: [{ id: '701', name: 'Inbox' }] });
    if (path === '/api/v2/folder/51/list') return reply(200, { lists: [{ id: '777', name: 'Sprint 12' }, { id: '778', name: 'Sprint 1', archived: true }] });
    if (path === '/api/v2/list/777') return reply(200, { id: '777', name: 'Sprint 12', folder: { id: '51', name: 'Webshop', hidden: false }, space: { id: '901', name: 'Clients' }, archived: false, statuses: [{ status: 'to do', type: 'open' }, { status: 'in review', type: 'custom' }, { status: 'complete', type: 'closed' }] });
    if (path === '/api/v2/list/778') return reply(200, { id: '778', name: 'Sprint 1', folder: { id: '51', name: 'Webshop' }, space: { id: '901', name: 'Clients' }, archived: true, statuses: [] });
    if (path === '/api/v2/list/701') return reply(200, { id: '701', name: 'Inbox', folder: { id: '9', name: 'hidden', hidden: true }, space: { id: '901', name: 'Clients' }, archived: false, statuses: [] });
    if (path === '/api/v2/list/701/task') return reply(200, { tasks: [], last_page: true });
    if (path === '/api/v2/list/777/task') {
      const page = url.searchParams.get('page');
      if (page === '0') return reply(200, { tasks: [task('86c0a1', '777', 'Fix the basket total', { custom_id: 'SHOP-12' }), task('86c0a2', '999', 'Subtask living in another List'), task('86c0a3', '777', 'Second task')], last_page: false }, { 'x-ratelimit-remaining': '97', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) });
      return reply(200, { tasks: [task('86c0a4', '777', 'Older task')], last_page: true });
    }
    if (path === '/api/v2/task/86c0a1') return reply(200, task('86c0a1', '777', 'Fix the basket total', { custom_id: 'SHOP-12' }));
    if (path === '/api/v2/list/555/task') {
      if (!limitedOnce) { limitedOnce = true; return reply(429, { err: 'Rate limit reached', ECODE: 'APP_002' }, { 'retry-after': '1' }); }
      return reply(200, { tasks: [], last_page: true });
    }
    if (path === '/api/v2/list/556/task') return reply(429, { err: 'Rate limit reached', ECODE: 'APP_002' }, { 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120) });
    reply(404, { err: 'Not found', ECODE: 'ITEM_015' });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  return { calls, base, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

function clickupSource(base: string, project: string) {
  process.env.UNFOLD_TEST_CLICKUP_TOKEN = personal;
  return validateTaskSources([{ id: `clickup-${project}`, name: 'Acme · ClickUp', provider: 'clickup', baseUrl: `${base}/api/v2`, project, repositoryId: 'shop', tokenEnv: 'UNFOLD_TEST_CLICKUP_TOKEN', executionOwner: 'interactive' }], repositories, 'live')[0];
}

test('a ClickUp list page skips tasks whose home List is elsewhere instead of failing, and pages by last_page', async t => {
  const fake = await fakeClickUp();
  t.after(() => fake.close());
  const source = clickupSource(fake.base, '777');
  const first = await listTasks(source, 1);
  assert.deepEqual(first.tasks.map(entry => entry.id), ['86c0a1', '86c0a3']);
  assert.equal(first.nextPage, 2);
  assert.equal(first.tasks[0].identifier, 'SHOP-12');
  assert.deepEqual(first.tasks[0].assignees?.map(person => person.username), ['Ada Lovelace', 'Grace Hopper']);
  const second = await listTasks(source, 2);
  assert.deepEqual(second.tasks.map(entry => entry.id), ['86c0a4']);
  assert.equal(second.nextPage, undefined);
  const lists = fake.calls.filter(call => call.path.startsWith('/api/v2/list/777/task'));
  assert.deepEqual(lists.map(call => new URL(call.path, 'http://x').searchParams.get('page')), ['0', '1']);
  assert.equal(new URL(lists[0].path, 'http://x').searchParams.get('include_markdown_description'), 'true');
  assert.ok(fake.calls.every(call => call.authorization === personal), 'a personal token goes in the raw Authorization header');
});

test('a ClickUp description is tidied for display while the snapshot and its revision keep ClickUp\'s own text', async t => {
  const fake = await fakeClickUp();
  t.after(() => fake.close());
  const source = clickupSource(fake.base, '777');
  const snapshot = await getTask(source, '86c0a1');
  assert.match(snapshot.description, /!\[basket screenshot\]/);
  const shown = presentTask(source, snapshot).descriptionMarkdown;
  assert.equal(shown, 'Pay in **one** step.\n\n[Image: basket screenshot](https://t9001.p.clickup-attachments.com/basket.png)\n\nMust keep totals\nright.');
  assert.equal(clickupMarkdown('![](https://x.example/a.png) <span style="color:red">red</span> <script>x</script>'), '[Image](https://x.example/a.png) red <script>x</script>', 'unknown tags stay as text for the escaping renderer');
});

test('a ClickUp 429 that asks for a second is waited out once; a longer one refuses with Retry-After and asks nothing until the reset', async t => {
  const fake = await fakeClickUp();
  t.after(() => fake.close());
  const quick = await listTasks(clickupSource(fake.base, '555'), 1);
  assert.deepEqual(quick.tasks, []);
  assert.equal(fake.calls.filter(call => call.path.startsWith('/api/v2/list/555/task')).length, 2);
  const slow = clickupSource(fake.base, '556');
  await assert.rejects(listTasks(slow, 1), (error: unknown) => error instanceof TaskError && error.code === 'task_rate_limited' && error.status === 503 && (error.retryAfter ?? 0) >= 100 && /ClickUp is limiting how often this account may ask\. ClickUp lets each account ask 100 times a minute/.test(error.message));
  await assert.rejects(listTasks(slow, 1), (error: unknown) => error instanceof TaskError && error.code === 'task_rate_limited');
  assert.equal(fake.calls.filter(call => call.path.startsWith('/api/v2/list/556/task')).length, 1, 'the second read waits for the reset instead of asking');
  assert.equal(retryDelay(new Headers({ 'retry-after': '3' })), 3000);
  assert.equal(retryDelay(new Headers({ 'x-ratelimit-reset': '1000' }), 999_000), 1000);
  assert.equal(retryDelay(new Headers()), undefined);
});

test('a person sets a ClickUp List up by name with their linked account: pickers, check, preview and the entry to add', async t => {
  const fake = await fakeClickUp();
  const app = await application('live', config => {
    config.links = { clickup: { apiUrl: fake.base, appUrl: fake.base } };
    config.taskSources = [{ id: 'webshop', name: 'Webshop', provider: 'clickup', baseUrl: `${fake.base}/api/v2`, project: '777', repositoryId: 'order-service', executionOwner: 'interactive' }];
  });
  t.after(async () => { await app.close(); await fake.close(); });
  const { cookie } = await login(app.url);
  const before = await request(app.url, '/api/task-setup', { cookie });
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.providers.map((entry: any) => [entry.provider, entry.linked, entry.levels.map((level: any) => level.label).join('/')]), [['clickup', false, 'Workspace/Space/Folder/List']]);
  const unlinked = await request(app.url, '/api/task-setup/clickup/scopes', { cookie });
  assert.equal(unlinked.status, 409);
  assert.equal(unlinked.body.error.code, 'setup_unlinked');
  assert.equal(fake.calls.length, 0);

  const linked = await request(app.url, '/api/links/clickup', { method: 'PUT', body: { token: personal }, cookie, csrf: true });
  assert.equal(linked.status, 200);
  fake.calls.length = 0;
  const workspaces = await request(app.url, '/api/task-setup/clickup/scopes', { cookie });
  assert.deepEqual(workspaces.body.entries, [{ kind: 'workspace', id: '9001', name: 'Acme agency', project: false, children: true }]);
  const spaces = await request(app.url, '/api/task-setup/clickup/scopes?kind=workspace&id=9001', { cookie });
  assert.deepEqual(spaces.body.entries.map((entry: any) => entry.name), ['Clients'], 'archived Spaces are left out');
  const space = await request(app.url, '/api/task-setup/clickup/scopes?kind=space&id=901', { cookie });
  assert.deepEqual(space.body.entries.map((entry: any) => `${entry.kind}:${entry.name}`), ['folder:Webshop', 'list:Inbox'], 'folders first, then Lists outside a folder; hidden folders are left out');
  const folder = await request(app.url, '/api/task-setup/clickup/scopes?kind=folder&id=51', { cookie });
  assert.deepEqual(folder.body.entries.map((entry: any) => `${entry.id}:${entry.project}`), ['777:true']);
  await request(app.url, '/api/task-setup/clickup/scopes?kind=folder&id=51', { cookie });
  assert.deepEqual(fake.calls.map(call => `${call.method} ${call.path}`), [
    'GET /api/v2/team',
    'GET /api/v2/team/9001/space?archived=false',
    'GET /api/v2/space/901/folder?archived=false',
    'GET /api/v2/space/901/list?archived=false',
    'GET /api/v2/folder/51/list?archived=false',
  ], 'a repeated read inside a minute comes from memory');
  const bad = await request(app.url, '/api/task-setup/clickup/scopes?kind=list&id=777', { cookie });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'setup_scope_invalid');

  const checked = await request(app.url, '/api/task-setup/clickup/projects/777', { cookie });
  assert.equal(checked.status, 200);
  assert.equal(checked.body.ok, true);
  assert.equal(checked.body.account, 'Ada Lovelace');
  assert.deepEqual(checked.body.project.path, ['Clients', 'Webshop']);
  assert.deepEqual(checked.body.checks.map((entry: any) => `${entry.id}:${entry.status}`), ['account:ok', 'project:ok', 'tasks:ok', 'service:warning'], 'without a connection of its own, the List can be saved but not handed off from Unfold yet');
  assert.equal(checked.body.connection, null);
  assert.match(checked.body.checks[1].text, /^Clients › Webshop › Sprint 12, with the statuses to do, in review, complete\.$/);
  assert.deepEqual(checked.body.preview.tasks.map((entry: any) => entry.reference), ['SHOP-12', '#86c0a3']);
  assert.equal(checked.body.preview.more, true);
  assert.match(checked.body.preview.tasks[0].excerpt, /\[Image: basket screenshot\]/);
  assert.deepEqual(checked.body.registered, [{ id: 'webshop', name: 'Webshop' }]);
  assert.deepEqual(checked.body.entry, { id: 'sprint-12', name: 'Sprint 12 · ClickUp', provider: 'clickup', baseUrl: `${fake.base}/api/v2`, project: '777', repositoryId: '', executionOwner: 'ploeg' });
  assert.equal(JSON.stringify(checked.body).includes(personal), false);

  const archived = await request(app.url, '/api/task-setup/clickup/projects/778', { cookie });
  assert.equal(archived.body.ok, false);
  assert.deepEqual(archived.body.checks.map((entry: any) => `${entry.id}:${entry.status}`), ['account:ok', 'project:problem']);
  const empty = await request(app.url, '/api/task-setup/clickup/projects/701', { cookie });
  assert.deepEqual(empty.body.project.path, ['Clients'], 'a hidden folder is not part of the path');
  assert.deepEqual(empty.body.checks.map((entry: any) => `${entry.id}:${entry.status}`), ['account:ok', 'project:ok', 'tasks:warning', 'service:warning']);
  const missing = await request(app.url, '/api/task-setup/clickup/projects/404404', { cookie });
  assert.equal(missing.body.ok, false);
  assert.equal(missing.body.checks[1].code, 'task_not_found');
  const notAList = await request(app.url, '/api/task-setup/clickup/projects/abc', { cookie });
  assert.equal(notAList.status, 400);
  assert.equal(notAList.body.error.code, 'setup_scope_invalid');
  const unsupported = await request(app.url, '/api/task-setup/jira/scopes', { cookie });
  assert.equal(unsupported.status, 404);
  assert.equal(unsupported.body.error.code, 'setup_unsupported');

  const tested = await request(app.url, '/api/task-sources/webshop/check', { cookie });
  assert.equal(tested.status, 200);
  assert.deepEqual(tested.body.checks.map((entry: any) => `${entry.id}:${entry.status}`), ['account:ok', 'project:ok', 'tasks:ok', 'handoff:warning']);
  const nothing = await request(app.url, '/api/task-sources/nope/check', { cookie });
  assert.equal(nothing.status, 404);
});
