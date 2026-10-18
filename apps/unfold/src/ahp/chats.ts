import { randomUUID } from 'node:crypto';
import type { AgentHostView, Store } from '../store.ts';
import type { User } from '../types.ts';
import { ChatStore } from '../chat/store.ts';
import type { ChatRecord, ChatTurn } from '../chat/types.ts';
import type { ChatHistoryEntry, ChatService, ToolAnswer, ToolView, TurnOutcome, TurnView } from '../chat/service.ts';
import { sessionChatCatalog } from './versions.ts';
import { money } from '../../public/core/format.js';

type Json = Record<string, any>;

/** The provider of the conversational agent the Agents window lists as "Unfold", beside the "Unfold teams" sessions (Unfold ADR 0049, proposed). */
export const chatProvider = 'unfold-chat';
/** The one model entry the chat agent advertises; the Team's Ask model answers behind it. */
export const chatModelId = 'unfold-chat';
/** Who a chat action is sent to and how they spell its channels. */
export type ChatView = { user: User; scheme: string; protocolVersion: string };
/** How the chat sessions reach the person's clients and the host's shared state. */
export type ChatPort = {
  broadcast(channel: string, action: Json | ((viewer: ChatView) => Json), ownerId: string): void;
  root(method: string, params: (viewer: ChatView) => Json, ownerId: string): void;
  view(userId: string, publicId: string): AgentHostView;
  activeClients(publicId: string): Json[];
};

/** A chat session's channel in a client's spelling: `unfold-chat:/<id>` for a VS Code 1.141 window, `ahp-session:/<id>` for every other client. */
export const chatSessionUri = (id: string, scheme: string) => `${scheme === 'ahp-session' ? 'ahp-session' : chatProvider}:/${id}`;
/** A chat session's default chat, derived from its session URI in the same spelling, as VS Code derives it. */
export const chatChatUri = (id: string, scheme: string) => `ahp-chat://default/${Buffer.from(chatSessionUri(id, scheme)).toString('base64url')}`;

/** The options a tool call awaiting confirmation offers. */
export const chatConfirmOptions = [{ id: 'allow', label: 'Allow', kind: 'approve' }, { id: 'deny', label: 'Deny', kind: 'deny' }] as const;
/** The longest message the chat takes, as Ploeg's chat admission does. */
export const chatMessageLimit = 4000;

const statusBits = { idle: 1, inProgress: 8, inputNeeded: 24, isRead: 32 } as const;
const historyTurns = 10;
const snapshotTurns = 200;
const clientTurnId = /^[A-Za-z0-9_.:-]{1,128}$/;
const allowanceSuffix = '-allowance';
const interrupted = 'Unfold restarted while answering, so this answer was lost and its key was finished. Send your message again.';

type PendingChat = { id: string; owner: User; team: string; title?: string; createdAt: string };
type Waiting = { part: Json; resolve(approved: boolean): void };
type Runner = { chat: ChatRecord; turn: ChatTurn; abort: AbortController; waiting: Map<string, Waiting>; cancelled: boolean };

const clip = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, max)}…`;
const resetDay = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso));
const durationOf = (turn: ChatTurn, at: string) => Math.max(0, Date.parse(at) - Date.parse(turn.startedAt)) || 0;
function summaryOf(text: string): string | undefined {
  try { const value = JSON.parse(text); return typeof value?.summary === 'string' && value.summary.trim() ? value.summary.trim() : undefined; } catch { return undefined; }
}

/**
 * The person's conversations with Unfold in the Agents window, each a session of the `unfold-chat` provider with one
 * chat. Messages, tool calls, results and errors are kept in Unfold's store, so a snapshot after a reconnect or a
 * restart shows the whole history. Only the person who started a chat sees it.
 */
export class ChatSessions {
  service?: ChatService;
  /** How long a tool call waits for the person to allow or deny it before it counts as denied. */
  confirmationTimeoutMs = 300_000;
  private readonly store: Store;
  private readonly chats: ChatStore;
  private readonly port: ChatPort;
  private readonly pending = new Map<string, PendingChat>();
  private readonly running = new Map<string, Runner>();

  constructor(store: Store, port: ChatPort) {
    this.store = store; this.port = port; this.chats = new ChatStore(store.db);
  }

  get available(): boolean { return Boolean(this.service); }

  /** Whether a session id is a chat, started or still waiting for its first message. */
  has(id: string): boolean { return this.pending.has(id) || Boolean(this.chats.get(id)); }

  /** Whether `user` may see and use the chat: only the person who started it. */
  owns(user: User, id: string): boolean { return (this.pending.get(id)?.owner.id ?? this.chats.get(id)?.owner.id) === user.id; }

  /** The chat agent's entry in the root state. */
  agent(): Json {
    return {
      provider: chatProvider, displayName: 'Unfold', description: 'Chat with Unfold: ask what waits for you, and act on Work Items after you confirm. Each message is paid from your Team\'s chat allowance.',
      models: [{ id: chatModelId, name: this.service?.demo ? 'Demo · no model calls' : 'Your Team\'s Ask model', provider: chatProvider }],
      protectedResources: [],
    };
  }

  private async teams(user: User): Promise<{ id: string; name: string }[]> { return this.service ? this.service.teams(user) : []; }

  /** The configuration schema of a chat: the Team whose chat allowance pays, from the Teams the person may use, each with what is left of it. */
  async schema(user: User): Promise<Json> {
    const teams = await this.teams(user);
    const demo = this.service?.demo === true;
    const allowances = demo ? [] : await Promise.all(teams.slice(0, 20).map(team => this.service!.allowance(user, team.id)));
    const team = teams.length
      ? { type: 'string', title: 'Team', description: 'The Team whose chat allowance pays for each message', enum: teams.map(entry => entry.id), enumLabels: teams.map(entry => entry.name || entry.id), enumDescriptions: teams.map((_, index) => demo ? 'Demo: no model calls, nothing spent' : allowances[index] ? `${money(allowances[index]!.remainingUsd)} of ${money(allowances[index]!.limitUsd)} left until ${resetDay(allowances[index]!.resetAt)}` : 'Chat allowance not reported'), default: teams[0].id, sessionMutable: true }
      : { type: 'string', title: 'Team', description: 'No Ploeg Team is available to you, so the chat cannot pay for a message. Ask an administrator.', readOnly: true };
    return { type: 'object', properties: { team, title: { type: 'string', title: 'Chat title' } }, required: teams.length ? ['team'] : [] };
  }

  /** What `resolveSessionConfig` answers for a new chat: the requested Team when the person may use it, otherwise their first. */
  async resolve(user: User, requested: unknown): Promise<{ schema: Json; values: Json }> {
    const asked = requested && typeof requested === 'object' && !Array.isArray(requested) ? requested as Json : {};
    const teams = await this.teams(user);
    const team = teams.some(entry => entry.id === asked.team) ? String(asked.team) : teams[0]?.id ?? '';
    return { schema: await this.schema(user), values: { team, ...(typeof asked.title === 'string' && asked.title.trim() ? { title: asked.title.trim().slice(0, 160) } : {}) } };
  }

  /** Accepts a new chat from `createSession`; answers why when the requested Team is not one the person may use. */
  async create(user: User, id: string, requested: unknown): Promise<string | undefined> {
    const asked = requested && typeof requested === 'object' && !Array.isArray(requested) ? requested as Json : {};
    const teams = await this.teams(user);
    if (asked.team !== undefined && !teams.some(entry => entry.id === asked.team)) return 'Choose one of your Teams to pay for this chat';
    const { values } = await this.resolve(user, asked);
    this.pending.set(id, { id, owner: user, team: values.team, ...(values.title ? { title: values.title } : {}), createdAt: new Date().toISOString() });
    return undefined;
  }

  /** The person's chats for `listSessions`, newest first. */
  list(user: User, view: ChatView): Json[] {
    const pending = [...this.pending.values()].filter(entry => entry.owner.id === user.id).map(entry => this.summary(entry.id, view)!);
    return [...pending, ...this.chats.owned(user.id).map(chat => this.summary(chat.id, view)!)];
  }

  private read(id: string): ChatRecord | undefined {
    const chat = this.chats.get(id);
    if (chat) this.settleInterrupted(chat);
    return chat;
  }

  private settleInterrupted(chat: ChatRecord): void {
    if (this.running.has(chat.id)) return;
    const [last] = this.chats.turns(chat.id, 1);
    if (!last || last.state !== 'active') return;
    const at = new Date().toISOString();
    last.responseParts = last.responseParts.map(part => part.kind === 'toolCall' && ['streaming', 'running', 'pending-confirmation'].includes(part.toolCall.status) ? { ...part, toolCall: { ...part.toolCall, status: 'cancelled', reason: 'skipped' } } : part);
    last.responseParts.push({ kind: 'error', error: { errorType: 'interrupted', message: interrupted } });
    Object.assign(last, { state: 'error', finishedAt: at });
    this.chats.saveTurn(last);
    if (last.admission && this.service) void this.service.abandon({ id: chat.owner.id, name: chat.owner.name, role: chat.owner.role }, last.admission.team, last.admission.chatId);
  }

  private title(id: string): string { return this.pending.get(id)?.title ?? this.chats.get(id)?.title ?? 'New chat'; }

  private activityBits(id: string): number {
    const runner = this.running.get(id);
    return runner ? (runner.waiting.size ? statusBits.inputNeeded : statusBits.inProgress) : statusBits.idle;
  }

  private activity(id: string): string | undefined {
    const runner = this.running.get(id);
    if (runner) return runner.waiting.size ? 'Waiting for your confirmation' : 'Answering';
    if (this.service?.demo) return 'Demo · no model calls';
    const chat = this.chats.get(id);
    return chat?.allowance ? `${money(chat.allowance.remainingUsd)} of Team ${chat.team}'s chat allowance left` : undefined;
  }

  /** A chat's summary for `listSessions` and the root channel, in the viewer's spelling, with their own read and archive marks. */
  summary(id: string, view: ChatView): Json | undefined {
    const pending = this.pending.get(id);
    const chat = pending ? undefined : this.read(id);
    if (!pending && !chat) return undefined;
    const flags = this.port.view(view.user.id, id);
    const activity = this.activity(id);
    return {
      resource: chatSessionUri(id, view.scheme), provider: chatProvider, title: this.title(id), status: this.activityBits(id) | flags.session, ...(activity ? { activity } : {}),
      createdAt: pending?.createdAt ?? chat!.createdAt, modifiedAt: pending?.createdAt ?? chat!.updatedAt,
      ...sessionChatCatalog(view.protocolVersion, this.chatSummary(id, view)),
      _meta: { 'dev.webgrip.unfold': { kind: 'chat', team: pending?.team ?? chat!.team } },
    };
  }

  /** The bits a chat's status has before the viewer's own marks. */
  status(id: string): number { return this.activityBits(id); }

  chatSummary(id: string, view: ChatView): Json {
    const flags = this.port.view(view.user.id, id);
    const activity = this.activity(id);
    return { resource: chatChatUri(id, view.scheme), title: this.title(id), status: this.activityBits(id) | flags.chat, ...(activity ? { activity } : {}), modifiedAt: this.pending.get(id)?.createdAt ?? this.chats.get(id)?.updatedAt, origin: { kind: 'user' }, interactivity: 'full' };
  }

  private values(id: string): Json {
    const pending = this.pending.get(id);
    const chat = pending ? undefined : this.chats.get(id);
    const title = pending?.title ?? chat?.title;
    return { team: pending?.team ?? chat?.team ?? '', ...(title ? { title } : {}) };
  }

  private inputNeeded(id: string, view: ChatView): Json[] {
    const runner = this.running.get(id);
    return runner ? [...runner.waiting.entries()].map(([toolCallId, waiting]) => ({ id: toolCallId, chat: chatChatUri(id, view.scheme), kind: 'toolConfirmation', turnId: runner.turn.id, toolCall: waiting.part.toolCall })) : [];
  }

  /** The snapshot of a chat's session or chat channel. */
  async snapshot(user: User, view: ChatView, kind: 'session' | 'chat', id: string): Promise<Json | undefined> {
    const summary = this.summary(id, view);
    if (!summary) return undefined;
    if (kind === 'session') return { ...summary, lifecycle: 'ready', activeClients: this.port.activeClients(id), chats: [this.chatSummary(id, view)], defaultChat: chatChatUri(id, view.scheme), config: { schema: await this.schema(user), values: this.values(id) }, customizations: [], changesets: [], inputNeeded: this.inputNeeded(id, view) };
    const turns = this.pending.has(id) ? [] : this.chats.turns(id, snapshotTurns);
    const done = turns.filter(turn => turn.state !== 'active').map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.finishedAt ? durationOf(turn, turn.finishedAt) : 0, message: { text: turn.text, origin: { kind: 'user' } }, responseParts: turn.responseParts, state: turn.state }));
    const active = this.running.get(id)?.turn;
    return { ...this.chatSummary(id, view), turns: done, ...(active ? { activeTurn: { id: active.id, startedAt: active.startedAt, message: { text: active.text, origin: { kind: 'user' } }, responseParts: active.responseParts } } : {}), changesets: [] };
  }

  /** The turn being answered in a chat, if any. */
  openTurn(id: string): string | undefined { return this.running.get(id)?.turn.id; }

  private announce(chat: { id: string }, ownerId: string): void {
    const id = chat.id;
    this.port.root('root/sessionSummaryChanged', viewer => { const summary = this.summary(id, viewer)!; return { session: summary.resource, changes: { title: summary.title, status: summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt, ...(summary.chats ? { chats: summary.chats, defaultChat: summary.defaultChat } : {}) } }; }, ownerId);
    this.port.broadcast(chatSessionUri(id, 'ahp-session'), viewer => { const summary = this.chatSummary(id, viewer); return { type: 'session/chatUpdated', chat: summary.resource, changes: { title: summary.title, status: summary.status, activity: summary.activity ?? null, modifiedAt: summary.modifiedAt } }; }, ownerId);
    const activity = this.activity(id);
    this.port.broadcast(chatSessionUri(id, 'ahp-session'), { type: 'session/activityChanged', activity }, ownerId);
    this.port.broadcast(chatChatUri(id, 'ahp-session'), { type: 'chat/activityChanged', ...(activity ? { activity } : {}) }, ownerId);
  }

  private materialize(id: string): ChatRecord | undefined {
    const pending = this.pending.get(id);
    if (!pending) return this.read(id);
    return { id, owner: { id: pending.owner.id, name: pending.owner.name, role: pending.owner.role }, title: pending.title ?? '', team: pending.team, createdAt: pending.createdAt, updatedAt: pending.createdAt, allowance: null };
  }

  /**
   * A person's message: refused with a reason, or accepted, echoed through `echo` with the turn id it keeps, and answered.
   * There is no brief threshold: "hi" gets an answer like any other message.
   */
  message(user: User, id: string, action: Json, echo: (accepted: Json) => void): string | undefined {
    if (!this.service) return 'Chat is not available in this workbench.';
    if (action.message?.origin?.kind && action.message.origin.kind !== 'user') return 'Only your own message starts a chat turn';
    const text = typeof action.message?.text === 'string' ? action.message.text.trim() : '';
    if (!text) return 'Empty message';
    if (text.length > chatMessageLimit) return `A chat message is at most ${chatMessageLimit.toLocaleString('en-GB')} characters.`;
    if (this.running.has(id)) return 'Unfold is still answering your last message. Wait for it, or press Stop.';
    const chat = this.materialize(id);
    if (!chat) return 'Session not found';
    const known = new Set(this.chats.turns(id, snapshotTurns).map(turn => turn.id));
    const turnId = typeof action.turnId === 'string' && clientTurnId.test(action.turnId) && !known.has(action.turnId) ? action.turnId : randomUUID();
    const startedAt = new Date().toISOString();
    const first = this.pending.delete(id);
    if (!chat.title) chat.title = clip(text.split('\n')[0].trim(), 80);
    chat.updatedAt = startedAt;
    const turn: ChatTurn = { chatId: id, id: turnId, seq: this.chats.nextSeq(id), startedAt, finishedAt: null, text, responseParts: [], state: 'active', admission: null };
    this.store.transaction(() => { this.chats.save(chat); this.chats.saveTurn(turn); });
    echo({ ...action, turnId, startedAt: typeof action.startedAt === 'string' ? action.startedAt : startedAt, message: { ...action.message, text: action.message.text, origin: { kind: 'user' } } });
    const runner: Runner = { chat, turn, abort: new AbortController(), waiting: new Map(), cancelled: false };
    this.running.set(id, runner);
    if (first) this.store.clearAgentHostFlags(id, statusBits.isRead, startedAt);
    this.announce(chat, user.id);
    void this.run(user, runner);
    return undefined;
  }

  private history(chatId: string, current: string): ChatHistoryEntry[] {
    const turns = this.chats.turns(chatId, historyTurns + 1).filter(turn => turn.id !== current && turn.state === 'complete').slice(-historyTurns);
    return turns.flatMap(turn => {
      const said = turn.responseParts.filter(part => part.kind === 'markdown' && !String(part.id).endsWith(allowanceSuffix)).map(part => String(part.content)).join('\n\n').trim();
      return [{ role: 'user' as const, content: clip(turn.text, 2000) }, ...(said ? [{ role: 'assistant' as const, content: clip(said, 4000) }] : [])];
    });
  }

  private async run(user: User, runner: Runner): Promise<void> {
    const { chat, turn } = runner;
    const chatUri = chatChatUri(chat.id, 'ahp-session');
    const sessionUri = chatSessionUri(chat.id, 'ahp-session');
    const emit = (action: Json) => { if (!runner.cancelled) this.port.broadcast(chatUri, action, chat.owner.id); };
    const save = () => this.chats.saveTurn(turn);
    const view: TurnView = {
      say: markdown => {
        const part = { kind: 'markdown', id: `${turn.id}-part-${turn.responseParts.length + 1}`, content: markdown };
        turn.responseParts.push(part); save();
        emit({ type: 'chat/responsePart', turnId: turn.id, part });
      },
      admitted: (team, chatId) => { turn.admission = { team, chatId }; save(); },
      tool: ({ name, title, input }): ToolView => {
        const toolCallId = `${turn.id}-tool-${turn.responseParts.length + 1}`;
        const part: Json = { kind: 'toolCall', toolCall: { toolCallId, toolName: name, displayName: title, status: 'streaming' } };
        turn.responseParts.push(part); save();
        emit({ type: 'chat/toolCallStart', turnId: turn.id, toolCallId, toolName: name, displayName: title });
        const invocationMessage = title;
        return {
          run: () => {
            part.toolCall = { ...part.toolCall, status: 'running', invocationMessage, toolInput: input, confirmed: 'not-needed' }; save();
            emit({ type: 'chat/toolCallReady', turnId: turn.id, toolCallId, invocationMessage, toolInput: input, confirmed: 'not-needed' });
          },
          confirm: confirmationTitle => new Promise<boolean>(resolve => {
            if (runner.cancelled) { resolve(false); return; }
            part.toolCall = { ...part.toolCall, status: 'pending-confirmation', invocationMessage, toolInput: input, confirmationTitle, options: chatConfirmOptions };
            save();
            emit({ type: 'chat/toolCallReady', turnId: turn.id, toolCallId, invocationMessage, toolInput: input, confirmationTitle, options: chatConfirmOptions });
            const timer = setTimeout(() => this.decide(runner, toolCallId, false, true), this.confirmationTimeoutMs);
            timer.unref();
            runner.waiting.set(toolCallId, { part, resolve: approved => { clearTimeout(timer); resolve(approved); } });
            this.port.broadcast(sessionUri, viewer => ({ type: 'session/inputNeededSet', request: this.inputNeeded(chat.id, viewer).find(request => request.id === toolCallId) }), chat.owner.id);
            this.announce(chat, chat.owner.id);
          }),
          done: (answer: ToolAnswer) => {
            const summary = summaryOf(answer.text);
            const pastTenseMessage = clip(answer.ok ? summary ?? `Ran ${title}` : `${title} failed: ${summary ?? answer.text}`, 300);
            const result = { success: answer.ok, pastTenseMessage, content: [{ type: 'text', text: clip(answer.text, 4000) }], ...(answer.ok ? {} : { error: { message: clip(summary ?? answer.text, 500) } }) };
            part.toolCall = { ...part.toolCall, status: 'completed', ...result }; save();
            emit({ type: 'chat/toolCallComplete', turnId: turn.id, toolCallId, result });
          },
        };
      },
    };
    let outcome: TurnOutcome;
    try { outcome = await this.service!.respond(user, chat.team, turn.text, this.history(chat.id, turn.id), view, runner.abort.signal); }
    catch { outcome = { state: 'error', error: { errorType: 'chat_failed', message: 'The chat failed to answer. Try again.' } }; }
    this.end(runner, runner.cancelled ? { state: 'cancelled', allowance: outcome.allowance } : outcome);
  }

  private end(runner: Runner, outcome: TurnOutcome): void {
    const { chat, turn } = runner;
    const at = new Date().toISOString();
    const chatUri = chatChatUri(chat.id, 'ahp-session');
    const duration = durationOf(turn, at);
    if (outcome.allowance !== undefined && outcome.allowance !== null) chat.allowance = outcome.allowance;
    if (outcome.state === 'complete' && outcome.allowance) {
      const part = { kind: 'markdown', id: `${turn.id}${allowanceSuffix}`, content: `\n\n*Team ${chat.team} · ${money(outcome.allowance.remainingUsd)} of ${money(outcome.allowance.limitUsd)} chat allowance left, until ${resetDay(outcome.allowance.resetAt)}*` };
      turn.responseParts.push(part);
      if (!runner.cancelled) this.port.broadcast(chatUri, { type: 'chat/responsePart', turnId: turn.id, part }, chat.owner.id);
    }
    if (outcome.state === 'error') turn.responseParts.push({ kind: 'error', error: outcome.error });
    Object.assign(turn, { state: outcome.state, finishedAt: at });
    chat.updatedAt = at;
    this.running.delete(chat.id);
    if (this.chats.get(chat.id)) this.store.transaction(() => { this.chats.saveTurn(turn); this.chats.save(chat); });
    else return;
    if (!runner.cancelled) {
      if (outcome.state === 'error') this.port.broadcast(chatUri, { type: 'chat/error', turnId: turn.id, duration, part: { kind: 'error', error: outcome.error } }, chat.owner.id);
      else this.port.broadcast(chatUri, { type: 'chat/turnComplete', turnId: turn.id, duration }, chat.owner.id);
    }
    this.store.clearAgentHostFlags(chat.id, statusBits.isRead, at);
    this.announce(chat, chat.owner.id);
  }

  private decide(runner: Runner, toolCallId: string, approved: boolean, announced: boolean): void {
    const waiting = runner.waiting.get(toolCallId);
    if (!waiting) return;
    runner.waiting.delete(toolCallId);
    waiting.part.toolCall = approved ? { ...waiting.part.toolCall, status: 'running', confirmed: 'user-action' } : { ...waiting.part.toolCall, status: 'cancelled', reason: 'denied' };
    this.chats.saveTurn(runner.turn);
    const owner = runner.chat.owner.id;
    if (announced && !runner.cancelled) this.port.broadcast(chatChatUri(runner.chat.id, 'ahp-session'), { type: 'chat/toolCallConfirmed', turnId: runner.turn.id, toolCallId, approved: false, reason: 'denied' }, owner);
    this.port.broadcast(chatSessionUri(runner.chat.id, 'ahp-session'), { type: 'session/inputNeededRemoved', id: toolCallId }, owner);
    this.announce(runner.chat, owner);
    waiting.resolve(approved);
  }

  /** The person's answer to a tool call awaiting confirmation: refused with a reason, or the action to echo and then carry out. A denial is returned to the model as declined. */
  confirmation(user: User, id: string, action: Json): { refused: string } | { action: Json; apply(): void } {
    const runner = this.running.get(id);
    const toolCallId = String(action.toolCallId ?? '');
    if (!runner || !runner.waiting.has(toolCallId) || (action.turnId !== undefined && action.turnId !== runner.turn.id)) return { refused: 'No tool call waits for your confirmation here' };
    const approved = action.approved !== false && action.selectedOptionId !== 'deny';
    const echoed = approved
      ? { type: 'chat/toolCallConfirmed', turnId: runner.turn.id, toolCallId, approved: true, confirmed: 'user-action', selectedOptionId: typeof action.selectedOptionId === 'string' ? action.selectedOptionId : 'allow' }
      : { type: 'chat/toolCallConfirmed', turnId: runner.turn.id, toolCallId, approved: false, reason: 'denied', selectedOptionId: 'deny' };
    return { action: echoed, apply: () => this.decide(runner, toolCallId, approved, false) };
  }

  /** Stops the turn being answered: the model call is aborted, an open confirmation counts as denied and the key is finished. */
  cancel(user: User, id: string, turnId: unknown): string | undefined {
    const runner = this.running.get(id);
    if (!runner) return 'Nothing is being answered in this chat';
    if (turnId !== undefined && turnId !== runner.turn.id) return 'That turn is not being answered';
    runner.cancelled = true;
    runner.abort.abort();
    for (const toolCallId of [...runner.waiting.keys()]) this.decide(runner, toolCallId, false, false);
    return undefined;
  }

  /** Changes the Team that pays, or the title, of a chat; the next message is admitted against the new Team. */
  async configure(user: User, id: string, change: unknown): Promise<{ refused: string } | { values: Json }> {
    const asked = change && typeof change === 'object' && !Array.isArray(change) ? change as Json : {};
    if (asked.team !== undefined && !(await this.teams(user)).some(entry => entry.id === asked.team)) return { refused: 'Choose one of your Teams to pay for this chat' };
    const pending = this.pending.get(id);
    const chat = pending ? undefined : this.read(id);
    const title = typeof asked.title === 'string' && asked.title.trim() ? asked.title.trim().slice(0, 160) : undefined;
    if (pending) { if (asked.team !== undefined) pending.team = String(asked.team); if (title) pending.title = title; }
    else if (chat) { if (asked.team !== undefined) chat.team = String(asked.team); if (title) chat.title = title; chat.updatedAt = new Date().toISOString(); this.chats.save(chat); if (this.running.has(id)) this.running.get(id)!.chat.team = chat.team; }
    else return { refused: 'Session not found' };
    this.announce({ id }, user.id);
    return { values: this.values(id) };
  }

  /** Renames a chat; answers the title kept. */
  rename(user: User, id: string, title: unknown): string | undefined {
    const text = typeof title === 'string' ? title.trim().slice(0, 160) : '';
    if (!text) return undefined;
    const pending = this.pending.get(id);
    if (pending) pending.title = text;
    else { const chat = this.chats.get(id); if (!chat) return undefined; chat.title = text; chat.updatedAt = new Date().toISOString(); this.chats.save(chat); const runner = this.running.get(id); if (runner) runner.chat.title = text; }
    this.announce({ id }, user.id);
    return text;
  }

  /** Deletes a chat and its history; a turn still being answered is stopped first, so its key is finished. */
  dispose(user: User, id: string): void {
    if (this.running.has(id)) this.cancel(user, id, undefined);
    this.pending.delete(id);
    this.chats.delete(id);
    this.store.deleteAgentHostViews(id);
  }
}
