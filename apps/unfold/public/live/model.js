import { failureReason } from '../core/states.js';
import { guardSignals, policyDrift } from './guard.js';

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
 * The rules behind the health word, so a page can show why it says what it says and a test can pin each threshold.
 * `stalledAfter` is the silence in seconds before a running Run reads as stalled; `troubleWindow` is how far back
 * failed or interrupted calls count; `troubleCalls` is how many of them make a Run struggle; `moveGap` is the pause in
 * seconds that starts a new move when the transcript reports no stage.
 *
 * The first rule that matches sets the word: `suspect` when a call crossed a high tripwire or the Run's rules changed,
 * then `suspect` when the latest judge verdict is `abort`; `idle` when no Run works (`struggling` if the latest verdict
 * is `off_course`); `stalled` when the lease ran out; `struggling` when the latest verdict is `off_course`; `flying`
 * when the followed Run's transcript is not loaded, so silence is never claimed; `stalled` after `stalledAfter`
 * seconds without a call; `struggling` after `troubleCalls` failed or interrupted calls; otherwise `steady`. Judge
 * verdicts are proposed: Ploeg has no judge model yet.
 */
export const healthRules = Object.freeze({ stalledAfter: 300, troubleWindow: 600, troubleCalls: 2, moveGap: 120 });

/**
 * The verdicts a judge model can give a running Run, worst last. Proposed: Ploeg runs no judge model mid-Run yet; a
 * `run.judgement` event with detail `{ runId, verdict, reason, judge }` is the shape it would report.
 * @type {ReadonlyArray<string>}
 */
export const judgeVerdicts = Object.freeze(['on_course', 'drifting', 'off_course', 'abort']);

const toMs = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const isAmount = value => typeof value === 'number' && Number.isFinite(value);
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : '';
const byStart = (a, b) => (toMs(a.startedAt) ?? Infinity) - (toMs(b.startedAt) ?? Infinity) || Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id));
const interrupt = /^(c-c|ctrl[- ]?c|\^c)$|\b(interrupt|kill|sigint|sigterm|stuck|hung|hang)\b/i;
const providers = { vikunja: 'Vikunja', github: 'GitHub', forgejo: 'Forgejo', gitlab: 'GitLab', jira: 'Jira', linear: 'Linear', clickup: 'ClickUp', demo: 'Demo', manual: 'Manual' };

function runStatus(run) {
  if (run.state === 'pending') return 'pending';
  if (run.state === 'running') return 'running';
  if (run.outcome === 'cancelled') return 'cancelled';
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
 * Groups a Run's folded transcript into moves: a stage entry starts a named move, and without one a pause longer than
 * `healthRules.moveGap` does. Each move keeps its calls, how long it took, which kinds of call it made, and whether it
 * ran into trouble (a failed call, or a call that interrupts or kills something).
 * @param {object[]} items Folded transcript items, as `foldTranscript` returns them.
 * @param {{ now: number, live: boolean }} options
 * @returns {object[]}
 */
export function movesOf(items = [], { now, live }) {
  const moves = [];
  let move = null;
  let lastAt = null;
  let thought = '';
  const open = (title, at, named) => { move = { title, named, at, endAt: at, seconds: 0, calls: [], kinds: {}, trouble: false, failed: 0, thought: '', live: false }; moves.push(move); };
  for (const item of items) {
    const at = toMs(item.at);
    if (item.type === 'stage' || item.type === 'message') {
      if (item.text?.trim() && (item.type === 'stage' || !move || move.calls.length)) open(item.text.trim().split('\n')[0].slice(0, 140), at, true);
      continue;
    }
    if (item.type === 'thought') { thought = item.text?.replace(/^\*\*[^*]+\*\*:?\s*/, '').trim() ?? ''; continue; }
    if (item.type !== 'tool') continue;
    if (!move || (!move.named && lastAt !== null && at !== null && at - lastAt > healthRules.moveGap * 1000)) open(item.title || 'Tool call', at, false);
    const failed = item.status === 'failed';
    const interrupting = interrupt.test(String(item.input ?? '').trim()) || interrupt.test(item.title ?? '');
    move.calls.push({ id: item.id ?? item.key, at, title: item.title || 'Tool call', kind: item.toolKind || 'other', status: item.status ?? null, input: item.input ?? '', output: (item.outputs ?? []).join('\n').slice(0, 8000), paths: item.paths ?? [], failed, interrupting, thought });
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

function healthOf({ running, lastActivity, calls, now, leaseLeft, guard, judgement, known }) {
  const high = guard.signals.filter(signal => signal.severity === 'high');
  if (high.length || guard.drift?.length) return { word: 'suspect', tone: 'danger', reason: high.length ? `${high.length} ${high.length === 1 ? 'call' : 'calls'} crossed a tripwire: ${[...new Set(high.map(signal => signal.label.toLowerCase()))].join('; ')}.` : 'Its rules changed since the Run started.' };
  const judged = judgement ? `A judge model (proposed) said ${judgement.verdict.replace('_', ' ')}.${judgement.reason ? ` ${judgement.reason}` : ''}` : '';
  if (judgement?.verdict === 'abort') return { word: 'suspect', tone: 'danger', reason: judged };
  const offCourse = judgement?.verdict === 'off_course' ? { word: 'struggling', tone: 'attention', reason: judged } : null;
  if (!running) return offCourse ?? { word: 'idle', tone: 'neutral', reason: 'No Run is working right now.' };
  if (leaseLeft !== null && leaseLeft <= 0) return { word: 'stalled', tone: 'danger', reason: 'The worker’s lease ran out before it was renewed.' };
  if (offCourse) return offCourse;
  if (!known) return { word: 'flying', tone: 'live', reason: 'Its calls are not loaded yet.' };
  if (lastActivity !== null && (now - lastActivity) / 1000 >= healthRules.stalledAfter) return { word: 'stalled', tone: 'danger', reason: `No tool call for ${Math.floor((now - lastActivity) / 60000)} min.` };
  const recent = calls.filter(call => call.at !== null && (now - call.at) / 1000 <= healthRules.troubleWindow && (call.failed || call.interrupting));
  if (recent.length >= healthRules.troubleCalls) return { word: 'struggling', tone: 'attention', reason: `${recent.length} failed or interrupted calls in the last ${healthRules.troubleWindow / 60} min.` };
  return { word: 'steady', tone: 'success', reason: 'Calls keep coming and none failed recently.' };
}

/**
 * The judge verdicts in a Work Item's events, oldest first. Proposed: Ploeg reports no `run.judgement` events yet, so
 * every entry carries `proposed: true`. Unknown verdicts are dropped.
 * @param {object[]} events Ploeg audit events, `{ at, action, detail }`.
 * @returns {{ at: number|null, runId: string, verdict: string, reason: string, judge: string, proposed: true }[]}
 */
export function judgementsOf(events = []) {
  return events
    .filter(entry => entry?.action === 'run.judgement' && judgeVerdicts.includes(entry.detail?.verdict))
    .map(entry => ({ at: toMs(entry.at), runId: String(entry.detail.runId ?? ''), verdict: entry.detail.verdict, reason: typeof entry.detail.reason === 'string' ? entry.detail.reason.trim() : '', judge: typeof entry.detail.judge === 'string' && entry.detail.judge ? entry.detail.judge : 'Judge model', proposed: true }))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

function stageStates(item, runs, current) {
  const state = item.state;
  const hasRun = runs.length > 0;
  const pr = Boolean(item.pullRequest?.url) || runs.some(run => ['pr_opened', 'pr_updated'].includes(run.outcome));
  let at = 'wait';
  if (state === 'leased' || (hasRun && ['queued', 'ingested'].includes(state))) at = 'build';
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
 * what Ploeg did not report stays `null` and an estimate exists only when the caller passes one.
 *
 * Invariants the components rely on: `spend.usd` is the one spend figure, summed from reported Run costs, and
 * `spend.attemptUsd` is the part of it the latest attempt spent against `spend.heldUsd`; Runs a
 * machine ended count in `lost` and never as Role work; `time.agent = time.useful + time.lost`; attempts are numbered
 * from 1 in the order Ploeg opened them, and Runs are numbered from 1 inside each attempt.
 * @param {object} input
 * @param {object} input.detail A Ploeg Work Item detail: `{ item, shifts, runs, checkpoints, events }`.
 * @param {object[]} [input.transcript] The followed Run's folded transcript items.
 * @param {string} [input.transcriptRunId] Which Run the transcript belongs to; defaults to the running Run.
 * @param {number} input.now Milliseconds since the epoch.
 * @param {string} [input.ticketCreatedAt] When the tracker task was created, when it is older than the Work Item.
 * @param {{ text: string, source: string }} [input.estimate] A forecast for the pull request, shown only when given.
 * @param {{ leftUsd: number, totalUsd: number }} [input.allowance] The Team's Ask Allowance.
 * @param {string[]} [input.allowedHosts] Hosts the Run may reach; a call to any other host is a tripwire.
 * @param {{ startedWith: object, current: object }} [input.policy] Proposed: the Run's rules at its start and now.
 * @param {boolean} [input.transcriptKnown] Whether the followed Run's transcript was loaded. Defaults to true when
 * `transcript` has items. When false, call counts, edits and the last call are `null` and a running Run reads `flying`.
 * @returns {object}
 */
export function liveModel({ detail, transcript = [], transcriptRunId, now, ticketCreatedAt, estimate = null, allowance = null, allowedHosts = [], policy = null, transcriptKnown = transcript.length > 0 }) {
  const item = detail.item;
  const shifts = [...(detail.shifts ?? [])].sort((a, b) => (toMs(a.openedAt) ?? 0) - (toMs(b.openedAt) ?? 0));
  const runs = [...(detail.runs ?? [])].sort(byStart);
  const groups = new Map(shifts.map(shift => [shift.id, []]));
  for (const run of runs) {
    const key = attemptOf(run, shifts);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const attempts = [...groups.entries()].filter(([, members]) => members.length || shifts.length).map(([key, members], index) => {
    const shift = shifts.find(entry => entry.id === key) ?? null;
    const list = members.map((run, position) => {
      const failure = runFailure(run);
      const cost = isAmount(run.usage?.costUsd) ? run.usage.costUsd : null;
      return {
        id: String(run.id), n: position + 1, role: capital(run.role || 'agent'), writes: run.writes === true, state: run.state, status: runStatus(run), failure,
        machine: failure?.infra === true, startedAt: toMs(run.startedAt), finishedAt: run.state === 'running' ? null : toMs(run.finishedAt), seconds: runSeconds(run, now),
        costUsd: cost, costStatus: run.costStatus ?? 'unknown', tokensIn: isAmount(run.usage?.inputTokens) ? run.usage.inputTokens : null, tokensOut: isAmount(run.usage?.outputTokens) ? run.usage.outputTokens : null,
        authorizedUsd: isAmount(run.authorizedUsd) ? run.authorizedUsd : null, outcome: run.outcome, verdict: run.verdict || null,
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
  const edited = new Set(calls.filter(call => call.kind === 'edit' || call.kind === 'delete' || call.kind === 'move').flatMap(call => call.paths.length ? call.paths : [call.title]));
  const reported = allRuns.filter(run => run.costUsd !== null);
  const rounded = value => Math.round(value * 1e6) / 1e6;
  const spendUsd = rounded(reported.reduce((sum, run) => sum + run.costUsd, 0));
  const latest = attempts.at(-1) ?? null;
  const attemptUsd = rounded((latest?.runs ?? []).reduce((sum, run) => sum + (run.costUsd ?? 0), 0));
  const heldUsd = latest?.budgetUsd ?? running?.authorizedUsd ?? null;
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
  const judgements = judgementsOf(detail.events);
  const judgement = judgements.findLast(entry => !running || entry.runId === running.id) ?? null;
  const health = healthOf({ running: Boolean(running), lastActivity, calls, now, leaseLeft, guard, judgement, known });
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
    runs: allRuns,
    running,
    followed,
    roles,
    lost: { runs: allRuns.filter(run => run.machine).length, agentFailures: allRuns.filter(run => run.failure && !run.machine).length, seconds: lostSeconds },
    spend: { usd: reported.length ? spendUsd : null, attemptUsd: reported.length ? attemptUsd : null, status: !reported.length ? 'none' : settled ? 'settled' : 'observed', heldUsd, share: heldUsd ? Math.min(1, attemptUsd / heldUsd) : null, over: heldUsd !== null && attemptUsd > heldUsd, unreportedRuns: allRuns.length - reported.length },
    tokens: { in: tokenRuns ? tokensIn : null, out: tokenRuns ? tokensOut : null, unreportedRuns: allRuns.length - tokenRuns },
    time: { agent: agentSeconds, useful: agentSeconds - lostSeconds, lost: lostSeconds, waiting: origin !== null && firstStart !== null ? Math.max(0, (firstStart - origin) / 1000) : origin !== null && !allRuns.length ? Math.max(0, (now - origin) / 1000) : null, waitingFrom: toMs(ticketCreatedAt) !== null ? 'ticket' : 'work item', lead: origin !== null ? Math.max(0, (now - origin) / 1000) : null, run: running?.seconds ?? null },
    lease: item.lease ? { expiresAt: toMs(item.lease.expiresAt), renewedAt: toMs(item.lease.renewedAt), secondsLeft: leaseLeft } : null,
    moves,
    transcriptKnown: known,
    calls: { total: known ? calls.length : null, byKind, lastAt: lastActivity },
    edits: known ? edited.size : null,
    lastTrouble,
    health,
    guard,
    judgements,
    estimate: estimate && typeof estimate.text === 'string' && estimate.text ? estimate : null,
    allowance: allowance && isAmount(allowance.leftUsd) ? allowance : null,
    window: { start: windowStart, end: windowEnd },
  };
}
