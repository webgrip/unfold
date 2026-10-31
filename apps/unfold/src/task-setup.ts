import { createHash } from 'node:crypto';
import type { AppConfig } from './types.ts';
import type { Links } from './links.ts';
import { findLinkProvider } from './link-providers/index.ts';
import { findTaskProvider, taskProviders, type ScopeDescription, type ScopeEntry, type TaskProviderAdapter } from './task-providers/index.ts';
import type { TaskRequest } from './task-providers/registry.ts';
import { request, TaskError } from './task-providers/shared.ts';
import { apiRoot, handoffUnsupported, listTasks, presentTask, type TaskSnapshot, type TaskSourceConfig } from './tasks.ts';

/** A tracker a person can set a task source up for by name, with whether their account on it is linked. */
export type SetupProvider = { provider: string; label: string; linkProvider: string; linked: boolean; login?: string; levels: { kind: string; label: string }[] };
/** One finding of a connection check, worded for a person: `ok`, `warning` (works, but read this) or `problem` (does not work), with the fix under a problem. */
export type SetupCheck = { id: 'account' | 'project' | 'tasks' | 'handoff'; status: 'ok' | 'warning' | 'problem'; title: string; text: string; fix?: string; code?: string };
/** A task as the check previews it: what an import would read. */
export type PreviewTask = { id: string; reference: string; title: string; url: string; excerpt: string; assignees: string[]; labels: string[]; dueAt?: string; descriptionTruncated?: true };
/** The result of a connection check. `ok` is true when no check is a problem. */
export type SetupResult = { ok: boolean; checks: SetupCheck[]; project?: ScopeDescription & { id: string }; preview: { tasks: PreviewTask[]; more: boolean }; account?: string };
/** A checked project before it is registered: the check, the task sources already reading it, and a `taskSources` entry an administrator adds. */
export type SetupProject = SetupResult & { registered: { id: string; name: string }[]; entry?: Record<string, unknown> };

const cacheTtlMs = 60_000;
const cacheSize = 500;
const previewSize = 5;
const cache = new Map<string, { at: number; value: unknown; headers: Headers }>();

/** A request that answers a repeat of the same read within a minute from memory, so clicking back and forth through pickers spends little of the tracker's rate limit. */
function cached(source: TaskSourceConfig): TaskRequest {
  return async (path, query = {}) => {
    const key = createHash('sha256').update(JSON.stringify([source.baseUrl, source.token ?? '', path, query])).digest('hex');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < cacheTtlMs) return { value: hit.value, headers: hit.headers };
    const answer = await request(source, path, query);
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), ...answer });
    return answer;
  };
}

function setupAdapter(config: AppConfig, provider: string): { adapter: TaskProviderAdapter; link: string; root: string } {
  const adapter = findTaskProvider(provider);
  const link = adapter?.linkedAccount ? findLinkProvider(adapter.linkedAccount) : undefined;
  if (!adapter?.setup || !link?.trackerApiRoot || !link.listed(config) || adapter.fixture) throw new TaskError(404, 'setup_unsupported', 'This tracker cannot be set up by name here. An administrator adds it to the server configuration instead.');
  return { adapter, link: link.name, root: apiRoot(link.trackerApiRoot(config), adapter.name) };
}

/** The trackers a person can set a task source up for by name with their linked account. */
export function setupProviders(config: AppConfig, links: Links | undefined, userId: string): SetupProvider[] {
  return taskProviders().flatMap(adapter => {
    try {
      const { link } = setupAdapter(config, adapter.name);
      const linked = links?.describe(userId, link);
      return [{ provider: adapter.name, label: adapter.label, linkProvider: link, linked: Boolean(linked?.linked), ...(linked?.login ? { login: linked.login } : {}), levels: [...adapter.setup!.levels] }];
    } catch { return []; }
  });
}

async function linkedSource(config: AppConfig, links: Links | undefined, userId: string, provider: string, project = ''): Promise<{ source: TaskSourceConfig; adapter: TaskProviderAdapter }> {
  const { adapter, link, root } = setupAdapter(config, provider);
  const token = links ? await links.token(userId, link) : undefined;
  if (!token) throw new TaskError(409, 'setup_unlinked', `Link your ${adapter.label} account under Linked accounts first. Unfold looks through ${adapter.label} with it, so you see only what your account sees.`);
  return { adapter, source: { id: 'setup', name: adapter.label, provider: adapter.name, baseUrl: root, project, repositoryId: '', executionOwner: 'interactive', token: token.token, ...(token.type === 'bearer' ? { tokenType: 'bearer' as const } : {}) } };
}

/** The containers under `parent` in the person's own tracker account, by name. */
export async function setupScopes(config: AppConfig, links: Links | undefined, userId: string, provider: string, parent: { kind: string; id: string } | undefined): Promise<{ entries: ScopeEntry[] }> {
  const { adapter, source } = await linkedSource(config, links, userId, provider);
  if (parent && !adapter.setup!.levels.some(level => level.kind === parent.kind)) throw new TaskError(400, 'setup_scope_invalid', `Choose a ${adapter.setup!.levels.map(level => level.label).join(', ')} from the list.`);
  return { entries: await adapter.setup!.children(parent, cached(source)) };
}

function preview(source: TaskSourceConfig, task: TaskSnapshot): PreviewTask {
  const text = presentTask(source, task).descriptionMarkdown.replace(/\s+/g, ' ').trim();
  return {
    id: task.id, reference: task.identifier ?? `#${task.id}`, title: task.title, url: task.url,
    excerpt: text.length > 280 ? `${text.slice(0, 279)}…` : text,
    assignees: (task.assignees ?? []).map(person => person.name ?? person.username),
    labels: (task.labels ?? []).map(label => label.name),
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    ...(task.descriptionTruncated ? { descriptionTruncated: true as const } : {}),
  };
}

function failed(id: SetupCheck['id'], title: string, error: unknown, fix: string): SetupCheck {
  if (!(error instanceof TaskError)) throw error;
  return { id, status: 'problem', title, text: error.message, fix: error.code === 'task_rate_limited' ? 'Wait the time the message names, then check again.' : fix, code: error.code };
}

/** Checks a source end to end without changing anything: whose account it reads with, the project it names, and the first page of open tasks an import would read. */
async function check(source: TaskSourceConfig, adapter: TaskProviderAdapter, ploeg: AppConfig['ploeg'] | undefined, read: TaskRequest): Promise<SetupResult> {
  const label = adapter.label;
  const checks: SetupCheck[] = [];
  const result: SetupResult = { ok: false, checks, preview: { tasks: [], more: false } };
  if (adapter.setup) {
    try {
      const account = await adapter.setup.account(read);
      if (account) result.account = account;
      checks.push({ id: 'account', status: 'ok', title: `${label} account`, text: account ? `Unfold reads as ${account}.` : `${label} accepted the token.` });
    } catch (error) {
      checks.push(failed('account', `${label} account`, error, `Link your ${label} account again under Linked accounts, or ask an administrator to renew the connection's token.`));
      return result;
    }
    try {
      const project = await adapter.setup.describe(source.project, read);
      result.project = { id: source.project, ...project };
      const where = [...project.path, project.name].join(' › ');
      checks.push(project.archived
        ? { id: 'project', status: 'problem', title: `${label} ${adapter.setup.levels.at(-1)!.label}`, text: `${where} is archived, so it holds no open work.`, fix: `Unarchive it in ${label}, or choose another one.` }
        : { id: 'project', status: 'ok', title: `${label} ${adapter.setup.levels.at(-1)!.label}`, text: `${where}${project.statuses.length ? `, with the statuses ${project.statuses.map(status => status.name).join(', ')}` : ''}.` });
      if (project.archived) return result;
    } catch (error) {
      checks.push(failed('project', `${label} ${adapter.setup.levels.at(-1)!.label}`, error, `Check that your ${label} account can open it, or choose it again from the list.`));
      return result;
    }
  }
  try {
    const page = await listTasks(source, 1);
    result.preview = { tasks: page.tasks.slice(0, previewSize).map(task => preview(source, task)), more: page.tasks.length > previewSize || Boolean(page.nextPage) };
    const count = page.nextPage ? `${page.tasks.length} or more open tasks` : page.tasks.length === 1 ? 'One open task' : `${page.tasks.length || 'No'} open tasks`;
    checks.push(page.tasks.length
      ? { id: 'tasks', status: 'ok', title: 'Open tasks', text: `${count} on the first page. Unfold reads each task's title, description, status, labels, assignees, priority and due date; comments, attachments and custom fields stay in ${label}.` }
      : { id: 'tasks', status: 'warning', title: 'Open tasks', text: `Unfold can read here, but there are no open tasks yet. Closed and archived tasks never show.`, fix: `Add a task in ${label}, then check again.` });
  } catch (error) {
    checks.push(failed('tasks', 'Open tasks', error, `Check that the account may read tasks here.`));
    return result;
  }
  if (source.id !== 'setup' && adapter.handoff) {
    const blocked = handoffUnsupported(source, ploeg);
    checks.push(blocked ? { id: 'handoff', status: 'warning', title: 'Hand to Ploeg', text: blocked } : { id: 'handoff', status: 'ok', title: 'Hand to Ploeg', text: `Tasks here can be handed to a Ploeg Team. Ploeg must route this ${adapter.setup?.levels.at(-1)!.label ?? 'project'} too; Settings › Connections shows whether it does.` });
  }
  result.ok = !checks.some(entry => entry.status === 'problem');
  return result;
}

function slug(name: string, fallback: string, taken: Set<string>): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || fallback;
  return taken.has(base) ? `${base}-${fallback}`.slice(0, 63) : base;
}

/** Checks a project picked by name with the person's linked account, and drafts the `taskSources` entry an administrator adds for it. */
export async function setupProject(config: AppConfig, links: Links | undefined, userId: string, provider: string, project: string, visible: TaskSourceConfig[]): Promise<SetupProject> {
  const { adapter } = setupAdapter(config, provider);
  let normalized: string;
  try { normalized = adapter.project(project); } catch { throw new TaskError(400, 'setup_scope_invalid', `Choose a ${adapter.setup!.levels.at(-1)!.label} from the list.`); }
  const { source } = await linkedSource(config, links, userId, provider, normalized);
  const result = await check(source, adapter, config.ploeg, cached(source));
  const registered = visible.filter(entry => entry.provider === adapter.name && entry.project === normalized && entry.baseUrl === source.baseUrl).map(entry => ({ id: entry.id, name: entry.name }));
  const taken = new Set((config.taskSources ?? []).map(entry => entry.id));
  const entry = result.project ? { id: slug(result.project.name, `${adapter.name}-${normalized}`.slice(0, 63), taken), name: `${result.project.name} · ${adapter.label}`.slice(0, 100), provider: adapter.name, baseUrl: source.baseUrl, project: normalized, repositoryId: '', executionOwner: 'ploeg' } : undefined;
  return { ...result, registered, ...(entry ? { entry } : {}) };
}

/** Test connection for a registered source, with the token it reads with: its own, or the person's link. */
export async function testSource(source: TaskSourceConfig, ploeg: AppConfig['ploeg'] | undefined): Promise<SetupResult> {
  const adapter = findTaskProvider(source.provider);
  if (!adapter) throw new TaskError(404, 'source_not_found', 'There is no such task connection. Choose one from the Tasks page.');
  return check(source, adapter, ploeg, (path, query) => request(source, path, query));
}
