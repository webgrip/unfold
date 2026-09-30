import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, renderHtml } from '../core/dom.js';
import { money, plural } from '../core/format.js';
import { icon } from '../core/icons.js';
import { button, card, chip, emptyState, listRow, segmented, stateBadge, timeAgo, dl } from '../core/ui.js';
import { deliveryStatus } from '../delivery.js';
import { sessionStatus, sessionNeedsYou, verdict } from '../core/states.js';
import { repoName, crewName, isActive, providerName } from '../core/lookup.js';
import { parseHash, buildHash } from '../core/route.js';
import { singleKeysEnabled } from '../core/keys.js';
import { live } from '../core/live.js';
import { shell, updateChrome } from '../shell.js';

const filters = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs you' },
  { id: 'active', label: 'Open' },
  { id: 'done', label: 'Closed' },
];
const groups = [
  { id: 'needs', title: 'Needs you' },
  { id: 'active', title: 'Open' },
  { id: 'done', title: 'Closed' },
];
const failureStages = { credentials: 'Gateway authorization', workspace: 'Workspace setup', runtime: 'Runtime startup', prompt: 'Prompt submission', execution: 'Agent execution' };
const demoSession = { title: 'Fix order total rounding', objective: 'Reproduce the rounding regression. Apply a minimal fix, preserve the tests, and independently verify the patch.' };

const canOperate = () => state.bootstrap.user.role !== 'viewer';
const demoMode = () => state.bootstrap.mode === 'demo';

/**
 * Sorts a session into the list group it belongs to: `needs` when it waits on a person, `done` once finished
 * with a recorded review or cancelled, otherwise `active`.
 * @param {{ status: string, review?: object }} session
 * @returns {'needs' | 'active' | 'done'}
 */
export function sessionGroup(session) {
  if (sessionNeedsYou(session)) return 'needs';
  return ['completed', 'cancelled'].includes(session.status) ? 'done' : 'active';
}

/**
 * The state badge of a list row: the shared session status, or "Awaiting your approval" for a finished session
 * that goes through the delivery gate.
 * @param {object} session
 * @param {object} [bootstrap]
 * @returns {{ key: string, label: string, tone: string, glyph: string, live?: boolean }}
 */
export function listStatus(session, bootstrap) {
  return deliveryStatus({ session, bootstrap }) || sessionStatus(session);
}

/**
 * The one-line account of where a session stands, for the list row: who is working or waiting, how it failed,
 * who recorded the review, or that the delivery gate waits for verification and approval.
 * @param {object} session
 * @param {object} [bootstrap]
 * @returns {string}
 */
export function sessionProgress(session, bootstrap) {
  const run = (session.runs || []).find(item => ['running', 'waiting_input'].includes(item.status));
  const role = run?.roleName || 'The crew';
  if (session.status === 'waiting_input') return `${role} is waiting for you`;
  if (session.status === 'running') return `${role} is working`;
  if (session.status === 'exporting') return 'Preparing the repository handoff';
  if (session.status === 'interrupted') return 'Resume when ready';
  if (session.status === 'failed') return session.failure ? `${failureStages[session.failure.stage] || 'Execution'} failed` : 'Stopped with an error';
  if (deliveryStatus({ session, bootstrap })) return 'Verify, then approve the frozen commit';
  if (session.status === 'completed' && session.review) return `${session.review.decision === 'accepted' ? 'Accepted' : 'Rejected'} by ${session.review.byName}`;
  if (session.status === 'completed') {
    const review = [...(session.runs || [])].reverse().find(item => item.mode === 'read' && item.verdict);
    return review ? verdict(review.verdict).label : 'The crew finished';
  }
  return '';
}

function spendText(session) {
  if (session.costStatus === 'demo') return '';
  if (session.costStatus === 'unknown') return 'Spend not reported';
  return `${money(session.spentUsd)} of ${money(session.budgetUsd)}`;
}

function matches(session, search) {
  if (!search) return true;
  const text = [session.title, repoName(session.repositoryId), crewName(session.crewId), listStatus(session, state.bootstrap).label, session.sourceTask?.title, session.sourceTask && `${providerName(session.sourceTask.provider)} #${session.sourceTask.id}`].filter(Boolean).join(' ').toLowerCase();
  return search.toLowerCase().split(/\s+/).filter(Boolean).every(word => text.includes(word));
}

function listState() {
  const { query } = parseHash(location.hash);
  const filter = filters.some(item => item.id === query.filter) ? query.filter : 'all';
  const search = typeof query.q === 'string' ? query.q.slice(0, 200) : '';
  state.filter = filter;
  state.search = search;
  return { filter, search };
}

function writeListState(filter, search) {
  state.filter = filter;
  state.search = search;
  history.replaceState(null, '', `#${buildHash('sessions', { filter: filter === 'all' ? '' : filter, q: search })}`);
}

function sessionRow(session) {
  const meta = listStatus(session, state.bootstrap);
  const source = session.sourceTask ? chip({ label: `${providerName(session.sourceTask.provider)} #${session.sourceTask.id}`, icon: 'tag' }) : '';
  const fact = text => text ? `<span class="sessions-row-fact">${escape(text)}</span>` : '';
  const progress = [sessionProgress(session, state.bootstrap), spendText(session)].filter(Boolean);
  return `<li>${listRow({
    id: `session-row-${session.id}`,
    href: `#session/${encodeURIComponent(session.id)}`,
    tone: meta.tone,
    title: session.title,
    meta: `<span class="sessions-row-state">${stateBadge(meta)}${source}</span>${progress.length ? `<span class="sessions-row-progress">${progress.map(fact).join('')}</span>` : ''}<span class="sessions-row-facts">${fact(repoName(session.repositoryId))}${fact(crewName(session.crewId))}</span>`,
    trail: timeAgo(session.updatedAt),
  })}</li>`;
}

function emptyList(filter, search, total) {
  if (!total) {
    if (!canOperate()) return emptyState({ icon: 'sessions', title: 'No sessions yet', body: '<p>Sessions that operators start on this workbench appear here.</p>' });
    if (demoMode()) return emptyState({ icon: 'sessions', title: 'No sessions yet', body: '<p>Run the demonstration to watch a crew reproduce a rounding bug, fix it and hand you the evidence. It makes real Git changes and runs real checks, without model calls or spend.</p>', actions: [button({ id: 'sessions-empty-demo', label: 'Run the demonstration', icon: 'play', variant: 'primary', action: 'quick-demo' }), button({ id: 'sessions-empty-new', label: 'Write a brief', action: 'new' })] });
    return emptyState({ icon: 'sessions', title: 'No sessions yet', body: `<p>Give a crew an objective and a budget. You review what comes back before anything leaves the workbench. ${escape(plural(state.bootstrap.repositories.length, 'repository', 'repositories'))} and ${escape(plural(state.bootstrap.crews.length, 'crew'))} are configured.</p>`, actions: button({ id: 'sessions-empty-new', label: 'Write a brief', variant: 'primary', action: 'new' }) });
  }
  if (search) return emptyState({ icon: 'search', compact: true, title: `No sessions match “${search}”`, body: '<p>Search looks at titles, repositories, crews, states and source tasks.</p>', actions: button({ id: 'sessions-clear-search', label: 'Clear search', icon: 'x', action: 'sessions-clear' }) });
  if (filter === 'needs') return emptyState({ icon: 'check-circle', tone: 'success', compact: true, title: 'Nothing needs you', body: '<p>Sessions that ask a question, stop with an error or finish for review show up here.</p>' });
  if (filter === 'active') return emptyState({ icon: 'sessions', compact: true, title: 'Nothing open', body: '<p>Sessions that are running, paused or not started yet show up here.</p>' });
  return emptyState({ icon: 'sessions', compact: true, title: 'Nothing closed yet', body: '<p>Reviewed and cancelled sessions show up here.</p>' });
}

function resultsMarkup() {
  const { filter, search } = listState();
  const sessions = state.sessions;
  const shown = sessions.filter(session => (filter === 'all' || sessionGroup(session) === filter) && matches(session, search));
  if (!shown.length) return `<div class="sessions-list sessions-list-empty">${emptyList(filter, search, sessions.length)}</div>`;
  const newest = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt));
  const sections = groups.map(group => {
    const members = shown.filter(session => sessionGroup(session) === group.id).sort(newest);
    if (!members.length) return '';
    return `<section class="sessions-group" aria-labelledby="sessions-group-${group.id}"><h2 class="sessions-group-title" id="sessions-group-${group.id}">${escape(group.title)}<span class="count">${members.length}</span></h2><ul class="list">${members.map(sessionRow).join('')}</ul></section>`;
  }).join('');
  return `<div class="sessions-list">${sections}</div>`;
}

function summaryText() {
  const { filter, search } = listState();
  if (!search) return '';
  const shown = state.sessions.filter(session => (filter === 'all' || sessionGroup(session) === filter) && matches(session, search));
  return shown.length ? `${plural(shown.length, 'session')} match “${search}”` : `No sessions match “${search}”`;
}

function filterMarkup() {
  const { filter } = listState();
  const counts = { all: state.sessions.length };
  for (const session of state.sessions) counts[sessionGroup(session)] = (counts[sessionGroup(session)] || 0) + 1;
  return segmented({ label: 'Show sessions', action: 'filter', items: filters.map(item => ({ id: item.id, label: item.label, count: counts[item.id] || 0, selected: item.id === filter })) });
}

function asideMarkup() {
  const sessions = state.sessions;
  const running = sessions.filter(isActive).length;
  const slots = state.bootstrap.maxConcurrentSessions;
  const recorded = sessions.filter(session => session.costStatus !== 'demo');
  const unknown = recorded.some(session => session.costStatus === 'unknown');
  const unsettled = recorded.some(session => session.costStatus === 'pending');
  const spent = recorded.reduce((sum, session) => sum + (Number.isFinite(session.spentUsd) ? session.spentUsd : 0), 0);
  const spend = demoMode() && !recorded.length ? '<span class="subtle">Demo · no model calls</span>' : `<span class="num">${escape(money(spent))}</span>${unknown ? '<span class="sessions-fact-note">Some sessions did not report spend</span>' : unsettled ? '<span class="sessions-fact-note">Some usage is still settling</span>' : ''}`;
  const capacity = `<span class="sessions-capacity"><span class="num">${escape(running > slots ? `${running} active · ${plural(slots, 'slot')}` : `${running} of ${plural(slots, 'slot')}`)}</span><meter min="0" max="${Math.max(1, slots)}" value="${Math.min(running, Math.max(1, slots))}" aria-label="Session slots in use"></meter></span>`;
  const facts = card({ id: 'sessions-workbench', title: 'Workbench', body: dl([['Active now', capacity], ['Recorded spend', spend], ['Configured', escape(`${plural(state.bootstrap.repositories.length, 'repository', 'repositories')} · ${plural(state.bootstrap.crews.length, 'crew')}`)]], { rows: true }) });
  const demo = demoMode() && canOperate() && sessions.length ? card({ id: 'sessions-demo', title: 'Demonstration', icon: 'play', body: `<p class="sessions-demo-text">Follow a rounding regression from a failing test to a reviewed patch in about ten seconds.</p><ol class="sessions-demo-steps"><li>Reproduce the failure</li><li>Make and verify the fix</li><li>Review the evidence</li></ol><p class="sessions-demo-text subtle">Real Git changes and checks. No model calls, no spend.</p>${button({ id: 'sessions-demo-run', label: 'Run the demonstration', icon: 'play', action: 'quick-demo' })}` }) : '';
  return facts + demo;
}

function contentMarkup() {
  const { search } = listState();
  const toolbar = state.sessions.length ? `<div class="toolbar sessions-toolbar"><div id="sessions-filter" class="sessions-filter">${filterMarkup()}</div><label class="sessions-search">${icon('search')}<input id="session-search" type="search" aria-label="Search sessions" placeholder="Search sessions" autocomplete="off" value="${escape(search)}"></label></div>` : '';
  return `<div class="sessions-page"><div class="sessions-layout"><div class="sessions-main">${toolbar}<p id="sessions-summary" class="sessions-summary" role="status">${escape(summaryText())}</p><div id="session-results" class="sessions-results">${resultsMarkup()}</div></div><aside class="sessions-aside" id="sessions-aside" aria-label="Workbench summary">${asideMarkup()}</aside></div></div>`;
}

function renderDashboard() {
  const actions = canOperate() ? button({ label: 'New session', icon: 'plus', variant: 'primary', action: 'new', kbd: singleKeysEnabled() ? 'N' : undefined }) : '';
  renderHtml(shell(contentMarkup(), { title: 'Sessions', subtitle: 'Crews you start and supervise from the workbench, each with its own brief and budget.', actions }));
  live.touch('sessions');
}

const drawn = new WeakMap();

function swap(element, markup) {
  if (!element || drawn.get(element) === markup) return;
  element.innerHTML = markup;
  drawn.set(element, markup);
}

function updateRegions({ focusFilter } = {}) {
  const results = $('#session-results');
  if (!results) return renderDashboard();
  const active = document.activeElement;
  const focused = active && active !== document.body && active.closest?.('#session-results, #sessions-filter, #sessions-aside') ? (active.closest('#sessions-filter') ? { filter: active.dataset.id } : { id: active.id }) : null;
  swap(results, resultsMarkup());
  swap($('#sessions-filter'), filterMarkup());
  swap($('#sessions-aside'), asideMarkup());
  const summary = $('#sessions-summary');
  const text = summaryText();
  if (summary && summary.textContent !== text) summary.textContent = text;
  const filter = focusFilter || focused?.filter;
  const target = filter ? $(`#sessions-filter [data-id="${CSS.escape(filter)}"]`) : focused?.id ? document.getElementById(focused.id) : null;
  if (target && target !== document.activeElement) target.focus();
  else if (focused && document.activeElement === document.body) ($('#session-search') || document.getElementById('page-title'))?.focus();
}

function filterSessions(button) {
  writeListState(button.dataset.id, listState().search);
  updateRegions({ focusFilter: button.dataset.id });
}

function searchSessions(input) {
  writeListState(listState().filter, input.value.slice(0, 200));
  updateRegions();
}

function clearSearch() {
  writeListState(listState().filter, '');
  const input = $('#session-search');
  if (input) input.value = '';
  updateRegions();
  input?.focus();
}

async function refreshSessions() {
  const epoch = state.epoch;
  const sessions = await api('/api/sessions');
  if (state.view !== 'sessions' || !state.bootstrap || state.epoch !== epoch) return;
  state.sessions = sessions;
  updateRegions();
  updateChrome();
}

async function runDemonstration(control) {
  control.disabled = true;
  const session = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ ...demoSession, repositoryId: state.bootstrap.repositories[0].id, crewId: state.bootstrap.crews[0].id, runtime: 'demo', budgetUsd: Math.min(5, state.bootstrap.maxBudgetUsd) }) });
  await api(`/api/sessions/${session.id}/start`, { method: 'POST', body: '{}' });
  state.sessions.unshift(session); state.tab = 'stream'; location.hash = `session/${session.id}`;
}

live.register('sessions', { interval: 30000, refresh: refreshSessions });

/** The Sessions list: sessions grouped by what they need, one filter, a search that updates only the list, and the workbench summary. */
export default {
  id: 'sessions',
  match: hash => hash === 'sessions' ? {} : null,
  render: renderDashboard,
  actions: { filter: filterSessions, 'quick-demo': runDemonstration, 'sessions-clear': clearSearch },
  inputs: { '#session-search': searchSessions },
};
