import { clock, cx, escape, flightSummary, plane, r, span } from './parts.js';

const W = 1000;
const ground = 176;
const cruise = 84;
const air = { from: 190, to: 650 };
const stations = [['pr', 'Pull request', 735], ['review', 'You', 820], ['merge', 'Merge', 895], ['production', 'Production', 962]];
const bins = 24;

function attemptSpans(model) {
  const list = model.attempts.filter(attempt => attempt.runs.length);
  if (!list.length) return [];
  const width = air.to - air.from;
  const gap = 18;
  const durations = list.map(attempt => {
    const start = attempt.runs[0].startedAt ?? attempt.openedAt ?? model.now;
    const end = Math.max(...attempt.runs.map(run => run.finishedAt ?? (run.state === 'running' ? model.now : run.startedAt ?? start)));
    return { attempt, start, end: Math.max(end, start + 1000) };
  });
  const minimum = Math.min(110, (width - gap * (list.length - 1)) / list.length);
  const total = durations.reduce((sum, entry) => sum + (entry.end - entry.start), 0);
  const free = width - gap * (list.length - 1) - minimum * list.length;
  let x = air.from;
  return durations.map(entry => {
    const w = minimum + (total ? free * (entry.end - entry.start) / total : free / list.length);
    const out = { ...entry, x, w };
    x += w + gap;
    return out;
  });
}

function runMark(run, x) {
  const y = cruise;
  const title = `<title>Run ${run.n} · ${escape(run.role)} · ${escape(run.failure?.label ?? run.status)} · ${escape(span(run.seconds))}</title>`;
  if (run.status === 'stuck') return `<g class="lv-mark lv-mark-stuck">${title}<circle cx="${r(x)}" cy="${y + 15}" r="6"></circle><line x1="${r(x)}" y1="${y + 11}" x2="${r(x)}" y2="${y + 16}"></line></g>`;
  if (run.status === 'failed') return `<g class="${cx('lv-mark', run.machine ? 'lv-mark-machine' : 'lv-mark-failed')}">${title}<path d="M${r(x - 4.5)} ${y + 10.5} l9 9 m0 -9 l-9 9"></path></g>`;
  if (run.status === 'done') return `<g class="lv-mark lv-mark-done">${title}<circle cx="${r(x)}" cy="${y}" r="4.5"></circle></g>`;
  return '';
}

function activity(model, from, to, x, w) {
  const calls = model.moves.flatMap(move => move.calls).filter(call => call.at !== null && call.at >= from && call.at <= to);
  if (!calls.length) return '';
  const counts = Array.from({ length: bins }, () => ({ n: 0, trouble: false }));
  for (const call of calls) {
    const bin = Math.min(bins - 1, Math.floor((call.at - from) / Math.max(1, to - from) * bins));
    counts[bin].n += 1;
    if (call.failed || call.interrupting) counts[bin].trouble = true;
  }
  const max = Math.max(...counts.map(bin => bin.n));
  const step = w / bins;
  return `<g class="lv-activity" aria-hidden="true">${counts.map((bin, index) => bin.n ? `<line class="${bin.trouble ? 'lv-activity-trouble' : ''}" x1="${r(x + step * (index + 0.5))}" y1="${cruise - 5}" x2="${r(x + step * (index + 0.5))}" y2="${r(cruise - 5 - 4 - bin.n / max * 22)}"></line>` : '').join('')}</g>`;
}

/**
 * The flight path: the ask on the ground, the wait, each attempt in the air with its Runs as marks, the current Run as
 * the brand plane, and the stations ahead (pull request, your review, merge, production). Under 560 px of container
 * width the path gives way to a list of the same stages. Pure: the same model always gives the same markup.
 * @param {object} model A `liveModel` result.
 * @param {{ selectedAttempt?: number, id?: string }} [options] `selectedAttempt` boxes that attempt, as when its trace is open below.
 * @returns {string}
 */
export function flightPath(model, { selectedAttempt = null, id = `lv-flight-${model.id}` } = {}) {
  const spans = attemptSpans(model);
  const flying = model.running !== null;
  const reachedPr = model.stages.find(stage => stage.id === 'pr')?.status === 'done';
  const landed = model.state === 'done';
  const out = [];
  out.push(`<line class="lv-ground" x1="16" y1="${ground}" x2="${W - 16}" y2="${ground}"></line>`);
  out.push(`<rect class="lv-ask" x="28" y="${ground - 12}" width="24" height="12" rx="2"></rect><text class="lv-label lv-label-strong" x="40" y="${ground + 18}" text-anchor="middle">Ask</text>`);
  if (model.time.waiting !== null) out.push(`<line class="lv-wait" x1="60" y1="${ground}" x2="${spans.length ? 120 : air.to}" y2="${ground}"></line><text class="lv-label" x="${spans.length ? 62 : 300}" y="${ground + 18}" text-anchor="${spans.length ? 'start' : 'middle'}">waited ${escape(span(model.time.waiting))}</text>`);
  if (!spans.length) {
    out.push(`<g transform="translate(${spans.length ? 120 : 330} ${ground - 14})">${plane(26)}</g><text class="lv-label" x="330" y="${ground - 34}" text-anchor="middle">${model.state === 'queued' || model.state === 'ingested' ? 'at the gate, waiting for a worker' : 'no Run yet'}</text>`);
  } else {
    out.push(`<path class="lv-climb" d="M120 ${ground} L${air.from} ${cruise}"></path><text class="lv-label" x="${air.from}" y="${cruise + 34}">took off ${escape(clock(spans[0].start))}</text>`);
  }
  spans.forEach(({ attempt, start, end, x, w }, index) => {
    const live = attempt.runs.some(run => run.state === 'running');
    const allLost = attempt.runs.every(run => run.status === 'failed' || run.status === 'stuck');
    const tone = live ? 'lv-air-live' : allLost ? 'lv-air-lost' : 'lv-air-done';
    const selected = selectedAttempt === attempt.n || (selectedAttempt === null && live);
    if (selected) out.push(`<rect class="lv-selected" x="${r(x - 6)}" y="${cruise - 42}" width="${r(w + 12)}" height="66" rx="8"></rect>`);
    if (index) out.push(`<line class="lv-divider" x1="${r(x - 9)}" y1="28" x2="${r(x - 9)}" y2="${ground}"></line>`);
    out.push(`<line class="${tone}" x1="${r(x)}" y1="${cruise}" x2="${r(live ? x + w - 18 : x + w)}" y2="${cruise}"></line>`);
    const failed = attempt.runs.filter(run => run.status === 'failed' || run.status === 'stuck');
    const name = live ? `Attempt ${attempt.n} · ${attempt.runs.at(-1).role} · ${span(attempt.runs.at(-1).seconds)}` : allLost ? `Attempt ${attempt.n} · ${attempt.lost === failed.length ? 'machines failed' : 'failed'}` : `Attempt ${attempt.n}`;
    out.push(`<text class="${cx('lv-label', 'lv-label-strong', allLost && !live && attempt.lost < failed.length ? 'lv-label-danger' : '')}" x="${r(x)}" y="${cruise - 48}">${escape(name)}</text>`);
    if (failed.length && !live) out.push(`<text class="lv-label" x="${r(x)}" y="${cruise - 34}">${failed.length} of ${attempt.runs.length} lost${attempt.lost ? ' · not the agent' : ''}</text>`);
    const scale = time => x + (w - (live ? 18 : 0)) * Math.min(1, Math.max(0, (time - start) / Math.max(1, end - start)));
    for (const run of attempt.runs) if (run.state !== 'running') out.push(runMark(run, scale(run.finishedAt ?? run.startedAt ?? start)));
    if (live) {
      out.push(activity(model, start, end, x, w - 18));
      out.push(`<g transform="translate(${r(x + w)} ${cruise})"><circle class="lv-plane-ring" r="17"></circle>${plane(24)}</g>`);
    }
  });
  const last = spans.at(-1);
  const exitX = last ? last.x + last.w + 18 : 120;
  if (last && (flying || !reachedPr) && !landed && model.state !== 'awaiting_review') {
    out.push(`<path class="lv-forecast" d="M${r(exitX)} ${cruise} C ${r(exitX + 40)} ${cruise}, ${r(stations[0][2] - 50)} ${ground}, ${stations[0][2]} ${ground}"></path>`);
    out.push(`<text class="lv-label" x="${r((exitX + stations[0][2]) / 2)}" y="${cruise + 46}" text-anchor="middle">${model.estimate ? escape(`forecast · ${model.estimate.text}`) : 'forecast · no estimate yet'}</text>`);
  } else if (last && (reachedPr || landed)) {
    out.push(`<path class="lv-landing" d="M${r(exitX)} ${cruise} C ${r(exitX + 40)} ${cruise}, ${r(stations[0][2] - 50)} ${ground}, ${stations[0][2]} ${ground}"></path>`);
  }
  for (const [key, label, x] of stations) {
    const stage = model.stages.find(entry => entry.id === key);
    const state = stage?.status ?? 'next';
    const shape = key === 'production' ? `<rect x="${x - 8}" y="${ground - 8}" width="16" height="16" rx="3"></rect>` : `<circle cx="${x}" cy="${ground}" r="6"></circle>`;
    out.push(`<g class="${cx('lv-station', `lv-station-${state}`, stage?.you ? 'lv-station-you' : '')}">${shape}${state === 'current' ? `<circle class="lv-station-ring" cx="${x}" cy="${ground}" r="11"></circle>` : ''}<text class="${cx('lv-label', stage?.you ? 'lv-label-you' : '')}" x="${x}" y="${ground + 22}" text-anchor="middle">${escape(label)}</text></g>`);
  }
  if (landed) out.push(`<g transform="translate(${stations.at(-1)[2]} ${ground - 22})">${plane(22)}</g>`);
  if (model.state === 'awaiting_review') out.push(`<g transform="translate(${stations[1][2]} ${ground - 24})">${plane(22)}</g>`);
  const summary = flightSummary(model);
  const compact = model.stages.map(stage => `<li class="${cx('lv-flight-step', `is-${stage.status}`, stage.you ? 'is-you' : '')}"><span class="lv-flight-dot" aria-hidden="true"></span><span>${escape(stage.label)}</span></li>`).join('');
  return `<figure class="lv-flight" id="${escape(id)}" data-state="${escape(model.state)}"><svg class="lv-flight-svg" viewBox="0 0 ${W} 214" role="img" aria-label="${escape(summary)}">${out.join('')}</svg><ol class="lv-flight-compact" aria-label="Stages">${compact}</ol></figure>`;
}
