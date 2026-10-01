import { escape, safeUrl } from './core/dom.js';
import { icon } from './core/icons.js';
import { markdown } from './core/markdown.js';
import { count as formatCount, money, plural, duration, dateTime } from './core/format.js';
import * as ui from './core/ui.js';
import { workItemState, runOutcome, runState, verdict as verdictMeta, failureReason, failureNote, auditEvent, actorName, displayState, unreportedOutcome, closeReasonLabel, withdrawnReason } from './core/states.js';
import { listReason, routingWarning, detailReason, requeueNote, needsYouBlocks, reasonGlyph } from './core/reasons.js';
import { checkoutTarget, checkoutCommand, checkoutLink } from './core/checkout.js';

/** The Work lanes in the order the lane control shows them: closest to shipping first. */
export const ploegLanes = Object.freeze([
  Object.freeze({ id: 'awaiting_review', label: 'Ready for review', tone: 'review' }),
  Object.freeze({ id: 'needs_human', label: 'Needs you', tone: 'attention' }),
  Object.freeze({ id: 'leased', label: 'Running' }),
  Object.freeze({ id: 'queued', label: 'Queued' }),
  Object.freeze({ id: 'all', label: 'All' }),
]);

const laneIds = ploegLanes.map(lane => lane.id);
const laneEmpty = {
  awaiting_review: ['pull-request', 'No pull requests wait for your review', 'When the agents finish a Work Item, its pull request shows up here.', 'neutral'],
  needs_human: ['check-circle', 'Nothing needs you', 'Ploeg is handling the work. When it stops and needs a person, the Work Item shows up here first.', 'success'],
  leased: ['circle-half', 'Nothing is running', 'Queued Work Items start when a worker of their Team is free.', 'neutral'],
  queued: ['circle-dashed', 'The queue is empty', 'Assign a task to a Team in your tracker and Ploeg queues it here.', 'neutral'],
  all: ['inbox', 'No Work Items yet', 'Assign a task to a Team in your tracker. It appears here when Ploeg picks it up.', 'neutral'],
};
const trackers = { vikunja: 'Vikunja', forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp' };
const cancellable = new Set(['ingested', 'queued', 'leased', 'awaiting_review', 'needs_human', 'stale']);
const stopped = new Set(['needs_human', 'stale', 'done', 'withdrawn']);
const instructionFiles = [['AGENTS.md', /\bAGENTS\.md\b/], ['CLAUDE.md', /\bCLAUDE\.md\b/], ['.claude/', /(^|[^\w.])\.claude\//], ['.agents/', /(^|[^\w.])\.agents\//], ['.openhands/', /(^|[^\w.])\.openhands\//], ['.mcp.json', /(^|[^\w.])\.mcp\.json\b/], ['.cursorrules', /(^|[^\w.])\.cursorrules\b/]];
const pullRequestPath = /\/(?:pulls?|merge_requests)\/(\d+)\/?$/;
const logLike = /\n|log tail|exit(?:ed)? (?:with )?(?:status|code)|traceback|stack trace|^\s*[[{$>#]/i;
const briefLimit = 900;
const visibleRuns = 8;
const visibleEvents = 8;

const byId = (a, b) => { try { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? -1 : x > y ? 1 : 0; } catch { return String(a.id).localeCompare(String(b.id)); } };
const newestFirst = (a, b) => byId(b, a);
const amount = value => typeof value === 'number' && Number.isFinite(value);
const seconds = (from, to) => { const start = Date.parse(from); const end = Date.parse(to); return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null; };
const moneyText = value => escape(money(value));
const repoName = target => target ? `${target.owner}/${target.repo}` : '';
const trackerName = provider => trackers[provider] || '';
const normalized = text => String(text ?? '').toLowerCase().replace(/^\s*illustrative[^:]*:\s*/, '').replace(/[“”"'’.,;:—–-]+/g, ' ').replace(/\s+/g, ' ').trim();
const overlaps = (a, b) => { const x = normalized(a); const y = normalized(b); if (x.length < 12 || y.length < 12) return false; return x.includes(y.slice(0, 40)) || y.includes(x.slice(0, 40)); };
const newTab = '<span class="sr-only"> (opens in a new tab)</span>';

/** The lane on screen: the chosen one, or Ready for review while it holds work, otherwise Needs you. */
export function activePloegLane(state) {
  if (state.ploegLane) return state.ploegLane;
  return state.ploeg?.lanes?.awaiting_review?.items.length ? 'awaiting_review' : 'needs_human';
}

/**
 * How a Work Item is referred to: the tracker key (`Vikunja #624`, `DEMO-8`), `From Run 53` for work an agent
 * created, or `#<id>` when nothing else is known.
 */
export function workItemRef(item) {
  const external = String(item?.externalId ?? '').trim();
  if (item?.provider === 'ploeg') { const run = /^run-(\d+)-\d+$/.exec(external); return run ? `From Run ${run[1]}` : `#${item.id}`; }
  if (!external) return `#${item?.id ?? ''}`;
  const name = trackerName(item?.provider);
  return name ? `${name} ${/^\d+$/.test(external) ? `#${external}` : external}` : external;
}

/**
 * Merges one `GET /api/ploeg?team=` response per Team into one overview for "All teams". `results` is
 * `[{ team, data } | { team, error }]`. Lanes hold every Team's loaded items in id order; `cursors` keeps each
 * Team's next page and `partial` says whether any Team has more. A Team that failed is listed in `errors`; the
 * overview is available while at least one Team answered.
 */
export function mergeOverviews(results) {
  const answered = results.filter(result => result.data?.available);
  const errors = results.filter(result => result.error || !result.data?.available).map(result => ({ team: result.team, message: result.error?.message || result.data?.message || 'Ploeg did not answer.' }));
  const first = answered[0]?.data || results.find(result => result.data)?.data;
  if (!answered.length) return { configured: first?.configured ?? true, available: false, demo: Boolean(first?.demo), teams: first?.teams || [], selectedTeam: '', allTeams: true, message: errors[0]?.message || 'Ploeg did not answer.', errors };
  const lanes = Object.fromEntries(laneIds.map(lane => {
    const cursors = {};
    const items = [];
    const seen = new Set();
    for (const { team, data } of answered) {
      const page = data.lanes?.[lane];
      if (!page) continue;
      if (page.nextCursor) cursors[team] = page.nextCursor;
      for (const item of page.items) if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
    }
    items.sort(byId);
    return [lane, { items, nextCursor: Object.values(cursors)[0] || null, cursors, partial: Object.keys(cursors).length > 0 }];
  }));
  const fetched = answered.map(result => Date.parse(result.data.fetchedAt)).filter(Number.isFinite);
  return { configured: true, available: true, demo: answered.some(result => result.data.demo), teams: first.teams, selectedTeam: '', allTeams: true, lanes, fetchedAt: fetched.length ? new Date(Math.min(...fetched)).toISOString() : undefined, trackerUrl: first.trackerUrl, message: first.message, errors };
}

/** Gives a single Team's overview the same lane shape as a merged one (`cursors`, `partial`). */
export function teamOverview(data) {
  if (!data?.available || !data.lanes) return { ...data, allTeams: false, errors: [] };
  const lanes = Object.fromEntries(Object.entries(data.lanes).map(([lane, page]) => [lane, { ...page, cursors: page.nextCursor ? { [data.selectedTeam]: page.nextCursor } : {}, partial: Boolean(page.nextCursor) }]));
  return { ...data, lanes, allTeams: false, errors: [] };
}

/**
 * Adds a loaded page of `team` to a lane: new items only, in id order, with that Team's next cursor. The lane
 * remembers in `more` which items each Team added through extra pages, so a refresh can keep them.
 */
export function appendPage(lanePage, team, page) {
  const seen = new Set(lanePage.items.map(item => item.id));
  const added = page.items.filter(item => !seen.has(item.id));
  const items = [...lanePage.items, ...added].sort(byId);
  const cursors = { ...lanePage.cursors };
  if (page.nextCursor) cursors[team] = page.nextCursor; else delete cursors[team];
  const more = { ...lanePage.more, [team]: [...(lanePage.more?.[team] || []), ...added.map(item => item.id)] };
  return { items, nextCursor: Object.values(cursors)[0] || null, cursors, partial: Object.keys(cursors).length > 0, more };
}

/**
 * Folds a fresh first-page overview into the one on screen, so a refresh never drops what Load more added. For a
 * lane that went past its first page, the fresh first page replaces the old one, the items from later pages stay,
 * and each extended Team keeps its deeper cursor (or none, when its pages ran out). Other lanes take the fresh page.
 */
export function refreshOverview(previous, fresh) {
  if (!previous?.available || !fresh?.available || !previous.lanes || !fresh.lanes) return fresh;
  const lanes = Object.fromEntries(Object.entries(fresh.lanes).map(([lane, page]) => {
    const old = previous.lanes[lane];
    const extended = Object.keys(old?.more || {}).filter(team => old.more[team].length);
    if (!extended.length) return [lane, page];
    const kept = new Set(extended.flatMap(team => old.more[team]));
    const seen = new Set(page.items.map(item => item.id));
    const items = [...page.items, ...old.items.filter(item => kept.has(item.id) && !seen.has(item.id))].sort(byId);
    const cursors = { ...page.cursors };
    for (const team of extended) { if (old.cursors?.[team]) cursors[team] = old.cursors[team]; else delete cursors[team]; }
    return [lane, { ...page, items, cursors, nextCursor: Object.values(cursors)[0] || null, partial: Object.keys(cursors).length > 0, more: old.more }];
  }));
  return { ...fresh, lanes };
}

function latestShift(detail) {
  return detail.shifts?.[0] || detail.item.latestShift || null;
}

function prLink(detail) {
  const runs = [...(detail.runs || [])].sort(newestFirst);
  const checkpoint = (detail.checkpoints || []).find(entry => safeUrl(entry.prUrl));
  const link = runs.flatMap(run => [...(run.links || [])].reverse()).find(entry => pullRequestPath.test(entry) && safeUrl(entry));
  return checkpoint?.prUrl || link || '';
}

/**
 * The review projection of a Work Item detail: the pull request, the branch, the latest Shift's Runs by Round,
 * the reviewer findings, the latest agent verdict, the Shift's spend and time, and instruction files named in the
 * findings (a text match, not a diff check). `lastReader` is the id and outcome of the latest reviewing Run.
 */
export function ploegReview(detail) {
  const shift = latestShift(detail);
  const shiftRuns = shift ? detail.runs.filter(run => run.shiftId === shift.id) : [];
  const runs = (shiftRuns.length ? shiftRuns : detail.runs).slice().sort((a, b) => a.round - b.round || byId(a, b));
  const checkpoint = detail.checkpoints.find(entry => entry.prUrl);
  const findings = runs.filter(run => !run.writes && run.findings.trim()).map(run => ({ runId: run.id, role: run.role, round: run.round, verdict: run.verdict, text: run.findings }));
  const flagged = instructionFiles.filter(([, pattern]) => findings.some(finding => pattern.test(finding.text))).map(([name]) => name);
  const lastReader = runs.filter(run => !run.writes && run.state === 'finished').at(-1) || null;
  const pullRequestUrl = prLink(detail);
  return {
    pullRequestUrl,
    pullRequestNumber: pullRequestPath.exec(pullRequestUrl)?.[1] || '',
    branch: shift?.branch || checkpoint?.branch || '',
    shift,
    closeReason: shift?.closeReason || '',
    closeMeaning: shift?.closeReason === 'review_approved' ? 'An agent reviewer approved. This is not a human review.' : shift?.closeReason ? closeReasonLabel(shift.closeReason) : '',
    runs: runs.map(run => ({ id: run.id, role: run.role, round: run.round, writes: run.writes, state: run.state, outcome: run.outcome || '', verdict: run.verdict })),
    findings,
    verdict: lastReader ? lastReader.verdict || '' : null,
    lastReader: lastReader ? { id: lastReader.id, outcome: lastReader.outcome || '' } : null,
    rounds: shift ? shift.round : Math.max(0, ...runs.map(run => run.round || 0)),
    seconds: shift ? seconds(shift.openedAt, shift.closedAt) : null,
    spend: shift ? { authorizedUsd: shift.budgetUsd, reservedUsd: shift.reservedUsd, settledUsd: shift.spentUsd } : null,
    instructionFiles: flagged,
    truncated: detail.truncated.runs || detail.truncated.shifts || detail.truncated.checkpoints,
  };
}

/**
 * What a reviewer wants to see on a Ready-for-review row, read from the Work Item detail: the pull request number
 * and the latest agent verdict (`''` for a reviewer without one, null when no reviewer ran), keyed to `updatedAt`.
 */
export function reviewFacts(detail) {
  const review = ploegReview(detail);
  return { updatedAt: detail.item.updatedAt, pullRequestNumber: review.pullRequestNumber, verdict: review.verdict };
}

/**
 * The Round ladder of a set of Runs: Roles as rows in the order they first ran, Rounds as columns, and per cell
 * the Runs of that Role in that Round (newest first; more than one means retries). Runs without a Round are left out.
 */
export function roundLadder(runs) {
  const ordered = (runs || []).filter(run => Number.isInteger(run.round) && run.round > 0).sort((a, b) => a.round - b.round || byId(a, b));
  const roles = [...new Set(ordered.map(run => run.role || 'agent'))];
  const rounds = ordered.length ? Array.from({ length: Math.max(...ordered.map(run => run.round)) }, (_, index) => index + 1) : [];
  const cells = Object.fromEntries(roles.map(role => [role, Object.fromEntries(rounds.map(round => [round, ordered.filter(run => (run.role || 'agent') === role && run.round === round).sort(newestFirst)]))]));
  const writes = Object.fromEntries(roles.map(role => [role, ordered.some(run => (run.role || 'agent') === role && run.writes)]));
  return { roles, rounds, cells, writes };
}

const failed = run => run.outcome === 'failed' || run.outcome === 'stuck' || Boolean(run.failureReason);

/** Orders Runs for the Runs list: failed and stuck Runs first, then running and pending ones, then the rest; newest first within each. */
export function runOrder(runs) {
  const rank = run => failed(run) ? 0 : run.state !== 'finished' ? 1 : 2;
  return [...(runs || [])].sort((a, b) => rank(a) - rank(b) || newestFirst(a, b));
}

/**
 * Groups Runs by Shift and Round for the Runs list: the current Shift's Rounds are labelled `Round N`, earlier
 * Shifts' `Earlier Shift · Round N`, and Runs without a Round form one unlabelled group. Groups holding a failed or stuck
 * Run come first, then the rest from the newest Round down; inside a group the order is `runOrder`.
 * @returns {{ key: string, label: string, failed: boolean, runs: object[] }[]}
 */
export function runGroups(runs, currentShiftId = null) {
  const groups = new Map();
  for (const run of runs || []) {
    const round = Number.isInteger(run.round) && run.round > 0 ? run.round : 0;
    const key = `${run.shiftId ?? ''}:${round}`;
    if (!groups.has(key)) groups.set(key, { key, shiftId: run.shiftId ?? null, round, runs: [] });
    groups.get(key).runs.push(run);
  }
  const current = shiftId => !shiftId || String(shiftId) === String(currentShiftId ?? shiftId);
  const shiftRank = group => current(group.shiftId) ? Number.MAX_SAFE_INTEGER : Number(group.shiftId) || 0;
  return [...groups.values()]
    .map(group => ({ key: group.key, label: group.round ? `${current(group.shiftId) ? '' : 'Earlier Shift · '}Round ${group.round}` : '', failed: group.runs.some(failed), shiftRank: shiftRank(group), round: group.round, runs: runOrder(group.runs) }))
    .sort((a, b) => Number(b.failed) - Number(a.failed) || b.shiftRank - a.shiftRank || b.round - a.round)
    .map(({ key, label, failed: hasFailure, runs: members }) => ({ key, label, failed: hasFailure, runs: members }));
}

/**
 * Numbers the attempts at one job: Runs of the same Shift, Round, Role and access, oldest first. Only jobs Ploeg ran
 * more than once get an entry. `machineFailures` counts the earlier attempts that failed for an infrastructure reason,
 * and `next` is the attempt that followed this one, if any.
 * @returns {Map<string, { attempt: number, total: number, machineFailures: number, next: number | null }>}
 */
export function runAttempts(runs) {
  const jobs = new Map();
  for (const run of runs || []) {
    if (!run.shiftId) continue;
    const key = `${run.shiftId}:${run.round ?? 0}:${run.role ?? ''}:${run.writes ? 'w' : 'r'}`;
    if (!jobs.has(key)) jobs.set(key, []);
    jobs.get(key).push(run);
  }
  const attempts = new Map();
  for (const job of jobs.values()) {
    if (job.length < 2) continue;
    const ordered = [...job].sort(byId);
    let machineFailures = 0;
    ordered.forEach((run, index) => {
      attempts.set(String(run.id), { attempt: index + 1, total: ordered.length, machineFailures, next: index + 1 < ordered.length ? index + 2 : null });
      if (failureReason(run.failureReason)?.infra) machineFailures += 1;
    });
  }
  return attempts;
}

/** The attempt label for a Run's header, for example `Attempt 3 of 3 · after 2 machine failures`; '' for a job that ran once. */
export function attemptLabel(attempt) {
  if (!attempt) return '';
  const after = attempt.machineFailures ? ` · after ${plural(attempt.machineFailures, 'machine failure')}` : '';
  return `Attempt ${attempt.attempt} of ${attempt.total}${after}`;
}

/** What a Run reported, as one state meta: the verdict of a reading Run, otherwise its outcome, otherwise its state. `label` is the short form and `title` the full one. */
export function runResult(run) {
  if (run.state !== 'finished') return run.state === 'running' ? runState('running') : { ...runState('pending'), label: 'Waiting for a worker' };
  if (!run.writes && run.verdict) { const meta = verdictMeta(run.verdict); return { ...meta, label: meta.short, title: meta.label }; }
  if (run.outcome) { const meta = runOutcome(run.outcome); return { ...meta, label: meta.short || meta.label, title: meta.label }; }
  if (run.failureReason) return { ...failureReason(run.failureReason), tone: 'danger' };
  return unreportedOutcome(run);
}

function runCost(run, demo) {
  if (demo) return '';
  if (run.costStatus === 'observed' && amount(run.usage?.costUsd)) return money(run.usage.costUsd);
  return 'Not reported';
}

function runSeconds(run, now) {
  if (run.state === 'running') return seconds(run.startedAt, new Date(now).toISOString());
  return seconds(run.startedAt, run.finishedAt);
}

/** A readable label for a Run link: the pull request, merge request, issue or commit it points at, otherwise its host. */
export function linkLabel(url) {
  const safe = safeUrl(url);
  if (!safe) return '';
  const path = new URL(safe).pathname;
  const pull = pullRequestPath.exec(path);
  if (pull) return `Pull request #${pull[1]}`;
  const issue = /\/issues\/(\d+)\/?$/.exec(path);
  if (issue) return `Issue #${issue[1]}`;
  if (/\/commits?\/[0-9a-f]{7,40}\/?$/i.test(path)) return `Commit ${path.split('/').filter(Boolean).at(-1).slice(0, 7)}`;
  return new URL(safe).host;
}

/**
 * Summarises Ploeg's answer to a cancel: `withdrawn`, `stoppedRuns`, `cancelledRuns` and `keysBlocked` as plain
 * lines, with a tone and glyph per line in `items`. A field Ploeg did not send (null) reads "not reported", never
 * zero. `keysBlocked: false` means money can still be spent until Ploeg's sweep blocks the keys, so the summary
 * takes the attention tone.
 */
export function cancelSummary(result) {
  if (result.demo) {
    const line = result.message || 'This is the demo. Nothing runs, so nothing was stopped.';
    return { tone: 'neutral', title: 'Nothing was cancelled', lines: [line], items: [{ text: line, tone: 'neutral', glyph: 'circle-dashed' }] };
  }
  const title = result.withdrawn === true ? 'Cancelled. Ploeg withdrew the Work Item.' : result.withdrawn === false ? `Nothing was running. The Work Item stays ${workItemState(result.state).label}.` : 'Ploeg answered, but did not say whether it withdrew the Work Item.';
  const counted = (value, noun) => value === null || value === undefined ? { text: `${noun}: not reported`, tone: 'neutral', glyph: 'circle-dashed' } : { text: `${noun}: ${value}`, tone: 'success', glyph: 'check' };
  const items = [counted(result.stoppedRuns, 'Runs stopped'), counted(result.cancelledRuns, 'Runs cancelled before they started')];
  items.push(result.keysBlocked === true ? { text: 'Model keys blocked.', tone: 'success', glyph: 'check' } : result.keysBlocked === false ? { text: 'Ploeg has not confirmed the model key block yet. Its sweep retries it.', tone: 'attention', glyph: 'alert' } : { text: 'Model key block: not reported.', tone: 'neutral', glyph: 'circle-dashed' });
  if (result.message) items.push({ text: result.message, tone: 'neutral', glyph: 'info' });
  const tone = result.keysBlocked === false ? 'attention' : result.withdrawn === true ? 'success' : 'neutral';
  return { tone, title, lines: items.map(entry => entry.text), items };
}

function stateGlyph(meta) {
  return meta.live ? '<span class="live-dot" aria-hidden="true"></span>' : icon(meta.glyph);
}

function spendMini(item, context) {
  const shift = item.latestShift;
  if (context.demo || !shift || !amount(shift.budgetUsd) || shift.budgetUsd <= 0) return '';
  const running = item.state === 'leased';
  if (!running && !(amount(shift.spentUsd) && shift.spentUsd > 0)) return '';
  const text = amount(shift.spentUsd) ? `<span class="num">${moneyText(shift.spentUsd)}</span> of <span class="num">${moneyText(shift.budgetUsd)}</span>` : `Not reported of <span class="num">${moneyText(shift.budgetUsd)}</span>`;
  return `<span class="work-row-spend"><span class="work-row-spend-text">${text}</span>${ui.meter({ settled: shift.spentUsd, reserved: shift.reservedUsd, authorized: shift.budgetUsd, size: 'sm', label: '' })}</span>`;
}

function reviewChip(item, facts) {
  const fact = facts?.[item.id]?.updatedAt === item.updatedAt ? facts[item.id] : null;
  const code = item.latestShift?.closeReason || item.closeReason || '';
  const verdict = fact ? fact.verdict : code === 'review_approved' ? 'approve' : undefined;
  const verdictText = verdict === 'approve' ? 'Agent approved' : verdict === 'request_changes' ? 'Agent asked for changes' : verdict === '' ? 'No agent verdict' : verdict === null ? 'No agent review' : code === 'plan_exhausted' ? 'No changes requested' : '';
  const pr = fact?.pullRequestNumber ? `PR #${fact.pullRequestNumber}` : '';
  const label = [pr, verdictText].filter(Boolean).join(' · ');
  if (!label) return '';
  const tone = verdict === 'approve' ? 'success' : verdict === 'request_changes' ? 'attention' : undefined;
  const title = verdict === undefined || verdict === null ? (verdictText === 'No changes requested' ? 'Every planned Round ran and no reviewer asked for more changes.' : undefined) : `${verdictMeta(verdict).label}. Agent review is evidence, not a human review.`;
  return ui.chip({ label, tone, icon: 'pull-request', title });
}

function laneHint(item, context) {
  if (item.state === 'awaiting_review' && context.lane === 'awaiting_review') return reviewChip(item, context.reviewFacts);
  if (item.state === 'queued' && item.nextEligibleAt && Date.parse(item.nextEligibleAt) > Date.now()) return ui.chip({ label: 'Retrying later', icon: 'clock', title: `Retrying after ${dateTime(item.nextEligibleAt)}` });
  return '';
}

function rowMeta(item, context) {
  const { allTeams, lane, grouped, demo } = context;
  const reason = listReason(item, { demo });
  const warning = routingWarning(item);
  const chips = [];
  if (lane === 'all') chips.push(`<span class="work-row-state"${reason ? ` title="${escape(`${reason.chip}: ${reason.sentence}`)}"` : ''}>${ui.stateBadge(workItemState(displayState(item)), reason ? { reason: reason.chip, reasonTone: reason.tone } : {})}</span>`);
  else if (reason && !grouped) chips.push(ui.chip({ label: reason.chip, tone: reason.tone, title: `${reason.sentence} ${reason.fix}` }));
  const hint = laneHint(item, context);
  if (hint) chips.push(hint);
  if (warning) chips.push(ui.chip({ label: warning.chip, tone: warning.tone, icon: warning.glyph, title: warning.sentence }));
  if (amount(item.infraFailures) && item.infraFailures > 0 && item.state !== 'needs_human') chips.push(ui.chip({ label: plural(item.infraFailures, 'infrastructure failure'), tone: 'severe', icon: 'zap' }));
  const facts = [`<span class="work-row-ref">${allTeams ? `${escape(item.team)} · ` : ''}${escape(workItemRef(item))}</span>`];
  if (item.target) facts.push(`<span class="work-row-repo">${icon('branch')}${escape(repoName(item.target))}</span>`);
  if (amount(item.attempts) && item.attempts > 0) facts.push(`<span class="work-row-attempts">${escape(plural(item.attempts, 'attempt'))}</span>`);
  if (item.latestShift) facts.push(`<span>Round ${escape(item.latestShift.round)}</span>`);
  return `${chips.length ? `<span class="work-row-chips">${chips.join('')}</span>` : ''}<span class="work-row-facts dots">${facts.join('')}</span>`;
}

function rowHref(item, { lane, team }) {
  const query = new URLSearchParams(Object.entries({ lane, team }).filter(([, value]) => value));
  return `#work/${encodeURIComponent(item.id)}${query.toString() ? `?${query}` : ''}`;
}

/** One Work Item row of the list: a glyph for its reason (or state), title, reason and warning chips (unless its group names the reason), reference, repository, counters, spend of budget when there is any, and age. */
export function workRow(item, context) {
  const meta = workItemState(displayState(item));
  const reason = listReason(item, { demo: context.demo });
  return `<li>${ui.listRow({
    href: rowHref(item, context),
    data: { workRow: true, id: item.id },
    selected: context.selectedId === item.id,
    tone: reason?.tone || meta.tone,
    lead: `<span title="${escape(reason ? reason.chip : meta.label)}">${reason ? icon(reasonGlyph(reason)) : stateGlyph(meta)}</span>`,
    title: item.title || `Work Item ${item.id}`,
    meta: rowMeta(item, context),
    trail: `${spendMini(item, context)}<span class="work-row-age"><span class="sr-only">Updated </span>${ui.timeAgo(item.updatedAt)}</span>`,
  })}</li>`;
}

/**
 * The Needs-you list in blocks, by the one rule Now uses too (`needsYouBlocks`): flat rows with their own reason
 * chip, then one group per reason that two or more Work Items share, the largest first.
 * @returns {{ key: string, reason: object, grouped: boolean, items: object[] }[]}
 */
export function reasonGroups(items, { demo = false } = {}) {
  return needsYouBlocks(items, { demo });
}

/**
 * The band that heads a group of Work Items sharing one reason, on Now and Work: a sunken strip with the reason as an
 * overline, a small count and the one fix that clears the group. `id` labels the group.
 */
export function reasonBand(reason, total, id, { fix = true } = {}) {
  return `<div class="reason-band" data-tone="${reason.tone}"><span class="reason-band-icon" aria-hidden="true">${icon(reasonGlyph(reason))}</span><h3 class="reason-band-title" id="${escape(id)}">${escape(reason.chip)}<span class="reason-band-count num"><span class="sr-only">, </span>${escape(total)}<span class="sr-only"> ${total === 1 ? 'Work Item' : 'Work Items'}</span></span></h3>${fix ? `<p class="reason-band-fix" title="${escape(reason.fix)}">${escape(reason.fix)}</p>` : ''}</div>`;
}

function needsMarkup(items, context) {
  const blocks = reasonGroups(items, { demo: context.demo });
  const flat = blocks.filter(block => !block.grouped).flatMap(block => block.items);
  const groups = blocks.filter(block => block.grouped);
  const rows = flat.length ? `<li class="work-flat"><ul class="list work-list-rows">${flat.map(item => workRow(item, context)).join('')}</ul></li>` : '';
  const banded = groups.map((group, index) => { const id = `work-group-${index + 1}`; return `<li class="work-group" role="group" aria-labelledby="${id}">${reasonBand(group.reason, group.items.length, id)}<ul class="list work-list-rows">${group.items.map(item => workRow(item, { ...context, grouped: true })).join('')}</ul></li>`; }).join('');
  return `<ul class="work-groups">${rows}${banded}</ul>`;
}

function laneCount(page, errors) {
  if (!page) return null;
  return page.partial || errors ? `${page.items.length}+` : page.items.length;
}

function teamControl(model) {
  const teams = model.teams || [];
  if (teams.length >= 2) {
    const options = [`<option value=""${model.team ? '' : ' selected'}>All teams</option>`, ...teams.map(team => `<option value="${escape(team)}"${team === model.team ? ' selected' : ''}>${escape(team)}</option>`)].join('');
    return `<label class="field inline work-team"><span class="field-label">Team</span><select id="ploeg-team">${options}</select></label>`;
  }
  if (teams.length === 1) return `<span class="work-team-single"><span class="field-label">Team</span><span class="chip">${escape(teams[0])}</span></span>`;
  if (!model.data) return `<label class="field inline work-team"><span class="field-label">Team</span><select id="ploeg-team-loading" disabled><option>${escape(model.team || 'All teams')}</option></select></label>`;
  return '';
}

function laneControl(model) {
  const lanes = model.data?.available ? model.data.lanes : null;
  const errors = Boolean(model.data?.errors?.length);
  const segments = ploegLanes.map(lane => {
    const total = laneCount(lanes?.[lane.id], errors);
    return `<button type="button" class="segment" data-action="ploeg-lane" data-id="${lane.id}" aria-pressed="${!model.lanePending && model.lane === lane.id}">${escape(lane.label)}${total === null ? '' : `<span class="count">${escape(total)}</span>`}</button>`;
  }).join('');
  return `<div class="segmented work-lanes" role="group" aria-label="Lane">${segments}</div>`;
}

/** The page-header Refresh button of Work, left out while Ploeg is unavailable (the page shows its own Try again). */
export function workRefreshButton(model) {
  if (model.data && !model.data.available) return '';
  const busy = model.loading || model.refreshing;
  return `<button type="button" class="button secondary icon-only work-refresh" data-action="ploeg-refresh" data-id="toolbar" aria-label="Refresh" title="Refresh"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')}</button>`;
}

function toolbarMarkup(model) {
  if (model.data && !model.data.available) return '';
  return `<div class="toolbar work-toolbar">${teamControl(model)}${laneControl(model)}</div>`;
}

function listMarkup(model) {
  const data = model.data;
  const lane = model.lane;
  const page = data.lanes?.[lane] || { items: [], partial: false };
  const context = { lane, team: model.team, allTeams: data.allTeams, selectedId: model.detailId, demo: data.demo, reviewFacts: model.reviewFacts };
  const label = ploegLanes.find(entry => entry.id === lane)?.label || 'Work';
  const heading = `<h2 class="sr-only" id="work-list-title">${escape(label)}${data.allTeams ? ', all teams' : data.selectedTeam ? `, team ${escape(data.selectedTeam)}` : ''}</h2>`;
  if (!page.items.length) {
    const [glyph, title, body, tone] = data.teams.length ? laneEmpty[lane] || laneEmpty.all : ['lock', 'No Teams for your account', 'Ask an administrator to give your account access to a Ploeg Team.', 'neutral'];
    return `<section class="card work-list" aria-labelledby="work-list-title">${heading}${ui.emptyState({ icon: glyph, title, body: `<p>${escape(body)}</p>`, tone })}</section>`;
  }
  const more = page.partial ? `<footer class="work-list-footer"><p class="meta">${data.allTeams ? 'Showing the loaded pages of each Team.' : 'Showing the loaded pages.'} Counts cover the loaded Work Items.</p><button type="button" class="button secondary sm" data-action="ploeg-more"${model.loadingMore ? ' aria-disabled="true" aria-busy="true"' : ''}>${model.loadingMore ? '<span class="spinner" aria-hidden="true"></span>' : icon('chevron-down')}<span class="button-label">Load more</span></button></footer>` : '';
  const rows = lane === 'needs_human'
    ? needsMarkup(page.items, context)
    : `<ul class="list work-list-rows">${page.items.map(item => workRow(item, context)).join('')}</ul>`;
  return `<section class="card flush work-list" aria-labelledby="work-list-title" aria-busy="${model.loading ? 'true' : 'false'}">${heading}${rows}${more}</section>`;
}

function partialNotice(data) {
  if (!data.errors?.length) return '';
  const names = data.errors.map(error => error.team).join(', ');
  const subject = data.errors.length === 1 ? `Team ${names}` : `Teams ${names}`;
  return ui.callout({ tone: 'attention', title: `Could not read ${subject}`, body: `<p>${escape(`${data.errors[0].message} The list and its counts leave out ${subject}.`)}</p>`, actions: '<button type="button" class="button secondary sm" data-action="ploeg-refresh" data-id="partial">Try again</button>' });
}

function unavailableMarkup(model) {
  const data = model.data;
  if (!data.configured) return ui.ploegUnconfigured();
  return `<div class="card">${ui.emptyState({ icon: 'x-circle', tone: 'danger', title: 'Could not load Work', body: `<p>${escape(data.message || 'Ploeg did not answer.')}</p>`, actions: '<button type="button" class="button secondary" data-action="ploeg-refresh" data-id="unavailable">Try again</button>' })}</div>`;
}

function listSkeleton() {
  return `<section class="card flush work-list work-list-loading" aria-busy="true" aria-label="Loading Work Items">${ui.skeleton({ rows: 6, variant: 'list' })}</section>`;
}

function linkButton({ href, label, glyph, variant = 'secondary', linkOut, size }) {
  return ui.button({ label, icon: glyph, variant, size, href, external: true, data: linkOut ? { linkOut } : {} });
}

function trackerTarget(item, model) {
  const task = safeUrl(item.url);
  const root = task ? '' : safeUrl(model.trackerUrl);
  const name = trackerName(item.provider);
  return { href: task || root, label: task || !root ? `Open the task in ${name || 'its tracker'}` : `Open ${name || 'the tracker'}` };
}

function ref(item) {
  const task = safeUrl(item.url);
  const text = escape(workItemRef(item));
  return task ? `<a class="work-inline-link" href="${escape(task)}" target="_blank" rel="noopener noreferrer" data-link-out="tracker" title="${escape(`Open the task in ${trackerName(item.provider) || 'its tracker'}`)}">${text}${icon('external')}${newTab}</a>` : `<span>${text}</span>`;
}

function headerMarkup(detail, model, reason) {
  const item = detail.item;
  const meta = workItemState(displayState(item, detail.events));
  const warning = routingWarning(item);
  const shift = latestShift(detail);
  const pr = safeUrl(prLink(detail));
  const facts = [];
  if (item.target) facts.push(`<span class="work-fact">${icon('branch')}<span>${escape(repoName(item.target))}${item.target.baseBranch ? ` <span class="subtle">→ ${escape(item.target.baseBranch)}</span>` : ''}</span></span>`);
  if (pr) facts.push(`<span class="work-fact"><a class="work-inline-link" href="${escape(pr)}" target="_blank" rel="noopener noreferrer" data-link-out="pr">${icon('pull-request')}${escape(linkLabel(pr))}${icon('external')}${newTab}</a></span>`);
  if (amount(item.attempts) && item.attempts > 0) facts.push(`<span class="work-fact">${escape(plural(item.attempts, 'attempt'))}</span>`);
  if (shift) facts.push(`<span class="work-fact">Round ${escape(shift.round)}</span>`);
  if (item.updatedAt) facts.push(`<span class="work-fact">Updated ${ui.timeAgo(item.updatedAt)}</span>`);
  const close = `<button type="button" class="button ghost icon-only sm work-close" data-action="ploeg-close" aria-label="Close work item details" title="Close">${icon('x')}</button>`;
  const tools = [`<button type="button" class="button ghost sm work-copy" data-action="work-copy-link" data-id="${escape(item.id)}">${icon('copy')}<span class="button-label">Copy link</span></button>`];
  const checkout = checkoutTarget(detail, model.card);
  if (checkout) tools.push(`<button type="button" class="button ghost sm work-checkout" data-action="work-checkout" title="${escape(`Check out ${checkout.branch}`)}">${icon('branch')}<span class="button-label">Check out branch</span></button>`);
  if (model.canCancel && cancellable.has(item.state)) tools.push(`<button type="button" class="button ghost sm work-cancel" data-action="work-cancel" data-id="${escape(item.id)}"${model.cancelBusy ? ' aria-disabled="true" aria-busy="true"' : ''}>${model.cancelBusy ? '<span class="spinner" aria-hidden="true"></span>' : icon('x-circle')}<span class="button-label">Cancel Work Item</span></button>`);
  return `<header class="work-detail-header"><div class="work-detail-bar"><p class="work-detail-ref overline"><span class="work-detail-kind">Work Item · </span>${escape(item.team)} · ${ref(item)}</p><div class="work-detail-tools">${tools.join('')}</div>${close}</div><h2 class="work-detail-title" id="ploeg-item-title" tabindex="-1">${escape(item.title || `Work Item ${item.id}`)}</h2><div class="work-detail-status">${ui.stateBadge(meta, reason ? { reason: reason.chip, reasonTone: reason.tone } : {})}${warning ? ui.chip({ label: warning.chip, tone: warning.tone, icon: warning.glyph, title: warning.sentence }) : ''}</div>${facts.length ? `<p class="work-detail-facts dots">${facts.join('')}</p>` : ''}</header>`;
}

/** The label of the list a Work Item page goes back to: its lane, or "All Work Items". */
export function laneBackLabel(lane) {
  return lane === 'all' ? 'All Work Items' : ploegLanes.find(entry => entry.id === lane)?.label || 'Work';
}

function quote(text, at, who = 'Ploeg') {
  return `<blockquote class="work-quote"><p>${escape(`“${text}”`)}</p><footer class="meta">${escape(who)}${at ? ` · ${ui.timeAgo(at)}` : ''}</footer></blockquote>`;
}

function runJump(run, label = 'Show this Run') {
  return `<button type="button" class="button ghost xs work-jump" data-action="work-run" data-id="${escape(run.id)}">${escape(label)}${icon('arrow')}</button>`;
}

function evidenceRuns(detail, reason) {
  if (reason.run) return [detail.runs.find(run => run.id === reason.run.id)].filter(Boolean);
  if (!['plan_exhausted', 'fix_round_cap_reached', 'pull_request_closed', 'budget_exhausted_before_fix_round'].includes(reason.code)) return [];
  const shift = latestShift(detail);
  const runs = (shift ? detail.runs.filter(run => run.shiftId === shift.id) : detail.runs).slice().sort(newestFirst);
  return [runs.find(run => run.writes), runs.find(run => !run.writes)].filter(Boolean);
}

function evidenceText(run, reason) {
  return reason.run && reason.run.id === run.id ? reason.run.text : run.stuckReason || run.summary || '';
}

function evidenceLine(run, reason) {
  const result = runResult(run);
  const text = evidenceText(run, reason);
  const failure = failureReason(run.failureReason);
  const when = run.finishedAt || run.startedAt;
  return `<li class="work-evidence" data-tone="${result.tone}"><span class="work-evidence-icon" aria-hidden="true">${icon(result.glyph || 'circle')}</span><div class="work-evidence-main"><p class="work-evidence-title"><strong>${escape(run.role || 'Agent')}</strong>${run.round ? ` · Round ${escape(run.round)}` : ''} · ${escape(result.title || result.label)}${failure && result.label !== failure.label ? ` · ${escape(failure.label)}` : ''}${when ? ` · ${ui.timeAgo(when)}` : ''}</p>${text ? `<p class="${logLike.test(text) ? 'work-evidence-text work-log' : 'work-evidence-text'}">${escape(text)}</p>` : ''}</div>${runJump(run)}</li>`;
}

function steps(entries) {
  return `<ol class="work-steps">${entries.map(entry => `<li><p>${entry.text}</p>${entry.actions.length ? `<div class="work-step-actions">${entry.actions.join('')}</div>` : ''}${entry.note ? `<p class="meta work-step-note">${entry.note}</p>` : ''}</li>`).join('')}</ol>`;
}

function whatYouCanDo(body) {
  return `<div class="work-decision-part"><h4 class="overline">What you can do</h4>${body}</div>`;
}

function lastReaderRun(detail) {
  const shift = latestShift(detail);
  return detail.runs.filter(run => !run.writes && run.state === 'finished' && (!shift || run.shiftId === shift.id)).sort((a, b) => (b.round || 0) - (a.round || 0) || newestFirst(a, b))[0] || null;
}

const reasonLinks = {
  fix_round_cap_reached: 'pr',
  pull_request_closed: 'pr',
  run_stuck: 'tracker',
  plan_exhausted: 'tracker',
};

/**
 * The actions of a Needs-you decision box, as numbered steps. Each link-out appears once, on the first step that
 * needs it, and exactly one control is primary: the pull request or tracker task that step points at. When Ploeg
 * reported no link, the primary control is shown disabled with the reason, so the page still says what to press.
 * `primary` is that control for the phone action bar, or '' when it is disabled.
 */
export function decisionPlan(detail, model, reason) {
  const item = detail.item;
  const warning = routingWarning(item);
  const pr = safeUrl(prLink(detail));
  const prNumber = pullRequestPath.exec(pr)?.[1] || '';
  const tracker = trackerTarget(item, model);
  const reader = lastReaderRun(detail);
  const used = new Set();
  let primary = null;
  const control = (kind, variant) => {
    if (used.has(kind)) return '';
    if (kind === 'pr' && !pr) return '';
    used.add(kind);
    const main = variant === 'primary' || (!primary && variant !== 'ghost');
    const html = kind === 'pr'
      ? linkButton({ href: pr, label: `Open pull request${prNumber ? ` #${prNumber}` : ''}`, glyph: 'pull-request', variant: main ? 'primary' : 'secondary', linkOut: 'pr' })
      : tracker.href ? linkButton({ href: tracker.href, label: tracker.label, glyph: 'external', variant: main ? 'primary' : 'secondary', linkOut: 'tracker' }) : '';
    if (main && html) primary = { kind, html };
    return html;
  };
  const prKind = reason.variant === 'changes_unresolved' || (reason.code === 'plan_exhausted' && !reason.variant && pr) ? 'pr' : reasonLinks[reason.code];
  const main = { text: escape(reason.fix), actions: [] };
  const requeue = { text: escape(reason.requeue), actions: [] };
  const entries = [];
  if (warning) entries.push({ text: escape(warning.fix), actions: [control('tracker')].filter(Boolean) });
  const trackerEntry = warning ? entries[0] : prKind === 'tracker' ? main : requeue;
  if (prKind) { const html = control(prKind); if (html) main.actions.push(html); }
  if ((reason.code === 'fix_round_cap_reached' || reason.variant === 'changes_unresolved') && reader) main.actions.push(runJump(reader, 'Read the reviewer’s findings').replace('button ghost xs', 'button ghost'));
  if (reason.code === 'unknown') main.actions.push('<button type="button" class="button ghost" data-action="work-section" data-id="work-activity">Read its history</button>');
  entries.push(main);
  const trackerHtml = control('tracker');
  if (trackerHtml) requeue.actions.push(trackerHtml);
  entries.push(requeue);
  if (!primary) {
    const key = String(item.externalId ?? '').trim();
    const where = trackerName(item.provider) || (item.provider === 'demo' ? 'the demo tracker' : 'its tracker');
    trackerEntry.actions.unshift(`<span class="work-find">Find <strong class="mono">${escape(key || `#${item.id}`)}</strong> in ${escape(where)}</span>`);
    if (key) trackerEntry.actions.splice(1, 0, ui.button({ label: `Copy ${key}`, icon: 'copy', variant: 'secondary', action: 'work-copy-ref', data: { value: key } }));
    trackerEntry.note = escape('Ploeg reported no link to this task, so Vloer cannot open it for you.');
  }
  return { entries, primary: primary?.html || '' };
}

function needsYouBox(detail, model, reason, plan) {
  const item = detail.item;
  const warning = routingWarning(item);
  const event = (detail.events || []).find(entry => entry.action === `work_item.${item.state}` && entry.detail?.reason);
  const evidence = evidenceRuns(detail, reason);
  const shift = latestShift(detail);
  const why = [`<p class="work-decision-sentence">${escape(reason.sentence)}</p>`];
  if (reason.headline && !evidence.some(run => overlaps(evidenceText(run, reason), reason.headline.split(' — ').at(-1)))) why.push(quote(reason.headline, event?.at));
  if (shift && ['budget_exhausted', 'budget_exhausted_before_fix_round'].includes(reason.code)) why.push(`<div class="work-decision-meter">${shiftMeter(shift, detail.demo)}</div>`);
  if (evidence.length) why.push(`<ul class="work-evidence-list" aria-label="Evidence">${evidence.map(run => evidenceLine(run, reason)).join('')}</ul>`);
  if (warning) why.push(`<div class="work-warning" data-tone="${warning.tone}">${icon(warning.glyph)}<p><strong>${escape(warning.chip)}.</strong> ${escape(warning.sentence)}</p></div>`);
  const body = `<div class="work-decision-part">${why.join('')}</div>${whatYouCanDo(`${steps(plan.entries)}<p class="meta">${escape(requeueNote)}</p>`)}`;
  return ui.card({ id: 'work-decision', region: true, title: 'Why this needs you', icon: reason.glyph, tone: reason.tone, level: 3, body });
}

function check(tone, glyph, title, detailText) {
  return { tone, html: `<li class="work-check" data-tone="${tone}"><span class="work-check-icon" aria-hidden="true">${icon(glyph)}</span><div class="work-check-main"><p class="work-check-title">${title}</p>${detailText ? `<p class="meta">${detailText}</p>` : ''}</div></li>` };
}

const checkRank = { danger: 0, attention: 0, neutral: 1, success: 2 };

function reviewPlan(detail) {
  const review = ploegReview(detail);
  const pr = safeUrl(review.pullRequestUrl);
  const label = `Open pull request${review.pullRequestNumber ? ` #${review.pullRequestNumber}` : ''}`;
  const primary = pr ? linkButton({ href: pr, label, glyph: 'pull-request', variant: 'primary', linkOut: 'pr' }) : '';
  const reader = review.findings.at(-1)?.runId || review.lastReader?.id;
  const findings = reader ? runJump({ id: reader }, review.findings.length ? 'Read the findings' : 'Show the review').replace('button ghost xs', 'button ghost') : '';
  return { review, primary, actions: [primary, findings].filter(Boolean) };
}

function reviewBox(detail, model, plan) {
  const item = detail.item;
  const { review } = plan;
  const demo = detail.demo;
  const verdict = review.verdict === null ? null : verdictMeta(review.verdict);
  const spent = review.spend;
  const receipt = ui.dl([
    ['Agent review', verdict ? ui.badge({ tone: verdict.tone, glyph: verdict.glyph, label: verdict.short, title: verdict.label, size: 'sm' }) : '<span class="subtle">No reviewer ran</span>'],
    ['Findings', `<span class="num">${escape(review.findings.length)}</span>`],
    ['Rounds', review.rounds ? `<span class="num">${escape(review.rounds)}</span>` : null],
    ['Time', review.seconds !== null ? `<span class="num">${escape(duration(review.seconds))}</span>` : null],
    ['Branch', review.branch ? `<span class="mono">${escape(review.branch)}</span>` : null],
    ['Spend', spent ? ui.meter({ settled: spent.settledUsd, reserved: spent.reservedUsd, authorized: spent.authorizedUsd, demo, label: '', size: 'sm' }) : '<span class="subtle">No Shift recorded</span>'],
  ]);
  const checks = [];
  const pr = safeUrl(review.pullRequestUrl);
  checks.push(pr ? check('success', 'check-circle', `Pull request${review.pullRequestNumber ? ` #${escape(review.pullRequestNumber)}` : ''} reported by the writer`, item.target ? `${escape(repoName(item.target))}${review.branch ? ` · <span class="mono">${escape(review.branch)}</span>` : ''}` : '') : check('attention', 'alert', 'No pull request link reported', review.branch ? `Find it on the forge by its branch <span class="mono">${escape(review.branch)}</span>.` : 'Find it on the forge.'));
  if (verdict?.key === 'approve') checks.push(check('success', 'check-circle', 'The agent reviewer approved', 'Agent review is evidence, not a human review.'));
  else if (verdict?.key === 'request_changes') checks.push(check('attention', 'alert', 'The agent reviewer asked for changes', 'Read the findings before you merge.'));
  else if (verdict) checks.push(check('neutral', 'circle-dashed', 'No agent verdict', review.lastReader?.outcome === 'no_change_needed' ? 'The reviewer reported no change needed but gave no verdict.' : review.findings.length ? 'The reviewer left findings but gave no verdict.' : 'The reviewer gave no verdict.'));
  else checks.push(check('neutral', 'circle-dashed', 'No agent review', 'No reviewer ran in this Shift.'));
  if (demo) checks.push(check('neutral', 'circle-dashed', 'Spend: demo', 'No model calls, so nothing was spent.'));
  else if (!spent || !amount(spent.settledUsd)) checks.push(check('neutral', 'circle-dashed', 'Spend not reported', 'Ploeg has not settled the spend of this Shift.'));
  else if (spent.settledUsd <= spent.authorizedUsd) checks.push(check('success', 'check-circle', `Within its ${moneyText(spent.authorizedUsd)} budget`, `${moneyText(spent.settledUsd)} settled.`));
  else checks.push(check('danger', 'x-circle', `Over its ${moneyText(spent.authorizedUsd)} budget`, `${moneyText(spent.settledUsd)} settled.`));
  checks.push(check('neutral', 'circle-dashed', 'CI checks: not reported', 'Vloer does not read CI. Check them on the pull request.'));
  const files = review.instructionFiles;
  if (files.length) checks.push(check('attention', 'alert', files.length === 1 ? 'Findings name an instruction file' : 'Findings name instruction files', `${files.map(name => `<code>${escape(name)}</code>`).join(' ')} ${files.length === 1 ? 'is' : 'are'} named in the findings. Check ${files.length === 1 ? 'it' : 'them'} in the diff before you merge.`));
  checks.push(safeUrl(item.url) ? check('success', 'check-circle', `Linked to its ${escape(trackerName(item.provider) || 'tracker')} task`, '') : check('neutral', 'circle-dashed', 'No tracker link reported', ''));
  const ordered = checks.map((entry, index) => ({ ...entry, index })).sort((a, b) => checkRank[a.tone] - checkRank[b.tone] || a.index - b.index);
  const forge = ui.dl([
    ['Merge', 'Ploeg marks the Work Item Done.'],
    ['Request changes', 'Ploeg queues a fix Round for the same Team, on the same branch.'],
    ['Close without merging', 'The Work Item comes back to you as Needs you.'],
  ], { rows: true });
  const truncated = review.truncated ? '<p class="meta">Ploeg capped this history. Earlier records may be missing.</p>' : '';
  const actions = plan.actions.length ? `<div class="work-decision-actions">${plan.actions.join('')}</div>` : '';
  const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(pr ? 'The agents are done. Read the pull request and decide on the forge; Vloer does not merge.' : 'The agents are done, but Ploeg reported no pull request link.')}</p><div class="work-receipt">${receipt}</div>${truncated}</div><div class="work-decision-part"><h4 class="overline">Before you merge</h4><ul class="work-checklist">${ordered.map(entry => entry.html).join('')}</ul>${actions}</div><div class="work-decision-part"><h4 class="overline">On the forge</h4>${forge}</div>`;
  return ui.card({ id: 'work-decision', region: true, title: 'Ready for your review', icon: 'pull-request', tone: 'review', level: 3, body });
}

function statusBox(detail, model) {
  const item = detail.item;
  const shift = latestShift(detail);
  const running = detail.runs.filter(run => run.state !== 'finished');
  if (item.state === 'leased') {
    const lines = running.length ? running.map(run => `<li class="work-evidence" data-tone="live"><span class="work-evidence-icon" aria-hidden="true"><span class="live-dot"></span></span><div class="work-evidence-main"><p class="work-evidence-title"><strong>${escape(run.role || 'Agent')}</strong>${run.round ? ` · Round ${escape(run.round)}` : ''} · ${escape(run.state === 'running' ? `running${run.startedAt ? ` for ${duration(runSeconds(run, model.now)) || 'a moment'}` : ''}` : 'waiting for a worker')}</p></div>${runJump(run)}</li>`).join('') : '';
    const lease = item.lease?.renewedAt ? `<p class="meta">The worker last checked in ${ui.timeAgo(item.lease.renewedAt)}.</p>` : '';
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(shift ? `Round ${shift.round} is running.` : 'An agent is working on it.')}</p>${lines ? `<ul class="work-evidence-list">${lines}</ul>` : ''}${lease}</div>${whatYouCanDo(`<p>${escape('Nothing is needed now. This page refreshes itself while live updates are on.')}${model.canCancel ? ` ${escape('Cancel the Work Item to stop its Runs.')}` : ''}</p>`)}`;
    return ui.card({ id: 'work-decision', region: true, title: 'Running now', icon: 'activity', tone: 'live', level: 3, body });
  }
  if (item.state === 'queued' || item.state === 'ingested') {
    const later = item.nextEligibleAt && Date.parse(item.nextEligibleAt) > model.now ? `<p>${escape('Ploeg retries it after')} ${ui.timeAt(item.nextEligibleAt)} ${escape('(infrastructure backoff).')}</p>` : '';
    const infra = amount(item.infraFailures) && item.infraFailures > 0 ? `<p>${escape(`${plural(item.infraFailures, 'infrastructure failure')} so far. These do not count against the agent’s attempts.`)}</p>` : '';
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(item.state === 'ingested' ? 'Ploeg recorded the task and has not queued it yet.' : 'It starts when a worker of the Team is free. The tracker sets its priority.')}</p>${later}${infra}</div>${whatYouCanDo(`<p>${escape('Nothing is needed now. To change its priority, change it in the tracker; Vloer never re-ranks work.')}</p>`)}`;
    return ui.card({ id: 'work-decision', region: true, title: 'Waiting to start', icon: 'circle-dashed', level: 3, body });
  }
  if (item.state === 'done' && displayState(item, detail.events) === 'rejected') {
    const rejected = detail.events.find(entry => entry.action === 'work_item.rejected');
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape('A person rejected this proposal, so it never ran and spent nothing. Ploeg keeps it as Done.')}</p>${rejected?.detail?.reason ? quote(rejected.detail.reason, rejected.at, 'The reason given') : ''}</div>`;
    return ui.card({ id: 'work-decision', region: true, title: 'Rejected', icon: 'circle-slash', level: 3, body });
  }
  if (item.state === 'done') {
    const done = detail.events.find(entry => entry.action === 'work_item.done');
    const sentence = done?.detail?.reason === 'pull request merged' ? 'The pull request was merged.' : shift?.closeReason ? `${closeReasonLabel(shift.closeReason)}.` : 'Ploeg finished this Work Item.';
    return ui.card({ id: 'work-decision', region: true, title: 'Done', icon: 'check-circle', tone: 'success', level: 3, body: `<div class="work-decision-part"><p class="work-decision-sentence">${escape(sentence)}</p></div>` });
  }
  if (item.state === 'withdrawn') {
    const event = detail.events.find(entry => entry.action === 'work_item.withdrawn');
    const sentence = withdrawnReason(event?.detail?.reason) || withdrawnReason(shift?.closeReason) || 'A person took the work back.';
    const tracker = trackerTarget(item, model);
    const link = tracker.href ? `<div class="work-decision-actions">${linkButton({ href: tracker.href, label: tracker.label, glyph: 'external', linkOut: 'tracker' })}</div>` : '';
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(sentence)}</p></div>${whatYouCanDo(`<p>${escape(`To start again, assign the task to the Team in ${trackerName(item.provider) || 'its tracker'}.`)}</p>${link}`)}`;
    return ui.card({ id: 'work-decision', region: true, title: 'Withdrawn', icon: 'circle-slash', level: 3, body });
  }
  if (item.state === 'proposed') {
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape('An agent proposed this work. Nothing runs until a person approves it.')}</p></div>${whatYouCanDo(`<div class="work-decision-actions">${ui.button({ label: 'Approve or reject it on Proposed', icon: 'proposed', variant: 'primary', href: '#proposed' })}</div>`)}`;
    return ui.card({ id: 'work-decision', region: true, title: 'Waiting for your approval', icon: 'proposed', level: 3, body });
  }
  return '';
}

/**
 * The writer's account of the Work Item's change: the problem and solution of the newest writing Run that reported
 * either, from the latest Shift when one there did. `earlierShift` marks an account carried over from an older Shift.
 * Null when no writer reported one.
 */
export function writerAccount(detail) {
  const text = value => String(value ?? '').trim();
  const reported = (detail.runs || []).filter(run => run.writes && (text(run.problem) || text(run.solution))).sort(newestFirst);
  const shift = latestShift(detail);
  const run = reported.find(entry => shift && entry.shiftId === shift.id) || reported[0];
  if (!run) return null;
  return { runId: run.id, role: run.role || '', round: run.round || 0, at: run.finishedAt || run.startedAt || '', problem: text(run.problem), solution: text(run.solution), earlierShift: Boolean(shift && run.shiftId !== shift.id) };
}

function accountMarkup(detail) {
  const account = writerAccount(detail);
  if (!account) return '';
  const side = (key, index, heading, text) => `<div class="work-account-side" data-side="${key}"><h4 class="work-account-label"><span class="work-account-index" aria-hidden="true">${index}</span>${heading}</h4>${text ? `<div class="prose work-account-text">${markdown(text, { baseLevel: 5 })}</div>` : `<p class="work-account-missing">${escape('Not reported.')}</p>`}</div>`;
  const source = [account.role || 'writer', account.round ? `Round ${account.round}` : '', account.earlierShift ? 'earlier Shift' : ''].filter(Boolean).map(part => `<span>${escape(part)}</span>`);
  if (account.at) source.push(ui.timeAgo(account.at));
  const number = ploegReview(detail).pullRequestNumber;
  const foot = `<footer class="work-account-foot"><p class="work-account-source"><span class="work-account-source-label">Written by</span>${source.join('')}</p><p class="work-account-caveat">${escape(`The agent’s own account: verify it against ${number ? `pull request #${number}` : 'the pull request'}.`)}</p>${runJump({ id: account.runId })}</footer>`;
  return `<section class="work-account" id="work-account" aria-labelledby="work-account-title"><h3 class="sr-only" id="work-account-title">Problem and solution</h3><div class="work-account-grid">${side('problem', '01', 'Problem', account.problem)}<span class="work-account-arrow" aria-hidden="true">${icon('arrow')}</span>${side('solution', '02', 'Solution', account.solution)}</div>${foot}</section>`;
}

function briefMarkup(detail, model) {
  const item = detail.item;
  const text = String(item.descriptionMarkdown ?? item.description ?? '').trim();
  if (!text) return `<p class="work-note">${icon('file')}<span>${escape('The task has no description.')}</span></p>`;
  const long = text.length > briefLimit || text.split('\n').length > 16;
  const open = model.briefOpen;
  const toggle = long ? `<button type="button" class="button ghost sm work-brief-toggle" data-action="work-brief" aria-expanded="${open ? 'true' : 'false'}" aria-controls="work-brief-text">${icon(open ? 'chevron-up' : 'chevron-down')}<span class="button-label">${open ? 'Show less' : 'Show the full brief'}</span></button>` : '';
  const task = safeUrl(item.url);
  const source = task ? `<a class="button ghost sm" href="${escape(task)}" target="_blank" rel="noopener noreferrer"><span class="button-label">Source</span>${icon('external', 'button-external')}${newTab}</a>` : '';
  return ui.card({ id: 'work-brief', title: 'Brief', level: 3, actions: source, body: `<div class="prose work-brief-text" id="work-brief-text"${long && !open ? ' data-clamped' : ''}>${markdown(text, { baseLevel: 4 })}</div>${toggle}` });
}

function ladderButton(runs, demo, now) {
  const run = runs[0];
  const result = runResult(run);
  const time = runSeconds(run, now);
  const cost = runCost(run, demo);
  const meta = [cost, time !== null ? duration(time) : '', runs.length > 1 ? `${runs.length} tries` : ''].filter(Boolean).join(' · ');
  const lead = result.live ? '<span class="live-dot" aria-hidden="true"></span>' : icon(result.glyph || 'circle');
  return `<button type="button" class="round-cell work-round-cell" data-tone="${result.tone}" data-action="work-run" data-id="${escape(run.id)}"${result.title ? ` title="${escape(result.title)}"` : ''}><span class="round-cell-title">${lead}<span>${escape(result.label)}</span></span><span class="round-cell-meta">${escape(meta || ' ')}</span></button>`;
}

function ladderMarkup(runs, { demo, now, label }) {
  const ladder = roundLadder(runs);
  if (!ladder.roles.length) return '';
  const head = `<tr><td></td>${ladder.rounds.map(round => `<th scope="col">Round ${round}</th>`).join('')}</tr>`;
  const rows = ladder.roles.map(role => `<tr><th scope="row"><span class="work-ladder-role">${escape(role)}</span><span class="work-ladder-access">${ladder.writes[role] ? 'writer' : 'reader'}</span></th>${ladder.rounds.map(round => ladder.cells[role][round].length ? `<td>${ladderButton(ladder.cells[role][round], demo, now)}</td>` : '<td></td>').join('')}</tr>`).join('');
  return `<div class="table-wrap work-ladder" role="region" tabindex="0" aria-label="${escape(label)}"><table class="round-ladder"><caption class="sr-only">${escape(label)}: Roles by Rounds</caption><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

function shiftMeter(shift, demo, label = 'Shift budget') {
  return ui.meter({ settled: shift.spentUsd, reserved: shift.reservedUsd, authorized: shift.budgetUsd, demo, label });
}

function shiftLine(shift) {
  const when = shift.closedAt ? `closed ${ui.timeAgo(shift.closedAt)}` : `opened ${ui.timeAgo(shift.openedAt)}`;
  return `${escape(plural(shift.round, 'Round'))} · ${when} · ${escape(closeReasonLabel(shift.closeReason))}`;
}

function runLinks(run) {
  const links = (run.links || []).map(link => ({ url: safeUrl(link), label: linkLabel(link) })).filter(link => link.url);
  if (!links.length) return '';
  return `<div class="cluster gap-sm">${links.map(link => `<a class="chip" href="${escape(link.url)}" target="_blank" rel="noopener noreferrer">${icon(/^Pull request/.test(link.label) ? 'pull-request' : 'link')}<span>${escape(link.label)}</span>${newTab}</a>`).join('')}</div>`;
}

function runBody(run, { demo, now, live, attempts }) {
  const failure = failureReason(run.failureReason);
  const retriedAs = failure?.retries ? attempts?.get(String(run.id))?.next : null;
  const parts = [];
  const repeated = run.stuckReason && overlaps(run.summary, run.stuckReason);
  if (run.summary && !repeated) parts.push(`<p class="work-run-summary">${escape(run.summary)}</p>`);
  if (run.stuckReason || failure) {
    const tone = run.outcome === 'stuck' ? 'attention' : failure?.tone || 'danger';
    const title = run.outcome === 'stuck' ? 'Why it is stuck' : failure ? failure.label : 'Why it failed';
    const reasonText = run.stuckReason ? `<p class="${logLike.test(run.stuckReason) ? 'work-log' : 'work-run-reason'}">${escape(run.stuckReason)}</p>` : '';
    const note = failure ? [failureNote(run.failureReason, { live: live && !retriedAs }), retriedAs ? `Ploeg retried it as attempt ${retriedAs}.` : ''].filter(Boolean).join(' ') : '';
    const body = `${reasonText}${note ? `<p>${escape(note)}</p>` : ''}`;
    parts.push(ui.callout({ tone, title, body }));
  }
  if (run.findings?.trim()) parts.push(`<div class="work-findings"><h4 class="overline">Findings</h4><div class="prose">${markdown(run.findings, { baseLevel: 5 })}</div></div>`);
  const links = runLinks(run);
  if (links) parts.push(links);
  const time = runSeconds(run, now);
  const tokens = run.usage && (amount(run.usage.inputTokens) || amount(run.usage.outputTokens)) ? `${escape(formatCount(run.usage.inputTokens))} in · ${escape(formatCount(run.usage.outputTokens))} out` : null;
  parts.push(ui.dl([
    ['Started', run.startedAt ? ui.timeAt(run.startedAt) : '<span class="subtle">Not started</span>'],
    ['Finished', run.finishedAt ? ui.timeAt(run.finishedAt) : run.state === 'running' ? 'Still running' : null],
    ['Duration', time !== null ? `<span class="num">${escape(duration(time))}</span>` : null],
    ['Authorized', demo ? '<span class="subtle">Demo · no model calls</span>' : amount(run.authorizedUsd) && run.authorizedUsd > 0 ? `<span class="num">${moneyText(run.authorizedUsd)}</span>` : '<span class="subtle">Not reported</span>'],
    ['Model cost', demo ? '<span class="subtle">Demo · no model calls</span>' : run.costStatus === 'observed' && amount(run.usage?.costUsd) ? `<span class="num">${moneyText(run.usage.costUsd)}</span>` : '<span class="subtle">Not reported</span>'],
    ['Tokens', tokens],
  ]));
  parts.push(`<p class="meta work-run-ids">Run <span class="mono">${escape(run.id)}</span>${run.shiftId ? ` · Shift <span class="mono">${escape(run.shiftId)}</span>` : ''}${run.keyAlias ? ` · Key <span class="mono">${escape(run.keyAlias)}</span>` : ''}</p>`);
  return parts.join('');
}

function runRow(run, context, { round }) {
  const result = runResult(run);
  const time = runSeconds(run, context.now);
  const cost = runCost(run, context.demo);
  const lead = result.live ? '<span class="live-dot" aria-hidden="true"></span>' : icon(result.glyph || 'circle');
  const when = run.finishedAt || run.startedAt;
  const failure = failureReason(run.failureReason);
  const attempt = attemptLabel(context.attempts?.get(String(run.id)));
  const role = `${round ? `<span class="work-run-round">${escape(round)} · </span>` : ''}${run.writes ? 'writer' : 'reader'}${attempt ? ` · ${escape(attempt)}` : ''}${failure && result.label !== failure.label ? ` · ${escape(failure.label)}` : ''}`;
  return `<details class="work-run" id="work-run-${escape(run.id)}" data-tone="${result.tone}"><summary><span class="work-run-lead" aria-hidden="true">${lead}</span><span class="work-run-name"><strong>${escape(run.role || 'Agent')}</strong><span class="meta">${role}</span></span>${ui.badge({ tone: result.tone, label: result.label, title: result.title, size: 'sm' })}<span class="work-run-numbers meta">${time !== null ? `<span class="num">${escape(duration(time))}</span>` : ''}${cost ? `<span class="num">${escape(cost)}</span>` : ''}${when ? ui.timeAgo(when) : ''}</span>${icon('chevron-down', 'work-run-chevron')}</summary><div class="work-run-body">${runBody(run, context)}</div></details>`;
}

function runsMarkup(detail, model) {
  const shift = latestShift(detail);
  const groups = runGroups(detail.runs, shift?.id);
  const context = { demo: detail.demo, now: model.now, live: !stopped.has(detail.item.state), attempts: runAttempts(detail.runs) };
  const render = (list, continued) => list.map(group => `${group.label && !continued.has(group.key) ? `<p class="work-run-group">${escape(group.label)}</p>` : ''}${group.runs.map(run => runRow(run, context, { round: group.label })).join('')}`).join('');
  const shown = [];
  const rest = [];
  let count = 0;
  for (const group of groups) {
    const head = group.runs.slice(0, Math.max(0, visibleRuns - count));
    const tail = group.runs.slice(head.length);
    count += head.length;
    if (head.length) shown.push({ ...group, runs: head });
    if (tail.length) rest.push({ ...group, runs: tail });
  }
  const continued = new Set(shown.map(group => group.key));
  const hidden = rest.reduce((total, group) => total + group.runs.length, 0);
  const more = hidden ? `<div class="work-runs-rest">${ui.disclosure({ summary: `Show ${hidden} more ${hidden === 1 ? 'Run' : 'Runs'}`, plain: true, id: `work-runs-more-${detail.item.id}`, body: render(rest, continued) })}</div>` : '';
  return `<div class="work-runs">${render(shown, new Set())}</div>${more}`;
}

function storyMarkup(detail, model) {
  const shifts = detail.shifts || [];
  const runs = detail.runs || [];
  const state = detail.item.state;
  if (!shifts.length && !runs.length) {
    const text = state === 'proposed' ? 'No Shift yet. One opens after a person approves the proposal.' : ['done', 'withdrawn', 'stale', 'needs_human'].includes(state) ? 'No Shift or Run ran for this Work Item.' : 'No Shift has opened yet. One opens when a worker of the Team takes the Work Item.';
    return `<p class="work-note" id="work-rounds">${icon('circle-dashed')}<span>${escape(text)}</span></p>`;
  }
  const demo = detail.demo;
  if (!runs.length) {
    const shift = shifts[0];
    const text = shift.closedAt ? `The Shift closed ${ui.timeAgo(shift.closedAt)} before any Run started: ${escape(closeReasonLabel(shift.closeReason).replace(/^./, letter => letter.toLowerCase()))}.` : `A Shift opened ${ui.timeAgo(shift.openedAt)}. No Run has started yet.`;
    return `<p class="work-note" id="work-rounds">${icon('circle-dashed')}<span>${text}</span></p>`;
  }
  const failures = runs.filter(failed).length;
  const runsNote = `${plural(runs.length, 'Run')}${failures ? `, ${failures === runs.length && failures > 1 ? 'all' : failures} failed or stuck` : ''}`;
  if (!shifts.length) {
    const subtitle = `${runsNote}. These Runs ran before Shifts existed, so there is no Round ladder or Shift budget.`;
    return `<section class="card flush" id="work-rounds"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-rounds-title">Runs</h3><p class="card-subtitle">${escape(subtitle)}</p></div></header><div class="card-body">${runsMarkup(detail, model)}</div></section>`;
  }
  const [current, ...earlier] = shifts;
  const currentRuns = runs.filter(run => run.shiftId === current.id);
  const ladder = ladderMarkup(currentRuns, { demo, now: model.now, label: 'Rounds of the current Shift' });
  const older = earlier.length ? `<div class="work-shifts"><h4 class="overline">Earlier Shifts</h4><ul class="work-shift-list">${earlier.map(shift => `<li class="work-shift"><p class="work-shift-line">${shiftLine(shift)}</p>${shiftMeter(shift, demo, '')}${ui.disclosure({ summary: 'Show its Rounds', plain: true, id: `work-shift-${shift.id}`, body: ladderMarkup(runs.filter(run => run.shiftId === shift.id), { demo, now: model.now, label: `Rounds of the Shift opened ${dateTime(shift.openedAt)}` }) || '<p class="subtle">No Runs.</p>' })}</li>`).join('')}</ul></div>` : '';
  const truncated = [detail.truncated?.shifts ? 'Ploeg capped the Shift history. Earlier Shifts may be missing.' : '', detail.truncated?.runs ? 'Ploeg capped the Run history. Earlier Runs may be missing.' : ''].filter(Boolean).map(text => `<p class="meta">${escape(text)}</p>`).join('');
  const overview = `<div class="work-story-overview">${ladder}<div class="work-shift-budget">${shiftMeter(current, demo)}</div></div>`;
  const list = `<div class="work-story-runs"><p class="work-story-heading"><span class="overline">Runs</span><span class="meta">${escape(runsNote)}</span></p>${runsMarkup(detail, model)}</div>`;
  const tail = older || truncated ? `<div class="work-story-tail">${older}${truncated}</div>` : '';
  return `<section class="card flush" id="work-rounds"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-rounds-title">Rounds</h3><p class="card-subtitle">${shiftLine(current)}</p></div></header><div class="card-body">${overview}${list}${tail}</div></section>`;
}

function checkpointFor(entry, checkpoints) {
  const phase = entry.detail?.phase;
  const at = Date.parse(entry.at);
  const candidates = checkpoints.filter(checkpoint => checkpoint.phase === phase && safeUrl(checkpoint.prUrl));
  if (!candidates.length) return null;
  return candidates.reduce((best, checkpoint) => Math.abs(Date.parse(checkpoint.createdAt) - at) < Math.abs(Date.parse(best.createdAt) - at) ? checkpoint : best);
}

function eventTitle(entry, meta, detail) {
  if (entry.action === 'checkpoint.written' && ['pr_opened', 'pr_updated'].includes(entry.detail?.phase)) {
    const url = safeUrl(checkpointFor(entry, detail.checkpoints || [])?.prUrl || prLink(detail));
    const number = pullRequestPath.exec(url)?.[1];
    if (url && number) return `${entry.detail.phase === 'pr_opened' ? 'Opened' : 'Updated'} <a class="work-inline-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">pull request #${escape(number)}${icon('external')}${newTab}</a>`;
  }
  return escape(meta.label);
}

function eventItem(entry, detail, userId) {
  const meta = auditEvent(entry);
  return `<li class="timeline-item" data-tone="${meta.tone}"><span class="timeline-marker">${icon(meta.glyph)}</span><div class="timeline-content"><span class="timeline-title">${eventTitle(entry, meta, detail)}</span>${meta.detail ? `<span class="work-event-detail">${escape(meta.detail)}</span>` : ''}<span class="timeline-meta">${escape(actorName(entry.actor, { userId }))} · ${ui.timeAgo(entry.at)}</span></div></li>`;
}

function eventsMarkup(detail, model) {
  const events = [...(detail.events || [])].sort(newestFirst);
  if (!events.length) return `<p class="work-note" id="work-activity">${icon('activity')}<span>${escape('Ploeg returned no audit events for this Work Item.')}</span></p>`;
  const first = events.slice(0, visibleEvents).map(entry => eventItem(entry, detail, model.userId)).join('');
  const rest = events.length > visibleEvents ? ui.disclosure({ summary: `Show ${events.length - visibleEvents} earlier events`, plain: true, id: `work-events-more-${detail.item.id}`, body: `<ol class="timeline">${events.slice(visibleEvents).map(entry => eventItem(entry, detail, model.userId)).join('')}</ol>` }) : '';
  const raw = ui.disclosure({ summary: 'Show the raw events (JSON)', plain: true, id: `work-events-raw-${detail.item.id}`, body: `<pre class="work-raw mono">${escape(JSON.stringify(events, null, 2))}</pre>` });
  const truncated = detail.truncated?.events ? `<p class="meta">${escape('Ploeg capped the audit history. Earlier events may be missing.')}</p>` : '';
  return `<section class="card" id="work-activity"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-activity-title">Activity${ui.count(events.length)}</h3><p class="card-subtitle">${escape('Ploeg’s audit log for this Work Item, newest first')}</p></div></header><div class="card-body work-activity-body"><ol class="timeline">${first}</ol>${rest}${raw}${truncated}</div></section>`;
}

function technicalMarkup(detail) {
  const item = detail.item;
  const shift = latestShift(detail);
  const branches = [...new Set((detail.checkpoints || []).map(entry => entry.branch).filter(Boolean))];
  const pairs = [
    ['Work Item', `<span class="mono">${escape(item.id)}</span>`],
    ['Tracker', `${escape(trackerName(item.provider) || item.provider || '—')} · <span class="mono">${escape(item.externalId || '—')}</span>`],
    ['Revision', item.revision ? `<span class="mono">${escape(item.revision)}</span>` : null],
    ['Team', escape(item.team)],
    ['Priority', amount(item.priority) ? `${escape(item.priority)} <span class="subtle">(set in the tracker)</span>` : null],
    ['Repository', item.target ? `${escape(item.target.forge)} · ${escape(repoName(item.target))} → ${escape(item.target.baseBranch)}` : item.provider === 'manual' ? 'Registered in a Vloer session' : '<span class="subtle">Not routed</span>'],
    ['Branch', shift?.branch || branches.length ? `<span class="mono">${escape(shift?.branch || branches.join(', '))}</span>` : null],
    ['Attempts', `${escape(item.attempts ?? '—')} agent · ${escape(item.infraFailures ?? '—')} infrastructure`],
    ['Next eligible', item.nextEligibleAt ? ui.timeAt(item.nextEligibleAt) : null],
    ['Lease', item.lease ? `renewed ${ui.timeAt(item.lease.renewedAt)} · expires ${ui.timeAt(item.lease.expiresAt)}` : null],
    ['Shift', shift ? `<span class="mono">${escape(shift.id)}</span>${shift.closeReason ? ` · <span class="mono">${escape(shift.closeReason)}</span>` : ''}` : null],
    ['Checkpoints', detail.checkpoints?.length ? `<span class="num">${escape(detail.checkpoints.length)}</span> <span class="subtle">(listed in Activity)</span>` : null],
    ['Created', ui.timeAt(item.createdAt)],
    ['Updated', ui.timeAt(item.updatedAt)],
    ['Read from Ploeg', detail.fetchedAt ? ui.timeAt(detail.fetchedAt) : null],
  ];
  return ui.disclosure({ summary: 'Technical details', id: `work-tech-${item.id}`, body: ui.dl(pairs, { rows: true }) });
}

function sessionsMarkup(detail, sessions) {
  const linked = (sessions || []).filter(session => session.execution?.workItemId === detail.item.id);
  if (!linked.length) return '';
  return ui.callout({ tone: 'neutral', icon: 'sessions', title: linked.length === 1 ? 'A Vloer session works on this Work Item' : 'Vloer sessions work on this Work Item', body: `<ul class="work-session-links">${linked.map(session => `<li><a class="work-inline-link" href="#session/${escape(encodeURIComponent(session.id))}">${escape(session.title)}${icon('arrow')}</a></li>`).join('')}</ul>` });
}

function cancelResultMarkup(model) {
  const result = model.cancelResult;
  if (!result) return '';
  if (result.error) return `<div class="work-cancel-result" id="work-cancel-result" tabindex="-1" role="alert">${ui.callout({ tone: 'danger', title: 'Ploeg did not cancel this Work Item', body: `<p>${escape(result.error)}</p>` })}</div>`;
  const summary = cancelSummary(result);
  return `<div class="work-cancel-result" id="work-cancel-result" tabindex="-1" role="status">${ui.callout({ tone: summary.tone, title: summary.title, body: `<ul class="work-cancel-lines">${summary.items.map(entry => `<li data-tone="${entry.tone}">${icon(entry.glyph)}<span>${escape(entry.text)}</span></li>`).join('')}</ul>` })}</div>`;
}

/**
 * The Run card's place above Rounds: a `<glide-card>` that `views/work.js` gives the card object once Ploeg sent one
 * (`model.card`). Empty without a card, so an older Ploeg or a failed read leaves no trace.
 */
export function cardSectionMarkup(detail, model) {
  const card = model.card;
  if (!card || String(card.workItemId) !== detail.item.id) return '';
  return `<section class="work-card" id="work-card" aria-labelledby="work-card-title"><div class="work-card-heading"><h3 class="overline" id="work-card-title">Run card</h3><p class="meta">What Ploeg recorded for this Work Item. More info turns the card over.</p></div><glide-card class="work-run-card" data-work-item="${escape(detail.item.id)}"></glide-card></section>`;
}

/** The Work Item detail: header, the writer's problem and solution, the decision box for its state, the brief, the Run card, Rounds and Runs, activity, technical details and, on phones, the action bar. */
export function detailMarkup(detail, model) {
  const reason = detailReason(detail);
  const item = detail.item;
  let decision = '';
  let primary = '';
  if (reason) {
    const plan = decisionPlan(detail, model, reason);
    decision = needsYouBox(detail, model, reason, plan);
    primary = plan.primary;
  } else if (item.state === 'awaiting_review') {
    const plan = reviewPlan(detail);
    decision = reviewBox(detail, model, plan);
    primary = plan.primary;
  } else decision = statusBox(detail, model);
  const parts = [
    headerMarkup(detail, model, reason),
    cancelResultMarkup(model),
    accountMarkup(detail),
    decision,
    sessionsMarkup(detail, model.sessions),
    briefMarkup(detail, model),
    cardSectionMarkup(detail, model),
    storyMarkup(detail, model),
    eventsMarkup(detail, model),
    technicalMarkup(detail),
    primary ? `<div class="work-sticky-actions" role="group" aria-label="Next step">${primary}</div>` : '',
  ];
  return `<article class="work-detail" aria-labelledby="ploeg-item-title">${parts.filter(Boolean).join('')}</article>`;
}

function detailSkeleton() {
  return `<div class="work-detail work-detail-loading" aria-busy="true"><div class="work-detail-loading-header">${ui.skeleton({ rows: 2, variant: 'text' })}</div><div class="card">${ui.skeleton({ rows: 4, variant: 'text' })}</div><div class="card">${ui.skeleton({ rows: 3, variant: 'list' })}</div></div>`;
}

function detailError(model) {
  const missing = model.detailError?.code === 'ploeg_not_found';
  const back = `<a class="button secondary" href="${escape(model.listHref)}">${icon('chevron-left')}<span class="button-label">Back to the list</span></a>`;
  const retry = missing ? '' : '<button type="button" class="button secondary" data-action="work-detail-retry">Try again</button>';
  return `<div class="work-detail"><div class="card">${ui.emptyState({ icon: missing ? 'search' : 'x-circle', tone: missing ? 'neutral' : 'danger', title: missing ? 'This Work Item is not in your Teams' : 'Could not load this Work Item', body: `<p role="alert">${escape(missing ? `Ploeg has no Work Item ${model.detailId} in the Teams your account can read.` : model.detailError?.message || 'Ploeg did not answer.')}</p>`, actions: `${retry}${back}` })}</div></div>`;
}

function demoMarkup(model) {
  const data = model.data;
  if (!(data?.demo || model.detail?.demo || (!data && model.demoMode))) return '';
  return ui.demoNote();
}

/**
 * The whole Work page body for `model`: the demo note, the toolbar (Team and lane), a partial-data notice,
 * the list, and the Work Item detail beside it (wide) or instead of it (narrow).
 * `model` = { data, lane, lanePending (the lane waits for the open Work Item's state), team, teams, loading, refreshing,
 * loadingMore, detailId, detail, detailLoading, detailError, listHref, canCancel, cancelBusy, cancelResult, briefOpen,
 * sessions, userId, trackerUrl, reviewFacts, demoMode, now, card }.
 */
export function workMarkup(model) {
  const data = model.data;
  const hasDetail = Boolean(model.detailId);
  const teams = model.teams || (data?.available ? (data.teams || []).map(team => team.id) : []);
  const current = { ...model, teams };
  let list;
  if (!data || (model.lanePending && data.available)) list = listSkeleton();
  else if (!data.available) list = unavailableMarkup(current);
  else list = `${partialNotice(data)}${listMarkup(current)}`;
  const detail = !hasDetail ? '' : model.detail ? detailMarkup(model.detail, current) : model.detailError ? detailError(current) : detailSkeleton();
  return `<div class="work"${hasDetail ? ' data-detail' : ''}>${demoMarkup(current)}${toolbarMarkup(current)}<div class="work-layout"><div class="work-list-pane">${list}</div>${hasDetail ? `<div class="work-detail-pane">${detail}</div>` : ''}</div></div>`;
}

/**
 * The confirm dialog for cancelling a Work Item: what Ploeg does (withdraws the Work Item and closes its Shift,
 * stops Runs that run, blocks their model keys, revokes the forge tokens, comments on the tracker task), the spend
 * so far, and that only the tracker can start it again. In the demo it explains that nothing runs and the confirm
 * button is disabled.
 */
/**
 * The dialog that checks out a Work Item's branch: open it in VS Code through the De Vloer extension, or copy the
 * git command. `origin` is this workbench, so the extension can refuse a link meant for another one. '' without a branch.
 */
export function checkoutDialogMarkup(detail, card, { origin = '' } = {}) {
  const target = checkoutTarget(detail, card);
  if (!target) return '';
  const repo = `${target.owner}/${target.repo}`;
  const command = checkoutCommand(target.branch);
  const link = checkoutLink(detail.item.id, origin);
  const facts = ui.dl([['Branch', `<span class="mono">${escape(target.branch)}</span>`], ['Repository', `${escape(repo)}${target.baseBranch ? ` <span class="subtle">→ ${escape(target.baseBranch)}</span>` : ''}`]], { rows: true });
  const editor = `<div class="work-checkout-part"><a class="button primary" href="${escape(link)}">${icon('external')}<span class="button-label">Open in VS Code</span></a><p class="meta">${escape(`Needs the De Vloer extension, connected to this workbench, and a clone of ${repo} open in VS Code. It asks before it switches branches.`)}</p></div>`;
  const terminal = `<div class="work-checkout-part"><p>${escape(`Or, in a terminal in your clone of ${repo}:`)}</p><pre class="work-checkout-command mono">${escape(command)}</pre>${ui.button({ label: 'Copy command', icon: 'copy', variant: 'secondary', action: 'work-copy-command', data: { value: command } })}</div>`;
  return `<form method="dialog" class="work-checkout-form"><header class="dialog-header"><h2 id="confirm-title">Check out this branch</h2><button type="submit" class="button ghost icon-only sm" value="close" aria-label="Close" title="Close">${icon('x')}</button></header><div class="dialog-body"><p><strong>${escape(detail.item.title || `Work Item ${detail.item.id}`)}</strong> <span class="subtle">${escape(workItemRef(detail.item))}</span></p>${facts}${editor}${terminal}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="close" autofocus>Close</button></footer></form>`;
}

export function cancelDialogMarkup(detail, { demo = false } = {}) {
  const item = detail.item;
  const shift = latestShift(detail);
  const running = detail.runs.filter(run => run.state === 'running').length;
  const pending = detail.runs.filter(run => run.state === 'pending').length;
  const tracker = trackerName(item.provider) || 'its tracker';
  const open = shift && !shift.closedAt;
  const consequences = [['x-circle', open ? 'Withdraws the Work Item and closes its open Shift.' : 'Withdraws the Work Item.']];
  if (running || pending) {
    consequences.push(['pause-circle', running ? `Stops ${plural(running, 'running Run')}${pending ? ` and cancels ${plural(pending, 'waiting Run')}` : ''}.` : `Cancels ${plural(pending, 'waiting Run')}.`]);
    consequences.push(['lock', 'Blocks the model keys of those Runs, so they cannot spend more.']);
    consequences.push(['shield', 'Revokes the forge tokens Ploeg issued for them.']);
  } else if (['ingested', 'queued', 'leased'].includes(item.state)) {
    consequences.push(['lock', 'Stops any Run that starts before Ploeg handles the cancel, blocks its model key and revokes its forge token.']);
  }
  consequences.push(['send', `Comments on the task in ${tracker} that the work was cancelled.`]);
  if (item.state === 'awaiting_review') consequences.push(['pull-request', 'Leaves the pull request on the forge. Close it there if you do not want it.']);
  const list = `<ul class="work-consequences">${consequences.map(([glyph, text]) => `<li>${icon(glyph)}<span>${escape(text)}</span></li>`).join('')}</ul>`;
  const spend = shift ? ui.dl([['Spend so far', shiftMeter(shift, demo, '')]], { rows: true }) : '';
  const note = demo
    ? ui.callout({ tone: 'neutral', title: 'Not available in the demo', body: `<p>${escape('Nothing runs here, so there is nothing to cancel. In a live workbench this button asks Ploeg to do the above.')}</p>` })
    : ui.callout({ tone: 'attention', title: 'This cannot be undone', body: `<p>${escape(`The Work Item becomes Withdrawn. To try again later, assign the task to the Team again in ${tracker}.`)}</p>` });
  return `<form method="dialog" class="work-cancel-form"><header class="dialog-header"><h2 id="confirm-title">Cancel this Work Item?</h2><button type="submit" class="button ghost icon-only sm" value="keep" aria-label="Close" title="Close">${icon('x')}</button></header><div class="dialog-body"><p><strong>${escape(item.title || `Work Item ${item.id}`)}</strong> <span class="subtle">${escape(workItemRef(item))}</span></p><p>${escape('Ploeg then:')}</p>${list}${spend}${note}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="keep" autofocus>Keep it</button><button type="submit" class="button danger" value="cancel"${demo ? ' disabled' : ''}>Cancel Work Item</button></footer></form>`;
}
