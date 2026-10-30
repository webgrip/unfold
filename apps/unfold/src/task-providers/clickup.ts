import type { TaskProviderAdapter } from './registry.ts';
import { authorize } from './repository-issues.ts';
import { apiWebRoot, entries, field, listPage, nativeTaskId, numericId, readOne, record, requireSuffix, TaskError, updated } from './shared.ts';

const clickupTaskId = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * ClickUp tasks of one home List, read with a personal token or a linked account. Hand-off assigns a team's ClickUp
 * user; a user is found among the List's members and then the Workspace members, by username or email address,
 * because Ploeg routes ClickUp assignees by either. Hand-off notes are plain text and notify nobody.
 */
export const clickup: TaskProviderAdapter = {
  name: 'clickup',
  label: 'ClickUp',
  descriptionFormat: 'markdown',
  linkedAccount: 'clickup',
  taskId: clickupTaskId,
  apiRoot: (_url, path) => requireSuffix(path, '/api/v2'),
  project(value) {
    if (!numericId.test(value)) throw new Error('ClickUp and Vikunja sources require a positive numeric list or project ID');
    return value;
  },
  webRoot: apiWebRoot,
  taskUrl: (_source, id) => `https://app.clickup.com/t/${encodeURIComponent(id)}`,
  headers: (source, headers) => authorize(source, headers, ''),
  parse(source, value, limit) {
    const id = nativeTaskId(clickupTaskId, value.id);
    if (String(record(value.list).id) !== source.project) throw new TaskError(404, 'task_outside_source', 'This task is outside the configured home list.');
    const title = field(value.name, 500);
    const description = field(value.markdown_description ?? value.text_content ?? value.description, limit, true);
    const type = record(value.status).type;
    const status = value.archived === true || type === 'closed' || type === 'done' ? 'closed' : type === 'open' || type === 'custom' ? 'open' : 'unknown';
    const updatedAt = updated(value.date_updated, true);
    const nativeRevision = value.date_updated !== undefined && value.date_updated !== null ? field(String(value.date_updated), 128) : undefined;
    return { id, title, description, status, updatedAt, nativeRevision, project: source.project };
  },
  details(_source, value, read) {
    const priority = value.priority && typeof value.priority === 'object' ? Number((value.priority as Record<string, unknown>).id) : NaN;
    return { labels: read.labels(value.tags, 'name', 'tag_bg'), assignees: read.people(value.assignees, 'username', 'email'), priority: Number.isSafeInteger(priority) && priority > 0 && priority <= 100 ? priority : undefined, dueAt: read.date(value.due_date, true), identifier: read.label(value.custom_id, 64) };
  },
  list: (source, page, reading) => listPage(page, reading, {
    path: `/list/${source.project}/task`,
    query: { page: String(page - 1), include_closed: 'false', include_timl: 'false', include_markdown_description: 'true', subtasks: 'true', order_by: 'updated', reverse: 'true' },
    pageSize: 100,
    tasks: value => record(value).tasks,
    lastPage: value => typeof record(value).last_page === 'boolean' ? record(value).last_page === true : undefined,
  }),
  read: (_source, id, truncate, reading) => readOne(id, truncate, reading, `/task/${encodeURIComponent(id)}`, { include_markdown_description: 'true' }),
  handoff: {
    commentFormat: 'text',
    handles: user => [user.username, user.email].filter((name): name is string => typeof name === 'string' && name.length > 0).map(name => name.toLowerCase()),
    personHandles: person => (person.name ? [person.username, person.name] : [person.username]).map(name => name.toLowerCase()),
    async project(_source, id, request) {
      const list = String(record(record((await request(`/task/${encodeURIComponent(id)}`)).value).list).id ?? '');
      return numericId.test(list) ? list : undefined;
    },
    userLookups: source => [[`/list/${source.project}/member`, {}, value => entries(record(value).members)], ['/team', {}, value => entries(record(value).teams).flatMap(team => entries(team.members)).map(member => member.user && typeof member.user === 'object' && !Array.isArray(member.user) ? member.user as Record<string, unknown> : {})]],
    setAssignee: (_source, id, userId, assigned, write) => write('PUT', `/task/${encodeURIComponent(id)}`, { assignees: { add: assigned ? [userId] : [], rem: assigned ? [] : [userId] } }),
    comment: (_source, id, body, write) => write('POST', `/task/${encodeURIComponent(id)}/comment`, { comment_text: body, notify_all: false }),
  },
};
