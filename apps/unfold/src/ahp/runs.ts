import type { Event, Session } from '../types.ts';

type Json = Record<string, any>;

/** The tool name of the call by which a Role's Run appears in the session's chat, as a subagent VS Code nests the Run's own tool calls under. */
export const runToolName = 'unfold_run';
/** The tool name of the call that carries a write Run's file changes, read from its native file diff. */
export const changesToolName = 'unfold_changes';
/** The tool name of the call that carries the captured candidate's file changes. */
export const candidateToolName = 'unfold_candidate';

/** The URIs a client spells a session and its default chat with. */
export type Spelling = { session: string; chat: string };

const sessionUri = /^(unfold|ahp-session):\/([A-Za-z0-9_-]{1,80})$/;
const runChat = /^ahp-chat:\/\/subagent\/([A-Za-z0-9_-]{1,400})\/([^/]{1,600})$/;
const toolCallIdPattern = /^[A-Za-z0-9_.:-]{1,200}$/;

/** The chat VS Code derives for the subagent a tool call spawned: `ahp-chat://subagent/`, the session URI in unpadded base64url, and the tool call id. */
export const runChatChannel = (session: string, toolCallId: string) => `ahp-chat://subagent/${Buffer.from(session).toString('base64url')}/${encodeURIComponent(toolCallId)}`;

/** Parses a Run's chat in either session spelling into the public session id and the tool call that spawned it. */
export function parseRunChannel(uri: string): { id: string; run: string } | undefined {
  const match = runChat.exec(uri);
  if (!match) return undefined;
  const session = sessionUri.exec(Buffer.from(match[1], 'base64url').toString('utf8'));
  let toolCallId: string;
  try { toolCallId = decodeURIComponent(match[2]); } catch { return undefined; }
  return session && toolCallIdPattern.test(toolCallId) ? { id: session[2], run: toolCallId } : undefined;
}

type RunStatus = 'running' | 'completed' | 'failed' | 'stopped';
type RunChat = {
  toolCallId: string; runId: string; role: string; mode: 'read' | 'write'; description: string;
  parentTurnId: string; startedAt: string; modifiedAt: string; status: RunStatus;
  turn: Json; closed: boolean; tools: Map<string, string>; parts: Map<string, string>; spawn: Json;
};
/** What the host keeps per session to show each Run as a subagent: the Runs' chats in start order and which attempt of each Run is current. */
export type RunTranscripts = { session: string; chats: Map<string, RunChat>; current: Map<string, string>; attempts: Map<string, number> };

export const runTranscripts = (session: string): RunTranscripts => ({ session, chats: new Map(), current: new Map(), attempts: new Map() });

type Route = { to: 'run'; toolCallId: string } | { to: 'session'; build: (spelling: Spelling) => Json };
const routes = new WeakMap<Json, Route>();
const toRun = (toolCallId: string, action: Json) => { routes.set(action, { to: 'run', toolCallId }); return action; };
const toSession = (type: string, build: (spelling: Spelling) => Json) => { const action = { type }; routes.set(action, { to: 'session', build }); return action; };

/**
 * Where an action the host derived from an event goes: the Run's chat, or the session channel in each client's own
 * spelling. Undefined for an action on the session's default chat.
 */
export function runRoute<C>(action: Json, spelling: (client: C) => Spelling, fallback: Spelling): { channel: string; action: Json | ((client: C) => Json) } | undefined {
  const route = routes.get(action);
  if (!route) return undefined;
  if (route.to === 'run') return { channel: runChatChannel(fallback.session, route.toolCallId), action };
  return { channel: fallback.session, action: (client: C) => route.build(spelling(client)) };
}

const statusBits = { idle: 1, error: 2, inProgress: 8 };
const chatStatus = (chat: RunChat) => chat.status === 'running' ? statusBits.inProgress : chat.status === 'completed' ? statusBits.idle : statusBits.error;
const verdictWords: Record<string, string> = { approve: 'approved', request_changes: 'requested changes', inconclusive: 'gave no clear verdict' };
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
const duration = (from: string, to: string) => Math.max(0, Date.parse(to) - Date.parse(from)) || 0;

function runChatSummary(chat: RunChat, spelling: Spelling): Json {
  return {
    resource: runChatChannel(spelling.session, chat.toolCallId), title: chat.role, status: chatStatus(chat), modifiedAt: chat.modifiedAt,
    ...(chat.status === 'running' ? { activity: `${chat.role} is working` } : {}),
    origin: { kind: 'tool', chat: spelling.chat, toolCallId: chat.toolCallId }, interactivity: 'read-only',
  };
}

/** The session catalogue's entry for each Run's chat, in the order the Runs started. */
export function runChats(transcripts: RunTranscripts, spelling: Spelling): Json[] {
  return [...transcripts.chats.values()].map(chat => runChatSummary(chat, spelling));
}

/** A Run's chat as a client subscribes to it: read-only, with the Run's brief as its one turn and the Run's messages and tool calls as the response. */
export function runChatState(transcripts: RunTranscripts, toolCallId: string, spelling: Spelling): Json | undefined {
  const chat = transcripts.chats.get(toolCallId);
  if (!chat) return undefined;
  return { ...runChatSummary(chat, spelling), ...(chat.closed ? { turns: [chat.turn] } : { turns: [], activeTurn: chat.turn }) };
}

function spawnContent(transcripts: RunTranscripts, chat: RunChat): Json {
  return { type: 'subagent', resource: runChatChannel(transcripts.session, chat.toolCallId), title: chat.role, agentName: chat.role, description: chat.description };
}

function spawnPart(transcripts: RunTranscripts, chat: RunChat): Json {
  return { kind: 'toolCall', toolCall: { toolCallId: chat.toolCallId, toolName: runToolName, displayName: chat.role, status: 'running', invocationMessage: `${chat.role} · ${chat.description}`, confirmed: 'not-needed', content: [spawnContent(transcripts, chat)], _meta: chat.spawn } };
}

function spawnActions(transcripts: RunTranscripts, chat: RunChat, turn: Json): Json[] {
  const part = spawnPart(transcripts, chat);
  turn.responseParts.push(part);
  chat.parentTurnId = turn.id;
  const { toolCall } = part;
  return [
    { type: 'chat/toolCallStart', turnId: turn.id, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, displayName: toolCall.displayName, _meta: toolCall._meta },
    { type: 'chat/toolCallReady', turnId: turn.id, toolCallId: toolCall.toolCallId, invocationMessage: toolCall.invocationMessage, confirmed: 'not-needed' },
    { type: 'chat/toolCallContentChanged', turnId: turn.id, toolCallId: toolCall.toolCallId, content: toolCall.content },
  ];
}

/**
 * A Run started: its spawning tool call joins the session's active turn, with the Run's chat as its subagent, and the
 * chat joins the session's catalogue. A Run that starts again after a stop gets a new attempt with a chat of its own.
 */
export function runStarted(transcripts: RunTranscripts, session: Session, event: Event, turn: Json): Json[] {
  if (!event.runId) return [];
  const data = event.data as Json;
  const run = session.runs.find(item => item.id === event.runId);
  const role = text(data.role) ?? run?.roleName ?? 'Role';
  const mode = data.mode === 'read' || (data.mode === undefined && run?.mode === 'read') ? 'read' : 'write';
  const attempt = (transcripts.attempts.get(event.runId) ?? 0) + 1;
  transcripts.attempts.set(event.runId, attempt);
  const toolCallId = attempt === 1 ? `run-${event.runId}` : `run-${event.runId}-${attempt}`;
  const description = mode === 'read' ? 'reads the change and gives a verdict' : 'writes the change';
  const brief = text((data.prompt as Json | undefined)?.instruction) ?? session.objective;
  const chat: RunChat = {
    toolCallId, runId: event.runId, role, mode, description, parentTurnId: turn.id, startedAt: event.at, modifiedAt: event.at, status: 'running',
    turn: { id: `${toolCallId}-turn`, startedAt: event.at, message: { text: brief, origin: { kind: 'systemNotification' } }, responseParts: [] },
    closed: false, tools: new Map(), parts: new Map(), spawn: { toolKind: 'subagent', subagentDescription: `${role} ${description}`, subagentAgentName: role },
  };
  transcripts.chats.set(toolCallId, chat);
  transcripts.current.set(event.runId, toolCallId);
  return [
    ...spawnActions(transcripts, chat, turn),
    toSession('session/chatAdded', spelling => ({ type: 'session/chatAdded', summary: runChatSummary(chat, spelling) })),
    toRun(toolCallId, { type: 'chat/turnStarted', turnId: chat.turn.id, startedAt: chat.turn.startedAt, message: chat.turn.message }),
  ];
}

/** Carries each Run still working into a newly opened turn of the session's chat, so its subagent stays where VS Code follows it. */
export function carryRuns(transcripts: RunTranscripts, turn: Json): Json[] {
  return [...transcripts.chats.values()].filter(chat => chat.status === 'running' && chat.parentTurnId !== turn.id).flatMap(chat => spawnActions(transcripts, chat, turn));
}

const working = (transcripts: RunTranscripts, runId: string | undefined) => {
  const chat = runId ? transcripts.chats.get(transcripts.current.get(runId) ?? '') : undefined;
  return chat?.status === 'running' ? chat : undefined;
};

/** A Run's message, mirrored into the Run's chat. The session's chat keeps it too, because VS Code shows a subagent's tool calls but not its text. */
export function runMessage(transcripts: RunTranscripts, event: Event): Json[] {
  const chat = working(transcripts, event.runId);
  const data = event.data as Json;
  if (!chat || typeof data.text !== 'string' || data.role === 'operator') return [];
  const key = String(data.partId ?? 'summary');
  const turn = chat.turn;
  chat.modifiedAt = event.at;
  let partId = chat.parts.get(key);
  const actions: Json[] = [];
  if (!partId) {
    partId = `${turn.id}-part-${turn.responseParts.length + 1}`;
    chat.parts.set(key, partId);
    turn.responseParts.push({ kind: 'markdown', id: partId, content: '' });
    actions.push(toRun(chat.toolCallId, { type: 'chat/responsePart', turnId: turn.id, part: { kind: 'markdown', id: partId, content: '' } }));
  }
  const part = turn.responseParts.find((item: Json) => item.kind === 'markdown' && item.id === partId)!;
  part.content += data.text;
  actions.push(toRun(chat.toolCallId, { type: 'chat/delta', turnId: turn.id, partId, content: data.text }));
  return actions;
}

const finishedStatuses = new Set(['completed', 'error', 'failed']);

/** The terminal a crew command's tool call points at, as the session's command log derives it from the same event. */
export type ToolTerminal = { command?: { commandLine: string }; content?: Json };
/** How the host renders tool events: the event's terminal, the redaction its text passes through, and the contributor of a tool a session's MCP server provides. */
export type ToolRendering = { terminal?: ToolTerminal; clean?: (value: string) => string; contributed?: (toolName: string) => { contributor: Json; _meta: Json } | undefined };

/**
 * One tool event as an AHP tool call in `turn`: a command's command line, or else the reported input, as the call's
 * `toolInput`, and its output or error as the result, each through `clean`. A command's output is its terminal, not text.
 * Nothing the runtime did not report appears. Calls are matched by the event's part id, or by name when it has none.
 */
export function toolActions(turn: Json, open: Map<string, string>, event: Event, rendering: ToolRendering = {}): Json[] {
  const { terminal = {}, clean = (value: string) => value } = rendering;
  const data = event.data as Json;
  const name = text(data.name) ?? 'tool';
  const title = text(data.title) ? clean(data.title) : undefined;
  const reported = terminal.command?.commandLine ?? text(data.input);
  const input = reported ? clean(reported) : undefined;
  const status = String(data.status ?? 'unknown');
  const key = text(data.partId) ?? name;
  const actions: Json[] = [];
  let toolCallId = open.get(key);
  let part = toolCallId ? turn.responseParts.find((item: Json) => item.kind === 'toolCall' && item.toolCall.toolCallId === toolCallId) : undefined;
  const invocationMessage = title ?? `Running ${name}`;
  if (!part) {
    toolCallId = `${turn.id}-tool-${turn.responseParts.length + 1}`;
    open.set(key, toolCallId);
    const contributed = rendering.contributed?.(name);
    part = { kind: 'toolCall', toolCall: { toolCallId, toolName: name, displayName: name, status: 'streaming', ...contributed } };
    turn.responseParts.push(part);
    actions.push({ type: 'chat/toolCallStart', turnId: turn.id, toolCallId, toolName: name, displayName: name, ...(contributed ? { contributor: contributed.contributor } : {}) });
  }
  const ready = (toolCall: Json) => ({ type: 'chat/toolCallReady', turnId: turn.id, toolCallId, invocationMessage, ...(toolCall.toolInput !== undefined ? { toolInput: toolCall.toolInput } : {}), confirmed: 'not-needed' });
  if (part.toolCall.status === 'streaming' && status !== 'pending') {
    part.toolCall = { ...part.toolCall, status: 'running', invocationMessage, ...(input ? { toolInput: input } : {}), confirmed: 'not-needed' };
    actions.push(ready(part.toolCall));
  } else if (part.toolCall.status === 'running' && ((input && part.toolCall.toolInput !== input) || part.toolCall.invocationMessage !== invocationMessage)) {
    part.toolCall = { ...part.toolCall, invocationMessage, ...(input ? { toolInput: input } : {}) };
    actions.push(ready(part.toolCall));
  }
  if (terminal.content && part.toolCall.status === 'running' && part.toolCall.toolInput !== undefined && !part.toolCall.content) {
    part.toolCall = { ...part.toolCall, content: [terminal.content] };
    actions.push({ type: 'chat/toolCallContentChanged', turnId: turn.id, toolCallId, content: [terminal.content] });
  }
  if (finishedStatuses.has(status) && part.toolCall.status === 'running') {
    const result = toolResult(data, name, title, status === 'completed', part.toolCall.content && terminal.content ? terminal.content : undefined, clean);
    part.toolCall = { ...part.toolCall, status: 'completed', ...result };
    open.delete(key);
    actions.push({ type: 'chat/toolCallComplete', turnId: turn.id, toolCallId, result });
  }
  return actions;
}

function toolResult(data: Json, name: string, title: string | undefined, success: boolean, terminal: Json | undefined, clean: (value: string) => string): Json {
  const output = terminal ? [] : [text(data.output), text(data.text)].filter((value): value is string => Boolean(value)).map(clean);
  const exitCode = typeof data.exitCode === 'number' && Number.isFinite(data.exitCode) ? data.exitCode : undefined;
  const durationMs = typeof data.durationMs === 'number' && Number.isFinite(data.durationMs) ? data.durationMs : undefined;
  const failure = text(data.error) ? clean(data.error) : exitCode !== undefined && exitCode !== 0 ? `Exited with code ${exitCode}` : undefined;
  return {
    success, pastTenseMessage: success ? title ?? `Ran ${name}` : `${title ?? name} failed`,
    ...(terminal ? { content: [terminal] } : output.length ? { content: output.map(value => ({ type: 'text', text: value })) } : {}),
    ...(exitCode !== undefined || durationMs !== undefined ? { structuredContent: { ...(exitCode !== undefined ? { exitCode } : {}), ...(durationMs !== undefined ? { durationMs } : {}) } } : {}),
    ...(!success ? { error: { message: failure ?? `${title ?? name} failed` } } : {}),
  };
}

/** A tool event of a working Run, as a tool call in the Run's chat. Undefined when the event belongs to no working Run, so the session's chat shows it. */
export function runTool(transcripts: RunTranscripts, event: Event, rendering?: ToolRendering): Json[] | undefined {
  const chat = working(transcripts, event.runId);
  if (!chat) return undefined;
  chat.modifiedAt = event.at;
  return toolActions(chat.turn, chat.tools, event, rendering).map(action => toRun(chat.toolCallId, action));
}

function editsCall(turn: Json, toolName: string, displayName: string, invocationMessage: string, edits: Json[]): Json[] {
  const files = edits.filter(edit => edit.before || edit.after);
  if (!files.length) return [];
  const toolCallId = `${turn.id}-${toolName === candidateToolName ? 'candidate' : 'changes'}`;
  const listed = files.map(edit => `${decodeURIComponent(new URL(String((edit.after ?? edit.before).uri)).pathname)} (+${edit.diff?.added ?? 0} −${edit.diff?.removed ?? 0})`);
  const result = { success: true, pastTenseMessage: `${invocationMessage}: ${files.length} ${files.length === 1 ? 'file' : 'files'}`, content: [...files.map(edit => ({ type: 'fileEdit', ...edit })), { type: 'text', text: listed.join('\n') }] };
  turn.responseParts.push({ kind: 'toolCall', toolCall: { toolCallId, toolName, displayName, status: 'completed', invocationMessage, confirmed: 'not-needed', ...result } });
  return [
    { type: 'chat/toolCallStart', turnId: turn.id, toolCallId, toolName, displayName },
    { type: 'chat/toolCallReady', turnId: turn.id, toolCallId, invocationMessage, confirmed: 'not-needed' },
    { type: 'chat/toolCallComplete', turnId: turn.id, toolCallId, result },
  ];
}

/**
 * Which diff artifact a write Run produced, by position among the session's diff artifacts: the one named after its
 * Role's native file diff, or the session's only unattributed one when this is the session's only write Run.
 */
export function runDiffArtifact(session: Session, runId: string, role: string): number | undefined {
  const diffs = session.artifacts.filter(artifact => artifact.kind === 'diff');
  const named = (name: string) => diffs.flatMap((artifact, index) => artifact.name === `${name} native file diff` ? [index] : []);
  const attempts = session.runs.filter(run => run.roleName === role && run.mode === 'write');
  const own = named(role)[attempts.findIndex(run => run.id === runId)];
  if (own !== undefined) return own;
  const writers = session.runs.filter(run => run.mode === 'write');
  const roles = new Set(session.runs.map(run => `${run.roleName} native file diff`));
  const unattributed = diffs.flatMap((artifact, index) => roles.has(artifact.name) ? [] : [index]);
  return writers.length === 1 && writers[0].id === runId && unattributed.length === 1 ? unattributed[0] : undefined;
}

function settle(transcripts: RunTranscripts, chat: RunChat, at: string, status: Exclude<RunStatus, 'running'>, result: Json, activeTurn: Json | undefined): Json[] {
  chat.status = status;
  chat.modifiedAt = at;
  chat.closed = true;
  const runDuration = duration(chat.turn.startedAt, at);
  chat.turn = { ...chat.turn, duration: runDuration, state: status === 'completed' ? 'complete' : status === 'stopped' ? 'cancelled' : 'error' };
  const closing = status === 'completed' ? { type: 'chat/turnComplete', turnId: chat.turn.id, duration: runDuration }
    : status === 'stopped' ? { type: 'chat/turnCancelled', turnId: chat.turn.id, duration: runDuration }
    : { type: 'chat/error', turnId: chat.turn.id, duration: runDuration, part: { kind: 'error', error: { errorType: 'run_failed', message: String(result.pastTenseMessage) } } };
  if (status === 'failed') chat.turn.responseParts.push(closing.part);
  const content = [spawnContent(transcripts, chat), ...(result.content ?? [])];
  const completed = { ...result, content };
  const actions: Json[] = [toRun(chat.toolCallId, closing)];
  if (activeTurn) {
    const part = activeTurn.responseParts.find((item: Json) => item.kind === 'toolCall' && item.toolCall.toolCallId === chat.toolCallId);
    if (part) { part.toolCall = { ...part.toolCall, status: 'completed', ...completed }; actions.push({ type: 'chat/toolCallComplete', turnId: activeTurn.id, toolCallId: chat.toolCallId, result: completed }); }
  }
  actions.push(toSession('session/chatUpdated', spelling => ({ type: 'session/chatUpdated', chat: runChatChannel(spelling.session, chat.toolCallId), changes: { status: chatStatus(chat), activity: null, modifiedAt: chat.modifiedAt } })));
  return actions;
}

function settleEarlier(chat: RunChat, turns: Json[], completed: Json): void {
  for (const turn of turns) for (const part of turn.responseParts) if (part.kind === 'toolCall' && part.toolCall.toolCallId === chat.toolCallId && part.toolCall.status === 'running') part.toolCall = { ...part.toolCall, status: 'completed', ...completed };
}

/**
 * A Run finished: a write Run's chat gets its native file diff as file edits, the chat's turn ends, and the spawning
 * tool call completes with the Run's verdict and summary.
 */
export function runFinished(transcripts: RunTranscripts, session: Session, event: Event, activeTurn: Json | undefined, turns: Json[], diffEdits: (artifact: number) => Json[]): Json[] {
  const chat = working(transcripts, event.runId);
  if (!chat) return [];
  const data = event.data as Json;
  const completed = data.status === 'completed';
  const verdict = typeof data.verdict === 'string' ? verdictWords[data.verdict] ?? data.verdict : '';
  const pastTenseMessage = verdict ? `${chat.role} ${verdict}` : completed ? `${chat.role} finished` : `${chat.role} stopped (${String(data.status ?? 'ended').replaceAll('_', ' ')})`;
  const summary = text(data.summary);
  const actions: Json[] = [];
  const artifact = chat.mode === 'write' ? runDiffArtifact(session, chat.runId, chat.role) : undefined;
  if (artifact !== undefined) actions.push(...editsCall(chat.turn, changesToolName, 'Changes', `${chat.role} changed`, diffEdits(artifact)).map(action => toRun(chat.toolCallId, action)));
  const result = { success: completed, pastTenseMessage, ...(summary ? { content: [{ type: 'text', text: summary }] } : {}), ...(!completed ? { error: { message: pastTenseMessage } } : {}) };
  actions.push(...settle(transcripts, chat, event.at, completed ? 'completed' : 'failed', result, activeTurn));
  settleEarlier(chat, turns, { ...result, content: [spawnContent(transcripts, chat), ...(result.content ?? [])] });
  return actions;
}

const stopReasons: Record<string, string> = {
  'session.completed': 'the session completed', 'session.failed': 'the session failed', 'session.cancelled': 'the session was cancelled',
  'session.paused': 'the session was paused', 'session.interrupted': 'the session was interrupted', 'execution.authority_lost': 'Unfold lost contact with its execution',
};

/** The session stopped while Runs were working: each one's chat ends as cancelled and its spawning tool call completes as not finished. */
export function stopRuns(transcripts: RunTranscripts, event: Event, activeTurn: Json | undefined, turns: Json[]): Json[] {
  const reason = stopReasons[event.type];
  if (!reason) return [];
  return [...transcripts.chats.values()].filter(chat => chat.status === 'running').flatMap(chat => {
    const result = { success: false, pastTenseMessage: `${chat.role} did not finish: ${reason}`, error: { message: `${chat.role} did not finish: ${reason}` } };
    const actions = settle(transcripts, chat, event.at, 'stopped', result, activeTurn);
    settleEarlier(chat, turns, { ...result, content: [spawnContent(transcripts, chat)] });
    return actions;
  });
}

/** The captured candidate's files as file edits in the session's active turn, only for a session with a Run that writes. */
export function candidateEdits(session: Session, turn: Json | undefined, edits: Json[]): Json[] {
  if (!turn || !session.runs.some(run => run.mode === 'write')) return [];
  return editsCall(turn, candidateToolName, 'Candidate', 'Captured the candidate', edits);
}
