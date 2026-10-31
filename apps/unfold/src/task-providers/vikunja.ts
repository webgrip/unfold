import type { FiledIssue, TaskSourceConfig } from '../tasks.ts';
import type { DetailReaders, IssueFiling, TaskDetails, TaskProviderAdapter } from './registry.ts';
import { authorize } from './repository-issues.ts';
import { apiWebRoot, entries, field, listPage, nativeTaskId, numericId, plainComment, readOne, record, requireSuffix, TaskError, updated, when } from './shared.ts';

/** Labels, assignees, priority, due date and identifier of a Vikunja task; the demo fixture uses the same shape. */
export function vikunjaDetails(value: Record<string, unknown>, read: DetailReaders): TaskDetails {
  const index = typeof value.index === 'number' && Number.isSafeInteger(value.index) && value.index > 0 ? `#${value.index}` : undefined;
  return { labels: read.labels(value.labels, 'title', 'hex_color'), assignees: read.people(value.assignees, 'username', 'name'), priority: typeof value.priority === 'number' && Number.isSafeInteger(value.priority) && value.priority > 0 && value.priority <= 100 ? value.priority : undefined, dueAt: read.date(value.due_date), identifier: read.label(value.identifier, 64) ?? index };
}

/** A numeric list or project ID. */
export function numericProject(value: string): string {
  if (!numericId.test(value)) throw new Error('ClickUp and Vikunja sources require a positive numeric list or project ID');
  return value;
}

const taskUrl = (source: TaskSourceConfig, id: string): string => `${apiWebRoot(source)}/tasks/${id}`;

/** Report a problem on Vikunja: a task in a project, HTML bodies, attachments, and its done state, labels and comments. */
export const vikunjaIssues: IssueFiling = {
  bodyFormat: 'html',
  loginField: 'username',
  describe: project => `Vikunja · project ${project}`,
  async create(source, target, title, body, call): Promise<FiledIssue> {
    const task = record(await call('PUT', `/projects/${target}/tasks`, { title, description: body }));
    const id = String(task.id ?? '');
    if (!numericId.test(id)) throw new TaskError(502, 'task_response_invalid', 'The tracker did not answer with a task id.');
    return { id, number: id, url: taskUrl(source, id) };
  },
  async attach(_source, _target, issue, file, call) {
    const form = new FormData();
    form.append('files', new Blob([file.bytes], { type: file.type }), file.name);
    await call('PUT', `/tasks/${issue.id}/attachments`, form);
    return undefined;
  },
  async state(_source, _target, issue, _version, login, call) {
    const task = record(await call('GET', `/tasks/${issue.id}`));
    const listed = await call('GET', `/tasks/${issue.id}/comments`).catch(() => []);
    const comments = (Array.isArray(listed) ? listed : []).map(entry => record(entry)).filter(entry => when(entry.created)).map(entry => {
      const author = String(record(entry.author ?? {}).username ?? '');
      return { id: String(entry.id ?? ''), author, text: plainComment(entry.comment, true), at: when(entry.created)!, mine: Boolean(login) && author === login };
    }).filter(comment => comment.text);
    const labels = (Array.isArray(task.labels) ? task.labels : []).map(label => String(record(label).title ?? '')).filter(Boolean);
    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    return { open: task.done !== true, ...(task.done === true && when(task.done_at) ? { closedAt: when(task.done_at) } : {}), labels, assigned: assignees.length > 0, comments: comments.slice(-10) };
  },
  async comment(_source, _target, issue, body, call) {
    await call('PUT', `/tasks/${issue.id}/comments`, { comment: body });
  },
};

/**
 * Vikunja tasks of one project. Descriptions are HTML. Its tasks are referred to as `VIK-<id>`, and Ploeg means
 * Vikunja when a Work Item names no provider. Hand-off assigns a team's Vikunja user, found among the project's users
 * and then through user search, and Ploeg queues a Work Item from Vikunja's `task.assignee.created` webhook, which the
 * AHP automation catalogue lists as a tracker route.
 */
export const vikunja: TaskProviderAdapter = {
  name: 'vikunja',
  label: 'Vikunja',
  priorities: { names: ['', 'low', 'medium', 'high', 'urgent', 'do now'], oneIsHighest: false },
  descriptionFormat: 'html',
  reference: { prefix: 'VIK', ploegDefault: true },
  taskId: numericId,
  issues: vikunjaIssues,
  apiRoot: (_url, path) => requireSuffix(path, '/api/v1'),
  project: numericProject,
  webRoot: apiWebRoot,
  taskUrl: (_source, id, _value, base) => `${base}/tasks/${id}`,
  headers: (source, headers) => authorize(source, headers, 'Bearer'),
  parse(source, value, limit) {
    const id = nativeTaskId(numericId, value.id);
    if (String(value.project_id) !== source.project) throw new TaskError(404, 'task_outside_source', 'This task is outside the configured project.');
    const title = field(value.title, 500);
    const description = field(value.description, limit, true);
    const status = value.done === true ? 'closed' : value.done === false ? 'open' : 'unknown';
    const updatedAt = updated(value.updated);
    const nativeRevision = value.updated !== undefined && value.updated !== null ? field(value.updated, 128) : undefined;
    return { id, title, description, status, updatedAt, nativeRevision, project: source.project };
  },
  details: (_source, value, read) => vikunjaDetails(value, read),
  list: (source, page, reading) => listPage(page, reading, { path: '/tasks', query: { page: String(page), per_page: '50', filter: `project_id = ${source.project} && done = false`, sort_by: 'updated', order_by: 'desc' }, pageSize: 50 }),
  read: (_source, id, truncate, reading) => readOne(id, truncate, reading, `/tasks/${id}`),
  handoff: {
    commentFormat: 'html',
    assignmentEvent: 'task.assignee.created',
    handles: user => [user.username].filter((name): name is string => typeof name === 'string' && name.length > 0).map(name => name.toLowerCase()),
    personHandles: person => [person.username.toLowerCase()],
    async project(_source, id, request) {
      const value = record((await request(`/tasks/${id}`)).value);
      return typeof value.project_id === 'number' && Number.isSafeInteger(value.project_id) ? String(value.project_id) : undefined;
    },
    userLookups: (source, username) => [[`/projects/${source.project}/projectusers`, { s: username }, entries], ['/users', { s: username }, entries]],
    setAssignee: (_source, id, userId, assigned, write) => assigned ? write('PUT', `/tasks/${id}/assignees`, { user_id: userId }) : write('DELETE', `/tasks/${id}/assignees/${userId}`),
    comment: (_source, id, body, write) => write('PUT', `/tasks/${id}/comments`, { comment: body }),
  },
};
