import { escape, safeUrl } from './core/dom.js';
import { icon } from './core/icons.js';
import * as format from './core/format.js';
import { runOutcome, verdict as verdictMeta, failureReason, workItemState, tileDetail, unreportedOutcome } from './core/states.js';
import { listReason, reasonGlyph, routingWarning, needsYouBlocks } from './core/reasons.js';
import { workItemRef, reasonBand } from './ploeg.js';
import { grafanaTeam } from './core/observability.js';
import { badge, button, callout, count, emptyState, iconButton, kbd, listRow, meter, skeleton, stat, demoNote, ploegUnconfigured } from './core/ui.js';

/** How long the Now page must be out of sight before the digest starts a new "since" period. */
export const awayAfter = 30 * 60 * 1000;

/** How many finished Runs the Now page lists; the rest are one link away on Runs. */
export const recentLimit = 6;

/** How many rows a waiting group lists before it points to the rest in Work or Proposed. */
export const groupLimit = 8;

/** How many Runs one page of `GET /api/ploeg/runs` holds, which is what Now receives per Run group: the demo pages by 10, a live Ploeg by 25. */
export const runPage = { demo: 10, live: 25 };

/**
 * Whether a Run group of the Now response may hold more Runs than it lists: the server says so (`<group>Truncated`),
 * or, when it does not, the list fills a whole page.
 * @param {object} data
 * @param {'recent'|'running'} group
 * @returns {boolean}
 */
export function mayHoldMore(data, group) {
  const flag = data?.[`${group}Truncated`];
  if (typeof flag === 'boolean') return flag;
  const list = Array.isArray(data?.[group]) ? data[group] : [];
  return list.length >= (data?.demo ? runPage.demo : runPage.live);
}

/** How many rows each reason group of Needs you lists before it points to the rest in Work. */
export const subgroupLimit = 3;

const groups = [
  { id: 'review', state: 'awaiting_review', title: 'Ready for your review', hint: 'Open the pull request, then merge or ask for changes in the forge.', empty: 'No pull request waits for your review.', tone: 'review', glyph: 'pull-request', more: '#work?lane=awaiting_review', place: 'Work' },
  { id: 'needs', state: 'needs_human', title: 'Needs you', hint: 'Ploeg stopped. Fix the cause, then assign the task to the Team again.', empty: 'Ploeg is not stuck on anything.', tone: 'attention', glyph: 'alert', more: '#work?lane=needs_human', place: 'Work' },
  { id: 'proposed', state: 'proposed', title: 'Proposed', hint: 'Agents found this work. Nothing runs until you approve it.', empty: 'No proposal waits for a decision.', tone: 'neutral', glyph: 'proposed', more: '#proposed', place: 'Proposed' },
];
const origins = { split: 'Split from', clarify: 'Clarifies', discovered: 'Found while working on' };
const kinds = { split: 'Split from other work.', clarify: 'Asks to clarify other work.', discovered: 'Found along the way.' };
const infrastructure = new Set(['writing_run_killed_repeatedly', 'stale_infrastructure']);
const amount = value => typeof value === 'number' && Number.isFinite(value);
const moment = value => { const time = typeof value === 'number' ? value : Date.parse(value ?? ''); return Number.isFinite(time) ? time : null; };
const after = (value, since) => since !== null && moment(value) !== null && moment(value) > since;
const retryButton = id => `<button type="button" class="button secondary sm" id="now-retry-${id}" data-action="now-retry">${icon('refresh')}<span class="button-label">Try again</span></button>`;
const showNew = (group, text) => `<button type="button" class="now-new" id="now-show-new-${group}" data-action="now-show-new">${icon('refresh')}<span>${escape(text)} · Show</span></button>`;

function joinDots(parts) {
  const shown = parts.filter(part => part && (typeof part === 'string' || part.html));
  if (!shown.length) return '';
  const item = part => typeof part === 'string' ? `<span>${part}</span>` : `<span class="${part.class}">${part.html}</span>`;
  return `<span class="now-facts"><span class="now-facts-list">${shown.map(item).join('')}</span></span>`;
}

function timeTag(value, text) {
  const at = moment(value);
  if (at === null) return escape(text);
  return `<time class="num" datetime="${escape(new Date(at).toISOString())}" title="${escape(format.dateTime(at))}">${escape(text)}</time>`;
}

function elapsedTag(started, now) {
  const seconds = Math.max(0, Math.round((now - started) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  const iso = `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${rest || (!hours && !minutes) ? `${rest}S` : ''}`;
  return `<time class="num" datetime="${iso}" title="${escape(`Started ${format.dateTime(started)}`)}">${escape(format.duration(seconds))}</time>`;
}

export { reasonGlyph };

/**
 * The baseline of the "Since you were away" digest. The first arrival in a browser tab starts from the last
 * time Now was seen (`lastVisit`, null on a first visit); later arrivals keep the current baseline unless Now
 * was out of sight for at least `awayAfter` milliseconds.
 * @param {{ current?: string|null, lastVisit?: string|null, now?: number, away?: number }} input
 * @returns {string|null}
 */
export function nextBaseline({ current, lastVisit = null, now = Date.now(), away = awayAfter } = {}) {
  const last = moment(lastVisit);
  let baseline = current === undefined ? (last === null ? null : lastVisit) : current;
  const known = moment(baseline);
  if (last !== null && now - last >= away && (known === null || last > known)) baseline = lastVisit;
  return baseline ?? null;
}

function sinceText(start, now) {
  const clock = format.time(start);
  if (format.date(start) === format.date(now)) return clock;
  if (format.date(start) === format.date(now - 86400000)) return `yesterday ${clock}`;
  return format.dateTime(start);
}

/**
 * Names the start of a digest period: "Since 09:12" today, "Since yesterday 22:10", otherwise
 * "Since 28-09-2026 22:10". Empty for a missing or invalid moment.
 * @param {string|number|null} since
 * @param {number} [now]
 * @returns {string}
 */
export function sinceLabel(since, now = Date.now()) {
  const start = moment(since);
  return start === null ? '' : `Since ${sinceText(start, now)}`;
}

/**
 * Counts what changed after `since` in a `GET /api/ploeg/now` response: Work Items that became ready for
 * review or started needing you (by `updatedAt`), proposals created, and finished Runs. A group that failed
 * to load counts as null. `finishedCapped` is true when every listed Run is newer and the list may hold more
 * (see `mayHoldMore`), so the real number may be higher.
 * @param {object} data
 * @param {string|null} since
 * @returns {{ review: number|null, needsYou: number|null, proposed: number|null, finished: number|null, finishedCapped: boolean }}
 */
export function digestCounts(data, since) {
  const start = moment(since);
  const waiting = !data?.errors?.waiting && Array.isArray(data?.waiting) ? data.waiting : null;
  const recent = !data?.errors?.recent && Array.isArray(data?.recent) ? data.recent : null;
  const fresh = (state, field = 'updatedAt') => waiting ? waiting.filter(entry => entry.state === state && after(entry[field], start)).length : null;
  const finished = recent ? recent.filter(run => after(run.finishedAt, start)).length : null;
  const finishedCapped = Boolean(recent?.length) && finished === recent.length && mayHoldMore(data, 'recent');
  return { review: fresh('awaiting_review'), needsYou: fresh('needs_human'), proposed: fresh('proposed', 'createdAt'), finished, finishedCapped };
}

/** The ids on screen: every waiting Work Item and finished Run of `data`. */
export function shownIds(data) {
  return { waiting: new Set((data?.waiting || []).map(entry => entry.id)), recent: new Set((data?.recent || []).map(run => run.id)) };
}

/**
 * Keeps the list still during a live refresh: waiting Work Items and finished Runs that `shown` does not
 * list yet are held back and counted, rows already on screen update in place and rows that left disappear.
 * `shown` null shows everything. A group that shows nothing yet takes new rows directly.
 * @param {object|null} data
 * @param {{ waiting: Set<string>, recent: Set<string> }|null} shown
 * @returns {{ data: object|null, held: { waiting: number, recent: number } }}
 */
export function visibleNow(data, shown) {
  if (!data || !shown) return { data, held: { waiting: 0, recent: 0 } };
  const keep = (list, ids) => {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.some(entry => ids.has(entry.id))) return { rows, held: 0 };
    const visible = rows.filter(entry => ids.has(entry.id));
    return { rows: visible, held: rows.length - visible.length };
  };
  const waiting = keep(data.waiting, shown.waiting);
  const recent = keep(data.recent, shown.recent);
  return { data: { ...data, waiting: waiting.rows, recent: recent.rows }, held: { waiting: waiting.held, recent: recent.held } };
}

/** The pull request or tracker link that `o` opens for a waiting Work Item, or null. */
export function openTarget(entry) {
  const pr = entry?.state === 'awaiting_review' ? safeUrl(entry.pullRequestUrl) : null;
  if (pr) return { href: pr, label: 'pull request' };
  const tracker = safeUrl(entry?.url);
  return tracker ? { href: tracker, label: 'tracker item' } : null;
}

/** Finished Runs newest first by the moment they finished; Runs without a finish time keep their order at the end. */
export function byFinish(runs) {
  return (runs || []).map((run, index) => ({ run, index, at: moment(run.finishedAt) })).sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.index - b.index).map(entry => entry.run);
}

function repository(target) {
  if (!target?.repo) return null;
  const full = target.owner ? `${target.owner}/${target.repo}` : target.repo;
  const title = target.baseBranch ? `${full}, base branch ${target.baseBranch}` : full;
  return { class: 'now-repo', html: `${icon('branch')}<span title="${escape(title)}">${escape(full)}</span>` };
}

function reference(entry) {
  return entry.externalId || entry.provider === 'ploeg' ? `<span class="now-ref">${escape(workItemRef(entry))}</span>` : '';
}

function shiftSpend(entry, demo) {
  if (demo) return '';
  const shift = entry.latestShift;
  const spent = shift ? shift.spentUsd : entry.spentUsd;
  if (!amount(spent)) return 'Spend not reported';
  return amount(shift?.budgetUsd) && shift.budgetUsd > 0 ? `${format.moneyHtml(spent)} of ${format.moneyHtml(shift.budgetUsd)}` : `${format.moneyHtml(spent)} spent`;
}

function latestVerdict(entry, runs) {
  const run = byFinish(runs).find(candidate => candidate.workItemId === entry.id && candidate.verdict && candidate.verdict !== 'none');
  return run ? verdictMeta(run.verdict) : null;
}

function chipMarkup({ label, tone, glyph, title, secondary = false }) {
  return `<span class="chip${secondary ? ' now-warning' : ''}" data-tone="${tone}"${title ? ` title="${escape(title)}"` : ''}>${glyph ? icon(glyph) : ''}<span>${escape(label)}</span></span>`;
}

function origin(entry) {
  if (entry.sourceTitle) return `${origins[entry.createdKind] || 'From'} “${entry.sourceTitle}”.`;
  return kinds[entry.createdKind] || '';
}

function whyLine(entry, reason, warning, grouped) {
  if (grouped) return '';
  let text = '';
  let full = '';
  if (reason) {
    text = reason.fix;
    full = [reason.sentence, reason.action, warning?.sentence].filter(Boolean).join(' ');
  } else if (entry.state === 'proposed') {
    text = origin(entry);
    full = [origin(entry), warning?.sentence].filter(Boolean).join(' ');
  } else if (warning) {
    text = warning.fix;
    full = warning.sentence;
  }
  if (!text) return '';
  return `<span class="now-why${reason ? ' now-why-fix' : ''}" title="${escape(full)}">${escape(text)}</span>`;
}

function waitingMeta(entry, context, { reason, warning, grouped }) {
  const chips = [];
  if (reason && !grouped) chips.push(chipMarkup({ label: reason.chip, tone: reason.tone, title: `${reason.sentence} ${reason.action}` }));
  if (entry.state === 'proposed' && entry.ready === false) chips.push(chipMarkup({ label: 'Needs refinement', tone: 'attention', title: 'Not Ready yet: the brief needs refining before an agent can pick it up.' }));
  if (warning) chips.push(chipMarkup({ label: warning.chip, tone: warning.tone, glyph: warning.glyph, title: warning.sentence, secondary: true }));
  const review = entry.state === 'awaiting_review' ? latestVerdict(entry, context.runs) : null;
  const verdict = review ? badge({ tone: review.tone, glyph: review.glyph, label: review.short, title: `${review.label}. Agent review is evidence, not a human review.`, size: 'sm' }) : '';
  const round = entry.state !== 'proposed' && entry.latestShift?.round ? { class: 'now-round', html: `Round ${escape(entry.latestShift.round)}` } : null;
  const spend = entry.state === 'awaiting_review' ? shiftSpend(entry, context.demo) : '';
  const facts = joinDots([escape(entry.team), reference(entry), entry.state === 'proposed' ? null : repository(entry.target), round, spend]);
  return `${verdict}${chips.join('')}${facts}${whyLine(entry, reason, warning, grouped)}`;
}

function linkIcon(id, href, glyph, label) {
  return iconButton({ id, icon: glyph, label, href, external: true, size: 'sm' });
}

function waitingActions(entry, context, reason) {
  const title = entry.title || `Work Item ${entry.id}`;
  let primary = '';
  const pr = entry.state === 'awaiting_review' ? safeUrl(entry.pullRequestUrl) : null;
  if (pr) primary = button({ id: `now-pr-${entry.id}`, label: 'Pull request', icon: 'pull-request', size: 'sm', href: pr, external: true, ariaLabel: `Open the pull request for “${title}” (opens in a new tab)` });
  if (entry.state === 'proposed') primary = button({ id: `now-decide-${entry.id}`, label: 'Approve or reject', icon: 'arrow', size: 'sm', href: `#proposed?id=${encodeURIComponent(entry.id)}`, ariaLabel: `Approve or reject “${title}” on Proposed` });
  const links = [];
  const tracker = safeUrl(entry.url);
  if (tracker) links.push(linkIcon(`now-tracker-${entry.id}`, tracker, 'external', `Open “${title}” in the tracker`));
  const grafana = reason && infrastructure.has(reason.code) ? grafanaTeam(entry.team, context.grafanaUrl) : null;
  if (grafana) links.push(linkIcon(`now-grafana-${entry.id}`, grafana, 'activity', `Open Grafana for the ${entry.team} Team`));
  return `<div class="now-item-actions"${primary ? ' data-primary' : ''}><span class="now-action-primary">${primary}</span><span class="now-action-links">${links.join('')}</span></div>`;
}

function waitingRow(entry, context, grouped = false) {
  const reason = listReason(entry, { demo: context.demo });
  const warning = routingWarning(entry);
  const meta = workItemState(entry.state);
  const target = openTarget(entry);
  const created = entry.state === 'proposed';
  const when = created ? entry.createdAt : entry.updatedAt;
  const unread = context.dots && after(when, context.since);
  const row = listRow({
    href: `#work/${entry.id}`,
    id: `now-row-w-${entry.id}`,
    tone: reason?.tone || meta.tone,
    lead: icon(reason ? reasonGlyph(reason) : meta.glyph),
    title: entry.title || `Work Item ${entry.id}`,
    meta: waitingMeta(entry, context, { reason, warning, grouped }),
    trail: when ? `<span class="now-when"><span class="now-when-label">${created ? 'Created' : 'Updated'} </span>${format.timeHtml(when, { now: context.now })}</span>` : '',
    data: { nowRow: true, openUrl: target?.href, openLabel: target?.label, unread: unread || null },
  });
  return `<li class="now-item">${row}${waitingActions(entry, context, reason)}</li>`;
}

function moreRow(hidden, group) {
  if (hidden < 1) return '';
  return `<li class="now-item now-more-item"><a class="now-more" href="${escape(group.more)}">${escape(`Show ${format.count(hidden)} more in ${group.place}`)}${icon('chevron')}</a></li>`;
}

function staleRow(stale) {
  if (!amount(stale) || stale < 1) return '';
  const subject = stale === 1 ? '1 Work Item stopped retrying after repeated failures.' : `${format.count(stale)} Work Items stopped retrying after repeated failures.`;
  const row = listRow({ href: '#work?lane=all', id: 'now-stale-open', tone: 'severe', lead: icon('clock'), title: subject, trail: `<span class="now-go"><span class="now-go-text">See ${stale === 1 ? 'it' : 'them'} in Work</span>${icon('chevron')}</span>` });
  return `<li class="now-item now-stale">${row}</li>`;
}

function errorState(id, title, message) {
  return emptyState({ icon: 'x-circle', tone: 'danger', compact: true, title, body: escape(message), actions: retryButton(id) });
}

function staleCount(view) {
  if (view.data.waiting.some(entry => entry.state === 'stale')) return 0;
  const stale = view.summary?.data?.totals?.workItems?.stale;
  return amount(stale) ? stale : 0;
}

function allClear(view, now) {
  const data = view.data;
  const running = data.errors?.running ? null : data.running.length;
  const last = (data.errors?.recent ? [] : data.recent).map(run => moment(run.finishedAt)).filter(value => value !== null).sort((a, b) => b - a)[0];
  const parts = [];
  if (running) parts.push(`${escape(format.plural(running, 'Run'))} ${running === 1 ? 'is' : 'are'} working`);
  else if (running === 0) parts.push('No Run is working right now');
  if (last) parts.push(`the last Run finished ${format.timeHtml(last, { now })}`);
  const queued = view.summary?.data?.totals?.workItems?.queued;
  if (!running && amount(queued) && queued > 0) parts.push(`${escape(format.plural(queued, 'Work Item'))} ${queued === 1 ? 'is' : 'are'} queued`);
  const sentence = parts.length ? `${parts.join('; ')}.` : 'Ploeg handles the rest and shows new decisions here first.';
  return emptyState({ icon: 'check-circle', tone: 'success', title: 'Nothing waits on you', body: sentence[0].toUpperCase() + sentence.slice(1) });
}

function groupHeader(group, total, id) {
  return `<header class="now-group-header" data-tone="${group.tone}"><h3 class="now-group-title" id="${id}">${icon(group.glyph)}<span>${escape(group.title)}</span>${total ? count(total) : ''}</h3>${total ? `<p class="now-group-hint">${escape(group.hint)}</p>` : ''}</header>`;
}

function needsMarkup(rows, group, context, id) {
  const blocks = needsYouBlocks(rows, { demo: context.demo });
  const flat = blocks.filter(block => !block.grouped).flatMap(block => block.items);
  const shown = flat.slice(0, groupLimit);
  const stale = staleRow(context.stale);
  const list = shown.length || stale ? `<ul class="list now-list" aria-labelledby="${id}">${shown.map(entry => waitingRow(entry, context)).join('')}${moreRow(flat.length - shown.length, group)}${stale}</ul>` : '';
  const bands = blocks.filter(block => block.grouped).map(block => {
    const bandId = `now-reason-${block.reason.code}`;
    const first = block.items.slice(0, subgroupLimit);
    return `<div class="now-band" role="group" aria-labelledby="${bandId}">${reasonBand(block.reason, block.items.length, bandId)}<ul class="list now-list" aria-labelledby="${bandId}">${first.map(entry => waitingRow(entry, context, true)).join('')}${moreRow(block.items.length - first.length, group)}</ul></div>`;
  }).join('');
  return `${list}${bands}`;
}

function groupMarkup(group, rows, context) {
  const id = `now-group-${group.id}`;
  const stale = group.id === 'needs' ? staleRow(context.stale) : '';
  const banded = group.id === 'needs' && needsYouBlocks(rows, { demo: context.demo }).some(block => block.grouped);
  let body;
  if (group.id === 'needs' && (rows.length || stale)) body = needsMarkup(rows, group, context, id);
  else if (rows.length || stale) {
    const shown = rows.slice(0, groupLimit);
    body = `<ul class="list now-list" aria-labelledby="${id}">${shown.map(entry => waitingRow(entry, context)).join('')}${stale}${moreRow(rows.length - shown.length, group)}</ul>`;
  } else body = `<p class="now-group-empty">${escape(group.empty)}</p>`;
  return `<div class="now-group" data-group="${group.id}"${banded ? ' data-split' : ''} role="group" aria-labelledby="${id}">${groupHeader(group, rows.length, id)}${body}</div>`;
}

function waitingCard(view, visible, held, context) {
  const error = view.data.errors?.waiting;
  const total = error ? null : view.data.waiting.length;
  const pill = held.waiting ? showNew('waiting', format.plural(held.waiting, 'new Work Item')) : '';
  const hints = context.singleKeys && !error && total ? `<p class="now-keys" aria-hidden="true">${kbd(['j', 'k'])}<span>move</span>${kbd('o')}<span>open PR or tracker</span></p>` : '';
  const stale = error ? 0 : staleCount(view);
  const rows = visible.waiting;
  const allNew = rows.length > 0 && rows.every(entry => after(entry.state === 'proposed' ? entry.createdAt : entry.updatedAt, context.since));
  const local = { ...context, stale, dots: !allNew };
  let body;
  if (error) body = errorState('waiting', 'Could not load what waits on you', error);
  else if (!rows.length && !held.waiting) body = `${allClear(view, context.now)}${stale ? `<ul class="list now-list now-after-clear">${staleRow(stale)}</ul>` : ''}`;
  else body = groups.map(group => groupMarkup(group, rows.filter(entry => entry.state === group.state || (group.id === 'needs' && !['awaiting_review', 'proposed'].includes(entry.state))), local)).join('');
  return `<section class="card flush now-card now-waiting" aria-labelledby="now-waiting-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-waiting-title">Waiting on you${total ? count(total, { tone: 'attention' }) : ''}</h2></div>${hints ? `<div class="card-actions">${hints}</div>` : ''}</header><div class="card-body">${pill}${body}</div></section>`;
}

function runningRow(run, context) {
  const models = run.reservedModels?.length ? run.reservedModels : run.usage?.models || [];
  const started = moment(run.startedAt);
  const facts = joinDots([escape(run.team), run.role ? escape(run.role) : '', run.round ? `Round ${escape(run.round)}` : '', models.length ? escape(models.join(', ')) : '']);
  const spend = meter({ settled: run.observedUsd, authorized: run.authorizedUsd, demo: context.demo, label: '', size: 'sm', observed: true });
  const elapsed = started === null ? '<span class="now-when">Not started</span>' : elapsedTag(started, context.now);
  return `<li><a class="list-row now-run" href="#work/${escape(run.workItemId)}" id="now-row-r-${escape(run.id)}" data-tone="live" data-now-row><span class="list-row-lead"><span class="live-dot" aria-hidden="true"></span></span><div class="list-row-main"><span class="list-row-title">${escape(run.workItemTitle || `Work Item ${run.workItemId}`)}</span><span class="list-row-meta">${facts}</span><div class="now-run-meter">${spend}</div></div><span class="list-row-trail num">${elapsed}</span></a></li>`;
}

function runningCard(view, context) {
  const data = view.data;
  const error = data.errors?.running;
  const runs = data.running;
  let body;
  if (error) body = errorState('running', 'Could not load what is running', error);
  else if (!runs.length) {
    const queued = view.summary?.data?.totals?.workItems?.queued;
    const pending = view.summary?.data?.totals?.runs?.pending;
    const detail = amount(pending) && pending > 0 ? `${format.plural(pending, 'Run')} ${pending === 1 ? 'waits' : 'wait'} for a worker.` : amount(queued) && queued > 0 ? `${format.plural(queued, 'Work Item')} ${queued === 1 ? 'is' : 'are'} queued.` : 'Nothing is queued either.';
    body = emptyState({ icon: 'runs', compact: true, title: 'No Run is working', body: escape(detail) });
  } else body = `<ul class="list now-list">${runs.map(run => runningRow(run, context)).join('')}</ul>`;
  const total = error ? 0 : runs.length;
  return `<section class="card flush now-card now-running" aria-labelledby="now-running-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-running-title">Running now${total ? count(total, { tone: 'live' }) : ''}</h2></div><div class="card-actions">${button({ id: 'now-running-all', label: 'View all', size: 'sm', variant: 'ghost', href: '#runs?state=running', ariaLabel: 'View all running Runs' })}</div></header><div class="card-body">${body}</div></section>`;
}

function recentRow(run, context) {
  const outcome = runOutcome(run.outcome);
  const tone = outcome?.tone || 'neutral';
  const failure = failureReason(run.failureReason);
  const verdict = run.verdict && run.verdict !== 'none' ? verdictMeta(run.verdict) : null;
  const unread = context.dots && after(run.finishedAt, context.since);
  const none = outcome ? null : unreportedOutcome(run);
  const facts = joinDots([
    `<span class="now-outcome" data-tone="${tone}">${escape(outcome?.label || none.label)}</span>`,
    failure ? escape(failure.label) : '',
    run.role ? escape(run.role) : '',
    run.round ? `Round ${escape(run.round)}` : '',
  ]);
  const agentReview = verdict ? badge({ tone: verdict.tone, glyph: verdict.glyph, label: verdict.short, title: `${verdict.label}. Agent review is evidence, not a human review.`, size: 'sm' }) : '';
  return `<li>${listRow({ href: `#work/${run.workItemId}`, id: `now-row-f-${run.id}`, tone, lead: icon(outcome?.glyph || 'circle-slash'), title: run.workItemTitle || `Work Item ${run.workItemId}`, meta: `${agentReview}${facts}`, trail: format.timeHtml(run.finishedAt, { now: context.now }), data: { nowRow: true, unread: unread || null } })}</li>`;
}

function recentCard(view, visible, held, context) {
  const error = view.data.errors?.recent;
  const runs = byFinish(visible.recent).slice(0, recentLimit);
  const pill = held.recent ? showNew('recent', `${format.count(held.recent)} new`) : '';
  const allNew = runs.length > 0 && runs.every(run => after(run.finishedAt, context.since));
  const local = { ...context, dots: !allNew };
  let body;
  if (error) body = errorState('recent', 'Could not load finished Runs', error);
  else if (!runs.length) body = emptyState({ icon: 'clock', compact: true, title: 'No Run has finished yet', body: 'Finished Runs appear here with their outcome and the agent’s review verdict.' });
  else body = `<ul class="list now-list">${runs.map(run => recentRow(run, local)).join('')}</ul>`;
  return `<section class="card flush now-card now-recent" aria-labelledby="now-recent-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-recent-title">Recently finished</h2></div><div class="card-actions">${button({ id: 'now-recent-all', label: 'View all', size: 'sm', variant: 'ghost', href: '#runs?state=finished', ariaLabel: 'View all finished Runs' })}</div></header><div class="card-body">${pill}${body}</div></section>`;
}

function digestItem(value, singular, pluralForm, tone, more = false) {
  if (!value) return '';
  return `<li class="now-digest-item"><span class="status-dot" data-tone="${tone}" aria-hidden="true"></span><strong class="num">${escape(format.count(value))}${more ? '+' : ''}</strong> ${escape(value === 1 ? singular : pluralForm)}</li>`;
}

function digestFrame(kind, glyph, title, body, action = '') {
  return `<section class="now-digest" data-kind="${kind}"><span class="now-digest-icon" aria-hidden="true">${icon(glyph)}</span><div class="now-digest-text"><h2 class="now-digest-title" id="now-digest-title">${title}</h2> ${body}</div>${action ? `<div class="now-digest-actions">${action}</div>` : ''}</section>`;
}

function digestMarkup(view, since, now) {
  const data = view.data;
  const waiting = data.errors?.waiting ? null : data.waiting.length;
  if (since === null) return digestFrame('welcome', 'spark', 'Welcome to De Vloer', '<p class="now-digest-body">From your next visit, this line sums up what changed while you were away.</p>');
  const start = moment(since);
  const counts = digestCounts(data, since);
  const items = [
    digestItem(counts.review, 'ready for review', 'ready for review', 'review'),
    digestItem(counts.needsYou, 'needs you', 'need you', 'attention'),
    digestItem(counts.proposed, 'proposed', 'proposed', 'neutral'),
    digestItem(counts.finished, 'Run finished', 'Runs finished', 'success', counts.finishedCapped),
  ].filter(Boolean);
  const unknown = [counts.review, counts.finished].some(value => value === null);
  if (!items.length) {
    const still = waiting === null ? '' : waiting === 0 ? 'Nothing waits on you.' : `${format.plural(waiting, 'Work Item')} still ${waiting === 1 ? 'waits' : 'wait'} on you.`;
    const title = view.caughtUp ? `Marked as read at ${timeTag(start, format.time(start))}` : `Nothing new since ${timeTag(start, sinceText(start, now))}`;
    const body = [still, unknown ? 'Some changes could not be loaded.' : ''].filter(Boolean).join(' ');
    return digestFrame('quiet', 'check-circle', title, body ? `<p class="now-digest-body">${escape(body)}</p>` : '');
  }
  const heading = `Since ${timeTag(start, sinceText(start, now))}<span class="now-digest-ago"> · ${format.timeHtml(start, { now })}</span>`;
  const list = `<ul class="now-digest-list">${items.join('')}${unknown ? '<li class="now-digest-item now-digest-unknown">Some changes could not be loaded</li>' : ''}</ul>`;
  const caughtUp = `<button type="button" class="button ghost sm" id="now-caught-up" title="Mark as caught up" data-action="now-caught-up">${icon('check')}<span class="button-label">Mark as caught up</span></button>`;
  return digestFrame('changes', 'spark', heading, list, caughtUp);
}

function tile({ label, glyph, tone, value, detail, href, quiet = false }) {
  return stat({ label, icon: glyph, tone, value, detailHtml: detail, href, quiet, className: 'now-stat' });
}

function statsMarkup(view) {
  const data = view.data;
  const demo = Boolean(data.demo || view.summary?.data?.demo);
  const summary = view.summary?.data || null;
  const summaryError = view.summary?.error || null;
  const waiting = data.errors?.waiting ? null : data.waiting;
  const running = data.errors?.running ? null : data.running;
  const inState = state => waiting.filter(entry => entry.state === state).length;
  const breakdown = waiting ? [[inState('awaiting_review'), 'to review'], [inState('needs_human'), 'need you'], [inState('proposed'), 'proposed']].filter(([n]) => n).map(([n, text]) => `${format.count(n)} ${n === 1 && text === 'need you' ? 'needs you' : text}`) : [];
  const unreported = summaryError ? (summaryError.code === 'ploeg_unsupported' ? 'Not reported by this Ploeg' : 'Could not be loaded') : summary ? '' : 'Loading…';
  const queued = summary?.totals?.workItems?.queued;
  const pending = summary?.totals?.runs?.pending;
  const runningCount = running ? running.length : null;
  const runningMore = running && mayHoldMore(data, 'running') ? '+' : '';
  const settled = summary?.totals?.spend?.settledUsd;
  const reserved = summary?.totals?.spend?.reservedUsd;
  const spend = demo ? { value: '—', quiet: true, detail: 'Demo · no model calls' }
    : summary ? { value: amount(settled) ? format.money(settled) : format.notReported, quiet: !amount(settled), detail: amount(reserved) && reserved > 0 ? `Settled · ${format.money(reserved)} reserved` : 'Settled' }
    : { value: '—', quiet: true, detail: unreported };
  const tiles = [
    tile({ label: 'Waiting on you', glyph: 'inbox', tone: 'attention', value: waiting ? format.count(waiting.length) : '—', quiet: !waiting, detail: waiting ? breakdown.length ? joinDots(breakdown.map(part => escape(part))) : 'Nothing to decide' : 'Could not be loaded' }),
    tile({ label: 'Running', glyph: 'runs', tone: 'live', href: '#runs?state=running', value: running ? `${format.count(runningCount)}${runningMore}` : '—', quiet: !running, detail: escape(running ? tileDetail.running({ running: runningCount, pending }) : 'Could not be loaded') }),
    tile({ label: 'Queued', glyph: 'circle-dashed', tone: 'neutral', href: '#work?lane=queued', value: amount(queued) ? format.count(queued) : '—', quiet: !amount(queued), detail: escape(amount(queued) ? tileDetail.queued(queued) : unreported) }),
    tile({ label: 'Spend · 24 h', glyph: 'coins', tone: 'neutral', href: '#insights?window=24h', value: spend.value, quiet: spend.quiet, detail: escape(spend.detail) }),
  ];
  return `<div class="stat-row now-stats">${tiles.join('')}</div>`;
}

function failureMarkup(error) {
  const code = error?.code || '';
  if (code === 'ploeg_unconfigured') return ploegUnconfigured();
  if (code === 'ploeg_scope') return emptyState({ icon: 'lock', title: 'Your account has no Ploeg Teams', body: 'Ask an administrator to give your account access to a Team. Its work shows up here as soon as they do.' });
  const actions = `${retryButton('page')}${button({ id: 'now-environment', label: 'Check Environment', size: 'sm', variant: 'ghost', href: '#settings/environment' })}`;
  return emptyState({ icon: 'x-circle', tone: 'danger', title: 'Could not reach Ploeg', body: `${escape(error?.message || 'Ploeg did not answer.')} Nothing was started or changed.`, actions });
}

function loadingMarkup() {
  const tileShape = '<div class="stat now-stat now-stat-skeleton" aria-hidden="true"><span class="skeleton text"></span><span class="skeleton title"></span><span class="skeleton text"></span></div>';
  return `<div class="now now-skeleton" aria-busy="true"><div class="now-digest now-digest-skeleton">${skeleton({ rows: 1, variant: 'text' })}</div><div class="stat-row now-stats">${tileShape.repeat(4)}</div><div class="now-columns"><div class="card now-card now-waiting">${skeleton({ rows: 6 })}</div><div class="now-rail"><div class="card now-card">${skeleton({ rows: 2 })}</div><div class="card now-card">${skeleton({ rows: 4 })}</div></div></div></div>`;
}

function staleBanner(view, now) {
  if (!view.error || !view.data) return '';
  const read = moment(view.data.fetchedAt);
  const when = read === null ? '' : ` Showing what Ploeg reported ${format.timeHtml(read, { now })}.`;
  return `<div class="now-banner" role="status">${callout({ tone: 'attention', title: 'Could not refresh', body: `<p>${escape(view.error.message || 'Ploeg did not answer.')}${when}</p>`, actions: retryButton('banner') })}</div>`;
}

/**
 * Whether the Now page currently shows a "Try again" button: the page failed, a refresh failed over older
 * data, or one of its groups failed. The page's own Refresh button stays hidden while one is on screen.
 * @param {object} input `state.now`.
 * @returns {boolean}
 */
export function offersRetry(input) {
  if (input?.error) return !['ploeg_unconfigured', 'ploeg_scope'].includes(input.error.code) || Boolean(input.data);
  const errors = input?.data?.errors || {};
  return Boolean(errors.waiting || errors.running || errors.recent);
}

/**
 * Renders the Now page body: the "Since you were away" digest, the stat row, what waits on you (ready for
 * review, needs you with its reason, proposed), what runs now with its budget meter and what finished recently.
 * `input` is `state.now` plus `since` (the digest baseline, null on a first visit), `shown` (the ids on screen,
 * see `visibleNow`), `summary` ({ data, error } of the 24-hour summary) and `caughtUp`.
 * `options` takes `grafanaUrl` and `singleKeys` (show the j/k/o hints).
 * @param {object} input
 * @param {{ grafanaUrl?: string, singleKeys?: boolean }} [options]
 * @param {number} [now]
 * @returns {string}
 */
export function nowMarkup(input, options = {}, now = Date.now()) {
  if (!input?.data) return input?.error ? `<div class="now now-failed">${failureMarkup(input.error)}</div>` : loadingMarkup();
  const list = value => Array.isArray(value) ? value : [];
  const view = { ...input, data: { ...input.data, errors: input.data.errors || {}, waiting: list(input.data.waiting), running: list(input.data.running), recent: list(input.data.recent) } };
  const since = view.since === undefined ? null : view.since;
  const context = { ...options, demo: Boolean(view.data.demo), now, since: moment(since), runs: view.data.errors.recent ? [] : view.data.recent, dots: true };
  const { data: visible, held } = visibleNow(view.data, view.shown ?? null);
  const note = view.data.demo ? demoNote('Illustrative records · no model calls, no spend') : '';
  return `<div class="now"${view.loading ? ' aria-busy="true"' : ''}>${note}${staleBanner(view, now)}${digestMarkup(view, since, now)}${statsMarkup(view)}<div class="now-columns"><div class="now-main">${waitingCard(view, visible, held, context)}</div><div class="now-rail">${runningCard(view, context)}${recentCard(view, visible, held, context)}</div></div></div>`;
}
