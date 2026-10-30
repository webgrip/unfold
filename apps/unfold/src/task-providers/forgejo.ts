import type { FiledIssue, IssueFix, IssueRelease, TaskSourceConfig } from '../tasks.ts';
import type { FileRequest, IssueFiling, TaskProviderAdapter } from './registry.ts';
import { authorize, isPullRequest, ownerRepository, parseRepositoryIssue, repositoryIssueDetails, repositoryIssuePath, repositoryIssueUrl } from './repository-issues.ts';
import { apiWebRoot, listPage, numericId, plainComment, readOne, record, requireSuffix, TaskError, when } from './shared.ts';

function releaseVersion(tag: string): { line: string; version: string } | undefined {
  const match = /^(.*?v?)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
  return match ? { line: match[1], version: match[2] } : undefined;
}

async function releaseAfter(call: FileRequest, target: string, mergedAt: string, version: string): Promise<IssueRelease | undefined> {
  const listed = await call('GET', `/repos/${target}/releases?limit=50`);
  const releases = (Array.isArray(listed) ? listed : []).map(entry => record(entry)).filter(entry => !entry.draft && typeof entry.tag_name === 'string' && when(entry.created_at))
    .map(entry => ({ tag: String(entry.tag_name), url: typeof entry.html_url === 'string' ? entry.html_url : '', at: when(entry.created_at)! }));
  const running = releases.find(entry => releaseVersion(entry.tag)?.version === version);
  if (!running) return undefined;
  const line = releaseVersion(running.tag)!.line;
  const first = releases.filter(entry => releaseVersion(entry.tag)?.line === line && entry.at >= mergedAt).sort((a, b) => a.at.localeCompare(b.at))[0];
  return first ? { ...first, live: first.at <= running.at } : undefined;
}

/**
 * Report a problem on Forgejo: an issue in a repository with the label `reported-in-app` when the repository has it,
 * Markdown bodies, uploaded assets, and a state that follows the newest pull request naming the issue to the first
 * release of the running version's line after it merged. A release is only named when one of the repository's
 * releases carries the running version, so another product's tags never count.
 */
export const forgejoIssues: IssueFiling = {
  bodyFormat: 'markdown',
  loginField: 'login',
  describe: project => `Forgejo · ${project}`,
  async create(_source: TaskSourceConfig, target: string, title: string, body: string, call: FileRequest): Promise<FiledIssue> {
    const labels = await call('GET', `/repos/${target}/labels?limit=50`).catch(() => []);
    const label = Array.isArray(labels) ? labels.find(entry => record(entry).name === 'reported-in-app') : undefined;
    const issue = record(await call('POST', `/repos/${target}/issues`, { title, body, ...(label ? { labels: [record(label).id] } : {}) }));
    const number = String(issue.number ?? '');
    if (!numericId.test(number) || typeof issue.html_url !== 'string') throw new TaskError(502, 'task_response_invalid', 'The tracker did not answer with an issue number and address.');
    return { id: String(issue.id ?? number), number, url: issue.html_url };
  },
  async attach(_source, target, issue, file, call) {
    const form = new FormData();
    form.append('attachment', new Blob([file.bytes], { type: file.type }), file.name);
    const asset = record(await call('POST', `/repos/${target}/issues/${issue.number}/assets?name=${encodeURIComponent(file.name)}`, form));
    return typeof asset.browser_download_url === 'string' ? asset.browser_download_url : undefined;
  },
  async updateBody(_source, target, issue, body, call) {
    await call('PATCH', `/repos/${target}/issues/${issue.number}`, { body });
  },
  async state(_source, target, issue, version, login, call) {
    const value = record(await call('GET', `/repos/${target}/issues/${issue.number}`));
    const timeline = await call('GET', `/repos/${target}/issues/${issue.number}/timeline?limit=50`).catch(() => []);
    const events = (Array.isArray(timeline) ? timeline : []).map(entry => record(entry));
    const comments = events.filter(entry => entry.type === 'comment' && when(entry.created_at)).map(entry => {
      const author = String(record(entry.user ?? {}).login ?? '');
      return { id: String(entry.id ?? ''), author, text: plainComment(entry.body, false), at: when(entry.created_at)!, mine: Boolean(login) && author === login };
    }).filter(comment => comment.text);
    const reference = events.filter(entry => entry.type === 'pull_ref' && entry.ref_issue && typeof entry.ref_issue === 'object').map(entry => record(entry.ref_issue)).at(-1);
    let fix: IssueFix | undefined;
    if (reference && numericId.test(String(reference.number ?? ''))) {
      const pull = record(await call('GET', `/repos/${target}/pulls/${reference.number}`).catch(() => reference));
      fix = { number: String(reference.number), url: String(pull.html_url ?? reference.html_url ?? ''), merged: pull.merged === true, ...(when(pull.merged_at) ? { mergedAt: when(pull.merged_at) } : {}) };
    }
    const release = fix?.mergedAt ? await releaseAfter(call, target, fix.mergedAt, version).catch(() => undefined) : undefined;
    const labels = (Array.isArray(value.labels) ? value.labels : []).map(label => String(record(label).name ?? '')).filter(Boolean);
    const assignees = Array.isArray(value.assignees) ? value.assignees : [];
    return { open: value.state !== 'closed', ...(when(value.closed_at) ? { closedAt: when(value.closed_at) } : {}), labels, assigned: assignees.length > 0, comments: comments.slice(-10), ...(fix ? { fix } : {}), ...(release ? { release } : {}) };
  },
  async comment(_source, target, issue, body, call) {
    await call('POST', `/repos/${target}/issues/${issue.number}/comments`, { body });
  },
};

/** Forgejo issues of one repository, read through `/api/v1` with a `token` credential. */
export const forgejo: TaskProviderAdapter = {
  name: 'forgejo',
  label: 'Forgejo',
  descriptionFormat: 'markdown',
  taskId: numericId,
  issues: forgejoIssues,
  apiRoot: (_url, path) => requireSuffix(path, '/api/v1'),
  project: ownerRepository,
  webRoot: apiWebRoot,
  taskUrl: (source, id, _value, base) => repositoryIssueUrl(source, id, base),
  headers: (source, headers) => authorize(source, headers, 'token'),
  parse: parseRepositoryIssue,
  details: (_source, value, read) => repositoryIssueDetails(value, read),
  list: (source, page, reading) => listPage(page, reading, { path: repositoryIssuePath(source), query: { page: String(page), limit: '50', state: 'open', type: 'issues', sort: 'updated', direction: 'desc' }, pageSize: 50, skip: isPullRequest }),
  read: (source, id, truncate, reading) => readOne(id, truncate, reading, `${repositoryIssuePath(source)}/${id}`),
};
