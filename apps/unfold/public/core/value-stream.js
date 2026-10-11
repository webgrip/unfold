import { escape, safeUrl } from './dom.js';
import { dateTime, dayKey, duration, formatLocale, time } from './format.js';
import * as ui from './ui.js';

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const steps = [minute, 5 * minute, 15 * minute, 30 * minute, hour, 2 * hour, 3 * hour, 6 * hour, 12 * hour, day, 2 * day, 7 * day, 14 * day, 30 * day, 90 * day];
const groupOrder = ['ticket', 'status', 'shift', 'run', 'pullRequest', 'ci', 'environment'];
const labelledShare = 9;
const shortDay = at => new Intl.DateTimeFormat(formatLocale() === 'nl' ? 'nl-NL' : undefined, { day: 'numeric', month: 'short' }).format(at);
const toMs = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };

/**
 * The lanes of a Work Item's value-stream chart: the server's tracker, pull request, CI and environment lanes with a
 * Shift lane and one lane per Role between them. `runTone(run)` gives a Run bar's `{ tone, label }`. Bars that never
 * started are left out; a bar whose `end` is null still runs.
 * @returns {{ key: string, group: string, label: string, sublabel: string, url: string|null, bars: object[], marks: object[] }[]}
 */
export function streamLanes({ stream, shifts = [], runs = [], runTone }) {
  const lanes = [...(stream?.lanes || [])];
  const opened = shifts.filter(shift => toMs(shift.openedAt) !== null).sort((a, b) => toMs(a.openedAt) - toMs(b.openedAt));
  if (opened.length) {
    lanes.push({
      key: 'shift', group: 'shift', label: 'Shifts', sublabel: `${opened.length} ${opened.length === 1 ? 'attempt' : 'attempts'}`, url: null, marks: [],
      bars: opened.map((shift, index) => ({ start: shift.openedAt, end: shift.closedAt, label: `Shift ${index + 1}`, detail: `${shift.round} ${shift.round === 1 ? 'Round' : 'Rounds'}${shift.closedAt ? '' : ' · still open'}`, tone: shift.closedAt ? 'neutral' : 'live', waiting: true })),
    });
  }
  const started = runs.filter(run => toMs(run.startedAt) !== null).sort((a, b) => toMs(a.startedAt) - toMs(b.startedAt));
  const roles = [...new Set(started.map(run => run.role || 'agent'))];
  for (const role of roles) {
    const own = started.filter(run => (run.role || 'agent') === role);
    lanes.push({
      key: `run:${role}`, group: 'run', label: role, sublabel: own.some(run => run.writes) ? 'writer' : 'reader', url: null, marks: [],
      bars: own.map(run => {
        const result = runTone(run);
        return { start: run.startedAt, end: run.state === 'running' ? null : run.finishedAt ?? run.startedAt, label: run.round ? `Round ${run.round}` : result.label, detail: result.label, tone: result.tone, waiting: false, runId: run.id };
      }),
    });
  }
  return lanes.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));
}

/** The earliest and latest moment the lanes cover, with `now` as the end of anything still running; null without any moment. */
export function streamExtent(lanes, now) {
  const moments = lanes.flatMap(lane => [...lane.bars.flatMap(bar => [toMs(bar.start), bar.end === null ? now : toMs(bar.end)]), ...lane.marks.map(mark => toMs(mark.at))]).filter(at => at !== null);
  if (!moments.length) return null;
  const from = Math.min(...moments);
  const to = Math.max(...moments, lanes.some(lane => lane.bars.some(bar => bar.end === null)) ? now : -Infinity);
  return { from, to: Math.max(to, from + minute) };
}

/** The window the agents worked in: from the first Shift or Run to the end of the stream, padded by a twentieth on each side; null when there is no agent work. */
export function agentExtent(lanes, now) {
  const agents = lanes.filter(lane => lane.group === 'shift' || lane.group === 'run');
  const work = streamExtent(agents, now);
  const all = streamExtent(lanes, now);
  if (!work || !all) return null;
  const pad = Math.max(minute, (all.to - work.from) / 20);
  return { from: Math.max(all.from, work.from - pad), to: all.to + Math.min(pad, Math.max(0, now - all.to)) };
}

/** Axis ticks for a window: at most about six, on whole minutes, hours or local days. */
export function streamTicks({ from, to }) {
  const span = to - from;
  const step = steps.find(size => span / size <= 6) ?? steps.at(-1);
  const offset = new Date(from).getTimezoneOffset() * minute;
  const first = Math.ceil((from - offset) / step) * step + offset;
  const ticks = [];
  let previousDay = '';
  for (let at = first; at <= to; at += step) {
    const today = dayKey(new Date(at).toISOString());
    const label = step >= day ? shortDay(at) : today !== previousDay ? `${shortDay(at)} ${time(new Date(at).toISOString())}` : time(new Date(at).toISOString());
    ticks.push({ at, share: ((at - from) / span) * 100, label });
    previousDay = today;
  }
  return ticks;
}

/**
 * The value stream's headline figures from its lanes: time since the task was created (or its lead time once
 * closed), the wait before the first Run, and the time spent in agents, CI, review and from merge to deploy. A figure
 * without a fact is null.
 */
export function streamStats(lanes, { stream, now }) {
  const sum = (group, keep = () => true) => {
    const bars = lanes.filter(lane => lane.group === group).flatMap(lane => lane.bars).filter(keep);
    if (!bars.length) return null;
    return bars.reduce((total, bar) => total + Math.max(0, (bar.end === null ? now : toMs(bar.end)) - toMs(bar.start)), 0) / 1000;
  };
  const created = toMs(stream?.trackerCreatedAt) ?? toMs(stream?.admittedAt);
  const extent = streamExtent(lanes, now);
  const firstRun = Math.min(...lanes.filter(lane => lane.group === 'run').flatMap(lane => lane.bars.map(bar => toMs(bar.start))));
  return {
    total: created !== null && extent ? (Math.max(extent.to, created) - created) / 1000 : null,
    closed: Boolean(stream?.closed),
    beforeFirstRun: created !== null && Number.isFinite(firstRun) ? Math.max(0, firstRun - created) / 1000 : null,
    agents: sum('run'),
    ci: sum('ci', bar => !bar.waiting),
    review: sum('pullRequest', bar => bar.label === 'In review'),
    deploy: sum('environment', bar => bar.end !== null),
  };
}

function statsMarkup(stats) {
  const figure = (label, seconds, detail) => seconds === null ? '' : ui.stat({ label, value: duration(seconds), detail, quiet: true });
  const parts = [
    figure(stats.closed ? 'Lead time' : 'Since created', stats.total, stats.closed ? 'Created to done' : 'Still open'),
    figure('Before the first Run', stats.beforeFirstRun, 'Waiting for an agent'),
    figure('Agents', stats.agents, 'Run time, summed'),
    figure('CI', stats.ci, 'Run time, summed'),
    figure('In review', stats.review, 'Ready until merged'),
    figure('Merge to deploy', stats.deploy, 'Summed per environment'),
  ].filter(Boolean);
  return parts.length ? `<div class="stat-row stream-stats">${parts.join('')}</div>` : '';
}

const clamp = share => Math.min(100, Math.max(0, share));
const pct = share => `${share.toFixed(3)}%`;
const minimumWidth = 0.4;

function itemMarkup(bar, window, now) {
  const start = toMs(bar.start);
  const end = bar.end === null ? now : toMs(bar.end);
  if (start === null || end === null || end < window.from || start > window.to) return '';
  const span = window.to - window.from;
  const from = clamp(((start - window.from) / span) * 100);
  const width = Math.max(minimumWidth, clamp(((end - window.from) / span) * 100) - from);
  const running = bar.end === null;
  const spoken = `${bar.label}${bar.detail && bar.detail !== bar.label ? ` (${bar.detail})` : ''}: ${dateTime(bar.start)} to ${running ? 'now' : dateTime(bar.end)}, ${duration((end - start) / 1000) || '0 s'}`;
  const text = width >= labelledShare ? `<span class="stream-bar-label" aria-hidden="true">${escape(bar.label)}</span>` : '';
  const attrs = `class="stream-bar" data-tone="${escape(bar.tone)}"${bar.waiting ? ' data-waiting' : ''}${running ? ' data-running' : ''} title="${escape(spoken)}"`;
  const inner = `${text}<span class="sr-only">${escape(spoken)}</span>`;
  const element = bar.runId ? `<button type="button" ${attrs} data-action="work-run" data-id="${escape(bar.runId)}">${inner}</button>` : `<span ${attrs}>${inner}</span>`;
  return `<foreignObject x="${pct(Math.min(from, 100 - minimumWidth))}" y="0" width="${pct(width)}" height="100%">${element}</foreignObject>`;
}

function markMarkup(mark, window) {
  const at = toMs(mark.at);
  if (at === null || at < window.from || at > window.to) return '';
  const share = ((at - window.from) / (window.to - window.from)) * 100;
  const spoken = `${mark.label}: ${dateTime(mark.at)}`;
  return `<svg x="${pct(share)}" y="50%" width="1" height="1" overflow="visible" class="stream-mark" data-tone="${escape(mark.tone)}" role="img" aria-label="${escape(spoken)}"><title>${escape(spoken)}</title><rect x="-5" y="-5" width="10" height="10" transform="rotate(45)"/></svg>`;
}

function laneMarkup(lane, window, now) {
  const url = safeUrl(lane.url);
  const name = url ? `<a class="stream-name" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(lane.label)}</a>` : `<span class="stream-name">${escape(lane.label)}</span>`;
  const items = [...lane.bars.map(bar => itemMarkup(bar, window, now)), ...lane.marks.map(mark => markMarkup(mark, window))].filter(Boolean).join('');
  return `<li class="stream-lane" data-group="${escape(lane.group)}"><div class="stream-label">${name}<span class="stream-sub">${escape(lane.sublabel)}</span></div><svg class="stream-track" width="100%" height="100%" role="group" aria-label="${escape(lane.label)}">${items}</svg></li>`;
}

/**
 * The value-stream chart: headline figures, then one lane per row on a shared time axis, with a now line while
 * anything still runs. `zoom` is `all` (the whole stream) or `agents` (from the first Shift on); the zoom control shows
 * only when the agents' window is less than half the stream. Every bar and mark carries its times as text for screen
 * readers and as a tooltip.
 */
export function streamChart({ lanes, stream, now, zoom = 'all', label = 'Value stream' }) {
  const whole = streamExtent(lanes, now);
  if (!whole) return '';
  const agents = agentExtent(lanes, now);
  const zoomable = agents && agents.to - agents.from < (whole.to - whole.from) / 2;
  const window = zoomable && zoom === 'agents' ? agents : whole;
  const ticks = streamTicks(window);
  const live = lanes.some(lane => lane.bars.some(bar => bar.end === null)) && now >= window.from && now <= window.to;
  const control = zoomable ? ui.segmented({ label: 'Time range', action: 'work-stream-zoom', items: [{ id: 'all', label: 'Whole stream', selected: window === whole }, { id: 'agents', label: 'Agent work', selected: window !== whole }] }) : '';
  const share = at => pct(((at - window.from) / (window.to - window.from)) * 100);
  const axis = `<svg class="stream-axis" width="100%" height="100%" overflow="visible" aria-hidden="true">${ticks.map((tick, index) => `<text x="${pct(tick.share)}" y="70%" text-anchor="${index === 0 && tick.share < 5 ? 'start' : 'middle'}">${escape(tick.label)}</text>`).join('')}</svg>`;
  const grid = `<svg class="stream-grid" width="100%" height="100%" overflow="visible" aria-hidden="true">${ticks.map(tick => `<line class="stream-gridline" x1="${pct(tick.share)}" x2="${pct(tick.share)}" y1="0" y2="100%"/>`).join('')}${live ? `<line class="stream-now" x1="${share(now)}" x2="${share(now)}" y1="0" y2="100%"/><text class="stream-now-label" x="${share(now)}" y="-4" text-anchor="middle">Now</text>` : ''}</svg>`;
  const notes = (stream?.notes || []).map(note => `<li>${escape(note)}</li>`).join('');
  return `<div class="stream">${statsMarkup(streamStats(lanes, { stream, now }))}${control ? `<div class="stream-tools">${control}</div>` : ''}<div class="stream-chart" role="group" aria-label="${escape(label)}">${axis}<div class="stream-body">${grid}<ol class="stream-lanes">${lanes.map(lane => laneMarkup(lane, window, now)).join('')}</ol></div></div>${notes ? `<ul class="stream-notes meta">${notes}</ul>` : ''}</div>`;
}
