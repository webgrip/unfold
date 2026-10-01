import type { Core } from './core.js';
import type { PloegNow, PloegNowItem, PloegRunRow } from './ploeg-types.js';
import type { Session } from './types.js';

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

/** How many things wait on this person: Work Items ready for review or needing them, and sessions waiting for an answer. */
export function waitingCount(now: PloegNow | undefined, sessions: Pick<Session, 'status'>[]): number {
  return (now?.waiting ?? []).filter(item => ['review', 'needs'].includes(nowGroup(item) ?? '')).length + sessions.filter(session => session.status === 'waiting_input').length;
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
