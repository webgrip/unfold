import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { dateTime, namedDate, plural, relativeWords, time } from './core/format.js';
import { auditEvent } from './core/states.js';
import * as ui from './core/ui.js';

const id = '[^/]+';
const phrases = [
  ['POST', `ploeg/work-items/${id}/approve`, 'approved'],
  ['POST', `ploeg/work-items/${id}/reject`, 'rejected'],
  ['POST', `ploeg/work-items/${id}/cancel`, 'stopped'],
  ['POST', `ploeg/work-items/${id}/retry`, 'retried'],
  ['POST', `ploeg/work-items/${id}/notes`, 'left a note for the next Run'],
  ['POST', `ploeg/work-items/${id}/context`, 'added a context file'],
  ['POST', `ploeg/work-items/${id}/asks`, 'asked a question'],
  ['POST', `ploeg/work-items/${id}/cracks`, 'proposed the cause of a bug'],
  ['POST', `ploeg/work-items/${id}/evolved`, 'marked the requirement as changed'],
  ['POST', `ploeg/work-items/${id}/cracks/${id}/confirm`, 'confirmed the cause of a bug'],
  ['POST', `ploeg/work-items/${id}/cracks/${id}/dispute`, 'disputed the cause of a bug'],
  ['POST', `ploeg/work-items/${id}/cracks/${id}/resolve`, 'decided a disputed cause as referee'],
  ['POST', `task-sources/${id}/tasks/${id}/handoff`, 'handed to a Team'],
  ['DELETE', `task-sources/${id}/tasks/${id}/handoff`, 'took back from a Team'],
  ['POST', 'task-imports', 'imported a task'],
  ['POST', 'sessions', 'started a session'],
  ['POST', `sessions/${id}/start`, 'started the team'],
  ['POST', `sessions/${id}/messages`, 'sent a message'],
  ['POST', `sessions/${id}/pause`, 'paused'],
  ['POST', `sessions/${id}/resume`, 'resumed'],
  ['POST', `sessions/${id}/cancel`, 'stopped'],
  ['POST', `sessions/${id}/retry`, 'retried'],
  ['POST', `sessions/${id}/run-again`, 'ran it again'],
  ['POST', `sessions/${id}/review`, 'recorded a review'],
  ['POST', `sessions/${id}/deliver`, 'delivered the change'],
  ['POST', `sessions/${id}/capture`, 'captured the changes'],
  ['POST', `sessions/${id}/close-work-item`, 'closed the Work Item'],
  ['POST', `sessions/${id}/supervision`, 'changed the supervision'],
  ['POST', `sessions/${id}/approval`, 'changed the approval rule'],
  ['POST', `sessions/${id}/budget`, 'changed the budget'],
  ['POST', `sessions/${id}/delivery/verify`, 'verified the delivery'],
  ['POST', `sessions/${id}/delivery/approve`, 'approved the delivery'],
  ['POST', `sessions/${id}/delivery/publish`, 'opened the pull request'],
  ['POST', 'status/notes', 'added a status note'],
  ['POST', `status/notes/${id}/resolve`, 'resolved a status note'],
  ['POST', 'reports', 'reported a problem'],
  ['POST', `reports/${id}/replies`, 'replied to a report'],
  ['PUT', `flags/${id}`, 'changed a feature flag'],
].map(([method, path, phrase]) => ({ method, pattern: new RegExp(`^/api/${path}$`), phrase }));

/** The outcomes an Action Record can have, with how the page names them. */
export const outcomes = Object.freeze({
  done: Object.freeze({ label: 'Done', tone: 'success', glyph: 'check-circle' }),
  refused: Object.freeze({ label: 'Refused', tone: 'attention', glyph: 'circle-slash' }),
  failed: Object.freeze({ label: 'Failed', tone: 'danger', glyph: 'x-circle' }),
});

/**
 * What an action did in a few plain words, from its route template (`POST /api/ploeg/work-items/:id/approve` reads
 * "approved"). An unknown route reads as the method and route themselves.
 * @param {string} action
 * @returns {string}
 */
export function actionPhrase(action) {
  const text = String(action ?? '').trim();
  const [method, ...rest] = text.split(' ');
  const path = rest.join(' ');
  const known = phrases.find(entry => entry.method === method && entry.pattern.test(path));
  return known ? known.phrase : text || 'an unnamed action';
}

const capital = text => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * One Action Record as a row of the activity lists: who did what, through which channel, with which confirmation
 * and outcome. `source` is `unfold`.
 * @param {object} record An Action Record from `GET /api/actions`.
 */
export function recordRow(record) {
  return {
    source: 'unfold',
    id: `unfold-${record.id}`,
    recordId: record.id,
    at: record.at,
    person: record.userName || record.userId || 'Someone',
    userId: record.userId ?? '',
    role: record.role ?? '',
    what: actionPhrase(record.action),
    action: record.action ?? '',
    channel: record.channel || 'unknown',
    confirmation: record.confirmation ?? null,
    status: Number.isInteger(record.status) ? record.status : null,
    outcome: outcomes[record.outcome] ? record.outcome : 'failed',
    target: record.target ?? null,
    inputs: record.inputs ?? {},
  };
}

/**
 * The Ploeg audit events that name the person who caused them (`detail.attribution`, Ploeg ADR-0108) as rows from
 * the engine. Events without an attribution are left out; Ploeg's own Activity card lists every event.
 * @param {object[]} events Ploeg audit events of one Work Item.
 * @param {string} workItemId
 */
export function engineRows(events, workItemId) {
  return (events || []).flatMap(entry => {
    const attribution = entry?.detail?.attribution;
    if (!attribution || typeof attribution !== 'object') return [];
    const person = String(attribution.actingUser || attribution.actor || entry.actor || '').trim() || 'Someone';
    return [{
      source: 'engine',
      id: `engine-${entry.id}`,
      recordId: entry.id,
      at: entry.at,
      person,
      userId: '',
      role: '',
      what: auditEvent(entry).label.replace(/^./, letter => letter.toLowerCase()),
      action: entry.action ?? '',
      channel: String(attribution.via || attribution.consumer || 'Ploeg'),
      confirmation: attribution.confirmation ?? null,
      status: null,
      outcome: 'done',
      target: { kind: 'work-item', id: String(workItemId ?? entry.workItemId ?? '') },
      inputs: {},
    }];
  });
}

/** Rows newest first; rows at the same moment keep Unfold's record before the engine's event it caused. */
export function newestFirst(rows) {
  return [...rows].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || (a.source === b.source ? 0 : a.source === 'unfold' ? -1 : 1));
}

/** How a row's confirmation reads: the confirmation id the person agreed to, a browser button, or none. */
export function confirmationText(row) {
  if (row.confirmation) return `Confirmed · ${String(row.confirmation).split(':')[0]}`;
  if (row.channel === 'browser') return 'Browser button';
  return 'No confirmation';
}

/** How a row's outcome reads, with the HTTP status for Unfold's records: "Done · 200", "Refused · 409". */
export function outcomeText(row) {
  const meta = outcomes[row.outcome] || outcomes.failed;
  return row.status ? `${meta.label} · ${row.status}` : meta.label;
}

/** The page a row's target opens: a Work Item, a session or the Tasks page; null when it has no target. */
export function targetLink(target) {
  if (!target?.id) return null;
  if (target.kind === 'work-item') return { href: `#work/${encodeURIComponent(target.id)}`, label: `Work Item #${target.id}` };
  if (target.kind === 'session') return { href: `#session/${encodeURIComponent(target.id)}`, label: `Session ${target.id.slice(0, 8)}` };
  if (target.kind === 'task') return { href: '#tasks', label: `Task ${target.id}` };
  return null;
}

function whenCell(at, now) {
  const words = relativeWords(at, now);
  return `<time class="num" datetime="${escape(at)}" title="${escape(dateTime(at))}">${escape(`${namedDate(at)} ${time(at)}`)}</time>${words ? `<span class="action-log-sub">${escape(words)}</span>` : ''}`;
}

function whoCell(row, userId) {
  const you = row.userId && userId && row.userId === userId;
  return `${escape(row.person)}${you ? ' <span class="subtle">(you)</span>' : ''}`;
}

function whatCell(row) {
  const engine = row.source === 'engine' ? ` ${ui.badge({ tone: 'neutral', glyph: 'layers', label: 'From Ploeg', title: 'Recorded by the engine, Ploeg' })}` : '';
  return `<span class="action-log-what">${escape(capital(row.what))}</span>${engine}${row.what === row.action ? '' : `<span class="action-log-sub mono">${escape(row.action)}</span>`}`;
}

function confirmationCell(row) {
  const confirmed = Boolean(row.confirmation);
  return `<span class="action-log-confirmation"${confirmed ? ` title="${escape(row.confirmation)}"` : ''}>${icon(confirmed ? 'shield' : row.channel === 'browser' ? 'monitor' : 'circle-slash')}<span>${escape(confirmationText(row))}</span></span>`;
}

function outcomeCell(row) {
  const meta = outcomes[row.outcome] || outcomes.failed;
  return ui.badge({ tone: meta.tone, glyph: meta.glyph, label: outcomeText(row) });
}

function onCell(row) {
  const link = targetLink(row.target);
  return link ? `<a class="action-log-target" href="${escape(link.href)}">${escape(link.label)}</a>` : '<span class="subtle">—</span>';
}

/**
 * The table of activity rows: when, who, what, through which channel, whether confirmed and the outcome, and with
 * `withTarget` the Work Item or session each row was about, as a link.
 * @param {object[]} rows Rows from `recordRow` and `engineRows`.
 * @param {{ caption: string, now?: number, userId?: string, withTarget?: boolean, empty?: string }} options
 */
export function actionTable(rows, { caption, now = Date.now(), userId, withTarget = false, empty } = {}) {
  const columns = [
    { key: 'when', label: 'When' },
    { key: 'who', label: 'Who' },
    { key: 'what', label: 'What' },
    ...(withTarget ? [{ key: 'on', label: 'On' }] : []),
    { key: 'channel', label: 'Channel' },
    { key: 'confirmation', label: 'Confirmation' },
    { key: 'outcome', label: 'Outcome' },
  ];
  return ui.table({
    caption,
    columns,
    className: 'action-log-table',
    empty,
    rows: rows.map(row => ({ when: whenCell(row.at, now), who: whoCell(row, userId), what: whatCell(row), on: onCell(row), channel: `<span class="action-log-channel">${escape(row.channel)}</span>`, confirmation: confirmationCell(row), outcome: outcomeCell(row) })),
  });
}

/** The line that says whose actions a person sees: their own, or everyone's for an administrator. */
export function visibilityHint({ admin, engine = false } = {}) {
  const own = admin ? 'As an administrator you see everyone’s actions.' : 'You see only your own actions here; an administrator sees everyone’s.';
  return engine ? `${own} Events from Ploeg name the person Ploeg recorded and show to everyone who can read this Work Item.` : own;
}

const exportFields = ['at', 'source', 'person', 'userId', 'role', 'what', 'action', 'targetKind', 'targetId', 'channel', 'confirmation', 'status', 'outcome', 'inputs'];

function exportRecord(row) {
  return { at: row.at, source: row.source, person: row.person, userId: row.userId, role: row.role, what: row.what, action: row.action, targetKind: row.target?.kind ?? '', targetId: row.target?.id ?? '', channel: row.channel, confirmation: row.confirmation ?? '', status: row.status ?? '', outcome: row.outcome, inputs: row.inputs ?? {} };
}

function csvCell(value) {
  let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * The rows as CSV, one line per row with a header line, the recorded (already redacted) inputs as JSON in the last
 * column. A cell that a spreadsheet would read as a formula is prefixed with `'`.
 * @param {object[]} rows
 * @returns {string}
 */
export function actionsCsv(rows) {
  return `${[exportFields.join(','), ...rows.map(row => { const record = exportRecord(row); return exportFields.map(field => csvCell(record[field])).join(','); })].join('\r\n')}\r\n`;
}

/**
 * The rows as JSON, `{ exportedAt, scope, actions }`, with the recorded (already redacted) inputs as they were stored.
 * @param {object[]} rows
 * @param {{ scope?: string, exportedAt?: string }} [options]
 * @returns {string}
 */
export function actionsJson(rows, { scope = '', exportedAt = new Date().toISOString() } = {}) {
  return `${JSON.stringify({ exportedAt, scope, actions: rows.map(exportRecord) }, null, 2)}\n`;
}

/** The CSV and JSON download buttons for the action `action`; none while nothing is listed (`shown: false`). */
export function exportButtons({ action, shown = true } = {}) {
  if (!shown) return '';
  return `<div class="action-log-export" role="group" aria-label="Download what is listed">${['csv', 'json'].map(format => ui.button({ label: format.toUpperCase(), icon: 'download', variant: 'secondary', size: 'sm', action, data: { format }, ariaLabel: `Download what is listed as ${format.toUpperCase()}` })).join('')}</div>`;
}

/**
 * The Work Item page's "Who did what" card. `model.actions` is `{ records, nextBefore, error }` or null while loading;
 * `detail.events` adds Ploeg's attributed events, marked as from the engine.
 */
export function workActionsMarkup(detail, model) {
  const loaded = model.actions;
  const rows = newestFirst([...(loaded?.records || []).map(recordRow), ...engineRows(detail.events, detail.item.id)]);
  const admin = model.userRole === 'admin';
  const hint = `<p class="meta action-log-hint">${escape(visibilityHint({ admin, engine: true }))}</p>`;
  const demo = model.demoMode ? ui.demoNote('Demo workbench · only what was done here, nothing invented, no model calls, no spend') : '';
  let body;
  if (!loaded) body = `<div aria-busy="true">${ui.skeleton({ rows: 2, variant: 'table' })}</div>`;
  else if (loaded.error && !rows.length) body = ui.emptyState({ icon: 'x-circle', tone: 'danger', compact: true, title: 'Could not load who did what', body: `<p role="alert">${escape(loaded.error)}</p>`, actions: ui.button({ label: 'Try again', action: 'work-actions-retry', data: { id: detail.item.id } }) });
  else if (!rows.length) body = ui.emptyState({ icon: 'user', compact: true, title: admin ? 'Nobody has acted on this Work Item yet' : 'You have not acted on this Work Item yet', body: `<p>${escape('Approving, rejecting, stopping, asking or adding context here, or through an editor or MCP client, shows up in this list.')}</p>` });
  else {
    const partial = loaded.error ? `<p class="meta" role="alert">${icon('alert')} ${escape(`Unfold’s records could not be read: ${loaded.error}`)}</p>` : '';
    const more = loaded.nextBefore ? `<p class="meta">${escape(`Showing the latest ${plural(loaded.records.length, 'action')} from Unfold.`)} <a href="#activity/actions">${escape('See them all on Activity')}</a></p>` : '';
    body = `${partial}${actionTable(rows, { caption: 'Who did what on this Work Item', now: model.now, userId: model.userId })}${more}`;
  }
  const actions = exportButtons({ action: 'work-actions-export', shown: rows.length > 0 });
  return `<section class="card" id="work-actions" aria-labelledby="work-actions-title"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-actions-title">Who did what${ui.count(rows.length || null)}</h3><p class="card-subtitle">${escape('Every action a person took on this Work Item, newest first, with its channel, confirmation and outcome')}</p></div>${actions ? `<div class="card-actions">${actions}</div>` : ''}</header><div class="card-body action-log-body">${demo}${hint}${body}</div></section>`;
}

/** The two Activity pages as one switch: Ploeg's events and who did what. */
export function activitySwitch(current) {
  return `<nav class="action-log-switch" aria-label="Activity">${ui.segmented({ label: 'Activity', items: [{ id: 'events', label: 'Ploeg events', href: '#activity', selected: current === 'events' }, { id: 'actions', label: 'Who did what', href: '#activity/actions', selected: current === 'actions' }] })}</nav>`;
}

/**
 * The per-person Activity page: a toolbar (person for administrators, outcome, channel, downloads), the visibility
 * hint, and the rows with their Work Item or session. `page` is the page state of `views/actions.js`.
 */
export function actionsPageMarkup(page, { admin, userId, demo, now = Date.now() }) {
  const field = (fieldId, label, options) => `<div class="field inline feeds-field"><label class="field-label" for="${fieldId}">${label}</label><select id="${fieldId}">${options}</select></div>`;
  const option = (value, label, selected) => `<option value="${escape(value)}"${selected ? ' selected' : ''}>${escape(label)}</option>`;
  const people = admin ? field('actions-person', 'Person', `${option('all', 'Everyone', page.person === 'all')}${uniquePeople(page.facets?.people, userId, page.person).map(person => option(person.userId, person.userId === userId ? (person.userName ? `${person.userName} (you)` : 'You') : person.userName, page.person === person.userId)).join('')}`) : '';
  const outcome = field('actions-outcome', 'Outcome', `${option('', 'Any outcome', !page.outcome)}${Object.entries(outcomes).map(([value, meta]) => option(value, meta.label, page.outcome === value)).join('')}`);
  const channels = [...new Set([...(page.facets?.channels || []).map(entry => entry.channel), ...(page.channel ? [page.channel] : [])])];
  const channel = field('actions-channel', 'Channel', `${option('', 'Any channel', !page.channel)}${channels.map(value => option(value, value, page.channel === value)).join('')}`);
  const rows = (page.records || []).map(recordRow);
  const toolbar = `<div class="toolbar feeds-toolbar">${people}${outcome}${channel}${exportButtons({ action: 'actions-export', shown: rows.length > 0 })}</div>`;
  const hint = `<p class="meta action-log-hint">${escape(visibilityHint({ admin }))}</p>`;
  const note = demo ? ui.demoNote('Demo workbench · only what was done here, nothing invented, no model calls, no spend') : '';
  let body;
  if (page.records === null && page.error) body = `<div class="card">${ui.emptyState({ icon: 'x-circle', tone: 'danger', title: 'Could not load who did what', body: `<p role="alert">${escape(page.error)}</p>`, actions: ui.button({ label: 'Try again', action: 'actions-retry' }) })}</div>`;
  else if (page.records === null) body = `<div class="card" aria-busy="true">${ui.skeleton({ rows: 4, variant: 'table' })}</div>`;
  else if (!rows.length) body = `<div class="card">${ui.emptyState({ icon: 'user', title: page.outcome || page.channel ? 'No actions match these filters' : admin && page.person === 'all' ? 'Nobody has acted yet' : 'No actions yet', body: `<p>${escape(page.outcome || page.channel ? 'Choose Any outcome and Any channel to see every action.' : 'Approving, rejecting, stopping, asking, handing a task to a Team or steering a session, in the browser or through an editor or MCP client, shows up here.')}</p>` })}</div>`;
  else {
    const failed = page.error ? `<p class="meta" role="alert">${icon('alert')} ${escape(page.error)}</p>` : '';
    const older = page.nextBefore ? ui.button({ label: page.loadingOlder ? 'Loading…' : 'Load older', action: 'actions-older', busy: page.loadingOlder, disabled: page.loadingOlder }) : `<p class="meta">${escape('No older actions.')}</p>`;
    body = `<div class="card flush">${actionTable(rows, { caption: 'Who did what', now, userId, withTarget: true })}</div>${failed}<div class="action-log-more">${older}</div>`;
  }
  return `${activitySwitch('actions')}${note}${toolbar}${hint}<div id="actions-list" tabindex="-1">${body}</div>`;
}

function uniquePeople(people = [], userId, chosen) {
  const list = [...people];
  if (userId && !list.some(person => person.userId === userId)) list.unshift({ userId, userName: '', count: 0 });
  if (chosen && chosen !== 'all' && !list.some(person => person.userId === chosen)) list.push({ userId: chosen, userName: chosen, count: 0 });
  return list;
}
