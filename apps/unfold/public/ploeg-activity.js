import * as ui from './core/ui.js';
import { count, date as calendarDate, dateTime, dayKey, dayLabel, duration as span, modelName, money, percent, plural, timeHtml, tokens as tokenText, tokenUnit } from './core/format.js';
import { auditActor, auditEvent, runFailure, runOutcome, runState, tileDetail, unreportedOutcome, verdict as verdictMeta } from './core/states.js';
import { markdown } from './core/markdown.js';
import { routingWarning } from './core/reasons.js';
import { buildHash } from './core/route.js';
import { sinceLabel } from './now.js';
import { eventInRange, eventMoment, reachesStart, runInRange, runSpan } from './controls/range-filter.js';

/** The Insights time windows as `[id, label]`. */
export const ploegWindows = [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']];
/** The window Insights opens on when the address names none. */
export const insightsWindow = '7d';
/** The Activity kinds a person can filter on, as `[id, label]`. */
export const eventGroups = [['work', 'Work Items'], ['runs', 'Runs and attempts'], ['review', 'Review and delivery'], ['spend', 'Spend'], ['other', 'Other']];
const groupNouns = { work: 'Work Item', runs: 'Run and attempt', review: 'review and delivery', spend: 'spend', other: 'other' };

const groupPrefixes = { work_item: 'work', created_work_item: 'work', follow_up: 'work', run: 'runs', round: 'runs', shift: 'runs', lease: 'runs', infra_cap: 'runs', operator: 'runs', outcome: 'runs', checkpoint: 'runs', review: 'review', delivery: 'review', llm: 'spend' };
const createdKinds = { split: 'Split from its source', clarify: 'Clarification', discovered: 'Discovered work' };
const runStateOptions = [['pending', 'Pending'], ['running', 'Running'], ['finished', 'Finished']];
const runOutcomeOptions = ['pr_opened', 'pr_updated', 'issue_updated', 'follow_up_created', 'no_change_needed', 'stuck', 'failed'];
const problems = {
  ploeg_unsupported: { glyph: 'info', title: 'This Ploeg version has no activity data yet', body: 'Upgrade Ploeg to read Insights, Runs and Activity here. Work and review keep working.', link: ['Open Work', '#work'] },
  ploeg_scope: { glyph: 'lock', title: 'Your account has no Ploeg Teams', body: 'Ask an administrator to give your account access to a Team.' },
};

const words = value => String(value ?? '').replaceAll('_', ' ').trim();
const capital = value => { const text = words(value); return text ? text[0].toUpperCase() + text.slice(1) : ''; };
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const newestFirst = (a, b) => { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? 1 : x > y ? -1 : 0; };
function unique(events) { const seen = new Set(); return events.filter(entry => !seen.has(entry.id) && seen.add(entry.id)).sort(newestFirst); }

/** Formats US dollars with two decimals in nl-NL; the earlier name for `format.money` (unknown reads "Not reported"). */
export const usdNl = value => money(value);
/** Formats a count with nl-NL grouping; the earlier name for `format.count`. */
export const countNl = value => count(value);
/** Formats a timestamp in full (`30-09-2026 21:30`); the earlier name for `format.dateTime`. */
export const absoluteTime = value => dateTime(value);
/** Describes how long ago a timestamp was ("Just now", "14 min ago", "3 h ago", "2 d ago", "Never"). Kept for the Now markup. */
export function relativeTime(value, now = Date.now()) {
  if (!value) return 'Never';
  const seconds = Math.max(0, Math.round((now - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}
/** Formats a Run duration in seconds as "45 s", "14 min" or "1 h 5 min". Kept for the Now markup. */
export function duration(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

/** Whether the signed-in user may approve, reject or cancel Ploeg work. Viewers may not. */
export const canDecide = user => user?.role === 'admin' || user?.role === 'operator';

/**
 * Names an audit action in plain words, with its filter group, tone and glyph. The words come from the one audit
 * table in core/states.js (`auditEvent`), so Activity and the Work Item page read the same; an unknown action reads
 * as its humanized name in the `other` group.
 * @returns {{ group: string, label: string, tone: string, glyph: string }}
 */
export function eventKind(action) {
  const text = String(action ?? '');
  const { label, tone, glyph } = auditEvent({ action: text });
  return { group: groupPrefixes[text.split('.')[0]] || 'other', label, tone, glyph };
}

/**
 * Tells one audit event as a person would read it: its filter group plus `auditEvent`'s label, tone, glyph and
 * detail line (Ploeg's reason, the authorized amount, the infrastructure failures so far).
 * @returns {{ group: string, label: string, tone: string, glyph: string, detail: string }}
 */
export function eventStory(entry) {
  return { group: groupPrefixes[String(entry?.action ?? '').split('.')[0]] || 'other', ...auditEvent(entry) };
}

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

/**
 * The events of a fresh first page that are newer than the newest one on screen, newest first, without showing
 * them. `gap` is true when the page does not reach the events on screen, so showing them replaces the feed.
 * @returns {{ events: object[], gap: boolean }}
 */
export function newerEvents(feed, page) {
  const events = unique(page?.events || []);
  if (!feed?.events?.length) return { events, gap: false };
  const newest = BigInt(feed.events[0].id);
  return { events: events.filter(entry => BigInt(entry.id) > newest), gap: Boolean(page.nextCursor) && !events.some(entry => BigInt(entry.id) <= newest) };
}

/** Groups events (newest first) by local calendar day, keeping their order: `[{ key, label, events }]`. */
export function eventDays(events, now = Date.now()) {
  const days = [];
  for (const entry of events) {
    const key = dayKey(entry.at) || 'unknown';
    if (days.at(-1)?.key !== key) days.push({ key, label: key === 'unknown' ? 'Date not reported' : dayLabel(entry.at, now), events: [] });
    days.at(-1).events.push(entry);
  }
  return days;
}

/** Builds a valid Run filter: Ploeg only accepts an outcome with the finished state or no state, and a valid `since` keeps only finished Runs. */
export function runFilter(filter) {
  const since = sinceMoment(filter.since);
  const next = { team: filter.team || '', state: since ? 'finished' : filter.state || '', outcome: filter.outcome || '' };
  if (next.state && next.state !== 'finished') next.outcome = '';
  if (since) next.since = since;
  return next;
}

/** The `since` of a Runs filter as an ISO moment, or '' for a missing or invalid one. */
function sinceMoment(value) {
  const at = typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? new Date(at).toISOString() : '';
}

/** The Runs a filter with `since` lists: those that finished after that moment. Without `since`, every Run. */
export function sinceRuns(runs, since) {
  const start = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(start)) return runs || [];
  return (runs || []).filter(run => Date.parse(run.finishedAt ?? '') > start);
}

const runRank = { running: 0, pending: 1 };
/** Orders Runs for the Runs page: running first, then pending, then finished; newest first within each. */
export function sortRuns(runs) {
  return [...(runs || [])].sort((a, b) => (runRank[a.state] ?? 2) - (runRank[b.state] ?? 2) || newestFirst(a, b));
}

/** Folds a page of older Runs into the Runs on screen without duplicates. A fresh first page goes through `freshRuns`, which also drops the Runs that left it. */
export function mergeRuns(runs, page) {
  const byId = new Map((runs || []).map(run => [run.id, run]));
  for (const run of page || []) byId.set(run.id, run);
  return [...byId.values()];
}


const bigId = id => { try { return BigInt(id); } catch { return null; } };

/**
 * Applies a fresh first page of Runs (`{ runs, nextBefore }`) to the Runs on screen. The page replaces every Run in
 * its id range, so a Run that finished or left the filter changes or disappears; older pages loaded earlier stay,
 * unless the page does not reach the Runs on screen, which it then replaces so no Run in between goes missing.
 * @returns {{ runs: object[], nextBefore: string | null }}
 */
export function freshRuns(view, page) {
  const fresh = page?.runs || [];
  const cursor = page?.nextBefore ?? null;
  const ids = fresh.map(run => bigId(run.id));
  if (!view?.runs?.length || cursor === null || !fresh.length || ids.includes(null)) return { runs: fresh, nextBefore: cursor };
  const floor = ids.reduce((low, id) => id < low ? id : low);
  const shown = view.runs.map(run => bigId(run.id)).filter(id => id !== null);
  if (!shown.some(id => id >= floor)) return { runs: fresh, nextBefore: cursor };
  const older = view.runs.filter(run => { const id = bigId(run.id); return id !== null && id < floor; });
  return { runs: [...fresh, ...older], nextBefore: older.length ? view.nextBefore ?? null : cursor };
}

/** A Run's spend as text: settled when known, what is authorized while it runs, never an invented zero. */
export function runSpend(run, demo) {
  if (demo) return 'No model calls';
  if (isNumber(run.settledUsd)) return money(run.settledUsd);
  if (isNumber(run.observedUsd)) return `${money(run.observedUsd)} observed`;
  if (run.state === 'pending' || run.state === 'running') return isNumber(run.authorizedUsd) && run.authorizedUsd > 0 ? `Up to ${money(run.authorizedUsd)} authorized` : 'Not reported yet';
  return 'Not reported';
}

/** Who proposed a Work Item, read from its Ploeg id (`run-<id>-<n>`), or its Team when the Run is not known. */
export function proposalCreator(item) {
  const match = /^run-(\d+)-\d+$/.exec(String(item?.externalId ?? ''));
  return match ? `An agent in Run ${match[1]}` : `An agent of the ${item?.team || 'unknown'} Team`;
}

function empty({ glyph = 'inbox', title, body = '', actions = '', tone, compact = true }, { icon }) {
  return ui.emptyState({ icon: glyph, title, body, actions, compact, tone }, { icon });
}

function retryButton({ icon }, label = 'Try again') {
  return `<button type="button" class="button secondary sm" data-action="ploeg-reload">${icon('refresh')}<span class="button-label">${label}</span></button>`;
}

function linkButton(label, href, { escape, icon }, glyph = 'arrow') {
  return `<a class="button secondary sm" href="${escape(href)}">${icon(glyph)}<span class="button-label">${escape(label)}</span></a>`;
}

/** The first-load failure of a Ploeg page: a known setup gap reads as guidance; anything else as an error with Try again. */
export function problemMarkup(error, subject, helpers) {
  const { escape } = helpers;
  if (error?.code === 'ploeg_unconfigured') return `<div class="feeds-problem">${ui.ploegUnconfigured()}</div>`;
  const known = problems[error?.code];
  if (known) return `<div class="feeds-problem card">${empty({ glyph: known.glyph, title: known.title, body: `<p>${escape(known.body)}</p>`, actions: known.link ? linkButton(known.link[0], known.link[1], helpers) : '', compact: false }, helpers)}</div>`;
  return `<div class="feeds-problem card" role="alert">${empty({ glyph: 'x-circle', tone: 'danger', title: `Could not load ${subject}`, body: `<p>${escape(error?.message || 'Ploeg did not answer.')}</p>`, actions: retryButton(helpers), compact: false }, helpers)}</div>`;
}

function staleNotice(view, helpers) {
  const { escape, icon } = helpers;
  const since = timeHtml(view.loadedAt ?? view.refreshedAt, { display: 'time' });
  return `<div class="callout feeds-stale" data-tone="attention" role="status"><span class="callout-icon" aria-hidden="true">${icon('alert')}</span><div class="callout-content"><p class="callout-title">Could not refresh. ${since ? `Showing data from ${since}.` : 'Showing the last data Unfold read.'}</p><div class="callout-body"><p>${escape(view.error.message || 'Ploeg did not answer.')}</p></div></div><div class="callout-actions">${retryButton(helpers)}</div></div>`;
}

const demoNote = demo => demo ? ui.demoNote() : '';
const page = (name, ...parts) => `<div class="feeds feeds-${name}">${parts.join('')}</div>`;

function teamField(id, teams, selected, escape) {
  return `<div class="field inline feeds-field"><label class="field-label" for="${id}">Team</label><select id="${id}"><option value="">All Teams</option>${teams.map(team => `<option value="${escape(team)}"${team === selected ? ' selected' : ''}>${escape(team)}</option>`).join('')}</select></div>`;
}

function selectField(id, label, options, selected, all, { disabled = false, hint = '' } = {}) {
  const described = disabled && hint;
  return `<div class="field inline feeds-field${described ? ' has-hint' : ''}"><label class="field-label" for="${id}">${label}</label><select id="${id}"${disabled ? ' disabled' : ''}${described ? ` aria-describedby="${id}-hint"` : ''}><option value="">${all}</option>${options.map(([value, text]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${text}</option>`).join('')}</select>${described ? `<span class="field-hint feeds-hint" id="${id}-hint">${hint}</span>` : ''}</div>`;
}

function tile({ label, value, detail, href, tone, glyph, text = false }, { icon }) {
  return ui.stat({ label, value, detail, href, tone, icon: glyph, text }, { icon });
}

function unsettledTile(data, { icon }) {
  const unsettled = data.unsettled;
  const base = { label: 'Cannot release', icon: 'coins' };
  if (data.demo) return ui.stat({ ...base, value: '0', detail: 'Demo · no model calls' }, { icon });
  if (!unsettled) return ui.stat({ ...base, value: '—', quiet: true, detail: data.unsettledError?.code === 'ploeg_unsupported' ? 'Not reported by this Ploeg' : data.unsettledError ? 'Could not be loaded' : 'Loading…' }, { icon });
  if (!(unsettled.count > 0)) return ui.stat({ ...base, value: '0', detail: 'No budget is stuck' }, { icon });
  return ui.stat({ ...base, value: count(unsettled.count), tone: 'danger', detail: `${money(unsettled.heldUsd)} held by finished Runs` }, { icon });
}

/** The merged Work Items cost per merged Work Item needs before it divides, as the server's `minimumSample` also says. */
export const minimumMerged = 20;

/** Merge rate from Ploeg's current Done and Withdrawn counts, which span all time: Ploeg reports no per-window count. */
export function mergeRate(workItems) {
  const done = workItems?.done, withdrawn = workItems?.withdrawn;
  if (!isNumber(done) || !isNumber(withdrawn)) return { rate: null, done: null, closed: null };
  const closed = done + withdrawn;
  return { rate: closed > 0 ? done / closed : null, done, closed };
}

function mergeTile(workItems, helpers) {
  const { rate, done, closed } = mergeRate(workItems);
  const base = { label: 'Merge rate', icon: 'check-circle', href: '#work?lane=closed' };
  if (closed === null) return ui.stat({ ...base, value: '—', quiet: true, detail: 'Done and Withdrawn not reported' }, helpers);
  if (rate === null) return ui.stat({ ...base, value: '—', quiet: true, detail: 'No Work Item is Done or Withdrawn yet' }, helpers);
  return ui.stat({ ...base, value: percent(rate), detail: `${count(done)} Done of ${count(closed)} closed · all time` }, helpers);
}

const economicsMissing = (economics, error) => error?.code === 'ploeg_unsupported' ? 'Not reported by this Ploeg' : error ? 'Could not be loaded' : economics ? '' : 'Loading…';
const truncatedNote = economics => economics.truncated ? `newest ${count(economics.scanned)} Work Items only` : '';
const parts = (...items) => items.filter(Boolean).join(' · ');

/**
 * Words for the cost per merged Work Item (K2 over merged Work Items) of a window, from `/api/ploeg/economics`:
 * the figure once at least `minimumSample` Work Items merged, otherwise the count and that the sample is too small.
 * Spend not settled is never in the figure; the detail says how many Runs it left out.
 * @returns {{ value: string, detail: string, quiet: boolean, text: boolean }}
 */
export function costPerMerged(economics, windowName) {
  const open = economics.unsettled.runs + economics.unknown.runs;
  const left = open ? `${plural(open, 'Run')} not settled, not added` : '';
  if (!economics.merged) return { value: '—', quiet: true, text: false, detail: parts(`No Work Item merged in the last ${windowName}`, truncatedNote(economics)) };
  if (economics.costPerMergedUsd === null) return { value: `${count(economics.merged)} merged`, quiet: false, text: true, detail: parts(`Sample too small: needs ${count(economics.minimumSample)}`, `${money(economics.settledUsd)} settled`, left, truncatedNote(economics)) };
  return { value: money(economics.costPerMergedUsd), quiet: false, text: false, detail: parts(`${count(economics.merged)} merged`, `${money(economics.settledUsd)} settled`, left, truncatedNote(economics)) };
}

/** Words for K5, the clean-merge rate of the window: Ploeg's pull requests merged with no change after the agents finished, of those merged or closed. */
export function cleanMerge(entry, windowName, minimum = minimumMerged) {
  const closed = entry.merged + entry.closed;
  if (entry.rate === null) return { value: '—', quiet: true, detail: `No pull request merged or closed in the last ${windowName}` };
  return { value: percent(entry.rate), quiet: false, detail: parts(`${count(entry.clean)} clean of ${count(closed)} merged or closed`, closed < minimum ? 'sample too small' : '') };
}

function costPerMergedTile(view, windowName, helpers) {
  const base = { label: 'Cost per merged Work Item', icon: 'coins' };
  if (view.data.demo) return ui.stat({ ...base, value: 'No model calls', detail: 'Demo', text: true }, helpers);
  const missing = economicsMissing(view.economics, view.economicsError);
  if (missing) return ui.stat({ ...base, value: '—', quiet: true, detail: missing }, helpers);
  return ui.stat({ ...base, ...costPerMerged(view.economics, windowName) }, helpers);
}

function cleanMergeTile(view, windowName, helpers) {
  const base = { label: 'Clean-merge rate', icon: 'pull-request' };
  if (view.data.demo) return ui.stat({ ...base, value: '—', quiet: true, detail: 'Demo · nothing merged' }, helpers);
  const missing = economicsMissing(view.economics, view.economicsError);
  if (missing) return ui.stat({ ...base, value: '—', quiet: true, detail: missing }, helpers);
  return ui.stat({ ...base, ...cleanMerge(view.economics.cleanMerge, windowName) }, helpers);
}

function openSpendNote(economics, helpers) {
  const { escape } = helpers;
  if (!economics || economics.demo || !economics.openSpend?.length) return '';
  const said = { unsettled: 'not settled', unknown: 'cost not reported' };
  const items = economics.openSpend.map(entry => `<li><a href="#work/${escape(entry.workItemId)}">Work Item ${escape(entry.workItemId)}</a> · Run ${escape(entry.runId)} · ${escape(said[entry.status] || entry.status)}${entry.usd === null ? '' : ` · ${escape(money(entry.usd))} so far`}</li>`).join('');
  const more = economics.openSpendTruncated ? '<li>More Runs are left out than are listed here.</li>' : '';
  const total = economics.unsettled.runs + economics.unknown.runs;
  return `<details class="meta insights-open-spend"><summary>${escape(`${plural(total, 'Run')} of merged Work Items left out of the cost`)}</summary><ul>${items}${more}</ul></details>`;
}

/** The words for each Acceptance kind of `/api/ploeg/deliveries`. */
export const acceptanceLabels = { merged: 'Merged', approved: 'Approved', silent: 'Accepted by silence', closed_without_acceptance: 'Closed without acceptance', open: 'Open' };
const deliveriesDemo = '<p class="meta">Demo · no model calls, so there is no Token Charge base or Acceptance to show.</p>';

/**
 * The Deliveries section's body for the window, from `/api/ploeg/deliveries`: per Work Item its Acceptance kind and
 * date, Token Charge base and unsettled spend. Figures only; the demo shows no amounts.
 */
export function deliveriesMarkup(view, windowName, demo, helpers) {
  const { escape } = helpers;
  if (demo) return deliveriesDemo;
  const ledger = view.deliveries;
  const missing = economicsMissing(ledger, view.deliveriesError);
  if (missing) return `<p class="meta">${escape(missing)}</p>`;
  if (ledger.demo) return deliveriesDemo;
  const { kinds } = ledger.totals;
  const summary = parts(...Object.entries(acceptanceLabels).filter(([kind]) => kinds[kind]).map(([kind, label]) => `${count(kinds[kind] ?? 0)} ${label.toLowerCase()}`), `Token Charge base ${money(ledger.totals.tokenChargeBaseUsd)}`, ledger.totals.unsettledRuns ? `${money(ledger.totals.unsettledUsd)} unsettled` : '', ledger.truncated ? `newest ${count(ledger.scanned)} Work Items only` : '');
  const none = '<span class="subtle">—</span>';
  const when = entry => entry.acceptance.kind === 'open' ? entry.silentDueAt ? escape(`Silent on ${calendarDate(entry.silentDueAt)}`) : none : entry.acceptance.at ? escape(calendarDate(entry.acceptance.at)) : none;
  const open = entry => {
    if (!entry.unsettled.runs && !entry.unknownRuns) return none;
    return escape(parts(entry.unsettled.runs ? `${money(entry.unsettled.usd)} · ${plural(entry.unsettled.runs, 'Run')}` : '', entry.unknownRuns ? `${plural(entry.unknownRuns, 'Run')} not reported` : ''));
  };
  const columns = [['Work Item'], ['Acceptance'], ['Date'], ['Token Charge base', true], ['Unsettled', true]].map(([label, numeric], index) => ({ key: String(index), label, numeric }));
  const rows = ledger.rows.map(entry => ({
    0: `<a href="#work/${escape(entry.workItemId)}">${escape(entry.title || `Work Item ${entry.workItemId}`)}</a> <span class="subtle">${escape(parts(entry.externalRef, entry.team))}</span>`,
    1: escape(acceptanceLabels[entry.acceptance.kind] || words(entry.acceptance.kind)),
    2: when(entry),
    3: escape(money(entry.tokenChargeBaseUsd)),
    4: open(entry),
  }));
  const table = ui.table({ caption: `Deliveries, last ${windowName}`, columns, rows, rowHeader: true, region: false, className: 'insights-table', empty: escape(`No Work Item was attempted in the last ${windowName}.`) });
  const extra = ledger.calendar.nonWorkingDates.length ? `, less ${plural(ledger.calendar.nonWorkingDates.length, 'configured date')}` : '';
  const note = `A Work Item is accepted when its pull request merged, a person approved it, or nobody decided for ${ledger.calendar.silentAfterWorkingDays} working days after the agents' last writing Run; Ploeg records no ready-for-review moment, so that Run stands in for it. Working days are Monday to Friday${extra}; this calendar is proposed. The Token Charge base is the settled cost of every attempt, failed Runs included, before any Markup. These are figures only: nothing is charged, and Credits, the Delivery Fee and invoices are not built.`;
  return `<p class="meta">${escape(summary)}</p><div class="card flush insights-deliveries">${table}</div><p class="meta insights-deliveries-note">${escape(note)}</p>`;
}

/** The CSV download of the window's Deliveries, once they loaded outside the demo. */
export function deliveriesCsvLink(view, windowId, demo, { escape }) {
  if (demo || !view.deliveries || view.deliveries.demo) return '';
  return `<a class="button secondary sm" id="insights-deliveries-csv" href="/api/ploeg/deliveries?window=${escape(encodeURIComponent(windowId))}&amp;format=csv" download>Download CSV</a>`;
}

/**
 * The FinOps FOCUS 1.4 cost download for this calendar month, beside the Deliveries CSV, for operators and administrators
 * (`helpers.costExport`). The demo exports nothing and says so.
 */
export function focusCostLink(view, demo, { escape, costExport }) {
  if (!costExport) return '';
  if (demo || view.deliveries?.demo) return `<span class="meta" id="insights-focus-demo">${escape('Demo · no cost to export')}</span>`;
  if (!view.deliveries) return '';
  return `<a class="button secondary sm" id="insights-focus-csv" href="/api/ploeg/cost-export?format=csv" download title="${escape('This month’s settled model cost per Run as FinOps FOCUS 1.4, in US$')}">Download FOCUS cost</a>`;
}

function teamTable({ caption, columns, rows }, { escape }) {
  const keyed = columns.map(([label, numeric], index) => ({ key: String(index), label, numeric }));
  const cells = rows.map(([name, values]) => Object.fromEntries([escape(name), ...values].map((value, index) => [String(index), value])));
  return ui.table({ caption, columns: keyed, rows: cells, rowHeader: true, region: false, className: 'insights-table' });
}

function insightsSection(id, title, description, body, { escape }, actions = '') {
  return `<section class="section insights-section" aria-labelledby="${id}-title"><header class="section-header"><div class="section-heading"><h2 class="section-title" id="${id}-title">${escape(title)}</h2><p class="section-description">${escape(description)}</p></div>${actions ? `<div class="section-actions">${actions}</div>` : ''}</header><div class="section-body stack gap-md">${body}</div></section>`;
}

function insightsSkeleton(windowName, switcher, helpers) {
  const tiles = (total, kind) => `<div class="stat-row insights-stats${kind ? ` insights-stats-${kind}` : ''}" aria-hidden="true">${'<div class="stat insights-tile-skeleton"><span class="skeleton insights-skeleton-label"></span><span class="skeleton insights-skeleton-value"></span><span class="skeleton insights-skeleton-detail"></span></div>'.repeat(total)}</div>`;
  const table = rows => `<div class="card insights-table-skeleton" aria-hidden="true">${'<div class="insights-skeleton-row"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>'.repeat(rows)}</div>`;
  return `<div class="insights" aria-busy="true"><span class="sr-only">Loading…</span>${insightsSection('insights-outcomes', 'Outcomes', 'How much of the work lands', tiles(3, 'outcomes'), helpers, switcher)}${insightsSection('insights-runs', 'Runs and spend', `Last ${windowName}`, `${tiles(4)}${table(3)}`, helpers)}${insightsSection('insights-work', 'Work Items', 'Right now, whatever the window', `${tiles(5, 'work')}${table(3)}`, helpers)}</div>`;
}

/**
 * Insights: the window switch, outcome tiles (merge rate, cost per merged Work Item, clean-merge rate), Run and spend tiles for the
 * window, Work Item tiles for right now, and per-Team tables (cards on narrow screens). Stats and tables only, never a
 * chart; glyphs come from `helpers.icon`.
 */
export function overviewMarkup(view, helpers, now = Date.now()) {
  const { escape } = helpers;
  const data = view.data;
  const windowId = data?.window || view.window;
  const windowName = ploegWindows.find(([id]) => id === windowId)?.[1] || words(windowId);
  const switcher = `<div class="segmented" role="group" aria-label="Time window">${ploegWindows.map(([id, label]) => `<button type="button" class="segment" id="insights-window-${id}" data-action="ploeg-window" data-id="${id}" aria-pressed="${view.window === id}">${label}</button>`).join('')}</div>`;
  if (!data && view.error) return page('insights', problemMarkup(view.error, 'Insights', helpers));
  if (!data) return page('insights', insightsSkeleton(windowName, switcher, helpers));
  const stale = view.error ? staleNotice(view, helpers) : '';
  if (!data.teams.length) return page('insights', demoNote(data.demo), stale, `<div class="card">${empty({ glyph: 'lock', title: 'No Teams are visible to your account', body: '<p>Ask an administrator to check your Team access in Unfold and in Ploeg.</p>', compact: false }, helpers)}</div>`);
  const { runs, workItems: items, spend } = data.totals;
  const settledTile = data.demo
    ? tile({ label: 'Settled spend', value: 'No model calls', detail: 'Demo', glyph: 'coins', text: true }, helpers)
    : tile({ label: 'Settled spend', value: money(spend.settledUsd), detail: isNumber(spend.reservedUsd) ? `${money(spend.reservedUsd)} held by running Runs` : 'Holds not reported', glyph: 'coins', text: !isNumber(spend.settledUsd) }, helpers);
  const runTiles = [
    tile({ label: 'Runs finished', value: count(runs.finished), detail: 'Failed and stuck Runs included', href: '#runs?state=finished', glyph: 'runs' }, helpers),
    tile({ label: 'Failed', value: count(runs.failed), detail: runs.finished ? `${percent(runs.failed / runs.finished)} of finished Runs` : `No Run finished in the last ${windowName}`, href: '#runs?state=finished&outcome=failed', tone: 'danger', glyph: 'x-circle' }, helpers),
    tile({ label: 'Stuck', value: count(runs.stuck), detail: 'An agent asked for a person', href: '#runs?state=finished&outcome=stuck', tone: 'attention', glyph: 'alert' }, helpers),
    settledTile,
  ].join('');
  const outcomeTiles = [mergeTile(items, helpers), costPerMergedTile(view, windowName, helpers), cleanMergeTile(view, windowName, helpers)].join('');
  const workTiles = [
    tile({ label: 'Ready for review', value: count(items.awaitingReview), detail: tileDetail.review(), href: '#work?lane=awaiting_review', tone: 'review', glyph: 'pull-request' }, helpers),
    tile({ label: 'Needs you', value: count(items.needsHuman), detail: tileDetail.needsYou(), href: '#work?lane=needs_human', tone: 'attention', glyph: 'alert' }, helpers),
    tile({ label: 'Running', value: count(items.leased), detail: tileDetail.running({ ...runs, leased: items.leased }), href: '#work?lane=leased', tone: 'live', glyph: 'activity' }, helpers),
    tile({ label: 'Queued', value: count(items.queued), detail: tileDetail.queued(items.queued), href: '#work?lane=queued', glyph: 'circle-dashed' }, helpers),
    tile({ label: 'Proposed', value: count(items.proposed), detail: tileDetail.proposed(), href: '#proposed', glyph: 'proposed' }, helpers),
    unsettledTile(data, helpers),
  ].join('');
  const when = value => value ? timeHtml(value, { now }) : '<span class="subtle">None</span>';
  const settled = entry => data.demo ? '<span class="subtle">No model calls</span>' : escape(money(entry.spend.settledUsd));
  const reserved = entry => data.demo ? '<span class="subtle">—</span>' : escape(money(entry.spend.reservedUsd));
  const perMerged = entry => {
    if (data.demo) return '<span class="subtle">No model calls</span>';
    const team = view.economics?.teams?.find(candidate => candidate.team === entry.team);
    if (!view.economics || !team?.merged) return '<span class="subtle">—</span>';
    if (team.costPerMergedUsd === null) return `<span class="subtle" title="${escape(`Sample too small: needs ${count(view.economics.minimumSample)}`)}">${escape(`${count(team.merged)} merged`)}</span>`;
    return escape(money(team.costPerMergedUsd));
  };
  const rateOf = entry => { const { rate } = mergeRate(entry.workItems); return rate === null ? '<span class="subtle">—</span>' : escape(percent(rate)); };
  const runColumns = [['Team'], ['Finished', true], ['Failed', true], ['Stuck', true], ['Settled', true], ['Held now', true], ['Cost per merged', true], ['Last activity']];
  const runCells = entry => [count(entry.runs.finished), count(entry.runs.failed), count(entry.runs.stuck), settled(entry), reserved(entry), perMerged(entry), when(entry.lastActivityAt)];
  const workKeys = [['awaitingReview', 'Ready for review'], ['needsHuman', 'Needs you'], ['leased', 'Running'], ['queued', 'Queued'], ['proposed', 'Proposed'], ['stale', 'Stopped retrying'], ['done', 'Done'], ['withdrawn', 'Withdrawn']];
  const workColumns = [['Team'], ...workKeys.map(([, label]) => [label, true]), ['Merge rate', true]];
  const workCells = entry => [...workKeys.map(([key]) => count(entry.workItems[key])), rateOf(entry)];
  const teamCard = entry => `<article class="card insights-team" aria-labelledby="insights-team-${escape(entry.team)}"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="insights-team-${escape(entry.team)}">${escape(entry.team)}</h3><p class="card-subtitle">Last activity ${entry.lastActivityAt ? timeHtml(entry.lastActivityAt, { now }) : 'none'}</p></div></header><div class="card-body stack gap-md"><div class="stack gap-sm"><p class="overline">Runs and spend · ${escape(windowName)}</p>${ui.dl([['Finished', count(entry.runs.finished)], ['Failed', count(entry.runs.failed)], ['Stuck', count(entry.runs.stuck)], ['Settled', settled(entry)], ['Held', reserved(entry)], ['Cost per merged', perMerged(entry)]])}</div><div class="stack gap-sm"><p class="overline">Work Items now</p>${ui.dl([...workKeys.map(([key, label]) => [label, count(entry.workItems[key])]), ['Merge rate · all time', rateOf(entry)]])}</div></div></article>`;
  const runTable = teamTable({ caption: `Runs and spend per Team, last ${windowName}`, columns: runColumns, rows: data.teams.map(entry => [entry.team, runCells(entry)]) }, helpers);
  const workTable = teamTable({ caption: 'Work Items per Team, right now', columns: workColumns, rows: data.teams.map(entry => [entry.team, workCells(entry)]) }, helpers);
  const footnote = data.demo ? '' : `<p class="meta insights-footnote">Settled spend is what Ploeg settled with the model gateway. A running Run holds a reservation until it settles. Cost per merged Work Item adds the settled spend of every Shift of each Work Item whose pull request merged in the window, failed Runs included, and divides it by those Work Items once there are ${count(minimumMerged)}. Spend that has not settled is left out and listed apart.</p>`;
  const runsBody = `<div class="stat-row insights-stats">${runTiles}</div><div class="card flush insights-tables">${runTable}</div>${footnote}`;
  const workBody = `<div class="stat-row insights-stats insights-stats-work">${workTiles}</div><div class="card flush insights-tables">${workTable}</div>`;
  const cards = `<section class="section insights-cards" aria-label="Per Team"><div class="insights-teams">${data.teams.map(teamCard).join('')}</div></section>`;
  const outcomesBody = `<div class="stat-row insights-stats insights-stats-outcomes">${outcomeTiles}</div>${data.demo ? '' : openSpendNote(view.economics, helpers)}`;
  return page('insights', demoNote(data.demo), stale, `<div class="insights"${view.loading ? ' aria-busy="true"' : ''}>${insightsSection('insights-outcomes', 'Outcomes', 'How much of the work lands', outcomesBody, helpers, switcher)}${insightsSection('insights-runs', 'Runs and spend', `Last ${windowName} · ${plural(data.teams.length, 'Team')}`, runsBody, helpers)}${insightsSection('insights-deliveries', 'Deliveries', `Last ${windowName} · figures only, nothing is charged`, deliveriesMarkup(view, windowName, data.demo, helpers), helpers, `${deliveriesCsvLink(view, windowId, data.demo, helpers)}${focusCostLink(view, data.demo, helpers)}`)}${insightsSection('insights-work', 'Work Items', 'Right now, whatever the window', workBody, helpers)}${cards}</div>`);
}

function eventItem(entry, helpers, now, user) {
  const { escape, icon } = helpers;
  const story = eventStory(entry);
  const actor = auditActor(entry.actor, { userId: user?.id });
  const title = entry.workItemTitle || `Work Item ${entry.workItemId}`;
  const link = entry.workItemId ? `<a class="activity-event-item" href="#work/${escape(entry.workItemId)}">${escape(title)}</a>` : '';
  const team = entry.team && actor.team !== entry.team ? `<span class="activity-event-team" title="${escape(entry.team)}">${escape(entry.team)}</span>` : '';
  return `<li class="timeline-item activity-event" data-tone="${story.tone}" id="activity-event-${escape(entry.id)}" data-event-id="${escape(entry.id)}"><span class="activity-event-time">${timeHtml(entry.at, { display: 'time', now }) || '<span class="subtle">—</span>'}</span><span class="timeline-marker" aria-hidden="true">${icon(story.glyph)}</span><div class="timeline-content"><p class="activity-event-line"><span class="timeline-title">${escape(story.label)}</span>${link}</p>${story.detail ? `<p class="activity-event-detail">${escape(story.detail)}</p>` : ''}</div><p class="timeline-meta activity-event-meta"><span class="activity-actor" data-kind="${actor.kind}" title="${escape(actor.title)}">${icon(actor.glyph)}${escape(actor.name)}</span>${team}</p></li>`;
}

function activitySkeleton() {
  const row = '<li class="timeline-item activity-event"><span class="activity-event-time"><span class="skeleton activity-skeleton-time"></span></span><span class="timeline-marker"></span><div class="timeline-content"><span class="skeleton activity-skeleton-line"></span></div><p class="timeline-meta activity-event-meta"><span class="skeleton activity-skeleton-meta"></span></p></li>';
  return `<div class="card flush activity-feed" aria-busy="true"><span class="sr-only">Loading…</span><div aria-hidden="true"><header class="activity-day-header"><span class="skeleton activity-skeleton-day"></span></header><ol class="timeline activity-events">${row.repeat(8)}</ol></div></div>`;
}

/**
 * Activity: Team and kind filters, then Ploeg's audit events grouped by day with human labels and actors.
 * Events a live refresh found wait behind an "N new" button (`view.latest`) instead of moving the list.
 */
export function activityMarkup(view, teams, helpers, now = Date.now(), user = null) {
  const { escape, icon } = helpers;
  const toolbar = `<div class="toolbar feeds-toolbar">${teamField('ploeg-feed-team', teams, view.team, escape)}${selectField('ploeg-feed-kind', 'Kind', eventGroups, view.kind, 'All kinds')}${view.rangeControl ?? ''}</div>`;
  if (!view.events && view.error) return page('activity', toolbar, problemMarkup(view.error, 'Activity', helpers));
  if (!view.events) return page('activity', toolbar, activitySkeleton());
  const matches = entry => (!view.kind || eventKind(entry.action).group === view.kind) && (!view.range || eventInRange(entry, view.range));
  const shown = view.events.filter(matches);
  const fresh = view.latest ? newerEvents(view, view.latest) : { events: [], gap: false };
  const waiting = fresh.events.filter(matches).length;
  const pill = waiting ? `<div class="activity-new"><button type="button" class="button primary sm activity-new-button" id="activity-show-new" data-action="activity-show-new">${icon('chevron-up')}<span class="button-label">${fresh.gap ? `${count(waiting)}+ new events` : plural(waiting, 'new event')}</span></button></div>` : '';
  const loaded = `<span class="meta">${plural(view.events.length, 'event')} loaded${view.kind || view.range ? `, ${count(shown.length)} ${view.range ? 'in this time range' : 'of this kind'}` : ''}</span>`;
  const busy = view.mode === 'older' || view.rangeFilling;
  const covered = view.range && view.nextCursor && !view.rangeFilling && reachesStart(view.events, eventMoment, view.range, true);
  const older = covered ? `<span class="meta">Older events fall outside this time range.</span>` : view.nextCursor ? `<button type="button" class="button secondary" id="ploeg-feed-older" data-action="ploeg-feed-older"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('chevron-down')}<span class="button-label">${view.rangeFilling ? 'Reaching the start of the range' : 'Load older'}</span></button>` : '<span class="meta">This is where the history starts.</span>';
  const footer = `<footer class="activity-footer">${older}${loaded}</footer>`;
  let body;
  if (!view.events.length) body = empty({ glyph: 'activity', title: 'No activity yet', body: '<p>Events appear here as Ploeg queues, runs and reviews work for your Teams.</p>' }, helpers);
  else if (!shown.length && view.range && !view.kind) body = empty({ glyph: 'clock', title: 'No events in this time range', body: `<p>${view.nextCursor ? 'None of the events loaded so far. Load older events to look further back.' : 'Zoom out or choose another time range.'}</p>`, actions: `<button type="button" class="button secondary sm" data-action="activity-range-zoom-out">${zoomOutLabel(icon)}</button>` }, helpers);
  else if (!shown.length) body = empty({ glyph: 'filter', title: `No ${groupNouns[view.kind] || 'matching'} events loaded`, body: `<p>${view.nextCursor ? 'Load older events, or show every kind.' : 'Show every kind to see the rest of the history.'}</p>`, actions: `<a class="button secondary sm" href="#activity${view.team ? `?team=${escape(encodeURIComponent(view.team))}` : ''}">${icon('x')}<span class="button-label">Show all kinds</span></a>` }, helpers);
  else body = eventDays(shown, now).map(day => `<section class="activity-day" aria-labelledby="activity-day-${day.key}"><header class="activity-day-header"><h2 class="activity-day-title" id="activity-day-${day.key}">${escape(day.label)}</h2><span class="meta">${plural(day.events.length, 'event')}</span></header><ol class="timeline activity-events">${day.events.map(entry => eventItem(entry, helpers, now, user)).join('')}</ol></section>`).join('');
  return page('activity', demoNote(view.demo), toolbar, view.error ? staleNotice(view, helpers) : '', `<div class="card flush activity-feed" id="activity-feed" tabindex="-1" aria-label="Ploeg events, newest first">${pill}${body}${footer}</div>`);
}

const reviewOnly = run => Boolean(run.verdict) && run.verdict !== 'none' && run.outcome === 'no_change_needed';

function runBadge(run) {
  if (run.state === 'running') return ui.stateBadge('run:running');
  if (run.state === 'pending') { const meta = runState('pending'); return ui.badge({ tone: meta.tone, glyph: meta.glyph, label: meta.label }); }
  if (reviewOnly(run)) { const meta = verdictMeta(run.verdict); return ui.badge({ tone: meta.tone, glyph: meta.glyph, label: meta.short, title: `${meta.label}. Agent review is evidence, not a human review.` }); }
  const outcome = runOutcome(run.outcome);
  if (outcome) return ui.badge({ tone: outcome.tone, glyph: outcome.glyph, label: outcome.label });
  const none = unreportedOutcome(run);
  return ui.badge({ tone: none.tone, glyph: none.glyph, label: none.label });
}

function runNotes(run, escape, { grouped = false } = {}) {
  const notes = [];
  if (run.verdict && !reviewOnly(run)) { const meta = verdictMeta(run.verdict); notes.push(`<span class="runs-note" data-tone="${meta.tone}" title="${escape(`${meta.label}. Agent review is evidence, not a human review.`)}">${escape(meta.short)}</span>`); }
  if (run.leftover) return { notes: `<span class="runs-note" data-tone="severe">Its Work Item stopped</span>`, next: `<span class="runs-next">${escape('Ploeg did not close this Run when it stopped the Work Item, so it holds budget without working. Open the Work Item: run it again or cancel it.')}</span>` };
  const failure = runFailure(run);
  if (failure) notes.push(`<span class="runs-note" data-tone="${failure.tone}">${escape(failure.label)}</span>`);
  else if (run.failureReason) notes.push(`<span class="runs-note" data-tone="danger">${escape(capital(run.failureReason))}</span>`);
  const next = !failure || (failure.infra && grouped) ? '' : `${failure.infra ? 'Not the agent’s fault. ' : ''}${failure.action}`;
  return { notes: notes.join(''), next: next ? `<span class="runs-next">${escape(next)}</span>` : '' };
}

const firstLower = text => text ? text[0].toLowerCase() + text.slice(1) : '';
const sentences = text => String(text || '').split(/(?<=\.)\s+/).filter(Boolean);

function infraNote(runs) {
  const kinds = new Map();
  for (const run of runs) {
    const failure = runFailure(run);
    if (failure?.infra) kinds.set(failure.label, { failure, runs: (kinds.get(failure.label)?.runs ?? 0) + 1 });
  }
  if (!kinds.size) return '';
  const steps = [...new Set([...kinds.values()].flatMap(({ failure }) => sentences(failure.action)))].join(' ');
  if (kinds.size === 1) return `Not the agent’s fault. ${steps}`;
  return `Not the agent’s fault: ${[...kinds.values()].map(({ failure, runs: total }) => `${firstLower(failure.label)} (${plural(total, 'Run')})`).join(', ')}. ${steps}`;
}

function runRole(run) {
  if (!(run.round > 0)) return [run.role ? `${capital(run.role)} (no attempt recorded)` : 'Role unknown (no attempt recorded)', run.writes ? 'writer' : 'reader'];
  return [run.role ? capital(run.role) : 'Role unknown', `Round ${run.round}`, run.writes ? 'writer' : 'reader'];
}

const dots = (parts, escape, className = '') => `<span class="meta dots${className ? ` ${className}` : ''}">${parts.filter(Boolean).map(part => `<span>${escape(part)}</span>`).join('')}</span>`;

function runTiming(run, now, escape) {
  if (run.state === 'pending') return { started: '<span class="subtle">Waiting for a worker</span>', took: '' };
  const start = run.startedAt ? new Date(run.startedAt) : null;
  if (!start || Number.isNaN(start.getTime())) return { started: '<span class="subtle">Never started</span>', took: '' };
  if (run.state === 'running') return { started: `<time class="num" datetime="${start.toISOString()}" title="Started ${escape(dateTime(start))}">Running for ${escape(span((now - start.getTime()) / 1000))}</time>`, took: '' };
  return { started: timeHtml(start, { now }), took: isNumber(run.durationSeconds) ? `Took ${span(run.durationSeconds)}` : '' };
}

function spendMeter(run) {
  const authorized = isNumber(run.authorizedUsd) && run.authorizedUsd > 0 ? run.authorizedUsd : null;
  const settled = isNumber(run.settledUsd);
  const observed = !settled && isNumber(run.observedUsd);
  const spent = settled ? run.settledUsd : observed ? run.observedUsd : null;
  const meter = ui.meter({ settled: spent, authorized, observed, label: '', size: 'sm' });
  if (spent === null) return { meter, note: run.state === 'running' ? 'Nothing observed yet' : '', tone: '' };
  if (authorized && spent > authorized && observed) return { meter, note: 'Not settled', tone: '' };
  return { meter, note: observed ? 'Observed, not settled' : '', tone: '' };
}

function runSpendCell(run, demo, { escape }) {
  if (run.state === 'pending') return `<span class="subtle">${isNumber(run.authorizedUsd) && run.authorizedUsd > 0 ? `Up to ${escape(money(run.authorizedUsd))}` : 'Not authorized yet'}</span>`;
  const { meter, note, tone } = spendMeter(run);
  return `${meter}${note ? `<span class="runs-spend-note"${tone ? ` data-tone="${tone}"` : ''}>${escape(note)}</span>` : ''}`;
}

function modelNames(run, escape) {
  const listed = run.usage?.models?.length ? run.usage.models : run.reservedModels?.length ? run.reservedModels : [];
  const names = new Map();
  for (const model of listed) { const short = modelName(model); names.set(short, [...(names.get(short) || []), model]); }
  return [...names].map(([short, full]) => `<span class="runs-model-name" title="${escape(full.join(', '))}">${escape(short)}</span>`);
}

function runTokens(run, escape) {
  const input = run.usage?.inputTokens, output = run.usage?.outputTokens;
  if (!isNumber(input) && !isNumber(output)) return '';
  const unit = tokenUnit(Math.max(isNumber(input) ? input : 0, isNumber(output) ? output : 0));
  const sides = [[input, 'in'], [output, 'out']].filter(([value]) => isNumber(value));
  const exact = sides.map(([value, side]) => `${count(value)} tokens ${side}`).join(' · ');
  return `<span class="num" title="${escape(exact)}">${escape(sides.map(([value, side]) => `${tokenText(value, tokenUnit(value) ? unit : '')} ${side}`).join(' · '))}</span>`;
}

const runTitle = run => run.workItemTitle || `Work Item ${run.workItemId}`;

function runRow(run, demo, helpers, now, { grouped = false, hidden = false } = {}) {
  const { escape } = helpers;
  const { notes, next } = runNotes(run, escape, { grouped });
  const { started, took } = runTiming(run, now, escape);
  const models = modelNames(run, escape);
  const tokens = runTokens(run, escape);
  const model = models.length ? `<span class="runs-models">${models.join('')}</span>` : '<span class="subtle">Not reported</span>';
  const usage = demo ? '' : `<td class="runs-spend">${runSpendCell(run, demo, helpers)}</td><td class="runs-model">${model}${tokens ? `<span class="meta">${tokens}</span>` : ''}</td>`;
  const item = grouped ? dots([...runRole(run), `Run ${run.id}`], escape) : `<a class="runs-title" href="#work/${escape(run.workItemId)}">${escape(runTitle(run))}</a>${dots(runRole(run), escape)}${dots([run.externalRef, run.team, `Run ${run.id}`], escape)}`;
  return `<tr data-run-id="${escape(run.id)}" data-state="${escape(run.state)}"${hidden ? ' hidden' : ''}><td class="runs-status"><span class="runs-badge">${runBadge(run)}</span>${notes}${next}</td><td class="runs-item">${item}</td><td class="runs-started">${started}${took ? `<span class="meta num">${escape(took)}</span>` : ''}</td>${usage}</tr>`;
}

function runCard(run, demo, helpers, now, { grouped = false, hidden = false } = {}) {
  const { escape } = helpers;
  const { notes, next } = runNotes(run, escape, { grouped });
  const { started, took } = runTiming(run, now, escape);
  const models = modelNames(run, escape);
  const tokens = runTokens(run, escape);
  const model = `${models.length ? models.join(', ') : '<span class="subtle">Model not reported</span>'}${tokens ? ` · ${tokens}` : ''}`;
  const usage = demo ? '' : `<p class="meta runs-card-line">${model}</p><div class="runs-card-spend">${runSpendCell(run, demo, helpers)}</div>`;
  const item = grouped ? dots(runRole(run), escape, 'runs-card-line') : `<a class="runs-card-title" href="#work/${escape(run.workItemId)}">${escape(runTitle(run))}</a>${dots([run.externalRef, run.team, ...runRole(run)], escape, 'runs-card-line')}`;
  return `<li class="runs-card" data-run-id="${escape(run.id)}" data-state="${escape(run.state)}"${grouped ? ' data-grouped' : ''}${hidden ? ' hidden' : ''}><div class="runs-card-head">${runBadge(run)}<span class="meta">Run ${escape(run.id)}</span></div>${notes || next ? `<div class="runs-card-notes">${notes}${next}</div>` : ''}${item}<p class="meta runs-card-line">${started}${took ? ` · ${escape(took)}` : ''}</p>${usage}</li>`;
}

const foldShown = 3;
const foldAbove = 4;

/**
 * Finished Runs grouped by Work Item: groups ordered by their newest Run, Runs newest first inside each. Expects
 * `runs` newest first, as `sortRuns` orders them.
 * @returns {{ id: string, runs: object[] }[]}
 */
export function workGroups(runs) {
  const groups = new Map();
  for (const run of runs || []) {
    const id = String(run.workItemId ?? '');
    if (!groups.has(id)) groups.set(id, { id, runs: [] });
    groups.get(id).runs.push(run);
  }
  return [...groups.values()];
}

/**
 * What the listed Runs of one Work Item spent: the settled sum and the observed sum of those not settled, each named,
 * and how many reported neither. Never adds an unknown as zero.
 */
export function groupSpend(runs) {
  let settled = 0, observed = 0, settledRuns = 0, observedRuns = 0, unknown = 0;
  for (const run of runs) {
    if (isNumber(run.settledUsd)) { settled += run.settledUsd; settledRuns++; }
    else if (isNumber(run.observedUsd)) { observed += run.observedUsd; observedRuns++; }
    else unknown++;
  }
  if (!settledRuns && !observedRuns) return 'Spend not reported';
  const parts = [settledRuns ? `${money(settled)} settled` : '', observedRuns ? `${money(observed)} observed, not settled` : ''].filter(Boolean).join(' + ');
  return unknown ? `${parts}, ${plural(unknown, 'Run')} not reported` : parts;
}

function roundSpan(runs) {
  const rounds = runs.map(run => run.round).filter(round => isNumber(round) && round > 0);
  if (!rounds.length) return '';
  const low = Math.min(...rounds), high = Math.max(...rounds);
  return low === high ? `Round ${low}` : `Rounds ${low}–${high}`;
}

function groupFacts(group, demo) {
  const [newest] = group.runs;
  return [newest.externalRef, newest.team, plural(group.runs.length, 'Run'), roundSpan(group.runs), demo ? '' : groupSpend(group.runs)];
}

function foldButton(group, open, id, { escape, icon }) {
  const hidden = group.runs.length - foldShown;
  const label = open ? `Hide ${plural(hidden, 'earlier Run')}` : `Show ${plural(hidden, 'earlier Run')}`;
  return `<button type="button" class="button ghost sm runs-fold" id="${escape(id)}" data-action="runs-fold" data-work-item="${escape(group.id)}" aria-expanded="${open}">${icon(open ? 'chevron-up' : 'chevron-down')}<span class="button-label">${escape(label)}</span></button>`;
}

function groupShown(group, unfolded) {
  const foldable = group.runs.length > foldAbove;
  const open = foldable && unfolded.has(group.id);
  return { foldable, open, folded: index => foldable && !open && index >= foldShown };
}

function groupRows(group, view, helpers, now, unfolded) {
  const { escape } = helpers;
  const columns = runColumnsFor(view.demo).length;
  const [newest] = group.runs;
  const note = infraNote(group.runs);
  const { foldable, open, folded } = groupShown(group, unfolded);
  const head = `<tr class="runs-work"><th scope="rowgroup" colspan="${columns}"><span class="runs-work-line"><a class="runs-title" href="#work/${escape(group.id)}">${escape(runTitle(newest))}</a><span class="runs-work-latest"><span class="meta">Latest</span>${runBadge(newest)}</span></span>${dots(groupFacts(group, view.demo), escape)}${note ? `<span class="runs-next">${escape(note)}</span>` : ''}</th></tr>`;
  const fold = foldable ? `<tr class="runs-fold-row"><td colspan="${columns}">${foldButton(group, open, `runs-fold-${group.id}`, helpers)}</td></tr>` : '';
  return `<tbody data-work-item-id="${escape(group.id)}">${head}${group.runs.map((run, index) => runRow(run, view.demo, helpers, now, { grouped: true, hidden: folded(index) })).join('')}${fold}</tbody>`;
}

function groupCards(group, view, helpers, now, unfolded) {
  const { escape } = helpers;
  const [newest] = group.runs;
  const note = infraNote(group.runs);
  const { foldable, open, folded } = groupShown(group, unfolded);
  const head = `<li class="runs-cards-work" data-work-item-id="${escape(group.id)}"><a class="runs-card-title" href="#work/${escape(group.id)}">${escape(runTitle(newest))}</a>${dots(groupFacts(group, view.demo), escape, 'runs-card-line')}<span class="runs-work-latest"><span class="meta">Latest</span>${runBadge(newest)}</span>${note ? `<span class="runs-next">${escape(note)}</span>` : ''}</li>`;
  const fold = foldable ? `<li class="runs-cards-fold">${foldButton(group, open, `runs-card-fold-${group.id}`, helpers)}</li>` : '';
  return `${head}${group.runs.map((run, index) => runCard(run, view.demo, helpers, now, { grouped: true, hidden: folded(index) })).join('')}${fold}`;
}

const allRunColumns = [['status', 'Status'], ['item', 'Work Item'], ['started', 'Started'], ['spend', 'Spend'], ['model', 'Model']];
const runColumnsFor = demo => demo ? allRunColumns.filter(([key]) => key !== 'spend' && key !== 'model') : allRunColumns;
const runHead = (demo = false) => `<colgroup>${runColumnsFor(demo).map(([key]) => `<col class="runs-col-${key}">`).join('')}</colgroup><thead><tr>${runColumnsFor(demo).map(([, label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead>`;

function runsSkeleton() {
  const row = '<tr><td><span class="skeleton pill"></span></td><td><span class="skeleton runs-skeleton-title"></span><span class="skeleton runs-skeleton-meta"></span></td><td><span class="skeleton runs-skeleton-short"></span></td><td><span class="skeleton runs-skeleton-short"></span><span class="skeleton runs-skeleton-bar"></span></td><td><span class="skeleton runs-skeleton-short"></span></td></tr>';
  const card = '<li class="runs-card"><span class="skeleton pill"></span><span class="skeleton runs-skeleton-title"></span><span class="skeleton runs-skeleton-meta"></span><span class="skeleton runs-skeleton-short"></span><span class="skeleton runs-skeleton-bar"></span></li>';
  return `<div class="card flush runs-list" aria-busy="true"><span class="sr-only">Loading…</span><div class="table-wrap runs-table" aria-hidden="true"><table class="table runs-skeleton">${runHead()}<tbody>${row.repeat(6)}</tbody></table></div><ul class="runs-cards" aria-hidden="true">${card.repeat(4)}</ul></div>`;
}

/**
 * Runs: Team, state and outcome filters, then the Runs with running work first and the finished Runs grouped by Work
 * Item. A dense table with a sticky header on wide screens and a card list on narrow ones; both show every field. A
 * group with more than four Runs shows its newest three until its Work Item id is in `view.unfolded`. A running Run
 * whose Work Item is in `view.stopped` (ids of Work Items Ploeg stopped) says it is left over and holds budget
 * without working.
 */
export function runsMarkup(view, teams, helpers, now = Date.now()) {
  const { escape, icon } = helpers;
  const filter = view.filter || {};
  const outcomeOff = ['pending', 'running'].includes(filter.state);
  const toolbar = `<div class="toolbar feeds-toolbar runs-toolbar">${teamField('ploeg-runs-team', teams, filter.team, escape)}${selectField('ploeg-runs-state', 'State', runStateOptions, filter.state, 'All states')}${selectField('ploeg-runs-outcome', 'Outcome', runOutcomeOptions.map(value => [value, runOutcome(value).label]), filter.outcome, 'All outcomes', { disabled: outcomeOff, hint: 'Only finished Runs have an outcome.' })}${view.rangeControl ?? ''}</div>`;
  if (!view.runs && view.error) return page('runs', toolbar, problemMarkup(view.error, 'Runs', helpers));
  if (!view.runs) return page('runs', toolbar, runsSkeleton());
  const filtered = Boolean(filter.team || filter.state || filter.outcome);
  const stale = view.error ? staleNotice(view, helpers) : '';
  const sinceLine = filter.since ? sinceNotice(filter, helpers, now) : '';
  const listed = sinceRuns(view.runs, filter.since).filter(run => !view.range || runInRange(run, view.range, now));
  if (!listed.length) {
    const ranged = Boolean(view.range && view.runs.length);
    const title = filter.since ? `No Run finished ${sinceLabel(filter.since, now).replace(/^Since/, 'since')}` : ranged ? `No Runs${filtered ? ' match these filters' : ''} in this time range` : filtered ? 'No Runs match these filters' : 'No Runs yet';
    const body = filter.since || ranged ? (view.nextBefore ? 'None of the Runs loaded so far. Load older Runs to look further back.' : filter.since ? 'Show every finished Run to look further back.' : 'Zoom out or choose another time range.') : filtered ? 'Choose another Team, state or outcome.' : 'Runs appear here once a Team’s worker picks up a Work Item.';
    const more = (filter.since || ranged) && view.nextBefore ? olderButton(view, helpers) : '';
    const zoom = ranged && !view.nextBefore ? `<button type="button" class="button secondary sm" data-action="runs-range-zoom-out">${zoomOutLabel(icon)}</button>` : '';
    return page('runs', demoNote(view.demo), toolbar, sinceLine, stale, `<div class="card">${empty({ glyph: ranged ? 'clock' : 'runs', title, body: `<p>${escape(body)}</p>`, actions: `${more}${zoom}${filtered ? linkButton('Clear filters', '#runs', helpers, 'x') : ''}` }, helpers)}</div>`);
  }
  const stopped = view.stopped instanceof Set ? view.stopped : new Set();
  const runs = sortRuns(listed).map(run => run.state === 'running' && stopped.has(String(run.workItemId)) ? { ...run, leftover: true } : run);
  const active = runs.filter(run => run.state !== 'finished');
  const done = runs.filter(run => run.state === 'finished');
  const grouped = Boolean(active.length && done.length);
  const works = workGroups(done);
  const unfolded = view.unfolded instanceof Set ? view.unfolded : new Set();
  const sectionHead = (label, total) => `<tr class="runs-group"><th scope="rowgroup" colspan="${runColumnsFor(view.demo).length}">${escape(label)} <span class="count">${count(total)}</span></th></tr>`;
  const activeBody = active.length ? `<tbody>${grouped ? sectionHead('Running and waiting', active.length) : ''}${active.map(run => runRow(run, view.demo, helpers, now)).join('')}</tbody>` : '';
  const doneBodies = done.length ? `${grouped ? `<tbody>${sectionHead('Finished', done.length)}</tbody>` : ''}${works.map(group => groupRows(group, view, helpers, now, unfolded)).join('')}` : '';
  const table = `<div class="table-wrap runs-table"${view.demo ? ' data-demo' : ''}><table class="table"><caption class="sr-only">Runs, running first, then finished Runs by Work Item, newest first</caption>${runHead(view.demo)}${activeBody}${doneBodies}</table></div>`;
  const cardGroup = (label, total) => grouped ? `<li class="runs-cards-group">${escape(label)} <span class="count">${count(total)}</span></li>` : '';
  const cards = `<ul class="runs-cards" aria-label="Runs, running first, then finished Runs by Work Item">${cardGroup('Running and waiting', active.length)}${active.map(run => runCard(run, view.demo, helpers, now)).join('')}${cardGroup('Finished', done.length)}${works.map(group => groupCards(group, view, helpers, now, unfolded)).join('')}</ul>`;
  const covered = view.range && view.nextBefore && !view.rangeFilling && reachesStart(view.runs, run => runSpan(run, now).start, view.range, true);
  const older = covered ? '<span class="meta">Older Runs fall outside this time range.</span>' : view.nextBefore ? olderButton(view, helpers) : '<span class="meta">No older Runs.</span>';
  const loaded = filter.since || view.range ? `${plural(listed.length, 'Run')} of ${count(view.runs.length)} loaded${view.range && !filter.since ? ' in this time range' : ''}` : `${plural(view.runs.length, 'Run')} loaded`;
  return page('runs', demoNote(view.demo), toolbar, sinceLine, stale, `<div class="card flush runs-list">${table}${cards}<footer class="runs-footer">${older}<span class="meta">${loaded}</span></footer></div>`);
}

function olderButton(view, { icon }) {
  const busy = view.mode === 'older' || view.rangeFilling;
  return `<button type="button" class="button secondary" id="ploeg-runs-older" data-action="ploeg-runs-older"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('chevron-down')}<span class="button-label">${view.rangeFilling ? 'Reaching the start of the range' : 'Load older'}</span></button>`;
}

const zoomOutLabel = icon => `${icon('zoom-out')}<span class="button-label">Zoom out</span>`;

function sinceNotice(filter, helpers, now) {
  const { escape } = helpers;
  const rest = buildHash('runs', { ...filter, since: '' });
  return `<p class="runs-since"><span>Finished Runs ${escape(sinceLabel(filter.since, now).replace(/^Since/, 'since'))}</span>${linkButton('Show every finished Run', `#${rest}`, helpers, 'x')}</p>`;
}

function briefMarkup(text) {
  const brief = String(text || '').trim();
  if (!brief) return '<p class="subtle proposal-brief-empty">No brief reported.</p>';
  const paragraphs = brief.split(/\n\s*\n/);
  if (brief.length <= 480 || paragraphs.length < 2) return `<div data-private class="prose proposal-brief">${markdown(brief)}</div>`;
  return `<div data-private class="prose proposal-brief">${markdown(paragraphs[0])}</div>${ui.disclosure({ summary: 'Read the full brief', body: `<div data-private class="prose">${markdown(paragraphs.slice(1).join('\n\n'))}</div>`, plain: true })}`;
}

function repositoryMarkup(item, escape, { explain = false } = {}) {
  const target = item.target;
  if (target && target.owner && target.repo) return ui.chip({ label: `${target.owner}/${target.repo}`, icon: 'branch', title: target.baseBranch ? `Base branch ${target.baseBranch}` : undefined });
  const warning = routingWarning({ ...item, target: target ?? null });
  if (warning) return `${ui.chip({ label: warning.chip, tone: warning.tone, icon: warning.glyph, title: warning.sentence })}${explain ? `<span class="meta proposal-routing">${escape(warning.sentence)}</span>` : ''}`;
  return `<span class="subtle">${escape('Not reported')}</span>`;
}

function readyBadge(ready) {
  if (ready === true) return ui.badge({ tone: 'success', glyph: 'check', label: 'Ready' });
  if (ready === false) return ui.badge({ tone: 'attention', glyph: 'alert', label: 'Needs refinement', title: 'It needs refining before a worker can pick it up.' });
  return '';
}

function proposalCard(entry, { decide, busy }, helpers, now) {
  const { escape, icon } = helpers;
  const id = escape(entry.id);
  const kind = createdKinds[entry.createdKind] || (entry.createdKind ? capital(entry.createdKind) : 'Kind not reported');
  const source = entry.sourceWorkItemId ? `<a href="#work/${escape(entry.sourceWorkItemId)}">${escape(entry.sourceTitle || `Work Item ${entry.sourceWorkItemId}`)}</a>` : '<span class="subtle">Source Work Item not reported</span>';
  const meta = `<div class="proposal-meta">${ui.badge({ tone: 'neutral', glyph: 'proposed', label: kind })}${readyBadge(entry.ready)}${ui.chip({ label: entry.team })}<span class="meta">Proposed ${timeHtml(entry.createdAt, { now }) || 'at an unknown time'}</span></div>`;
  const facts = `<dl class="facts proposal-facts"><div class="fact"><dt>Found while working on</dt><dd>${source}</dd></div><div class="fact"><dt>Proposed by</dt><dd><span class="proposal-agent">${icon('bot')}${escape(proposalCreator(entry))}</span></dd></div><div class="fact"><dt>Repository</dt><dd>${repositoryMarkup(entry, escape)}</dd></div></dl>`;
  const pending = busy === entry.id;
  const buttons = decide ? `<div class="proposal-actions"><button type="button" class="button secondary" id="proposal-reject-${id}" data-action="ploeg-reject" data-id="${id}" aria-describedby="proposal-${id}-title"${busy ? ' disabled' : ''}>${icon('x')}<span class="button-label">Reject</span></button><button type="button" class="button primary" id="proposal-approve-${id}" data-action="ploeg-approve" data-id="${id}" aria-describedby="proposal-${id}-title"${busy ? ' disabled' : ''}${pending ? ' aria-busy="true"' : ''}>${pending ? '<span class="spinner" aria-hidden="true"></span>' : icon('check')}<span class="button-label">Approve</span></button></div>` : '';
  const footer = `<footer class="proposal-footer"><p class="proposal-stake">${icon('coins')}<span>Spends from the ${escape(entry.team)} Team’s budget</span></p>${buttons}</footer>`;
  return `<li><article class="card proposal" aria-labelledby="proposal-${id}-title"><div class="proposal-body">${meta}<h2 class="proposal-title" id="proposal-${id}-title"><a href="#work/${id}">${escape(entry.title || `Work Item ${entry.id}`)}</a></h2>${briefMarkup(entry.descriptionMarkdown ?? entry.description)}${facts}</div>${footer}</article></li>`;
}

function proposedSkeleton() {
  const fact = '<div class="fact"><span class="skeleton proposal-skeleton-term"></span><span class="skeleton proposal-skeleton-value"></span></div>';
  const card = `<li class="card proposal"><div class="proposal-body"><div class="proposal-meta"><span class="skeleton pill"></span><span class="skeleton pill"></span><span class="skeleton proposal-skeleton-age"></span></div><span class="skeleton proposal-skeleton-title"></span><span class="skeleton-lines"><span class="skeleton text"></span><span class="skeleton text"></span></span><div class="facts proposal-facts">${fact.repeat(3)}</div></div><div class="proposal-footer"><span class="skeleton proposal-skeleton-stake"></span><span class="proposal-actions"><span class="skeleton proposal-skeleton-button"></span><span class="skeleton proposal-skeleton-button"></span></span></div></li>`;
  return `<div class="proposals-list proposals-loading" aria-busy="true"><span class="sr-only">Loading…</span><div class="proposals-header" aria-hidden="true"><span class="skeleton proposal-skeleton-count"></span></div><ul class="proposals" aria-hidden="true">${card.repeat(2)}</ul></div>`;
}

/**
 * Proposed: Work Items agents proposed, as Ploeg lists them, each with its source, kind, brief, whose budget it
 * spends, and Approve and Reject for operators and administrators. Viewers read the list once told who decides.
 */
export function proposedMarkup(view, user, helpers, now = Date.now()) {
  const { icon } = helpers;
  if (!view.items && view.error) return page('proposed', problemMarkup(view.error, 'proposed work', helpers));
  if (!view.items) return page('proposed', proposedSkeleton());
  const decide = canDecide(user);
  const stale = view.error ? staleNotice(view, helpers) : '';
  if (!view.items.length) return page('proposed', demoNote(view.demo), stale, `<div class="card">${empty({ glyph: 'check-circle', tone: 'success', title: 'No proposed work waits for you', body: '<p>When an agent proposes a Work Item while it works, it waits here until someone approves it.</p>', compact: false }, helpers)}</div>`);
  const viewer = decide ? '' : ui.callout({ tone: 'neutral', icon: 'eye', body: '<p>Your account can read proposed work. An operator or administrator approves or rejects it.</p>' });
  const header = `<div class="proposals-header"><p class="proposals-count">${plural(view.items.length, 'proposal')}${view.truncated ? ' shown; Ploeg has more' : ''}</p><p class="meta proposals-budget">${icon('coins')}<span>Ploeg does not report Team budgets to Unfold yet, so no amounts are shown.</span></p></div>`;
  const list = `<ul class="proposals">${view.items.map(entry => proposalCard(entry, { decide, busy: view.busy }, helpers, now)).join('')}</ul>`;
  return page('proposed', demoNote(view.demo), stale, viewer, `<section class="proposals-list" aria-label="Proposals">${header}${list}</section>`);
}

function dialogHeader(title, { icon }) {
  return `<header class="dialog-header"><h2 id="confirm-title">${title}</h2><button type="button" class="button ghost icon-only sm" data-action="ploeg-dialog-close" aria-label="Close" title="Close">${icon('x')}</button></header>`;
}

/** The approval confirmation: what approving queues, whose budget it spends and where it runs. Confirming closes with `confirm`. */
export function approveDialogMarkup(entry, demo, helpers) {
  const { escape, icon } = helpers;
  const facts = ui.dl([['Queued for', `The ${escape(entry.team)} Team`], ['Money at stake', `Its Runs spend from the ${escape(entry.team)} Team’s budget. Ploeg does not report that budget to Unfold yet, so Unfold cannot show the amount.`], ['Repository', repositoryMarkup(entry, escape, { explain: true })], ...(entry.ready === false ? [['Readiness', 'Needs refinement. It may wait in the queue until someone refines it.']] : [])], { rows: true });
  const demoLine = demo ? ui.callout({ tone: 'neutral', icon: 'info', body: '<p>Demo: approving changes only this demo’s sample data. Nothing is dispatched and nothing is spent.</p>' }) : '';
  return `<form method="dialog" class="proposal-dialog">${dialogHeader('Approve this proposal?', helpers)}<div class="dialog-body"><p class="proposal-dialog-title">${escape(entry.title || `Work Item ${entry.id}`)}</p><p>Ploeg queues it for its Team. A worker picks it up and its Runs start spending.</p>${facts}${demoLine}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="cancel" autofocus>Keep it proposed</button><button type="submit" class="button primary" value="confirm">${icon('check')}<span class="button-label">Approve and queue</span></button></footer></form>`;
}

/** The rejection form: a required reason, and what rejecting does (live: Done without running; demo: withdrawn from the sample data). */
export function rejectDialogMarkup(entry, demo, helpers) {
  const { escape } = helpers;
  const effect = demo ? 'In this demo the proposal is withdrawn from the sample data. Nothing is dispatched.' : 'Ploeg marks it Done without running it and keeps your reason in its history. The Work Item it came from does not change.';
  return `<form data-form="ploeg-reject" data-id="${escape(entry.id)}" class="proposal-dialog" novalidate>${dialogHeader('Reject this proposal?', helpers)}<div class="dialog-body"><p class="proposal-dialog-title">${escape(entry.title || `Work Item ${entry.id}`)}</p><p>${effect}</p><div class="field"><label class="field-label" for="proposal-reject-reason">Reason</label><textarea id="proposal-reject-reason" name="reason" rows="3" maxlength="4096" required autofocus aria-describedby="proposal-reject-hint"></textarea><span class="field-hint" id="proposal-reject-hint">Required. Say why, so the Team can learn from it.</span><span class="field-error" id="proposal-reject-error" hidden>Write a reason before you reject it.</span></div></div><footer class="dialog-footer"><button type="button" class="button secondary" data-action="ploeg-dialog-close">Keep it proposed</button><button type="submit" class="button danger">Reject</button></footer></form>`;
}
