import { icon } from '../core/icons.js';
import { faviconPaths } from '../core/brand.js';
import { clock, cx, escape, flightSummary, r, span } from './parts.js';

const ground = 96;
const cruise = 30;
const bins = 14;
const maxGrow = 40;

/** How each way a Run can end is drawn: its glyph, tone and words. Machine endings are neutral: not the agent's fault. */
export const hopEndings = Object.freeze({
  machine: Object.freeze({ glyph: 'zap', tone: 'machine', words: 'ended by the machine' }),
  stuck: Object.freeze({ glyph: 'pause-circle', tone: 'stuck', words: 'stopped answering' }),
  failed: Object.freeze({ glyph: 'x', tone: 'failed', words: 'failed' }),
  budget: Object.freeze({ glyph: 'coins', tone: 'failed', words: 'ran out of budget' }),
  timeout: Object.freeze({ glyph: 'clock', tone: 'failed', words: 'ran out of time' }),
  cancelled: Object.freeze({ glyph: 'circle-slash', tone: 'neutral', words: 'cancelled' }),
  pr: Object.freeze({ glyph: 'pull-request', tone: 'done', words: 'opened or updated the pull request' }),
  approve: Object.freeze({ glyph: 'check', tone: 'success', words: 'approved' }),
  changes: Object.freeze({ glyph: 'refresh', tone: 'attention', words: 'asked for changes' }),
  done: Object.freeze({ glyph: 'check', tone: 'done', words: 'finished' }),
  pending: Object.freeze({ glyph: 'clock', tone: 'neutral', words: 'waiting for a worker' }),
  live: Object.freeze({ glyph: null, tone: 'live', words: 'working now' }),
  holding: Object.freeze({ glyph: null, tone: 'stuck', words: 'holding: no output for a while' }),
});

function ending(run, model) {
  if (run.state === 'running') return ['watch', 'off_track'].includes(model.health?.signals.find(signal => signal.key === 'quiet')?.health) ? 'holding' : 'live';
  if (run.status === 'pending') return 'pending';
  if (run.status === 'cancelled') return 'cancelled';
  if (run.status === 'stuck') return run.machine ? 'machine' : 'stuck';
  if (run.status === 'failed') {
    if (run.machine) return 'machine';
    if (run.failure?.key === 'budget') return 'budget';
    if (run.failure?.key === 'timeout' || run.failure?.key === 'idle') return 'timeout';
    return 'failed';
  }
  if (!run.writes && run.verdict === 'approve') return 'approve';
  if (!run.writes && run.verdict === 'request_changes') return 'changes';
  if (run.outcome === 'pr_opened' || run.outcome === 'pr_updated') return 'pr';
  return 'done';
}

const grounded = end => ['machine', 'stuck', 'failed', 'budget', 'timeout', 'cancelled', 'pending'].includes(end);
const grow = minutes => Math.max(1, Math.min(12, Math.round(1 + Math.sqrt(Math.max(0, minutes)) * 1.6)));

function profile(model, run) {
  if (model.transcriptKnown === false || !model.followed || model.followed.id !== run.id || run.startedAt === null) return null;
  const end = run.finishedAt ?? model.now;
  const calls = model.moves.flatMap(move => move.calls).filter(call => call.at !== null && call.at >= run.startedAt && call.at <= end);
  if (!calls.length) return null;
  const counts = Array.from({ length: bins }, () => ({ n: 0, trouble: false }));
  for (const call of calls) {
    const bin = Math.min(bins - 1, Math.floor((call.at - run.startedAt) / Math.max(1, end - run.startedAt) * bins));
    counts[bin].n += 1;
    if (call.failed || call.interrupting) counts[bin].trouble = true;
  }
  const rolled = counts.map((_, index) => (counts[Math.max(0, index - 1)].n + counts[index].n * 2 + counts[Math.min(bins - 1, index + 1)].n) / 4);
  const max = Math.max(...rolled);
  return counts.map((bin, index) => ({ level: 0.25 + 0.75 * rolled[index] / max, trouble: bin.trouble }));
}

function smooth(points) {
  if (points.length < 2) return '';
  const n = points.length;
  const slopes = points.slice(0, -1).map((point, index) => (points[index + 1][1] - point[1]) / Math.max(1e-6, points[index + 1][0] - point[0]));
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === n - 1) return slopes[n - 2];
    const [left, right] = [slopes[index - 1], slopes[index]];
    return left * right <= 0 ? 0 : (left + right) / 2;
  });
  for (let index = 0; index < n - 1; index += 1) {
    if (slopes[index] === 0) { tangents[index] = 0; tangents[index + 1] = 0; continue; }
    const a = tangents[index] / slopes[index];
    const b = tangents[index + 1] / slopes[index];
    const h = Math.hypot(a, b);
    if (h > 3) { tangents[index] = 3 * a / h * slopes[index]; tangents[index + 1] = 3 * b / h * slopes[index]; }
  }
  let d = `M${r(points[0][0])} ${r(points[0][1])}`;
  for (let index = 0; index < n - 1; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[index + 1];
    const third = (x1 - x0) / 3;
    d += ` C${r(x0 + third)} ${r(y0 + tangents[index] * third)} ${r(x1 - third)} ${r(y1 - tangents[index + 1] * third)} ${r(x1)} ${r(y1)}`;
  }
  return d;
}

/**
 * The geometry of one hop in a 100 × 100 box that stretches to its column: a climb when it starts on the ground,
 * a cruise whose altitude follows the Run's calls per minute when its transcript is known, and an end in the air, a
 * drop to the ground, or a taxi along it. Trouble bins become a separate jagged path.
 * Several Runs that ended the same way in a row (`count` > 1) draw as one hop of short bounces.
 * @param {{ from: 'ground'|'air', end: string, profile: { level: number, trouble: boolean }[]|null, count?: number }} hop
 * @returns {{ line: string, area: string, trouble: string }}
 */
export function hopGeometry({ from, end, profile: levels, count = 1 }) {
  if (end === 'pending') return { line: `M0 ${ground} L100 ${ground}`, area: '', trouble: '', points: [[0, ground], [100, ground]] };
  if (count > 1) {
    const bounces = Math.min(count, 8);
    const width = 100 / bounces;
    const top = cruise + 32 * 0.8;
    const line = Array.from({ length: bounces }, (_, index) => {
      const x = index * width;
      return `${index ? '' : `M0 ${ground} `}C${r(x + width * 0.2)} ${top}, ${r(x + width * 0.8)} ${top}, ${r(x + width)} ${ground}`;
    }).join(' ');
    return { line, area: `${line} L0 ${ground} Z`, trouble: '', points: [] };
  }
  const points = [[0, from === 'ground' ? ground : cruise]];
  const climb = from === 'ground' ? 22 : 0;
  const fall = grounded(end) ? 24 : 0;
  const altitude = level => cruise + (1 - level) * 32;
  const resting = fall ? 0.2 : 1;
  if (climb) points.push([climb, altitude(levels?.[0]?.level ?? resting)]);
  const width = 100 - climb - fall;
  const steps = levels ?? [{ level: resting, trouble: false }, { level: resting, trouble: false }];
  points.push(...steps.map((step, index) => [climb + width * (index + 0.5) / steps.length, altitude(step.level)]));
  if (fall) points.push([100, ground]);
  else points.push([100, cruise]);
  const line = smooth(points);
  const area = `${line} L100 ${ground} L0 ${ground} Z`;
  const trouble = levels ? steps.map((step, index) => {
    if (!step.trouble) return '';
    const x0 = climb + width * index / steps.length;
    const step6 = r(width / steps.length / 6);
    return `M${r(x0)} ${r(altitude(step.level))} l${step6} -8 l${step6} 14 l${step6} -14 l${step6} 14 l${step6} -14 l${step6} 8`;
  }).join(' ').trim() : '';
  return { line, area, trouble, points };
}

/**
 * The height of a hop's line at `x`, read off its points by straight interpolation; close enough to the smooth curve
 * for a mark to meet the line.
 * @param {number[][]} points `hopGeometry().points`.
 * @param {number} x 0 to 100.
 * @returns {number}
 */
export function heightAt(points, x) {
  if (!points.length) return cruise;
  if (x <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    if (x <= x1) return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return points.at(-1)[1];
}

const verdictWords = Object.freeze({ on_track: 'on track', watch: 'watch', off_track: 'off track' });
const labelBins = 5;
const verdictRank = Object.freeze({ on_track: 0, watch: 1, off_track: 2 });

/**
 * The ring the plane flies with while a Run works: `is-suspect` when a high tripwire decided an Off track health,
 * otherwise `is-watch` or `is-off_track` after the health, and none when it is on track or not judged.
 * @param {object} model A `liveModel` result.
 * @returns {string}
 */
export function planeRing(model) {
  const health = model.health;
  if (!health || !['watch', 'off_track'].includes(health.health)) return '';
  if (health.health === 'off_track' && health.deciding === 'tripwire') return 'is-suspect';
  return `is-${health.health}`;
}

/** Where a moment falls on a hop: one of `bins` columns, so marks sit on fixed CSS positions instead of inline styles. */
export const markBins = bins;

/**
 * The marks drawn on one hop: tripwire hits from the followed Run's transcript, grouped by column, and AI judge
 * verdicts for the Run from Unfold's shadow judge. A verdict only advises: it never moves the Run. Each mark sits in one of `markBins` columns across the hop's 100-wide box, at the
 * same place the activity profile puts the call. The worst verdict is `labelled`: on its own row when the hop has no
 * tripwire marks, and otherwise only when its word fits on `side` without covering another verdict. `divertedAt` is the column of the first `off_track` verdict.
 * @param {object} model A `liveModel` result.
 * @param {{ run: object, from: string, end: string, count: number }} hop
 * @returns {{ wires: object[], calls: object[], divertedAt: number|null }}
 */
export function hopMarks(model, hop) {
  const none = { wires: [], calls: [], divertedAt: null };
  const { run } = hop;
  if (hop.count > 1 || hop.end === 'pending' || run.startedAt === null) return none;
  const end = run.finishedAt ?? model.now;
  const climb = hop.from === 'ground' ? 22 : 0;
  const fall = grounded(hop.end) ? 24 : 0;
  const binOf = at => {
    const share = Math.max(0, Math.min(1, (at - run.startedAt) / Math.max(1, end - run.startedAt)));
    return Math.max(0, Math.min(bins - 1, Math.floor((climb + (100 - climb - fall) * share) / 100 * bins)));
  };
  const inside = at => at !== null && at >= run.startedAt && at <= end;
  const followed = model.followed?.id === run.id;
  const grouped = new Map();
  for (const signal of followed ? model.guard.signals.filter(each => inside(each.at)) : []) {
    const bin = binOf(signal.at);
    if (!grouped.has(bin)) grouped.set(bin, []);
    grouped.get(bin).push(signal);
  }
  const wires = [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([bin, signals]) => ({ bin, signals, severity: signals.some(each => each.severity === 'high') ? 'high' : 'medium' }));
  const own = (model.judgements ?? []).filter(each => each.runId === run.id && inside(each.at));
  const worst = own.reduce((best, each) => !best || verdictRank[each.health] >= verdictRank[best.health] ? each : best, null);
  const placed = own.map(each => ({ bin: binOf(each.at), verdict: each.health, judgement: each }));
  const room = (bin, step) => !placed.some(other => other.judgement !== worst && Math.sign(other.bin - bin) === step && Math.abs(other.bin - bin) < labelBins) && bin + step * (labelBins - 1) >= 0 && bin + step * (labelBins - 1) <= bins - 1;
  const calls = placed.map(call => {
    if (call.judgement !== worst) return { ...call, labelled: false, side: null };
    const order = call.bin < bins / 2 ? [1, -1] : [-1, 1];
    const step = wires.length ? order.find(each => room(call.bin, each)) : order[0];
    return { ...call, labelled: step !== undefined, side: step === undefined ? null : step === 1 ? 'start' : 'end' };
  });
  const turn = own.find(each => each.health === 'off_track');
  return { wires, calls, divertedAt: turn ? binOf(turn.at) : null };
}

/**
 * The flight as data: the gate, the wait, each attempt with its hops (one per Run), how it approaches the stations,
 * and the stations themselves. Pure, so tests can pin how each state is drawn without a browser.
 * @param {object} model A `liveModel` result.
 * @returns {object[]}
 */
export function flightLegs(model) {
  const legs = [];
  const queued = !model.runs.length;
  legs.push({ kind: 'gate', id: 'ask', label: 'Ask', note: model.time.lead !== null ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(model.now - model.time.lead * 1000) : '' });
  legs.push({ kind: 'wait', label: queued ? 'At the gate' : 'Waited', note: model.time.waiting !== null ? span(model.time.waiting) : '', parked: queued && ['queued', 'ingested', 'leased'].includes(model.state) });
  for (const attempt of model.attempts) {
    if (!attempt.runs.length) continue;
    let from = 'ground';
    const singles = attempt.runs.map(run => {
      const end = ending(run, model);
      const hop = { run, runs: [run], count: 1, end, from, grow: grow(run.seconds / 60), profile: profile(model, run), ...hopEndings[end] };
      hop.marks = hopMarks(model, hop);
      if (hop.marks.wires.length || hop.marks.calls.length) hop.grow = Math.min(12, hop.grow + 2 + hop.marks.wires.length);
      from = grounded(end) ? 'ground' : 'air';
      return hop;
    });
    const hops = [];
    for (const hop of singles) {
      const previous = hops.at(-1);
      const same = previous && previous.end === hop.end && grounded(hop.end) && hop.end !== 'pending';
      if (same) { previous.runs.push(hop.run); previous.count += 1; previous.grow = Math.min(12, previous.grow + hop.grow); previous.marks = { wires: [], calls: [], divertedAt: null }; }
      else hops.push({ ...hop, runs: [hop.run] });
    }
    for (let index = hops.length - 1; index >= 0; index -= 1) {
      if (hops[index].count < 3 && hops[index].count > 1) hops.splice(index, 1, ...hops[index].runs.map(run => singles.find(single => single.run === run)));
    }
    const lost = attempt.runs.filter(run => run.machine).length;
    const failed = attempt.runs.filter(run => ['failed', 'stuck'].includes(run.status) && !run.machine).length;
    const live = attempt.runs.some(run => run.state === 'running');
    const first = attempt.runs[0].startedAt;
    const last = Math.max(...attempt.runs.map(run => run.finishedAt ?? (run.state === 'running' ? model.now : run.startedAt ?? 0)));
    const words = [`${attempt.runs.length} ${attempt.runs.length === 1 ? 'Run' : 'Runs'}`, lost ? `${lost} lost to machines` : '', failed ? `${failed} failed` : ''].filter(Boolean).join(' · ');
    const waiting = attempt.runs.some(run => run.status === 'pending');
    legs.push({ kind: 'attempt', n: attempt.n, live: live || waiting, hops, grow: Math.min(maxGrow, hops.reduce((sum, hop) => sum + hop.grow, 0)), head: `Attempt ${attempt.n}`, note: words, time: first !== null ? `${clock(first)}–${live ? 'now' : clock(last)}` : '', tone: live || waiting ? 'live' : lost === attempt.runs.length ? 'machine' : failed ? 'failed' : 'done' });
  }
  const pr = model.stages.find(stage => stage.id === 'pr')?.status === 'done';
  const stopped = { needs_human: ['attention', 'Needs you', 'flag'], stale: ['severe', 'Stopped retrying', 'circle-slash'], withdrawn: ['neutral', 'Withdrawn', 'circle-slash'] }[model.state];
  const lastFailure = [...model.runs].reverse().find(run => run.failure || run.status === 'cancelled');
  if (stopped) legs.push({ kind: 'stop', tone: stopped[0], label: stopped[1], glyph: stopped[2], note: lastFailure?.failure?.label ?? (model.state === 'withdrawn' ? 'Its Runs are kept' : '') });
  else if (!model.running && (model.state === 'awaiting_review' || model.state === 'done' || pr)) legs.push({ kind: 'approach', mode: 'landed', note: '' });
  else if (!queued) legs.push({ kind: 'approach', mode: model.running ? 'forecast' : 'taxi', note: model.estimate ? model.estimate.text : 'no estimate' });
  for (const stage of model.stages.filter(entry => ['pr', 'review', 'merge', 'production'].includes(entry.id))) {
    const parked = (model.state === 'awaiting_review' && stage.id === 'review') || (model.state === 'done' && stage.id === 'merge');
    legs.push({ kind: 'station', id: stage.id, label: stage.id === 'review' ? 'You' : stage.label, status: stopped && stage.status !== 'done' ? 'blocked' : stage.status, you: stage.you, parked, note: stage.id === 'pr' && model.pullRequest?.number ? `#${model.pullRequest.number}` : '' });
  }
  return legs;
}

function planeMark(extra = '') {
  return `<span class="${cx('lv-fp-plane', extra)}" aria-hidden="true"><svg viewBox="4 4 56 56" class="lv-fp-plane-svg" aria-hidden="true"><path class="lv-plane-ink" d="${faviconPaths.ink}"></path><path class="lv-plane-fold" d="${faviconPaths.fold}"></path></svg></span>`;
}

const binX = bin => (bin + 0.5) * 100 / bins;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function wireWords(signals) {
  const blocked = signals.filter(each => each.blocked).length;
  return `${plural(signals.length, 'tripwire hit', 'tripwire hits')} at ${clock(signals[0].at)}: ${[...new Set(signals.map(each => each.label.toLowerCase()))].join('; ')}${blocked ? `, ${blocked} blocked` : ''}. Derived from the transcript.`;
}

function callWords(judgement) {
  return `AI judge (advisory) at ${clock(judgement.at)}: ${verdictWords[judgement.health]}. ${judgement.reason}`;
}

function markWords(model, hop) {
  const { wires, calls } = hop.marks ?? { wires: [], calls: [] };
  const signals = wires.flatMap(wire => wire.signals);
  const parts = [];
  if (signals.length) parts.push(`${plural(signals.length, 'call', 'calls')} crossed a tripwire${signals.some(each => each.blocked) ? `, ${signals.filter(each => each.blocked).length} blocked` : ''}.`);
  for (const call of calls) parts.push(callWords(call.judgement));
  const ring = planeRing(model);
  if ((hop.end === 'live' || hop.end === 'holding') && ring) parts.push(ring === 'is-suspect' ? `Possible hijack: ${model.health.reason}.` : `Health ${model.health.label.toLowerCase()}: ${model.health.source === 'judge' && model.health.judge ? `AI judge: ${model.health.judge.reason}` : model.health.reason}.`);
  return parts.join(' ');
}

function markSvg(hop, points) {
  const { wires, calls } = hop.marks;
  return [
    ...calls.map(call => `<path class="${cx('lv-fp-call-line', `is-${call.verdict}`)}" d="M${r(binX(call.bin))} 8 V${r(heightAt(points, binX(call.bin)))}"></path>`),
    ...wires.map(wire => `<path class="${cx('lv-fp-wire-line', `is-${wire.severity}`)}" d="M${r(binX(wire.bin))} ${r(heightAt(points, binX(wire.bin)))} V8"></path>`),
  ].join('');
}

function markHtml(hop) {
  const { wires, calls } = hop.marks;
  return [
    ...wires.map(wire => `<span class="${cx('lv-fp-wire', `is-${wire.severity}`, `lv-fp-at-${wire.bin}`)}" title="${escape(wireWords(wire.signals))}" aria-hidden="true">${icon('alert')}${wire.signals.length > 1 ? `<span class="lv-fp-wire-n">${wire.signals.length}</span>` : ''}</span>`),
    ...calls.map(call => `<span class="${cx('lv-fp-call', `is-${call.verdict}`, `lv-fp-at-${call.bin}`, call.labelled ? '' : 'lv-fp-call-quiet', call.side === 'end' ? 'lv-fp-call-end' : '')}" title="${escape(callWords(call.judgement))}" aria-hidden="true">${icon('eye')}${call.labelled ? `<span class="lv-fp-call-word">AI · ${escape(verdictWords[call.verdict])}</span>` : ''}</span>`),
  ].join('');
}

function chipMarks(hop) {
  const { wires, calls } = hop.marks ?? { wires: [], calls: [] };
  const signals = wires.flatMap(wire => wire.signals);
  const worst = calls.reduce((best, call) => !best || verdictRank[call.verdict] >= verdictRank[best.verdict] ? call : best, null);
  return `${signals.length ? `<span class="${cx('lv-fp-wire-chip', signals.some(each => each.severity === 'high') ? 'is-high' : 'is-medium')}">${icon('alert')}${signals.length}</span>` : ''}${worst ? `<span class="${cx('lv-fp-call-chip', `is-${worst.verdict}`)}">${icon('eye')}AI · ${escape(verdictWords[worst.verdict])}</span>` : ''}`;
}

function hopMarkup(hop, key, model) {
  const { run, end, tone } = hop;
  const { line, area, trouble, points } = hopGeometry(hop);
  const gradient = `${key}-g`;
  const marks = hop.marks ?? { wires: [], calls: [], divertedAt: null };
  const diverted = marks.divertedAt !== null;
  const split = diverted ? binX(marks.divertedAt) : null;
  const clips = diverted ? `<clipPath id="${key}-before"><rect x="-10" y="-10" width="${r(split + 10)}" height="120"></rect></clipPath><clipPath id="${key}-after"><rect x="${r(split)}" y="-10" width="${r(110 - split)}" height="120"></rect></clipPath>` : '';
  const lines = diverted
    ? `<path class="lv-fp-line" d="${line}" clip-path="url(#${key}-before)"></path><path class="lv-fp-line lv-fp-line-diverted" d="${line}" clip-path="url(#${key}-after)"></path>`
    : `<path class="lv-fp-line" d="${line}"></path>`;
  const sky = `<svg class="lv-fp-sky-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gradient}" x1="0" y1="0" x2="0" y2="1"><stop class="lv-fp-grad" offset="0"></stop><stop class="lv-fp-grad-end" offset="1"></stop></linearGradient>${clips}</defs>${area ? `<path class="lv-fp-area" d="${area}" fill="url(#${gradient})"></path>` : ''}${markSvg({ marks }, points)}${lines}${trouble ? `<path class="lv-fp-trouble" d="${trouble}"></path>` : ''}</svg>`;
  const base = hop.count > 1
    ? `Runs ${hop.runs[0].n} to ${hop.runs.at(-1).n}, ${hop.count} in a row ${hop.words}${run.failure ? `: ${run.failure.label}` : ''}, ${span(hop.runs.reduce((sum, each) => sum + each.seconds, 0))} in all.`
    : `Run ${run.n}, ${run.role}, ${span(run.seconds)}${run.state === 'running' ? ' so far' : ''}, ${hop.words}${run.failure ? `: ${run.failure.label}` : ''}.`;
  const extra = markWords(model, { ...hop, marks });
  const words = extra ? `${base} ${extra}` : base;
  const ring = planeRing(model);
  const badge = hop.count > 1 ? `<span class="lv-fp-count">${hop.count}×</span>` : '';
  const marker = end === 'live' ? planeMark(cx('is-live', ring))
    : end === 'holding' ? `<span class="lv-fp-hold" aria-hidden="true"><svg viewBox="0 0 60 30" class="lv-fp-hold-svg" aria-hidden="true"><rect x="3" y="3" width="54" height="24" rx="12"></rect></svg>${planeMark(cx('is-holding', ring))}</span>`
      : end === 'pending' ? planeMark('is-taxi')
        : `<span class="${cx('lv-fp-end', grounded(end) ? 'is-ground' : 'is-air', `is-${tone}`)}" aria-hidden="true">${icon(hop.glyph)}${badge}</span>`;
  const chip = `${end === 'live' || end === 'holding' || end === 'pending' ? planeMark(cx('is-chip', end === 'pending' ? '' : ring)) : `${icon(hop.glyph)}${badge}`}${chipMarks({ marks })}`;
  return `<li class="${cx('lv-fp-hop', `lv-g${hop.grow}`, `is-${tone}`, `is-${end}`, run.writes ? 'is-writer' : 'is-reader', diverted ? 'is-diverted' : '')}" title="${escape(words)}"><button type="button" class="lv-fp-hit" data-action="work-run" data-id="${escape(hop.runs?.at(-1)?.id ?? run.id)}" aria-label="${escape(`Open ${words}`)}"></button><div class="lv-fp-sky">${sky}${markHtml({ marks })}${marker}</div><div class="lv-fp-runway" aria-hidden="true"></div><span class="${cx('lv-fp-chip', `is-${tone}`)}" aria-hidden="true">${chip}</span></li>`;
}

function head(name, note, extra = '') {
  return `<div class="lv-fp-head"><span class="lv-fp-name">${name}</span>${extra}<span class="lv-fp-note">${escape(note)}</span></div>`;
}

/**
 * The flight path: one column per leg on a shared runway. The ask and the wait sit on the ground; each attempt takes
 * off and every Run is a hop whose altitude follows its activity; a machine-ended Run drops back with a neutral bolt,
 * an agent failure with a red mark, a Run gone quiet circles in a holding pattern, and the plane flies at the head of the
 * live Run. Ahead are the stations, with your review in the brand red. A stopped Work Item ends in a flag. A call that
 * crossed a tripwire (derived from the transcript) stands on its hop as a line up to a warning mark; an AI judge
 * verdict is a call sign above the hop, and an `off_track` verdict marks the
 * hop: its line turns dashed red from that moment, while the Run keeps flying. The live plane's ring follows the
 * Run's health (`planeRing`): red with a halo when a high tripwire decided it. Columns
 * grow with the square root of time, so a long wait does not crowd out the work. Under 34 rem of container width the
 * same list stands up as a vertical flight log. Pure: the same model always gives the same markup, with no inline
 * styles. Every hop is a button that opens its Run on the Work Item page (`data-action="work-run"`).
 * @param {object} model A `liveModel` result.
 * @param {{ id?: string }} [options] `id` prefixes gradient ids, so two flights of one model can share a page.
 * @returns {string}
 */
export function flightPath(model, { id = `lv-flight-${model.id}` } = {}) {
  const legs = flightLegs(model).map((leg, index) => {
    if (leg.kind === 'gate') return `<li class="lv-fp-leg lv-fp-gate lv-g2">${head(escape(leg.label), leg.note)}<div class="lv-fp-sky"></div><div class="lv-fp-runway is-apron" aria-hidden="true"><span class="lv-fp-gate-mark"></span></div></li>`;
    if (leg.kind === 'wait') return `<li class="${cx('lv-fp-leg', 'lv-fp-wait', 'lv-g3', leg.parked ? 'is-parked' : '')}">${head(escape(leg.label), leg.note)}<div class="lv-fp-sky">${leg.parked ? planeMark('is-parked') : ''}</div><div class="lv-fp-runway is-taxiway" aria-hidden="true"><span class="lv-fp-break">≈</span></div></li>`;
    if (leg.kind === 'attempt') return `<li class="${cx('lv-fp-leg', 'lv-fp-attempt', `lv-g${leg.grow}`, `is-${leg.tone}`)}">${head(`${escape(leg.head)}${leg.time ? ` <span class="lv-fp-time">${escape(leg.time)}</span>` : ''}`, leg.note)}<ol class="lv-fp-hops">${leg.hops.map((hop, hopIndex) => hopMarkup(hop, `${id}-${index}-${hopIndex}`, model)).join('')}</ol></li>`;
    if (leg.kind === 'stop') return `<li class="${cx('lv-fp-leg', 'lv-fp-stop', 'lv-g6', `lv-tone-${leg.tone}`)}">${head(escape(leg.label), leg.note)}<div class="lv-fp-sky"><span class="lv-fp-flag" aria-hidden="true">${icon(leg.glyph)}</span></div><div class="lv-fp-runway is-closed" aria-hidden="true"></div></li>`;
    if (leg.kind === 'approach') {
      const descent = leg.mode === 'taxi' ? `M0 ${ground} L100 ${ground}` : `M0 ${cruise} C${leg.mode === 'landed' ? 40 : 45} ${cruise}, 55 ${ground}, 100 ${ground}`;
      return `<li class="${cx('lv-fp-leg', 'lv-fp-approach', 'lv-g4', `is-${leg.mode}`)}">${head(leg.mode === 'landed' ? 'Landed' : 'Approach', leg.mode === 'landed' ? '' : leg.note)}<div class="lv-fp-sky"><svg class="lv-fp-sky-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="lv-fp-descent" d="${descent}"></path></svg></div><div class="lv-fp-runway" aria-hidden="true"></div></li>`;
    }
    return `<li class="${cx('lv-fp-leg', 'lv-fp-station', 'lv-g4', `is-${leg.status}`, leg.you ? 'is-you' : '')}">${head(escape(leg.label), leg.note)}<div class="lv-fp-sky">${leg.parked ? planeMark('is-parked') : ''}</div><div class="lv-fp-runway" aria-hidden="true"><span class="lv-fp-gate-mark"></span></div></li>`;
  }).join('');
  return `<figure class="lv-fp" id="${escape(id)}" data-state="${escape(model.state)}"><figcaption class="sr-only">${escape(flightSummary(model))}</figcaption><ol class="lv-fp-track">${legs}</ol></figure>`;
}
