import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify, announce } from '../core/dom.js';
import { plural, time } from '../core/format.js';
import { icon } from '../core/icons.js';
import { badge, button, callout, disclosure, dl, emptyState, table, timeAgo } from '../core/ui.js';
import { shell } from '../shell.js';
import { live } from '../core/live.js';
import { parseHash } from '../core/route.js';
import { applyStatusReport } from '../core/status-signal.js';
import { workspacePhaseLabel, workspacePhaseProblem } from '../core/states.js';

const waitingShown = 5;
const linksShown = 3;
const steps = [
  { id: 'ploeg', name: 'Ploeg authorizes the work' },
  { id: 'gateway', name: 'The gateway issues the budget' },
  { id: 'workspaces', name: 'A machine starts the workspace' },
  { id: 'team', name: 'The team works' },
];
const stateWords = { ok: 'Working', degraded: 'Unreliable', down: 'Stopped here', idle: 'Not proven recently', not_used: 'Not used here', ready: 'Ready', unproven: 'Not proven', unreached: 'Not reached' };
const noteLooks = { info: { tone: 'info', label: 'Information' }, degraded: { tone: 'attention', label: 'Work starts, but not reliably' }, outage: { tone: 'danger', label: 'New work cannot start' } };

let report = null;
let failure = '';
let failedAt = '';
let previous = new Map();
let changed = new Set();
let returnSession = null;

const isAdmin = () => state.bootstrap?.user?.role === 'admin';
const panel = ({ id, title, total, subtitle, list }) => `<section class="card settings-card" aria-labelledby="${id}-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="${id}-title">${escape(title)}${total ? ` <span class="count">${total}</span>` : ''}</h2><p class="card-subtitle">${escape(subtitle)}</p></div></header>${list}</section>`;

/**
 * The four steps a new session takes, in the engine's order, each with the state of the check behind it. The team
 * step has no check of its own: it is `unreached` when a step before it is down, `unproven` when the workspace step is
 * not proven recently, and `ready` otherwise.
 * @param {{ checks: { id: string, state: string, summary: string, checkedAt?: string, detail?: string }[] }} value
 * @returns {{ id: string, number: number, name: string, state: string, summary: string, checkedAt?: string, detail?: string }[]}
 */
export function startLine(value) {
  const checks = new Map(value.checks.map(check => [check.id, check]));
  const blocked = value.checks.find(check => check.state === 'down');
  const unproven = checks.get('workspaces')?.state === 'idle';
  return steps.map((step, index) => {
    const check = checks.get(step.id);
    if (check) return { ...step, number: index + 1, state: check.state, summary: check.summary, checkedAt: check.checkedAt, detail: check.detail };
    if (blocked) return { ...step, number: index + 1, state: 'unreached', summary: `Waits for step ${steps.findIndex(item => item.id === blocked.id) + 1}.` };
    return { ...step, number: index + 1, state: unproven ? 'unproven' : 'ready', summary: unproven ? 'Follows once step 3 is proven.' : 'Each Role starts as soon as its workspace is up.' };
  });
}

/**
 * The answer to "Can a new session start?": a short verdict, one sentence of reason, the tone, the step it stops at
 * and what to do next.
 * @param {{ overall: string, checks: object[], notes: { severity: string, resolvedAt?: string }[], startLimitSeconds?: number }} value
 * @returns {{ tone: string, verdict: string, reason: string, next: string, stop: number|null }}
 */
export function answer(value) {
  const line = startLine(value);
  const checked = line.filter(step => step.id !== 'team');
  const open = value.notes.filter(note => !note.resolvedAt);
  const retry = number => `Try again when step ${number} turns green. This page checks again every 30 seconds.`;
  if (checked.every(step => step.state === 'not_used')) return { tone: 'neutral', verdict: 'This is a demo.', reason: 'Sessions here run a local fixture: real Git and checks, no model calls and no spend.', next: '', stop: null };
  const down = line.find(step => step.state === 'down');
  if (down) {
    const wait = down.id === 'workspaces' && value.startLimitSeconds ? `A session you start now waits up to ${minutes(value.startLimitSeconds)} for a machine, then stops. The wait is not charged. ` : '';
    const told = open.length ? '' : ' No administrator has posted a note about it yet.';
    return { tone: 'danger', verdict: 'Not right now.', reason: `New sessions stop at step ${down.number}. ${down.summary} This is a problem on the workbench; there is nothing to change in your session.`, next: `${wait}${retry(down.number)}${told}`, stop: down.number };
  }
  if (open.some(note => note.severity === 'outage')) return { tone: 'danger', verdict: 'Not right now.', reason: 'An administrator reported an outage. Their note is right below.', next: '', stop: null };
  const shaky = line.find(step => step.state === 'degraded');
  if (shaky) return { tone: 'attention', verdict: 'Yes, but not reliably.', reason: `Step ${shaky.number}: ${shaky.summary}`, next: 'If your session fails to start, try again in a few minutes.', stop: null };
  const workspace = line.find(step => step.id === 'workspaces');
  const noted = open.some(note => note.severity === 'degraded');
  if (workspace.state === 'idle') return { tone: noted ? 'attention' : 'neutral', verdict: noted ? 'Probably, but expect problems.' : 'Probably.', reason: `The services answered, but no workspace started in the last 24 hours, so step 3 is not proven yet.${noted ? ' An administrator also reported a problem.' : ''}`, next: '', stop: null };
  if (noted) return { tone: 'attention', verdict: 'Yes, but expect problems.', reason: 'An administrator reported a problem. Their note is below.', next: '', stop: null };
  return { tone: 'success', verdict: 'Yes.', reason: `Nothing is in the way. ${workspace.state === 'ok' ? workspace.summary : ''}`.trim(), next: '', stop: null };
}

/**
 * Plain words for a workspace wait phase.
 * @param {string} phase
 * @returns {string}
 */
export { workspacePhaseLabel as phaseLabel };

function minutes(seconds) {
  return seconds < 90 ? plural(seconds, 'second') : plural(Math.round(seconds / 60), 'minute');
}

function stepMarkup(step) {
  const when = step.checkedAt && !['not_used', 'ready', 'unreached'].includes(step.state) ? ` · checked ${escape(time(step.checkedAt, { seconds: true }))}` : '';
  const moved = changed.has(step.id) ? ' · <strong>changed just now</strong>' : '';
  const detail = step.detail ? disclosure({ id: `status-detail-${step.id}`, plain: true, summary: step.id === 'workspaces' ? 'Scheduler message' : 'Details', body: `<pre data-private class="session-pre">${escape(step.detail)}</pre>` }) : '';
  return `<li class="status-step" data-state="${escape(step.state)}"${changed.has(step.id) ? ' data-changed' : ''}><span class="status-knot" aria-hidden="true">${step.number}</span><div class="status-step-text"><h3 class="status-step-name">${escape(step.name)}</h3><p class="status-step-state"><span class="status-step-word">${escape(stateWords[step.state] ?? step.state)}</span>${when}${moved}</p><p class="status-step-summary">${escape(step.summary)}</p>${detail}</div></li>`;
}

function answerMarkup() {
  const result = answer(report);
  const refresh = button({ label: 'Check again', icon: 'refresh', size: 'sm', action: 'status-refresh' });
  const verdict = failure ? 'Unknown.' : result.verdict;
  const reason = failure ? `Unfold could not check again at ${time(failedAt, { seconds: true })}: ${failure} The last check, at ${time(report.generatedAt, { seconds: true })}, said: ${result.verdict}` : result.reason;
  const open = report.notes.filter(note => !note.resolvedAt);
  const notes = open.length ? `<div class="status-notes" aria-label="Notes from administrators">${open.map(noteMarkup).join('')}</div>` : '';
  return `<section class="status-answer" data-tone="${failure ? 'neutral' : result.tone}"${failure ? ' data-stale' : ''} aria-labelledby="status-verdict"><p class="status-question">Can a new session start?</p><h2 class="status-verdict" id="status-verdict">${escape(verdict)}</h2><p class="status-reason">${escape(reason)}</p>${returnMarkup(result)}${notes}<ol class="status-line" aria-label="${failure ? 'The steps a new session takes, as last checked' : 'The steps a new session takes'}">${startLine(report).map(stepMarkup).join('')}</ol>${result.next && !failure ? `<p class="status-next">${escape(result.next)}</p>` : ''}<div class="status-checked"><span>Checked ${escape(time(report.generatedAt, { seconds: true }))}</span>${refresh}</div></section>`;
}

/**
 * The line that tells a person Ploeg records their actions as named by Unfold rather than proven by their sign-in, or
 * '' while their sign-in proves them or the workbench does not prove people to Ploeg.
 * @param {{ personProof?: { state: string, summary: string } }} value
 * @returns {string}
 */
export function proofMarkup(value) {
  const proof = value?.personProof;
  if (!proof || proof.state !== 'degraded') return '';
  return callout({ tone: 'attention', title: 'Ploeg cannot check that your actions are yours', body: `<p>${escape(proof.summary)}</p>` });
}

const residencyLooks = { ok: { tone: 'success', label: 'Within the policy' }, degraded: { tone: 'danger', label: 'Outside the policy' }, idle: { tone: 'neutral', label: 'Nothing to check' }, unchecked: { tone: 'neutral', label: 'No policy set' }, unknown: { tone: 'neutral', label: 'Unknown' }, not_used: { tone: 'neutral', label: 'Demo' } };
const windowNames = { '24h': 'Last 24 hours', '7d': 'Last 7 days' };

function tally(items, unreported) {
  const named = items.map(item => `${escape(item.name)} ${item.requests}${item.allowed === false ? ' <strong>outside</strong>' : ''}`);
  if (unreported) named.push(`<span class="subtle">${unreported} not reported</span>`);
  return named.length ? named.join(', ') : '<span class="subtle">None</span>';
}

function allowed(list, enforcedBy) {
  if (list) return list.map(escape).join(', ');
  return enforcedBy === 'gateway' ? 'Set in the gateway’s own policy' : 'Any: no policy is set';
}

/**
 * The "Where your data goes" section: the provider and region policy, what the gateway answered from in the last 24
 * hours and 7 days, each request outside the policy with its session, Run and Work Item where the reader may open
 * them, and where Unfold, Ploeg and the agent workspaces run. '' when the report carries no residency.
 * @param {{ residency?: { state: string, summary: string, policy: { providers: string[]|null, regions: string[]|null, enforcedBy: string }, windows: object[], outside: object[], outsideHidden: number, places: { id: string, title: string, where: string, region: string|null, detail?: string }[] } }} value
 * @returns {string}
 */
export function residencyMarkup(value) {
  const residency = value?.residency;
  if (!residency) return '';
  const look = residencyLooks[residency.state] ?? residencyLooks.unknown;
  const policy = dl([['Allowed providers', allowed(residency.policy.providers, residency.policy.enforcedBy)], ['Allowed regions', allowed(residency.policy.regions, residency.policy.enforcedBy)]], { rows: true });
  const observed = residency.windows.length ? table({
    caption: 'Providers and regions that answered',
    compact: true,
    rowHeader: true,
    region: false,
    columns: [{ key: 'window', label: 'Window' }, { key: 'requests', label: 'Requests', numeric: true }, { key: 'providers', label: 'Providers' }, { key: 'regions', label: 'Regions' }, { key: 'outside', label: 'Outside the policy', numeric: true }],
    rows: residency.windows.map(window => ({ window: escape(windowNames[window.id] ?? window.id), requests: String(window.requests), providers: tally(window.providers, window.unreported.provider), regions: tally(window.regions, window.unreported.region), outside: window.outside ? `<strong>${window.outside}</strong>` : '0' })),
  }) : '';
  const breach = item => {
    const links = [item.session ? `<a href="#session/${encodeURIComponent(item.session.id)}">${escape(item.session.title)}</a>` : '<span class="subtle">Another person’s session</span>', item.run ? `Run ${escape(item.run.roleName)}` : '', item.workItemId ? `<a href="#work/${encodeURIComponent(item.workItemId)}">Work Item #${escape(item.workItemId)}</a>` : ''].filter(Boolean).map(link => `<li>${link}</li>`).join('');
    return `<li class="settings-item"><span class="settings-item-icon" aria-hidden="true">${icon('alert')}</span><div class="settings-item-main"><p class="settings-item-title">${escape(item.model)} answered by ${escape(item.reason)}</p><p class="settings-item-text">${timeAgo(item.at)}</p><ul class="status-sessions">${links}</ul></div></li>`;
  };
  const outside = residency.outside.length ? `<ul class="settings-items" aria-label="Requests outside the policy">${residency.outside.map(breach).join('')}${residency.outsideHidden ? `<li class="settings-item"><div class="settings-item-main"><p class="settings-item-text">${escape(plural(residency.outsideHidden, 'older request'))} outside the policy not listed</p></div></li>` : ''}</ul>` : '';
  const unknownRegion = residency.places.find(place => place.region === null && place.detail)?.detail;
  const places = table({
    caption: 'Where each part runs',
    compact: true,
    rowHeader: true,
    region: false,
    columns: [{ key: 'part', label: 'Part' }, { key: 'where', label: 'Runs on' }, { key: 'region', label: 'Region' }],
    rows: residency.places.map(place => ({ part: escape(place.title), where: escape(place.where), region: place.region ? escape(place.region) : '<span class="subtle">Unknown</span>' })),
  });
  const body = `<div class="card-body status-residency">${policy}${observed}${outside}${places}${unknownRegion ? `<p class="field-hint">${escape(unknownRegion)}</p>` : ''}</div>`;
  return `<section class="card settings-card" data-state="${escape(residency.state)}" aria-labelledby="status-residency-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="status-residency-title">Where your data goes ${badge({ tone: look.tone, label: look.label, size: 'sm' })}</h2><p class="card-subtitle">${escape(residency.summary)}</p></div></header>${body}</section>`;
}

function noteMarkup(note) {
  const look = noteLooks[note.severity] ?? noteLooks.info;
  const resolve = isAdmin() && !note.resolvedAt ? button({ label: 'Mark resolved', icon: 'check', size: 'sm', action: 'status-note-resolve', data: { id: note.id } }) : '';
  const meta = `<p class="status-note-meta">${escape(note.author)} · ${timeAgo(note.createdAt)}${note.resolvedAt ? ` · resolved ${timeAgo(note.resolvedAt)}` : ''}</p>`;
  return callout({ tone: note.resolvedAt ? 'neutral' : look.tone, title: note.resolvedAt ? `Resolved: ${look.label}` : `${look.label}: a note from an administrator`, body: `<p>${escape(note.text)}</p>${meta}`, actions: resolve });
}

function noteToolsMarkup() {
  const resolved = report.notes.filter(note => note.resolvedAt);
  const history = resolved.length ? disclosure({ id: 'status-resolved', summary: `Resolved in the last 7 days (${resolved.length})`, body: `<div class="status-notes">${resolved.map(noteMarkup).join('')}</div>` }) : '';
  const form = isAdmin() ? disclosure({ id: 'status-note-form', summary: 'Post a note for everyone', body: `<form class="status-note-form" data-form="status-note" novalidate><div class="field"><label class="field-label" for="status-note-severity">Severity</label><select id="status-note-severity" name="severity"><option value="info">Information: nothing is broken</option><option value="degraded">Degraded: work starts, but not reliably</option><option value="outage">Outage: new work cannot start</option></select><p class="field-hint">Outage and Degraded change the answer at the top for everyone until you mark the note resolved.</p></div><div class="field"><label class="field-label" for="status-note-text">Note</label><textarea id="status-note-text" name="text" rows="3" maxlength="500" required aria-describedby="status-note-text-hint"></textarea><p class="field-hint" id="status-note-text-hint">Say what is affected and when you expect it fixed. Up to 500 characters.</p></div><div>${button({ label: 'Post note', icon: 'send', variant: 'primary', type: 'submit' })}</div></form>` }) : '';
  return form || history ? `<section class="status-tools" aria-label="Notes">${form}${history}</section>` : '';
}

function waitingMarkup() {
  const named = report.waiting.filter(wait => wait.sessionId);
  const others = report.waiting.filter(wait => !wait.sessionId);
  const shown = named.slice(0, waitingShown);
  const row = (glyph, title, text, extra = '') => `<li class="settings-item"><span class="settings-item-icon" aria-hidden="true">${icon(glyph)}</span><div class="settings-item-main"><p class="settings-item-title">${title}</p><p class="settings-item-text">${text}</p>${extra}</div></li>`;
  const rows = [
    ...shown.map(wait => row(workspacePhaseProblem(wait.phase) ? 'alert' : 'clock', `<a href="#session/${encodeURIComponent(wait.sessionId)}">${escape(wait.title || 'Untitled session')}</a>`, `${escape(phaseLabel(wait.phase))} · since ${timeAgo(wait.since)}`, wait.reason && wait.reason !== report.checks.find(check => check.id === 'workspaces')?.detail ? disclosure({ id: `status-wait-${wait.sessionId}`, plain: true, summary: 'Scheduler message', body: `<pre data-private class="session-pre">${escape(wait.reason)}</pre>` }) : '')),
    named.length > shown.length ? row('more', escape(plural(named.length - shown.length, 'more session')), 'Open Sessions to see them all.') : '',
    others.length ? row('user', escape(plural(others.length, 'other person’s session', 'other people’s sessions')), `Waiting since ${timeAgo(others.map(wait => wait.since).sort()[0])}`) : '',
  ].join('');
  const list = rows ? `<ul class="settings-items">${rows}</ul>` : `<div class="card-body">${emptyState({ icon: 'check-circle', title: 'Nothing is waiting', body: 'Every session that asked for a workspace has one.', compact: true })}</div>`;
  return panel({ id: 'status-waiting', title: 'Waiting for a workspace', total: report.waiting.length, subtitle: 'Sessions still getting a workspace. The wait is not charged.', list });
}

function failuresMarkup() {
  const { causes, total } = report.failures;
  const rows = causes.map(cause => {
    const more = cause.sessions.length - linksShown;
    const sessions = cause.sessions.length ? `<ul class="status-sessions">${cause.sessions.slice(0, linksShown).map(session => `<li><a href="#session/${encodeURIComponent(session.id)}">${escape(session.title)}</a></li>`).join('')}${more > 0 ? `<li class="subtle">and ${more} more</li>` : ''}</ul>` : '';
    return `<li class="settings-item"><span class="status-count num" aria-hidden="true">${cause.count}</span><div class="settings-item-main"><p class="settings-item-title">${escape(cause.message)}</p><p class="settings-item-text">${escape(plural(cause.count, 'session'))} · last ${timeAgo(cause.lastAt)}</p>${sessions}</div></li>`;
  }).join('');
  const list = rows ? `<ul class="settings-items">${rows}</ul>` : `<div class="card-body">${emptyState({ icon: 'check-circle', title: 'No failures', body: 'No session failed in the last 24 hours.', compact: true })}</div>`;
  return panel({ id: 'status-failures', title: 'Failed in the last 24 hours', total, subtitle: isAdmin() ? 'Grouped by cause, most frequent first. Cancelled sessions and review decisions are left out.' : 'Grouped by cause, most frequent first. Workbench problems count everyone’s sessions; other causes count only yours.', list });
}

function renderStatus() {
  if (!state.bootstrap) return;
  let content;
  if (!report) content = failure ? callout({ tone: 'danger', title: 'Could not read the status', body: `<p>${escape(failure)}</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'status-refresh' }) }) : `<div class="status-page" aria-busy="true"><section class="status-answer status-loading"><p class="status-question">Can a new session start?</p><p class="status-verdict status-checking">Checking…</p><ol class="status-line" aria-hidden="true">${steps.map((step, index) => `<li class="status-step" data-state="unreached"><span class="status-knot">${index + 1}</span><div class="status-step-text"><p class="status-step-name">${escape(step.name)}</p><span class="status-bone"></span></div></li>`).join('')}</ol></section></div>`;
  else content = `<div class="status-page">${answerMarkup()}${proofMarkup(report)}<div class="status-lists">${waitingMarkup()}${failuresMarkup()}</div>${residencyMarkup(report)}${noteToolsMarkup()}</div>`;
  renderHtml(shell(content, { title: 'Status', subtitle: 'Whether new work can start right now, and what got in the way recently.' }));
}

/**
 * The way back to a failed session that sent the person here, or '' when there is none: a link once nothing stops a
 * new session, otherwise what to wait for.
 * @param {{ id: string, title: string, status: string } | null} session
 * @param {{ verdict: string, stop: number|null }} result
 * @returns {{ ready: boolean, text: string } | null}
 */
export function returnTo(session, result) {
  if (!session || session.status !== 'failed') return null;
  if (result.verdict === 'Not right now.') return { ready: false, text: result.stop ? `When step ${result.stop} turns green, you can try “${session.title}” again.` : `When the outage is resolved, you can try “${session.title}” again.` };
  return { ready: true, text: `You can try “${session.title}” again now.` };
}

function returnMarkup(result) {
  const back = returnTo(returnSession, result);
  if (!back || failure) return '';
  return `<div class="status-return" data-ready="${back.ready}">${icon(back.ready ? 'check-circle' : 'clock')}<p>${escape(back.text)}</p>${back.ready ? button({ label: 'Back to the session', icon: 'arrow', variant: 'primary', size: 'sm', href: `#session/${encodeURIComponent(returnSession.id)}` }) : button({ label: 'Back to the session', size: 'sm', href: `#session/${encodeURIComponent(returnSession.id)}` })}</div>`;
}

async function loadStatus() {
  const from = parseHash(location.hash).query.from;
  if (!from) returnSession = null;
  else if (returnSession?.id !== from || returnSession.status === 'failed') returnSession = await api(`/api/sessions/${encodeURIComponent(from)}`).then(session => ({ id: session.id, title: session.title, status: session.status })).catch(() => null);
  try {
    const next = await api('/api/status');
    applyStatusReport(next);
    const before = report ? answer(report).verdict : '';
    changed = new Set(report ? startLine(next).filter(step => previous.has(step.id) && previous.get(step.id) !== step.state).map(step => step.id) : []);
    previous = new Map(startLine(next).map(step => [step.id, step.state]));
    report = next; failure = '';
    const after = answer(report);
    if (before && before !== after.verdict) announce(`Status changed. ${after.verdict} ${after.reason}`);
  } catch (error) {
    if (error.status === 401) return;
    failure = error.message || 'The workbench did not answer.'; failedAt = new Date().toISOString(); changed = new Set();
  }
  if (state.view === 'status') {
    const active = document.activeElement;
    const focused = active?.closest('.status-page') ? active.dataset?.action ? `[data-action="${CSS.escape(active.dataset.action)}"]` : active.closest('details[id]') ? `#${CSS.escape(active.closest('details[id]').id)} > summary` : active.getAttribute('href') ? `[href="${CSS.escape(active.getAttribute('href'))}"]` : '' : '';
    const open = [...document.querySelectorAll('.status-page details[open][id]')].map(item => item.id);
    renderStatus();
    for (const id of open) { const item = document.getElementById(id); if (item) item.open = true; }
    if (focused) document.querySelector(`.status-page ${focused}`)?.focus();
  }
}

async function postNote(data, form) {
  await api('/api/status/notes', { method: 'POST', body: JSON.stringify({ severity: data.severity, text: data.text }) });
  form.reset();
  notify('The note is on the Status page for everyone.');
  await loadStatus();
}

async function resolveNote(control) {
  control.disabled = true;
  try { await api(`/api/status/notes/${encodeURIComponent(control.dataset.id)}/resolve`, { method: 'POST', body: '{}' }); notify('The note is marked resolved.'); await loadStatus(); }
  finally { control.disabled = false; }
}

/** The Status page (`#status`): whether a new session can start and where it stops, administrators' notes, what waits for a workspace, recent failures by cause and where model requests went. */
export default {
  id: 'status',
  match: hash => hash === 'status' ? {} : null,
  load: loadStatus,
  render: renderStatus,
  actions: { 'status-refresh': () => loadStatus(), 'status-note-resolve': resolveNote },
  forms: { 'status-note': postNote },
};

live.register('status', { interval: 30000, refresh: loadStatus });
