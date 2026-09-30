import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, renderHtml, announce } from '../core/dom.js';
import { money, plural } from '../core/format.js';
import { icon } from '../core/icons.js';
import { button, card, chip, emptyState, listRow, segmented, stateBadge, timeAgo, dl } from '../core/ui.js';
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
 * The one-line account of where a session stands, for the list row: who is working or waiting, how it failed,
 * or who recorded the review.
 * @param {object} session
 * @returns {string}
 */
export function sessionProgress(session) {
  const run = (session.runs || []).find(item => ['running', 'waiting_input'].includes(item.status));
  const role = run?.roleName || 'The crew';
  if (session.status === 'waiting_input') return `${role} is waiting for you`;
  if (session.status === 'running') return `${role} is working`;
  if (session.status === 'exporting') return 'Preparing the repository handoff';
  if (session.status === 'interrupted') return 'Resume when ready';
  if (session.status === 'failed') return session.failure ? `${failureStages[session.failure.stage] || 'Execution'} failed` : 'Stopped with an error';
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
  const text = [session.title, repoName(session.repositoryId), crewName(session.crewId), sessionStatus(session).label, session.sourceTask?.title, session.sourceTask && `${providerName(session.sourceTask.provider)} #${session.sourceTask.id}`].filter(Boolean).join(' ').toLowerCase();
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
  const meta = sessionStatus(session);
  const source = session.sourceTask ? chip({ label: `${providerName(session.sourceTask.provider)} #${session.sourceTask.id}`, icon: 'tag' }) : '';
  const spend = spendText(session);
  const details = [sessionProgress(session), spend, repoName(session.repositoryId), crewName(session.crewId)].filter(Boolean).map(text => `<span class="sessions-row-fact">${escape(text)}</span>`).join('');
  return `<li>${listRow({
    href: `#session/${encodeURIComponent(session.id)}`,
    tone: meta.tone,
    lead: meta.live ? '<span class="live-dot" aria-hidden="true"></span>' : icon(meta.glyph),
    title: session.title,
    meta: `<span class="sessions-row-state">${stateBadge(meta)}${source}</span><span class="sessions-row-facts">${details}</span>`,
    trail: timeAgo(session.updatedAt),
  })}</li>`;
}

function emptyList(filter, search, total) {
  if (!total) {
    if (!canOperate()) return emptyState({ icon: 'sessions', title: 'No sessions yet', body: '<p>Sessions that operators start on this workbench appear here.</p>' });
    if (demoMode()) return emptyState({ icon: 'sessions', title: 'No sessions yet', body: '<p>Run the demonstration to watch a crew reproduce a rounding bug, fix it and hand you the evidence. It makes real Git changes and runs real checks, without model calls or spend.</p>', actions: [button({ label: 'Run the demonstration', icon: 'play', variant: 'primary', action: 'quick-demo' }), button({ label: 'Write a brief', action: 'new' })] });
    return emptyState({ icon: 'sessions', title: 'No sessions yet', body: `<p>Give a crew an objective and a budget. You review what comes back before anything leaves the workbench. ${escape(plural(state.bootstrap.repositories.length, 'repository', 'repositories'))} and ${escape(plural(state.bootstrap.crews.length, 'crew'))} are configured.</p>`, actions: button({ label: 'Write a brief', variant: 'primary', action: 'new' }) });
  }
  if (search) return emptyState({ icon: 'search', compact: true, title: `No sessions match “${search}”`, body: '<p>Search looks at titles, repositories, crews, states and source tasks.</p>', actions: button({ label: 'Clear search', icon: 'x', action: 'sessions-clear' }) });
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
  const summary = search ? `<p class="sessions-summary" role="status">${escape(plural(shown.length, 'session'))} match “${escape(search)}”</p>` : '';
  return `${summary}<div class="sessions-list">${sections}</div>`;
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
  const capacity = `<span class="sessions-capacity"><span class="num">${escape(`${running} of ${slots}`)}</span><meter min="0" max="${Math.max(1, slots)}" value="${Math.min(running, Math.max(1, slots))}" aria-label="Session slots in use"></meter></span>`;
  const facts = card({ id: 'sessions-workbench', title: 'Workbench', body: dl([['Active now', capacity], ['Recorded spend', spend], ['Configured', escape(`${plural(state.bootstrap.repositories.length, 'repository', 'repositories')} · ${plural(state.bootstrap.crews.length, 'crew')}`)]], { rows: true }) });
  const demo = demoMode() && canOperate() && sessions.length ? card({ id: 'sessions-demo', title: 'Demonstration', icon: 'play', body: `<p class="sessions-demo-text">Follow a rounding regression from a failing test to a reviewed patch in about ten seconds.</p><ol class="sessions-demo-steps"><li>Reproduce the failure</li><li>Make and verify the fix</li><li>Review the evidence</li></ol><p class="sessions-demo-text subtle">Real Git changes and checks. No model calls, no spend.</p>${button({ label: 'Run the demonstration', icon: 'play', action: 'quick-demo' })}` }) : '';
  return facts + demo;
}

function contentMarkup() {
  const { search } = listState();
  const toolbar = state.sessions.length ? `<div class="toolbar sessions-toolbar"><div id="sessions-filter" class="sessions-filter">${filterMarkup()}</div><label class="sessions-search">${icon('search')}<input id="session-search" type="search" aria-label="Search sessions" placeholder="Search sessions" autocomplete="off" value="${escape(search)}"></label></div>` : '';
  return `<div class="sessions-page"><div class="sessions-layout"><div class="sessions-main">${toolbar}<div id="session-results" class="sessions-results">${resultsMarkup()}</div></div><aside class="sessions-aside" id="sessions-aside" aria-label="Workbench summary">${asideMarkup()}</aside></div></div>`;
}

function renderDashboard() {
  const actions = canOperate() ? button({ label: 'New session', icon: 'plus', variant: 'primary', action: 'new', kbd: singleKeysEnabled() ? 'N' : undefined }) : '';
  renderHtml(shell(contentMarkup(), { title: 'Sessions', subtitle: 'Crews you start and supervise from the workbench, each with its own brief and budget.', actions }));
  live.touch('sessions');
}

function updateRegions({ focusFilter } = {}) {
  const results = $('#session-results');
  if (!results) return renderDashboard();
  const active = document.activeElement;
  const filterFocused = active?.closest?.('#sessions-filter') ? active.dataset.id : null;
  results.innerHTML = resultsMarkup();
  const filter = $('#sessions-filter');
  if (filter) filter.innerHTML = filterMarkup();
  const aside = $('#sessions-aside');
  if (aside) aside.innerHTML = asideMarkup();
  const target = focusFilter || filterFocused;
  if (target) $(`#sessions-filter [data-id="${CSS.escape(target)}"]`)?.focus();
}

function filterSessions(button) {
  writeListState(button.dataset.id, listState().search);
  updateRegions({ focusFilter: button.dataset.id });
}

function searchSessions(input) {
  writeListState(listState().filter, input.value.slice(0, 200));
  updateRegions();
  const { filter, search } = listState();
  if (search) announce(`${plural(state.sessions.filter(session => (filter === 'all' || sessionGroup(session) === filter) && matches(session, search)).length, 'session')} match`);
}

function clearSearch() {
  writeListState(listState().filter, '');
  const input = $('#session-search');
  if (input) input.value = '';
  updateRegions();
  input?.focus();
}

async function refreshSessions() {
  const sessions = await api('/api/sessions');
  if (state.view !== 'sessions') return;
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
