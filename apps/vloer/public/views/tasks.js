import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, safeUrl, renderHtml, notify, announce } from '../core/dom.js';
import { ago } from '../core/format.js';
import { icon } from '../core/icons.js';
import { repoName, placementField, taskSources, selectedTaskSource, providerName, providerLabels } from '../core/lookup.js';
import { shell } from '../shell.js';

function taskPreviewMarkup() {
  const task = state.task;
  const source = selectedTaskSource();
  if (state.taskPreviewLoading) return '<div class="empty task-preview-empty" role="status"><span class="empty-icon">'+icon('clock')+'</span><h3>Opening the latest task</h3><p>Fetching its current description and revision.</p></div>';
  if (!task) return `<div class="empty task-preview-empty"><span class="empty-icon">${icon('branch')}</span><h3>Select a task. Shape the work.</h3><p>Review the source brief, choose your crew, then start a session when you are ready.</p>${state.taskPreviewError ? `<p class="form-error" role="alert">${escape(state.taskPreviewError)}</p>` : ''}</div>`;
  const draft = state.taskDraft;
  const link = safeUrl(task.url);
  const shared = state.bootstrap.sharedExecution;
  const bindingBlocked = shared ? !task.ploeg || Boolean(task.ploegUnavailable) : source?.executionOwner === 'ploeg';
  const blocked = bindingBlocked || state.bootstrap.user.role === 'viewer' || task.status !== 'open';
  const bindingNotice = task.ploeg ? `<div class="notice task-import-notice"><div><strong>Continue the existing Ploeg work item.</strong><p><a href="#work/${escape(task.ploeg.workItemId)}">Work item #${escape(task.ploeg.workItemId)}</a> · ${escape(task.ploeg.expectedTarget.owner)}/${escape(task.ploeg.expectedTarget.repo)} · ${escape(task.ploeg.expectedTarget.baseBranch)}</p><p>Import prepares your session. Start checks the source again and claims this item for your crew.</p></div></div>` : '';
  return `<article class="task-preview" aria-labelledby="task-preview-title"><header><div><span class="tiny-label">SOURCE BRIEF · ${escape(providerName(task.provider))}</span><h2 id="task-preview-title">${escape(task.title)}</h2></div>${link ? `<a class="icon-button" href="${escape(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open original task">${icon('external')}</a>` : ''}</header><div class="task-preview-meta"><span class="tag">${escape(task.status)}</span><span>${icon('folder')}${escape(repoName(task.repositoryId))}</span><span class="mono">#${escape(task.id)}</span></div><div class="task-description">${escape(task.description || 'This task has no description. Review the original task before starting work.')}</div><div class="task-revision"><span>Snapshot ${escape(task.revision.slice(0,12))}</span>${task.updatedAt ? `<span>Updated ${escape(ago(task.updatedAt))}</span>` : ''}</div>${state.taskChanged ? '<div class="notice notice-warning task-import-notice" role="alert"><div><strong>The source task changed.</strong><p>This is its latest version. Review the updated brief before creating the session. Your crew and budget choices are preserved.</p></div></div>' : ''}${state.taskPreviewError ? `<div class="form-error task-import-notice" role="alert">${escape(state.taskPreviewError)}</div>` : ''}${bindingNotice}${bindingBlocked ? `<div class="notice task-import-notice"><div><strong>Ploeg binding needs attention.</strong><p>${escape(task.ploegUnavailable?.message || 'This connection needs its registered Ploeg tracker target before you can import work here.')}</p></div></div>` : state.bootstrap.user.role === 'viewer' ? '<div class="notice task-import-notice">Your account can inspect tasks. An operator can create a session.</div>' : blocked ? '<div class="notice task-import-notice">Only open tasks can be imported. Check its state in the source system before starting work.</div>' : `<form data-form="task-import" class="task-import-form"><div class="task-import-heading"><span class="tiny-label">YOUR WORKING AGREEMENT</span><h3>Bring this task onto the floor.</h3><p>The registered repository is fixed by this connection. You choose the crew and spending limit.</p></div><div class="form-grid"><label>Crew<select id="task-crew" name="crewId">${state.bootstrap.crews.map(crew => `<option value="${escape(crew.id)}" ${draft.crewId === crew.id ? 'selected' : ''}>${escape(crew.name)}</option>`).join('')}</select></label><label>Runtime<select id="task-runtime" name="runtime">${state.bootstrap.runtimes.map(runtime => `<option value="${escape(runtime.id)}" ${draft.runtime === runtime.id ? 'selected' : ''}>${escape(runtime.name)}</option>`).join('')}</select></label>${placementField('task', draft.placement)}<label>Session budget · USD<input id="task-budget" name="budgetUsd" type="number" min="0.01" max="${state.bootstrap.maxBudgetUsd}" step="0.01" value="${escape(draft.budgetUsd)}" required></label><div class="task-start-contract">${icon('shield')}<span>Created ready to start.<br>You decide when the crew runs.</span></div></div><button class="button primary full" type="submit" ${state.taskImporting ? 'disabled' : ''}>${state.taskImporting ? 'Creating session…' : 'Create session'} ${icon('arrow')}</button><p class="form-help">The source task stays in its tracker. Importing does not assign it, change its status or start model usage.</p></form>`}</article>`;
}

function renderTasks() {
  const sources = taskSources();
  const source = selectedTaskSource();
  const unlinked = source?.needsLink && !(state.links || []).some(link => link.provider === source.needsLink && link.linked);
  const selected = state.tasks.filter(task => `${task.id} ${task.title}`.toLowerCase().includes(state.taskSearch.toLowerCase()));
  const content = !sources.length ? `<section class="panel"><div class="empty"><span class="empty-icon">${icon('layers')}</span><h2>Your work already has a home.</h2><p>Connect Forgejo, GitHub, GitLab, ClickUp or Vikunja. Bring their tasks into the same remote workbench.</p><button class="button primary" data-action="connections">Set up a connection ${icon('arrow')}</button></div></section>` : `<div class="task-source-strip" role="group" aria-label="Task connections">${sources.map(item => `<button id="task-source-${escape(item.id)}" class="task-source ${state.taskSourceId === item.id ? 'selected' : ''}" data-action="task-source" data-id="${escape(item.id)}" aria-pressed="${state.taskSourceId === item.id}"><span class="source-avatar">${escape(providerName(item.provider).slice(0,1))}</span><span><strong>${escape(item.name)}</strong><small>${escape(providerName(item.provider))}${item.executionOwner === 'ploeg' ? ' · Ploeg managed' : ' · Operator led'}</small></span>${icon('chevron')}</button>`).join('')}</div>${state.bootstrap.mode === 'demo' ? '<div class="task-demo-caption">'+icon('info')+'<span>Sample tracker data. Import the rounding task to run the real demonstration fixture.</span></div>' : ''}<div class="task-grid"><section class="panel task-list-panel" aria-label="Source tasks"><div class="panel-heading"><div><h2>${escape(source?.name || 'Tasks')}</h2><p>${escape(source ? repoName(source.repositoryId) : '')}</p></div><button class="icon-button" data-action="task-refresh" aria-label="Refresh tasks" ${state.taskLoading ? 'disabled' : ''}>${icon('activity')}</button></div><label class="search-box task-search">${icon('search')}<input id="task-search" type="search" aria-label="Search loaded tasks" placeholder="Find a task on this page" value="${escape(state.taskSearch)}"></label><div class="task-list" aria-busy="${state.taskLoading}">${state.taskLoading ? '<div class="empty compact" role="status"><p>Loading tasks from the connection…</p></div>' : state.taskError ? `<div class="empty compact"><h3>Connection needs attention</h3><p role="alert">${escape(state.taskError)}</p><button class="button secondary" data-action="task-refresh">Try again</button></div>` : selected.length ? selected.map(task => `<button id="task-row-${escape(task.id)}" class="task-row ${state.task?.id === task.id ? 'selected' : ''}" data-action="task-preview" data-id="${escape(task.id)}" aria-pressed="${state.task?.id === task.id}"><span class="task-row-meta"><span>#${escape(task.id)}</span><span>${escape(task.status)}</span></span><strong>${escape(task.title)}</strong><span class="task-row-footer">Review brief ${icon('arrow')}</span></button>`).join('') : `<div class="empty compact"><h3>${state.taskSearch ? 'No matching tasks' : 'No open tasks on this page'}</h3><p>${state.taskSearch ? 'Try another title or task number.' : 'Refresh after adding work to the connected project.'}</p></div>`}</div><div class="task-pagination"><button class="button text-button" data-action="task-page" data-page="${state.taskPage - 1}" ${state.taskPage <= 1 || state.taskLoading ? 'disabled' : ''}>${icon('back')} Previous</button><span>Page ${state.taskPage}</span><button class="button text-button" data-action="task-page" data-page="${state.taskNextPage || ''}" ${!state.taskNextPage || state.taskLoading ? 'disabled' : ''}>Next ${icon('arrow')}</button></div></section><section class="panel task-preview-panel">${taskPreviewMarkup()}</section></div>`;
  renderHtml(shell((unlinked ? `<div class="notice notice-warning">${icon('link')}<div><strong>${escape(providerLabels[source.needsLink] || source.needsLink)} is not linked.</strong><p>This connection reads tasks with your own account. <a href="#settings/accounts">Open Linked accounts</a> to link it.</p></div></div>` : '') + content, 'Tasks', 'Your tracker’s work. One shared way to move it forward.'));
}

function openConnections() {
  const dialog = $('#task-connections');
  dialog.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">LINK THE SYSTEMS YOU USE</p><h2 id="connections-title">Your tasks, connected.</h2></div><button class="icon-button" data-action="close-connections" aria-label="Close connections">${icon('x')}</button></header><div class="dialog-body"><div class="provider-chips">${['forgejo','github','gitlab','clickup','vikunja'].map(provider => `<span>${escape(providerName(provider))}</span>`).join('')}</div><p>An administrator links each project or list to a registered repository. Everyone then uses the same task preview and session workflow.</p><ol class="connection-steps"><li><strong>Register the connection</strong><span>Set its provider, server address and project or list in the server’s taskSources configuration.</span></li><li><strong>Supply a read-only credential</strong><span>Store the token in the server environment and reference its variable name in the connection. Credentials stay on the server.</span></li><li><strong>Choose who owns execution</strong><span>Use interactive for standalone sessions. Shared execution uses ploeg with an explicit registered tracker target, so Start claims the existing work item.</span></li></ol><p class="form-help">Setup examples for all five providers ship in docs/operations/task-connections.md. Restart the server after updating its configuration.</p>${taskSources().length ? `<div class="configured-connections"><h3>Registered connections</h3>${taskSources().map(source => `<div><span><strong>${escape(source.name)}</strong><small>${escape(providerName(source.provider))} → ${escape(repoName(source.repositoryId))}</small></span><span class="tag">${source.executionOwner === 'ploeg' ? 'Ploeg managed' : 'Operator led'}</span></div>`).join('')}</div>` : ''}</div><footer class="dialog-footer"><button class="button primary" data-action="close-connections">Done</button></footer>`;
  dialog.showModal();
}

async function loadTasks(sourceId, page = 1) {
  if (!taskSources().some(source => source.id === sourceId)) return;
  const request = ++state.taskRequest;
  ++state.previewRequest;
  state.taskSourceId = sourceId; state.taskPage = page; state.taskNextPage = null; state.task = null; state.taskSearch = ''; state.taskError = ''; state.taskPreviewError = ''; state.taskChanged = false; state.taskLoading = true; state.taskPreviewLoading = false; state.tasks = [];
  if (state.view === 'tasks') renderTasks();
  try {
    const result = await api(`/api/task-sources/${encodeURIComponent(sourceId)}/tasks?page=${page}`);
    if (request !== state.taskRequest) return;
    state.tasks = result.tasks; state.taskNextPage = result.nextPage || null;
  } catch (error) { if (request === state.taskRequest) state.taskError = error.message; }
  finally { if (request === state.taskRequest) { state.taskLoading = false; if (state.view === 'tasks' && state.bootstrap) renderTasks(); } }
}

async function openTask(id, preserveDraft = false) {
  const sourceId = state.taskSourceId;
  const request = ++state.previewRequest;
  state.taskPreviewLoading = true; state.taskPreviewError = ''; state.taskChanged = preserveDraft;
  if (!preserveDraft) state.taskDraft = { crewId: state.bootstrap.crews[0]?.id || '', runtime: state.bootstrap.runtimes[0]?.id || '', budgetUsd: Math.min(5, state.bootstrap.maxBudgetUsd) };
  renderTasks();
  try {
    const task = await api(`/api/task-sources/${encodeURIComponent(sourceId)}/tasks/${encodeURIComponent(id)}`);
    if (request !== state.previewRequest || sourceId !== state.taskSourceId) return;
    state.task = task;
    if (state.view === 'tasks') announce(`Task preview ready: ${task.title}`);
  } catch (error) { if (request === state.previewRequest) { state.task = null; state.taskPreviewError = error.message; } }
  finally { if (request === state.previewRequest) { state.taskPreviewLoading = false; if (state.view === 'tasks' && state.bootstrap) renderTasks(); } }
}

async function loadTaskPage() {
  if (state.view === 'tasks' && !state.links) { try { state.links = (await api('/api/links')).links; } catch { state.links = []; } }
  if (state.view === 'tasks' && taskSources().length) await loadTasks(state.taskSourceId || taskSources()[0].id);
}

async function importTask(data) {
  if (state.taskImporting || !state.task) return;
  state.taskImporting = true;
  const selected = state.task;
  const existingIds = new Set(state.sessions.map(session => session.id));
  try {
    const session = await api('/api/task-imports', { method: 'POST', body: JSON.stringify({ sourceId: selected.sourceId, taskId: selected.id, revision: selected.revision, ...(selected.bindingRevision ? { bindingRevision: selected.bindingRevision } : {}), crewId: data.crewId, runtime: data.runtime, ...(data.placement ? { placement: data.placement } : {}), budgetUsd: Number(data.budgetUsd) }) });
    state.sessions = [session, ...state.sessions.filter(item => item.id !== session.id)]; state.tab = 'stream';
    location.hash = `session/${session.id}`;
    notify(existingIds.has(session.id) ? 'Opened the existing session for this task. No additional work was started.' : 'Task imported. Review the brief, then start the crew when you are ready.');
  } catch (error) {
    if (error.status === 409 && ['task_changed', 'task_binding_changed'].includes(error.code) && state.view === 'tasks' && state.taskSourceId === selected.sourceId) {
      await openTask(selected.id, true);
      state.taskPreviewError = error.message;
    } else state.taskPreviewError = error.message;
    if (state.view === 'tasks') renderTasks();
    notify(error.message, true);
  } finally { state.taskImporting = false; if (state.view === 'tasks') renderTasks(); }
}

function keepTaskDraft(element, event) { if (state.taskDraft) state.taskDraft[event.target.name] = event.target.value; }

/** The Tasks page: task connections, the task list and the source brief preview with its import form, and the connections dialog. */
export default {
  id: 'tasks',
  match: hash => hash === 'tasks' ? {} : null,
  load: loadTaskPage,
  render: renderTasks,
  actions: {
    connections: () => openConnections(),
    'close-connections': () => $('#task-connections').close(),
    'task-source': button => loadTasks(button.dataset.id),
    'task-refresh': () => loadTasks(state.taskSourceId, state.taskPage),
    'task-page': button => loadTasks(state.taskSourceId, Number(button.dataset.page)),
    'task-preview': button => openTask(button.dataset.id),
  },
  forms: { 'task-import': importTask },
  inputs: {
    '#task-search': element => { state.taskSearch = element.value; renderTasks(); },
    '[data-form="task-import"]': keepTaskDraft,
  },
  changes: { '[data-form="task-import"]': keepTaskDraft },
};
