import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, safeUrl, renderHtml, notify, announce } from '../core/dom.js';
import { money } from '../core/format.js';
import { icon } from '../core/icons.js';
import { markdown } from '../core/markdown.js';
import { parseHash, buildHash } from '../core/route.js';
import { singleKeyAllowed } from '../core/keys.js';
import { sessionStatus } from '../core/states.js';
import { badge, button, callout, card, chip, demoNote, disclosure, emptyState, skeleton, stateBadge, timeAgo, toolbar } from '../core/ui.js';
import { repoName, taskSources, selectedTaskSource, providerName, providerLabels } from '../core/lookup.js';
import { shell } from '../shell.js';

const trackers = ['forgejo', 'github', 'gitlab', 'clickup', 'vikunja'];
const statuses = { open: ['Open', 'circle'], closed: ['Closed', 'check-circle'], unknown: ['Status unknown', 'help-circle'] };
const longBrief = 1200;

let requestedId = '';
let previewFailed = false;
let listErrorCode = '';
let briefExpanded = false;

const act = (attribute, options) => button(options).replace('<button ', `<button ${attribute} `);
const ownerLabel = source => source?.executionOwner === 'ploeg' ? 'Ploeg managed' : 'Operator led';
const sessionFor = task => state.sessions.find(session => session.sourceTask?.sourceId === task.sourceId && session.sourceTask?.id === task.id);
const briefText = task => typeof task.descriptionMarkdown === 'string' ? task.descriptionMarkdown : task.description || '';

function remember(taskId = '') {
  const hash = `#${buildHash('tasks', { source: state.taskSourceId, task: taskId })}`;
  if (state.view === 'tasks' && location.hash !== hash) history.replaceState(null, '', hash);
}

function statusBadge(status, size) {
  const [label, glyph] = statuses[status] || statuses.unknown;
  return badge({ label, glyph, tone: 'neutral', size });
}

function taskRow(task) {
  const selected = requestedId === String(task.id);
  const session = sessionFor(task);
  const meta = `<span class="num">#${escape(task.id)}</span>${task.status === 'open' ? '' : statusBadge(task.status, 'sm')}${session ? chip({ label: 'Has a session', icon: 'sessions' }) : ''}`;
  return `<li><button type="button" class="list-row tasks-row" id="task-row-${escape(task.id)}" data-action="task-preview" data-id="${escape(task.id)}"${selected ? ' aria-current="true"' : ''}><span class="list-row-lead"></span><span class="list-row-main"><span class="list-row-title">${escape(task.title)}</span><span class="list-row-meta">${meta}</span></span><span class="list-row-trail">${timeAgo(task.updatedAt)}</span></button></li>`;
}

function listBody(source) {
  if (state.taskLoading) return `<div class="tasks-list-state" aria-busy="true">${skeleton({ rows: 4 })}</div>`;
  if (state.taskError) {
    const unlinked = listErrorCode === 'source_unlinked';
    const actions = unlinked ? button({ label: 'Open Linked accounts', href: '#settings/accounts', size: 'sm', variant: 'primary' }) : act('data-action="task-refresh"', { label: 'Try again', icon: 'refresh', size: 'sm' });
    return emptyState({ compact: true, tone: unlinked ? 'attention' : 'danger', icon: unlinked ? 'link' : 'x-circle', title: unlinked ? 'Link your account first' : 'Could not load tasks', body: `<span role="alert">${escape(state.taskError)}</span>`, actions });
  }
  const search = state.taskSearch.trim().toLowerCase();
  const shown = state.tasks.filter(task => `${task.id} ${task.title}`.toLowerCase().includes(search));
  if (!shown.length && search) return emptyState({ compact: true, icon: 'search', title: 'No tasks match', body: `Nothing on this page matches “${escape(state.taskSearch.trim())}”. Search covers titles and numbers.`, actions: act('data-action="task-search-clear"', { label: 'Clear search', size: 'sm' }) });
  if (!shown.length) return emptyState({ compact: true, icon: 'inbox', title: state.taskPage > 1 ? 'No open tasks on this page' : 'No open tasks', body: `Open tasks in ${escape(source?.name || 'this connection')} show up here. Refresh after you add one.` });
  return `<ul class="list tasks-list" aria-label="Tasks">${shown.map(taskRow).join('')}</ul>`;
}

function pagination() {
  if (state.taskPage <= 1 && !state.taskNextPage) return '';
  return `<footer class="tasks-pagination">${act('data-action="task-page"', { label: 'Previous', icon: 'chevron-left', variant: 'ghost', size: 'sm', data: { page: state.taskPage - 1 }, disabled: state.taskPage <= 1 || state.taskLoading })}<span class="tasks-page-number num">Page ${state.taskPage}</span>${act('data-action="task-page"', { label: 'Next', icon: 'chevron', variant: 'ghost', size: 'sm', data: { page: state.taskNextPage || '' }, disabled: !state.taskNextPage || state.taskLoading })}</footer>`;
}

function listPane(source) {
  const count = !state.taskLoading && !state.taskError && state.tasks.length ? `<span class="count">${state.tasks.length}</span>` : '';
  const refresh = act('data-action="task-refresh"', { icon: 'refresh', ariaLabel: 'Refresh tasks', title: 'Refresh tasks', variant: 'ghost', size: 'sm', disabled: state.taskLoading });
  const search = `<div class="tasks-search-row"><label class="tasks-search">${icon('search')}<span class="sr-only">Search loaded tasks</span><input id="task-search" type="search" placeholder="Filter by title or number" value="${escape(state.taskSearch)}" autocomplete="off"></label></div>`;
  return `<section class="card tasks-list-card" aria-labelledby="tasks-source-title"><header class="card-header tasks-list-header"><div class="card-heading"><h2 class="card-title" id="tasks-source-title">${escape(source?.name || 'Tasks')}${count}</h2><p class="card-subtitle">${escape(providerName(source?.provider))} · ${escape(repoName(source?.repositoryId))} · ${ownerLabel(source)}</p></div><div class="card-actions">${refresh}</div></header>${search}<div class="tasks-list-body">${listBody(source)}</div>${pagination()}</section>`;
}

function field(id, label, control, hint = '') {
  return `<div class="field"><label class="field-label" for="${id}">${escape(label)}</label>${control}${hint ? `<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}</div>`;
}

function options(list, selected) {
  return list.map(item => `<option value="${escape(item.id)}"${selected === item.id ? ' selected' : ''}>${escape(item.name)}</option>`).join('');
}

function importForm(task) {
  const draft = state.taskDraft;
  const boot = state.bootstrap;
  const crew = boot.crews.find(entry => entry.id === draft.crewId) || boot.crews[0];
  const placements = boot.placements || [];
  const placement = draft.placement || placements.find(entry => entry.default)?.id || placements[0]?.id;
  const fields = [
    field('task-crew', 'Crew', `<select id="task-crew" name="crewId" aria-describedby="task-crew-hint">${options(boot.crews, draft.crewId)}</select>`, escape(crew ? crew.roles.map(role => role.name).join(' and ') : '')),
    field('task-runtime', 'Runtime', `<select id="task-runtime" name="runtime">${options(boot.runtimes, draft.runtime)}</select>`),
    placements.length > 1 ? field('task-placement', 'Workspace placement', `<select id="task-placement" name="placement">${options(placements, placement)}</select>`) : '',
    field('task-budget', 'Session budget · USD', `<input id="task-budget" name="budgetUsd" type="number" inputmode="decimal" min="0.01" max="${escape(boot.maxBudgetUsd)}" step="0.01" value="${escape(draft.budgetUsd)}" required aria-describedby="task-budget-hint">`, `The most this session may spend, up to ${escape(money(boot.maxBudgetUsd))}.`),
  ].join('');
  const submit = button({ type: 'submit', variant: 'primary', icon: 'plus', label: state.taskImporting ? 'Creating session…' : 'Create session', busy: state.taskImporting });
  const body = `<form data-form="task-import"><div class="tasks-import-fields">${fields}</div><footer class="tasks-import-footer"><p class="tasks-import-note">${icon('lock')}<span>Nothing runs until you press Start on the session. The task itself stays as it is in its tracker.</span></p>${submit}</footer></form>`;
  return card({ id: 'task-import', level: 3, flush: true, title: 'Bring this task onto the floor.', subtitle: `Creates a queued session for ${repoName(task.repositoryId)} with the crew and budget you choose.`, body });
}

function importArea(task, source) {
  const role = state.bootstrap.user.role;
  const shared = state.bootstrap.sharedExecution;
  const bindingBlocked = shared ? !task.ploeg || Boolean(task.ploegUnavailable) : source?.executionOwner === 'ploeg';
  if (bindingBlocked) return callout({ tone: 'attention', title: 'Ploeg binding needs attention', body: `<p>${escape(task.ploegUnavailable?.message || 'This connection needs its registered Ploeg tracker target before you can import work here.')}</p>` });
  if (role === 'viewer') return callout({ tone: 'neutral', icon: 'eye', title: 'Your account can read tasks', body: '<p>An operator or administrator brings them onto the floor.</p>' });
  if (task.status !== 'open') return callout({ tone: 'neutral', title: 'Only open tasks can be imported', body: `<p>This task is ${escape((statuses[task.status] || statuses.unknown)[0].toLowerCase())}. Reopen it in its tracker first.</p>` });
  return importForm(task);
}

function notices(task) {
  const parts = [];
  if (state.taskChanged) parts.push(callout({ tone: 'attention', title: 'The source task changed.', body: '<p>This is its latest version. Read the updated brief before you create the session. Your crew and budget choices are kept.</p>' }));
  if (state.taskPreviewError) parts.push(`<div role="alert">${callout({ tone: 'danger', title: 'The session was not created', body: `<p>${escape(state.taskPreviewError)}</p>` })}</div>`);
  const session = sessionFor(task);
  if (session) {
    const status = sessionStatus(session);
    parts.push(callout({ tone: 'neutral', icon: 'sessions', title: 'This task already has a session', body: `<p>${stateBadge(status)} <a href="#session/${escape(session.id)}">${escape(session.title)}</a></p><p>Importing the same revision again opens it. No new work starts.</p>`, actions: button({ label: 'Open session', href: `#session/${escape(session.id)}`, size: 'sm' }) }));
  }
  if (task.ploeg) {
    const target = task.ploeg.expectedTarget;
    parts.push(callout({ tone: 'neutral', icon: 'work', title: `Continues Work Item #${task.ploeg.workItemId}`, body: `<p><a href="#work/${escape(task.ploeg.workItemId)}">Open Work Item #${escape(task.ploeg.workItemId)}</a> · ${escape(target.owner)}/${escape(target.repo)} · ${escape(target.baseBranch)}</p><p>Importing prepares your session. Start checks the source again and claims this Work Item for your crew.</p>` }));
  }
  return parts.join('');
}

function brief(task) {
  const text = briefText(task).trim();
  if (!text) return '<p class="tasks-brief-empty">This task has no description. Read the original task before you start work.</p>';
  const long = text.length > longBrief || text.split('\n').length > 24;
  const toggle = long ? act('data-action="task-brief"', { label: briefExpanded ? 'Show less' : 'Show the whole brief', icon: briefExpanded ? 'chevron-up' : 'chevron-down', variant: 'ghost', size: 'sm' }) : '';
  return `<div class="tasks-brief${long && !briefExpanded ? ' is-clipped' : ''}"><div class="prose" id="task-brief">${markdown(text)}</div></div>${toggle ? `<div class="tasks-brief-toggle">${toggle}</div>` : ''}`;
}

function detailHeader(task) {
  const link = safeUrl(task.url);
  const open = link ? button({ label: task.provider === 'demo' ? 'Open original' : `Open in ${providerName(task.provider)}`, href: link, external: true, size: 'sm' }) : '';
  const revision = task.revision ? `<span class="tasks-revision" title="Revision ${escape(task.revision)}">${icon('hash')}<span class="mono">${escape(task.revision.slice(0, 12))}</span></span>` : '';
  const updated = task.updatedAt ? `<span>Updated ${timeAgo(task.updatedAt)}</span>` : '';
  return `<header class="tasks-task-header"><div class="tasks-task-titlebar"><div class="tasks-task-heading"><p class="overline">${escape(providerName(task.provider))} · #${escape(task.id)}</p><h2 class="tasks-task-title" id="task-preview-title">${escape(task.title)}</h2></div>${open ? `<div class="tasks-task-actions">${open}</div>` : ''}</div><div class="tasks-task-meta">${statusBadge(task.status)}${chip({ label: repoName(task.repositoryId), icon: 'branch', title: 'Registered repository' })}${updated}${revision}</div></header>`;
}

function detailPane(source) {
  const back = `<div class="tasks-back">${act('data-action="task-close"', { label: 'All tasks', icon: 'chevron-left', variant: 'ghost', size: 'sm' })}</div>`;
  if (state.taskPreviewLoading) return `<div class="tasks-detail" aria-busy="true">${back}<article class="card tasks-task tasks-task-loading">${skeleton({ rows: 6, variant: 'text' })}</article></div>`;
  if (previewFailed && !state.task) {
    return `<div class="tasks-detail">${back}<article class="card tasks-task">${emptyState({ tone: 'danger', icon: 'x-circle', title: 'Could not open this task', body: `<span role="alert">${escape(state.taskPreviewError)}</span>`, actions: act('data-action="task-preview"', { label: 'Try again', icon: 'refresh', size: 'sm', data: { id: requestedId } }) })}</article></div>`;
  }
  const task = state.task;
  if (!task) return `<div class="tasks-detail"><article class="card tasks-task tasks-task-empty">${emptyState({ icon: 'tasks', title: 'Select a task', body: 'Its brief, status and revision open here. You choose a crew and a budget before anything runs.' })}</article></div>`;
  return `<div class="tasks-detail">${back}<article class="card tasks-task" aria-labelledby="task-preview-title">${detailHeader(task)}<div class="tasks-task-body">${brief(task)}</div></article>${notices(task)}${importArea(task, source)}</div>`;
}

function unlinkedNotice(source) {
  if (!source?.needsLink || listErrorCode === 'source_unlinked' || (state.links || []).some(link => link.provider === source.needsLink && link.linked)) return '';
  const label = providerLabels[source.needsLink] || source.needsLink;
  return callout({ tone: 'attention', icon: 'link', title: `${label} is not linked`, body: `<p>${escape(source.name)} reads tasks with your own ${escape(label)} account.</p>`, actions: button({ label: 'Open Linked accounts', href: '#settings/accounts', size: 'sm' }) });
}

function sourcePicker(sources) {
  if (sources.length < 2) return '';
  return toolbar(`<label class="tasks-source-picker"><span class="tasks-source-label">Connection</span><select id="task-source">${sources.map(source => `<option value="${escape(source.id)}"${state.taskSourceId === source.id ? ' selected' : ''}>${escape(source.name)} · ${escape(providerName(source.provider))}</option>`).join('')}</select></label>`);
}

function renderTasks() {
  const sources = taskSources();
  const source = selectedTaskSource();
  const actions = act('data-action="connections"', { label: 'Connections', icon: 'link' });
  const page = { title: 'Tasks', subtitle: 'Preview a task from your tracker, then bring it onto the floor as a session.', actions };
  if (!sources.length) {
    const body = emptyState({ icon: 'link', title: 'No task connections yet', body: 'An administrator connects a tracker project to a registered repository. Its open tasks then show up here, ready to preview.', actions: act('data-action="connections"', { label: 'How connections work', variant: 'primary' }) });
    renderHtml(shell(`<div class="tasks-page"><section class="card tasks-first-run">${body}</section></div>`, page));
    return;
  }
  const focus = state.task || state.taskPreviewLoading || previewFailed ? 'detail' : 'list';
  const demo = state.bootstrap.mode === 'demo' ? demoNote('Sample tracker task. Importing it runs the real demonstration: real Git changes and checks, no model calls and no spend.') : '';
  const content = `<div class="tasks-page">${unlinkedNotice(source)}${sourcePicker(sources)}${demo}<div class="tasks-layout" data-focus="${focus}">${listPane(source)}${detailPane(source)}</div></div>`;
  renderHtml(shell(content, page));
}

function providerMark(provider) {
  return `<span class="connections-mark" aria-hidden="true">${escape(providerName(provider).slice(0, 1))}</span>`;
}

function openConnections() {
  const dialog = $('#task-connections');
  const sources = taskSources();
  const registered = sources.length
    ? `<ul class="connections-list">${sources.map(source => `<li class="connections-item">${providerMark(source.provider)}<span class="connections-main"><strong>${escape(source.name)}</strong><span class="connections-meta">${escape(providerName(source.provider))} ${icon('arrow')} ${escape(repoName(source.repositoryId))}</span></span>${badge({ label: ownerLabel(source), tone: 'neutral', size: 'sm' })}</li>`).join('')}</ul>`
    : '<p class="connections-none">None yet. Tasks stays empty until an administrator adds one.</p>';
  const steps = `<ol class="connections-steps"><li><strong>Register the connection</strong><span>Add it to the server’s <code>taskSources</code> configuration: the tracker, its address, the project or list, and the registered repository it feeds.</span></li><li><strong>Give it a read-only token</strong><span>Put the token in the server environment and name that variable in the connection. It never leaves the server.</span></li><li><strong>Choose who runs the work</strong><span><code>interactive</code> creates sessions here. <code>ploeg</code> hands tasks to a Ploeg Team through its registered tracker target.</span></li></ol><p class="connections-help">Examples for all five trackers are in <code>docs/operations/task-connections.md</code>. Restart the server after you change its configuration.</p>`;
  dialog.className = 'dialog connections-dialog';
  dialog.innerHTML = `<div class="dialog-frame"><header class="dialog-header"><h2 id="connections-title">Your tasks, connected.</h2>${act('data-action="close-connections"', { icon: 'x', ariaLabel: 'Close', title: 'Close', variant: 'ghost', size: 'sm' })}</header><div class="dialog-body"><p class="connections-intro">Each connection reads one project or list from a tracker and feeds its tasks to one registered repository. Credentials stay on the server.</p><section class="connections-section" aria-labelledby="connections-registered"><h3 id="connections-registered" class="overline">Registered on this workbench</h3>${registered}</section><section class="connections-section" aria-labelledby="connections-supported"><h3 id="connections-supported" class="overline">Trackers you can connect</h3><ul class="connections-trackers">${trackers.map(provider => `<li>${providerMark(provider)}<span>${escape(providerName(provider))}</span></li>`).join('')}</ul></section>${disclosure({ summary: 'How an administrator adds a connection', open: !sources.length, body: steps })}</div><footer class="dialog-footer">${act('data-action="close-connections"', { label: 'Done', variant: 'primary' })}</footer></div>`;
  dialog.showModal();
}

async function loadTasks(sourceId, page = 1, { keepTask = '' } = {}) {
  if (!taskSources().some(source => source.id === sourceId)) return;
  const request = ++state.taskRequest;
  ++state.previewRequest;
  state.taskSourceId = sourceId; state.taskPage = page; state.taskNextPage = null; state.task = null; state.taskSearch = ''; state.taskError = ''; state.taskPreviewError = ''; state.taskChanged = false; state.taskLoading = true; state.taskPreviewLoading = false; state.tasks = [];
  requestedId = ''; previewFailed = false; listErrorCode = '';
  remember();
  if (state.view === 'tasks') renderTasks();
  try {
    const result = await api(`/api/task-sources/${encodeURIComponent(sourceId)}/tasks?page=${page}`);
    if (request !== state.taskRequest) return;
    state.tasks = result.tasks; state.taskNextPage = result.nextPage || null;
  } catch (error) { if (request === state.taskRequest) { state.taskError = error.message; listErrorCode = error.code || ''; } }
  finally { if (request === state.taskRequest) { state.taskLoading = false; if (state.view === 'tasks' && state.bootstrap) renderTasks(); } }
  if (keepTask && request === state.taskRequest && !state.taskError) await openTask(keepTask);
}

async function openTask(id, preserveDraft = false) {
  const sourceId = state.taskSourceId;
  const request = ++state.previewRequest;
  requestedId = String(id); previewFailed = false; briefExpanded = false;
  state.taskPreviewLoading = true; state.taskPreviewError = ''; state.taskChanged = preserveDraft;
  if (!preserveDraft) state.taskDraft = { crewId: state.bootstrap.crews[0]?.id || '', runtime: state.bootstrap.runtimes[0]?.id || '', budgetUsd: Math.min(5, state.bootstrap.maxBudgetUsd) };
  remember(requestedId);
  renderTasks();
  try {
    const task = await api(`/api/task-sources/${encodeURIComponent(sourceId)}/tasks/${encodeURIComponent(id)}`);
    if (request !== state.previewRequest || sourceId !== state.taskSourceId) return;
    state.task = task;
    if (state.view === 'tasks') announce(`Task preview ready: ${task.title}`);
  } catch (error) { if (request === state.previewRequest) { state.task = null; state.taskPreviewError = error.message; previewFailed = true; } }
  finally { if (request === state.previewRequest) { state.taskPreviewLoading = false; if (state.view === 'tasks' && state.bootstrap) renderTasks(); } }
}

function closeTask() {
  ++state.previewRequest;
  state.task = null; state.taskPreviewLoading = false; state.taskPreviewError = ''; state.taskChanged = false;
  const id = requestedId;
  requestedId = ''; previewFailed = false;
  remember();
  renderTasks();
  document.getElementById(`task-row-${id}`)?.focus();
}

async function loadTaskPage() {
  if (state.view === 'tasks' && !state.links) { try { state.links = (await api('/api/links')).links; } catch { state.links = []; } }
  if (state.view !== 'tasks' || !taskSources().length) return;
  const { query } = parseHash(location.hash);
  const source = taskSources().some(entry => entry.id === query.source) ? query.source : state.taskSourceId || taskSources()[0].id;
  await loadTasks(source, 1, { keepTask: query.task || '' });
}

async function importTask(data) {
  if (state.taskImporting || !state.task) return;
  state.taskImporting = true;
  const selected = state.task;
  const existingIds = new Set(state.sessions.map(session => session.id));
  renderTasks();
  try {
    const session = await api('/api/task-imports', { method: 'POST', body: JSON.stringify({ sourceId: selected.sourceId, taskId: selected.id, revision: selected.revision, ...(selected.bindingRevision ? { bindingRevision: selected.bindingRevision } : {}), crewId: data.crewId, runtime: data.runtime, ...(data.placement ? { placement: data.placement } : {}), budgetUsd: Number(data.budgetUsd) }) });
    state.sessions = [session, ...state.sessions.filter(item => item.id !== session.id)]; state.tab = 'stream';
    location.hash = `session/${session.id}`;
    notify(existingIds.has(session.id) ? 'Opened the existing session for this task. No additional work was started.' : 'Task imported. Read the brief, then start the crew when you are ready.');
  } catch (error) {
    if (error.status === 409 && ['task_changed', 'task_binding_changed'].includes(error.code) && state.view === 'tasks' && state.taskSourceId === selected.sourceId) await openTask(selected.id, true);
    else { state.taskPreviewError = error.message; notify(error.message, true); }
  } finally { state.taskImporting = false; if (state.view === 'tasks') renderTasks(); }
}

function keepTaskDraft(element, event) { if (state.taskDraft && event.target.name) state.taskDraft[event.target.name] = event.target.value; }

function moveInList(event) {
  if (state.view !== 'tasks' || !['j', 'k'].includes(event.key) || !singleKeyAllowed(event)) return false;
  const rows = [...document.querySelectorAll('.tasks-row')];
  if (!rows.length) return false;
  const current = rows.indexOf(document.activeElement);
  const selected = rows.findIndex(row => row.getAttribute('aria-current') === 'true');
  const from = current >= 0 ? current : selected;
  const next = from < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, from + (event.key === 'j' ? 1 : -1)));
  event.preventDefault();
  rows[next].focus();
  return true;
}

/** The Tasks page (`#tasks?source=&task=`): the task list of one connection beside the selected task's brief and import form, and the connections dialog. */
export default {
  id: 'tasks',
  match: hash => hash === 'tasks' ? {} : null,
  load: loadTaskPage,
  render: renderTasks,
  actions: {
    connections: () => openConnections(),
    'close-connections': () => $('#task-connections').close(),
    'task-refresh': () => loadTasks(state.taskSourceId, state.taskPage),
    'task-page': button => loadTasks(state.taskSourceId, Number(button.dataset.page)),
    'task-preview': button => openTask(button.dataset.id),
    'task-close': () => closeTask(),
    'task-brief': () => { briefExpanded = !briefExpanded; renderTasks(); if (!briefExpanded) document.getElementById('task-preview-title')?.scrollIntoView({ block: 'nearest' }); },
    'task-search-clear': () => { state.taskSearch = ''; renderTasks(); document.getElementById('task-search')?.focus(); },
  },
  forms: { 'task-import': importTask },
  inputs: {
    '#task-search': element => { state.taskSearch = element.value; renderTasks(); },
    '[data-form="task-import"]': keepTaskDraft,
  },
  changes: {
    '#task-source': element => loadTasks(element.value),
    '[data-form="task-import"]': keepTaskDraft,
  },
  keys: [moveInList],
};
