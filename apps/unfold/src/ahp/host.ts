import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AgentHostView, Store } from '../store.ts';
import type { Engine } from '../engine.ts';
import { placements } from '../config.ts';
import { patchLineCounts, readCandidate, readCandidateBlob, type CandidateFile } from '../candidates.ts';
import type { AppConfig, Event, PermissionRequest, Repository, Session, User, WorkspaceBackend } from '../types.ts';
import type { Recovery } from '../engine.ts';
import { TrackerAutomations, automationsChannel, autonomousAutomationsMeta } from './automations.ts';
import { WebSocketConnection, connectionToken, isWebSocketUpgrade, rejectUpgrade, upgradeToWebSocket } from './websocket.ts';
import { IdleSessions, RememberedClients, ServerSequence, restoreActiveClients, saveActiveClients } from './continuity.ts';
import { outcomeMarkdown, sessionProgress, stopReason } from '../../public/core/progress.js';
import { money } from '../../public/core/format.js';

/** The AHP compatibility baseline this host implements. It accepts any offered version in `>=0.9.0 <0.10.0`. */
export const protocolVersion = '0.9.0';
/** What the host names in `data.supportedVersions` when no offered version is in its range. */
export const supportedVersions = ['^0.9.0'];
export const provider = 'unfold';
const rootChannel = 'ahp-root://';
const applicationVersion = (() => { try { return String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version); } catch { return 'unknown'; } })();
const pollMs = 300;
const maxTurnsInSnapshot = 200;
const maxKnownClients = 1000;

/** The directory the host names as `defaultDirectory`: a virtual folder whose subfolders are the configured repositories, so the Agents window's workspace picker offers them. */
export const repositoriesDirectory = 'file:///unfold-repositories';

const repositorySlug = (repository: Repository): string => {
  try {
    const url = new URL(repository.url);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return repository.id;
    return url.pathname.replace(/\/+$/, '').split('/').at(-1)?.replace(/\.git$/i, '') || repository.id;
  } catch { return repository.id; }
};

/**
 * What VS Code shows for a repository, as the session's project and as a folder in the workspace picker: `Unfold · <repository>`,
 * named after the forge path's last segment and followed by the id when two repositories share it. VS Code appends the host
 * entry's name in brackets.
 */
export function repositoryWorkspaceNames(repositories: readonly Repository[]): Map<string, string> {
  const slugs = repositories.map(repository => [repository.id, repositorySlug(repository).replace(/[\\/]/g, '-')] as const);
  const counts = new Map<string, number>();
  for (const [, slug] of slugs) counts.set(slug.toLowerCase(), (counts.get(slug.toLowerCase()) ?? 0) + 1);
  return new Map(slugs.map(([id, slug]) => [id, `Unfold · ${slug}${(counts.get(slug.toLowerCase()) ?? 0) > 1 ? ` (${id})` : ''}`]));
}

/** The `initialize` and `InitializeResult` `_meta` key by which VS Code declares it addresses sessions as `ahp-session:/<id>`. */
export const sessionUrisMeta = 'vscode.ahpSessionUris';

/** How a client spells session channels: by the provider for a VS Code window that does not declare {@link sessionUrisMeta}, as 1.141 does, and as `ahp-session` for every other client. */
export type SessionScheme = typeof provider | 'ahp-session';

const vscodeWindows = new Set(['vscode-editor-window', 'vscode-agents-window']);

function describedClient(clientInfo: unknown): { name?: string; version?: string } {
  const info = (clientInfo && typeof clientInfo === 'object' ? clientInfo : {}) as Record<string, unknown>;
  const field = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : undefined;
  const name = field(info.name); const version = field(info.version);
  return { ...(name ? { name } : {}), ...(version ? { version } : {}) };
}

/** VS Code's own host rule: only a client whose `clientInfo` names a VS Code window and that does not declare {@link sessionUrisMeta} gets the provider spelling. */
export function sessionSchemeFor(clientInfo: unknown, meta: unknown): SessionScheme {
  const name = (clientInfo as { name?: unknown } | undefined)?.name;
  return typeof name === 'string' && vscodeWindows.has(name) && (meta as Record<string, unknown> | undefined)?.[sessionUrisMeta] !== true ? provider : 'ahp-session';
}

type Json = Record<string, any>;
type Client = { id: string; clientId?: string; scheme: SessionScheme; connection: WebSocketConnection; user: User; token: string; checkedAt: number; connectedAt: string; clientInfo?: { name?: string; version?: string }; subscriptions: Set<string>; initialized: boolean; activeSessions?: number };
/** One initialized connection as its owner sees it in `GET /api/agent-host`. */
export type AttachedClient = { name?: string; version?: string; connectedAt: string; tokenId: string };
type View = Pick<Client, 'user' | 'scheme'>;
type Origin = { clientId: string; clientSeq: number };
type ChannelKind = 'session' | 'chat' | 'changeset';
type TokenRecord = { userId: string; name: string; role: User['role']; label: string; createdAt: string; expiresAt?: string; signIn?: string };
type Projection = { finalStop?: number; turns: Json[]; activeTurn?: Json; parts: Map<string, string>; toolCalls: Map<string, { turnId: string; toolCallId: string }>; openTools: Map<string, string>; cursor: number; turnCounter: number; permissionTurn?: string; origins: Map<string, Origin>; answers: Map<string, Json>; choices: Map<string, Json>; holding?: string; startedRuns: Set<string>; finishedRuns: Set<string>; workingRun?: string; queuedInstructions: number };
type PendingSession = { id: string; uri: string; config: Json; user: User; createdAt: string; starting?: boolean };
type CandidateView = { files: CandidateFile[]; counts: Map<string, { added: number; removed: number }> };

/** A session's channel in a client's spelling. VS Code 1.141 names it by the provider; VS Code 1.142 by `ahp-session`. */
export const sessionChannel = (id: string, scheme: SessionScheme = provider) => `${scheme}:/${id}`;
/** A session's default chat, in the shape VS Code derives from the session URI in the same spelling. */
export const chatChannel = (id: string, scheme: SessionScheme = provider) => `ahp-chat://default/${Buffer.from(sessionChannel(id, scheme)).toString('base64url')}`;
export const changesetChannel = (id: string) => `ahp-changeset:/${id}`;

/** Parses a session, chat or changeset channel in its current or earlier spelling into its kind and public session id. */
export function parseChannel(uri: string): { kind: ChannelKind; id: string } | undefined {
  const plain = /^(unfold|ahp-session|ahp-chat|ahp-changeset):\/([A-Za-z0-9_-]{1,80})$/.exec(uri);
  if (plain) return { kind: plain[1] === 'ahp-chat' ? 'chat' : plain[1] === 'ahp-changeset' ? 'changeset' : 'session', id: plain[2] };
  const chat = /^ahp-chat:\/\/default\/([A-Za-z0-9_-]{1,400})$/.exec(uri);
  if (!chat) return undefined;
  const owner = parseChannel(Buffer.from(chat[1], 'base64url').toString('utf8'));
  return owner?.kind === 'session' ? { kind: 'chat', id: owner.id } : undefined;
}
const sessionIdFrom = (uri: string) => parseChannel(uri)?.id;
const clientTurnId = /^[A-Za-z0-9_.:-]{1,128}$/;
const actionOrigins = new WeakMap<Json, Origin>();
const channelKey = (uri: string) => { const parsed = parseChannel(uri); return parsed ? `${parsed.kind}:${parsed.id}` : uri; };

const codes = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, sessionNotFound: -32001, providerNotFound: -32002, sessionExists: -32003, turnInProgress: -32004, unsupportedVersion: -32005, authRequired: -32007, notFound: -32008, permissionDenied: -32009, conflict: -32011 };

class RpcError extends Error { code: number; data?: unknown; constructor(code: number, message: string, data?: unknown) { super(message); this.code = code; this.data = data; } }

const engineCodes: Record<number, number> = { 400: codes.invalidParams, 403: codes.permissionDenied, 404: codes.sessionNotFound, 409: codes.conflict };
function asRpcError(error: unknown): RpcError {
  if (error instanceof RpcError) return error;
  const status = Number((error as { status?: unknown })?.status);
  return new RpcError(engineCodes[status] ?? codes.internal, error instanceof Error && Number.isFinite(status) ? error.message : 'Internal error');
}
const acceptOperation = 'accept';

/** The events by which the host records a choice it offered in a chat, the person's answer and what came of it. */
export const choiceEvents = { offered: 'choice.offered', answered: 'choice.answered', reported: 'choice.reported' } as const;
/** The options a host choice can offer. Each maps to one call of the recovery API, under the same owner checks. */
export type ChoiceOptionId = 'run_again_start' | 'run_again' | 'deliver' | 'resume' | 'dismiss';
type ChoiceOption = { id: ChoiceOptionId; label: string };
const dismissReply = 'Nothing changed. This session stays as it is.';
const clockUtc = (at: string) => { const moment = new Date(at); return Number.isFinite(moment.getTime()) ? `${moment.toISOString().slice(11, 16)} UTC` : 'an unknown time'; };

/** A host choice as an AHP input request: one single-select question whose options VS Code 1.141 shows by label only, so each option's meaning is in the question's message. */
export function choiceRequest(offered: Json): Json {
  const options = (Array.isArray(offered.options) ? offered.options : []) as ChoiceOption[];
  return { id: String(offered.choiceId), message: String(offered.title), questions: [{ id: '0', title: String(offered.question ?? offered.title), message: String(offered.detail ?? ''), kind: 'single-select', required: true, options: options.map(option => ({ id: option.id, label: option.label })), allowFreeformInput: false }] };
}
const declineReason = 'Unfold cannot decline a question: the crew waits for its answer. Answer it, or stop the turn to pause the session.';

type Choice = { label: string; description?: string };
function choicesOf(question: Json): Choice[] {
  return (Array.isArray(question?.options) ? question.options : []).map((option: unknown) => typeof option === 'string' ? { label: option } : { label: String((option as Json)?.label ?? ''), ...((option as Json)?.description ? { description: String((option as Json).description) } : {}) }).filter((choice: Choice) => choice.label);
}
function inputQuestion(question: Json, index: number, fallback: string): Json {
  const text = String(question?.question ?? question?.header ?? fallback);
  const header = typeof question?.header === 'string' && question.header.trim() && question.header.trim() !== text ? question.header.trim() : undefined;
  const message = typeof question?.description === 'string' && question.description.trim() ? `${text}\n\n${question.description.trim()}` : text;
  const choices = choicesOf(question);
  const base = { id: String(index), ...(header ? { title: header } : {}), message };
  if (!choices.length) return { ...base, kind: 'text' };
  return { ...base, kind: question.multiple === true ? 'multi-select' : 'single-select', options: choices.map((choice, option) => ({ id: String(option), ...choice })), allowFreeformInput: question.custom !== false };
}
function answerValues(question: Json | undefined, answer: Json | undefined): string[] {
  if (!answer || answer.state === 'skipped') return [];
  const value = answer.value ?? {};
  const choices = choicesOf(question ?? {});
  const label = (id: unknown) => { const choice = typeof id === 'string' && /^\d{1,4}$/.test(id) ? choices[Number(id)] : undefined; if (!choice) throw new Error(`The answer names an option the question does not offer: ${JSON.stringify(id)}`); return choice.label; };
  const freeform = Array.isArray(value.freeformValues) ? value.freeformValues.map(String) : [];
  if (value.kind === 'selected') return [label(value.value), ...freeform];
  if (value.kind === 'selected-many') return [...(Array.isArray(value.value) ? value.value : []).map(label), ...freeform];
  return value.value === undefined ? [] : [String(value.value)];
}

/** A protocol version that is not three non-negative integers without leading zeros, prerelease or build metadata. */
export class MalformedVersion extends Error {}

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const numericOrder = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/**
 * Selects the highest offered version in `>=0.9.0 <0.10.0` and returns that exact offered string, regardless of offer
 * order, or undefined when none is in range. Throws {@link MalformedVersion} when any entry is malformed.
 */
export function negotiateProtocolVersion(offered: readonly unknown[]): string | undefined {
  let selected: { version: string; patch: string } | undefined;
  for (const version of offered) {
    const parts = typeof version === 'string' ? semver.exec(version) : null;
    if (!parts) throw new MalformedVersion(`Invalid protocol version: ${JSON.stringify(version)}`);
    const [, major, minor, patch] = parts;
    if (major === '0' && minor === '9' && (!selected || numericOrder(patch, selected.patch) > 0)) selected = { version: parts[0], patch };
  }
  return selected?.version;
}

const statusBits = { idle: 1, error: 2, inProgress: 8, inputNeeded: 24, isRead: 32, isArchived: 64 };
type ViewFlag = { channel: 'session' | 'chat'; field: 'isRead' | 'isArchived'; bit: number };
const viewFlags: Record<string, ViewFlag> = {
  'session/isReadChanged': { channel: 'session', field: 'isRead', bit: statusBits.isRead },
  'session/isArchivedChanged': { channel: 'session', field: 'isArchived', bit: statusBits.isArchived },
  'chat/isReadChanged': { channel: 'chat', field: 'isRead', bit: statusBits.isRead },
  'chat/isArchivedChanged': { channel: 'chat', field: 'isArchived', bit: statusBits.isArchived },
};
function sessionStatus(session: Session): number {
  if (session.status === 'waiting_input') return statusBits.inputNeeded;
  if (['running', 'exporting'].includes(session.status)) return statusBits.inProgress;
  if (session.status === 'failed') return statusBits.error;
  return statusBits.idle;
}
/** What a session is doing, or why it stopped or failed, as VS Code shows it under the session's title. A finished session shows none, as VS Code's own host does. */
export function activity(session: Session): string | undefined {
  const active = ['running', 'waiting_input', 'exporting'].includes(session.status);
  const run = active ? session.runs.find(item => ['running', 'waiting_input'].includes(item.status)) : undefined;
  if (run) return `${run.roleName}${session.status === 'waiting_input' ? ' is waiting for your decision' : ' is working'}`;
  if (session.status === 'exporting') return 'Capturing the candidate';
  if (session.status === 'failed') { const reason = (session.failure?.message ?? session.blocker)?.trim(); return reason ? `Failed: ${reason}` : undefined; }
  if (session.status === 'interrupted' || session.status === 'paused') return sessionProgress(session).short;
  return undefined;
}

/** Whether no crew will read a message sent into this session: it ended, or Ploeg holds its stopped execution. */
export function closedToMessages(session: Session): boolean {
  if (['completed', 'cancelled', 'failed'].includes(session.status)) return true;
  return session.status === 'interrupted' && Boolean(stopReason(session, [])?.retained);
}

const verdictWords: Record<string, string> = { approve: 'approved', request_changes: 'requested changes', inconclusive: 'gave no clear verdict' };
const finalStopTypes = new Set(['session.completed', 'session.failed', 'session.cancelled', 'session.paused', 'session.interrupted', 'execution.authority_lost', 'execution.reconciliation_required', 'execution.reconciliation_pending']);
const lowerFirst = (value: string) => value ? value[0].toLowerCase() + value.slice(1) : value;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
/** The identifier of a connection token: the SHA-256 digest the workbench stores instead of the token. */
export const agentHostTokenId = digest;
const fingerprintActivity = (fingerprint: string): string | undefined => JSON.parse(fingerprint)[1] ?? undefined;

/**
 * The files a runtime's diff artifact describes. A native file diff carries each file's `before` and `after` text; a
 * unified diff yields only the path and its line counts, because a patch does not hold the files themselves.
 */
export function diffEntries(content: string): Json[] {
  try { const parsed = JSON.parse(content); if (Array.isArray(parsed)) return parsed.filter(entry => entry && typeof entry.file === 'string'); } catch {}
  return [...patchLineCounts(content)].map(([file, counts]) => ({ file, additions: counts.added, deletions: counts.removed }));
}

const workspaceFile = (path: string) => `file:///workspace/repository/${path.split('/').map(encodeURIComponent).join('/')}`;
const candidateContent = /^unfold-candidate:\/([A-Za-z0-9_-]{1,80})\/(\d{1,6})\/(before|after)$/;
const artifactContent = /^unfold-diff:\/([A-Za-z0-9_-]{1,80})\/(\d{1,6})\/(\d{1,6})\/(before|after)$/;
const utf8 = new TextDecoder('utf-8', { fatal: true });
function text(data: Buffer): string | undefined { if (data.includes(0)) return undefined; try { return utf8.decode(data); } catch { return undefined; } }

export class AgentHost {
  readonly config: AppConfig;
  readonly store: Store;
  readonly engine: Engine;
  readonly clients = new Set<Client>();
  private readonly sequence: ServerSequence;
  /** The last sequence number the host gave an action. It never moves backwards, also not across a restart. */
  get serverSeq(): number { return this.sequence.current; }
  set serverSeq(next: number) { this.sequence.advanceTo(next); }
  private readonly projections = new Map<string, Projection>();
  private readonly pending = new Map<string, PendingSession>();
  private readonly summaries = new Map<string, string>();
  private readonly activeClients: Map<string, Map<string, Json>>;
  private readonly knownClients: RememberedClients<SessionScheme>;
  private readonly idleSessions = new IdleSessions();
  private readonly sweeper: ReturnType<typeof setInterval>;
  private readonly departing = new Map<string, ReturnType<typeof setTimeout>>();
  /** How long an active client whose last connection closed keeps its place, waiting for its reconnect: 30 seconds, as in VS Code's own host. */
  activeClientGraceMs = 30_000;
  private readonly candidates = new Map<string, CandidateView>();
  private readonly answering = new Set<string>();
  private readonly offering = new Set<string>();
  private readonly offeredAfter = new Map<string, number>();
  private readonly loadingCandidates = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  private closed = false;

  /** Ploeg's tracker routes as a read-only automation catalogue. */
  readonly automations: TrackerAutomations;

  constructor(config: AppConfig, store: Store, engine: Engine) {
    this.config = config; this.store = store; this.engine = engine;
    this.sequence = new ServerSequence(store);
    this.knownClients = new RememberedClients(store, maxKnownClients);
    this.activeClients = restoreActiveClients(store);
    for (const clientId of new Set([...this.activeClients.values()].flatMap(clients => [...clients.keys()]))) this.awaitReturn(clientId);
    this.sweeper = setInterval(() => this.evictIdleSessions(), Math.min(60_000, this.idleSessions.idleMs));
    this.sweeper.unref();
    this.automations = new TrackerAutomations(config, {
      watchers: () => [...new Map([...this.clients].filter(client => client.initialized && client.subscriptions.has(automationsChannel)).map(client => [client.user.id, client.user])).values()],
      publish: (userId, action) => this.broadcast(automationsChannel, action, undefined, client => client.user.id === userId),
      workspaceFolder: repositoryId => { const name = repositoryWorkspaceNames(this.config.repositories).get(repositoryId); return name ? `${repositoriesDirectory}/${encodeURIComponent(name)}` : undefined; },
    });
  }

  /** Evicts the projection and summary of every ended session nobody has subscribed to for the idle period; a later subscribe rebuilds them from the durable events. Returns the evicted session ids. */
  evictIdleSessions(now = Date.now()): string[] {
    const due = this.idleSessions.sweep(this.cachedSessions(), id => this.evictable(id), now);
    for (const id of due) this.evict(id);
    return due;
  }

  /** The sessions whose projection or summary the host holds in memory. */
  cachedSessions(): string[] { return [...new Set([...this.projections.keys(), ...this.summaries.keys()])]; }

  private evictable(id: string): boolean {
    const session = this.store.getSession(id);
    if ((session && !['completed', 'cancelled', 'failed'].includes(session.status)) || this.offering.has(id)) return false;
    const publicId = this.publicId(id);
    return ![...this.clients].some(client => [...client.subscriptions].some(channel => sessionIdFrom(channel) === publicId));
  }

  private evict(id: string): void {
    this.projections.delete(id);
    this.summaries.delete(id);
    for (const key of [...this.candidates.keys()]) if (key.startsWith(`${id}:`)) this.candidates.delete(key);
    this.idleSessions.forget(id);
  }

  private persistActiveClients(): void { saveActiveClients(this.store, this.activeClients); }

  /** Connection tokens expire after `auth.sessionHours` without use, and end with the sign-in that issued them. */
  issueToken(user: User, label = 'agent host', signIn?: string): string {
    const token = connectionToken();
    const key = digest(token);
    const bound = signIn && this.store.liveSignIn(signIn) ? signIn : undefined;
    this.store.transaction(() => {
      this.store.setSecret(`ahp-token:${key}`, { userId: user.id, name: user.name, role: user.role, label, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + this.lifetimeMs()).toISOString(), ...(bound ? { signIn: bound } : {}) } satisfies TokenRecord);
      if (bound) this.store.setSecret(`ahp-sign-in:${bound}`, [...(this.store.getSecret<string[]>(`ahp-sign-in:${bound}`) ?? []), key]);
    });
    return token;
  }

  /** Revokes every connection token issued by one sign-in and closes its connections. */
  revokeSignIn(signIn: string): void {
    for (const key of this.store.getSecret<string[]>(`ahp-sign-in:${signIn}`) ?? []) this.revoke(key);
    this.store.deleteSecret(`ahp-sign-in:${signIn}`);
  }

  /** Revokes one connection token its owner names by identifier and closes its connections. Returns false when the token is unknown or another person's. */
  revokeToken(user: User, id: string): boolean {
    if (!/^[0-9a-f]{64}$/.test(id)) return false;
    const record = this.store.getSecret<TokenRecord>(`ahp-token:${id}`);
    if (!record || record.userId !== user.id) return false;
    this.revoke(id);
    return true;
  }

  private revoke(key: string): void {
    const record = this.store.getSecret<TokenRecord>(`ahp-token:${key}`);
    this.store.deleteSecret(`ahp-token:${key}`);
    if (record?.signIn) {
      const remaining = (this.store.getSecret<string[]>(`ahp-sign-in:${record.signIn}`) ?? []).filter(item => item !== key);
      if (remaining.length) this.store.setSecret(`ahp-sign-in:${record.signIn}`, remaining); else this.store.deleteSecret(`ahp-sign-in:${record.signIn}`);
    }
    for (const client of this.clients) if (client.token === key) { this.clients.delete(client); client.connection.close(1008, 'Connection token revoked'); }
  }

  private lifetimeMs(): number { return this.config.auth.sessionHours * 3_600_000; }

  private valid(key: string, renew: boolean): TokenRecord | undefined {
    const record = this.store.getSecret<TokenRecord>(`ahp-token:${key}`);
    if (!record) return undefined;
    const now = Date.now();
    if (!record.expiresAt || !(Date.parse(record.expiresAt) > now) || (record.signIn && !this.store.liveSignIn(record.signIn))) { this.revoke(key); return undefined; }
    const expiresAt = now + this.lifetimeMs();
    if (renew && expiresAt - Date.parse(record.expiresAt) >= 60_000) this.store.setSecret(`ahp-token:${key}`, { ...record, expiresAt: new Date(expiresAt).toISOString() });
    return record;
  }

  private authenticate(token: string | null): { user: User; key: string } | undefined {
    if (!token || !/^[0-9A-Za-z_-]{16,128}$/.test(token)) return undefined;
    const key = digest(token);
    const record = this.valid(key, true);
    if (!record) return undefined;
    const stored = this.store.getUser(record.userId);
    if (stored) return { user: { id: stored.id, name: stored.name, role: stored.role }, key };
    return this.config.mode === 'demo' && record.userId === 'demo-operator' ? { user: { id: record.userId, name: record.name, role: record.role }, key } : undefined;
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!['/', '/ahp'].includes(url.pathname)) return false;
    if (!isWebSocketUpgrade(req)) { rejectUpgrade(socket, 400, 'Bad Request'); return true; }
    const authenticated = this.authenticate(url.searchParams.get('tkn'));
    if (!authenticated) { rejectUpgrade(socket, 403, 'Forbidden'); return true; }
    const connection = upgradeToWebSocket(req, socket, head);
    const client: Client = { id: randomUUID(), scheme: provider, connection, user: authenticated.user, token: authenticated.key, checkedAt: Date.now(), connectedAt: new Date().toISOString(), subscriptions: new Set(), initialized: false };
    this.clients.add(client);
    connection.on('message', text => void this.receive(client, text));
    connection.on('close', () => { this.clients.delete(client); this.dropActiveClient(client); if (!this.clients.size) this.stopPolling(); });
    connection.on('error', () => {});
    this.startPolling();
    return true;
  }

  /** The person's own initialized connections, oldest first, with what each client said about itself in `initialize`. */
  attachedClients(user: User): AttachedClient[] {
    return [...this.clients].filter(client => client.initialized && client.user.id === user.id)
      .map(client => ({ ...client.clientInfo, connectedAt: client.connectedAt, tokenId: client.token }))
      .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
  }

  close(): void { this.closed = true; this.stopPolling(); clearInterval(this.sweeper); this.automations.close(); for (const timer of this.departing.values()) clearTimeout(timer); this.departing.clear(); for (const client of this.clients) client.connection.close(1001, 'Server shutting down'); this.clients.clear(); }

  private startPolling(): void { if (!this.timer) this.timer = setInterval(() => void this.poll(), pollMs); }
  private stopPolling(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  private send(client: Client, message: Json): void { client.connection.send(JSON.stringify(message)); }

  private notify(channelFilter: string, method: string, params: Json | ((client: Client) => Json), ownerId?: string, audience?: (client: Client) => boolean): void {
    for (const client of this.clients) if (client.initialized && client.subscriptions.has(channelFilter) && (ownerId === undefined || this.mayView(client.user, ownerId)) && (!audience || audience(client))) this.send(client, { jsonrpc: '2.0', method, params: typeof params === 'function' ? params(client) : params });
  }

  private reject(sender: Client, channel: string, action: Json, origin: Origin, rejectionReason: string): void {
    const serverSeq = ++this.serverSeq;
    this.send(sender, { jsonrpc: '2.0', method: 'action', params: { channel, action, serverSeq, origin, rejectionReason } });
    for (const client of this.clients) if (client !== sender && client.initialized && client.user.id === sender.user.id) { const subscribed = this.subscribedAs(client, channel); if (subscribed) this.send(client, { jsonrpc: '2.0', method: 'action', params: { channel: subscribed, action, serverSeq, origin, rejectionReason } }); }
  }

  private broadcast(channel: string, action: Json | ((client: Client) => Json), origin?: Origin, audience?: (client: Client) => boolean): void {
    const serverSeq = ++this.serverSeq;
    for (const client of this.clients) {
      const subscribed = client.initialized && (!audience || audience(client)) ? this.subscribedAs(client, channel) : undefined;
      if (subscribed) this.send(client, { jsonrpc: '2.0', method: 'action', params: { channel: subscribed, action: typeof action === 'function' ? action(client) : action, serverSeq, origin } });
    }
  }

  private echo(sender: Client, channel: string, action: Json, origin: Origin, audience?: (client: Client) => boolean): void {
    const serverSeq = ++this.serverSeq;
    for (const client of this.clients) {
      if (!client.initialized || (client !== sender && audience && !audience(client))) continue;
      const subscribed = client === sender ? channel : this.subscribedAs(client, channel);
      if (subscribed) this.send(client, { jsonrpc: '2.0', method: 'action', params: { channel: subscribed, action, serverSeq, origin } });
    }
  }

  private subscribedAs(client: Client, channel: string): string | undefined {
    if (client.subscriptions.has(channel)) return channel;
    const key = channelKey(channel);
    for (const subscription of client.subscriptions) if (channelKey(subscription) === key) return subscription;
    return undefined;
  }

  private engineId(publicId: string): string { return this.store.getSecret<string>(`ahp-alias:${publicId}`) ?? publicId; }
  private publicId(engineId: string): string { return this.store.getSecret<string>(`ahp-public:${engineId}`) ?? engineId; }
  private sessionUri(session: Session, view: View): string { return sessionChannel(this.publicId(session.id), view.scheme); }
  private chatUri(session: Session, view: View): string { return chatChannel(this.publicId(session.id), view.scheme); }
  private changesetUri(session: Session): string { return changesetChannel(this.publicId(session.id)); }
  private pendingFor(uri: string): PendingSession | undefined { const id = sessionIdFrom(uri); return id ? this.pending.get(id) : undefined; }

  private mayView(user: User, ownerId: string): boolean { return ownerId === user.id || user.role === 'admin'; }

  private viewOf(view: View, publicId: string): AgentHostView { return this.store.agentHostView(view.user.id, publicId); }

  private visible(user: User): Session[] { return this.store.listSessions().filter(session => this.mayView(user, session.ownerId)); }

  private sessionFor(user: User, uri: string): Session | undefined {
    const id = sessionIdFrom(uri);
    const session = id ? this.store.getSession(this.engineId(id)) : undefined;
    if (!session || !this.mayView(user, session.ownerId)) return undefined;
    return session;
  }

  rootState(user: User): Json {
    return {
      agents: [{
        provider, displayName: 'Unfold crews', description: 'Operator-led agent crews in isolated workspaces; every session ends in a reviewable candidate.',
        models: this.config.models.map(model => ({ id: model.id, provider, name: model.name })),
        protectedResources: [],
      }],
      activeSessions: this.activeSessionCount(user),
    };
  }

  private activeSessionCount(user: User, owners = this.store.activeSessionOwners()): number {
    return owners.filter(owner => this.mayView(user, owner)).length;
  }

  private announceActiveSessions(): void {
    const watching = [...this.clients].filter(client => client.initialized && this.subscribedAs(client, rootChannel));
    if (!watching.length) return;
    const owners = this.store.activeSessionOwners();
    const counts = new Map(watching.map(client => [client, this.activeSessionCount(client.user, owners)]));
    const changed = watching.filter(client => counts.get(client) !== client.activeSessions);
    if (!changed.length) return;
    for (const client of changed) client.activeSessions = counts.get(client);
    this.broadcast(rootChannel, viewer => ({ type: 'root/activeSessionsChanged', activeSessions: counts.get(viewer) }), undefined, viewer => changed.includes(viewer));
  }

  private configSchema(): Json {
    const properties: Json = {
      repository: { type: 'string', title: 'Repository', enum: this.config.repositories.map(repo => repo.id), enumDescriptions: this.config.repositories.map(repo => repo.name) },
      crew: { type: 'string', title: 'Crew', enum: this.config.crews.map(crew => crew.id), enumDescriptions: this.config.crews.map(crew => crew.name) },
      budgetUsd: { type: 'number', title: 'Session budget (USD)', minimum: 0.01, maximum: this.config.maxBudgetUsd },
      title: { type: 'string', title: 'Session title' },
    };
    const options = placements(this.config);
    if (options.length > 1) properties.placement = { type: 'string', title: 'Workspace placement', enum: options.map(item => item.id), enumDescriptions: options.map(item => item.name) };
    return { type: 'object', properties, required: ['repository', 'crew', 'budgetUsd'] };
  }

  private defaultConfig(): Json {
    const placement = placements(this.config).find(item => item.default)?.id;
    return { repository: this.config.repositories[0]?.id, crew: this.config.crews[0]?.id, budgetUsd: Math.min(5, this.config.maxBudgetUsd), ...(placement ? { placement } : {}) };
  }

  summary(session: Session, view: View): Json {
    const repository = this.config.repositories.find(repo => repo.id === session.repositoryId);
    return {
      resource: this.sessionUri(session, view), provider, title: session.title, status: sessionStatus(session) | this.viewOf(view, this.publicId(session.id)).session, activity: activity(session),
      createdAt: session.createdAt, modifiedAt: session.updatedAt,
      ...this.project(repository),
      ...(session.candidate?.status === 'ready' ? { changes: { files: session.candidate.fileCount } } : {}),
      _meta: { 'dev.webgrip.unfold': { status: session.status, placement: session.placement, budgetUsd: session.budgetUsd, spentUsd: session.spentUsd, costStatus: session.costStatus, candidate: session.candidate?.status } },
    };
  }

  private openRequests(session: Session): PermissionRequest[] { return this.store.permissions(session.id).filter(request => !request.resolved); }

  private inputNeeded(session: Session, view: View): Json[] {
    return this.openRequests(session).map(request => this.inputRequest(session, request, view));
  }

  private inputRequest(session: Session, request: PermissionRequest, view: View): Json {
    const projection = this.projection(session);
    const turnId = projection.activeTurn?.id ?? projection.turns.at(-1)?.id ?? `${session.id}-turn-1`;
    if (request.kind === 'question') return { id: request.id, chat: this.chatUri(session, view), kind: 'chatInput', request: this.questionRequest(request) };
    return { id: request.id, chat: this.chatUri(session, view), kind: 'toolConfirmation', turnId, toolCall: this.pendingToolCall(request) };
  }

  private questionRequest(request: PermissionRequest): Json {
    const questions = Array.isArray(request.questions) ? request.questions as Json[] : [];
    const asked = questions.map(question => String(question?.question ?? '')).join('\n').trim();
    const detail = request.detail?.trim() && request.detail.trim() !== asked ? `\n\n${request.detail.trim()}` : '';
    return { id: request.id, message: `${request.title}${detail}`, questions: questions.map((question, index) => inputQuestion(question, index, request.title)) };
  }

  private answersFor(request: PermissionRequest, answers: Json | undefined): string[][] {
    const questions = Array.isArray(request.questions) ? request.questions as Json[] : [];
    if (!questions.length) return Object.values(answers ?? {}).map(answer => answerValues(undefined, answer as Json));
    return questions.map((question, index) => answerValues(question, answers?.[String(index)]));
  }

  private pendingToolCall(request: PermissionRequest): Json {
    return { toolCallId: request.id, toolName: 'permission', displayName: request.title, status: 'pending-confirmation', invocationMessage: request.detail || request.title, confirmationTitle: request.title, options: [{ id: 'once', label: 'Allow once', kind: 'approve' }, { id: 'always', label: 'Always allow', kind: 'approve' }, { id: 'reject', label: 'Reject', kind: 'deny' }] };
  }

  private changesets(session: Session): Json[] | undefined {
    if (session.candidate?.status !== 'ready' && session.status !== 'exporting' && !this.artifactFiles(session).length) return undefined;
    const repository = this.config.repositories.find(repo => repo.id === session.repositoryId);
    return [{ label: 'Candidate', uriTemplate: this.changesetUri(session), description: repository ? `Changes against ${repository.baseBranch} of ${repository.name}` : 'Reviewable change', changeKind: 'session', capabilities: { review: {} } }];
  }

  sessionState(session: Session, view: View): Json {
    const changesets = this.changesets(session);
    return {
      ...this.summary(session, view), lifecycle: 'ready', activeClients: this.activeClientsOf(this.publicId(session.id)),
      chats: [this.chatSummary(session, view)], defaultChat: this.chatUri(session, view),
      config: { schema: this.configSchema(), values: { repository: session.repositoryId, crew: session.crewId, budgetUsd: session.budgetUsd, title: session.title, ...(session.placement ? { placement: session.placement } : {}) } },
      ...(changesets ? { changesets } : {}),
      inputNeeded: this.inputNeeded(session, view),
    };
  }

  chatSummary(session: Session, view: View): Json {
    return { resource: this.chatUri(session, view), title: session.title, status: sessionStatus(session) | this.viewOf(view, this.publicId(session.id)).chat, activity: activity(session), modifiedAt: session.updatedAt, origin: { kind: 'user' }, interactivity: session.status === 'completed' ? 'read-only' : 'full' };
  }

  chatState(session: Session, view: View): Json {
    const projection = this.projection(session);
    const changesets = this.changesets(session);
    return { ...this.chatSummary(session, view), turns: projection.turns.slice(-maxTurnsInSnapshot), ...(projection.activeTurn ? { activeTurn: projection.activeTurn } : {}), ...(changesets ? { changesets } : {}) };
  }

  private candidateKey(session: Session): string | undefined {
    return session.candidate?.status === 'ready' && session.candidate.sha256 ? `${session.id}:${session.candidate.sha256.bundle}` : undefined;
  }

  private async loadCandidate(session: Session): Promise<void> {
    const key = this.candidateKey(session);
    if (!key || this.candidates.has(key)) return;
    let loading = this.loadingCandidates.get(key);
    if (!loading) {
      loading = (async () => {
        try {
          const manifest = JSON.parse((await readCandidate(this.config.dataDir, session.id, 'manifest')).content.toString('utf8'));
          const patch = await readCandidate(this.config.dataDir, session.id, 'patch');
          if (Array.isArray(manifest.files)) this.candidates.set(key, { files: manifest.files, counts: patchLineCounts(patch.content.toString('utf8')) });
        } catch {} finally { this.loadingCandidates.delete(key); }
      })();
      this.loadingCandidates.set(key, loading);
    }
    await loading;
  }

  private artifactFiles(session: Session): Json[] {
    const files: Json[] = [];
    const publicId = this.publicId(session.id);
    session.artifacts.filter(artifact => artifact.kind === 'diff').forEach((artifact, artifactIndex) => diffEntries(artifact.content).forEach((entry, index) => {
      if (typeof entry.before !== 'string' && typeof entry.after !== 'string') return;
      const content = (side: 'before' | 'after') => ({ uri: workspaceFile(entry.file), content: { uri: `unfold-diff:/${publicId}/${artifactIndex}/${index}/${side}`, contentType: 'text/plain', sizeHint: Buffer.byteLength(entry[side]) } });
      files.push({ id: `${artifactIndex}-${index}`, edit: { ...(typeof entry.before === 'string' ? { before: content('before') } : {}), ...(typeof entry.after === 'string' ? { after: content('after') } : {}), diff: { added: Number(entry.additions) || 0, removed: Number(entry.deletions) || 0 } } });
    }));
    return files;
  }

  private candidateFiles(session: Session, view: CandidateView): Json[] {
    const publicId = this.publicId(session.id);
    return view.files.map((file, index) => {
      const content = (side: 'before' | 'after') => ({ uri: workspaceFile(file.path), content: { uri: `unfold-candidate:/${publicId}/${index}/${side}`, ...(side === 'after' ? { sizeHint: file.bytes } : {}) } });
      const counts = view.counts.get(file.path);
      return { id: file.path, edit: { ...(file.baseBlob ? { before: content('before') } : {}), ...(file.blob ? { after: content('after') } : {}), ...(counts ? { diff: counts } : {}) } };
    });
  }

  changesetState(session: Session): Json {
    const key = this.candidateKey(session);
    const view = key ? this.candidates.get(key) : undefined;
    if (key && !view) return { status: 'error', error: { errorType: 'candidate_unreadable', message: 'The captured candidate could not be read from the workbench\'s storage.' }, files: [] };
    const operations = this.operations(session);
    return { status: session.status === 'exporting' ? 'computing' : 'ready', files: view ? this.candidateFiles(session, view) : this.artifactFiles(session), ...(operations.length ? { operations } : {}) };
  }

  private operations(session: Session): Json[] {
    const gated = Boolean(session.execution && this.config.delivery?.policies.some(policy => policy.repositoryId === session.repositoryId));
    if (session.status !== 'completed' || session.review || gated) return [];
    return [{ id: acceptOperation, label: 'Accept', description: 'Records your acceptance in the session history, as Accept in the workbench does. Nothing is pushed or merged.', scopes: ['changeset'], icon: 'check', status: 'idle' }];
  }

  private invokeOperation(client: Client, params: Json): Json {
    const channel = String(params.channel ?? '');
    if (parseChannel(channel)?.kind !== 'changeset') throw new RpcError(codes.invalidParams, 'channel must be an ahp-changeset channel');
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    const operation = this.operations(session).find(item => item.id === params.operationId);
    if (!operation) throw new RpcError(codes.invalidParams, `This changeset offers no operation ${JSON.stringify(params.operationId)}`);
    if (params.target !== undefined) throw new RpcError(codes.invalidParams, `${operation.label} applies to the whole candidate, not to a file or range`);
    let reviewed: Session;
    try { reviewed = this.engine.review(session.id, { decision: 'accepted' }, client.user); } catch (error) { throw asRpcError(error); }
    this.broadcast(this.changesetUri(reviewed), { type: 'changeset/operationsChanged', operations: this.operations(reviewed) });
    return { message: `Accepted by ${client.user.name}. The decision is in the session history; nothing was pushed or merged.` };
  }

  async readResource(user: User, uri: string): Promise<{ data: Buffer; contentType: string }> {
    const candidate = candidateContent.exec(uri);
    const artifact = candidate ? undefined : artifactContent.exec(uri);
    const session = candidate || artifact ? this.sessionFor(user, sessionChannel((candidate ?? artifact)![1])) : undefined;
    if (!session) throw new RpcError(codes.notFound, 'Resource not found');
    if (candidate) {
      const key = this.candidateKey(session);
      if (key) await this.loadCandidate(session);
      const file = key ? this.candidates.get(key)?.files[Number(candidate[2])] : undefined;
      const blob = candidate[3] === 'before' ? file?.baseBlob : file?.blob;
      if (!blob || !session.candidate?.sha256) throw new RpcError(codes.notFound, 'Resource not found');
      return { data: await readCandidateBlob(this.config.dataDir, session.id, session.candidate.sha256.bundle, blob), contentType: 'text/plain' };
    }
    const entry = diffEntries(session.artifacts.filter(item => item.kind === 'diff')[Number(artifact![2])]?.content ?? '')[Number(artifact![3])];
    const value = entry?.[artifact![4]];
    if (typeof value !== 'string') throw new RpcError(codes.notFound, 'Resource not found');
    return { data: Buffer.from(value), contentType: 'text/plain' };
  }

  private projection(session: Session): Projection {
    let projection = this.projections.get(session.id);
    if (!projection) {
      projection = { turns: [], parts: new Map(), toolCalls: new Map(), openTools: new Map(), cursor: 0, turnCounter: 0, origins: new Map(), answers: new Map(), choices: new Map(), startedRuns: new Set(), finishedRuns: new Set(), queuedInstructions: 0 };
      this.projections.set(session.id, projection);
      this.openTurn(projection, session, session.objective, session.createdAt, this.store.getSecret<string>(`ahp-turn:${session.id}`));
      const events = this.store.events(session.id);
      projection.finalStop = events.findLast(event => finalStopTypes.has(event.type))?.id;
      for (const event of events) this.reduce(projection, session, event);
      this.settle(projection, session);
    }
    return projection;
  }

  private openTurn(projection: Projection, session: Session, text: string, startedAt: string, requestedTurnId?: unknown, origin: 'user' | 'systemNotification' = 'user'): Json[] {
    if (projection.activeTurn) this.closeTurn(projection, 'complete', startedAt);
    const hostTurnId = `${session.id}-turn-${++projection.turnCounter}`;
    const turnId = this.acceptableTurnId(projection, requestedTurnId) ?? hostTurnId;
    const message = { text, origin: { kind: origin }, ...(origin === 'user' && session.runs[0] ? { model: { id: this.config.models[0]?.id ?? 'coding' } } : {}) };
    projection.activeTurn = { id: turnId, startedAt, message, responseParts: [], usage: undefined };
    return [this.tag(projection, { type: 'chat/turnStarted', turnId, startedAt, message }, `turn:${turnId}`)];
  }

  private acceptableTurnId(projection: Projection, turnId: unknown): string | undefined {
    if (typeof turnId !== 'string' || !clientTurnId.test(turnId)) return undefined;
    return projection.activeTurn?.id === turnId || projection.turns.some(turn => turn.id === turnId) ? undefined : turnId;
  }

  private tag(projection: Projection, action: Json, key: string): Json {
    const origin = projection.origins.get(key);
    if (origin) { projection.origins.delete(key); actionOrigins.set(action, origin); }
    return action;
  }

  private closeTurn(projection: Projection, state: 'complete' | 'cancelled' | 'error', at: string, error?: Json): Json[] {
    const active = projection.activeTurn;
    if (!active) return [];
    const duration = Math.max(0, Date.parse(at) - Date.parse(active.startedAt)) || 0;
    if (state === 'error' && error) active.responseParts.push({ kind: 'error', error });
    projection.turns.push({ id: active.id, startedAt: active.startedAt, duration, message: active.message, responseParts: active.responseParts, usage: active.usage, state });
    projection.activeTurn = undefined;
    projection.openTools.clear();
    projection.choices.clear();
    projection.holding = undefined;
    if (state === 'complete') return [{ type: 'chat/turnComplete', turnId: active.id, duration }];
    if (state === 'cancelled') return [{ type: 'chat/turnCancelled', turnId: active.id, duration }];
    return [{ type: 'chat/error', turnId: active.id, duration, part: { kind: 'error', error: error ?? { errorType: 'failed', message: 'The session failed' } } }];
  }

  private settle(projection: Projection, session: Session): Json[] {
    if (!projection.activeTurn || projection.holding) return [];
    if (['completed'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'complete', session.updatedAt)];
    if (['cancelled'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'cancelled', session.updatedAt)];
    if (['failed'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'error', session.updatedAt, { errorType: session.failure?.category ?? 'failed', message: session.failure?.message ?? session.blocker ?? 'The session failed' })];
    if (['paused', 'interrupted'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'complete', session.updatedAt)];
    return [];
  }

  /** The address of the session's page in the browser, when the workbench knows its public address. */
  private sessionPage(session: Session): string {
    return this.config.baseUrl ? `${this.config.baseUrl.replace(/\/+$/, '')}/#session/${encodeURIComponent(session.id)}` : '';
  }

  /** One Markdown part that ends a turn with the outcome: what happened, the change, spend, why it stopped and what to do next. Added once per turn. */
  private outcome(projection: Projection, session: Session): Json[] {
    const turn = projection.activeTurn;
    if (!turn || turn.outcome) return [];
    turn.outcome = true;
    const progress = sessionProgress(session, { events: this.store.events(session.id) });
    const again = session.status === 'cancelled' && !session.sourceTask ? '\n\nSend a message here to run it again with your message as an instruction for its crew; nothing runs until you choose.' : '';
    return this.addPart(projection, { kind: 'markdown', id: `${turn.id}-outcome`, content: `${outcomeMarkdown(progress, { sessionUrl: this.sessionPage(session) })}${again}` });
  }

  /** What a person reads after sending an instruction: when a Run will read it, or that no crew will and what to do instead. */
  private instructionNotice(projection: Projection, session: Session, event: Event): string {
    const afterFinalStop = projection.finalStop !== undefined && event.id > projection.finalStop;
    if (afterFinalStop && closedToMessages(session)) {
      const progress = sessionProgress(session);
      return `No crew will read this message: ${lowerFirst(progress.reason?.sentence ?? `the session is ${progress.meta.label.toLowerCase()}.`)} ${progress.actions.length ? `Instead: ${progress.actions.filter(action => !['open-session', 'cancel'].includes(action.id)).map(action => action.label).join(', ') || 'start a new session'}, from VS Code's Work Item view or the session page.` : 'Start a new session to try again.'}`;
    }
    const role = (runId?: string) => session.runs.find(run => run.id === runId)?.roleName ?? 'Role';
    if (projection.workingRun) {
      const working = role(projection.workingRun);
      const next = session.runs.find(run => run.id !== projection.workingRun && !projection.startedRuns.has(run.id));
      return next
        ? `Queued for the ${next.roleName}'s next step. The ${working} is working now and does not read it; pause and resume to give it to the ${working}.`
        : `Queued, but the ${working} is the last Role and is working now, so no later step reads it. Pause and resume to give it to the ${working}.`;
    }
    const first = session.runs.find(run => !projection.finishedRuns.has(run.id));
    const when = session.status === 'queued' ? 'when the session starts' : 'when the session resumes';
    return first ? `Queued for the ${first.roleName}'s next step, ${when}.` : `Queued for the next step, ${when}.`;
  }

  private openInputs(projection: Projection): Json[] {
    return (projection.activeTurn?.responseParts ?? []).filter((part: Json) => {
      const id = part.kind === 'inputRequest' && part.response === undefined ? part.request.id : part.kind === 'toolCall' && part.toolCall.status === 'pending-confirmation' ? part.toolCall.toolCallId : undefined;
      const request = id === undefined ? undefined : this.store.getPermission(id);
      return Boolean(request && !request.resolved);
    });
  }

  private raiseInput(projection: Projection, session: Session, part: Json, at: string): Json[] {
    const actions = projection.activeTurn ? [] : this.openTurn(projection, session, part.kind === 'inputRequest' ? part.request.message : part.toolCall.confirmationTitle, at, undefined, 'systemNotification');
    const turn = projection.activeTurn!;
    if (part.kind === 'inputRequest') {
      turn.responseParts.push({ kind: 'inputRequest', request: part.request });
      return [...actions, { type: 'chat/inputRequested', request: part.request }];
    }
    const { toolCall } = part;
    turn.responseParts.push({ kind: 'toolCall', toolCall });
    projection.toolCalls.set(toolCall.toolCallId, { turnId: turn.id, toolCallId: toolCall.toolCallId });
    return [...actions,
      { type: 'chat/toolCallStart', turnId: turn.id, toolCallId: toolCall.toolCallId, toolName: 'permission', displayName: toolCall.displayName },
      { type: 'chat/toolCallReady', turnId: turn.id, toolCallId: toolCall.toolCallId, invocationMessage: toolCall.invocationMessage, confirmationTitle: toolCall.confirmationTitle, options: toolCall.options }];
  }

  private requestPart(request: PermissionRequest): Json {
    return request.kind === 'question' ? { kind: 'inputRequest', request: this.questionRequest(request) } : { kind: 'toolCall', toolCall: this.pendingToolCall(request) };
  }

  private addPart(projection: Projection, part: Json): Json[] {
    const active = projection.activeTurn;
    if (!active) return [];
    active.responseParts.push(part);
    return [{ type: 'chat/responsePart', turnId: active.id, part: { ...part } }];
  }

  private reduce(projection: Projection, session: Session, event: Event): Json[] {
    projection.cursor = event.id;
    const data = event.data as Json;
    const actions: Json[] = [];
    const ensureTurn = () => { if (!projection.activeTurn) actions.push(...this.openTurn(projection, session, session.objective, event.at)); return projection.activeTurn!; };
    switch (event.type) {
      case 'session.started': { ensureTurn(); actions.push(...this.addPart(projection, { kind: 'systemNotification', content: data.resumed ? 'Session resumed by the operator.' : 'Session started.' })); break; }
      case 'workspace.ready': { ensureTurn(); actions.push(...this.addPart(projection, { kind: 'systemNotification', content: `Workspace ready (${data.backend}, ${data.isolation}).` })); break; }
      case 'run.started': {
        ensureTurn();
        if (event.runId) { projection.startedRuns.add(event.runId); projection.workingRun = event.runId; }
        actions.push(...this.addPart(projection, { kind: 'systemNotification', content: `${data.role} started · ${data.mode === 'read' ? 'reads the change and gives a verdict' : 'writes the change'}` }));
        if (projection.queuedInstructions) {
          const count = projection.queuedInstructions;
          projection.queuedInstructions = 0;
          actions.push(...this.addPart(projection, { kind: 'systemNotification', content: `Picked up by ${data.role} at ${clockUtc(event.at)}${count > 1 ? ` (${count} messages)` : ''}.` }));
        }
        break;
      }
      case 'message': {
        if (data.role === 'operator' && typeof data.text === 'string') {
          const waiting = this.openInputs(projection);
          actions.push(...this.closeTurn(projection, 'complete', event.at));
          actions.push(...this.openTurn(projection, session, data.text, event.at, data.turnId));
          for (const part of waiting) actions.push(...this.raiseInput(projection, session, part, event.at));
          const notice = this.instructionNotice(projection, session, event);
          if (notice.startsWith('Queued')) projection.queuedInstructions++;
          actions.push(...this.addPart(projection, { kind: 'systemNotification', content: notice }));
          if (!['running', 'waiting_input', 'exporting'].includes(session.status)) actions.push(...this.closeTurn(projection, 'complete', event.at));
          break;
        }
        if (typeof data.text !== 'string') break;
        const turn = ensureTurn();
        const key = `${event.runId ?? 'run'}:${data.partId ?? 'summary'}`;
        let partId = projection.parts.get(key);
        if (!partId || !turn.responseParts.some((part: Json) => part.kind === 'markdown' && part.id === partId)) {
          partId = `${turn.id}-part-${turn.responseParts.length + 1}`;
          projection.parts.set(key, partId);
          actions.push(...this.addPart(projection, { kind: 'markdown', id: partId, content: '' }));
        }
        const part = turn.responseParts.find((item: Json) => item.kind === 'markdown' && item.id === partId)!;
        part.content += data.text;
        actions.push({ type: 'chat/delta', turnId: turn.id, partId, content: data.text });
        break;
      }
      case 'tool': {
        const turn = ensureTurn();
        const name = String(data.name ?? 'tool');
        const status = String(data.status ?? 'unknown');
        let toolCallId = projection.openTools.get(name);
        if (!toolCallId) {
          toolCallId = `${turn.id}-tool-${turn.responseParts.length + 1}`;
          projection.openTools.set(name, toolCallId);
          const toolCall = { toolCallId, toolName: name, displayName: name, status: 'running', invocationMessage: `Running ${name}`, confirmed: 'not-needed' };
          turn.responseParts.push({ kind: 'toolCall', toolCall });
          actions.push({ type: 'chat/toolCallStart', turnId: turn.id, toolCallId, toolName: name, displayName: name });
          actions.push({ type: 'chat/toolCallReady', turnId: turn.id, toolCallId, invocationMessage: `Running ${name}`, confirmed: 'not-needed' });
        }
        if (['completed', 'error'].includes(status)) {
          const part = turn.responseParts.find((item: Json) => item.kind === 'toolCall' && item.toolCall.toolCallId === toolCallId)!;
          const result = { success: status === 'completed', pastTenseMessage: status === 'completed' ? `Ran ${name}` : `${name} failed` };
          part.toolCall = { ...part.toolCall, status: 'completed', ...result };
          projection.openTools.delete(name);
          actions.push({ type: 'chat/toolCallComplete', turnId: turn.id, toolCallId, result });
        }
        break;
      }
      case 'permission': {
        const question = data.kind === 'question';
        const request: PermissionRequest = { id: String(data.requestId ?? data.nativeId ?? randomUUID()), sessionId: session.id, runId: event.runId ?? '', nativeId: String(data.nativeId ?? ''), kind: question ? 'question' : 'permission', title: String(data.title ?? (question ? 'Question' : 'Permission')), detail: String(data.detail ?? ''), ...(question ? { questions: Array.isArray(data.questions) ? data.questions : [] } : {}) };
        actions.push(...this.raiseInput(projection, session, this.requestPart(request), event.at));
        break;
      }
      case 'brief.unclear': {
        const requestId = String(data.requestId ?? '');
        const request = this.store.getPermission(requestId) ?? { id: requestId, sessionId: session.id, runId: '', nativeId: '', kind: 'question', title: 'The brief needs more before the crew starts', detail: String(data.reason ?? ''), questions: (Array.isArray(data.questions) ? data.questions : []).map((question: unknown) => ({ question: String(question) })) };
        if (requestId) actions.push(...this.raiseInput(projection, session, this.requestPart(request), event.at));
        break;
      }
      case 'permission.resolved': {
        const turn = projection.activeTurn;
        if (!turn) break;
        const requestId = String(data.requestId ?? '');
        const decision = typeof data.decision === 'string' ? data.decision : undefined;
        const part = turn.responseParts.find((item: Json) => item.kind === 'toolCall' && item.toolCall.toolCallId === requestId);
        if (part) {
          const approved = decision !== 'reject';
          part.toolCall = approved ? { ...part.toolCall, status: 'completed', confirmed: 'user-action', success: true, pastTenseMessage: 'Allowed by the operator' } : { ...part.toolCall, status: 'cancelled', reason: 'denied' };
          actions.push(this.tag(projection, { type: 'chat/toolCallConfirmed', turnId: turn.id, toolCallId: requestId, ...(approved ? { approved: true, confirmed: 'user-action', selectedOptionId: decision } : { approved: false, reason: 'denied', selectedOptionId: 'reject' }) }, `request:${requestId}`));
          if (approved) actions.push({ type: 'chat/toolCallComplete', turnId: turn.id, toolCallId: requestId, result: { success: true, pastTenseMessage: 'Allowed by the operator' } });
        }
        const input = turn.responseParts.find((item: Json) => item.kind === 'inputRequest' && item.request.id === requestId);
        if (input) {
          const answers = projection.answers.get(requestId);
          projection.answers.delete(requestId);
          input.response = 'accept';
          if (answers) input.request = { ...input.request, answers };
          actions.push(this.tag(projection, { type: 'chat/inputCompleted', requestId, response: 'accept', ...(answers ? { answers } : {}) }, `request:${requestId}`));
        }
        break;
      }
      case 'usage': {
        const turn = projection.activeTurn;
        if (!turn) break;
        const usage = { inputTokens: Number(data.inputTokens) || 0, outputTokens: Number(data.outputTokens) || 0, _meta: { costUsd: data.costUsd, source: data.source } };
        turn.usage = usage;
        actions.push({ type: 'chat/usage', turnId: turn.id, usage });
        break;
      }
      case 'run.finished': {
        if (event.runId) { if (data.status === 'completed') projection.finishedRuns.add(event.runId); if (projection.workingRun === event.runId) projection.workingRun = undefined; }
        const turn = ensureTurn();
        const role = session.runs.find(run => run.id === event.runId)?.roleName ?? 'Role';
        const verdict = typeof data.verdict === 'string' ? verdictWords[data.verdict] ?? data.verdict : '';
        const text = [`**${role}** ${data.status === 'completed' ? verdict || 'finished' : `stopped (${String(data.status ?? 'ended').replaceAll('_', ' ')})`}.`, data.summary ? String(data.summary) : ''].filter(Boolean).join('\n\n');
        const partId = `${turn.id}-part-${turn.responseParts.length + 1}`;
        actions.push(...this.addPart(projection, { kind: 'markdown', id: partId, content: text }));
        break;
      }
      case 'candidate.ready': { const turn = projection.activeTurn; if (turn) actions.push(...this.addPart(projection, { kind: 'systemNotification', content: 'A reviewable candidate has been captured.' })); break; }
      case choiceEvents.offered: actions.push(...this.offerChoice(projection, session, event)); break;
      case choiceEvents.answered: actions.push(...this.choiceAnswered(projection, session, event)); break;
      case choiceEvents.reported: actions.push(...this.choiceReply(projection, session, event)); break;
      case 'session.completed': actions.push(...this.finalOutcome(projection, session, event), ...this.closeTurn(projection, 'complete', event.at)); break;
      case 'session.cancelled': actions.push(...this.finalOutcome(projection, session, event), ...this.closeTurn(projection, 'cancelled', event.at)); break;
      case 'session.failed': projection.workingRun = undefined; actions.push(...this.finalOutcome(projection, session, event), ...this.closeTurn(projection, 'error', event.at, { errorType: String(data.code ?? 'failed'), message: String(data.message ?? 'The session failed') })); break;
      case 'session.paused': case 'session.interrupted': {
        projection.workingRun = undefined;
        const cancelled = event.type === 'session.paused' && projection.origins.has('cancel');
        if (projection.activeTurn) {
          const outcome = this.finalOutcome(projection, session, event);
          actions.push(...(outcome.length ? outcome : this.addPart(projection, { kind: 'systemNotification', content: String(data.message ?? 'Execution paused.') })));
          const closed = this.closeTurn(projection, cancelled ? 'cancelled' : 'complete', event.at);
          actions.push(...(cancelled ? closed.map(action => this.tag(projection, action, 'cancel')) : closed));
        }
        if (event.type === 'session.paused') projection.origins.delete('cancel');
        break;
      }
      default: break;
    }
    return actions;
  }

  /** The outcome part, when `event` is the session's last stop and the session has not run since. */
  private finalOutcome(projection: Projection, session: Session, event: Event): Json[] {
    if (event.id !== projection.finalStop || ['running', 'waiting_input', 'exporting', 'queued'].includes(session.status)) return [];
    return this.outcome(projection, session);
  }

  /** Opens the turn of a choice: the person's message, or a host notice for a choice offered when the session stopped, then the explanation and the question. A choice without options only explains. */
  private offerChoice(projection: Projection, session: Session, event: Event): Json[] {
    const offered = event.data as Json;
    const actions = this.closeTurn(projection, 'complete', event.at);
    const fromMessage = typeof offered.text === 'string';
    actions.push(...(fromMessage ? this.openTurn(projection, session, offered.text, event.at, offered.turnId) : this.openTurn(projection, session, String(offered.title), event.at, undefined, 'systemNotification')));
    const turn = projection.activeTurn!;
    actions.push(...this.addPart(projection, { kind: 'markdown', id: `${turn.id}-choice`, content: String(offered.explanation ?? '') }));
    if (!Array.isArray(offered.options) || !offered.options.length) return [...actions, ...this.closeTurn(projection, 'complete', event.at)];
    const request = choiceRequest(offered);
    turn.responseParts.push({ kind: 'inputRequest', request });
    projection.choices.set(request.id, offered);
    projection.holding = request.id;
    return [...actions, { type: 'chat/inputRequested', request }];
  }

  /** Completes a choice's input request with the person's answer, then replies in the same turn. */
  private choiceAnswered(projection: Projection, session: Session, event: Event): Json[] {
    const data = event.data as Json;
    const choiceId = String(data.choiceId ?? '');
    const actions: Json[] = [];
    const input = projection.activeTurn?.responseParts.find((part: Json) => part.kind === 'inputRequest' && part.request.id === choiceId && part.response === undefined);
    projection.choices.delete(choiceId);
    if (input) {
      const response = data.response === 'accept' ? 'accept' : 'cancel';
      const answers = response === 'accept' && data.answers && typeof data.answers === 'object' ? data.answers as Json : undefined;
      input.response = response;
      if (answers) input.request = { ...input.request, answers };
      actions.push(this.tag(projection, { type: 'chat/inputCompleted', requestId: choiceId, response, ...(answers ? { answers } : {}) }, `request:${choiceId}`));
    }
    return [...actions, ...this.choiceReply(projection, session, event)];
  }

  /** What came of a choice, as Markdown in the choice's turn, which it ends unless the answer is still being carried out. With the choice's turn already ended, the reply gets a turn of its own. */
  private choiceReply(projection: Projection, session: Session, event: Event): Json[] {
    const data = event.data as Json;
    const reply = typeof data.reply === 'string' ? data.reply : '';
    const choiceId = String(data.choiceId ?? '');
    const own = projection.activeTurn?.responseParts.some((part: Json) => part.kind === 'inputRequest' && part.request.id === choiceId);
    const actions: Json[] = [];
    if (!own) {
      if (!reply || event.type !== choiceEvents.reported) return actions;
      actions.push(...this.closeTurn(projection, 'complete', event.at), ...this.openTurn(projection, session, String(data.title ?? 'Update'), event.at, undefined, 'systemNotification'));
    }
    const turn = projection.activeTurn!;
    if (reply) actions.push(...this.addPart(projection, { kind: 'markdown', id: `${turn.id}-reply-${turn.responseParts.length + 1}`, content: reply }));
    if (own && data.closes === false) { projection.holding = choiceId; return actions; }
    if (data.cancelled === true) return [...actions, ...this.closeTurn(projection, 'cancelled', event.at).map(action => this.tag(projection, action, 'cancel'))];
    return [...actions, ...this.closeTurn(projection, 'complete', event.at)];
  }

  /** The choice still waiting for an answer in the session's chat. */
  private openChoice(projection: Projection): Json | undefined { return [...projection.choices.values()].at(-1); }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const client of [...this.clients]) if (Date.now() - client.checkedAt >= 60_000) this.current(client, false);
      const watched = new Map<string, Session>();
      const watchers = new Map<string, User>();
      for (const client of this.clients) for (const channel of client.subscriptions) { const publicId = sessionIdFrom(channel); const id = publicId ? this.engineId(publicId) : undefined; if (id && !watched.has(id)) { const session = this.store.getSession(id); if (session) watched.set(id, session); } if (id && client.initialized && client.user.role !== 'viewer' && !watchers.has(id)) watchers.set(id, client.user); }
      for (const [id, session] of watched) {
        const projection = this.projection(session);
        const publicId = this.publicId(id);
        const chat = chatChannel(publicId);
        const channel = sessionChannel(publicId);
        const arriving = this.store.events(id, projection.cursor);
        const stop = arriving.findLast(event => finalStopTypes.has(event.type));
        if (stop) projection.finalStop = stop.id;
        const fresh = [...arriving.flatMap(event => this.reduce(projection, session, event)), ...this.settle(projection, session)];
        for (const action of fresh) this.broadcast(chat, action, actionOrigins.get(action));
        const watcher = watchers.get(id);
        if (watcher) this.offerNextSteps(session, watcher);
        const unread = fresh.some(action => action.type === 'chat/turnStarted' || action.type === 'chat/inputRequested' || (action.type === 'chat/toolCallReady' && action.confirmationTitle !== undefined));
        const cleared = unread ? this.store.clearAgentHostFlags(publicId, statusBits.isRead, new Date().toISOString()) : [];
        const fingerprint = this.fingerprint(session);
        const previous = this.summaries.get(id);
        if (previous === fingerprint && !cleared.length) continue;
        this.summaries.set(id, fingerprint);
        if (previous === undefined) continue;
        const status = sessionStatus(session);
        const current = activity(session);
        if (fingerprintActivity(previous) !== current) {
          this.broadcast(channel, { type: 'session/activityChanged', activity: current });
          this.broadcast(chat, { type: 'chat/activityChanged', ...(current ? { activity: current } : {}) });
        }
        this.broadcast(channel, viewer => ({ type: 'session/chatUpdated', chat: this.chatUri(session, viewer), changes: { title: session.title, status: status | this.viewOf(viewer, publicId).chat, activity: activity(session) ?? null, modifiedAt: session.updatedAt } }));
        const changesets = this.changesets(session);
        this.broadcast(channel, { type: 'session/changesetsChanged', changesets });
        this.broadcast(chat, { type: 'chat/changesetsChanged', changesets });
        for (const request of this.openRequests(session)) this.broadcast(channel, viewer => ({ type: 'session/inputNeededSet', request: this.inputRequest(session, request, viewer) }));
        for (const request of this.store.permissions(id).filter(item => item.resolved)) this.broadcast(channel, { type: 'session/inputNeededRemoved', id: request.id });
        this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => { const summary = this.summary(session, viewer); return { channel: rootChannel, session: summary.resource, changes: { title: summary.title, status: summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt, changes: summary.changes } }; }, session.ownerId);
        if (changesets) { await this.loadCandidate(session); if (this.closed) return; const changeset = this.changesetState(session); this.broadcast(this.changesetUri(session), { type: 'changeset/contentChanged', files: changeset.files, operations: changeset.operations ?? [] }); }
      }
      this.announceActiveSessions();
    } finally { this.polling = false; }
  }

  private current(client: Client, renew: boolean): boolean {
    if (!this.clients.has(client)) return false;
    client.checkedAt = Date.now();
    if (this.valid(client.token, renew)) return true;
    if (this.clients.delete(client)) client.connection.close(1008, 'Connection token expired');
    return false;
  }

  private async receive(client: Client, text: string): Promise<void> {
    if (!this.current(client, true)) return;
    let message: Json;
    try { message = JSON.parse(text); } catch { this.send(client, { jsonrpc: '2.0', id: null, error: { code: codes.parse, message: 'Parse error' } }); return; }
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') { this.send(client, { jsonrpc: '2.0', id: message?.id ?? null, error: { code: codes.invalidRequest, message: 'Invalid request' } }); return; }
    const params = (message.params ?? {}) as Json;
    if (message.id === undefined) { try { await this.notification(client, message.method, params); } catch {} return; }
    try {
      const result = await this.request(client, message.method, params);
      this.send(client, { jsonrpc: '2.0', id: message.id, result });
    } catch (error) {
      const rpc = error instanceof RpcError ? error : new RpcError(codes.internal, error instanceof Error && 'status' in error ? String(error.message) : 'Internal error');
      this.send(client, { jsonrpc: '2.0', id: message.id, error: { code: rpc.code, message: rpc.message, ...(rpc.data !== undefined ? { data: rpc.data } : {}) } });
      if (rpc.code === codes.unsupportedVersion) { this.clients.delete(client); client.connection.close(1000, 'Unsupported protocol version'); }
    }
  }

  private snapshot(client: Client, channel: string): Json {
    if (channel === rootChannel) { const state = this.rootState(client.user); client.activeSessions = state.activeSessions; return { resource: rootChannel, state, fromSeq: this.serverSeq }; }
    const parsed = parseChannel(channel);
    if (!parsed) throw new RpcError(codes.notFound, 'Unknown channel');
    const pending = this.pending.get(parsed.id);
    if (pending && !this.mayView(client.user, pending.user.id)) throw new RpcError(codes.sessionNotFound, 'Session not found');
    if (pending && parsed.kind === 'session') return { resource: channel, state: this.pendingState(pending, client), fromSeq: this.serverSeq };
    if (pending && parsed.kind === 'chat') return { resource: channel, state: { ...this.pendingChat(pending, client), turns: [] }, fromSeq: this.serverSeq };
    if (pending) throw new RpcError(codes.notFound, 'Unknown channel');
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    if (parsed.kind === 'session') return { resource: channel, state: this.sessionState(session, client), fromSeq: this.serverSeq };
    if (parsed.kind === 'chat') return { resource: channel, state: this.chatState(session, client), fromSeq: this.serverSeq };
    return { resource: channel, state: this.changesetState(session), fromSeq: this.serverSeq };
  }

  private pendingSummary(pending: PendingSession, view: View): Json {
    return { resource: sessionChannel(pending.id, view.scheme), provider, title: pending.config.title ?? 'New session', status: statusBits.idle | this.viewOf(view, pending.id).session, createdAt: pending.createdAt, modifiedAt: pending.createdAt, ...this.project(this.config.repositories.find(repo => repo.id === pending.config.repository)) };
  }

  private project(repository: Repository | undefined): Json {
    return repository ? { project: { uri: repository.url, displayName: repositoryWorkspaceNames(this.config.repositories).get(repository.id) } } : {};
  }

  private repositoryDirectories(): Json[] {
    return [...repositoryWorkspaceNames(this.config.repositories).values()].map(name => ({ name, type: 'directory' }));
  }

  private repositoryFromPickedFolder(directory: unknown): string | undefined {
    if (typeof directory !== 'string') return undefined;
    let path: string;
    try { const url = new URL(directory); if (url.protocol !== 'file:') return undefined; path = decodeURIComponent(url.pathname).replace(/\/+$/, ''); } catch { return undefined; }
    const prefix = `${new URL(repositoriesDirectory).pathname}/`;
    if (!path.startsWith(prefix)) return undefined;
    const name = path.slice(prefix.length);
    return [...repositoryWorkspaceNames(this.config.repositories)].find(([, workspace]) => workspace === name)?.[0];
  }

  private listDirectory(uri: unknown): Json {
    let path: string | undefined;
    try { const url = new URL(String(uri)); if (url.protocol === 'file:') path = decodeURIComponent(url.pathname).replace(/(.)\/+$/, '$1'); } catch {}
    if (path === new URL(repositoriesDirectory).pathname) return { entries: this.repositoryDirectories() };
    if (path === '/') return { entries: [{ name: new URL(repositoriesDirectory).pathname.slice(1), type: 'directory' }] };
    if (path !== undefined && this.repositoryFromPickedFolder(`file://${path}`)) return { entries: [] };
    throw new RpcError(codes.notFound, 'This host lists only its repositories');
  }

  private pendingChat(pending: PendingSession, view: View): Json {
    return { resource: chatChannel(pending.id, view.scheme), title: pending.config.title ?? 'New session', status: statusBits.idle | this.viewOf(view, pending.id).chat, modifiedAt: pending.createdAt, origin: { kind: 'user' }, interactivity: 'full' };
  }

  private pendingState(pending: PendingSession, view: View): Json {
    return { ...this.pendingSummary(pending, view), lifecycle: 'ready', activeClients: this.activeClientsOf(pending.id), chats: [this.pendingChat(pending, view)], defaultChat: chatChannel(pending.id, view.scheme), config: { schema: this.configSchema(), values: pending.config }, inputNeeded: [] };
  }

  private fingerprint(session: Session): string {
    return JSON.stringify([sessionStatus(session), activity(session), session.title, session.candidate?.status, this.openRequests(session).map(item => item.id), session.artifacts.length, session.review?.decision, closedToMessages(session)]);
  }

  private async subscribe(client: Client, channel: string): Promise<Json> {
    if (channel === automationsChannel && this.automations.available) { const state = await this.automations.snapshot(client.user); client.subscriptions.add(channel); return { resource: channel, state, fromSeq: this.serverSeq }; }
    const parsed = parseChannel(channel);
    if (parsed?.kind === 'changeset') { const session = this.sessionFor(client.user, channel); if (session) await this.loadCandidate(session); }
    const snapshot = this.snapshot(client, channel);
    client.subscriptions.add(channel);
    const publicId = sessionIdFrom(channel);
    const id = publicId ? this.engineId(publicId) : undefined;
    if (id && !this.summaries.has(id)) { const session = this.store.getSession(id); if (session) this.summaries.set(id, this.fingerprint(session)); }
    const watched = id && client.user.role !== 'viewer' ? this.store.getSession(id) : undefined;
    if (watched) this.offerNextSteps(watched, client.user);
    return snapshot;
  }

  private remember(clientId: string, user: User, scheme: SessionScheme, clientInfo: Client['clientInfo']): void {
    this.knownClients.remember(clientId, { userId: user.id, scheme, ...(clientInfo ? { clientInfo } : {}) });
  }

  private async request(client: Client, method: string, params: Json): Promise<Json> {
    if (method === 'ping') return {};
    if (method === 'initialize') {
      let negotiated: string | undefined;
      try { negotiated = negotiateProtocolVersion(Array.isArray(params.protocolVersions) ? params.protocolVersions : []); }
      catch (error) { throw new RpcError(codes.invalidParams, (error as Error).message); }
      if (!negotiated) throw new RpcError(codes.unsupportedVersion, `None of the offered protocol versions is in ${supportedVersions.join(', ')}`, { supportedVersions });
      if (typeof params.clientId !== 'string') throw new RpcError(codes.invalidParams, 'clientId is required');
      const declaresSessionUris = params._meta?.[sessionUrisMeta] === true;
      client.clientId = params.clientId; client.scheme = sessionSchemeFor(params.clientInfo, params._meta); client.initialized = true; client.clientInfo = describedClient(params.clientInfo);
      this.remember(params.clientId, client.user, client.scheme, client.clientInfo);
      this.resumeActiveClient(params.clientId, Array.isArray(params.initialSubscriptions) ? params.initialSubscriptions : [rootChannel]);
      const snapshots: Json[] = [];
      for (const channel of Array.isArray(params.initialSubscriptions) ? params.initialSubscriptions : [rootChannel]) snapshots.push(await this.subscribe(client, channel));
      return { protocolVersion: negotiated, serverSeq: this.serverSeq, serverInfo: { name: 'unfold', version: this.config.mode === 'demo' ? 'demo' : 'live' }, defaultDirectory: repositoriesDirectory, ...(this.automations.available ? { automations: this.automations.capabilities() } : {}), ...(declaresSessionUris || this.automations.available ? { _meta: { ...(declaresSessionUris ? { [sessionUrisMeta]: true } : {}), ...(this.automations.available ? { [autonomousAutomationsMeta]: true } : {}) } } : {}), snapshots, terminalCommandPrefix: undefined };
    }
    if (method === 'reconnect' && !client.initialized) {
      const known = typeof params.clientId === 'string' ? this.knownClients.get(params.clientId) : undefined;
      if (!known || known.userId !== client.user.id) throw new RpcError(codes.notFound, 'This host does not know that client; initialize');
      client.clientId = params.clientId; client.scheme = params._meta?.[sessionUrisMeta] === true ? 'ahp-session' : known.scheme; client.initialized = true; client.clientInfo = known.clientInfo;
      this.remember(params.clientId, client.user, client.scheme, client.clientInfo);
      this.resumeActiveClient(params.clientId, Array.isArray(params.subscriptions) ? params.subscriptions : []);
    }
    if (!client.initialized) throw new RpcError(codes.invalidRequest, 'initialize first');
    switch (method) {
      case 'reconnect': { const snapshots: Json[] = []; for (const channel of Array.isArray(params.subscriptions) ? params.subscriptions : []) snapshots.push(await this.subscribe(client, channel)); return { type: 'snapshot', snapshots }; }
      case 'subscribe': { if (typeof params.channel !== 'string') throw new RpcError(codes.invalidParams, 'channel is required'); return { snapshot: await this.subscribe(client, params.channel) }; }
      case 'listSessions': return { items: this.visible(client.user).map(session => this.summary(session, client)) };
      case 'resolveSessionConfig': { const picked = this.repositoryFromPickedFolder(params.workingDirectory); return { schema: this.configSchema(), values: { ...this.defaultConfig(), ...(params.config ?? {}), ...(picked ? { repository: picked } : {}) } }; }
      case 'resourceList': return this.listDirectory(params.uri);
      case 'sessionConfigCompletions': { const schema = this.configSchema().properties[String(params.property)]; const values: string[] = schema?.enum ?? []; return { items: values.map((value, index) => ({ value, label: schema.enumDescriptions?.[index] ?? value })) }; }
      case 'createSession': return this.createSession(client, params);
      case 'createChat': return this.createChat(client, params);
      case 'disposeSession': return this.disposeSession(client, params);
      case 'disposeChat': return {};
      case 'fetchTurns': return {};
      case 'completions': return { items: [] };
      case 'resourceRead': {
        if (typeof params.uri !== 'string') throw new RpcError(codes.invalidParams, 'uri is required');
        const resource = await this.readResource(client.user, params.uri);
        const decoded = params.encoding === 'base64' ? undefined : text(resource.data);
        if (decoded !== undefined) return { data: decoded, encoding: 'utf-8', contentType: resource.contentType };
        return { data: resource.data.toString('base64'), encoding: 'base64', contentType: params.encoding === 'base64' && text(resource.data) !== undefined ? resource.contentType : 'application/octet-stream' };
      }
      case 'invokeChangesetOperation': return this.invokeOperation(client, params);
      case 'runAutomation': case 'fetchAutomationRuns': case 'listAutomationTriggerDefinitions': {
        if (!this.automations.available) throw new RpcError(codes.methodNotFound, `Method not found: ${method}`);
        const answer = await this.automations.command(client.user, method, params);
        if ('refused' in answer) throw new RpcError(codes[answer.code], answer.refused);
        return answer.result;
      }
      case 'authenticate': return {};
      case 'getNetworkDiagnosticsInfo': return { version: applicationVersion, os: process.platform, arch: process.arch, proxySettings: {}, proxyEnv: {}, endpoints: [] };
      default: throw new RpcError(codes.methodNotFound, `Method not found: ${method}`);
    }
  }

  private createSession(client: Client, params: Json): Json {
    const channel = String(params.channel ?? params.session ?? '');
    const parsed = parseChannel(channel);
    if (parsed?.kind !== 'session') throw new RpcError(codes.invalidParams, `session must be ${provider}:/<id> or ahp-session:/<id>`);
    if (params.provider && params.provider !== provider) throw new RpcError(codes.providerNotFound, 'Unknown provider');
    if (this.pending.has(parsed.id) || this.store.getSession(this.engineId(parsed.id)) || this.store.getSession(parsed.id)) throw new RpcError(codes.sessionExists, 'Session already exists');
    const picked = Array.isArray(params.workingDirectories) ? this.repositoryFromPickedFolder(params.workingDirectories[0]) : undefined;
    const config = { ...this.defaultConfig(), ...(params.config && typeof params.config === 'object' ? params.config : {}), ...(picked ? { repository: picked } : {}) };
    if (!this.config.repositories.some(repo => repo.id === config.repository) || !this.config.crews.some(crew => crew.id === config.crew)) throw new RpcError(codes.invalidParams, 'Choose a configured repository and crew');
    const activeClient = params.activeClient as Json | undefined;
    if (activeClient !== undefined && (!activeClient || typeof activeClient !== 'object' || activeClient.clientId !== client.clientId)) throw new RpcError(codes.invalidParams, 'activeClient.clientId must be the clientId this client initialized with');
    const pending: PendingSession = { id: parsed.id, uri: channel, config, user: client.user, createdAt: new Date().toISOString() };
    this.pending.set(parsed.id, pending);
    if (activeClient) { this.activeClients.set(parsed.id, new Map([[client.clientId!, activeClient]])); this.persistActiveClients(); }
    client.subscriptions.add(channel);
    queueMicrotask(() => { this.broadcast(channel, { type: 'session/ready' }); if (activeClient) this.broadcast(channel, { type: 'session/activeClientSet', activeClient }); this.notify(rootChannel, 'root/sessionAdded', viewer => ({ channel: rootChannel, summary: this.pendingSummary(pending, viewer) }), client.user.id); });
    return {};
  }

  private createChat(client: Client, params: Json): Json {
    const channel = String(params.channel ?? '');
    const chat = String(params.chat ?? '');
    const pending = this.pendingFor(channel);
    if (pending) {
      if (!this.mayView(client.user, pending.user.id)) throw new RpcError(codes.sessionNotFound, 'Session not found');
      if (channelKey(chat) !== channelKey(chatChannel(pending.id))) throw new RpcError(codes.conflict, `An Unfold session has exactly one chat: ${chatChannel(pending.id, client.scheme)}`);
      client.subscriptions.add(chat);
      if (params.initialMessage?.text) queueMicrotask(() => void this.startFromPending(pending, params.initialMessage, { clientId: client.clientId!, clientSeq: 0 }));
      return {};
    }
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    throw new RpcError(codes.conflict, 'An Unfold session has exactly one chat; subscribe to its default chat');
  }

  private disposeSession(client: Client, params: Json): Json {
    const channel = String(params.channel ?? '');
    const pending = this.pendingFor(channel);
    if (pending) {
      if (!this.mayView(client.user, pending.user.id)) throw new RpcError(codes.sessionNotFound, 'Session not found');
      this.pending.delete(pending.id);
      this.store.deleteAgentHostViews(pending.id);
      if (this.activeClients.delete(pending.id)) this.persistActiveClients();
      this.notify(rootChannel, 'root/sessionRemoved', viewer => ({ channel: rootChannel, session: sessionChannel(pending.id, viewer.scheme) }), pending.user.id);
      return {};
    }
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    if (['running', 'waiting_input', 'queued', 'paused', 'interrupted'].includes(session.status)) void this.engine.cancel(session.id, client.user).catch(() => {});
    const publicId = this.publicId(session.id);
    for (const item of this.clients) for (const subscription of [...item.subscriptions]) if (sessionIdFrom(subscription) === publicId) item.subscriptions.delete(subscription);
    this.evict(session.id);
    if (this.activeClients.delete(publicId)) this.persistActiveClients();
    this.notify(rootChannel, 'root/sessionRemoved', viewer => ({ channel: rootChannel, session: sessionChannel(publicId, viewer.scheme) }), session.ownerId);
    return {};
  }

  private async startFromPending(pending: PendingSession, message: Json, origin: Origin, requestedTurnId?: unknown): Promise<string | undefined> {
    const text = String(message.text ?? '').trim();
    if (pending.starting || this.pending.get(pending.id) !== pending) return 'The session is already starting';
    pending.starting = true;
    let session: Session;
    try {
      session = this.engine.create({ title: String(pending.config.title ?? text.split('\n')[0]).slice(0, 160) || 'Agent host session', objective: text, repositoryId: String(pending.config.repository), crewId: String(pending.config.crew), runtime: this.config.mode === 'demo' ? 'demo' : this.config.runtime.kind, placement: pending.config.placement as WorkspaceBackend | undefined, budgetUsd: Number(pending.config.budgetUsd) }, pending.user);
    } catch (error) {
      pending.starting = false;
      this.broadcast(pending.uri, { type: 'session/creationFailed', error: { errorType: (error as Json)?.code ?? 'create_failed', message: (error as Error)?.message ?? 'Could not create the session' } });
      return (error as Error)?.message ?? 'Could not create the session';
    }
    const turnId = typeof requestedTurnId === 'string' && clientTurnId.test(requestedTurnId) ? requestedTurnId : undefined;
    this.store.transaction(() => {
      if (session.id !== pending.id) { this.store.setSecret(`ahp-alias:${pending.id}`, session.id); this.store.setSecret(`ahp-public:${session.id}`, pending.id); }
      if (turnId) this.store.setSecret(`ahp-turn:${session.id}`, turnId);
    });
    this.pending.delete(pending.id);
    this.summaries.set(session.id, this.fingerprint(session));
    this.store.clearAgentHostFlags(pending.id, statusBits.isRead, session.createdAt);
    this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => { const summary = this.summary(session, viewer); return { channel: rootChannel, session: summary.resource, changes: { title: summary.title, status: summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt, ...(summary.project ? { project: summary.project } : {}) } }; }, session.ownerId);
    this.broadcast(sessionChannel(pending.id), viewer => ({ type: 'session/chatUpdated', chat: this.chatUri(session, viewer), changes: { title: session.title, status: sessionStatus(session) | this.viewOf(viewer, pending.id).chat, modifiedAt: session.updatedAt } }));
    const projection = this.projection(session);
    const turn = projection.activeTurn ?? projection.turns.at(-1);
    if (turn) this.broadcast(chatChannel(pending.id), { type: 'chat/turnStarted', turnId: turn.id, startedAt: turn.startedAt, message: turn.message }, origin);
    try { await this.engine.start(session.id, pending.user); }
    catch (error) { this.broadcast(pending.uri, { type: 'session/creationFailed', error: { errorType: (error as Json)?.code ?? 'start_failed', message: (error as Error)?.message ?? 'Could not start the session' } }); }
    return undefined;
  }

  private setViewFlag(client: Client, channel: string, kind: ChannelKind, pending: PendingSession | undefined, action: Json, origin: Origin, flag: ViewFlag): string | undefined {
    if (kind !== flag.channel) return `${action.type} is dispatched on the ${flag.channel} channel`;
    if (typeof action[flag.field] !== 'boolean') return `${flag.field} must be true or false`;
    const session = pending ? undefined : this.sessionFor(client.user, channel);
    if (!pending && !session) return 'Session not found';
    const publicId = session ? this.publicId(session.id) : pending!.id;
    const current = this.viewOf(client, publicId);
    const next = { ...current, [flag.channel]: action[flag.field] ? current[flag.channel] | flag.bit : current[flag.channel] & ~flag.bit };
    this.store.setAgentHostView(client.user.id, publicId, next, new Date().toISOString());
    const sameUser = (other: Client) => other.user.id === client.user.id;
    const activityBits = session ? sessionStatus(session) : statusBits.idle;
    this.echo(client, channel, action, origin, sameUser);
    if (flag.channel === 'session') this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => ({ channel: rootChannel, session: sessionChannel(publicId, viewer.scheme), changes: { status: activityBits | next.session } }), undefined, sameUser);
    else this.broadcast(sessionChannel(publicId), viewer => ({ type: 'session/chatUpdated', chat: chatChannel(publicId, viewer.scheme), changes: { status: activityBits | next.chat } }), undefined, sameUser);
    return undefined;
  }

  private activeClientsOf(publicId: string): Json[] { return [...(this.activeClients.get(publicId)?.values() ?? [])]; }

  private setActiveClient(client: Client, channel: string, publicId: string, action: Json, origin: Origin): string | undefined {
    const setting = action.type === 'session/activeClientSet';
    const clientId = setting ? action.activeClient?.clientId : action.clientId;
    if (clientId !== origin.clientId) return 'A client can only set or remove itself as an active client';
    const clients = this.activeClients.get(publicId) ?? new Map<string, Json>();
    if (setting) clients.set(clientId, action.activeClient); else clients.delete(clientId);
    if (clients.size) this.activeClients.set(publicId, clients); else this.activeClients.delete(publicId);
    this.persistActiveClients();
    this.echo(client, channel, action, origin);
    return undefined;
  }

  private connected(clientId: string): boolean { return [...this.clients].some(other => other.clientId === clientId); }

  private dropActiveClient(client: Client): void {
    const clientId = client.clientId;
    if (this.closed || !clientId || this.connected(clientId) || ![...this.activeClients.values()].some(clients => clients.has(clientId))) return;
    this.awaitReturn(clientId);
  }

  private awaitReturn(clientId: string): void {
    clearTimeout(this.departing.get(clientId));
    const timer = setTimeout(() => { this.departing.delete(clientId); if (!this.connected(clientId)) this.removeActiveClient(clientId); }, this.activeClientGraceMs);
    timer.unref();
    this.departing.set(clientId, timer);
  }

  private resumeActiveClient(clientId: string, subscriptions: unknown[]): void {
    const timer = this.departing.get(clientId);
    if (!timer) return;
    clearTimeout(timer);
    this.departing.delete(clientId);
    const resubscribed = new Set(subscriptions.map(channel => typeof channel === 'string' ? parseChannel(channel) : undefined).filter(parsed => parsed && parsed.kind !== 'changeset').map(parsed => parsed!.id));
    this.removeActiveClient(clientId, publicId => resubscribed.has(publicId));
  }

  private removeActiveClient(clientId: string, keep: (publicId: string) => boolean = () => false): void {
    for (const [publicId, clients] of [...this.activeClients]) {
      if (keep(publicId) || !clients.delete(clientId)) continue;
      if (!clients.size) this.activeClients.delete(publicId);
      this.persistActiveClients();
      this.broadcast(sessionChannel(publicId), { type: 'session/activeClientRemoved', clientId });
    }
  }

  private renameSession(client: Client, channel: string, session: Session, action: Json, origin: Origin): undefined {
    const renamed = this.engine.rename(session.id, action.title, client.user);
    const publicId = this.publicId(session.id);
    this.echo(client, channel, { ...action, title: renamed.title }, origin);
    if (parseChannel(channel)?.kind === 'chat') this.broadcast(sessionChannel(publicId), { type: 'session/titleChanged', title: renamed.title });
    this.broadcast(sessionChannel(publicId), viewer => ({ type: 'session/chatUpdated', chat: chatChannel(publicId, viewer.scheme), changes: { title: renamed.title } }));
    this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => ({ channel: rootChannel, session: sessionChannel(publicId, viewer.scheme), changes: { title: renamed.title } }), session.ownerId);
    return undefined;
  }

  private async answer(session: Session, requestId: string, answer: { decision?: 'once' | 'always' | 'reject'; answers?: string[][] }, user: User, origin: Origin, submitted?: Json): Promise<undefined> {
    const projection = this.projection(session);
    projection.origins.set(`request:${requestId}`, origin);
    if (submitted) projection.answers.set(requestId, submitted);
    try { await this.engine.respond(session.id, requestId, answer, user); }
    catch (error) { projection.origins.delete(`request:${requestId}`); projection.answers.delete(requestId); throw error; }
    return undefined;
  }

  /** Tells the person's clients that a session exists, so a session created from a choice shows in the Agents window at once. */
  private announceSession(session: Session): void {
    this.summaries.set(session.id, this.fingerprint(session));
    this.notify(rootChannel, 'root/sessionAdded', viewer => ({ channel: rootChannel, summary: this.summary(session, viewer) }), session.ownerId);
  }

  private optionLines(session: Session, recovery: Recovery, options: ChoiceOption[], withMessage: boolean): string {
    const budget = money(session.budgetUsd);
    const reviewer = recovery.review?.roleName ?? 'The reviewer';
    const meaning: Record<ChoiceOptionId, string> = {
      run_again_start: `a new session with this session's brief, repository, crew, placement and budget (${budget})${withMessage ? ', and your message as an instruction its crew reads' : ''}. It starts at once, as a new Ploeg authorization.`,
      run_again: `the same new session, left ready for you to start. Nothing runs until you do.`,
      deliver: `${reviewer} approved this work before the session stopped. Unfold captures the approved branch as the candidate and Ploeg completes this session with it, without another model call. The pull request follows the normal delivery path${withMessage ? ', and your message goes to no crew' : ''}.`,
      resume: 'this session continues in a new generation, and every Run that did not finish runs again.',
      dismiss: withMessage ? 'nothing changes, and your message is not used.' : 'nothing changes. You can still act on the session page.',
    };
    return options.map(option => `- **${option.label}**: ${meaning[option.id]}`).join('\n');
  }

  /** The choice offered for a message no crew will read: run again with the message as the brief, deliver approved work first, or cancel. */
  private messageOffer(session: Session, recovery: Recovery): Json {
    const available = new Map(recovery.actions.filter(action => action.available).map(action => [action.id, action]));
    const options: ChoiceOption[] = [];
    if (available.has('run_again')) options.push({ id: 'run_again_start', label: 'Run again and start' }, { id: 'run_again', label: 'Run again with this message' });
    if (available.has('deliver')) options.push({ id: 'deliver', label: 'Deliver the approved work first' });
    const reason = sessionProgress(session, { events: this.store.events(session.id) }).reason?.sentence ?? `the session is ${session.status}.`;
    const blocked = recovery.actions.find(action => action.id === 'run_again' && !action.available)?.unavailableReason;
    if (!options.length) return { title: 'No crew will read this message', explanation: `No crew will read this message. ${reason}${blocked ? ` It cannot run again from here: ${blocked}` : ''}`, options: [] };
    options.push({ id: 'dismiss', label: 'Cancel' });
    return { title: 'No crew will read this message', question: 'What should happen with your message?', explanation: `No crew will read this message. ${reason} Choose what happens with it below; nothing runs until you choose.`, detail: this.optionLines(session, recovery, options, true), options };
  }

  /** The choice that ends a session which stopped by itself or failed: its next steps, with links to the pull request and the session page. */
  private closingOffer(session: Session, recovery: Recovery): Json | undefined {
    const available = new Map(recovery.actions.filter(action => action.available).map(action => [action.id, action]));
    const options: ChoiceOption[] = [];
    if (available.has('deliver')) options.push({ id: 'deliver', label: 'Deliver the approved work' });
    if (available.has('resume')) options.push({ id: 'resume', label: 'Resume' });
    if (available.has('run_again')) options.push({ id: 'run_again_start', label: 'Run again and start' }, { id: 'run_again', label: 'Run again, start later' });
    if (!options.length) return undefined;
    options.push({ id: 'dismiss', label: 'Leave it for now' });
    const progress = sessionProgress(session, { events: this.store.events(session.id), recovery });
    const page = this.sessionPage(session);
    const links = [progress.change.pullRequest?.url ? `[Open pull request #${progress.change.pullRequest.number}](${progress.change.pullRequest.url})` : '', page && progress.change.viewable ? `[View the change](${page})` : page ? `[Open the session page](${page})` : ''].filter(Boolean).join(' · ');
    return { title: 'What next?', question: 'What should happen next?', explanation: [recovery.summary, 'Nothing runs until you choose.', links].filter(Boolean).join('\n\n'), detail: this.optionLines(session, recovery, options, false), options };
  }

  /** Offers the next steps once, after the last stop of a session that stopped by itself or failed. It reads the recovery answer and never acts. */
  private offerNextSteps(session: Session, user: User): void {
    if (!['interrupted', 'failed'].includes(session.status) || this.offering.has(session.id)) return;
    const projection = this.projection(session);
    const stop = projection.finalStop;
    if (stop === undefined || this.offeredAfter.get(session.id) === stop || this.openChoice(projection)) return;
    this.offeredAfter.set(session.id, stop);
    if (this.store.events(session.id, stop).some(event => event.type === choiceEvents.offered)) return;
    this.offering.add(session.id);
    void this.engine.recovery(session.id, user).then(recovery => {
      const current = this.store.getSession(session.id);
      if (!current || current.status !== session.status || this.store.events(session.id, stop).some(event => event.type === choiceEvents.offered || finalStopTypes.has(event.type))) return;
      const offer = this.closingOffer(current, recovery);
      if (offer) this.store.appendEvent(session.id, choiceEvents.offered, 'system', { choiceId: randomUUID(), ...offer });
    }).catch(() => this.offeredAfter.delete(session.id)).finally(() => this.offering.delete(session.id));
  }

  /** Turns a message no crew will read into a choice in the person's own turn. A choice still open is answered as replaced first. */
  private async offerForMessage(client: Client, session: Session, text: string, origin: Origin, requestedTurnId?: unknown, known?: Recovery): Promise<undefined> {
    const recovery = known ?? await this.engine.recovery(session.id, client.user);
    const projection = this.projection(session);
    const open = this.openChoice(projection);
    if (open) this.store.appendEvent(session.id, choiceEvents.answered, client.user.id, { choiceId: open.choiceId, option: 'dismiss', response: 'cancel', reply: 'Replaced by your next message.' });
    const turnId = requestedTurnId === undefined ? undefined : this.acceptableTurnId(projection, requestedTurnId) ?? randomUUID();
    if (turnId) projection.origins.set(`turn:${turnId}`, origin);
    this.store.appendEvent(session.id, choiceEvents.offered, client.user.id, { choiceId: randomUUID(), ...(turnId ? { turnId } : {}), text, ...this.messageOffer(session, recovery) });
    return undefined;
  }

  private runAgainReply(next: Session, started: boolean, withMessage: boolean, startError?: string): string {
    const page = this.sessionPage(next);
    const created = `Created a new session, **${next.title}**, with this session's brief, repository, crew, placement and budget (${money(next.budgetUsd)})${withMessage ? ', and your message as an instruction its crew reads' : ''}. It is in the Agents window's session list${page ? ` and on [its session page](${page})` : ''}. This session stays as it is.`;
    if (startError) return `${created}\n\nStarting it did not work: ${startError} It waits for you to start it.`;
    return started ? `${created}\n\nIt started as a new Ploeg authorization.` : `${created}\n\nIt waits for you: send it a message to start it, or start it on its session page.`;
  }

  /** Carries out the option the person picked through the recovery API's own calls and owner checks, and records the answer and its result. */
  private async answerChoice(client: Client, session: Session, offered: Json, action: Json, origin: Origin): Promise<string | undefined> {
    const choiceId = String(offered.choiceId);
    if (this.answering.has(choiceId)) return 'This choice is already being answered';
    const accepted = action.response === 'accept' && action.cancelled !== true;
    const submitted = accepted && action.answers && typeof action.answers === 'object' ? action.answers as Json : undefined;
    const picked = submitted?.['0']?.value;
    const optionId = accepted ? (picked?.kind === 'selected' ? String(picked.value) : '') : 'dismiss';
    const option = (offered.options as ChoiceOption[]).find(item => item.id === optionId);
    if (!option) return 'Choose one of the offered options';
    if (option.id !== 'dismiss' && client.user.role === 'viewer') return 'Viewers cannot change work';
    const projection = this.projection(session);
    const originKey = action.cancelled === true ? 'cancel' : `request:${choiceId}`;
    const answered = (data: Json) => this.store.appendEvent(session.id, choiceEvents.answered, client.user.id, { choiceId, option: option.id, response: accepted ? 'accept' : 'cancel', ...(submitted ? { answers: submitted } : {}), ...data });
    const report = (title: string, error: unknown) => this.store.appendEvent(session.id, choiceEvents.reported, client.user.id, { choiceId, title, reply: `${title} did not happen: ${error instanceof Error ? error.message : 'the call failed.'}` });
    const withMessage = typeof offered.text === 'string';
    this.answering.add(choiceId);
    projection.origins.set(originKey, origin);
    try {
      switch (option.id) {
        case 'dismiss': answered({ reply: dismissReply, ...(accepted ? {} : { cancelled: true }) }); return undefined;
        case 'run_again': case 'run_again_start': {
          const next = this.engine.runAgain(session.id, client.user);
          if (withMessage) await this.engine.message(next.id, String(offered.text), client.user);
          this.announceSession(next);
          let startError: string | undefined;
          if (option.id === 'run_again_start') { try { await this.engine.start(next.id, client.user); this.announceSession(this.store.getSession(next.id) ?? next); } catch (error) { startError = error instanceof Error ? error.message : 'the call failed.'; } }
          answered({ sessionId: next.id, reply: this.runAgainReply(next, option.id === 'run_again_start' && !startError, withMessage, startError) });
          return undefined;
        }
        case 'deliver': {
          answered({ reply: 'Delivering the approved work through Ploeg, without another model call. This turn ends with the outcome.', closes: false });
          void this.engine.deliver(session.id, client.user).catch(error => report('Delivery', error));
          return undefined;
        }
        case 'resume': {
          answered({ reply: 'Resuming this session in a new generation.' });
          void this.engine.resume(session.id, client.user).catch(error => report('Resuming', error));
          return undefined;
        }
      }
    } catch (error) {
      projection.origins.delete(originKey);
      this.answering.delete(choiceId);
      this.store.appendEvent(session.id, choiceEvents.reported, client.user.id, { choiceId, reply: `${option.label} did not work: ${error instanceof Error ? error.message : 'the call failed.'} The choice is still open.`, closes: false });
      throw error;
    }
  }

  private async dispatchToPending(client: Client, channel: string, kind: ChannelKind, pending: PendingSession, action: Json, origin: Origin): Promise<string | undefined> {
    switch (action.type) {
      case 'chat/turnStarted': return kind === 'chat' ? this.startFromPending(pending, action.message ?? {}, origin, action.turnId) : 'chat/turnStarted is dispatched on the chat channel';
      case 'session/activeClientSet': case 'session/activeClientRemoved': return kind === 'session' ? this.setActiveClient(client, channel, pending.id, action, origin) : `${action.type} is dispatched on the session channel`;
      case 'chat/draftChanged': this.echo(client, channel, action, origin); return undefined;
      default: return `${String(action.type)} waits until the first message starts the session`;
    }
  }

  private async dispatchToSession(client: Client, channel: string, kind: ChannelKind, session: Session, action: Json, origin: Origin): Promise<string | undefined> {
    const ended = ['completed', 'cancelled', 'failed'].includes(session.status);
    const notOnChat = kind === 'chat' ? undefined : `${String(action.type)} is dispatched on the chat channel`;
    switch (action.type) {
      case 'chat/turnStarted': {
        if (notOnChat) return notOnChat;
        const text = String(action.message?.text ?? '').trim();
        if (!text) return 'Empty message';
        if (session.status === 'completed') return 'The session has completed; start a new session';
        if (ended || this.openChoice(this.projection(session))) return this.offerForMessage(client, session, text, origin, action.turnId ?? null);
        const projection = this.projection(session);
        const turnId = this.acceptableTurnId(projection, action.turnId) ?? randomUUID();
        projection.origins.set(`turn:${turnId}`, origin);
        try { await this.engine.message(session.id, text, client.user, turnId); }
        catch (error) {
          projection.origins.delete(`turn:${turnId}`);
          if ((error as { code?: unknown })?.code === 'session_stranded') return this.offerForMessage(client, session, text, origin, action.turnId ?? null);
          throw error;
        }
        if (session.status === 'queued') await this.engine.start(session.id, client.user);
        else if (['paused', 'interrupted'].includes(session.status)) await this.engine.resume(session.id, client.user);
        return undefined;
      }
      case 'chat/turnCancelled': {
        if (notOnChat) return notOnChat;
        const projection = this.projection(session);
        const choice = this.openChoice(projection);
        if (choice && this.answering.has(String(choice.choiceId))) { projection.origins.set('cancel', origin); return undefined; }
        if (choice) return this.answerChoice(client, session, choice, { response: 'cancel', cancelled: true }, origin);
        projection.origins.set('cancel', origin);
        try { await this.engine.pause(session.id, client.user); }
        catch (error) { projection.origins.delete('cancel'); throw error; }
        return undefined;
      }
      case 'chat/toolCallConfirmed': {
        const request = this.store.getPermission(String(action.toolCallId ?? ''));
        if (!request || request.sessionId !== session.id) return 'Unknown permission request';
        const decision = action.approved === false ? 'reject' : ['once', 'always'].includes(String(action.selectedOptionId)) ? String(action.selectedOptionId) as 'once' | 'always' : 'once';
        return this.answer(session, request.id, { decision }, client.user, origin);
      }
      case 'chat/inputCompleted': {
        const choice = this.projection(session).choices.get(String(action.requestId ?? ''));
        if (choice) return this.answerChoice(client, session, choice, action, origin);
        const request = this.store.getPermission(String(action.requestId ?? ''));
        if (!request || request.sessionId !== session.id || request.kind !== 'question') return 'Unknown question';
        if (action.response !== 'accept') return declineReason;
        const submitted = action.answers && typeof action.answers === 'object' ? action.answers as Json : undefined;
        const answers = this.answersFor(request, submitted);
        return this.answer(session, request.id, { answers: answers.length ? answers : [['']] }, client.user, origin, submitted);
      }
      case 'chat/pendingMessageSet': {
        if (notOnChat) return notOnChat;
        if (!['steering', 'queued'].includes(action.kind) || typeof action.id !== 'string' || !action.id) return 'A pending message needs a kind, steering or queued, and an id';
        if (action.message?.origin?.kind !== 'user') return 'Only a person\'s own message becomes an instruction';
        const text = String(action.message?.text ?? '').trim();
        if (!text) return 'Empty message';
        if (session.status === 'completed') return 'The session has completed; start a new session';
        const settled = () => { this.echo(client, channel, action, origin); this.broadcast(channel, { type: 'chat/pendingMessageRemoved', kind: action.kind, id: action.id }); };
        const choose = async () => { const recovery = await this.engine.recovery(session.id, client.user); settled(); return this.offerForMessage(client, session, text, origin, undefined, recovery); };
        if (ended || this.openChoice(this.projection(session))) return choose();
        try { await this.engine.message(session.id, text, client.user); }
        catch (error) { if ((error as { code?: unknown })?.code === 'session_stranded') return choose(); throw error; }
        settled();
        return undefined;
      }
      case 'chat/pendingMessageRemoved': return 'A pending message becomes an instruction for the next execution as soon as it arrives, so none is left to remove';
      case 'chat/queuedMessagesReordered': { if (notOnChat) return notOnChat; this.echo(client, channel, action, origin); return undefined; }
      case 'chat/truncated': return 'Unfold keeps a session\'s history as durable evidence, so it cannot be truncated; start a new session instead';
      case 'session/titleChanged': return kind === 'changeset' ? 'session/titleChanged is dispatched on the session or chat channel' : this.renameSession(client, channel, session, action, origin);
      case 'session/activeClientSet': case 'session/activeClientRemoved': return kind === 'session' ? this.setActiveClient(client, channel, this.publicId(session.id), action, origin) : `${action.type} is dispatched on the session channel`;
      case 'chat/draftChanged': case 'chat/inputAnswerChanged': case 'changeset/filesReviewChanged': this.echo(client, channel, action, origin); return undefined;
      default: return `Unsupported action ${String(action.type)}`;
    }
  }

  private async notification(client: Client, method: string, params: Json): Promise<void> {
    if (method === 'unsubscribe') { if (typeof params.channel === 'string') client.subscriptions.delete(params.channel); return; }
    if (method !== 'dispatchAction') return;
    const channel = String(params.channel ?? '');
    const action = (params.action ?? {}) as Json;
    const origin = { clientId: client.clientId ?? client.id, clientSeq: Number(params.clientSeq) || 0 };
    const reject = (reason: string) => this.reject(client, channel, action, origin, reason);
    try {
      if (channel === rootChannel) {
        if (action.type === 'root/configChanged') this.echo(client, channel, action, origin, () => false);
        else reject(`Unsupported action ${String(action.type)}`);
        return;
      }
      if (channel === automationsChannel && this.automations.available) { reject(this.automations.refuse(action)); return; }
      const parsed = parseChannel(channel);
      if (!parsed) { reject('Unknown channel'); return; }
      const pending = parsed.kind !== 'changeset' ? this.pending.get(parsed.id) : undefined;
      if (pending && !this.mayView(client.user, pending.user.id)) { reject('Session not found'); return; }
      const flag = viewFlags[String(action.type)];
      const session = pending ? undefined : this.sessionFor(client.user, channel);
      if (!pending && !session) { reject('Session not found'); return; }
      const reason = flag ? this.setViewFlag(client, channel, parsed.kind, pending, action, origin, flag)
        : pending ? await this.dispatchToPending(client, channel, parsed.kind, pending, action, origin)
        : await this.dispatchToSession(client, channel, parsed.kind, session!, action, origin);
      if (reason) reject(reason);
    } catch (error) {
      reject(error instanceof Error ? error.message : 'Action failed');
    }
  }
}
