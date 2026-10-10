import type { AppConfig, User } from '../types.ts';
import { PloegClient, PloegError, type PloegDetail, type PloegItem, type PloegRun, type PloegShift, type PloegState } from '../ploeg.ts';
import { listReason, withdrawnReason } from '../../public/core/reasons.js';
import { money } from '../../public/core/format.js';
import { customizationRefusal } from './customizations.ts';
import { sessionChatCatalog } from './versions.ts';
import { runChatChannel, runDescription, subagentContent, subagentMeta, verdictText, type Spelling } from './runs.ts';

type Json = Record<string, any>;
type ViewFlags = { session: number; chat: number };

/** The `_meta` key under which a Work Item session carries Ploeg's own record of the Work Item. */
export const workItemMetaKey = 'unfold.workItem';
/** The tool name of the call by which a Ploeg Run appears in a Work Item session's chat, as a subagent. */
export const ploegRunToolName = 'ploeg_run';

/** A Work Item's session id: `wi-` and Ploeg's Work Item id. */
export const workItemSessionId = (workItemId: string) => `wi-${workItemId}`;
/** Whether a session id is in the Work Item namespace, which no Unfold session may take. */
export const isWorkItemSession = (publicId: string) => publicId.startsWith('wi-');
/** The Ploeg Work Item id a `wi-` session id names. */
export function workItemIdOf(publicId: string): string | undefined { return /^wi-([1-9][0-9]{0,19})$/.exec(publicId)?.[1]; }

/** What the host answers each change a client asks of a Work Item session that it does not turn into a confirmed command. Ploeg owns the Work Item. */
export const workItemRefusals = {
  message: 'Ploeg can\'t take instructions for running work yet. Stop it, or wait until it needs you.',
  tryAgain: 'Ploeg restarts a Work Item once it stopped and needs you or went stale.',
  dispose: 'A Work Item stays in Ploeg. Archive it to hide it from your Agents window.',
  readOnly: 'A Work Item is Ploeg\'s record and is read-only in the Agents window. Act on it from its Work Item page.',
} as const;

/** The refusal for an action dispatched on a Work Item session's session or chat channel. */
export function workItemRefusal(actionType: unknown): string {
  switch (actionType) {
    case 'chat/turnStarted': case 'chat/pendingMessageSet': return workItemRefusals.message;
    case 'chat/turnResume': return workItemRefusals.tryAgain;
    default: return customizationRefusal(actionType) ?? workItemRefusals.readOnly;
  }
}

/** What a Work Item session says about the Runs' own words: Ploeg keeps each Run's report, not its conversation. */
export const noAgentMessages = 'Ploeg records what each Run reported when it finished, not its messages or tool calls, so this chat shows the Rounds, their Runs and what each Run reported.';
/** Said in a Ploeg Run's own chat for the same reason. */
export const noRunMessages = 'Ploeg records no messages or tool calls for its Runs. This is what the Run reported when it finished.';
/** The activity of a Work Item session while Ploeg cannot be read. */
export const staleActivity = 'Ploeg is unreachable; last known state';

const statusBits = { idle: 1, error: 2, inProgress: 8, inputNeeded: 24 } as const;
const openStates: PloegState[] = ['ingested', 'queued', 'leased', 'proposed', 'needs_human', 'awaiting_review', 'stale'];
const finishedStates: PloegState[] = ['done', 'withdrawn'];
const byId = (a: { id: string }, b: { id: string }) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
const roleName = (role: string) => role ? `${role[0].toUpperCase()}${role.slice(1)}`.replace(/[_-]+/g, ' ') : 'Role';

/** How a Work Item shows in the Agents window: the session status, the activity line under its title and, when it waits on a person or went stale, the reason. */
export type WorkItemActivity = { status: keyof typeof statusBits; activity: string; reason?: { code: string; chip: string; sentence: string } };

/**
 * The state map of ADR 0023: queued or ingested work is idle, a leased Work Item is in progress with its working Role,
 * Round and spend, a proposal, a needs-human stop and a pull request ready for review need the person, a stale item is
 * an error, and done or withdrawn work is idle with how it ended.
 */
export function workItemActivity(item: PloegItem, runs: readonly PloegRun[] = []): WorkItemActivity {
  const reasonOf = () => { const reason = listReason(item); return reason ? { code: String(reason.code), chip: String(reason.chip), sentence: String(reason.sentence) } : undefined; };
  switch (item.state) {
    case 'ingested': case 'queued': return { status: 'idle', activity: `Queued for ${item.team}` };
    case 'leased': {
      const shift = item.latestShift;
      const working = runs.filter(run => run.state === 'running' && (!shift || !run.shiftId || run.shiftId === shift.id)).sort(byId).at(-1);
      const round = working?.round ?? shift?.round;
      const line = [working ? roleName(working.role) : '', round ? `Round ${round}` : '', shift ? `${money(shift.spentUsd)}/${money(shift.budgetUsd)}` : ''].filter(Boolean).join(' · ');
      return { status: 'inProgress', activity: line || 'Running' };
    }
    case 'proposed': return { status: 'inputNeeded', activity: 'Waiting for approval' };
    case 'needs_human': { const reason = reasonOf(); return { status: 'inputNeeded', activity: reason?.chip ?? 'Needs you', ...(reason ? { reason } : {}) }; }
    case 'awaiting_review': { const number = item.pullRequest?.number; return { status: 'inputNeeded', activity: number ? `Ready for review · PR #${number}` : 'Ready for review' }; }
    case 'stale': { const reason = reasonOf(); return { status: 'error', activity: reason?.chip ?? 'Stale', ...(reason ? { reason } : {}) }; }
    case 'done': return { status: 'idle', activity: item.pullRequest ? 'Merged' : 'Done' };
    case 'withdrawn': return { status: 'idle', activity: withdrawnReason(item.latestShift?.closeReason)?.replace(/\.$/, '') ?? 'Withdrawn' };
    default: return { status: 'idle', activity: String(item.state) };
  }
}

/** Whether an Operator Execution owns the Work Item: an Unfold session bound to it, which the Agents window already lists as that session. Ploeg opens such a Shift on the branch `operator/<session>`. */
export function operatorOwned(item: PloegItem): boolean { return Boolean(item.latestShift?.branch.startsWith('operator/')); }

/** One Work Item as the host knows it for a viewer: Ploeg's record, the Runs behind its activity, and whether Ploeg could not be read since. */
export type WorkItemRecord = { workItemId: string; publicId: string; item: PloegItem; activity: WorkItemActivity; stale: boolean };

function record(item: PloegItem, runs: readonly PloegRun[] = [], stale = false): WorkItemRecord {
  return { workItemId: item.id, publicId: workItemSessionId(item.id), item, activity: workItemActivity(item, runs), stale };
}
const fingerprint = (entry: WorkItemRecord) => JSON.stringify([entry.item.state, entry.item.title, entry.item.updatedAt, entry.activity, entry.stale]);
const activityText = (entry: WorkItemRecord) => entry.stale ? `${staleActivity}: ${entry.activity.activity}` : entry.activity.activity;

/** The status bits of a Work Item session before the viewer's own read and archive flags. */
export const workItemStatus = (entry: WorkItemRecord) => statusBits[entry.activity.status];

function meta(entry: WorkItemRecord): Json {
  const { item } = entry;
  return { [workItemMetaKey]: { id: item.id, team: item.team, state: item.state, url: item.url, provider: item.provider, externalId: item.externalId, pullRequest: item.pullRequest ? { url: item.pullRequest.url, number: item.pullRequest.number } : null, round: item.latestShift?.round ?? null, budgetUsd: item.latestShift?.budgetUsd ?? null, spentUsd: item.latestShift?.spentUsd ?? null, ...(entry.activity.reason ? { reason: entry.activity.reason } : {}), stale: entry.stale, readOnly: true } };
}

/** A Work Item session's default chat in the catalogue. Its input stays open so a message gets an answer that says why Ploeg cannot take it. */
export function workItemChatSummary(entry: WorkItemRecord, spelling: Spelling, flags: ViewFlags): Json {
  return { resource: spelling.chat, title: `#${entry.item.id} ${entry.item.title}`, status: workItemStatus(entry) | flags.chat, activity: activityText(entry), modifiedAt: entry.item.updatedAt, origin: { kind: 'user' }, interactivity: 'full' };
}

/** A Work Item session in `listSessions` and the root channel: `#<id> <title>`, its state and the viewer's own flags. */
export function workItemSummary(entry: WorkItemRecord, spelling: Spelling, flags: ViewFlags, protocolVersion: string): Json {
  return {
    resource: spelling.session, provider: 'unfold', title: `#${entry.item.id} ${entry.item.title}`, status: workItemStatus(entry) | flags.session, activity: activityText(entry),
    createdAt: entry.item.createdAt, modifiedAt: entry.item.updatedAt,
    ...sessionChatCatalog(protocolVersion, workItemChatSummary(entry, spelling, flags)),
    _meta: meta(entry),
  };
}

type Round = { key: string; turnId: string; shiftNumber: number; shifts: number; round: number; runs: PloegRun[]; open: boolean; startedAt: string; finishedAt: string };

function rounds(detail: PloegDetail): Round[] {
  const shifts = [...detail.shifts].sort(byId);
  const shiftNumber = (id: string | null) => id ? shifts.findIndex(shift => shift.id === id) + 1 : 0;
  const groups = new Map<string, PloegRun[]>();
  for (const run of [...detail.runs].sort(byId)) { const key = `${run.shiftId ?? ''}:${run.round}`; groups.set(key, [...(groups.get(key) ?? []), run]); }
  const leased = detail.item.state === 'leased';
  return [...groups].map(([key, runs]) => {
    const shift: PloegShift | undefined = shifts.find(entry => entry.id === runs[0].shiftId);
    const started = runs.map(run => run.startedAt).filter((at): at is string => Boolean(at)).sort();
    const finished = runs.map(run => run.finishedAt).filter((at): at is string => Boolean(at)).sort();
    const number = shiftNumber(runs[0].shiftId);
    return { key, turnId: `wi-${detail.item.id}-round-${number}-${runs[0].round}`, shiftNumber: number, shifts: shifts.length, round: runs[0].round, runs, open: leased && runs.some(run => run.state !== 'finished') && !shift?.closedAt, startedAt: started[0] ?? shift?.openedAt ?? detail.item.createdAt, finishedAt: finished.at(-1) ?? started.at(-1) ?? shift?.openedAt ?? detail.item.updatedAt };
  });
}

const runToolCallId = (run: PloegRun) => `ploeg-run-${run.id}`;
const failed = (run: PloegRun) => ['failed', 'stuck'].includes(run.outcome ?? '') || Boolean(run.failureReason);

function runResult(run: PloegRun, spawned: Json): Json {
  const role = roleName(run.role);
  const success = !failed(run);
  const pastTenseMessage = run.verdict ? `${role} ${verdictText(run.verdict)}` : success ? `${role} finished${run.outcome ? ` (${run.outcome.replaceAll('_', ' ')})` : ''}` : `${role} stopped (${(run.outcome ?? 'failed').replaceAll('_', ' ')})`;
  const summary = run.summary.trim();
  return { success, pastTenseMessage, content: [spawned, ...(summary ? [{ type: 'text', text: summary }] : [])], ...(!success ? { error: { message: run.failureReason || run.stuckReason || pastTenseMessage } } : {}) };
}

function runPart(run: PloegRun, spelling: Spelling): Json {
  const role = roleName(run.role);
  const description = runDescription(run.writes ? 'write' : 'read');
  const toolCallId = runToolCallId(run);
  const spawned = subagentContent(spelling.session, toolCallId, role, description);
  const base = { toolCallId, toolName: ploegRunToolName, displayName: role, invocationMessage: `${role} · ${run.state === 'pending' ? 'waiting to start' : description}`, confirmed: 'not-needed', _meta: subagentMeta(role, description) };
  if (run.state !== 'finished') return { kind: 'toolCall', toolCall: { ...base, status: 'running', content: [spawned] } };
  return { kind: 'toolCall', toolCall: { ...base, status: 'completed', ...runResult(run, spawned) } };
}

const turnMessage = (round: Round) => ({ text: `Round ${round.round}${round.shifts > 1 && round.shiftNumber ? ` · Shift ${round.shiftNumber}` : ''}`, origin: { kind: 'systemNotification' } });
const noticePart = (round: Round, index: number): Json[] => index === 0 ? [{ kind: 'systemNotification', content: noAgentMessages }] : [];
const duration = (from: string, to: string) => Math.max(0, Date.parse(to) - Date.parse(from)) || 0;

function turnOf(round: Round, index: number, spelling: Spelling): Json {
  const turn = { id: round.turnId, startedAt: round.startedAt, message: turnMessage(round), responseParts: [...noticePart(round, index), ...round.runs.map(run => runPart(run, spelling))] };
  return round.open ? turn : { ...turn, duration: duration(round.startedAt, round.finishedAt), state: 'complete' };
}

/** A Work Item session's chat: one turn per Round in the order Ploeg ran them, each Run a `ploeg_run` subagent call, and nothing a Run did not report. */
export function workItemChatState(entry: WorkItemRecord, detail: PloegDetail, spelling: Spelling, flags: ViewFlags): Json {
  const turns = rounds(detail).map((round, index) => ({ round, turn: turnOf(round, index, spelling) }));
  const active = turns.find(({ round }) => round.open);
  return { ...workItemChatSummary(entry, spelling, flags), turns: turns.filter(({ round }) => !round.open).map(({ turn }) => turn), ...(active ? { activeTurn: active.turn } : {}) };
}

function runChatSummary(run: PloegRun, spelling: Spelling): Json {
  const role = roleName(run.role);
  return { resource: runChatChannel(spelling.session, runToolCallId(run)), title: role, status: run.state !== 'finished' ? statusBits.inProgress : failed(run) ? statusBits.error : statusBits.idle, modifiedAt: run.finishedAt ?? run.startedAt ?? new Date(0).toISOString(), ...(run.state === 'running' ? { activity: `${role} is working` } : {}), origin: { kind: 'tool', chat: spelling.chat, toolCallId: runToolCallId(run) }, interactivity: 'read-only' };
}

function reportParts(run: PloegRun, turnId: string): Json[] {
  if (run.state !== 'finished') return [];
  const sections = [['Summary', run.summary], ['Findings', run.findings], ['Why it got stuck', run.stuckReason], ['Why it failed', run.failureReason ?? '']].filter(([, value]) => value.trim());
  return sections.length ? [{ kind: 'markdown', id: `${turnId}-report`, content: sections.map(([title, value]) => `**${title}**\n\n${value.trim()}`).join('\n\n') }] : [];
}

function runTurn(run: PloegRun): Json {
  const turnId = `${runToolCallId(run)}-turn`;
  const startedAt = run.startedAt ?? run.finishedAt ?? new Date(0).toISOString();
  const turn = { id: turnId, startedAt, message: { text: `${roleName(run.role)} · Round ${run.round}`, origin: { kind: 'systemNotification' } }, responseParts: [{ kind: 'systemNotification', content: noRunMessages }, ...reportParts(run, turnId)] };
  return run.state === 'finished' ? { ...turn, duration: duration(startedAt, run.finishedAt ?? startedAt), state: failed(run) ? 'error' : 'complete' } : turn;
}

/** A Ploeg Run's own chat, read-only: what the Run reported, never a message Ploeg did not record. */
export function workItemRunChatState(detail: PloegDetail, toolCallId: string, spelling: Spelling): Json | undefined {
  const run = detail.runs.find(entry => runToolCallId(entry) === toolCallId);
  if (!run) return undefined;
  const turn = runTurn(run);
  return { ...runChatSummary(run, spelling), ...(run.state === 'finished' ? { turns: [turn] } : { turns: [], activeTurn: turn }) };
}

/** A Work Item session as a client subscribes to it: read-only, without changesets, configuration or input requests of its own. */
export function workItemSessionState(entry: WorkItemRecord, detail: PloegDetail, spelling: Spelling, flags: ViewFlags, protocolVersion: string, activeClients: Json[]): Json {
  return {
    ...workItemSummary(entry, spelling, flags, protocolVersion), lifecycle: 'ready', activeClients,
    chats: [workItemChatSummary(entry, spelling, flags), ...[...detail.runs].sort(byId).map(run => runChatSummary(run, spelling))], defaultChat: spelling.chat,
    config: { schema: { type: 'object', properties: {} }, values: {} }, customizations: [], inputNeeded: [],
  };
}

/** Where a live transcript action goes: the session's default chat, the session channel, or one Run's chat. */
export type RoutedAction = { to: 'chat' | 'session' | { run: string }; action: Json };

function spawnActions(turnId: string, part: Json): RoutedAction[] {
  const { toolCall } = part;
  const actions: RoutedAction[] = [
    { to: 'chat', action: { type: 'chat/toolCallStart', turnId, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, displayName: toolCall.displayName, _meta: toolCall._meta } },
    { to: 'chat', action: { type: 'chat/toolCallReady', turnId, toolCallId: toolCall.toolCallId, invocationMessage: toolCall.invocationMessage, confirmed: 'not-needed' } },
    { to: 'chat', action: { type: 'chat/toolCallContentChanged', turnId, toolCallId: toolCall.toolCallId, content: [toolCall.content[0]] } },
  ];
  if (toolCall.status === 'completed') actions.push(completeAction(turnId, toolCall));
  return actions;
}
function completeAction(turnId: string, toolCall: Json): RoutedAction {
  const { success, pastTenseMessage, content, error } = toolCall;
  return { to: 'chat', action: { type: 'chat/toolCallComplete', turnId, toolCallId: toolCall.toolCallId, result: { success, pastTenseMessage, content, ...(error ? { error } : {}) } } };
}

function runChatActions(before: PloegRun | undefined, run: PloegRun, spelling: Spelling): RoutedAction[] {
  if (!before) return [{ to: 'session', action: { type: 'session/chatAdded', summary: runChatSummary(run, spelling) } }];
  if (before.state === run.state) return [];
  const actions: RoutedAction[] = [{ to: 'session', action: { type: 'session/chatUpdated', chat: runChatChannel(spelling.session, runToolCallId(run)), changes: { status: runChatSummary(run, spelling).status, activity: run.state === 'running' ? `${roleName(run.role)} is working` : null, modifiedAt: runChatSummary(run, spelling).modifiedAt } } }];
  if (run.state === 'finished') {
    const turn = runTurn(run);
    const toolCallId = runToolCallId(run);
    for (const part of reportParts(run, turn.id)) actions.push({ to: { run: toolCallId }, action: { type: 'chat/responsePart', turnId: turn.id, part } });
    actions.push({ to: { run: toolCallId }, action: failed(run) ? { type: 'chat/error', turnId: turn.id, duration: turn.duration, part: { kind: 'error', error: { errorType: 'run_failed', message: run.failureReason || run.stuckReason || `${roleName(run.role)} stopped` } } } : { type: 'chat/turnComplete', turnId: turn.id, duration: turn.duration } });
  }
  return actions;
}

/**
 * What changed in a Work Item's transcript between two reads of its detail, as the AHP actions a subscribed client
 * applies: Rounds that started, Runs that joined or finished in the open Round, the Round that ended, and each Run's
 * own chat. A closed Round is history and never changes.
 */
export function workItemTranscriptActions(before: PloegDetail, after: PloegDetail, spelling: Spelling): RoutedAction[] {
  const previous = new Map(rounds(before).map(round => [round.key, round]));
  const previousRuns = new Map(before.runs.map(run => [run.id, run]));
  const actions: RoutedAction[] = [];
  rounds(after).forEach((round, index) => {
    const prior = previous.get(round.key);
    if (prior && !prior.open) return;
    const turn = turnOf(round, index, spelling);
    if (!prior) {
      actions.push({ to: 'chat', action: { type: 'chat/turnStarted', turnId: turn.id, startedAt: turn.startedAt, message: turn.message } });
      for (const part of turn.responseParts) actions.push(...(part.kind === 'toolCall' ? spawnActions(turn.id, part) : [{ to: 'chat' as const, action: { type: 'chat/responsePart', turnId: turn.id, part } }]));
    } else {
      const known = new Set(prior.runs.map(run => run.id));
      for (const part of turn.responseParts.filter((entry: Json) => entry.kind === 'toolCall')) {
        const run = round.runs.find(entry => runToolCallId(entry) === part.toolCall.toolCallId)!;
        if (!known.has(run.id)) actions.push(...spawnActions(turn.id, part));
        else if (part.toolCall.status === 'completed' && previousRuns.get(run.id)?.state !== 'finished') actions.push(completeAction(turn.id, part.toolCall));
      }
    }
    if (!round.open) actions.push({ to: 'chat', action: { type: 'chat/turnComplete', turnId: turn.id, duration: turn.duration } });
  });
  for (const run of [...after.runs].sort(byId)) actions.push(...runChatActions(previousRuns.get(run.id), run, spelling));
  return actions;
}

/** What the projection needs from the agent host: who is attached, and how to tell a viewer's clients about their list and a Work Item's transcript. */
export type WorkItemHost = {
  viewers(): User[];
  listed(user: User, change: { added: WorkItemRecord[]; changed: WorkItemRecord[]; removed: string[] }): void;
  transcript(entry: WorkItemRecord, actions: (spelling: Spelling) => RoutedAction[]): void;
};

type Seen = Map<string, { entry: WorkItemRecord; fingerprint: string }>;

/**
 * Projects the Ploeg Work Items a viewer may see as read-only Agents-window sessions (ADR 0023). A viewer's list holds
 * every open Work Item of their teams and the ones that finished in the last 14 days, open first and capped. One fleet
 * poller follows Ploeg's audit events with an ascending cursor while a client is attached, re-reads each Work Item an
 * event touched once, and tells only the viewers Ploeg's team authorization lets see it. A Ploeg outage marks the
 * Work Item sessions stale and leaves Unfold's own sessions alone.
 */
export class WorkItemSessions {
  /** How often the fleet poller asks Ploeg for new events while a client is attached. */
  pollMs = 3000;
  /** How often every attached viewer's list is read again, which also catches an event Ploeg committed behind the cursor. */
  reconcileMs = 60_000;
  /** How long a finished Work Item stays listed. */
  windowMs = 14 * 24 * 3_600_000;
  /** The most Work Item sessions one viewer's list holds. */
  cap = 100;
  private readonly config: AppConfig;
  private readonly host: WorkItemHost;
  private readonly ploeg: PloegClient;
  private readonly seen = new Map<string, Seen>();
  private readonly details = new Map<string, PloegDetail>();
  private readonly finished = new Map<string, PloegItem>();
  private readonly recent = new Map<string, { team: string; at: string }>();
  private cursor: string | undefined;
  private seeding: Promise<void> | undefined;
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private reconciledAt = 0;
  /** Whether Ploeg could not be read at the last attempt. */
  stale = false;

  constructor(config: AppConfig, host: WorkItemHost, ploeg = new PloegClient(config)) { this.config = config; this.host = host; this.ploeg = ploeg; }

  /** Whether the host projects Work Items: a live Ploeg operator connection. A demo projects none, because the demo's Ploeg records are illustrative. */
  get available(): boolean { const ploeg = this.config.ploeg; return Boolean(ploeg?.url && ploeg.tokenEnv && !ploeg.demo) && this.config.mode !== 'demo'; }

  /** The fleet poller's ascending event cursor, undefined until it first read Ploeg. */
  get eventCursor(): string | undefined { return this.cursor; }

  /** The Ploeg client the projection reads with, which commands on its Work Items share. */
  get client(): PloegClient { return this.ploeg; }

  /** Reads one Work Item again right after a command changed it, so its viewers see the change before the next poll. */
  async changed(workItemId: string, team: string): Promise<void> {
    if (!this.available) return;
    try { await this.refresh(workItemId, team, this.host.viewers()); } catch (error) { if (!(error instanceof PloegError)) throw error; }
  }

  /** Whether Ploeg's team authorization lets this viewer see a team's Work Items. */
  allows(user: User, team: string): boolean { return this.ploeg.allows(user, team); }

  /** Starts the fleet poller; it stops by itself once no client is attached. */
  watch(): void { if (this.available && !this.timer) { this.timer = setInterval(() => void this.tick().catch(() => {}), this.pollMs); this.timer.unref?.(); } }

  close(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  /** The viewer's Work Item sessions. While Ploeg cannot be read, the ones last listed to them, marked stale. */
  async list(user: User): Promise<WorkItemRecord[]> {
    if (!this.available) return [];
    this.watch();
    let entries: WorkItemRecord[];
    try { entries = await this.collect(user); }
    catch (error) {
      if (error instanceof PloegError && error.status === 403) { this.seen.delete(user.id); return []; }
      if (!(error instanceof PloegError)) throw error;
      this.markStale();
      return [...(this.seen.get(user.id)?.values() ?? [])].map(({ entry }) => ({ ...entry, stale: true }));
    }
    const shown = this.stale ? entries.map(entry => ({ ...entry, stale: true })) : entries;
    this.remember(user, shown);
    return shown;
  }

  /** The Work Item session as the viewer last saw it, for their read and archive flags. */
  remembered(user: User, publicId: string): WorkItemRecord | undefined { return this.seen.get(user.id)?.get(publicId)?.entry; }

  /** One Work Item session the viewer may open, with the detail its chat is built from. Undefined when Ploeg's team authorization hides it or an Operator Execution owns it. */
  async session(user: User, workItemId: string): Promise<{ entry: WorkItemRecord; detail: PloegDetail } | undefined> {
    if (!this.available) return undefined;
    this.watch();
    let detail: PloegDetail;
    try { detail = await this.ploeg.detail(user, workItemId); }
    catch (error) {
      if (!(error instanceof PloegError)) throw error;
      if ([400, 403, 404].includes(error.status)) return undefined;
      this.markStale();
      const known = this.remembered(user, workItemSessionId(workItemId));
      const kept = this.details.get(workItemId);
      if (known && kept) return { entry: { ...known, stale: true }, detail: kept };
      throw error;
    }
    if (operatorOwned(detail.item)) return undefined;
    this.keep(workItemId, detail);
    const entry = record(detail.item, detail.runs, this.stale);
    const seen = this.seen.get(user.id) ?? new Map();
    seen.set(entry.publicId, { entry, fingerprint: fingerprint(entry) });
    this.seen.set(user.id, seen);
    return { entry, detail };
  }

  /** One round of the fleet poller: follow new events from the cursor, re-read each Work Item they touched, and publish what changed. Public so a test can drive it. */
  async tick(): Promise<void> {
    if (this.ticking || !this.available) return;
    this.ticking = true;
    try {
      const viewers = this.host.viewers();
      for (const id of [...this.seen.keys()]) if (!viewers.some(user => user.id === id)) this.seen.delete(id);
      if (!viewers.length) { this.close(); return; }
      let touched: Map<string, string>;
      try { touched = await this.follow(); }
      catch (error) { if (error instanceof PloegError) { this.markStale(); return; } throw error; }
      const recovered = this.stale;
      this.stale = false;
      for (const [workItemId, team] of touched) await this.refresh(workItemId, team, viewers);
      if (recovered || Date.now() - this.reconciledAt >= this.reconcileMs) await this.reconcile(viewers);
    } finally { this.ticking = false; }
  }

  private async seeded(): Promise<void> {
    if (this.cursor !== undefined) return;
    this.seeding ??= this.seed().finally(() => { this.seeding = undefined; });
    await this.seeding;
  }

  private async follow(): Promise<Map<string, string>> {
    await this.seeded();
    const touched = new Map<string, string>();
    for (let page = 0; page < 10; page++) {
      const read = await this.ploeg.followEvents(this.cursor!);
      for (const event of read.events) {
        touched.delete(event.workItemId);
        touched.set(event.workItemId, event.team);
        this.recent.set(event.workItemId, { team: event.team, at: event.at });
        this.finished.delete(event.workItemId);
      }
      this.cursor = read.lastCursor;
      if (!read.more) break;
    }
    return touched;
  }

  private async seed(): Promise<void> {
    const cutoff = Date.now() - this.windowMs;
    let before: string | undefined;
    for (let page = 0; page < 10; page++) {
      const read = await this.ploeg.latestEvents(before);
      if (page === 0) this.cursor = read.lastCursor;
      for (const event of read.events) if (!this.recent.has(event.workItemId) && Date.parse(event.at) >= cutoff) this.recent.set(event.workItemId, { team: event.team, at: event.at });
      const oldest = read.events.at(-1);
      if (!read.nextCursor || !oldest || Date.parse(oldest.at) < cutoff) break;
      before = read.nextCursor;
    }
  }

  private async refresh(workItemId: string, team: string, viewers: User[]): Promise<void> {
    const publicId = workItemSessionId(workItemId);
    const allowed = viewers.filter(user => this.allows(user, team));
    for (const user of viewers) if (!allowed.includes(user) && this.seen.get(user.id)?.has(publicId)) this.publishList(user, [], [], [publicId]);
    if (!allowed.length) return;
    let detail: PloegDetail | undefined;
    try { detail = await this.ploeg.detail(allowed[0], workItemId, true); }
    catch (error) { if (!(error instanceof PloegError) || ![403, 404].includes(error.status)) throw error; }
    if (!detail) { for (const user of allowed) if (this.seen.get(user.id)?.has(publicId)) this.publishList(user, [], [], [publicId]); return; }
    const entry = record(detail.item, detail.runs);
    const listed = !operatorOwned(detail.item) && this.inWindow(detail.item);
    for (const user of allowed) {
      if (!this.allows(user, detail.item.team)) { if (this.seen.get(user.id)?.has(publicId)) this.publishList(user, [], [], [publicId]); continue; }
      const prior = this.seen.get(user.id)?.get(publicId);
      if (!listed) { if (prior) this.publishList(user, [], [], [publicId]); continue; }
      if (!prior) this.publishList(user, [entry], [], []);
      else if (prior.fingerprint !== fingerprint(entry)) this.publishList(user, [], [entry], []);
    }
    const before = this.details.get(workItemId);
    this.keep(workItemId, detail);
    if (before && listed) this.host.transcript(entry, spelling => workItemTranscriptActions(before, detail!, spelling));
  }

  private async reconcile(viewers: User[]): Promise<void> {
    this.reconciledAt = Date.now();
    for (const user of viewers) {
      let entries: WorkItemRecord[];
      try { entries = await this.collect(user); }
      catch (error) {
        if (error instanceof PloegError && error.status === 403) entries = [];
        else if (error instanceof PloegError) { this.markStale(); return; }
        else throw error;
      }
      const prior = this.seen.get(user.id) ?? new Map();
      const next = new Map(entries.map(entry => [entry.publicId, entry]));
      const added = entries.filter(entry => !prior.has(entry.publicId));
      const changed = entries.filter(entry => prior.has(entry.publicId) && prior.get(entry.publicId)!.fingerprint !== fingerprint(entry));
      const removed = [...prior.keys()].filter(publicId => !next.has(publicId));
      if (added.length || changed.length || removed.length) this.publishList(user, added, changed, removed);
    }
  }

  private markStale(): void {
    if (this.stale) return;
    this.stale = true;
    for (const [userId, seen] of this.seen) {
      const user = this.host.viewers().find(viewer => viewer.id === userId);
      const changed = [...seen.values()].map(({ entry }) => ({ ...entry, stale: true }));
      if (user && changed.length) this.publishList(user, [], changed, []);
    }
  }

  private publishList(user: User, added: WorkItemRecord[], changed: WorkItemRecord[], removed: string[]): void {
    const seen = this.seen.get(user.id) ?? new Map();
    for (const entry of [...added, ...changed]) seen.set(entry.publicId, { entry, fingerprint: fingerprint(entry) });
    for (const publicId of removed) seen.delete(publicId);
    this.seen.set(user.id, seen);
    this.host.listed(user, { added, changed, removed });
  }

  private remember(user: User, entries: WorkItemRecord[]): void {
    this.seen.set(user.id, new Map(entries.map(entry => [entry.publicId, { entry, fingerprint: fingerprint(entry) }])));
  }

  private keep(workItemId: string, detail: PloegDetail): void {
    this.details.delete(workItemId);
    this.details.set(workItemId, detail);
    if (this.details.size > 500) this.details.delete(this.details.keys().next().value!);
  }

  private inWindow(item: PloegItem): boolean {
    return openStates.includes(item.state) || (finishedStates.includes(item.state) && Date.parse(item.updatedAt) >= Date.now() - this.windowMs);
  }

  private async collect(user: User): Promise<WorkItemRecord[]> {
    const teams = await this.ploeg.teams(user);
    await this.seeded();
    const pages = await Promise.all(teams.flatMap(team => openStates.map(state => this.stateItems(user, team.id, state))));
    const open = pages.flat().filter(item => !operatorOwned(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || byId(b, a)).slice(0, this.cap);
    const openIds = new Set(open.map(item => item.id));
    const cutoff = Date.now() - this.windowMs;
    const candidates = [...this.recent].filter(([id, seen]) => !openIds.has(id) && this.allows(user, seen.team) && Date.parse(seen.at) >= cutoff).sort(([, a], [, b]) => b.at.localeCompare(a.at)).slice(0, this.cap - open.length).map(([id]) => id);
    const finished = (await Promise.all(candidates.map(id => this.finishedItem(user, id)))).filter((item): item is PloegItem => Boolean(item && finishedStates.includes(item.state) && this.inWindow(item) && !operatorOwned(item))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || byId(b, a));
    const runs = new Map(await Promise.all(open.filter(item => item.state === 'leased').map(async item => [item.id, (await this.ploeg.detail(user, item.id).catch(() => undefined))?.runs ?? []] as const)));
    return [...open, ...finished].slice(0, this.cap).map(item => record(item, runs.get(item.id) ?? []));
  }

  private async stateItems(user: User, team: string, state: PloegState): Promise<PloegItem[]> {
    const items: PloegItem[] = [];
    let after = '0';
    while (items.length < this.cap) {
      const page = await this.ploeg.items(user, team, state, after);
      items.push(...page.items);
      if (!page.nextCursor || !page.items.length) break;
      after = page.nextCursor;
    }
    return items;
  }

  private async finishedItem(user: User, workItemId: string): Promise<PloegItem | undefined> {
    const cached = this.finished.get(workItemId);
    if (cached) return this.allows(user, cached.team) ? cached : undefined;
    try {
      const { item } = await this.ploeg.detail(user, workItemId);
      if (finishedStates.includes(item.state)) this.finished.set(workItemId, item);
      return item;
    } catch (error) { if (error instanceof PloegError && [403, 404].includes(error.status)) return undefined; throw error; }
  }
}
