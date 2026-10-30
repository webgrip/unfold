import type { TaskSourceConfig } from '../tasks.ts';
import type { TaskProviderAdapter } from './registry.ts';
import { apiWebRoot, field, listPage, nativeTaskId, numericId, pathProject, readOne, requireSuffix, TaskError, updated } from './shared.ts';

const issuePath = (source: TaskSourceConfig): string => `/projects/${encodeURIComponent(source.project)}/issues`;

/** GitLab issues of one project, named by ID or namespace/path, read with a personal token or a linked account's Bearer token. */
export const gitlab: TaskProviderAdapter = {
  name: 'gitlab',
  label: 'GitLab',
  descriptionFormat: 'markdown',
  linkedAccount: 'gitlab',
  taskId: numericId,
  apiRoot: (_url, path) => requireSuffix(path, '/api/v4'),
  project(value) { pathProject(value, undefined); return value; },
  webRoot: apiWebRoot,
  taskUrl(source, id, value, base) {
    if (numericId.test(source.project)) {
      let url: URL;
      try { url = new URL(field(value.web_url, 2048)); } catch { throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid issue link.'); }
      if (url.origin !== new URL(base).origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(`${new URL(base).pathname.replace(/\/$/, '')}/`) || !url.pathname.endsWith(`/-/issues/${id}`)) throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid issue link.');
      return url.href;
    }
    return `${base}/${source.project.split('/').map(encodeURIComponent).join('/')}/-/issues/${id}`;
  },
  headers(source, headers) {
    if (!source.token) return;
    if (source.tokenType !== 'bearer') headers['PRIVATE-TOKEN'] = source.token;
    else headers.Authorization = `Bearer ${source.token}`;
  },
  parse(source, value, limit) {
    const id = nativeTaskId(numericId, value.iid);
    const title = field(value.title, 500);
    const description = field(value.description, limit, true);
    const status = value.state === 'opened' ? 'open' : value.state === 'closed' ? 'closed' : 'unknown';
    const updatedAt = updated(value.updated_at);
    let project = source.project;
    if (value.project_id !== undefined) {
      project = nativeTaskId(numericId, value.project_id);
      if (numericId.test(source.project) && source.project !== project) throw new TaskError(404, 'task_outside_source', 'This task is outside the configured project.');
    }
    return { id, title, description, status, updatedAt, project };
  },
  details: (_source, value, read) => ({ labels: Array.isArray(value.labels) ? value.labels.slice(0, 50).map(entry => typeof entry === 'string' ? read.label(entry) : entry && typeof entry === 'object' ? read.label((entry as Record<string, unknown>).name) : undefined).filter((name): name is string => Boolean(name)).map(name => ({ name })) : [], assignees: read.people(value.assignees, 'username', 'name'), dueAt: read.date(value.due_date), identifier: typeof value.iid === 'number' ? `#${value.iid}` : undefined }),
  list: (source, page, reading) => listPage(page, reading, { path: issuePath(source), query: { page: String(page), per_page: '50', state: 'opened', scope: 'all', order_by: 'updated_at', sort: 'desc' }, pageSize: 50 }),
  read: (source, id, truncate, reading) => readOne(id, truncate, reading, `${issuePath(source)}/${id}`),
};
