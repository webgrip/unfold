import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml } from '../core/dom.js';
import { money, ago } from '../core/format.js';
import { icon } from '../core/icons.js';
import { status, repoName, crewName, isActive, statusLabel } from '../core/lookup.js';
import { shell } from '../shell.js';

function metrics() {
  const sessions = state.sessions;
  const spent = sessions.reduce((sum, session) => sum + session.spentUsd, 0);
  const attention = sessions.filter(session => ['waiting_input','failed','interrupted'].includes(session.status)).length;
  return `<section class="metrics" aria-label="Workspace totals">${[
    ['Active sessions', sessions.filter(isActive).length, `${state.bootstrap.maxConcurrentSessions} concurrent slots`, 'activity'],
    ['Ready for review', sessions.filter(session => session.status === 'completed' && !session.review).length, 'Required reviewers approved', 'check'],
    ['Needs attention', attention, attention ? 'Your next decision is waiting' : 'No decisions waiting', 'circle'],
    ['Recorded spend', money(spent), state.bootstrap.mode === 'demo' ? 'Demo · no model usage' : sessions.some(session => ['pending','unknown'].includes(session.costStatus)) ? 'Some usage is unsettled' : 'Gateway-reconciled usage', 'layers']
  ].map(([label, value, detail, glyph]) => `<article class="metric"><div>${escape(label)}${icon(glyph)}</div><strong>${escape(value)}</strong><span>${escape(detail)}</span></article>`).join('')}</section>`;
}

function sessionRow(session) {
  return `<button class="session-row" data-action="open" data-id="${escape(session.id)}"><span class="row-symbol ${isActive(session) ? 'working' : ''}">${icon(session.status === 'completed' ? 'check' : session.status === 'failed' ? 'info' : 'code')}</span><span class="row-main"><strong>${escape(session.title)}</strong><span>${escape(repoName(session.repositoryId))}<i>·</i>${escape(crewName(session.crewId))}</span></span><span class="row-status">${status(session.status, statusLabel(session))}<small>${escape(ago(session.updatedAt))}</small></span>${icon('chevron')}</button>`;
}

function renderDashboard() {
  const selected = state.sessions.filter(session => (state.filter === 'all' || state.filter === 'active' && isActive(session) || state.filter === 'review' && session.status === 'completed' && !session.review) && `${session.title} ${repoName(session.repositoryId)}`.toLowerCase().includes(state.search.toLowerCase()));
  const attention = state.sessions.filter(session => ['waiting_input','failed','interrupted','paused'].includes(session.status));
  const content = `${metrics()}<div class="dashboard-grid"><section class="panel sessions-panel"><div class="panel-heading"><div><h2>Sessions</h2><p>From an objective to reviewable work.</p></div><span class="count-badge">${state.sessions.length}</span></div><div class="list-toolbar"><div class="segmented" aria-label="Filter sessions">${[['all','All work'],['active','Active'],['review','For review']].map(([id,label]) => `<button data-action="filter" data-id="${id}" class="${state.filter === id ? 'selected' : ''}" aria-pressed="${state.filter === id}">${label}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="session-search" type="search" aria-label="Search sessions" placeholder="Find a session" value="${escape(state.search)}"></label></div><div class="session-list">${selected.length ? selected.map(sessionRow).join('') : `<div class="empty"><span class="empty-icon">${icon('branch')}</span><h3>${state.sessions.length ? 'No matching sessions' : 'A clear brief is a good start.'}</h3><p>${state.sessions.length ? 'Try a different filter or search.' : 'Choose a repository, give your crew an objective, and review what comes back.'}</p>${!state.sessions.length && state.bootstrap.user.role !== 'viewer' ? '<button class="button secondary" data-action="new">Create your first session</button>' : ''}</div>`}</div></section><aside class="right-column">
      ${state.bootstrap.mode === 'demo' ? `<section class="demo-card"><div class="demo-kicker">A WORKING WALKTHROUGH <span>~10 SEC</span></div><h2>Meet your<br>delivery crew.</h2><p>Follow a real rounding regression from failing test to reviewed patch.</p><ol><li><span>01</span>Reproduce the failure</li><li><span>02</span>Make and verify the fix</li><li><span>03</span>Review the actual evidence</li></ol><button class="button dark" data-action="quick-demo">Run the demonstration ${icon('arrow')}</button><small>Deterministic fixture · no API keys needed</small></section>` : `<section class="demo-card live-card"><div class="demo-kicker">READY TO WORK</div><h2>Your environment.<br>Your crew.</h2><p>${state.bootstrap.repositories.length} configured repositories and ${state.bootstrap.crews.length} reusable crews are available.</p><button class="button dark" data-action="new">Give a crew an objective ${icon('arrow')}</button></section>`}
      <section class="panel attention-panel"><div class="panel-heading"><h2>Your next decisions</h2>${icon('circle')}</div>${attention.length ? attention.slice(0,4).map(session => `<button class="attention-row" data-action="open" data-id="${escape(session.id)}"><strong>${escape(session.title)}</strong><span>${escape(statusLabel(session))} ${icon('arrow')}</span></button>`).join('') : `<div class="all-clear">${icon('check')}<div><strong>All clear for now</strong><p>Approvals and blockers will appear here.</p></div></div>`}</section>
    </aside></div>`;
  renderHtml(shell(content));
}

function openSessionRow(button) { state.tab = 'stream'; location.hash = `session/${button.dataset.id}`; }

function filterSessions(button) { state.filter = button.dataset.id; renderDashboard(); }

async function runDemonstration(button) {
  button.disabled = true;
  const session = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ title: 'Fix order total rounding', objective: 'Reproduce the rounding regression. Apply a minimal fix, preserve the tests, and independently verify the patch.', repositoryId: state.bootstrap.repositories[0].id, crewId: state.bootstrap.crews[0].id, runtime: 'demo', budgetUsd: Math.min(5, state.bootstrap.maxBudgetUsd) }) });
  await api(`/api/sessions/${session.id}/start`, { method: 'POST', body: '{}' });
  state.sessions.unshift(session); state.tab = 'stream'; location.hash = `session/${session.id}`;
}

function searchSessions(input) { state.search = input.value; renderDashboard(); }

/** The Sessions dashboard: workspace totals, the session list with its filters and search, and the next decisions. */
export default {
  id: 'sessions',
  match: hash => hash === 'sessions' ? {} : null,
  render: renderDashboard,
  actions: { open: openSessionRow, filter: filterSessions, 'quick-demo': runDemonstration },
  inputs: { '#session-search': searchSessions },
};
