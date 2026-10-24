import { cx, escape, plane, r, span, usd } from './parts.js';

const C = 150;
const outer = 128;
const inner = 104;

function point(radius, turn) {
  const angle = turn * Math.PI * 2;
  return [C + radius * Math.sin(angle), C - radius * Math.cos(angle)];
}

function arc(radius, from, to) {
  const end = Math.min(to, from + 0.9999);
  const [x1, y1] = point(radius, from);
  const [x2, y2] = point(radius, end);
  return `M${r(x1)} ${r(y1)} A${radius} ${radius} 0 ${end - from > 0.5 ? 1 : 0} 1 ${r(x2)} ${r(y2)}`;
}

/**
 * The Shift dial: the outer ring is the Shift from its first Run to now, one arc per Run coloured by how it ended; the
 * inner ring is this attempt's spend against its budget; the centre names the working Role, its time and, while
 * a Run works, its health.
 * @param {object} model A `liveModel` result.
 * @returns {string}
 */
export function shiftDial(model) {
  const { start, end } = model.window;
  const total = Math.max(1, end - start);
  const turn = ms => Math.max(0, Math.min(1, (ms - start) / total));
  const arcs = model.runs.filter(run => run.startedAt !== null).map(run => {
    const from = turn(run.startedAt);
    const to = Math.max(from + 0.006, turn(run.finishedAt ?? model.now));
    const tone = run.state === 'running' ? 'live' : run.status === 'stuck' ? 'stuck' : run.machine ? 'machine' : run.status === 'failed' ? 'failed' : 'done';
    return `<path class="${cx('lv-dial-run', `is-${tone}`)}" d="${arc(outer, from, to - 0.004)}"><title>Run ${run.n} of attempt ${run.attempt} · ${escape(run.failure?.label ?? run.status)}</title></path>`;
  }).join('');
  const share = model.spend.share;
  const budget = share !== null && share > 0 ? `<path class="${cx('lv-dial-spend', model.spend.over ? 'is-over' : share >= 0.8 ? 'is-high' : '')}" d="${arc(inner, 0, Math.max(0.01, share))}"></path>` : '';
  const live = model.runs.find(run => run.state === 'running');
  const [px, py] = live ? point(outer, 1 - 0.0001) : [0, 0];
  const centre = model.running ? span(model.running.seconds) : model.state === 'done' ? 'Landed' : model.state === 'awaiting_review' ? 'Review' : model.state === 'needs_human' ? 'Stopped' : 'Waiting';
  const role = model.running?.role ?? (model.state === 'awaiting_review' ? 'Pull request open' : model.runs.find(run => run.status === 'pending')?.role ?? model.runs.at(-1)?.role ?? 'No Run yet');
  const tones = new Set(model.runs.map(run => run.state === 'running' ? 'live' : run.machine ? 'machine' : run.status === 'failed' ? 'failed' : ''));
  const keys = [['machine', 'infrastructure'], ['failed', 'agent failed'], ['live', 'running']].filter(([tone]) => tones.has(tone)).map(([tone, words]) => `<span class="lv-key is-${tone}">${words}</span>`).join('');
  const label = `${role}, ${centre}; ${model.runs.length} Runs, ${model.lost.runs} lost to infrastructure faults; ${share !== null ? `${Math.round(share * 100)}% of this attempt's budget spent` : 'no budget reported'}${model.health ? `; health ${model.health.label}` : ''}.`;
  return `<figure class="lv-dial"><svg class="lv-dial-svg" viewBox="0 0 300 300" role="img" aria-label="${escape(label)}"><circle class="lv-dial-track" cx="${C}" cy="${C}" r="${outer}"></circle>${arcs}<circle class="lv-dial-track lv-dial-track-inner" cx="${C}" cy="${C}" r="${inner}"></circle>${budget}${live ? `<g transform="translate(${r(px)} ${r(py)})"><circle class="lv-plane-ring" r="15"></circle>${plane(20)}</g>` : ''}<text class="lv-dial-role" x="${C}" y="${C - 26}" text-anchor="middle">${escape(role.toUpperCase())}</text><text class="lv-dial-value" x="${C}" y="${C + 14}" text-anchor="middle">${escape(centre)}</text>${model.health ? `<text class="${cx('lv-dial-health', `lv-tone-${model.health.tone}`)}" x="${C}" y="${C + 42}" text-anchor="middle">${escape(model.health.label)}</text>` : ''}</svg><figcaption class="lv-dial-legend">${keys}<span class="lv-key is-spend">${escape(model.spend.attemptUsd === null ? 'no cost reported' : `${usd(model.spend.attemptUsd)} of ${usd(model.spend.budgetUsd)}`)}</span></figcaption></figure>`;
}
