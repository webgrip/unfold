import type { Store } from './store.ts';
import type { ErrorReports } from './error-reports.ts';

const hourMs = 3_600_000;
export const optimizeEveryMs = 4 * hourMs;
export const quickCheckEveryMs = 24 * hourMs;
export const quickCheckStateId = 'store.quick_check';
const reportedProblems = 10;

type QuickCheckState = { at: number; ok: boolean };

/**
 * Database upkeep for a maintenance timer: deletes the sign-in tokens of ended logins, refreshes the planner's
 * statistics every few hours, and once a day runs `quick_check`, logging the result and reporting a damaged database through error reports. It never runs at boot.
 */
export class StoreUpkeep {
  private store: Pick<Store, 'optimize' | 'quickCheck' | 'getSecret' | 'setSecret' | 'prunePersonGrants'>;
  private errors: ErrorReports;
  private now: () => number;
  private optimizedAt: number;

  constructor(store: Pick<Store, 'optimize' | 'quickCheck' | 'getSecret' | 'setSecret' | 'prunePersonGrants'>, errors: ErrorReports, now: () => number = Date.now) {
    this.store = store;
    this.errors = errors;
    this.now = now;
    this.optimizedAt = now();
  }

  run(): void {
    const at = this.now();
    this.store.prunePersonGrants();
    if (at - this.optimizedAt >= optimizeEveryMs) {
      this.optimizedAt = at;
      this.store.optimize();
    }
    const last = this.store.getSecret<QuickCheckState>(quickCheckStateId);
    if (last && at - last.at < quickCheckEveryMs) return;
    this.quickCheck(at);
  }

  private quickCheck(at: number): void {
    const started = performance.now();
    let problems: string[];
    try { problems = this.store.quickCheck(); }
    catch (error) { problems = [String((error as Error)?.message ?? error)]; }
    const durationMs = Math.round(performance.now() - started);
    try { this.store.setSecret(quickCheckStateId, { at, ok: problems.length === 0 } satisfies QuickCheckState); }
    catch (error) { problems.push(`recording the check failed: ${String((error as Error)?.message ?? error)}`); }
    if (!problems.length) {
      console.log(JSON.stringify({ level: 'info', event: 'store.quick_check', ok: true, durationMs }));
      return;
    }
    const shown = problems.slice(0, reportedProblems).map(problem => problem.slice(0, 300));
    console.error(JSON.stringify({ level: 'error', event: 'store.quick_check', ok: false, durationMs, problems: shown, message: 'SQLite quick_check found problems in unfold.sqlite. Stop the workbench, restore the last good backup and see apps/unfold/docs/operations/storage.md.' }));
    this.errors.capture(new Error(`SQLite quick_check found ${problems.length} problem(s): ${shown[0]}`), { level: 'fatal', tags: { feature: 'store', check: 'quick_check' }, fingerprint: ['store', 'quick_check'], extra: { problems: shown } });
  }
}
