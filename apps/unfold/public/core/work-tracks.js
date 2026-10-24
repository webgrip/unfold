import { escape } from './dom.js';
import { dateTime, duration, time } from './format.js';
import { dayAndTime, laneMarkup, placeIn, sessionLanes, streamExtent, streamLanes, streamTicks } from './value-stream.js';
import { attachmentWords } from './session-tracks.js';

const iso = ms => new Date(ms).toISOString();
const pct = share => `${share.toFixed(3)}%`;
const toMs = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const minute = 60_000;
const hour = 60 * minute;
const foldShare = 6;

/** The tone each author of the commit spine is drawn in, and how the legend names it. */
export const spineAuthors = Object.freeze({
  ploeg: Object.freeze({ tone: 'live', label: 'A Ploeg Role' }),
  agent: Object.freeze({ tone: 'review', label: 'An agent on a person’s machine' }),
  person: Object.freeze({ tone: 'success', label: 'A person, no AI-written lines' }),
  unknown: Object.freeze({ tone: 'neutral', label: 'Not known' }),
});

const handoverWords = Object.freeze({ handoff: 'Let Ploeg finish this', claim: '/unfold:start', 'take-over': 'Continued in Claude Code', 'take-control': 'Take control', 'hand-back': 'Hand back', overlap: 'Started while a Run worked' });

function defaultRunTone(run) {
  if (run.state === 'running') return { tone: 'live', label: 'Working' };
  if (run.state !== 'finished') return { tone: 'neutral', label: 'Waiting for a worker' };
  if (run.failureReason) return { tone: 'danger', label: 'Failed' };
  return { tone: 'success', label: 'Finished' };
}

/**
 * The lanes of the two tracks: Ploeg's (the attempts and one lane per Role), the people's (one lane per person and
 * harness), and the commit spine. Each hand-over is a mark on both lanes it connects.
 * @param {ReturnType<import('./session-tracks.js').workTracks>} tracks
 * @param {{ detail: object, sessions: object[], runTone?: (run: object) => { tone: string, label: string } }} input
 */
export function trackLanes(tracks, { detail, sessions, runTone = defaultRunTone }) {
  const ploeg = streamLanes({ stream: null, shifts: detail.shifts || [], runs: detail.runs || [], runTone });
  const people = sessionLanes(sessions);
  const laneOfSession = id => {
    const session = sessions.find(each => String(each.id) === String(id));
    return session ? people.find(lane => lane.bars.some(bar => bar.href === `#linked-session/${encodeURIComponent(session.id)}`)) : null;
  };
  const laneOfRun = id => ploeg.find(lane => lane.bars.some(bar => String(bar.runId) === String(id))) ?? ploeg.find(lane => lane.group === 'shift');
  for (const mark of tracks.handovers) {
    const entry = { at: iso(mark.at), label: mark.label, tone: mark.kind === 'overlap' ? 'attention' : 'review' };
    laneOfSession(mark.sessionId)?.marks.push(entry);
    const target = mark.runId ? laneOfRun(mark.runId) : ploeg.find(lane => lane.group === 'shift');
    target?.marks.push(entry);
  }
  const commits = tracks.spine.filter(dot => dot.kind === 'commit').length;
  const pushes = tracks.spine.length - commits;
  const spine = tracks.spine.length ? [{ key: 'spine', group: 'spine', label: 'Commits', sublabel: [commits ? `${commits} ${commits === 1 ? 'commit' : 'commits'}` : '', pushes ? `${pushes} ${pushes === 1 ? 'push' : 'pushes'}` : ''].filter(Boolean).join(' · '), url: null, bars: [], marks: tracks.spine.map(dot => ({ at: iso(dot.at), label: dot.label, tone: spineAuthors[dot.by].tone, by: dot.by, shape: dot.kind === 'commit' ? 'dot' : 'diamond' })) }] : [];
  return { ploeg, people, spine };
}

/**
 * The time axis of the two tracks with the quiet stretches folded away. Moments closer together than two hours, or a
 * tenth of the whole span when that is longer, form one stretch; every stretch keeps a straight scale and a share of
 * the width that is half an equal part and half its part of the time, and each gap between stretches folds to a fixed
 * band. `pieces` lists the stretches and folds in time order, each with its time range and its share range, so the
 * page script can turn a pointer position into a moment and back. Each stretch is named after the attempts it
 * overlapped, or where it sat among them. Null without any moment.
 * @param {object[]} lanes
 * @param {{ attempt: number, from: number, to: number }[]} shifts
 * @param {number} now
 * @returns {{ from: number, to: number, place: (at: number) => number, pieces: { from: number, to: number, start: number, end: number, fold: boolean }[], stretches: object[], folds: object[] }|null}
 */
export function foldedWindow(lanes, shifts, now) {
  const whole = streamExtent(lanes, now);
  if (!whole) return null;
  const spans = lanes.flatMap(lane => [
    ...lane.bars.map(bar => [toMs(bar.start), bar.end === null ? now : toMs(bar.end)]),
    ...lane.marks.map(mark => [toMs(mark.at), toMs(mark.at)]),
  ]).filter(([start, end]) => start !== null && end !== null).sort((a, b) => a[0] - b[0]);
  const quiet = Math.max(2 * hour, (whole.to - whole.from) / 10);
  const runs = [];
  for (const [start, end] of spans) {
    const last = runs.at(-1);
    if (last && start - last.to <= quiet) last.to = Math.max(last.to, end);
    else runs.push({ from: start, to: Math.max(start, end) });
  }
  if (runs.length < 2) {
    const pieces = [{ from: whole.from, to: whole.to, start: 0, end: 100, fold: false }];
    return { ...whole, place: at => ((at - whole.from) / (whole.to - whole.from)) * 100, pieces, stretches: [{ ...pieces[0], name: stretchName(whole, shifts) }], folds: [] };
  }
  for (const run of runs) {
    const pad = Math.max(minute, (run.to - run.from) / 25);
    run.from -= pad;
    run.to += pad;
  }
  const room = 100 - foldShare * (runs.length - 1);
  const total = runs.reduce((sum, run) => sum + (run.to - run.from), 0);
  const pieces = [];
  let cursor = 0;
  runs.forEach((run, index) => {
    if (index) {
      pieces.push({ from: runs[index - 1].to, to: run.from, start: cursor, end: cursor + foldShare, fold: true });
      cursor += foldShare;
    }
    const share = room * (0.5 / runs.length + (0.5 * (run.to - run.from)) / total);
    pieces.push({ from: run.from, to: run.to, start: cursor, end: cursor + share, fold: false });
    cursor += share;
  });
  pieces.at(-1).end = 100;
  const place = at => {
    if (at <= pieces[0].from) return 0;
    const piece = pieces.find(each => at <= each.to) ?? pieces.at(-1);
    return Math.min(piece.end, piece.start + ((at - piece.from) / Math.max(1, piece.to - piece.from)) * (piece.end - piece.start));
  };
  return {
    from: pieces[0].from, to: pieces.at(-1).to, place, pieces,
    stretches: pieces.filter(piece => !piece.fold).map(piece => ({ ...piece, name: stretchName(piece, shifts) })),
    folds: pieces.filter(piece => piece.fold),
  };
}

function stretchName({ from, to }, shifts) {
  if (!shifts.length) return '';
  const inside = shifts.filter(shift => shift.from <= to && shift.to >= from);
  if (inside.length === 1) return `Attempt ${inside[0].attempt}`;
  if (inside.length > 1) return `Attempts ${inside[0].attempt} to ${inside.at(-1).attempt}`;
  const before = shifts.filter(shift => shift.to < from).at(-1);
  const after = shifts.find(shift => shift.from > to);
  if (!before) return `Before attempt ${after.attempt}`;
  if (!after) return `After attempt ${before.attempt}`;
  return `Between attempts ${before.attempt} and ${after.attempt}`;
}

const sessionWords = Object.freeze({ review: 'A person’s own session, open', attention: 'A person’s own session, waiting for them', neutral: 'A person’s own session, ended' });

function swatch(tone, { waiting = false } = {}) {
  return `<span class="tracks-swatch" data-tone="${escape(tone)}"${waiting ? ' data-waiting' : ''} aria-hidden="true"></span>`;
}

function legend(tracks, lanes, folded) {
  const outcomes = new Map();
  for (const bar of lanes.ploeg.filter(lane => lane.group === 'run').flatMap(lane => lane.bars)) if (!outcomes.has(bar.tone)) outcomes.set(bar.tone, bar.detail);
  const bars = [
    lanes.ploeg.some(lane => lane.group === 'shift') ? `<li>${swatch('neutral', { waiting: true })}An attempt, open to closed</li>` : '',
    ...[...outcomes].map(([tone, words]) => `<li>${swatch(tone)}A Run: ${escape(words.toLowerCase())}</li>`),
    ...[...new Set(lanes.people.flatMap(lane => lane.bars.map(bar => bar.tone)))].map(tone => `<li>${swatch(tone)}${sessionWords[tone] ?? 'A person’s own session'}</li>`),
    folded ? '<li><span class="tracks-swatch tracks-swatch-fold" aria-hidden="true"></span>Quiet hours, folded away</li>' : '',
  ].join('');
  const used = new Set(tracks.spine.map(dot => dot.by));
  const authors = Object.entries(spineAuthors).filter(([by]) => used.has(by)).map(([by, meta]) => `<li><svg class="stream-mark" data-tone="${meta.tone}" data-by="${by}" width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="5"/></svg>${escape(meta.label)}</li>`).join('');
  const shapes = tracks.spine.some(dot => dot.kind === 'push') ? '<li><svg class="stream-mark" data-tone="neutral" width="12" height="12" viewBox="-7 -7 14 14" aria-hidden="true"><rect x="-4" y="-4" width="8" height="8" transform="rotate(45)"/></svg>A push to the pull request</li>' : '';
  const handover = tracks.handovers.length ? '<li><svg class="tracks-legend-handover" width="14" height="12" aria-hidden="true"><line x1="7" x2="7" y1="0" y2="12"/></svg>Control moved between Ploeg and a person</li>' : '';
  const items = `${bars}${authors}${shapes}${handover}`;
  return items ? `<ul class="tracks-legend meta" aria-label="Key">${items}</ul>` : '';
}

function stretchTicks(window) {
  return window.stretches.flatMap(stretch => {
    const most = Math.max(1, Math.floor((stretch.end - stretch.start) / 14));
    const ticks = streamTicks(stretch, most).map(tick => ({ ...tick, share: placeIn(window, tick.at) }));
    const inner = ticks.filter(tick => tick.share > stretch.start + 2 && tick.share < stretch.end - 2);
    if (!inner.length) return [{ at: stretch.from, share: stretch.start, label: dayAndTime(stretch.from), first: true }];
    if (inner[0].label === time(iso(inner[0].at))) inner[0] = { ...inner[0], label: dayAndTime(inner[0].at) };
    return inner;
  });
}

function chart(lanes, tracks, window, now, label) {
  const all = [...lanes.ploeg, ...lanes.people, ...lanes.spine];
  const ticks = stretchTicks(window);
  const share = at => pct(placeIn(window, at));
  const live = all.some(lane => lane.bars.some(bar => bar.end === null)) && now >= window.from && now <= window.to;
  const names = window.stretches.some(stretch => stretch.name)
    ? `<svg class="stream-axis tracks-stretches" width="100%" height="100%" overflow="visible" aria-hidden="true">${window.stretches.map(stretch => `<text class="tracks-stretch-name" x="${pct(stretch.start)}" y="70%" text-anchor="start">${escape(stretch.name)}</text>`).join('')}</svg>`
    : '';
  const foldLabels = window.folds.map(fold => `<text class="tracks-fold-label" x="${pct((fold.start + fold.end) / 2)}" y="70%" text-anchor="middle">${escape(duration((fold.to - fold.from) / 1000))}</text>`).join('');
  const axis = `<svg class="stream-axis" width="100%" height="100%" overflow="visible" aria-hidden="true">${ticks.map(tick => `<text x="${pct(tick.share)}" y="70%" text-anchor="${tick.first || tick.share < 5 ? 'start' : 'middle'}">${escape(tick.label)}</text>`).join('')}${foldLabels}</svg>`;
  const folds = window.folds.map(fold => `<rect class="tracks-fold" x="${pct(fold.start)}" width="${pct(fold.end - fold.start)}" y="0" height="100%"/>`).join('');
  const connectors = tracks.handovers.filter(mark => mark.at >= window.from && mark.at <= window.to).map(mark => `<line class="tracks-handover" data-kind="${escape(mark.kind)}" x1="${share(mark.at)}" x2="${share(mark.at)}" y1="0" y2="100%"/>`).join('');
  const grid = `<svg class="stream-grid" width="100%" height="100%" overflow="visible" aria-hidden="true">${folds}${ticks.map(tick => `<line class="stream-gridline" x1="${pct(tick.share)}" x2="${pct(tick.share)}" y1="0" y2="100%"/>`).join('')}${connectors}${live ? `<line class="stream-now" x1="${share(now)}" x2="${share(now)}" y1="0" y2="100%"/>` : ''}<line class="time-cursor" x1="0" x2="0" y1="0" y2="100%" visibility="hidden"/><text class="time-cursor-label" x="0" y="-4" text-anchor="middle" visibility="hidden"></text></svg>`;
  const group = (track, title, list) => list.length ? `<div class="tracks-group" data-track="${track}"><p class="tracks-title">${escape(title)}</p><ol class="stream-lanes">${list.map(lane => laneMarkup(lane, window, now)).join('')}</ol></div>` : '';
  const empty = !lanes.ploeg.length ? '<div class="tracks-group" data-track="ploeg"><p class="tracks-title">Ploeg</p><p class="meta tracks-none">Ploeg has not started an attempt.</p></div>' : '';
  const scale = JSON.stringify(window.pieces.map(({ from, to, start, end }) => [from, to, Number(start.toFixed(3)), Number(end.toFixed(3))]));
  return `<div class="stream-chart tracks-chart" role="group" aria-label="${escape(label)}" data-time-scale="${escape(scale)}">${names}${axis}<div class="stream-body">${grid}${empty}${group('ploeg', 'Ploeg', lanes.ploeg)}${group('people', 'People', lanes.people)}${group('spine', 'One pull request', lanes.spine)}</div></div>`;
}

function listEvents(tracks, detail, now) {
  const events = [];
  for (const shift of tracks.shifts) events.push({ at: shift.from, track: 'ploeg', text: `Ploeg opened attempt ${shift.attempt}`, detail: shift.open ? 'still open' : `closed ${time(iso(shift.to))}` });
  for (const run of detail.runs || []) {
    const at = Date.parse(run.startedAt ?? '');
    if (!Number.isFinite(at)) continue;
    const end = run.state === 'running' ? null : Date.parse(run.finishedAt ?? '');
    events.push({ at, track: 'ploeg', text: `${run.role || 'agent'} Run${run.round ? `, Round ${run.round}` : ''}`, detail: end === null ? 'working now' : Number.isFinite(end) ? `until ${time(iso(end))}` : '' });
  }
  for (const row of tracks.people) for (const { session, window, attached } of row.sessions) {
    events.push({ at: window.from, track: 'people', text: `${row.person} · ${row.harness}: ${session.displayTitle || session.title || 'a session'}`, detail: [attachmentWords(attached), window.open ? 'still open' : `until ${time(iso(window.to))}`].filter(Boolean).join(' · '), href: `#linked-session/${encodeURIComponent(session.id)}` });
  }
  for (const mark of tracks.handovers) events.push({ at: mark.at, track: 'handover', text: mark.label, detail: handoverWords[mark.kind] });
  for (const dot of tracks.spine) events.push({ at: dot.at, track: 'spine', by: dot.by, kind: dot.kind, text: dot.label, detail: '' });
  return events.sort((a, b) => a.at - b.at);
}

function list(tracks, detail, now) {
  const rows = listEvents(tracks, detail, now).map(event => {
    const text = event.href ? `<a class="work-inline-link" href="${escape(event.href)}">${escape(event.text)}</a>` : escape(event.text);
    return `<li class="tracks-item" data-track="${event.track}"${event.by ? ` data-by="${escape(event.by)}" data-kind="${escape(event.kind)}"` : ''}><time class="tracks-time" datetime="${escape(iso(event.at))}" title="${escape(dateTime(iso(event.at)))}">${escape(time(iso(event.at)))}</time><span class="tracks-rail" aria-hidden="true"></span><span class="tracks-text"><span class="tracks-track">${escape({ ploeg: 'Ploeg', people: 'People', handover: 'Hand-over', spine: 'Pull request' }[event.track])}</span> ${text}${event.detail ? ` <span class="meta">${escape(event.detail)}</span>` : ''}</span></li>`;
  }).join('');
  return `<ol class="tracks-list" aria-label="What Ploeg and people did, oldest first">${rows}</ol>`;
}

/**
 * The two tracks of a Work Item as one picture: Ploeg's attempts and Runs above, each person's Linked Sessions below,
 * on one time axis whose quiet hours fold away (`foldedWindow`), with a dashed connector wherever control moved between
 * them and the commit spine at the bottom, each commit coloured by who wrote its lines. A key names every colour. The
 * chart carries its scale in `data-time-scale` for the shared time cursor. Below 40 rem the tracks stack into one
 * vertical list in time order.
 * Empty when no Linked Session is on the Work Item, where the value stream already tells Ploeg's side alone. `control`
 * is the Take control panel, drawn under the intro so control moves from the view that shows it.
 * @param {ReturnType<import('./session-tracks.js').workTracks>} tracks
 * @param {{ detail: object, sessions: object[], now: number, runTone?: (run: object) => { tone: string, label: string }, label?: string, control?: string }} input
 * @returns {string}
 */
export function workTracksMarkup(tracks, { detail, sessions, now, runTone, label = 'Ploeg and people on one time axis', control = '' }) {
  if (!tracks?.people.length) return '';
  const lanes = trackLanes(tracks, { detail, sessions, runTone });
  const window = foldedWindow([...lanes.ploeg, ...lanes.people, ...lanes.spine], tracks.shifts, now);
  if (!window) return '';
  const folded = window.folds.length > 0;
  const intro = `What Ploeg’s agents did and what people did in their own sessions, on one time line that ends in one pull request.${folded ? ' Quiet hours are folded away.' : ''} Point at a moment here or in the flight above to see it in both.`;
  return `<section class="lv-panel tracks" aria-label="Two tracks"><h2 class="lv-overline">Ploeg and people</h2><p class="meta tracks-intro">${escape(intro)}</p>${control}${legend(tracks, lanes, folded)}${chart(lanes, tracks, window, now, label)}${list(tracks, detail, now)}</section>`;
}
