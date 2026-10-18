import { dateTime } from '../core/format.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const fixed = { s: SECOND, m: MINUTE, h: HOUR };
const unitWords = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month', y: 'year' };
const spokenUnits = { s: 's', sec: 's', secs: 's', second: 's', seconds: 's', m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm', h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h', d: 'd', day: 'd', days: 'd', w: 'w', wk: 'w', week: 'w', weeks: 'w', M: 'M', mo: 'M', month: 'M', months: 'M', y: 'y', yr: 'y', year: 'y', years: 'y' };

/** The quick ranges the time picker offers, as Grafana names them, each with its `from` and `to` expressions. */
export const quickRanges = Object.freeze([
  { from: 'now-5m', to: 'now', label: 'Last 5 minutes' },
  { from: 'now-15m', to: 'now', label: 'Last 15 minutes' },
  { from: 'now-30m', to: 'now', label: 'Last 30 minutes' },
  { from: 'now-1h', to: 'now', label: 'Last hour' },
  { from: 'now-3h', to: 'now', label: 'Last 3 hours' },
  { from: 'now-6h', to: 'now', label: 'Last 6 hours' },
  { from: 'now-12h', to: 'now', label: 'Last 12 hours' },
  { from: 'now-24h', to: 'now', label: 'Last 24 hours' },
  { from: 'now-2d', to: 'now', label: 'Last 2 days' },
  { from: 'now-7d', to: 'now', label: 'Last 7 days' },
  { from: 'now-30d', to: 'now', label: 'Last 30 days' },
  { from: 'now-90d', to: 'now', label: 'Last 90 days' },
  { from: 'now/d', to: 'now/d', label: 'Today' },
  { from: 'now/d', to: 'now', label: 'Today so far' },
  { from: 'now-1d/d', to: 'now-1d/d', label: 'Yesterday' },
  { from: 'now/w', to: 'now/w', label: 'This week' },
  { from: 'now/w', to: 'now', label: 'This week so far' },
  { from: 'now-1w/w', to: 'now-1w/w', label: 'Previous week' },
  { from: 'now/M', to: 'now', label: 'This month so far' },
  { from: 'now-1M/M', to: 'now-1M/M', label: 'Previous month' },
].map(Object.freeze));

/** The auto-refresh choices as `[id, label]`; the empty id turns auto-refresh off. */
export const refreshIntervals = Object.freeze([['', 'Off'], ['10s', '10 s'], ['30s', '30 s'], ['1m', '1 min'], ['5m', '5 min'], ['15m', '15 min'], ['1h', '1 h']]);

/** The range a picker starts on when nothing else is chosen. */
export const defaultRange = Object.freeze({ from: 'now-6h', to: 'now' });

/** The milliseconds of an auto-refresh id such as `30s`, or 0 for off and for an id the picker does not offer. */
export function refreshMs(id) {
  if (!refreshIntervals.some(([value]) => value === id) || !id) return 0;
  const match = /^(\d+)([smh])$/.exec(id);
  return Number(match[1]) * fixed[match[2]];
}

function startOf(date, unit) {
  const moment = new Date(date);
  if (unit === 's') moment.setMilliseconds(0);
  else if (unit === 'm') moment.setSeconds(0, 0);
  else if (unit === 'h') moment.setMinutes(0, 0, 0);
  else {
    moment.setHours(0, 0, 0, 0);
    if (unit === 'w') moment.setDate(moment.getDate() - ((moment.getDay() + 6) % 7));
    if (unit === 'M') moment.setDate(1);
    if (unit === 'y') moment.setMonth(0, 1);
  }
  return moment;
}

function add(date, amount, unit) {
  const moment = new Date(date);
  if (Object.hasOwn(fixed, unit)) moment.setTime(moment.getTime() + amount * fixed[unit]);
  else if (unit === 'd') moment.setDate(moment.getDate() + amount);
  else if (unit === 'w') moment.setDate(moment.getDate() + amount * 7);
  else if (unit === 'M') moment.setMonth(moment.getMonth() + amount);
  else moment.setFullYear(moment.getFullYear() + amount);
  return moment;
}

function relative(text, now, roundUp) {
  const tail = text.slice(3).replace(/\s+/g, '');
  const steps = /([+-])(\d+)([smhdwMy])|\/([smhdwMy])/g;
  let moment = new Date(now);
  let consumed = 0;
  for (const match of tail.matchAll(steps)) {
    if (match.index !== consumed) return null;
    consumed += match[0].length;
    if (match[4]) moment = roundUp ? new Date(add(startOf(moment, match[4]), 1, match[4]).getTime() - 1) : startOf(moment, match[4]);
    else moment = add(moment, (match[1] === '-' ? -1 : 1) * Number(match[2]), match[3]);
  }
  return consumed === tail.length ? moment.getTime() : null;
}

function local(year, month, day, hour, minute, second, roundUp, dateOnly) {
  const moment = new Date(year, month - 1, day, hour, minute, second, 0);
  if (moment.getFullYear() !== year || moment.getMonth() !== month - 1 || moment.getDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return dateOnly && roundUp ? moment.getTime() + DAY - 1 : moment.getTime();
}

/**
 * Reads one end of a time range as milliseconds since the epoch, the way Grafana does: `now`, `now-6h`, `now-1d/d`,
 * `now/w` (weeks start on Monday) with the units s, m, h, d, w, M and y; a day as `18-10-2026` or `2026-10-18`, with
 * an optional `09:30` or `09:30:15` in the browser's time zone; an ISO timestamp with its offset; or epoch milliseconds.
 * `roundUp` reads a rounding or a bare day as its last millisecond, for the `to` end.
 * @param {string|number|null|undefined} text
 * @param {number} now The current moment in milliseconds.
 * @param {{ roundUp?: boolean }} [options]
 * @returns {number|null} Null when the text is not a time.
 */
export function parseTime(text, now, { roundUp = false } = {}) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  if (/^now\b/.test(value)) return relative(value, now, roundUp);
  if (/^\d{10,}$/.test(value)) return Number(value);
  const nl = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (nl) return local(Number(nl[3]), Number(nl[2]), Number(nl[1]), Number(nl[4] ?? 0), Number(nl[5] ?? 0), Number(nl[6] ?? 0), roundUp, nl[4] === undefined);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (iso) return local(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0), roundUp, iso[4] === undefined);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Resolves a range to milliseconds against `now`. `ok` is false, with a message naming the end at fault, when an end
 * is not a time or `from` is not before `to`.
 * @param {{ from: string, to: string }} range
 * @param {number} now
 * @returns {{ ok: boolean, from: number|null, to: number|null, field?: 'from'|'to', message?: string }}
 */
export function resolveRange(range, now) {
  const from = parseTime(range?.from, now);
  const to = parseTime(range?.to, now, { roundUp: true });
  if (from === null) return { ok: false, from, to, field: 'from', message: 'From is not a time. Try now-6h, now/d or 18-10-2026 09:00.' };
  if (to === null) return { ok: false, from, to, field: 'to', message: 'To is not a time. Try now, now/d or 18-10-2026 17:00.' };
  if (from >= to) return { ok: false, from, to, field: 'from', message: 'From must be before To.' };
  return { ok: true, from, to };
}

/** Whether a range's end follows the clock, so the range moves on as time passes and auto-refresh is useful. */
export const isLive = range => /^now(?:[+-]0[smhdwMy])?$/.test(String(range?.to ?? '').replace(/\s+/g, ''));

/** Whether both ends of a range are fixed moments rather than expressions of now. */
export const isAbsolute = range => !/^now/.test(String(range?.from ?? '').trim()) && !/^now/.test(String(range?.to ?? '').trim());

/**
 * A span in milliseconds as the largest whole unit that fits it exactly: `6 hours`, `90 minutes`, `2 days`.
 * Spans that are no whole number of seconds read in seconds, rounded.
 * @param {number} ms
 */
export function spanWords(ms) {
  const span = Math.max(0, Math.round(ms));
  for (const [size, unit] of [[DAY, 'day'], [HOUR, 'hour'], [MINUTE, 'minute']]) {
    if (span >= size && span % size === 0) return `${span / size} ${unit}${span === size ? '' : 's'}`;
  }
  const seconds = Math.round(span / SECOND);
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/** A span in milliseconds as a Grafana duration such as `6h`, `90m` or `2d`, or null when it is no whole number of seconds. */
export function spanExpression(ms) {
  for (const [size, unit] of [[DAY, 'd'], [HOUR, 'h'], [MINUTE, 'm'], [SECOND, 's']]) {
    if (ms >= size && ms % size === 0) return `${ms / size}${unit}`;
  }
  return null;
}

function lastWords(amount, unit) {
  if (amount === 1) return `Last ${unitWords[unit]}`;
  return `Last ${amount} ${unitWords[unit]}s`;
}

/** A moment in milliseconds as the picker writes it in its fields: `18-10-2026 09:30`, with seconds only when it has them. */
export function momentText(ms) {
  const text = dateTime(ms);
  const seconds = new Date(ms).getSeconds();
  return seconds ? `${text}:${String(seconds).padStart(2, '0')}` : text;
}

/** One end of a range as the picker shows it in a field: an expression as typed, epoch milliseconds as a local moment. */
export const fieldText = value => /^\d{10,}$/.test(String(value ?? '')) ? momentText(Number(value)) : String(value ?? '');

/**
 * Names a range in words: a quick range by its name, `now-45m` to `now` as `Last 45 minutes`, two moments as
 * `17-10-2026 21:15 to 18-10-2026 09:00` (the day once when both fall on it), anything else as its expressions.
 * @param {{ from: string, to: string }} range
 * @param {number} now
 * @returns {string}
 */
export function rangeLabel(range, now) {
  const quick = quickRanges.find(entry => entry.from === range.from && entry.to === range.to);
  if (quick) return quick.label;
  const last = /^now-(\d+)([smhdwMy])$/.exec(String(range.from).replace(/\s+/g, ''));
  if (last && String(range.to).trim() === 'now') return lastWords(Number(last[1]), last[2]);
  if (isAbsolute(range)) {
    const resolved = resolveRange(range, now);
    if (!resolved.ok) return `${fieldText(range.from)} to ${fieldText(range.to)}`;
    const from = momentText(resolved.from);
    const to = momentText(resolved.to);
    const [fromDay, toDay] = [from.split(' ')[0], to.split(' ')[0]];
    return fromDay === toDay ? `${from} to ${to.slice(toDay.length + 1)}` : `${from} to ${to}`;
  }
  return `${fieldText(range.from)} to ${fieldText(range.to)}`;
}

/** A range of two moments in milliseconds, stored as epoch milliseconds so it means the same in every time zone. */
export const absoluteRange = (from, to) => ({ from: String(Math.round(from)), to: String(Math.round(to)) });

function settle(from, to, now) {
  if (to < now - SECOND) return absoluteRange(from, to);
  const expression = spanExpression(Math.round(to - from));
  return expression ? { from: `now-${expression}`, to: 'now' } : absoluteRange(now - (to - from), now);
}

/**
 * Moves a range back (`direction` -1) or forward (+1) by half its span, as Grafana's arrows do. A range moved up to
 * or past now ends at now and follows the clock again.
 * @param {{ from: string, to: string }} range
 * @param {-1|1} direction
 * @param {number} now
 * @returns {{ from: string, to: string }} The range unchanged when it does not resolve.
 */
export function shiftRange(range, direction, now) {
  const resolved = resolveRange(range, now);
  if (!resolved.ok) return range;
  const span = resolved.to - resolved.from;
  const step = Math.round(span / 2) * direction;
  const to = Math.min(resolved.to + step, now);
  return settle(to - span, to, now);
}

/**
 * Widens a range around its middle by `factor` (Grafana's zoom out is 2). A range that would reach past now ends at
 * now and follows the clock.
 * @param {{ from: string, to: string }} range
 * @param {number} now
 * @param {number} [factor]
 * @returns {{ from: string, to: string }}
 */
export function zoomOut(range, now, factor = 2) {
  const resolved = resolveRange(range, now);
  if (!resolved.ok) return range;
  const span = (resolved.to - resolved.from) * factor;
  const middle = (resolved.from + resolved.to) / 2;
  const to = Math.min(Math.round(middle + span / 2), now);
  return settle(to - Math.round(span), to, now);
}

/** Whether moving a range forward would change nothing, because it already ends at now. */
export const atNow = (range, now) => { const resolved = resolveRange(range, now); return !resolved.ok || resolved.to >= now - SECOND; };

/**
 * Reads a typed duration as a `Last …` range: `45m`, `now-45m`, `3 days`, `2 hours`, `1y`. Null when the text is not one.
 * @param {string} text
 * @returns {{ from: string, to: string, label: string }|null}
 */
export function suggestRange(text) {
  const match = /^(?:now\s*-\s*|last\s+)?(\d{1,4})\s*([a-zA-Z]+)$/i.exec(String(text ?? '').trim());
  if (!match) return null;
  const word = match[2] === 'M' ? 'M' : match[2].toLowerCase();
  const unit = spokenUnits[word];
  const amount = Number(match[1]);
  if (!unit || amount < 1) return null;
  return { from: `now-${amount}${unit}`, to: 'now', label: lastWords(amount, unit) };
}

/**
 * The quick ranges a search shows: a typed duration first as its own `Last …` range, then the quick ranges whose name
 * or expressions contain the text. An empty search shows them all.
 * @param {string} query
 * @returns {{ from: string, to: string, label: string, suggested?: boolean }[]}
 */
export function searchQuickRanges(query) {
  const text = String(query ?? '').trim().toLowerCase();
  if (!text) return [...quickRanges];
  const matches = quickRanges.filter(entry => `${entry.label} ${entry.from} ${entry.to}`.toLowerCase().includes(text));
  const suggestion = suggestRange(query);
  if (!suggestion || matches.some(entry => entry.from === suggestion.from && entry.to === suggestion.to)) return matches;
  return [{ ...suggestion, suggested: true }, ...matches];
}

/**
 * Puts an applied absolute range first in the recently used list, without repeats, keeping `limit` entries.
 * Relative ranges are left out: the quick ranges already offer them.
 * @param {{ from: string, to: string }[]} recent
 * @param {{ from: string, to: string }} range
 * @param {number} [limit]
 */
export function rememberRange(recent, range, limit = 4) {
  if (!isAbsolute(range)) return recent;
  return [range, ...recent.filter(entry => entry.from !== range.from || entry.to !== range.to)].slice(0, limit);
}

/**
 * Reads a range and auto-refresh from location query parameters (`from`, `to`, `refresh`), falling back to `fallback`
 * for a range that does not resolve and to off for a refresh the picker does not offer.
 * @param {Record<string, string>} query
 * @param {number} now
 * @param {{ from: string, to: string }} [fallback]
 * @returns {{ range: { from: string, to: string }, refresh: string }}
 */
export function rangeFromQuery(query, now, fallback = defaultRange) {
  const range = { from: String(query?.from ?? ''), to: String(query?.to ?? '') };
  const refresh = refreshIntervals.some(([id]) => id === query?.refresh) ? query.refresh : '';
  return { range: resolveRange(range, now).ok ? range : { ...fallback }, refresh };
}

/** The query parameters for a range and auto-refresh, leaving out what equals the default so links stay short. */
export function rangeToQuery(range, refresh = '', fallback = defaultRange) {
  const same = range.from === fallback.from && range.to === fallback.to;
  return { from: same ? '' : range.from, to: same ? '' : range.to, refresh };
}

/**
 * Turns a typed absolute end into epoch milliseconds so the applied range means the same in every time zone, and keeps
 * expressions of now as typed.
 * @param {string} text
 * @param {number} now
 * @param {boolean} roundUp
 */
export function normalizeEnd(text, now, roundUp) {
  const value = String(text ?? '').trim();
  if (/^now/.test(value) || /^\d{10,}$/.test(value)) return value.replace(/\s+/g, '');
  const parsed = parseTime(value, now, { roundUp });
  return parsed === null ? value : String(parsed);
}

/**
 * Reads Grafana's two-key time shortcuts: `t` then `←` moves back, `t` then `→` forward, `t` then `z` zooms out. The
 * second key must follow the `t` within 1.5 seconds.
 * @param {string|null} previous The key pressed before, or null.
 * @param {string} key
 * @param {number} elapsed Milliseconds since the previous key.
 * @returns {'shift-back'|'shift-forward'|'zoom-out'|null}
 */
export function shortcutAction(previous, key, elapsed) {
  if (previous !== 't' || elapsed > 1500) return null;
  return { ArrowLeft: 'shift-back', ArrowRight: 'shift-forward', z: 'zoom-out', Z: 'zoom-out' }[key] ?? null;
}
