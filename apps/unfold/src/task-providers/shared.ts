import { createHash } from 'node:crypto';
import type { TaskPage, TaskSnapshot, TaskSourceConfig } from '../tasks.ts';
import { taskProvider, type DetailReaders, type TaskReading } from './registry.ts';

/** A tracker request that failed, with the HTTP status Unfold answers and a stable code. */
export class TaskError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds until the tracker allows asking again, for a `Retry-After` header. */
  readonly retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'TaskError';
    this.status = status;
    this.code = code;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

export const maxResponseBytes = 2 * 1024 * 1024;
export const maxPage = 1000;
export const maxDescription = 16000;
const timeoutMs = 10000;
const uploadTimeoutMs = 30000;
export const numericId = /^[1-9][0-9]{0,19}$/;
export const projectPart = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,254}$/;
const maxCommentText = 600;
const quietRetryMs = 2000;
const limitedUntil = new Map<string, number>();

function limitKey(source: TaskSourceConfig): string { return createHash('sha256').update(`${source.baseUrl}\u0000${source.token ?? ''}`).digest('hex'); }

/** Milliseconds until a tracker allows asking again, read from `Retry-After` or `X-RateLimit-Reset` (epoch seconds, as ClickUp and GitHub send it), or undefined when it says neither. */
export function retryDelay(headers: Headers, now = Date.now()): number | undefined {
  const after = headers.get('retry-after');
  if (after) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const at = Date.parse(after);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(reset) || reset <= 0) return undefined;
  return Math.max(0, (reset > 1e12 ? reset : reset * 1000) - now);
}

function rateLimited(source: TaskSourceConfig, waitMs: number | undefined): TaskError {
  const wait = Math.min(Math.max(waitMs ?? 60_000, 1000), 3_600_000);
  if (limitedUntil.size >= 500 && !limitedUntil.has(limitKey(source))) limitedUntil.delete(limitedUntil.keys().next().value!);
  limitedUntil.set(limitKey(source), Date.now() + wait);
  const adapter = taskProvider(source.provider);
  const seconds = Math.ceil(wait / 1000);
  return new TaskError(503, 'task_rate_limited', `${adapter.label} is limiting how often this account may ask.${adapter.rateLimit ? ` ${adapter.rateLimit}` : ''} Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`, seconds);
}

/** Refuses without asking while a tracker has said this account must wait. */
function holdBack(source: TaskSourceConfig): void {
  const until = limitedUntil.get(limitKey(source));
  if (until === undefined) return;
  if (until <= Date.now()) { limitedUntil.delete(limitKey(source)); return; }
  throw rateLimited(source, until - Date.now());
}

/** Remembers a spent allowance, so the next request waits for the reset instead of earning a 429. */
function noteAllowance(source: TaskSourceConfig, headers: Headers): void {
  if (headers.get('x-ratelimit-remaining') !== '0') return;
  const wait = retryDelay(headers);
  if (wait) limitedUntil.set(limitKey(source), Date.now() + Math.min(wait, 3_600_000));
}

const pause = (ms: number) => new Promise(done => setTimeout(done, ms));

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskError(502, 'task_response_invalid', 'The task service returned an unsupported response.');
  return value as Record<string, unknown>;
}

export function configText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Throws unless an API root path ends with `suffix`. */
export function requireSuffix(path: string, suffix: string): void {
  if (!path.endsWith(suffix)) throw new Error(`Task source baseUrl must end with ${suffix}`);
}

/** Checks a project made of path parts, such as `owner/repository`; `parts` is the exact count, or undefined for any count with a numeric single part. */
export function pathProject(value: string, parts: number | undefined): string[] {
  const split = value.split('/');
  if (split.some(part => !projectPart.test(part) || part === '.' || part === '..') || (parts !== undefined && split.length !== parts) || (parts === undefined && split.length === 1 && !numericId.test(value))) throw new Error('Task source project must be owner/repository, or a GitLab project ID or namespace/path');
  return split;
}

export function nativeTaskId(pattern: RegExp, value: unknown): string {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof id !== 'string' || !pattern.test(id)) throw new TaskError(400, 'task_id_invalid', 'Use the native task ID or issue number.');
  return id;
}

export function field(value: unknown, maxLength: number, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > maxLength || (!optional && !value.trim()) || value.includes('\u0000')) throw new TaskError(502, 'task_response_invalid', 'The task service returned missing or oversized task content.');
  return value;
}

export function updated(value: unknown, milliseconds = false): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid revision timestamp.');
  const date = new Date(milliseconds ? Number(value) : String(value));
  if (!Number.isFinite(date.getTime())) throw new TaskError(502, 'task_response_invalid', 'The task service returned an invalid revision timestamp.');
  return date.toISOString();
}

export function entries(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.slice(0, 50).filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }

/** The readers an adapter's `details` uses, which redact the source's token from every label and name. */
export function detailReaders(source: TaskSourceConfig): DetailReaders {
  const label = (entry: unknown, max = 200) => typeof entry === 'string' && entry.trim() && entry.length <= max && !/[\u0000-\u001f\u007f]/.test(entry) ? (source.token ? entry.replaceAll(source.token, '[redacted]') : entry) : undefined;
  const color = (entry: unknown) => typeof entry === 'string' && /^#?[0-9a-fA-F]{6}$/.test(entry) ? `#${entry.replace('#', '').toLowerCase()}` : undefined;
  const date = (entry: unknown, milliseconds = false) => {
    if ((typeof entry !== 'string' && typeof entry !== 'number') || entry === '' || String(entry).startsWith('0001-')) return undefined;
    const parsed = new Date(milliseconds ? Number(entry) : entry);
    return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() > 1970 ? parsed.toISOString() : undefined;
  };
  const labels = (list: unknown, name: string, tint: string) => entries(list).map(entry => ({ name: label(entry[name]), color: color(entry[tint]) })).filter((entry): entry is { name: string; color: string | undefined } => Boolean(entry.name)).map(({ name, color }) => ({ name, ...(color ? { color } : {}) }));
  const people = (list: unknown, username: string, name: string) => entries(list).map(entry => ({ username: label(entry[username], 256), name: label(entry[name]) })).filter((entry): entry is { username: string; name: string | undefined } => Boolean(entry.username)).map(({ username, name }) => ({ username, ...(name ? { name } : {}) }));
  return { label, date, labels, people };
}

/** The default web root of a tracker: its API root without the `/api/vN` suffix. */
export function apiWebRoot(source: TaskSourceConfig): string { return source.baseUrl.replace(/\/api\/v[1-4]$/, ''); }

export function headers(source: TaskSourceConfig): Record<string, string> {
  const result: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'unfold-task-connector' };
  taskProvider(source.provider).headers(source, result);
  return result;
}

/**
 * Reads one JSON response from a tracker, refusing redirects, non-JSON answers and anything over 2 MiB. A 429 that
 * asks for at most two seconds is waited out and asked once more; a longer one, or a spent allowance the tracker
 * announced, refuses with `task_rate_limited` and its `retryAfter` without asking again until the reset.
 */
export async function request(source: TaskSourceConfig, path: string, query: Record<string, string> = {}): Promise<{ value: unknown; headers: Headers }> {
  const url = new URL(`${source.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  holdBack(source);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, { method: 'GET', headers: headers(source), redirect: 'manual', signal: controller.signal });
    if (response.status === 429) {
      const wait = retryDelay(response.headers);
      await response.body?.cancel();
      if (wait === undefined || wait > quietRetryMs) throw rateLimited(source, wait);
      await pause(wait);
      response = await fetch(url, { method: 'GET', headers: headers(source), redirect: 'manual', signal: controller.signal });
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400) throw new TaskError(502, 'task_redirect_refused', 'The task service redirected the request. Update its configured API root.');
      if (response.status === 401 || response.status === 403) throw new TaskError(502, 'task_credentials_rejected', 'The task service rejected its configured credentials or permissions.');
      if (response.status === 404) throw new TaskError(404, 'task_not_found', 'The task or configured source was not found or is inaccessible.');
      if (response.status === 429) throw rateLimited(source, retryDelay(response.headers));
      throw new TaskError(502, 'task_service_failed', 'The task service could not complete this request.');
    }
    noteAllowance(source, response.headers);
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

/** Changes a task with the source's server credential; an error names what the token needs. */
export async function write(source: TaskSourceConfig, method: 'PUT' | 'POST' | 'DELETE', path: string, payload?: unknown): Promise<void> {
  holdBack(source);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(`${source.baseUrl}${path}`), { method, headers: { ...headers(source), ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), redirect: 'manual', signal: controller.signal });
    await response.body?.cancel();
    if (response.ok) { noteAllowance(source, response.headers); return; }
    if (response.status >= 300 && response.status < 400) throw new TaskError(502, 'task_redirect_refused', 'The task service redirected the request. Update its configured API root.');
    if (response.status === 401 || response.status === 403) throw new TaskError(502, 'task_write_forbidden', `The workbench’s ${taskProvider(source.provider).label} token may not change this task. Give it permission to add and remove task assignees and to add task comments, then try again.`);
    if (response.status === 404) throw new TaskError(404, 'task_not_found', 'The task or configured source was not found or is inaccessible.');
    if (response.status === 400 || response.status === 409) throw new TaskError(409, 'task_write_conflict', 'The task service refused the change. Refresh the task and try again.');
    if (response.status === 429) throw rateLimited(source, retryDelay(response.headers));
    throw new TaskError(502, 'task_service_failed', 'The task service could not complete this request.');
  } catch (error) {
    if (error instanceof TaskError) throw error;
    if (controller.signal.aborted) throw new TaskError(504, 'task_timeout', 'The task service did not respond in time.');
    throw new TaskError(502, 'task_unreachable', 'The task service could not be reached. Check its configured URL and network access.');
  } finally { clearTimeout(timer); }
}

/** A Report a problem request: JSON or a multipart upload, with errors that say what the token needs. */
export async function fileRequest(source: TaskSourceConfig, method: 'POST' | 'PUT' | 'PATCH' | 'GET', path: string, body?: unknown): Promise<unknown> {
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

/** What an adapter's `list` asks a tracker for one page. */
export type PageRequest = { path: string; query: Record<string, string>; pageSize: number; tasks?: (value: unknown) => unknown; skip?: (value: unknown) => boolean; lastPage?: (value: unknown) => boolean | undefined };

/** Reads one page of open tasks and works out whether a next page exists from the body or the paging headers. */
export async function listPage(page: number, reading: TaskReading, ask: PageRequest): Promise<TaskPage> {
  const response = await reading.request(ask.path, ask.query);
  const rawTasks = ask.tasks ? ask.tasks(response.value) : response.value;
  if (!Array.isArray(rawTasks) || rawTasks.length > 100) throw new TaskError(502, 'task_response_invalid', 'The task service returned an unsupported task page.');
  const tasks = rawTasks.filter(value => !ask.skip?.(value)).map(value => reading.snapshot(value, true)).filter(task => task.status === 'open');
  let hasNext = rawTasks.length >= ask.pageSize;
  const last = ask.lastPage?.(response.value);
  if (last !== undefined) hasNext = !last;
  else if (response.headers.has('x-next-page')) hasNext = Number(response.headers.get('x-next-page')) === page + 1;
  else if (response.headers.has('x-pagination-total-pages')) hasNext = Number(response.headers.get('x-pagination-total-pages')) > page;
  else if (response.headers.has('link')) hasNext = /;\s*rel="?next"?(?:\s*,|\s*$)/i.test(response.headers.get('link') || '');
  return { tasks, ...(hasNext && page < maxPage ? { nextPage: page + 1 } : {}) };
}

/** Reads one task at `path` and checks the tracker answered with the task asked for. */
export async function readOne(id: string, truncate: boolean, reading: TaskReading, path: string, query: Record<string, string> = {}): Promise<{ task: TaskSnapshot; value: Record<string, unknown> }> {
  const response = await reading.request(path, query);
  const task = reading.snapshot(response.value, truncate);
  if (task.id !== id) throw new TaskError(502, 'task_response_invalid', 'The task service returned a different task than requested.');
  return { task, value: record(response.value) };
}

/** A tracker comment as plain text of at most 600 characters; `html` strips Vikunja-style markup, otherwise Markdown images and tags. */
export function plainComment(value: unknown, html: boolean): string {
  const text = String(value ?? '');
  const flat = html ? text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : text.replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]').replace(/<[^>]*>/g, '');
  const squeezed = flat.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return squeezed.length > maxCommentText ? `${squeezed.slice(0, maxCommentText - 1)}…` : squeezed;
}

/** An ISO timestamp, or undefined for a missing, invalid or zero date. */
export function when(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && !value.startsWith('0001-') ? new Date(value).toISOString() : undefined;
}
