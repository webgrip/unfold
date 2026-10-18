import type { User } from '../types.ts';
import type { PloegDetail } from '../ploeg.ts';
import { PloegError } from '../ploeg.ts';
import type { Store } from '../store.ts';
import type { DeciderIdentity } from '../decider/decider.ts';
import type { TripwireHit, TripwireTranscript, TripwireVerdict } from './reader.ts';

/** Whether the tripwire screens a Work Item's Runs: `off` (the demo, or no Ploeg connection), `no_decider`, `flag_off` for its Team, or `active`. */
export type TripwireStatus = 'off' | 'no_decider' | 'flag_off' | 'active';
/** What the tripwire route answers for one Work Item. Demo hits carry `demo: true` and were never screened. */
export type TripwireView = { workItemId: string; status: TripwireStatus; decider: DeciderIdentity | null; screened: number; missed: number; runs: { runId: string; screened: number; missed: number; transcript: TripwireTranscript }[]; hits: (TripwireHit & { demo?: true })[]; demo: boolean };
/** The Ploeg read the route needs; it refuses a Work Item outside the caller's Teams. */
export interface TripwireWorkItems { detail(user: User, id: string, fresh?: boolean): Promise<PloegDetail> }
export type TripwireServiceOptions = { demo: boolean; connected: boolean; decider: DeciderIdentity | null; enabled: (team: string) => Promise<boolean>; record?: (user: User, name: string, workItemId: string, props: Record<string, string | number | boolean>) => void; now?: () => Date };

const demoDecider: DeciderIdentity = { name: 'Demo', model: 'none' };

/** The illustrative hits the demo shows on a running Run: labelled demo, never screened by any decider. */
export function demoTripwireHits(detail: PloegDetail): (TripwireHit & { demo: true })[] {
  return detail.runs.filter(run => run.state === 'running').map(run => ({ id: `demo-${run.id}-reads_credentials`, runId: run.id, workItemId: run.workItemId, team: run.team, seq: 0, at: run.startedAt ?? detail.item.updatedAt, check: 'reads_credentials', score: 2, decider: demoDecider, excerpt: 'execute · Read the example environment file · cat .env.example', verdict: null, verdictAt: null, demo: true as const }));
}

/** Serves the tripwire's hits and counts per Work Item, and records a person's verdict on a hit (RFC-0008). It reads what the reader stored and never acts on a Run. */
export class TripwireService {
  private readonly store: Store;
  private readonly workItems: TripwireWorkItems;
  private readonly options: TripwireServiceOptions;

  constructor(store: Store, workItems: TripwireWorkItems, options: TripwireServiceOptions) { this.store = store; this.workItems = workItems; this.options = options; }

  private async status(team: string): Promise<TripwireStatus> {
    if (this.options.demo || !this.options.connected) return 'off';
    if (!this.options.decider) return 'no_decider';
    return await this.options.enabled(team).catch(() => false) ? 'active' : 'flag_off';
  }

  /** The hits on a Work Item's Runs, newest first, with the reader's counts and status. Same authorization as the Work Item. */
  async view(user: User, workItemId: string): Promise<TripwireView> {
    const detail = await this.workItems.detail(user, workItemId);
    const demo = this.options.demo || detail.demo === true;
    const runIds = new Set(detail.runs.map(run => String(run.id)));
    const runs = this.store.tripwireRunsOf(workItemId).filter(state => runIds.has(state.runId)).map(state => ({ runId: state.runId, screened: state.screened, missed: state.missed, transcript: state.transcript }));
    const hits = demo ? demoTripwireHits(detail) : this.store.tripwireHits(workItemId).filter(hit => runIds.has(hit.runId));
    return { workItemId, status: await this.status(detail.item.team), decider: demo ? null : this.options.decider, screened: runs.reduce((sum, run) => sum + run.screened, 0), missed: runs.reduce((sum, run) => sum + run.missed, 0), runs, hits, demo };
  }

  /** Records a person's verdict on one hit and the product event `run.tripwire.verdict`, without the excerpt. Any role that can see the Work Item. The demo records nothing. */
  async verdict(user: User, workItemId: string, hitId: string, verdict: unknown): Promise<{ recorded: boolean; verdict: TripwireVerdict; demo: boolean }> {
    if (verdict !== 'right' && verdict !== 'wrong') throw new PloegError(400, 'tripwire_verdict', 'Say right or wrong.');
    const detail = await this.workItems.detail(user, workItemId);
    if (this.options.demo || detail.demo === true) {
      if (!demoTripwireHits(detail).some(hit => hit.id === hitId)) throw new PloegError(404, 'tripwire_hit_not_found', 'This hit is not part of the Work Item.');
      return { recorded: false, verdict, demo: true };
    }
    const hit = this.store.tripwireHit(hitId);
    if (!hit || hit.workItemId !== workItemId || !detail.runs.some(run => String(run.id) === hit.runId)) throw new PloegError(404, 'tripwire_hit_not_found', 'This hit is not part of the Work Item.');
    this.store.setTripwireVerdict(hit.id, verdict, user.id, (this.options.now?.() ?? new Date()).toISOString());
    this.options.record?.(user, 'run.tripwire.verdict', workItemId, { run: hit.runId, hit: hit.id, check: hit.check, score: hit.score, verdict, decider: hit.decider.name.slice(0, 64), model: hit.decider.model.slice(0, 64) });
    return { recorded: true, verdict, demo: false };
  }
}
