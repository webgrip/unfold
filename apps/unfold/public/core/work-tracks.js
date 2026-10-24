import { escape } from './dom.js';
import { dateTime, time } from './format.js';
import { laneMarkup, sessionLanes, streamExtent, streamLanes, streamTicks } from './value-stream.js';
import { attachmentWords } from './session-tracks.js';

const iso = ms => new Date(ms).toISOString();
const pct = share => `${share.toFixed(3)}%`;

/** The tone each author of the commit spine is drawn in, and how the legend names it. */
export const spineAuthors = Object.freeze({
  ploeg: Object.freeze({ tone: 'live', label: 'A Ploeg Role' }),
  agent: Object.freeze({ tone: 'review', label: 'An agent on a person’s machine' }),
  person: Object.freeze({ tone: 'success', label: 'A person, no AI-written lines' }),
  unknown: Object.freeze({ tone: 'neutral', label: 'Not known' }),
});

const handoverWords = Object.freeze({ handoff: 'Let Ploeg finish this', claim: '/unfold:start', 'take-over': 'Continued in Claude Code', overlap: 'Started while a Run worked' });

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

function legend(tracks) {
  const used = new Set(tracks.spine.map(dot => dot.by));
  const authors = Object.entries(spineAuthors).filter(([by]) => used.has(by)).map(([by, meta]) => `<li><svg class="stream-mark" data-tone="${meta.tone}" data-by="${by}" width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="5"/></svg>${escape(meta.label)}</li>`).join('');
  const shapes = tracks.spine.some(dot => dot.kind === 'push') ? '<li><svg class="stream-mark" data-tone="neutral" width="12" height="12" viewBox="-7 -7 14 14" aria-hidden="true"><rect x="-4" y="-4" width="8" height="8" transform="rotate(45)"/></svg>A push to the pull request</li>' : '';
  const handover = tracks.handovers.length ? '<li><svg class="tracks-legend-handover" width="14" height="12" aria-hidden="true"><line x1="7" x2="7" y1="0" y2="12"/></svg>Control moved between Ploeg and a person</li>' : '';
  const items = `${authors}${shapes}${handover}`;
  return items ? `<ul class="tracks-legend meta" aria-label="Key">${items}</ul>` : '';
}

function chart(lanes, tracks, now, label) {
  const all = [...lanes.ploeg, ...lanes.people, ...lanes.spine];
  const window = streamExtent(all, now);
  if (!window) return '';
  const ticks = streamTicks(window);
  const share = at => pct(((at - window.from) / (window.to - window.from)) * 100);
  const live = all.some(lane => lane.bars.some(bar => bar.end === null)) && now >= window.from && now <= window.to;
  const axis = `<svg class="stream-axis" width="100%" height="100%" overflow="visible" aria-hidden="true">${ticks.map((tick, index) => `<text x="${pct(tick.share)}" y="70%" text-anchor="${index === 0 && tick.share < 5 ? 'start' : 'middle'}">${escape(tick.label)}</text>`).join('')}</svg>`;
  const connectors = tracks.handovers.filter(mark => mark.at >= window.from && mark.at <= window.to).map(mark => `<line class="tracks-handover" data-kind="${escape(mark.kind)}" x1="${share(mark.at)}" x2="${share(mark.at)}" y1="0" y2="100%"/>`).join('');
  const grid = `<svg class="stream-grid" width="100%" height="100%" overflow="visible" aria-hidden="true">${ticks.map(tick => `<line class="stream-gridline" x1="${pct(tick.share)}" x2="${pct(tick.share)}" y1="0" y2="100%"/>`).join('')}${connectors}${live ? `<line class="stream-now" x1="${share(now)}" x2="${share(now)}" y1="0" y2="100%"/>` : ''}</svg>`;
  const group = (track, title, list) => list.length ? `<div class="tracks-group" data-track="${track}"><p class="tracks-title">${escape(title)}</p><ol class="stream-lanes">${list.map(lane => laneMarkup(lane, window, now)).join('')}</ol></div>` : '';
  const empty = !lanes.ploeg.length ? '<div class="tracks-group" data-track="ploeg"><p class="tracks-title">Ploeg</p><p class="meta tracks-none">Ploeg has not started an attempt.</p></div>' : '';
  return `<div class="stream-chart tracks-chart" role="group" aria-label="${escape(label)}">${axis}<div class="stream-body">${grid}${empty}${group('ploeg', 'Ploeg', lanes.ploeg)}${group('people', 'People', lanes.people)}${group('spine', 'One pull request', lanes.spine)}</div></div>`;
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
 * on one time axis, with a dashed connector wherever control moved between them and the commit spine at the bottom,
 * each commit coloured by who wrote its lines. Below 40 rem the tracks stack into one vertical list in time order.
 * Empty when no Linked Session is on the Work Item, where the value stream already tells Ploeg's side alone.
 * @param {ReturnType<import('./session-tracks.js').workTracks>} tracks
 * @param {{ detail: object, sessions: object[], now: number, runTone?: (run: object) => { tone: string, label: string }, label?: string }} input
 * @returns {string}
 */
export function workTracksMarkup(tracks, { detail, sessions, now, runTone, label = 'Ploeg and people on one time axis' }) {
  if (!tracks?.people.length) return '';
  const lanes = trackLanes(tracks, { detail, sessions, runTone });
  const picture = chart(lanes, tracks, now, label);
  if (!picture) return '';
  return `<section class="lv-panel tracks" aria-label="Two tracks"><h2 class="lv-overline">Ploeg and people</h2><p class="meta tracks-intro">What Ploeg did and what people did in their own sessions, converging on one pull request. A session belongs to the attempt and Round it overlapped.</p>${legend(tracks)}${picture}${list(tracks, detail, now)}</section>`;
}
