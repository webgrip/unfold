import { escape, safeUrl } from './core/dom.js';
import { icon } from './core/icons.js';
import { markdown } from './core/markdown.js';
import { money, plural, duration, dateTime } from './core/format.js';
import * as ui from './core/ui.js';
import { workItemState, runOutcome, runState, verdict as verdictMeta, failureReason, checkpointPhase, auditEvent, actorName } from './core/states.js';
import { listReason, routingWarning, detailReason, closeReasonLabel, withdrawnReason, requeueNote } from './core/reasons.js';

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
const instructionFiles = [['AGENTS.md', /\bAGENTS\.md\b/], ['CLAUDE.md', /\bCLAUDE\.md\b/], ['.claude/', /(^|[^\w.])\.claude\//], ['.agents/', /(^|[^\w.])\.agents\//], ['.openhands/', /(^|[^\w.])\.openhands\//], ['.mcp.json', /(^|[^\w.])\.mcp\.json\b/], ['.cursorrules', /(^|[^\w.])\.cursorrules\b/]];
const pullRequestPath = /\/(?:pulls?|merge_requests)\/(\d+)\/?$/;
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

/** The earlier en-US two-decimal dollar formatter, kept for callers that have not moved to `format.money` yet. */
export const usd2 = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

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

/** Adds a loaded page of `team` to a lane: new items only, in id order, with that Team's next cursor. */
export function appendPage(lanePage, team, page) {
  const seen = new Set(lanePage.items.map(item => item.id));
  const items = [...lanePage.items, ...page.items.filter(item => !seen.has(item.id))].sort(byId);
  const cursors = { ...lanePage.cursors };
  if (page.nextCursor) cursors[team] = page.nextCursor; else delete cursors[team];
  return { items, nextCursor: Object.values(cursors)[0] || null, cursors, partial: Object.keys(cursors).length > 0 };
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
 * findings (a text match, not a diff check).
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
    rounds: shift ? shift.round : Math.max(0, ...runs.map(run => run.round || 0)),
    seconds: shift ? seconds(shift.openedAt, shift.closedAt) : null,
    spend: shift ? { authorizedUsd: shift.budgetUsd, reservedUsd: shift.reservedUsd, settledUsd: shift.spentUsd } : null,
    instructionFiles: flagged,
    truncated: detail.truncated.runs || detail.truncated.shifts || detail.truncated.checkpoints,
  };
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

/** What a Run reported, as one state meta: the verdict of a reading Run, otherwise its outcome, otherwise its state. */
export function runResult(run) {
  if (run.state !== 'finished') return run.state === 'running' ? runState('running') : { ...runState('pending'), label: 'Waiting for a worker' };
  if (!run.writes && run.verdict) { const meta = verdictMeta(run.verdict); return { ...meta, label: meta.short, title: meta.label }; }
  if (run.outcome) return runOutcome(run.outcome);
  if (run.failureReason) return { ...failureReason(run.failureReason), tone: 'danger' };
  return { key: 'none', label: /^cancelled/i.test(run.summary || '') ? 'Cancelled before it started' : 'No outcome reported', tone: 'neutral', glyph: 'circle-slash' };
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
 * lines. A field Ploeg did not send (null) reads "Not reported", never zero; `keysBlocked: false` says the block is
 * still being retried.
 */
export function cancelSummary(result) {
  const lines = [];
  if (result.demo) return { tone: 'neutral', title: 'Nothing was cancelled', lines: [result.message || 'This is the demo. Nothing runs, so nothing was stopped.'] };
  const title = result.withdrawn === true ? 'Cancelled. Ploeg withdrew the Work Item.' : result.withdrawn === false ? `Nothing was running. The Work Item stays ${workItemState(result.state).label}.` : 'Ploeg answered, but did not say whether it withdrew the Work Item.';
  const counted = (value, noun) => value === null || value === undefined ? `${noun}: not reported` : `${noun}: ${value}`;
  lines.push(counted(result.stoppedRuns, 'Runs stopped'), counted(result.cancelledRuns, 'Runs cancelled before they started'));
  lines.push(result.keysBlocked === true ? 'Model keys blocked.' : result.keysBlocked === false ? 'Ploeg has not confirmed the model key block yet. Its sweep retries it.' : 'Model key block: not reported.');
  if (result.message) lines.push(result.message);
  return { tone: result.withdrawn === true ? 'success' : 'neutral', title, lines };
}

function stateGlyph(meta) {
  return meta.live ? '<span class="live-dot" aria-hidden="true"></span>' : icon(meta.glyph);
}

function spendMini(shift, demo) {
  if (!shift || !amount(shift.budgetUsd) || shift.budgetUsd <= 0) return '<span class="work-row-spend" data-empty></span>';
  if (demo) return `<span class="work-row-spend"><span class="work-row-spend-text"><span class="num">${moneyText(shift.budgetUsd)}</span> budget</span>${ui.meter({ demo: true, authorized: shift.budgetUsd, size: 'sm', label: '' })}</span>`;
  const text = amount(shift.spentUsd) ? `<span class="num">${moneyText(shift.spentUsd)}</span> of <span class="num">${moneyText(shift.budgetUsd)}</span>` : `Not reported of <span class="num">${moneyText(shift.budgetUsd)}</span>`;
  return `<span class="work-row-spend"><span class="work-row-spend-text">${text}</span>${ui.meter({ settled: shift.spentUsd, reserved: shift.reservedUsd, authorized: shift.budgetUsd, size: 'sm', label: '' })}</span>`;
}

function laneHint(item) {
  if (item.state === 'awaiting_review') {
    const code = item.latestShift?.closeReason || item.closeReason || '';
    if (code === 'review_approved') return ui.chip({ label: 'Agent approved', tone: 'review', icon: 'check-circle', title: 'An agent reviewer approved. This is not a human review.' });
    if (code === 'plan_exhausted') return ui.chip({ label: 'Every Round ran', tone: 'review', title: 'Every planned Round ran and no reviewer asked for more changes.' });
    return '';
  }
  if (item.state === 'leased' && item.latestShift) return ui.chip({ label: `Round ${item.latestShift.round} running`, tone: 'live' });
  if (item.state === 'queued' && item.nextEligibleAt && Date.parse(item.nextEligibleAt) > Date.now()) return ui.chip({ label: 'Retrying later', icon: 'clock', title: `Retrying after ${dateTime(item.nextEligibleAt)}` });
  return '';
}

function rowMeta(item, { allTeams, lane }) {
  const reason = listReason(item);
  const warning = routingWarning(item);
  const chips = [];
  if (lane === 'all') chips.push(ui.stateBadge(workItemState(item.state), reason ? { reason: reason.chip, reasonTone: reason.tone } : {}));
  else if (reason) chips.push(ui.chip({ label: reason.chip, tone: reason.tone, title: reason.sentence }));
  const hint = laneHint(item);
  if (hint) chips.push(hint);
  if (warning) chips.push(ui.chip({ label: warning.chip, tone: warning.tone, icon: warning.glyph, title: warning.sentence }));
  if (amount(item.infraFailures) && item.infraFailures > 0 && item.state !== 'needs_human') chips.push(ui.chip({ label: plural(item.infraFailures, 'infrastructure failure'), tone: 'severe', icon: 'zap' }));
  const facts = [`<span class="work-row-ref">${allTeams ? `${escape(item.team)} · ` : ''}${escape(workItemRef(item))}</span>`];
  if (item.target) facts.push(`<span class="work-row-repo">${icon('branch')}${escape(repoName(item.target))}</span>`);
  if (amount(item.attempts) && item.attempts > 0) facts.push(`<span class="work-row-attempts">${escape(plural(item.attempts, 'attempt'))}</span>`);
  if (item.latestShift) facts.push(`<span>Round ${escape(item.latestShift.round)}</span>`);
  return `${chips.length ? `<span class="work-row-chips">${chips.join('')}</span>` : ''}<span class="work-row-facts">${facts.join('')}</span>`;
}

function rowHref(item, { lane, team }) {
  const query = new URLSearchParams(Object.entries({ lane, team }).filter(([, value]) => value));
  return `#work/${encodeURIComponent(item.id)}${query.toString() ? `?${query}` : ''}`;
}

/** One Work Item row of the list: state glyph, title, reason and warning chips, reference, repository, counters, spend of budget and age. */
export function workRow(item, context) {
  const meta = workItemState(item.state);
  return `<li>${ui.listRow({
    href: rowHref(item, context),
    data: { workRow: true, id: item.id },
    selected: context.selectedId === item.id,
    tone: meta.tone,
    lead: `<span title="${escape(meta.label)}">${stateGlyph(meta)}</span>`,
    title: item.title || `Work Item ${item.id}`,
    meta: rowMeta(item, context),
    trail: `${spendMini(item.latestShift, context.demo)}<span class="work-row-age"><span class="sr-only">Updated </span>${ui.timeAgo(item.updatedAt)}</span>`,
  })}</li>`;
}

function laneCount(page) {
  if (!page) return null;
  return page.partial ? `${page.items.length}+` : page.items.length;
}

function teamControl(model) {
  const data = model.data;
  const teams = data?.teams || [];
  if (!data?.available || teams.length < 2) {
    const name = teams[0]?.id || data?.selectedTeam;
    return name ? `<span class="work-team-single"><span class="field-label">Team</span><span class="chip">${escape(name)}</span></span>` : '';
  }
  const options = [`<option value=""${model.team ? '' : ' selected'}>All teams</option>`, ...teams.map(team => `<option value="${escape(team.id)}"${team.id === model.team ? ' selected' : ''}>${escape(team.id)}</option>`)].join('');
  return `<label class="field inline work-team"><span class="field-label">Team</span><select id="ploeg-team"${model.loading ? ' disabled' : ''}>${options}</select></label>`;
}

function laneControl(model) {
  const lanes = model.data?.available ? model.data.lanes : null;
  const segments = ploegLanes.map(lane => {
    const total = laneCount(lanes?.[lane.id]);
    return `<button type="button" class="segment" data-action="ploeg-lane" data-id="${lane.id}" aria-pressed="${model.lane === lane.id}">${escape(lane.label)}${total === null ? '' : `<span class="count">${escape(total)}</span>`}</button>`;
  }).join('');
  return `<div class="segmented work-lanes" role="group" aria-label="Lane">${segments}</div>`;
}

function refreshButton(model) {
  const busy = model.loading || model.refreshing;
  return `<button type="button" class="button secondary icon-only work-refresh" data-action="ploeg-refresh" aria-label="Refresh" title="Refresh"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')}</button>`;
}

function toolbarMarkup(model) {
  const unavailable = model.data && !model.data.available;
  return `<div class="toolbar work-toolbar">${unavailable ? '' : `${teamControl(model)}${laneControl(model)}`}<span class="toolbar-spacer"></span>${refreshButton(model)}</div>`;
}

function listMarkup(model) {
  const data = model.data;
  const lane = model.lane;
  const page = data.lanes?.[lane] || { items: [], partial: false };
  const context = { lane, team: model.team, allTeams: data.allTeams, selectedId: model.detailId, demo: data.demo };
  const label = ploegLanes.find(entry => entry.id === lane)?.label || 'Work';
  const heading = `<h2 class="sr-only" id="work-list-title">${escape(label)}${data.allTeams ? ', all teams' : data.selectedTeam ? `, team ${escape(data.selectedTeam)}` : ''}</h2>`;
  if (!page.items.length) {
    const [glyph, title, body, tone] = data.teams.length ? laneEmpty[lane] || laneEmpty.all : ['lock', 'No Teams for your account', 'Ask an administrator to give your account access to a Ploeg Team.', 'neutral'];
    return `<section class="card work-list" aria-labelledby="work-list-title">${heading}${ui.emptyState({ icon: glyph, title, body: `<p>${escape(body)}</p>`, tone })}</section>`;
  }
  const more = page.partial ? `<footer class="work-list-footer"><p class="meta">${data.allTeams ? 'Showing the first page of each Team.' : 'Showing the first page.'} Counts cover the loaded Work Items.</p><button type="button" class="button secondary sm" data-action="ploeg-more"${model.loadingMore ? ' disabled aria-busy="true"' : ''}>${model.loadingMore ? '<span class="spinner" aria-hidden="true"></span>' : icon('chevron-down')}<span class="button-label">Load more</span></button></footer>` : '';
  return `<section class="card flush work-list" aria-labelledby="work-list-title">${heading}<ul class="list work-list-rows" aria-busy="${model.loading ? 'true' : 'false'}">${page.items.map(item => workRow(item, context)).join('')}</ul>${more}</section>`;
}

function partialNotice(data) {
  if (!data.errors?.length) return '';
  const names = data.errors.map(error => error.team).join(', ');
  return ui.callout({ tone: 'attention', title: `Could not read ${data.errors.length === 1 ? `Team ${names}` : `Teams ${names}`}`, body: `<p>${escape(data.errors[0].message)} The list shows the other Teams.</p>`, actions: '<button type="button" class="button secondary sm" data-action="ploeg-refresh">Try again</button>' });
}

function unavailableMarkup(model) {
  const data = model.data;
  if (!data.configured) return `<div class="card">${ui.emptyState({ icon: 'settings', title: 'Ploeg is not connected', body: `<p>${escape('An administrator connects Ploeg’s operator API in the server configuration and gives your account access to its Teams.')}</p>` })}</div>`;
  return `<div class="card">${ui.emptyState({ icon: 'x-circle', tone: 'danger', title: 'Could not load Work', body: `<p>${escape(data.message || 'Ploeg did not answer.')}</p>`, actions: '<button type="button" class="button secondary" data-action="ploeg-refresh">Try again</button>' })}</div>`;
}

function listSkeleton() {
  return `<section class="card work-list work-list-loading" aria-busy="true" aria-label="Loading Work Items">${ui.skeleton({ rows: 6, variant: 'list' })}</section>`;
}

function actionButtons(detail, model, { phone = false } = {}) {
  const item = detail.item;
  const pr = safeUrl(prLink(detail));
  const tracker = safeUrl(item.url);
  const links = [];
  if (pr) links.push(`<a class="button ${item.state === 'awaiting_review' ? 'primary' : 'secondary'}" href="${escape(pr)}" target="_blank" rel="noopener noreferrer">${icon('pull-request')}<span class="button-label">Open pull request</span>${icon('external', 'button-external')}<span class="sr-only"> (opens in a new tab)</span></a>`);
  if (tracker) links.push(`<a class="button secondary" href="${escape(tracker)}" target="_blank" rel="noopener noreferrer">${icon('external')}<span class="button-label">Open in ${escape(trackerName(item.provider) || 'tracker')}</span><span class="sr-only"> (opens in a new tab)</span></a>`);
  if (phone) return links.length ? `<div class="work-sticky-actions" role="group" aria-label="Open elsewhere">${links.join('')}</div>` : '';
  const tools = [`<button type="button" class="button ghost" data-action="work-copy-link" data-id="${escape(item.id)}">${icon('copy')}<span class="button-label">Copy link</span></button>`];
  if (model.canCancel && cancellable.has(item.state)) tools.push(`<button type="button" class="button danger-ghost" data-action="work-cancel" data-id="${escape(item.id)}"${model.cancelBusy ? ' disabled aria-busy="true"' : ''}>${model.cancelBusy ? '<span class="spinner" aria-hidden="true"></span>' : icon('stop')}<span class="button-label">Cancel Work Item</span></button>`);
  return `<div class="work-actions">${links.length ? `<div class="work-actions-links">${links.join('')}</div>` : ''}<div class="work-actions-tools">${tools.join('')}</div></div>`;
}

function headerMarkup(detail, model, reason) {
  const item = detail.item;
  const meta = workItemState(item.state);
  const warning = routingWarning(item);
  const shift = latestShift(detail);
  const facts = [];
  if (item.target) facts.push(`<span class="work-fact">${icon('branch')}<span>${escape(repoName(item.target))}${item.target.baseBranch ? ` <span class="subtle">→ ${escape(item.target.baseBranch)}</span>` : ''}</span></span>`);
  if (amount(item.attempts) && item.attempts > 0) facts.push(`<span class="work-fact">${escape(plural(item.attempts, 'attempt'))}</span>`);
  if (shift) facts.push(`<span class="work-fact">Round ${escape(shift.round)}</span>`);
  if (item.updatedAt) facts.push(`<span class="work-fact">Updated ${ui.timeAgo(item.updatedAt)}</span>`);
  const back = `<a class="button ghost sm work-back" href="${escape(model.listHref)}">${icon('chevron-left')}<span class="button-label">${escape(ploegLanes.find(lane => lane.id === model.lane)?.label || 'Work')}</span></a>`;
  const close = `<button type="button" class="button ghost icon-only sm work-close" data-action="ploeg-close" aria-label="Close work item details" title="Close">${icon('x')}</button>`;
  return `<header class="work-detail-header"><div class="work-detail-nav">${back}<p class="meta work-detail-ref">${escape(item.team)} · ${escape(workItemRef(item))}</p>${close}</div><h2 class="work-detail-title" id="ploeg-item-title" tabindex="-1">${escape(item.title || `Work Item ${item.id}`)}</h2><div class="work-detail-status">${ui.stateBadge(meta, reason ? { reason: reason.chip, reasonTone: reason.tone } : {})}${warning ? ui.chip({ label: warning.chip, tone: warning.tone, icon: warning.glyph, title: warning.sentence }) : ''}</div>${facts.length ? `<p class="work-detail-facts">${facts.join('')}</p>` : ''}${actionButtons(detail, model)}</header>`;
}

function quote(text, at) {
  return `<blockquote class="work-quote"><p>${escape(`“${text}”`)}</p><footer class="meta">Ploeg${at ? ` · ${ui.timeAgo(at)}` : ''}</footer></blockquote>`;
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

function evidenceLine(run, reason) {
  const result = runResult(run);
  const text = reason.run && reason.run.id === run.id ? reason.run.text : run.stuckReason || run.summary || '';
  const failure = failureReason(run.failureReason);
  const when = run.finishedAt || run.startedAt;
  return `<li class="work-evidence" data-tone="${result.tone}"><span class="work-evidence-icon" aria-hidden="true">${icon(result.glyph || 'circle')}</span><div class="work-evidence-main"><p class="work-evidence-title"><strong>${escape(run.role || 'Agent')}</strong>${run.round ? ` · Round ${escape(run.round)}` : ''} · ${escape(result.label)}${failure ? ` · ${escape(failure.label)}` : ''}${when ? ` <span class="meta">${ui.timeAgo(when)}</span>` : ''}</p>${text ? `<p class="work-evidence-text">${escape(text)}</p>` : ''}</div>${runJump(run)}</li>`;
}

function trackerLink(item, trackerUrl) {
  const url = safeUrl(item.url) || safeUrl(trackerUrl);
  if (!url) return '';
  return ` <a class="work-inline-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open in ${escape(trackerName(item.provider) || 'the tracker')}${icon('external')}<span class="sr-only"> (opens in a new tab)</span></a>`;
}

function steps(entries) {
  return `<ol class="work-steps">${entries.map(entry => `<li>${entry}</li>`).join('')}</ol>`;
}

function whatYouCanDo(body) {
  return `<div class="work-decision-part"><h4 class="overline">What you can do</h4>${body}</div>`;
}

function needsYouBox(detail, model, reason) {
  const item = detail.item;
  const warning = routingWarning(item);
  const event = (detail.events || []).find(entry => entry.action === `work_item.${item.state}` && entry.detail?.reason);
  const evidence = evidenceRuns(detail, reason);
  const why = [`<p class="work-decision-headline">${escape(reason.chip)}</p>`, `<p class="work-decision-sentence">${escape(reason.sentence)}</p>`];
  if (reason.headline) why.push(quote(reason.headline, event?.at));
  if (evidence.length) why.push(`<ul class="work-evidence-list" aria-label="Evidence">${evidence.map(run => evidenceLine(run, reason)).join('')}</ul>`);
  if (warning) why.push(`<div class="work-warning" data-tone="${warning.tone}">${icon(warning.glyph)}<p><strong>${escape(warning.chip)}.</strong> ${escape(warning.sentence)}</p></div>`);
  const actions = steps([escape(reason.fix), `${escape(reason.requeue)}${trackerLink(item, model.trackerUrl)}`]);
  const body = `<div class="work-decision-part">${why.join('')}</div>${whatYouCanDo(`${actions}<p class="meta">${escape(requeueNote)}</p>`)}`;
  return ui.card({ id: 'work-decision', title: 'Why this needs you', icon: reason.glyph, tone: reason.tone, level: 3, body });
}

function check(tone, glyph, title, detailText) {
  return `<li class="work-check" data-tone="${tone}"><span class="work-check-icon" aria-hidden="true">${icon(glyph)}</span><div class="work-check-main"><p class="work-check-title">${title}</p>${detailText ? `<p class="meta">${detailText}</p>` : ''}</div></li>`;
}

function reviewBox(detail, model) {
  const item = detail.item;
  const review = ploegReview(detail);
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
  else checks.push(check('neutral', 'circle-dashed', 'No agent verdict', review.findings.length ? 'The reviewer left findings but no verdict.' : 'No reviewer gave an opinion on this Shift.'));
  if (demo) checks.push(check('neutral', 'circle-dashed', 'Spend: demo', 'No model calls, so nothing was spent.'));
  else if (!spent || !amount(spent.settledUsd)) checks.push(check('neutral', 'circle-dashed', 'Spend not reported', 'Ploeg has not settled the spend of this Shift.'));
  else if (spent.settledUsd <= spent.authorizedUsd) checks.push(check('success', 'check-circle', `Within its ${moneyText(spent.authorizedUsd)} budget`, `${moneyText(spent.settledUsd)} settled.`));
  else checks.push(check('danger', 'x-circle', `Over its ${moneyText(spent.authorizedUsd)} budget`, `${moneyText(spent.settledUsd)} settled.`));
  checks.push(check('neutral', 'circle-dashed', 'CI checks: not reported', 'Vloer does not read CI. Check them on the pull request.'));
  if (review.instructionFiles.length) checks.push(check('attention', 'alert', 'Findings name instruction files', `${review.instructionFiles.map(name => `<code>${escape(name)}</code>`).join(' ')} Check these files in the diff before you merge.`));
  checks.push(safeUrl(item.url) ? check('success', 'check-circle', `Linked to its ${escape(trackerName(item.provider) || 'tracker')} task`, '') : check('neutral', 'circle-dashed', 'No tracker link reported', ''));
  const forge = ui.dl([
    ['Merge', 'Ploeg marks the Work Item Done.'],
    ['Request changes', 'Ploeg queues a fix Round for the same Team, on the same branch.'],
    ['Close without merging', 'The Work Item comes back to you as Needs you.'],
  ], { rows: true });
  const truncated = review.truncated ? '<p class="meta">Ploeg capped this history. Earlier records may be missing.</p>' : '';
  const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(pr ? 'The agents are done. Read the pull request and decide on the forge; Vloer does not merge.' : 'The agents are done, but Ploeg reported no pull request link.')}</p><div class="work-receipt">${receipt}</div>${truncated}</div><div class="work-decision-part"><h4 class="overline">Before you merge</h4><ul class="work-checklist">${checks.join('')}</ul></div><div class="work-decision-part"><h4 class="overline">On the forge</h4>${forge}</div>`;
  return ui.card({ id: 'work-decision', title: 'Ready for your review', icon: 'pull-request', tone: 'review', level: 3, body });
}

function statusBox(detail, model) {
  const item = detail.item;
  const shift = latestShift(detail);
  const running = detail.runs.filter(run => run.state !== 'finished');
  if (item.state === 'leased') {
    const lines = running.length ? running.map(run => `<li class="work-evidence" data-tone="live"><span class="work-evidence-icon" aria-hidden="true"><span class="live-dot"></span></span><div class="work-evidence-main"><p class="work-evidence-title"><strong>${escape(run.role || 'Agent')}</strong>${run.round ? ` · Round ${escape(run.round)}` : ''} · ${escape(run.state === 'running' ? `running${run.startedAt ? ` for ${duration(runSeconds(run, model.now)) || 'a moment'}` : ''}` : 'waiting for a worker')}</p>${run.expiresAt ? `<p class="meta">Must check in by ${ui.timeAt(run.expiresAt)}</p>` : ''}</div>${runJump(run)}</li>`).join('') : '';
    const lease = item.lease ? `<p class="meta">The worker last checked in ${ui.timeAgo(item.lease.renewedAt)}; its lease runs until ${ui.timeAt(item.lease.expiresAt)}.</p>` : '';
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(shift ? `Round ${shift.round} of Shift ${shift.id} is running.` : 'An agent is working on it.')}</p>${lines ? `<ul class="work-evidence-list">${lines}</ul>` : ''}${lease}</div>${whatYouCanDo(`<p>${escape('Nothing is needed now. This page refreshes itself while live updates are on.')}${model.canCancel ? ` ${escape('Cancel the Work Item to stop its Runs.')}` : ''}</p>`)}`;
    return ui.card({ id: 'work-decision', title: 'Running now', icon: 'activity', tone: 'live', level: 3, body });
  }
  if (item.state === 'queued' || item.state === 'ingested') {
    const later = item.nextEligibleAt && Date.parse(item.nextEligibleAt) > model.now ? `<p>${escape('Ploeg retries it after')} ${ui.timeAt(item.nextEligibleAt)} ${escape('(infrastructure backoff).')}</p>` : '';
    const infra = amount(item.infraFailures) && item.infraFailures > 0 ? `<p>${escape(`${plural(item.infraFailures, 'infrastructure failure')} so far. These do not count against the agent’s attempts.`)}</p>` : '';
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(item.state === 'ingested' ? 'Ploeg recorded the task and has not queued it yet.' : 'It starts when a worker of the Team is free. The tracker sets its priority.')}</p>${later}${infra}</div>${whatYouCanDo(`<p>${escape('Nothing is needed now. To change its priority, change it in the tracker; Vloer never re-ranks work.')}</p>`)}`;
    return ui.card({ id: 'work-decision', title: 'Waiting to start', icon: 'circle-dashed', level: 3, body });
  }
  if (item.state === 'done') {
    const rejected = detail.events.find(entry => entry.action === 'work_item.rejected');
    const done = detail.events.find(entry => entry.action === 'work_item.done');
    const sentence = rejected ? 'A person rejected this proposal, so it never ran.' : done?.detail?.reason === 'pull request merged' ? 'The pull request was merged.' : shift?.closeReason ? `${closeReasonLabel(shift.closeReason)}.` : 'Ploeg finished this Work Item.';
    return ui.card({ id: 'work-decision', title: 'Done', icon: 'check-circle', tone: 'success', level: 3, body: `<div class="work-decision-part"><p class="work-decision-sentence">${escape(sentence)}</p>${rejected?.detail?.reason ? quote(rejected.detail.reason, rejected.at) : ''}</div>` });
  }
  if (item.state === 'withdrawn') {
    const event = detail.events.find(entry => entry.action === 'work_item.withdrawn');
    const sentence = withdrawnReason(event?.detail?.reason) || withdrawnReason(shift?.closeReason) || 'A person took the work back.';
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape(sentence)}</p></div>${whatYouCanDo(`<p>${escape(`To start again, assign the task to the Team in ${trackerName(item.provider) || 'its tracker'}.`)}${trackerLink(item, model.trackerUrl)}</p>`)}`;
    return ui.card({ id: 'work-decision', title: 'Withdrawn', icon: 'circle-slash', level: 3, body });
  }
  if (item.state === 'proposed') {
    const body = `<div class="work-decision-part"><p class="work-decision-sentence">${escape('An agent proposed this work. Nothing runs until a person approves it.')}</p></div>${whatYouCanDo(`<p><a class="work-inline-link" href="#proposed">${escape('Approve or reject it on Proposed')}${icon('arrow')}</a></p>`)}`;
    return ui.card({ id: 'work-decision', title: 'Waiting for your approval', icon: 'proposed', level: 3, body });
  }
  return '';
}

function decisionMarkup(detail, model, reason) {
  if (reason) return needsYouBox(detail, model, reason);
  if (detail.item.state === 'awaiting_review') return reviewBox(detail, model);
  return statusBox(detail, model);
}

function briefMarkup(detail, model) {
  const item = detail.item;
  const text = String(item.descriptionMarkdown ?? item.description ?? '').trim();
  if (!text) return ui.card({ id: 'work-brief', title: 'Brief', level: 3, body: `<p class="subtle">${escape('The task has no description.')}</p>` });
  const long = text.length > briefLimit || text.split('\n').length > 16;
  const open = model.briefOpen;
  const toggle = long ? `<button type="button" class="button ghost sm work-brief-toggle" data-action="work-brief" aria-expanded="${open ? 'true' : 'false'}" aria-controls="work-brief-text">${icon(open ? 'chevron-up' : 'chevron-down')}<span class="button-label">${open ? 'Show less' : 'Show the full brief'}</span></button>` : '';
  const source = safeUrl(item.url) ? `<a class="button ghost sm" href="${escape(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer"><span class="button-label">Source</span>${icon('external', 'button-external')}<span class="sr-only"> (opens in a new tab)</span></a>` : '';
  return ui.card({ id: 'work-brief', title: 'Brief', level: 3, actions: source, body: `<div class="prose work-brief-text" id="work-brief-text"${long && !open ? ' data-clamped' : ''}>${markdown(text)}</div>${toggle}` });
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

function ladderCell(runs, demo, now) {
  return runs.length ? `<td>${ladderButton(runs, demo, now)}</td>` : '<td></td>';
}

function ladderList(ladder, demo, now) {
  const rounds = ladder.rounds.map(round => {
    const entries = ladder.roles.filter(role => ladder.cells[role][round].length).map(role => `<li class="work-ladder-step"><span class="work-ladder-role">${escape(role)}<span class="work-ladder-access">${ladder.writes[role] ? 'writer' : 'reader'}</span></span>${ladderButton(ladder.cells[role][round], demo, now)}</li>`).join('');
    return entries ? `<li class="work-ladder-round"><p class="overline">Round ${round}</p><ol class="work-ladder-steps">${entries}</ol></li>` : '';
  }).join('');
  return `<ol class="work-ladder-list">${rounds}</ol>`;
}

function ladderMarkup(runs, { demo, now, label }) {
  const ladder = roundLadder(runs);
  if (!ladder.roles.length) return '';
  const head = `<tr><td></td>${ladder.rounds.map(round => `<th scope="col">Round ${round}</th>`).join('')}</tr>`;
  const rows = ladder.roles.map(role => `<tr><th scope="row"><span class="work-ladder-role">${escape(role)}</span><span class="work-ladder-access">${ladder.writes[role] ? 'writer' : 'reader'}</span></th>${ladder.rounds.map(round => ladderCell(ladder.cells[role][round], demo, now)).join('')}</tr>`).join('');
  return `<div class="work-ladder-wrap"><div class="table-wrap work-ladder" role="region" tabindex="0" aria-label="${escape(label)}"><table class="round-ladder"><caption class="sr-only">${escape(label)}: Roles by Rounds</caption><thead>${head}</thead><tbody>${rows}</tbody></table></div>${ladderList(ladder, demo, now)}</div>`;
}

function shiftMeter(shift, demo, label = 'Shift budget') {
  return ui.meter({ settled: shift.spentUsd, reserved: shift.reservedUsd, authorized: shift.budgetUsd, demo, label });
}

function shiftLine(shift) {
  const when = shift.closedAt ? `closed ${ui.timeAgo(shift.closedAt)}` : `opened ${ui.timeAgo(shift.openedAt)}`;
  return `Shift ${escape(shift.id)} · ${escape(plural(shift.round, 'Round'))} · ${when} · ${escape(closeReasonLabel(shift.closeReason))}`;
}

function roundsMarkup(detail, model) {
  const shifts = detail.shifts || [];
  const demo = detail.demo;
  if (!shifts.length) {
    const legacy = detail.runs.length ? 'These Runs ran before Shifts existed, so there is no Round ladder or Shift budget.' : 'No Shift has opened yet. It opens when a worker of the Team takes the Work Item.';
    return ui.card({ id: 'work-rounds', title: 'Rounds', level: 3, body: `<p class="subtle">${escape(legacy)}</p>` });
  }
  const [current, ...earlier] = shifts;
  const currentRuns = detail.runs.filter(run => run.shiftId === current.id);
  const ladder = ladderMarkup(currentRuns, { demo, now: model.now, label: `Rounds of Shift ${current.id}` }) || `<p class="subtle">${escape('No Run has started in this Shift yet.')}</p>`;
  const older = earlier.length ? `<div class="work-shifts"><h4 class="overline">Earlier Shifts</h4><ul class="work-shift-list">${earlier.map(shift => `<li class="work-shift"><p class="work-shift-line">${shiftLine(shift)}</p>${shiftMeter(shift, demo, '')}${ui.disclosure({ summary: 'Show its Rounds', plain: true, id: `work-shift-${shift.id}`, body: ladderMarkup(detail.runs.filter(run => run.shiftId === shift.id), { demo, now: model.now, label: `Rounds of Shift ${shift.id}` }) || '<p class="subtle">No Runs.</p>' })}</li>`).join('')}</ul></div>` : '';
  const truncated = detail.truncated?.shifts ? `<p class="meta">${escape('Ploeg capped the Shift history. Earlier Shifts may be missing.')}</p>` : '';
  return `<section class="card" id="work-rounds" aria-labelledby="work-rounds-title"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-rounds-title">Rounds</h3><p class="card-subtitle">${shiftLine(current)}</p></div></header><div class="card-body work-rounds-body">${ladder}<div class="work-shift-budget">${shiftMeter(current, demo)}</div>${older}${truncated}</div></section>`;
}

function runLinks(run) {
  const links = (run.links || []).map(link => ({ url: safeUrl(link), label: linkLabel(link) })).filter(link => link.url);
  if (!links.length) return '';
  return `<div class="cluster gap-sm">${links.map(link => `<a class="chip" href="${escape(link.url)}" target="_blank" rel="noopener noreferrer">${icon(/^Pull request/.test(link.label) ? 'pull-request' : 'link')}<span>${escape(link.label)}</span><span class="sr-only"> (opens in a new tab)</span></a>`).join('')}</div>`;
}

function runBody(run, demo, now) {
  const failure = failureReason(run.failureReason);
  const parts = [];
  if (run.summary) parts.push(`<p class="work-run-summary">${escape(run.summary)}</p>`);
  if (run.stuckReason || failure) {
    const tone = run.outcome === 'stuck' ? 'attention' : failure?.tone || 'danger';
    const title = run.outcome === 'stuck' ? 'Why it is stuck' : failure ? failure.label : 'Why it failed';
    const body = `${run.stuckReason ? `<p class="work-pre">${escape(run.stuckReason)}</p>` : ''}${failure ? `<p>${escape(`Who to call: ${failure.owner}. ${failure.action}`)}</p>` : ''}`;
    parts.push(ui.callout({ tone, title, body }));
  }
  if (run.findings?.trim()) parts.push(`<div class="work-findings"><h4 class="overline">Findings</h4><div class="prose">${markdown(run.findings)}</div></div>`);
  const links = runLinks(run);
  if (links) parts.push(links);
  const time = runSeconds(run, now);
  const tokens = run.usage && (amount(run.usage.inputTokens) || amount(run.usage.outputTokens)) ? `${amount(run.usage.inputTokens) ? escape(run.usage.inputTokens.toLocaleString('nl-NL')) : '—'} in · ${amount(run.usage.outputTokens) ? escape(run.usage.outputTokens.toLocaleString('nl-NL')) : '—'} out` : null;
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

function runRow(run, { demo, now, open }) {
  const result = runResult(run);
  const time = runSeconds(run, now);
  const cost = runCost(run, demo);
  const lead = result.live ? '<span class="live-dot" aria-hidden="true"></span>' : icon(result.glyph || 'circle');
  const when = run.finishedAt || run.startedAt;
  return `<details class="work-run" id="work-run-${escape(run.id)}" data-tone="${result.tone}"${open ? ' open' : ''}><summary><span class="work-run-lead" aria-hidden="true">${lead}</span><span class="work-run-name"><strong>${escape(run.role || 'Agent')}</strong><span class="meta">${run.round ? `Round ${escape(run.round)} · ` : ''}${run.writes ? 'writer' : 'reader'}${failureReason(run.failureReason) ? ` · ${escape(failureReason(run.failureReason).label)}` : ''}</span></span>${ui.badge({ tone: result.tone, label: result.label, title: result.title, size: 'sm' })}<span class="work-run-numbers meta">${time !== null ? `<span class="num">${escape(duration(time))}</span>` : ''}${cost ? `<span class="num">${escape(cost)}</span>` : ''}${when ? ui.timeAgo(when) : ''}</span>${icon('chevron-down', 'work-run-chevron')}</summary><div class="work-run-body">${runBody(run, demo, now)}</div></details>`;
}

function runsMarkup(detail, model, reason) {
  const runs = runOrder(detail.runs);
  if (!runs.length) return ui.card({ id: 'work-runs', title: 'Runs', level: 3, body: `<p class="subtle">${escape('No Run has been recorded.')}</p>` });
  const focus = reason?.run?.id;
  const context = run => ({ demo: detail.demo, now: model.now, open: run.id === focus || run.state === 'running' });
  const shown = runs.slice(0, visibleRuns).map(run => runRow(run, context(run))).join('');
  const rest = runs.length > visibleRuns ? ui.disclosure({ summary: `Show ${runs.length - visibleRuns} more ${runs.length - visibleRuns === 1 ? 'Run' : 'Runs'}`, plain: true, id: `work-runs-more-${detail.item.id}`, body: runs.slice(visibleRuns).map(run => runRow(run, context(run))).join('') }) : '';
  const failures = runs.filter(failed).length;
  const truncated = detail.truncated?.runs ? `<p class="meta work-runs-note">${escape('Ploeg capped the Run history. Earlier Runs may be missing.')}</p>` : '';
  return `<section class="card flush" id="work-runs" aria-labelledby="work-runs-title"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-runs-title">Runs${ui.count(runs.length)}</h3><p class="card-subtitle">${escape(failures ? `${plural(failures, 'failed or stuck Run')} first, then newest first` : 'Newest first')}</p></div></header><div class="card-body"><div class="work-runs">${shown}</div>${rest ? `<div class="work-runs-rest">${rest}</div>` : ''}${truncated}</div></section>`;
}

function checkpointsMarkup(detail) {
  const checkpoints = [...(detail.checkpoints || [])].sort(newestFirst);
  if (!checkpoints.length) return '';
  const pr = safeUrl(prLink(detail));
  const branches = [...new Set(checkpoints.map(checkpoint => checkpoint.branch).filter(Boolean))];
  const shared = branches.length === 1 ? branches[0] : '';
  const items = checkpoints.map(checkpoint => {
    const phase = checkpointPhase(checkpoint.phase);
    const link = safeUrl(checkpoint.prUrl);
    const branch = !shared && checkpoint.branch ? `<span class="mono">${escape(checkpoint.branch)}</span> · ` : '';
    return `<li class="timeline-item" data-tone="${phase.tone}"><span class="timeline-marker">${icon(phase.glyph)}</span><div class="timeline-content"><span class="timeline-title">${escape(phase.label)}${link ? ` <a class="work-inline-link" href="${escape(link)}" target="_blank" rel="noopener noreferrer">${escape(linkLabel(link))}${icon('external')}<span class="sr-only"> (opens in a new tab)</span></a>` : ''}</span><span class="timeline-meta">${branch}${ui.timeAt(checkpoint.createdAt)}</span></div></li>`;
  }).join('');
  const truncated = detail.truncated?.checkpoints ? `<p class="meta">${escape('Ploeg capped the checkpoint history.')}</p>` : '';
  const subtitle = shared ? `<p class="card-subtitle">Branch <span class="mono">${escape(shared)}</span></p>` : '';
  const title = pr ? 'Pull request and checkpoints' : 'Checkpoints';
  return `<section class="card" id="work-checkpoints" aria-labelledby="work-checkpoints-title"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-checkpoints-title">${title}</h3>${subtitle}</div></header><div class="card-body"><ol class="timeline">${items}</ol>${truncated}</div></section>`;
}

function eventItem(entry, userId) {
  const meta = auditEvent(entry);
  const reason = typeof entry.detail?.reason === 'string' && entry.detail.reason && entry.action !== 'work_item.withdrawn' ? entry.detail.reason : '';
  const shiftReason = entry.action === 'shift.closed' && reason ? closeReasonLabel(reason) : '';
  return `<li class="timeline-item" data-tone="${meta.tone}"><span class="timeline-marker">${icon(meta.glyph)}</span><div class="timeline-content"><span class="timeline-title">${escape(meta.label)}${shiftReason ? `<span class="work-event-reason">: ${escape(shiftReason.charAt(0).toLowerCase() + shiftReason.slice(1))}</span>` : ''}</span>${reason && !shiftReason ? `<span class="work-event-quote">${escape(`“${reason}”`)}</span>` : ''}<span class="timeline-meta">${escape(actorName(entry.actor, { userId }))} · ${ui.timeAgo(entry.at)}</span></div></li>`;
}

function eventsMarkup(detail, model) {
  const events = [...(detail.events || [])].sort(newestFirst);
  if (!events.length) return ui.card({ id: 'work-activity', title: 'Activity', level: 3, body: `<p class="subtle">${escape('Ploeg returned no audit events for this Work Item.')}</p>` });
  const first = events.slice(0, visibleEvents).map(entry => eventItem(entry, model.userId)).join('');
  const rest = events.length > visibleEvents ? ui.disclosure({ summary: `Show ${events.length - visibleEvents} earlier events`, plain: true, id: `work-events-more-${detail.item.id}`, body: `<ol class="timeline">${events.slice(visibleEvents).map(entry => eventItem(entry, model.userId)).join('')}</ol>` }) : '';
  const raw = ui.disclosure({ summary: 'Show the raw events (JSON)', plain: true, id: `work-events-raw-${detail.item.id}`, body: `<pre class="work-raw mono">${escape(JSON.stringify(events, null, 2))}</pre>` });
  const truncated = detail.truncated?.events ? `<p class="meta">${escape('Ploeg capped the audit history. Earlier events may be missing.')}</p>` : '';
  return `<section class="card" id="work-activity" aria-labelledby="work-activity-title"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-activity-title">Activity${ui.count(events.length)}</h3><p class="card-subtitle">${escape('Ploeg’s audit log for this Work Item, newest first')}</p></div></header><div class="card-body work-activity-body"><ol class="timeline">${first}</ol>${rest}${raw}${truncated}</div></section>`;
}

function technicalMarkup(detail) {
  const item = detail.item;
  const shift = latestShift(detail);
  const pairs = [
    ['Work Item', `<span class="mono">${escape(item.id)}</span>`],
    ['Tracker', `${escape(trackerName(item.provider) || item.provider || '—')} · <span class="mono">${escape(item.externalId || '—')}</span>`],
    ['Revision', item.revision ? `<span class="mono">${escape(item.revision)}</span>` : null],
    ['Team', escape(item.team)],
    ['Priority', amount(item.priority) ? `${escape(item.priority)} <span class="subtle">(set in the tracker)</span>` : null],
    ['Repository', item.target ? `${escape(item.target.forge)} · ${escape(repoName(item.target))} → ${escape(item.target.baseBranch)}` : item.provider === 'manual' ? 'Registered in a Vloer session' : '<span class="subtle">Not routed</span>'],
    ['Attempts', `${escape(item.attempts ?? '—')} agent · ${escape(item.infraFailures ?? '—')} infrastructure`],
    ['Next eligible', item.nextEligibleAt ? ui.timeAt(item.nextEligibleAt) : null],
    ['Lease', item.lease ? `renewed ${ui.timeAt(item.lease.renewedAt)} · expires ${ui.timeAt(item.lease.expiresAt)}` : null],
    ['Shift', shift ? `<span class="mono">${escape(shift.id)}</span>${shift.branch ? ` · <span class="mono">${escape(shift.branch)}</span>` : ''}${shift.closeReason ? ` · <span class="mono">${escape(shift.closeReason)}</span>` : ''}` : null],
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
  if (result.error) return ui.callout({ tone: 'danger', title: 'Ploeg did not cancel this Work Item', body: `<p>${escape(result.error)}</p>` });
  const summary = cancelSummary(result);
  return ui.callout({ tone: summary.tone, title: summary.title, body: `<ul class="work-cancel-lines">${summary.lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul>` });
}

/** The Work Item detail: header, the decision box for its state, the brief, Rounds, Runs, checkpoints, activity and technical details. */
export function detailMarkup(detail, model) {
  const reason = detailReason(detail);
  const parts = [
    headerMarkup(detail, model, reason),
    cancelResultMarkup(model),
    decisionMarkup(detail, model, reason),
    sessionsMarkup(detail, model.sessions),
    briefMarkup(detail, model),
    roundsMarkup(detail, model),
    runsMarkup(detail, model, reason),
    checkpointsMarkup(detail),
    eventsMarkup(detail, model),
    technicalMarkup(detail),
    actionButtons(detail, model, { phone: true }),
  ];
  return `<article class="work-detail" aria-labelledby="ploeg-item-title">${parts.filter(Boolean).join('')}</article>`;
}

function detailSkeleton() {
  return `<div class="work-detail work-detail-loading" aria-busy="true"><div class="card">${ui.skeleton({ rows: 3, variant: 'text' })}</div><div class="card">${ui.skeleton({ rows: 4, variant: 'text' })}</div><div class="card">${ui.skeleton({ rows: 3, variant: 'list' })}</div></div>`;
}

function detailError(model) {
  const missing = model.detailError?.code === 'ploeg_not_found';
  const back = `<a class="button secondary" href="${escape(model.listHref)}">${icon('chevron-left')}<span class="button-label">Back to the list</span></a>`;
  const retry = missing ? '' : '<button type="button" class="button secondary" data-action="work-detail-retry">Try again</button>';
  return `<div class="work-detail"><div class="card">${ui.emptyState({ icon: missing ? 'search' : 'x-circle', tone: missing ? 'neutral' : 'danger', title: missing ? 'This Work Item is not in your Teams' : 'Could not load this Work Item', body: `<p role="alert">${escape(missing ? `Ploeg has no Work Item ${model.detailId} in the Teams your account can read.` : model.detailError?.message || 'Ploeg did not answer.')}</p>`, actions: `${retry}${back}` })}</div></div>`;
}

/**
 * The whole Work page body for `model`: the demo note, the toolbar (Team, lane, refresh), a partial-data notice,
 * the list, and the Work Item detail beside it (wide) or instead of it (narrow).
 * `model` = { data, lane, team, loading, refreshing, loadingMore, detailId, detail, detailLoading, detailError,
 * listHref, canCancel, cancelBusy, cancelResult, briefOpen, sessions, userId, trackerUrl, now }.
 */
export function workMarkup(model) {
  const data = model.data;
  const hasDetail = Boolean(model.detailId);
  const demo = data?.demo || model.detail?.demo ? ui.demoNote(data?.message || 'Illustrative Ploeg records. No Run executed, no model was called and spend is US$ 0,00.') : '';
  let list;
  if (!data) list = listSkeleton();
  else if (!data.available) list = unavailableMarkup(model);
  else list = `${partialNotice(data)}${listMarkup(model)}`;
  const detail = !hasDetail ? '' : model.detail ? detailMarkup(model.detail, model) : model.detailError ? detailError(model) : detailSkeleton();
  return `<div class="work"${hasDetail ? ' data-detail' : ''}>${demo}${toolbarMarkup(model)}<div class="work-layout"><div class="work-list-pane">${list}</div>${hasDetail ? `<div class="work-detail-pane">${detail}</div>` : ''}</div></div>`;
}

/**
 * The confirm dialog for cancelling a Work Item: what Ploeg does (stops running Runs, blocks their model keys,
 * revokes the forge tokens, comments on the tracker task), the spend so far, and that only the tracker can start it
 * again. In the demo it explains that nothing runs and the confirm button is disabled.
 */
export function cancelDialogMarkup(detail, { demo = false } = {}) {
  const item = detail.item;
  const shift = latestShift(detail);
  const running = detail.runs.filter(run => run.state === 'running').length;
  const pending = detail.runs.filter(run => run.state === 'pending').length;
  const tracker = trackerName(item.provider) || 'its tracker';
  const consequences = [
    ['stop', running ? `Stops ${plural(running, 'running Run')}${pending ? ` and cancels ${plural(pending, 'waiting Run')}` : ''}.` : pending ? `Cancels ${plural(pending, 'waiting Run')}.` : 'Stops any Run that starts before Ploeg handles the cancel.'],
    ['lock', 'Blocks the model keys of those Runs, so they cannot spend more.'],
    ['shield', 'Revokes the forge tokens Ploeg issued for them.'],
    ['send', `Comments on the task in ${tracker} that the work was cancelled.`],
  ];
  const list = `<ul class="work-consequences">${consequences.map(([glyph, text]) => `<li>${icon(glyph)}<span>${escape(text)}</span></li>`).join('')}</ul>`;
  const spend = shift ? ui.dl([['Spend so far', shiftMeter(shift, demo, '')]], { rows: true }) : '';
  const note = demo
    ? ui.callout({ tone: 'neutral', title: 'Not available in the demo', body: `<p>${escape('Nothing runs here, so there is nothing to cancel. In a live workbench this button asks Ploeg to do the above.')}</p>` })
    : ui.callout({ tone: 'attention', title: 'This cannot be undone', body: `<p>${escape(`The Work Item becomes Withdrawn. To try again later, assign the task to the Team again in ${tracker}.`)}</p>` });
  return `<form method="dialog" class="work-cancel-form"><header class="dialog-header"><h2 id="confirm-title">Cancel this Work Item?</h2><button type="submit" class="button ghost icon-only sm" value="keep" aria-label="Close" title="Close">${icon('x')}</button></header><div class="dialog-body"><p><strong>${escape(item.title || `Work Item ${item.id}`)}</strong> <span class="subtle">${escape(workItemRef(item))}</span></p><p>${escape('Ploeg then:')}</p>${list}${spend}${note}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="keep" autofocus>Keep it</button><button type="submit" class="button danger" value="cancel"${demo ? ' disabled' : ''}>Cancel Work Item</button></footer></form>`;
}
