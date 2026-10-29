import { createHash } from 'node:crypto';
import type { AppConfig, Repository } from './types.ts';
import { descriptionMarkdown } from './rich-text.ts';

export type TaskProvider = 'forgejo' | 'github' | 'gitlab' | 'clickup' | 'vikunja' | 'demo';
export type TaskTarget = { forge: string; owner: string; repo: string; baseBranch: string };
export type PloegTaskSource = { workItemId: string; provider: string; externalId: string; expectedBaseUrl: string; expectedScope: string; expectedRevision: string; expectedUpdatedAt: string; expectedTarget: TaskTarget };
export type TaskSourceConfig = { id: string; name: string; provider: TaskProvider; baseUrl: string; project: string; repositoryId: string; token?: string; tokenType?: 'bearer'; executionOwner: 'interactive' | 'ploeg'; ploeg?: { target: TaskTarget } };
export type TaskSnapshot = { key: string; sourceId: string; provider: TaskProvider; id: string; revision: string; title: string; description: string; url: string; status: 'open' | 'closed' | 'unknown'; updatedAt?: string; repositoryId: string; nativeRevision?: string; scope?: string; ploeg?: PloegTaskSource; bindingConfig?: string; bindingRevision?: string; ploegUnavailable?: { code: string; message: string }; labels?: TaskLabel[]; assignees?: TaskAssignee[]; priority?: number; dueAt?: string; identifier?: string; descriptionTruncated?: true };
export type TaskLabel = { name: string; color?: string };
export type TaskAssignee = { username: string; name?: string };
export type TaskPage = { tasks: TaskSnapshot[]; nextPage?: number };
export type PresentedTask = TaskSnapshot & { descriptionMarkdown: string };

export class TaskError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'TaskError';
    this.status = status;
    this.code = code;
  }
}

const providers: TaskProvider[] = ['forgejo', 'github', 'gitlab', 'clickup', 'vikunja', 'demo'];
const maxResponseBytes = 2 * 1024 * 1024;
const maxPage = 1000;
const maxDescription = 16000;
const timeoutMs = 10000;
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;
const numericId = /^[1-9][0-9]{0,19}$/;
const projectPart = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,254}$/;
const gheComApiHost = /^api\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.ghe\.com$/;
const sourceFields = new Set(['id', 'name', 'provider', 'baseUrl', 'project', 'repositoryId', 'tokenEnv', 'executionOwner', 'ploeg']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskError(502, 'task_response_invalid', 'The task service returned an unsupported response.');
  return value as Record<string, unknown>;
}

function configText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Checks a tracker API root: HTTPS (HTTP on loopback only), no credentials, query or fragment, and the provider's API suffix. */
export function apiRoot(value: unknown, provider: TaskProvider): string {
  if (!configText(value, 2048) || /[%\\]/.test(value)) throw new Error('Task source baseUrl must be a complete API root URL');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Task source baseUrl must be a complete API root URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback)) || parsed.username || parsed.password || parsed.search || parsed.hash || /[%\\]/.test(parsed.pathname)) throw new Error('Task source baseUrl requires HTTPS, no credentials, query or fragment; HTTP is allowed only on loopback');
  const path = parsed.pathname.replace(/\/+$/, '');
  const suffix = provider === 'gitlab' ? '/api/v4' : provider === 'clickup' ? '/api/v2' : '/api/v1';
  if (provider !== 'demo' && provider !== 'github' && !path.endsWith(suffix)) throw new Error(`Task source baseUrl must end with ${suffix}`);
  if (provider === 'github') githubApiRoot(parsed, path);
  return `${parsed.origin}${path}`;
}

function githubApiRoot(parsed: URL, path: string): void {
  const rule = 'GitHub baseUrl must be https://api.github.com, a GHE.com API root https://api.SUBDOMAIN.ghe.com, or a GitHub Enterprise Server API root ending with /api/v3';
  const host = parsed.hostname.replace(/\.$/, '');
  if (host === 'ghe.com' || host.endsWith('.ghe.com')) {
    if (!gheComApiHost.test(parsed.hostname) || parsed.port || path !== '') throw new Error(rule);
    return;
  }
  if (!(parsed.hostname === 'api.github.com' && path === '') && !path.endsWith('/api/v3')) throw new Error(rule);
}

function configuredProject(value: unknown, provider: TaskProvider): string {
  if (!configText(value, 512)) throw new Error('Task source project must be a native project or list identifier');
  if (provider === 'demo') return value;
  if (provider === 'clickup' || provider === 'vikunja') {
    if (!numericId.test(value)) throw new Error('ClickUp and Vikunja sources require a positive numeric list or project ID');
    return value;
  }
  const parts = value.split('/');
  if (parts.some(part => !projectPart.test(part) || part === '.' || part === '..') || ((provider === 'forgejo' || provider === 'github') && parts.length !== 2) || (provider === 'gitlab' && parts.length === 1 && !numericId.test(value))) throw new Error('Task source project must be owner/repository, or a GitLab project ID or namespace/path');
  return provider === 'github' || provider === 'forgejo' ? value.toLowerCase() : value;
}

export function validateTaskSources(raw: unknown, repositories: Repository[], mode: 'demo' | 'live'): TaskSourceConfig[] {
  if (raw === undefined) raw = mode === 'demo' ? [{ id: 'demo-tasks', name: 'Demo fixture tasks', provider: 'demo', baseUrl: 'https://example.invalid', project: 'order-service', repositoryId: 'order-service', executionOwner: 'interactive' }] : [];
  if (!Array.isArray(raw) || raw.length > 50) throw new Error('taskSources must contain at most 50 sources');
  const ids = new Set<string>();
  const mappings = new Map<string, string>();
  return raw.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each task source must be an object');
    const source = value as Record<string, unknown>;
    if (Object.keys(source).some(key => !sourceFields.has(key))) throw new Error('Unknown task source field; credentials must use tokenEnv, never literal tokens');
    if (typeof source.id !== 'string' || !slug.test(source.id) || ids.has(source.id)) throw new Error('Task source IDs must be unique lowercase slugs');
    ids.add(source.id);
    if (!configText(source.name, 100)) throw new Error('Task source name must contain 1–100 characters');
    if (!providers.includes(source.provider as TaskProvider)) throw new Error('Unsupported task source provider');
    const provider = source.provider as TaskProvider;
    if (provider === 'demo' && mode !== 'demo') throw new Error('Fixture task sources require explicit demo mode');
    if (typeof source.repositoryId !== 'string' || !repositories.some(repository => repository.id === source.repositoryId)) throw new Error('Task source must map to a registered repository');
    if (source.executionOwner !== 'interactive' && source.executionOwner !== 'ploeg') throw new Error('Task source executionOwner must explicitly be interactive or ploeg');
    if (source.executionOwner === 'interactive' && repositories.find(repository => repository.id === source.repositoryId)?.executionOwner === 'ploeg') throw new Error('An interactive task source cannot override a Ploeg-owned repository');
    const baseUrl = apiRoot(source.baseUrl, provider);
    const project = configuredProject(source.project, provider);
    let ploeg: TaskSourceConfig['ploeg'];
    if (source.ploeg !== undefined) {
      const value = source.ploeg as { target?: TaskTarget };
      const target = value?.target;
      const repository = repositories.find(item => item.id === source.repositoryId)!;
      if (source.executionOwner !== 'ploeg' || !['vikunja', 'clickup'].includes(provider) || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'target') || !target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).sort().join(',') !== 'baseBranch,forge,owner,repo') throw new Error('Task source ploeg requires an explicit Vikunja or ClickUp Ploeg target');
      if (typeof target.forge !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(target.forge) || !configText(target.owner, 512) || target.owner.split('/').some(part => !projectPart.test(part) || part === '.' || part === '..') || !configText(target.repo, 255) || !projectPart.test(target.repo) || ['.', '..'].includes(target.repo) || !configText(target.baseBranch, 512) || target.baseBranch !== repository.baseBranch) throw new Error('Task source Ploeg target must match the registered repository and base branch');
      let url: URL;
      try { url = new URL(repository.url); } catch { throw new Error('Ploeg tracker targets require a registered repository URL'); }
      if (url.username || url.password || url.search || url.hash || !['https:', 'ssh:', ...(mode === 'demo' ? ['http:'] : [])].includes(url.protocol) || url.pathname.replace(/^\//, '').replace(/\.git$/, '') !== `${target.owner}/${target.repo}`) throw new Error('Task source Ploeg target must match the registered repository URL');
      ploeg = { target: { forge: target.forge, owner: target.owner, repo: target.repo, baseBranch: target.baseBranch } };
    }
    let token: string | undefined;
    if (source.tokenEnv !== undefined) {
      if (typeof source.tokenEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(source.tokenEnv)) throw new Error('Task source tokenEnv must name an environment variable');
      token = process.env[source.tokenEnv];
      if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new Error('Task source tokenEnv must reference a non-empty, valid API token');
    }
    const identity = JSON.stringify([provider, baseUrl, project]);
    const mapping = JSON.stringify([source.repositoryId, source.executionOwner, ploeg]);
    if (mappings.has(identity) && mappings.get(identity) !== mapping) throw new Error('Aliases of a task source must use the same repository and execution owner');
    mappings.set(identity, mapping);
    return { id: source.id, name: source.name, provider, baseUrl, project, repositoryId: source.repositoryId, executionOwner: source.executionOwner, ...(token ? { token } : {}), ...(ploeg ? { ploeg } : {}) };
  });
}

const handoffProviders = new Set<TaskProvider>(['vikunja', 'clickup']);
const handoffOnly = 'Only Vikunja and ClickUp tasks can be handed to Ploeg from the workbench.';
/** The product name of a hand-off source's tracker, for messages. */
export function trackerName(source: TaskSourceConfig): string { return source.provider === 'clickup' ? 'ClickUp' : 'Vikunja'; }

/** Reports why a source cannot hand tasks to Ploeg, or undefined when it can. */
export function handoffUnsupported(source: TaskSourceConfig, ploeg: AppConfig['ploeg']): string | undefined {
  if (source.provider === 'demo') return 'Demo fixture tasks are not linked to Ploeg.';
  if (!handoffProviders.has(source.provider)) return handoffOnly;
  if (source.executionOwner !== 'ploeg') return 'This connection is not assigned to Ploeg. An administrator sets its executionOwner to "ploeg" to enable hand-off.';
  if (!source.token) return 'This connection has no tracker token, so the workbench cannot assign its tasks.';
  if (ploeg?.demo) return 'Ploeg is showing illustrative demo records. Hand-off needs a live Ploeg operator connection.';
  if (!ploeg?.url || !ploeg.tokenEnv) return 'Connect the authenticated Ploeg operator API in the server configuration to hand tasks off.';
  return undefined;
}

export function publicTaskSource(source: TaskSourceConfig, ploeg?: AppConfig['ploeg']) {
  return { id: source.id, name: source.name, provider: source.provider, repositoryId: source.repositoryId, executionOwner: source.executionOwner, ...(source.ploeg ? { ploeg: source.ploeg } : {}), handoff: !handoffUnsupported(source, ploeg) };
}

function taskId(source: TaskSourceConfig, value: unknown): string {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  const valid = source.provider === 'clickup' ? /^[a-zA-Z0-9_-]{1,128}$/ : numericId;
  if (typeof id !== 'string' || !valid.test(id)) throw new TaskError(400, 'task_id_invalid', 'Use the native task ID or issue number.');
  return id;
}

function field(value: unknown, maxLength: number, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > maxLength || (!optional && !value.trim()) || value.includes('\u0000')) throw new TaskError(502, 'task_response_invalid', 'The task service returned missing or oversized task content.');
  return value;
}

function updated(value: unknown, milliseconds = false): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid revision timestamp.');
  const date = new Date(milliseconds ? Number(value) : String(value));
  if (!Number.isFinite(date.getTime())) throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid revision timestamp.');
  return date.toISOString();
}

function webRoot(source: TaskSourceConfig): string {
  if (source.provider === 'github') {
    const host = new URL(source.baseUrl).hostname;
    if (host === 'api.github.com') return 'https://github.com';
    const gheCom = gheComApiHost.exec(host);
    if (gheCom) return `https://${gheCom[1]}.ghe.com`;
  }
  return source.baseUrl.replace(/\/api\/v[1-4]$/, '');
}

function taskUrl(source: TaskSourceConfig, id: string, value: Record<string, unknown>): string {
  const base = webRoot(source);
  if (source.provider === 'clickup') return `https://app.clickup.com/t/${encodeURIComponent(id)}`;
  if (source.provider === 'vikunja') return `${base}/tasks/${id}`;
  if (source.provider === 'demo') return `https://example.invalid/unfold-demo/tasks/${id}`;
  if (source.provider === 'gitlab' && numericId.test(source.project)) {
    let url: URL;
    try { url = new URL(field(value.web_url, 2048)); } catch { throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid issue link.'); }
    if (url.origin !== new URL(base).origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(`${new URL(base).pathname.replace(/\/$/, '')}/`) || !url.pathname.endsWith(`/-/issues/${id}`)) throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid issue link.');
    return url.href;
  }
  const project = source.project.split('/').map(encodeURIComponent).join('/');
  return `${base}/${project}/${source.provider === 'gitlab' ? '-/issues' : 'issues'}/${id}`;
}

/** The web link of task `id` in `source`, built without reading the task, or an empty string when that is not possible (a GitLab project named by number) or `id` is not a plain identifier. */
export function sourceTaskUrl(source: TaskSourceConfig, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) return '';
  try { return taskUrl(source, id, {}); } catch { return ''; }
}

/** Adds `descriptionMarkdown` for display: a Vikunja HTML description becomes Markdown, any other description is copied unchanged. The snapshot's own fields, and so its revision and import, are untouched. */
export function presentTask(source: TaskSourceConfig, task: TaskSnapshot): PresentedTask {
  let markdown = descriptionMarkdown(task.provider, task.description, `${webRoot(source)}/`);
  if (source.token) markdown = markdown.replaceAll(source.token, '[redacted]');
  return { ...task, descriptionMarkdown: markdown };
}

function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function entries(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.slice(0, 50).filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }

function details(source: TaskSourceConfig, value: Record<string, unknown>): Pick<TaskSnapshot, 'labels' | 'assignees' | 'priority' | 'dueAt' | 'identifier'> {
  const label = (entry: unknown, max = 200) => typeof entry === 'string' && entry.trim() && entry.length <= max && !/[\u0000-\u001f\u007f]/.test(entry) ? (source.token ? entry.replaceAll(source.token, '[redacted]') : entry) : undefined;
  const color = (entry: unknown) => typeof entry === 'string' && /^#?[0-9a-fA-F]{6}$/.test(entry) ? `#${entry.replace('#', '').toLowerCase()}` : undefined;
  const date = (entry: unknown, milliseconds = false) => {
    if ((typeof entry !== 'string' && typeof entry !== 'number') || entry === '' || String(entry).startsWith('0001-')) return undefined;
    const parsed = new Date(milliseconds ? Number(entry) : entry);
    return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() > 1970 ? parsed.toISOString() : undefined;
  };
  const labels = (list: unknown, name: string, tint: string) => entries(list).map(entry => ({ name: label(entry[name]), color: color(entry[tint]) })).filter((entry): entry is { name: string; color: string | undefined } => Boolean(entry.name)).map(({ name, color }) => ({ name, ...(color ? { color } : {}) }));
  const people = (list: unknown, username: string, name: string) => entries(list).map(entry => ({ username: label(entry[username], 256), name: label(entry[name]) })).filter((entry): entry is { username: string; name: string | undefined } => Boolean(entry.username)).map(({ username, name }) => ({ username, ...(name ? { name } : {}) }));
  let result: Pick<TaskSnapshot, 'labels' | 'assignees' | 'priority' | 'dueAt' | 'identifier'> = {};
  if (source.provider === 'vikunja' || source.provider === 'demo') {
    const index = typeof value.index === 'number' && Number.isSafeInteger(value.index) && value.index > 0 ? `#${value.index}` : undefined;
    result = { labels: labels(value.labels, 'title', 'hex_color'), assignees: people(value.assignees, 'username', 'name'), priority: typeof value.priority === 'number' && Number.isSafeInteger(value.priority) && value.priority > 0 && value.priority <= 100 ? value.priority : undefined, dueAt: date(value.due_date), identifier: label(value.identifier, 64) ?? index };
  } else if (source.provider === 'forgejo' || source.provider === 'github') {
    result = { labels: labels(value.labels, 'name', 'color'), assignees: people(value.assignees, 'login', 'full_name'), dueAt: date(value.due_date), identifier: typeof value.number === 'number' ? `#${value.number}` : undefined };
  } else if (source.provider === 'gitlab') {
    result = { labels: Array.isArray(value.labels) ? value.labels.slice(0, 50).map(entry => typeof entry === 'string' ? label(entry) : entry && typeof entry === 'object' ? label((entry as Record<string, unknown>).name) : undefined).filter((name): name is string => Boolean(name)).map(name => ({ name })) : [], assignees: people(value.assignees, 'username', 'name'), dueAt: date(value.due_date), identifier: typeof value.iid === 'number' ? `#${value.iid}` : undefined };
  } else if (source.provider === 'clickup') {
    const priority = value.priority && typeof value.priority === 'object' ? Number((value.priority as Record<string, unknown>).id) : NaN;
    result = { labels: labels(value.tags, 'name', 'tag_bg'), assignees: people(value.assignees, 'username', 'email'), priority: Number.isSafeInteger(priority) && priority > 0 && priority <= 100 ? priority : undefined, dueAt: date(value.due_date, true), identifier: label(value.custom_id, 64) };
  }
  return Object.fromEntries(Object.entries(result).filter(([, entry]) => entry !== undefined && !(Array.isArray(entry) && !entry.length)));
}

function snapshot(source: TaskSourceConfig, raw: unknown, truncate = false): TaskSnapshot {
  const value = record(raw);
  let id: string;
  let title: string;
  let description: string;
  let status: TaskSnapshot['status'] = 'unknown';
  let updatedAt: string | undefined;
  let nativeRevision: string | undefined;
  let project = source.project;
  const limit = truncate ? maxResponseBytes : maxDescription;
  if (source.provider === 'forgejo' || source.provider === 'github') {
    if (value.pull_request) throw new TaskError(422, 'task_is_pull_request', 'Select an issue instead of a pull request.');
    id = taskId(source, value.number);
    title = field(value.title, 500);
    description = field(value.body, limit, true);
    status = value.state === 'open' ? 'open' : value.state === 'closed' ? 'closed' : 'unknown';
    updatedAt = updated(value.updated_at);
  } else if (source.provider === 'gitlab') {
    id = taskId(source, value.iid);
    title = field(value.title, 500);
    description = field(value.description, limit, true);
    status = value.state === 'opened' ? 'open' : value.state === 'closed' ? 'closed' : 'unknown';
    updatedAt = updated(value.updated_at);
    if (value.project_id !== undefined) {
      project = taskId(source, value.project_id);
      if (numericId.test(source.project) && source.project !== project) throw new TaskError(404, 'task_outside_source', 'This task is outside the configured project.');
    }
  } else if (source.provider === 'clickup') {
    id = taskId(source, value.id);
    if (String(record(value.list).id) !== source.project) throw new TaskError(404, 'task_outside_source', 'This task is outside the configured home list.');
    title = field(value.name, 500);
    description = field(value.markdown_description ?? value.text_content ?? value.description, limit, true);
    const type = record(value.status).type;
    status = value.archived === true || type === 'closed' || type === 'done' ? 'closed' : type === 'open' || type === 'custom' ? 'open' : 'unknown';
    updatedAt = updated(value.date_updated, true);
    if (value.date_updated !== undefined && value.date_updated !== null) nativeRevision = field(String(value.date_updated), 128);
  } else if (source.provider === 'vikunja') {
    id = taskId(source, value.id);
    if (String(value.project_id) !== source.project) throw new TaskError(404, 'task_outside_source', 'This task is outside the configured project.');
    title = field(value.title, 500);
    description = field(value.description, limit, true);
    status = value.done === true ? 'closed' : value.done === false ? 'open' : 'unknown';
    updatedAt = updated(value.updated);
    if (value.updated !== undefined && value.updated !== null) nativeRevision = field(value.updated, 128);
  } else {
    id = taskId(source, value.id);
    title = field(value.title, 500);
    description = field(value.description, limit, true);
    status = 'open';
    updatedAt = '2026-09-09T00:00:00.000Z';
  }
  if (source.token) {
    title = title.replaceAll(source.token, '[redacted]');
    description = description.replaceAll(source.token, '[redacted]');
  }
  const key = `task:${digest([source.provider, source.baseUrl.replace(/\/+$/, ''), project, id])}`;
  const url = taskUrl(source, id, value);
  if (source.token) {
    let decoded: string;
    try { decoded = decodeURIComponent(url); } catch { throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid task link.'); }
    if (decoded.includes(source.token)) throw new TaskError(502, 'task_sensitive_response', 'The task service returned credential material in a task link. This snapshot cannot be imported.');
  }
  const revision = digest({ key, title, description, status, updatedAt, url });
  const truncated = description.length > maxDescription;
  if (truncated) description = description.slice(0, maxDescription).replace(/[\ud800-\udbff]$/, '');
  const result = { key, sourceId: source.id, provider: source.provider, id, revision, title, description, url, status, ...(updatedAt ? { updatedAt } : {}), ...(nativeRevision ? { nativeRevision, scope: project } : {}), repositoryId: source.repositoryId, ...details(source, value), ...(truncated ? { descriptionTruncated: true as const } : {}) };
  if (source.token && Object.values(result).some(value => typeof value === 'string' && value.includes(source.token!))) throw new TaskError(502, 'task_sensitive_response', 'The task service returned credential material in a task identity, revision or link. This snapshot cannot be imported.');
  return result;
}

export function taskBindingConfiguration(source: TaskSourceConfig, repository: Repository): string {
  return digest({ provider: source.provider, baseUrl: source.baseUrl, project: source.project, repositoryId: source.repositoryId, executionOwner: source.executionOwner, ploeg: source.ploeg, repositoryUrl: repository.url, baseBranch: repository.baseBranch });
}

function headers(source: TaskSourceConfig): Record<string, string> {
  const result: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'unfold-task-connector' };
  if (source.provider === 'github') { result.Accept = 'application/vnd.github+json'; result['X-GitHub-Api-Version'] = '2022-11-28'; }
  if (source.token) {
    if (source.provider === 'gitlab' && source.tokenType !== 'bearer') result['PRIVATE-TOKEN'] = source.token;
    else result.Authorization = source.provider === 'forgejo' ? `token ${source.token}` : source.provider === 'clickup' ? source.token : `Bearer ${source.token}`;
  }
  return result;
}

async function request(source: TaskSourceConfig, path: string, query: Record<string, string> = {}): Promise<{ value: unknown; headers: Headers }> {
  const url = new URL(`${source.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', headers: headers(source), redirect: 'manual', signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400) throw new TaskError(502, 'task_redirect_refused', 'The task service redirected the request. Update its configured API root.');
      if (response.status === 401 || response.status === 403) throw new TaskError(502, 'task_credentials_rejected', 'The task service rejected its configured credentials or permissions.');
      if (response.status === 404) throw new TaskError(404, 'task_not_found', 'The task or configured source was not found or is inaccessible.');
      if (response.status === 429) throw new TaskError(503, 'task_rate_limited', 'The task service rate limit was reached. Try again later.');
      throw new TaskError(502, 'task_service_failed', 'The task service could not complete this request.');
    }
    const type = response.headers.get('content-type') || '';
    if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(type)) { await response.body?.cancel(); throw new TaskError(502, 'task_response_invalid', 'The task service did not return JSON.'); }
    if (Number(response.headers.get('content-length')) > maxResponseBytes) { await response.body?.cancel(); throw new TaskError(502, 'task_response_too_large', 'The task service response exceeded the supported size.'); }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!response.body) throw new TaskError(502, 'task_response_invalid', 'The task service returned an empty response.');
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxResponseBytes) { await reader.cancel(); throw new TaskError(502, 'task_response_too_large', 'The task service response exceeded the supported size.'); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new TaskError(502, 'task_response_invalid', 'The task service returned invalid JSON.'); }
    return { value, headers: response.headers };
  } catch (error) {
    if (error instanceof TaskError) throw error;
    if (controller.signal.aborted) throw new TaskError(504, 'task_timeout', 'The task service did not respond in time.');
    throw new TaskError(502, 'task_unreachable', 'The task service could not be reached. Check its configured URL and network access.');
  } finally { clearTimeout(timer); }
}

function issuePath(source: TaskSourceConfig): string {
  if (source.provider === 'gitlab') return `/projects/${encodeURIComponent(source.project)}/issues`;
  return `/repos/${source.project.split('/').map(encodeURIComponent).join('/')}/issues`;
}

const demoBrief = (change: string, check: string) => `This is a local demonstration task, not a linked external tracker item.\n\n${change}\n\nAcceptance criteria:\n- ${check}\n- Keep the change ready for human review; do not publish or merge it.\n\nThis fixture makes no model calls and spends nothing.`;
const demoDue = (days: number) => new Date(Math.floor(Date.now() / 86400000 + days) * 86400000).toISOString();
const demoLabels = (...names: string[]) => names.map(title => ({ title }));

function demoTasks(source: TaskSourceConfig): TaskSnapshot[] {
  return [
    { id: '1', title: '[Demo fixture] Fix checkout rounding', priority: 4, due_date: demoDue(2), labels: demoLabels('ready'), description: 'This is a local demonstration task, not a linked external tracker item.\n\nFix the rounding regression in the order-service fixture.\n\nAcceptance criteria:\n- Checkout totals use decimal currency rounding.\n- Run the repository test suite and retain its actual result.\n- Keep the change ready for human review; do not publish or merge it.\n\nThis fixture runs real Git changes and checks without model calls or spend.' },
    { id: '2', title: '[Demo fixture] Show the delivery window on the order summary', priority: 3, labels: demoLabels('ready'), description: demoBrief('Show the expected delivery window on the order summary.', 'The order summary names the delivery window from the warehouse schedule.') },
    { id: '3', title: '[Demo fixture] Refuse negative quantities in the cart', priority: 3, due_date: demoDue(9), labels: demoLabels('ready'), description: demoBrief('Refuse a cart line with a quantity below zero.', 'The cart API answers 400 for a negative quantity.') },
    { id: '4', title: '[Demo fixture] Explain the shipping cost on the cart page', priority: 2, labels: demoLabels('ready'), description: demoBrief('Say on the cart page how the shipping cost is made up.', 'The cart page lists the shipping cost per parcel.') },
    { id: '5', title: '[Demo fixture] Check the postcode format at checkout', priority: 2, labels: demoLabels('ready', 'effort/S'), description: demoBrief('Check the postcode format before checkout accepts an address.', 'Checkout refuses a postcode that does not match the country format.') },
    { id: '6', title: '[Demo fixture] Name the shop in the order confirmation email', labels: demoLabels('ready'), description: demoBrief('Put the shop name in the subject of the order confirmation email.', 'The confirmation email subject starts with the shop name.') },
    { id: '7', title: '[Demo fixture] Interview five shops about delivery windows', priority: 3, labels: demoLabels('ready', 'repo/market-research'), description: demoBrief('Write up five shop interviews about delivery windows.', 'The research notes hold one summary per shop.') },
    { id: '8', title: '[Demo fixture] Order the new packaging boxes from the supplier', priority: 4, labels: demoLabels('repo/warehouse'), description: demoBrief('Order 500 packaging boxes in the new size.', 'The supplier confirms the order.') },
  ].map(value => snapshot(source, value));
}

export async function listTasks(source: TaskSourceConfig, page = 1): Promise<TaskPage> {
  if (!Number.isSafeInteger(page) || page < 1 || page > maxPage) throw new TaskError(400, 'task_page_invalid', 'Task page must be an integer between 1 and 1000.');
  if (source.provider === 'demo') return { tasks: page === 1 ? demoTasks(source) : [] };
  const pageSize = source.provider === 'clickup' ? 100 : 50;
  let path: string;
  let query: Record<string, string>;
  if (source.provider === 'clickup') {
    path = `/list/${source.project}/task`;
    query = { page: String(page - 1), include_closed: 'false', include_timl: 'false', include_markdown_description: 'true', subtasks: 'true', order_by: 'updated', reverse: 'true' };
  } else if (source.provider === 'vikunja') {
    path = '/tasks';
    query = { page: String(page), per_page: String(pageSize), filter: `project_id = ${source.project} && done = false`, sort_by: 'updated', order_by: 'desc' };
  } else {
    path = issuePath(source);
    query = source.provider === 'forgejo' ? { page: String(page), limit: String(pageSize), state: 'open', type: 'issues', sort: 'updated', direction: 'desc' } : source.provider === 'gitlab' ? { page: String(page), per_page: String(pageSize), state: 'opened', scope: 'all', order_by: 'updated_at', sort: 'desc' } : { page: String(page), per_page: String(pageSize), state: 'open', sort: 'updated', direction: 'desc' };
  }
  const response = await request(source, path, query);
  const rawTasks = source.provider === 'clickup' ? record(response.value).tasks : response.value;
  if (!Array.isArray(rawTasks) || rawTasks.length > 100) throw new TaskError(502, 'task_response_invalid', 'The task service returned an unsupported task page.');
  const tasks = rawTasks.filter(value => !((source.provider === 'github' || source.provider === 'forgejo') && record(value).pull_request)).map(value => snapshot(source, value, true)).filter(task => task.status === 'open');
  let hasNext = rawTasks.length >= pageSize;
  if (source.provider === 'clickup' && typeof record(response.value).last_page === 'boolean') hasNext = record(response.value).last_page === false;
  else if (response.headers.has('x-next-page')) hasNext = Number(response.headers.get('x-next-page')) === page + 1;
  else if (response.headers.has('x-pagination-total-pages')) hasNext = Number(response.headers.get('x-pagination-total-pages')) > page;
  else if (response.headers.has('link')) hasNext = /;\s*rel="?next"?(?:\s*,|\s*$)/i.test(response.headers.get('link') || '');
  return { tasks, ...(hasNext && page < maxPage ? { nextPage: page + 1 } : {}) };
}

/** Reads one task; `truncate` shortens an oversized description for display and marks it, while import keeps refusing it. */
export async function getTask(source: TaskSourceConfig, nativeId: string, truncate = false): Promise<TaskSnapshot> { return (await readTask(source, nativeId, truncate)).task; }

async function readTask(source: TaskSourceConfig, nativeId: string, truncate: boolean): Promise<{ task: TaskSnapshot; value: Record<string, unknown> }> {
  const id = taskId(source, nativeId);
  if (source.provider === 'demo') {
    const task = demoTasks(source).find(entry => entry.id === id);
    if (!task) throw new TaskError(404, 'task_not_found', 'The demonstration task does not exist.');
    return { task, value: {} };
  }
  const path = source.provider === 'clickup' ? `/task/${encodeURIComponent(id)}` : source.provider === 'vikunja' ? `/tasks/${id}` : `${issuePath(source)}/${id}`;
  const response = await request(source, path, source.provider === 'clickup' ? { include_markdown_description: 'true' } : {});
  const task = snapshot(source, response.value, truncate);
  if (task.id !== id) throw new TaskError(502, 'task_response_invalid', 'The task service returned a different task than requested.');
  return { task, value: record(response.value) };
}

function trackerUserId(entry: Record<string, unknown>): number | undefined {
  return typeof entry.id === 'number' && Number.isSafeInteger(entry.id) && entry.id > 0 ? entry.id : undefined;
}

function trackerHandles(source: TaskSourceConfig, entry: Record<string, unknown>): string[] {
  return (source.provider === 'clickup' ? [entry.username, entry.email] : [entry.username]).filter((name): name is string => typeof name === 'string' && name.length > 0).map(name => name.toLowerCase());
}

/** Reads a Vikunja or ClickUp task for hand-off: an oversized description is truncated rather than refused, and assignee user IDs are keyed by lowercase username, and on ClickUp also by lowercase email address. */
export async function getHandoffTask(source: TaskSourceConfig, nativeId: string): Promise<{ task: TaskSnapshot; assigneeIds: Map<string, number> }> {
  if (!handoffProviders.has(source.provider)) throw new TaskError(422, 'handoff_unsupported', handoffOnly);
  const { task, value } = await readTask(source, nativeId, true);
  const assigneeIds = new Map<string, number>();
  for (const entry of entries(value.assignees)) {
    const id = trackerUserId(entry);
    if (id) for (const name of trackerHandles(source, entry)) assigneeIds.set(name, id);
  }
  return { task, assigneeIds };
}

/** Returns the Vikunja project or ClickUp home List that holds a task, or undefined when the source cannot read it. */
export async function taskProject(source: TaskSourceConfig, nativeId: string): Promise<string | undefined> {
  if (!handoffProviders.has(source.provider)) return undefined;
  const id = taskId(source, nativeId);
  try {
    if (source.provider === 'clickup') { const list = String(record(record((await request(source, `/task/${encodeURIComponent(id)}`)).value).list).id ?? ''); return numericId.test(list) ? list : undefined; }
    const value = record((await request(source, `/tasks/${id}`)).value); return typeof value.project_id === 'number' && Number.isSafeInteger(value.project_id) ? String(value.project_id) : undefined;
  }
  catch (error) { if (error instanceof TaskError) return undefined; throw error; }
}

/**
 * Resolves a tracker username to its user ID; matching ignores case. Vikunja looks among the project's users and then
 * through user search. ClickUp looks among the List's members and then the Workspace members, and also matches an email
 * address, because Ploeg routes ClickUp assignees by username or email.
 */
export async function findTrackerUser(source: TaskSourceConfig, username: string): Promise<number | undefined> {
  const wanted = username.toLowerCase();
  const lookups: [string, Record<string, string>, (value: unknown) => Record<string, unknown>[]][] = source.provider === 'clickup'
    ? [[`/list/${source.project}/member`, {}, value => entries(record(value).members)], ['/team', {}, value => entries(record(value).teams).flatMap(team => entries(team.members)).map(member => member.user && typeof member.user === 'object' && !Array.isArray(member.user) ? member.user as Record<string, unknown> : {})]]
    : [[`/projects/${source.project}/projectusers`, { s: username }, entries], ['/users', { s: username }, entries]];
  for (const [path, query, users] of lookups) {
    let found: Record<string, unknown>[];
    try { found = users((await request(source, path, query)).value); } catch (error) { if (error instanceof TaskError && error.code !== 'task_unreachable' && error.code !== 'task_timeout') continue; throw error; }
    const id = found.filter(user => trackerHandles(source, user).includes(wanted)).map(trackerUserId).find(Boolean);
    if (id) return id;
  }
  return undefined;
}

async function write(source: TaskSourceConfig, method: 'PUT' | 'POST' | 'DELETE', path: string, payload?: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(`${source.baseUrl}${path}`), { method, headers: { ...headers(source), ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), redirect: 'manual', signal: controller.signal });
    await response.body?.cancel();
    if (response.ok) return;
    if (response.status >= 300 && response.status < 400) throw new TaskError(502, 'task_redirect_refused', 'The task service redirected the request. Update its configured API root.');
    if (response.status === 401 || response.status === 403) throw new TaskError(502, 'task_write_forbidden', `The workbench’s ${trackerName(source)} token may not change this task. Give it permission to add and remove task assignees and to add task comments, then try again.`);
    if (response.status === 404) throw new TaskError(404, 'task_not_found', 'The task or configured source was not found or is inaccessible.');
    if (response.status === 400 || response.status === 409) throw new TaskError(409, 'task_write_conflict', 'The task service refused the change. Refresh the task and try again.');
    if (response.status === 429) throw new TaskError(503, 'task_rate_limited', 'The task service rate limit was reached. Try again later.');
    throw new TaskError(502, 'task_service_failed', 'The task service could not complete this request.');
  } catch (error) {
    if (error instanceof TaskError) throw error;
    if (controller.signal.aborted) throw new TaskError(504, 'task_timeout', 'The task service did not respond in time.');
    throw new TaskError(502, 'task_unreachable', 'The task service could not be reached. Check its configured URL and network access.');
  } finally { clearTimeout(timer); }
}

/** Adds or removes one Vikunja or ClickUp assignee on a task, using the source's server credential. */
export async function setTrackerAssignee(source: TaskSourceConfig, nativeId: string, userId: number, assigned: boolean): Promise<void> {
  const id = taskId(source, nativeId);
  if (!handoffProviders.has(source.provider) || !Number.isSafeInteger(userId) || userId < 1) throw new TaskError(422, 'handoff_unsupported', handoffOnly);
  if (source.provider === 'clickup') return write(source, 'PUT', `/task/${encodeURIComponent(id)}`, { assignees: { add: assigned ? [userId] : [], rem: assigned ? [] : [userId] } });
  await (assigned ? write(source, 'PUT', `/tasks/${id}/assignees`, { user_id: userId }) : write(source, 'DELETE', `/tasks/${id}/assignees/${userId}`));
}

/** Leaves a comment on a task, using the source's server credential: HTML on Vikunja, plain text on ClickUp, which notifies nobody. */
export async function commentOnTask(source: TaskSourceConfig, nativeId: string, body: string): Promise<void> {
  const id = taskId(source, nativeId);
  if (!handoffProviders.has(source.provider)) throw new TaskError(422, 'handoff_unsupported', handoffOnly);
  if (source.provider === 'clickup') return write(source, 'POST', `/task/${encodeURIComponent(id)}/comment`, { comment_text: body, notify_all: false });
  await write(source, 'PUT', `/tasks/${id}/comments`, { comment: body });
}

/** A file Report a problem attaches to the issue it files. */
export type IssueFile = { name: string; type: string; bytes: Uint8Array<ArrayBuffer> };
/** The issue or task Report a problem filed: its native id, the number used in later calls, and its web address. */
export type FiledIssue = { id: string; number: string; url: string };

const reportProviders = new Set<TaskProvider>(['forgejo', 'vikunja']);
const uploadTimeoutMs = 30000;

async function fileRequest(source: TaskSourceConfig, method: 'POST' | 'PUT' | 'PATCH' | 'GET', path: string, body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), body instanceof FormData ? uploadTimeoutMs : timeoutMs);
  try {
    const json = body !== undefined && !(body instanceof FormData);
    const response = await fetch(new URL(`${source.baseUrl}${path}`), { method, headers: { ...headers(source), ...(json ? { 'Content-Type': 'application/json' } : {}) }, ...(body === undefined ? {} : { body: json ? JSON.stringify(body) : body as FormData }), redirect: 'manual', signal: controller.signal });
    if (!response.ok) {
      const answer = (await response.text().catch(() => '')).slice(0, 300);
      if (response.status >= 300 && response.status < 400) throw new TaskError(502, 'task_redirect_refused', 'The tracker redirected the request. Update its configured API root.');
      if (response.status === 401 || response.status === 403) throw new TaskError(502, 'report_write_forbidden', `The tracker refused the workbench's token (HTTP ${response.status}). Give it permission to create issues or tasks and attachments.`);
      if (response.status === 404) throw new TaskError(404, 'report_target_missing', 'The tracker could not find the configured repository or project.');
      if (response.status === 429) throw new TaskError(503, 'task_rate_limited', 'The tracker rate limit was reached. Unfold will try again.');
      throw new TaskError(502, 'report_tracker_failed', `The tracker answered HTTP ${response.status}${answer ? `: ${answer}` : ''}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof TaskError) throw error;
    if (controller.signal.aborted) throw new TaskError(504, 'task_timeout', 'The tracker did not respond in time.');
    throw new TaskError(502, 'task_unreachable', 'The tracker could not be reached. Check its configured URL and network access.');
  } finally { clearTimeout(timer); }
}

function reportProject(source: TaskSourceConfig, project: string): string {
  if (!reportProviders.has(source.provider)) throw new TaskError(422, 'report_provider_unsupported', 'Report a problem files into Forgejo and Vikunja only.');
  return configuredProject(project, source.provider);
}

/**
 * Creates the issue (Forgejo) or task (Vikunja) for one report in `project`, with the label `reported-in-app` when
 * a Forgejo repository has it. `body` is Markdown for Forgejo and HTML for Vikunja.
 */
export async function createIssue(source: TaskSourceConfig, project: string, title: string, body: string): Promise<FiledIssue> {
  const target = reportProject(source, project);
  if (source.provider === 'forgejo') {
    const labels = await fileRequest(source, 'GET', `/repos/${target}/labels?limit=50`).catch(() => []);
    const label = Array.isArray(labels) ? labels.find(entry => record(entry).name === 'reported-in-app') : undefined;
    const issue = record(await fileRequest(source, 'POST', `/repos/${target}/issues`, { title, body, ...(label ? { labels: [record(label).id] } : {}) }));
    const number = String(issue.number ?? '');
    if (!numericId.test(number) || typeof issue.html_url !== 'string') throw new TaskError(502, 'task_response_invalid', 'The tracker did not answer with an issue number and address.');
    return { id: String(issue.id ?? number), number, url: issue.html_url };
  }
  const task = record(await fileRequest(source, 'PUT', `/projects/${target}/tasks`, { title, description: body }));
  const id = String(task.id ?? '');
  if (!numericId.test(id)) throw new TaskError(502, 'task_response_invalid', 'The tracker did not answer with a task id.');
  return { id, number: id, url: sourceTaskUrl(source, id) };
}

/** Attaches one file to a filed issue or task and returns its download address when the tracker gives one. */
export async function attachToIssue(source: TaskSourceConfig, project: string, issue: FiledIssue, file: IssueFile): Promise<string | undefined> {
  const target = reportProject(source, project);
  const form = new FormData();
  const blob = new Blob([file.bytes], { type: file.type });
  if (source.provider === 'forgejo') {
    form.append('attachment', blob, file.name);
    const asset = record(await fileRequest(source, 'POST', `/repos/${target}/issues/${issue.number}/assets?name=${encodeURIComponent(file.name)}`, form));
    return typeof asset.browser_download_url === 'string' ? asset.browser_download_url : undefined;
  }
  form.append('files', blob, file.name);
  await fileRequest(source, 'PUT', `/tasks/${issue.id}/attachments`, form);
  return undefined;
}

/** Replaces a filed Forgejo issue's body, so it can show the screenshot uploaded after it was created. */
export async function updateIssueBody(source: TaskSourceConfig, project: string, issue: FiledIssue, body: string): Promise<void> {
  const target = reportProject(source, project);
  if (source.provider !== 'forgejo') return;
  await fileRequest(source, 'PATCH', `/repos/${target}/issues/${issue.number}`, { body });
}

/** Checks a report target's project against its provider's rules, so a bad setting fails at start-up. */
export function reportTargetProject(source: TaskSourceConfig, project: string): string {
  try { return reportProject(source, project); } catch (error) { throw new Error(error instanceof TaskError ? error.message : `reports.project ${(error as Error).message.replace(/^Task source project/, 'must be')}`); }
}

/** One comment on a filed issue or task as plain text. `mine` marks the comments the workbench's token wrote. */
export type IssueComment = { id: string; author: string; text: string; at: string; mine: boolean };
/** The pull request that names a filed Forgejo issue, newest first. */
export type IssueFix = { number: string; url: string; merged: boolean; mergedAt?: string };
/** The first release of the running version's line made after a fix was merged, and whether the running version has it. */
export type IssueRelease = { tag: string; url: string; at: string; live: boolean };
/** What the tracker says about a filed issue or task now. */
export type IssueState = { open: boolean; closedAt?: string; labels: string[]; assigned: boolean; comments: IssueComment[]; fix?: IssueFix; release?: IssueRelease };

const maxCommentText = 600;
const trackerLogins = new Map<string, Promise<string>>();

function plain(value: unknown, html: boolean): string {
  const text = String(value ?? '');
  const flat = html ? text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : text.replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]').replace(/<[^>]*>/g, '');
  const squeezed = flat.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return squeezed.length > maxCommentText ? `${squeezed.slice(0, maxCommentText - 1)}…` : squeezed;
}

function when(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && !value.startsWith('0001-') ? new Date(value).toISOString() : undefined;
}

function trackerLogin(source: TaskSourceConfig): Promise<string> {
  const key = `${source.baseUrl}\u0000${source.token ?? ''}`;
  let login = trackerLogins.get(key);
  if (!login) {
    login = fileRequest(source, 'GET', '/user').then(value => String(record(value)[source.provider === 'forgejo' ? 'login' : 'username'] ?? ''));
    login.catch(() => trackerLogins.delete(key));
    trackerLogins.set(key, login);
  }
  return login;
}

function releaseVersion(tag: string): { line: string; version: string } | undefined {
  const match = /^(.*?v?)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
  return match ? { line: match[1], version: match[2] } : undefined;
}

async function releaseAfter(source: TaskSourceConfig, target: string, mergedAt: string, version: string): Promise<IssueRelease | undefined> {
  const listed = await fileRequest(source, 'GET', `/repos/${target}/releases?limit=50`);
  const releases = (Array.isArray(listed) ? listed : []).map(entry => record(entry)).filter(entry => !entry.draft && typeof entry.tag_name === 'string' && when(entry.created_at))
    .map(entry => ({ tag: String(entry.tag_name), url: typeof entry.html_url === 'string' ? entry.html_url : '', at: when(entry.created_at)! }));
  const running = releases.find(entry => releaseVersion(entry.tag)?.version === version);
  if (!running) return undefined;
  const line = releaseVersion(running.tag)!.line;
  const first = releases.filter(entry => releaseVersion(entry.tag)?.line === line && entry.at >= mergedAt).sort((a, b) => a.at.localeCompare(b.at))[0];
  return first ? { ...first, live: first.at <= running.at } : undefined;
}

/**
 * Reads what the tracker says about a filed issue (Forgejo) or task (Vikunja) now: open or closed, labels, whether
 * someone is assigned, and the latest comments as plain text. For Forgejo it also finds the newest pull request that
 * names the issue and, once that is merged, the first release of the line `version` belongs to that came after it.
 * A release is only named when one of the repository's releases carries `version`, so another product's tags never
 * count.
 */
export async function readIssueState(source: TaskSourceConfig, project: string, issue: FiledIssue, version: string): Promise<IssueState> {
  const target = reportProject(source, project);
  const login = await trackerLogin(source).catch(() => '');
  if (source.provider === 'forgejo') {
    const value = record(await fileRequest(source, 'GET', `/repos/${target}/issues/${issue.number}`));
    const timeline = await fileRequest(source, 'GET', `/repos/${target}/issues/${issue.number}/timeline?limit=50`).catch(() => []);
    const events = (Array.isArray(timeline) ? timeline : []).map(entry => record(entry));
    const comments = events.filter(entry => entry.type === 'comment' && when(entry.created_at)).map(entry => {
      const author = String(record(entry.user ?? {}).login ?? '');
      return { id: String(entry.id ?? ''), author, text: plain(entry.body, false), at: when(entry.created_at)!, mine: Boolean(login) && author === login };
    }).filter(comment => comment.text);
    const reference = events.filter(entry => entry.type === 'pull_ref' && entry.ref_issue && typeof entry.ref_issue === 'object').map(entry => record(entry.ref_issue)).at(-1);
    let fix: IssueFix | undefined;
    if (reference && numericId.test(String(reference.number ?? ''))) {
      const pull = record(await fileRequest(source, 'GET', `/repos/${target}/pulls/${reference.number}`).catch(() => reference));
      fix = { number: String(reference.number), url: String(pull.html_url ?? reference.html_url ?? ''), merged: pull.merged === true, ...(when(pull.merged_at) ? { mergedAt: when(pull.merged_at) } : {}) };
    }
    const release = fix?.mergedAt ? await releaseAfter(source, target, fix.mergedAt, version).catch(() => undefined) : undefined;
    const labels = (Array.isArray(value.labels) ? value.labels : []).map(label => String(record(label).name ?? '')).filter(Boolean);
    const assignees = Array.isArray(value.assignees) ? value.assignees : [];
    return { open: value.state !== 'closed', ...(when(value.closed_at) ? { closedAt: when(value.closed_at) } : {}), labels, assigned: assignees.length > 0, comments: comments.slice(-10), ...(fix ? { fix } : {}), ...(release ? { release } : {}) };
  }
  const task = record(await fileRequest(source, 'GET', `/tasks/${issue.id}`));
  const listed = await fileRequest(source, 'GET', `/tasks/${issue.id}/comments`).catch(() => []);
  const comments = (Array.isArray(listed) ? listed : []).map(entry => record(entry)).filter(entry => when(entry.created)).map(entry => {
    const author = String(record(entry.author ?? {}).username ?? '');
    return { id: String(entry.id ?? ''), author, text: plain(entry.comment, true), at: when(entry.created)!, mine: Boolean(login) && author === login };
  }).filter(comment => comment.text);
  const labels = (Array.isArray(task.labels) ? task.labels : []).map(label => String(record(label).title ?? '')).filter(Boolean);
  const assignees = Array.isArray(task.assignees) ? task.assignees : [];
  return { open: task.done !== true, ...(task.done === true && when(task.done_at) ? { closedAt: when(task.done_at) } : {}), labels, assigned: assignees.length > 0, comments: comments.slice(-10) };
}

/** Adds a comment to a filed issue or task: Markdown for Forgejo, HTML for Vikunja. */
export async function commentOnIssue(source: TaskSourceConfig, project: string, issue: FiledIssue, body: string): Promise<void> {
  const target = reportProject(source, project);
  if (source.provider === 'forgejo') await fileRequest(source, 'POST', `/repos/${target}/issues/${issue.number}/comments`, { body });
  else await fileRequest(source, 'PUT', `/tasks/${issue.id}/comments`, { comment: body });
}
