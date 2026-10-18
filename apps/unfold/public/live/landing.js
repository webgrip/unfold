import { clock, span } from './parts.js';

/** Fewer finished Runs than this give no estimate: one or two Runs say nothing about the usual. */
export const landingSample = 3;

const quantile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(share * sorted.length) - 1))];

/**
 * When the running writing Run should open its pull request, from how long the Team's earlier Runs of the same Role
 * took to open one. `history` is a `GET /api/ploeg/runs?state=finished&outcome=pr_opened` page for the Team. The
 * landing is the median duration counted from the running Run's start; once the Run is past the median it is the
 * slowest tenth, and past every earlier Run there is no landing time, only that fact.
 * @param {{ history: object[], run: object|null|undefined, now: number }} input
 * @returns {{ text: string, note: string, source: 'team-history', landsAt: number|null, medianSeconds: number, sample: number }|null}
 */
export function landingEstimate({ history, run, now }) {
  const startedAt = Date.parse(run?.startedAt ?? '');
  if (!run || run.state !== 'running' || !run.writes || !Number.isFinite(startedAt)) return null;
  const durations = (history || [])
    .filter(entry => entry.role === run.role && entry.writes && !entry.shadow && entry.outcome === 'pr_opened' && String(entry.id) !== String(run.id))
    .map(entry => entry.durationSeconds)
    .filter(seconds => Number.isFinite(seconds) && seconds > 0)
    .sort((a, b) => a - b);
  if (durations.length < landingSample) return null;
  const median = quantile(durations, 0.5);
  const slow = quantile(durations, 0.9);
  const longest = durations.at(-1);
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const basis = `${run.role} Runs on this Team open one in ${span(median)} (median of the last ${durations.length})`;
  const base = { source: 'team-history', medianSeconds: median, sample: durations.length };
  if (elapsed <= median) {
    const landsAt = startedAt + median * 1000;
    return { ...base, landsAt, note: `about ${clock(landsAt)}`, text: `The pull request should open about ${clock(landsAt)}: ${basis}` };
  }
  if (elapsed <= slow) {
    const landsAt = startedAt + slow * 1000;
    return { ...base, landsAt, note: `by about ${clock(landsAt)} · running long`, text: `The pull request should open by about ${clock(landsAt)}. This Run is past the usual ${span(median)}; nine in ten earlier ${run.role} Runs opened one within ${span(slow)}` };
  }
  return { ...base, landsAt: null, note: elapsed <= longest ? 'running long' : 'past every earlier Run', text: elapsed <= longest ? `No landing time: this Run is slower than nine in ten earlier ${run.role} Runs, whose median is ${span(median)}` : `No landing time: this Run has run longer than any of the last ${durations.length} ${run.role} Runs that opened a pull request (longest ${span(longest)})` };
}
