import { escape, safeUrl } from './core/dom.js';
import { icon } from './core/icons.js';
import * as format from './core/format.js';
import { runOutcome, verdict as verdictMeta, failureReason, workItemState } from './core/states.js';
import { listReason, routingWarning } from './core/reasons.js';
import { badge, button, callout, chip, count, emptyState, kbd, listRow, meter, skeleton, stat, timeAgo, demoNote } from './core/ui.js';

/** How long the Now page must be out of sight before the digest starts a new "since" period. */
export const awayAfter = 30 * 60 * 1000;

/** How many finished Runs the Now page lists; the rest are one link away on Runs. */
export const recentLimit = 6;

const groups = [
  { id: 'review', state: 'awaiting_review', title: 'Ready for your review', hint: 'Open the pull request, then merge or ask for changes in the forge.', empty: 'No pull request waits for your review.', tone: 'review', glyph: 'pull-request' },
  { id: 'needs', state: 'needs_human', title: 'Needs you', hint: 'Ploeg stopped. Fix the cause, then assign the task to the Team again.', empty: 'Ploeg is not stuck on anything.', tone: 'attention', glyph: 'alert' },
  { id: 'proposed', state: 'proposed', title: 'Proposed', hint: 'Agents found this work. Nothing runs until you approve it.', empty: 'No proposal waits for a decision.', tone: 'neutral', glyph: 'proposed' },
];
const kinds = { split: 'Split from its source', clarify: 'Clarification', discovered: 'Found along the way' };
const infrastructure = new Set(['writing_run_killed_repeatedly', 'stale_infrastructure']);
const amount = value => typeof value === 'number' && Number.isFinite(value);
const moment = value => { const time = Date.parse(value ?? ''); return Number.isFinite(time) ? time : null; };
const after = (value, since) => since !== null && moment(value) !== null && moment(value) > since;
const joinDots = parts => { const shown = parts.filter(Boolean); return shown.length ? `<span class="now-facts"><span class="now-facts-list">${shown.map(part => `<span>${part}</span>`).join('')}</span></span>` : ''; };
const retryButton = `<button type="button" class="button secondary sm" data-action="now-retry">${icon('refresh')}<span class="button-label">Try again</span></button>`;
const caughtUpButton = `<button type="button" class="button ghost sm" data-action="now-caught-up">${icon('check')}<span class="button-label">Mark as caught up</span></button>`;
const showNew = text => `<button type="button" class="chip now-new" data-tone="accent" data-action="now-show-new">${icon('arrow-up-right')}<span>${escape(text)} · Show</span></button>`;

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

/**
 * Names the start of a digest period: "Since 09:12" today, "Since yesterday 22:10", otherwise
 * "Since 28-09-2026 22:10". Empty for a missing or invalid moment.
 * @param {string|number|null} since
 * @param {number} [now]
 * @returns {string}
 */
export function sinceLabel(since, now = Date.now()) {
  const start = moment(since);
  if (start === null) return '';
  const clock = format.time(start);
  if (format.date(start) === format.date(now)) return `Since ${clock}`;
  if (format.date(start) === format.date(now - 86400000)) return `Since yesterday ${clock}`;
  return `Since ${format.dateTime(start)}`;
}

/**
 * Counts what changed after `since` in a `GET /api/ploeg/now` response: Work Items that became ready for
 * review or started needing you (by `updatedAt`), proposals created, and finished Runs. A group that failed
 * to load counts as null. `finishedCapped` is true when every listed Run is newer, so the real number may be higher.
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
  return { review: fresh('awaiting_review'), needsYou: fresh('needs_human'), proposed: fresh('proposed', 'createdAt'), finished, finishedCapped: Boolean(recent?.length) && finished === recent.length && recent.length >= 25 };
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

function grafanaTeam(grafanaUrl, team) {
  const base = safeUrl(grafanaUrl);
  return base ? `${base.replace(/\/$/, '')}/d/glide-loop?var-team=${encodeURIComponent(team)}` : null;
}

function repository(target) {
  if (!target?.repo) return '';
  const full = target.owner ? `${target.owner}/${target.repo}` : target.repo;
  return chip({ label: target.repo, icon: 'branch', title: target.baseBranch ? `${full}, base branch ${target.baseBranch}` : full });
}

function reference(entry) {
  return entry.externalId ? `<span class="now-ref">${escape(entry.externalId)}</span>` : '';
}

function shiftSpend(entry, demo) {
  if (demo) return '';
  const shift = entry.latestShift;
  const spent = shift ? shift.spentUsd : entry.spentUsd;
  if (!amount(spent)) return 'Spend not reported';
  return amount(shift?.budgetUsd) && shift.budgetUsd > 0 ? `${format.moneyHtml(spent)} of ${format.moneyHtml(shift.budgetUsd)}` : `${format.moneyHtml(spent)} spent`;
}

function waitingMeta(entry, demo) {
  const reason = listReason(entry);
  const warning = routingWarning(entry);
  const chips = [];
  if (reason) chips.push(chip({ label: reason.chip, tone: reason.tone, title: `${reason.sentence} ${reason.action}` }));
  if (warning) chips.push(chip({ label: warning.chip, tone: warning.tone, icon: warning.glyph, title: warning.sentence }));
  else if (entry.state !== 'proposed') chips.push(repository(entry.target));
  if (entry.state === 'proposed') {
    if (entry.createdKind && kinds[entry.createdKind]) chips.push(chip({ label: kinds[entry.createdKind] }));
    if (entry.ready === false) chips.push(chip({ label: 'Needs refinement', tone: 'attention', title: 'Not Ready yet: the brief needs refining before an agent can pick it up.' }));
  }
  const round = entry.state !== 'proposed' && entry.latestShift?.round ? `Round ${escape(entry.latestShift.round)}` : '';
  const source = entry.state === 'proposed' && entry.sourceTitle ? `<span class="now-source-line">From <span class="now-source">${escape(entry.sourceTitle)}</span></span>` : '';
  const spend = entry.state === 'awaiting_review' ? shiftSpend(entry, demo) : '';
  return `${chips.join('')}${joinDots([escape(entry.team), reference(entry), round, spend])}${source}`;
}

function linkIcon(id, href, glyph, label) {
  return `<a class="button ghost sm icon-only" id="${escape(id)}" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(`${label} (opens in a new tab)`)}" title="${escape(label)}">${icon(glyph)}</a>`;
}

function waitingActions(entry, options) {
  const title = entry.title || `Work Item ${entry.id}`;
  const actions = [];
  const tracker = safeUrl(entry.url);
  if (tracker) actions.push(linkIcon(`now-tracker-${entry.id}`, tracker, 'external', `Open “${title}” in the tracker`));
  const reason = listReason(entry);
  const grafana = reason && infrastructure.has(reason.code) ? grafanaTeam(options.grafanaUrl, entry.team) : null;
  if (grafana) actions.push(linkIcon(`now-grafana-${entry.id}`, grafana, 'activity', `Open Grafana for the ${entry.team} Team`));
  const pr = entry.state === 'awaiting_review' ? safeUrl(entry.pullRequestUrl) : null;
  if (pr) actions.push(button({ id: `now-pr-${entry.id}`, label: 'Pull request', icon: 'pull-request', size: 'sm', href: pr, external: true, ariaLabel: `Pull request for ${title}` }));
  if (entry.state === 'proposed') actions.push(button({ id: `now-decide-${entry.id}`, label: 'Decide', icon: 'arrow', size: 'sm', href: '#proposed', ariaLabel: `Decide on ${title}` }));
  return actions.length ? `<div class="now-item-actions">${actions.join('')}</div>` : '';
}

function waitingRow(entry, options, since) {
  const reason = listReason(entry);
  const meta = workItemState(entry.state);
  const target = openTarget(entry);
  const created = entry.state === 'proposed';
  const when = created ? entry.createdAt : entry.updatedAt;
  const row = listRow({
    href: `#work/${entry.id}`,
    id: `now-row-w-${entry.id}`,
    tone: reason?.tone || meta.tone,
    lead: icon(reason?.glyph || meta.glyph),
    title: entry.title || `Work Item ${entry.id}`,
    meta: waitingMeta(entry, options.demo),
    trail: when ? `<span class="now-when"><span class="now-when-label">${created ? 'Created' : 'Updated'} </span>${timeAgo(when)}</span>` : '',
    data: { nowRow: true, openUrl: target?.href, openLabel: target?.label, unread: after(when, moment(since)) || null },
  });
  return `<li class="now-item">${row}${waitingActions(entry, options)}</li>`;
}

function groupError(title, message) {
  return emptyState({ icon: 'x-circle', tone: 'danger', compact: true, title: `${title} could not be read`, body: escape(message), actions: retryButton });
}

function staleNote(stale) {
  if (!amount(stale) || stale < 1) return '';
  const subject = stale === 1 ? '1 Work Item stopped retrying' : `${format.count(stale)} Work Items stopped retrying`;
  return `<div class="now-stale" data-tone="severe"><span class="now-stale-icon" aria-hidden="true">${icon('clock')}</span><p><strong>${escape(subject)}.</strong> Ploeg gave up after repeated failures. Now does not list ${stale === 1 ? 'it' : 'them'}; ${stale === 1 ? 'it is' : 'they are'} in Work under All.</p>${button({ id: 'now-stale-open', label: 'Open Work', size: 'sm', variant: 'ghost', href: '#work?lane=all', ariaLabel: 'Open all Work Items in Work' })}</div>`;
}

function allClear(data, summary, now) {
  const running = data.errors?.running ? null : (data.running || []).length;
  const last = (data.errors?.recent ? [] : data.recent || []).map(run => moment(run.finishedAt)).filter(value => value !== null).sort((a, b) => b - a)[0];
  const parts = [];
  if (running) parts.push(`${format.plural(running, 'Run')} ${running === 1 ? 'is' : 'are'} working`);
  else if (running === 0) parts.push('No Run is working right now');
  if (last) parts.push(`the last Run finished ${format.relative(last, now)}`);
  const queued = summary?.data?.totals?.workItems?.queued;
  if (!running && amount(queued) && queued > 0) parts.push(`${format.plural(queued, 'Work Item')} ${queued === 1 ? 'is' : 'are'} queued`);
  const sentence = parts.length ? `${parts.join('; ')}.` : 'Ploeg handles the rest and shows new decisions here first.';
  return emptyState({ icon: 'check-circle', tone: 'success', title: 'Nothing waits on you', body: escape(sentence[0].toUpperCase() + sentence.slice(1)) });
}

function waitingCard(view, visible, held, options, since, now) {
  const data = visible;
  const error = view.data.errors?.waiting;
  const total = error ? null : (view.data.waiting || []).length;
  const pill = held.waiting ? showNew(format.plural(held.waiting, 'new Work Item')) : '';
  const hints = options.singleKeys && !error && total ? `<p class="now-keys" aria-hidden="true">${kbd(['j', 'k'])}<span>move</span>${kbd('o')}<span>open link</span></p>` : '';
  let body;
  if (error) body = groupError('Waiting work', error);
  else if (!data.waiting.length && !held.waiting) body = allClear(view.data, view.summary, now);
  else {
    body = groups.map(group => {
      const rows = data.waiting.filter(entry => entry.state === group.state);
      const list = rows.length ? `<ul class="list now-list" aria-labelledby="now-group-${group.id}">${rows.map(entry => waitingRow(entry, options, since)).join('')}</ul>` : `<p class="now-group-empty">${escape(group.empty)}</p>`;
      const extra = group.id === 'needs' ? staleNote(view.summary?.data?.totals?.workItems?.stale) : '';
      return `<section class="now-group" data-group="${group.id}" aria-labelledby="now-group-${group.id}"><header class="now-group-header" data-tone="${group.tone}"><h3 class="now-group-title" id="now-group-${group.id}">${icon(group.glyph)}<span>${escape(group.title)}</span>${count(rows.length)}</h3><p class="now-group-hint">${escape(group.hint)}</p></header>${list}${extra}</section>`;
    }).join('');
  }
  return `<section class="card flush now-card now-waiting" aria-labelledby="now-waiting-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-waiting-title">Waiting on you${count(total, { tone: total ? 'attention' : undefined })}</h2></div><div class="card-actions">${pill}${hints}</div></header><div class="card-body">${body}</div></section>`;
}

function runningRow(run, options, now) {
  const models = run.reservedModels?.length ? run.reservedModels : run.usage?.models || [];
  const started = moment(run.startedAt);
  const facts = joinDots([escape(run.team), run.role ? escape(run.role) : '', run.round ? `Round ${escape(run.round)}` : '', models.length ? escape(models.join(', ')) : '']);
  const spend = meter({ settled: run.observedUsd, authorized: run.authorizedUsd, demo: options.demo, label: '', size: 'sm' });
  const elapsed = started === null ? '<span class="subtle">Not started</span>' : `<span title="Started ${escape(format.dateTime(started))}">${escape(format.duration((now - started) / 1000))}</span>`;
  return `<li><a class="list-row now-run" href="#work/${escape(run.workItemId)}" id="now-row-r-${escape(run.id)}" data-tone="live" data-now-row><span class="list-row-lead"><span class="live-dot" aria-hidden="true"></span></span><div class="list-row-main"><span class="list-row-title">${escape(run.workItemTitle || `Work Item ${run.workItemId}`)}</span><span class="list-row-meta">${facts}</span><div class="now-run-meter">${spend}</div></div><span class="list-row-trail num">${elapsed}</span></a></li>`;
}

function runningCard(view, options, now) {
  const data = view.data;
  const error = data.errors?.running;
  const runs = data.running || [];
  let body;
  if (error) body = groupError('Running Runs', error);
  else if (!runs.length) {
    const queued = view.summary?.data?.totals?.workItems?.queued;
    const pending = view.summary?.data?.totals?.runs?.pending;
    const detail = amount(pending) && pending > 0 ? `${format.plural(pending, 'Run')} ${pending === 1 ? 'waits' : 'wait'} for a worker.` : amount(queued) && queued > 0 ? `${format.plural(queued, 'Work Item')} ${queued === 1 ? 'is' : 'are'} queued.` : 'Nothing is queued either.';
    body = emptyState({ icon: 'runs', compact: true, title: 'No Run is working', body: escape(detail) });
  } else body = `<ul class="list now-list">${runs.map(run => runningRow(run, options, now)).join('')}</ul>`;
  return `<section class="card flush now-card now-running" aria-labelledby="now-running-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-running-title">Running now${count(error ? null : runs.length, { tone: runs.length ? 'live' : undefined })}</h2></div><div class="card-actions">${button({ id: 'now-running-all', label: 'View all', size: 'sm', variant: 'ghost', href: '#runs?state=running', ariaLabel: 'View all running Runs' })}</div></header><div class="card-body">${body}</div></section>`;
}

function recentRow(run, since) {
  const outcome = runOutcome(run.outcome);
  const tone = outcome?.tone || 'neutral';
  const failure = failureReason(run.failureReason);
  const verdict = run.verdict ? verdictMeta(run.verdict) : null;
  const facts = joinDots([
    `<span class="now-outcome" data-tone="${tone}">${escape(outcome?.label || 'No outcome reported')}</span>`,
    failure ? escape(failure.label) : '',
    run.role ? escape(run.role) : '',
    run.round ? `Round ${escape(run.round)}` : '',
  ]);
  const agentReview = verdict ? badge({ tone: verdict.tone, glyph: verdict.glyph, label: verdict.label, size: 'sm' }) : '';
  return `<li>${listRow({ href: `#work/${run.workItemId}`, id: `now-row-f-${run.id}`, tone, lead: icon(outcome?.glyph || 'circle-slash'), title: run.workItemTitle || `Work Item ${run.workItemId}`, meta: `${agentReview}${facts}`, trail: timeAgo(run.finishedAt), data: { nowRow: true, unread: after(run.finishedAt, moment(since)) || null } })}</li>`;
}

/** Finished Runs newest first by the moment they finished; Runs without a finish time keep their order at the end. */
export function byFinish(runs) {
  return (runs || []).map((run, index) => ({ run, index, at: moment(run.finishedAt) })).sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.index - b.index).map(entry => entry.run);
}

function recentCard(view, visible, held, since) {
  const error = view.data.errors?.recent;
  const runs = byFinish(visible.recent).slice(0, recentLimit);
  const pill = held.recent ? showNew(`${format.count(held.recent)} new`) : '';
  let body;
  if (error) body = groupError('Finished Runs', error);
  else if (!runs.length) body = emptyState({ icon: 'clock', compact: true, title: 'No Run has finished yet', body: 'Finished Runs appear here with their outcome and the agent’s review verdict.' });
  else body = `<ul class="list now-list">${runs.map(run => recentRow(run, since)).join('')}</ul>`;
  return `<section class="card flush now-card now-recent" aria-labelledby="now-recent-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-recent-title">Recently finished</h2></div><div class="card-actions">${pill}${button({ id: 'now-recent-all', label: 'View all', size: 'sm', variant: 'ghost', href: '#runs?state=finished', ariaLabel: 'View all finished Runs' })}</div></header><div class="card-body">${body}</div></section>`;
}

function digestItem(value, singular, pluralForm, tone) {
  if (!value) return '';
  return `<li class="now-digest-item"><span class="status-dot" data-tone="${tone}" aria-hidden="true"></span><strong class="num">${escape(format.count(value))}</strong> ${escape(value === 1 ? singular : pluralForm)}</li>`;
}

function digestMarkup(view, since, now) {
  const data = view.data;
  const waiting = data.errors?.waiting ? null : (data.waiting || []).length;
  const still = waiting === null ? '' : waiting === 0 ? 'Nothing waits on you.' : `${format.plural(waiting, 'Work Item')} ${waiting === 1 ? 'waits' : 'wait'} on you.`;
  if (since === null) {
    return `<section class="now-digest" data-kind="welcome" aria-labelledby="now-digest-title"><span class="now-digest-icon" aria-hidden="true">${icon('spark')}</span><div class="now-digest-text"><h2 class="now-digest-title" id="now-digest-title">Welcome to De Vloer</h2><p class="now-digest-body">Now shows what waits on you, what runs and what finished, across every Team you can read. From your next visit, this line sums up what changed while you were away.</p></div></section>`;
  }
  const counts = digestCounts(data, since);
  const label = sinceLabel(since, now);
  const ago = format.relative(since, now);
  const heading = `${escape(label)}<span class="now-digest-ago"> · ${escape(ago)}</span>`;
  const finished = counts.finished ? `${format.count(counts.finished)}${counts.finishedCapped ? '+' : ''}` : 0;
  const items = [
    digestItem(counts.review, 'ready for review', 'ready for review', 'review'),
    digestItem(counts.needsYou, 'needs you', 'need you', 'attention'),
    digestItem(counts.proposed, 'proposed', 'proposed', 'neutral'),
    finished ? `<li class="now-digest-item"><span class="status-dot" data-tone="success" aria-hidden="true"></span><strong class="num">${escape(finished)}</strong> ${counts.finished === 1 ? 'Run finished' : 'Runs finished'}</li>` : '',
  ].filter(Boolean);
  const unknown = [counts.review, counts.finished].some(value => value === null) ? '<li class="now-digest-item now-digest-unknown">Some changes could not be read</li>' : '';
  if (!items.length) {
    const caughtUp = view.caughtUp;
    return `<section class="now-digest" data-kind="quiet" aria-labelledby="now-digest-title"><span class="now-digest-icon" aria-hidden="true">${icon('check-circle')}</span><div class="now-digest-text"><h2 class="now-digest-title" id="now-digest-title">${caughtUp ? 'You are caught up' : `Nothing new ${escape(label.replace(/^Since/, 'since'))}`}</h2><p class="now-digest-body">${escape(still)}${unknown ? ' Some changes could not be read.' : ''}</p></div></section>`;
  }
  return `<section class="now-digest" data-kind="changes" aria-labelledby="now-digest-title"><span class="now-digest-icon" aria-hidden="true">${icon('spark')}</span><div class="now-digest-text"><h2 class="now-digest-title" id="now-digest-title">${heading}</h2><ul class="now-digest-list">${items.join('')}${unknown}</ul></div><div class="now-digest-actions">${caughtUpButton}</div></section>`;
}

function statsMarkup(view) {
  const data = view.data;
  const summary = view.summary?.data || null;
  const summaryError = view.summary?.error || null;
  const waiting = data.errors?.waiting ? null : data.waiting || [];
  const running = data.errors?.running ? null : data.running || [];
  const inState = state => waiting.filter(entry => entry.state === state).length;
  const breakdown = waiting ? [[inState('awaiting_review'), 'to review'], [inState('needs_human'), 'need you'], [inState('proposed'), 'proposed']].filter(([n]) => n).map(([n, text]) => `${format.count(n)} ${n === 1 && text === 'need you' ? 'needs you' : text}`).join(' · ') : '';
  const unreported = summaryError ? (summaryError.code === 'ploeg_unsupported' ? 'Not reported by this Ploeg' : 'Could not be read') : summary ? '' : 'Loading…';
  const queued = summary?.totals?.workItems?.queued;
  const pending = summary?.totals?.runs?.pending;
  const settled = summary?.totals?.spend?.settledUsd;
  const reserved = summary?.totals?.spend?.reservedUsd;
  const tiles = [
    stat({ label: 'Waiting on you', icon: 'inbox', tone: 'attention', value: waiting ? format.count(waiting.length) : '—', detail: waiting ? breakdown || 'Nothing to decide' : 'Could not be read' }),
    stat({ label: 'Running', icon: 'runs', tone: 'live', href: '#runs?state=running', value: running ? `${format.count(running.length)}${running.length >= 25 ? '+' : ''}` : '—', detail: running ? amount(pending) && pending > 0 ? `${format.plural(pending, 'Run')} waiting for a worker` : running.length ? 'Working now' : 'Nothing is working' : 'Could not be read' }),
    stat({ label: 'Queued', icon: 'circle-dashed', tone: 'neutral', href: '#work?lane=queued', value: amount(queued) ? format.count(queued) : '—', detail: amount(queued) ? queued ? 'Waiting to start' : 'Nothing waits to start' : unreported }),
    stat({ label: 'Spend · 24 h', icon: 'coins', tone: 'neutral', href: '#insights?window=24h', value: summary ? amount(settled) ? format.money(settled) : format.notReported : '—', detail: summary ? data.demo || summary.demo ? 'Demo · no model calls' : amount(reserved) && reserved > 0 ? `Settled · ${format.money(reserved)} reserved` : 'Settled' : unreported }),
  ];
  return `<div class="stat-row now-stats">${tiles.join('')}</div>`;
}

function failureMarkup(error) {
  const code = error?.code || '';
  if (code === 'ploeg_unconfigured') return emptyState({ icon: 'settings', title: 'Connect Ploeg to see your work', body: 'No Ploeg connection is configured for this workbench. An administrator sets it up; Environment shows what is missing.', actions: button({ label: 'Open Environment', href: '#settings/environment' }) });
  if (code === 'ploeg_scope') return emptyState({ icon: 'lock', title: 'Your account has no Ploeg Teams', body: 'Ask an administrator to give your account access to a Team. Its work shows up here as soon as they do.' });
  return emptyState({ icon: 'x-circle', tone: 'danger', title: 'Now could not be read', body: `${escape(error?.message || 'Ploeg did not answer.')} Nothing was started or changed.`, actions: retryButton });
}

function loadingMarkup() {
  return `<div class="now now-skeleton" aria-busy="true"><div class="now-top"><div class="now-digest now-digest-skeleton">${skeleton({ rows: 1, variant: 'text' })}</div>${skeleton({ rows: 4, variant: 'cards' })}</div><div class="now-columns"><div class="card now-card">${skeleton({ rows: 6 })}</div><div class="now-rail"><div class="card now-card">${skeleton({ rows: 2 })}</div><div class="card now-card">${skeleton({ rows: 4 })}</div></div></div></div>`;
}

function staleBanner(view, now) {
  if (!view.error || !view.data) return '';
  const read = moment(view.data.fetchedAt);
  const when = read === null ? '' : ` Showing what Ploeg reported ${format.relative(read, now)}.`;
  return `<div class="now-banner" role="status">${callout({ tone: 'attention', title: 'Could not refresh', body: `<p>${escape(view.error.message || 'Ploeg did not answer.')}${escape(when)}</p>`, actions: retryButton })}</div>`;
}

/**
 * Renders the Now page body: the "Since you were away" digest, the stat row, what waits on you (ready for
 * review, needs you with its reason, proposed), what runs now with its budget meter and what finished recently.
 * `view` is `state.now` plus `since` (the digest baseline, null on a first visit), `shown` (the ids on screen,
 * see `visibleNow`), `summary` ({ data, error } of the 24-hour summary) and `caughtUp`.
 * `options` takes `grafanaUrl` and `singleKeys` (show the j/k/o hints).
 * @param {object} view
 * @param {{ grafanaUrl?: string, singleKeys?: boolean }} [options]
 * @param {number} [now]
 * @returns {string}
 */
export function nowMarkup(view, options = {}, now = Date.now()) {
  if (!view?.data) return view?.error ? `<div class="now now-failed">${failureMarkup(view.error)}</div>` : loadingMarkup();
  const settings = { ...options, demo: Boolean(view.data.demo) };
  const since = view.since === undefined ? null : view.since;
  const { data: visible, held } = visibleNow(view.data, view.shown ?? null);
  const note = view.data.demo ? demoNote('Illustrative Ploeg records. No Run executes, no model is called and nothing is spent.') : '';
  return `<div class="now"${view.loading ? ' aria-busy="true"' : ''}>${note}${staleBanner(view, now)}<div class="now-top">${digestMarkup(view, since, now)}${statsMarkup(view)}</div><div class="now-columns"><div class="now-main">${waitingCard(view, visible, held, settings, since, now)}</div><div class="now-rail">${runningCard(view, settings, now)}${recentCard(view, visible, held, since)}</div></div></div>`;
}
