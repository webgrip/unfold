import type { FactsPullRequest, WorkItemFacts } from './cards/facts.ts';
import { economicsPageBound, economicsWindows, handedOverAt, readWindowFacts, runSpend, type EconomicsWindow, type FactsReach, type FactsSource } from './delivery-economics.ts';

/** How a Work Item stands against ADR-0006's Acceptance: accepted by merge, by approval or by silence, closed without it, or still open. */
export type AcceptanceKind = 'merged' | 'approved' | 'silent' | 'closed_without_acceptance' | 'open';
/** Every Acceptance kind, in the order the ledger counts them. */
export const acceptanceKinds: readonly AcceptanceKind[] = ['merged', 'approved', 'silent', 'closed_without_acceptance', 'open'];
/** A pull request with no decision this many working days after it was handed over counts as accepted (ADR-0006). */
export const silentAcceptanceWorkingDays = 10;

/** The days the silence timer skips besides Saturday and Sunday, as UTC dates `YYYY-MM-DD`. Proposed: the holiday calendar is an open owner decision. */
export type AcceptanceCalendar = { nonWorkingDates: string[] };
/** The calendar with no extra non-working dates. */
export const defaultAcceptanceCalendar: AcceptanceCalendar = { nonWorkingDates: [] };

/** One Work Item's line in the ledger. Amounts are US$; nothing here is a charge. */
export type DeliveryRow = {
  workItemId: string; externalRef: string; title: string; team: string; state: string;
  acceptance: { kind: AcceptanceKind; at: string | null; pullRequestUrl: string | null };
  readyForReviewAt: string | null; silentDueAt: string | null;
  tokenChargeBaseUsd: number; unsettled: { runs: number; usd: number }; unknownRuns: number; runsTruncated: boolean;
};
/** The Delivery read model for a window: phase 1 of billing per accepted Work Item, figures only, never a charge. */
export type DeliveryLedger = {
  demo: false; window: EconomicsWindow; since: string; until: string;
  calendar: { workingDays: 'monday-friday'; nonWorkingDates: string[]; silentAfterWorkingDays: number; timeZone: 'UTC' };
  readyForReview: 'last_writing_run';
  rows: DeliveryRow[];
  totals: { kinds: Record<AcceptanceKind, number>; tokenChargeBaseUsd: number; unsettledUsd: number; unsettledRuns: number; unknownRuns: number };
  scanned: number; truncated: boolean;
};
/** The demo answer: it measures nothing and invents no model call or spend. */
export type DemoDeliveryLedger = { demo: true; window: EconomicsWindow };

const day = 86_400_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const at = (value: string | null | undefined): number | null => { if (!value) return null; const ms = Date.parse(value); return Number.isFinite(ms) ? ms : null; };
const iso = (ms: number | null): string | null => ms === null ? null : new Date(ms).toISOString();
const rounded = (value: number): number => Math.round(value * 1e6) / 1e6;
const isDate = (value: unknown): value is string => typeof value === 'string' && datePattern.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/**
 * Reads the `acceptanceCalendar` setting: `{ nonWorkingDates: ["2026-12-25", …] }`, at most 1000 real dates. Absent, the
 * calendar has no extra non-working dates.
 */
export function acceptanceCalendarSettings(raw: unknown): AcceptanceCalendar {
  if (raw === undefined) return { nonWorkingDates: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'nonWorkingDates')) throw new Error('acceptanceCalendar must be an object with nonWorkingDates only');
  const dates = (raw as { nonWorkingDates?: unknown }).nonWorkingDates ?? [];
  if (!Array.isArray(dates) || dates.length > 1000 || !dates.every(isDate)) throw new Error('acceptanceCalendar.nonWorkingDates must list at most 1000 dates as YYYY-MM-DD');
  return { nonWorkingDates: [...new Set(dates)].sort() };
}

/**
 * When a pull request handed over at `readyAt` turns silently accepted: the UTC midnight that ends the
 * `silentAcceptanceWorkingDays`th working day after the hand-over date. Working days are Monday to Friday, less the
 * calendar's non-working dates.
 */
export function silentAcceptanceAt(readyAt: number, calendar: AcceptanceCalendar = defaultAcceptanceCalendar): number {
  const skipped = new Set(calendar.nonWorkingDates);
  let cursor = Math.floor(readyAt / day) * day;
  for (let counted = 0; counted < silentAcceptanceWorkingDays;) {
    cursor += day;
    const date = new Date(cursor);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !skipped.has(date.toISOString().slice(0, 10))) counted++;
  }
  return cursor + day;
}

type Decision = { kind: 'approved' | 'changes_requested'; at: number };
type Accepted = { kind: 'merged' | 'approved' | 'silent'; at: number; pr: FactsPullRequest };
const priority: Record<Accepted['kind'], number> = { merged: 0, approved: 1, silent: 2 };

function decisions(pr: FactsPullRequest, facts: WorkItemFacts, until: number): Decision[] {
  const bots = new Set(facts.botLogins.map(login => login.toLowerCase()));
  const person = (login: string) => !bots.has(login.toLowerCase());
  const kind = (state: string | null | undefined): Decision['kind'] | null => {
    const value = String(state ?? '').toLowerCase();
    return value === 'approved' ? 'approved' : ['changes_requested', 'request_changes'].includes(value) ? 'changes_requested' : null;
  };
  const found: Decision[] = [];
  for (const review of pr.reviews) { const k = kind(review.state), ms = at(review.receivedAt); if (k && ms !== null && ms <= until && person(review.reviewer)) found.push({ kind: k, at: ms }); }
  for (const event of pr.events) { const k = event.kind === 'review' ? kind(event.state) : null, ms = at(event.at); if (k && ms !== null && ms <= until && person(event.actor)) found.push({ kind: k, at: ms }); }
  return found;
}

function silence(pr: FactsPullRequest, facts: WorkItemFacts, until: number, calendar: AcceptanceCalendar): { readyAt: number | null; dueAt: number | null; reached: boolean } {
  const readyAt = handedOverAt(pr, facts, until);
  if (readyAt === null || pr.draft === true) return { readyAt, dueAt: null, reached: false };
  const dueAt = silentAcceptanceAt(readyAt, calendar);
  const ended = [at(pr.mergedAt), pr.state === 'closed' ? at(pr.closedAt) : null].some(ms => ms !== null && ms <= dueAt);
  const decided = decisions(pr, facts, until).some(entry => entry.at >= readyAt && entry.at <= dueAt);
  if (ended || decided) return { readyAt, dueAt: null, reached: false };
  return { readyAt, dueAt, reached: dueAt <= until };
}

/**
 * One Work Item's Acceptance and Token Charge base as of `until`. Only Ploeg's pull requests (those with a Shift)
 * count. Acceptance is the earliest of a merge, a person's approval, or ten working days after the agents handed the
 * pull request over with no decision, merge or close; a merge wins a tie, then an approval. Without Acceptance, a
 * Work Item that is done or withdrawn, or whose pull requests all closed while no Run works on it, is closed without
 * acceptance; any other is open. The Token Charge base adds the settled cost of every Run of its Shifts, failed Runs
 * included; open and unreported spend is counted apart and never added.
 */
export function deliveryRow(facts: WorkItemFacts, { until, calendar = defaultAcceptanceCalendar }: { until: number; calendar?: AcceptanceCalendar }): DeliveryRow {
  const prs = facts.pullRequests.filter(pr => pr.shiftId !== null);
  const accepted: Accepted[] = [];
  let ready: number | null = null;
  let due: number | null = null;
  for (const pr of prs) {
    const merged = at(pr.mergedAt);
    if (merged !== null && merged <= until) accepted.push({ kind: 'merged', at: merged, pr });
    const approvals = decisions(pr, facts, until).filter(entry => entry.kind === 'approved').map(entry => entry.at);
    if (approvals.length) accepted.push({ kind: 'approved', at: Math.min(...approvals), pr });
    const quiet = silence(pr, facts, until, calendar);
    if (quiet.readyAt !== null) ready = Math.max(ready ?? quiet.readyAt, quiet.readyAt);
    if (quiet.reached) accepted.push({ kind: 'silent', at: quiet.dueAt!, pr });
    else if (quiet.dueAt !== null) due = Math.min(due ?? quiet.dueAt, quiet.dueAt);
  }
  const first = accepted.sort((a, b) => a.at - b.at || priority[a.kind] - priority[b.kind])[0];
  let acceptance: DeliveryRow['acceptance'];
  if (first) acceptance = { kind: first.kind, at: iso(first.at), pullRequestUrl: first.pr.url || null };
  else {
    const state = facts.workItem.state;
    const allClosed = prs.length > 0 && prs.every(pr => pr.state === 'closed' && !pr.mergedAt);
    if (['done', 'withdrawn'].includes(state) || (allClosed && !['queued', 'leased'].includes(state))) {
      const ends = [...prs.map(pr => at(pr.closedAt)), ...facts.workItem.withdrawals.map(entry => at(entry.at))].filter((ms): ms is number => ms !== null && ms <= until);
      acceptance = { kind: 'closed_without_acceptance', at: iso(ends.length ? Math.max(...ends) : null), pullRequestUrl: null };
    } else acceptance = { kind: 'open', at: null, pullRequestUrl: null };
  }
  let settled = 0, unsettledRuns = 0, unsettledUsd = 0, unknownRuns = 0;
  for (const run of facts.runs) {
    if (run.shiftId === null) continue;
    const spend = runSpend(run, facts);
    if (spend.status === 'settled') settled += spend.usd!;
    else if (spend.status === 'unsettled') { unsettledRuns++; unsettledUsd += spend.usd ?? 0; }
    else unknownRuns++;
  }
  return {
    workItemId: facts.workItem.id, externalRef: facts.workItem.externalRef, title: facts.workItem.title, team: facts.workItem.team, state: facts.workItem.state,
    acceptance, readyForReviewAt: iso(ready), silentDueAt: acceptance.kind === 'open' ? iso(due) : null,
    tokenChargeBaseUsd: rounded(settled), unsettled: { runs: unsettledRuns, usd: rounded(unsettledUsd) }, unknownRuns, runsTruncated: facts.truncated.runs,
  };
}

const attempted = (facts: WorkItemFacts) => facts.shifts.length > 0 || facts.runs.some(run => run.shiftId !== null) || facts.pullRequests.some(pr => pr.shiftId !== null);
const sortKey = (row: DeliveryRow) => at(row.acceptance.at) ?? Number.POSITIVE_INFINITY;

/**
 * The Delivery read model over the facts of a window: one row per Work Item that Ploeg attempted (it has a Shift, a
 * Shift's Run or a Ploeg pull request), newest Acceptance or close first and open Work Items last, with totals per
 * Acceptance kind. `truncated` passes on that the facts or a Work Item's Runs were cut.
 */
export function deliveryLedger(facts: WorkItemFacts[], { window, since, until, calendar = defaultAcceptanceCalendar, truncated = false }: { window: EconomicsWindow; since: number; until: number; calendar?: AcceptanceCalendar; truncated?: boolean }): DeliveryLedger {
  const seen = new Set<string>();
  const rows: DeliveryRow[] = [];
  for (const item of facts) {
    if (seen.has(item.workItem.id)) continue;
    seen.add(item.workItem.id);
    if (attempted(item)) rows.push(deliveryRow(item, { until, calendar }));
  }
  rows.sort((a, b) => {
    const x = sortKey(a), y = sortKey(b);
    if (x !== y) return x === Number.POSITIVE_INFINITY ? 1 : y === Number.POSITIVE_INFINITY ? -1 : y - x;
    const left = BigInt(a.workItemId), right = BigInt(b.workItemId);
    return left < right ? 1 : left > right ? -1 : 0;
  });
  const kinds = Object.fromEntries(acceptanceKinds.map(kind => [kind, 0])) as Record<AcceptanceKind, number>;
  let charge = 0, unsettledUsd = 0, unsettledRuns = 0, unknownRuns = 0;
  for (const row of rows) { kinds[row.acceptance.kind]++; charge += row.tokenChargeBaseUsd; unsettledUsd += row.unsettled.usd; unsettledRuns += row.unsettled.runs; unknownRuns += row.unknownRuns; }
  return {
    demo: false, window, since: new Date(since).toISOString(), until: new Date(until).toISOString(),
    calendar: { workingDays: 'monday-friday', nonWorkingDates: [...calendar.nonWorkingDates], silentAfterWorkingDays: silentAcceptanceWorkingDays, timeZone: 'UTC' },
    readyForReview: 'last_writing_run',
    rows, totals: { kinds, tokenChargeBaseUsd: rounded(charge), unsettledUsd: rounded(unsettledUsd), unsettledRuns, unknownRuns },
    scanned: seen.size, truncated: truncated || rows.some(row => row.runsTruncated),
  };
}

/**
 * Reads the facts of every Work Item with activity inside the window within `teams` that `reaches` accepts, and
 * builds the ledger as of `now`.
 */
export async function readDeliveryLedger(source: FactsSource, { window, teams, reaches, calendar = defaultAcceptanceCalendar, now = Date.now(), fresh = false, maxPages = economicsPageBound }: { window: EconomicsWindow; teams: readonly string[]; reaches?: FactsReach; calendar?: AcceptanceCalendar; now?: number; fresh?: boolean; maxPages?: number }): Promise<DeliveryLedger> {
  const since = now - economicsWindows[window];
  const { facts, truncated } = await readWindowFacts(source, { since, teams, reaches, fresh, maxPages });
  return deliveryLedger(facts, { window, since, until: now, calendar, truncated });
}

/** The CSV export's columns, in order. */
export const deliveryCsvColumns = ['work_item_id', 'external_ref', 'team', 'title', 'state', 'acceptance_kind', 'acceptance_at', 'pull_request_url', 'ready_for_review_at', 'silent_due_at', 'token_charge_base_usd', 'unsettled_usd', 'unsettled_runs', 'unknown_runs', 'runs_truncated'] as const;

const cell = (value: string | number | boolean | null): string => {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * The ledger's rows as RFC 4180 CSV with a header line and CRLF line ends. Amounts are US$ with a decimal point; a text
 * cell that a spreadsheet would run as a formula starts with an apostrophe.
 */
export function deliveriesCsv(rows: readonly DeliveryRow[]): string {
  const lines = [deliveryCsvColumns.join(',')];
  for (const row of rows) lines.push([row.workItemId, row.externalRef, row.team, row.title, row.state, row.acceptance.kind, row.acceptance.at, row.acceptance.pullRequestUrl, row.readyForReviewAt, row.silentDueAt, row.tokenChargeBaseUsd, row.unsettled.usd, row.unsettled.runs, row.unknownRuns, row.runsTruncated].map(cell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
