const dutch = 'nl-NL';
let locale = dutch;
const formatters = new Map();

function formatter(kind, options) {
  const key = `${kind}:${locale}:${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, kind === 'number' ? new Intl.NumberFormat(locale, options) : new Intl.DateTimeFormat(locale, options));
  return formatters.get(key);
}

const isAmount = value => typeof value === 'number' && Number.isFinite(value);
const html = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const usd = (minimum, maximum) => formatter('number', { style: 'currency', currency: 'USD', minimumFractionDigits: minimum, maximumFractionDigits: maximum });

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function pieces(date, options) {
  return Object.fromEntries(formatter('date', { ...options, hourCycle: 'h23' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

/** What every formatter shows for a value the server did not report. Unknown is never shown as zero. */
export const notReported = 'Not reported';

/** Chooses the number and date locale: `'nl'` (nl-NL, the default) or `'browser'` (the browser's own locale). */
export function configureFormat({ locale: choice } = {}) {
  locale = choice === 'browser' ? undefined : dutch;
  formatters.clear();
}

/** The locale setting currently in use: `'nl'` or `'browser'`. */
export function formatLocale() { return locale === dutch ? 'nl' : 'browser'; }

/**
 * Formats US dollars with two decimals (`US$ 1.234,50` in nl-NL). A positive amount under one cent reads
 * `< US$ 0,01`; `null`, `undefined` or a non-number reads "Not reported", never zero.
 */
export function money(value) {
  if (!isAmount(value)) return notReported;
  if (value > 0 && value < 0.01) return `< ${usd(2, 2).format(0.01)}`;
  return usd(2, 2).format(value);
}

/** Formats US dollars with up to five decimals, for the `title` of a rounded amount. */
export function moneyExact(value) {
  if (!isAmount(value)) return notReported;
  return usd(2, 5).format(value);
}

/**
 * Renders an amount as `<span class="num money">`, with the exact value in `title` when rounding hid it.
 * An unknown amount renders as `<span class="num money unknown">Not reported</span>`.
 */
export function moneyHtml(value) {
  if (!isAmount(value)) return `<span class="num money unknown">${notReported}</span>`;
  const text = money(value);
  const exact = moneyExact(value);
  return `<span class="num money"${exact === text ? '' : ` title="${html(exact)}"`}>${html(text)}</span>`;
}

/** Writes an amount for a form field with two decimals and no currency or grouping (`5,00` in nl-NL); a non-number is ''. */
export function amountText(value) {
  if (!isAmount(value)) return '';
  return formatter('number', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(value);
}

/**
 * Reads an amount a person typed, with a comma or a full stop as the decimal separator (`5,00`, `5.00`, `1.234,50`,
 * `1,234.50`, `US$ 5`). Returns NaN for anything else.
 * @param {string|number} text
 * @returns {number}
 */
export function parseAmount(text) {
  if (typeof text === 'number') return text;
  const value = String(text ?? '').replace(/US\$|\$|\s/g, '');
  const match = /^(\d{1,3}(?:([.,])\d{3})+|\d+)(?:([.,])(\d{1,2}))?$/.exec(value);
  if (!match) return Number.NaN;
  const [, whole, group, decimal, fraction] = match;
  if (group && decimal && group === decimal) return Number.NaN;
  return Number(`${whole.replace(/[.,]/g, '')}.${fraction || '0'}`);
}

/** Formats a count with grouping (`12.345` in nl-NL); a missing count reads `—`. */
export function count(value) {
  if (!isAmount(value)) return '—';
  return formatter('number', { maximumFractionDigits: 0 }).format(value);
}

/** Formats a score on a half-step scale (`8,5`, `10` in nl-NL); a missing score reads `—`. */
export function score(value) {
  if (!isAmount(value)) return '—';
  return formatter('number', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value);
}

/** Formats a number with at most `digits` decimals (`0,25` in nl-NL); a missing number reads `—`. */
export function decimal(value, digits = 2) {
  if (!isAmount(value)) return '—';
  return formatter('number', { maximumFractionDigits: digits }).format(value);
}

/** Formats a large count compactly (`12,1 mln.`, `88K` in nl-NL); a missing count reads `—`. */
export function compactCount(value) {
  if (!isAmount(value)) return '—';
  return formatter('number', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Formats a share (`0.5`) as a whole percentage (`50%` in nl-NL); a missing or non-finite share reads `—`. */
export function percent(value) {
  if (!isAmount(value)) return '—';
  return formatter('number', { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

/** Counts a noun: `plural(1, 'attempt')` is "1 attempt", `plural(3, 'attempt')` is "3 attempts". */
export function plural(value, singular, pluralForm = `${singular}s`) {
  return `${count(value)} ${value === 1 ? singular : pluralForm}`;
}

/** Formats a date and time as `30-09-2026 21:30` (24-hour, browser time zone); empty for a missing or invalid value. */
export function dateTime(value) {
  const date = toDate(value);
  if (!date) return '';
  if (!locale) return formatter('date', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  const part = pieces(date, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${part.day}-${part.month}-${part.year} ${part.hour}:${part.minute}`;
}

/** Formats a date as `30-09-2026`; empty for a missing or invalid value. */
export function date(value) {
  const moment = toDate(value);
  if (!moment) return '';
  if (!locale) return formatter('date', { dateStyle: 'short' }).format(moment);
  const part = pieces(moment, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${part.day}-${part.month}-${part.year}`;
}

/** Formats a wall-clock time as `21:30`, or `21:30:05` with `seconds`; empty for a missing or invalid value. */
export function time(value, { seconds = false } = {}) {
  const moment = toDate(value);
  if (!moment) return '';
  const options = { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) };
  if (!locale) return formatter('date', options).format(moment);
  const part = pieces(moment, options);
  return `${part.hour}:${part.minute}${seconds ? `:${part.second}` : ''}`;
}

/** The local calendar day of a moment as `YYYY-MM-DD`, for grouping by day; empty for a missing or invalid value. */
export function dayKey(value) {
  const moment = toDate(value);
  if (!moment) return '';
  return `${moment.getFullYear()}-${String(moment.getMonth() + 1).padStart(2, '0')}-${String(moment.getDate()).padStart(2, '0')}`;
}

/**
 * Names the local day of a moment relative to `now`: "Today", "Yesterday", "Tomorrow", otherwise the English
 * weekday and the date ("Monday 28-09-2026"). Empty for a missing or invalid value.
 */
export function dayLabel(value, now = Date.now()) {
  const moment = toDate(value);
  const today = toDate(now);
  if (!moment || !today) return '';
  const midnight = day => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const days = Math.round((midnight(today) - midnight(moment)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days === -1) return 'Tomorrow';
  return `${new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(moment)} ${date(moment)}`;
}

/**
 * Describes a moment relative to `now` in compact English: "just now", "12 s ago", "5 min ago", "3 h ago",
 * "2 d ago", or "in 5 min" for the future. Beyond seven days it returns the absolute date. Empty when missing.
 */
export function relative(value, now = Date.now()) {
  const moment = toDate(value);
  if (!moment) return '';
  const seconds = Math.round((now - moment.getTime()) / 1000);
  const span = Math.abs(seconds);
  if (span < 5) return 'just now';
  const days = Math.floor(span / 86400);
  if (days > 7) return date(moment);
  const text = span < 60 ? `${span} s` : span < 3600 ? `${Math.floor(span / 60)} min` : span < 86400 ? `${Math.floor(span / 3600)} h` : `${days} d`;
  return seconds < 0 ? `in ${text}` : `${text} ago`;
}

/** Formats a duration in seconds: "45 s", "12 min", "1 h 05 min", "2 d 03 h". Empty for a missing value. */
export function duration(seconds) {
  if (!isAmount(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
  return `${Math.floor(hours / 24)} d ${String(hours % 24).padStart(2, '0')} h`;
}

/**
 * Formats a calendar duration in seconds compactly, the largest two units that matter: "45 s", "42 min", "3 h 10 min",
 * "3 h", "2 d 4 h", and whole days from ten days on ("12 d"). Empty for a missing value.
 */
export function compactDuration(seconds) {
  if (!isAmount(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days >= 10) return `${count(days)} d`;
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

/**
 * Formats working time in seconds in hours, never days, because a working day is shorter than a calendar day:
 * "0 h", "45 s", "42 min", "3 h 10 min", and whole hours from ten hours on ("26 h", "1.240 h"). Empty for a missing value.
 */
export function workingDuration(seconds) {
  if (!isAmount(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  if (total === 0) return '0 h';
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 10) return `${count(hours)} h`;
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

/** Formats a sub-minute latency in milliseconds as seconds with one decimal: `1250` is "1,3 s" in nl-NL. Empty for a missing value. */
export function seconds(ms) {
  if (!isAmount(ms)) return '';
  return `${formatter('number', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

/**
 * Renders a moment as `<time datetime="ISO" title="30-09-2026 21:30">`. `display` picks the visible text:
 * `'relative'` (the default), `'time'` or `'absolute'`. An invalid or missing value renders nothing.
 */
export function timeHtml(value, { display = 'relative', now = Date.now() } = {}) {
  const moment = toDate(value);
  if (!moment) return '';
  const text = display === 'absolute' ? dateTime(moment) : display === 'time' ? time(moment) : relative(moment, now);
  return `<time class="num" datetime="${html(moment.toISOString())}" title="${html(dateTime(moment))}">${html(text)}</time>`;
}

/** The earlier name for `time(value, { seconds: true })`, kept for the views that still call it. */
export const clock = value => time(value, { seconds: true });
/** The earlier name for `relative(value)`, kept for the views that still call it. */
export const ago = value => relative(value);
