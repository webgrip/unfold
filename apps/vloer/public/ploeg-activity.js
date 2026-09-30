import * as ui from './core/ui.js';
import { count, dateTime, dayKey, dayLabel, duration as span, money, percent, plural, timeHtml } from './core/format.js';
import { failureReason, runOutcome, runState, verdict as verdictMeta } from './core/states.js';
import { markdown } from './core/markdown.js';
import { parseBudgetReason, parseStuckReason, routingWarning } from './core/reasons.js';

/** The Insights time windows as `[id, label]`. */
export const ploegWindows = [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']];
/** The Activity kinds a person can filter on, as `[id, label]`. */
export const eventGroups = [['work', 'Work Items'], ['runs', 'Runs and Shifts'], ['review', 'Review and delivery'], ['spend', 'Spend'], ['other', 'Other']];
const groupNouns = { work: 'Work Item', runs: 'Run and Shift', review: 'review and delivery', spend: 'spend', other: 'other' };

const demoText = 'Illustrative Ploeg records. No Run executed, no model was called and spend is US$ 0,00.';
const eventTable = {
  'work_item.queued': ['Queued', 'neutral', 'circle-dashed'],
  'work_item.refreshed': ['Tracker task changed', 'neutral', 'refresh'],
  'work_item.proposed': ['Proposed by an agent', 'neutral', 'proposed'],
  'work_item.approved': ['Approved', 'success', 'check'],
  'work_item.rejected': ['Rejected', 'neutral', 'x'],
  'work_item.withdrawn': ['Withdrawn', 'neutral', 'circle-slash'],
  'work_item.needs_human': ['Needs you', 'attention', 'alert'],
  'work_item.awaiting_review': ['Ready for your review', 'review', 'pull-request'],
  'work_item.done': ['Done', 'success', 'check-circle'],
  'work_item.stale': ['Stopped retrying', 'severe', 'clock'],
  'work_item.leased': ['Running', 'live', 'runs'],
  'created_work_item.accepted': ['Created new work', 'neutral', 'plus'],
  'created_work_item.rejected': ['New work refused by policy', 'neutral', 'x'],
  'follow_up.created': ['Follow-up created', 'neutral', 'plus'],
  'follow_up.skipped': ['Follow-up skipped', 'neutral', 'minus'],
  'run.claimed': ['Run started', 'live', 'runs'],
  'run.expired': ['Run stopped checking in', 'severe', 'zap'],
  'round.opened': ['Round opened', 'neutral', 'layers'],
  'round.reopened': ['Round retried after a failed writer', 'attention', 'refresh'],
  'shift.closed': ['Shift closed', 'neutral', 'stop'],
  'lease.acquired': ['Worker claimed it', 'live', 'runs'],
  'lease.expired': ['Worker lost; Ploeg retries later', 'severe', 'zap'],
  infra_cap: ['Infrastructure kept failing; Ploeg stopped', 'severe', 'zap'],
  'operator.admitted': ['A Vloer session took over', 'neutral', 'user'],
  'operator.admission_expired': ['Session admission expired', 'neutral', 'clock'],
  'checkpoint.written': ['Checkpoint saved', 'neutral', 'branch'],
  'review.changes_requested': ['Changes requested on the pull request', 'attention', 'alert'],
  'delivery.candidate_admitted': ['Delivery candidate admitted', 'neutral', 'inbox'],
  'delivery.verification_recorded': ['Verification recorded', 'neutral', 'check'],
  'delivery.approved': ['Delivery approved', 'success', 'check-circle'],
  'delivery.publication_reserved': ['Publication reserved', 'neutral', 'lock'],
  'delivery.publication_published': ['Published to the forge', 'success', 'pull-request'],
  'delivery.publication_unknown': ['Publication result unknown', 'attention', 'alert'],
  'llm.reserved': ['Budget reserved', 'neutral', 'coins'],
  'llm.minting': ['Model key requested', 'neutral', 'lock'],
  'llm.issued': ['Model key issued', 'neutral', 'lock'],
  'llm.observed': ['Model spend observed', 'neutral', 'coins'],
  'llm.reconciled': ['Spend settled', 'neutral', 'coins'],
  'llm.blocked': ['Model key blocked', 'neutral', 'lock'],
  'llm.unissued_blocked': ['Unused model key blocked', 'neutral', 'lock'],
  'llm.unknown': ['Spend could not be settled', 'attention', 'alert'],
};
const outcomeLabels = { pr_opened: 'Opened a pull request', pr_updated: 'Updated the pull request', no_change_needed: 'Found no change needed', follow_up_created: 'Created follow-up work', issue_updated: 'Updated the tracker item', stuck: 'Reported that it is stuck', failed: 'Run failed' };
const phases = { branch_created: ['Created the branch', 'branch'], progress: ['Reported progress', 'activity'], pr_opened: ['Opened a pull request', 'pull-request'], pr_updated: ['Updated the pull request', 'pull-request'], reviewed: ['Recorded a review', 'eye'], review: ['Recorded a review', 'eye'] };
const groupPrefixes = { work_item: 'work', created_work_item: 'work', follow_up: 'work', run: 'runs', round: 'runs', shift: 'runs', lease: 'runs', infra_cap: 'runs', operator: 'runs', outcome: 'runs', checkpoint: 'runs', review: 'review', delivery: 'review', llm: 'spend' };
const withdrawnReasons = { withdrawn_unassigned: 'the task was unassigned from the Team in the tracker', withdrawn_closed: 'the task was closed in the tracker', withdrawn_by_operator: 'an operator cancelled it' };
const trackerNames = { vikunja: 'Vikunja', forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', gitea: 'Gitea', demo: 'Demo tracker' };
const createdKinds = { split: 'Split from its source', clarify: 'Clarification', discovered: 'Discovered work' };
const runStateOptions = [['pending', 'Pending'], ['running', 'Running'], ['finished', 'Finished']];
const runOutcomeOptions = ['pr_opened', 'pr_updated', 'issue_updated', 'follow_up_created', 'no_change_needed', 'stuck', 'failed'];
const problems = {
  ploeg_unsupported: { glyph: 'info', title: 'This Ploeg version has no activity data yet', body: 'Upgrade Ploeg to read Insights, Runs and Activity here. Work and review keep working.', link: ['Open Work', '#work'] },
  ploeg_unconfigured: { glyph: 'layers', title: 'Ploeg is not connected', body: 'An administrator connects Ploeg in the workbench configuration. Until then there is nothing to show here.', link: ['Open Environment', '#settings/environment'] },
  ploeg_scope: { glyph: 'lock', title: 'Your account has no Ploeg Teams', body: 'Ask an administrator to give your account access to a Team.' },
};

const words = value => String(value ?? '').replaceAll('_', ' ').trim();
const capital = value => { const text = words(value); return text ? text[0].toUpperCase() + text.slice(1) : ''; };
const sentence = value => { const text = String(value ?? '').trim(); return text ? text[0].toUpperCase() + text.slice(1) : ''; };
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
 * Names an audit action in plain words, with its filter group, tone and glyph. Every action Ploeg writes for a
 * Work Item has its own label; an unknown action reads as its humanized name in the `other` group.
 * @returns {{ group: string, label: string, tone: string, glyph: string }}
 */
export function eventKind(action) {
  const text = String(action ?? '');
  const group = groupPrefixes[text.split('.')[0]] || 'other';
  if (Object.hasOwn(eventTable, text)) { const [label, tone, glyph] = eventTable[text]; return { group, label, tone, glyph }; }
  if (text.startsWith('outcome.')) {
    const key = text.slice('outcome.'.length);
    const meta = runOutcome(key);
    return { group, label: outcomeLabels[key] || `Reported ${words(key)}`, tone: meta?.tone || 'neutral', glyph: meta?.glyph || 'circle' };
  }
  if (text.startsWith('delivery.publication_')) return { group, label: `Publication ${words(text.slice('delivery.publication_'.length))}`, tone: 'neutral', glyph: 'pull-request' };
  const [head, ...rest] = text.split('.');
  return { group, label: `${capital(head) || 'Event'}${rest.length ? `: ${words(rest.join('.'))}` : ''}`, tone: 'neutral', glyph: 'circle' };
}

function shiftReason(reason) {
  const text = String(reason ?? '').trim();
  const lower = text.toLowerCase();
  if (!text) return ['', 'neutral'];
  if (text === 'plan_exhausted') return ['Every planned Round ran', 'neutral'];
  if (text === 'review_approved') return ['The reviewer approved', 'success'];
  if (text === 'fix_round_cap_reached') return ['The reviewer still wanted changes when the fix Rounds ran out', 'attention'];
  if (text === 'budget_exhausted_before_fix_round') return ['The budget could not pay for another fix Round', 'attention'];
  if (lower.startsWith('budget exhausted')) { const { pool } = parseBudgetReason(text); return [pool === null ? 'The budget ran out' : `The budget of ${money(pool)} could not pay for the next Round`, 'attention']; }
  if (text === 'writing_run_failed_repeatedly') return ['The writer kept failing', 'danger'];
  if (text === 'writing_run_killed_repeatedly') return ['The cluster kept stopping the writer (not the Work Item’s fault)', 'severe'];
  if (lower.startsWith('run stuck:')) { const { role, round } = parseStuckReason(text); return [role ? `The ${role} reported that it is stuck${round ? ` in Round ${round}` : ''}` : 'An agent reported that it is stuck', 'attention']; }
  if (lower === 'plan removed from configuration') return ['The Team’s plan was removed from the configuration', 'attention'];
  if (Object.hasOwn(withdrawnReasons, text)) return [`Withdrawn: ${withdrawnReasons[text]}`, 'neutral'];
  if (text === 'operator_failed') return ['The Vloer session failed', 'danger'];
  return [sentence(text), 'neutral'];
}

/**
 * Tells one audit event as a person would read it: a label ("Implementer started Round 1"), a tone and glyph,
 * and a detail line from the event's own fields (Ploeg's reason, the Round, the authorized amount).
 * @returns {{ group: string, label: string, tone: string, glyph: string, detail: string }}
 */
export function eventStory(entry) {
  const kind = eventKind(entry?.action);
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  const reason = typeof detail.reason === 'string' ? detail.reason.trim() : '';
  const role = typeof detail.role === 'string' ? detail.role.trim() : '';
  const round = Number.isInteger(detail.round) && detail.round > 0 ? detail.round : null;
  const access = detail.writes === true ? 'Writes to the branch' : detail.writes === false ? 'Reads only' : '';
  const authorized = isNumber(detail.authorizedUsd) && detail.authorizedUsd > 0 ? `up to ${money(detail.authorizedUsd)} authorized` : '';
  const failures = isNumber(detail.infraFailures) ? `${plural(detail.infraFailures, 'infrastructure failure')} so far` : '';
  const story = { ...kind, detail: '' };
  switch (entry?.action) {
    case 'run.claimed': return { ...story, label: role ? `${capital(role)} started${round ? ` Round ${round}` : ''}` : kind.label, detail: [access, authorized].filter(Boolean).join(' · ') };
    case 'run.expired': return { ...story, label: role ? `${capital(role)} stopped checking in` : kind.label, detail: access };
    case 'round.opened': return { ...story, label: round ? `Round ${round} opened` : kind.label };
    case 'round.reopened': return { ...story, label: round ? `Round ${round} retried after a failed writer` : kind.label };
    case 'shift.closed': { const [text, tone] = shiftReason(reason); return { ...story, tone, detail: text }; }
    case 'checkpoint.written': { const phase = phases[detail.phase]; return { ...story, label: phase ? phase[0] : detail.phase ? `Checkpoint: ${words(detail.phase)}` : kind.label, glyph: phase ? phase[1] : kind.glyph }; }
    case 'lease.expired': case 'infra_cap': return { ...story, detail: failures };
    case 'work_item.withdrawn': return { ...story, detail: Object.hasOwn(withdrawnReasons, reason) ? sentence(withdrawnReasons[reason]) : sentence(reason) };
    case 'llm.reserved': return { ...story, detail: authorized ? sentence(authorized) : '' };
    default: return { ...story, detail: sentence(reason) };
  }
}

/**
 * Names who acted on an event: an agent of a Team, Ploeg itself, a tracker webhook or a Vloer operator (the
 * signed-in `user` reads as "you"). `kind` is agent, system, tracker or person, so agents are never mistaken for people.
 * @returns {{ name: string, kind: 'agent' | 'system' | 'tracker' | 'person', glyph: string, title: string }}
 */
export function actorOf(actor, user = null) {
  const text = String(actor ?? '').trim();
  const [kind, ...rest] = text.split(':');
  const tail = rest.join(':');
  if (kind === 'team' && tail) return { name: 'Agent', kind: 'agent', glyph: 'bot', title: `An agent of the ${tail} Team` };
  if (kind === 'ploegd') return { name: 'Ploeg', kind: 'system', glyph: 'layers', title: `Ploeg${tail ? ` (${words(tail).replaceAll('-', ' ')})` : ''}` };
  if (kind === 'webhook' && tail) { const name = trackerNames[rest[0]] || capital(rest[0]); return { name, kind: 'tracker', glyph: 'tag', title: `${name}, through its webhook` }; }
  if (kind === 'operator' && rest.length >= 2) {
    const id = rest.slice(1).join(':');
    if (user && String(user.id) === id) return { name: `${user.name || 'You'} (you)`, kind: 'person', glyph: 'user', title: `You, through ${rest[0] || 'Vloer'}` };
    return { name: 'An operator', kind: 'person', glyph: 'user', title: `Operator ${id}, through ${rest[0] || 'Vloer'}` };
  }
  return { name: text || 'Unknown', kind: 'system', glyph: 'circle', title: text || 'Not reported' };
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

/** Builds a valid Run filter: Ploeg only accepts an outcome with the finished state or no state. */
export function runFilter(filter) {
  const next = { team: filter.team || '', state: filter.state || '', outcome: filter.outcome || '' };
  if (next.state && next.state !== 'finished') next.outcome = '';
  return next;
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

function empty({ glyph = 'inbox', title, body = '', actions = '', tone, compact = true }, { escape, icon }) {
  return `<div class="empty-state${compact ? ' compact' : ''}"${tone ? ` data-tone="${tone}"` : ''}><span class="empty-state-icon" aria-hidden="true">${icon(glyph)}</span><p class="empty-state-title">${escape(title)}</p>${body ? `<div class="empty-state-body">${body}</div>` : ''}${actions ? `<div class="empty-state-actions">${actions}</div>` : ''}</div>`;
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
  const known = problems[error?.code];
  if (known) return `<div class="feeds-problem card">${empty({ glyph: known.glyph, title: known.title, body: `<p>${escape(known.body)}</p>`, actions: known.link ? linkButton(known.link[0], known.link[1], helpers) : '', compact: false }, helpers)}</div>`;
  return `<div class="feeds-problem card" role="alert">${empty({ glyph: 'x-circle', tone: 'danger', title: `Could not load ${subject}`, body: `<p>${escape(error?.message || 'Ploeg did not answer.')}</p>`, actions: retryButton(helpers), compact: false }, helpers)}</div>`;
}

function staleNotice(view, helpers) {
  const { escape, icon } = helpers;
  const since = timeHtml(view.loadedAt ?? view.refreshedAt, { display: 'time' });
  return `<div class="callout feeds-stale" data-tone="attention" role="status"><span class="callout-icon" aria-hidden="true">${icon('alert')}</span><div class="callout-content"><p class="callout-title">Could not refresh. ${since ? `Showing data from ${since}.` : 'Showing the last data Vloer read.'}</p><div class="callout-body"><p>${escape(view.error.message || 'Ploeg did not answer.')}</p></div></div><div class="callout-actions">${retryButton(helpers)}</div></div>`;
}

const demoNote = demo => demo ? ui.demoNote(demoText) : '';
const page = (name, ...parts) => `<div class="feeds feeds-${name}">${parts.join('')}</div>`;
const demoDash = '<span class="subtle" title="Demo · no model calls"><span aria-hidden="true">—</span><span class="sr-only">Demo · no model calls</span></span>';

function teamField(id, teams, selected, escape) {
  return `<div class="field inline feeds-field"><label class="field-label" for="${id}">Team</label><select id="${id}"><option value="">All Teams</option>${teams.map(team => `<option value="${escape(team)}"${team === selected ? ' selected' : ''}>${escape(team)}</option>`).join('')}</select></div>`;
}

function selectField(id, label, options, selected, all, { disabled = false, hint = '' } = {}) {
  const described = disabled && hint;
  return `<div class="field inline feeds-field${described ? ' has-hint' : ''}"><label class="field-label" for="${id}">${label}</label><select id="${id}"${disabled ? ' disabled' : ''}${described ? ` aria-describedby="${id}-hint"` : ''}><option value="">${all}</option>${options.map(([value, text]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${text}</option>`).join('')}</select>${described ? `<span class="field-hint feeds-hint" id="${id}-hint">${hint}</span>` : ''}</div>`;
}

function tile({ label, value, detail, href, tone, glyph, text = false }, { escape, icon }) {
  const inner = `<span class="stat-label">${glyph ? icon(glyph) : ''}${escape(label)}</span><strong class="stat-value${text ? ' is-text' : ''}">${escape(value)}</strong>${detail ? `<span class="stat-detail">${escape(detail)}</span>` : ''}`;
  const toned = tone ? ` data-tone="${tone}"` : '';
  return href ? `<a class="stat" href="${escape(href)}"${toned}>${inner}</a>` : `<div class="stat"${toned}>${inner}</div>`;
}

function teamTable({ caption, columns, rows }, { escape }) {
  const head = columns.map(([label, numeric]) => `<th scope="col"${numeric ? ' class="num"' : ''}>${escape(label)}</th>`).join('');
  const row = (name, cells) => `<tr><th scope="row">${escape(name)}</th>${cells.map((cell, index) => `<td${columns[index + 1][1] ? ' class="num"' : ''}>${cell}</td>`).join('')}</tr>`;
  return `<div class="table-wrap insights-table"><table class="table"><caption class="sr-only">${escape(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${rows.map(([name, cells]) => row(name, cells)).join('')}</tbody></table></div>`;
}

function insightsSection(id, title, description, body, { escape }, actions = '') {
  return `<section class="section insights-section" aria-labelledby="${id}-title"><header class="section-header"><div class="section-heading"><h2 class="section-title" id="${id}-title">${escape(title)}</h2><p class="section-description">${escape(description)}</p></div>${actions ? `<div class="section-actions">${actions}</div>` : ''}</header><div class="section-body stack gap-md">${body}</div></section>`;
}

function insightsSkeleton(windowName, switcher, helpers) {
  const tiles = (total, work) => `<div class="stat-row insights-stats${work ? ' insights-stats-work' : ''}" aria-hidden="true">${'<div class="stat insights-tile-skeleton"><span class="skeleton insights-skeleton-label"></span><span class="skeleton insights-skeleton-value"></span><span class="skeleton insights-skeleton-detail"></span></div>'.repeat(total)}</div>`;
  const table = rows => `<div class="card insights-table-skeleton" aria-hidden="true">${'<div class="insights-skeleton-row"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>'.repeat(rows)}</div>`;
  return `<div class="insights" aria-busy="true"><span class="sr-only">Loading…</span>${insightsSection('insights-runs', 'Runs and spend', `Last ${windowName}`, `${tiles(4)}${table(3)}`, helpers, switcher)}${insightsSection('insights-work', 'Work Items', 'Right now, whatever the window', `${tiles(5, true)}${table(3)}`, helpers)}</div>`;
}

/**
 * Insights: the window switch, Run and spend tiles for the window, Work Item tiles for right now, and per-Team
 * tables (cards on narrow screens). Stats and tables only, never a chart; glyphs come from `helpers.icon`.
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
  if (!data.teams.length) return page('insights', demoNote(data.demo), stale, `<div class="card">${empty({ glyph: 'lock', title: 'No Teams are visible to your account', body: '<p>Ask an administrator to check your Team access in Vloer and in Ploeg.</p>', compact: false }, helpers)}</div>`);
  const { runs, workItems: items, spend } = data.totals;
  const settledTile = data.demo
    ? tile({ label: 'Settled spend', value: 'No model calls', detail: 'Demo', glyph: 'coins', text: true }, helpers)
    : tile({ label: 'Settled spend', value: money(spend.settledUsd), detail: isNumber(spend.reservedUsd) ? `${money(spend.reservedUsd)} reserved by running Runs` : 'Reservations not reported', glyph: 'coins', text: !isNumber(spend.settledUsd) }, helpers);
  const runTiles = [
    tile({ label: 'Runs finished', value: count(runs.finished), detail: 'Failed and stuck Runs included', href: '#runs?state=finished', glyph: 'runs' }, helpers),
    tile({ label: 'Failed', value: count(runs.failed), detail: runs.finished ? `${percent(runs.failed / runs.finished)} of finished Runs` : 'No finished Runs', href: '#runs?state=finished&outcome=failed', tone: 'danger', glyph: 'x-circle' }, helpers),
    tile({ label: 'Stuck', value: count(runs.stuck), detail: 'An agent asked for a person', href: '#runs?state=finished&outcome=stuck', tone: 'attention', glyph: 'alert' }, helpers),
    settledTile,
  ].join('');
  const workTiles = [
    tile({ label: 'Ready for review', value: count(items.awaitingReview), detail: 'Pull requests to read', href: '#work?lane=awaiting_review', tone: 'review', glyph: 'pull-request' }, helpers),
    tile({ label: 'Needs you', value: count(items.needsHuman), detail: 'Ploeg stopped; see why', href: '#work?lane=needs_human', tone: 'attention', glyph: 'alert' }, helpers),
    tile({ label: 'Running', value: count(items.leased), detail: `${plural(runs.running, 'Run')} working · ${count(runs.pending)} waiting`, href: '#work?lane=leased', tone: 'live', glyph: 'activity' }, helpers),
    tile({ label: 'Queued', value: count(items.queued), detail: 'Waiting for a worker', href: '#work?lane=queued', glyph: 'circle-dashed' }, helpers),
    tile({ label: 'Proposed', value: count(items.proposed), detail: 'Waiting for approval', href: '#proposed', glyph: 'proposed' }, helpers),
  ].join('');
  const when = value => value ? timeHtml(value, { now }) : '<span class="subtle">None</span>';
  const settled = entry => data.demo ? '<span class="subtle">No model calls</span>' : escape(money(entry.spend.settledUsd));
  const reserved = entry => data.demo ? '<span class="subtle">—</span>' : escape(money(entry.spend.reservedUsd));
  const runColumns = [['Team'], ['Finished', true], ['Failed', true], ['Stuck', true], ['Settled', true], ['Reserved now', true], ['Last activity']];
  const runCells = entry => [count(entry.runs.finished), count(entry.runs.failed), count(entry.runs.stuck), settled(entry), reserved(entry), when(entry.lastActivityAt)];
  const workKeys = [['awaitingReview', 'Ready for review'], ['needsHuman', 'Needs you'], ['leased', 'Running'], ['queued', 'Queued'], ['proposed', 'Proposed'], ['stale', 'Stopped retrying'], ['done', 'Done'], ['withdrawn', 'Withdrawn']];
  const workColumns = [['Team'], ...workKeys.map(([, label]) => [label, true])];
  const workCells = entry => workKeys.map(([key]) => count(entry.workItems[key]));
  const teamCard = entry => `<article class="card insights-team" aria-labelledby="insights-team-${escape(entry.team)}"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="insights-team-${escape(entry.team)}">${escape(entry.team)}</h3><p class="card-subtitle">Last activity ${entry.lastActivityAt ? timeHtml(entry.lastActivityAt, { now }) : 'none'}</p></div></header><div class="card-body stack gap-md"><div class="stack gap-sm"><p class="overline">Runs and spend · ${escape(windowName)}</p>${ui.dl([['Finished', count(entry.runs.finished)], ['Failed', count(entry.runs.failed)], ['Stuck', count(entry.runs.stuck)], ['Settled', settled(entry)], ['Reserved', reserved(entry)]])}</div><div class="stack gap-sm"><p class="overline">Work Items now</p>${ui.dl(workKeys.map(([key, label]) => [label, count(entry.workItems[key])]))}</div></div></article>`;
  const runTable = teamTable({ caption: `Runs and spend per Team, last ${windowName}`, columns: runColumns, rows: data.teams.map(entry => [entry.team, runCells(entry)]) }, helpers);
  const workTable = teamTable({ caption: 'Work Items per Team, right now', columns: workColumns, rows: data.teams.map(entry => [entry.team, workCells(entry)]) }, helpers);
  const footnote = data.demo ? '' : '<p class="meta insights-footnote">Settled spend is what Ploeg settled with the model gateway. A running Run holds a reservation until it settles.</p>';
  const runsBody = `<div class="stat-row insights-stats">${runTiles}</div><div class="card flush insights-tables">${runTable}</div>${footnote}`;
  const workBody = `<div class="stat-row insights-stats insights-stats-work">${workTiles}</div><div class="card flush insights-tables">${workTable}</div>`;
  const cards = `<section class="section insights-cards" aria-label="Per Team"><div class="insights-teams">${data.teams.map(teamCard).join('')}</div></section>`;
  return page('insights', demoNote(data.demo), stale, `<div class="insights"${view.loading ? ' aria-busy="true"' : ''}>${insightsSection('insights-runs', 'Runs and spend', `Last ${windowName} · ${plural(data.teams.length, 'Team')}`, runsBody, helpers, switcher)}${insightsSection('insights-work', 'Work Items', 'Right now, whatever the window', workBody, helpers)}${cards}</div>`);
}

function eventItem(entry, helpers, now, user) {
  const { escape, icon } = helpers;
  const story = eventStory(entry);
  const actor = actorOf(entry.actor, user);
  const title = entry.workItemTitle || `Work Item ${entry.workItemId}`;
  const link = entry.workItemId ? `<a class="activity-event-item" href="#work/${escape(entry.workItemId)}">${escape(title)}</a>` : '';
  const team = entry.team ? `<span class="activity-event-team" title="${escape(entry.team)}">${escape(entry.team)}</span>` : '';
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
  const toolbar = `<div class="toolbar feeds-toolbar">${teamField('ploeg-feed-team', teams, view.team, escape)}${selectField('ploeg-feed-kind', 'Kind', eventGroups, view.kind, 'All kinds')}</div>`;
  if (!view.events && view.error) return page('activity', toolbar, problemMarkup(view.error, 'Activity', helpers));
  if (!view.events) return page('activity', toolbar, activitySkeleton());
  const matches = entry => !view.kind || eventKind(entry.action).group === view.kind;
  const shown = view.events.filter(matches);
  const fresh = view.latest ? newerEvents(view, view.latest) : { events: [], gap: false };
  const waiting = fresh.events.filter(matches).length;
  const pill = waiting ? `<div class="activity-new"><button type="button" class="button primary sm activity-new-button" id="activity-show-new" data-action="activity-show-new">${icon('chevron-up')}<span class="button-label">${fresh.gap ? `${count(waiting)}+ new events` : plural(waiting, 'new event')}</span></button></div>` : '';
  const loaded = `<span class="meta">${plural(view.events.length, 'event')} loaded${view.kind ? `, ${count(shown.length)} of this kind` : ''}</span>`;
  const older = view.nextCursor ? `<button type="button" class="button secondary" id="ploeg-feed-older" data-action="ploeg-feed-older"${view.mode === 'older' ? ' disabled aria-busy="true"' : ''}>${view.mode === 'older' ? '<span class="spinner" aria-hidden="true"></span>' : icon('chevron-down')}<span class="button-label">Load older</span></button>` : '<span class="meta">This is where the history starts.</span>';
  const footer = `<footer class="activity-footer">${older}${loaded}</footer>`;
  let body;
  if (!view.events.length) body = empty({ glyph: 'activity', title: 'No activity yet', body: '<p>Events appear here as Ploeg queues, runs and reviews work for your Teams.</p>' }, helpers);
  else if (!shown.length) body = empty({ glyph: 'filter', title: `No ${groupNouns[view.kind] || 'matching'} events loaded`, body: `<p>${view.nextCursor ? 'Load older events, or show every kind.' : 'Show every kind to see the rest of the history.'}</p>`, actions: `<a class="button secondary sm" href="#activity${view.team ? `?team=${escape(encodeURIComponent(view.team))}` : ''}">${icon('x')}<span class="button-label">Show all kinds</span></a>` }, helpers);
  else body = eventDays(shown, now).map(day => `<section class="activity-day" aria-labelledby="activity-day-${day.key}"><header class="activity-day-header"><h2 class="activity-day-title" id="activity-day-${day.key}">${escape(day.label)}</h2><span class="meta">${plural(day.events.length, 'event')}</span></header><ol class="timeline activity-events">${day.events.map(entry => eventItem(entry, helpers, now, user)).join('')}</ol></section>`).join('');
  return page('activity', demoNote(view.demo), toolbar, view.error ? staleNotice(view, helpers) : '', `<div class="card flush activity-feed" id="activity-feed" tabindex="-1" aria-label="Ploeg events, newest first">${pill}${body}${footer}</div>`);
}

function runBadge(run) {
  if (run.state === 'running') return ui.stateBadge({ key: 'running', label: 'Running', tone: 'live', live: true });
  if (run.state === 'pending') { const meta = runState('pending'); return ui.badge({ tone: meta.tone, glyph: meta.glyph, label: meta.label }); }
  const outcome = runOutcome(run.outcome);
  if (outcome) return ui.badge({ tone: outcome.tone, glyph: outcome.glyph, label: outcome.label });
  return ui.badge({ tone: 'neutral', glyph: 'circle', label: 'No outcome reported' });
}

function runNotes(run, escape) {
  const notes = [];
  if (run.verdict) { const meta = verdictMeta(run.verdict); notes.push(`<span class="runs-note" data-tone="${meta.tone}">${escape(meta.label)}</span>`); }
  const failure = failureReason(run.failureReason);
  if (failure) notes.push(`<span class="runs-note" data-tone="${failure.tone}">${escape(failure.label)}</span>`);
  else if (run.failureReason) notes.push(`<span class="runs-note" data-tone="danger">${escape(capital(run.failureReason))}</span>`);
  const next = failure ? `${failure.infra ? 'Not the agent’s fault. ' : ''}${failure.action}` : '';
  return { notes: notes.join(''), next: next ? `<span class="runs-next">${escape(next)}</span>` : '' };
}

function runRole(run) {
  const role = run.role ? capital(run.role) : 'Role not reported';
  return [role, run.round > 0 ? `Round ${run.round}` : 'Before Shifts', run.writes ? 'writer' : 'reader'].join(' · ');
}

function runTiming(run, now, escape) {
  if (run.state === 'pending') return { started: '<span class="subtle">Waiting for a worker</span>', took: '' };
  const start = run.startedAt ? new Date(run.startedAt) : null;
  if (!start || Number.isNaN(start.getTime())) return { started: '<span class="subtle">Never started</span>', took: '' };
  if (run.state === 'running') return { started: `<time class="num" datetime="${start.toISOString()}" title="Started ${escape(dateTime(start))}">Running for ${escape(span((now - start.getTime()) / 1000))}</time>`, took: '' };
  return { started: timeHtml(start, { now }), took: isNumber(run.durationSeconds) ? `Took ${span(run.durationSeconds)}` : '' };
}

function spendMeter(run, escape) {
  const authorized = isNumber(run.authorizedUsd) && run.authorizedUsd > 0 ? run.authorizedUsd : null;
  const settled = isNumber(run.settledUsd);
  const observed = !settled && isNumber(run.observedUsd);
  const spent = settled ? run.settledUsd : observed ? run.observedUsd : null;
  const bar = rects => `<svg class="meter-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="meter-track" width="100" height="6"/>${rects}</svg>`;
  const label = (value, of) => `<div class="meter-label"><span class="meter-text">${value}${of ? ` <span class="meter-of">${escape(of)}</span>` : ''}</span></div>`;
  const observedNote = observed ? { note: 'Observed, not settled', tone: '' } : { note: '', tone: '' };
  if (spent === null) return { meter: `<div class="meter sm" data-unknown>${label('<span class="meter-value">Not reported</span>', authorized ? `of ${money(authorized)}` : '')}${bar('')}</div>`, note: run.state === 'running' ? 'Nothing observed yet' : '', tone: '' };
  if (!authorized) return { meter: `<div class="meter sm" data-unknown="budget">${label(`<strong class="meter-value">${escape(money(spent))}</strong>`, 'no budget reported')}${bar('')}</div>`, ...observedNote };
  const width = Math.round(Math.min(100, spent / authorized * 100) * 100) / 100;
  const over = spent > authorized;
  const excess = money(Math.round((spent - authorized) * 100) / 100);
  const level = over ? 'over' : spent / authorized >= 0.8 ? 'warn' : '';
  const text = `${money(spent)} ${observed ? 'observed so far' : 'settled'} of ${money(authorized)} authorized${over ? `, ${excess} over budget` : ''}`;
  const meter = `<div class="meter sm"${level ? ` data-level="${level}"` : ''} role="meter" aria-label="Spend" aria-valuemin="0" aria-valuemax="${authorized}" aria-valuenow="${Math.min(spent, authorized)}" aria-valuetext="${escape(text)}">${label(`<strong class="meter-value">${escape(money(spent))}</strong>`, `of ${money(authorized)}`)}${bar(width > 0 ? `<rect class="meter-settled" width="${width}" height="6"/>` : '')}</div>`;
  if (over) return { meter, note: `${excess} over budget${observed ? ', not settled' : ''}`, tone: 'danger' };
  return { meter, ...observedNote };
}

function runSpendCell(run, demo, { escape }) {
  if (demo) return demoDash;
  if (run.state === 'pending') return `<span class="subtle">${isNumber(run.authorizedUsd) && run.authorizedUsd > 0 ? `Up to ${escape(money(run.authorizedUsd))}` : 'Not authorized yet'}</span>`;
  const { meter, note, tone } = spendMeter(run, escape);
  return `${meter}${note ? `<span class="runs-spend-note"${tone ? ` data-tone="${tone}"` : ''}>${escape(note)}</span>` : ''}`;
}

function runModel(run, escape) {
  const models = run.usage?.models?.length ? run.usage.models : run.reservedModels?.length ? run.reservedModels : [];
  const tokens = run.usage && (isNumber(run.usage.inputTokens) || isNumber(run.usage.outputTokens)) ? `${count(run.usage.inputTokens)} in · ${count(run.usage.outputTokens)} out` : '';
  return { models: models.map(model => escape(model)), tokens };
}

function runRow(run, demo, helpers, now) {
  const { escape } = helpers;
  const title = run.workItemTitle || `Work Item ${run.workItemId}`;
  const { notes, next } = runNotes(run, escape);
  const { started, took } = runTiming(run, now, escape);
  const { models, tokens } = runModel(run, escape);
  const ref = [run.externalRef, run.team, `Run ${run.id}`].filter(Boolean).map(escape).join(' · ');
  const model = models.length ? `<span class="runs-models">${models.map(name => `<span class="runs-model-name">${name}</span>`).join('')}</span>` : demo ? demoDash : '<span class="subtle">Not reported</span>';
  return `<tr data-run-id="${escape(run.id)}" data-state="${escape(run.state)}"><td class="runs-status"><span class="runs-badge">${runBadge(run)}</span>${notes}${next}</td><td class="runs-item"><a class="runs-title" href="#work/${escape(run.workItemId)}">${escape(title)}</a><span class="meta">${escape(runRole(run))}</span><span class="meta">${ref}</span></td><td class="runs-started">${started}${took ? `<span class="meta num">${escape(took)}</span>` : ''}</td><td class="runs-spend">${runSpendCell(run, demo, helpers)}</td><td class="runs-model">${model}${tokens ? `<span class="meta num">${escape(tokens)}</span>` : ''}</td></tr>`;
}

function runCard(run, demo, helpers, now) {
  const { escape } = helpers;
  const title = run.workItemTitle || `Work Item ${run.workItemId}`;
  const { notes, next } = runNotes(run, escape);
  const { started, took } = runTiming(run, now, escape);
  const { models, tokens } = runModel(run, escape);
  const ref = [run.externalRef, run.team, runRole(run)].filter(Boolean).map(escape).join(' · ');
  const model = `${models.length ? `<span class="runs-model-name">${models.join(', ')}</span>` : '<span class="subtle">Model not reported</span>'}${tokens ? ` · <span class="num">${escape(tokens)}</span>` : ''}`;
  const usage = demo ? '' : `<p class="meta runs-card-line">${model}</p><div class="runs-card-spend">${runSpendCell(run, demo, helpers)}</div>`;
  return `<li class="runs-card" data-run-id="${escape(run.id)}" data-state="${escape(run.state)}"><div class="runs-card-head">${runBadge(run)}<span class="meta">Run ${escape(run.id)}</span></div>${notes || next ? `<div class="runs-card-notes">${notes}${next}</div>` : ''}<a class="runs-card-title" href="#work/${escape(run.workItemId)}">${escape(title)}</a><p class="meta runs-card-line">${ref}</p><p class="meta runs-card-line">${started}${took ? ` · ${escape(took)}` : ''}</p>${usage}</li>`;
}

const runColumns = [['status', 'Status'], ['item', 'Work Item'], ['started', 'Started'], ['spend', 'Spend'], ['model', 'Model']];
const runHead = `<colgroup>${runColumns.map(([key]) => `<col class="runs-col-${key}">`).join('')}</colgroup><thead><tr>${runColumns.map(([, label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead>`;

function runsSkeleton() {
  const row = '<tr><td><span class="skeleton pill"></span></td><td><span class="skeleton runs-skeleton-title"></span><span class="skeleton runs-skeleton-meta"></span></td><td><span class="skeleton runs-skeleton-short"></span></td><td><span class="skeleton runs-skeleton-short"></span><span class="skeleton runs-skeleton-bar"></span></td><td><span class="skeleton runs-skeleton-short"></span></td></tr>';
  const card = '<li class="runs-card"><span class="skeleton pill"></span><span class="skeleton runs-skeleton-title"></span><span class="skeleton runs-skeleton-meta"></span><span class="skeleton runs-skeleton-short"></span><span class="skeleton runs-skeleton-bar"></span></li>';
  return `<div class="card flush runs-list" aria-busy="true"><span class="sr-only">Loading…</span><div class="table-wrap runs-table" aria-hidden="true"><table class="table runs-skeleton">${runHead}<tbody>${row.repeat(6)}</tbody></table></div><ul class="runs-cards" aria-hidden="true">${card.repeat(4)}</ul></div>`;
}

/**
 * Runs: Team, state and outcome filters, then the Runs with running work first. A dense table with a sticky
 * header on wide screens and a card list on narrow ones; both show every field.
 */
export function runsMarkup(view, teams, helpers, now = Date.now()) {
  const { escape, icon } = helpers;
  const filter = view.filter || {};
  const outcomeOff = ['pending', 'running'].includes(filter.state);
  const toolbar = `<div class="toolbar feeds-toolbar runs-toolbar">${teamField('ploeg-runs-team', teams, filter.team, escape)}${selectField('ploeg-runs-state', 'State', runStateOptions, filter.state, 'All states')}${selectField('ploeg-runs-outcome', 'Outcome', runOutcomeOptions.map(value => [value, runOutcome(value).label]), filter.outcome, 'All outcomes', { disabled: outcomeOff, hint: 'Only finished Runs have an outcome.' })}</div>`;
  if (!view.runs && view.error) return page('runs', toolbar, problemMarkup(view.error, 'Runs', helpers));
  if (!view.runs) return page('runs', toolbar, runsSkeleton());
  const filtered = Boolean(filter.team || filter.state || filter.outcome);
  const stale = view.error ? staleNotice(view, helpers) : '';
  if (!view.runs.length) return page('runs', demoNote(view.demo), toolbar, stale, `<div class="card">${empty({ glyph: 'runs', title: filtered ? 'No Runs match these filters' : 'No Runs yet', body: `<p>${filtered ? 'Choose another Team, state or outcome.' : 'Runs appear here once a Team’s worker picks up a Work Item.'}</p>`, actions: filtered ? linkButton('Clear filters', '#runs', helpers, 'x') : '' }, helpers)}</div>`);
  const runs = sortRuns(view.runs);
  const active = runs.filter(run => run.state !== 'finished');
  const done = runs.filter(run => run.state === 'finished');
  const grouped = Boolean(active.length && done.length);
  const group = (label, list) => list.length ? `<tbody>${grouped ? `<tr class="runs-group"><th scope="rowgroup" colspan="${runColumns.length}">${escape(label)} <span class="count">${count(list.length)}</span></th></tr>` : ''}${list.map(run => runRow(run, view.demo, helpers, now)).join('')}</tbody>` : '';
  const table = `<div class="table-wrap runs-table"><table class="table"><caption class="sr-only">Runs, running first, then newest first</caption>${runHead}${group('Running and waiting', active)}${group('Finished', done)}</table></div>`;
  const cardGroup = (label, total) => grouped ? `<li class="runs-cards-group">${escape(label)} <span class="count">${count(total)}</span></li>` : '';
  const cards = `<ul class="runs-cards" aria-label="Runs, running first">${cardGroup('Running and waiting', active.length)}${active.map(run => runCard(run, view.demo, helpers, now)).join('')}${cardGroup('Finished', done.length)}${done.map(run => runCard(run, view.demo, helpers, now)).join('')}</ul>`;
  const busy = view.mode === 'older';
  const older = view.nextBefore ? `<button type="button" class="button secondary" id="ploeg-runs-older" data-action="ploeg-runs-older"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('chevron-down')}<span class="button-label">Load older</span></button>` : '<span class="meta">No older Runs.</span>';
  return page('runs', demoNote(view.demo), toolbar, stale, `<div class="card flush runs-list">${table}${cards}<footer class="runs-footer">${older}<span class="meta">${plural(view.runs.length, 'Run')} loaded</span></footer></div>`);
}

function briefMarkup(text) {
  const brief = String(text || '').trim();
  if (!brief) return '<p class="subtle proposal-brief-empty">No brief reported.</p>';
  const paragraphs = brief.split(/\n\s*\n/);
  if (brief.length <= 480 || paragraphs.length < 2) return `<div class="prose proposal-brief">${markdown(brief)}</div>`;
  return `<div class="prose proposal-brief">${markdown(paragraphs[0])}</div>${ui.disclosure({ summary: 'Read the full brief', body: `<div class="prose">${markdown(paragraphs.slice(1).join('\n\n'))}</div>`, plain: true })}`;
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
  const buttons = decide ? `<div class="proposal-actions"><button type="button" class="button secondary" id="proposal-reject-${id}" data-action="ploeg-reject" data-id="${id}"${busy ? ' disabled' : ''}>${icon('x')}<span class="button-label">Reject</span></button><button type="button" class="button primary" id="proposal-approve-${id}" data-action="ploeg-approve" data-id="${id}"${busy ? ' disabled' : ''}${pending ? ' aria-busy="true"' : ''}>${pending ? '<span class="spinner" aria-hidden="true"></span>' : icon('check')}<span class="button-label">Approve</span></button></div>` : '';
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
  const header = `<div class="proposals-header"><p class="proposals-count">${plural(view.items.length, 'proposal')}${view.truncated ? ' shown; Ploeg has more' : ''}</p><p class="meta proposals-budget">${icon('coins')}<span>Ploeg does not report Team budgets to Vloer yet, so no amounts are shown.</span></p></div>`;
  const list = `<ul class="proposals">${view.items.map(entry => proposalCard(entry, { decide, busy: view.busy }, helpers, now)).join('')}</ul>`;
  return page('proposed', demoNote(view.demo), stale, viewer, `<section class="proposals-list" aria-label="Proposals">${header}${list}</section>`);
}

function dialogHeader(title, { icon }) {
  return `<header class="dialog-header"><h2 id="confirm-title">${title}</h2><button type="button" class="button ghost icon-only sm" data-action="ploeg-dialog-close" aria-label="Close" title="Close">${icon('x')}</button></header>`;
}

/** The approval confirmation: what approving queues, whose budget it spends and where it runs. Confirming closes with `confirm`. */
export function approveDialogMarkup(entry, demo, helpers) {
  const { escape, icon } = helpers;
  const facts = ui.dl([['Queued for', `The ${escape(entry.team)} Team`], ['Money at stake', `Its Runs spend from the ${escape(entry.team)} Team’s budget. Ploeg does not report that budget to Vloer yet, so Vloer cannot show the amount.`], ['Repository', repositoryMarkup(entry, escape, { explain: true })], ...(entry.ready === false ? [['Readiness', 'Needs refinement. It may wait in the queue until someone refines it.']] : [])], { rows: true });
  const demoLine = demo ? ui.callout({ tone: 'neutral', icon: 'info', body: '<p>Demo: approving changes only this demo’s sample data. Nothing is dispatched and nothing is spent.</p>' }) : '';
  return `<form method="dialog" class="proposal-dialog">${dialogHeader('Approve this proposal?', helpers)}<div class="dialog-body"><p class="proposal-dialog-title">${escape(entry.title || `Work Item ${entry.id}`)}</p><p>Ploeg queues it for its Team. A worker picks it up and its Runs start spending.</p>${facts}${demoLine}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="cancel" autofocus>Keep it proposed</button><button type="submit" class="button primary" value="confirm">${icon('check')}<span class="button-label">Approve and queue</span></button></footer></form>`;
}

/** The rejection form: a required reason, and what rejecting does (live: Done without running; demo: withdrawn from the sample data). */
export function rejectDialogMarkup(entry, demo, helpers) {
  const { escape } = helpers;
  const effect = demo ? 'In this demo the proposal is withdrawn from the sample data. Nothing is dispatched.' : 'Ploeg marks it Done without running it and keeps your reason in its history. The Work Item it came from does not change.';
  return `<form data-form="ploeg-reject" data-id="${escape(entry.id)}" class="proposal-dialog" novalidate>${dialogHeader('Reject this proposal?', helpers)}<div class="dialog-body"><p class="proposal-dialog-title">${escape(entry.title || `Work Item ${entry.id}`)}</p><p>${effect}</p><div class="field"><label class="field-label" for="proposal-reject-reason">Reason</label><textarea id="proposal-reject-reason" name="reason" rows="3" maxlength="4096" required autofocus aria-describedby="proposal-reject-hint"></textarea><span class="field-hint" id="proposal-reject-hint">Required. Say why, so the Team can learn from it.</span><span class="field-error" id="proposal-reject-error" hidden>Write a reason before you reject it.</span></div></div><footer class="dialog-footer"><button type="button" class="button secondary" data-action="ploeg-dialog-close">Keep it proposed</button><button type="submit" class="button danger">Reject</button></footer></form>`;
}
