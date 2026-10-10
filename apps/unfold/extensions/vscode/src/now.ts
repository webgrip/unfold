import type { Core, Progress } from './core.js';
import type { PloegNow, PloegNowItem, PloegRunRow } from './ploeg-types.js';
import type { Session } from './types.js';

/** A session on Now: its progress and the group that progress puts it in. */
export type SessionRow = { session: Session; progress: Progress; group: 'needs' | 'review' | 'running' };

/** The sessions Now lists, by their progress: asking, stopped or failed sessions need you, completed ones wait for review, active ones run. A failed session whose Work Item a person closed is left out. */
export function sessionRows(core: Core, sessions: Session[], now = Date.now()): SessionRow[] {
  const rows: SessionRow[] = [];
  for (const session of sessions) {
    if (session.status === 'failed' && session.workItemClosedAt) continue;
    const progress = core.sessionProgress(session, { now });
    const group = core.progressGroup(progress);
    if (group) rows.push({ session, progress, group });
  }
  return rows.sort((a, b) => Date.parse(b.session.updatedAt) - Date.parse(a.session.updatedAt));
}

/** The Work Items a session drives, so a Ploeg row for the same Work Item is shown once, as the session. */
export function linkedWorkItems(rows: SessionRow[]): Set<string> {
  return new Set(rows.map(row => row.progress.workItemId).filter(Boolean));
}

/** The words of one session row on Now: the title, the line beside it, the tooltip lines and what a screen reader says. */
export function describeSession(core: Core, row: SessionRow, now = Date.now()): { label: string; description: string; lines: string[]; accessible: string } {
  const { progress, session } = row;
  const current = progress.current;
  const elapsed = current?.startedAt ? core.duration(Math.max(0, Math.round((now - Date.parse(current.startedAt)) / 1000))) : '';
  const spend = progress.demo ? 'demo' : progress.spend.status === 'unknown' ? '' : `${progress.spend.text}${progress.spend.status === 'observed' ? ' so far' : ''}`;
  const description = row.group === 'running' && current
    ? [current.role, current.round ? `Round ${current.round}` : '', elapsed, spend].filter(Boolean).join(' · ')
    : [progress.short, spend, core.relative(session.updatedAt, now)].filter(Boolean).join(' · ');
  const lines = [session.title, `${progress.meta.label}: ${progress.headline}`, progress.next, `Spend ${progress.spend.text}${progress.spend.note ? ` (${progress.spend.note})` : ''}`].filter(Boolean);
  return { label: session.title, description, lines, accessible: `${session.title}, ${progress.meta.label}, ${progress.headline}` };
}

/** What the status bar says: counts of review, needs-you and running work, and while exactly one session runs, its Role and elapsed time. */
export function statusSummary(core: Core, now: PloegNow | undefined, rows: SessionRow[], at = Date.now()): { text: string; tooltip: string; warning: boolean; focus?: SessionRow; asking: boolean } {
  const linked = linkedWorkItems(rows);
  const unlinked = (now?.waiting ?? []).filter(item => !linked.has(item.id));
  const review = unlinked.filter(item => nowGroup(item) === 'review').length + rows.filter(row => row.group === 'review').length;
  const needs = unlinked.filter(item => nowGroup(item) === 'needs').length + rows.filter(row => row.group === 'needs').length;
  const runningRows = rows.filter(row => row.group === 'running');
  const running = (now?.running ?? []).filter(run => !linked.has(run.workItemId)).length + runningRows.length;
  const focus = running === 1 && runningRows.length === 1 ? runningRows[0] : undefined;
  const role = focus?.progress.current;
  const live = focus ? `$(sync~spin) ${role ? `${role.role} ${core.elapsedClock(Math.max(0, (at - Date.parse(role.startedAt)) / 1000))}` : focus.progress.short}` : running ? `$(sync~spin) ${running}` : '';
  const parts = [review ? `$(git-pull-request) ${review}` : '', needs ? `$(bell-dot) ${needs}` : '', live].filter(Boolean);
  const counts = [review ? `${review} ready for your review` : '', needs ? `${needs} need${needs === 1 ? 's' : ''} you` : '', running ? `${running} running` : ''].filter(Boolean);
  const detail = rows.slice(0, 5).map(row => `${row.session.title}: ${row.progress.headline}`);
  return { text: parts.length ? `$(layers) ${parts.join('  ')}` : '$(layers) Unfold', tooltip: [counts.length ? counts.join(' · ') : 'Nothing waits on you', ...detail].join('\n'), warning: needs > 0, focus, asking: rows.some(row => row.progress.phase === 'asking') };
}

export type NowGroup = 'review' | 'needs' | 'proposed' | 'running';

/** The number of a forge pull request in its URL, or undefined when the URL names none. */
export function pullRequestNumber(url: string | undefined): string | undefined {
  return /\/(?:pulls?|merge_requests)\/(\d+)\/?$/.exec(url ?? '')?.[1];
}

/** Which Now group a waiting Work Item belongs to. Stopped retrying is a Needs you item, as in the browser. */
export function nowGroup(item: Pick<PloegNowItem, 'state'>): NowGroup | undefined {
  if (item.state === 'awaiting_review') return 'review';
  if (item.state === 'needs_human' || item.state === 'stale') return 'needs';
  if (item.state === 'proposed') return 'proposed';
  return undefined;
}

const groupStates: Partial<Record<NowGroup, string>> = { review: 'awaiting_review', needs: 'needs_human', proposed: 'proposed' };

/** Whether Ploeg holds more Work Items in a waiting group than the Now response lists, as the server reports in `truncatedStates`. */
export function groupTruncated(now: PloegNow | undefined, group: NowGroup): boolean {
  const state = groupStates[group];
  return Boolean(state && now?.truncatedStates?.includes(state));
}

/** How many things wait on this person: Work Items ready for review or needing them, and sessions that do, each counted once. */
export function waitingCount(now: PloegNow | undefined, rows: Pick<SessionRow, 'group' | 'progress'>[]): number {
  const linked = new Set(rows.map(row => row.progress.workItemId).filter(Boolean));
  return (now?.waiting ?? []).filter(item => !linked.has(item.id) && ['review', 'needs'].includes(nowGroup(item) ?? '')).length + rows.filter(row => row.group === 'needs' || row.group === 'review').length;
}

/** The words of one waiting Work Item row: its title, the line beside it, the tooltip and what a screen reader says. */
export function describeItem(core: Core, item: PloegNowItem, demo: boolean): { label: string; description: string; heading: string; lines: string[]; accessible: string } {
  const meta = core.workItemState(item.state);
  const reason = core.listReason(item, { demo });
  const pr = pullRequestNumber(item.pullRequestUrl);
  const label = item.title || `Work Item ${item.id}`;
  const description = [reason?.chip, pr ? `PR #${pr}` : '', item.state === 'proposed' && item.sourceTitle ? `from ${item.sourceTitle}` : '', item.team, demo ? 'illustration' : '', core.relative(item.updatedAt)].filter(Boolean).join(' · ');
  const settled = demo ? 'demo fixture, no model calls or spend' : `settled ${core.money(item.spentUsd ?? undefined)}`;
  const lines = [label, reason ? reason.sentence : meta.description ?? '', reason ? reason.action : '', `Team ${item.team} · ${item.attempts === 1 ? '1 attempt' : `${item.attempts} attempts`} · ${settled} · updated ${core.relative(item.updatedAt)}`].filter(Boolean);
  return { label, description, heading: reason ? `${meta.label} · ${reason.chip}` : meta.label, lines, accessible: `${label}, ${meta.label}${reason ? `, ${reason.chip}` : ''}, team ${item.team}` };
}

/** The words of one running Run row. Cost is the gateway's reading so far, never settled spend, and a demo shows none. */
export function describeRun(core: Core, run: PloegRunRow, demo: boolean, now = Date.now()): { label: string; description: string; lines: string[] } {
  const elapsed = run.startedAt ? core.duration(Math.max(0, Math.round((now - Date.parse(run.startedAt)) / 1000))) : '';
  const observed = !demo && typeof run.observedUsd === 'number' ? run.observedUsd : undefined;
  const description = [run.role, run.round ? `Round ${run.round}` : '', run.team, elapsed, observed === undefined ? '' : `${core.money(observed)} so far`, demo ? 'illustration' : ''].filter(Boolean).join(' · ');
  const lines = [run.workItemTitle, `${run.role} is running${run.round ? ` in Round ${run.round}` : ''} for team ${run.team}${elapsed ? `, for ${elapsed}` : ''}.`, demo ? 'Demo fixture: no model calls or spend.' : observed === undefined ? `Cost so far: ${core.notReported}.` : `Observed at the gateway so far: ${core.money(observed)}. Not settled yet.`];
  return { label: run.workItemTitle || `Work Item ${run.workItemId}`, description, lines };
}
