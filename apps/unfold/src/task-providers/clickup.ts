import type { ScopeEntry, TaskProviderAdapter, TaskRequest } from './registry.ts';
import { authorize } from './repository-issues.ts';
import { apiWebRoot, entries, field, listPage, nativeTaskId, numericId, readOne, record, requireSuffix, TaskError, updated } from './shared.ts';

const clickupTaskId = /^[a-zA-Z0-9_-]{1,128}$/;
const containerId = /^[a-zA-Z0-9_-]{1,64}$/;
const homeList = (value: unknown): string => { const list = value && typeof value === 'object' ? (value as Record<string, unknown>).list : undefined; return list && typeof list === 'object' ? String((list as Record<string, unknown>).id ?? '') : ''; };
const named = (value: unknown): value is Record<string, unknown> & { id: string | number; name: string } => Boolean(value) && typeof value === 'object' && (typeof (value as Record<string, unknown>).id === 'string' || typeof (value as Record<string, unknown>).id === 'number') && containerId.test(String((value as Record<string, unknown>).id)) && typeof (value as Record<string, unknown>).name === 'string' && ((value as Record<string, unknown>).name as string).trim().length > 0;
const live = (value: Record<string, unknown>) => value.archived !== true;

function containers(value: unknown, key: string, kind: string, project: boolean, children: boolean): ScopeEntry[] {
  const list = record(value)[key];
  if (!Array.isArray(list)) throw new TaskError(502, 'task_response_invalid', 'ClickUp returned an unsupported list of containers.');
  return list.filter(named).filter(live).slice(0, 500).map(entry => ({ kind, id: String(entry.id), name: field(entry.name, 500).trim(), project, children }));
}

async function spaceChildren(id: string, request: TaskRequest): Promise<ScopeEntry[]> {
  const folders = (await request(`/space/${encodeURIComponent(id)}/folder`, { archived: 'false' })).value;
  const lists = (await request(`/space/${encodeURIComponent(id)}/list`, { archived: 'false' })).value;
  const hidden = new Set(entries(record(folders).folders).filter(folder => folder.hidden === true).map(folder => String(folder.id)));
  const visible = containers({ folders: entries(record(folders).folders).filter(folder => !hidden.has(String(folder.id))) }, 'folders', 'folder', false, true);
  return [...visible, ...containers(lists, 'lists', 'list', true, false)];
}

/** ClickUp's own Markdown, tidied for Unfold's renderer: images become links that say so, and the inline HTML ClickUp mixes in (underline, line breaks) becomes plain text. */
export function clickupMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]\n]{0,500})\]\((https?:\/\/[^)\s]{1,2048})\)/g, (_, alt: string, href: string) => `[${alt.trim() ? `Image: ${alt.trim()}` : 'Image'}](${href})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:u|span|font|mark)(?:\s[^<>]{0,500})?>/gi, '');
}

/**
 * ClickUp tasks of one home List, read with a personal token or a linked account. Hand-off assigns a team's ClickUp
 * user; a user is found among the List's members and then the Workspace members, by username or email address,
 * because Ploeg routes ClickUp assignees by either. Hand-off notes are plain text and notify nobody.
 */
export const clickup: TaskProviderAdapter = {
  name: 'clickup',
  label: 'ClickUp',
  descriptionFormat: 'markdown',
  idMark: '#',
  priorities: { names: ['', 'urgent', 'high', 'normal', 'low'], oneIsHighest: true },
  linkedAccount: 'clickup',
  rateLimit: 'ClickUp lets each account ask 100 times a minute on most plans.',
  displayDescription: clickupMarkdown,
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
    skip: value => homeList(value) !== source.project,
    lastPage: value => typeof record(value).last_page === 'boolean' ? record(value).last_page === true : undefined,
  }),
  read: (_source, id, truncate, reading) => readOne(id, truncate, reading, `/task/${encodeURIComponent(id)}`, { include_markdown_description: 'true' }),
  setup: {
    levels: [{ kind: 'workspace', label: 'Workspace' }, { kind: 'space', label: 'Space' }, { kind: 'folder', label: 'Folder' }, { kind: 'list', label: 'List' }],
    async children(parent, request) {
      if (!parent) return containers((await request('/team')).value, 'teams', 'workspace', false, true);
      if (!containerId.test(parent.id)) throw new TaskError(400, 'setup_scope_invalid', 'Choose a Workspace, Space or Folder from the list.');
      if (parent.kind === 'workspace') return containers((await request(`/team/${encodeURIComponent(parent.id)}/space`, { archived: 'false' })).value, 'spaces', 'space', false, true);
      if (parent.kind === 'space') return spaceChildren(parent.id, request);
      if (parent.kind === 'folder') return containers((await request(`/folder/${encodeURIComponent(parent.id)}/list`, { archived: 'false' })).value, 'lists', 'list', true, false);
      throw new TaskError(400, 'setup_scope_invalid', 'Choose a Workspace, Space or Folder from the list.');
    },
    async describe(project, request) {
      const value = record((await request(`/list/${encodeURIComponent(project)}`)).value);
      if (String(value.id ?? '') !== project) throw new TaskError(502, 'task_response_invalid', 'ClickUp returned a different List than requested.');
      const folder = value.folder && typeof value.folder === 'object' ? value.folder as Record<string, unknown> : {};
      const space = value.space && typeof value.space === 'object' ? value.space as Record<string, unknown> : {};
      const path = [typeof space.name === 'string' ? space.name : '', folder.hidden === true || typeof folder.name !== 'string' ? '' : folder.name].map(part => part.trim()).filter(Boolean).map(part => part.slice(0, 200));
      const statuses = entries(value.statuses).filter(status => typeof status.status === 'string' && status.status.trim()).map(status => ({ name: String(status.status).slice(0, 100), closed: status.type === 'closed' || status.type === 'done' }));
      return { name: field(value.name, 500).trim(), path, archived: value.archived === true, statuses };
    },
    async account(request) {
      const user = record(record((await request('/user')).value).user);
      return [user.username, user.email].find((name): name is string => typeof name === 'string' && name.trim().length > 0)?.trim().slice(0, 255);
    },
    serviceAccount: {
      noun: 'ClickUp user',
      steps: [
        'Invite a new member to your ClickUp Workspace with an email address your agency controls, such as unfold@your-agency.example. Make it a Member rather than a guest, so it can open the Lists you connect. On a paid plan a Member takes a seat.',
        'Accept the invitation and sign in to ClickUp as that user.',
        'Open the avatar menu, then Settings › Apps. Under API Token choose Generate, and copy the token. It starts with pk_.',
        'Give that user access to every List you connect here.',
        'Paste the token below. Unfold checks it, stores it encrypted and never shows it again.',
      ],
      docs: 'https://developer.clickup.com/docs/authentication',
      tokenLabel: 'API token of that ClickUp user',
      tokenPattern: /^pk_[A-Za-z0-9_]{8,200}$/,
      tokenShape: 'a ClickUp personal API token, which starts with pk_',
    },
  },
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
