import { escape, safeUrl } from './core/dom.js';
import { icon } from './core/icons.js';
import * as format from './core/format.js';
import { runOutcome, verdict as verdictMeta, runFailure, runFailureText, workItemState, tileDetail, unreportedOutcome, stoppedWorkIds } from './core/states.js';
import { listReason, reasonGlyph, routingWarning, needsYouBlocks, waitingGroup, sessionDriven, sessionReason } from './core/reasons.js';
import { workItemRef, reasonBand, mergeStateView } from './ploeg.js';
import { taskChip, trackerName } from './core/trackers.js';
import { trackerReference } from './core/terms.js';
import { grafanaTeam } from './core/observability.js';
import { badge, button, callout, count, disclosure, emptyState, iconButton, kbd, listRow, meter, skeleton, stat, demoNote, ploegUnconfigured } from './core/ui.js';
import { sortOut, snoozeKey } from './core/snoozes.js';

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

/**
 * Whether the Now response lists fewer Work Items in `state` than Ploeg holds: the server read that state up to its cap
 * (`truncatedStates`).
 * @param {object} data
 * @param {string} state
 * @returns {boolean}
 */
export function stateTruncated(data, state) {
  return Array.isArray(data?.truncatedStates) && data.truncatedStates.includes(state);
}

const waitingStates = ['awaiting_review', 'needs_human', 'proposed'];

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
  const fresh = (group, field = 'updatedAt') => waiting ? waiting.filter(entry => ['awaiting_review', 'needs_human', 'proposed'].includes(entry.state) && waitingGroup(entry) === group && after(entry[field], start)).length : null;
  const finished = recent ? recent.filter(run => after(run.finishedAt, start)).length : null;
  const finishedCapped = Boolean(recent?.length) && finished === recent.length && mayHoldMore(data, 'recent');
  return { review: fresh('review'), needsYou: fresh('needs'), proposed: fresh('proposed', 'createdAt'), finished, finishedCapped };
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
  return tracker ? { href: tracker, label: 'task' } : null;
}

/** Finished Runs newest first by the moment they finished; Runs without a finish time keep their order at the end. */
export function byFinish(runs) {
  return (runs || []).map((run, index) => ({ run, index, at: moment(run.finishedAt) })).sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.index - b.index).map(entry => entry.run);
}

/** Waiting Work Items newest first by the moment they started waiting: created for a proposal, last updated otherwise; Work Items without that time keep their order at the end. */
export function byWaitingSince(entries) {
  return (entries || []).map((entry, index) => ({ entry, index, at: moment(entry.state === 'proposed' ? entry.createdAt : entry.updatedAt) })).sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.index - b.index).map(item => item.entry);
}

function repository(target) {
  if (!target?.repo) return null;
  const full = target.owner ? `${target.owner}/${target.repo}` : target.repo;
  const title = target.baseBranch ? `${full}, base branch ${target.baseBranch}` : full;
  return { class: 'now-repo', html: `${icon('branch')}<span title="${escape(title)}">${escape(full)}</span>` };
}

function reference(entry) {
  if (trackerReference(entry)) return `<span class="now-ref">${taskChip(entry, { link: false })}</span>`;
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
  const run = byFinish(runs).find(candidate => candidate.workItemId === entry.id && !candidate.shadow && candidate.verdict && candidate.verdict !== 'none');
  return run ? verdictMeta(run.verdict) : null;
}

function chipMarkup({ label, tone, glyph, title, secondary = false }) {
  return `<span class="chip${secondary ? ' now-warning' : ''}" data-tone="${tone}"${title ? ` title="${escape(title)}"` : ''}>${glyph ? icon(glyph) : ''}<span>${escape(label)}</span></span>`;
}

function origin(entry) {
  if (entry.sourceTitle) return `${origins[entry.createdKind] || 'From'} “${entry.sourceTitle}”.`;
  return kinds[entry.createdKind] || '';
}

const questionClip = 180;

function questionLine(entry) {
  const question = entry.question;
  if (!question?.text) return '';
  const who = question.role ? `The ${question.role}` : 'An agent';
  const shown = question.text.length > questionClip ? `${question.text.slice(0, questionClip - 1)}…` : question.text;
  return `<span class="now-why now-question" title="${escape(`${who} ${question.typed ? 'asks' : 'needs'}: “${question.text}”`)}">${icon('help-circle')}<span data-private>${escape(`“${shown}”`)}</span></span>`;
}

function disagreementChip(entry) {
  const found = entry.disagreement;
  if (!found) return '';
  const said = value => verdictMeta(value).short.toLowerCase();
  return chipMarkup({ label: 'Reviewers disagree', tone: 'attention', glyph: 'eye', title: `Round ${found.round}: ${said(found.acting)} by the acting reviewer, ${said(found.shadow)} by the shadow reviewer. Ploeg followed the acting reviewer.` });
}

function whyLine(entry, reason, warning, grouped) {
  const question = questionLine(entry);
  if (question) return question;
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
  const merge = entry.state === 'awaiting_review' ? mergeStateView(entry) : null;
  if (merge?.key === 'conflicted') chips.push(chipMarkup({ label: 'Merge conflict', tone: 'attention', glyph: 'alert', title: `${merge.title}. ${merge.detail}` }));
  if (entry.state === 'proposed' && entry.ready === false) chips.push(chipMarkup({ label: 'Needs refinement', tone: 'attention', title: 'Not Ready yet: the brief needs refining before an agent can pick it up.' }));
  if (warning) chips.push(chipMarkup({ label: warning.chip, tone: warning.tone, glyph: warning.glyph, title: warning.sentence, secondary: true }));
  const disagreement = disagreementChip(entry);
  if (disagreement) chips.push(disagreement);
  const review = entry.state === 'awaiting_review' ? latestVerdict(entry, context.runs) : null;
  const verdict = review ? badge({ tone: review.tone, glyph: review.glyph, label: review.short, title: `${review.label}. Agent review is evidence, not a human review.`, size: 'sm' }) : '';
  const round = entry.state !== 'proposed' && entry.latestShift?.round ? { class: 'now-round', html: `Round ${escape(entry.latestShift.round)}` } : null;
  const spend = entry.state === 'awaiting_review' ? shiftSpend(entry, context.demo) : '';
  const facts = joinDots([escape(entry.team), reference(entry), entry.state === 'proposed' ? null : repository(entry.target), round, spend]);
  return `${verdict}${chips.join('')}${facts}${whyLine(entry, reason, warning, grouped)}`;
}

const pullRequestCodes = new Set(['checks_not_passed', 'ci_not_finished', 'ci_not_passed', 'pull_request_closed', 'merged_untracked']);
const secondary = options => button({ variant: 'ghost', size: 'sm', ...options });

function drivingSession(entry, sessions) {
  return (sessions || []).filter(session => String(session.execution?.workItemId ?? '') === String(entry.id)).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0] || null;
}

function infraFault(entry, context, reason) {
  if (reason && infrastructure.has(reason.code)) return { owner: 'the cluster' };
  const last = context.lastFailure?.get(String(entry.id));
  return last?.infra ? { owner: last.owner || 'the cluster' } : null;
}

function waitingActions(entry, context, reason) {
  const title = entry.title || `Work Item ${entry.id}`;
  const stopped = waitingGroup(entry) === 'needs' && entry.state !== 'awaiting_review';
  const pr = safeUrl(entry.pullRequestUrl);
  const failedCi = reason?.code === 'ci_failed';
  const session = stopped && (sessionReason(reason) || sessionDriven(entry));
  const retry = context.retryHere && stopped && !entry.question?.text && reason?.requeue && !session;
  const infra = stopped && !entry.question?.text ? infraFault(entry, context, reason) : null;
  let primary = '';
  const more = [];
  if (pr && (entry.state === 'awaiting_review' || reason?.code === 'approved_to_merge')) primary = button({ id: `now-pr-${entry.id}`, label: failedCi ? 'Failing checks' : 'Pull request', icon: failedCi ? 'x-circle' : 'pull-request', size: 'sm', href: pr, external: true, ariaLabel: failedCi ? `Open the pull request for “${title}” to see why CI did not pass (opens in a new tab)` : `Open the pull request for “${title}” (opens in a new tab)` });
  if (entry.state === 'needs_human' && entry.question?.text) primary = button({ id: `now-answer-${entry.id}`, label: 'Answer', icon: 'send', size: 'sm', href: `#work/${encodeURIComponent(entry.id)}`, ariaLabel: `Answer the question on “${title}”` });
  if (entry.state === 'proposed') primary = button({ id: `now-decide-${entry.id}`, label: 'Approve or reject', icon: 'arrow', size: 'sm', href: `#proposed?id=${encodeURIComponent(entry.id)}`, ariaLabel: `Approve or reject “${title}” on Proposed` });
  if (session && !entry.question?.text) {
    const found = drivingSession(entry, context.sessions);
    primary = button({ id: `now-session-${entry.id}`, label: found ? 'Open session' : 'Open Sessions', icon: 'sessions', size: 'sm', href: found ? `#session/${encodeURIComponent(found.id)}` : '#sessions', ariaLabel: found ? `Open the session that drives “${title}”` : `Open Sessions to find the session that drives “${title}”` });
  }
  const retryButton = variant => button({ id: `now-retry-item-${entry.id}`, label: 'Try again', icon: 'refresh', size: 'sm', variant, action: 'loop-retry', data: { id: entry.id }, ariaLabel: `Try “${title}” again` });
  if (retry && infra) {
    primary = button({ id: `now-status-${entry.id}`, label: 'Check Status', icon: 'monitor', size: 'sm', href: '#status', ariaLabel: `Check Status before you try “${title}” again` });
    more.push(retryButton('ghost'));
  } else if (retry) primary = retryButton('secondary');
  else if (infra && !primary && !session) primary = button({ id: `now-status-${entry.id}`, label: 'Check Status', icon: 'monitor', size: 'sm', href: '#status', ariaLabel: `Check Status for “${title}”` });
  if (stopped && pr && pullRequestCodes.has(reason?.code)) more.push(secondary({ id: `now-pr-${entry.id}`, label: 'Open pull request', icon: 'pull-request', href: pr, external: true, ariaLabel: `Open the pull request for “${title}” (opens in a new tab)` }));
  const closing = reason?.code === 'pull_request_closed';
  const live = Boolean(entry.latestShift && !entry.latestShift.closedAt) || Boolean(context.leftover?.has(String(entry.id)));
  if (stopped && context.canCancel && !session && live) more.push(secondary({ id: `now-cancel-${entry.id}`, label: closing ? 'Close Work Item' : 'Cancel', icon: 'x-circle', action: 'now-cancel', data: { id: entry.id }, ariaLabel: `${closing ? 'Close' : 'Cancel'} “${title}”: withdraw it from Ploeg` }));
  const tracker = safeUrl(entry.url);
  if (tracker) {
    const name = trackerName(entry.provider);
    const where = name || 'the tracker';
    more.push(stopped && closing && !live && !session
      ? secondary({ id: `now-tracker-${entry.id}`, label: name ? `Close in ${name}` : 'Close the task', icon: 'x-circle', href: tracker, external: true, ariaLabel: `Close “${title}” in ${where}: Ploeg withdraws a stopped Work Item once its task is closed (opens in a new tab)` })
      : secondary({ id: `now-tracker-${entry.id}`, label: name ? `Open in ${name}` : 'Open the task', href: tracker, external: true, ariaLabel: `Open “${title}” in ${where} (opens in a new tab)` }));
  }
  const grafana = (reason && infrastructure.has(reason.code)) || infra ? grafanaTeam(entry.team, context.grafanaUrl) : null;
  if (grafana) more.push(secondary({ id: `now-grafana-${entry.id}`, label: 'Grafana', icon: 'activity', href: grafana, external: true, ariaLabel: `Open Grafana for the ${entry.team} Team (opens in a new tab)` }));
  const snooze = waitingGroup(entry) === 'needs' ? snoozeSlot(entry, 'work', title, context) : { toggle: '', options: '' };
  return `<div class="now-item-actions"${primary ? ' data-primary' : ''}><span class="now-action-primary" data-insight="now.row.primary">${primary}</span><span class="now-action-links" data-insight="now.row.link">${more.join('')}${snooze.toggle}</span></div>${snooze.options}`;
}

const domKey = key => key.replace(/[^A-Za-z0-9_-]/g, '-');

function snoozeSlot(entry, kind, title, context) {
  if (!context.snoozable) return { toggle: '', options: '' };
  const key = snoozeKey(entry, kind);
  const id = domKey(key);
  const open = context.snoozeOpen === key;
  const data = `data-key="${escape(key)}" data-target="${kind}"`;
  const toggle = `<button type="button" class="button ghost sm now-snooze-toggle" id="now-snooze-${id}" data-action="now-snooze-menu" ${data} aria-expanded="${open}"${open ? ` aria-controls="now-snooze-options-${id}"` : ''} aria-label="${kind === 'task' ? 'Snooze or dismiss' : 'Snooze'} “${escape(title)}”">${icon('clock')}<span class="button-label">Snooze</span></button>`;
  if (!open) return { toggle, options: '' };
  const choice = (until, label) => `<button type="button" class="button secondary sm" id="now-snooze-${until}-${id}" data-action="now-snooze" ${data} data-until="${until}">${escape(label)}</button>`;
  const dismiss = kind === 'task' ? `<button type="button" class="button secondary sm" id="now-dismiss-${id}" data-action="now-dismiss" ${data}>${icon('eye-off')}<span class="button-label">Dismiss</span></button>` : '';
  const options = `<div class="now-snooze-options" id="now-snooze-options-${id}" role="group" aria-label="Snooze “${escape(title)}” on your Now"><span class="now-snooze-hint">Hide from your Now. It comes back sooner if it changes.</span>${choice('1d', '1 day')}${choice('1w', '1 week')}${choice('change', 'Until it changes')}${dismiss}</div>`;
  return { toggle, options };
}

function snoozedLine(entry, kind, snooze, context) {
  const title = kind === 'task' ? entry.title || `Task ${entry.externalId}` : entry.title || `Work Item ${entry.id}`;
  const href = kind === 'task' ? safeUrl(entry.url) : `#work/${encodeURIComponent(entry.id)}`;
  const name = href ? `<a class="now-snoozed-title" href="${escape(href)}"${kind === 'task' ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(title)}</a>` : `<span class="now-snoozed-title">${escape(title)}</span>`;
  const until = snooze.untilAt ? `Snoozed until ${format.timeHtml(snooze.untilAt, { display: 'absolute', now: context.now })}` : snooze.kind === 'dismiss' ? 'Dismissed until it changes' : 'Snoozed until it changes';
  const key = snoozeKey(entry, kind);
  return `<li class="now-snoozed-item">${name}<span class="now-snoozed-until">${until}</span><button type="button" class="button ghost sm" id="now-unsnooze-${domKey(key)}" data-action="now-unsnooze" data-key="${escape(key)}" aria-label="Unsnooze “${escape(title)}”">${icon('undo')}<span class="button-label">Unsnooze</span></button></li>`;
}

function quietMarkup(quiet, context) {
  if (!quiet) return '';
  const lines = [];
  if (quiet.snoozed.length) {
    const dismissed = quiet.snoozed.some(item => item.snooze.kind === 'dismiss');
    const text = `${format.count(quiet.snoozed.length)} ${dismissed ? 'snoozed or dismissed' : 'snoozed'} · ${context.showSnoozed ? 'Hide' : 'Show'}`;
    const list = context.showSnoozed ? `<ul class="now-snoozed-list" id="now-snoozed-list">${quiet.snoozed.map(item => snoozedLine(item.entry, item.kind, item.snooze, context)).join('')}</ul>` : '';
    lines.push(`<button type="button" class="now-quiet" id="now-snoozed-toggle" data-action="now-snoozed-toggle" aria-expanded="${Boolean(context.showSnoozed)}"${context.showSnoozed ? ' aria-controls="now-snoozed-list"' : ''}>${icon('clock')}<span>${escape(text)}</span></button>${list}`);
  }
  if (quiet.older.length) {
    const text = `${format.plural(quiet.older.length, 'older refusal')} · ${context.showOlder ? 'Hide' : 'Show'}`;
    const list = context.showOlder ? `<ul class="list now-list now-older-list" id="now-older-list" aria-label="Refusals older than a week">${quiet.older.map(entry => refusalRow(entry, context)).join('')}</ul>` : '';
    lines.push(`<button type="button" class="now-quiet now-quiet-fold" id="now-older-toggle" data-action="now-older-toggle" aria-expanded="${Boolean(context.showOlder)}"${context.showOlder ? ' aria-controls="now-older-list"' : ''}>${icon('chevron-down')}<span>${escape(text)}</span></button>${list}`);
  }
  return lines.length ? `<div class="now-quiet-lines">${lines.join('')}</div>` : '';
}

const firstSentence = text => {
  const line = String(text ?? '').split('\n').map(part => part.trim()).find(Boolean) || '';
  const end = /[.!?](?=\s|$)/.exec(line);
  return end ? line.slice(0, end.index + 1) : line;
};

function lastRunLine(entry, context) {
  const last = context.lastFailure?.get(String(entry.id));
  if (!last || entry.question?.text) return '';
  const where = [last.role, last.round ? `Round ${last.round}` : ''].filter(Boolean).join(', ');
  const times = last.count > 1 ? ` · ${last.count} failed Runs lately` : '';
  const line = `<span class="now-why now-last-run">${icon('x-circle')}<span>Last Run: ${escape(last.label)}${where ? ` (${escape(where)})` : ''}${escape(times)}</span></span>`;
  const why = last.text ? `<span class="now-why now-wrap now-fail-why" data-private>${escape(last.text)}</span>` : '';
  return `${line}${why}`;
}

function infraLine(entry, context, reason) {
  if (entry.question?.text || !context.retryHere || !reason?.requeue || waitingGroup(entry) !== 'needs') return '';
  const infra = infraFault(entry, context, reason);
  if (!infra) return '';
  return `<span class="now-why now-wrap now-infra-note">${escape(`Not the Work Item’s fault. Trying again is likely to fail the same way until ${infra.owner} is healthy, so check Status first.`)}</span>`;
}

function retryHere(reason, context) {
  if (!context.retryHere || !reason?.requeue) return reason;
  return { ...reason, requeue: 'Then press Try again.', action: `${reason.fix} Then press Try again.` };
}

function waitingRow(entry, context, grouped = false) {
  const reason = retryHere(listReason(entry, { demo: context.demo }), context);
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
    meta: `${waitingMeta(entry, context, { reason, warning, grouped })}${lastRunLine(entry, context)}${infraLine(entry, context, reason)}${leftoverLine(entry, context)}`,
    trail: when ? `<span class="now-when"><span class="now-when-label">${created ? 'Created' : 'Updated'} </span>${format.timeHtml(when, { now: context.now })}</span>` : '',
    data: { nowRow: true, openUrl: target?.href, openLabel: target?.label, unread: unread || null },
  });
  return `<li class="now-item" data-insight="now.row.${entry.state === 'needs_human' ? 'needs-you' : entry.state === 'awaiting_review' ? 'review' : 'proposed'}">${row}${waitingActions(entry, context, reason)}</li>`;
}

function moreRow(hidden, group, capped = false) {
  if (hidden < 1 && !capped) return '';
  const text = hidden < 1 ? `Show more in ${group.place}` : `Show ${format.count(hidden)}${capped ? '+' : ''} more in ${group.place}`;
  return `<li class="now-item now-more-item"><a class="now-more" href="${escape(group.more)}">${escape(text)}${icon('chevron')}</a></li>`;
}

function staleRow(stale) {
  if (!amount(stale) || stale < 1) return '';
  const subject = stale === 1 ? '1 Work Item stopped retrying after repeated failures.' : `${format.count(stale)} Work Items stopped retrying after repeated failures.`;
  const row = listRow({ href: '#work?lane=stale', id: 'now-stale-open', tone: 'severe', lead: icon('clock'), title: subject, trail: `<span class="now-go"><span class="now-go-text">See ${stale === 1 ? 'it' : 'them'} in Work</span>${icon('chevron')}</span>` });
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

function groupHeader(group, total, id, capped = false) {
  return `<header class="now-group-header" data-tone="${group.tone}"><h3 class="now-group-title" id="${id}">${icon(group.glyph)}<span>${escape(group.title)}</span>${total ? (capped ? count(`${format.count(total)}+`, { label: `More than ${format.count(total)}` }) : count(total)) : ''}</h3>${total ? `<p class="now-group-hint">${escape(group.hint)}</p>` : ''}</header>`;
}

function needsMarkup(rows, group, context, id) {
  const blocks = needsYouBlocks(rows, { demo: context.demo });
  const flat = blocks.filter(block => !block.grouped).flatMap(block => block.items);
  const shown = flat.slice(0, groupLimit);
  const stale = staleRow(context.stale);
  const capped = Boolean(context.truncated?.has(group.state));
  const list = shown.length || stale ? `<ul class="list now-list" aria-labelledby="${id}">${shown.map(entry => waitingRow(entry, context)).join('')}${moreRow(flat.length - shown.length, group, capped)}${stale}</ul>` : '';
  const bands = blocks.filter(block => block.grouped).map(block => {
    const bandId = `now-reason-${block.reason.code}`;
    const first = block.items.slice(0, subgroupLimit);
    return `<div class="now-band" role="group" aria-labelledby="${bandId}">${reasonBand(block.reason, block.items.length, bandId)}<ul class="list now-list" aria-labelledby="${bandId}">${first.map(entry => waitingRow(entry, context, true)).join('')}${moreRow(block.items.length - first.length, group, capped && !shown.length)}</ul></div>`;
  }).join('');
  return `${list}${bands}`;
}

const sentenceEnd = text => String(text ?? '').trim().replace(/[.\s]+$/, '');

/**
 * Says in plain words why Ploeg could not start a tracker task, and what fixes it, from the refusal's `code`,
 * its board name, its `repo/` labels and the labels the board allows. A code Unfold does not know, and
 * `unclassified`, repeat Ploeg's own reason.
 * @param {{ code?: string, board?: string, labels?: string[], allowedLabels?: string[], reason?: string }} entry
 * @returns {string}
 */
export function refusalSentence(entry) {
  const name = String(entry?.board ?? '').trim().replace(/\s+board$/i, '');
  const board = name ? `the ${name} board` : 'this board';
  const Board = board[0].toUpperCase() + board.slice(1);
  const allowed = Array.isArray(entry?.allowedLabels) ? entry.allowedLabels.filter(label => typeof label === 'string' && label).join(', ') : '';
  const hints = Array.isArray(entry?.labels) ? entry.labels.filter(label => typeof label === 'string' && label.startsWith('repo/')) : [];
  const label = hints[0] || 'Its repo/ label';
  switch (entry?.code) {
    case 'label_missing': return `${Board} needs a repo/ label on this task.${allowed ? ` Allowed: ${allowed}.` : ''}`;
    case 'label_not_allowed': return `${label} is not allowed on ${board}.${allowed ? ` Use one of ${allowed}.` : ''}`;
    case 'label_unregistered': return `${label} names no repository Ploeg knows.${allowed ? ` Use one of ${allowed}.` : ' Ask an operator to register it.'}`;
    case 'multiple_labels': return `This task has more than one repo/ label${hints.length > 1 ? ` (${hints.join(', ')})` : ''}. Keep exactly one.${allowed ? ` Allowed: ${allowed}.` : ''}`;
    case 'labels_unread': return `Ploeg could not read this task’s labels, and ${board} routes by label. Assign the task again.`;
    case 'no_board_rule': return `${label} selects a repository, but Ploeg takes no work from this task’s board. Ask an operator to add the board, or remove the label.`;
    case 'target_not_ready': return `The repository this task selects is not ready for agents: ${sentenceEnd(entry.reason) || 'Ploeg gave no reason'}. Fix the repository, then assign the task again.`;
    default: return `Ploeg did not queue this task: ${sentenceEnd(entry?.reason) || 'it gave no reason'}.`;
  }
}

function refusalRow(entry, context) {
  const key = `${entry.provider}-${entry.externalId}`.replace(/[^A-Za-z0-9_-]/g, '-');
  const sentence = refusalSentence(entry);
  const ref = entry.externalId ? reference(entry) : '';
  const meta = `${joinDots([escape(entry.team), ref])}<span class="now-why now-why-fix" title="${escape(sentence)}">${escape(sentence)}</span>`;
  const when = moment(entry.refusedAt);
  const row = listRow({ id: `now-row-x-${key}`, tone: 'attention', lead: icon('alert'), title: entry.title || `Task ${entry.externalId}`, meta, trail: when === null ? '' : `<span class="now-when"><span class="now-when-label">Refused </span>${format.timeHtml(when, { now: context.now })}</span>` });
  const href = safeUrl(entry.url);
  const tracker = trackerName(entry.provider);
  const label = entry.link === 'task' ? `Open in ${tracker || 'its tracker'}` : `Open ${tracker || 'the tracker'}`;
  const primary = href && entry.link !== 'none' ? button({ id: `now-refused-open-${key}`, label, variant: 'secondary', size: 'sm', href, external: true, ariaLabel: `${label}: “${entry.title || entry.externalId}” (opens in a new tab)` }) : '';
  const snooze = snoozeSlot(entry, 'task', entry.title || entry.externalId, context);
  return `<li class="now-item">${row}<div class="now-item-actions"${primary ? ' data-primary' : ''}><span class="now-action-primary">${primary}</span><span class="now-action-links">${snooze.toggle}</span></div>${snooze.options}</li>`;
}

function refusedMarkup(data, context) {
  const error = data.errors?.refused;
  if (error) return `<div class="now-band now-refused" role="group" aria-label="Tasks Ploeg could not start">${errorState('refused', 'Could not load tasks Ploeg could not start', error)}</div>`;
  const refused = data.refused;
  if (!refused.length) return '';
  const id = 'now-refused-title';
  const shown = refused.slice(0, groupLimit);
  const hidden = refused.length - shown.length;
  const more = hidden > 0 ? `<li class="now-item now-more-item"><span class="now-more">${escape(`${format.plural(hidden, 'more task')} could not start. Ploeg commented on each one.`)}</span></li>` : '';
  const band = `<div class="reason-band" data-tone="attention"><span class="reason-band-icon" aria-hidden="true">${icon('alert')}</span><h3 class="reason-band-title" id="${id}">Could not start<span class="reason-band-count num"><span class="sr-only">, </span>${escape(format.count(refused.length))}<span class="sr-only"> ${refused.length === 1 ? 'task' : 'tasks'}</span></span></h3><p class="reason-band-fix">Ploeg queued nothing for these tracker tasks. Fix the task, then assign it again.</p></div>`;
  return `<div class="now-band now-refused" role="group" aria-labelledby="${id}">${band}<ul class="list now-list" aria-labelledby="${id}">${shown.map(entry => refusalRow(entry, context)).join('')}${more}</ul></div>`;
}

function groupMarkup(group, rows, context) {
  const id = `now-group-${group.id}`;
  const stale = group.id === 'needs' ? staleRow(context.stale) : '';
  const banded = group.id === 'needs' && needsYouBlocks(rows, { demo: context.demo }).some(block => block.grouped);
  const capped = Boolean(context.truncated?.has(group.state));
  const refused = group.id === 'needs' ? context.refused || '' : '';
  let body;
  if (group.id === 'needs' && (rows.length || stale)) body = `${refused}${needsMarkup(rows, group, context, id)}`;
  else if (refused) body = refused;
  else if (rows.length || stale) {
    const shown = rows.slice(0, groupLimit);
    body = `<ul class="list now-list" aria-labelledby="${id}">${shown.map(entry => waitingRow(entry, context)).join('')}${stale}${moreRow(rows.length - shown.length, group, capped)}</ul>`;
  } else body = `<p class="now-group-empty">${escape(group.empty)}</p>`;
  return `<div class="now-group" data-group="${group.id}"${banded ? ' data-split' : ''} role="group" aria-labelledby="${id}">${groupHeader(group, rows.length, id, capped)}${body}</div>`;
}

function waitingCard(view, visible, held, context) {
  const error = view.data.errors?.waiting;
  const total = error ? null : view.data.waiting.length;
  const pill = held.waiting ? showNew('waiting', format.plural(held.waiting, 'new Work Item')) : '';
  const hints = context.singleKeys && !error && total ? `<p class="now-keys" aria-hidden="true">${kbd(['j', 'k'])}<span>move</span>${kbd('o')}<span>open PR or tracker</span></p>` : '';
  const stale = error ? 0 : staleCount(view);
  const rows = byWaitingSince(visible.waiting);
  const allNew = rows.length > 0 && rows.every(entry => after(entry.state === 'proposed' ? entry.createdAt : entry.updatedAt, context.since));
  const refused = refusedMarkup(view.data, context);
  const local = { ...context, stale, refused, dots: !allNew, truncated: new Set(waitingStates.filter(state => stateTruncated(view.data, state))) };
  const capped = local.truncated.size > 0;
  let body;
  if (error) body = `${errorState('waiting', 'Could not load what waits on you', error)}${refused}`;
  else if (!rows.length && !held.waiting && refused) body = groupMarkup(groups.find(group => group.id === 'needs'), [], local);
  else if (!rows.length && !held.waiting) body = `${allClear(view, context.now)}${stale ? `<ul class="list now-list now-after-clear">${staleRow(stale)}</ul>` : ''}`;
  else body = groups.map(group => groupMarkup(group, rows.filter(entry => waitingGroup(entry) === group.id), local)).join('');
  return `<section class="card flush now-card now-waiting" aria-labelledby="now-waiting-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-waiting-title">Waiting on you${total ? (capped ? count(`${format.count(total)}+`, { tone: 'attention', label: `More than ${format.count(total)}` }) : count(total, { tone: 'attention' })) : ''}</h2></div>${hints ? `<div class="card-actions">${hints}</div>` : ''}</header><div class="card-body">${pill}${body}</div></section>`;
}

function runningRow(run, context) {
  const models = run.reservedModels?.length ? run.reservedModels : run.usage?.models || [];
  const started = moment(run.startedAt);
  const names = [...new Set(models.map(format.modelName))];
  const facts = joinDots([escape(run.team), run.role ? escape(run.role) : '', run.round ? `Round ${escape(run.round)}` : '', names.length ? `<span title="${escape(models.join(', '))}">${escape(names.join(', '))}</span>` : '']);
  const shift = context.shifts?.get(String(run.workItemId));
  const reserved = shift && !shift.closedAt && amount(shift.reservedUsd) ? shift.reservedUsd : undefined;
  const spend = meter({ settled: run.observedUsd, reserved, authorized: run.authorizedUsd, demo: context.demo, label: '', size: 'sm', observed: true });
  const elapsed = started === null ? '<span class="now-when">Not started</span>' : elapsedTag(started, context.now);
  return `<li><a class="list-row now-run" href="#work/${escape(run.workItemId)}" id="now-row-r-${escape(run.id)}" data-tone="live" data-now-row><span class="list-row-lead"><span class="live-dot" aria-hidden="true"></span></span><div class="list-row-main"><span class="list-row-title">${escape(run.workItemTitle || `Work Item ${run.workItemId}`)}</span><span class="list-row-meta">${facts}</span><div class="now-run-meter">${spend}</div></div><span class="list-row-trail num">${elapsed}</span></a></li>`;
}

/**
 * The Work Items in flight that no running Run stands for: queued or received ones waiting for a worker, and leased
 * ones between two Runs. Each comes once, in the order Ploeg listed them. Null when the active group failed to load.
 * @param {object} data A `GET /api/ploeg/now` response.
 * @returns {object[] | null}
 */
export function waitingToRun(data) {
  if (data?.errors?.active) return null;
  const running = new Set((data?.errors?.running ? [] : data?.running || []).map(run => String(run.workItemId)));
  const seen = new Set();
  return (Array.isArray(data?.active) ? data.active : []).filter(entry => {
    const id = String(entry?.id ?? '');
    if (!id || running.has(id) || seen.has(id) || !['ingested', 'queued', 'leased'].includes(entry.state)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Splits the running Runs of a Now response into the ones that work and the leftovers: Runs Ploeg still marks running
 * although it stopped their Work Item (`needs_human`), so they hold budget without working. A Work Item keeps its
 * first leftover Run. With the waiting group missing every Run counts as working.
 * @param {object} data A `GET /api/ploeg/now` response.
 * @returns {{ working: object[], leftover: Map<string, object> }}
 */
export function splitRunning(data) {
  const runs = Array.isArray(data?.running) ? data.running : [];
  const stopped = stoppedWorkIds(data);
  const leftover = new Map();
  const working = [];
  for (const run of runs) {
    const id = String(run?.workItemId ?? '');
    if (!stopped.has(id)) { working.push(run); continue; }
    if (!leftover.has(id)) leftover.set(id, run);
  }
  return { working, leftover };
}

function leftoverLine(entry, context) {
  const run = context.leftover?.get(String(entry.id));
  if (!run) return '';
  const started = moment(run.startedAt);
  const shift = entry.latestShift;
  const held = shift && !shift.closedAt && amount(shift.reservedUsd) && shift.reservedUsd > 0 ? shift.reservedUsd : null;
  const who = [run.role, started === null ? '' : `started ${format.timeHtml(started, { now: context.now })}`].filter(Boolean).join(', ');
  const hold = held === null ? 'It holds this Work Item’s budget' : `It holds ${escape(format.money(held))} of this Work Item’s budget`;
  return `<span class="now-why now-leftover-run">${icon('alert')}<span>Run ${escape(run.id)}${who ? ` (${who})` : ''} is still marked running: Ploeg did not close it when it stopped this Work Item. ${hold} until the Work Item runs again or is cancelled.</span></span>`;
}

function queuedRow(entry, context) {
  const leased = entry.state === 'leased';
  const what = leased ? 'Between Runs' : entry.state === 'ingested' ? 'Received' : 'Waiting for a worker';
  const facts = joinDots([`<span class="now-flight-state">${escape(what)}</span>`, escape(entry.team), reference(entry), repository(entry.target)]);
  const since = leased ? null : moment(entry.updatedAt) ?? moment(entry.createdAt);
  const trail = since === null ? '' : `<span class="now-when"><span class="now-when-label">Queued </span>${format.timeHtml(since, { now: context.now })}</span>`;
  return `<li>${listRow({ href: `#work/${entry.id}`, id: `now-row-q-${entry.id}`, tone: leased ? 'live' : 'neutral', lead: icon(leased ? 'circle-half' : 'circle-dashed'), title: entry.title || `Work Item ${entry.id}`, meta: facts, trail, data: { nowRow: true, flight: entry.state } })}</li>`;
}

function shiftsOf(active) {
  return new Map((Array.isArray(active) ? active : []).filter(entry => entry?.latestShift).map(entry => [String(entry.id), entry.latestShift]));
}

function runningCard(view, context) {
  const data = view.data;
  const error = data.errors?.running;
  const runs = error ? [] : data.running;
  const queued = waitingToRun(data) || [];
  const total = runs.length + queued.length;
  let body;
  if (error && !queued.length) body = errorState('running', 'Could not load what is running', error);
  else if (!total) {
    const pending = view.summary?.data?.totals?.runs?.pending;
    const detail = amount(pending) && pending > 0 ? `${format.plural(pending, 'Run')} ${pending === 1 ? 'waits' : 'wait'} for a worker.` : context.handOver ? 'Hand a task to a team and follow it here, from queue to pull request.' : 'Nothing is queued either.';
    const action = context.handOver ? button({ id: 'now-hand-over', label: 'Hand over a task', icon: 'tasks', size: 'sm', href: '#tasks' }) : '';
    body = emptyState({ icon: 'runs', compact: true, title: 'Nothing in flight', body: escape(detail), actions: action });
  } else {
    const failed = error ? `<li>${errorState('running', 'Could not load what is running', error)}</li>` : '';
    body = `<ul class="list now-list">${runs.map(run => runningRow(run, context)).join('')}${failed}${queued.slice(0, groupLimit).map(entry => queuedRow(entry, context)).join('')}${moreRow(queued.length - Math.min(queued.length, groupLimit), { place: 'Work', more: '#work?lane=queued' }, stateTruncated(data, 'queued'))}</ul>`;
  }
  const label = total ? count(total, { tone: 'live', label: `${format.plural(runs.length, 'Run')} running, ${format.plural(queued.length, 'Work Item')} waiting to run` }) : '';
  return `<section class="card flush now-card now-running" aria-labelledby="now-running-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-running-title">In flight${label}</h2></div><div class="card-actions">${button({ id: 'now-running-all', label: 'View all', size: 'sm', variant: 'ghost', href: '#runs?state=running', ariaLabel: 'View all running Runs' })}</div></header><div class="card-body">${body}</div></section>`;
}

function recentRow(run, context, earlier = 0) {
  const outcome = runOutcome(run.outcome);
  const tone = outcome?.tone || 'neutral';
  const failure = runFailure(run);
  const verdict = run.verdict && run.verdict !== 'none' ? verdictMeta(run.verdict) : null;
  const unread = context.dots && after(run.finishedAt, context.since);
  const none = outcome ? null : unreportedOutcome(run);
  const reviewOnly = Boolean(verdict) && run.outcome === 'no_change_needed';
  const facts = joinDots([
    reviewOnly ? '' : `<span class="now-outcome" data-tone="${tone}">${escape(outcome?.label || none.label)}</span>`,
    failure ? escape(failure.label) : '',
    run.role ? escape(run.role) : '',
    run.round ? `Round ${escape(run.round)}` : '',
    earlier ? `+${escape(format.count(earlier))} earlier ${earlier === 1 ? 'Run' : 'Runs'}` : '',
  ]);
  const agentReview = verdict ? badge({ tone: verdict.tone, glyph: verdict.glyph, label: verdict.short, title: `${verdict.label}. Agent review is evidence, not a human review.`, size: 'sm' }) : '';
  return `<li>${listRow({ href: `#work/${run.workItemId}`, id: `now-row-f-${run.id}`, tone: reviewOnly ? verdict.tone : tone, lead: icon(reviewOnly ? verdict.glyph : outcome?.glyph || 'circle-slash'), title: run.workItemTitle || `Work Item ${run.workItemId}`, meta: `${agentReview}${facts}`, trail: format.timeHtml(run.finishedAt, { now: context.now }), data: { nowRow: true, unread: unread || null } })}</li>`;
}

/**
 * The `#runs` link for the Runs that finished after `since`, which Recently finished lists only the newest of.
 * @param {string} since
 * @returns {string}
 */
export function finishedSinceHref(since) {
  const at = moment(since);
  return at === null ? '#runs?state=finished' : `#runs?state=finished&since=${encodeURIComponent(new Date(at).toISOString())}`;
}

function sinceRunsRow(data, runs, context) {
  if (!context.sinceIso) return '';
  const counts = digestCounts(data, context.sinceIso);
  const listed = runs.filter(run => after(run.finishedAt, context.since)).length;
  if (!counts.finished || (counts.finished <= listed && !counts.finishedCapped)) return '';
  const hidden = counts.finished - listed;
  const text = `Show ${hidden > 0 ? `${format.count(hidden)}${counts.finishedCapped ? '+' : ''} more` : 'more'} finished ${sinceLabel(context.sinceIso, context.now).replace(/^Since/, 'since')} in Runs`;
  return `<li class="now-item now-more-item"><a class="now-more" id="now-recent-since" href="${escape(finishedSinceHref(context.sinceIso))}">${escape(text)}${icon('chevron')}</a></li>`;
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
  else body = `<ul class="list now-list">${runs.map(run => recentRow(run, local)).join('')}${sinceRunsRow(view.data, runs, context)}</ul>`;
  return `<section class="card flush now-card now-recent" aria-labelledby="now-recent-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-recent-title">Recently finished</h2></div><div class="card-actions">${button({ id: 'now-recent-all', label: 'View all', size: 'sm', variant: 'ghost', href: '#runs?state=finished', ariaLabel: 'View all finished Runs' })}</div></header><div class="card-body">${pill}${body}</div></section>`;
}

function askRow(ask) {
  const reply = ask.status === 'answered' ? ask.answer.split('\n')[0] : ask.failure || 'No answer.';
  return `<li class="now-ask"><a class="now-ask-link" href="#work/${encodeURIComponent(ask.workItemId)}" data-now-row><span class="now-ask-question">${escape(ask.question)}</span><span class="now-ask-answer">${escape(reply.length > 160 ? `${reply.slice(0, 159)}…` : reply)}</span><span class="now-ask-meta">${escape(ask.workItemTitle || `Work Item #${ask.workItemId}`)} · <time datetime="${escape(ask.createdAt)}">${escape(format.dateTime(ask.createdAt))}</time></span></a></li>`;
}

/** Your own recent Asks on Now (system ADR-0031), each linking to its Work Item with the first line of its answer. `view.asks` is `{ asks, more }`, `{ error }`, or absent while loading. */
export function asksCard(view) {
  const data = view.asks;
  let body;
  if (!data) body = skeleton({ rows: 2, variant: 'list' });
  else if (data.error) body = `<p class="now-ask-error" role="alert">${escape(data.error)}</p>`;
  else if (!data.asks.length) body = emptyState({ icon: 'help-circle', compact: true, title: 'You have not asked anything yet', body: 'Open a Work Item and use Ask a question. Your questions and their answers appear here.' });
  else body = `<ul class="list now-list now-asks">${data.asks.map(askRow).join('')}</ul>${data.more ? `<p class="now-ask-more">${escape('Older Asks are on their Work Items.')}</p>` : ''}`;
  return `<section class="card flush now-card now-asks-card" aria-labelledby="now-asks-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-asks-title">Your questions</h2></div></header><div class="card-body">${body}</div></section>`;
}

function digestItem(value, singular, pluralForm, tone, target, more = false) {
  if (!value) return '';
  return `<li class="now-digest-item"><button type="button" class="now-digest-jump" id="now-digest-${target}" data-action="now-digest-jump" data-target="${target}" title="Show on this page"><span class="status-dot" data-tone="${tone}" aria-hidden="true"></span><strong class="num">${escape(format.count(value))}${more ? '+' : ''}</strong> ${escape(value === 1 ? singular : pluralForm)}</button></li>`;
}

function digestFrame(kind, glyph, title, body, action = '') {
  return `<section class="now-digest" data-kind="${kind}"><span class="now-digest-icon" aria-hidden="true">${icon(glyph)}</span><div class="now-digest-text"><h2 class="now-digest-title" id="now-digest-title">${title}</h2> ${body}</div>${action ? `<div class="now-digest-actions">${action}</div>` : ''}</section>`;
}

function digestMarkup(view, since, now) {
  const data = view.data;
  const waiting = data.errors?.waiting ? null : data.waiting.length;
  if (since === null) return digestFrame('welcome', 'spark', 'Welcome to Unfold', '<p class="now-digest-body">From your next visit, this line sums up what changed while you were away.</p>');
  const start = moment(since);
  const counts = digestCounts(data, since);
  const items = [
    digestItem(counts.review, 'ready for review', 'ready for review', 'review', 'review'),
    digestItem(counts.needsYou, 'needs you', 'need you', 'attention', 'needs'),
    digestItem(counts.proposed, 'proposed', 'proposed', 'neutral', 'proposed'),
    digestItem(counts.finished, 'Run finished', 'Runs finished', 'success', 'recent', counts.finishedCapped),
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
  const inGroup = group => waiting.filter(entry => waitingGroup(entry) === group).length;
  const breakdown = waiting ? [[inGroup('review'), 'to review'], [inGroup('needs'), 'need you'], [inGroup('proposed'), 'proposed']].filter(([n]) => n).map(([n, text]) => `${format.count(n)} ${n === 1 && text === 'need you' ? 'needs you' : text}`) : [];
  const unreported = summaryError ? (summaryError.code === 'ploeg_unsupported' ? 'Not reported by this Ploeg' : 'Could not be loaded') : summary ? '' : 'Loading…';
  const queued = summary?.totals?.workItems?.queued;
  const pending = summary?.totals?.runs?.pending;
  const runningCount = running ? running.length : null;
  const runningMore = running && mayHoldMore(data, 'running') ? '+' : '';
  const waitingMore = waiting && waitingStates.some(state => stateTruncated(data, state)) ? '+' : '';
  const settled = summary?.totals?.spend?.settledUsd;
  const reserved = summary?.totals?.spend?.reservedUsd;
  const spend = demo ? { value: '—', quiet: true, detail: 'Demo · no model calls' }
    : summary ? { value: amount(settled) ? format.money(settled) : format.notReported, quiet: !amount(settled), detail: amount(reserved) && reserved > 0 ? `Settled · ${format.money(reserved)} held` : 'Settled' }
    : { value: '—', quiet: true, detail: unreported };
  const tiles = [
    tile({ label: 'Waiting on you', glyph: 'inbox', tone: 'attention', value: waiting ? `${format.count(waiting.length)}${waitingMore}` : '—', quiet: !waiting, detail: waiting ? breakdown.length ? joinDots(breakdown.map(part => escape(part))) : 'Nothing to decide' : 'Could not be loaded' }),
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

function unsettledBanner(view, now) {
  const summary = view.summary?.data;
  const unsettled = summary?.unsettled;
  if (!summary || summary.demo || view.data.demo || !unsettled || !(unsettled.count > 0)) return '';
  const accounts = Array.isArray(unsettled.accounts) ? unsettled.accounts : [];
  const runs = unsettled.count === 1 ? '1 Run holds' : `${format.count(unsettled.count)} Runs hold`;
  const rows = accounts.map(entry => `<li class="now-unsettled-run">${entry.workItemId === null || entry.workItemId === undefined ? `Run ${escape(entry.runId)} outside any Work Item` : `<a href="#work/${escape(entry.workItemId)}">Work Item ${escape(entry.workItemId)}</a>`} <span class="subtle">Run ${escape(entry.runId)} · ${escape(entry.team)} · key ${escape(entry.accountState)} · ${escape(format.money(entry.heldUsd))} held since ${format.timeHtml(entry.since, { now })}</span></li>`).join('');
  const list = disclosure({ summary: unsettled.count === 1 ? 'Show the Run' : `Show the ${format.count(unsettled.count)} Runs`, body: `<ul class="now-unsettled-runs">${rows}</ul>` });
  const blocked = accounts.length > 0 && accounts.every(entry => entry.accountState === 'blocked');
  const cause = blocked
    ? `Their model keys are blocked, but Ploeg has not settled their spend an hour after they finished. Each keeps its hold (${escape(format.money(unsettled.heldUsd))} in total) until settlement runs. Follow <code>apps/ploeg/docs/how-to/investigate-a-runs-spend.md</code>, “Decide whether to wait or act”.`
    : `Their model keys could not be blocked at the gateway, often because the key is already gone. Each keeps its full hold (${escape(format.money(unsettled.heldUsd))} in total) until someone settles it by hand. Follow <code>apps/ploeg/docs/ops/managed-workers.md</code>, “Reconcile uncertainty”.`;
  const body = `<p>${cause}</p>${list}`;
  return `<div class="now-banner now-unsettled" role="status">${callout({ tone: 'severe', title: `${runs} budget Ploeg cannot release`, body })}</div>`;
}

/**
 * The section of the Now page a digest count points at: a waiting group (`review`, `needs`, `proposed`) or the
 * Recently finished card (`recent`). Null for an unknown target.
 * @param {string} target
 * @returns {string|null} A CSS selector.
 */
export function digestSection(target) {
  if (target === 'recent') return '.now-recent';
  return groups.some(group => group.id === target) ? `.now-group[data-group="${target}"]` : null;
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
  return Boolean(errors.waiting || errors.running || errors.recent || errors.refused);
}

/**
 * Renders the Now page body: the "Since you were away" digest, the stat row, what waits on you (ready for
 * review, needs you with its reason, proposed), what is in flight (running Runs with their budget meter, then Work Items waiting to run) and what finished recently.
 * `input` is `state.now` plus `since` (the digest baseline, null on a first visit), `shown` (the ids on screen,
 * see `visibleNow`), `summary` ({ data, error } of the 24-hour summary) and `caughtUp`.
 * `options` takes `grafanaUrl`, `singleKeys` (show the j/k/o hints), `handOver` (an empty In flight card offers
 * to hand over a task), `yours` (markup of the person's own waiting agent sessions, from `linkedWaitingCard`,
 * shown above what Ploeg waits on), `canCancel` (a stopped row offers Cancel) and `sessions` (Unfold's sessions, so a
 * row an Unfold session drives opens it). `snoozes` (the person's, from `GET /api/now/snoozes`) leaves what they snoozed
 * or dismissed out of every list and count and offers Snooze on Needs-you and refused rows; `snoozeOpen` is the key whose
 * choices are open, and `showSnoozed` and `showOlder` unfold the snoozed rows and the refusals older than a week (`sortOut`).
 * @param {object} input
 * @param {{ grafanaUrl?: string, singleKeys?: boolean, handOver?: boolean, yours?: string, canCancel?: boolean, sessions?: object[], snoozes?: object[], snoozeOpen?: string|null, showSnoozed?: boolean, showOlder?: boolean }} [options]
 * @param {number} [now]
 * @returns {string}
 */
export function nowMarkup(input, options = {}, now = Date.now()) {
  if (!input?.data) return input?.error ? `<div class="now now-failed">${failureMarkup(input.error)}</div>` : loadingMarkup();
  const quiet = sortOut(input.data, options.snoozes, now);
  const { working, leftover: stopped } = splitRunning(input.data);
  input = { ...input, data: quiet.data };
  const list = value => Array.isArray(value) ? value : [];
  const leftover = unsnoozed(stopped, quiet);
  const view = { ...input, data: { ...input.data, errors: input.data.errors || {}, waiting: list(input.data.waiting), refused: list(input.data.refused), running: working, active: list(input.data.active), recent: list(input.data.recent) } };
  const since = view.since === undefined ? null : view.since;
  const context = { ...options, demo: Boolean(view.data.demo), now, since: moment(since), sinceIso: since, runs: view.data.errors.recent ? [] : view.data.recent, dots: true, leftover, shifts: shiftsOf(view.data.active), snoozable: Array.isArray(options.snoozes) };
  const { data: visible, held } = visibleNow(view.data, view.shown ?? null);
  const note = view.data.demo ? demoNote('Illustrative records · no model calls, no spend') : '';
  return `<div class="now"${view.loading ? ' aria-busy="true"' : ''}>${note}${staleBanner(view, now)}${unsettledBanner(view, now)}${digestMarkup(view, since, now)}${statsMarkup(view)}<div class="now-columns"><div class="now-main">${options.yours || ''}${waitingCard(view, visible, held, context)}${quietMarkup(quiet, context)}</div><div class="now-rail">${runningCard(view, context)}${recentCard(view, visible, held, context)}${view.asksEnabled === false ? '' : asksCard(view)}</div></div></div>`;
}

const loopGroups = {
  review: { ...groups[0], hint: 'Agents finished these. Only you can accept: merge it, or ask for changes on the forge.' },
  proposed: groups[2],
  needs: { ...groups[1], hint: '' },
};

/**
 * The counts of the loop, from one reading of the Now response: `decide` (pull requests and proposals waiting on you),
 * `stuck` (Work Items Ploeg stopped on), `refused` (tasks Ploeg could not start), `stale` (Work Items that stopped
 * retrying, from the summary), `running` (running Runs and Work Items waiting to run). `needYou` adds decide, stuck and
 * refused, the same number the Now badge shows. A group Ploeg could not list is null.
 * @param {object} view `state.now` with `data` normalised.
 * @returns {{ decide: number|null, stuck: number|null, refused: number|null, stale: number, running: number|null, needYou: number|null }}
 */
export function loopCounts(view) {
  const data = view.data;
  const waiting = data.errors?.waiting ? null : data.waiting;
  const decide = waiting ? waiting.filter(entry => ['review', 'proposed'].includes(waitingGroup(entry))).length : null;
  const stuck = waiting ? waiting.filter(entry => waitingGroup(entry) === 'needs').length : null;
  const stale = waiting ? staleCount(view) : 0;
  const refused = data.errors?.refused ? null : data.refused.length;
  const running = data.errors?.running ? null : data.running.length + (waitingToRun(data)?.length ?? 0);
  const needYou = decide === null || stuck === null ? null : decide + stuck + (refused ?? 0);
  return { decide, stuck, refused, stale, running, needYou };
}

/**
 * Whether what needs you got worse since `since` (the digest baseline): a Work Item started waiting on you, Ploeg
 * refused a task, or a stopped Work Item still holds budget through a Run Ploeg left running. Only then does the
 * loop's day line take the attention tone.
 * @param {object} view `state.now` with `data` normalised.
 * @param {string|null} since
 * @param {Map<string, object>} leftover From `splitRunning`.
 * @returns {boolean}
 */
export function gettingWorse(view, since, leftover) {
  if (leftover?.size) return true;
  if (since === null || since === undefined) return false;
  const fresh = digestCounts(view.data, since);
  if ([fresh.review, fresh.needsYou, fresh.proposed].some(value => value > 0)) return true;
  const start = moment(since);
  return !view.data.errors?.refused && view.data.refused.some(entry => after(entry.refusedAt, start));
}

function dayLine(view, counts, { worse = false, decideFolded = false } = {}) {
  const summary = view.summary?.data;
  const demo = Boolean(view.data.demo || summary?.demo);
  const settled = summary?.totals?.spend?.settledUsd;
  const reserved = summary?.totals?.spend?.reservedUsd;
  const clear = counts.needYou === 0;
  const head = counts.needYou === null ? 'Could not count what needs you'
    : clear ? 'Nothing needs you'
    : `${format.plural(counts.needYou, 'thing needs', 'things need')} you`;
  const parts = [
    counts.decide ? `${format.count(counts.decide)} to decide` : '',
    counts.stuck ? `${format.count(counts.stuck)} to unstick` : '',
    counts.refused ? `${format.count(counts.refused)} could not start` : '',
  ].filter(Boolean);
  const day = [
    counts.running === null ? '' : counts.running ? `${format.count(counts.running)} running` : 'nothing running',
    demo ? 'no spend in the demo' : amount(settled) ? `${format.money(settled)} spent${amount(reserved) && reserved > 0 ? ` + ${format.money(reserved)} held` : ''}` : '',
  ].filter(Boolean);
  const tone = counts.needYou === null ? 'neutral' : clear ? 'success' : worse ? 'attention' : 'neutral';
  const quiet = decideFolded && !clear ? '<span class="loop-day-quiet"> · nothing to decide</span>' : '';
  return `<section class="loop-day" data-tone="${tone}" aria-labelledby="loop-day-title"><span class="loop-day-icon" aria-hidden="true">${icon(clear ? 'check-circle' : worse ? 'alert' : 'inbox')}</span><div class="loop-day-text"><h2 class="loop-day-title" id="loop-day-title">${escape(head)}${parts.length ? `<span class="loop-day-split">: ${escape(parts.join(', '))}</span>` : ''}${quiet}</h2>${day.length ? `<p class="loop-day-facts">${escape(day.join(' · '))}</p>` : ''}</div></section>`;
}

function laneCard(id, title, total, tone, body, clearText, quiet = '') {
  if (!total && clearText) return `<section class="loop-lane loop-clear loop-${id}" aria-labelledby="loop-${id}-title"><span class="loop-clear-icon" aria-hidden="true">${icon('check')}</span><h2 class="loop-clear-title" id="loop-${id}-title">${escape(title)}</h2><p class="loop-clear-text">${escape(clearText)}</p>${quiet}</section>`;
  return `<section class="card flush now-card loop-lane loop-${id}" aria-labelledby="loop-${id}-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="loop-${id}-title">${escape(title)}${total ? count(total, { tone }) : ''}</h2></div></header><div class="card-body">${body}${quiet}</div></section>`;
}

function unsnoozed(leftover, quiet) {
  const hidden = new Set(quiet.snoozed.filter(item => item.kind === 'work').map(item => String(item.entry.id)));
  return hidden.size ? new Map([...leftover].filter(([id]) => !hidden.has(id))) : leftover;
}

function failures(runs) {
  const map = new Map();
  for (const run of byFinish(runs)) {
    if (run.outcome !== 'failed' || run.shadow) continue;
    const key = String(run.workItemId);
    const known = map.get(key);
    const meta = runFailure(run);
    if (known) { known.count += 1; known.infra = known.infra && Boolean(meta?.infra); continue; }
    map.set(key, { label: meta?.label || 'Failed', text: firstSentence(runFailureText(run).reason), infra: Boolean(meta?.infra), owner: meta?.owner || '', role: run.role || '', round: run.round || null, count: 1 });
  }
  return map;
}

function loopRecent(view, visible, held, context, hide) {
  const error = view.data.errors?.recent;
  const groupsById = new Map();
  for (const run of byFinish(visible.recent)) {
    const key = String(run.workItemId);
    if (hide.has(key)) continue;
    const known = groupsById.get(key);
    if (known) known.more += 1; else groupsById.set(key, { run, more: 0 });
  }
  const rows = [...groupsById.values()].slice(0, recentLimit);
  const pill = held.recent ? showNew('recent', `${format.count(held.recent)} new`) : '';
  let body;
  if (error) body = errorState('recent', 'Could not load finished Runs', error);
  else if (!rows.length) body = `<p class="now-group-empty">${visible.recent.length ? 'Every recent Run belongs to work listed on the left.' : 'No Run has finished yet.'}</p>`;
  else body = `<ul class="list now-list">${rows.map(({ run, more }) => recentRow(run, context, more)).join('')}</ul>`;
  return `<section class="card flush now-card now-recent" aria-labelledby="now-recent-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-recent-title">Recently ended</h2></div><div class="card-actions">${button({ id: 'now-recent-all', label: 'View all', size: 'sm', variant: 'ghost', href: '#runs?state=finished', ariaLabel: 'View all finished Runs' })}</div></header><div class="card-body">${pill}${body}</div></section>`;
}

/**
 * Renders Now as the loop, under the `now.loop` Labs flag. One line says how many things need you, split into to
 * decide, stuck and could not start (`loopCounts`, the only source of those numbers), with what runs and what was spent
 * in 24 hours. It is amber only when that got worse since your last visit (`gettingWorse`). Then the lanes in the order
 * a person works them: Decide (pull requests and proposals only a person can accept), Unstick (what Ploeg stopped on,
 * each with its last failed Run and why, then the tasks it refused) and Up next (`options.start`, markup from
 * `start.js`). An empty Decide folds into the day line as "nothing to decide"; another lane with nothing in it folds to
 * one line. In flight, with the hand-offs made from here (`options.handed`), and the Runs that ended, one row per Work
 * Item and none for work already in a lane, sit beside them. `options.hideQueued` names `provider:externalId` keys whose
 * queued row the hand-off list already shows. A stopped Work Item that only needs a new attempt offers Try again in its
 * row instead of sending you to the tracker, and Check Status first when its last Runs failed on infrastructure;
 * `options.retryHere` false leaves Try again out, as for a viewer. `options.canCancel` adds Cancel (Close Work Item
 * after a closed pull request), and `options.sessions` lets a row driven by an Unfold session open it. The digest shows
 * only when something changed since your last visit. Loading and failure match the desk.
 * @param {object} input `state.now`, as for `nowMarkup`.
 * `options.yours` is the person's own waiting agent sessions, as for `nowMarkup`, shown first among the lanes. Snoozes work
 * as for `nowMarkup`; the "N snoozed" and "N older refusals" lines sit at the end of Unstick, also when it is clear.
 * @param {{ start?: string, handed?: string, hideQueued?: Set<string>, retryHere?: boolean, canCancel?: boolean, sessions?: object[], grafanaUrl?: string, singleKeys?: boolean, yours?: string, snoozes?: object[], snoozeOpen?: string|null, showSnoozed?: boolean, showOlder?: boolean }} [options]
 * @param {number} [now]
 * @returns {string}
 */
export function loopMarkup(input, options = {}, now = Date.now()) {
  if (!input?.data) return nowMarkup(input, options, now);
  const quiet = sortOut(input.data, options.snoozes, now);
  const { working, leftover: stopped } = splitRunning(input.data);
  input = { ...input, data: quiet.data };
  const list = value => Array.isArray(value) ? value : [];
  const hide = options.hideQueued || new Set();
  const active = list(input.data.active).filter(entry => !(entry.state === 'queued' && hide.has(`${entry.provider}:${entry.externalId}`)));
  const leftover = unsnoozed(stopped, quiet);
  const view = { ...input, data: { ...input.data, errors: input.data.errors || {}, waiting: list(input.data.waiting), refused: list(input.data.refused), running: working, active, recent: list(input.data.recent) } };
  const since = view.since === undefined ? null : view.since;
  const runs = view.data.errors.recent ? [] : view.data.recent;
  const context = { ...options, demo: Boolean(view.data.demo), now, since: moment(since), sinceIso: since, runs, dots: true, retryHere: options.retryHere !== false, lastFailure: failures(runs), leftover, shifts: shiftsOf(active), snoozable: Array.isArray(options.snoozes) };
  const { data: visible, held } = visibleNow(view.data, view.shown ?? null);
  const error = view.data.errors.waiting;
  const rows = byWaitingSince(visible.waiting);
  const counts = loopCounts(view);
  const local = { ...context, stale: error ? 0 : staleCount(view), truncated: new Set(waitingStates.filter(state => stateTruncated(view.data, state))) };
  const pill = held.waiting ? showNew('waiting', format.plural(held.waiting, 'new Work Item')) : '';
  const of = group => rows.filter(entry => waitingGroup(entry) === group);
  const decideRows = [...of('review'), ...of('proposed')];
  const decide = error ? errorState('waiting', 'Could not load what waits on you', error)
    : `${pill}${['review', 'proposed'].filter(group => of(group).length).map(group => groupMarkup(loopGroups[group], of(group), local)).join('')}`;
  const stuck = of('needs').length || local.stale ? needsMarkup(of('needs'), loopGroups.needs, local, 'loop-unstick-title') : '';
  const unstick = `${stuck}${refusedMarkup(view.data, context)}`;
  const unstickTotal = (counts.stuck ?? 0) + (counts.refused ?? 0);
  const fresh = digestCounts(view.data, since);
  const news = since !== null && [fresh.review, fresh.needsYou, fresh.proposed].some(value => value > 0);
  const note = view.data.demo ? demoNote('Illustrative records · no model calls, no spend') : '';
  const decideFolded = !error && !decideRows.length && !held.waiting;
  const lanes = `${options.yours || ''}${decideFolded ? '' : laneCard('decide', 'Decide', error ? 1 : decideRows.length, 'review', decide, '')}${error ? '' : laneCard('unstick', 'Unstick', unstickTotal, 'attention', unstick, 'Nothing is stuck.', quietMarkup(quiet, context))}${options.start || ''}`;
  const hideRecent = new Set(rows.map(entry => String(entry.id)));
  const running = (view.data.errors.running ? 0 : view.data.running.length) + (waitingToRun(view.data)?.length ?? 0);
  const flight = running || view.data.errors.running ? runningCard(view, { ...context, handOver: false }) : '<section class="loop-lane loop-clear" aria-labelledby="loop-flight-title"><span class="loop-clear-icon" aria-hidden="true">' + icon('runs') + '</span><h2 class="loop-clear-title" id="loop-flight-title">In flight</h2><p class="loop-clear-text">Nothing runs or waits for a worker.</p></section>';
  const rail = `${options.handed ? `<section class="card flush now-card loop-handed" aria-labelledby="loop-handed-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="loop-handed-title">Just handed over</h2></div></header><div class="card-body">${options.handed}</div></section>` : ''}${flight}${loopRecent(view, visible, held, context, hideRecent)}`;
  return `<div class="now now-loop"${view.loading ? ' aria-busy="true"' : ''}>${note}${staleBanner(view, now)}${unsettledBanner(view, now)}${dayLine(view, counts, { worse: gettingWorse(view, since, leftover), decideFolded })}${news ? digestMarkup(view, since, now) : ''}<div class="now-columns"><div class="now-main loop-lanes">${lanes}</div><div class="now-rail">${rail}</div></div></div>`;
}
