import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AgentHostView, Store } from '../store.ts';
import type { Engine } from '../engine.ts';
import { placements } from '../config.ts';
import { patchLineCounts, readCandidate, readCandidateBlob, type CandidateFile } from '../candidates.ts';
import type { AppConfig, Event, PermissionRequest, Session, User, WorkspaceBackend } from '../types.ts';
import { WebSocketConnection, connectionToken, isWebSocketUpgrade, rejectUpgrade, upgradeToWebSocket } from './websocket.ts';

/** The AHP compatibility baseline this host implements. It accepts any offered version in `>=0.9.0 <0.10.0`. */
export const protocolVersion = '0.9.0';
/** What the host names in `data.supportedVersions` when no offered version is in its range. */
export const supportedVersions = ['^0.9.0'];
export const provider = 'unfold';
const rootChannel = 'ahp-root://';
const applicationVersion = (() => { try { return String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version); } catch { return 'unknown'; } })();
const pollMs = 300;
const maxTurnsInSnapshot = 200;

/** The `initialize` and `InitializeResult` `_meta` key by which VS Code declares it addresses sessions as `ahp-session:/<id>`. */
export const sessionUrisMeta = 'vscode.ahpSessionUris';

/** How a client spells session channels: by the provider as VS Code 1.141 does, or as `ahp-session` once it declares {@link sessionUrisMeta}. */
export type SessionScheme = typeof provider | 'ahp-session';

type Json = Record<string, any>;
type Client = { id: string; clientId?: string; scheme: SessionScheme; connection: WebSocketConnection; user: User; token: string; checkedAt: number; subscriptions: Set<string>; initialized: boolean; activeSessions?: number };
type View = Pick<Client, 'user' | 'scheme'>;
type Origin = { clientId: string; clientSeq: number };
type ChannelKind = 'session' | 'chat' | 'changeset';
type TokenRecord = { userId: string; name: string; role: User['role']; label: string; createdAt: string; expiresAt?: string; signIn?: string };
type Projection = { turns: Json[]; activeTurn?: Json; parts: Map<string, string>; toolCalls: Map<string, { turnId: string; toolCallId: string }>; openTools: Map<string, string>; cursor: number; turnCounter: number; permissionTurn?: string; origins: Map<string, Origin>; answers: Map<string, Json> };
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
function activity(session: Session): string | undefined {
  const run = session.runs.find(item => ['running', 'waiting_input'].includes(item.status));
  if (run) return `${run.roleName}${session.status === 'waiting_input' ? ' is waiting for your decision' : ' is working'}`;
  if (session.status === 'exporting') return 'Capturing the candidate';
  return undefined;
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
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
  serverSeq = 0;
  private readonly projections = new Map<string, Projection>();
  private readonly pending = new Map<string, PendingSession>();
  private readonly summaries = new Map<string, string>();
  private readonly activeClients = new Map<string, Map<string, Json>>();
  private readonly candidates = new Map<string, CandidateView>();
  private readonly loadingCandidates = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  private closed = false;

  constructor(config: AppConfig, store: Store, engine: Engine) {
    this.config = config; this.store = store; this.engine = engine;
  }

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
    const client: Client = { id: randomUUID(), scheme: provider, connection, user: authenticated.user, token: authenticated.key, checkedAt: Date.now(), subscriptions: new Set(), initialized: false };
    this.clients.add(client);
    connection.on('message', text => void this.receive(client, text));
    connection.on('close', () => { this.clients.delete(client); this.dropActiveClient(client); if (!this.clients.size) this.stopPolling(); });
    connection.on('error', () => {});
    this.startPolling();
    return true;
  }

  close(): void { this.closed = true; this.stopPolling(); for (const client of this.clients) client.connection.close(1001, 'Server shutting down'); this.clients.clear(); }

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
      ...(repository ? { project: { uri: repository.url, displayName: repository.name } } : {}),
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
    return { resource: this.chatUri(session, view), title: session.title, status: sessionStatus(session) | this.viewOf(view, this.publicId(session.id)).chat, activity: activity(session), modifiedAt: session.updatedAt, origin: { kind: 'user' }, interactivity: ['completed', 'cancelled', 'failed'].includes(session.status) ? 'read-only' : 'full' };
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
      projection = { turns: [], parts: new Map(), toolCalls: new Map(), openTools: new Map(), cursor: 0, turnCounter: 0, origins: new Map(), answers: new Map() };
      this.projections.set(session.id, projection);
      this.openTurn(projection, session, session.objective, session.createdAt, this.store.getSecret<string>(`ahp-turn:${session.id}`));
      for (const event of this.store.events(session.id)) this.reduce(projection, session, event);
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
    if (state === 'complete') return [{ type: 'chat/turnComplete', turnId: active.id, duration }];
    if (state === 'cancelled') return [{ type: 'chat/turnCancelled', turnId: active.id, duration }];
    return [{ type: 'chat/error', turnId: active.id, duration, part: { kind: 'error', error: error ?? { errorType: 'failed', message: 'The session failed' } } }];
  }

  private settle(projection: Projection, session: Session): Json[] {
    if (!projection.activeTurn) return [];
    if (['completed'].includes(session.status)) return this.closeTurn(projection, 'complete', session.updatedAt);
    if (['cancelled'].includes(session.status)) return this.closeTurn(projection, 'cancelled', session.updatedAt);
    if (['failed'].includes(session.status)) return this.closeTurn(projection, 'error', session.updatedAt, { errorType: session.failure?.category ?? 'failed', message: session.failure?.message ?? session.blocker ?? 'The session failed' });
    if (['paused', 'interrupted'].includes(session.status)) {
      const actions = this.addPart(projection, { kind: 'systemNotification', content: session.blocker ?? (session.status === 'paused' ? 'Paused by the operator. Resume to continue.' : 'Interrupted; resume explicitly.') });
      return [...actions, ...this.closeTurn(projection, 'complete', session.updatedAt)];
    }
    return [];
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
      case 'run.started': { ensureTurn(); actions.push(...this.addPart(projection, { kind: 'systemNotification', content: `${data.role} started (${data.mode === 'read' ? 'read-only' : 'writer'}).` })); break; }
      case 'message': {
        if (data.role === 'operator' && typeof data.text === 'string') {
          const waiting = this.openInputs(projection);
          actions.push(...this.closeTurn(projection, 'complete', event.at));
          actions.push(...this.openTurn(projection, session, data.text, event.at, data.turnId));
          for (const part of waiting) actions.push(...this.raiseInput(projection, session, part, event.at));
          actions.push(...this.addPart(projection, { kind: 'systemNotification', content: 'Instruction saved. It applies to the next execution; pause and resume to apply it now.' }));
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
        const turn = ensureTurn();
        const text = [`**${session.runs.find(run => run.id === event.runId)?.roleName ?? 'Role'}** ${data.status === 'completed' ? 'completed' : 'ended'}${data.verdict ? ` with verdict \`${data.verdict}\`` : ''}.`, data.summary ? String(data.summary) : ''].filter(Boolean).join('\n\n');
        const partId = `${turn.id}-part-${turn.responseParts.length + 1}`;
        actions.push(...this.addPart(projection, { kind: 'markdown', id: partId, content: text }));
        break;
      }
      case 'candidate.ready': { const turn = projection.activeTurn; if (turn) actions.push(...this.addPart(projection, { kind: 'systemNotification', content: 'A reviewable candidate has been captured.' })); break; }
      case 'session.completed': actions.push(...this.closeTurn(projection, 'complete', event.at)); break;
      case 'session.cancelled': actions.push(...this.closeTurn(projection, 'cancelled', event.at)); break;
      case 'session.failed': actions.push(...this.closeTurn(projection, 'error', event.at, { errorType: String(data.code ?? 'failed'), message: String(data.message ?? 'The session failed') })); break;
      case 'session.paused': case 'session.interrupted': {
        const cancelled = event.type === 'session.paused' && projection.origins.has('cancel');
        if (projection.activeTurn) {
          actions.push(...this.addPart(projection, { kind: 'systemNotification', content: String(data.message ?? 'Execution paused.') }));
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

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const client of [...this.clients]) if (Date.now() - client.checkedAt >= 60_000) this.current(client, false);
      const watched = new Map<string, Session>();
      for (const client of this.clients) for (const channel of client.subscriptions) { const publicId = sessionIdFrom(channel); const id = publicId ? this.engineId(publicId) : undefined; if (id && !watched.has(id)) { const session = this.store.getSession(id); if (session) watched.set(id, session); } }
      for (const [id, session] of watched) {
        const projection = this.projection(session);
        const publicId = this.publicId(id);
        const chat = chatChannel(publicId);
        const channel = sessionChannel(publicId);
        const fresh = [...this.store.events(id, projection.cursor).flatMap(event => this.reduce(projection, session, event)), ...this.settle(projection, session)];
        for (const action of fresh) this.broadcast(chat, action, actionOrigins.get(action));
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
    return { resource: sessionChannel(pending.id, view.scheme), provider, title: pending.config.title ?? 'New session', status: statusBits.idle | this.viewOf(view, pending.id).session, createdAt: pending.createdAt, modifiedAt: pending.createdAt };
  }

  private pendingChat(pending: PendingSession, view: View): Json {
    return { resource: chatChannel(pending.id, view.scheme), title: pending.config.title ?? 'New session', status: statusBits.idle | this.viewOf(view, pending.id).chat, modifiedAt: pending.createdAt, origin: { kind: 'user' }, interactivity: 'full' };
  }

  private pendingState(pending: PendingSession, view: View): Json {
    return { ...this.pendingSummary(pending, view), lifecycle: 'ready', activeClients: this.activeClientsOf(pending.id), chats: [this.pendingChat(pending, view)], defaultChat: chatChannel(pending.id, view.scheme), config: { schema: this.configSchema(), values: pending.config }, inputNeeded: [] };
  }

  private fingerprint(session: Session): string {
    return JSON.stringify([sessionStatus(session), activity(session), session.title, session.candidate?.status, this.openRequests(session).map(item => item.id), session.artifacts.length, session.review?.decision]);
  }

  private async subscribe(client: Client, channel: string): Promise<Json> {
    const parsed = parseChannel(channel);
    if (parsed?.kind === 'changeset') { const session = this.sessionFor(client.user, channel); if (session) await this.loadCandidate(session); }
    const snapshot = this.snapshot(client, channel);
    client.subscriptions.add(channel);
    const publicId = sessionIdFrom(channel);
    const id = publicId ? this.engineId(publicId) : undefined;
    if (id && !this.summaries.has(id)) { const session = this.store.getSession(id); if (session) this.summaries.set(id, this.fingerprint(session)); }
    return snapshot;
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
      client.clientId = params.clientId; client.scheme = declaresSessionUris ? 'ahp-session' : provider; client.initialized = true;
      const snapshots: Json[] = [];
      for (const channel of Array.isArray(params.initialSubscriptions) ? params.initialSubscriptions : [rootChannel]) snapshots.push(await this.subscribe(client, channel));
      return { protocolVersion: negotiated, serverSeq: this.serverSeq, serverInfo: { name: 'unfold', version: this.config.mode === 'demo' ? 'demo' : 'live' }, ...(declaresSessionUris ? { _meta: { [sessionUrisMeta]: true } } : {}), snapshots, terminalCommandPrefix: undefined };
    }
    if (method === 'reconnect' && !client.initialized) throw new RpcError(codes.notFound, 'This host keeps no client across connections; initialize');
    if (!client.initialized) throw new RpcError(codes.invalidRequest, 'initialize first');
    switch (method) {
      case 'reconnect': { const snapshots: Json[] = []; for (const channel of Array.isArray(params.subscriptions) ? params.subscriptions : []) snapshots.push(await this.subscribe(client, channel)); return { type: 'snapshot', snapshots }; }
      case 'subscribe': { if (typeof params.channel !== 'string') throw new RpcError(codes.invalidParams, 'channel is required'); return { snapshot: await this.subscribe(client, params.channel) }; }
      case 'listSessions': return { items: this.visible(client.user).map(session => this.summary(session, client)) };
      case 'resolveSessionConfig': return { schema: this.configSchema(), values: { ...this.defaultConfig(), ...(params.config ?? {}) } };
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
    const config = { ...this.defaultConfig(), ...(params.config && typeof params.config === 'object' ? params.config : {}) };
    if (!this.config.repositories.some(repo => repo.id === config.repository) || !this.config.crews.some(crew => crew.id === config.crew)) throw new RpcError(codes.invalidParams, 'Choose a configured repository and crew');
    const activeClient = params.activeClient as Json | undefined;
    if (activeClient !== undefined && (!activeClient || typeof activeClient !== 'object' || activeClient.clientId !== client.clientId)) throw new RpcError(codes.invalidParams, 'activeClient.clientId must be the clientId this client initialized with');
    const pending: PendingSession = { id: parsed.id, uri: channel, config, user: client.user, createdAt: new Date().toISOString() };
    this.pending.set(parsed.id, pending);
    if (activeClient) this.activeClients.set(parsed.id, new Map([[client.clientId!, activeClient]]));
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
      this.notify(rootChannel, 'root/sessionRemoved', viewer => ({ channel: rootChannel, session: sessionChannel(pending.id, viewer.scheme) }), pending.user.id);
      return {};
    }
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    if (['running', 'waiting_input', 'queued', 'paused', 'interrupted'].includes(session.status)) void this.engine.cancel(session.id, client.user).catch(() => {});
    const publicId = this.publicId(session.id);
    for (const item of this.clients) for (const subscription of [...item.subscriptions]) if (sessionIdFrom(subscription) === publicId) item.subscriptions.delete(subscription);
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
    this.echo(client, channel, action, origin);
    return undefined;
  }

  private dropActiveClient(client: Client): void {
    const clientId = client.clientId;
    if (!clientId || [...this.clients].some(other => other.clientId === clientId)) return;
    for (const [publicId, clients] of [...this.activeClients]) {
      if (!clients.delete(clientId)) continue;
      if (!clients.size) this.activeClients.delete(publicId);
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
        if (ended) return 'The session has ended; start a new session';
        const projection = this.projection(session);
        const turnId = this.acceptableTurnId(projection, action.turnId) ?? randomUUID();
        projection.origins.set(`turn:${turnId}`, origin);
        try { await this.engine.message(session.id, text, client.user, turnId); }
        catch (error) { projection.origins.delete(`turn:${turnId}`); throw error; }
        if (session.status === 'queued') await this.engine.start(session.id, client.user);
        else if (['paused', 'interrupted'].includes(session.status)) await this.engine.resume(session.id, client.user);
        return undefined;
      }
      case 'chat/turnCancelled': {
        if (notOnChat) return notOnChat;
        const projection = this.projection(session);
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
        if (ended) return 'The session has ended; start a new session';
        await this.engine.message(session.id, text, client.user);
        this.echo(client, channel, action, origin);
        this.broadcast(channel, { type: 'chat/pendingMessageRemoved', kind: action.kind, id: action.id });
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
