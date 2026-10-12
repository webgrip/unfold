import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { once } from 'node:events';
import { application, login } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';
import { sanitizeBuffer } from '../src/reports.ts';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

type Call = { method: string; path: string; type: string; body: Buffer };

async function tracker(answer: (call: Call) => { status: number; body: unknown }): Promise<{ url: string; calls: Call[]; close: () => Promise<void> }> {
  const calls: Call[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const call = { method: req.method ?? '', path: req.url ?? '', type: String(req.headers['content-type'] ?? ''), body: Buffer.concat(chunks) };
    calls.push(call);
    const { status, body } = answer(call);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}/api/v1`, calls, close: () => new Promise<void>(done => { server.close(() => done()); server.closeIdleConnections(); }) };
}

function report(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('title', 'The Now page shows a stale count');
  form.append('happened', 'The waiting count said 9 but only 7 rows were listed.');
  form.append('expected', 'The count matches the rows.');
  form.append('kind', 'broken');
  form.append('impact', 'blocks');
  form.append('context', JSON.stringify({ route: '#now?since=secret', screen: 'now', workItemId: 42, browser: 'Chrome 141 on Linux', viewport: '1280×900', locale: 'nl-NL', element: 'button “Approve” in “Delivery gate”', trail: ['#work', '#now?since=secret', 'javascript:alert(1)'], token: 'must not travel' }));
  form.append('screenshot', new Blob([png], { type: 'image/png' }), 'screenshot.png');
  form.append('console', new Blob([JSON.stringify([{ level: 'error', message: 'TypeError: x is undefined', source: '/now.js?v=1', line: 12, at: '2026-10-11T10:00:00.000Z', stack: 'secret stack' }])], { type: 'application/json' }), 'console.json');
  form.append('requests', new Blob([JSON.stringify([{ method: 'GET', path: '/api/work?token=abc', status: 500, durationMs: 120, at: '2026-10-11T10:00:00.000Z', headers: { authorization: 'Bearer secret' }, body: '{"password":"x"}' }])], { type: 'application/json' }), 'requests.json');
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

async function post(url: string, cookie: string, form: FormData) {
  const response = await fetch(`${url}/api/reports`, { method: 'POST', headers: { cookie, 'x-unfold-request': '1' }, body: form });
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text), text };
}

function forgejoSource(baseUrl: string) {
  return { id: 'forge', name: 'Forgejo', provider: 'forgejo' as const, baseUrl, project: 'webgrip/unfold', repositoryId: 'order-service', token: 'forgejo-test-token', executionOwner: 'interactive' as const };
}

test('a report is filed as a Forgejo issue with three attachments, the screenshot in its body and its address shown', async t => {
  const forgejo = await tracker(call => {
    if (call.path.startsWith('/api/v1/repos/webgrip/unfold/labels')) return { status: 200, body: [{ id: 7, name: 'reported-in-app' }] };
    if (call.method === 'POST' && call.path === '/api/v1/repos/webgrip/unfold/issues') return { status: 201, body: { id: 9001, number: 252, html_url: 'https://forgejo.test/webgrip/unfold/issues/252' } };
    if (call.method === 'POST' && call.path.startsWith('/api/v1/repos/webgrip/unfold/issues/252/assets')) return { status: 201, body: { uuid: 'u', browser_download_url: `https://forgejo.test/attachments/${new URL(call.path, 'http://x').searchParams.get('name')}` } };
    if (call.method === 'PATCH' && call.path === '/api/v1/repos/webgrip/unfold/issues/252') return { status: 201, body: {} };
    return { status: 404, body: {} };
  });
  t.after(() => forgejo.close());
  const app = await application('live', config => { config.taskSources = [forgejoSource(forgejo.url)]; config.reports = { source: forgejoSource(forgejo.url), project: 'webgrip/unfold' }; config.baseUrl = undefined; });
  t.after(() => app.close());
  const { cookie } = await login(app.url);

  const filed = await post(app.url, cookie, report());
  assert.equal(filed.status, 201, filed.text);
  assert.deepEqual({ status: filed.body.status, url: filed.body.url }, { status: 'filed', url: 'https://forgejo.test/webgrip/unfold/issues/252' });

  const created = forgejo.calls.find(call => call.method === 'POST' && call.path.endsWith('/issues'))!;
  assert.equal(created.type, 'application/json');
  const issue = JSON.parse(created.body.toString());
  assert.equal(issue.title, 'The Now page shows a stale count');
  assert.deepEqual(issue.labels, [7], 'the reported-in-app label is used when the repository has it');
  assert.match(issue.body, /## What went wrong\n\nThe waiting count said 9/);
  assert.match(issue.body, /\| Impact \| Blocks me \|/);
  assert.match(issue.body, /\| Pointed at \| button “Approve” in “Delivery gate” \|/);
  assert.match(issue.body, /\| Pages before \| #work → #now \|/, 'the trail keeps hash routes without their queries');
  assert.match(issue.body, /\| Page \| #now \|/, 'the query string never reaches the tracker');
  assert.match(issue.body, /\| Work Item \| 42 \|/);
  assert.doesNotMatch(issue.body, /must not travel/);

  const uploads = forgejo.calls.filter(call => call.path.includes('/assets'));
  assert.deepEqual(uploads.map(call => new URL(call.path, 'http://x').searchParams.get('name')), ['screenshot.png', 'console.json', 'requests.json']);
  for (const upload of uploads) assert.match(upload.type, /^multipart\/form-data; boundary=/);
  const requestsUpload = uploads[2].body.toString();
  assert.match(requestsUpload, /"path": "\/api\/work"/);
  assert.doesNotMatch(requestsUpload, /token=abc|authorization|Bearer secret|password/, 'no query string, header or body is kept');
  assert.doesNotMatch(uploads[1].body.toString(), /secret stack|\?v=1/);

  const patched = forgejo.calls.find(call => call.method === 'PATCH')!;
  assert.match(JSON.parse(patched.body.toString()).body, /!\[Screenshot\]\(https:\/\/forgejo\.test\/attachments\/screenshot\.png\)/);
  assert.equal(forgejo.calls.find(call => call.path.endsWith('/issues'))!.method, 'POST');
  const row = app.app.store.db.prepare('SELECT status, url FROM reports').get() as Record<string, string>;
  assert.deepEqual({ ...row }, { status: 'filed', url: 'https://forgejo.test/webgrip/unfold/issues/252' });
});

test('a report is filed as a Vikunja task with its files attached and its address shown', async t => {
  const vikunja = await tracker(call => {
    if (call.method === 'PUT' && call.path === '/api/v1/projects/12/tasks') return { status: 201, body: { id: 1996, identifier: '#7' } };
    if (call.method === 'PUT' && call.path === '/api/v1/tasks/1996/attachments') return { status: 200, body: { success: [{ id: 1 }] } };
    return { status: 404, body: {} };
  });
  t.after(() => vikunja.close());
  const app = await application('live', config => {
    const board = { id: 'board', name: 'Board', provider: 'vikunja' as const, baseUrl: vikunja.url, project: '12', repositoryId: 'order-service', token: 'vikunja-test-token', executionOwner: 'interactive' as const };
    config.taskSources = [board];
    config.reports = { source: board, project: '12' };
  });
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const filed = await post(app.url, cookie, report());
  assert.equal(filed.status, 201, filed.text);
  assert.equal(filed.body.status, 'filed');
  assert.match(filed.body.url, /\/tasks\/1996$/);
  const task = JSON.parse(vikunja.calls[0].body.toString());
  assert.match(task.description, /^<h2>What went wrong<\/h2><p>The waiting count said 9/);
  assert.equal(vikunja.calls.filter(call => call.path === '/api/v1/tasks/1996/attachments').length, 3);
  assert(vikunja.calls.filter(call => call.path.endsWith('/attachments')).every(call => call.body.includes('name="files"')), 'Vikunja receives each file in the files field');
});

test('a refusing tracker keeps the report, says it will retry, and the retry continues the same issue', async t => {
  let refuseAssets = true;
  const forgejo = await tracker(call => {
    if (call.path.includes('/labels')) return { status: 200, body: [] };
    if (call.method === 'POST' && call.path.endsWith('/issues')) return { status: 201, body: { id: 1, number: 5, html_url: 'https://forgejo.test/webgrip/unfold/issues/5' } };
    if (call.path.includes('/assets')) return refuseAssets ? { status: 503, body: { message: 'storage full' } } : { status: 201, body: { browser_download_url: 'https://forgejo.test/a.png' } };
    if (call.method === 'PATCH') return { status: 201, body: {} };
    return { status: 404, body: {} };
  });
  t.after(() => forgejo.close());
  const app = await application('live', config => { config.taskSources = [forgejoSource(forgejo.url)]; config.reports = { source: forgejoSource(forgejo.url), project: 'webgrip/unfold' }; });
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
  t.after(() => { console.error = original; });

  const saved = await post(app.url, cookie, report());
  assert.equal(saved.status, 201, saved.text);
  assert.deepEqual({ status: saved.body.status, message: saved.body.message }, { status: 'retrying', message: 'Saved. Unfold will file it when the tracker answers.' });
  assert(errors.some(line => line.includes('report.file_failed') && line.includes('storage full')));

  refuseAssets = false;
  app.app.store.db.prepare('UPDATE reports SET next_attempt_at=?').run(new Date(Date.now() - 1000).toISOString());
  await app.app.reports.retryDue();
  const row = app.app.store.db.prepare('SELECT status, url, attempts FROM reports').get() as Record<string, string | number>;
  assert.equal(row.status, 'filed', 'the retry filed it once the tracker recovered');
  assert.equal(row.attempts, 2);
  assert.equal(forgejo.calls.filter(call => call.method === 'POST' && call.path.endsWith('/issues')).length, 1, 'the retry continued the issue instead of filing a second one');
});

test('a report must say what happened, carry only allowed files and stay under the size limit; viewers may report', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const missing = await post(app.url, cookie, report({ happened: ' ' }));
  assert.equal(missing.status, 422);
  assert.equal(missing.body.error.code, 'report_field_missing');
  const bad = report();
  bad.set('screenshot', new Blob(['not a png'], { type: 'image/png' }), 'screenshot.png');
  assert.equal((await post(app.url, cookie, bad)).body.error.code, 'report_screenshot_invalid');
  const extra = report();
  extra.append('replay', new Blob(['{}']), 'replay.json');
  assert.equal((await post(app.url, cookie, extra)).body.error.code, 'report_attachment_unknown');
  const huge = report();
  huge.set('screenshot', new Blob([png, new Uint8Array(9 * 1024 * 1024)], { type: 'image/png' }), 'screenshot.png');
  assert.equal((await post(app.url, cookie, huge)).status, 413);
  assert.equal((await post(app.url, cookie, report({ kind: 'rant' }))).body.error.code, 'report_kind_invalid');
  assert.equal((await post(app.url, cookie, report({ kind: 'idea' }))).body.error.code, 'report_impact_invalid', 'an idea has no impact');
  const json = await fetch(`${app.url}/api/reports`, { method: 'POST', headers: { cookie, 'x-unfold-request': '1', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(json.status, 415);

  app.app.store.addUser({ id: 'viewer-iris', name: 'iris@example.test', role: 'viewer', passwordHash: await hashPassword('viewer-password-1414') });
  const viewer = await login(app.url, 'iris@example.test', 'viewer-password-1414');
  const kept = await post(app.url, viewer.cookie, report());
  assert.equal(kept.status, 201, kept.text);
  assert.equal(kept.body.status, 'kept', 'with no tracker configured the report is kept in Unfold');
  assert.match(kept.body.message, /No tracker is set up for reports/);
});

test('an idea is filed under its own heading without an expectation, and each person lists only their own reports, newest first', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const form = report({ kind: 'idea', title: 'Idea for Runs: filter by repository' });
  form.delete('impact');
  const kept = await post(app.url, cookie, form);
  assert.equal(kept.status, 201, kept.text);
  const stored = app.app.store.report(kept.body.id)!;
  assert.deepEqual({ kind: stored.body.kind, expected: stored.body.expected, impact: stored.body.impact }, { kind: 'idea', expected: '', impact: undefined });
  const { markdownBody } = await import('../src/reports.ts');
  assert.match(markdownBody(stored, '1.0.0'), /^## What would help\n/);
  assert.doesNotMatch(markdownBody(stored, '1.0.0'), /What I expected/);
  await post(app.url, cookie, report({ title: 'Second' }));

  app.app.store.addUser({ id: 'viewer-iris', name: 'iris@example.test', role: 'viewer', passwordHash: await hashPassword('viewer-password-1414') });
  const viewer = await login(app.url, 'iris@example.test', 'viewer-password-1414');
  const list = async (as: string) => (await (await fetch(`${app.url}/api/reports`, { headers: { cookie: as, 'x-unfold-request': '1' } })).json()).reports;
  const mine = await list(cookie);
  assert.deepEqual(mine.map((entry: { title: string; status: string }) => [entry.title, entry.status]), [['Second', 'kept'], ['Idea for Runs: filter by repository', 'kept']]);
  assert.deepEqual(Object.keys(mine[0]).sort(), ['createdAt', 'id', 'status', 'title'], 'no body, context or error text in the list');
  assert.deepEqual(await list(viewer.cookie), [], 'another person never sees these');
});

test('the demo says it is one and files nothing', async t => {
  const app = await application('demo');
  t.after(() => app.close());
  const kept = await post(app.url, '', report());
  assert.equal(kept.status, 201, kept.text);
  assert.deepEqual({ status: kept.body.status, message: kept.body.message }, { status: 'kept', message: 'This is the demo: Unfold kept the report and filed nothing.' });
});

test('the browser buffers are reduced to their allowed fields whatever the page sent', () => {
  assert.deepEqual(sanitizeBuffer('requests', [{ method: 'POST', path: '/api/reports?x=1#y', status: 502, durationMs: 9, headers: { cookie: 'c' }, body: 'b', at: '2026-10-11T10:00:00Z' }, { method: 'get', path: 'https://evil.test/' }]), [{ method: 'POST', path: '/api/reports', status: 502, durationMs: 9, at: '2026-10-11T10:00:00.000Z' }]);
  assert.deepEqual(sanitizeBuffer('console', [{ level: 'log', message: 'x'.repeat(600), source: 'https://unfold.test/app.js?token=1', line: 3, args: [{ password: 'p' }] }]), [{ level: 'error', message: 'x'.repeat(500), source: 'https://unfold.test/app.js', line: 3 }]);
  assert.equal(sanitizeBuffer('requests', Array.from({ length: 40 }, () => ({ method: 'GET', path: '/a' }))).length, 20);
  assert.deepEqual(sanitizeBuffer('console', 'not a list'), []);
});

test('reports never default to, or land in, a project Ploeg dispatches work from', async () => {
  const { reportSettings } = await import('../src/reports.ts');
  const dispatch = { id: 'ploeg-board', name: 'Ploeg board', provider: 'vikunja' as const, baseUrl: 'https://vikunja.test/api/v1', project: '11', repositoryId: 'ploeg', token: 't', executionOwner: 'ploeg' as const };
  const own = { ...dispatch, id: 'feedback', name: 'Feedback', project: '30', executionOwner: 'interactive' as const };
  assert.equal(reportSettings(undefined, [dispatch], 'live'), null, 'a dispatch board is never the default target');
  assert.deepEqual(reportSettings(undefined, [dispatch, own], 'live'), { source: own, project: '30' });
  assert.throws(() => reportSettings({ source: 'ploeg-board' }, [dispatch], 'live'), /Ploeg dispatches the tasks there/);
  assert.deepEqual(reportSettings({ source: 'ploeg-board', project: '30' }, [dispatch], 'live'), { source: dispatch, project: '30' }, 'the same tracker in another project is fine');
  assert.equal(reportSettings(false, [own], 'live'), null);
  assert.equal(reportSettings(undefined, [own], 'demo'), null, 'the demo never files');
  assert.throws(() => reportSettings({ source: 'nope' }, [own], 'live'), /must name a Forgejo or Vikunja task source/);
});

test('reports can have a connection of their own, which is not a task source, and a missing token turns filing off instead of stopping Unfold', async t => {
  const { reportSettings } = await import('../src/reports.ts');
  const previous = process.env.UNFOLD_REPORTS_TEST_TOKEN;
  t.after(() => { if (previous === undefined) delete process.env.UNFOLD_REPORTS_TEST_TOKEN; else process.env.UNFOLD_REPORTS_TEST_TOKEN = previous; });
  const sources = [{ id: 'ploeg-board', name: 'Ploeg board', provider: 'vikunja' as const, baseUrl: 'https://vikunja.test/api/v1', project: '11', repositoryId: 'ploeg', token: 't', executionOwner: 'ploeg' as const }];
  const raw = { provider: 'forgejo', baseUrl: 'https://forgejo.test/api/v1', project: 'WebGrip/Unfold', tokenEnv: 'UNFOLD_REPORTS_TEST_TOKEN' };
  process.env.UNFOLD_REPORTS_TEST_TOKEN = 'reports-token';
  const target = reportSettings(raw, sources, 'live');
  assert.equal(target?.project, 'webgrip/unfold');
  assert.deepEqual({ provider: target?.source.provider, baseUrl: target?.source.baseUrl, token: target?.source.token, executionOwner: target?.source.executionOwner }, { provider: 'forgejo', baseUrl: 'https://forgejo.test/api/v1', token: 'reports-token', executionOwner: 'interactive' });
  assert.equal(sources.length, 1, 'the connection is not added to the task sources, so the Tasks page never lists it');

  delete process.env.UNFOLD_REPORTS_TEST_TOKEN;
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
  t.after(() => { console.error = original; });
  assert.equal(reportSettings(raw, sources, 'live'), null, 'Unfold starts and keeps reports');
  assert(errors.some(line => line.includes('reports.token_missing') && line.includes('UNFOLD_REPORTS_TEST_TOKEN')));

  assert.throws(() => reportSettings({ ...raw, provider: 'github' }, sources, 'live'), /reports.provider must be forgejo or vikunja/);
  assert.throws(() => reportSettings({ ...raw, baseUrl: 'http://forgejo.test/api/v1' }, sources, 'live'), /HTTPS/);
  assert.throws(() => reportSettings({ ...raw, project: 'not a repo' }, sources, 'live'), /owner\/repository/);
  assert.throws(() => reportSettings({ ...raw, source: 'ploeg-board' }, sources, 'live'), /provider, baseUrl, project and tokenEnv only/);
});

test('a configuration with its own report connection loads, keeps the task sources as they were, and the server files with it', async t => {
  const forgejo = await tracker(call => {
    if (call.path.includes('/labels')) return { status: 200, body: [] };
    if (call.method === 'POST' && call.path.endsWith('/issues')) return { status: 201, body: { id: 3, number: 9, html_url: 'https://forgejo.test/webgrip/unfold/issues/9' } };
    if (call.path.includes('/assets')) return { status: 201, body: { browser_download_url: 'https://forgejo.test/a.png' } };
    return { status: 201, body: {} };
  });
  t.after(() => forgejo.close());
  const { reportSettings } = await import('../src/reports.ts');
  process.env.UNFOLD_REPORTS_SERVER_TOKEN = 'server-token';
  t.after(() => { delete process.env.UNFOLD_REPORTS_SERVER_TOKEN; });
  const app = await application('live', config => { config.reports = reportSettings({ provider: 'forgejo', baseUrl: forgejo.url, project: 'webgrip/unfold', tokenEnv: 'UNFOLD_REPORTS_SERVER_TOKEN' }, config.taskSources, 'live'); });
  t.after(() => app.close());
  assert(!app.config.taskSources?.some(source => source.id === 'reports'), 'no task source was added');
  const { cookie } = await login(app.url);
  const filed = await post(app.url, cookie, report());
  assert.equal(filed.body.status, 'filed', filed.text);
  assert.equal(filed.body.url, 'https://forgejo.test/webgrip/unfold/issues/9');
});
