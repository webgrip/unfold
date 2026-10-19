import type { PloegRunRow } from '../ploeg.ts';
import type { RunTranscript, TranscriptEntry } from '../run-transcript.ts';
import type { Store } from '../store.ts';
import { cleanText } from '../ask/service.ts';
import type { Decider, DeciderIdentity, DeciderQuestion } from '../decider/decider.ts';
import { tripwireChecks, tripwireHitScore } from '../../public/core/tripwire.js';
import { kindFromScores, kindQuestions, progressChecks } from '../../public/core/checks.js';
import { workKindOf } from '../../public/core/work-kind.js';

/** What a person said about one hit. */
export type TripwireVerdict = 'right' | 'wrong';
/** Whether the reader found a transcript for a Run: not read yet, read, or none (a harness without one, or a Ploeg without the endpoint). */
export type TripwireTranscript = 'unknown' | 'available' | 'unavailable';
/** One stored hit (RFC-0008): a check that scored 2 or more on one tool call, the decider that scored it, a redacted excerpt of at most 300 characters, and a person's verdict once given. */
export type TripwireHit = { id: string; runId: string; workItemId: string; team: string; seq: number; at: string; check: string; score: number; decider: DeciderIdentity; excerpt: string; verdict: TripwireVerdict | null; verdictAt: string | null };
/** The reader's persisted state for one Run: the last transcript seq it handled, screens made and missed, and the tool calls already screened. */
export type TripwireRunState = { runId: string; workItemId: string; team: string; cursor: number; screened: number; missed: number; transcript: TripwireTranscript; seen: string[]; updatedAt: string };
/** The decider's Work Kind guess for one Run from its Work Item's title (RFC-0009): the kind, or null when no kind scored clearly enough, and its score. */
export type DeciderKindGuess = { runId: string; workItemId: string; kind: string | null; score: number; decider: DeciderIdentity; at: string };
/** The running Run fields the reader uses. */
export type FollowedRun = Pick<PloegRunRow, 'id' | 'workItemId' | 'team'> & Partial<Pick<PloegRunRow, 'workItemTitle' | 'role' | 'round' | 'writes'>>;
/** The Ploeg reads the reader needs, all for no viewer and none of them a write. */
export interface TripwireSource {
  followRunning(): Promise<FollowedRun[]>;
  followTranscript(workItemId: string, runId: string, after: number): Promise<RunTranscript>;
}
export type TripwireReaderOptions = { decider?: Decider; enabled: (team: string) => Promise<boolean>; progress?: (team: string) => Promise<boolean>; demo: boolean; requestsPerMinute: number; secrets: readonly string[]; now?: () => Date; log?: (line: string) => void; intervalMs?: number };

/** The reader's bounds: the loop's period, the rate window, the excerpt and screened text sizes, the tool call ids kept per Run and transcript pages per Run per round. */
export const tripwireLimits = Object.freeze({ intervalMs: 15_000, windowMs: 60_000, excerpt: 300, text: 2000, seen: 500, pagesPerRun: 4, messageMin: 40 });
const finalStatuses = new Set(['completed', 'failed']);

/** The five checks as decider questions, in RFC-0008's wording. */
export function tripwireQuestions(): DeciderQuestion[] { return tripwireChecks.map(check => ({ key: check.key, question: check.question })); }

/** The text one tool call is screened on: its title, kind, input and paths, redacted and cut to 2000 characters. */
export function screenText(entry: TranscriptEntry, secrets: readonly string[]): string {
  const lines = [`Title: ${entry.title ?? ''}`, `Kind: ${entry.toolKind ?? 'other'}`, `Input: ${entry.input ?? ''}`, `Paths: ${(entry.paths ?? []).join(', ')}`];
  return cleanText(lines.join('\n'), tripwireLimits.text, secrets);
}

/** The excerpt a hit keeps: kind, title and input on one line, redacted and cut to 300 characters. */
export function screenExcerpt(entry: TranscriptEntry, secrets: readonly string[]): string {
  return cleanText([entry.toolKind ?? 'other', entry.title, entry.input || (entry.paths ?? []).join(', ')].filter(Boolean).join(' · ').replace(/\s+/g, ' '), tripwireLimits.excerpt, secrets);
}

/** Whether a transcript entry is a tool call the reader screens: its first entry with an input or paths, or its final entry, and never one already screened. */
export function screenable(entry: TranscriptEntry, seen: ReadonlySet<string>): boolean {
  if (entry.kind !== 'tool_call' || !entry.toolCallId || seen.has(entry.toolCallId)) return false;
  return Boolean(entry.input || entry.paths?.length || (entry.title && entry.status && finalStatuses.has(entry.status)));
}

/** Whether a transcript entry is something the agent wrote that the progress checks read: a thought or message of at least 40 characters, never one already read. */
export function readableMessage(entry: TranscriptEntry, seen: ReadonlySet<string>): boolean {
  return (entry.kind === 'thought' || entry.kind === 'message') && (entry.text ?? '').trim().length >= tripwireLimits.messageMin && !seen.has(messageKey(entry));
}

/** The key a read message is remembered by among the screened tool calls. */
export const messageKey = (entry: TranscriptEntry) => `m${entry.seq}`;

/** The text the progress checks read: the Work Item's title, then what the agent wrote, redacted and cut to 2000 characters. */
export function messageText(entry: TranscriptEntry, title: string, secrets: readonly string[]): string {
  return cleanText(`Work Item: ${title}\nThe agent wrote: ${entry.text ?? ''}`, tripwireLimits.text, secrets);
}

/** The three progress checks as decider questions (RFC-0009). */
export function progressQuestions(): DeciderQuestion[] { return progressChecks.map(check => ({ key: check.key, question: check.question })); }

/**
 * The decider tripwire (RFC-0008, ADR-0042): a server-side loop, every 15 seconds, over the running Runs of Teams whose
 * `runs.tripwire` flag is on. It screens each new tool call in a Run's transcript once, one at a time and at most
 * `requestsPerMinute` a minute, asks the decider the five checks, and stores every check that scored 2 or more. Each
 * Run's cursor is stored with its hits, so a restart never screens a tool call twice. A failed screen is counted as
 * missed and logged. It reads Ploeg with the consumer credential for no viewer and never stops, cancels, steers or
 * notes a Run. Off in the demo and without a decider.
 */
export class TripwireReader {
  private readonly store: Store;
  private readonly source: TripwireSource;
  private readonly options: TripwireReaderOptions;
  private readonly screens: number[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking: Promise<void> | null = null;
  private offset = 0;

  constructor(store: Store, source: TripwireSource, options: TripwireReaderOptions) { this.store = store; this.source = source; this.options = options; }

  /** Whether the reader screens anything: not in the demo, and only with a decider. */
  get active(): boolean { return !this.options.demo && Boolean(this.options.decider); }

  /** Starts the loop; does nothing when the reader is not active or already started. */
  start(): void {
    if (!this.active || this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, this.options.intervalMs ?? tripwireLimits.intervalMs);
    this.timer.unref?.();
  }

  /** Stops the loop. A round already running finishes. */
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  /** One round of the loop, never two at once. Throws nothing. Public so a test can drive it. */
  tick(): Promise<void> {
    this.ticking ??= this.round().catch(error => this.log({ level: 'error', event: 'tripwire.round_failed', message: this.clean(error) })).finally(() => { this.ticking = null; });
    return this.ticking;
  }

  private clock(): number { return (this.options.now?.() ?? new Date()).getTime(); }
  private clean(error: unknown): string { return cleanText(String((error as Error)?.message ?? error), 300, this.options.secrets); }
  private log(fields: Record<string, unknown>): void { (this.options.log ?? (line => console.error(line)))(JSON.stringify(Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null)))); }

  private take(): boolean {
    const now = this.clock();
    while (this.screens.length && now - this.screens[0]! >= tripwireLimits.windowMs) this.screens.shift();
    if (this.screens.length >= this.options.requestsPerMinute) return false;
    this.screens.push(now);
    return true;
  }

  private async round(): Promise<void> {
    if (!this.active) return;
    let runs: FollowedRun[];
    try { runs = await this.source.followRunning(); }
    catch (error) { this.log({ level: 'warn', event: 'tripwire.runs_unread', message: this.clean(error) }); return; }
    if (!runs.length) return;
    this.offset = (this.offset + 1) % runs.length;
    const ordered = [...runs.slice(this.offset), ...runs.slice(0, this.offset)];
    const teams = new Map<string, { calls: boolean; messages: boolean }>();
    for (const run of ordered) {
      if (!teams.has(run.team)) teams.set(run.team, { calls: await this.options.enabled(run.team).catch(() => false), messages: await (this.options.progress?.(run.team) ?? Promise.resolve(false)).catch(() => false) });
      const reads = teams.get(run.team)!;
      if (!reads.calls && !reads.messages) continue;
      if (!await this.screenRun(run, reads)) break;
    }
  }

  private async screenRun(run: FollowedRun, reads: { calls: boolean; messages: boolean }): Promise<boolean> {
    if (reads.messages && !await this.guessKind(run)) return false;
    const state: TripwireRunState = this.store.tripwireRun(run.id) ?? { runId: run.id, workItemId: run.workItemId, team: run.team, cursor: 0, screened: 0, missed: 0, transcript: 'unknown', seen: [], updatedAt: '' };
    const seen = new Set(state.seen);
    for (let page = 0; page < tripwireLimits.pagesPerRun; page += 1) {
      let read: RunTranscript;
      try { read = await this.source.followTranscript(run.workItemId, run.id, state.cursor); }
      catch (error) { this.log({ level: 'warn', event: 'tripwire.transcript_unread', run: run.id, workItem: run.workItemId, message: this.clean(error) }); return true; }
      if (!read.available) {
        if (state.transcript !== 'unavailable') this.save({ ...state, transcript: 'unavailable' }, seen, []);
        return true;
      }
      const known = state.transcript === 'available' ? state.cursor : -1;
      state.transcript = 'available';
      for (const entry of [...read.entries].sort((a, b) => a.seq - b.seq)) {
        if (entry.seq <= state.cursor) continue;
        const call = reads.calls && screenable(entry, seen);
        const message = reads.messages && readableMessage(entry, seen);
        if (!call && !message) { state.cursor = entry.seq; continue; }
        if (!this.take()) { this.save(state, seen, []); return false; }
        const hits = call ? await this.screen(run, entry, state) : await this.readMessage(run, entry, state);
        seen.add(call ? entry.toolCallId! : messageKey(entry));
        state.cursor = entry.seq;
        this.save(state, seen, hits);
      }
      state.cursor = Math.max(state.cursor, read.nextAfter);
      if (state.cursor !== known) this.save(state, seen, []);
      if (!read.hasMore) break;
    }
    return true;
  }

  private async guessKind(run: FollowedRun): Promise<boolean> {
    if (this.store.deciderKind(run.id) || !run.workItemTitle || workKindOf({ title: run.workItemTitle }, { writes: run.writes, round: run.round, role: run.role }).source !== 'default') return true;
    if (!this.take()) return false;
    const decider = this.options.decider!;
    try {
      const answer = await decider.ask(cleanText(`Title: ${run.workItemTitle}`, tripwireLimits.text, this.options.secrets), kindQuestions(), 'work_item');
      const guess = kindFromScores(answer.scores);
      this.store.saveDeciderKind({ runId: run.id, workItemId: run.workItemId, kind: guess?.kind ?? null, score: guess?.score ?? 0, decider: answer.decider, at: new Date(this.clock()).toISOString() });
    } catch (error) {
      this.log({ level: 'warn', event: 'decider.kind_missed', run: run.id, workItem: run.workItemId, decider: decider.identity.name, reason: (error as { reason?: string })?.reason, message: this.clean(error) });
    }
    return true;
  }

  private async readMessage(run: FollowedRun, entry: TranscriptEntry, state: TripwireRunState): Promise<TripwireHit[]> {
    const decider = this.options.decider!;
    try {
      const answer = await decider.ask(messageText(entry, run.workItemTitle ?? '', this.options.secrets), progressQuestions(), 'message');
      state.screened += 1;
      const excerpt = cleanText((entry.text ?? '').replace(/\s+/g, ' '), tripwireLimits.excerpt, this.options.secrets);
      return progressChecks.filter(check => (answer.scores[check.key] ?? 0) >= tripwireHitScore).map(check => ({ id: `${run.id}-${entry.seq}-${check.key}`, runId: run.id, workItemId: run.workItemId, team: run.team, seq: entry.seq, at: entry.at, check: check.key, score: answer.scores[check.key]!, decider: answer.decider, excerpt, verdict: null, verdictAt: null }));
    } catch (error) {
      state.missed += 1;
      this.log({ level: 'warn', event: 'decider.message_missed', run: run.id, workItem: run.workItemId, seq: entry.seq, decider: decider.identity.name, reason: (error as { reason?: string })?.reason, message: this.clean(error) });
      return [];
    }
  }

  private async screen(run: FollowedRun, entry: TranscriptEntry, state: TripwireRunState): Promise<TripwireHit[]> {
    const decider = this.options.decider!;
    try {
      const answer = await decider.ask(screenText(entry, this.options.secrets), tripwireQuestions(), 'action');
      state.screened += 1;
      const excerpt = screenExcerpt(entry, this.options.secrets);
      return tripwireChecks.filter(check => (answer.scores[check.key] ?? 0) >= tripwireHitScore).map(check => ({ id: `${run.id}-${entry.seq}-${check.key}`, runId: run.id, workItemId: run.workItemId, team: run.team, seq: entry.seq, at: entry.at, check: check.key, score: answer.scores[check.key]!, decider: answer.decider, excerpt, verdict: null, verdictAt: null }));
    } catch (error) {
      state.missed += 1;
      this.log({ level: 'warn', event: 'tripwire.screen_missed', run: run.id, workItem: run.workItemId, seq: entry.seq, decider: decider.identity.name, reason: (error as { reason?: string })?.reason, message: this.clean(error) });
      return [];
    }
  }

  private save(state: TripwireRunState, seen: Set<string>, hits: TripwireHit[]): void {
    state.seen = [...seen].slice(-tripwireLimits.seen);
    state.updatedAt = new Date(this.clock()).toISOString();
    this.store.recordTripwire(state, hits);
  }
}
