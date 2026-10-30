import type { FiledIssue, TaskPage, TaskSourceConfig } from '../tasks.ts';
import type { FileRequest, IssueFiling, TaskProviderAdapter, TaskRequest } from './registry.ts';
import { adfToHtml, adfToText, markdownToAdf } from './adf.ts';
import { field, maxPage, nativeTaskId, record, TaskError, when } from './shared.ts';

const issueKey = /^[A-Z][A-Z0-9_]{1,9}-[1-9][0-9]{0,9}$/;
const projectKey = /^[A-Z][A-Z0-9_]{1,9}$/;
const gatewayPath = /^\/ex\/jira\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/rest\/api\/3$/;
const pageSize = 50;
const maxWalk = 10;
const fields = 'summary,description,status,updated,labels,assignee,priority,duedate,project';
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

const sites = new Map<string, string>();
const pageTokens = new Map<string, string>();
const tokenKey = (source: TaskSourceConfig, page: number) => `${source.baseUrl}\u0000${source.project}\u0000${source.token ?? ''}\u0000${page}`;
const remember = (key: string, token: string) => { if (pageTokens.size >= 500) pageTokens.delete(pageTokens.keys().next().value!); pageTokens.set(key, token); };

function gateway(source: TaskSourceConfig): boolean { return gatewayPath.test(new URL(source.baseUrl).pathname); }

function siteRoot(source: TaskSourceConfig): string {
  if (!gateway(source)) return new URL(source.baseUrl).origin;
  const site = sites.get(source.baseUrl);
  if (!site) throw new TaskError(502, 'task_site_unknown', 'Unfold has not read this Jira site\'s address yet. Open the task list first.');
  return site;
}

async function discover(source: TaskSourceConfig, get: (path: string) => Promise<unknown>): Promise<void> {
  if (!gateway(source) || sites.has(source.baseUrl)) return;
  const value = record(await get('/serverInfo'));
  let url: URL;
  try { url = new URL(String(value.baseUrl ?? '')); } catch { throw new TaskError(502, 'task_response_invalid', 'Jira did not say which site it serves.'); }
  const host = url.hostname;
  if (url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '' || !((url.protocol === 'https:' && host.endsWith('.atlassian.net')) || (url.protocol === 'http:' && loopback(host)))) throw new TaskError(502, 'task_response_invalid', 'Jira named a site address Unfold does not accept.');
  sites.set(source.baseUrl, url.origin);
}

const jql = (source: TaskSourceConfig) => `project = "${source.project}" AND statusCategory != Done ORDER BY updated DESC, key DESC`;

async function searchPage(source: TaskSourceConfig, request: TaskRequest, token: string | undefined): Promise<{ issues: unknown[]; next?: string }> {
  const value = record((await request('/search/jql', { jql: jql(source), maxResults: String(pageSize), fields, ...(token ? { nextPageToken: token } : {}) })).value);
  if (!Array.isArray(value.issues) || value.issues.length > 100) throw new TaskError(502, 'task_response_invalid', 'The task service returned an unsupported task page.');
  const next = value.isLast !== true && typeof value.nextPageToken === 'string' && value.nextPageToken.length > 0 && value.nextPageToken.length <= 4096 ? value.nextPageToken : undefined;
  return { issues: value.issues, ...(next ? { next } : {}) };
}

async function startToken(source: TaskSourceConfig, page: number, request: TaskRequest): Promise<string | undefined> {
  if (page === 1) return undefined;
  const cached = pageTokens.get(tokenKey(source, page));
  if (cached) return cached;
  let from = page - 1;
  while (from > 1 && !pageTokens.has(tokenKey(source, from))) from--;
  if (page - from > maxWalk) throw new TaskError(409, 'task_page_expired', 'Jira pages through results in order. Start again from the first page.');
  let token = from === 1 ? undefined : pageTokens.get(tokenKey(source, from));
  for (let at = from; at < page; at++) {
    const { next } = await searchPage(source, request, token);
    if (!next) throw new TaskError(404, 'task_page_missing', 'Jira has no page that far. Start again from the first page.');
    remember(tokenKey(source, at + 1), next);
    token = next;
  }
  return token;
}

const browse = (source: TaskSourceConfig, key: string) => `${siteRoot(source)}/browse/${encodeURIComponent(key)}`;

async function issueType(project: string, call: FileRequest): Promise<string> {
  const value = record(await call('GET', `/issue/createmeta/${project}/issuetypes?maxResults=50`));
  const types = (Array.isArray(value.issueTypes) ? value.issueTypes : Array.isArray(value.values) ? value.values : []).map(entry => record(entry)).filter(entry => entry.subtask !== true && typeof entry.id === 'string');
  const named = (name: string) => types.find(entry => String(entry.name ?? '').toLowerCase() === name);
  const chosen = named('bug') ?? named('task') ?? types[0];
  if (!chosen) throw new TaskError(502, 'report_tracker_failed', `The Jira project ${project} offers the workbench's account no issue type to create.`);
  return String(chosen.id);
}

/**
 * Report a problem on Jira Cloud: an issue of type Bug (else Task, else the project's first standard type), a body
 * converted from Markdown to Atlassian Document Format, attachments, its status category, labels, assignee and the
 * latest comments as plain text. The token's own account is `GET /myself`'s `accountId`.
 */
export const jiraIssues: IssueFiling = {
  bodyFormat: 'markdown',
  loginField: 'accountId',
  loginPath: '/myself',
  describe: project => `Jira · project ${project}`,
  async create(source, target, title, body, call): Promise<FiledIssue> {
    await discover(source, path => call('GET', path));
    const created = record(await call('POST', '/issue', { fields: { project: { key: target }, issuetype: { id: await issueType(target, call) }, summary: title.replace(/[\r\n]+/g, ' ').slice(0, 255), description: markdownToAdf(body) } }));
    const key = typeof created.key === 'string' && issueKey.test(created.key) ? created.key : '';
    if (!key) throw new TaskError(502, 'task_response_invalid', 'The tracker did not answer with an issue key.');
    return { id: String(created.id ?? key), number: key, url: browse(source, key) };
  },
  async attach(_source, _target, issue, file, call) {
    const form = new FormData();
    form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
    await call('POST', `/issue/${encodeURIComponent(issue.number)}/attachments`, form);
    return undefined;
  },
  async state(_source, _target, issue, _version, login, call) {
    const value = record(await call('GET', `/issue/${encodeURIComponent(issue.number)}?fields=status,labels,assignee,resolutiondate`));
    const facts = record(value.fields ?? {});
    const listed = record(await call('GET', `/issue/${encodeURIComponent(issue.number)}/comment?orderBy=-created&maxResults=10`).catch(() => ({})));
    const comments = (Array.isArray(listed.comments) ? listed.comments : []).map(entry => record(entry)).filter(entry => when(entry.created)).map(entry => {
      const author = String(record(entry.author ?? {}).accountId ?? '');
      return { id: String(entry.id ?? ''), author, text: adfToText(entry.body).slice(0, 600), at: when(entry.created)!, mine: Boolean(login) && author === login };
    }).filter(comment => comment.text).reverse();
    const done = record(record(facts.status ?? {}).statusCategory ?? {}).key === 'done';
    const labels = (Array.isArray(facts.labels) ? facts.labels : []).filter((label): label is string => typeof label === 'string');
    return { open: !done, ...(done && when(facts.resolutiondate) ? { closedAt: when(facts.resolutiondate) } : {}), labels, assigned: Boolean(facts.assignee), comments };
  },
  async comment(_source, _target, issue, body, call) {
    await call('POST', `/issue/${encodeURIComponent(issue.number)}/comment`, { body: markdownToAdf(body) });
  },
};

/**
 * Jira Cloud issues of one project, read through REST API v3 with an `email:api-token` pair as Basic credentials, or a
 * Bearer token when the variable holds no colon. Open issues are listed with JQL through `/search/jql`, which pages by
 * `nextPageToken`; the tokens of pages already read are kept so a later page needs at most a short walk. Descriptions
 * are Atlassian Document Format, rendered as escaped HTML. An issue is referred to by its own key, such as `OPS-12`.
 * The API root is the site's `https://SITE.atlassian.net/rest/api/3`, or Atlassian's gateway
 * `https://api.atlassian.com/ex/jira/CLOUD-ID/rest/api/3` for a scoped token, whose site address is read from
 * `/serverInfo`. Ploeg takes no Jira work, so the adapter declares no hand-off.
 */
export const jira: TaskProviderAdapter = {
  name: 'jira',
  label: 'Jira',
  descriptionFormat: 'html',
  reference: { native: true },
  taskId: issueKey,
  issues: jiraIssues,
  apiRoot(url, path) {
    const rule = 'Jira baseUrl must be https://SITE.atlassian.net/rest/api/3 or https://api.atlassian.com/ex/jira/CLOUD-ID/rest/api/3';
    const host = url.hostname;
    if (loopback(host) && (path === '/rest/api/3' || gatewayPath.test(path))) return;
    if (host.endsWith('.atlassian.net') && path === '/rest/api/3' && !url.port) return;
    if (host === 'api.atlassian.com' && gatewayPath.test(path) && !url.port) return;
    throw new Error(rule);
  },
  project(value) {
    if (!projectKey.test(value)) throw new Error('Task source project must be a Jira project key, such as OPS');
    return value;
  },
  webRoot: siteRoot,
  taskUrl: (source, id) => browse(source, id),
  headers(source, headers) {
    headers['X-Atlassian-Token'] = 'no-check';
    if (!source.token) return;
    headers.Authorization = source.tokenType === 'bearer' || !source.token.includes(':') ? `Bearer ${source.token}` : `Basic ${Buffer.from(source.token).toString('base64')}`;
  },
  parse(source, value, limit) {
    const id = nativeTaskId(issueKey, value.key);
    const facts = record(value.fields ?? {});
    if (record(facts.project ?? {}).key !== source.project) throw new TaskError(404, 'task_outside_source', 'This issue is outside the configured project.');
    const title = field(facts.summary, 500);
    const description = field(adfToHtml(facts.description), limit, true);
    const category = record(record(facts.status ?? {}).statusCategory ?? {}).key;
    const status = category === 'done' ? 'closed' : category === 'new' || category === 'indeterminate' ? 'open' : 'unknown';
    const raw = typeof facts.updated === 'string' ? facts.updated.replace(/([+-]\d\d)(\d\d)$/, '$1:$2') : undefined;
    const updatedAt = when(raw);
    const nativeRevision = typeof facts.updated === 'string' ? field(facts.updated, 128) : undefined;
    return { id, title, description, status, updatedAt, nativeRevision, project: source.project };
  },
  details(_source, value, read) {
    const facts = value.fields && typeof value.fields === 'object' && !Array.isArray(value.fields) ? value.fields as Record<string, unknown> : {};
    const labels = Array.isArray(facts.labels) ? facts.labels.slice(0, 50).map(entry => read.label(entry)).filter((name): name is string => Boolean(name)).map(name => ({ name })) : [];
    const priority = facts.priority && typeof facts.priority === 'object' ? Number((facts.priority as Record<string, unknown>).id) : NaN;
    return { labels, assignees: read.people(facts.assignee ? [facts.assignee] : [], 'displayName', 'emailAddress'), priority: Number.isSafeInteger(priority) && priority > 0 && priority <= 100 ? priority : undefined, dueAt: read.date(facts.duedate), identifier: read.label(value.key, 32) };
  },
  async list(source, page, reading): Promise<TaskPage> {
    await discover(source, async path => (await reading.request(path)).value);
    const token = await startToken(source, page, reading.request);
    const { issues, next } = await searchPage(source, reading.request, token);
    if (next) remember(tokenKey(source, page + 1), next);
    const tasks = issues.map(value => reading.snapshot(value, true)).filter(task => task.status === 'open');
    return { tasks, ...(next && page < maxPage ? { nextPage: page + 1 } : {}) };
  },
  async read(source, id, truncate, reading) {
    await discover(source, async path => (await reading.request(path)).value);
    const response = await reading.request(`/issue/${encodeURIComponent(id)}`, { fields });
    const task = reading.snapshot(response.value, truncate);
    if (task.id !== id) throw new TaskError(409, 'task_moved', `Jira answered with ${task.id}: the issue moved or was renamed. Open it from the task list again.`);
    return { task, value: record(response.value) };
  },
};
