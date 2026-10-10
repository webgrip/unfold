import type { Event } from '../types.ts';

type Json = Record<string, any>;

/**
 * A command the crew ran in its sandbox, as its durable `tool` events record it. `id` is the id of the event that first named
 * the command, so a command keeps its terminal across reconnects and restarts.
 */
export type CrewCommand = { id: string; key: string; runId?: string; commandLine: string; title: string; startedAt: number; finished: boolean; output: string; truncated: boolean; exitCode?: number; durationMs?: number };

/** What one durable event did to the session's commands: the command a `tool` event belongs to, and the terminal actions to broadcast. */
export type CommandUpdate = { command?: CrewCommand; content?: Json; actions: Json[] };

/** The terminal channel of one crew command: `ahp-terminal:/<session>/<command>`, the session in its public spelling. */
export const terminalChannel = (publicId: string, commandId: string) => `ahp-terminal:/${publicId}/${commandId}`;

/** Parses a terminal channel into the session's public id and the command's id. */
export function parseTerminalChannel(uri: string): { sessionId: string; commandId: string } | undefined {
  const match = /^ahp-terminal:\/([A-Za-z0-9_-]{1,80})\/(\d{1,15})$/.exec(uri);
  return match ? { sessionId: match[1], commandId: match[2] } : undefined;
}

/** The reason every client action on a terminal is refused. */
export const readOnlyTerminal = 'This terminal is a read-only record of a command the crew ran in its sandbox. Unfold takes no input, resizing, clearing or renaming from a client, and never opens a shell in a sandbox.';

/** The reason `createTerminal` and `disposeTerminal` are refused. */
export const noClientTerminals = 'Unfold does not open or close terminals. It shows the commands its crew runs as read-only terminals on their tool calls, and keeps them as part of the session\'s history.';

const shellTools = new Set(['bash', 'shell', 'sh', 'zsh', 'terminal', 'run_command', 'execute_command', 'run_shell_command']);
const finishedStatuses = new Set(['completed', 'error', 'failed']);
const sessionStops = new Set(['session.completed', 'session.failed', 'session.cancelled', 'session.paused', 'session.interrupted', 'execution.authority_lost']);
const maxTitle = 120;
const terminalActionChannels = new WeakMap<Json, string>();

/** The terminal channel a terminal action belongs on, for an action a {@link CommandLog} returned. */
export const terminalActionChannel = (action: Json): string | undefined => terminalActionChannels.get(action);

/**
 * The command line a `tool` event names: its `command` field, which the demo runtime and command bridges set, or the
 * `command` in the input of a shell tool, which OpenCode records as a JSON preview of at most 2000 characters.
 */
export function commandLineOf(data: Json): string | undefined {
  if (typeof data.command === 'string' && data.command.trim()) return data.command.trim();
  if (!shellTools.has(String(data.name ?? '').toLowerCase()) || typeof data.input !== 'string') return undefined;
  try {
    const parsed = JSON.parse(data.input);
    return typeof parsed?.command === 'string' && parsed.command.trim() ? parsed.command.trim() : undefined;
  } catch {}
  const partial = /"command"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(data.input)?.[1];
  if (!partial) return undefined;
  try { return JSON.parse(`"${partial}"`).trim() || undefined; } catch { return partial.trim() || undefined; }
}

/**
 * The commands of one session, built from its durable events in order. The host keeps one per session projection and feeds
 * it every event it reduces, so a terminal snapshot and the actions that follow it come from the same events.
 */
export class CommandLog {
  readonly publicId: string;
  private readonly clean: (text: string) => string;
  private readonly commands = new Map<string, CrewCommand>();
  private readonly open = new Map<string, string>();

  constructor(publicId: string, clean: (text: string) => string) { this.publicId = publicId; this.clean = clean; }

  get(commandId: string): CrewCommand | undefined { return this.commands.get(commandId); }

  apply(event: Event): CommandUpdate {
    const data = event.data as Json;
    if (event.type === 'run.finished') return { actions: this.endOpen(command => command.runId === event.runId) };
    if (sessionStops.has(event.type)) return { actions: this.endOpen(() => true) };
    if (event.type !== 'tool') return { actions: [] };
    const key = `${event.runId ?? ''}:${typeof data.partId === 'string' && data.partId ? data.partId : String(data.name ?? 'tool')}`;
    const at = Date.parse(event.at) || 0;
    let command = this.commands.get(this.open.get(key) ?? '');
    if (!command) {
      const commandLine = commandLineOf(data);
      if (!commandLine) return { actions: [] };
      const line = this.clean(commandLine);
      const described = typeof data.title === 'string' && data.title.trim() && data.title.trim() !== commandLine ? this.clean(data.title.trim()) : '';
      const title = (described || line.split('\n')[0]).slice(0, maxTitle);
      command = { id: String(event.id), key, ...(event.runId ? { runId: event.runId } : {}), commandLine: line, title, startedAt: at, finished: false, output: '', truncated: false };
      this.commands.set(command.id, command);
      this.open.set(key, command.id);
    }
    const actions = finishedStatuses.has(String(data.status ?? '')) ? this.finish(command, data, at) : [];
    return { command, content: this.content(command), actions };
  }

  /** The tool result content that points a tool call at its command's terminal, with the outcome once the command finished. */
  content(command: CrewCommand): Json {
    const result = command.finished ? { result: { ...(command.exitCode !== undefined ? { exitCode: command.exitCode } : {}), preview: command.output, truncated: command.truncated } } : {};
    return { type: 'terminal', resource: terminalChannel(this.publicId, command.id), title: command.title, isPty: false, ...result };
  }

  /** The terminal's state as AHP 0.9 defines it: one command part, plain text rather than a pseudoterminal, claimed by the session. */
  state(command: CrewCommand, claim: { session: string; chat: string }): Json {
    const part = { type: 'command', commandId: command.id, commandLine: command.commandLine, output: command.output, timestamp: command.startedAt, isComplete: command.finished, ...(command.exitCode !== undefined ? { exitCode: command.exitCode } : {}), ...(command.durationMs !== undefined ? { durationMs: command.durationMs } : {}) };
    const lifecycle = command.finished ? { status: 'exited', ...(command.exitCode !== undefined ? { exitCode: command.exitCode } : {}) } : { status: 'running' };
    return { title: command.title, content: [part], lifecycle, claim: { kind: 'session', session: claim.session, chat: claim.chat }, supportsCommandDetection: true, isPty: false };
  }

  private finish(command: CrewCommand, data: Json, at: number): Json[] {
    const recorded = typeof data.output === 'string' && data.output ? data.output : typeof data.error === 'string' ? data.error : '';
    command.output = this.clean(recorded);
    command.truncated = recorded.startsWith('…');
    if (Number.isInteger(data.exitCode)) command.exitCode = data.exitCode;
    command.durationMs = Number.isFinite(data.durationMs) && data.durationMs >= 0 ? Math.round(data.durationMs) : Math.max(0, at - command.startedAt);
    return this.close(command);
  }

  private endOpen(matches: (command: CrewCommand) => boolean): Json[] {
    return [...this.open.values()].map(id => this.commands.get(id)!).filter(matches).flatMap(command => this.close(command));
  }

  private close(command: CrewCommand): Json[] {
    command.finished = true;
    this.open.delete(command.key);
    const exit = command.exitCode !== undefined ? { exitCode: command.exitCode } : {};
    const actions: Json[] = [
      ...(command.output ? [{ type: 'terminal/data', data: command.output }] : []),
      { type: 'terminal/commandFinished', commandId: command.id, ...exit, ...(command.durationMs !== undefined ? { durationMs: command.durationMs } : {}) },
      { type: 'terminal/exited', ...exit },
    ];
    const channel = terminalChannel(this.publicId, command.id);
    for (const action of actions) terminalActionChannels.set(action, channel);
    return actions;
  }
}
