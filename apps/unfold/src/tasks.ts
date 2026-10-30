import { createHash } from 'node:crypto';
import type { AppConfig, Repository } from './types.ts';
import { descriptionMarkdown } from './rich-text.ts';
import { configuredOwnership, describeOwnership, ownership } from './tenancy.ts';
import { andList, findTaskProvider, handoffLabels, issueLabels, orList, taskProvider, taskProviders, type IssueFiling, type TaskHandoff } from './task-providers/index.ts';
import type { TaskReading } from './task-providers/registry.ts';
import { configText, detailReaders, entries, fileRequest, maxDescription, maxPage, maxResponseBytes, nativeTaskId, record, request, TaskError, write } from './task-providers/shared.ts';

export { TaskError } from './task-providers/shared.ts';
/** The name a task provider adapter registered under, in `src/task-providers/`. */
export type TaskProvider = string;
export type TaskTarget = { forge: string; owner: string; repo: string; baseBranch: string };
export type PloegTaskSource = { workItemId: string; provider: string; externalId: string; expectedBaseUrl: string; expectedScope: string; expectedRevision: string; expectedUpdatedAt: string; expectedTarget: TaskTarget };
/** A registered task source. `tenant` (the default Tenant when absent) and `client` name its owner (system ADR-0017). */
export type TaskSourceConfig = { id: string; name: string; provider: TaskProvider; baseUrl: string; project: string; repositoryId: string; token?: string; tokenType?: 'bearer'; executionOwner: 'interactive' | 'ploeg'; ploeg?: { target: TaskTarget }; tenant?: string; client?: string };
export type TaskSnapshot = { key: string; sourceId: string; provider: TaskProvider; id: string; revision: string; title: string; description: string; url: string; status: 'open' | 'closed' | 'unknown'; updatedAt?: string; repositoryId: string; nativeRevision?: string; scope?: string; ploeg?: PloegTaskSource; bindingConfig?: string; bindingRevision?: string; ploegUnavailable?: { code: string; message: string }; labels?: TaskLabel[]; assignees?: TaskAssignee[]; priority?: number; dueAt?: string; identifier?: string; descriptionTruncated?: true };
export type TaskLabel = { name: string; color?: string };
export type TaskAssignee = { username: string; name?: string };
export type TaskPage = { tasks: TaskSnapshot[]; nextPage?: number };
export type PresentedTask = TaskSnapshot & { descriptionMarkdown: string };

const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;
const projectPart = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,254}$/;
const sourceFields = new Set(['id', 'name', 'provider', 'baseUrl', 'project', 'repositoryId', 'tokenEnv', 'executionOwner', 'ploeg', 'tenant', 'client']);

/** Checks a tracker API root: HTTPS (HTTP on loopback only), no credentials, query or fragment, and the provider's API suffix. */
export function apiRoot(value: unknown, provider: TaskProvider): string {
  if (!configText(value, 2048) || /[%\\]/.test(value)) throw new Error('Task source baseUrl must be a complete API root URL');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Task source baseUrl must be a complete API root URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback)) || parsed.username || parsed.password || parsed.search || parsed.hash || /[%\\]/.test(parsed.pathname)) throw new Error('Task source baseUrl requires HTTPS, no credentials, query or fragment; HTTP is allowed only on loopback');
  const path = parsed.pathname.replace(/\/+$/, '');
  taskProvider(provider).apiRoot(parsed, path);
  return `${parsed.origin}${path}`;
}

function configuredProject(value: unknown, provider: TaskProvider): string {
  if (!configText(value, 512)) throw new Error('Task source project must be a native project or list identifier');
  return taskProvider(provider).project(value);
}

export function validateTaskSources(raw: unknown, repositories: Repository[], mode: 'demo' | 'live'): TaskSourceConfig[] {
  if (raw === undefined) raw = mode === 'demo' ? [{ id: 'demo-tasks', name: 'Demo fixture tasks', provider: 'demo', baseUrl: 'https://example.invalid', project: 'order-service', repositoryId: 'order-service', executionOwner: 'interactive' }] : [];
  if (!Array.isArray(raw) || raw.length > 50) throw new Error('taskSources must contain at most 50 sources');
  const ids = new Set<string>();
  const mappings = new Map<string, { index: number; id: string; mapping: string }>();
  return raw.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each task source must be an object');
    const source = value as Record<string, unknown>;
    if (Object.keys(source).some(key => !sourceFields.has(key))) throw new Error('Unknown task source field; credentials must use tokenEnv, never literal tokens');
    if (typeof source.id !== 'string' || !slug.test(source.id) || ids.has(source.id)) throw new Error('Task source IDs must be unique lowercase slugs');
    ids.add(source.id);
    if (!configText(source.name, 100)) throw new Error('Task source name must contain 1–100 characters');
    const adapter = typeof source.provider === 'string' ? findTaskProvider(source.provider) : undefined;
    if (!adapter) throw new Error('Unsupported task source provider');
    const provider = adapter.name;
    if (adapter.fixture && mode !== 'demo') throw new Error('Fixture task sources require explicit demo mode');
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
      if (source.executionOwner !== 'ploeg' || !adapter.handoff || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'target') || !target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).sort().join(',') !== 'baseBranch,forge,owner,repo') throw new Error(`Task source ploeg requires an explicit ${orList(handoffLabels())} Ploeg target`);
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
    const label = `taskSources[${index}] (${source.id})`;
    const owned = configuredOwnership(source, label);
    const owner = ownership(owned);
    const repository = repositories.find(item => item.id === source.repositoryId)!;
    const repositoryOwner = ownership(repository);
    if (owner.tenant !== repositoryOwner.tenant || (repositoryOwner.client !== undefined && owner.client !== repositoryOwner.client)) throw new Error(`${label} is owned by ${describeOwnership(owner)}, but its repository ${repository.id} is owned by ${describeOwnership(repositoryOwner)}. A task source maps to a repository of its own Tenant, and to a Client's repository only when it belongs to that Client.`);
    const identity = JSON.stringify([provider, baseUrl, project]);
    const mapping = JSON.stringify([source.repositoryId, source.executionOwner, ploeg, owner.tenant, owner.client ?? null]);
    const first = mappings.get(identity);
    if (first && first.mapping !== mapping) throw new Error(`Aliases of a task source must use the same repository, execution owner, Tenant and Client: taskSources[${first.index}] (${first.id}) and ${label} both read ${provider} ${project} at ${baseUrl}`);
    if (!first) mappings.set(identity, { index, id: source.id, mapping });
    return { id: source.id, name: source.name, provider, baseUrl, project, repositoryId: source.repositoryId, executionOwner: source.executionOwner, ...(token ? { token } : {}), ...(ploeg ? { ploeg } : {}), ...owned };
  });
}

const handoffOnly = (): string => `Only ${andList(handoffLabels())} tasks can be handed to Ploeg from the workbench.`;
/** The product name of a source's tracker, for messages. */
export function trackerName(source: TaskSourceConfig): string { return taskProvider(source.provider).label; }

/** Whether a source's tracker can hand tasks to Ploeg at all, whatever its configuration. */
export function canHandOff(provider: TaskProvider): boolean { return Boolean(findTaskProvider(provider)?.handoff); }

/** The tracker's webhook event that makes Ploeg queue a Work Item on assignment, when Ploeg routes this source's assignments. */
export function assignmentEvent(source: TaskSourceConfig): string | undefined { return findTaskProvider(source.provider)?.handoff?.assignmentEvent; }

/** Every tracker webhook event that makes Ploeg queue a Work Item on assignment, once each. */
export function assignmentEvents(): string[] { return [...new Set(taskProviders().map(adapter => adapter.handoff?.assignmentEvent).filter((event): event is string => Boolean(event)))]; }

/** Reports why a source cannot hand tasks to Ploeg, or undefined when it can. */
export function handoffUnsupported(source: TaskSourceConfig, ploeg: AppConfig['ploeg']): string | undefined {
  const adapter = taskProvider(source.provider);
  if (adapter.fixture) return 'Demo fixture tasks are not linked to Ploeg.';
  if (!adapter.handoff) return handoffOnly();
  if (source.executionOwner !== 'ploeg') return 'This connection is not assigned to Ploeg. An administrator sets its executionOwner to "ploeg" to enable hand-off.';
  if (!source.token) return 'This connection has no tracker token, so the workbench cannot assign its tasks.';
  if (ploeg?.demo) return 'Ploeg is showing illustrative demo records. Hand-off needs a live Ploeg operator connection.';
  if (!ploeg?.url || !ploeg.tokenEnv) return 'Connect the authenticated Ploeg operator API in the server configuration to hand tasks off.';
  return undefined;
}

/** Whether a source holds the deterministic demo's fixture tasks. */
export function isFixtureSource(source: TaskSourceConfig): boolean { return Boolean(findTaskProvider(source.provider)?.fixture); }

/** The link provider whose personal token a source without a token of its own reads with, or undefined. */
export function sourceLinkProvider(source: TaskSourceConfig): string | undefined { return source.token ? undefined : findTaskProvider(source.provider)?.linkedAccount; }

/** A source that reads with a person's linked token. */
export function withLinkedToken(source: TaskSourceConfig, linked: { token: string; type: 'bearer' | 'private' }): TaskSourceConfig {
  return { ...source, token: linked.token, ...(linked.type === 'bearer' ? { tokenType: 'bearer' as const } : {}) };
}

export function publicTaskSource(source: TaskSourceConfig, ploeg?: AppConfig['ploeg']) {
  return { id: source.id, name: source.name, provider: source.provider, repositoryId: source.repositoryId, executionOwner: source.executionOwner, ...(source.ploeg ? { ploeg: source.ploeg } : {}), handoff: !handoffUnsupported(source, ploeg) };
}

function taskId(source: TaskSourceConfig, value: unknown): string { return nativeTaskId(taskProvider(source.provider).taskId, value); }

function webRoot(source: TaskSourceConfig): string { return taskProvider(source.provider).webRoot(source); }

function taskUrl(source: TaskSourceConfig, id: string, value: Record<string, unknown>): string {
  return taskProvider(source.provider).taskUrl(source, id, value, webRoot(source));
}

/** The web link of task `id` in `source`, built without reading the task, or an empty string when that is not possible (a GitLab project named by number) or `id` is not a plain identifier. */
export function sourceTaskUrl(source: TaskSourceConfig, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(id)) return '';
  try { return taskUrl(source, id, {}); } catch { return ''; }
}

/** Adds `descriptionMarkdown` for display: an HTML description from a tracker that sends HTML becomes Markdown, any other description is copied unchanged. The snapshot's own fields, and so its revision and import, are untouched. */
export function presentTask(source: TaskSourceConfig, task: TaskSnapshot): PresentedTask {
  let markdown = descriptionMarkdown(task.provider, task.description, `${webRoot(source)}/`);
  if (source.token) markdown = markdown.replaceAll(source.token, '[redacted]');
  return { ...task, descriptionMarkdown: markdown };
}

function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function snapshot(source: TaskSourceConfig, raw: unknown, truncate = false): TaskSnapshot {
  const value = record(raw);
  const adapter = taskProvider(source.provider);
  const parsed = adapter.parse(source, value, truncate ? maxResponseBytes : maxDescription);
  const { id, status, updatedAt, nativeRevision, project } = parsed;
  let { title, description } = parsed;
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
  const details = Object.fromEntries(Object.entries(adapter.details(source, value, detailReaders(source))).filter(([, entry]) => entry !== undefined && !(Array.isArray(entry) && !entry.length)));
  const result = { key, sourceId: source.id, provider: source.provider, id, revision, title, description, url, status, ...(updatedAt ? { updatedAt } : {}), ...(nativeRevision ? { nativeRevision, scope: project } : {}), repositoryId: source.repositoryId, ...details, ...(truncated ? { descriptionTruncated: true as const } : {}) };
  if (source.token && Object.values(result).some(value => typeof value === 'string' && value.includes(source.token!))) throw new TaskError(502, 'task_sensitive_response', 'The task service returned credential material in a task identity, revision or link. This snapshot cannot be imported.');
  return result;
}

export function taskBindingConfiguration(source: TaskSourceConfig, repository: Repository): string {
  return digest({ provider: source.provider, baseUrl: source.baseUrl, project: source.project, repositoryId: source.repositoryId, executionOwner: source.executionOwner, ploeg: source.ploeg, repositoryUrl: repository.url, baseBranch: repository.baseBranch });
}

function reading(source: TaskSourceConfig): TaskReading {
  return { request: (path, query) => request(source, path, query), snapshot: (raw, truncate) => snapshot(source, raw, truncate) };
}

export async function listTasks(source: TaskSourceConfig, page = 1): Promise<TaskPage> {
  if (!Number.isSafeInteger(page) || page < 1 || page > maxPage) throw new TaskError(400, 'task_page_invalid', 'Task page must be an integer between 1 and 1000.');
  return taskProvider(source.provider).list(source, page, reading(source));
}

/** Reads one task; `truncate` shortens an oversized description for display and marks it, while import keeps refusing it. */
export async function getTask(source: TaskSourceConfig, nativeId: string, truncate = false): Promise<TaskSnapshot> { return (await readTask(source, nativeId, truncate)).task; }

function readTask(source: TaskSourceConfig, nativeId: string, truncate: boolean): Promise<{ task: TaskSnapshot; value: Record<string, unknown> }> {
  const id = taskId(source, nativeId);
  return taskProvider(source.provider).read(source, id, truncate, reading(source));
}

function handoff(source: TaskSourceConfig): TaskHandoff | undefined { return findTaskProvider(source.provider)?.handoff; }

function trackerUserId(entry: Record<string, unknown>): number | undefined {
  return typeof entry.id === 'number' && Number.isSafeInteger(entry.id) && entry.id > 0 ? entry.id : undefined;
}

/** The lowercase names a task's assignee answers to on its tracker. */
export function assigneeHandles(task: TaskSnapshot, person: TaskAssignee): string[] {
  return findTaskProvider(task.provider)?.handoff?.personHandles(person) ?? [person.username.toLowerCase()];
}

/** How a hand-off note on `source` is written: HTML or plain text. */
export function handoffNoteFormat(source: TaskSourceConfig): 'html' | 'text' { return handoff(source)?.commentFormat ?? 'html'; }

/** Reads a task for hand-off: an oversized description is truncated rather than refused, and assignee user IDs are keyed by every lowercase name the tracker's adapter says a user answers to. */
export async function getHandoffTask(source: TaskSourceConfig, nativeId: string): Promise<{ task: TaskSnapshot; assigneeIds: Map<string, number> }> {
  const capability = handoff(source);
  if (!capability) throw new TaskError(422, 'handoff_unsupported', handoffOnly());
  const { task, value } = await readTask(source, nativeId, true);
  const assigneeIds = new Map<string, number>();
  for (const entry of entries(value.assignees)) {
    const id = trackerUserId(entry);
    if (id) for (const name of capability.handles(entry)) assigneeIds.set(name, id);
  }
  return { task, assigneeIds };
}

/** Returns the project or home List that holds a task, or undefined when the source cannot read it. */
export async function taskProject(source: TaskSourceConfig, nativeId: string): Promise<string | undefined> {
  const capability = handoff(source);
  if (!capability) return undefined;
  const id = taskId(source, nativeId);
  try { return await capability.project(source, id, (path, query) => request(source, path, query)); }
  catch (error) { if (error instanceof TaskError) return undefined; throw error; }
}

/** Finds the hand-off source of `provider`, checking `id` against its native id format, or throws when the provider cannot hand off. */
export function lookupProvider(provider: string | null, id: string | null): asserts id is string {
  const adapter = provider ? findTaskProvider(provider) : undefined;
  if (!adapter?.handoff) throw new TaskError(400, 'lookup_unsupported', `Only ${andList(handoffLabels())} tasks can be looked up.`);
  if (!id || !adapter.taskId.test(id)) throw new TaskError(400, 'task_id_invalid', 'Use the native task ID.');
}

/** Resolves a tracker username to its user ID; matching ignores case. The adapter says where to look, in order, and which names a user answers to. */
export async function findTrackerUser(source: TaskSourceConfig, username: string): Promise<number | undefined> {
  const capability = handoff(source);
  if (!capability) return undefined;
  const wanted = username.toLowerCase();
  for (const [path, query, users] of capability.userLookups(source, username)) {
    let found: Record<string, unknown>[];
    try { found = users((await request(source, path, query)).value); } catch (error) { if (error instanceof TaskError && error.code !== 'task_unreachable' && error.code !== 'task_timeout') continue; throw error; }
    const id = found.filter(user => capability.handles(user).includes(wanted)).map(trackerUserId).find(Boolean);
    if (id) return id;
  }
  return undefined;
}

/** Adds or removes one assignee on a task, using the source's server credential. */
export async function setTrackerAssignee(source: TaskSourceConfig, nativeId: string, userId: number, assigned: boolean): Promise<void> {
  const id = taskId(source, nativeId);
  const capability = handoff(source);
  if (!capability || !Number.isSafeInteger(userId) || userId < 1) throw new TaskError(422, 'handoff_unsupported', handoffOnly());
  await capability.setAssignee(source, id, userId, assigned, (method, path, payload) => write(source, method, path, payload));
}

/** Leaves a comment on a task, using the source's server credential, in the format `handoffNoteFormat` names. */
export async function commentOnTask(source: TaskSourceConfig, nativeId: string, body: string): Promise<void> {
  const id = taskId(source, nativeId);
  const capability = handoff(source);
  if (!capability) throw new TaskError(422, 'handoff_unsupported', handoffOnly());
  await capability.comment(source, id, body, (method, path, payload) => write(source, method, path, payload));
}

/** A file Report a problem attaches to the issue it files. */
export type IssueFile = { name: string; type: string; bytes: Uint8Array<ArrayBuffer> };
/** The issue or task Report a problem filed: its native id, the number used in later calls, and its web address. */
export type FiledIssue = { id: string; number: string; url: string };

function filing(source: TaskSourceConfig): IssueFiling {
  const issues = findTaskProvider(source.provider)?.issues;
  if (!issues) throw new TaskError(422, 'report_provider_unsupported', `Report a problem files into ${andList(issueLabels())} only.`);
  return issues;
}

function reportProject(source: TaskSourceConfig, project: string): string {
  filing(source);
  return configuredProject(project, source.provider);
}

const call = (source: TaskSourceConfig) => (method: 'POST' | 'PUT' | 'PATCH' | 'GET', path: string, body?: unknown) => fileRequest(source, method, path, body);

/** Whether a provider files Report a problem issues. */
export function filesIssues(provider: TaskProvider): boolean { return Boolean(findTaskProvider(provider)?.issues); }

/** The labels of the providers that file Report a problem issues, as `A or B`. */
export function issueProviderLabels(): string { return orList(issueLabels()); }

/** The names of the providers that file Report a problem issues, as `a or b`. */
export function issueProviderNames(): string { return orList(taskProviders().filter(adapter => adapter.issues).map(adapter => adapter.name)); }

/** The body format of `source`'s tracker for Report a problem: Markdown or HTML. */
export function issueBodyFormat(source: TaskSourceConfig): 'markdown' | 'html' { return filing(source).bodyFormat; }

/** How the report dialog names a target. */
export function describeIssueTarget(source: TaskSourceConfig, project: string): string { return filing(source).describe(project); }

/** Whether a filed issue's body can be replaced after its files are attached. */
export function canUpdateIssueBody(source: TaskSourceConfig): boolean { return Boolean(filing(source).updateBody); }

/** Creates the issue or task for one report in `project`, in the format `issueBodyFormat` names. */
export async function createIssue(source: TaskSourceConfig, project: string, title: string, body: string): Promise<FiledIssue> {
  const target = reportProject(source, project);
  return filing(source).create(source, target, title, body, call(source));
}

/** Attaches one file to a filed issue or task and returns its download address when the tracker gives one. */
export async function attachToIssue(source: TaskSourceConfig, project: string, issue: FiledIssue, file: IssueFile): Promise<string | undefined> {
  const target = reportProject(source, project);
  return filing(source).attach(source, target, issue, file, call(source));
}

/** Replaces a filed issue's body, so it can show the screenshot uploaded after it was created; nothing on a tracker that cannot. */
export async function updateIssueBody(source: TaskSourceConfig, project: string, issue: FiledIssue, body: string): Promise<void> {
  const target = reportProject(source, project);
  await filing(source).updateBody?.(source, target, issue, body, call(source));
}

/** Checks a report target's project against its provider's rules, so a bad setting fails at start-up. */
export function reportTargetProject(source: TaskSourceConfig, project: string): string {
  try { return reportProject(source, project); } catch (error) { throw new Error(error instanceof TaskError ? error.message : `reports.project ${(error as Error).message.replace(/^Task source project/, 'must be')}`); }
}

/** One comment on a filed issue or task as plain text. `mine` marks the comments the workbench's token wrote. */
export type IssueComment = { id: string; author: string; text: string; at: string; mine: boolean };
/** The pull request that names a filed issue, newest first. */
export type IssueFix = { number: string; url: string; merged: boolean; mergedAt?: string };
/** The first release of the running version's line made after a fix was merged, and whether the running version has it. */
export type IssueRelease = { tag: string; url: string; at: string; live: boolean };
/** What the tracker says about a filed issue or task now. */
export type IssueState = { open: boolean; closedAt?: string; labels: string[]; assigned: boolean; comments: IssueComment[]; fix?: IssueFix; release?: IssueRelease };

const trackerLogins = new Map<string, Promise<string>>();

function trackerLogin(source: TaskSourceConfig): Promise<string> {
  const key = `${source.baseUrl}\u0000${source.token ?? ''}`;
  let login = trackerLogins.get(key);
  if (!login) {
    login = fileRequest(source, 'GET', filing(source).loginPath ?? '/user').then(value => String(record(value)[filing(source).loginField] ?? ''));
    login.catch(() => trackerLogins.delete(key));
    trackerLogins.set(key, login);
  }
  return login;
}

/** Reads what the tracker says about a filed issue or task now: open or closed, labels, whether someone is assigned, the latest comments as plain text, and, where the tracker's adapter follows them, the fix and the release that shipped it. */
export async function readIssueState(source: TaskSourceConfig, project: string, issue: FiledIssue, version: string): Promise<IssueState> {
  const target = reportProject(source, project);
  const login = await trackerLogin(source).catch(() => '');
  return filing(source).state(source, target, issue, version, login, call(source));
}

/** Adds a comment to a filed issue or task, in the format `issueBodyFormat` names. */
export async function commentOnIssue(source: TaskSourceConfig, project: string, issue: FiledIssue, body: string): Promise<void> {
  const target = reportProject(source, project);
  await filing(source).comment(source, target, issue, body, call(source));
}
