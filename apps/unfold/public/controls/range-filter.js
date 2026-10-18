/** How many older pages a list loads by itself to reach the start of a time range before it asks the person. */
export const autoPages = 20;

const moment = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };

/**
 * The stretch of time a Run covers: from its start to its finish, or to `now` while it runs or waits. A Run with no
 * time at all is placed at `now`, where a waiting Run belongs.
 * @param {{ startedAt?: string|null, finishedAt?: string|null }} run
 * @param {number} now
 * @returns {{ start: number, end: number }}
 */
export function runSpan(run, now) {
  const finished = moment(run?.finishedAt);
  const start = moment(run?.startedAt) ?? finished ?? now;
  return { start, end: finished ?? now };
}

/** The moment of an audit event, or null when Ploeg did not report one. */
export const eventMoment = entry => moment(entry?.at);

/** Whether a Run worked at any time inside a resolved range. */
export const runInRange = (run, range, now) => { const { start, end } = runSpan(run, now); return start <= range.to && end >= range.from; };

/** Whether an event happened inside a resolved range. An event without a moment is kept, so nothing goes missing silently. */
export const eventInRange = (entry, range) => { const at = eventMoment(entry); return at === null || (at >= range.from && at <= range.to); };

/**
 * Whether a newest-first list has loaded far enough back to show everything in a range: true once the oldest item
 * loaded starts before the range does, or when there is nothing older.
 * @param {object[]|null} items The items loaded so far, newest first by id.
 * @param {(item: object) => number|null} startOf When an item starts.
 * @param {{ from: number }} range
 * @param {boolean} more Whether an older page exists.
 */
export function reachesStart(items, startOf, range, more) {
  if (!more) return true;
  const starts = (items ?? []).map(startOf).filter(value => value !== null);
  return starts.length > 0 && Math.min(...starts) < range.from;
}
