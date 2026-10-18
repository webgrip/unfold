import { clock, cx, escape, r, span } from './parts.js';
import { activities, activityMeta } from '../core/activity.js';

const W = 1000;
const gutter = 120;
const laneH = 26;
const gap = 8;

/** The Activities the trace always draws a lane for; the others get one only when the Run has a call of theirs. */
export const activityLanes = Object.freeze(['orient', 'explore', 'change', 'verify', 'ship']);

function axis(from, to, y, x0, width) {
  const ticks = 4;
  return Array.from({ length: ticks + 1 }, (_, index) => {
    const at = from + (to - from) * index / ticks;
    const x = x0 + width * index / ticks;
    return `<text class="lv-label lv-label-mono" x="${r(x)}" y="${y}" text-anchor="${index === 0 ? 'start' : index === ticks ? 'end' : 'middle'}">${escape(clock(at))}</text>`;
  }).join('');
}

function laneLabel(text, y, detail = '') {
  return `<text class="lv-label lv-label-strong" x="0" y="${y + 17}">${escape(text)}</text>${detail ? `<text class="lv-label" x="0" y="${y + 30}">${escape(detail)}</text>` : ''}`;
}

/**
 * The trace as lanes on one time axis: a lane per attempt with each Run as a bar, then for the followed Run a lane of
 * moves coloured by Activity and a lane per Activity (RFC-0009) with a tick per call. Failed and interrupting calls are marked; `selectedCall`
 * rings one call. Pure SVG with presentation attributes, so it renders under a CSP without inline styles.
 * @param {object} model A `liveModel` result.
 * @param {{ selectedCall?: string, scope?: 'shift'|'run' }} [options] `run` draws only the followed Run's lanes.
 * @returns {string}
 */
export function traceLanes(model, { selectedCall = null, scope = 'shift' } = {}) {
  const width = W - gutter;
  const rows = [];
  let y = 22;
  if (scope === 'shift' && model.attempts.length) {
    const { start, end } = model.window;
    const x = time => gutter + width * Math.max(0, Math.min(1, (time - start) / Math.max(1, end - start)));
    rows.push(axis(start, end, 12, gutter, width));
    for (const attempt of model.attempts) {
      rows.push(laneLabel(`Attempt ${attempt.n}`, y, `${attempt.runs.length} ${attempt.runs.length === 1 ? 'Run' : 'Runs'}`));
      rows.push(`<rect class="lv-lane" x="${gutter}" y="${y}" width="${width}" height="${laneH}" rx="4"></rect>`);
      for (const run of attempt.runs) {
        if (run.startedAt === null) continue;
        const x1 = x(run.startedAt);
        const x2 = Math.max(x1 + 3, x(run.finishedAt ?? model.now));
        const tone = run.state === 'running' ? 'live' : run.status === 'stuck' ? 'stuck' : run.machine ? 'machine' : run.status === 'failed' ? 'failed' : 'done';
        rows.push(`<rect class="${cx('lv-bar', `is-${tone}`)}" x="${r(x1)}" y="${y + 3}" width="${r(x2 - x1)}" height="${laneH - 6}" rx="3"><title>Run ${run.n} · ${escape(run.role)} · ${escape(run.failure?.label ?? run.status)} · ${escape(span(run.seconds))}</title></rect>`);
      }
      y += laneH + gap + 8;
    }
  }
  const followed = model.followed;
  const calls = model.moves.flatMap(move => move.calls);
  if (followed && model.moves.length) {
    const from = followed.startedAt ?? model.moves[0].at;
    const to = followed.finishedAt ?? model.now;
    const x = time => gutter + width * Math.max(0, Math.min(1, (time - from) / Math.max(1, to - from)));
    y += 10;
    rows.push(`<text class="lv-label lv-label-strong lv-label-live" x="0" y="${y}">Run ${followed.n} of attempt ${followed.attempt}</text>`);
    rows.push(axis(from, to, y, gutter, width));
    y += 10;
    rows.push(laneLabel('Moves', y, `${model.moves.length}`));
    rows.push(`<rect class="lv-lane" x="${gutter}" y="${y}" width="${width}" height="${laneH}" rx="4"></rect>`);
    model.moves.forEach(move => {
      if (move.at === null) return;
      const x1 = x(move.at);
      const x2 = Math.max(x1 + 4, x(move.at + move.seconds * 1000) - 2);
      const tone = move.trouble ? 'trouble' : move.activity ? `act-${move.activity}` : 'done';
      rows.push(`<rect class="${cx('lv-bar', `is-${tone}`, move.live ? 'is-live' : '')}" x="${r(x1)}" y="${y + 3}" width="${r(x2 - x1)}" height="${laneH - 6}" rx="3"><title>${move.activity ? `${escape(activityMeta(move.activity).label)} · ` : ''}${escape(move.title)} · ${move.calls.length} calls · ${escape(span(move.seconds))}</title></rect>`);
    });
    y += laneH + gap;
const split = model.activity;
    const shown = activities.filter(entry => activityLanes.includes(entry.key) || calls.some(call => call.activity === entry.key));
    const rowH = laneH - 8;
    y += 4;
    for (const lane of shown) {
      const count = calls.filter(call => call.activity === lane.key).length;
      const seconds = split?.seconds?.[lane.key] ?? 0;
      rows.push(`<text class="${cx('lv-label', count ? 'lv-label-strong' : '')}" x="0" y="${y + 13}">${escape(lane.label)}</text><text class="lv-label lv-label-mono" x="${gutter - 10}" y="${y + 13}" text-anchor="end">${count ? escape(span(seconds)) : '–'}</text>`);
      rows.push(`<rect class="lv-lane" x="${gutter}" y="${y}" width="${width}" height="${rowH}" rx="3"><title>${escape(lane.label)}: ${escape(lane.covers)}</title></rect>`);
      for (const call of calls) {
        if (call.at === null || call.activity !== lane.key) continue;
        const mark = call.failed ? 'failed' : call.interrupting ? 'trouble' : null;
        rows.push(`<rect class="${cx('lv-tick', `is-act-${lane.key}`, call.id === selectedCall ? 'is-selected' : '')}" x="${r(x(call.at) - 1.5)}" y="${y + 2}" width="3" height="${rowH - 4}" rx="1"><title>${escape(clock(call.at))} · ${escape(lane.label)} (${escape(call.rule)}) · ${escape(call.title)}${mark ? ` · ${mark === 'failed' ? 'failed' : 'interrupted something'}` : ''}</title></rect>`);
        if (mark) rows.push(`<circle class="${cx('lv-tick-mark', `is-${mark}`)}" cx="${r(x(call.at))}" cy="${y + 1}" r="3"></circle>`);
      }
      y += rowH + 4;
    }
    y += 18;
    rows.push(`<circle class="lv-tick-mark is-failed" cx="${gutter + 3}" cy="${y - 13}" r="3"></circle><text class="lv-label" x="${gutter + 10}" y="${y - 9}">Failed</text>`);
    rows.push(`<circle class="lv-tick-mark is-trouble" cx="${gutter + 83}" cy="${y - 13}" r="3"></circle><text class="lv-label" x="${gutter + 90}" y="${y - 9}">Interrupted</text>`);
  }
  if (!rows.length) return `<p class="lv-empty">No Run yet, so there is nothing to trace.</p>`;
  const label = `Trace: ${model.attempts.length} attempts, ${model.runs.length} Runs${followed ? `; Run ${followed.n} made ${calls.length} calls in ${model.moves.length} moves` : ''}.`;
  return `<div class="lv-trace-scroll"><svg class="lv-trace" viewBox="0 0 ${W} ${r(y + 4)}" role="img" aria-label="${escape(label)}">${rows.join('')}</svg></div>`;
}

const kindWords = { execute: 'shell', read: 'read', search: 'search', fetch: 'fetch', edit: 'edit', delete: 'delete', move: 'move', think: 'think', other: 'call' };

/**
 * The followed Run's newest moves as a list of native disclosures: each move with its time, calls and duration, open
 * when it is live or is the latest to run into trouble, and inside it every call with its command, status and the thought that led to it.
 * @param {object} model A `liveModel` result.
 * @param {{ selectedCall?: string, limit?: number }} [options] `limit` keeps the newest moves.
 * @returns {string}
 */
export function moveList(model, { selectedCall = null, limit = 6 } = {}) {
  if (!model.moves.length) return `<p class="lv-empty">${model.running ? 'The Run has not made a tool call yet.' : 'No transcript for this Work Item.'}</p>`;
  const moves = model.moves.slice(-limit);
  const hidden = model.moves.length - moves.length;
  const lastTrouble = [...moves].reverse().find(move => move.trouble);
  const items = moves.map(move => {
    const open = move.live || move === lastTrouble || move.calls.some(call => call.id === selectedCall);
    const calls = move.calls.map(call => `<li class="${cx('lv-call', call.failed ? 'is-failed' : call.interrupting ? 'is-trouble' : '', call.id === selectedCall ? 'is-selected' : '')}"><span class="lv-call-time">${escape(clock(call.at))}</span><span class="lv-call-body"><span class="lv-call-title">${escape(call.title)} <span class="lv-call-kind" title="${escape(`${activityMeta(call.activity).label}: ${call.rule}`)}">${escape(activityMeta(call.activity).label.toLowerCase())} · ${escape(kindWords[call.kind] ?? call.kind)}</span>${call.failed ? ' <span class="lv-call-state">failed</span>' : ''}</span>${call.input ? `<code class="lv-call-input" title="${escape(call.input)}">${escape(call.input)}</code>` : ''}${call.thought ? `<span class="lv-call-thought">${escape(call.thought)}</span>` : ''}</span></li>`).join('');
    const meta = `${move.calls.length} ${move.calls.length === 1 ? 'call' : 'calls'} · ${move.live ? 'now' : span(move.seconds)}`;
    return `<li class="${cx('lv-move', move.live ? 'is-live' : '', move.trouble ? 'is-trouble' : '')}"><details${open ? ' open' : ''}><summary class="lv-move-head"><span class="lv-move-time">${escape(clock(move.at))}</span><span class="lv-move-title">${move.activity ? `<span class="${cx('lv-move-act', `is-act-${move.activity}`)}">${escape(activityMeta(move.activity).label)}</span> ` : ''}${escape(move.title)}</span><span class="lv-move-meta">${escape(meta)}</span></summary><ol class="lv-calls">${calls}</ol></details></li>`;
  }).join('');
  return `<ol class="lv-moves" aria-label="What the agent did, grouped into moves">${hidden ? `<li class="lv-moves-hidden">${hidden} earlier ${hidden === 1 ? 'move' : 'moves'} not shown</li>` : ''}${items}</ol>`;
}

/**
 * The followed Run in one line by Activity (RFC-0009): the three Activities it spent most time in, with minutes, then
 * "no change yet" while a writing Run has not changed a file, then its call count. Null without a transcript.
 * @param {object} model A `liveModel` result.
 * @returns {string|null}
 */
export function activitySummary(model) {
  const split = model.activity;
  if (!split || !model.calls.total) return null;
  const top = activities.filter(entry => split.seconds[entry.key] >= 30 || split.calls[entry.key] > 0)
    .sort((a, b) => split.seconds[b.key] - split.seconds[a.key]).slice(0, 3)
    .map(entry => `${entry.label} ${span(split.seconds[entry.key])}`);
  const waiting = model.followed?.state === 'running' && model.followed.writes && !split.calls.change ? ['no change yet'] : [];
  return [...top, ...waiting, `${model.calls.total} ${model.calls.total === 1 ? 'call' : 'calls'}`].join(' · ');
}
