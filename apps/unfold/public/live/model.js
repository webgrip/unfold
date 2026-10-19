import { failureReason } from '../core/states.js';
import { combineHealth, healthMeta, runHealth } from '../core/run-health.js';
import { guardSignals, policyDrift } from '../core/guard.js';
import { tripwireChecks, tripwireHitScore, tripwireMaxScore } from '../core/tripwire.js';
import { activityOf, activityTime, moveActivities, tallyCalls } from '../core/activity.js';
import { runWork } from '../core/expectations.js';

/**
 * The stages every Work Item moves through, in order. The fold strip and the flight path draw one mark per stage.
 * @type {ReadonlyArray<{ id: string, label: string }>}
 */
export const stages = Object.freeze([
  Object.freeze({ id: 'ask', label: 'Ask' }),
  Object.freeze({ id: 'wait', label: 'Waited' }),
  Object.freeze({ id: 'build', label: 'Building' }),
  Object.freeze({ id: 'pr', label: 'Pull request' }),
  Object.freeze({ id: 'review', label: 'Your review' }),
  Object.freeze({ id: 'merge', label: 'Merge' }),
  Object.freeze({ id: 'production', label: 'Production' }),
]);

/**
 * The pause in seconds that starts a new move when the transcript reports no stage.
 */
export const moveRules = Object.freeze({ moveGap: 120 });

const toMs = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const isAmount = value => typeof value === 'number' && Number.isFinite(value);
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : '';
const byStart = (a, b) => (toMs(a.startedAt) ?? Infinity) - (toMs(b.startedAt) ?? Infinity) || Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id));
const interrupt = /^(c-c|ctrl[- ]?c|\^c)$|\b(interrupt|kill|sigint|sigterm|stuck|hung|hang)\b/i;
const providers = { vikunja: 'Vikunja', github: 'GitHub', forgejo: 'Forgejo', gitlab: 'GitLab', jira: 'Jira', linear: 'Linear', clickup: 'ClickUp', demo: 'Demo', manual: 'Manual' };

function runStatus(run) {
  if (run.state === 'pending') return 'pending';
  if (run.state === 'running') return 'running';
  if (run.outcome === 'cancelled' || (!run.startedAt && !run.outcome && !run.failureReason)) return 'cancelled';
  if (run.outcome === 'stuck' || run.failureReason === 'lease_lost') return 'stuck';
  if (run.outcome === 'failed' || run.failureReason) return 'failed';
  return 'done';
}

function runFailure(run) {
  if (!run.failureReason && run.outcome !== 'stuck') return null;
  const meta = failureReason(run.failureReason ?? 'lease_lost');
  return { key: run.failureReason ?? 'lease_lost', label: meta?.label ?? 'The Run failed', infra: meta?.infra === true };
}

function runSeconds(run, now) {
  const start = toMs(run.startedAt);
  if (start === null) return 0;
  const end = run.state === 'running' ? now : toMs(run.finishedAt) ?? start;
  return Math.max(0, (end - start) / 1000);
}

function attemptOf(run, shifts) {
  if (run.shiftId && shifts.some(shift => shift.id === run.shiftId)) return run.shiftId;
  const start = toMs(run.startedAt);
  const before = shifts.filter(shift => start === null || (toMs(shift.openedAt) ?? 0) <= start);
  return (before.at(-1) ?? shifts[0])?.id ?? 'implicit';
}

/**
 * Groups a Run's folded transcript into moves: a stage entry starts a named move, a change of Activity starts the next
 * one (a short interruption stays in its move, `activityRules`), and without either a pause longer than
 * `moveRules.moveGap` does. Each call carries its Activity and the rule that placed it (RFC-0009); each move keeps its
 * calls, its Activity, how long it took, which kinds of call it made, and whether it ran into trouble (a failed call,
 * or a call that interrupts or kills something).
 * @param {object[]} items Folded transcript items, as `foldTranscript` returns them.
 * @param {{ now: number, live: boolean }} options
 * @returns {object[]}
 */
export function movesOf(items = [], { now, live }) {
  const moves = [];
  let move = null;
  let lastAt = null;
  let thought = '';
  const tools = items.filter(item => item.type === 'tool').map(item => ({ item, at: toMs(item.at), ...activityOf({ kind: item.toolKind || 'other', input: item.input ?? '', title: item.title ?? '', paths: item.paths ?? [] }) }));
  const moveActivity = new Map(moveActivities(tools).map((activity, index) => [tools[index].item, activity]));
  const placed = new Map(tools.map(tool => [tool.item, tool]));
  const open = (title, at, named) => { move = { title, named, at, endAt: at, seconds: 0, calls: [], kinds: {}, activity: null, trouble: false, failed: 0, thought: '', live: false }; moves.push(move); };
  for (const item of items) {
    const at = toMs(item.at);
    if (item.type === 'stage' || item.type === 'message') {
      if (item.text?.trim() && (item.type === 'stage' || !move || move.calls.length)) open(item.text.trim().split('\n')[0].slice(0, 140), at, true);
      continue;
    }
    if (item.type === 'thought') { thought = item.text?.replace(/^\*\*[^*]+\*\*:?\s*/, '').trim() ?? ''; continue; }
    if (item.type !== 'tool') continue;
    const { activity, rule } = placed.get(item);
    const grouped = moveActivity.get(item);
    if (!move || (!move.named && lastAt !== null && at !== null && at - lastAt > moveRules.moveGap * 1000) || (move.calls.length && move.activity !== grouped)) open(item.title || 'Tool call', at, false);
    if (!move.calls.length) move.activity = grouped;
    const failed = item.status === 'failed';
    const interrupting = interrupt.test(String(item.input ?? '').trim()) || interrupt.test(item.title ?? '');
    move.calls.push({ id: item.id ?? item.key, at, title: item.title || 'Tool call', kind: item.toolKind || 'other', activity, rule, status: item.status ?? null, input: item.input ?? '', output: (item.outputs ?? []).join('\n').slice(0, 8000), paths: item.paths ?? [], failed, interrupting, thought });
    move.kinds[item.toolKind || 'other'] = (move.kinds[item.toolKind || 'other'] ?? 0) + 1;
    if (failed) move.failed += 1;
    if (failed || interrupting) move.trouble = true;
    if (thought && !move.thought) move.thought = thought;
    thought = '';
    if (at !== null) { move.endAt = at; lastAt = at; }
  }
  moves.forEach((entry, index) => {
    const next = moves[index + 1]?.at;
    const end = next ?? (live ? now : entry.endAt);
    entry.seconds = entry.at === null || end === null ? 0 : Math.max(0, (end - entry.at) / 1000);
  });
  if (live && moves.length) moves.at(-1).live = true;
  return moves;
}

const verdicts = new Set(['on_track', 'watch', 'off_track']);

function judgementOf(value) {
  if (!value || typeof value !== 'object' || !verdicts.has(value.health) || typeof value.reason !== 'string' || !value.reason.trim()) return null;
  if (!Array.isArray(value.evidence) || !value.evidence.every(seq => Number.isSafeInteger(seq))) return null;
  return { ...value, runId: String(value.runId ?? ''), at: toMs(value.at), reason: value.reason.trim(), model: typeof value.model === 'string' && value.model ? value.model : 'Judge model' };
}

const checkKeys = new Set(tripwireChecks.map(check => check.key));

function tripwireHitOf(value) {
  if (!value || typeof value !== 'object' || !checkKeys.has(value.check) || !Number.isSafeInteger(value.score) || value.score < tripwireHitScore || value.score > tripwireMaxScore) return null;
  return { id: String(value.id ?? ''), runId: String(value.runId ?? ''), at: toMs(value.at), check: value.check, score: value.score, excerpt: typeof value.excerpt === 'string' ? value.excerpt : '', decider: typeof value.decider?.name === 'string' ? value.decider.name : 'Decider', demo: value.demo === true };
}

function healthOf(result, judge, { stale = false, demo = false } = {}) {
  const combined = combineHealth({ health: result.health ?? 'unknown' }, judge);
  const meta = healthMeta(combined.health);
  return { health: combined.health, label: meta.label, tone: meta.tone, glyph: meta.glyph, source: combined.source, signalsHealth: result.health ?? 'unknown', reason: result.reason ?? '', deciding: result.deciding ?? null, signals: result.signals ?? [], judge: judge ?? null, stale: stale === true, demo: demo === true };
}

function stageStates(item, runs, current) {
  const state = item.state;
  const hasRun = runs.length > 0;
  const pr = Boolean(item.pullRequest?.url) || runs.some(run => ['pr_opened', 'pr_updated'].includes(run.outcome));
  const writing = runs.some(run => run.writes === true && ['pending', 'running'].includes(run.state));
  let at = 'wait';
  if (state === 'leased' || (hasRun && ['queued', 'ingested'].includes(state))) at = pr && !writing ? 'pr' : 'build';
  if (state === 'awaiting_review') at = 'review';
  if (state === 'needs_human') at = pr ? 'review' : hasRun ? 'build' : 'wait';
  if (state === 'done') at = 'production';
  if (state === 'stale' || state === 'withdrawn') at = hasRun ? 'build' : 'wait';
  const index = stages.findIndex(stage => stage.id === at);
  const stopped = state === 'stale' || state === 'withdrawn';
  return stages.map((stage, position) => {
    let status = position < index ? 'done' : position === index ? 'current' : 'next';
    if (state === 'done') status = stage.id === 'production' ? 'unknown' : 'done';
    if (stage.id === 'pr' && pr && status === 'next') status = 'done';
    const tone = status !== 'current' ? null : stopped ? 'severe' : state === 'needs_human' ? 'attention' : stage.id === 'review' ? 'review' : current ? 'live' : 'neutral';
    return { ...stage, status, tone, you: stage.id === 'review' };
  });
}

/**
 * Derives everything the live Work Item components draw from one Ploeg detail and, when a Run is being followed, its
 * folded transcript. It is pure: the same input and `now` always give the same model, and it never invents a number;
 * what Ploeg did not report stays `null` and an estimate exists only when the caller passes one (`landingEstimate`).
 *
 * Invariants the components rely on: `spend.usd` is the one spend figure, summed from reported Run costs, and
 * `spend.attemptUsd` is the part of it the latest attempt spent against its budget, `spend.budgetUsd`; Runs a
 * machine ended count in `lost` and never as Role work; `time.agent = time.useful + time.lost`; attempts are numbered
 * from 1 in the order Ploeg opened them, an attempt that closed before any of its Runs started is not one of them but
 * an entry of `unstarted`, and Runs are numbered from 1 inside each attempt; `health` is the running
 * Run's badge, the words its Run row shows (`healthMeta`), and null when no Run is working.
 * @param {object} input
 * @param {object} input.detail A Ploeg Work Item detail: `{ item, shifts, runs, checkpoints, events }`.
 * @param {object[]} [input.transcript] The followed Run's folded transcript items.
 * @param {object[]} [input.entries] The followed Run's raw transcript entries, which `runHealth` reads.
 * @param {string} [input.transcriptRunId] Which Run the transcript belongs to; defaults to the running Run.
 * @param {number} input.now Milliseconds since the epoch.
 * @param {string} [input.ticketCreatedAt] When the tracker task was created, when it is older than the Work Item.
 * @param {{ text: string, note?: string, source: string }} [input.estimate] A forecast for the pull request, shown only when
 *   given: `text` answers when to review, `note` is the short form on the flight path.
 * @param {{ leftUsd: number, totalUsd: number }} [input.allowance] The Team's Ask Allowance.
 * @param {string[]} [input.allowedHosts] Hosts the Run may reach; a call to any other host is a tripwire.
 * @param {{ startedWith: object, current: object }} [input.policy] Proposed: the Run's rules at its start and now.
 * @param {string|null} [input.transcriptMissing] Why the transcript is unavailable: `demo` or `unsupported`, as Unfold's
 *   transcript route says it, or `failed` when it could not be read; the view then says why instead of waiting for it.
 * @param {boolean} [input.transcriptKnown] Whether the followed Run's transcript was loaded. Defaults to true when
 * `transcript` has items. When false, call counts, edits and the last call are `null`.
 * @param {object[]} [input.judgements] AI judge verdicts as Unfold's shadow judge stores them (`RunJudgement`: `{ id,
 *   runId, at, health, reason, evidence, model, … }`). A verdict without a known health, a reason or whole-number
 *   evidence is dropped.
 * @param {object[]} [input.tripwire] Hits of Unfold's decider tripwire on the followed Run (`TripwireHit`: `{ id, runId,
 *   at, check, score, excerpt, decider, demo? }`). A hit on an unknown check or below 2 is dropped.
 * @param {{ data?: object }|null} [input.health] The running Run's entry from Unfold's health route, the same entry its
 *   Run row shows, so the two never disagree. Without one, the health is computed here with `runHealth` from `entries`
 *   and raised by the newest of `judgements` the way the server does.
 * @returns {object}
 */
export function liveModel({ detail, transcript = [], transcriptRunId, now, ticketCreatedAt, estimate = null, allowance = null, allowedHosts = null, policy = null, transcriptKnown = transcript.length > 0, transcriptMissing = null, entries = [], judgements: verdicts = [], tripwire: hits = [], health: given = null }) {
  const item = detail.item;
  const shifts = [...(detail.shifts ?? [])].sort((a, b) => (toMs(a.openedAt) ?? 0) - (toMs(b.openedAt) ?? 0));
  const runs = [...(detail.runs ?? [])].sort(byStart);
  const groups = new Map(shifts.map(shift => [shift.id, []]));
  for (const run of runs) {
    const key = attemptOf(run, shifts);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const unstarted = [];
  const attempts = [...groups.entries()].filter(([, members]) => members.length || shifts.length).flatMap(([key, members]) => {
    const shift = shifts.find(entry => entry.id === key) ?? null;
    if (shift?.closedAt && !members.some(run => run.startedAt)) {
      unstarted.push({ id: key, openedAt: toMs(shift.openedAt), closedAt: toMs(shift.closedAt), closeReason: shift.closeReason || '', budgetUsd: isAmount(shift.budgetUsd) ? shift.budgetUsd : null });
      return [];
    }
    return [[key, members, shift]];
  }).map(([key, members, shift], index) => {
    const list = members.map((run, position) => {
      const failure = runFailure(run);
      const cost = isAmount(run.usage?.costUsd) ? run.usage.costUsd : null;
      return {
        id: String(run.id), n: position + 1, role: capital(run.role || 'agent'), writes: run.writes === true, state: run.state, status: runStatus(run), failure,
        machine: failure?.infra === true, startedAt: toMs(run.startedAt), finishedAt: run.state === 'running' ? null : toMs(run.finishedAt), seconds: runSeconds(run, now),
        costUsd: cost, costStatus: run.costStatus ?? 'unknown', tokensIn: isAmount(run.usage?.inputTokens) ? run.usage.inputTokens : null, tokensOut: isAmount(run.usage?.outputTokens) ? run.usage.outputTokens : null,
        authorizedUsd: isAmount(run.authorizedUsd) ? run.authorizedUsd : null, outcome: run.outcome, verdict: run.verdict || null,
        said: String(run.solution || run.summary || '').split(/\n\s*\n/)[0].trim(),
      };
    });
    return { n: index + 1, id: key, openedAt: toMs(shift?.openedAt) ?? list[0]?.startedAt ?? null, closedAt: toMs(shift?.closedAt), closeReason: shift?.closeReason || '', budgetUsd: isAmount(shift?.budgetUsd) ? shift.budgetUsd : null, runs: list, lost: list.filter(run => run.machine).length };
  });
  const allRuns = attempts.flatMap(attempt => attempt.runs.map(run => ({ ...run, attempt: attempt.n })));
  const running = allRuns.findLast(run => run.state === 'running') ?? null;
  const followed = transcriptRunId ? allRuns.find(run => run.id === String(transcriptRunId)) ?? null : running;
  const moves = movesOf(transcript, { now, live: Boolean(followed && followed.state === 'running') });
  const calls = moves.flatMap(move => move.calls);
  const byKind = calls.reduce((total, call) => ({ ...total, [call.kind]: (total[call.kind] ?? 0) + 1 }), {});
  const split = activityTime(calls, followed ? followed.finishedAt ?? now : null);
  const edited = new Set(calls.filter(call => call.kind === 'edit' || call.kind === 'delete' || call.kind === 'move').flatMap(call => call.paths.length ? call.paths : [call.title]));
  const reported = allRuns.filter(run => run.costUsd !== null);
  const rounded = value => Math.round(value * 1e6) / 1e6;
  const spendUsd = rounded(reported.reduce((sum, run) => sum + run.costUsd, 0));
  const latest = attempts.at(-1) ?? null;
  const attemptUsd = rounded((latest?.runs ?? []).reduce((sum, run) => sum + (run.costUsd ?? 0), 0));
  const budgetUsd = latest?.budgetUsd ?? running?.authorizedUsd ?? null;
  const settled = reported.length > 0 && reported.every(run => run.costStatus === 'settled');
  const tokensIn = allRuns.reduce((sum, run) => sum + (run.tokensIn ?? 0), 0);
  const tokensOut = allRuns.reduce((sum, run) => sum + (run.tokensOut ?? 0), 0);
  const tokenRuns = allRuns.filter(run => run.tokensIn !== null || run.tokensOut !== null).length;
  const lostSeconds = allRuns.filter(run => run.machine).reduce((sum, run) => sum + run.seconds, 0);
  const agentSeconds = allRuns.reduce((sum, run) => sum + run.seconds, 0);
  const firstStart = allRuns.reduce((min, run) => run.startedAt !== null && (min === null || run.startedAt < min) ? run.startedAt : min, null);
  const origin = toMs(ticketCreatedAt) ?? toMs(item.createdAt);
  const leaseLeft = item.lease?.expiresAt ? Math.round((toMs(item.lease.expiresAt) - now) / 1000) : null;
  const known = transcriptKnown === true;
  const lastActivity = !known ? null : calls.length ? calls.at(-1).at : followed?.startedAt ?? null;
  const signals = guardSignals(calls, { allowedHosts });
  const guard = { signals, drift: policyDrift(policy), allowedHosts, high: signals.filter(signal => signal.severity === 'high').length, source: signals.find(signal => signal.rule === 'injection') ?? null };
  const served = given?.data?.health ? given.data : null;
  const history = served && Array.isArray(served.history) ? served.history : null;
  const judgements = (history ?? verdicts ?? []).map(judgementOf).filter(Boolean).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const transcriptState = known ? 'loaded' : ['demo', 'unsupported', 'failed'].includes(transcriptMissing) ? transcriptMissing : 'loading';
  const ownTranscript = Boolean(running && followed && followed.id === running.id);
  const runningRun = running ? runs.find(run => String(run.id) === running.id) : null;
  const latestJudge = running ? (served ? served.judge ?? null : judgements.findLast(entry => entry.runId === running.id) ?? null) : null;
  const localWork = followed ? runWork(item, runs.find(run => String(run.id) === followed.id) ?? null, tallyCalls(calls), null) : null;
  const health = !running ? null : served ? healthOf(served, latestJudge, { stale: served.stale, demo: served.demo }) : healthOf(runHealth({
    run: runningRun,
    entries: ownTranscript ? entries : [],
    now,
    transcriptState: ownTranscript ? transcriptState : 'loading',
    allowedHosts,
    work: ownTranscript && known ? localWork : null,
  }), latestJudge);
  const work = served?.work?.kind ? served.work : localWork ? (({ tally: _tally, ...rest }) => rest)(localWork) : null;
  const stageList = stageStates(item, runs, running);
  const roleWork = allRuns.filter(run => !run.machine);
  const roles = [...new Set(roleWork.map(run => run.role))].map(role => ({ role, runs: roleWork.filter(run => run.role === role).length }));
  const windowStart = attempts[0]?.openedAt ?? firstStart ?? now;
  const windowEnd = Math.max(now, ...allRuns.map(run => run.finishedAt ?? run.startedAt ?? 0));
  const lastTrouble = [...moves].reverse().find(move => move.trouble && !move.live) ?? null;
  return {
    id: String(item.id),
    ref: `${providers[item.provider] ?? capital(item.provider)} #${item.externalId}`,
    title: item.title,
    team: item.team,
    state: item.state,
    repo: item.target ? `${item.target.owner}/${item.target.repo}` : null,
    base: item.target?.baseBranch ?? null,
    branch: latest?.id && shifts.find(shift => shift.id === latest.id)?.branch || null,
    pullRequest: item.pullRequest?.url ? { url: item.pullRequest.url, number: item.pullRequest.number ?? null } : null,
    now,
    stages: stageList,
    stage: stageList.find(stage => stage.status === 'current')?.id ?? (item.state === 'done' ? 'production' : 'wait'),
    attempts,
    unstarted,
    runs: allRuns,
    running,
    followed,
    roles,
    lost: { runs: allRuns.filter(run => run.machine).length, agentFailures: allRuns.filter(run => run.failure && !run.machine).length, seconds: lostSeconds },
    spend: { usd: reported.length ? spendUsd : null, attemptUsd: reported.length ? attemptUsd : null, status: !reported.length ? 'none' : settled ? 'settled' : 'observed', budgetUsd, share: budgetUsd ? Math.min(1, attemptUsd / budgetUsd) : null, over: budgetUsd !== null && attemptUsd > budgetUsd, unreportedRuns: allRuns.length - reported.length },
    tokens: { in: tokenRuns ? tokensIn : null, out: tokenRuns ? tokensOut : null, unreportedRuns: allRuns.length - tokenRuns },
    time: { agent: agentSeconds, useful: agentSeconds - lostSeconds, lost: lostSeconds, waiting: origin !== null && firstStart !== null ? Math.max(0, (firstStart - origin) / 1000) : origin !== null && !allRuns.length ? Math.max(0, (now - origin) / 1000) : null, waitingFrom: toMs(ticketCreatedAt) !== null ? 'ticket' : 'work item', lead: origin !== null ? Math.max(0, (now - origin) / 1000) : null, run: running?.seconds ?? null },
    lease: item.lease ? { expiresAt: toMs(item.lease.expiresAt), renewedAt: toMs(item.lease.renewedAt), secondsLeft: leaseLeft } : null,
    moves,
    transcriptKnown: known,
    transcriptMissing: known ? null : transcriptState === 'demo' ? 'The demo records no transcripts, so its calls are not shown.' : transcriptState === 'unsupported' ? 'This Ploeg does not report transcripts, so its calls are not shown.' : transcriptState === 'failed' ? 'Its calls could not be read.' : running ? 'Loading its calls…' : null,
    calls: { total: known ? calls.length : null, byKind, lastAt: lastActivity },
    work,
    activity: known && calls.length ? { ...split, current: followed?.state === 'running' ? moves.findLast(entry => entry.calls.length)?.activity ?? null : null } : null,
    edits: known ? edited.size : null,
    lastTrouble,
    health,
    guard,
    judgements,
    tripwire: (hits ?? []).map(tripwireHitOf).filter(Boolean).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)),
    estimate: estimate && typeof estimate.text === 'string' && estimate.text ? estimate : null,
    allowance: allowance && isAmount(allowance.leftUsd) ? allowance : null,
    window: { start: windowStart, end: windowEnd },
  };
}
