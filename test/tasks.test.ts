import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { getTask, listTasks, publicTaskSource, TaskError, validateTaskSources, type TaskSourceConfig, type TaskProvider } from '../src/tasks.ts';
import type { Repository } from '../src/types.ts';

const repositories: Repository[] = [{ id: 'order-service', name: 'Orders', description: '', url: 'https://forge.example/team/orders.git', baseBranch: 'main', verify: ['node', '--test'] }];
const token = 'task-fixture-token-never-public';
const date = '2026-09-09T12:00:00.000Z';

async function fixture(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }) };
}

function source(provider: TaskProvider, origin = 'https://tracker.example'): TaskSourceConfig {
  const suffix = provider === 'github' ? '/api/v3' : provider === 'gitlab' ? '/api/v4' : provider === 'clickup' ? '/api/v2' : '/api/v1';
  return { id: `${provider}-tasks`, name: `${provider} tasks`, provider, baseUrl: `${origin}${suffix}`, project: provider === 'clickup' || provider === 'vikunja' ? '42' : 'team/orders', repositoryId: 'order-service', executionOwner: 'interactive', token };
}

function issue(provider: TaskProvider, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  if (provider === 'gitlab') return { id: 81, iid: 17, project_id: 42, title: 'Fix rounding', description: 'Use decimal totals.\n\n<script>alert(1)</script>', state: 'opened', updated_at: date, ...overrides };
  if (provider === 'clickup') return { id: 'abc17', name: 'Fix rounding', markdown_description: 'Use decimal totals.\n\n<script>alert(1)</script>', description: 'legacy text', status: { status: 'in progress', type: 'custom' }, list: { id: '42' }, date_updated: String(Date.parse(date)), ...overrides };
  if (provider === 'vikunja') return { id: 17, project_id: 42, title: 'Fix rounding', description: 'Use decimal totals.\n\n<script>alert(1)</script>', done: false, updated: date, ...overrides };
  return { id: 81, number: 17, title: 'Fix rounding', body: 'Use decimal totals.\n\n<script>alert(1)</script>', state: 'open', updated_at: date, ...overrides };
}

function json(response: ServerResponse, value: unknown, headers: Record<string, string> = {}) { response.writeHead(200, { 'content-type': 'application/json', ...headers }); response.end(JSON.stringify(value)); }
function expectedError(code: string) { return (error: unknown) => { assert.ok(error instanceof TaskError); assert.equal(error.code, code); assert.ok(!error.message.includes(token)); return true; }; }

test('task source validation binds registered repositories, explicit authority and server environment credentials', () => {
  const variable = 'VLOER_TEST_TASK_SOURCE_TOKEN';
  const previous = process.env[variable];
  process.env[variable] = token;
  try {
    const valid = { id: 'orders', name: 'Order issues', provider: 'forgejo', baseUrl: 'https://forge.example/api/v1/', project: 'Team/Orders', repositoryId: 'order-service', executionOwner: 'interactive', tokenEnv: variable };
    const [configured] = validateTaskSources([valid], repositories, 'live');
    assert.equal(configured.token, token);
    assert.equal(configured.project, 'team/orders');
    assert.equal(configured.baseUrl, 'https://forge.example/api/v1');
    assert.deepEqual(publicTaskSource(configured), { id: 'orders', name: 'Order issues', provider: 'forgejo', repositoryId: 'order-service', executionOwner: 'interactive' });
    for (const change of [
      { token }, { tokenEnv: 'NOT_PRESENT_VLOER_TASK_SECRET' }, { tokenEnv: 'token$(cat)' }, { repositoryId: 'unregistered' }, { executionOwner: undefined },
      { baseUrl: 'https://user:password@forge.example/api/v1' }, { baseUrl: 'https://forge.example/api/v1?token=secret' }, { baseUrl: 'https://forge.example/api/v1#fragment' },
      { baseUrl: 'http://forge.example/api/v1' }, { baseUrl: 'file:///api/v1' }, { baseUrl: 'https://forge.example' }, { baseUrl: 'https://forge.example/%2e%2e/api/v1' },
      { project: 'team/../orders' }, { project: 'team/orders?access=secret' }, { project: 'team/%2e%2e' }, { project: 'team\\orders' }, { provider: 'linear' }, { id: '__proto__' }
    ]) assert.throws(() => validateTaskSources([{ ...valid, ...change }], repositories, 'live'));
    assert.throws(() => validateTaskSources([valid, valid], repositories, 'live'));
    assert.throws(() => validateTaskSources([valid, { ...valid, id: 'alias', executionOwner: 'ploeg' }], repositories, 'live'), /Aliases/);
    assert.equal(validateTaskSources([valid, { ...valid, id: 'alias' }], repositories, 'live').length, 2);
    assert.throws(() => validateTaskSources([valid], [{ ...repositories[0], executionOwner: 'ploeg' }], 'live'), /Ploeg-owned/);
    assert.equal(validateTaskSources(undefined, repositories, 'live').length, 0);
    assert.throws(() => validateTaskSources({}, repositories, 'live'));
  } finally { if (previous === undefined) delete process.env[variable]; else process.env[variable] = previous; }
});

test('task sources accept documented cloud and self-hosted API roots and reject ambiguous project IDs', () => {
  const cases: Array<[TaskProvider, string, string]> = [
    ['github', 'https://api.github.com', 'webgrip/orders'], ['github', 'https://enterprise.example/forge/api/v3', 'webgrip/orders'],
    ['gitlab', 'https://gitlab.example/gitlab/api/v4', 'group/subgroup/orders'], ['gitlab', 'https://gitlab.com/api/v4', '42'],
    ['clickup', 'https://api.clickup.com/api/v2', '42'], ['vikunja', 'https://tasks.example/vikunja/api/v1', '42']
  ];
  for (const [provider, baseUrl, project] of cases) {
    const raw = { id: provider, name: provider, provider, baseUrl, project, repositoryId: 'order-service', executionOwner: 'interactive' };
    assert.equal(validateTaskSources([raw], repositories, 'live')[0].baseUrl, baseUrl);
    if (provider === 'clickup' || provider === 'vikunja') for (const invalid of ['0', '-2', '0042', '1 || done = true', 'my-project']) assert.throws(() => validateTaskSources([{ ...raw, project: invalid }], repositories, 'live'));
  }
});

for (const provider of ['forgejo', 'github', 'gitlab', 'clickup', 'vikunja'] as const) {
  test(`${provider} adapter reads a scoped page and native task using its documented authorization and pagination`, async () => {
    const seen: Array<{ method: string; url: URL; headers: IncomingMessage['headers'] }> = [];
    let origin = '';
    const remote = await fixture((request, response) => {
      const url = new URL(request.url || '', origin);
      seen.push({ method: request.method || '', url, headers: request.headers });
      const one = provider === 'clickup' ? url.pathname.endsWith('/task/abc17') : url.pathname.endsWith('/17');
      if (one) json(response, issue(provider));
      else if (provider === 'clickup') json(response, { tasks: [issue(provider)], last_page: false });
      else json(response, [issue(provider), ...(provider === 'forgejo' || provider === 'github' ? [issue(provider, { number: 18, pull_request: { url: 'https://untrusted.invalid' } })] : [])], provider === 'vikunja' ? { 'x-pagination-total-pages': '4' } : { link: '<https://untrusted.invalid/steal?token=secret>; rel="next"' });
    });
    origin = remote.origin;
    try {
      const configured = source(provider, origin);
      const page = await listTasks(configured, 2);
      assert.equal(page.nextPage, 3);
      assert.equal(page.tasks.length, 1);
      const task = page.tasks[0];
      assert.equal(task.id, provider === 'clickup' ? 'abc17' : '17');
      assert.equal(task.status, 'open');
      assert.equal(task.updatedAt, date);
      assert.ok(task.description.includes('<script>alert(1)</script>'));
      assert.ok(!JSON.stringify(task).includes(token));
      assert.equal(task.repositoryId, 'order-service');
      assert.match(task.revision, /^[a-f0-9]{64}$/);
      assert.equal((await getTask(configured, task.id)).revision, task.revision);
      assert.equal(seen.length, 2);
      for (const request of seen) {
        assert.equal(request.method, 'GET');
        assert.equal(request.url.origin, origin);
        assert.ok(!request.url.href.includes(token));
        assert.equal(request.headers['private-token'], provider === 'gitlab' ? token : undefined);
        assert.equal(request.headers.authorization, provider === 'gitlab' ? undefined : provider === 'clickup' ? token : provider === 'forgejo' ? `token ${token}` : `Bearer ${token}`);
      }
      const first = seen[0].url;
      assert.equal(first.searchParams.get('page'), provider === 'clickup' ? '1' : '2');
      if (provider === 'forgejo') { assert.equal(first.pathname, '/api/v1/repos/team/orders/issues'); assert.equal(first.searchParams.get('type'), 'issues'); assert.equal(first.searchParams.get('limit'), '50'); }
      if (provider === 'github') { assert.equal(first.pathname, '/api/v3/repos/team/orders/issues'); assert.equal(seen[0].headers['x-github-api-version'], '2022-11-28'); assert.equal(first.searchParams.get('per_page'), '50'); }
      if (provider === 'gitlab') { assert.equal(first.pathname, '/api/v4/projects/team%2Forders/issues'); assert.equal(first.searchParams.get('state'), 'opened'); assert.equal(first.searchParams.get('scope'), 'all'); }
      if (provider === 'clickup') { assert.equal(first.pathname, '/api/v2/list/42/task'); assert.equal(first.searchParams.get('include_timl'), 'false'); assert.equal(first.searchParams.get('include_markdown_description'), 'true'); assert.equal(task.url, 'https://app.clickup.com/t/abc17'); }
      if (provider === 'vikunja') { assert.equal(first.pathname, '/api/v1/tasks'); assert.equal(first.searchParams.get('filter'), 'project_id = 42 && done = false'); assert.equal(task.url, `${origin}/tasks/17`); }
    } finally { await remote.close(); }
  });
}

test('canonical task identities deduplicate source aliases while material edits alter the revision', async () => {
  let current = issue('forgejo');
  const remote = await fixture((_request, response) => json(response, current));
  try {
    const configured = source('forgejo', remote.origin);
    const task = await getTask(configured, '17');
    const alias = await getTask({ ...configured, id: 'different-label', name: 'Alias' }, '17');
    assert.equal(alias.key, task.key);
    assert.equal(alias.revision, task.revision);
    assert.notEqual(alias.sourceId, task.sourceId);
    for (const changes of [{ body: 'Acceptance criteria changed without timestamp update' }, { title: 'Different task title' }, { state: 'closed' }, { updated_at: '2026-09-10T00:00:00Z' }]) {
      current = issue('forgejo', changes);
      const changed = await getTask(configured, '17');
      assert.equal(changed.key, task.key);
      assert.notEqual(changed.revision, task.revision);
    }
  } finally { await remote.close(); }
});

test('GitLab numeric and namespace aliases use project_id with iid as the stable identity', async () => {
  let origin = '';
  const remote = await fixture((_request, response) => json(response, issue('gitlab', { web_url: `${origin}/team/orders/-/issues/17` })));
  origin = remote.origin;
  try {
    const configured = source('gitlab', remote.origin);
    const named = await getTask(configured, '17');
    const numbered = await getTask({ ...configured, project: '42' }, '17');
    assert.equal(named.key, numbered.key);
    assert.equal(named.revision, numbered.revision);
    await assert.rejects(getTask({ ...configured, project: '99' }, '17'), expectedError('task_outside_source'));
  } finally { await remote.close(); }
});

test('task adapters reject global task lookups outside their configured project or home list', async () => {
  for (const provider of ['vikunja', 'clickup'] as const) {
    const payload = issue(provider, provider === 'vikunja' ? { project_id: 999 } : { list: { id: '999' } });
    const remote = await fixture((_request, response) => json(response, payload));
    try { await assert.rejects(getTask(source(provider, remote.origin), provider === 'clickup' ? 'abc17' : '17'), expectedError('task_outside_source')); }
    finally { await remote.close(); }
  }
});

test('resolved tracker credentials are scrubbed from both list and detail prose before hashing', async () => {
  const payload = issue('clickup', { name: `Fix rounding ${token}`, markdown_description: `Accidental credential echo ${token}; preserve acceptance criteria.` });
  const remote = await fixture((request, response) => json(response, request.url?.startsWith('/api/v2/task/') ? payload : { tasks: [payload] }));
  try {
    const configured = source('clickup', remote.origin);
    const task = await getTask(configured, 'abc17'); const page = await listTasks(configured);
    assert(!JSON.stringify(task).includes(token)); assert(!JSON.stringify(page).includes(token));
    assert.equal(task.revision, page.tasks[0].revision); assert.match(task.title, /\[redacted\]/); assert.match(task.description, /\[redacted\]/);
  } finally { await remote.close(); }
});

test('credential material in opaque native revisions or returned links rejects the snapshot', async () => {
  const nativeRevision = String(Date.parse(date));
  const clickup = await fixture((_request, response) => json(response, issue('clickup')));
  try { await assert.rejects(getTask({ ...source('clickup', clickup.origin), token: nativeRevision }, 'abc17'), expectedError('task_sensitive_response')); }
  finally { await clickup.close(); }
  const linkToken = 'fixture/linked-credential+unsafe';
  let origin = '';
  const gitlab = await fixture((_request, response) => json(response, issue('gitlab', { web_url: `${origin}/team/${encodeURIComponent(linkToken)}/-/issues/17` })));
  origin = gitlab.origin;
  try { await assert.rejects(getTask({ ...source('gitlab', origin), project: '42', token: linkToken }, '17'), expectedError('task_sensitive_response')); }
  finally { await gitlab.close(); }
});

test('closed tasks remain readable, unknown states fail closed, and pull requests cannot become tasks', async () => {
  for (const provider of ['forgejo', 'github', 'gitlab', 'clickup', 'vikunja'] as const) {
    let raw = issue(provider, provider === 'vikunja' ? { done: true } : provider === 'clickup' ? { status: { type: 'done' } } : { state: 'closed' });
    const remote = await fixture((_request, response) => json(response, raw));
    try {
      const configured = source(provider, remote.origin);
      const id = provider === 'clickup' ? 'abc17' : '17';
      assert.equal((await getTask(configured, id)).status, 'closed');
      raw = issue(provider, provider === 'vikunja' ? { done: 'false' } : provider === 'clickup' ? { status: { type: 'invented' } } : { state: 'invented' });
      assert.equal((await getTask(configured, id)).status, 'unknown');
      if (provider === 'forgejo' || provider === 'github') {
        raw = issue(provider, { pull_request: { url: 'https://forge.example/pulls/17' } });
        await assert.rejects(getTask(configured, id), expectedError('task_is_pull_request'));
      }
    } finally { await remote.close(); }
  }
});

test('native identifiers and pages cannot inject request paths, queries or filters', async () => {
  let requests = 0;
  const remote = await fixture((_request, response) => { requests++; json(response, []); });
  try {
    for (const provider of ['forgejo', 'github', 'gitlab', 'clickup', 'vikunja'] as const) {
      const configured = source(provider, remote.origin);
      for (const id of ['../tokens', '1?token=x', '1/../../users', '1%2fsecret', '', 'a\nAuthorization:x']) await assert.rejects(getTask(configured, id), expectedError('task_id_invalid'));
      for (const page of [0, -1, 1.5, 1001, NaN, Infinity]) await assert.rejects(listTasks(configured, page), expectedError('task_page_invalid'));
    }
    assert.equal(requests, 0);
  } finally { await remote.close(); }
});

test('remote errors and redirects never disclose bodies or forward credentials to another endpoint', async () => {
  for (const [status, code] of [[302, 'task_redirect_refused'], [401, 'task_credentials_rejected'], [403, 'task_credentials_rejected'], [404, 'task_not_found'], [429, 'task_rate_limited'], [500, 'task_service_failed']] as const) {
    let hits = 0;
    const remote = await fixture((_request, response) => { hits++; response.writeHead(status, { 'content-type': 'application/json', location: '/credential-sink' }); response.end(JSON.stringify({ error: `Do not expose ${token}` })); });
    try { await assert.rejects(listTasks(source('forgejo', remote.origin)), expectedError(code)); assert.equal(hits, 1); }
    finally { await remote.close(); }
  }
});

test('oversized, malformed and mismatched task responses fail explicitly instead of truncating evidence', async () => {
  const cases: Array<[unknown, string]> = [
    [issue('forgejo', { body: 'x'.repeat(16001) }), 'task_response_invalid'],
    [issue('forgejo', { title: 'x'.repeat(501) }), 'task_response_invalid'],
    [issue('forgejo', { number: 18 }), 'task_response_invalid'],
    [issue('forgejo', { updated_at: 'not-a-date' }), 'task_response_invalid'],
    [issue('forgejo', { body: 'null\u0000byte' }), 'task_response_invalid'],
    [{ huge: 'x'.repeat(2 * 1024 * 1024) }, 'task_response_too_large'],
    [null, 'task_response_invalid']
  ];
  for (const [payload, code] of cases) {
    const remote = await fixture((_request, response) => json(response, payload));
    try { await assert.rejects(getTask(source('forgejo', remote.origin), '17'), expectedError(code)); }
    finally { await remote.close(); }
  }
  for (const [contentType, body] of [['text/html', '<html>Login here</html>'], ['application/json', `{invalid-${token}`]]) {
    const remote = await fixture((_request, response) => { response.writeHead(200, { 'content-type': contentType }); response.end(body); });
    try { await assert.rejects(listTasks(source('forgejo', remote.origin)), expectedError('task_response_invalid')); }
    finally { await remote.close(); }
  }
});

test('task list pagination honors provider terminal headers and caps navigable pages', async () => {
  let count = 50;
  let next = '';
  const remote = await fixture((_request, response) => json(response, Array.from({ length: count }, (_, index) => issue('gitlab', { iid: index + 1 })), { 'x-next-page': next }));
  try {
    const configured = source('gitlab', remote.origin);
    assert.equal((await listTasks(configured)).nextPage, undefined);
    next = '2'; count = 1;
    assert.equal((await listTasks(configured)).nextPage, 2);
    next = '1001';
    assert.equal((await listTasks(configured, 1000)).nextPage, undefined);
    count = 101;
    await assert.rejects(listTasks(configured), expectedError('task_response_invalid'));
  } finally { await remote.close(); }
});

test('demo tasks are labeled fixtures, bound to the demo repository and unavailable in live config', async () => {
  const raw = { id: 'demo-tasks', name: 'Demo fixture tasks', provider: 'demo', baseUrl: 'https://example.invalid', project: 'order-service', repositoryId: 'order-service', executionOwner: 'interactive' };
  assert.throws(() => validateTaskSources([raw], repositories, 'live'), /demo/);
  const [configured] = validateTaskSources([raw], repositories, 'demo');
  assert.deepEqual(validateTaskSources(undefined, repositories, 'demo'), [configured]);
  const page = await listTasks(configured);
  assert.equal(page.tasks.length, 1);
  assert.equal(page.tasks[0].id, '1');
  assert.match(page.tasks[0].title, /Demo fixture/);
  assert.match(page.tasks[0].description, /without model calls or spend/);
  assert.equal(page.tasks[0].repositoryId, 'order-service');
  assert.deepEqual(await getTask(configured, '1'), page.tasks[0]);
  assert.deepEqual(await listTasks(configured, 2), { tasks: [] });
  await assert.rejects(getTask(configured, '2'), expectedError('task_not_found'));
});
