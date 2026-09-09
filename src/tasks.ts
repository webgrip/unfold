import { createHash } from 'node:crypto';
import type { Repository } from './types.ts';

export type TaskProvider = 'forgejo' | 'github' | 'gitlab' | 'clickup' | 'vikunja' | 'demo';
export type TaskSourceConfig = { id: string; name: string; provider: TaskProvider; baseUrl: string; project: string; repositoryId: string; token?: string; executionOwner: 'interactive' | 'ploeg' };
export type TaskSnapshot = { key: string; sourceId: string; provider: TaskProvider; id: string; revision: string; title: string; description: string; url: string; status: 'open' | 'closed' | 'unknown'; updatedAt?: string; repositoryId: string };
export type TaskPage = { tasks: TaskSnapshot[]; nextPage?: number };

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
const timeoutMs = 10000;
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;
const numericId = /^[1-9][0-9]{0,19}$/;
const projectPart = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,254}$/;
const sourceFields = new Set(['id', 'name', 'provider', 'baseUrl', 'project', 'repositoryId', 'tokenEnv', 'executionOwner']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskError(502, 'task_response_invalid', 'The task service returned an unsupported response.');
  return value as Record<string, unknown>;
}

function configText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

function apiRoot(value: unknown, provider: TaskProvider): string {
  if (!configText(value, 2048) || /[%\\]/.test(value)) throw new Error('Task source baseUrl must be a complete API root URL');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Task source baseUrl must be a complete API root URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback)) || parsed.username || parsed.password || parsed.search || parsed.hash || /[%\\]/.test(parsed.pathname)) throw new Error('Task source baseUrl requires HTTPS, no credentials, query or fragment; HTTP is allowed only on loopback');
  const path = parsed.pathname.replace(/\/+$/, '');
  const suffix = provider === 'gitlab' ? '/api/v4' : provider === 'clickup' ? '/api/v2' : '/api/v1';
  if (provider !== 'demo' && provider !== 'github' && !path.endsWith(suffix)) throw new Error(`Task source baseUrl must end with ${suffix}`);
  if (provider === 'github' && !(parsed.hostname === 'api.github.com' && path === '') && !path.endsWith('/api/v3')) throw new Error('GitHub baseUrl must be https://api.github.com or an enterprise API root ending with /api/v3');
  return `${parsed.origin}${path}`;
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
    let token: string | undefined;
    if (source.tokenEnv !== undefined) {
      if (typeof source.tokenEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(source.tokenEnv)) throw new Error('Task source tokenEnv must name an environment variable');
      token = process.env[source.tokenEnv];
      if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new Error('Task source tokenEnv must reference a non-empty, valid API token');
    }
    const identity = JSON.stringify([provider, baseUrl, project]);
    const mapping = JSON.stringify([source.repositoryId, source.executionOwner]);
    if (mappings.has(identity) && mappings.get(identity) !== mapping) throw new Error('Aliases of a task source must use the same repository and execution owner');
    mappings.set(identity, mapping);
    return { id: source.id, name: source.name, provider, baseUrl, project, repositoryId: source.repositoryId, executionOwner: source.executionOwner, ...(token ? { token } : {}) };
  });
}

export function publicTaskSource(source: TaskSourceConfig) {
  return { id: source.id, name: source.name, provider: source.provider, repositoryId: source.repositoryId, executionOwner: source.executionOwner };
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
  if (source.provider === 'github' && new URL(source.baseUrl).hostname === 'api.github.com') return 'https://github.com';
  return source.baseUrl.replace(/\/api\/v[1-4]$/, '');
}

function taskUrl(source: TaskSourceConfig, id: string, value: Record<string, unknown>): string {
  const base = webRoot(source);
  if (source.provider === 'clickup') return `https://app.clickup.com/t/${encodeURIComponent(id)}`;
  if (source.provider === 'vikunja') return `${base}/tasks/${id}`;
  if (source.provider === 'demo') return 'https://example.invalid/de-vloer-demo/tasks/1';
  if (source.provider === 'gitlab' && numericId.test(source.project)) {
    let url: URL;
    try { url = new URL(field(value.web_url, 2048)); } catch { throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid issue link.'); }
    if (url.origin !== new URL(base).origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(`${new URL(base).pathname.replace(/\/$/, '')}/`) || !url.pathname.endsWith(`/-/issues/${id}`)) throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid issue link.');
    return url.href;
  }
  const project = source.project.split('/').map(encodeURIComponent).join('/');
  return `${base}/${project}/${source.provider === 'gitlab' ? '-/issues' : 'issues'}/${id}`;
}

function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function snapshot(source: TaskSourceConfig, raw: unknown): TaskSnapshot {
  const value = record(raw);
  let id: string;
  let title: string;
  let description: string;
  let status: TaskSnapshot['status'] = 'unknown';
  let updatedAt: string | undefined;
  let project = source.project;
  if (source.provider === 'forgejo' || source.provider === 'github') {
    if (value.pull_request) throw new TaskError(422, 'task_is_pull_request', 'Select an issue instead of a pull request.');
    id = taskId(source, value.number);
    title = field(value.title, 500);
    description = field(value.body, 16000, true);
    status = value.state === 'open' ? 'open' : value.state === 'closed' ? 'closed' : 'unknown';
    updatedAt = updated(value.updated_at);
  } else if (source.provider === 'gitlab') {
    id = taskId(source, value.iid);
    title = field(value.title, 500);
    description = field(value.description, 16000, true);
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
    description = field(value.markdown_description ?? value.text_content ?? value.description, 16000, true);
    const type = record(value.status).type;
    status = value.archived === true || type === 'closed' || type === 'done' ? 'closed' : type === 'open' || type === 'custom' ? 'open' : 'unknown';
    updatedAt = updated(value.date_updated, true);
  } else if (source.provider === 'vikunja') {
    id = taskId(source, value.id);
    if (String(value.project_id) !== source.project) throw new TaskError(404, 'task_outside_source', 'This task is outside the configured project.');
    title = field(value.title, 500);
    description = field(value.description, 16000, true);
    status = value.done === true ? 'closed' : value.done === false ? 'open' : 'unknown';
    updatedAt = updated(value.updated);
  } else {
    id = taskId(source, value.id);
    title = field(value.title, 500);
    description = field(value.description, 16000, true);
    status = 'open';
    updatedAt = '2026-09-09T00:00:00.000Z';
  }
  const key = `task:${digest([source.provider, source.baseUrl.replace(/\/+$/, ''), project, id])}`;
  const url = taskUrl(source, id, value);
  const revision = digest({ key, title, description, status, updatedAt, url });
  return { key, sourceId: source.id, provider: source.provider, id, revision, title, description, url, status, ...(updatedAt ? { updatedAt } : {}), repositoryId: source.repositoryId };
}

function headers(source: TaskSourceConfig): Record<string, string> {
  const result: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'de-vloer-task-connector' };
  if (source.provider === 'github') { result.Accept = 'application/vnd.github+json'; result['X-GitHub-Api-Version'] = '2022-11-28'; }
  if (source.token) {
    if (source.provider === 'gitlab') result['PRIVATE-TOKEN'] = source.token;
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

function demoTask(source: TaskSourceConfig): TaskSnapshot {
  return snapshot(source, { id: '1', title: '[Demo fixture] Fix checkout rounding', description: 'This is a local demonstration task, not a linked external tracker item.\n\nFix the rounding regression in the order-service fixture.\n\nAcceptance criteria:\n- Checkout totals use decimal currency rounding.\n- Run the repository test suite and retain its actual result.\n- Keep the change ready for human review; do not publish or merge it.\n\nThis fixture runs real Git changes and checks without model calls or spend.' });
}

export async function listTasks(source: TaskSourceConfig, page = 1): Promise<TaskPage> {
  if (!Number.isSafeInteger(page) || page < 1 || page > maxPage) throw new TaskError(400, 'task_page_invalid', 'Task page must be an integer between 1 and 1000.');
  if (source.provider === 'demo') return { tasks: page === 1 ? [demoTask(source)] : [] };
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
  const tasks = rawTasks.filter(value => !((source.provider === 'github' || source.provider === 'forgejo') && record(value).pull_request)).map(value => snapshot(source, value)).filter(task => task.status === 'open');
  let hasNext = rawTasks.length >= pageSize;
  if (source.provider === 'clickup' && typeof record(response.value).last_page === 'boolean') hasNext = record(response.value).last_page === false;
  else if (response.headers.has('x-next-page')) hasNext = Number(response.headers.get('x-next-page')) === page + 1;
  else if (response.headers.has('x-pagination-total-pages')) hasNext = Number(response.headers.get('x-pagination-total-pages')) > page;
  else if (response.headers.has('link')) hasNext = /;\s*rel="?next"?(?:\s*,|\s*$)/i.test(response.headers.get('link') || '');
  return { tasks, ...(hasNext && page < maxPage ? { nextPage: page + 1 } : {}) };
}

export async function getTask(source: TaskSourceConfig, nativeId: string): Promise<TaskSnapshot> {
  const id = taskId(source, nativeId);
  if (source.provider === 'demo') {
    if (id !== '1') throw new TaskError(404, 'task_not_found', 'The demonstration task does not exist.');
    return demoTask(source);
  }
  const path = source.provider === 'clickup' ? `/task/${encodeURIComponent(id)}` : source.provider === 'vikunja' ? `/tasks/${id}` : `${issuePath(source)}/${id}`;
  const response = await request(source, path, source.provider === 'clickup' ? { include_markdown_description: 'true' } : {});
  const task = snapshot(source, response.value);
  if (task.id !== id) throw new TaskError(502, 'task_response_invalid', 'The task service returned a different task than requested.');
  return task;
}
