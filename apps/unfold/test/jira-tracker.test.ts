import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { attachToIssue, commentOnIssue, createIssue, getTask, handoffUnsupported, listTasks, presentTask, readIssueState, TaskError, validateTaskSources, type TaskSourceConfig } from '../src/tasks.ts';
import { adfToHtml, adfToText, markdownToAdf } from '../src/task-providers/adf.ts';
import type { Repository } from '../src/types.ts';

const repositories: Repository[] = [{ id: 'shop', name: 'Shop', description: '', url: 'https://forge.example/acme/shop.git', baseBranch: 'main', verify: ['npm', 'test'] }];
const credential = 'svc-unfold@acme.example:jira-api-token-0123456789';
const basic = `Basic ${Buffer.from(credential).toString('base64')}`;
const cloud = '0b3c9a1e-7d2f-4c8e-9a6b-5e4d3c2b1a09';

type Call = { method: string; path: string; authorization: string; xsrf: string; type: string; body: string };

const description = {
  type: 'doc', version: 1, content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Acceptance' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Bold', marks: [{ type: 'strong' }] }, { type: 'text', text: ' and ' }, { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://docs.example/a' } }] }, { type: 'text', text: ' and ' }, { type: 'text', text: 'trap', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }, { type: 'hardBreak' }, { type: 'mention', attrs: { id: 'x', text: '@Ada' } }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }] },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1 < 2;' }] },
    { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'm', type: 'file' } }] },
  ],
};

const issue = (key: string, project: string, summary: string, category = 'indeterminate') => ({
  id: String(10000 + Number(key.split('-')[1])), key,
  fields: { summary, description, project: { key: project }, status: { name: 'In Progress', statusCategory: { key: category } }, updated: '2026-10-30T10:15:00.000+0100', labels: ['checkout'], assignee: { accountId: '5b10a', displayName: 'Ada Lovelace', emailAddress: 'ada@acme.example' }, priority: { id: '2', name: 'High' }, duedate: '2026-11-15' },
});

async function fakeJira() {
  const calls: Call[] = [];
  const comments: unknown[] = [];
  let origin = '';
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString();
    const raw = request.url ?? '/';
    calls.push({ method: request.method ?? 'GET', path: raw, authorization: String(request.headers.authorization ?? ''), xsrf: String(request.headers['x-atlassian-token'] ?? ''), type: String(request.headers['content-type'] ?? ''), body });
    const reply = (status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json;charset=UTF-8' }); response.end(JSON.stringify(value)); };
    if (request.headers.authorization !== basic) return reply(401, { errorMessages: ['unauthorized'] });
    const url = new URL(raw, 'http://jira.invalid');
    const path = url.pathname.replace(`/ex/jira/${cloud}`, '');
    if (path === '/rest/api/3/serverInfo') return reply(200, { baseUrl: origin, deploymentType: 'Cloud' });
    if (path === '/rest/api/3/search/jql') {
      const project = /project = "([A-Z]+)"/.exec(url.searchParams.get('jql') ?? '')?.[1];
      const token = url.searchParams.get('nextPageToken');
      if (!token) return reply(200, { issues: [issue(`${project}-3`, project!, 'Fix the basket total'), issue(`${project}-2`, project!, 'Closed already', 'done')], nextPageToken: `${project}-page-2`, isLast: false });
      if (token === `${project}-page-2`) return reply(200, { issues: [issue(`${project}-1`, project!, 'Older work')], isLast: true });
      return reply(400, { errorMessages: ['bad token'] });
    }
    if (path === '/rest/api/3/issue/OPS-3') return reply(200, issue('OPS-3', 'OPS', 'Fix the basket total'));
    if (path === '/rest/api/3/issue/OPS-9') return reply(200, issue('OPS-9', 'WEB', 'Elsewhere'));
    if (path === '/rest/api/3/myself') return reply(200, { accountId: 'svc-1', displayName: 'Unfold' });
    if (path === '/rest/api/3/issue/createmeta/OPS/issuetypes') return reply(200, { maxResults: 50, startAt: 0, total: 3, issueTypes: [{ id: '10001', name: 'Task', subtask: false }, { id: '10003', name: 'Sub-task', subtask: true }, { id: '10004', name: 'Bug', subtask: false }] });
    if (request.method === 'POST' && path === '/rest/api/3/issue') return reply(201, { id: '10042', key: 'OPS-42', self: `${origin}/rest/api/3/issue/10042` });
    if (request.method === 'POST' && path === '/rest/api/3/issue/OPS-42/attachments') return reply(200, [{ id: '1', filename: 'screenshot.png' }]);
    if (request.method === 'POST' && path === '/rest/api/3/issue/OPS-42/comment') { comments.push(JSON.parse(body).body); return reply(201, { id: '7' }); }
    if (path === '/rest/api/3/issue/OPS-42') return reply(200, { key: 'OPS-42', fields: { status: { statusCategory: { key: 'done' } }, labels: ['triage'], assignee: null, resolutiondate: '2026-10-30T12:00:00.000+0000' } });
    if (path === '/rest/api/3/issue/OPS-42/comment') return reply(200, { comments: [
      { id: '8', author: { accountId: 'dev-2' }, created: '2026-10-30T11:00:00.000+0000', body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fixed in ' }, { type: 'text', text: 'main', marks: [{ type: 'code' }] }] }] } },
      { id: '7', author: { accountId: 'svc-1' }, created: '2026-10-30T10:00:00.000+0000', body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From Unfold' }] }] } },
    ] });
    reply(404, { errorMessages: ['Issue does not exist or you do not have permission to see it.'] });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  return { calls, comments, origin, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

function jiraSource(baseUrl: string, project = 'OPS', executionOwner: 'interactive' | 'ploeg' = 'interactive'): TaskSourceConfig {
  process.env.UNFOLD_TEST_JIRA_TOKEN = credential;
  return validateTaskSources([{ id: `jira-${project.toLowerCase()}`, name: `Acme · Jira ${project}`, provider: 'jira', baseUrl, project, repositoryId: 'shop', tokenEnv: 'UNFOLD_TEST_JIRA_TOKEN', executionOwner }], repositories, 'live')[0];
}

const searches = (calls: Call[]) => calls.filter(call => call.path.startsWith('/rest/api/3/search/jql')).map(call => Object.fromEntries(new URL(call.path, 'http://x').searchParams));

test('a Jira source accepts only a site or gateway API root and a project key', () => {
  process.env.UNFOLD_TEST_JIRA_TOKEN = credential;
  const config = (baseUrl: string, project = 'OPS') => validateTaskSources([{ id: 'j', name: 'J', provider: 'jira', baseUrl, project, repositoryId: 'shop', tokenEnv: 'UNFOLD_TEST_JIRA_TOKEN', executionOwner: 'interactive' }], repositories, 'live')[0];
  assert.equal(config('https://acme.atlassian.net/rest/api/3/').baseUrl, 'https://acme.atlassian.net/rest/api/3');
  assert.equal(config(`https://api.atlassian.com/ex/jira/${cloud}/rest/api/3`).baseUrl, `https://api.atlassian.com/ex/jira/${cloud}/rest/api/3`);
  assert.throws(() => config('https://jira.example/rest/api/3'), /Jira baseUrl must be/);
  assert.throws(() => config('https://acme.atlassian.net/rest/api/2'), /Jira baseUrl must be/);
  assert.throws(() => config('https://api.atlassian.com/ex/jira/not-a-cloud/rest/api/3'), /Jira baseUrl must be/);
  assert.throws(() => config('https://acme.atlassian.net/rest/api/3', 'ops'), /Jira project key/);
  assert.throws(() => config('https://acme.atlassian.net/rest/api/3', 'OPS" OR project = "HR'), /Jira project key/);
  assert.match(handoffUnsupported(config('https://acme.atlassian.net/rest/api/3'), { url: 'https://ploeg.example', tokenEnv: 'P' }) ?? '', /^Only Vikunja and ClickUp tasks can be handed to Ploeg/);
});

test('Jira lists open issues with JQL and pages by nextPageToken, walking from the last page it knows', async t => {
  const jira = await fakeJira();
  t.after(() => jira.close());
  const source = jiraSource(`${jira.origin}/rest/api/3`);
  const first = await listTasks(source, 1);
  assert.deepEqual(first.tasks.map(task => task.id), ['OPS-3'], 'an issue in the Done category is dropped even when JQL let it through');
  assert.equal(first.nextPage, 2);
  const second = await listTasks(source, 2);
  assert.deepEqual(second.tasks.map(task => task.id), ['OPS-1']);
  assert.equal(second.nextPage, undefined, 'isLast ends the paging');
  const fields = 'summary,description,status,updated,labels,assignee,priority,duedate,project';
  const jql = 'project = "OPS" AND statusCategory != Done ORDER BY updated DESC, key DESC';
  assert.deepEqual(searches(jira.calls), [{ jql, maxResults: '50', fields }, { jql, maxResults: '50', fields, nextPageToken: 'OPS-page-2' }]);
  assert.ok(jira.calls.every(call => call.method === 'GET' && call.authorization === basic && call.xsrf === 'no-check'), 'every read carries the email and token as Basic credentials');
  assert.ok(jira.calls.every(call => !call.path.includes('jira-api-token')), 'the token never appears in a URL');

  jira.calls.length = 0;
  const web = jiraSource(`${jira.origin}/rest/api/3`, 'WEB');
  assert.deepEqual((await listTasks(web, 2)).tasks.map(task => task.id), ['WEB-1'], 'a page whose token is not known yet is reached by walking from page 1');
  assert.deepEqual(searches(jira.calls).map(query => query.nextPageToken ?? null), [null, 'WEB-page-2']);
  await assert.rejects(listTasks(web, 4), (error: unknown) => error instanceof TaskError && error.code === 'task_page_missing');
});

test('a Jira issue reads as escaped HTML from its ADF description and shows as Markdown', async t => {
  const jira = await fakeJira();
  t.after(() => jira.close());
  const source = jiraSource(`${jira.origin}/rest/api/3`);
  const task = await getTask(source, 'OPS-3');
  assert.equal(jira.calls[0].path, `/rest/api/3/issue/OPS-3?fields=${encodeURIComponent('summary,description,status,updated,labels,assignee,priority,duedate,project')}`);
  assert.equal(task.url, `${jira.origin}/browse/OPS-3`);
  assert.equal(task.status, 'open');
  assert.equal(task.updatedAt, '2026-10-30T09:15:00.000Z');
  assert.equal(task.identifier, 'OPS-3');
  assert.deepEqual(task.labels, [{ name: 'checkout' }]);
  assert.deepEqual(task.assignees, [{ username: 'Ada Lovelace', name: 'ada@acme.example' }]);
  assert.equal(task.priority, 2);
  assert.equal(task.dueAt, '2026-11-15T00:00:00.000Z');
  assert.ok(task.description.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'ADF text is escaped, never markup');
  assert.ok(!task.description.includes('javascript:'), 'only http, https and mailto links survive');
  assert.ok(task.description.includes('<a href="https://docs.example/a">docs</a>'));
  const shown = presentTask(source, task).descriptionMarkdown;
  assert.match(shown, /## Acceptance/);
  assert.match(shown, /\*\*Bold\*\* and \[docs\]\(https:\/\/docs\.example\/a\) and trap/);
  assert.match(shown, /- one\n- two/);
  assert.match(shown, /const a = 1 < 2;/);
  assert.match(shown, /\[attachment\]/);
  await assert.rejects(getTask(source, 'OPS-9'), (error: unknown) => error instanceof TaskError && error.code === 'task_outside_source');
  await assert.rejects(getTask(source, 'ops-3'), (error: unknown) => error instanceof TaskError && error.code === 'task_id_invalid');
});

test('a gateway API root learns the site address from /serverInfo before it builds links', async t => {
  const jira = await fakeJira();
  t.after(() => jira.close());
  const source = jiraSource(`${jira.origin}/ex/jira/${cloud}/rest/api/3`);
  const task = await getTask(source, 'OPS-3');
  assert.equal(task.url, `${jira.origin}/browse/OPS-3`);
  assert.deepEqual(jira.calls.map(call => call.path.replace(/\?.*$/, '')), [`/ex/jira/${cloud}/rest/api/3/serverInfo`, `/ex/jira/${cloud}/rest/api/3/issue/OPS-3`]);
  await getTask(source, 'OPS-3');
  assert.equal(jira.calls.filter(call => call.path.endsWith('/serverInfo')).length, 1, 'the site address is read once');
});

test('Report a problem files a Jira Bug with an ADF body, attaches files, comments and follows its state', async t => {
  const jira = await fakeJira();
  t.after(() => jira.close());
  const source = jiraSource(`${jira.origin}/rest/api/3`);
  const body = '## Something is broken\n\nI pressed **Save** &amp; nothing\\_happened.\n\n| | |\n| --- | --- |\n| Page | [Tasks](https://unfold.example/#tasks) |\n\n_Filed with Report a problem in Unfold._\n';
  const filed = await createIssue(source, 'OPS', 'The Save button\ndoes nothing', body);
  assert.deepEqual(filed, { id: '10042', number: 'OPS-42', url: `${jira.origin}/browse/OPS-42` });
  const created = jira.calls.find(call => call.method === 'POST' && call.path === '/rest/api/3/issue')!;
  assert.equal(created.type, 'application/json');
  assert.deepEqual(JSON.parse(created.body), { fields: { project: { key: 'OPS' }, issuetype: { id: '10004' }, summary: 'The Save button does nothing', description: {
    type: 'doc', attrs: { version: 1 }, content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Something is broken' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'I pressed ' }, { type: 'text', text: 'Save', marks: [{ type: 'strong' }] }, { type: 'text', text: ' & nothing_happened.' }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [] }] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Page' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tasks', marks: [{ type: 'link', attrs: { href: 'https://unfold.example/#tasks' } }] }] }] }] },
      ] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Filed with Report a problem in Unfold.', marks: [{ type: 'em' }] }] },
    ] } } }, 'the Bug type is chosen over Task, the summary is one line and the body is ADF');

  assert.equal(await attachToIssue(source, 'OPS', filed, { name: 'screenshot.png', type: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }), undefined);
  const upload = jira.calls.find(call => call.path === '/rest/api/3/issue/OPS-42/attachments')!;
  assert.equal(upload.xsrf, 'no-check', 'Jira refuses a multipart upload without the XSRF header');
  assert.match(upload.type, /^multipart\/form-data; boundary=/);
  assert.match(upload.body, /name="file"; filename="screenshot.png"/);

  await commentOnIssue(source, 'OPS', filed, '**Ada** adds, from Unfold:\n\nIt also fails on Firefox.\n');
  assert.deepEqual(jira.comments, [{ type: 'doc', attrs: { version: 1 }, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Ada', marks: [{ type: 'strong' }] }, { type: 'text', text: ' adds, from Unfold:' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'It also fails on Firefox.' }] },
  ] }]);

  const state = await readIssueState(source, 'OPS', filed, '1.2.3');
  assert.deepEqual(state, { open: false, closedAt: '2026-10-30T12:00:00.000Z', labels: ['triage'], assigned: false, comments: [
    { id: '7', author: 'svc-1', text: 'From Unfold', at: '2026-10-30T10:00:00.000Z', mine: true },
    { id: '8', author: 'dev-2', text: 'Fixed in main', at: '2026-10-30T11:00:00.000Z', mine: false },
  ] }, 'comments come oldest first, and the token\'s own come from GET /myself');
  assert.ok(jira.calls.some(call => call.path === '/rest/api/3/issue/OPS-42/comment?orderBy=-created&maxResults=10'));
  assert.ok(jira.calls.some(call => call.path === '/rest/api/3/myself'));
});

test('ADF conversion is bounded and keeps unknown nodes as their text', () => {
  let deep: Record<string, unknown> = { type: 'text', text: 'bottom' };
  for (let depth = 0; depth < 200; depth++) deep = { type: 'paragraph', content: [deep] };
  assert.doesNotMatch(adfToHtml({ type: 'doc', content: [deep] }), /bottom/, 'nesting beyond the depth limit is cut off');
  assert.equal(adfToHtml({ type: 'doc', content: [{ type: 'futureNode', content: [{ type: 'text', text: 'kept' }] }] }), 'kept');
  assert.equal(adfToHtml('<b>plain</b>'), '<p>&lt;b&gt;plain&lt;/b&gt;</p>');
  assert.equal(adfToHtml(null), '');
  assert.equal(adfToHtml({ type: 'paragraph' }), '', 'only a document converts');
  assert.equal(adfToText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] }), 'a\n\nb');
  assert.deepEqual(markdownToAdf('[x](javascript:void)').content, [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }], 'an unsafe link becomes plain text');
  assert.deepEqual(markdownToAdf('```\nconst a = 1;\n```').content, [{ type: 'codeBlock', content: [{ type: 'text', text: 'const a = 1;' }] }]);
});
