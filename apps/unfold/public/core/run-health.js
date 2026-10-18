import { escape } from './dom.js';
import { icon } from './icons.js';
import { money, time as clock } from './format.js';

/**
 * The five healths a running Run can have, with the word, tone and glyph every surface shows. A badge always carries
 * the glyph and the word, never colour alone.
 * @type {Readonly<Record<'on_track'|'watch'|'off_track'|'not_judged'|'not_known', Readonly<{ label: string, tone: string, glyph: string }>>>}
 */
export const healthStates = Object.freeze({
  on_track: Object.freeze({ label: 'On track', tone: 'success', glyph: 'check' }),
  watch: Object.freeze({ label: 'Watch', tone: 'attention', glyph: 'eye' }),
  off_track: Object.freeze({ label: 'Off track', tone: 'danger', glyph: 'alert' }),
  not_judged: Object.freeze({ label: 'Not judged yet', tone: 'neutral', glyph: 'minus' }),
  not_known: Object.freeze({ label: 'Not known', tone: 'neutral', glyph: 'help-circle' }),
});

/**
 * The thresholds of RFC-0007's signal table, as named constants. Shares are of the Run's limit or budget.
 * Quiet: watch at `quietWatch`, off track at `quietOff` of the idle limit. Pace: watch when the projection overruns
 * the prompt limit at all once `paceWatchAfter` of it is used, off track when it overruns by `paceOffOverrun` or more
 * once `paceOffAfter` is used. Time: watch at `timeWatch`, off track at `timeOff` when the plan's last step is not in
 * progress. Budget: watch at `budgetWatch`, off track at `budgetOff`, judged only for observed or provisional cost.
 * Repeat: the same tool-call input `repeatWatch` times in the last `repeatWindow` calls is watch, `repeatOff` times is
 * off track. `notJudgedFor` is how many seconds a Run without a plan reads Not judged yet. `judgeReasonMax` caps the
 * judge's reason.
 */
export const healthThresholds = Object.freeze({
  quietWatch: 0.5,
  quietOff: 0.8,
  paceWatchAfter: 0.25,
  paceOffAfter: 0.5,
  paceOffOverrun: 1.25,
  timeWatch: 0.75,
  timeOff: 0.9,
  budgetWatch: 0.7,
  budgetOff: 0.9,
  repeatWindow: 10,
  repeatWatch: 3,
  repeatOff: 5,
  notJudgedFor: 300,
  judgeReasonMax: 160,
});

/**
 * The signals in the order that breaks a tie: when two signals are equally bad, the earlier one gives the reason.
 * `tripwire` is a guard.js tripwire the Run's calls crossed: medium is watch, high is off track.
 * @type {ReadonlyArray<{ id: string, label: string }>}
 */
export const healthSignals = Object.freeze([
  Object.freeze({ id: 'tripwire', label: 'Tripwires' }),
  Object.freeze({ id: 'quiet', label: 'Quiet' }),
  Object.freeze({ id: 'time', label: 'Time' }),
  Object.freeze({ id: 'budget', label: 'Budget' }),
  Object.freeze({ id: 'pace', label: 'Pace' }),
  Object.freeze({ id: 'repeat', label: 'Repeat' }),
]);

/** The signals that show progress; without at least one of them judged, a Run is never On track. */
const progressSignals = ['quiet', 'time', 'pace'];
const signalRank = { unknown: -1, ok: 0, watch: 1, off_track: 2 };
const healthRank = { not_judged: -1, not_known: -1, on_track: 0, watch: 1, off_track: 2 };
const judgeHealths = ['on_track', 'watch', 'off_track'];
const judgeKeys = new Set(['health', 'reason', 'evidence', 'model', 'at', 'runId']);
const toMs = value => { if (typeof value === 'number' && Number.isFinite(value)) return value; const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const isAmount = value => typeof value === 'number' && Number.isFinite(value);
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : '';
const lower = text => text ? text[0].toLowerCase() + text.slice(1) : '';
const minutes = seconds => seconds < 60 ? `${Math.max(0, Math.round(seconds))} s` : `${Math.floor(seconds / 60)} min`;
const percent = share => `${Math.round(share * 100)} %`;
const noLimits = 'Ploeg did not report this Run’s limits';
const transcriptWords = { loading: 'Its transcript is still loading', demo: 'The demo records no transcripts', unsupported: 'No transcript: this Ploeg does not record one', none: 'No transcript was read' };

/**
 * Checks a judge verdict against the one shape it may have: `health` is `on_track`, `watch` or `off_track`, `reason` is
 * text of at most `healthThresholds.judgeReasonMax` characters, and `evidence` lists transcript seq numbers. Unfold
 * adds `model`, `at` and `runId`. Anything else, or any other key, discards the verdict.
 * @param {unknown} value
 * @returns {{ health: string, reason: string, evidence: number[], model: string, at: number|null, runId: string|null }|null}
 */
export function judgeVerdict(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some(key => !judgeKeys.has(key))) return null;
  if (!judgeHealths.includes(value.health)) return null;
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  if (!reason || reason.length > healthThresholds.judgeReasonMax) return null;
  if (!Array.isArray(value.evidence) || !value.evidence.every(seq => Number.isInteger(seq) && seq >= 0)) return null;
  return { health: value.health, reason, evidence: [...value.evidence], model: typeof value.model === 'string' && value.model.trim() ? value.model.trim() : 'Judge model', at: toMs(value.at), runId: value.runId === undefined || value.runId === null ? null : String(value.runId) };
}

function limitsOf(limits, run) {
  if (!limits || typeof limits !== 'object') return null;
  const { promptSeconds, idleSeconds } = limits;
  if (!isAmount(promptSeconds) || promptSeconds <= 0 || !isAmount(idleSeconds) || idleSeconds <= 0) return null;
  const startedAt = toMs(limits.promptStartedAt) ?? toMs(run.startedAt);
  return startedAt === null ? null : { promptSeconds, idleSeconds, startedAt };
}

const signal = (id, state, reason, numbers = {}) => ({ id, state, reason, numbers });

function tripwireSignal(tripwires, transcriptReason) {
  if (transcriptReason) return signal('tripwire', 'unknown', transcriptReason);
  const list = (tripwires ?? []).filter(each => each && (each.severity === 'high' || each.severity === 'medium'));
  if (!list.length) return signal('tripwire', 'ok', 'No tripwire crossed', { high: 0, medium: 0 });
  const high = list.filter(each => each.severity === 'high');
  const worst = (high.length ? high : list).reduce((latest, each) => (toMs(each.at) ?? 0) >= (toMs(latest.at) ?? 0) ? each : latest);
  const more = list.length - 1;
  const at = toMs(worst.at);
  return signal('tripwire', high.length ? 'off_track' : 'watch', `Tripwire${at === null ? '' : ` at ${clock(at)}`}: ${lower(worst.label ?? 'a call crossed a tripwire')}${more ? ` (and ${more} more)` : ''}`, { high: high.length, medium: list.length - high.length });
}

function quietSignal({ items, limits, transcriptReason, now, newest, running }) {
  if (!limits) return signal('quiet', 'unknown', noLimits);
  if (transcriptReason) return signal('quiet', 'unknown', transcriptReason);
  const last = newest ?? limits.startedAt;
  const quiet = Math.max(0, (now - last) / 1000);
  const share = quiet / limits.idleSeconds;
  const numbers = { quietSeconds: Math.round(quiet), idleSeconds: limits.idleSeconds, share };
  if (share < healthThresholds.quietWatch) return signal('quiet', 'ok', `last activity ${minutes(quiet)} ago`, numbers);
  const what = running ? 'A command has had no output' : 'Nothing new reached the transcript';
  return signal('quiet', share >= healthThresholds.quietOff ? 'off_track' : 'watch', `${what} for ${minutes(quiet)}; the idle stop is at ${minutes(limits.idleSeconds)}`, numbers);
}

function planProgress(plan) {
  if (!Array.isArray(plan) || !plan.length) return null;
  const done = plan.filter(step => step?.status === 'completed').length;
  const half = plan.filter(step => step?.status === 'in_progress').length;
  return { done, total: plan.length, progress: (done + half / 2) / plan.length, lastInProgress: plan.at(-1)?.status === 'in_progress' };
}

function timeSignal({ limits, elapsed, steps }) {
  if (!limits) return signal('time', 'unknown', noLimits);
  const share = elapsed / limits.promptSeconds;
  const numbers = { elapsedSeconds: Math.round(elapsed), promptSeconds: limits.promptSeconds, share };
  const used = `${minutes(elapsed)} of ${minutes(limits.promptSeconds)} used`;
  if (share >= healthThresholds.timeOff && !steps?.lastInProgress) return signal('time', 'off_track', `${capital(used)}; the plan’s last step is not in progress`, numbers);
  if (share >= healthThresholds.timeWatch) return signal('time', 'watch', `${capital(used)}; the time limit is near`, numbers);
  return signal('time', 'ok', used, numbers);
}

function budgetSignal(run) {
  const cost = run.usage?.costUsd;
  const authorized = run.authorizedUsd;
  if (!['observed', 'provisional'].includes(run.costStatus) || !isAmount(cost)) return signal('budget', 'unknown', 'Its cost is not reported yet');
  if (!isAmount(authorized) || authorized <= 0) return signal('budget', 'unknown', 'Its authorized budget is not reported');
  const share = cost / authorized;
  const numbers = { costUsd: cost, authorizedUsd: authorized, share };
  const spent = `${money(cost)} of ${money(authorized)}`;
  if (share >= healthThresholds.budgetOff) return signal('budget', 'off_track', `${spent} spent (${percent(share)}); the budget runs out first`, numbers);
  if (share >= healthThresholds.budgetWatch) return signal('budget', 'watch', `${spent} spent (${percent(share)})`, numbers);
  return signal('budget', 'ok', spent, numbers);
}

function paceSignal({ limits, transcriptReason, steps, elapsed }) {
  if (!limits) return signal('pace', 'unknown', noLimits);
  if (transcriptReason) return signal('pace', 'unknown', transcriptReason);
  if (!steps) return signal('pace', 'unknown', 'The agent has no plan yet');
  const used = elapsed / limits.promptSeconds;
  const overrun = steps.progress > 0 ? used / steps.progress : Infinity;
  const numbers = { done: steps.done, total: steps.total, progress: steps.progress, used, overrun: Number.isFinite(overrun) ? overrun : null };
  const where = `Plan ${steps.done} of ${steps.total} at ${minutes(elapsed)} of ${minutes(limits.promptSeconds)}`;
  const why = Number.isFinite(overrun) ? `${where}: at this pace it needs about ${minutes(limits.promptSeconds * overrun)}` : `${where}: no step has started`;
  if (used >= healthThresholds.paceOffAfter && overrun >= healthThresholds.paceOffOverrun) return signal('pace', 'off_track', why, numbers);
  if (used >= healthThresholds.paceWatchAfter && overrun > 1) return signal('pace', 'watch', why, numbers);
  return signal('pace', 'ok', where, numbers);
}

function repeatSignal(items, transcriptReason) {
  if (transcriptReason) return signal('repeat', 'unknown', transcriptReason);
  const recent = items.filter(item => item.type === 'tool').slice(-healthThresholds.repeatWindow);
  const counts = new Map();
  for (const call of recent) {
    const input = String(call.input ?? '').trim();
    if (input) counts.set(input, (counts.get(input) ?? 0) + 1);
  }
  const most = Math.max(0, ...counts.values());
  const numbers = { repeats: most, window: healthThresholds.repeatWindow };
  const why = `The same call ran ${most} times in the last ${recent.length} calls`;
  if (most >= healthThresholds.repeatOff) return signal('repeat', 'off_track', why, numbers);
  if (most >= healthThresholds.repeatWatch) return signal('repeat', 'watch', why, numbers);
  return signal('repeat', 'ok', 'No call repeats', numbers);
}

function onTrackReason(signals, byId, lastActivity) {
  const pace = byId.pace.state === 'ok' ? byId.pace.reason : byId.time.state === 'ok' ? capital(byId.time.reason) : '';
  const quiet = byId.quiet.state === 'ok' ? byId.quiet.reason : lastActivity === null ? '' : `last activity ${minutes(lastActivity)} ago`;
  const facts = [pace, byId.budget.state === 'ok' ? byId.budget.reason : '', quiet].filter(Boolean);
  const unknown = [...new Set(signals.filter(each => each.state === 'unknown').map(each => each.reason))];
  return capital([...facts, ...unknown].join(' · ')) || 'No signal is off';
}

/**
 * The health of one running Run, from its own facts: the worst of the signals (tripwires, quiet, time, budget, pace,
 * repeat), then raised, never lowered, by a judge verdict. Only a running Run has a health; any other Run gives null,
 * so a Run a machine ended never counts against the one that runs. A Run without a plan in its first
 * `healthThresholds.notJudgedFor` seconds is Not judged yet unless a tripwire fired; a Run whose signals could all not
 * be judged is Not known. The judge only advises: it never stops, steers or grades a Run, a demo never has one, and
 * `{ refused: 'allowance' }` pauses it.
 * @param {object} input
 * @param {object} input.run The Ploeg Run: `state`, `startedAt`, `authorizedUsd`, `costStatus`, `usage.costUsd` and, when Ploeg sends it, `limits`.
 * @param {{ state: 'loaded'|'loading'|'demo'|'unsupported', items?: object[], asOf?: number }|null} [input.transcript] Folded items; `asOf` is set when the latest read failed and names the last good one.
 * @param {{ content: string, status: string }[]|null} [input.plan] The Run's latest plan.
 * @param {number} input.now Milliseconds since the epoch.
 * @param {{ promptSeconds: number, idleSeconds: number, promptStartedAt: string }|null} [input.limits] Proposed: Ploeg does not serve limits yet. Defaults to `run.limits`.
 * @param {object|null} [input.judge] The latest judge verdict for this Run, `{ refused: 'allowance' }`, or null when the judge is off.
 * @param {{ severity: 'high'|'medium', label: string, at: number|string }[]} [input.tripwires] The guard.js signals of this Run's calls.
 * @returns {{ health: string, label: string, tone: string, glyph: string, reason: string, deciding: string|null, signals: { id: string, state: 'ok'|'watch'|'off_track'|'unknown', reason: string, numbers: object }[], judge: { health: string, reason: string, evidence: number[], model: string, raised: boolean }|null, transcript: 'loaded'|'loading'|'demo'|'unsupported'|'none', stale: { asOf: number }|null }|null}
 */
export function runHealth({ run, transcript = null, plan = null, now, limits, judge = null, tripwires = [] }) {
  if (!run || run.state !== 'running') return null;
  const state = ['loaded', 'loading', 'demo', 'unsupported'].includes(transcript?.state) ? transcript.state : 'none';
  const asOf = state === 'loaded' && isAmount(transcript.asOf) && transcript.asOf < now ? transcript.asOf : null;
  const at = asOf ?? now;
  const items = state === 'loaded' ? (transcript.items ?? []).filter(item => toMs(item.at) === null || toMs(item.at) <= at) : [];
  const transcriptReason = state === 'loaded' ? null : transcriptWords[state];
  const known = limitsOf(limits === undefined ? run.limits : limits, run);
  const started = toMs(run.startedAt) ?? at;
  const elapsed = Math.max(0, (at - (known?.startedAt ?? started)) / 1000);
  const steps = state === 'loaded' ? planProgress(plan) : null;
  const newestItem = items.reduce((latest, item) => toMs(item.at) !== null && (!latest || toMs(item.at) >= toMs(latest.at)) ? item : latest, null);
  const waiting = newestItem?.type === 'tool' && !['completed', 'failed'].includes(newestItem.status);
  const signals = [
    tripwireSignal(tripwires, transcriptReason),
    quietSignal({ items, limits: known, transcriptReason, now: at, newest: newestItem ? toMs(newestItem.at) : null, running: waiting }),
    timeSignal({ limits: known, elapsed, steps }),
    budgetSignal(run),
    paceSignal({ limits: known, transcriptReason, steps, elapsed }),
    repeatSignal(items, transcriptReason),
  ];
  const byId = Object.fromEntries(signals.map(each => [each.id, each]));
  const worst = signals.reduce((best, each) => signalRank[each.state] > signalRank[best.state] ? each : best, signals[0]);
  const early = (at - started) / 1000 < healthThresholds.notJudgedFor && !steps && byId.tripwire.state !== 'off_track' && byId.tripwire.state !== 'watch';
  let health;
  let reason;
  let deciding = null;
  if (early) { health = 'not_judged'; reason = `Starting: health is shown once the agent has a plan or ${minutes(healthThresholds.notJudgedFor)} have passed`; }
  else if (worst.state === 'unknown') { health = 'not_known'; reason = [...new Set(signals.map(each => each.reason))].join('; '); }
  else if (worst.state === 'ok' && !progressSignals.some(id => byId[id].state === 'ok')) { health = 'not_known'; reason = `Nothing is off, but its progress cannot be judged: ${[...new Set(progressSignals.map(id => byId[id].reason))].join('; ')}`; }
  else if (worst.state === 'ok') { health = 'on_track'; reason = onTrackReason(signals, byId, state === 'loaded' ? Math.max(0, (at - (newestItem ? toMs(newestItem.at) : known?.startedAt ?? started)) / 1000) : null); }
  else { health = worst.state; reason = worst.reason; deciding = worst.id; }
  let verdict = null;
  if (state !== 'demo' && judge && judge.refused === 'allowance') reason = `${reason} · judge paused: this month’s allowance is spent`;
  else if (state !== 'demo') {
    const checked = judgeVerdict(judge);
    if (checked && (checked.runId === null || checked.runId === String(run.id ?? ''))) {
      const raised = checked.health !== 'on_track' && healthRank[checked.health] > healthRank[health];
      verdict = { health: checked.health, reason: checked.reason, evidence: checked.evidence, model: checked.model, raised };
      if (raised) health = checked.health;
    }
  }
  if (asOf !== null) reason = `${reason} · health as of ${minutes((now - asOf) / 1000)} ago`;
  if (state === 'demo') reason = `${reason} · demo data`;
  return { health, ...healthStates[health], reason, deciding, signals, judge: verdict, transcript: state, stale: asOf === null ? null : { asOf } };
}

/**
 * The health badge for a Run row: glyph and word in the health's tone, with an AI mark when a judge raised it. Empty
 * for a Run that has no health.
 * @param {ReturnType<typeof runHealth>} health
 * @returns {string}
 */
export function runHealthMarkup(health) {
  if (!health) return '';
  const raised = health.judge?.raised === true;
  const title = raised ? `${health.reason} · AI judge: ${health.judge.reason}` : health.reason;
  const ai = raised ? '<span class="run-health-ai" aria-hidden="true">AI</span><span class="sr-only">, raised by an AI judge</span>' : '';
  return `<span class="badge sm run-health is-${health.health}${health.stale ? ' is-stale' : ''}" data-tone="${health.tone}" title="${escape(title)}">${icon(health.glyph)}<span class="sr-only">Health: </span>${escape(health.label)}${ai}</span>`;
}

const stateWords = { ok: 'OK', watch: 'Watch', off_track: 'Off track', unknown: 'Not judged' };

/**
 * The reason line under a running Run: the numbers behind its health, the judge's line labelled AI when there is one,
 * and every signal in a disclosure. Empty for a Run that has no health.
 * @param {ReturnType<typeof runHealth>} health
 * @returns {string}
 */
export function runHealthReason(health) {
  if (!health) return '';
  const judge = health.judge;
  const judgeLine = judge ? `<span class="run-health-judge" data-tone="${healthStates[judge.health].tone}" title="${escape(judge.model)}"><span class="run-health-ai" aria-hidden="true">AI</span><span class="sr-only">AI judge, advisory: </span>${escape(judge.raised ? `Judge raised this to ${healthStates[judge.health].label.toLowerCase()}` : `Judge said ${healthStates[judge.health].label.toLowerCase()}; it never lowers the signals`)}: ${escape(judge.reason)}${judge.evidence.length ? ` (entries ${escape(judge.evidence.join(', '))})` : ''}</span>` : '';
  const rows = health.signals.map(each => {
    const name = healthSignals.find(entry => entry.id === each.id)?.label ?? each.id;
    return `<li class="run-health-signal is-${each.id}" data-state="${each.state}"><span class="run-health-signal-name">${escape(name)}</span> <span class="run-health-signal-state">${stateWords[each.state]}</span> <span class="run-health-signal-reason">${escape(each.reason)}</span></li>`;
  }).join('');
  return `<div class="run-health-detail"><p class="run-health-reason${health.stale ? ' is-stale' : ''}" data-tone="${health.tone}">${escape(health.reason)}${judgeLine}</p><details class="run-health-signals"><summary>How the health is judged</summary><ul class="run-health-signal-list">${rows}</ul></details></div>`;
}
