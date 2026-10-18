import { money } from './format.js';
import { guardSignals, transcriptCalls } from './guard.js';

/** A Run is not judged in its first five minutes while it has no plan. */
export const startupSeconds = 300;
/** Quiet: time since the newest transcript entry, as a share of the idle limit. */
export const quietWatch = 0.5;
export const quietOffTrack = 0.8;
/** Pace: judged only after this share of the prompt limit, then Watch on any projected overrun. */
export const paceWatchAfter = 0.25;
/** Pace: Off track after this share of the prompt limit when the projection overruns by at least `paceOffTrackOverrun`. */
export const paceOffTrackAfter = 0.5;
export const paceOffTrackOverrun = 0.25;
/** Time: elapsed as a share of the prompt limit. */
export const timeWatch = 0.75;
export const timeOffTrack = 0.9;
/** Budget: observed spend as a share of the authorized budget, read only for these cost statuses. */
export const budgetWatch = 0.7;
export const budgetOffTrack = 0.9;
export const budgetStatuses = Object.freeze(['observed', 'provisional']);
/** Repeat: the same tool-call input this many times in the last `repeatWindow` tool calls. */
export const repeatWindow = 10;
export const repeatWatch = 3;
export const repeatOffTrack = 5;

/** Tripwire: a guard.js tripwire of this severity in the Run's calls makes it Watch or Off track. */
export const tripwireHealth = Object.freeze({ medium: 'watch', high: 'off_track' });

/** The signals, in the order a reason lists them; on a tie of the worst health the first one decides. */
export const healthSignals = Object.freeze(['tripwire', 'quiet', 'pace', 'time', 'budget', 'repeat']);

/** How each health reads: a label, an existing tone, a glyph and an example of its reason line. Never colour alone. */
export const healthStates = Object.freeze(Object.fromEntries(Object.entries({
  on_track: ['On track', 'success', 'check', 'Plan 3 of 6 at 38 of 90 min · US$0.31 of US$1.00 · last activity 20 s ago'],
  watch: ['Watch', 'attention', 'eye', 'A command has had no output for 6 min; the idle stop is at 10 min'],
  off_track: ['Off track', 'danger', 'alert', 'Plan 1 of 6 at 70 of 90 min: at this pace the time limit comes first'],
  not_yet: ['Not judged yet', 'neutral', 'minus', 'Starting: health is shown once the agent has a plan or 5 min have passed'],
  unknown: ['Not known', 'neutral', 'help-circle', 'Ploeg did not report this Run\'s limits'],
}).map(([key, [label, tone, glyph, example]]) => [key, Object.freeze({ key, label, tone, glyph, example })])));

/** The meta of a health key; anything else reads as Not known. */
export function healthMeta(key) { return healthStates[key] ?? healthStates.unknown; }

const rank = { on_track: 0, watch: 1, off_track: 2 };
const startedText = 'Starting: health is shown once the agent has a plan or 5 min have passed';
const noLimits = 'Ploeg did not report this Run\'s limits';
/** Why a transcript-dependent signal could not be judged, per transcript state. `loaded` judges them. */
export const transcriptStates = Object.freeze({ loaded: '', loading: 'Its transcript is still loading', demo: 'The demo records no transcripts', unsupported: 'This Ploeg does not report transcripts', failed: 'Its transcript could not be read' });
/** The signals that show progress: a Run is On track only when at least one of them was judged. */
export const progressSignals = Object.freeze(['quiet', 'time', 'pace']);
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : '';
const minutes = seconds => Math.round(seconds / 60);
const since = seconds => seconds < 60 ? `${Math.max(0, Math.round(seconds))} s` : `${minutes(seconds)} min`;
const time = value => { const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const signal = (key, health, reason) => ({ key, health, reason, judged: health !== 'unknown' });

/** The Run's limits when Ploeg reported usable ones: prompt and idle seconds and when the prompt started. */
export function runLimits(run) {
  const limits = run?.limits;
  const started = time(limits?.promptStartedAt);
  if (!limits || started === null) return null;
  return { promptSeconds: positive(limits.promptSeconds) ? limits.promptSeconds : null, idleSeconds: positive(limits.idleSeconds) ? limits.idleSeconds : null, startedAt: started };
}

/** The newest plan in transcript entries, as its steps, or null when the agent has none yet. */
export function latestPlan(entries) {
  for (let index = (entries ?? []).length - 1; index >= 0; index -= 1) if (entries[index]?.kind === 'plan' && Array.isArray(entries[index].plan)) return entries[index].plan;
  return null;
}

/** The last `repeatWindow` distinct tool calls in seq order, each with its first non-empty input. */
export function recentToolCalls(entries) {
  const calls = new Map();
  for (const entry of entries ?? []) {
    if (entry?.kind !== 'tool_call' || !entry.toolCallId) continue;
    const call = calls.get(entry.toolCallId) ?? { id: entry.toolCallId, seq: entry.seq, input: '' };
    if (!call.input && typeof entry.input === 'string' && entry.input.trim()) call.input = entry.input.trim();
    calls.set(entry.toolCallId, call);
  }
  return [...calls.values()].sort((a, b) => a.seq - b.seq).slice(-repeatWindow);
}

function planProgress(plan) {
  const done = plan.filter(step => step.status === 'completed').length;
  const working = plan.filter(step => step.status === 'in_progress').length;
  return { total: plan.length, done, progress: plan.length ? (done + working / 2) / plan.length : 0, lastWorking: plan.at(-1)?.status === 'in_progress' || plan.at(-1)?.status === 'completed' };
}

function quietSignal(entries, limits, now, state) {
  if (state !== 'loaded') return signal('quiet', 'unknown', transcriptStates[state]);
  if (!limits?.idleSeconds) return signal('quiet', 'unknown', noLimits);
  const newest = (entries ?? []).reduce((latest, entry) => Math.max(latest, time(entry?.at) ?? 0), limits.startedAt);
  const quiet = Math.max(0, (now - newest) / 1000);
  const share = quiet / limits.idleSeconds;
  const last = (entries ?? []).at(-1);
  const waiting = last?.kind === 'tool_call' && (last.status === 'in_progress' || last.status === 'pending');
  const said = `${waiting ? 'A command has had no output' : 'Nothing new'} for ${since(quiet)}; the idle stop is at ${since(limits.idleSeconds)}`;
  if (share >= quietOffTrack) return signal('quiet', 'off_track', said);
  if (share >= quietWatch) return signal('quiet', 'watch', said);
  return signal('quiet', 'on_track', `last activity ${since(quiet)} ago`);
}

function paceSignal(plan, limits, elapsed, state) {
  if (state !== 'loaded') return signal('pace', 'unknown', transcriptStates[state]);
  if (!limits?.promptSeconds) return signal('pace', 'unknown', noLimits);
  if (!plan?.length) return signal('pace', 'unknown', 'no plan yet');
  const { total, done, progress } = planProgress(plan);
  const used = elapsed / limits.promptSeconds;
  const overrun = progress > 0 ? used / progress - 1 : Number.POSITIVE_INFINITY;
  const head = `Plan ${done} of ${total} at ${minutes(elapsed)} of ${minutes(limits.promptSeconds)} min`;
  if (progress >= 1) return signal('pace', 'on_track', head);
  if (used >= paceOffTrackAfter && overrun >= paceOffTrackOverrun) return signal('pace', 'off_track', `${head}: at this pace the time limit comes first`);
  if (used >= paceWatchAfter && overrun > 0) return signal('pace', 'watch', `${head}: at this pace it runs past the time limit`);
  return signal('pace', 'on_track', head);
}

function timeSignal(plan, limits, elapsed) {
  if (!limits?.promptSeconds) return signal('time', 'unknown', noLimits);
  const used = elapsed / limits.promptSeconds;
  const said = `${minutes(elapsed)} of ${minutes(limits.promptSeconds)} min used`;
  const finishing = plan?.length ? planProgress(plan).lastWorking : false;
  if (used >= timeOffTrack && !finishing) return signal('time', 'off_track', `${said} and the plan's last step has not started`);
  if (used >= timeWatch) return signal('time', 'watch', said);
  return signal('time', 'on_track', `${minutes(elapsed)} of ${minutes(limits.promptSeconds)} min`);
}

function budgetSignal(run) {
  const spent = run?.usage?.costUsd;
  if (!budgetStatuses.includes(run?.costStatus) || typeof spent !== 'number' || !Number.isFinite(spent)) return signal('budget', 'unknown', 'Its cost is not reported yet');
  if (!positive(run.authorizedUsd)) return signal('budget', 'unknown', 'No authorized budget was reported');
  const share = spent / run.authorizedUsd;
  const said = `${money(spent)} of ${money(run.authorizedUsd)}`;
  if (share >= budgetOffTrack) return signal('budget', 'off_track', `${said} authorized spent (${Math.round(share * 100)} %)`);
  if (share >= budgetWatch) return signal('budget', 'watch', `${said} authorized spent (${Math.round(share * 100)} %)`);
  return signal('budget', 'on_track', said);
}

function repeatSignal(entries, state) {
  if (state !== 'loaded') return signal('repeat', 'unknown', transcriptStates[state]);
  const counts = new Map();
  for (const call of recentToolCalls(entries)) if (call.input) counts.set(call.input, (counts.get(call.input) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  const said = `The same command ran ${most} times in the last ${repeatWindow} tool calls`;
  if (most >= repeatOffTrack) return signal('repeat', 'off_track', said);
  if (most >= repeatWatch) return signal('repeat', 'watch', said);
  return signal('repeat', 'on_track', 'no repeated commands');
}

function tripwireSignal(entries, state, tripwires, allowedHosts, now) {
  if (state !== 'loaded') return signal('tripwire', 'unknown', transcriptStates[state]);
  const hits = (tripwires ?? guardSignals(transcriptCalls(entries), { allowedHosts })).filter(hit => Object.hasOwn(tripwireHealth, hit?.severity));
  if (!hits.length) return signal('tripwire', 'on_track', 'no tripwire crossed');
  const high = hits.filter(hit => hit.severity === 'high');
  const worst = (high.length ? high : hits).reduce((latest, hit) => (time(hit.at) ?? hit.at ?? 0) >= (time(latest.at) ?? latest.at ?? 0) ? hit : latest);
  const hitAt = time(worst.at) ?? (Number.isFinite(worst.at) ? worst.at : null);
  const ago = hitAt !== null && Number.isFinite(now) ? ` ${since(Math.max(0, (now - hitAt) / 1000))} ago` : '';
  const more = hits.length - 1;
  return signal('tripwire', tripwireHealth[worst.severity], `Tripwire${ago}: ${worst.label.toLowerCase()}${more ? ` (and ${more} more)` : ''}`);
}

function onTrackReason(signals) {
  const judged = key => signals.find(entry => entry.key === key && entry.judged);
  return [judged('pace') ?? judged('time'), judged('budget'), judged('quiet')].filter(Boolean).map(entry => entry.reason).join(' · ');
}

/**
 * The health of one Run at `now` (ms): On track, Watch, Off track, Not judged yet or Not known, with each signal's
 * verdict and the reason line of the deciding one. The worst judged signal wins. A Run is On track only when at least
 * one progress signal (`progressSignals`: Quiet, Time or Pace) was judged; Budget, Repeat and Tripwire alone can make
 * it Watch or Off track but never On track. Not known lists every distinct reason a signal could not be judged, once,
 * after "Nothing is off, but its progress cannot be judged: " when every judged signal was on track. In its first five
 * minutes without a plan a Run is Not judged yet unless a signal is already Off track. Tripwire reads the guard.js
 * tripwires in the transcript's calls (egress is checked only against an `allowedHosts` list), or `tripwires` when the caller kept
 * the hits of entries it no longer holds. `transcriptState` says whether the transcript was read (`loaded`), is
 * `loading`, is missing because of the `demo` or a Ploeg that does not report one (`unsupported`), or could not be
 * read (`failed`); the older `transcriptAvailable` false means `unsupported`. `stale` is the earlier result when the
 * facts could not be read again: it comes back unchanged, marked stale, and is never re-judged. A Run that is not
 * running has no health (null): its state badge or outcome speaks instead.
 * @param {{ run: object, entries?: object[], now: number, transcriptState?: 'loaded'|'loading'|'demo'|'unsupported'|'failed', transcriptAvailable?: boolean, stale?: object|null, tripwires?: object[]|null, allowedHosts?: string[] }} input
 */
export function runHealth({ run, entries = [], now, transcriptState, transcriptAvailable, stale = null, tripwires = null, allowedHosts = null }) {
  if (stale) return { ...stale, stale: true };
  if (run?.state !== 'running') return { health: null, signals: [], deciding: null, reason: '' };
  const state = Object.hasOwn(transcriptStates, transcriptState) ? transcriptState : transcriptAvailable === false ? 'unsupported' : 'loaded';
  const limits = runLimits(run);
  const started = limits?.startedAt ?? time(run?.startedAt);
  const elapsed = started === null ? 0 : Math.max(0, (now - started) / 1000);
  const plan = state === 'loaded' ? latestPlan(entries) : null;
  const signals = [tripwireSignal(entries, state, tripwires, allowedHosts, now), quietSignal(entries, limits, now, state), paceSignal(plan, limits, elapsed, state), timeSignal(plan, limits, elapsed), budgetSignal(run), repeatSignal(entries, state)];
  const judged = signals.filter(entry => entry.judged);
  const worst = judged.reduce((current, entry) => !current || rank[entry.health] > rank[current.health] ? entry : current, null);
  const startup = started !== null && elapsed < startupSeconds && !plan?.length;
  if (startup && worst?.health !== 'off_track') return { health: 'not_yet', signals, deciding: null, reason: startedText };
  const progress = judged.some(entry => progressSignals.includes(entry.key));
  if (!worst || (worst.health === 'on_track' && !progress)) {
    const missing = [...new Set(signals.filter(entry => !entry.judged).map(entry => capital(entry.reason)))].join('; ');
    const reason = worst ? `Nothing is off, but its progress cannot be judged: ${missing || 'no progress signal was judged'}` : missing;
    return { health: 'unknown', signals, deciding: null, reason };
  }
  if (worst.health === 'on_track') return { health: 'on_track', signals, deciding: null, reason: onTrackReason(signals) };
  return { health: worst.health, signals, deciding: worst.key, reason: capital(worst.reason) };
}

/**
 * The badge a person sees: the signals' health, raised but never lowered by a judge verdict. A judge never turns Not
 * known or Not judged yet into On track. `source` says which of the two decided.
 * @param {{ health: string }} signals
 * @param {{ health: string } | null} [judge]
 * @returns {{ health: string, source: 'signals' | 'judge' }}
 */
export function combineHealth(signals, judge) {
  const base = signals?.health ?? 'unknown';
  const verdict = judge?.health;
  if (!Object.hasOwn(rank, verdict) || verdict === 'on_track') return { health: base, source: 'signals' };
  const baseRank = Object.hasOwn(rank, base) ? rank[base] : -1;
  return rank[verdict] > baseRank ? { health: verdict, source: 'judge' } : { health: base, source: 'signals' };
}
