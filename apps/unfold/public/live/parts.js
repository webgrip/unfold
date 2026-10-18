import { escape } from '../core/dom.js';
import { faviconPaths } from '../core/brand.js';
import { compactCount, duration, money, notReported, time } from '../core/format.js';

export { escape };

/** Rounds an SVG coordinate to one decimal, so markup stays stable across runs. */
export const r = value => Math.round(value * 10) / 10;

/** Joins class names, dropping empty ones. */
export const cx = (...names) => names.filter(Boolean).join(' ');

/** Money for a live figure: `Not reported` when Ploeg did not report it, never zero. */
export const usd = value => value === null || value === undefined ? notReported : money(value);

/** A token count as `1,9 mln` style compact text, or `Not reported`. */
export const tokens = value => value === null || value === undefined ? notReported : compactCount(value);

/** A duration in seconds, `0 s` for zero, empty for a missing value. */
export const span = seconds => seconds === null || seconds === undefined ? '' : duration(seconds) || '0 s';

/** A wall-clock time for a moment in milliseconds, empty when missing. */
export const clock = ms => ms === null || ms === undefined ? '' : time(ms);

/** The brand mark as a plane glyph centred on the origin, `size` units wide. */
export function plane(size = 28, className = 'lv-plane') {
  const scale = size / 64;
  return `<g class="${className}" transform="scale(${r(scale * 100) / 100}) translate(-32 -32)" aria-hidden="true"><path class="lv-plane-ink" d="${faviconPaths.ink}"></path><path class="lv-plane-fold" d="${faviconPaths.fold}"></path></g>`;
}

/** The current move of the followed Run, or null. */
export const currentMove = model => model.moves.findLast(move => move.live) ?? null;

/**
 * One sentence that says where the Work Item stands, and a second line with the most recent trouble or what
 * happens next. Both come from the record; nothing is guessed.
 * @param {object} model A `liveModel` result.
 * @returns {{ head: string, sub: string, tone: string }}
 */
export function liveSentence(model) {
  const move = currentMove(model);
  const role = model.running?.role ?? 'The agent';
  if (model.state === 'queued' || model.state === 'ingested') return { head: 'Waiting for a worker.', sub: model.time.waiting !== null ? `Asked ${span(model.time.waiting)} ago. Nothing is needed from you.` : 'Nothing is needed from you.', tone: 'neutral' };
  if (model.state === 'awaiting_review') return { head: 'Ready for your review.', sub: model.pullRequest ? `Pull request${model.pullRequest.number ? ` #${model.pullRequest.number}` : ''} is open.` : 'The pull request is open.', tone: 'review' };
  if (model.state === 'needs_human') {
    const failure = [...model.runs].reverse().find(run => run.failure)?.failure;
    return { head: 'Stopped. It needs you.', sub: failure ? `Last failure: ${failure.label}.` : 'Ploeg stopped and asks a person to decide.', tone: 'attention' };
  }
  if (model.state === 'done') return { head: 'Landed.', sub: `${usd(model.spend.usd)} over ${model.runs.length} Runs.`, tone: 'success' };
  if (model.state === 'withdrawn') return { head: 'Withdrawn.', sub: 'Someone stopped this Work Item; its Runs are kept.', tone: 'neutral' };
  if (model.state === 'stale') return { head: 'Stopped retrying.', sub: `Ploeg gave up after ${model.lost.runs + model.lost.agentFailures} failed Runs.`, tone: 'severe' };
  if (!model.running && model.runs.some(run => run.status === 'pending')) return { head: 'Waiting for a worker.', sub: 'The next Run is queued; Ploeg starts it when a machine is free.', tone: 'neutral' };
  if (!model.running) return { head: 'Between Runs.', sub: 'Ploeg starts the next Run when a worker is free.', tone: 'neutral' };
  const warning = healthWarning(model.health);
  const tone = healthTone(model.health);
  if (!model.transcriptKnown) return { head: `${role} is working.`, sub: warning ?? model.transcriptMissing ?? 'Open the Run to follow its calls.', tone };
  const head = move ? `${role} · ${move.title}` : `${role} is starting.`;
  const trouble = model.lastTrouble;
  const sub = warning ?? (trouble ? `Ran into trouble at ${clock(trouble.at)}: ${trouble.title.toLowerCase()}.` : model.edits ? `${model.edits} ${model.edits === 1 ? 'file' : 'files'} changed so far.` : 'No file changed yet.');
  return { head, sub, tone };
}

/**
 * The sentence a Watch or Off track health puts in front of a person: the AI judge's reason when it raised the
 * health, otherwise the signals' reason. Null for any other health, or when no Run is working.
 * @param {object|null} health A `runHealth` result.
 * @returns {string|null}
 */
export function healthWarning(health) {
  if (!health || !['watch', 'off_track'].includes(health.health)) return null;
  const line = health.judge?.raised ? `AI judge (advisory): ${health.judge.reason}` : health.reason;
  return `${health.label}: ${line}${/[.!?…]$/.test(line) ? '' : '.'}`;
}

/** The tone of the live sentence for a running Run's health: live while nothing is known either way. */
export const healthTone = health => !health || health.tone === 'neutral' ? 'live' : health.tone;

/**
 * The sentence a screen reader hears for the whole flight: every attempt, the current position and what is ahead.
 * @param {object} model
 * @returns {string}
 */
export function flightSummary(model) {
  const parts = [`${model.ref}.`];
  if (model.time.waiting !== null) parts.push(`Waited ${span(model.time.waiting)} before the first Run.`);
  for (const attempt of model.attempts) {
    const lost = attempt.lost ? `, ${attempt.lost} lost to machines` : '';
    const live = attempt.runs.some(run => run.state === 'running') ? ', running now' : '';
    parts.push(`Attempt ${attempt.n}: ${attempt.runs.length} ${attempt.runs.length === 1 ? 'Run' : 'Runs'}${lost}${live}.`);
  }
  const next = model.stages.filter(stage => stage.status === 'next').map(stage => stage.label);
  parts.push(`Now at ${model.stages.find(stage => stage.status === 'current')?.label ?? 'the end'}.`);
  if (next.length) parts.push(`Ahead: ${next.join(', ')}.`);
  return parts.join(' ');
}
