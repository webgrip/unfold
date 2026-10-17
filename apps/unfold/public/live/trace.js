import { clock, cx, escape, r, span } from './parts.js';

const W = 1000;
const gutter = 120;
const laneH = 26;
const gap = 8;

/** The call kinds the trace draws as lanes, in order, and which tool kinds fall into each. */
export const callLanes = Object.freeze([
  Object.freeze({ id: 'execute', label: 'Shell', kinds: ['execute'] }),
  Object.freeze({ id: 'read', label: 'Read', kinds: ['read', 'search', 'fetch'] }),
  Object.freeze({ id: 'edit', label: 'Edit', kinds: ['edit', 'delete', 'move'] }),
  Object.freeze({ id: 'other', label: 'Other', kinds: ['think', 'switch_mode', 'other'] }),
]);

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
 * moves and a lane per call kind with a tick per call. Failed and interrupting calls are marked; `selectedCall`
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
      const tone = move.live ? 'live' : move.trouble ? 'trouble' : 'done';
      rows.push(`<rect class="${cx('lv-bar', `is-${tone}`)}" x="${r(x1)}" y="${y + 3}" width="${r(x2 - x1)}" height="${laneH - 6}" rx="3"><title>${escape(move.title)} · ${move.calls.length} calls · ${escape(span(move.seconds))}</title></rect>`);
    });
    y += laneH + gap;
    for (const lane of callLanes) {
      const members = calls.filter(call => lane.kinds.includes(call.kind));
      rows.push(laneLabel(lane.label, y - 2, ''));
      rows.push(`<text class="lv-label lv-label-mono" x="${gutter - 10}" y="${y + 15}" text-anchor="end">${members.length}</text>`);
      rows.push(`<rect class="lv-lane" x="${gutter}" y="${y}" width="${width}" height="${laneH - 6}" rx="4"></rect>`);
      if (!members.length && lane.id === 'edit') rows.push(`<text class="lv-label" x="${gutter + 10}" y="${y + 14}">no file changed${model.running ? ' yet' : ''}</text>`);
      for (const call of members) {
        if (call.at === null) continue;
        const cxv = x(call.at);
        const tone = call.failed ? 'failed' : call.interrupting ? 'trouble' : lane.id;
        rows.push(`<rect class="${cx('lv-tick', `is-${tone}`, call.id === selectedCall ? 'is-selected' : '')}" x="${r(cxv - 1.5)}" y="${y + 3}" width="3" height="${laneH - 12}" rx="1"><title>${escape(clock(call.at))} · ${escape(call.title)}</title></rect>`);
      }
      y += laneH - 6 + gap;
    }
  }
  if (!rows.length) return `<p class="lv-empty">No Run yet, so there is nothing to trace.</p>`;
  const label = `Trace: ${model.attempts.length} attempts, ${model.runs.length} Runs${followed ? `; Run ${followed.n} made ${calls.length} calls in ${model.moves.length} moves` : ''}.`;
  return `<div class="lv-trace-scroll"><svg class="lv-trace" viewBox="0 0 ${W} ${r(y + 4)}" role="img" aria-label="${escape(label)}">${rows.join('')}</svg></div>`;
}

const kindWords = { execute: 'shell', read: 'read', search: 'search', fetch: 'fetch', edit: 'edit', delete: 'delete', move: 'move', think: 'think', other: 'call' };

/**
 * The followed Run's moves as a list of native disclosures: each move with its time, calls and duration, open when it
 * is live or ran into trouble, and inside it every call with its command, status and the thought that led to it.
 * @param {object} model A `liveModel` result.
 * @param {{ selectedCall?: string, limit?: number }} [options] `limit` keeps the newest moves.
 * @returns {string}
 */
export function moveList(model, { selectedCall = null, limit = 50 } = {}) {
  if (!model.moves.length) return `<p class="lv-empty">${model.running ? 'The Run has not made a tool call yet.' : 'No transcript for this Work Item.'}</p>`;
  const moves = model.moves.slice(-limit);
  const hidden = model.moves.length - moves.length;
  const items = moves.map(move => {
    const open = move.live || move.trouble || move.calls.some(call => call.id === selectedCall);
    const calls = move.calls.map(call => `<li class="${cx('lv-call', call.failed ? 'is-failed' : call.interrupting ? 'is-trouble' : '', call.id === selectedCall ? 'is-selected' : '')}"><span class="lv-call-time">${escape(clock(call.at))}</span><span class="lv-call-body"><span class="lv-call-title">${escape(call.title)} <span class="lv-call-kind">${escape(kindWords[call.kind] ?? call.kind)}</span>${call.failed ? ' <span class="lv-call-state">failed</span>' : ''}</span>${call.input ? `<code class="lv-call-input">${escape(call.input)}</code>` : ''}${call.thought ? `<span class="lv-call-thought">${escape(call.thought)}</span>` : ''}</span></li>`).join('');
    const meta = `${move.calls.length} ${move.calls.length === 1 ? 'call' : 'calls'} · ${move.live ? 'now' : span(move.seconds)}`;
    return `<li class="${cx('lv-move', move.live ? 'is-live' : '', move.trouble ? 'is-trouble' : '')}"><details${open ? ' open' : ''}><summary class="lv-move-head"><span class="lv-move-time">${escape(clock(move.at))}</span><span class="lv-move-title">${escape(move.title)}</span><span class="lv-move-meta">${escape(meta)}</span></summary><ol class="lv-calls">${calls}</ol></details></li>`;
  }).join('');
  return `<ol class="lv-moves" aria-label="What the agent did, grouped into moves">${hidden ? `<li class="lv-moves-hidden">${hidden} earlier ${hidden === 1 ? 'move' : 'moves'} not shown</li>` : ''}${items}</ol>`;
}
