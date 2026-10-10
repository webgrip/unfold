import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AgentHostView, Store } from '../store.ts';
import type { Engine } from '../engine.ts';
import { patchLineCounts, readCandidate, readCandidateBlob, type CandidateFile } from '../candidates.ts';
import type { AppConfig, Event, PermissionRequest, Repository, Session, User, WorkspaceBackend } from '../types.ts';
import type { Recovery } from '../engine.ts';
import { SessionConfigError, acceptSessionConfig, approvalOf, changePendingConfig, composerModel, resolveSessionConfig, sessionConfigCompletions, sessionConfigSchema, sessionConfigState, startedConfigChange } from './session-config.ts';
import { TrackerAutomations, automationsChannel, autonomousAutomationsMeta } from './automations.ts';
import { WebSocketConnection, connectionToken, isWebSocketUpgrade, rejectUpgrade, upgradeToWebSocket } from './websocket.ts';
import { IdleSessions, RememberedClients, ServerSequence, restoreActiveClients, saveActiveClients } from './continuity.ts';
import { AnnouncedCustomizations, customizationRefusal, gatewayToolCall, rootConfigRefusal, sessionCustomizations, type GatewaySubject } from './customizations.ts';
import { outcomeMarkdown, sessionProgress, stopReason } from '../../public/core/progress.js';
import { money } from '../../public/core/format.js';
import { CandidateReview, parseAnnotationsChannel, reviewOperationIds, reviewOperations } from './review.ts';
import { Declines, declineEvents, declinedAnswers, stoppingRefusal, yesNoOptions } from './questions.ts';
import { SpendNotices, observeSpend, runEndSpend } from './spend.ts';
import { resumable, resumeRefusal, runAgainReply, turnResumedEvent } from './try-again.ts';
import { knownSecrets, plainRedactedText, withoutKnownSecrets } from '../redaction.ts';
import { CommandLog, noClientTerminals, parseTerminalChannel, readOnlyTerminal, terminalActionChannel } from './terminals.ts';
import { catalogOf, isActionKnownToVersion, negotiateProtocolVersion, oldestBaseline, sessionChatCatalog, speaksCatalog, supportedVersions } from './versions.ts';
import { ChatAsks, askMarkdown, commandCompletions, messageIntent, type ChatAskEntry, type ChatAskService } from './asks.ts';
import { candidateEdits, carryRuns, parseRunChannel, runChatChannel, runChatState, runChats, runFinished, runMessage, runRoute, runStarted, runTool, runTranscripts, stopRuns, toolActions, type RunTranscripts, type Spelling } from './runs.ts';
import { WorkItemSessions, isWorkItemSession, workItemChatState, workItemIdOf, workItemRefusal, workItemRefusals, workItemRunChatState, workItemSessionState, workItemStatus, workItemSummary, type RoutedAction, type WorkItemRecord } from './work-items.ts';
import { WorkItemCommands, promptClosedActions, promptInputNeeded, promptOpenActions, restartable, withPrompts, workItemCommandText, type WorkItemPrompt } from './work-item-commands.ts';

export { MalformedVersion, negotiateProtocolVersion, protocolBaselines, protocolVersion, supportedVersions } from './versions.ts';
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
type Client = { id: string; clientId?: string; scheme: SessionScheme; protocolVersion: string; connection: WebSocketConnection; user: User; token: string; checkedAt: number; connectedAt: string; clientInfo?: { name?: string; version?: string }; subscriptions: Set<string>; initialized: boolean; activeSessions?: number };
/** One initialized connection as its owner sees it in `GET /api/agent-host`. */
export type AttachedClient = { name?: string; version?: string; protocolVersion: string; connectedAt: string; tokenId: string };
type View = Pick<Client, 'user' | 'scheme' | 'protocolVersion'>;
type Origin = { clientId: string; clientSeq: number };
type ChannelKind = 'session' | 'chat' | 'changeset';
type TokenRecord = { userId: string; name: string; role: User['role']; label: string; createdAt: string; expiresAt?: string; signIn?: string };
type Projection = { finalStop?: number; turns: Json[]; activeTurn?: Json; parts: Map<string, string>; toolCalls: Map<string, { turnId: string; toolCallId: string }>; openTools: Map<string, string>; cursor: number; turnCounter: number; permissionTurn?: string; origins: Map<string, Origin>; answers: Map<string, Json>; choices: Map<string, Json>; holding?: string; startedRuns: Set<string>; finishedRuns: Set<string>; workingRun?: string; queuedInstructions: number; terminals: CommandLog; runs: RunTranscripts };
type PendingSession = { id: string; uri: string; config: Json; user: User; createdAt: string; starting?: boolean };
type CandidateView = { files: CandidateFile[]; counts: Map<string, { added: number; removed: number }> };

/** A session's channel in a client's spelling. VS Code 1.141 names it by the provider; VS Code 1.142 by `ahp-session`. */
export const sessionChannel = (id: string, scheme: SessionScheme = provider) => `${scheme}:/${id}`;
/** A session's default chat, in the shape VS Code derives from the session URI in the same spelling. */
export const chatChannel = (id: string, scheme: SessionScheme = provider) => `ahp-chat://default/${Buffer.from(sessionChannel(id, scheme)).toString('base64url')}`;
export const changesetChannel = (id: string) => `ahp-changeset:/${id}`;

/** Parses a session, chat or changeset channel in its current or earlier spelling into its kind and public session id. */
export function parseChannel(uri: string): { kind: ChannelKind; id: string; run?: string } | undefined {
  const run = parseRunChannel(uri);
  if (run) return { kind: 'chat', ...run };
  const plain = /^(unfold|ahp-session|ahp-chat|ahp-changeset):\/([A-Za-z0-9_-]{1,80})$/.exec(uri);
  if (plain) return { kind: plain[1] === 'ahp-chat' ? 'chat' : plain[1] === 'ahp-changeset' ? 'changeset' : 'session', id: plain[2] };
  const chat = /^ahp-chat:\/\/default\/([A-Za-z0-9_-]{1,400})$/.exec(uri);
  if (!chat) return undefined;
  const owner = parseChannel(Buffer.from(chat[1], 'base64url').toString('utf8'));
  return owner?.kind === 'session' ? { kind: 'chat', id: owner.id } : undefined;
}
const sessionIdFrom = (uri: string) => parseChannel(uri)?.id;
const subscribedSessionId = (uri: string) => sessionIdFrom(uri) ?? parseTerminalChannel(uri)?.sessionId;
const clientTurnId = /^[A-Za-z0-9_.:-]{1,128}$/;
const actionOrigins = new WeakMap<Json, Origin>();
const channelKey = (uri: string) => { const parsed = parseChannel(uri); const annotations = parsed ? undefined : parseAnnotationsChannel(uri); return parsed ? `${parsed.kind}:${parsed.id}${parsed.run ? `:${parsed.run}` : ''}` : annotations ? `annotations:${annotations.id}` : uri; };

const codes = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, sessionNotFound: -32001, providerNotFound: -32002, sessionExists: -32003, turnInProgress: -32004, unsupportedVersion: -32005, authRequired: -32007, notFound: -32008, permissionDenied: -32009, conflict: -32011 };

class RpcError extends Error { code: number; data?: unknown; constructor(code: number, message: string, data?: unknown) { super(message); this.code = code; this.data = data; } }

const engineCodes: Record<number, number> = { 400: codes.invalidParams, 403: codes.permissionDenied, 404: codes.sessionNotFound, 409: codes.conflict };
function asRpcError(error: unknown): RpcError {
  if (error instanceof RpcError) return error;
  const status = Number((error as { status?: unknown })?.status);
  return new RpcError(engineCodes[status] ?? codes.internal, error instanceof Error && Number.isFinite(status) ? error.message : 'Internal error');
}

/** The events by which the host records a choice it offered in a chat, the person's answer and what came of it. */
export const choiceEvents = { offered: 'choice.offered', answered: 'choice.answered', reported: 'choice.reported' } as const;
/** The options a host choice can offer. Each maps to one call of the recovery API, under the same owner checks. */
export type ChoiceOptionId = 'run_again_start' | 'run_again' | 'deliver' | 'resume' | 'ask' | 'steer' | 'dismiss';
type ChoiceOption = { id: ChoiceOptionId; label: string };
const dismissReply = 'Nothing changed. This session stays as it is.';
const reasonOf = (error: unknown) => error instanceof Error && error.message ? error.message : 'the Ask service did not answer.';
const clockUtc = (at: string) => { const moment = new Date(at); return Number.isFinite(moment.getTime()) ? `${moment.toISOString().slice(11, 16)} UTC` : 'an unknown time'; };

/** A host choice as an AHP input request: one single-select question whose options VS Code 1.141 shows by label only, so each option's meaning is in the question's message. */
export function choiceRequest(offered: Json): Json {
  if (offered.input === 'text') return { id: String(offered.choiceId), message: String(offered.title), questions: [{ id: '0', title: String(offered.question ?? offered.title), message: String(offered.detail || offered.explanation || ''), kind: 'text', required: offered.optional !== true }] };
  const options = (Array.isArray(offered.options) ? offered.options : []) as ChoiceOption[];
  return { id: String(offered.choiceId), message: String(offered.title), questions: [{ id: '0', title: String(offered.question ?? offered.title), message: String(offered.detail ?? ''), kind: 'single-select', required: true, options: options.map(option => ({ id: option.id, label: option.label })), allowFreeformInput: false }] };
}

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
  const yesNo = yesNoOptions(question, choices);
  if (yesNo) return { ...base, kind: 'single-select', options: yesNo, allowFreeformInput: question.custom !== false };
  return { ...base, kind: question.multiple === true ? 'multi-select' : 'single-select', options: choices.map((choice, option) => ({ id: String(option), ...choice })), allowFreeformInput: question.custom !== false };
}
function answerValues(question: Json | undefined, answer: Json | undefined): string[] {
  if (!answer || answer.state === 'skipped') return [];
  const value = answer.value ?? {};
  const choices = choicesOf(question ?? {});
  const label = (id: unknown) => { const choice = typeof id === 'string' && /^\d{1,4}$/.test(id) ? choices[Number(id)] : undefined; if (!choice) throw new Error(`The answer names an option the question does not offer: ${JSON.stringify(id)}`); return choice.label; };
  const freeform = Array.isArray(value.freeformValues) ? value.freeformValues.map(String) : [];
  if (value.kind === 'boolean') throw new Error('A yes/no question is answered by choosing Yes or No');
  if (value.kind === 'selected') return [label(value.value), ...freeform];
  if (value.kind === 'selected-many') return [...(Array.isArray(value.value) ? value.value : []).map(label), ...freeform];
  return value.value === undefined ? [] : [String(value.value)];
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
  private readonly announcedCustomizations = new AnnouncedCustomizations();
  private readonly activeClients: Map<string, Map<string, Json>>;
  private readonly knownClients: RememberedClients<SessionScheme>;
  private readonly idleSessions = new IdleSessions();
  private readonly sweeper: ReturnType<typeof setInterval>;
  private readonly departing = new Map<string, ReturnType<typeof setTimeout>>();
  /** How long an active client whose last connection closed keeps its place, waiting for its reconnect: 30 seconds, as in VS Code's own host. */
  activeClientGraceMs = 30_000;
  private readonly candidates = new Map<string, CandidateView>();
  private readonly answering = new Set<string>();
  private readonly spend = new SpendNotices();
  private readonly declines = new Declines();
  private readonly offering = new Set<string>();
  private readonly offeredAfter = new Map<string, number>();
  private readonly loadingCandidates = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  private closed = false;

  private readonly review: CandidateReview;
  private readonly chatAsks: ChatAsks;
  /** Ploeg's tracker routes as a read-only automation catalogue. */
  readonly automations: TrackerAutomations;
  /** Ploeg's Work Items as read-only sessions. */
  readonly workItems: WorkItemSessions;
  /** The confirmed commands a person gives those Work Items. */
  readonly workItemCommands: WorkItemCommands;

  private readonly redact: (text: string) => string;

  constructor(config: AppConfig, store: Store, engine: Engine) {
    this.config = config; this.store = store; this.engine = engine;
    const secrets = knownSecrets(config);
    this.redact = text => plainRedactedText(withoutKnownSecrets(text, secrets));
    this.sequence = new ServerSequence(store);
    this.knownClients = new RememberedClients(store, maxKnownClients);
    this.activeClients = restoreActiveClients(store);
    for (const clientId of new Set([...this.activeClients.values()].flatMap(clients => [...clients.keys()]))) this.awaitReturn(clientId);
    this.sweeper = setInterval(() => this.evictIdleSessions(), Math.min(60_000, this.idleSessions.idleMs));
    this.sweeper.unref();
    this.chatAsks = new ChatAsks(store);
    this.review = new CandidateReview({
      config, store, engine, choiceEvents,
      serverSeq: () => this.serverSeq,
      sessionFor: (user, uri) => this.sessionFor(user, uri),
      engineId: id => this.engineId(id),
      publicId: id => this.publicId(id),
      gated: session => this.gated(session),
      mayView: (user, ownerId) => this.mayView(user, ownerId),
      echo: (sender, channel, action, origin, audience) => this.echo(sender as Client, channel, action, origin, audience),
      openChoice: session => this.openChoice(this.projection(session)),
      claimTurn: (session, turnId, origin) => { const projection = this.projection(session); const claimed = turnId === undefined ? undefined : this.acceptableTurnId(projection, turnId) ?? randomUUID(); if (claimed) projection.origins.set(`turn:${claimed}`, origin); return claimed; },
      claimAnswer: (session, key, origin) => { const projection = this.projection(session); projection.origins.set(key, origin); return () => projection.origins.delete(key); },
      announceSession: session => this.announceSession(session),
      sessionPage: session => this.sessionPage(session),
    });
    this.automations = new TrackerAutomations(config, {
      watchers: () => [...new Map([...this.clients].filter(client => client.initialized && client.subscriptions.has(automationsChannel)).map(client => [client.user.id, client.user])).values()],
      publish: (userId, action) => this.broadcast(automationsChannel, action, undefined, client => client.user.id === userId),
      workspaceFolder: repositoryId => { const name = repositoryWorkspaceNames(this.config.repositories).get(repositoryId); return name ? `${repositoriesDirectory}/${encodeURIComponent(name)}` : undefined; },
    });
    this.workItems = new WorkItemSessions(config, {
      viewers: () => [...new Map([...this.clients].filter(client => client.initialized).map(client => [client.user.id, client.user])).values()],
      listed: (user, change) => this.announceWorkItems(user, change),
      transcript: (entry, actions) => this.publishWorkItemTranscript(entry, actions),
    });
    this.workItemCommands = new WorkItemCommands(store, this.workItems.client, config.maxBudgetUsd);
  }

  /** Connects the Ask service, so a person can ask about a session's Work Item from its chat without reaching the crew (system ADR-0031). */
  useAsks(service: ChatAskService): void { this.chatAsks.service = service; }

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
    return ![...this.clients].some(client => [...client.subscriptions].some(channel => subscribedSessionId(channel) === publicId));
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
    const client: Client = { id: randomUUID(), scheme: provider, protocolVersion: oldestBaseline, connection, user: authenticated.user, token: authenticated.key, checkedAt: Date.now(), connectedAt: new Date().toISOString(), subscriptions: new Set(), initialized: false };
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
      .map(client => ({ ...client.clientInfo, protocolVersion: client.protocolVersion, connectedAt: client.connectedAt, tokenId: client.token }))
      .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
  }

  close(): void { this.closed = true; this.stopPolling(); clearInterval(this.sweeper); this.automations.close(); this.workItems.close(); for (const timer of this.departing.values()) clearTimeout(timer); this.departing.clear(); for (const client of this.clients) client.connection.close(1001, 'Server shutting down'); this.clients.clear(); }

  private startPolling(): void { if (!this.timer) this.timer = setInterval(() => void this.poll(), pollMs); }
  private stopPolling(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  private send(client: Client, message: Json): void { if (message.method !== 'action' || isActionKnownToVersion(message.params?.action?.type, client.protocolVersion)) client.connection.send(JSON.stringify(message)); }

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
        models: [{ ...composerModel(this.config), provider }],
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

  summary(session: Session, view: View): Json {
    const repository = this.config.repositories.find(repo => repo.id === session.repositoryId);
    return {
      resource: this.sessionUri(session, view), provider, title: session.title, status: sessionStatus(session) | this.viewOf(view, this.publicId(session.id)).session, activity: activity(session),
      createdAt: session.createdAt, modifiedAt: session.updatedAt,
      ...this.project(repository),
      ...(session.candidate?.status === 'ready' ? { changes: { files: session.candidate.fileCount } } : {}),
      ...sessionChatCatalog(view.protocolVersion, this.chatSummary(session, view), session.candidate?.status === 'ready' ? { files: session.candidate.fileCount } : undefined),
      _meta: { ...this.review.gitMeta(session), 'dev.webgrip.unfold': { status: session.status, placement: session.placement, budgetUsd: session.budgetUsd, spentUsd: session.spentUsd, costStatus: session.costStatus, candidate: session.candidate?.status } },
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
      chats: [this.chatSummary(session, view), ...runChats(this.projection(session).runs, this.spelling(session, view))], defaultChat: this.chatUri(session, view),
      config: this.review.withConfigValues(session, sessionConfigState(this.config, session)),
      customizations: this.customizationsOf(session, this.publicId(session.id)),
      ...(changesets ? { changesets } : {}),
      ...this.review.annotationsSummary(session, this.sessionUri(session, view)),
      inputNeeded: this.inputNeeded(session, view),
    };
  }

  private spelling(session: Session, view: Pick<View, 'scheme'>): Spelling { return { session: sessionChannel(this.publicId(session.id), view.scheme), chat: chatChannel(this.publicId(session.id), view.scheme) }; }

  private customizationsOf(subject: GatewaySubject, publicId: string): Json[] {
    return sessionCustomizations(this.config, subject, publicId, this.activeClientsOf(publicId));
  }

  private pendingSubject(pending: PendingSession): GatewaySubject {
    return { repositoryId: String(pending.config.repository), runtime: this.config.mode === 'demo' ? 'demo' : this.config.runtime.kind, placement: pending.config.placement as WorkspaceBackend | undefined };
  }

  private announceCustomizations(publicId: string): void {
    const pending = this.pending.get(publicId);
    const session = pending ? undefined : this.store.getSession(this.engineId(publicId));
    if (!pending && !session) return;
    const customizations = this.customizationsOf(pending ? this.pendingSubject(pending) : session!, publicId);
    if (this.announcedCustomizations.changed(publicId, customizations)) this.broadcast(sessionChannel(publicId), { type: 'session/customizationsChanged', customizations });
  }

  chatSummary(session: Session, view: View): Json {
    return { resource: this.chatUri(session, view), title: session.title, status: sessionStatus(session) | this.viewOf(view, this.publicId(session.id)).chat, activity: activity(session), modifiedAt: session.updatedAt, origin: { kind: 'user' }, interactivity: session.status === 'completed' && !this.reviewOperations(session).length && !this.chatAsks.covers(session) ? 'read-only' : 'full' };
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

  /** Whether a delivery policy hands this session's review to the forge, where Ploeg's pull request is reviewed and merged. */
  private gated(session: Session): boolean { return Boolean(session.execution && this.config.delivery?.policies.some(policy => policy.repositoryId === session.repositoryId)); }

  private reviewOperations(session: Session): Json[] { return reviewOperations(session, this.gated(session)); }

  private operations(session: Session): Json[] { return this.reviewOperations(session); }

  private invokeOperation(client: Client, params: Json): Json {
    const channel = String(params.channel ?? '');
    if (parseChannel(channel)?.kind !== 'changeset') throw new RpcError(codes.invalidParams, 'channel must be an ahp-changeset channel');
    const session = this.sessionFor(client.user, channel);
    if (!session) throw new RpcError(codes.sessionNotFound, 'Session not found');
    const operation = this.operations(session).find(item => item.id === params.operationId);
    if (!operation) throw new RpcError(codes.invalidParams, `This changeset offers no operation ${JSON.stringify(params.operationId)}`);
    if (params.target !== undefined) throw new RpcError(codes.invalidParams, `${operation.label} applies to the whole candidate, not to a file or range`);
    if (operation.id !== reviewOperationIds.accept) { if (client.user.role === 'viewer' || !this.mayView(client.user, session.ownerId)) throw new RpcError(codes.permissionDenied, 'Viewers cannot review a candidate'); return this.review.ask(client.user, session, operation.id); }
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
      projection = { turns: [], parts: new Map(), toolCalls: new Map(), openTools: new Map(), cursor: 0, turnCounter: 0, origins: new Map(), answers: new Map(), choices: new Map(), startedRuns: new Set(), finishedRuns: new Set(), queuedInstructions: 0, terminals: new CommandLog(this.publicId(session.id), this.redact), runs: runTranscripts(sessionChannel(this.publicId(session.id))) };
      this.projections.set(session.id, projection);
      this.openTurn(projection, session, session.objective, session.createdAt, this.store.getSecret<string>(`ahp-turn:${session.id}`));
      const events = this.store.events(session.id);
      projection.finalStop = events.findLast(event => finalStopTypes.has(event.type))?.id;
      const built = projection;
      const asked = this.chatAsks.entries(session.id);
      const placeAsked = (after: number) => { for (const entry of asked) if (entry.afterEvent === after) this.placeAsk(built, session, entry); };
      placeAsked(0);
      for (const event of events) { this.reduce(built, session, event); placeAsked(event.id); }
      this.settle(projection, session);
    }
    return projection;
  }

  private openTurn(projection: Projection, session: Session, text: string, startedAt: string, requestedTurnId?: unknown, origin: 'user' | 'systemNotification' = 'user'): Json[] {
    if (projection.activeTurn) this.closeTurn(projection, 'complete', startedAt);
    const hostTurnId = `${session.id}-turn-${++projection.turnCounter}`;
    const turnId = this.acceptableTurnId(projection, requestedTurnId) ?? hostTurnId;
    const message = { text, origin: { kind: origin } };
    projection.activeTurn = { id: turnId, startedAt, message, responseParts: [], usage: undefined };
    return [this.tag(projection, { type: 'chat/turnStarted', turnId, startedAt, message }, `turn:${turnId}`), ...carryRuns(projection.runs, projection.activeTurn)];
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

  private closeTurn(projection: Projection, state: 'complete' | 'cancelled' | 'error', at: string, error?: Json, retryable = false): Json[] {
    const active = projection.activeTurn;
    if (!active) return [];
    const duration = Math.max(0, Date.parse(at) - Date.parse(active.startedAt)) || 0;
    if (state === 'error' && error) active.responseParts.push({ kind: 'error', error, ...(retryable ? { resumable: true } : {}) });
    projection.turns.push({ id: active.id, startedAt: active.startedAt, duration, message: active.message, responseParts: active.responseParts, usage: active.usage, state });
    projection.activeTurn = undefined;
    projection.openTools.clear();
    projection.choices.clear();
    projection.holding = undefined;
    if (state === 'complete') return [{ type: 'chat/turnComplete', turnId: active.id, duration }];
    if (state === 'cancelled') return [{ type: 'chat/turnCancelled', turnId: active.id, duration }];
    return [{ type: 'chat/error', turnId: active.id, duration, part: { kind: 'error', error: error ?? { errorType: 'failed', message: 'The session failed' }, ...(error && retryable ? { resumable: true } : {}) } }];
  }

  private settle(projection: Projection, session: Session): Json[] {
    if (!projection.activeTurn || projection.holding) return [];
    if (['completed'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'complete', session.updatedAt)];
    if (['cancelled'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'cancelled', session.updatedAt)];
    if (['failed'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'error', session.updatedAt, { errorType: session.failure?.category ?? 'failed', message: session.failure?.message ?? session.blocker ?? 'The session failed' }, resumable(session))];
    if (['paused', 'interrupted'].includes(session.status)) return [...this.outcome(projection, session), ...this.closeTurn(projection, 'complete', session.updatedAt)];
    return [];
  }

  /** The address of the session's page in the browser, when the workbench knows its public address. */
  private sessionPage(session: Session): string {
    return this.config.baseUrl ? `${this.config.baseUrl.replace(/\/+$/, '')}/#session/${encodeURIComponent(session.id)}` : '';
  }

  /** One Markdown part that ends a turn with the outcome: what happened, the change, spend, why it stopped and what to do next. Added once per turn. A session that stopped by itself gets its next steps as the "What next?" choice instead, so its outcome says only why it stopped. */
  private outcome(projection: Projection, session: Session): Json[] {
    const turn = projection.activeTurn;
    if (!turn || turn.outcome) return [];
    turn.outcome = true;
    const progress = sessionProgress(session, { events: this.store.events(session.id) });
    const again = session.status === 'cancelled' && !session.sourceTask ? '\n\nSend a message here to run it again with your message as an instruction for its crew; nothing runs until you choose.' : '';
    return this.addPart(projection, { kind: 'markdown', id: `${turn.id}-outcome`, content: `${outcomeMarkdown(progress, { sessionUrl: this.sessionPage(session), nextSteps: session.status !== 'interrupted' })}${again}` });
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
    const terminal = projection.terminals.apply(event);
    const actions: Json[] = [...terminal.actions];
    const ensureTurn = () => { if (!projection.activeTurn) actions.push(...this.openTurn(projection, session, session.objective, event.at)); return projection.activeTurn!; };
    actions.push(...stopRuns(projection.runs, event, projection.activeTurn, projection.turns));
    switch (event.type) {
      case 'session.started': { ensureTurn(); actions.push(...this.addPart(projection, { kind: 'systemNotification', content: data.resumed ? 'Session resumed by the operator.' : 'Session started.' })); break; }
      case 'workspace.ready': { ensureTurn(); actions.push(...this.addPart(projection, { kind: 'systemNotification', content: `Workspace ready (${data.backend}, ${data.isolation}).` })); break; }
      case 'run.started': {
        ensureTurn();
        if (event.runId) { projection.startedRuns.add(event.runId); projection.workingRun = event.runId; }
        actions.push(...runStarted(projection.runs, session, event, projection.activeTurn!));
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
        actions.push(...runMessage(projection.runs, event));
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
        const rendering = { terminal, clean: this.redact, contributed: (name: string) => gatewayToolCall(this.config, session, this.publicId(session.id), name) };
        const routed = runTool(projection.runs, event, rendering);
        actions.push(...(routed ?? toolActions(ensureTurn(), projection.openTools, event, rendering)));
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
        const declined = this.declines.take(projection, requestId);
        if (input) {
          const answers = declined ?? projection.answers.get(requestId);
          const response = declined ? 'decline' : 'accept';
          projection.answers.delete(requestId);
          input.response = response;
          if (answers) input.request = { ...input.request, answers };
          actions.push(this.tag(projection, { type: 'chat/inputCompleted', requestId, response, ...(answers ? { answers } : {}) }, `request:${requestId}`));
        }
        break;
      }
      case 'usage': {
        const turn = projection.activeTurn;
        if (!turn) break;
        const usage = { inputTokens: Number(data.inputTokens) || 0, outputTokens: Number(data.outputTokens) || 0, _meta: { source: data.source } };
        turn.usage = usage;
        actions.push({ type: 'chat/usage', turnId: turn.id, usage });
        break;
      }
      case 'run.finished': {
        if (event.runId) { if (data.status === 'completed') projection.finishedRuns.add(event.runId); if (projection.workingRun === event.runId) projection.workingRun = undefined; }
        const turn = ensureTurn();
        actions.push(...runFinished(projection.runs, session, event, turn, projection.turns, artifact => this.artifactFiles(session).filter(file => file.id.startsWith(`${artifact}-`)).map(file => file.edit)));
        const role = session.runs.find(run => run.id === event.runId)?.roleName ?? 'Role';
        const verdict = typeof data.verdict === 'string' ? verdictWords[data.verdict] ?? data.verdict : '';
        const text = [`**${role}** ${data.status === 'completed' ? verdict || 'finished' : `stopped (${String(data.status ?? 'ended').replaceAll('_', ' ')})`}.`, data.summary ? String(data.summary) : ''].filter(Boolean).join('\n\n');
        const partId = `${turn.id}-part-${turn.responseParts.length + 1}`;
        actions.push(...this.addPart(projection, { kind: 'markdown', id: partId, content: text }));
        const spent = runEndSpend(this.spend.of(projection, session, event.id, () => this.store.events(session.id)));
        if (spent) actions.push(...this.addPart(projection, { kind: 'systemNotification', content: spent }));
        break;
      }
      case 'budget.observed': case 'budget.settled': case 'budget.increased': {
        const notice = observeSpend(this.spend.of(projection, session, event.id, () => this.store.events(session.id)), event);
        if (notice) actions.push(...this.addPart(projection, { kind: 'systemNotification', content: notice }));
        break;
      }
      case declineEvents.declined: case declineEvents.withdrawn: this.declines.observe(projection, event.type, data); break;
      case turnResumedEvent: actions.push(...this.resumeTurn(projection, session, event)); break;
      case 'candidate.ready': { const turn = projection.activeTurn; if (turn) actions.push(...this.addPart(projection, { kind: 'systemNotification', content: 'A reviewable candidate has been captured.' }), ...candidateEdits(session, turn, this.loadedCandidateEdits(this.store.getSession(session.id) ?? session))); break; }
      case choiceEvents.offered: actions.push(...this.offerChoice(projection, session, event)); break;
      case choiceEvents.answered: actions.push(...this.choiceAnswered(projection, session, event)); break;
      case choiceEvents.reported: actions.push(...this.choiceReply(projection, session, event)); break;
      case 'session.completed': actions.push(...this.finalOutcome(projection, session, event), ...this.closeTurn(projection, 'complete', event.at)); break;
      case 'session.cancelled': actions.push(...this.finalOutcome(projection, session, event), ...this.closeTurn(projection, 'cancelled', event.at)); break;
      case 'session.failed': projection.workingRun = undefined; actions.push(...this.finalOutcome(projection, session, event), ...this.closeTurn(projection, 'error', event.at, { errorType: String(data.code ?? 'failed'), message: String(data.message ?? 'The session failed') }, resumable(session))); break;
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

  private loadedCandidateEdits(session: Session): Json[] {
    const key = this.candidateKey(session);
    const view = key ? this.candidates.get(key) : undefined;
    return view ? this.candidateFiles(session, view).map(file => file.edit) : [];
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
    if ((!Array.isArray(offered.options) || !offered.options.length) && offered.input !== 'text') return [...actions, ...this.closeTurn(projection, 'complete', event.at)];
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
      for (const client of this.clients) for (const channel of client.subscriptions) { const publicId = subscribedSessionId(channel); const id = publicId ? this.engineId(publicId) : undefined; if (id && !watched.has(id)) { const session = this.store.getSession(id); if (session) watched.set(id, session); } if (id && client.initialized && client.user.role !== 'viewer' && !watchers.has(id)) watchers.set(id, client.user); }
      for (const [id, session] of watched) {
        if (!this.projections.has(id)) { await this.loadCandidate(session); if (this.closed) return; }
        const projection = this.projection(session);
        const publicId = this.publicId(id);
        const chat = chatChannel(publicId);
        const channel = sessionChannel(publicId);
        const arriving = this.store.events(id, projection.cursor);
        if (arriving.some(event => event.type === 'candidate.ready')) { await this.loadCandidate(this.store.getSession(id) ?? session); if (this.closed) return; }
        const stop = arriving.findLast(event => finalStopTypes.has(event.type));
        if (stop) projection.finalStop = stop.id;
        const fresh = [...arriving.flatMap(event => this.reduce(projection, session, event)), ...this.settle(projection, session)];
        this.publish(session, fresh);
        this.announceCustomizations(publicId);
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
        this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => { const summary = this.summary(session, viewer); return { channel: rootChannel, session: summary.resource, changes: { title: summary.title, status: summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt, changes: summary.changes, ...catalogOf(summary) } }; }, session.ownerId);
        if (changesets) { await this.loadCandidate(session); if (this.closed) return; const changeset = this.changesetState(session); this.broadcast(this.changesetUri(session), { type: 'changeset/contentChanged', files: changeset.files, operations: changeset.operations ?? [] }); }
      }
      this.announceActiveSessions();
    } finally { this.polling = false; }
  }

  private publish(session: Session, actions: Json[]): void {
    const chat = chatChannel(this.publicId(session.id));
    const spelling = (viewer: View) => this.spelling(session, viewer);
    for (const action of actions) { const route = runRoute(action, spelling, this.spelling(session, { scheme: provider })); this.broadcast(terminalActionChannel(action) ?? route?.channel ?? chat, route?.action ?? action, actionOrigins.get(action)); }
  }

  /** Renders the session's events that arrived since the last poll, so what the host adds next lands after them. Left to the poll while it runs. */
  private drain(session: Session): void {
    if (this.polling) return;
    const projection = this.projection(session);
    const arriving = this.store.events(session.id, projection.cursor);
    const stop = arriving.findLast(event => finalStopTypes.has(event.type));
    if (stop) projection.finalStop = stop.id;
    this.publish(session, arriving.flatMap(event => this.reduce(projection, session, event)));
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
    const terminal = parseTerminalChannel(channel);
    if (terminal) return { resource: channel, state: this.terminalState(client, terminal), fromSeq: this.serverSeq };
    const parsed = parseChannel(channel);
    if (!parsed) throw new RpcError(codes.notFound, 'Unknown channel');
    if (parsed.run) { const session = this.sessionFor(client.user, channel); const state = session && runChatState(this.projection(session).runs, parsed.run, this.spelling(session, client)); if (!state) throw new RpcError(codes.notFound, 'Unknown channel'); return { resource: channel, state, fromSeq: this.serverSeq }; }
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

  private terminalState(client: Client, terminal: { sessionId: string; commandId: string }): Json {
    const session = this.sessionFor(client.user, sessionChannel(terminal.sessionId));
    const command = session ? this.projection(session).terminals.get(terminal.commandId) : undefined;
    if (!session || !command) throw new RpcError(codes.notFound, 'Terminal not found');
    return this.projection(session).terminals.state(command, { session: this.sessionUri(session, client), chat: this.chatUri(session, client) });
  }

  private pendingSummary(pending: PendingSession, view: View): Json {
    return { resource: sessionChannel(pending.id, view.scheme), provider, title: pending.config.title ?? 'New session', status: statusBits.idle | this.viewOf(view, pending.id).session, createdAt: pending.createdAt, modifiedAt: pending.createdAt, ...this.project(this.config.repositories.find(repo => repo.id === pending.config.repository)), ...sessionChatCatalog(view.protocolVersion, this.pendingChat(pending, view)) };
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
    return { ...this.pendingSummary(pending, view), lifecycle: 'ready', activeClients: this.activeClientsOf(pending.id), chats: [this.pendingChat(pending, view)], defaultChat: chatChannel(pending.id, view.scheme), config: { schema: sessionConfigSchema(this.config, pending.config), values: pending.config }, customizations: this.customizationsOf(this.pendingSubject(pending), pending.id), inputNeeded: [] };
  }

  private fingerprint(session: Session): string {
    return JSON.stringify([sessionStatus(session), activity(session), session.title, session.candidate?.status, this.openRequests(session).map(item => item.id), session.artifacts.length, session.review?.decision, closedToMessages(session)]);
  }

  private async subscribe(client: Client, channel: string): Promise<Json> {
    if (parseAnnotationsChannel(channel)) {
      let snapshot: Json;
      try { snapshot = this.review.annotationsSnapshot(client.user, channel); } catch { throw new RpcError(codes.sessionNotFound, 'Session not found'); }
      client.subscriptions.add(channel);
      return snapshot;
    }
    if (channel === automationsChannel) { const state = await this.automations.snapshot(client.user); client.subscriptions.add(channel); return { resource: channel, state, fromSeq: this.serverSeq }; }
    const parsed = parseChannel(channel);
    if (parsed && isWorkItemSession(parsed.id)) { const snapshot = await this.workItemSnapshot(client, channel, parsed); client.subscriptions.add(channel); return snapshot; }
    const loading = parsed ? this.sessionFor(client.user, channel) : undefined;
    if (loading) await this.loadCandidate(loading);
    const snapshot = this.snapshot(client, channel);
    client.subscriptions.add(channel);
    const publicId = sessionIdFrom(channel);
    const id = publicId ? this.engineId(publicId) : undefined;
    if (id && !this.summaries.has(id)) { const session = this.store.getSession(id); if (session) this.summaries.set(id, this.fingerprint(session)); }
    const watched = id && client.user.role !== 'viewer' ? this.store.getSession(id) : undefined;
    if (watched) this.offerNextSteps(watched, client.user);
    return snapshot;
  }

  private remember(clientId: string, user: User, scheme: SessionScheme, clientInfo: Client['clientInfo'], protocolVersion: string): void {
    this.knownClients.remember(clientId, { userId: user.id, scheme, protocolVersion, ...(clientInfo ? { clientInfo } : {}) });
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
      client.clientId = params.clientId; client.scheme = sessionSchemeFor(params.clientInfo, params._meta); client.initialized = true; client.clientInfo = describedClient(params.clientInfo); client.protocolVersion = negotiated;
      this.remember(params.clientId, client.user, client.scheme, client.clientInfo, negotiated);
      this.workItems.watch();
      this.resumeActiveClient(params.clientId, Array.isArray(params.initialSubscriptions) ? params.initialSubscriptions : [rootChannel]);
      const snapshots: Json[] = [];
      for (const channel of Array.isArray(params.initialSubscriptions) ? params.initialSubscriptions : [rootChannel]) snapshots.push(await this.subscribe(client, channel));
      return { protocolVersion: negotiated, serverSeq: this.serverSeq, serverInfo: { name: 'unfold', version: this.config.mode === 'demo' ? 'demo' : 'live' }, defaultDirectory: repositoriesDirectory, ...(this.automations.available ? { automations: this.automations.capabilities() } : {}), ...(declaresSessionUris || this.automations.available ? { _meta: { ...(declaresSessionUris ? { [sessionUrisMeta]: true } : {}), ...(this.automations.available ? { [autonomousAutomationsMeta]: true } : {}) } } : {}), snapshots, ...(this.chatAsks.offered ? { completionTriggerCharacters: ['/'] } : {}), terminalCommandPrefix: undefined };
    }
    if (method === 'reconnect' && !client.initialized) {
      const known = typeof params.clientId === 'string' ? this.knownClients.get(params.clientId) : undefined;
      if (!known || known.userId !== client.user.id) throw new RpcError(codes.notFound, 'This host does not know that client; initialize');
      client.clientId = params.clientId; client.scheme = params._meta?.[sessionUrisMeta] === true ? 'ahp-session' : known.scheme; client.initialized = true; client.clientInfo = known.clientInfo; client.protocolVersion = known.protocolVersion ?? oldestBaseline;
      this.remember(params.clientId, client.user, client.scheme, client.clientInfo, client.protocolVersion);
      this.workItems.watch();
      this.resumeActiveClient(params.clientId, Array.isArray(params.subscriptions) ? params.subscriptions : []);
    }
    if (!client.initialized) throw new RpcError(codes.invalidRequest, 'initialize first');
    switch (method) {
      case 'reconnect': { const snapshots: Json[] = []; for (const channel of Array.isArray(params.subscriptions) ? params.subscriptions : []) snapshots.push(await this.subscribe(client, channel)); return { type: 'snapshot', snapshots }; }
      case 'subscribe': { if (typeof params.channel !== 'string') throw new RpcError(codes.invalidParams, 'channel is required'); return { snapshot: await this.subscribe(client, params.channel) }; }
      case 'listSessions': return { items: [...this.visible(client.user).map(session => this.summary(session, client)), ...await this.workItemSummaries(client)] };
      case 'resolveSessionConfig': return resolveSessionConfig(this.config, params.config, this.repositoryFromPickedFolder(params.workingDirectory));
      case 'resourceList': return this.listDirectory(params.uri);
      case 'sessionConfigCompletions': return sessionConfigCompletions(resolveSessionConfig(this.config, params.config, this.repositoryFromPickedFolder(params.workingDirectory)).schema, String(params.property));
      case 'createSession': return this.createSession(client, params);
      case 'createChat': return this.createChat(client, params);
      case 'createTerminal': case 'disposeTerminal': throw new RpcError(codes.permissionDenied, noClientTerminals);
      case 'disposeSession': return this.disposeSession(client, params);
      case 'disposeChat': return {};
      case 'fetchTurns': return {};
      case 'completions': return { items: this.completionItems(client, params) };
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
    if (isWorkItemSession(parsed.id) || this.pending.has(parsed.id) || this.store.getSession(this.engineId(parsed.id)) || this.store.getSession(parsed.id)) throw new RpcError(codes.sessionExists, 'Session already exists');
    const picked = Array.isArray(params.workingDirectories) ? this.repositoryFromPickedFolder(params.workingDirectories[0]) : undefined;
    const config = this.acceptedConfig(params.config, picked);
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
    const workItem = sessionIdFrom(channel);
    if (workItem && isWorkItemSession(workItem)) throw new RpcError(this.workItems.remembered(client.user, workItem) ? codes.permissionDenied : codes.sessionNotFound, this.workItems.remembered(client.user, workItem) ? workItemRefusals.dispose : 'Session not found');
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
    for (const item of this.clients) for (const subscription of [...item.subscriptions]) if (subscribedSessionId(subscription) === publicId) item.subscriptions.delete(subscription);
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
      session = this.engine.create({ title: String(pending.config.title ?? text.split('\n')[0]).slice(0, 160) || 'Agent host session', objective: text, repositoryId: String(pending.config.repository), crewId: String(pending.config.crew), runtime: this.config.mode === 'demo' ? 'demo' : this.config.runtime.kind, placement: pending.config.placement as WorkspaceBackend | undefined, approval: approvalOf(pending.config), budgetUsd: Number(pending.config.budgetUsd) }, pending.user);
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
    this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => { const summary = this.summary(session, viewer); return { channel: rootChannel, session: summary.resource, changes: { title: summary.title, status: summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt, ...(summary.project ? { project: summary.project } : {}), ...catalogOf(summary) } }; }, session.ownerId);
    this.broadcast(sessionChannel(pending.id), viewer => ({ type: 'session/chatUpdated', chat: this.chatUri(session, viewer), changes: { title: session.title, status: sessionStatus(session) | this.viewOf(viewer, pending.id).chat, modifiedAt: session.updatedAt } }));
    const projection = this.projection(session);
    const turn = projection.activeTurn ?? projection.turns.at(-1);
    if (turn) this.broadcast(chatChannel(pending.id), { type: 'chat/turnStarted', turnId: turn.id, startedAt: turn.startedAt, message: turn.message }, origin);
    try { await this.engine.start(session.id, pending.user); }
    catch (error) { this.broadcast(pending.uri, { type: 'session/creationFailed', error: { errorType: (error as Json)?.code ?? 'start_failed', message: (error as Error)?.message ?? 'Could not start the session' } }); }
    return undefined;
  }

  private setViewFlag(client: Client, channel: string, kind: ChannelKind, pending: PendingSession | undefined, action: Json, origin: Origin, flag: ViewFlag): string | undefined {
    const session = pending ? undefined : this.sessionFor(client.user, channel);
    if (!pending && !session) return 'Session not found';
    return this.setFlag(client, channel, kind, { publicId: session ? this.publicId(session.id) : pending!.id, activityBits: session ? sessionStatus(session) : statusBits.idle, summary: viewer => session ? this.summary(session, viewer) : this.pendingSummary(pending!, viewer) }, action, origin, flag);
  }

  /** Sets a person's own read or archive flag on a session, which no other person sees. */
  private setFlag(client: Client, channel: string, kind: ChannelKind, subject: { publicId: string; activityBits: number; summary: (viewer: Client) => Json }, action: Json, origin: Origin, flag: ViewFlag): string | undefined {
    if (kind !== flag.channel) return `${action.type} is dispatched on the ${flag.channel} channel`;
    if (typeof action[flag.field] !== 'boolean') return `${flag.field} must be true or false`;
    const { publicId, activityBits } = subject;
    const current = this.viewOf(client, publicId);
    const next = { ...current, [flag.channel]: action[flag.field] ? current[flag.channel] | flag.bit : current[flag.channel] & ~flag.bit };
    this.store.setAgentHostView(client.user.id, publicId, next, new Date().toISOString());
    const sameUser = (other: Client) => other.user.id === client.user.id;
    this.echo(client, channel, action, origin, sameUser);
    if (flag.channel === 'session') this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => ({ channel: rootChannel, session: sessionChannel(publicId, viewer.scheme), changes: { status: activityBits | next.session } }), undefined, sameUser);
    else {
      this.broadcast(sessionChannel(publicId), viewer => ({ type: 'session/chatUpdated', chat: chatChannel(publicId, viewer.scheme), changes: { status: activityBits | next.chat } }), undefined, sameUser);
      this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => ({ channel: rootChannel, session: sessionChannel(publicId, viewer.scheme), changes: catalogOf(subject.summary(viewer)) }), undefined, viewer => sameUser(viewer) && speaksCatalog(viewer.protocolVersion));
    }
    return undefined;
  }

  private activeClientsOf(publicId: string): Json[] { return [...(this.activeClients.get(publicId)?.values() ?? [])]; }

  private workItemSpelling(publicId: string, view: Pick<View, 'scheme'>): Spelling { return { session: sessionChannel(publicId, view.scheme), chat: chatChannel(publicId, view.scheme) }; }

  private workItemSummary(entry: WorkItemRecord, view: View): Json { return workItemSummary(entry, this.workItemSpelling(entry.publicId, view), this.viewOf(view, entry.publicId), view.protocolVersion); }

  /** The person's Work Item sessions for `listSessions`. Whatever Ploeg does, Unfold's own sessions still list. */
  private async workItemSummaries(client: Client): Promise<Json[]> {
    try { return (await this.workItems.list(client.user)).map(entry => this.workItemSummary(entry, client)); } catch { return []; }
  }

  private async workItemSnapshot(client: Client, channel: string, parsed: { kind: ChannelKind; id: string; run?: string }): Promise<Json> {
    const workItemId = workItemIdOf(parsed.id);
    let found: Awaited<ReturnType<WorkItemSessions['session']>>;
    try { found = workItemId ? await this.workItems.session(client.user, workItemId) : undefined; }
    catch (error) { throw new RpcError(codes.internal, error instanceof Error && 'status' in error ? error.message : 'Ploeg could not be read'); }
    if (!found) throw new RpcError(codes.sessionNotFound, 'Session not found');
    if (!parsed.run) this.settleWorkItemPrompts(client.user, found.entry);
    const spelling = this.workItemSpelling(parsed.id, client);
    const flags = this.viewOf(client, parsed.id);
    const open = this.workItemCommands.open(client.user.id, found.entry.workItemId);
    const state = parsed.run ? workItemRunChatState(found.detail, parsed.run, spelling)
      : parsed.kind === 'session' ? { ...workItemSessionState(found.entry, found.detail, spelling, flags, client.protocolVersion, this.activeClientsOf(parsed.id)), inputNeeded: open ? [promptInputNeeded(open, spelling.chat)] : [] }
      : parsed.kind === 'chat' ? withPrompts(workItemChatState(found.entry, found.detail, spelling, flags), this.workItemCommands.prompts(client.user.id, found.entry.workItemId))
      : undefined;
    if (!state) throw new RpcError(codes.notFound, 'Unknown channel');
    return { resource: channel, state, fromSeq: this.serverSeq };
  }

  /** Tells one person's clients which Work Item sessions joined, changed or left their list. A Work Item that newly needs them becomes unread again. */
  private announceWorkItems(user: User, change: { added: WorkItemRecord[]; changed: WorkItemRecord[]; removed: string[] }): void {
    const own = (client: Client) => client.user.id === user.id;
    const at = new Date().toISOString();
    for (const entry of change.added) this.notify(rootChannel, 'root/sessionAdded', viewer => ({ channel: rootChannel, summary: this.workItemSummary(entry, viewer) }), undefined, own);
    for (const entry of change.changed) {
      if (workItemStatus(entry) === statusBits.inputNeeded && !entry.stale) this.store.clearAgentHostFlags(entry.publicId, statusBits.isRead, at);
      this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => { const summary = this.workItemSummary(entry, viewer); return { channel: rootChannel, session: summary.resource, changes: { title: summary.title, status: summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt, ...catalogOf(summary) } }; }, undefined, own);
      this.broadcast(sessionChannel(entry.publicId), viewer => { const summary = this.workItemSummary(entry, viewer); return { type: 'session/chatUpdated', chat: chatChannel(entry.publicId, viewer.scheme), changes: { title: summary.title, status: summary.chats?.[0]?.status ?? summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt } }; }, undefined, own);
    }
    for (const publicId of change.removed) this.notify(rootChannel, 'root/sessionRemoved', viewer => ({ channel: rootChannel, session: sessionChannel(publicId, viewer.scheme) }), undefined, own);
  }

  /** Sends a Work Item's transcript changes to the clients of every person Ploeg's team authorization lets see it, each in its own spelling. */
  private publishWorkItemTranscript(entry: WorkItemRecord, actions: (spelling: Spelling) => RoutedAction[]): void {
    const allowed = (client: Client) => this.workItems.allows(client.user, entry.item.team);
    const built = new Map<SessionScheme, RoutedAction[]>();
    const routed = (client: Client) => { let list = built.get(client.scheme); if (!list) { list = actions(this.workItemSpelling(entry.publicId, client)); built.set(client.scheme, list); } return list; };
    const reference = actions(this.workItemSpelling(entry.publicId, { scheme: provider }));
    reference.forEach((item, index) => {
      const channel = item.to === 'chat' ? chatChannel(entry.publicId) : item.to === 'session' ? sessionChannel(entry.publicId) : runChatChannel(sessionChannel(entry.publicId), item.to.run);
      this.broadcast(channel, client => routed(client)[index].action, undefined, allowed);
    });
  }

  /**
   * A Work Item session takes the person's own read and archive flags, drafts and active-client presence, the answers to the
   * host's questions, and Stop, which only asks whether to withdraw. Every other change is refused, because Ploeg owns the
   * Work Item. Archiving is not cancelling.
   */
  private async dispatchToWorkItem(client: Client, channel: string, kind: ChannelKind, publicId: string, action: Json, origin: Origin): Promise<string | undefined> {
    const entry = this.workItems.remembered(client.user, publicId);
    if (!entry || !this.workItems.allows(client.user, entry.item.team)) return 'Session not found';
    const flag = viewFlags[String(action.type)];
    if (flag) return this.setFlag(client, channel, kind, { publicId, activityBits: workItemStatus(entry), summary: viewer => this.workItemSummary(entry, viewer) }, action, origin, flag);
    switch (action.type) {
      case 'chat/turnCancelled': return kind === 'chat' ? this.stopWorkItem(client, channel, publicId, action, origin) : 'chat/turnCancelled is dispatched on the chat channel';
      case 'chat/inputCompleted': return kind === 'chat' ? this.answerWorkItem(client, channel, entry, action, origin) : 'chat/inputCompleted is dispatched on the chat channel';
      case 'chat/turnStarted': case 'chat/pendingMessageSet': return kind === 'chat' ? this.messageWorkItem(client, channel, publicId, action, origin) : `${action.type} is dispatched on the chat channel`;
      case 'chat/turnResume': return kind === 'chat' ? this.tryWorkItemAgain(client, channel, publicId, action, origin) : 'chat/turnResume is dispatched on the chat channel';
      case 'chat/draftChanged': case 'chat/inputAnswerChanged': this.echo(client, channel, action, origin); return undefined;
      case 'session/activeClientSet': case 'session/activeClientRemoved': return kind === 'session' ? this.setActiveClient(client, channel, publicId, action, origin) : `${action.type} is dispatched on the session channel`;
      default: return workItemRefusal(action.type);
    }
  }

  /** Asks a person who may act on a proposed Work Item to approve or reject it, and closes an approval question the Work Item has moved past. */
  private settleWorkItemPrompts(user: User, entry: WorkItemRecord): void {
    const open = this.workItemCommands.open(user.id, entry.workItemId);
    if (open?.kind === 'decide' && entry.item.state !== 'proposed') this.publishPromptDismissed(user, this.workItemCommands.close(open, 'cancel', undefined, workItemCommandText.noLongerProposed(entry.item.id)));
    if (entry.item.state !== 'proposed' || this.workItemCommands.open(user.id, entry.workItemId) || !this.workItemCommands.mayAct(user, entry.item.team)) return;
    this.publishPromptOpened(user, this.workItemCommands.ask(user, entry, 'decide').prompt);
  }

  /**
   * Stop on a Work Item never acts on the click: it refuses the cancel and asks, in the open Round's turn or a turn of its
   * own, whether to withdraw the Work Item. Stop on the turn of a question still open dismisses that question.
   */
  private async stopWorkItem(client: Client, channel: string, publicId: string, action: Json, origin: Origin): Promise<string | undefined> {
    const user = client.user;
    let found: Awaited<ReturnType<WorkItemSessions['session']>>;
    try { found = await this.workItems.session(user, workItemIdOf(publicId)!); } catch { return 'Ploeg could not be read, so nothing stopped. Try again shortly.'; }
    if (!found) return 'Session not found';
    const { entry, detail } = found;
    if (!this.workItemCommands.mayAct(user, entry.item.team)) return workItemCommandText.viewer(entry.item.team);
    const open = this.workItemCommands.open(user.id, entry.workItemId);
    if (open?.ownTurn && open.turnId === action.turnId) {
      this.publishPromptDismissed(user, this.workItemCommands.close(open, 'cancel', undefined, workItemCommandText.unchanged, 'cancelled'));
      this.echo(client, channel, action, origin, viewer => viewer.user.id === user.id);
      return undefined;
    }
    if (entry.item.state === 'done' || entry.item.state === 'withdrawn') return workItemCommandText.ended(entry.item.id);
    const round = workItemChatState(entry, detail, this.workItemSpelling(publicId, client), this.viewOf(client, publicId)).activeTurn?.id as string | undefined;
    const { prompt, created, replaced } = this.workItemCommands.ask(user, entry, 'withdraw', round ? { attachTo: round } : {});
    this.reject(client, channel, action, origin, workItemCommandText.confirmStop(entry.item.id));
    if (replaced) this.publishPromptDismissed(user, replaced);
    if (created) this.publishPromptOpened(user, prompt);
    return undefined;
  }

  /** Reads a Work Item a person commands and refuses the command when Ploeg would not restart it, or the person may not act. */
  private async restartableWorkItem(client: Client, publicId: string, refusal: string): Promise<{ entry: WorkItemRecord } | { refused: string }> {
    let found: Awaited<ReturnType<WorkItemSessions['session']>>;
    try { found = await this.workItems.session(client.user, workItemIdOf(publicId)!); } catch { return { refused: 'Ploeg could not be read, so nothing changed. Try again shortly.' }; }
    if (!found) return { refused: 'Session not found' };
    const { entry } = found;
    if (entry.item.state === 'withdrawn') return { refused: workItemCommandText.withdrawn };
    if (!restartable(entry.item.state)) return { refused: refusal };
    if (!this.workItemCommands.mayAct(client.user, entry.item.team)) return { refused: workItemCommandText.viewer(entry.item.team) };
    return { entry };
  }

  /**
   * A message on a Work Item that needs a person or went stale becomes the note of a restart the person confirms first, in
   * the message's own turn. A message on a withdrawn Work Item says how Ploeg restarts it; on other work it is refused,
   * because steering reaches the next Round, not the running Run.
   */
  private async messageWorkItem(client: Client, channel: string, publicId: string, action: Json, origin: Origin): Promise<string | undefined> {
    const found = await this.restartableWorkItem(client, publicId, workItemRefusals.message);
    if ('refused' in found) return found.refused;
    if (action.message?.origin?.kind !== 'user') return 'Only a person\'s own message becomes a note';
    const text = typeof action.message?.text === 'string' ? action.message.text.trim() : '';
    if (!text) return 'Empty message';
    if (text.length > 4096) return 'A note is at most 4096 characters';
    const queued = action.type === 'chat/pendingMessageSet';
    if (queued && (typeof action.id !== 'string' || !action.id)) return 'A pending message needs an id';
    if (!queued && (typeof action.turnId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(action.turnId))) return 'A turn needs an id';
    const user = client.user;
    const own = (viewer: Client) => viewer.user.id === user.id;
    const opening = { text, origin: 'user' as const };
    const { prompt, replaced } = this.workItemCommands.ask(user, found.entry, 'requeue', queued ? { opening } : { ownTurnId: action.turnId, opening }, text);
    if (queued) { this.echo(client, channel, action, origin, own); this.broadcast(channel, { type: 'chat/pendingMessageRemoved', kind: action.kind, id: action.id }, undefined, own); }
    if (replaced) this.publishPromptDismissed(user, replaced);
    if (!queued) this.echo(client, channel, action, origin, own);
    this.publishPromptOpened(user, prompt, !queued);
    return undefined;
  }

  /** Try Again on a Work Item that needs a person or went stale asks, in a turn of its own, whether to restart it from Round 1; the click alone restarts nothing. */
  private async tryWorkItemAgain(client: Client, channel: string, publicId: string, action: Json, origin: Origin): Promise<string | undefined> {
    const found = await this.restartableWorkItem(client, publicId, workItemRefusals.tryAgain);
    if ('refused' in found) return found.refused;
    const { prompt, created, replaced } = this.workItemCommands.ask(client.user, found.entry, 'requeue');
    this.reject(client, channel, action, origin, workItemCommandText.confirmTryAgain(found.entry.item.id));
    if (replaced) this.publishPromptDismissed(client.user, replaced);
    if (created) this.publishPromptOpened(client.user, prompt);
    return undefined;
  }

  /** The answer to one of the host's questions about a Work Item: recorded and shown first, then carried out as the person, then what came of it. */
  private async answerWorkItem(client: Client, channel: string, entry: WorkItemRecord, action: Json, origin: Origin): Promise<string | undefined> {
    const user = client.user;
    const prompt = this.workItemCommands.find(user.id, entry.workItemId, String(action.requestId ?? ''));
    if (!prompt || prompt.response) return 'Unknown question';
    if (!this.workItemCommands.mayAct(user, prompt.team)) return workItemCommandText.viewer(prompt.team);
    const own = (viewer: Client) => viewer.user.id === user.id;
    const response = action.response === 'accept' ? 'accept' : 'cancel';
    const answers = response === 'accept' && action.answers && typeof action.answers === 'object' ? action.answers as Json : undefined;
    this.workItemCommands.claim(prompt, response, answers);
    this.echo(client, channel, { type: 'chat/inputCompleted', requestId: prompt.requestId, response, ...(answers ? { answers } : {}) }, origin, own);
    this.broadcast(sessionChannel(prompt.publicId), { type: 'session/inputNeededRemoved', id: prompt.requestId }, undefined, own);
    const outcome = await this.workItemCommands.carry(user, prompt);
    for (const closed of promptClosedActions(prompt)) this.broadcast(chatChannel(prompt.publicId), closed, undefined, own);
    if (outcome.askAgain) { const again = this.workItemCommands.ask(user, entry, prompt.kind); if (again.created) this.publishPromptOpened(user, again.prompt); }
    if (outcome.changed) await this.workItems.changed(entry.workItemId, entry.item.team);
    return undefined;
  }

  private publishPromptOpened(user: User, prompt: WorkItemPrompt, turnOpened = false): void {
    const own = (viewer: Client) => viewer.user.id === user.id;
    for (const opened of promptOpenActions(prompt, turnOpened)) this.broadcast(chatChannel(prompt.publicId), opened, undefined, own);
    this.broadcast(sessionChannel(prompt.publicId), viewer => ({ type: 'session/inputNeededSet', request: promptInputNeeded(prompt, chatChannel(prompt.publicId, viewer.scheme)) }), undefined, own);
  }

  /** Tells the person's clients that a question closed without their answer, and why. */
  private publishPromptDismissed(user: User, prompt: WorkItemPrompt): void {
    const own = (viewer: Client) => viewer.user.id === user.id;
    this.broadcast(chatChannel(prompt.publicId), { type: 'chat/inputCompleted', requestId: prompt.requestId, response: 'cancel' }, undefined, own);
    this.broadcast(sessionChannel(prompt.publicId), { type: 'session/inputNeededRemoved', id: prompt.requestId }, undefined, own);
    for (const closed of promptClosedActions(prompt)) this.broadcast(chatChannel(prompt.publicId), closed, undefined, own);
  }

  private setActiveClient(client: Client, channel: string, publicId: string, action: Json, origin: Origin): string | undefined {
    const setting = action.type === 'session/activeClientSet';
    const clientId = setting ? action.activeClient?.clientId : action.clientId;
    if (clientId !== origin.clientId) return 'A client can only set or remove itself as an active client';
    const clients = this.activeClients.get(publicId) ?? new Map<string, Json>();
    if (setting) clients.set(clientId, action.activeClient); else clients.delete(clientId);
    if (clients.size) this.activeClients.set(publicId, clients); else this.activeClients.delete(publicId);
    this.persistActiveClients();
    this.echo(client, channel, action, origin);
    this.announceCustomizations(publicId);
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
      this.announceCustomizations(publicId);
    }
  }

  private acceptedConfig(requested: unknown, picked?: string): Json {
    try { return acceptSessionConfig(this.config, requested, picked); }
    catch (error) { if (error instanceof SessionConfigError) throw new RpcError(codes.invalidParams, error.message); throw error; }
  }

  private changePendingConfig(client: Client, channel: string, pending: PendingSession, action: Json, origin: Origin): string | undefined {
    if (pending.starting) return 'The session is already starting';
    try { pending.config = changePendingConfig(this.config, pending.config, action.config, action.replace === true); }
    catch (error) { if (error instanceof SessionConfigError) return error.message; throw error; }
    this.echo(client, channel, { type: 'session/configChanged', config: pending.config, replace: true }, origin);
    this.announceCustomizations(pending.id);
    return undefined;
  }

  private async changeStartedConfig(client: Client, channel: string, session: Session, action: Json, origin: Origin): Promise<string | undefined> {
    let change: ReturnType<typeof startedConfigChange>;
    try { change = startedConfigChange(session, action.config); }
    catch (error) { if (error instanceof SessionConfigError) return error.message; throw error; }
    const current = change.approval ? await this.engine.setApproval(session.id, change.approval, client.user) : session;
    this.echo(client, channel, { type: 'session/configChanged', config: this.review.withConfigValues(current, sessionConfigState(this.config, current)).values, replace: true }, origin);
    return undefined;
  }

  private renameSession(client: Client, channel: string, session: Session, action: Json, origin: Origin): undefined {
    const renamed = this.engine.rename(session.id, action.title, client.user);
    const publicId = this.publicId(session.id);
    this.echo(client, channel, { ...action, title: renamed.title }, origin);
    if (parseChannel(channel)?.kind === 'chat') this.broadcast(sessionChannel(publicId), { type: 'session/titleChanged', title: renamed.title });
    this.broadcast(sessionChannel(publicId), viewer => ({ type: 'session/chatUpdated', chat: chatChannel(publicId, viewer.scheme), changes: { title: renamed.title } }));
    this.notify(rootChannel, 'root/sessionSummaryChanged', viewer => ({ channel: rootChannel, session: sessionChannel(publicId, viewer.scheme), changes: { title: renamed.title, ...catalogOf(this.summary(renamed, viewer)) } }), session.ownerId);
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

  private optionLines(session: Session, recovery: Recovery | undefined, options: ChoiceOption[], withMessage: boolean): string {
    const budget = money(session.budgetUsd);
    const reviewer = recovery?.review?.roleName ?? 'The reviewer';
    const meaning: Record<ChoiceOptionId, string> = {
      run_again_start: `a new session with this session's brief, repository, crew, placement and budget (${budget})${withMessage ? ', and your message as an instruction its crew reads' : ''}. It starts at once, as a new Ploeg authorization.`,
      run_again: `the same new session, left ready for you to start. Nothing runs until you do.`,
      deliver: `${reviewer} approved this work before the session stopped. Unfold captures the approved branch as the candidate and Ploeg completes this session with it, without another model call. The pull request follows the normal delivery path${withMessage ? ', and your message goes to no crew' : ''}.`,
      resume: 'this session continues in a new generation, and every Run that did not finish runs again.',
      ask: 'your message is answered at once as an Ask about this work. No crew reads it; Ploeg meters it against your Team\'s Ask Allowance.',
      steer: 'the crew gets your message as an instruction, as if you had sent it without `/ask`.',
      dismiss: withMessage ? 'nothing changes, and your message is not used.' : 'nothing changes. You can still act on the session page.',
    };
    return options.map(option => `- **${option.label}**: ${meaning[option.id]}`).join('\n');
  }

  /** The choice offered for a message no crew will read: run again with the message as the brief, deliver approved work first, ask it instead, or cancel. `unasked` says why it was not answered as an Ask. */
  private messageOffer(session: Session, recovery: Recovery, unasked?: string): Json {
    const available = new Map(recovery.actions.filter(action => action.available).map(action => [action.id, action]));
    const options: ChoiceOption[] = [];
    if (available.has('run_again')) options.push({ id: 'run_again_start', label: 'Run again and start' }, { id: 'run_again', label: 'Run again with this message' });
    if (available.has('deliver')) options.push({ id: 'deliver', label: 'Deliver the approved work first' });
    const reason = sessionProgress(session, { events: this.store.events(session.id) }).reason?.sentence ?? `the session is ${session.status}.`;
    const blocked = recovery.actions.find(action => action.id === 'run_again' && !action.available)?.unavailableReason;
    const notAsked = unasked ? `\n\nIt was not answered as an Ask either: ${unasked}` : '';
    if (!options.length) return { title: 'No crew will read this message', explanation: `No crew will read this message. ${reason}${blocked ? ` It cannot run again from here: ${blocked}` : ''}${notAsked}`, options: [] };
    if (!unasked && this.chatAsks.covers(session)) options.push({ id: 'ask', label: 'Ask instead' });
    options.push({ id: 'dismiss', label: 'Cancel' });
    return { title: 'No crew will read this message', question: 'What should happen with your message?', explanation: `No crew will read this message. ${reason} Choose what happens with it below; nothing runs until you choose.${notAsked}`, detail: this.optionLines(session, recovery, options, true), options };
  }

  /** The choice offered when a question meant for an Ask could not be asked in a session whose crew still reads messages: send it to the crew, or leave it. */
  private steeringOffer(session: Session, unasked: string): Json {
    const options: ChoiceOption[] = [{ id: 'steer', label: 'Send it to the crew' }, { id: 'dismiss', label: 'Cancel' }];
    return { title: 'Not answered as an Ask', question: 'What should happen with your message?', explanation: `Your message was not answered as an Ask: ${unasked} No crew has read it. Choose what happens with it below; nothing is sent until you choose.`, detail: this.optionLines(session, undefined, options, true), options };
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
    const asking = this.chatAsks.covers(session) ? 'Or type a question: it is answered as an Ask, and no crew reads it.' : '';
    return { title: 'What next?', question: 'What should happen next?', explanation: [recovery.summary, 'Nothing runs until you choose.', asking, links].filter(Boolean).join('\n\n'), detail: this.optionLines(session, recovery, options, false), options };
  }

  /** Offers the next steps once, after the last stop of a session that stopped by itself or failed and offers no Try Again. It reads the recovery answer and never acts. */
  private offerNextSteps(session: Session, user: User): void {
    if (!['interrupted', 'failed'].includes(session.status) || resumable(session) || this.offering.has(session.id)) return;
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

  /**
   * Turns a message no crew will read into a choice in the person's own turn. A choice still open is answered as replaced first.
   * With `unasked`, the message was meant as an Ask that could not be made: the choice says why, and in a session whose crew
   * still reads messages it offers to send the message to the crew.
   */
  private async offerForMessage(client: Client, session: Session, text: string, origin: Origin, requestedTurnId?: unknown, known?: Recovery, unasked?: { reason: string; steerable: boolean }): Promise<undefined> {
    const recovery = unasked?.steerable ? undefined : known ?? await this.engine.recovery(session.id, client.user);
    const projection = this.projection(session);
    const open = this.openChoice(projection);
    if (open) this.store.appendEvent(session.id, choiceEvents.answered, client.user.id, { choiceId: open.choiceId, option: 'dismiss', response: 'cancel', reply: 'Replaced by your next message.' });
    const turnId = requestedTurnId === undefined ? undefined : this.acceptableTurnId(projection, requestedTurnId) ?? randomUUID();
    if (turnId) projection.origins.set(`turn:${turnId}`, origin);
    const offer = recovery ? this.messageOffer(session, recovery, unasked?.reason) : this.steeringOffer(session, unasked!.reason);
    this.store.appendEvent(session.id, choiceEvents.offered, client.user.id, { choiceId: randomUUID(), ...(turnId ? { turnId } : {}), text, ...offer });
    return undefined;
  }

  /** Whether a typed message in this session is an Ask unless the person says `/steer`: no crew reads its messages, and no review waits for the text. */
  private asksByDefault(session: Session): boolean {
    return closedToMessages(session) && !this.openChoice(this.projection(session))?.review;
  }

  private completionItems(client: Client, params: Json): Json[] {
    if (params.kind !== 'userMessage' || typeof params.text !== 'string' || typeof params.channel !== 'string') return [];
    const session = this.sessionFor(client.user, params.channel);
    if (!session || !this.chatAsks.covers(session)) return [];
    return commandCompletions(params.text, Number.isInteger(params.offset) ? params.offset : params.text.length, this.asksByDefault(session));
  }

  /** Puts an Ask's answer where it was asked: its own turn, the open turn, or the turn of the choice that asked it. Used live and when a projection is rebuilt, so both read the same. */
  private placeAsk(projection: Projection, session: Session, entry: ChatAskEntry): Json[] {
    const own = entry.placement === 'turn' || !projection.activeTurn;
    const actions = own ? [...this.closeTurn(projection, 'complete', entry.at), ...this.openTurn(projection, session, entry.text, entry.at, entry.turnId)] : [];
    const turn = projection.activeTurn!;
    actions.push(...this.addPart(projection, { kind: 'markdown', id: `${turn.id}-ask-${entry.askId}`, content: askMarkdown(this.store.getAsk(entry.askId), entry) }));
    if (own || entry.placement === 'choice') actions.push(...this.closeTurn(projection, 'complete', entry.at));
    return actions;
  }

  private placeAskLive(session: Session, entry: Omit<ChatAskEntry, 'afterEvent' | 'at'>): void {
    this.drain(session);
    const projection = this.projection(session);
    const placed: ChatAskEntry = { ...entry, afterEvent: projection.cursor, at: new Date().toISOString() };
    this.chatAsks.remember(session.id, placed);
    this.publish(session, this.placeAsk(projection, session, placed));
  }

  /** Answers a message as an Ask in the person's own turn, opened once the answer is known. An open "What next?" choice is replaced and offered again after the answer. */
  private async askInTurn(client: Client, session: Session, text: string, origin: Origin, requestedTurnId: unknown, stranded = false): Promise<undefined> {
    let answered: Awaited<ReturnType<ChatAsks['ask']>>;
    try { answered = await this.chatAsks.ask(client.user, session, text); }
    catch (error) { return this.offerForMessage(client, this.store.getSession(session.id) ?? session, text, origin, requestedTurnId, undefined, { reason: reasonOf(error), steerable: !stranded && !closedToMessages(session) }); }
    const current = this.store.getSession(session.id) ?? session;
    const projection = this.projection(current);
    const open = this.openChoice(projection);
    const replaced = open && !open.review ? open : undefined;
    if (replaced) this.store.appendEvent(session.id, choiceEvents.answered, client.user.id, { choiceId: replaced.choiceId, option: 'dismiss', response: 'cancel', reply: 'Replaced by your question.' });
    const turnId = this.acceptableTurnId(projection, requestedTurnId) ?? randomUUID();
    projection.origins.set(`turn:${turnId}`, origin);
    this.placeAskLive(current, { askId: answered.ask.id, placement: 'turn', turnId, text, allowance: answered.allowance });
    if (replaced && typeof replaced.text !== 'string') void this.offerNextStepsAgain(current, client.user);
    return undefined;
  }

  /** Answers a question sent while a turn is open, such as a crew's, as an Ask inside that turn. The pending message stays until the answer is there. */
  private async askInline(client: Client, channel: string, session: Session, action: Json, text: string, origin: Origin, stranded = false): Promise<undefined> {
    this.echo(client, channel, action, origin);
    const settled = () => this.broadcast(channel, { type: 'chat/pendingMessageRemoved', kind: action.kind, id: action.id });
    let answered: Awaited<ReturnType<ChatAsks['ask']>>;
    try { answered = await this.chatAsks.ask(client.user, session, text); }
    catch (error) { settled(); return this.offerForMessage(client, this.store.getSession(session.id) ?? session, text, origin, undefined, undefined, { reason: reasonOf(error), steerable: !stranded && !closedToMessages(session) }); }
    settled();
    this.placeAskLive(this.store.getSession(session.id) ?? session, { askId: answered.ask.id, placement: 'inline', text, allowance: answered.allowance });
    return undefined;
  }

  /** Answers the message of a choice as an Ask after the person picked **Ask instead**, in that choice's turn. */
  private async askForChoice(client: Client, session: Session, choiceId: string, text: string): Promise<void> {
    let answered: Awaited<ReturnType<ChatAsks['ask']>>;
    try { answered = await this.chatAsks.ask(client.user, session, text); }
    catch (error) { this.store.appendEvent(session.id, choiceEvents.reported, client.user.id, { choiceId, reply: `Asking did not work: ${reasonOf(error)}` }); return; }
    this.placeAskLive(this.store.getSession(session.id) ?? session, { askId: answered.ask.id, placement: 'choice', text, allowance: answered.allowance });
  }

  /** Offers a stopped session's next steps again after an Ask replaced them. */
  private async offerNextStepsAgain(session: Session, user: User): Promise<void> {
    const recovery = await this.engine.recovery(session.id, user).catch(() => undefined);
    const current = this.store.getSession(session.id);
    if (!recovery || !current || current.status !== session.status || this.openChoice(this.projection(current))) return;
    const offer = this.closingOffer(current, recovery);
    if (offer) this.store.appendEvent(session.id, choiceEvents.offered, 'system', { choiceId: randomUUID(), ...offer });
  }

  /** Carries out the option the person picked through the recovery API's own calls and owner checks, and records the answer and its result. */
  private async answerChoice(client: Client, session: Session, offered: Json, action: Json, origin: Origin): Promise<string | undefined> {
    if (offered.review) return this.review.answer(client, session, offered, action, origin);
    const choiceId = String(offered.choiceId);
    if (this.answering.has(choiceId)) return 'This choice is already being answered';
    const accepted = action.response === 'accept' && action.cancelled !== true;
    const submitted = accepted && action.answers && typeof action.answers === 'object' ? action.answers as Json : undefined;
    const picked = submitted?.['0']?.value;
    const optionId = accepted ? (picked?.kind === 'selected' ? String(picked.value) : '') : 'dismiss';
    const option = (offered.options as ChoiceOption[]).find(item => item.id === optionId);
    if (!option) return 'Choose one of the offered options';
    if (option.id !== 'dismiss' && option.id !== 'ask' && client.user.role === 'viewer') return 'Viewers cannot change work';
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
        case 'ask': {
          answered({ reply: 'Asking it instead. No crew reads this message.', closes: false });
          void this.askForChoice(client, session, choiceId, String(offered.text ?? '')).finally(() => this.answering.delete(choiceId));
          return undefined;
        }
        case 'steer': {
          answered({ reply: 'Sending it to the crew.' });
          await this.engine.message(session.id, String(offered.text ?? ''), client.user);
          const current = this.store.getSession(session.id) ?? session;
          if (current.status === 'queued') await this.engine.start(session.id, client.user);
          else if (['paused', 'interrupted'].includes(current.status)) await this.engine.resume(session.id, client.user);
          return undefined;
        }
        case 'run_again': case 'run_again_start': {
          const next = this.engine.runAgain(session.id, client.user);
          if (withMessage) await this.engine.message(next.id, String(offered.text), client.user);
          this.announceSession(next);
          let startError: string | undefined;
          if (option.id === 'run_again_start') { try { await this.engine.start(next.id, client.user); this.announceSession(this.store.getSession(next.id) ?? next); } catch (error) { startError = error instanceof Error ? error.message : 'the call failed.'; } }
          answered({ sessionId: next.id, reply: runAgainReply(next, this.sessionPage(next), { started: option.id === 'run_again_start' && !startError, withMessage, startError }) });
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

  /** VS Code's Try Again on a failed turn: the Run-again path, taken only because the person pressed it. The new session waits for its start. */
  private tryAgain(client: Client, session: Session, action: Json, origin: Origin): string | undefined {
    const projection = this.projection(session);
    const refusal = resumeRefusal(session, projection.turns, projection.activeTurn, action.turnId, client.user.role === 'viewer');
    if (refusal) return refusal;
    const turnId = String(action.turnId);
    const next = this.engine.runAgain(session.id, client.user);
    this.announceSession(next);
    projection.origins.set(`resume:${turnId}`, origin);
    this.store.appendEvent(session.id, turnResumedEvent, client.user.id, { turnId, sessionId: next.id, reply: runAgainReply(next, this.sessionPage(next)) });
    return undefined;
  }

  /** Reopens the failed turn Try Again resumed, says what it created, and ends the turn. Without that turn to reopen, the reply gets a turn of its own. */
  private resumeTurn(projection: Projection, session: Session, event: Event): Json[] {
    const data = event.data as Json;
    const turnId = String(data.turnId ?? '');
    const last = projection.turns.at(-1);
    const actions: Json[] = [];
    if (!projection.activeTurn && last?.id === turnId && last.state === 'error') {
      projection.turns.pop();
      projection.activeTurn = { id: last.id, startedAt: last.startedAt, message: last.message, responseParts: last.responseParts, usage: last.usage, outcome: true };
      actions.push(this.tag(projection, { type: 'chat/turnResume', turnId }, `resume:${turnId}`));
    } else {
      projection.origins.delete(`resume:${turnId}`);
      actions.push(...this.closeTurn(projection, 'complete', event.at), ...this.openTurn(projection, session, 'Try again', event.at, undefined, 'systemNotification'));
    }
    const turn = projection.activeTurn!;
    actions.push(...this.addPart(projection, { kind: 'markdown', id: `${turn.id}-try-again-${turn.responseParts.length + 1}`, content: String(data.reply ?? '') }));
    return [...actions, ...this.closeTurn(projection, 'complete', event.at)];
  }

  /** A declined question: recorded, then passed to the crew as an explicit answer for each question. Not while the person is stopping the turn. */
  private async decline(client: Client, session: Session, request: PermissionRequest, origin: Origin): Promise<undefined | string> {
    const projection = this.projection(session);
    if (projection.origins.has('cancel')) return stoppingRefusal;
    const { answers, recorded } = declinedAnswers(request, client.user);
    this.store.appendEvent(session.id, declineEvents.declined, client.user.id, { requestId: request.id, answers: recorded });
    try { return await this.answer(session, request.id, { answers }, client.user, origin); }
    catch (error) { this.store.appendEvent(session.id, declineEvents.withdrawn, client.user.id, { requestId: request.id }); throw error; }
  }

  private async dispatchToPending(client: Client, channel: string, kind: ChannelKind, pending: PendingSession, action: Json, origin: Origin): Promise<string | undefined> {
    switch (action.type) {
      case 'chat/turnStarted': return kind === 'chat' ? this.startFromPending(pending, action.message ?? {}, origin, action.turnId) : 'chat/turnStarted is dispatched on the chat channel';
      case 'session/activeClientSet': case 'session/activeClientRemoved': return kind === 'session' ? this.setActiveClient(client, channel, pending.id, action, origin) : `${action.type} is dispatched on the session channel`;
      case 'chat/draftChanged': this.echo(client, channel, action, origin); return undefined;
      case 'session/configChanged': return kind === 'session' ? this.changePendingConfig(client, channel, pending, action, origin) : 'session/configChanged is dispatched on the session channel';
      default: return customizationRefusal(action.type) ?? `${String(action.type)} waits until the first message starts the session`;
    }
  }

  private async dispatchToSession(client: Client, channel: string, kind: ChannelKind, session: Session, action: Json, origin: Origin): Promise<string | undefined> {
    const ended = ['completed', 'cancelled', 'failed'].includes(session.status);
    const notOnChat = kind === 'chat' ? undefined : `${String(action.type)} is dispatched on the chat channel`;
    switch (action.type) {
      case 'chat/turnStarted': {
        if (notOnChat) return notOnChat;
        const feedback = this.review.feedback(session, action.message);
        if (feedback) { const submitted = this.review.submitFeedback(client, session, feedback, action, origin); if (submitted !== false) return submitted; }
        const { intent, text } = messageIntent(action.message);
        if (!text) return intent === 'ask' ? 'Type a question after /ask' : 'Empty message';
        if (!feedback && (intent === 'ask' || (intent !== 'steer' && this.chatAsks.covers(session) && this.asksByDefault(session)))) return this.askInTurn(client, session, text, origin, action.turnId ?? null);
        if (session.status === 'completed') return this.reviewOperations(session).length ? 'This candidate waits for your review. Accept it, request changes or reject it from the Changes view, or comment on its files and submit the comments.' : 'The session has completed; start a new session';
        if (feedback) return this.dispatchToSession(client, channel, kind, session, { ...action, message: { ...action.message, text: `/steer ${this.review.feedbackInstruction(action.message, feedback)}`, attachments: undefined } }, origin);
        if (ended || this.openChoice(this.projection(session))) return this.offerForMessage(client, session, text, origin, action.turnId ?? null);
        const projection = this.projection(session);
        const turnId = this.acceptableTurnId(projection, action.turnId) ?? randomUUID();
        projection.origins.set(`turn:${turnId}`, origin);
        try { await this.engine.message(session.id, text, client.user, turnId); }
        catch (error) {
          projection.origins.delete(`turn:${turnId}`);
          if ((error as { code?: unknown })?.code !== 'session_stranded') throw error;
          if (intent !== 'steer' && this.chatAsks.covers(session)) return this.askInTurn(client, session, text, origin, action.turnId ?? null, true);
          return this.offerForMessage(client, session, text, origin, action.turnId ?? null);
        }
        if (session.status === 'queued') await this.engine.start(session.id, client.user);
        else if (['paused', 'interrupted'].includes(session.status)) await this.engine.resume(session.id, client.user);
        return undefined;
      }
      case 'chat/turnResume': return notOnChat ?? this.tryAgain(client, session, action, origin);
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
        if (action.response !== 'accept') return this.decline(client, session, request, origin);
        const submitted = action.answers && typeof action.answers === 'object' ? action.answers as Json : undefined;
        const answers = this.answersFor(request, submitted);
        return this.answer(session, request.id, { answers: answers.length ? answers : [['']] }, client.user, origin, submitted);
      }
      case 'chat/pendingMessageSet': {
        if (notOnChat) return notOnChat;
        if (!['steering', 'queued'].includes(action.kind) || typeof action.id !== 'string' || !action.id) return 'A pending message needs a kind, steering or queued, and an id';
        if (action.message?.origin?.kind !== 'user') return 'Only a person\'s own message becomes an instruction';
        const { intent, text } = messageIntent(action.message);
        if (!text) return intent === 'ask' ? 'Type a question after /ask' : 'Empty message';
        if (intent === 'ask' || (intent !== 'steer' && this.chatAsks.covers(session) && this.asksByDefault(session))) return this.askInline(client, channel, session, action, text, origin);
        if (session.status === 'completed') return 'The session has completed; start a new session';
        const settled = () => { this.echo(client, channel, action, origin); this.broadcast(channel, { type: 'chat/pendingMessageRemoved', kind: action.kind, id: action.id }); };
        const choose = async () => { const recovery = await this.engine.recovery(session.id, client.user); settled(); return this.offerForMessage(client, session, text, origin, undefined, recovery); };
        if (ended || this.openChoice(this.projection(session))) return choose();
        try { await this.engine.message(session.id, text, client.user); }
        catch (error) {
          if ((error as { code?: unknown })?.code !== 'session_stranded') throw error;
          return intent !== 'steer' && this.chatAsks.covers(session) ? this.askInline(client, channel, session, action, text, origin, true) : choose();
        }
        settled();
        return undefined;
      }
      case 'chat/pendingMessageRemoved': return 'A pending message becomes an instruction for the next execution as soon as it arrives, so none is left to remove';
      case 'chat/queuedMessagesReordered': { if (notOnChat) return notOnChat; this.echo(client, channel, action, origin); return undefined; }
      case 'chat/truncated': return 'Unfold keeps a session\'s history as durable evidence, so it cannot be truncated; start a new session instead';
      case 'session/titleChanged': return kind === 'changeset' ? 'session/titleChanged is dispatched on the session or chat channel' : this.renameSession(client, channel, session, action, origin);
      case 'session/activeClientSet': case 'session/activeClientRemoved': return kind === 'session' ? this.setActiveClient(client, channel, this.publicId(session.id), action, origin) : `${action.type} is dispatched on the session channel`;
      case 'session/configChanged': return kind === 'session' ? this.changeStartedConfig(client, channel, session, action, origin) : 'session/configChanged is dispatched on the session channel';
      case 'chat/draftChanged': case 'chat/inputAnswerChanged': case 'changeset/filesReviewChanged': this.echo(client, channel, action, origin); return undefined;
      default: return customizationRefusal(action.type) ?? `Unsupported action ${String(action.type)}`;
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
        const refusal = action.type === 'root/configChanged' ? rootConfigRefusal(action.config) : `Unsupported action ${String(action.type)}`;
        if (refusal) reject(refusal); else this.echo(client, channel, action, origin, () => false);
        return;
      }
      if (parseAnnotationsChannel(channel)) { const refused = this.review.dispatchAnnotation(client, channel, action, origin); if (refused) reject(refused); return; }
      if (channel === automationsChannel) { reject(this.automations.refuse(action)); return; }
      const terminal = parseTerminalChannel(channel);
      if (terminal) { reject(this.sessionFor(client.user, sessionChannel(terminal.sessionId)) ? readOnlyTerminal : 'Terminal not found'); return; }
      const parsed = parseChannel(channel);
      if (!parsed) { reject('Unknown channel'); return; }
      if (parsed.run) { reject('A Run\'s chat is read-only; send messages in the session\'s chat'); return; }
      if (isWorkItemSession(parsed.id)) { const refused = await this.dispatchToWorkItem(client, channel, parsed.kind, parsed.id, action, origin); if (refused) reject(refused); return; }
      const pending = parsed.kind !== 'changeset' ? this.pending.get(parsed.id) : undefined;
      if (pending && !this.mayView(client.user, pending.user.id)) { reject('Session not found'); return; }
      const flag = viewFlags[String(action.type)];
      const session = pending ? undefined : this.sessionFor(client.user, channel);
      if (!pending && !session) { reject('Session not found'); return; }
      const reason = !pending && this.review.handlesConfig(action) ? (parsed.kind === 'session' ? this.review.agentMerge(client, channel, session!, action, origin) : 'session/configChanged is dispatched on the session channel')
        : flag ? this.setViewFlag(client, channel, parsed.kind, pending, action, origin, flag)
        : pending ? await this.dispatchToPending(client, channel, parsed.kind, pending, action, origin)
        : await this.dispatchToSession(client, channel, parsed.kind, session!, action, origin);
      if (reason) reject(reason);
    } catch (error) {
      reject(error instanceof Error ? error.message : 'Action failed');
    }
  }
}
