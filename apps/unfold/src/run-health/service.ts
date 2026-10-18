import type { User } from '../types.ts';
import type { PloegDetail, PloegRun } from '../ploeg.ts';
import { PloegError } from '../ploeg.ts';
import type { RunTranscript, TranscriptEntry } from '../run-transcript.ts';
import type { Store } from '../store.ts';
import { combineHealth, latestPlan, runHealth } from '../../public/core/run-health.js';
import { guardSignals, transcriptCalls } from '../../public/core/guard.js';
import { judgeLimits, type JudgeState, type RunJudge, type RunJudgement } from './judge.ts';

/** The Ploeg reads Run health needs. Both refuse a Work Item outside the caller's Teams. */
export interface RunHealthWorkItems {
  detail(user: User, id: string, fresh?: boolean): Promise<PloegDetail>;
  runTranscript(user: User, id: string, runId: string, after?: string, fresh?: boolean): Promise<RunTranscript>;
}

/** One signal's verdict, as `runHealth` computes it. */
export type HealthSignal = { key: string; health: string; reason: string; judged: boolean };
/** What the health route answers for one Run. `health` is null for a Run that is not running; `combined` is the badge, the signals raised by the judge. */
export type RunHealthView = { runId: string; state: PloegRun['state']; health: string | null; signals: HealthSignal[]; deciding: string | null; reason: string; combined: { health: string; source: 'signals' | 'judge' } | null; judge: RunJudgement | null; judgeState: JudgeState; judgements: number; history: RunJudgement[]; stale: boolean; asOf: string; demo: boolean };
export type RunHealthOptions = {
  demo: boolean;
  judge?: RunJudge;
  judgeEnabled: (user: User, team: string) => Promise<boolean>;
  record?: (user: User, name: string, workItemId: string, props: Record<string, string | number | boolean>) => void;
  now?: () => Date;
};

type Result = { health: string | null; signals: HealthSignal[]; deciding: string | null; reason: string; stale?: boolean };
type Tripwire = { id: string; severity: string; label: string; at: number | null };
type Tail = { cursor: number; entries: TranscriptEntry[]; plan: TranscriptEntry | null; calls: Map<string, TranscriptEntry>; tripwires: Map<string, Tripwire>; available: boolean; reason: 'demo' | 'unsupported'; reading: Promise<boolean> | null; last: Result | null; lastAt: string; reported: string | null; signals: Record<string, string>; planKey: string; judgedPlanKey: string; judgedAt: number; attempts: number | null; state: JudgeState; judging: Promise<void> | null };

const tailEntries = judgeLimits.windowEntries;
const tailCalls = 20;
const pagesPerRead = 10;
const trackedRuns = 200;
const historyLimit = 20;
const tripwireLimit = 50;

/**
 * Computes the health of a running Run on Unfold's server (RFC-0007, Unfold ADR 0046), so every viewer sees one answer
 * and the judge does not depend on a browser. It keeps, per Run, a small tail of the transcript read incrementally from
 * Ploeg, and every guard.js tripwire hit it saw (up to 50), so a hit still counts once its entries left the tail. With the Team's `cards.health.judge` flag on, a non-viewer's read may start one shadow judgement: on a plan
 * change, on a signal turning to Watch, otherwise at most every 10 minutes, at most 9 per Run, one at a time, never in
 * the demo and never for a Run that is not running. A judgement only records and shows.
 */
export class RunHealthService {
  private readonly store: Store;
  private readonly workItems: RunHealthWorkItems;
  private readonly options: RunHealthOptions;
  private readonly tails = new Map<string, Tail>();

  constructor(store: Store, workItems: RunHealthWorkItems, options: RunHealthOptions) { this.store = store; this.workItems = workItems; this.options = options; }

  private clock(): number { return (this.options.now?.() ?? new Date()).getTime(); }

  private tail(runId: string): Tail {
    let tail = this.tails.get(runId);
    if (!tail) {
      tail = { cursor: 0, entries: [], plan: null, calls: new Map(), tripwires: new Map(), available: true, reason: 'unsupported', reading: null, last: null, lastAt: '', reported: null, signals: {}, planKey: '', judgedPlanKey: '', judgedAt: 0, attempts: null, state: 'idle', judging: null };
      this.tails.set(runId, tail);
      if (this.tails.size > trackedRuns) for (const [id, entry] of this.tails) { if (!entry.judging && id !== runId) { this.tails.delete(id); break; } }
    }
    return tail;
  }

  private absorb(tail: Tail, entries: TranscriptEntry[]): void {
    const ids = new Set(entries.map(entry => entry.toolCallId).filter(Boolean));
    for (const hit of guardSignals(transcriptCalls([...[...tail.calls.values()].filter(call => ids.has(call.toolCallId)), ...entries])) as Tripwire[]) {
      if (!tail.tripwires.has(hit.id) && tail.tripwires.size < tripwireLimit) tail.tripwires.set(hit.id, { id: hit.id, severity: hit.severity, label: hit.label, at: hit.at });
    }
    for (const entry of entries) {
      tail.entries.push(entry);
      if (entry.kind === 'plan') tail.plan = entry;
      if (entry.kind === 'tool_call' && entry.toolCallId) {
        const known = tail.calls.get(entry.toolCallId);
        tail.calls.set(entry.toolCallId, known ? { ...known, at: entry.at, status: entry.status ?? known.status, input: known.input || entry.input } : entry);
        while (tail.calls.size > tailCalls) tail.calls.delete(tail.calls.keys().next().value!);
      }
    }
    tail.entries = tail.entries.slice(-tailEntries);
  }

  private read(user: User, workItemId: string, runId: string, tail: Tail): Promise<boolean> {
    tail.reading ??= (async () => {
      try {
        for (let page = 0; page < pagesPerRead; page += 1) {
          const read = await this.workItems.runTranscript(user, workItemId, runId, String(tail.cursor), false);
          tail.available = read.available;
          if (!read.available) { tail.reason = read.reason === 'demo' ? 'demo' : 'unsupported'; return true; }
          this.absorb(tail, read.entries);
          tail.cursor = Math.max(tail.cursor, read.nextAfter);
          if (!read.hasMore) break;
        }
        return true;
      } catch { return false; }
      finally { tail.reading = null; }
    })();
    return tail.reading;
  }

  private entries(tail: Tail): TranscriptEntry[] {
    const bySeq = new Map<number, TranscriptEntry>();
    for (const entry of [...(tail.plan ? [tail.plan] : []), ...tail.calls.values(), ...tail.entries]) bySeq.set(entry.seq, entry);
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  }

  /** The health of one Run of a Work Item the caller can see. Finished and pending Runs answer their stored verdicts only. */
  async health(user: User, workItemId: string, runId: string): Promise<RunHealthView> {
    const detail = await this.workItems.detail(user, workItemId);
    const run = detail.runs.find(entry => entry.id === runId);
    if (!run || run.workItemId !== workItemId) throw new PloegError(404, 'ploeg_not_found', 'This Run is not part of the Work Item.');
    const demo = this.options.demo || detail.demo === true;
    const history = this.store.runJudgements(runId, historyLimit);
    const now = this.clock();
    const base = { runId, state: run.state, judge: history[0] ?? null, judgements: this.store.countRunJudgements(runId), history, demo };
    if (run.state !== 'running') {
      this.tails.delete(runId);
      return { ...base, health: null, signals: [], deciding: null, reason: '', combined: null, judgeState: 'off', stale: false, asOf: new Date(now).toISOString() };
    }
    const tail = this.tail(runId);
    const fresh = await this.read(user, workItemId, runId, tail);
    const entries = this.entries(tail);
    const stale = !fresh && tail.last !== null;
    const result = (stale ? runHealth({ run, now, stale: tail.last }) : runHealth({ run, entries, now, transcriptState: !fresh ? 'failed' : tail.available ? 'loaded' : tail.reason, tripwires: [...tail.tripwires.values()] })) as Result;
    if (!stale) this.remember(user, workItemId, runId, tail, result, now);
    const judgeState = await this.consider(user, detail, run, tail, result, entries, stale, demo);
    const view = { ...base, judge: this.store.runJudgements(runId, 1)[0] ?? null, judgements: this.store.countRunJudgements(runId) };
    return { ...view, health: result.health, signals: result.signals, deciding: result.deciding, reason: result.reason, combined: combineHealth({ health: result.health ?? 'unknown' }, view.judge), judgeState, stale, asOf: tail.lastAt };
  }

  private remember(user: User, workItemId: string, runId: string, tail: Tail, result: Result, now: number): void {
    tail.last = result;
    tail.lastAt = new Date(now).toISOString();
    if (result.health && result.health !== tail.reported) {
      this.options.record?.(user, 'run.health.changed', workItemId, { old: tail.reported ?? 'none', new: result.health, signal: result.deciding ?? 'none', run: runId });
      tail.reported = result.health;
    }
  }

  private async consider(user: User, detail: PloegDetail, run: PloegRun, tail: Tail, result: Result, entries: TranscriptEntry[], stale: boolean, demo: boolean): Promise<JudgeState> {
    const previous = tail.signals;
    tail.signals = Object.fromEntries(result.signals.map(entry => [entry.key, entry.health]));
    const plan = latestPlan(entries);
    tail.planKey = plan ? JSON.stringify(plan) : '';
    if (demo || !this.options.judge) return 'off';
    if (!await this.options.judgeEnabled(user, run.team)) return 'off';
    tail.attempts ??= this.store.countRunJudgements(run.id);
    if (tail.judging) return 'judging';
    if (tail.attempts >= judgeLimits.perRun) return 'cap_reached';
    if (user.role === 'viewer' || stale || !result.health || result.health === 'not_yet') return tail.state;
    const now = this.clock();
    const planChanged = tail.planKey !== '' && tail.planKey !== tail.judgedPlanKey;
    const turnedWatch = result.signals.some(entry => entry.health === 'watch' && previous[entry.key] !== 'watch');
    if (!planChanged && !turnedWatch && now - tail.judgedAt < judgeLimits.intervalMs) return tail.state;
    tail.attempts += 1;
    tail.judgedAt = now;
    tail.judgedPlanKey = tail.planKey;
    tail.state = 'judging';
    const judge = this.options.judge;
    tail.judging = judge.judge({ user, workItemId: detail.item.id, runId: run.id, title: detail.item.title, description: detail.item.description, plan, entries: tail.entries, signals: result })
      .then(outcome => {
        if (!outcome.admitted) tail.attempts = Math.max(0, (tail.attempts ?? 1) - 1);
        if (outcome.judgement) this.store.saveRunJudgement(outcome.judgement);
        tail.state = outcome.state;
      })
      .finally(() => { tail.judging = null; });
    return 'judging';
  }

  /** Resolves once the judgement running for `runId`, if any, has finished. */
  async settled(runId: string): Promise<void> { await this.tails.get(runId)?.judging; }

  /** Records that a person found one judge verdict wrong, as a product event (RFC-0001). The caller must see the Work Item. */
  async wrong(user: User, workItemId: string, runId: string, judgementId: string): Promise<{ recorded: boolean }> {
    await this.workItems.detail(user, workItemId);
    const judgement = this.store.getRunJudgement(judgementId);
    if (!judgement || judgement.runId !== runId || judgement.workItemId !== workItemId) throw new PloegError(404, 'judgement_not_found', 'This judgement is not part of the Run.');
    this.options.record?.(user, 'run.health.judge_wrong', workItemId, { run: runId, judgement: judgement.id, health: judgement.health, model: judgement.model.slice(0, 64) });
    return { recorded: true };
  }
}
