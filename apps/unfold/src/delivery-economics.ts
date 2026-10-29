import type { FactsPage, FactsPullRequest, FactsRun, WorkItemFacts } from './cards/facts.ts';
import type { FactsQuery } from './cards/service.ts';

/** The Insights windows this module measures. */
export type EconomicsWindow = '24h' | '7d' | '30d';
/** How long each window reaches back, in milliseconds. */
export const economicsWindows: Record<EconomicsWindow, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };
/** Below this many merged Work Items, cost per merged Work Item is not divided out (the KPI baseline rule). */
export const minimumMergedSample = 20;
/** How many facts pages of 25 Work Items one reading walks before it stops and says it truncated. */
export const economicsPageBound = 20;
/** How many unsettled or unknown Runs the response lists one by one; the counts and totals cover all of them. */
export const economicsListBound = 50;

/** Why a Run's spend is left out of the settled total: it is still open, or its cost was never reported. */
export type SpendGap = 'unsettled' | 'unknown';
/** One Run whose spend is not added: `usd` is what is known so far (observed or reported), null when nothing is. */
export type OpenSpend = { workItemId: string; team: string; runId: string; status: SpendGap; usd: number | null };
/** K5 for the window: Ploeg's pull requests that merged with no change after the agents finished, of all that merged or closed. */
export type CleanMerge = { clean: number; merged: number; closed: number; rate: number | null };
/** One Team's share of the figures. */
export type TeamEconomics = { team: string; merged: number; settledUsd: number; costPerMergedUsd: number | null; unsettledRuns: number; unknownRuns: number; cleanMerge: CleanMerge };
/** K2 over merged Work Items and K5 for one window, from Ploeg's delivery facts. Amounts are USD. */
export type DeliveryEconomics = {
  demo: false; window: EconomicsWindow; since: string; until: string;
  merged: number; settledUsd: number; costPerMergedUsd: number | null; sampleTooSmall: boolean; minimumSample: number;
  unsettled: { runs: number; usd: number }; unknown: { runs: number }; openSpend: OpenSpend[]; openSpendTruncated: boolean;
  cleanMerge: CleanMerge; teams: TeamEconomics[];
  scanned: number; truncated: boolean; runsTruncated: number;
};
/** The demo answer: it measures nothing and invents no model call or spend. */
export type DemoEconomics = { demo: true; window: EconomicsWindow };
/** The source of facts pages, as `PloegClient.factsPage` reads them. */
export type FactsSource = { factsPage(query: FactsQuery, fresh?: boolean): Promise<FactsPage> };

/** Whether `value` names one of the Insights windows. */
export const isEconomicsWindow = (value: unknown): value is EconomicsWindow => typeof value === 'string' && Object.hasOwn(economicsWindows, value);

const at = (value: string | null | undefined): number | null => { if (!value) return null; const ms = Date.parse(value); return Number.isFinite(ms) ? ms : null; };
const within = (value: string | null | undefined, since: number, until: number): boolean => { const ms = at(value); return ms !== null && ms >= since && ms <= until; };
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const rounded = (value: number): number => Math.round(value * 1e6) / 1e6;
const changeRequested = (state: string | null | undefined): boolean => ['changes_requested', 'request_changes'].includes(String(state ?? '').toLowerCase());

/**
 * A Run's spend: settled with its reported cost once it finished and holds no budget; unsettled while it runs or holds
 * budget, with the latest observed or reported cost; unknown when it finished without reporting a cost.
 */
export function runSpend(run: FactsRun, facts: WorkItemFacts): { status: 'settled' | SpendGap; usd: number | null } {
  const reported = amount(run.usage?.costUsd) ? run.usage!.costUsd! : null;
  if (run.state !== 'finished') {
    const live = facts.liveUsage.filter(entry => entry.runId === run.id && amount(entry.costUsd)).sort((a, b) => (at(b.observedAt) ?? 0) - (at(a.observedAt) ?? 0))[0];
    return { status: 'unsettled', usd: live ? live.costUsd : reported };
  }
  if ((facts.runBudgetHolds ?? []).some(hold => hold.runId === run.id && hold.reservedUsd > 0)) return { status: 'unsettled', usd: reported };
  return reported === null ? { status: 'unknown', usd: null } : { status: 'settled', usd: reported };
}

/**
 * When the agents handed a pull request over, as of `until`: the finish of the last writing Run of its Shift, else when
 * the pull request opened or was first seen. Ploeg records no ready-for-review moment, so this stands in for it.
 */
export function handedOverAt(pr: FactsPullRequest, facts: WorkItemFacts, until: number): number | null {
  const writers = facts.runs.filter(run => run.writes && run.shiftId !== null && run.shiftId === pr.shiftId).map(run => at(run.finishedAt)).filter((ms): ms is number => ms !== null && ms <= until);
  return writers.length ? Math.max(...writers) : at(pr.openedAt) ?? at(pr.firstSeenAt);
}

function changedAfterHandOff(pr: FactsPullRequest, facts: WorkItemFacts, mergedAt: number): boolean {
  const bots = new Set(facts.botLogins.map(login => login.toLowerCase()));
  const author = pr.author?.toLowerCase() ?? null;
  const from = handedOverAt(pr, facts, mergedAt) ?? Number.NEGATIVE_INFINITY;
  const inside = (value: string) => { const ms = at(value); return ms !== null && ms > from && ms <= mergedAt; };
  const person = (login: string) => !bots.has(login.toLowerCase());
  if (pr.reviews.some(review => changeRequested(review.state) && person(review.reviewer) && inside(review.receivedAt))) return true;
  if (pr.events.some(event => event.kind === 'review' && changeRequested(event.state) && person(event.actor) && inside(event.at))) return true;
  return author !== null && pr.events.some(event => (event.kind === 'push' || event.kind === 'force_push') && event.actor.toLowerCase() !== author && person(event.actor) && inside(event.at));
}

const rate = (clean: number, merged: number, closed: number): CleanMerge => ({ clean, merged, closed, rate: merged + closed > 0 ? clean / (merged + closed) : null });

/**
 * K2 over merged Work Items for a window: the settled Run spend of every Shift of each Work Item whose pull request
 * merged inside `[since, until]`, failed Runs included, divided by the number of those Work Items once there are at
 * least `minimumMergedSample`. Spend still open or never reported is listed apart and never added. K5 counts Ploeg's
 * pull requests (those with a Shift) merged or closed inside the window. `truncated` passes on that the facts were cut.
 */
export function deliveryEconomics(facts: WorkItemFacts[], { window, since, until, truncated = false }: { window: EconomicsWindow; since: number; until: number; truncated?: boolean }): DeliveryEconomics {
  const seen = new Set<string>();
  const teams = new Map<string, { merged: number; settled: number; unsettled: number; unknown: number; clean: number; prMerged: number; prClosed: number }>();
  const teamOf = (name: string) => { let entry = teams.get(name); if (!entry) teams.set(name, entry = { merged: 0, settled: 0, unsettled: 0, unknown: 0, clean: 0, prMerged: 0, prClosed: 0 }); return entry; };
  const open: OpenSpend[] = [];
  let merged = 0, settled = 0, unsettledRuns = 0, unsettledUsd = 0, unknownRuns = 0, runsTruncated = 0, clean = 0, prMerged = 0, prClosed = 0;
  for (const item of facts) {
    if (seen.has(item.workItem.id)) continue;
    seen.add(item.workItem.id);
    const team = item.workItem.team;
    for (const pr of item.pullRequests) {
      if (pr.shiftId === null) continue;
      if (pr.mergedAt && within(pr.mergedAt, since, until)) {
        const isClean = !changedAfterHandOff(pr, item, at(pr.mergedAt)!);
        prMerged++; teamOf(team).prMerged++;
        if (isClean) { clean++; teamOf(team).clean++; }
      } else if (!pr.mergedAt && pr.state === 'closed' && within(pr.closedAt, since, until)) { prClosed++; teamOf(team).prClosed++; }
    }
    if (!item.pullRequests.some(pr => within(pr.mergedAt, since, until))) continue;
    const entry = teamOf(team);
    merged++; entry.merged++;
    if (item.truncated.runs) runsTruncated++;
    for (const run of item.runs) {
      if (run.shiftId === null) continue;
      const spend = runSpend(run, item);
      if (spend.status === 'settled') { settled += spend.usd!; entry.settled += spend.usd!; continue; }
      if (spend.status === 'unsettled') { unsettledRuns++; entry.unsettled++; if (spend.usd !== null) unsettledUsd += spend.usd; }
      else { unknownRuns++; entry.unknown++; }
      open.push({ workItemId: item.workItem.id, team, runId: run.id, status: spend.status, usd: spend.usd });
    }
  }
  const per = (usd: number, count: number) => count >= minimumMergedSample ? rounded(usd / count) : null;
  return {
    demo: false, window, since: new Date(since).toISOString(), until: new Date(until).toISOString(),
    merged, settledUsd: rounded(settled), costPerMergedUsd: per(settled, merged), sampleTooSmall: merged < minimumMergedSample, minimumSample: minimumMergedSample,
    unsettled: { runs: unsettledRuns, usd: rounded(unsettledUsd) }, unknown: { runs: unknownRuns },
    openSpend: open.slice(0, economicsListBound), openSpendTruncated: open.length > economicsListBound,
    cleanMerge: rate(clean, prMerged, prClosed),
    teams: [...teams].sort(([a], [b]) => a.localeCompare(b)).map(([name, entry]) => ({ team: name, merged: entry.merged, settledUsd: rounded(entry.settled), costPerMergedUsd: per(entry.settled, entry.merged), unsettledRuns: entry.unsettled, unknownRuns: entry.unknown, cleanMerge: rate(entry.clean, entry.prMerged, entry.prClosed) })),
    scanned: seen.size, truncated: truncated || runsTruncated > 0, runsTruncated,
  };
}

/** The facts a window reading found, and whether a page bound stopped it. */
export type WindowFacts = { facts: WorkItemFacts[]; truncated: boolean };

/**
 * Reads the facts of every Work Item with activity since `since`, page by page up to `maxPages`, and keeps the Teams in
 * `teams`. `truncated` says the bound stopped it.
 */
export async function readWindowFacts(source: FactsSource, { since, teams, fresh = false, maxPages = economicsPageBound }: { since: number; teams: readonly string[]; fresh?: boolean; maxPages?: number }): Promise<WindowFacts> {
  const allowed = new Set(teams);
  const facts: WorkItemFacts[] = [];
  let before: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await source.factsPage({ since: new Date(since).toISOString(), limit: 25, ...(before ? { before } : {}) }, fresh);
    facts.push(...result.facts.filter(entry => allowed.has(entry.workItem.team)));
    if (!result.nextBefore) return { facts, truncated: false };
    before = result.nextBefore;
  }
  return { facts, truncated: true };
}

/**
 * Reads the facts of every Work Item with activity inside the window, page by page up to `maxPages`, keeps the Teams
 * in `teams`, and measures them with `deliveryEconomics`. It says it truncated when the bound stopped it.
 */
export async function readDeliveryEconomics(source: FactsSource, { window, teams, now = Date.now(), fresh = false, maxPages = economicsPageBound }: { window: EconomicsWindow; teams: readonly string[]; now?: number; fresh?: boolean; maxPages?: number }): Promise<DeliveryEconomics> {
  const since = now - economicsWindows[window];
  const { facts, truncated } = await readWindowFacts(source, { since, teams, fresh, maxPages });
  return deliveryEconomics(facts, { window, since, until: now, truncated });
}
