import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { dateTime, plural, time as clock } from './core/format.js';
import * as ui from './core/ui.js';

/** The number of bars in a Run's log volume chart. */
export const logBins = 48;

/** The levels a log line can carry, most severe first, with what the page calls them. */
export const logLevels = Object.freeze([
  Object.freeze({ id: 'error', label: 'Errors', short: 'ERROR' }),
  Object.freeze({ id: 'warn', label: 'Warnings', short: 'WARN' }),
  Object.freeze({ id: 'info', label: 'Info', short: 'INFO' }),
  Object.freeze({ id: 'debug', label: 'Debug', short: 'DEBUG' }),
]);

const levelWords = new Map([
  ...['fatal', 'panic', 'crit', 'critical', 'alert', 'emerg', 'error', 'err', 'e'].map(word => [word, 'error']),
  ...['warn', 'warning', 'w'].map(word => [word, 'warn']),
  ...['info', 'notice', 'information', 'i'].map(word => [word, 'info']),
  ...['debug', 'trace', 'verbose', 'd'].map(word => [word, 'debug']),
]);
const levelKeys = ['level', 'lvl', 'severity', 'levelname', 'log.level'];
const messageKeys = ['msg', 'message'];
const timeKeys = ['time', 'ts', 'timestamp', '@timestamp', 't'];
const plainLevel = /^.{0,64}?\b(FATAL|PANIC|CRITICAL|ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE)\b/;
const logfmtPair = /([^\s="]+)=("(?:[^"\\]|\\.)*"|[^\s]*)/y;

/** The page's level for a level word such as `WARNING` or `err`; null for anything else. */
export function levelOf(word) {
  return typeof word === 'string' ? levelWords.get(word.trim().toLowerCase()) ?? null : null;
}

function unquote(value) {
  if (!value.startsWith('"')) return value;
  try { return JSON.parse(value); } catch { return value.slice(1, -1); }
}

/** The `key=value` pairs of a logfmt line, or null when the line is not logfmt from its start. */
export function logfmtPairs(text) {
  const pairs = [];
  let at = 0;
  while (at < text.length) {
    while (text[at] === ' ' || text[at] === '\t') at++;
    if (at >= text.length) break;
    logfmtPair.lastIndex = at;
    const match = logfmtPair.exec(text);
    if (!match) return null;
    pairs.push([match[1], unquote(match[2])]);
    at = logfmtPair.lastIndex;
  }
  return pairs.length >= 2 ? pairs : null;
}

function fieldText(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function structured(pairs) {
  const keys = new Set(pairs.map(([key]) => key.toLowerCase()));
  if (!levelKeys.some(key => keys.has(key)) && !messageKeys.some(key => keys.has(key))) return null;
  let level = null;
  let message = '';
  const fields = [];
  for (const [key, value] of pairs) {
    const name = key.toLowerCase();
    if (levelKeys.includes(name) && level === null) { level = levelOf(fieldText(value)); if (level) continue; }
    if (messageKeys.includes(name) && !message) { message = fieldText(value); continue; }
    if (timeKeys.includes(name)) continue;
    fields.push([key, fieldText(value)]);
  }
  return { level, message, fields };
}

/**
 * What one pod log line says: its level (`error`, `warn`, `info`, `debug` or null), its message and its other fields.
 * Reads logfmt (Go `slog` text) and JSON lines; any other line is its own message, with a level only when a level
 * word leads it. The line's own time field is dropped because the log store's time is shown.
 * @param {string} text
 * @returns {{ level: string|null, message: string, fields: [string, string][] }}
 */
export function parseLogLine(text) {
  const line = typeof text === 'string' ? text : '';
  if (line.startsWith('{')) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object' && !Array.isArray(value)) { const found = structured(Object.entries(value)); if (found) return found; }
    } catch {}
  }
  const pairs = logfmtPairs(line);
  const found = pairs ? structured(pairs) : null;
  if (found) return found;
  return { level: levelOf(plainLevel.exec(line)?.[1]), message: line, fields: [] };
}

/** The fields every one of `parsed` carries with the same value, when at least two lines carry fields. */
export function commonFields(parsed) {
  const withFields = parsed.filter(line => line.fields.length);
  if (withFields.length < 2 || withFields.length !== parsed.length) return [];
  const [first, ...rest] = withFields;
  return first.fields.filter(([key, value]) => rest.every(line => line.fields.some(([other, text]) => other === key && text === value)));
}

/** The view settings of a Run's log panel before anyone changes them. */
export function defaultLogView() {
  return { level: 'all', query: '', wrap: true, times: true, range: null };
}

const toMs = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };

/** Whether `line` (with its `parsed` form) passes the panel's level, search and time range settings. */
export function logLineShown(line, parsed, view) {
  if (view.level !== 'all' && parsed.level !== view.level) return false;
  const query = view.query.trim().toLowerCase();
  if (query && !line.text.toLowerCase().includes(query) && !(line.stream || '').toLowerCase().includes(query)) return false;
  if (view.range) { const at = toMs(line.at); if (at === null || at < view.range.from || at > view.range.to || (at === view.range.to && !view.range.last)) return false; }
  return true;
}

/**
 * The time window a Run's volume chart covers: the Run's start to its end (or the last line while it runs), widened
 * to include every line; at least a second wide; null without any time.
 */
export function logExtent(lines, run = {}) {
  const moments = [toMs(run.startedAt), toMs(run.finishedAt), ...lines.map(line => toMs(line.at))].filter(at => at !== null);
  if (!moments.length) return null;
  const from = Math.min(...moments);
  return { from, to: Math.max(...moments, from + 1000) };
}

/**
 * Counts `lines` per level in `bins` equal slices of `extent`; lines without a level count as `other`.
 * @returns {{ from: number, to: number, counts: Record<string, number>, total: number }[]}
 */
export function logVolume(lines, parsed, extent, bins = logBins) {
  const width = (extent.to - extent.from) / bins;
  const slices = Array.from({ length: bins }, (_, index) => ({ from: extent.from + index * width, to: index === bins - 1 ? extent.to : extent.from + (index + 1) * width, counts: { error: 0, warn: 0, info: 0, debug: 0, other: 0 }, total: 0 }));
  lines.forEach((line, index) => {
    const at = toMs(line.at);
    if (at === null || at < extent.from || at > extent.to) return;
    const slice = slices[Math.min(bins - 1, Math.floor((at - extent.from) / width))];
    slice.counts[parsed[index].level || 'other'] += 1;
    slice.total += 1;
  });
  return slices;
}

function highlight(text, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return escape(text);
  const lower = text.toLowerCase();
  let out = '';
  let at = 0;
  for (let found = lower.indexOf(needle); found !== -1; found = lower.indexOf(needle, at)) {
    out += `${escape(text.slice(at, found))}<mark>${escape(text.slice(found, found + needle.length))}</mark>`;
    at = found + needle.length;
  }
  return out + escape(text.slice(at));
}

function stamp(at) {
  const moment = toMs(at);
  if (moment === null) return '';
  return `${clock(moment, { seconds: true })}.${String(new Date(moment).getMilliseconds()).padStart(3, '0')}`;
}

function lineKey(line, index, lines) {
  let repeat = 0;
  for (let back = index - 1; back >= 0 && lines[back].at === line.at; back--) repeat++;
  return `${String(line.at).replace(/\D/g, '')}-${repeat}`;
}

function fieldsText(fields, query) {
  return fields.map(([key, value]) => `<span class="log-field"><span class="log-field-key">${highlight(key, query)}=</span>${highlight(/\s/.test(value) || value === '' ? JSON.stringify(value) : value, query)}</span>`).join(' ');
}

function lineMarkup(run, line, parsed, { index, lines, view, hidden, several }) {
  const level = logLevels.find(entry => entry.id === parsed.level);
  const fields = parsed.fields.filter(([key, value]) => !hidden.some(([other, text]) => other === key && text === value));
  const time = view.times ? `<time class="log-time num" datetime="${escape(line.at)}" title="${escape(dateTime(line.at))}">${escape(stamp(line.at))}</time>` : '';
  const badge = `<span class="log-level"${level ? '' : ' data-empty'}>${level ? escape(level.short) : ''}</span>`;
  const stream = several && line.stream ? `<span class="log-stream">${highlight(line.stream, view.query)}</span> ` : '';
  const body = `<span class="log-text">${stream}<span class="log-message">${highlight(parsed.message, view.query)}</span>${fields.length ? ` ${fieldsText(fields, view.query)}` : ''}</span>`;
  const facts = [['Time', `<span class="mono">${escape(line.at)}</span>`], ['Level', level ? escape(level.short) : '<span class="subtle">None</span>'], ...(line.stream ? [['Pod', `<span class="mono">${escape(line.stream)}</span>`]] : []), ...parsed.fields.map(([key, value]) => [key, `<span class="mono">${escape(value)}</span>`])];
  const detail = `<div class="log-detail">${ui.dl(facts, { rows: true })}<pre class="work-log log-raw" data-private>${escape(line.text)}</pre></div>`;
  return `<details class="log-line" id="work-run-log-line-${escape(run.id)}-${lineKey(line, index, lines)}" data-level="${escape(parsed.level || 'none')}"><summary>${time}${badge}${body}</summary>${detail}</details>`;
}

const pct = share => `${share.toFixed(3)}%`;

function volumeMarkup(run, slices, view) {
  const peak = Math.max(1, ...slices.map(slice => slice.total));
  const width = 100 / slices.length;
  const order = ['debug', 'other', 'info', 'warn', 'error'];
  const bars = slices.map((slice, index) => {
    let base = 100;
    const rects = order.filter(level => slice.counts[level]).map(level => {
      const height = (slice.counts[level] / peak) * 100;
      base -= height;
      return `<rect class="log-bar" data-level="${level}" x="0" y="${pct(base)}" width="100%" height="${pct(height)}"/>`;
    }).join('');
    const selected = view.range && view.range.from === slice.from;
    const spoken = `${stamp(new Date(slice.from).toISOString())} to ${stamp(new Date(slice.to).toISOString())}: ${plural(slice.total, 'line')}${slice.counts.error ? `, ${slice.counts.error} ${slice.counts.error === 1 ? 'error' : 'errors'}` : ''}${slice.counts.warn ? `, ${slice.counts.warn} ${slice.counts.warn === 1 ? 'warning' : 'warnings'}` : ''}`;
    const button = slice.total ? `<button type="button" class="log-bin" data-action="work-run-log-range" data-id="${escape(run.id)}" data-from="${slice.from}" data-to="${slice.to}"${index === slices.length - 1 ? ' data-last="true"' : ''} aria-pressed="${selected ? 'true' : 'false'}" title="${escape(spoken)}"><span class="sr-only">${escape(spoken)}</span></button>` : '';
    return `<g>${rects ? `<svg x="${pct(index * width)}" y="0" width="${pct(width)}" height="100%" preserveAspectRatio="none" overflow="visible">${rects}</svg>` : ''}${button ? `<foreignObject x="${pct(index * width)}" y="0" width="${pct(width)}" height="100%">${button}</foreignObject>` : ''}</g>`;
  }).join('');
  const first = slices[0];
  const last = slices.at(-1);
  const axis = `<div class="log-axis meta num" aria-hidden="true"><span>${escape(clock(first.from, { seconds: true }))}</span><span>${escape(clock(last.to, { seconds: true }))}</span></div>`;
  return `<div class="log-volume"><svg class="log-volume-chart" width="100%" height="100%" role="group" aria-label="${escape(`Log lines over time; choose a bar to show only its lines`)}">${bars}</svg>${axis}</div>`;
}

/**
 * The log viewer of one Run's pod lines: a volume chart by level over the Run's time (a bar picks a time range), level
 * filters with counts, a search, wrap and time switches, a download of the shown lines, and one row per line that
 * opens to its fields and raw text. Fields every line carries show once above the lines.
 * @param {{ id: string|number, startedAt?: string|null, finishedAt?: string|null }} run
 * @param {{ text: string, at: string, stream?: string }[]} lines
 * @param {{ level: string, query: string, wrap: boolean, times: boolean, range: { from: number, to: number, last?: boolean }|null }} view
 * @param {{ several?: boolean }} [options]
 * @returns {string}
 */
export function logViewerMarkup(run, lines, view, { several = false } = {}) {
  const parsed = lines.map(line => parseLogLine(line.text));
  const hidden = commonFields(parsed);
  const counts = Object.fromEntries(logLevels.map(level => [level.id, parsed.filter(line => line.level === level.id).length]));
  const present = logLevels.filter(level => counts[level.id] || view.level === level.id);
  const shown = lines.map((line, index) => ({ line, parsed: parsed[index], index })).filter(({ line, parsed: form }) => logLineShown(line, form, view));
  const extent = logExtent(lines, run);
  const volume = extent ? volumeMarkup(run, logVolume(lines, parsed, extent), view) : '';
  const levels = present.length ? ui.segmented({ label: 'Level', action: 'work-run-log-level', items: [{ id: 'all', label: 'All', count: lines.length, selected: view.level === 'all' }, ...present.map(level => ({ id: level.id, label: level.label, count: counts[level.id], selected: view.level === level.id }))] }) : '';
  const search = `<label class="log-search"><span class="sr-only">Search these lines</span>${icon('search')}<input type="search" id="work-run-log-search-${escape(run.id)}" data-run-log-search data-id="${escape(run.id)}" value="${escape(view.query)}" placeholder="Search lines" autocomplete="off" spellcheck="false"></label>`;
  const display = ui.segmented({ label: 'Line display', action: 'work-run-log-toggle', items: [{ id: 'wrap', label: 'Wrap', selected: view.wrap }, { id: 'times', label: 'Times', selected: view.times }] });
  const download = ui.button({ label: 'Download', icon: 'download', variant: 'ghost', size: 'xs', action: 'work-run-log-download', data: { id: run.id }, title: 'Download the shown lines as a text file' });
  const range = view.range ? `<p class="meta log-range">Only ${escape(stamp(new Date(view.range.from).toISOString()))} to ${escape(stamp(new Date(view.range.to).toISOString()))} ${ui.button({ label: 'Show all times', icon: 'x', variant: 'ghost', size: 'xs', action: 'work-run-log-range', data: { id: run.id } })}</p>` : '';
  const common = hidden.length ? `<p class="meta log-common"><span>Every line carries</span> ${fieldsText(hidden, '')}</p>` : '';
  const filtered = shown.length !== lines.length;
  const tally = `<p class="meta log-tally" role="status"><span class="num">${escape(filtered ? `${shown.length} of ${plural(lines.length, 'line')}` : plural(lines.length, 'line'))}</span>${filtered ? ' shown' : ''}</p>`;
  const rows = shown.length
    ? shown.map(({ line, parsed: form, index }) => lineMarkup(run, line, form, { index, lines, view, hidden, several })).join('')
    : `<p class="log-none meta">No line matches. ${ui.button({ label: 'Clear filters', variant: 'ghost', size: 'xs', action: 'work-run-log-clear', data: { id: run.id } })}</p>`;
  return `${volume}<div class="log-tools">${levels}${search}${display}${download}</div>${range}${common}${tally}<div class="log-lines" data-private data-run-log="${escape(run.id)}" data-wrap="${view.wrap ? 'true' : 'false'}" tabindex="0" role="region" aria-label="${escape(`Pod logs of Run ${run.id}`)}">${rows}</div>`;
}

/** The shown lines of a Run as text for a file: time, pod when several, then the line. */
export function logDownloadText(lines, view, { several = false } = {}) {
  return lines.filter(line => logLineShown(line, parseLogLine(line.text), view)).map(line => `${line.at} ${several && line.stream ? `${line.stream} ` : ''}${line.text}`).join('\n') + '\n';
}
