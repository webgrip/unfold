import type { User } from '../types.ts';
import { PloegError, type PloegClient, type PloegDetail, type PloegRun } from '../ploeg.ts';
import type { RunLogLine } from '../run-logs.ts';
import type { TranscriptEntry } from '../run-transcript.ts';
import { liveOutputLimits, terminalChannel } from './terminals.ts';
import { failureHeadline } from './tracebacks.ts';
import type { Spelling } from './runs.ts';

type Json = Record<string, any>;

/** The tool name of the call whose terminal holds a Ploeg Run's pod logs. */
export const podLogsToolName = 'ploeg_pod_logs';

/** What a Ploeg Run's own chat says above what its transcript recorded. */
export const liveRunNotice = (role: string, running: boolean) => running
  ? `${role} is working. Its messages, tool calls and pod logs appear here as Ploeg records them, a few seconds behind.`
  : `What ${role} did, as Ploeg recorded it, and what it reported when it finished.`;

/** The bounds of the live projection: the poll interval, the longest backoff after a failed read, the transcript pages one read follows, the kept tool output and the Runs remembered. */
export const runLiveLimits = Object.freeze({ pollMs: 3000, maxBackoffMs: 60_000, pages: 10, toolOutput: liveOutputLimits.preview, runs: 100, parts: 2000 });

/** The terminal channel of a Ploeg Run's pod logs: the Work Item session and the Run id. */
export const podLogsChannel = (publicId: string, runId: string) => terminalChannel(publicId, runId);

/** Where an action of the live projection goes: the Run's chat, or its pod-log terminal. */
export type LiveAction = { to: 'chat' | 'terminal'; action: Json };

/** What the live projection needs from the agent host: who watches a Run, and how to send its actions to the watchers its team lets see them. */
export type RunLiveHost = {
  watchers(publicId: string, toolCallId: string, terminal: string): User[];
  publish(publicId: string, toolCallId: string, terminal: string, team: string, actions: LiveAction[]): void;
};

type ToolState = { toolCallId: string; part: Json; output: string; title: string; done: boolean };
type Feed = {
  key: string; workItemId: string; runId: string; publicId: string; toolCallId: string; turnId: string; team: string; role: string;
  running: boolean; cursor: number; transcript: boolean; parts: Json[]; tools: Map<string, ToolState>;
  logCursor?: string; logText: string; logPart: Json; logShown: boolean; ended: boolean;
  loaded?: Promise<void>; timer?: ReturnType<typeof setTimeout>; failures: number; reading: boolean;
};

const roleName = (role: string) => role ? `${role[0].toUpperCase()}${role.slice(1)}`.replace(/[_-]+/g, ' ') : 'Role';
const runToolCallId = (runId: string) => `ploeg-run-${runId}`;
const safeId = (value: string) => value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120);
const clock = (at: string) => at.slice(11, 19);
const tail = (text: string, max: number) => text.length > max ? `…${text.slice(-max)}` : text;
const streamName = (pod: string) => pod.startsWith('sbx-') ? 'sandbox' : 'worker';

/**
 * Projects what Ploeg records of a running Run into its read-only chat in the Agents window: the transcript's messages,
 * thoughts and tool calls as response parts, and the Run's pod logs as a read-only terminal on a tool call. One poller
 * per Run reads with the `after` cursors while someone watches the Run and it runs, backs off when Ploeg or the log store
 * fails, and stops when nobody watches or the Run finishes. Every text passes through `clean` before it is served, and
 * only the watchers Ploeg's team authorization lets see the Run receive it.
 */
export class RunLive {
  /** How often a watched running Run is read again. */
  pollMs: number = runLiveLimits.pollMs;
  private readonly ploeg: PloegClient;
  private readonly host: RunLiveHost;
  private readonly clean: (text: string) => string;
  private readonly feeds = new Map<string, Feed>();
  private closed = false;

  constructor(ploeg: PloegClient, host: RunLiveHost, clean: (text: string) => string) { this.ploeg = ploeg; this.host = host; this.clean = clean; }

  /** Whether a poller is reading this Run now. */
  polling(workItemId: string, runId: string): boolean { return Boolean(this.feeds.get(`${workItemId}:${runId}`)?.timer); }

  /** Stops every poller. */
  close(): void { this.closed = true; for (const feed of this.feeds.values()) this.stop(feed); }

  /**
   * A Run's chat as `user` subscribes to it: the chat Ploeg's Run record gives, with what the transcript and pod logs
   * recorded so far in its turn. Starts the Run's poller while it runs. A read that fails leaves the chat as Ploeg's record gives it.
   */
  async chat(user: User, detail: PloegDetail, toolCallId: string, base: Json): Promise<Json> {
    const run = detail.runs.find(entry => runToolCallId(entry.id) === toolCallId);
    if (!run || !this.ploeg.allows(user, detail.item.team)) return base;
    const feed = this.feed(detail, run);
    await this.load(feed, user);
    if (feed.running) this.schedule(feed, this.pollMs);
    return this.merged(feed, base);
  }

  /** The pod-log terminal of a Run, as `user` subscribes to it in their spelling. Undefined when the Run is unknown or their team may not see it. */
  async terminal(user: User, detail: PloegDetail, runId: string, spelling: Spelling): Promise<Json | undefined> {
    const run = detail.runs.find(entry => entry.id === runId);
    if (!run || !this.ploeg.allows(user, detail.item.team)) return undefined;
    const feed = this.feed(detail, run);
    await this.load(feed, user);
    if (!feed.logShown) return undefined;
    if (feed.running) this.schedule(feed, this.pollMs);
    return { title: `Pod logs · ${roleName(run.role)}`, content: [{ type: 'unclassified', value: feed.logText }], lifecycle: feed.ended ? { status: 'exited' } : { status: 'running' }, claim: { kind: 'session', session: spelling.session, chat: spelling.chat }, supportsCommandDetection: false, isPty: false };
  }

  /** One read of a Run's poller. Public so a test can drive it. */
  async tick(workItemId: string, runId: string): Promise<void> {
    const feed = this.feeds.get(`${workItemId}:${runId}`);
    if (!feed || this.closed) return;
    if (feed.reading) { this.schedule(feed, this.pollMs); return; }
    const reader = this.host.watchers(feed.publicId, feed.toolCallId, podLogsChannel(feed.publicId, feed.runId)).find(user => this.ploeg.allows(user, feed.team));
    if (!reader) { this.stop(feed); return; }
    try {
      const detail = await this.ploeg.detail(reader, feed.workItemId, true);
      const run = detail.runs.find(entry => entry.id === feed.runId);
      if (!run) { this.stop(feed); return; }
      const actions = await this.read(feed, reader, run);
      if (actions.length) this.host.publish(feed.publicId, feed.toolCallId, podLogsChannel(feed.publicId, feed.runId), feed.team, actions);
      feed.failures = 0;
      if (feed.running) this.schedule(feed, this.pollMs); else this.stop(feed);
    } catch (error) {
      if (!(error instanceof PloegError)) throw error;
      if ([403, 404].includes(error.status)) { this.stop(feed); return; }
      feed.failures++;
      this.schedule(feed, Math.min(runLiveLimits.maxBackoffMs, this.pollMs * 2 ** feed.failures));
    }
  }

  private feed(detail: PloegDetail, run: PloegRun): Feed {
    const key = `${detail.item.id}:${run.id}`;
    let feed = this.feeds.get(key);
    if (feed) { this.feeds.delete(key); this.feeds.set(key, feed); return feed; }
    const publicId = `wi-${detail.item.id}`;
    const toolCallId = runToolCallId(run.id);
    const turnId = `${toolCallId}-turn`;
    const terminal = podLogsChannel(publicId, run.id);
    const logPart = { kind: 'toolCall', toolCall: { toolCallId: `${turnId}-logs`, toolName: podLogsToolName, displayName: 'Pod logs', status: 'running', invocationMessage: 'Pod logs', toolInput: `pod logs of ${roleName(run.role)} Run ${run.id}`, confirmed: 'not-needed', content: [{ type: 'terminal', resource: terminal, title: 'Pod logs', isPty: false }] } };
    feed = { key, workItemId: detail.item.id, runId: run.id, publicId, toolCallId, turnId, team: detail.item.team, role: roleName(run.role), running: run.state !== 'finished', cursor: 0, transcript: false, parts: [], tools: new Map(), logText: '', logPart, logShown: false, ended: false, failures: 0, reading: false };
    this.feeds.set(key, feed);
    for (const [oldKey, old] of this.feeds) { if (this.feeds.size <= runLiveLimits.runs) break; if (!old.timer) this.feeds.delete(oldKey); }
    return feed;
  }

  private async load(feed: Feed, user: User): Promise<void> {
    if (!feed.loaded) {
      feed.loaded = (async () => {
        feed.reading = true;
        try {
          const detail = await this.ploeg.detail(user, feed.workItemId);
          const run = detail.runs.find(entry => entry.id === feed.runId);
          if (run) await this.read(feed, user, run);
        } catch (error) { if (!(error instanceof PloegError)) throw error; feed.loaded = undefined; }
        finally { feed.reading = false; }
      })();
    }
    await feed.loaded;
  }

  private async read(feed: Feed, user: User, run: PloegRun): Promise<LiveAction[]> {
    feed.reading = true;
    try {
      const actions: LiveAction[] = [];
      for (let page = 0; page < runLiveLimits.pages; page++) {
        const read = await this.ploeg.runTranscript(user, feed.workItemId, feed.runId, String(feed.cursor));
        if (!read.available) break;
        feed.transcript = true;
        for (const entry of read.entries) actions.push(...this.entry(feed, entry));
        feed.cursor = Math.max(feed.cursor, read.nextAfter);
        if (!read.hasMore) break;
      }
      actions.push(...await this.logs(feed, user));
      const finished = run.state === 'finished';
      if (finished && !feed.ended) actions.push(...this.finish(feed));
      feed.running = !finished;
      return actions;
    } finally { feed.reading = false; }
  }

  private async logs(feed: Feed, user: User): Promise<LiveAction[]> {
    let lines: RunLogLine[];
    try {
      const read = await this.ploeg.runLogs(user, feed.workItemId, feed.runId, feed.logCursor);
      if (!read.available) return [];
      lines = read.lines;
      if (read.cursor) feed.logCursor = read.cursor;
    } catch (error) { if (error instanceof PloegError) return []; throw error; }
    const actions: LiveAction[] = feed.logShown ? [] : this.showLogs(feed);
    const text = lines.map(line => `${clock(line.at)} ${line.stream ? `[${streamName(line.stream)}] ` : ''}${this.clean(line.text)}\n`).join('');
    if (!text) return actions;
    feed.logText = tail(feed.logText + text, liveOutputLimits.kept);
    return [...actions, { to: 'terminal', action: { type: 'terminal/data', data: text } }];
  }

  private showLogs(feed: Feed): LiveAction[] {
    feed.logShown = true;
    const { toolCall } = feed.logPart;
    return [
      { to: 'chat', action: { type: 'chat/toolCallStart', turnId: feed.turnId, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, displayName: toolCall.displayName } },
      { to: 'chat', action: { type: 'chat/toolCallReady', turnId: feed.turnId, toolCallId: toolCall.toolCallId, invocationMessage: toolCall.invocationMessage, toolInput: toolCall.toolInput, confirmed: 'not-needed' } },
      { to: 'chat', action: { type: 'chat/toolCallContentChanged', turnId: feed.turnId, toolCallId: toolCall.toolCallId, content: toolCall.content } },
    ];
  }

  private entry(feed: Feed, entry: TranscriptEntry): LiveAction[] {
    const turnId = feed.turnId;
    if (entry.kind === 'tool_call' || entry.kind === 'tool_output') return this.tool(feed, entry);
    const id = `${turnId}-entry-${entry.seq}`;
    const part = entry.kind === 'thought' ? { kind: 'reasoning', id, content: this.clean(entry.text ?? '') }
      : entry.kind === 'plan' ? { kind: 'markdown', id, content: `**Plan**\n\n${(entry.plan ?? []).map(step => `- [${step.status === 'completed' ? 'x' : ' '}] ${this.clean(step.content)}${step.status === 'in_progress' ? ' (in progress)' : ''}`).join('\n')}` }
      : entry.kind === 'stage' ? { kind: 'markdown', id, content: `*${this.clean(entry.text ?? '')}*` }
      : entry.kind === 'truncated' ? { kind: 'markdown', id, content: '*Ploeg stopped recording this Run\'s transcript here: it reached its size limit.*' }
      : { kind: 'markdown', id, content: this.clean(entry.text ?? '') };
    if (!part.content.trim()) return [];
    return this.push(feed, part) ? [{ to: 'chat', action: { type: 'chat/responsePart', turnId, part } }] : [];
  }

  private push(feed: Feed, part: Json): boolean {
    if (feed.parts.length >= runLiveLimits.parts) return false;
    feed.parts.push(part);
    return true;
  }

  private tool(feed: Feed, entry: TranscriptEntry): LiveAction[] {
    const turnId = feed.turnId;
    const key = entry.toolCallId ?? String(entry.seq);
    let tool = feed.tools.get(key);
    const actions: LiveAction[] = [];
    if (!tool) {
      const title = this.clean(entry.title ?? (entry.kind === 'tool_output' ? 'Tool output' : 'Tool call'));
      const toolCallId = `${turnId}-tool-${safeId(key)}`;
      const input = entry.input ? this.clean(entry.input) : entry.paths?.length ? entry.paths.map(path => this.clean(path)).join('\n') : undefined;
      const part = { kind: 'toolCall', toolCall: { toolCallId, toolName: entry.toolKind ?? 'tool', displayName: title, status: 'running', invocationMessage: title, ...(input ? { toolInput: input } : {}), confirmed: 'not-needed' } };
      if (!this.push(feed, part)) return [];
      tool = { toolCallId, part, output: '', title, done: false };
      feed.tools.set(key, tool);
      actions.push(
        { to: 'chat', action: { type: 'chat/toolCallStart', turnId, toolCallId, toolName: part.toolCall.toolName, displayName: title } },
        { to: 'chat', action: { type: 'chat/toolCallReady', turnId, toolCallId, invocationMessage: title, ...(input ? { toolInput: input } : {}), confirmed: 'not-needed' } },
      );
    }
    if (tool.done) return actions;
    if (entry.kind === 'tool_output' && entry.text) {
      tool.output = tail(this.clean(entry.text), runLiveLimits.toolOutput);
      const content = [{ type: 'text', text: tool.output }];
      tool.part.toolCall = { ...tool.part.toolCall, content };
      actions.push({ to: 'chat', action: { type: 'chat/toolCallContentChanged', turnId, toolCallId: tool.toolCallId, content } });
    }
    if (entry.kind === 'tool_call' && (entry.status === 'completed' || entry.status === 'failed')) actions.push(this.complete(feed, tool, entry.status === 'completed'));
    return actions;
  }

  private complete(feed: Feed, tool: ToolState, success: boolean, unfinished = false): LiveAction {
    tool.done = true;
    const message = unfinished ? `${tool.title} did not report a result before the Run ended` : success ? tool.title : `${tool.title} failed`;
    const result = { success, pastTenseMessage: message, ...(tool.output ? { content: [{ type: 'text', text: tool.output }] } : {}), ...(!success ? { error: { message: unfinished ? message : failureHeadline(tool.output || message) } } : {}) };
    tool.part.toolCall = { ...tool.part.toolCall, status: 'completed', ...result };
    return { to: 'chat', action: { type: 'chat/toolCallComplete', turnId: feed.turnId, toolCallId: tool.toolCallId, result } };
  }

  private finish(feed: Feed): LiveAction[] {
    const actions = [...feed.tools.values()].filter(tool => !tool.done).map(tool => this.complete(feed, tool, false, true));
    feed.ended = true;
    if (!feed.logShown) return actions;
    const result = { success: true, pastTenseMessage: 'Pod logs', content: feed.logPart.toolCall.content };
    feed.logPart.toolCall = { ...feed.logPart.toolCall, status: 'completed', ...result };
    actions.push({ to: 'chat', action: { type: 'chat/toolCallComplete', turnId: feed.turnId, toolCallId: feed.logPart.toolCall.toolCallId, result } }, { to: 'terminal', action: { type: 'terminal/exited' } });
    return actions;
  }

  private merged(feed: Feed, base: Json): Json {
    const turn = base.activeTurn ?? base.turns?.[0];
    if (!turn) return base;
    const [notice, ...rest] = turn.responseParts as Json[];
    const leading = feed.transcript && notice?.kind === 'systemNotification' ? [{ ...notice, content: liveRunNotice(feed.role, feed.running) }] : notice ? [notice] : [];
    const responseParts = [...leading, ...(feed.logShown ? [feed.logPart] : []), ...feed.parts, ...(notice ? rest : [])];
    const merged = { ...turn, responseParts };
    return base.activeTurn ? { ...base, activeTurn: merged } : { ...base, turns: [merged, ...base.turns.slice(1)] };
  }

  private schedule(feed: Feed, delay: number): void {
    if (this.closed) return;
    if (feed.timer) clearTimeout(feed.timer);
    feed.timer = setTimeout(() => { feed.timer = undefined; void this.tick(feed.workItemId, feed.runId).catch(() => {}); }, delay);
    feed.timer.unref?.();
  }

  private stop(feed: Feed): void { if (feed.timer) { clearTimeout(feed.timer); feed.timer = undefined; } }
}
