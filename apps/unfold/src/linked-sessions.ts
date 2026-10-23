import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig, User } from './types.ts';
import { parseAgentTrace, traceLines, traceLinesByAgent, type AgentTraceRecord } from './agent-trace.ts';
import { readSessionTelemetry, type SessionTelemetry } from './linked-telemetry.ts';

/** The harnesses whose sessions a person can link. */
export const linkedHarnesses = ['claude-code', 'opencode', 'codex', 'acp'] as const;
/** What a harness hook reports: the session started, took a prompt, waits for its person, stopped working, ended, or committed. */
export const linkedEvents = ['start', 'prompt', 'waiting', 'idle', 'end', 'commit'] as const;
/** A working or waiting session not heard from for this long shows as stale. */
export const linkedStaleMs = 30 * 60_000;
/** The most Work Items, commits and pull requests one Linked Session keeps. */
export const linkedLimits = { workItems: 20, commits: 200, pullRequests: 20, traces: 500, listed: 50 } as const;
/** How many sessions' telemetry one Work Item read asks the stores for at once. */
export const linkedTelemetryConcurrency = 4;
/** Tracker reference prefixes in branch names, such as `feat/vik-2051-login`, and the tracker each names. */
export const trackerPrefixes: Readonly<Record<string, string>> = { vik: 'vikunja' };

export type LinkedHarness = typeof linkedHarnesses[number];
const harnessLabels: Record<LinkedHarness, string> = { 'claude-code': 'Claude Code', opencode: 'OpenCode', codex: 'Codex', acp: 'ACP agent' };
/** The command that resumes a harness session on its owner's machine, such as `claude --resume <id>`; empty for `acp`, which only its editor resumes. */
export function resumeCommand(harness: LinkedHarness, id: string): string {
  if (harness === 'acp') return '';
  return harness === 'opencode' ? `opencode --session ${id}` : harness === 'codex' ? `codex resume ${id}` : `claude --resume ${id}`;
}
export type LinkedEvent = typeof linkedEvents[number];
export type LinkedStatus = 'working' | 'waiting' | 'idle' | 'ended';
/**
 * How a Linked Session came to be linked to a Work Item: a person or agent said so, its branch or one of its commit
 * messages names the Work Item's tracker task, a prompt named the task or the Work Item, or a pull request the session
 * opened is the Work Item's.
 */
export type LinkedHow = 'explicit' | 'branch' | 'commit' | 'mention' | 'pull_request';
/** A credential that expires within this long is mentioned when a session starts. */
export const credentialWarningMs = 7 * 24 * 3600_000;
export type LinkedWorkItem = { id: string; how: LinkedHow; linkedAt: string; linkedBy: string };
export type LinkedCommit = { sha: string; subject: string; at: string; trailer: boolean; aiLines: number | null; files: number | null; agents?: Record<string, number> };
/**
 * A Linked Session: an agent session a person runs outside Unfold, such as Claude Code on their own machine, that
 * reports to Unfold through its hooks and is linked to Work Items. Unfold never starts, steers or pays for it.
 */
export type LinkedSession = {
  id: string; harness: LinkedHarness; harnessVersion: string; ownerId: string; ownerName: string;
  title: string; repository: string; branch: string; model: string; remoteUrl: string;
  status: LinkedStatus; waitingFor: string; startedAt: string; lastSeenAt: string; endedAt: string | null;
  workItems: LinkedWorkItem[]; dismissed: string[]; resolvedBranch: string;
  pullRequests: string[]; commits: LinkedCommit[];
};
/** One hook report, validated. */
export type LinkedEventInput = {
  harness: LinkedHarness; harnessVersion: string; sessionId: string; event: LinkedEvent; at: string;
  title: string; repository: string; branch: string; model: string; remoteUrl: string; waitingFor: string;
  workItem: string; pullRequests: string[]; commit: { sha: string; subject: string; trailer: boolean } | null;
  mentions: LinkedMentions;
};
/** The tracker tasks (`VIK-2051`) and Work Items a prompt or commit message named, extracted on the person's machine. */
export type LinkedMentions = { refs: { provider: string; externalId: string; ref: string }[]; workItems: string[] };
/** An open Work Item as Unfold's Now read returns it, enough to match a pull request or a repository. */
export type LinkedNowItem = { id: string; title: string; state: string; updatedAt: string; target: { owner: string; repo: string } | null; pullRequestUrl?: string; pullRequest?: { url: string } | null };
/** An open Work Item on the session's repository that the session may be working on. */
export type LinkedSuggestion = { id: string; title: string; state: string; updatedAt: string; reason: 'pull_request' | 'repository' };
/** The reads of Ploeg a Linked Session needs: a Work Item the person may read, and the Work Items of one tracker task. */
export type LinkedPloeg = {
  detail(user: User, id: string): Promise<{ item: { id: string; title: string; provider: string; externalId: string } }>;
  trackerItems(user: User, provider: string, externalId: string): Promise<{ items: { id: string; state: string }[] }>;
  now?(user: User): Promise<{ waiting: LinkedNowItem[]; active: LinkedNowItem[] }>;
};

/** A refused Linked Session request, with the HTTP status and code the API answers. */
export class LinkedSessionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

const fail = (status: number, code: string, message: string): never => { throw new LinkedSessionError(status, code, message); };
const sessionPattern = /^[A-Za-z0-9_-]{8,128}$/;
const workItemPattern = /^[1-9][0-9]{0,18}$/;

function clipped(value: unknown, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(400, 'invalid_input', 'Every text field must be a string.');
  return (value as string).replace(/[\0-\x1f\x7f]/g, ' ').trim().slice(0, max);
}

/** A repository address without credentials, query or fragment: `https://host/owner/repo.git` or `git@host:owner/repo.git`. */
export function repositoryAddress(value: unknown): string {
  const raw = clipped(value, 300);
  if (!raw) return '';
  const scp = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):([A-Za-z0-9._/-]+)$/.exec(raw);
  if (scp) return `${scp[1]}:${scp[2]}`;
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(parsed.protocol)) return '';
    return `${parsed.protocol === 'ssh:' || parsed.protocol === 'git:' ? '' : `${parsed.protocol}//`}${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
  } catch { return ''; }
}

/** The tracker tasks a branch name refers to, such as `vik-2051` in `feat/vik-2051-login` or `agent/vik-2051`. */
export function branchReferences(branch: string): { provider: string; externalId: string; ref: string }[] {
  const found = new Map<string, { provider: string; externalId: string; ref: string }>();
  for (const match of branch.toLowerCase().matchAll(/(?:^|[^a-z0-9])([a-z]{2,10})-([1-9][0-9]{0,18})(?=$|[^0-9])/g)) {
    const provider = trackerPrefixes[match[1]];
    if (provider && found.size < 5) found.set(`${provider}:${match[2]}`, { provider, externalId: match[2], ref: `${match[1].toUpperCase()}-${match[2]}` });
  }
  return [...found.values()];
}

/** Tracker references such as `VIK-2051` a hook extracted, kept when their prefix names a known tracker. */
export function trackerReferences(values: unknown): LinkedMentions['refs'] {
  const found = new Map<string, LinkedMentions['refs'][number]>();
  for (const value of Array.isArray(values) ? values.slice(0, 20) : []) {
    const match = typeof value === 'string' ? /^([A-Za-z]{2,10})-([1-9][0-9]{0,18})$/.exec(value.trim()) : null;
    const provider = match ? trackerPrefixes[match[1].toLowerCase()] : undefined;
    if (match && provider && found.size < 10) found.set(`${provider}:${match[2]}`, { provider, externalId: match[2], ref: `${match[1].toUpperCase()}-${match[2]}` });
  }
  return [...found.values()];
}

function parseMentions(value: unknown): LinkedMentions {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const workItems = Array.isArray(raw.workItems) ? [...new Set(raw.workItems.slice(0, 20).filter((entry): entry is string => typeof entry === 'string' && workItemPattern.test(entry)))].slice(0, 10) : [];
  return { refs: trackerReferences(raw.refs), workItems };
}

/** A pull request address compared without case, trailing slash or the `pull`/`pulls` difference between forges. */
export function pullRequestKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '').replace(/\/pulls\/(\d+)$/, '/pull/$1').toLowerCase()}`;
  } catch { return ''; }
}

/** The `owner/repo` a repository address names, compared without case or `.git`, or empty. */
export function repositoryPath(address: string): string {
  const path = /^[^/:]+:(.+)$/.exec(address)?.[1] ?? (() => { try { return new URL(address).pathname; } catch { return ''; } })();
  const parts = path.replace(/\.git$/i, '').split('/').filter(Boolean);
  return parts.length >= 2 ? `${parts.at(-2)}/${parts.at(-1)}`.toLowerCase() : '';
}

const plainBranches = new Set(['main', 'master', 'development', 'develop', 'trunk', 'head']);
const branchKinds = /^(?:feat|feature|fix|bugfix|hotfix|docs|chore|ci|refactor|test|tests|perf|build|style|agent|wip|spike)\//i;

/**
 * The name a Linked Session shows: its own title, else the subject of the first commit it made (one carrying the
 * `Unfold-Session` trailer), else its branch in words, else its harness and repository.
 */
export function displayTitle(session: Pick<LinkedSession, 'title' | 'branch' | 'repository' | 'harness' | 'commits'>): string {
  if (session.title) return session.title;
  const own = session.commits.find(entry => entry.trailer && entry.subject && !/^Merge /.test(entry.subject));
  if (own) return own.subject.slice(0, 120);
  if (session.branch && !plainBranches.has(session.branch.toLowerCase())) {
    const words = session.branch.replace(branchKinds, '').split('/').at(-1)!.replace(/[-_]+/g, ' ').replace(/\b([a-z]{2,10}) ([1-9][0-9]{0,18})\b/gi, (whole, prefix: string, id: string) => trackerPrefixes[prefix.toLowerCase()] ? `${prefix.toUpperCase()}-${id}` : whole).trim();
    if (words) return `${words[0].toUpperCase()}${words.slice(1)}`.slice(0, 120);
  }
  const repo = repositoryPath(session.repository).split('/')[1];
  return `${session.harness === 'claude-code' ? 'Claude Code' : session.harness} session${repo ? ` in ${repo}` : ''}`;
}

/** Validates one hook report. Unknown fields are ignored; nothing a hook sends is trusted beyond these shapes. */
export function parseLinkedEvent(data: Record<string, unknown>, now: Date): LinkedEventInput {
  if (!linkedHarnesses.includes(data.harness as LinkedHarness)) fail(400, 'linked_harness', `harness must be one of ${linkedHarnesses.join(', ')}.`);
  if (typeof data.sessionId !== 'string' || !sessionPattern.test(data.sessionId)) fail(400, 'linked_session_id', 'sessionId must be the harness session id: 8 to 128 letters, digits, - or _.');
  if (!linkedEvents.includes(data.event as LinkedEvent)) fail(400, 'linked_event', `event must be one of ${linkedEvents.join(', ')}.`);
  const remoteUrl = clipped(data.remoteUrl, 200);
  const workItem = clipped(data.workItem, 40);
  const pullRequests = Array.isArray(data.pullRequests) ? data.pullRequests.slice(0, linkedLimits.pullRequests).map(entry => clipped(entry, 500)).filter(entry => /^https:\/\/[^\s/@]+\/[^\s]+$/.test(entry)) : [];
  let commit: LinkedEventInput['commit'] = null;
  if (data.event === 'commit') {
    const raw = data.commit && typeof data.commit === 'object' && !Array.isArray(data.commit) ? data.commit as Record<string, unknown> : {};
    if (typeof raw.sha !== 'string' || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(raw.sha)) fail(400, 'linked_commit', 'A commit report needs commit.sha, the full commit id.');
    commit = { sha: raw.sha as string, subject: clipped(raw.subject, 200), trailer: raw.trailer === true };
  }
  return {
    harness: data.harness as LinkedHarness, harnessVersion: clipped(data.harnessVersion, 40).replace(/[^\w.+-]/g, ''), sessionId: data.sessionId as string, event: data.event as LinkedEvent, at: now.toISOString(),
    title: clipped(data.title, 160), repository: repositoryAddress(data.repository), branch: clipped(data.branch, 200), model: clipped(data.model, 100).replace(/[^\w.:/[\]-]/g, ''),
    remoteUrl: /^https:\/\/claude\.ai\/code\/[A-Za-z0-9_-]{8,128}$/.test(remoteUrl) ? remoteUrl : '', waitingFor: clipped(data.waitingFor, 40).replace(/[^a-z_]/g, ''),
    workItem: workItemPattern.test(workItem) ? workItem : '', pullRequests, commit, mentions: parseMentions(data.mentions),
  };
}

/** The state a Linked Session shows: its status, or `stale` when it claims to work or wait but has not reported for {@link linkedStaleMs}. */
export function linkedState(session: Pick<LinkedSession, 'status' | 'lastSeenAt'>, now = Date.now()): LinkedStatus | 'stale' {
  return (session.status === 'working' || session.status === 'waiting') && now - Date.parse(session.lastSeenAt) > linkedStaleMs ? 'stale' : session.status;
}

const nextStatus: Record<LinkedEvent, LinkedStatus | null> = { start: 'idle', prompt: 'working', waiting: 'waiting', idle: 'idle', end: 'ended', commit: null };

/** Linked Sessions in the workbench database, with the Work Items each is linked to and the Agent Trace records its commits carry. */
export class LinkedSessionStore {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS linked_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, last_seen_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS linked_sessions_owner ON linked_sessions(owner_id, last_seen_at);
      CREATE TABLE IF NOT EXISTS linked_session_work_items (session_id TEXT NOT NULL REFERENCES linked_sessions(id), work_item_id TEXT NOT NULL, PRIMARY KEY (session_id, work_item_id));
      CREATE INDEX IF NOT EXISTS linked_session_work_items_item ON linked_session_work_items(work_item_id);
      CREATE TABLE IF NOT EXISTS agent_traces (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES linked_sessions(id), revision TEXT NOT NULL, recorded_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS agent_traces_session ON agent_traces(session_id, recorded_at);
      CREATE INDEX IF NOT EXISTS agent_traces_revision ON agent_traces(revision);
    `);
  }
  get(id: string): LinkedSession | undefined {
    const row = this.db.prepare('SELECT body FROM linked_sessions WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  save(session: LinkedSession): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO linked_sessions(id,owner_id,last_seen_at,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,body=excluded.body').run(session.id, session.ownerId, session.lastSeenAt, JSON.stringify(session));
      this.db.prepare('DELETE FROM linked_session_work_items WHERE session_id=?').run(session.id);
      for (const item of session.workItems) this.db.prepare('INSERT INTO linked_session_work_items(session_id,work_item_id) VALUES(?,?)').run(session.id, item.id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  owned(ownerId: string | null, limit: number): LinkedSession[] {
    const rows = ownerId === null ? this.db.prepare('SELECT body FROM linked_sessions ORDER BY last_seen_at DESC LIMIT ?').all(limit) : this.db.prepare('SELECT body FROM linked_sessions WHERE owner_id=? ORDER BY last_seen_at DESC LIMIT ?').all(ownerId, limit);
    return (rows as { body: string }[]).map(row => JSON.parse(row.body));
  }
  forWorkItem(workItemId: string, limit: number): LinkedSession[] {
    return (this.db.prepare('SELECT s.body FROM linked_sessions s JOIN linked_session_work_items w ON w.session_id=s.id WHERE w.work_item_id=? ORDER BY s.last_seen_at DESC LIMIT ?').all(workItemId, limit) as { body: string }[]).map(row => JSON.parse(row.body));
  }
  addTrace(sessionId: string, record: AgentTraceRecord, at: string): boolean {
    const revision = record.vcs?.revision ?? '';
    const result = this.db.prepare('INSERT INTO agent_traces(id,session_id,revision,recorded_at,body) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(record.id, sessionId, revision, at, JSON.stringify(record));
    return Number(result.changes) > 0;
  }
  traceOwner(id: string): string | undefined {
    return (this.db.prepare('SELECT session_id FROM agent_traces WHERE id=?').get(id) as { session_id: string } | undefined)?.session_id;
  }
  traceCount(sessionId: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM agent_traces WHERE session_id=?').get(sessionId) as { n: number }).n);
  }
  traces(filter: { sessionId?: string; revision?: string }, limit: number): { sessionId: string; record: AgentTraceRecord }[] {
    const rows = filter.sessionId ? this.db.prepare('SELECT session_id, body FROM agent_traces WHERE session_id=? ORDER BY recorded_at, id LIMIT ?').all(filter.sessionId, limit) : this.db.prepare('SELECT session_id, body FROM agent_traces WHERE revision=? ORDER BY recorded_at, id LIMIT ?').all(filter.revision ?? '', limit);
    return (rows as { session_id: string; body: string }[]).map(row => ({ sessionId: row.session_id, record: JSON.parse(row.body) }));
  }
}

/** A Linked Session as the API presents it: its stored facts, its shown state, its Unfold page and how to resume it. */
export type PresentedLinkedSession = Omit<LinkedSession, 'dismissed' | 'resolvedBranch'> & { state: LinkedStatus | 'stale'; displayTitle: string; link: string; resume: string; mine: boolean; aiLines: number; telemetry?: SessionTelemetry };

/**
 * Records what people's own agent sessions report, links them to Work Items the person may read, and keeps the
 * Agent Trace records of their commits. Every read and change is scoped to the session's owner, an administrator, or,
 * for reading only, a person who may read a Work Item the session is linked to.
 */
export class LinkedSessions {
  readonly store: LinkedSessionStore;
  private config: AppConfig;
  private ploeg: LinkedPloeg;
  private fetcher: typeof fetch;
  private clock: () => Date;
  constructor(db: DatabaseSync, config: AppConfig, ploeg: LinkedPloeg, options: { fetch?: typeof fetch; now?: () => Date } = {}) {
    this.store = new LinkedSessionStore(db);
    this.config = config;
    this.ploeg = ploeg;
    this.fetcher = options.fetch ?? fetch;
    this.clock = options.now ?? (() => new Date());
  }

  /** The Unfold page of one Linked Session under `base`, the workbench address. */
  static page(base: string, id: string): string { return `${base.replace(/\/+$/, '')}/#linked-session/${encodeURIComponent(id)}`; }

  /**
   * Records one hook report from the session's owner and links the session to the Work Items its report names. The
   * first report claims the session id for its sender; a report for someone else's session is refused as not found.
   */
  async report(user: User, input: LinkedEventInput, base: string, options: { credentialExpiresAt?: string } = {}): Promise<{ session: PresentedLinkedSession; context: string; suggestedTitle: string; trackerPrefixes: string[]; credential: { expiresAt: string; expiresSoon: boolean } | null }> {
    const existing = this.store.get(input.sessionId);
    if (existing && existing.ownerId !== user.id) fail(404, 'not_found', 'Linked session not found.');
    if (existing && existing.harness !== input.harness) fail(409, 'linked_harness', 'This session id was reported by another harness.');
    const session: LinkedSession = existing ?? { id: input.sessionId, harness: input.harness, harnessVersion: '', ownerId: user.id, ownerName: user.name, title: '', repository: '', branch: '', model: '', remoteUrl: '', status: 'idle', waitingFor: '', startedAt: input.at, lastSeenAt: input.at, endedAt: null, workItems: [], dismissed: [], resolvedBranch: '', pullRequests: [], commits: [] };
    session.ownerName = user.name;
    session.lastSeenAt = input.at;
    for (const key of ['harnessVersion', 'title', 'repository', 'branch', 'model', 'remoteUrl'] as const) if (input[key]) session[key] = input[key];
    const status = nextStatus[input.event];
    if (status) { session.status = status; session.waitingFor = status === 'waiting' ? input.waitingFor : ''; session.endedAt = status === 'ended' ? input.at : null; }
    else if (session.status === 'ended') { session.status = 'idle'; session.endedAt = null; }
    const freshPulls = input.pullRequests.filter(url => !session.pullRequests.includes(url));
    for (const url of freshPulls) if (session.pullRequests.length < linkedLimits.pullRequests) session.pullRequests.push(url);
    if (input.commit) {
      const known = session.commits.find(entry => entry.sha === input.commit!.sha);
      if (known) Object.assign(known, { subject: input.commit.subject || known.subject, trailer: known.trailer || input.commit.trailer });
      else session.commits = [...session.commits, { sha: input.commit.sha, subject: input.commit.subject, at: input.at, trailer: input.commit.trailer, aiLines: null, files: null }].slice(-linkedLimits.commits);
    }
    if (input.workItem && !session.workItems.some(entry => entry.id === input.workItem) && await this.ploeg.detail(user, input.workItem).then(() => true, () => false)) {
      this.attach(session, input.workItem, 'explicit', user, input.at);
    }
    if (session.branch && session.branch !== session.resolvedBranch) {
      for (const ref of branchReferences(session.branch)) {
        const found = await this.ploeg.trackerItems(user, ref.provider, ref.externalId).catch(() => ({ items: [] }));
        for (const item of found.items.slice(0, 3)) this.attachAutomatic(session, item.id, 'branch', user, input.at);
      }
      session.resolvedBranch = session.branch;
    }
    const mentioned: LinkedHow = input.event === 'commit' ? 'commit' : 'mention';
    for (const ref of input.mentions.refs) {
      const found = await this.ploeg.trackerItems(user, ref.provider, ref.externalId).catch(() => ({ items: [] }));
      for (const item of found.items.slice(0, 3)) this.attachAutomatic(session, item.id, mentioned, user, input.at);
    }
    for (const id of input.mentions.workItems) {
      if (!this.canAttach(session, id)) continue;
      if (await this.ploeg.detail(user, id).then(() => true, () => false)) this.attachAutomatic(session, id, mentioned, user, input.at);
    }
    if (freshPulls.length && this.ploeg.now) {
      const keys = new Set(freshPulls.map(pullRequestKey).filter(Boolean));
      const open = await this.openWork(user);
      for (const item of open) if ([item.pullRequest?.url, item.pullRequestUrl].some(url => url && keys.has(pullRequestKey(url)))) this.attachAutomatic(session, item.id, 'pull_request', user, input.at);
    }
    this.store.save(session);
    const presented = this.present(session, user, base);
    const expiresAt = options.credentialExpiresAt && Number.isFinite(Date.parse(options.credentialExpiresAt)) ? new Date(options.credentialExpiresAt).toISOString() : '';
    const credential = expiresAt ? { expiresAt, expiresSoon: Date.parse(expiresAt) - this.clock().getTime() <= credentialWarningMs } : null;
    return {
      session: presented, context: await this.context(user, presented, credential), suggestedTitle: !session.title && session.workItems.length ? await this.suggestTitle(user, session) : '',
      trackerPrefixes: Object.keys(trackerPrefixes).map(prefix => prefix.toUpperCase()), credential,
    };
  }

  private canAttach(session: LinkedSession, id: string): boolean {
    return !session.dismissed.includes(id) && !session.workItems.some(entry => entry.id === id) && session.workItems.length < linkedLimits.workItems;
  }

  private attachAutomatic(session: LinkedSession, id: string, how: LinkedHow, user: User, at: string): void {
    if (this.canAttach(session, id)) this.attach(session, id, how, user, at);
  }

  private async openWork(user: User): Promise<LinkedNowItem[]> {
    if (!this.ploeg.now) return [];
    try { const now = await this.ploeg.now(user); return [...now.waiting, ...now.active]; } catch { return []; }
  }

  /**
   * Open Work Items the session may be working on and is not linked to: the Work Item whose pull request the session
   * opened, then the newest open Work Items on the session's repository. Only the session's owner or an administrator asks.
   */
  async suggestions(user: User, id: string): Promise<LinkedSuggestion[]> {
    const session = this.store.get(id);
    if (!session || (session.ownerId !== user.id && user.role !== 'admin')) return fail(404, 'not_found', 'Linked session not found.');
    const repo = repositoryPath(session.repository);
    const pulls = new Set(session.pullRequests.map(pullRequestKey).filter(Boolean));
    const out = new Map<string, LinkedSuggestion>();
    const open = (await this.openWork(user)).filter(item => !session.workItems.some(entry => entry.id === item.id) && !session.dismissed.includes(item.id));
    for (const item of open) if ([item.pullRequest?.url, item.pullRequestUrl].some(url => url && pulls.has(pullRequestKey(url)))) out.set(item.id, { id: item.id, title: item.title, state: item.state, updatedAt: item.updatedAt, reason: 'pull_request' });
    const sameRepo = repo ? open.filter(item => item.target && `${item.target.owner}/${item.target.repo}`.toLowerCase() === repo).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
    for (const item of sameRepo) if (!out.has(item.id)) out.set(item.id, { id: item.id, title: item.title, state: item.state, updatedAt: item.updatedAt, reason: 'repository' });
    return [...out.values()].slice(0, 5);
  }

  private attach(session: LinkedSession, id: string, how: LinkedHow, user: User, at: string): void {
    if (session.workItems.length >= linkedLimits.workItems) fail(409, 'linked_work_items_full', `A Linked Session is linked to at most ${linkedLimits.workItems} Work Items.`);
    session.workItems.push({ id, how, linkedAt: at, linkedBy: user.name });
    session.dismissed = session.dismissed.filter(entry => entry !== id);
  }

  private async suggestTitle(user: User, session: LinkedSession): Promise<string> {
    try {
      const { item } = await this.ploeg.detail(user, session.workItems[0].id);
      const ref = item.provider === 'vikunja' && /^\d+$/.test(item.externalId) ? `VIK-${item.externalId}` : `#${item.id}`;
      return `${ref} ${item.title}`.replace(/[\0-\x1f]/g, ' ').slice(0, 80).trim();
    } catch { return ''; }
  }

  private async context(user: User, session: PresentedLinkedSession, credential: { expiresAt: string; expiresSoon: boolean } | null): Promise<string> {
    const items = await Promise.all(session.workItems.slice(0, 5).map(async entry => {
      try { const { item } = await this.ploeg.detail(user, entry.id); return `Work Item ${item.id} (${item.title.replace(/[\0-\x1f]/g, ' ').slice(0, 120)})`; }
      catch { return `Work Item ${entry.id}`; }
    }));
    const linked = items.length ? `It is linked to ${items.join(', ')}.` : 'It is not linked to a Work Item yet.';
    return [
      `Unfold records this ${harnessLabels[session.harness] ?? 'agent'} session as ${session.link} (session id ${session.id}). ${linked}`,
      `When you commit, end the message with the trailer line "Unfold-Session: ${session.link}".`,
      `To link this session to a Work Item, call the unfold_link_session tool with session_id ${session.id} and the Work Item id.`,
      ...(credential?.expiresSoon ? [`The Unfold credential this session reports with expires ${credential.expiresAt.slice(0, 10)}. Tell the person once, early, to sign in again and replace UNFOLD_TOKEN, or their sessions stop reporting to Unfold.`] : []),
    ].join(' ');
  }

  /** One Linked Session as `user` may see it; telemetry is read only for its owner or an administrator. */
  async view(user: User, id: string, base: string, withTelemetry = false): Promise<PresentedLinkedSession> {
    const session = await this.readable(user, id);
    const presented = this.present(session, user, base);
    if (withTelemetry && session.harness === 'claude-code' && (session.ownerId === user.id || user.role === 'admin')) presented.telemetry = await readSessionTelemetry(this.config.observability, session.id, session.startedAt, { fetch: this.fetcher, now: this.clock().getTime() });
    return presented;
  }

  /** The person's own Linked Sessions, newest report first; an administrator asking for `all` sees everyone's. */
  mine(user: User, base: string, all = false): PresentedLinkedSession[] {
    return this.store.owned(all && user.role === 'admin' ? null : user.id, linkedLimits.listed).map(session => this.present(session, user, base));
  }

  /**
   * The Linked Sessions of one Work Item, after Ploeg confirms the person may read it. With `withTelemetry`, each
   * session whose telemetry the person may see (their own, or every one for an administrator) carries it, read at most
   * {@link linkedTelemetryConcurrency} at a time.
   */
  async forWorkItem(user: User, workItemId: string, base: string, withTelemetry = false): Promise<PresentedLinkedSession[]> {
    if (!workItemPattern.test(workItemId)) fail(400, 'work_item_id', 'Use a Work Item id.');
    await this.ploeg.detail(user, workItemId);
    const sessions = this.store.forWorkItem(workItemId, linkedLimits.listed).map(session => ({ session, shown: this.present(session, user, base) }));
    if (withTelemetry) {
      const visible = sessions.filter(entry => entry.session.ownerId === user.id || user.role === 'admin');
      for (let start = 0; start < visible.length; start += linkedTelemetryConcurrency) {
        await Promise.all(visible.slice(start, start + linkedTelemetryConcurrency).map(async entry => { entry.shown.telemetry = await readSessionTelemetry(this.config.observability, entry.session.id, entry.session.startedAt, { fetch: this.fetcher, now: this.clock().getTime() }); }));
      }
    }
    return sessions.map(entry => entry.shown);
  }

  /** Links or unlinks one Work Item. Only the owner or an administrator may, and only to a Work Item they may read; an unlinked Work Item is not linked again by the branch. */
  async setLink(user: User, id: string, workItemId: string, linked: boolean, base: string): Promise<PresentedLinkedSession> {
    if (!workItemPattern.test(workItemId)) fail(400, 'work_item_id', 'Use a Work Item id.');
    const session = this.store.get(id);
    if (!session || (session.ownerId !== user.id && user.role !== 'admin')) fail(404, 'not_found', 'Linked session not found.');
    const at = this.clock().toISOString();
    if (linked) {
      await this.ploeg.detail(user, workItemId);
      if (!session!.workItems.some(entry => entry.id === workItemId)) this.attach(session!, workItemId, 'explicit', user, at);
    } else {
      session!.workItems = session!.workItems.filter(entry => entry.id !== workItemId);
      if (!session!.dismissed.includes(workItemId)) session!.dismissed = [...session!.dismissed, workItemId].slice(-50);
    }
    this.store.save(session!);
    return this.present(session!, user, base);
  }

  /** Stores one Agent Trace record the session's owner sends for a commit, and counts its AI-written lines on that commit. */
  addTrace(user: User, id: string, value: unknown): { stored: boolean; aiLines: number; files: number } {
    const session = this.store.get(id);
    if (!session || session.ownerId !== user.id) fail(404, 'not_found', 'Linked session not found.');
    const record = parseAgentTrace(value);
    if (record.vcs?.type !== 'git' || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(record.vcs.revision)) fail(400, 'agent_trace_revision', 'A Linked Session\'s Agent Trace names its git commit in vcs.revision.');
    const owner = this.store.traceOwner(record.id);
    if (owner && owner !== id) fail(409, 'agent_trace_conflict', 'Another session already recorded an Agent Trace with this id.');
    if (!owner && this.store.traceCount(id) >= linkedLimits.traces) fail(409, 'agent_trace_full', `A Linked Session keeps at most ${linkedLimits.traces} Agent Trace records.`);
    const lines = traceLines(record);
    const stored = this.store.addTrace(id, record, this.clock().toISOString());
    const agents = traceLinesByAgent(record);
    const commit = session!.commits.find(entry => entry.sha === record.vcs!.revision);
    if (commit) Object.assign(commit, { aiLines: lines.ai, files: lines.files, agents });
    else session!.commits = [...session!.commits, { sha: record.vcs!.revision, subject: '', at: record.timestamp, trailer: false, aiLines: lines.ai, files: lines.files, agents }].slice(-linkedLimits.commits);
    this.store.save(session!);
    return { stored, aiLines: lines.ai, files: lines.files };
  }

  /** The Agent Trace records of one Linked Session `user` may read, in the order they were recorded. */
  async traces(user: User, id: string): Promise<AgentTraceRecord[]> {
    await this.readable(user, id);
    return this.store.traces({ sessionId: id }, linkedLimits.traces).map(entry => entry.record);
  }

  /** The Agent Trace records for one commit, from the Linked Sessions `user` may read. */
  async tracesFor(user: User, revision: string): Promise<{ sessionId: string; record: AgentTraceRecord }[]> {
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision)) fail(400, 'agent_trace_revision', 'Use a full commit id.');
    const found = this.store.traces({ revision }, 50);
    const allowed = new Map<string, boolean>();
    const out: { sessionId: string; record: AgentTraceRecord }[] = [];
    for (const entry of found) {
      if (!allowed.has(entry.sessionId)) allowed.set(entry.sessionId, await this.readable(user, entry.sessionId).then(() => true, () => false));
      if (allowed.get(entry.sessionId)) out.push(entry);
    }
    return out;
  }

  private async readable(user: User, id: string): Promise<LinkedSession> {
    const session = this.store.get(id);
    if (!session) return fail(404, 'not_found', 'Linked session not found.');
    if (session.ownerId === user.id || user.role === 'admin') return session;
    for (const entry of session.workItems.slice(0, linkedLimits.workItems)) {
      try { await this.ploeg.detail(user, entry.id); return session; } catch { continue; }
    }
    return fail(404, 'not_found', 'Linked session not found.');
  }

  private present(session: LinkedSession, user: User, base: string): PresentedLinkedSession {
    const { dismissed: _dismissed, resolvedBranch: _resolved, ...shown } = session;
    return { ...structuredClone(shown), state: linkedState(session, this.clock().getTime()), displayTitle: displayTitle(session), link: LinkedSessions.page(base, session.id), resume: resumeCommand(session.harness, session.id), mine: session.ownerId === user.id, aiLines: session.commits.reduce((sum, entry) => sum + (entry.aiLines ?? 0), 0) };
  }
}
