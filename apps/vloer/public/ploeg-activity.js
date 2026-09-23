import { ploegLanes } from './ploeg.js';

export const ploegWindows = [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']];
export const ploegTabs = [['overview', 'Overview', 'grid'], ['activity', 'Activity', 'activity'], ['runs', 'Runs', 'code'], ['proposed', 'Proposed', 'plus']];
export const eventGroups = [['work', 'Work Items'], ['runs', 'Runs & Shifts'], ['review', 'Review & delivery'], ['spend', 'Spend'], ['other', 'Other']];
const eventLabels = {
  'work_item.queued': 'Queued for dispatch', 'work_item.proposed': 'Proposed by an agent', 'work_item.approved': 'Approved', 'work_item.rejected': 'Rejected', 'work_item.withdrawn': 'Withdrawn', 'work_item.refreshed': 'Refreshed from the tracker',
  'created_work_item.accepted': 'An agent created a Work Item', 'created_work_item.rejected': 'An agent proposal was refused by policy', 'follow_up.created': 'Follow-up created', 'follow_up.skipped': 'Follow-up skipped',
  'run.claimed': 'Run started', 'run.expired': 'Run expired', 'round.opened': 'Round opened', 'round.reopened': 'Round reopened', 'shift.closed': 'Shift closed', 'lease.acquired': 'Lease acquired', 'lease.expired': 'Lease expired',
  'execution.admitted': 'Execution admitted', 'execution.expired': 'Execution expired', 'operator.admitted': 'Admitted by an operator', 'operator.admission_expired': 'Operator admission expired',
  'review.changes_requested': 'Reviewer requested changes', 'checkpoint.written': 'Checkpoint saved', 'delivery.approved': 'Delivery approved', 'delivery.candidate_admitted': 'Delivery candidate admitted', 'delivery.verification_recorded': 'Delivery verified', 'delivery.publication_reserved': 'Publication reserved',
  'llm.reserved': 'Budget reserved', 'llm.minting': 'Model key requested', 'llm.issued': 'Model key issued', 'llm.observed': 'Model spend observed', 'llm.reconciled': 'Spend settled', 'llm.blocked': 'Model access blocked', 'llm.unissued_blocked': 'Model access blocked', 'llm.unknown': 'Spend could not be settled',
};
const groupPrefixes = { work_item: 'work', created_work_item: 'work', follow_up: 'work', run: 'runs', round: 'runs', shift: 'runs', lease: 'runs', execution: 'runs', operator: 'runs', review: 'review', checkpoint: 'review', delivery: 'review', llm: 'spend' };
const createdKinds = { split: 'Split from its source', clarify: 'Clarification', discovered: 'Discovered work' };
const runStates = [['pending', 'Pending'], ['running', 'Running'], ['finished', 'Finished']];
const runOutcomes = ['pr_opened', 'pr_updated', 'issue_updated', 'follow_up_created', 'no_change_needed', 'stuck', 'failed'];

/** Formats US dollars for the owner: two decimals, nl-NL grouping ("US$ 1.234,50"). */
export const usdNl = value => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
/** Formats a count with nl-NL grouping. */
export const countNl = value => new Intl.NumberFormat('nl-NL').format(value || 0);
/** Describes how long ago a timestamp was, relative to `now`. */
export function relativeTime(value, now = Date.now()) {
  if (!value) return 'Never';
  const seconds = Math.max(0, Math.round((now - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}
/** Formats a timestamp in full for tooltips and screen readers. */
export const absoluteTime = value => value ? new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '';
/** Formats a Run duration in seconds as "45 s", "14 min" or "1 h 5 min". */
export function duration(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
/** Names an audit action in plain words and assigns its filter group. */
export function eventKind(action) {
  const prefix = action.split('.')[0];
  const words = text => text.replaceAll('_', ' ');
  const [head, ...rest] = action.split('.');
  return { group: groupPrefixes[prefix] || 'other', label: eventLabels[action] || `${words(head).replace(/^./, char => char.toUpperCase())}${rest.length ? `: ${words(rest.join('.'))}` : ''}` };
}
/** Whether the signed-in user may approve, reject or cancel Ploeg work. Viewers may not. */
export const canDecide = user => user?.role === 'admin' || user?.role === 'operator';

const newestFirst = (a, b) => { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? 1 : x > y ? -1 : 0; };
function unique(events) { const seen = new Set(); return events.filter(entry => !seen.has(entry.id) && seen.add(entry.id)).sort(newestFirst); }
/**
 * Merges a page of events into the feed without duplicates. `older` appends a page read with `before`;
 * `newer` folds in a fresh first page, and replaces the feed when that page does not reach the events already shown.
 */
export function mergeFeed(feed, page, mode) {
  if (!feed?.events?.length) return { events: unique(page.events), nextCursor: page.nextCursor, added: 0 };
  if (mode === 'older') return { events: unique([...feed.events, ...page.events]), nextCursor: page.nextCursor, added: 0 };
  const newest = BigInt(feed.events[0].id);
  const reaches = page.events.some(entry => BigInt(entry.id) <= newest);
  if (!reaches && page.nextCursor) return { events: unique(page.events), nextCursor: page.nextCursor, added: page.events.length, reset: true };
  const events = unique([...page.events, ...feed.events]);
  return { events, nextCursor: feed.nextCursor, added: page.events.filter(entry => BigInt(entry.id) > newest).length };
}

export function ploegTabsMarkup(active, lane, { escape, icon }) {
  const tabs = [...ploegTabs.map(([id, label, glyph]) => [id, label, glyph, `#ploeg${id === 'overview' ? '' : `/${id}`}`, active === id]), ...ploegLanes.map(([id, label, glyph]) => [id, label, glyph, `#ploeg/lane/${id}`, active === 'lanes' && lane === id])];
  return `<nav class="ploeg-tabs" aria-label="Ploeg views">${tabs.map(([id, label, glyph, href, current], index) => `${index === ploegTabs.length ? '<span class="ploeg-tabs-divider" aria-hidden="true"></span>' : ''}<a href="${href}" data-tab="${escape(id)}" class="${current ? 'selected' : ''}" ${current ? 'aria-current="page"' : ''}>${icon(glyph)}${escape(label)}</a>`).join('')}</nav>`;
}

function notice(error, { escape, icon }) {
  if (error.code === 'ploeg_unsupported') return `<section class="panel"><div class="empty" role="note"><span class="empty-icon">${icon('info')}</span><h2>This Ploeg version does not provide activity data yet</h2><p>Upgrade Ploeg to read summaries, Runs and the activity feed here. The work lanes and review screen still work.</p><a class="button secondary" href="#ploeg/work">Open the work lanes ${icon('arrow')}</a></div></section>`;
  if (error.code === 'ploeg_unconfigured' || error.code === 'ploeg_scope') return `<section class="panel"><div class="empty"><span class="empty-icon">${icon('layers')}</span><h2>${error.code === 'ploeg_scope' ? 'Your account has no Ploeg teams' : 'Connect Ploeg to your workbench'}</h2><p>${escape(error.message)}</p></div></section>`;
  return `<section class="panel"><div class="empty"><span class="empty-icon">${icon('info')}</span><h2>Ploeg needs attention</h2><p role="alert">${escape(error.message)}</p><button class="button secondary" data-action="ploeg-reload">Try again</button></div></section>`;
}
const loading = (text, { icon }) => `<section class="panel"><div class="empty" role="status"><span class="empty-icon">${icon('layers')}</span><h2>${text}</h2><p>Reading Ploeg’s operator records for your teams.</p></div></section>`;
const demoCaption = ({ icon }) => `<div class="ploeg-caption illustrative">${icon('info')}<span>Illustrative Ploeg records. No Run executed, no model was called and spend is US$ 0,00.</span></div>`;
const when = (value, now) => value ? `<time datetime="${value}" title="${absoluteTime(value)}">${relativeTime(value, now)}</time>` : '<span class="ploeg-review-muted">Never</span>';
const teamSelect = (id, label, teams, selected, escape) => `<label class="ploeg-filter"><span class="tiny-label">${label}</span><select id="${id}" aria-label="${label.toLowerCase().replace(/^./, char => char.toUpperCase())}"><option value="">All teams</option>${teams.map(team => `<option value="${escape(team)}" ${team === selected ? 'selected' : ''}>${escape(team)}</option>`).join('')}</select></label>`;
const refreshButton = (action, busy, { icon }) => `<button class="button secondary" data-action="${action}" ${busy ? 'disabled' : ''}>${icon('activity')} ${busy ? 'Refreshing…' : 'Refresh'}</button>`;

export function overviewMarkup(view, helpers, now = Date.now()) {
  const { escape, icon } = helpers;
  const windows = `<div class="ploeg-window" role="group" aria-label="Time window">${ploegWindows.map(([id, label]) => `<button data-action="ploeg-window" data-id="${id}" aria-pressed="${view.window === id}" aria-label="${label}" class="${view.window === id ? 'selected' : ''}">${id}</button>`).join('')}</div>`;
  const data = view.data;
  const toolbar = `<div class="ploeg-toolbar">${windows}${data ? `<span class="ploeg-generated">Generated ${when(data.generatedAt, now)}</span>` : ''}${refreshButton('ploeg-reload', view.loading, helpers)}</div>`;
  if (view.error) return `${toolbar}${notice(view.error, helpers)}`;
  if (!data) return `${toolbar}${loading('Reading Ploeg’s summary', helpers)}`;
  const totals = data.totals;
  const tile = (label, value, detail, glyph, cls, href) => `<${href ? `a href="${href}"` : 'article'} class="ploeg-metric ploeg-tile ${cls}"><span>${icon(glyph)}${label}</span><strong>${value}</strong><small>${detail}</small></${href ? 'a' : 'article'}>`;
  const spendDetail = data.demo ? 'Demo · no model calls' : `Reserved now ${usdNl(totals.spend.reservedUsd)}`;
  const tiles = `<section class="ploeg-tiles" aria-label="Totals across your teams">${[
    tile('Awaiting review', countNl(totals.workItems.awaitingReview), 'Your inbox', 'check', 'awaiting_review', '#ploeg/lane/awaiting_review'),
    tile('Needs human', countNl(totals.workItems.needsHuman), 'Decisions and blocked work', 'info', 'needs_human', '#ploeg/lane/needs_human'),
    tile('Running', countNl(totals.workItems.leased), `${countNl(totals.runs.running)} ${totals.runs.running === 1 ? "Run" : "Runs"} executing now`, 'activity', 'leased', '#ploeg/lane/leased'),
    tile('Queued', countNl(totals.workItems.queued), `${countNl(totals.runs.pending)} ${totals.runs.pending === 1 ? "Run" : "Runs"} pending`, 'layers', 'queued', '#ploeg/lane/queued'),
    tile('Proposed', countNl(totals.workItems.proposed), 'Awaiting your approval', 'plus', 'proposed', '#ploeg/proposed'),
    tile(`Settled · ${escape(data.window)}`, usdNl(totals.spend.settledUsd), spendDetail, 'clock', 'spend'),
  ].join('')}</section>`;
  const cell = value => `<td class="num">${countNl(value)}</td>`;
  const row = (team, entry, footer = false) => `<tr>${footer ? '<th scope="row">All teams</th>' : `<th scope="row">${escape(team)}</th>`}${cell(entry.workItems.awaitingReview)}${cell(entry.workItems.needsHuman)}${cell(entry.workItems.leased)}${cell(entry.workItems.queued)}${cell(entry.workItems.proposed)}${cell(entry.runs.finished)}${cell(entry.runs.failed)}${cell(entry.runs.stuck)}<td class="num">${data.demo ? 'No model calls' : usdNl(entry.spend.settledUsd)}</td><td>${footer ? '' : when(entry.lastActivityAt, now)}</td></tr>`;
  const head = `<thead><tr><th scope="col">Team</th><th scope="col" class="num">Awaiting review</th><th scope="col" class="num">Needs human</th><th scope="col" class="num">Running</th><th scope="col" class="num">Queued</th><th scope="col" class="num">Proposed</th><th scope="col" class="num">Finished</th><th scope="col" class="num">Failed</th><th scope="col" class="num">Stuck</th><th scope="col" class="num">Settled</th><th scope="col">Last activity</th></tr></thead>`;
  const table = data.teams.length ? `<div class="ploeg-table-wrap" tabindex="0" role="region" aria-label="Per-team summary"><table class="ploeg-table">${head}<tbody>${data.teams.map(entry => row(entry.team, entry)).join('')}</tbody>${data.teams.length > 1 ? `<tfoot>${row('', totals, true)}</tfoot>` : ''}</table></div>` : '<div class="empty compact"><h3>No teams available to your account</h3><p>Ask an administrator to check team scope on both sides of the connection.</p></div>';
  return `${data.demo ? demoCaption(helpers) : ''}${toolbar}${tiles}<section class="panel"><div class="panel-heading"><div><h2>Teams</h2><p>Work Item counts are current. Finished Runs (failed and stuck included) and settled spend cover the last ${escape(ploegWindows.find(([id]) => id === data.window)?.[1] || data.window)}.</p></div></div>${table}</section>`;
}

export function activityMarkup(view, teams, helpers, now = Date.now()) {
  const { escape, icon } = helpers;
  const kinds = `<label class="ploeg-filter"><span class="tiny-label">KIND</span><select id="ploeg-feed-kind" aria-label="Event kind"><option value="">All kinds</option>${eventGroups.map(([id, label]) => `<option value="${id}" ${view.kind === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  const toolbar = `<div class="ploeg-toolbar ploeg-filters">${teamSelect('ploeg-feed-team', 'TEAM', teams, view.team, escape)}${kinds}<span class="ploeg-generated">${view.refreshedAt ? `Updated ${when(view.refreshedAt, now)} · refreshes every 15 s` : ''}</span>${refreshButton('ploeg-reload', view.loading, helpers)}</div>`;
  if (view.error && !view.events) return `${toolbar}${notice(view.error, helpers)}`;
  if (!view.events) return `${toolbar}${loading('Reading Ploeg’s activity', helpers)}`;
  const shown = view.events.filter(entry => !view.kind || eventKind(entry.action).group === view.kind);
  const item = entry => { const kind = eventKind(entry.action); return `<li class="ploeg-feed-item" id="ploeg-event-${escape(entry.id)}" data-event-id="${escape(entry.id)}"><span class="ploeg-feed-dot ${kind.group}"></span><div><div class="ploeg-feed-meta">${when(entry.at, now)}<span class="tag">${escape(entry.team)}</span><span>${escape(entry.actor)}</span></div><strong>${escape(kind.label)}</strong><a class="ploeg-link" href="#ploeg/${escape(entry.workItemId)}">${escape(entry.workItemTitle || `Work Item ${entry.workItemId}`)} ${icon('arrow')}</a></div></li>`; };
  const list = shown.length ? `<ol class="ploeg-feed" aria-label="Ploeg events, newest first">${shown.map(item).join('')}</ol>` : `<div class="empty compact"><h3>${view.events.length ? 'No events of this kind are loaded' : 'No Ploeg activity yet'}</h3><p>${view.events.length && view.nextCursor ? 'Load older events or choose another kind.' : 'Events appear here as Ploeg queues, runs and reviews work.'}</p></div>`;
  const more = view.nextCursor ? `<div class="panel-bottom"><button id="ploeg-feed-older" class="button secondary" data-action="ploeg-feed-older" ${view.loading ? 'disabled' : ''}>Load older ${icon('arrow')}</button><small>${countNl(view.events.length)} events loaded</small></div>` : '';
  return `${view.demo ? demoCaption(helpers) : ''}${toolbar}${view.error ? `<p class="form-error" role="alert">${escape(view.error.message)}</p>` : ''}<section class="panel ploeg-feed-panel"><div class="panel-heading"><div><h2>Activity</h2><p>What Ploeg recorded across your teams, newest first.</p></div><span class="count-badge">${countNl(shown.length)}</span></div>${list}${more}</section>`;
}

/** Builds a valid Run filter: Ploeg only accepts an outcome with the finished state or no state. */
export function runFilter(filter) {
  const next = { team: filter.team || '', state: filter.state || '', outcome: filter.outcome || '' };
  if (next.state && next.state !== 'finished') next.outcome = '';
  return next;
}

export function runSpend(run, demo) {
  if (demo) return 'No model calls';
  if (run.settledUsd !== null && run.settledUsd !== undefined) return usdNl(run.settledUsd);
  if (run.state === 'pending' || run.state === 'running') return run.authorizedUsd ? `Reserved · up to ${usdNl(run.authorizedUsd)}` : 'Reserved';
  return 'Not settled yet';
}

export function runsMarkup(view, teams, helpers, now = Date.now()) {
  const { escape, icon } = helpers;
  const filter = view.filter || {};
  const select = (id, label, options, selected, all, disabled = false) => `<label class="ploeg-filter"><span class="tiny-label">${label}</span><select id="${id}" aria-label="Run ${label.toLowerCase()}" ${disabled ? 'disabled title="Only finished Runs have an outcome"' : ''}><option value="">${all}</option>${options.map(([value, text]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  const toolbar = `<div class="ploeg-toolbar ploeg-filters">${teamSelect('ploeg-runs-team', 'TEAM', teams, filter.team, escape)}${select('ploeg-runs-state', 'STATE', runStates, filter.state, 'All states')}${select('ploeg-runs-outcome', 'OUTCOME', runOutcomes.map(value => [value, value.replaceAll('_', ' ')]), filter.outcome, 'All outcomes', ['pending', 'running'].includes(filter.state))}${refreshButton('ploeg-reload', view.loading, helpers)}</div>`;
  if (view.error && !view.runs) return `${toolbar}${notice(view.error, helpers)}`;
  if (!view.runs) return `${toolbar}${loading('Reading Ploeg’s Runs', helpers)}`;
  const words = value => escape(String(value).replaceAll('_', ' '));
  const tokens = run => view.demo ? 'No model calls' : run.usage && (run.usage.inputTokens !== null || run.usage.outputTokens !== null) ? `${run.usage.inputTokens === null ? '—' : countNl(run.usage.inputTokens)} in · ${run.usage.outputTokens === null ? '—' : countNl(run.usage.outputTokens)} out` : '<span class="ploeg-review-muted">Not reported</span>';
  const result = run => { const parts = [run.outcome && words(run.outcome), run.verdict && words(run.verdict)].filter(Boolean); return `${parts.length ? parts.join(' · ') : '<span class="ploeg-review-muted">—</span>'}${run.failureReason ? `<small>${words(run.failureReason)}</small>` : ''}`; };
  const row = run => `<tr><td>${run.startedAt || run.finishedAt ? when(run.startedAt || run.finishedAt, now) : '<span class="ploeg-review-muted">Not started</span>'}</td><td>${escape(run.team)}</td><td class="ploeg-run-item"><a class="ploeg-link" href="#ploeg/${escape(run.workItemId)}">${escape(run.workItemTitle || `Work Item ${run.workItemId}`)}</a>${run.externalRef ? `<small>${escape(run.externalRef)}</small>` : ''}</td><td>${escape(run.role)} <small>Round ${run.round}${run.writes ? ' · writer' : ''}</small></td><td><span class="ploeg-state run-${escape(run.state)}">${words(run.state)}</span></td><td class="ploeg-run-result ${escape(run.outcome)}">${result(run)}</td><td class="num">${run.durationSeconds === null ? '<span class="ploeg-review-muted">—</span>' : duration(run.durationSeconds)}</td><td class="num">${runSpend(run, view.demo)}</td><td class="num">${tokens(run)}</td><td>${run.usage?.models?.length ? run.usage.models.map(escape).join(', ') : '<span class="ploeg-review-muted">—</span>'}</td></tr>`;
  const table = view.runs.length ? `<div class="ploeg-table-wrap" tabindex="0" role="region" aria-label="Recent Runs"><table class="ploeg-table ploeg-runs-table"><thead><tr><th scope="col">Started</th><th scope="col">Team</th><th scope="col">Work Item</th><th scope="col">Role / Round</th><th scope="col">State</th><th scope="col">Outcome / verdict</th><th scope="col" class="num">Duration</th><th scope="col" class="num">Settled</th><th scope="col" class="num">Tokens</th><th scope="col">Models</th></tr></thead><tbody>${view.runs.map(row).join('')}</tbody></table></div>` : '<div class="empty compact"><h3>No Runs match these filters</h3><p>Choose another team, state or outcome.</p></div>';
  const more = view.nextBefore ? `<div class="panel-bottom"><button id="ploeg-runs-older" class="button secondary" data-action="ploeg-runs-older" ${view.loading ? 'disabled' : ''}>Load older ${icon('arrow')}</button><small>${countNl(view.runs.length)} Runs loaded</small></div>` : '';
  return `${view.demo ? demoCaption(helpers) : ''}${toolbar}${view.error ? `<p class="form-error" role="alert">${escape(view.error.message)}</p>` : ''}<section class="panel"><div class="panel-heading"><div><h2>Runs</h2><p>Each Run is one Role working once on a Work Item. Newest first.</p></div></div>${table}${more}</section>`;
}

export function proposedMarkup(view, user, helpers, now = Date.now()) {
  const { escape, icon } = helpers;
  const toolbar = `<div class="ploeg-toolbar"><p class="ploeg-intro">Agents proposed this work while running other Work Items. Nothing here runs until someone approves it.</p>${refreshButton('ploeg-reload', view.loading, helpers)}</div>`;
  if (view.error && !view.items) return `${toolbar}${notice(view.error, helpers)}`;
  if (!view.items) return `${toolbar}${loading('Reading proposed work', helpers)}`;
  const decide = canDecide(user);
  const ready = value => value === true ? '<span class="ploeg-flag ready">Ready</span>' : value === false ? '<span class="ploeg-flag not-ready">Needs refinement</span>' : '<span class="ploeg-flag">Ready not reported</span>';
  const card = entry => `<article class="ploeg-proposal" aria-labelledby="ploeg-proposal-${escape(entry.id)}"><div class="ploeg-proposal-meta"><span class="tag">${escape(entry.team)}</span><span>${escape(createdKinds[entry.createdKind] || (entry.createdKind ? entry.createdKind.replaceAll('_', ' ') : 'Kind not reported'))}</span>${ready(entry.ready)}${when(entry.createdAt, now)}</div><h3 id="ploeg-proposal-${escape(entry.id)}"><a href="#ploeg/${escape(entry.id)}">${escape(entry.title || `Work Item ${entry.id}`)}</a></h3>${entry.description ? `<p>${escape(entry.description)}</p>` : ''}<div class="ploeg-proposal-source">${icon('branch')}${entry.sourceWorkItemId ? `<span>From <a class="ploeg-link" href="#ploeg/${escape(entry.sourceWorkItemId)}">${escape(entry.sourceTitle || `Work Item ${entry.sourceWorkItemId}`)}</a></span>` : '<span class="ploeg-review-muted">Source Work Item not reported</span>'}</div>${decide ? `<div class="ploeg-proposal-actions"><button class="button primary" data-action="ploeg-approve" data-id="${escape(entry.id)}" ${view.busy ? 'disabled' : ''}>${icon('check')} Approve</button><button class="button secondary" data-action="ploeg-reject" data-id="${escape(entry.id)}" ${view.busy ? 'disabled' : ''}>${icon('x')} Reject</button></div>` : ''}</article>`;
  const note = !decide ? '<p class="ploeg-intro" role="note">Your account can inspect proposed work. An operator or administrator approves or rejects it.</p>' : view.demo ? '<p class="ploeg-intro" role="note">Demo: a decision changes only this demo’s sample data. Nothing is dispatched.</p>' : '';
  const list = view.items.length ? `<div class="ploeg-proposals">${view.items.map(card).join('')}</div>` : '<div class="empty compact"><h3>No proposed work waits for you</h3><p>When an agent proposes a Work Item, it waits here for your approval.</p></div>';
  return `${view.demo ? demoCaption(helpers) : ''}${toolbar}${note}${view.error ? `<p class="form-error" role="alert">${escape(view.error.message)}</p>` : ''}<section class="panel"><div class="panel-heading"><div><h2>Proposed work</h2><p>Approve to queue it for its Team, or reject it with a reason.</p></div><span class="count-badge">${countNl(view.items.length)}${view.truncated ? '+' : ''}</span></div>${list}</section>`;
}
