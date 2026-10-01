import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, safeUrl, renderHtml, notify, announce } from '../core/dom.js';
import { amountText, dateTime, money, parseAmount, plural, relative } from '../core/format.js';
import { icon } from '../core/icons.js';
import { markdown } from '../core/markdown.js';
import { parseHash, buildHash } from '../core/route.js';
import { singleKeyAllowed } from '../core/keys.js';
import { sessionStatus, workItemState } from '../core/states.js';
import { badge, budgetInput, button, callout, chip, count, demoNote, demoSessionsText, disclosure, emptyState, skeleton, stateBadge, timeAgo } from '../core/ui.js';
import { repoName, taskSources, selectedTaskSource, providerName, providerLabels } from '../core/lookup.js';
import { shell } from '../shell.js';

const trackers = ['forgejo', 'github', 'gitlab', 'clickup', 'vikunja'];
const statuses = { open: ['Open', 'circle'], closed: ['Closed', 'check-circle'], unknown: ['Status unknown', 'help-circle'] };
const longBrief = 1200;

let requestedId = '';
let previewFailed = false;
let listErrorCode = '';
let briefExpanded = false;
let ploegStatus = null;
let ploegLoading = false;
let ploegError = '';
let ploegBusy = '';
let ploegTeam = '';
let ploegRequest = 0;

const act = (attribute, options) => button(options).replace('<button ', `<button ${attribute} `);
const ownerLabel = source => source?.executionOwner === 'ploeg' ? 'Runs on Ploeg' : 'Sessions here';
const ploegOwned = source => source?.executionOwner === 'ploeg';
const settledStates = ['done', 'withdrawn', 'stale'];
const sessionFor = task => state.sessions.find(session => session.sourceTask?.sourceId === task.sourceId && session.sourceTask?.id === task.id);
const briefText = task => typeof task.descriptionMarkdown === 'string' ? task.descriptionMarkdown : task.description || '';
const importNote = where => `<p class="tasks-import-note" data-where="${where}">${icon('lock')}<span>Nothing runs until you press Start on the session. The task stays as it is in its tracker.</span></p>`;
const visible = element => Boolean(element) && (typeof element.checkVisibility === 'function' ? element.checkVisibility() : element.getClientRects().length > 0);
const onTasks = () => state.view === 'tasks' && Boolean(state.bootstrap);

function remember(taskId = '') {
  const hash = `#${buildHash('tasks', { source: state.taskSourceId, task: taskId })}`;
  if (state.view === 'tasks' && location.hash !== hash) history.replaceState(null, '', hash);
}

/** The Work Item that says where a task stands with Ploeg: the first one still in progress, otherwise the most recent. */
export function currentWorkItem(status) { return status.workItems.find(item => !settledStates.includes(item.state)) || status.workItems[0]; }

/** Whether the Ploeg card offers a hand-off: Ploeg answered and allows it, the task is open, no team holds it, and a team is on offer. */
export function canHandOff(status, task) {
  const item = currentWorkItem(status);
  return status.available && status.handoff.allowed && task.status === 'open' && !status.assignedTeams.length && (!item || settledStates.includes(item.state)) && status.teams.length > 0;
}

/** Whether the Ploeg card offers taking the task back: a team's tracker user is on it and Ploeg has not started. */
export function canTakeBack(status) {
  const item = currentWorkItem(status);
  return status.available && status.handoff.allowed && status.assignedTeams.length > 0 && (!item || item.state === 'queued' || settledStates.includes(item.state));
}

/** Where a task stands with Ploeg: a headline, the next step and the tone of the state it reports. */
export function ploegSituation(status, task) {
  if (!status.available) return { tone: 'neutral', headline: status.message || 'Ploeg status is unavailable.', next: '' };
  const item = currentWorkItem(status);
  if (item && !settledStates.includes(item.state)) {
    const team = item.team;
    switch (item.state) {
      case 'queued': return { tone: 'neutral', headline: `Queued for team ${team}.`, next: `Ploeg starts it when a ${team} worker is free. You can take it back until then.` };
      case 'ingested': return { tone: 'neutral', headline: `Team ${team} received it.`, next: 'Ploeg is preparing it for the queue.' };
      case 'leased': return { tone: 'live', headline: `Team ${team} is working on it.`, next: 'Follow its Runs on the Work Item page.' };
      case 'awaiting_review': return { tone: 'review', headline: 'A pull request is ready for your review.', next: 'Review and merge it on the forge, or request changes there.' };
      case 'needs_human': return { tone: 'attention', headline: `Team ${team} stopped and needs you.`, next: 'Open the Work Item to read why, then decide how to continue.' };
      case 'proposed': return { tone: 'neutral', headline: 'An agent proposed this as follow-up work.', next: 'Approve or reject it under Proposed.' };
      default: return { tone: workItemState(item.state).tone, headline: `${workItemState(item.state).label} in team ${team}.`, next: '' };
    }
  }
  if (status.assignedTeams.length) return { tone: 'neutral', headline: `Assigned to ${status.assignedTeams.join(', ')}. Waiting for Ploeg to queue it.`, next: 'Ploeg normally queues an assigned task within seconds. If this stays, check the board’s webhook and routing in Ploeg.' };
  const again = canHandOff(status, task);
  if (item?.state === 'done') return { tone: 'success', headline: `Done by team ${item.team}.`, next: task.status === 'open' && again ? 'The task is still open in the tracker. Hand it over again if more work is needed.' : '' };
  if (item?.state === 'withdrawn') return { tone: 'neutral', headline: `Taken back from team ${item.team}.`, next: again ? 'Hand it over again when it is ready.' : '' };
  if (item?.state === 'stale') return { tone: 'severe', headline: `Team ${item.team} stopped retrying.`, next: 'Open the Work Item to read why. Hand it over again once the cause is fixed.' };
  if (task.status !== 'open') return { tone: 'neutral', headline: 'This task is closed in the tracker.', next: 'Reopen it there before you hand it to Ploeg.' };
  return { tone: 'neutral', headline: 'Not with Ploeg yet.', next: again ? 'Choose a team to hand it over. Ploeg works on a branch and opens a pull request for your review; nothing merges without you.' : '' };
}

function statusBadge(status, style) {
  const [label, glyph] = statuses[status] || statuses.unknown;
  return badge({ label, glyph, tone: 'neutral', size: 'sm', style });
}

function filteredTasks() {
  const search = state.taskSearch.trim().toLowerCase();
  return state.tasks.filter(task => `${task.id} ${task.title}`.toLowerCase().includes(search));
}

function taskRow(task) {
  const selected = requestedId === String(task.id);
  const session = sessionFor(task);
  const updated = task.updatedAt ? `<span class="tasks-row-dot" aria-hidden="true">·</span>${timeAgo(task.updatedAt)}` : '';
  const holders = (task.assignees || []).map(person => person.username);
  const held = holders.length ? badge({ label: holders.length > 2 ? `${holders.slice(0, 2).join(', ')} +${holders.length - 2}` : holders.join(', '), glyph: 'user', tone: 'neutral', size: 'sm', style: 'plain', title: `Assigned to ${holders.join(', ')}` }) : '';
  const meta = `<span class="num">#${escape(task.id)}</span>${task.status === 'open' ? '' : statusBadge(task.status, 'plain')}${held}${session ? badge({ label: 'Has a session', glyph: 'sessions', tone: 'neutral', size: 'sm', style: 'plain' }) : ''}${updated}`;
  return `<li><button type="button" class="list-row tasks-row" id="task-row-${escape(task.id)}" data-action="task-preview" data-id="${escape(task.id)}"${selected ? ' aria-current="true"' : ''}><span class="list-row-main"><span class="list-row-title" title="${escape(task.title)}">${escape(task.title)}</span><span class="list-row-meta">${meta}</span></span></button></li>`;
}

function listBody(source) {
  if (state.taskLoading) return `<div class="tasks-list-state" aria-busy="true">${skeleton({ rows: 5 })}</div>`;
  if (state.taskError) {
    const unlinked = listErrorCode === 'source_unlinked';
    const actions = unlinked ? button({ label: 'Open Linked accounts', href: '#settings/accounts', size: 'sm', variant: 'primary' }) : act('data-action="task-refresh"', { label: 'Try again', icon: 'refresh', size: 'sm' });
    return emptyState({ tone: unlinked ? 'attention' : 'danger', icon: unlinked ? 'link' : 'x-circle', title: unlinked ? 'Link your account first' : 'Could not load tasks', body: `<span role="alert">${escape(state.taskError)}</span>`, actions });
  }
  const shown = filteredTasks();
  if (!shown.length && state.taskSearch.trim()) return emptyState({ icon: 'search', title: 'No tasks match', body: `Nothing on this page matches “${escape(state.taskSearch.trim())}”. Search covers titles and numbers.`, actions: act('data-action="task-search-clear"', { label: 'Clear search', size: 'sm' }) });
  if (!shown.length) return emptyState({ icon: 'inbox', title: state.taskPage > 1 ? 'No open tasks on this page' : 'No open tasks', body: `Open tasks in ${escape(source?.name || 'this connection')} show up here. Refresh after you add one.`, actions: act('data-action="task-refresh"', { label: 'Refresh', icon: 'refresh', size: 'sm' }) });
  return `<ul class="list tasks-list" aria-label="Tasks">${shown.map(taskRow).join('')}</ul>`;
}

function pagination() {
  if (state.taskPage <= 1 && !state.taskNextPage) return '';
  return `<footer class="tasks-pagination">${act('data-action="task-page"', { label: 'Previous', icon: 'chevron-left', variant: 'ghost', size: 'sm', data: { page: state.taskPage - 1 }, disabled: state.taskPage <= 1 || state.taskLoading })}<span class="tasks-page-number num">Page ${state.taskPage}</span>${act('data-action="task-page"', { label: 'Next', icon: 'chevron', variant: 'ghost', size: 'sm', data: { page: state.taskNextPage || '' }, disabled: !state.taskNextPage || state.taskLoading })}</footer>`;
}

function listCount() {
  if (state.taskLoading || state.taskError || !state.tasks.length || state.taskPage > 1) return '';
  const total = state.tasks.length;
  return state.taskNextPage ? count(`${total}+`, { label: `${total} on this page, more on the next` }) : count(total);
}

function listTitle(source, sources) {
  if (sources.length < 2) return `<h2 class="card-title" id="tasks-source-title">${escape(source?.name || 'Tasks')}${listCount()}</h2>`;
  const picker = `<select id="task-source" class="tasks-source-select">${sources.map(entry => `<option value="${escape(entry.id)}"${state.taskSourceId === entry.id ? ' selected' : ''}>${escape(entry.name)}</option>`).join('')}</select>`;
  return `<h2 class="card-title tasks-source-title" id="tasks-source-title"><label class="sr-only" for="task-source">Connection</label>${picker}${listCount()}</h2>`;
}

function listPane(source, sources) {
  const refresh = act('data-action="task-refresh"', { icon: 'refresh', ariaLabel: 'Refresh tasks', title: 'Refresh tasks', variant: 'ghost', size: 'sm', disabled: state.taskLoading });
  const search = `<div class="tasks-search-row"><label class="tasks-search">${icon('search')}<span class="sr-only">Search loaded tasks</span><input id="task-search" type="search" placeholder="Filter by title or number" value="${escape(state.taskSearch)}" autocomplete="off"></label></div>`;
  const subtitle = `${escape(providerName(source?.provider))} · ${escape(repoName(source?.repositoryId))} · ${ownerLabel(source)}`;
  return `<section class="card tasks-list-card" aria-labelledby="tasks-source-title"><header class="card-header tasks-list-header"><div class="card-heading">${listTitle(source, sources)}<p class="card-subtitle">${subtitle}</p></div><div class="card-actions">${refresh}</div></header>${search}<div class="tasks-list-body">${listBody(source)}</div>${pagination()}</section>`;
}

function field(id, label, control, hint = '') {
  return `<div class="field"><label class="field-label" for="${id}">${escape(label)}</label>${control}${hint ? `<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}</div>`;
}

function options(list, selected) {
  return list.map(item => `<option value="${escape(item.id)}"${selected === item.id ? ' selected' : ''}>${escape(item.name)}</option>`).join('');
}

function runtimeField(runtimes, selected) {
  if (runtimes.length > 1) return field('task-runtime', 'Runtime', `<select id="task-runtime" name="runtime">${options(runtimes, selected)}</select>`);
  const only = runtimes[0];
  return `<div class="field"><span class="field-label" id="task-runtime-label">Runtime</span><p class="tasks-readonly" aria-labelledby="task-runtime-label">${escape(only?.name || 'None registered')}</p><input type="hidden" name="runtime" value="${escape(only?.id || '')}"></div>`;
}

function importForm(task) {
  const draft = state.taskDraft;
  const boot = state.bootstrap;
  const crew = boot.crews.find(entry => entry.id === draft.crewId) || boot.crews[0];
  const placements = boot.placements || [];
  const placement = draft.placement || placements.find(entry => entry.default)?.id || placements[0]?.id;
  const budget = budgetInput({ id: 'task-budget', name: 'budgetUsd', value: draft.budgetUsd, attrs: 'aria-describedby="task-budget-hint"' });
  const fields = [
    field('task-crew', 'Crew', `<select id="task-crew" name="crewId" aria-describedby="task-crew-hint">${options(boot.crews, draft.crewId)}</select>`, escape(crew ? crew.roles.map(role => role.name).join(' and ') : '')),
    runtimeField(boot.runtimes || [], draft.runtime),
    placements.length > 1 ? field('task-placement', 'Workspace placement', `<select id="task-placement" name="placement">${options(placements, placement)}</select>`) : '',
    field('task-budget', 'Session budget', budget, `At most ${escape(money(boot.maxBudgetUsd))} per session.`),
  ].join('');
  const form = `<form id="task-import-form" class="tasks-import-fields" data-form="task-import">${fields}${importNote('form')}</form>`;
  return `<section class="card tasks-import" aria-labelledby="task-import-title"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="task-import-title">Bring this task onto the floor</h3><p class="card-subtitle">Creates a queued session for ${escape(repoName(task.repositoryId))} with the crew and budget you choose.</p></div></header>${form}</section>`;
}

function decisionBar() {
  const submit = button({ type: 'submit', variant: 'primary', icon: 'plus', label: state.taskImporting ? 'Creating session…' : 'Create session', busy: state.taskImporting, id: 'task-import-submit' }).replace('<button ', '<button form="task-import-form" ');
  return `<div class="tasks-decision"><div class="tasks-decision-bar">${importNote('bar')}${submit}</div></div>`;
}

function importArea(task, source) {
  const role = state.bootstrap.user.role;
  const shared = state.bootstrap.sharedExecution;
  if (ploegOwned(source) && !task.ploeg) return '';
  const bindingBlocked = shared ? !task.ploeg || Boolean(task.ploegUnavailable) : ploegOwned(source);
  if (bindingBlocked) return callout({ tone: 'attention', title: 'Ploeg binding needs attention', body: `<p>${escape(task.ploegUnavailable?.message || 'This connection needs its registered Ploeg tracker target before you can import work here.')}</p>` });
  if (role === 'viewer') return callout({ tone: 'neutral', icon: 'eye', title: 'Your account can read tasks', body: '<p>An operator or administrator brings them onto the floor.</p>' });
  if (task.status !== 'open') return callout({ tone: 'neutral', title: 'Only open tasks can be imported', body: `<p>This task is ${escape((statuses[task.status] || statuses.unknown)[0].toLowerCase())}. Reopen it in its tracker first.</p>` });
  return `${importForm(task)}${decisionBar()}`;
}

function notices(task) {
  const parts = [];
  if (state.taskChanged) parts.push(callout({ tone: 'attention', title: 'The source task changed', body: '<p>This is its latest version. Read the updated brief before you create the session. Your crew and budget choices are kept.</p>' }));
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

function workItemRow(item) {
  const spend = typeof item.spentUsd === 'number' ? `<span class="num">${escape(money(item.spentUsd))}${typeof item.budgetUsd === 'number' ? ` of ${escape(money(item.budgetUsd))}` : ''}</span>` : '';
  const attempts = item.attempts ? `<span>${escape(plural(item.attempts, 'attempt'))}</span>` : '';
  const pull = safeUrl(item.prUrl);
  const review = pull ? button({ label: item.state === 'awaiting_review' ? 'Review pull request' : 'Pull request', icon: 'pull-request', href: pull, external: true, size: 'sm', variant: item.state === 'awaiting_review' ? 'primary' : 'secondary' }) : '';
  return `<li class="tasks-work-item">${stateBadge(item.state)}<a href="#work/${escape(item.id)}">Work Item #${escape(item.id)}</a><span>Team ${escape(item.team)}</span>${attempts}${spend}${item.updatedAt ? timeAgo(item.updatedAt) : ''}${review ? `<span class="tasks-work-item-actions">${review}</span>` : ''}</li>`;
}

function teamPicker(status) {
  const teams = status.teams;
  if (!teams.some(team => team.id === ploegTeam)) ploegTeam = teams.find(team => !team.paused)?.id || teams[0]?.id || '';
  const chosen = teams.find(team => team.id === ploegTeam);
  const choices = teams.map(team => `<label class="tasks-team-option" for="task-team-${escape(team.id)}"><input type="radio" id="task-team-${escape(team.id)}" name="team" value="${escape(team.id)}"${team.id === ploegTeam ? ' checked' : ''}${ploegBusy ? ' disabled' : ''}><span><span class="tasks-team-name">${escape(team.id)}${team.paused ? badge({ label: 'Paused', glyph: 'pause-circle', tone: 'attention', size: 'sm' }) : ''}</span><span class="tasks-team-hint">${escape(team.roles.length ? team.roles.join(' → ') : 'No roles')} · ${escape(team.queueDepth)} queued</span></span></label>`).join('');
  const submit = button({ type: 'submit', variant: 'primary', icon: 'arrow', label: ploegBusy === 'handoff' ? 'Handing over…' : `Hand to ${chosen.id}`, busy: ploegBusy === 'handoff', disabled: Boolean(ploegBusy), id: 'task-handoff-submit' });
  return `<form class="tasks-handoff" data-form="task-handoff"><fieldset class="tasks-handoff-teams"><legend class="field-label">Hand to Ploeg</legend><div class="tasks-team-options">${choices}</div></fieldset><div class="tasks-handoff-actions">${submit}<p class="field-hint">Assigns “${escape(chosen.assignee)}” in ${escape(providerName(state.task?.provider))} and comments that you handed it over.</p></div></form>`;
}

function ploegBody(task) {
  if (ploegLoading && !ploegStatus) return skeleton({ rows: 2, variant: 'text' });
  if (ploegError && !ploegStatus) return `<div role="alert">${callout({ tone: 'danger', title: 'Could not read this task’s Ploeg status', body: `<p>${escape(ploegError)}</p>`, actions: act('data-action="task-ploeg-refresh"', { label: 'Try again', icon: 'refresh', size: 'sm' }) })}</div>`;
  if (!ploegStatus) return '';
  const status = ploegStatus;
  const situation = ploegSituation(status, task);
  const item = currentWorkItem(status);
  const parts = [`<div role="status">${callout({ tone: situation.tone, title: situation.headline, body: situation.next ? `<p>${escape(situation.next)}</p>` : '' })}</div>`];
  if (ploegError) parts.push(`<div role="alert">${callout({ tone: 'danger', title: 'Ploeg did not take that change', body: `<p>${escape(ploegError)}</p>` })}</div>`);
  if (status.workItems.length) parts.push(`<ul class="tasks-work-items" aria-label="Ploeg Work Items for this task">${status.workItems.map(workItemRow).join('')}</ul>`);
  if (canHandOff(status, task)) parts.push(teamPicker(status));
  else if (status.available && !status.handoff.allowed && status.handoff.reason && (!item || settledStates.includes(item.state))) parts.push(`<p class="tasks-ploeg-reason">${escape(status.handoff.reason)}</p>`);
  if (canTakeBack(status)) parts.push(`<div class="tasks-ploeg-actions">${status.assignedTeams.map(team => act('data-action="task-take-back"', { label: ploegBusy === 'take-back' ? 'Taking back…' : `Take back from ${team}`, icon: 'back', size: 'sm', data: { team }, busy: ploegBusy === 'take-back', disabled: Boolean(ploegBusy) })).join('')}</div>`);
  return parts.join('');
}

function ploegCard(task) {
  const checked = ploegStatus?.fetchedAt ? `Checked ${relative(new Date(ploegStatus.fetchedAt))}` : '';
  const refresh = act('data-action="task-ploeg-refresh"', { icon: 'refresh', ariaLabel: 'Check Ploeg again', title: 'Check Ploeg again', variant: 'ghost', size: 'sm', disabled: ploegLoading || Boolean(ploegBusy) });
  return `<section class="card tasks-ploeg" aria-labelledby="task-ploeg-title" aria-busy="${ploegLoading ? 'true' : 'false'}"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="task-ploeg-title">${icon('work')}Ploeg</h3>${checked ? `<p class="card-subtitle">${escape(checked)}</p>` : ''}</div><div class="card-actions">${refresh}</div></header><div class="card-body tasks-ploeg-body">${ploegBody(task)}</div></section>`;
}

function brief(task) {
  const text = briefText(task).trim();
  if (!text) return '<p class="tasks-brief-empty">This task has no description. Read the original task before you start work.</p>';
  const long = text.length > longBrief || text.split('\n').length > 24;
  const toggle = long ? act('data-action="task-brief"', { label: briefExpanded ? 'Show less' : 'Show the whole brief', icon: briefExpanded ? 'chevron-up' : 'chevron-down', variant: 'ghost', size: 'sm' }) : '';
  return `<div class="tasks-brief${long && !briefExpanded ? ' is-clipped' : ''}"><div class="prose" id="task-brief">${markdown(text)}</div></div>${toggle ? `<div class="tasks-brief-toggle">${toggle}</div>` : ''}`;
}

function updated(task) {
  if (!task.updatedAt) return '';
  const moment = new Date(task.updatedAt);
  if (Number.isNaN(moment.getTime())) return '';
  const title = [dateTime(moment), task.revision ? `revision ${task.revision.slice(0, 12)}` : ''].filter(Boolean).join(' · ');
  return `<span class="tasks-updated">Updated <time class="num" datetime="${escape(moment.toISOString())}" title="${escape(title)}">${escape(relative(moment))}</time></span>`;
}

function detailHeader(task) {
  const link = safeUrl(task.url);
  const open = link ? button({ label: task.provider === 'demo' ? 'Open original' : `Open in ${providerName(task.provider)}`, href: link, external: true, size: 'sm' }) : '';
  return `<header class="tasks-task-header"><div class="tasks-task-heading"><p class="overline">${escape(providerName(task.provider))} · #${escape(task.id)}</p><h2 class="tasks-task-title" id="task-preview-title" tabindex="-1">${escape(task.title)}</h2></div><div class="tasks-task-meta">${statusBadge(task.status)}${chip({ label: repoName(task.repositoryId), icon: 'folder', title: 'Registered repository' })}${updated(task)}${open ? `<span class="tasks-task-actions">${open}</span>` : ''}</div></header>`;
}

function detailPane(source) {
  if (state.taskPreviewLoading || (state.taskLoading && !state.task)) return `<div class="tasks-detail" aria-busy="true"><article class="card tasks-task tasks-task-loading"><div class="tasks-task-header">${skeleton({ rows: 1, variant: 'text' })}</div><div class="tasks-task-body">${skeleton({ rows: 6, variant: 'text' })}</div></article></div>`;
  if (previewFailed && !state.task) {
    return `<div class="tasks-detail"><article class="card tasks-task">${emptyState({ tone: 'danger', icon: 'x-circle', title: 'Could not open this task', body: `<span role="alert">${escape(state.taskPreviewError)}</span>`, actions: act('data-action="task-preview"', { label: 'Try again', icon: 'refresh', size: 'sm', data: { id: requestedId } }) })}</article></div>`;
  }
  const task = state.task;
  if (!task) return `<div class="tasks-detail"><article class="card tasks-task tasks-task-empty">${emptyState({ compact: true, icon: 'tasks', title: 'Select a task', body: 'Pick a task from the list to read its brief.' })}</article></div>`;
  return `<div class="tasks-detail"><article class="card tasks-task" aria-labelledby="task-preview-title">${detailHeader(task)}<div class="tasks-task-body">${brief(task)}</div></article>${ploegOwned(source) ? ploegCard(task) : ''}${notices(task)}${importArea(task, source)}</div>`;
}

function unlinkedNotice(source) {
  if (!source?.needsLink || listErrorCode === 'source_unlinked' || (state.links || []).some(link => link.provider === source.needsLink && link.linked)) return '';
  const label = providerLabels[source.needsLink] || source.needsLink;
  return callout({ tone: 'attention', icon: 'link', title: `${label} is not linked`, body: `<p>${escape(source.name)} reads tasks with your own ${escape(label)} account.</p>`, actions: button({ label: 'Open Linked accounts', href: '#settings/accounts', size: 'sm' }) });
}

function layoutFocus() {
  if (state.task || state.taskPreviewLoading || previewFailed) return 'detail';
  if (state.taskLoading) return 'list';
  if (state.taskError || !filteredTasks().length) return 'solo';
  return 'list';
}

function renderTasks() {
  const sources = taskSources();
  const source = selectedTaskSource();
  const actions = act('data-action="connections"', { label: 'Connections', icon: 'link' });
  const page = { title: 'Tasks', subtitle: ploegOwned(source) ? 'Read a task from your tracker, then hand it to a Ploeg team.' : 'Preview a task from your tracker, then bring it onto the floor as a session.', actions };
  if (!sources.length) {
    const body = emptyState({ icon: 'link', title: 'No task connections yet', body: 'An administrator connects a tracker project to a registered repository. Its open tasks then show up here, ready to preview.', actions: act('data-action="connections"', { label: 'How connections work', variant: 'primary' }) });
    renderHtml(shell(`<div class="tasks-page"><section class="card tasks-first-run">${body}</section></div>`, page));
    return;
  }
  const focus = layoutFocus();
  const demo = state.bootstrap.mode === 'demo' ? demoNote(demoSessionsText) : '';
  const content = `<div class="tasks-page">${unlinkedNotice(source)}${demo}<div class="tasks-layout" data-focus="${focus === 'solo' ? 'list' : focus}"${focus === 'solo' ? ' data-solo' : ''}>${listPane(source, sources)}${focus === 'solo' ? '' : detailPane(source)}</div></div>`;
  renderHtml(shell(content, focus === 'detail' ? { ...page, back: { label: 'All tasks', action: 'task-close', id: 'task-back' } } : page));
}

function settleFocus(fromRow) {
  const active = document.activeElement;
  if (!fromRow || (active && active !== document.body && visible(active))) return;
  const target = [document.getElementById('task-preview-title'), document.getElementById('task-back')].find(visible);
  target?.focus({ preventScroll: true });
}

function revealDetail() {
  const detail = document.querySelector('.tasks-detail');
  if (visible(detail) && detail.getBoundingClientRect().top < 0) detail.scrollIntoView({ block: 'start' });
}

function paneBesideList() {
  return visible(document.querySelector('.tasks-list-card')) && visible(document.querySelector('.tasks-detail'));
}

function providerMark(provider) {
  return chip({ label: providerName(provider) });
}

function openConnections() {
  const dialog = $('#task-connections');
  const sources = taskSources();
  const registered = sources.length
    ? `<ul class="connections-list">${sources.map(source => `<li class="connections-item"><span class="connections-main"><strong>${escape(source.name)}</strong><span class="connections-meta">${escape(providerName(source.provider))} ${icon('arrow')} ${escape(repoName(source.repositoryId))}</span></span>${badge({ label: ownerLabel(source), tone: 'neutral', size: 'sm' })}</li>`).join('')}</ul>`
    : '<p class="connections-none">None yet. Tasks stays empty until an administrator adds one.</p>';
  const steps = `<ol class="connections-steps"><li><strong>Register the connection</strong><span>Add it to the server’s <code>taskSources</code> configuration: the tracker, its address, the project or list, and the registered repository it feeds.</span></li><li><strong>Give it a read-only token</strong><span>Put the token in the server environment and name that variable in the connection. It never leaves the server.</span></li><li><strong>Choose who runs the work</strong><span><code>interactive</code> keeps the sessions here. <code>ploeg</code> hands the tasks to a Ploeg Team through its registered tracker target.</span></li></ol><p class="connections-help">Examples for all five trackers are in <code>docs/operations/task-connections.md</code>. Restart the server after you change its configuration.</p>`;
  dialog.className = 'dialog connections-dialog';
  dialog.innerHTML = `<div class="dialog-frame"><header class="dialog-header"><h2 id="connections-title">Your tasks, connected</h2>${act('data-action="close-connections"', { icon: 'x', ariaLabel: 'Close', title: 'Close', variant: 'ghost', size: 'sm' })}</header><div class="dialog-body"><p class="connections-intro">Each connection reads one project or list from a tracker and feeds its tasks to one registered repository. Credentials stay on the server.</p><section class="connections-section" aria-labelledby="connections-registered"><h3 id="connections-registered" class="overline">Registered on this workbench</h3>${registered}</section><section class="connections-section" aria-labelledby="connections-supported"><h3 id="connections-supported" class="overline">Trackers you can connect</h3><ul class="connections-trackers">${trackers.map(provider => `<li>${providerMark(provider)}</li>`).join('')}</ul></section>${disclosure({ summary: 'How an administrator adds a connection', open: !sources.length, body: steps })}</div><footer class="dialog-footer">${act('data-action="close-connections"', { label: 'Done', variant: 'primary' })}</footer></div>`;
  dialog.showModal();
}

async function loadTasks(sourceId, page = 1, { keepTask = '' } = {}) {
  if (!taskSources().some(source => source.id === sourceId)) return;
  const request = ++state.taskRequest;
  ++state.previewRequest;
  state.taskSourceId = sourceId; state.taskPage = page; state.taskNextPage = null; state.task = null; state.taskSearch = ''; state.taskError = ''; state.taskPreviewError = ''; state.taskChanged = false; state.taskLoading = true; state.taskPreviewLoading = false; state.tasks = [];
  requestedId = ''; previewFailed = false; listErrorCode = '';
  resetPloeg();
  remember();
  if (onTasks()) renderTasks();
  try {
    const result = await api(`/api/task-sources/${encodeURIComponent(sourceId)}/tasks?page=${page}`);
    if (request !== state.taskRequest) return;
    state.tasks = result.tasks; state.taskNextPage = result.nextPage || null;
  } catch (error) { if (request === state.taskRequest) { state.taskError = error.message; listErrorCode = error.code || ''; } }
  finally { if (request === state.taskRequest) { state.taskLoading = false; if (onTasks()) renderTasks(); } }
  if (request !== state.taskRequest || !onTasks() || state.taskError) return;
  const first = state.tasks[0]?.id;
  const open = keepTask || (first !== undefined && paneBesideList() ? String(first) : '');
  if (open) await openTask(open);
}

async function openTask(id, preserveDraft = false) {
  const sourceId = state.taskSourceId;
  const request = ++state.previewRequest;
  const fromRow = Boolean(document.activeElement?.closest?.('.tasks-row'));
  requestedId = String(id); previewFailed = false; briefExpanded = false;
  state.taskPreviewLoading = true; state.taskPreviewError = ''; state.taskChanged = preserveDraft;
  if (!preserveDraft) state.taskDraft = { crewId: state.bootstrap.crews[0]?.id || '', runtime: state.bootstrap.runtimes[0]?.id || '', budgetUsd: amountText(Math.min(5, state.bootstrap.maxBudgetUsd)) };
  remember(requestedId);
  if (!preserveDraft) resetPloeg();
  if (ploegOwned(selectedTaskSource())) loadPloeg(sourceId, requestedId);
  if (onTasks()) { renderTasks(); settleFocus(fromRow); revealDetail(); }
  try {
    const task = await api(`/api/task-sources/${encodeURIComponent(sourceId)}/tasks/${encodeURIComponent(id)}`);
    if (request !== state.previewRequest || sourceId !== state.taskSourceId) return;
    state.task = task;
    if (state.view === 'tasks') announce(`Task preview ready: ${task.title}`);
  } catch (error) { if (request === state.previewRequest) { state.task = null; state.taskPreviewError = error.message; previewFailed = true; } }
  finally { if (request === state.previewRequest) { state.taskPreviewLoading = false; if (onTasks()) { renderTasks(); settleFocus(fromRow); } } }
}

function closeTask() {
  ++state.previewRequest;
  resetPloeg();
  state.task = null; state.taskPreviewLoading = false; state.taskPreviewError = ''; state.taskChanged = false;
  const id = requestedId;
  requestedId = ''; previewFailed = false;
  remember();
  renderTasks();
  const row = document.getElementById(`task-row-${id}`);
  if (visible(row)) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' }); }
}

function resetPloeg() {
  ++ploegRequest;
  ploegStatus = null; ploegLoading = false; ploegError = ''; ploegBusy = '';
}

const ploegPath = (sourceId, id, tail) => `/api/task-sources/${encodeURIComponent(sourceId)}/tasks/${encodeURIComponent(id)}/${tail}`;

async function loadPloeg(sourceId, id, fresh = false) {
  const request = ++ploegRequest;
  ploegLoading = true;
  try {
    const status = await api(ploegPath(sourceId, id, `ploeg${fresh ? '?refresh=1' : ''}`));
    if (request !== ploegRequest) return;
    ploegStatus = status; ploegError = '';
  } catch (error) { if (request === ploegRequest) ploegError = error.message; }
  finally { if (request === ploegRequest) { ploegLoading = false; if (onTasks()) renderTasks(); } }
}

async function refreshTask(sourceId, id) {
  try {
    const task = await api(`/api/task-sources/${encodeURIComponent(sourceId)}/tasks/${encodeURIComponent(id)}`);
    if (sourceId !== state.taskSourceId || requestedId !== String(id)) return;
    state.task = task;
    state.tasks = state.tasks.map(entry => entry.id === task.id ? { ...entry, assignees: task.assignees, updatedAt: task.updatedAt } : entry);
  } catch {}
}

async function changePloeg(kind, team) {
  const task = state.task;
  if (!task || ploegBusy) return;
  const sourceId = state.taskSourceId;
  const id = String(task.id);
  const request = ++ploegRequest;
  ploegBusy = kind; ploegError = '';
  if (onTasks()) renderTasks();
  try {
    const status = kind === 'handoff'
      ? await api(ploegPath(sourceId, id, 'handoff'), { method: 'POST', body: JSON.stringify({ team, revision: task.revision }) })
      : await api(`${ploegPath(sourceId, id, 'handoff')}?team=${encodeURIComponent(team)}`, { method: 'DELETE' });
    if (request !== ploegRequest) return;
    ploegStatus = status;
    notify(kind === 'handoff' ? `Handed to team ${team}. Ploeg queues it within seconds.` : `Taken back from team ${team}.`);
    for (const warning of status.warnings || []) notify(warning, true);
    await refreshTask(sourceId, id);
    if (kind === 'handoff') setTimeout(() => { if (requestedId === id && sourceId === state.taskSourceId && !ploegBusy) loadPloeg(sourceId, id, true); }, 5000);
  } catch (error) {
    if (request !== ploegRequest) return;
    ploegError = error.message;
    if (error.status === 409 && error.code === 'task_changed') await refreshTask(sourceId, id);
  } finally { if (request === ploegRequest) { ploegBusy = ''; if (onTasks()) renderTasks(); } }
}

function chooseTeam(element, event) {
  if (event.target.name !== 'team') return;
  ploegTeam = event.target.value;
  renderTasks();
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
  if (onTasks()) renderTasks();
  try {
    const session = await api('/api/task-imports', { method: 'POST', body: JSON.stringify({ sourceId: selected.sourceId, taskId: selected.id, revision: selected.revision, ...(selected.bindingRevision ? { bindingRevision: selected.bindingRevision } : {}), crewId: data.crewId, runtime: data.runtime, ...(data.placement ? { placement: data.placement } : {}), budgetUsd: parseAmount(data.budgetUsd) }) });
    state.sessions = [session, ...state.sessions.filter(item => item.id !== session.id)]; state.tab = 'stream';
    location.hash = `session/${session.id}`;
    notify(existingIds.has(session.id) ? 'Opened the existing session for this task. No additional work was started.' : 'Task imported. Read the brief, then start the crew when you are ready.');
  } catch (error) {
    if (error.status === 409 && ['task_changed', 'task_binding_changed'].includes(error.code) && state.view === 'tasks' && state.taskSourceId === selected.sourceId) await openTask(selected.id, true);
    else { state.taskPreviewError = error.message; notify(error.message, true); }
  } finally { state.taskImporting = false; if (onTasks()) renderTasks(); }
}

function keepTaskDraft(element, event) { if (state.taskDraft && event.target.name) state.taskDraft[event.target.name] = event.target.value; }

function moveInList(event) {
  if (state.view !== 'tasks' || !['j', 'k'].includes(event.key) || !singleKeyAllowed(event)) return false;
  const rows = [...document.querySelectorAll('.tasks-row')].filter(visible);
  if (!rows.length) return false;
  const current = rows.indexOf(document.activeElement);
  const selected = rows.findIndex(row => row.getAttribute('aria-current') === 'true');
  const from = current >= 0 ? current : selected;
  const next = from < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, from + (event.key === 'j' ? 1 : -1)));
  event.preventDefault();
  rows[next].focus();
  return true;
}

/** The Tasks page (`#tasks?source=&task=`): the task list of one connection beside the selected task's brief, its Ploeg status and hand-off when Ploeg runs the connection, the import form, and the connections dialog. */
export default {
  id: 'tasks',
  match: hash => hash === 'tasks' ? {} : null,
  load: loadTaskPage,
  render: renderTasks,
  actions: {
    connections: () => openConnections(),
    'close-connections': () => $('#task-connections').close(),
    'task-refresh': () => loadTasks(state.taskSourceId, state.taskPage, { keepTask: requestedId }),
    'task-page': button => loadTasks(state.taskSourceId, Number(button.dataset.page)),
    'task-preview': button => openTask(button.dataset.id),
    'task-close': () => closeTask(),
    'task-brief': () => { briefExpanded = !briefExpanded; renderTasks(); if (!briefExpanded) document.getElementById('task-preview-title')?.scrollIntoView({ block: 'nearest' }); },
    'task-search-clear': () => { state.taskSearch = ''; renderTasks(); document.getElementById('task-search')?.focus(); },
    'task-ploeg-refresh': () => { if (state.task) loadPloeg(state.taskSourceId, String(state.task.id), true); },
    'task-take-back': button => changePloeg('take-back', button.dataset.team),
  },
  forms: { 'task-import': importTask, 'task-handoff': data => changePloeg('handoff', data.team || ploegTeam) },
  inputs: {
    '#task-search': element => { state.taskSearch = element.value; renderTasks(); },
    '[data-form="task-import"]': keepTaskDraft,
  },
  changes: {
    '#task-source': element => loadTasks(element.value),
    '[data-form="task-import"]': keepTaskDraft,
    '[data-form="task-handoff"]': chooseTeam,
  },
  keys: [moveInList],
};
