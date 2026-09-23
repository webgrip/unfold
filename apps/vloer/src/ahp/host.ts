import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Store } from '../store.ts';
import type { Engine } from '../engine.ts';
import { placements } from '../config.ts';
import type { AppConfig, Event, PermissionRequest, Session, User, WorkspaceBackend } from '../types.ts';
import { WebSocketConnection, connectionToken, isWebSocketUpgrade, rejectUpgrade, upgradeToWebSocket } from './websocket.ts';

export const protocolVersion = '0.9.0';
export const provider = 'de-vloer';
const rootChannel = 'ahp-root://';
const pollMs = 300;
const maxTurnsInSnapshot = 200;

type Json = Record<string, any>;
type Client = { id: string; clientId?: string; connection: WebSocketConnection; user: User; token: string; checkedAt: number; subscriptions: Set<string>; initialized: boolean };
type TokenRecord = { userId: string; name: string; role: User['role']; label: string; createdAt: string; expiresAt?: string; signIn?: string };
type Projection = { turns: Json[]; activeTurn?: Json; parts: Map<string, string>; toolCalls: Map<string, { turnId: string; toolCallId: string }>; openTools: Map<string, string>; cursor: number; turnCounter: number; permissionTurn?: string };
type PendingSession = { uri: string; config: Json; user: User; chat?: string };

export const sessionChannel = (id: string) => `ahp-session:/${id}`;
export const chatChannel = (id: string) => `ahp-chat:/${id}`;
export const changesetChannel = (id: string) => `ahp-changeset:/${id}`;
const sessionIdFrom = (uri: string) => /^ahp-(?:session|chat|changeset):\/([A-Za-z0-9_-]{1,80})(?:\/.*)?$/.exec(uri)?.[1];

const codes = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, sessionNotFound: -32001, providerNotFound: -32002, sessionExists: -32003, turnInProgress: -32004, unsupportedVersion: -32005, authRequired: -32007, notFound: -32008, permissionDenied: -32009, conflict: -32011 };

class RpcError extends Error { code: number; data?: unknown; constructor(code: number, message: string, data?: unknown) { super(message); this.code = code; this.data = data; } }

const statusBits = { idle: 1, error: 2, inProgress: 8, inputNeeded: 24 };
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

export function diffEntries(content: string): Json[] {
  try { const parsed = JSON.parse(content); if (Array.isArray(parsed)) return parsed.filter(entry => entry && typeof entry.file === 'string'); } catch {}
  const entries: Json[] = [];
  for (const section of content.split(/^(?=diff --git )/m)) {
    const header = /^diff --git a\/(\S+) b\/(\S+)/.exec(section);
    if (!header) continue;
    entries.push({ file: header[2], after: section, additions: (section.match(/^\+(?!\+\+)/gm) ?? []).length, deletions: (section.match(/^-(?!--)/gm) ?? []).length });
  }
  return entries;
}

export class AgentHost {
  readonly config: AppConfig;
  readonly store: Store;
  readonly engine: Engine;
  readonly clients = new Set<Client>();
  serverSeq = 0;
  private readonly projections = new Map<string, Projection>();
  private readonly pending = new Map<string, PendingSession>();
  private readonly summaries = new Map<string, string>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(config: AppConfig, store: Store, engine: Engine) {
    this.config = config; this.store = store; this.engine = engine;
  }

  /** Connection tokens expire after `auth.sessionHours` without use, and end with the sign-in that issued them. */
  issueToken(user: User, label = 'agent host', signIn?: string): string {
    const token = connectionToken();
    const key = digest(token);
    const bound = signIn && this.store.getLogin(signIn) ? signIn : undefined;
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
    if (!record.expiresAt || !(Date.parse(record.expiresAt) > now) || (record.signIn && !this.store.getLogin(record.signIn))) { this.revoke(key); return undefined; }
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
    const client: Client = { id: randomUUID(), connection, user: authenticated.user, token: authenticated.key, checkedAt: Date.now(), subscriptions: new Set(), initialized: false };
    this.clients.add(client);
    connection.on('message', text => void this.receive(client, text));
    connection.on('close', () => { this.clients.delete(client); if (!this.clients.size) this.stopPolling(); });
    connection.on('error', () => {});
    this.startPolling();
    return true;
  }

  close(): void { this.stopPolling(); for (const client of this.clients) client.connection.close(1001, 'Server shutting down'); this.clients.clear(); }

  private startPolling(): void { if (!this.timer) this.timer = setInterval(() => void this.poll(), pollMs); }
  private stopPolling(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  private send(client: Client, message: Json): void { client.connection.send(JSON.stringify(message)); }

  private notify(channelFilter: string, method: string, params: Json): void {
    for (const client of this.clients) if (client.initialized && client.subscriptions.has(channelFilter)) this.send(client, { jsonrpc: '2.0', method, params });
  }

  private broadcast(channel: string, action: Json, origin?: { clientId: string; clientSeq: number }, rejectionReason?: string): Json {
    const envelope = { channel, action, serverSeq: ++this.serverSeq, origin, ...(rejectionReason ? { rejectionReason } : {}) };
    for (const client of this.clients) if (client.initialized && client.subscriptions.has(channel)) this.send(client, { jsonrpc: '2.0', method: 'action', params: envelope });
    return envelope;
  }

  private visible(user: User): Session[] { return this.store.listSessions().filter(session => session.ownerId === user.id || user.role === 'admin'); }

  private sessionFor(user: User, uri: string): Session | undefined {
    const id = sessionIdFrom(uri);
    const session = id ? this.store.getSession(id) : undefined;
    if (!session || (session.ownerId !== user.id && user.role !== 'admin')) return undefined;
    return session;
  }

  rootState(): Json {
    return {
      agents: [{
        provider, displayName: 'De Vloer crews', description: 'Operator-led agent crews in isolated workspaces; every session ends in a reviewable candidate.',
        models: this.config.models.map(model => ({ id: model.id, provider, name: model.name })),
        capabilities: { multipleChats: {}, multipleWorkingDirectories: {} },
      }],
      activeSessions: this.store.listSessions().filter(session => ['running', 'waiting_input', 'exporting'].includes(session.status)).length,
    };
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

  summary(session: Session): Json {
    const repository = this.config.repositories.find(repo => repo.id === session.repositoryId);
    return {
      resource: sessionChannel(session.id), provider, title: session.title, status: sessionStatus(session), activity: activity(session),
      createdAt: session.createdAt, modifiedAt: session.updatedAt,
      ...(repository ? { project: { uri: repository.url, displayName: repository.name } } : {}),
      ...(session.workspace ? { workingDirectories: [`file://${session.workspace.directory}`] } : {}),
      ...(session.candidate?.status === 'ready' ? { changes: { files: session.candidate.fileCount } } : {}),
      _meta: { 'dev.webgrip.de-vloer': { status: session.status, placement: session.placement, budgetUsd: session.budgetUsd, spentUsd: session.spentUsd, costStatus: session.costStatus, candidate: session.candidate?.status } },
    };
  }

  private inputNeeded(session: Session): Json[] {
    return this.store.permissions(session.id).filter(request => !request.resolved).map(request => this.inputRequest(session, request));
  }

  private inputRequest(session: Session, request: PermissionRequest): Json {
    const projection = this.projection(session);
    const turnId = projection.activeTurn?.id ?? projection.turns.at(-1)?.id ?? `${session.id}-turn-1`;
    if (request.kind === 'question') return { id: request.id, chat: chatChannel(session.id), kind: 'chatInput', request: this.questionRequest(request) };
    return { id: request.id, chat: chatChannel(session.id), kind: 'toolConfirmation', turnId, toolCall: this.pendingToolCall(request) };
  }

  private questionRequest(request: PermissionRequest): Json {
    const questions = Array.isArray(request.questions) ? request.questions as Json[] : [];
    return { id: request.id, title: request.title, questions: questions.map((question, index) => ({ id: String(index), kind: 'text', title: String(question.question ?? question.header ?? request.title), ...(question.description ? { description: String(question.description) } : {}) })) };
  }

  private pendingToolCall(request: PermissionRequest): Json {
    return { toolCallId: request.id, toolName: 'permission', displayName: request.title, status: 'pending-confirmation', invocationMessage: request.detail || request.title, confirmationTitle: request.title, options: [{ id: 'once', label: 'Allow once', kind: 'approve' }, { id: 'always', label: 'Always allow', kind: 'approve' }, { id: 'reject', label: 'Reject', kind: 'deny' }] };
  }

  sessionState(session: Session): Json {
    const repository = this.config.repositories.find(repo => repo.id === session.repositoryId);
    return {
      ...this.summary(session), lifecycle: 'ready', activeClients: [],
      chats: [this.chatSummary(session)], defaultChat: chatChannel(session.id),
      config: { schema: this.configSchema(), values: { repository: session.repositoryId, crew: session.crewId, budgetUsd: session.budgetUsd, title: session.title, ...(session.placement ? { placement: session.placement } : {}) } },
      ...(session.candidate?.status === 'ready' || session.artifacts.some(artifact => artifact.kind === 'diff') ? { changesets: [{ label: 'Candidate', uriTemplate: changesetChannel(session.id), description: repository ? `Changes against ${repository.baseBranch} of ${repository.name}` : 'Reviewable change', changeKind: 'candidate', capabilities: { review: {} } }] } : {}),
      inputNeeded: this.inputNeeded(session),
    };
  }

  chatSummary(session: Session): Json {
    return { resource: chatChannel(session.id), title: session.title, status: sessionStatus(session), activity: activity(session), modifiedAt: session.updatedAt, origin: { kind: 'user' }, interactivity: ['completed', 'cancelled', 'failed'].includes(session.status) ? 'read-only' : 'full', ...(session.workspace ? { workingDirectories: [`file://${session.workspace.directory}`] } : {}) };
  }

  chatState(session: Session): Json {
    const projection = this.projection(session);
    return { ...this.chatSummary(session), turns: projection.turns.slice(-maxTurnsInSnapshot), ...(projection.activeTurn ? { activeTurn: projection.activeTurn } : {}) };
  }

  changesetState(session: Session): Json {
    const files: Json[] = [];
    session.artifacts.filter(artifact => artifact.kind === 'diff').forEach((artifact, artifactIndex) => {
      const entries = diffEntries(artifact.content);
      entries.forEach((entry, index) => {
        if (typeof entry?.file !== 'string') return;
        const base = `vloer-diff://${session.id}/${artifactIndex}/${index}`;
        files.push({ id: `${artifactIndex}-${index}`, edit: {
          ...(typeof entry.before === 'string' ? { before: { uri: `file:///workspace/repository/${entry.file}`, content: { uri: `${base}/before`, contentType: 'text/plain', sizeHint: entry.before.length } } } : {}),
          ...(typeof entry.after === 'string' ? { after: { uri: `file:///workspace/repository/${entry.file}`, content: { uri: `${base}/after`, contentType: 'text/plain', sizeHint: entry.after.length } } } : {}),
          diff: { added: Number(entry.additions) || 0, removed: Number(entry.deletions) || 0 },
        } });
      });
    });
    return { status: session.status === 'exporting' ? 'computing' : 'ready', files, operations: session.candidate?.status === 'ready' ? [{ id: 'download-bundle', label: 'Download candidate bundle', description: 'The immutable Git bundle and patch are available from the workbench.', scopes: ['changeset'], status: 'disabled' }] : [] };
  }

  readResource(user: User, uri: string): { data: string; contentType: string } {
    const match = /^vloer-diff:\/\/([A-Za-z0-9_-]+)\/(\d+)\/(\d+)\/(before|after)$/.exec(uri);
    if (!match) throw new RpcError(codes.notFound, 'Resource not found');
    const session = this.sessionFor(user, sessionChannel(match[1]));
    if (!session) throw new RpcError(codes.notFound, 'Resource not found');
    const artifact = session.artifacts.filter(item => item.kind === 'diff')[Number(match[2])];
    const value = diffEntries(artifact?.content ?? '')[Number(match[3])]?.[match[4]];
    if (typeof value !== 'string') throw new RpcError(codes.notFound, 'Resource not found');
    return { data: value, contentType: 'text/plain' };
  }

  private projection(session: Session): Projection {
    let projection = this.projections.get(session.id);
    if (!projection) {
      projection = { turns: [], parts: new Map(), toolCalls: new Map(), openTools: new Map(), cursor: 0, turnCounter: 0 };
      this.projections.set(session.id, projection);
      this.openTurn(projection, session, session.objective, session.createdAt);
      for (const event of this.store.events(session.id)) this.reduce(projection, session, event);
      this.settle(projection, session);
    }
    return projection;
  }

  private openTurn(projection: Projection, session: Session, text: string, startedAt: string): Json[] {
    if (projection.activeTurn) this.closeTurn(projection, 'complete', startedAt);
    const turnId = `${session.id}-turn-${++projection.turnCounter}`;
    const message = { text, origin: { kind: 'user' }, ...(session.runs[0] ? { model: { id: this.config.models[0]?.id ?? 'coding' } } : {}) };
    projection.activeTurn = { id: turnId, startedAt, message, responseParts: [], usage: undefined };
    return [{ type: 'chat/turnStarted', turnId, startedAt, message }];
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

  private addPart(projection: Projection, part: Json): Json[] {
    const active = projection.activeTurn;
    if (!active) return [];
    active.responseParts.push(part);
    return [{ type: 'chat/responsePart', turnId: active.id, part }];
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
          actions.push(...this.closeTurn(projection, 'complete', event.at));
          actions.push(...this.openTurn(projection, session, data.text, event.at));
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
        const turn = ensureTurn();
        const requestId = String(data.requestId ?? data.nativeId ?? randomUUID());
        if (data.kind === 'question') {
          const request = this.questionRequest({ id: requestId, sessionId: session.id, runId: event.runId ?? '', nativeId: String(data.nativeId ?? ''), kind: 'question', title: String(data.title ?? 'Question'), detail: String(data.detail ?? ''), questions: Array.isArray(data.questions) ? data.questions : [] });
          turn.responseParts.push({ kind: 'inputRequest', request });
          actions.push({ type: 'chat/inputRequested', request });
          break;
        }
        const toolCall = this.pendingToolCall({ id: requestId, sessionId: session.id, runId: event.runId ?? '', nativeId: String(data.nativeId ?? ''), kind: 'permission', title: String(data.title ?? 'Permission'), detail: String(data.detail ?? '') });
        turn.responseParts.push({ kind: 'toolCall', toolCall });
        projection.toolCalls.set(requestId, { turnId: turn.id, toolCallId: requestId });
        actions.push({ type: 'chat/toolCallStart', turnId: turn.id, toolCallId: requestId, toolName: 'permission', displayName: toolCall.displayName });
        actions.push({ type: 'chat/toolCallReady', turnId: turn.id, toolCallId: requestId, invocationMessage: toolCall.invocationMessage, confirmationTitle: toolCall.confirmationTitle, options: toolCall.options });
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
          actions.push({ type: 'chat/toolCallConfirmed', turnId: turn.id, toolCallId: requestId, ...(approved ? { approved: true, confirmed: 'user-action', selectedOptionId: decision } : { approved: false, reason: 'denied', selectedOptionId: 'reject' }) });
          if (approved) actions.push({ type: 'chat/toolCallComplete', turnId: turn.id, toolCallId: requestId, result: { success: true, pastTenseMessage: 'Allowed by the operator' } });
        }
        const input = turn.responseParts.find((item: Json) => item.kind === 'inputRequest' && item.request.id === requestId);
        if (input) { input.response = 'accept'; actions.push({ type: 'chat/inputCompleted', requestId, response: 'accept' }); }
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
        if (projection.activeTurn) { actions.push(...this.addPart(projection, { kind: 'systemNotification', content: String(data.message ?? 'Execution paused.') })); actions.push(...this.closeTurn(projection, 'complete', event.at)); }
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
      for (const client of this.clients) for (const channel of client.subscriptions) { const id = sessionIdFrom(channel); if (id && !watched.has(id)) { const session = this.store.getSession(id); if (session) watched.set(id, session); } }
      for (const [id, session] of watched) {
        const projection = this.projection(session);
        for (const event of this.store.events(id, projection.cursor)) for (const action of this.reduce(projection, session, event)) this.broadcast(chatChannel(id), action);
        for (const action of this.settle(projection, session)) this.broadcast(chatChannel(id), action);
        const summary = this.summary(session);
        const fingerprint = JSON.stringify([summary.status, summary.activity, summary.title, session.candidate?.status, this.inputNeeded(session).map(item => item.id), session.artifacts.length]);
        if (this.summaries.get(id) !== fingerprint) {
          const previous = this.summaries.get(id);
          this.summaries.set(id, fingerprint);
          if (previous !== undefined) {
            this.broadcast(sessionChannel(id), { type: 'session/activityChanged', activity: summary.activity });
            this.broadcast(sessionChannel(id), { type: 'session/chatUpdated', chat: chatChannel(id), changes: { status: summary.status, activity: summary.activity, modifiedAt: summary.modifiedAt } });
            const state = this.sessionState(session);
            this.broadcast(sessionChannel(id), { type: 'session/changesetsChanged', changesets: state.changesets });
            for (const request of state.inputNeeded) this.broadcast(sessionChannel(id), { type: 'session/inputNeededSet', request });
            for (const request of this.store.permissions(id).filter(item => item.resolved)) this.broadcast(sessionChannel(id), { type: 'session/inputNeededRemoved', id: request.id });
            this.notify(rootChannel, 'root/sessionSummaryChanged', { channel: rootChannel, session: sessionChannel(id), changes: { status: summary.status, activity: summary.activity, modifiedAt: summary.modifiedAt, changes: summary.changes } });
            if (session.artifacts.some(artifact => artifact.kind === 'diff')) { const changeset = this.changesetState(session); this.broadcast(changesetChannel(id), { type: 'changeset/contentChanged', files: changeset.files, operations: changeset.operations }); }
          }
        }
      }
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
    }
  }

  private snapshot(client: Client, channel: string): Json {
    if (channel === rootChannel) return { resource: rootChannel, state: this.rootState(), fromSeq: this.serverSeq };
    const pending = this.pending.get(channel);
    if (pending) return { resource: channel, state: { provider, title: pending.config.title ?? 'New session', status: statusBits.idle, lifecycle: 'ready', activeClients: [], chats: pending.chat ? [{ resource: pending.chat, title: pending.config.title ?? 'New session', status: statusBits.idle, modifiedAt: new Date().toISOString(), origin: { kind: 'user' }, interactivity: 'full' }] : [], ...(pending.chat ? { defaultChat: pending.chat } : {}), config: { schema: this.configSchema(), values: pending.config }, inputNeeded: [] }, fromSeq: this.serverSeq };
    for (const [, item] of this.pending) if (item.chat === channel) return { resource: channel, state: { resource: channel, title: item.config.title ?? 'New session', status: statusBits.idle, modifiedAt: new Date().toISOString(), origin: { kind: 'user' }, interactivity: 'full', turns: [] }, fromSeq: this.serverSeq };
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    if (channel.startsWith('ahp-session:')) return { resource: channel, state: this.sessionState(session), fromSeq: this.serverSeq };
    if (channel.startsWith('ahp-chat:')) return { resource: channel, state: this.chatState(session), fromSeq: this.serverSeq };
    if (channel.startsWith('ahp-changeset:')) return { resource: channel, state: this.changesetState(session), fromSeq: this.serverSeq };
    throw new RpcError(codes.notFound, 'Unknown channel');
  }

  private subscribe(client: Client, channel: string): Json {
    const snapshot = this.snapshot(client, channel);
    client.subscriptions.add(channel);
    const id = sessionIdFrom(channel);
    if (id && !this.summaries.has(id)) { const session = this.store.getSession(id); if (session) this.summaries.set(id, JSON.stringify([this.summary(session).status, this.summary(session).activity, session.title, session.candidate?.status, this.inputNeeded(session).map(item => item.id), session.artifacts.length])); }
    return snapshot;
  }

  private async request(client: Client, method: string, params: Json): Promise<Json> {
    if (method === 'ping') return {};
    if (method === 'initialize') {
      const versions: string[] = Array.isArray(params.protocolVersions) ? params.protocolVersions : [];
      if (!versions.some(version => /^0\.9\.\d+$/.test(version))) throw new RpcError(codes.unsupportedVersion, 'Unsupported protocol version', { supportedVersions: ['^0.9.0'] });
      if (typeof params.clientId !== 'string') throw new RpcError(codes.invalidParams, 'clientId is required');
      client.clientId = params.clientId; client.initialized = true;
      const snapshots = (Array.isArray(params.initialSubscriptions) ? params.initialSubscriptions : [rootChannel]).map((channel: string) => this.subscribe(client, channel));
      return { protocolVersion, serverSeq: this.serverSeq, serverInfo: { name: 'de-vloer', version: this.config.mode === 'demo' ? 'demo' : 'live' }, snapshots, terminalCommandPrefix: undefined };
    }
    if (!client.initialized) throw new RpcError(codes.invalidRequest, 'initialize first');
    switch (method) {
      case 'reconnect': { const snapshots = (Array.isArray(params.subscriptions) ? params.subscriptions : []).map((channel: string) => this.subscribe(client, channel)); return { type: 'snapshot', snapshots }; }
      case 'subscribe': { if (typeof params.channel !== 'string') throw new RpcError(codes.invalidParams, 'channel is required'); return { snapshot: this.subscribe(client, params.channel) }; }
      case 'listSessions': return { items: this.visible(client.user).map(session => this.summary(session)) };
      case 'resolveSessionConfig': return { schema: this.configSchema(), values: { ...this.defaultConfig(), ...(params.config ?? {}) } };
      case 'sessionConfigCompletions': { const schema = this.configSchema().properties[String(params.property)]; const values: string[] = schema?.enum ?? []; return { items: values.map((value, index) => ({ value, label: schema.enumDescriptions?.[index] ?? value })) }; }
      case 'createSession': return this.createSession(client, params);
      case 'createChat': return this.createChat(client, params);
      case 'disposeSession': return this.disposeSession(client, params);
      case 'disposeChat': return {};
      case 'fetchTurns': return {};
      case 'completions': return { items: [] };
      case 'resourceRead': { if (typeof params.uri !== 'string') throw new RpcError(codes.invalidParams, 'uri is required'); const resource = this.readResource(client.user, params.uri); return params.encoding === 'base64' ? { data: Buffer.from(resource.data).toString('base64'), encoding: 'base64', contentType: resource.contentType } : { data: resource.data, encoding: 'utf-8', contentType: resource.contentType }; }
      case 'invokeChangesetOperation': throw new RpcError(codes.permissionDenied, 'Candidate operations are performed in the workbench, not through the agent host');
      case 'authenticate': return {};
      default: throw new RpcError(codes.methodNotFound, `Method not found: ${method}`);
    }
  }

  private createSession(client: Client, params: Json): Json {
    const channel = String(params.channel ?? '');
    if (!/^ahp-session:\/[A-Za-z0-9_-]{1,80}$/.test(channel)) throw new RpcError(codes.invalidParams, 'channel must be ahp-session:/<id>');
    if (params.provider && params.provider !== provider) throw new RpcError(codes.providerNotFound, 'Unknown provider');
    if (this.pending.has(channel) || this.store.getSession(sessionIdFrom(channel)!)) throw new RpcError(codes.sessionExists, 'Session already exists');
    const config = { ...this.defaultConfig(), ...(params.config && typeof params.config === 'object' ? params.config : {}) };
    if (!this.config.repositories.some(repo => repo.id === config.repository) || !this.config.crews.some(crew => crew.id === config.crew)) throw new RpcError(codes.invalidParams, 'Choose a configured repository and crew');
    const pending: PendingSession = { uri: channel, config, user: client.user };
    this.pending.set(channel, pending);
    client.subscriptions.add(channel);
    queueMicrotask(() => { this.broadcast(channel, { type: 'session/ready' }); this.notify(rootChannel, 'root/sessionAdded', { channel: rootChannel, summary: { resource: channel, provider, title: config.title ?? 'New session', status: statusBits.idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() } }); });
    return {};
  }

  private createChat(client: Client, params: Json): Json {
    const channel = String(params.channel ?? '');
    const chat = String(params.chat ?? '');
    const pending = this.pending.get(channel);
    if (pending) {
      if (pending.user.id !== client.user.id && client.user.role !== 'admin') throw new RpcError(codes.permissionDenied, 'Not your session');
      if (!/^ahp-chat:\/[A-Za-z0-9_-]{1,80}$/.test(chat)) throw new RpcError(codes.invalidParams, 'chat must be ahp-chat:/<id>');
      pending.chat = chat;
      client.subscriptions.add(chat);
      queueMicrotask(() => { this.broadcast(channel, { type: 'session/chatAdded', summary: { resource: chat, title: pending.config.title ?? 'New session', status: statusBits.idle, modifiedAt: new Date().toISOString(), origin: { kind: 'user' }, interactivity: 'full' } }); this.broadcast(channel, { type: 'session/defaultChatChanged', defaultChat: chat }); });
      if (params.initialMessage?.text) queueMicrotask(() => void this.startFromPending(client, pending, params.initialMessage, { clientId: client.clientId!, clientSeq: 0 }));
      return {};
    }
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    throw new RpcError(codes.conflict, 'A De Vloer session has exactly one chat; subscribe to its default chat');
  }

  private disposeSession(client: Client, params: Json): Json {
    const channel = String(params.channel ?? '');
    if (this.pending.delete(channel)) { this.notify(rootChannel, 'root/sessionRemoved', { channel: rootChannel, session: channel }); return {}; }
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    if (['running', 'waiting_input', 'queued', 'paused', 'interrupted'].includes(session.status)) void this.engine.cancel(session.id, client.user).catch(() => {});
    for (const item of this.clients) for (const subscription of [...item.subscriptions]) if (sessionIdFrom(subscription) === session.id) item.subscriptions.delete(subscription);
    this.notify(rootChannel, 'root/sessionRemoved', { channel: rootChannel, session: channel });
    return {};
  }

  private async startFromPending(client: Client, pending: PendingSession, message: Json, origin: { clientId: string; clientSeq: number }): Promise<void> {
    const text = String(message.text ?? '').trim();
    const chat = pending.chat!;
    try {
      const session = this.engine.create({ title: String(pending.config.title ?? text.split('\n')[0]).slice(0, 160) || 'Agent host session', objective: text, repositoryId: String(pending.config.repository), crewId: String(pending.config.crew), runtime: this.config.mode === 'demo' ? 'demo' : this.config.runtime.kind, placement: pending.config.placement as WorkspaceBackend | undefined, budgetUsd: Number(pending.config.budgetUsd) }, pending.user);
      this.pending.delete(pending.uri);
      const sessionUri = sessionChannel(session.id);
      const chatUri = chatChannel(session.id);
      for (const item of this.clients) {
        if (item.subscriptions.delete(pending.uri)) item.subscriptions.add(sessionUri);
        if (item.subscriptions.delete(chat)) item.subscriptions.add(chatUri);
      }
      this.notify(rootChannel, 'root/sessionRemoved', { channel: rootChannel, session: pending.uri });
      this.notify(rootChannel, 'root/sessionAdded', { channel: rootChannel, summary: this.summary(session) });
      this.broadcast(sessionUri, { type: 'session/chatAdded', summary: this.chatSummary(session) }, origin);
      this.broadcast(sessionUri, { type: 'session/defaultChatChanged', defaultChat: chatUri });
      const projection = this.projection(session);
      const turn = projection.activeTurn ?? projection.turns.at(-1);
      if (turn) this.broadcast(chatUri, { type: 'chat/turnStarted', turnId: turn.id, startedAt: turn.startedAt, message: turn.message }, origin);
      await this.engine.start(session.id, pending.user);
    } catch (error) {
      this.broadcast(pending.uri, { type: 'session/creationFailed', error: { errorType: (error as Json)?.code ?? 'create_failed', message: (error as Error)?.message ?? 'Could not create the session' } });
    }
  }

  private async notification(client: Client, method: string, params: Json): Promise<void> {
    if (method === 'unsubscribe') { if (typeof params.channel === 'string') client.subscriptions.delete(params.channel); return; }
    if (method !== 'dispatchAction') return;
    const channel = String(params.channel ?? '');
    const action = (params.action ?? {}) as Json;
    const origin = { clientId: client.clientId ?? client.id, clientSeq: Number(params.clientSeq) || 0 };
    const reject = (reason: string) => this.broadcast(channel, action, origin, reason);
    try {
      const pending = [...this.pending.values()].find(item => item.chat === channel);
      if (pending && action.type === 'chat/turnStarted') { await this.startFromPending(client, pending, action.message ?? {}, origin); return; }
      const session = this.sessionFor(client.user, channel);
      if (!session) { reject('Session not found'); return; }
      switch (action.type) {
        case 'chat/turnStarted': {
          const text = String(action.message?.text ?? '').trim();
          if (!text) { reject('Empty message'); return; }
          if (['completed', 'cancelled', 'failed'].includes(session.status)) { reject('The session has ended; start a new session'); return; }
          await this.engine.message(session.id, text, client.user);
          if (session.status === 'queued') await this.engine.start(session.id, client.user);
          else if (['paused', 'interrupted'].includes(session.status)) await this.engine.resume(session.id, client.user);
          return;
        }
        case 'chat/turnCancelled': { await this.engine.pause(session.id, client.user); return; }
        case 'chat/toolCallConfirmed': {
          const request = this.store.getPermission(String(action.toolCallId ?? ''));
          if (!request || request.sessionId !== session.id) { reject('Unknown permission request'); return; }
          const decision = action.approved === false ? 'reject' : ['once', 'always'].includes(String(action.selectedOptionId)) ? String(action.selectedOptionId) as 'once' | 'always' : 'once';
          await this.engine.respond(session.id, request.id, { decision }, client.user);
          return;
        }
        case 'chat/inputCompleted': {
          const request = this.store.getPermission(String(action.requestId ?? ''));
          if (!request || request.sessionId !== session.id) { reject('Unknown question'); return; }
          if (action.response !== 'accept') { await this.engine.respond(session.id, request.id, { decision: 'reject' }, client.user); return; }
          const answers = Object.values((action.answers ?? {}) as Record<string, Json>).map(answer => [String(answer?.value?.value ?? answer?.value?.text ?? '')]);
          await this.engine.respond(session.id, request.id, { answers: answers.length ? answers : [['']] }, client.user);
          return;
        }
        case 'chat/draftChanged': case 'chat/inputAnswerChanged': case 'session/isReadChanged': { this.broadcast(channel, action, origin); return; }
        case 'changeset/filesReviewChanged': { this.broadcast(channel, action, origin); return; }
        default: reject(`Unsupported action ${String(action.type)}`);
      }
    } catch (error) {
      reject(error instanceof Error ? error.message : 'Action failed');
    }
  }
}
