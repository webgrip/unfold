const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 }).format(value || 0);
const clock = value => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
const ago = value => { const minutes = Math.floor((Date.now() - Date.parse(value)) / 60000); return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : new Date(value).toLocaleDateString(); };
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  terminal: '<path d="m4 6 6 6-6 6m9 0h7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m12-10v2a5 5 0 0 1-5 5H6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  logout: '<path d="M10 3H3v18h7m-1-9h12m-5-5 5 5-5 5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  folder: '<path d="M3 5h7l2 3h9v12H3V5Z"/>',
  send: '<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.circle}</svg>`;
const labels = { queued: 'Ready to start', running: 'Working', waiting_input: 'Needs your input', paused: 'Paused', completed: 'Ready for review', failed: 'Needs attention', cancelled: 'Cancelled', interrupted: 'Interrupted' };
const evidenceTabs = [['stream','activity','Activity'],['diff','code','Changes'],['test','terminal','Checks'],['handoff','branch','Handoff']];
const state = { evidenceScroll: {}, bootstrap: null, sessions: [], session: null, events: [], permissions: [], view: 'sessions', tab: 'stream', filter: 'all', search: '', draft: '', stream: null, online: true, busy: false, refreshTimer: null, toastTimer: null, ploeg: null, health: null };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Vloer-Request': '1', ...options.headers }, credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') { disconnect(); state.bootstrap = null; renderLogin(); }
    throw new Error(data.error?.message || 'The request could not be completed.');
  }
  return data;
}

function notify(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message; toast.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { toast.className = 'toast'; }, 5500);
}

function status(value) { return `<span class="status status-${escape(value)}"><span></span>${escape(labels[value] || value)}</span>`; }
function repoName(id) { return state.bootstrap.repositories.find(repo => repo.id === id)?.name || id; }
function crewName(id) { return state.bootstrap.crews.find(crew => crew.id === id)?.name || id; }
function runtimeName(id) { return state.bootstrap.runtimes.find(runtime => runtime.id === id)?.name || id; }
function isActive(session) { return ['running','waiting_input'].includes(session.status); }
function disconnect() { state.stream?.close(); state.stream = null; clearTimeout(state.refreshTimer); }

function shell(content, title = 'Sessions', subtitle = 'Your work, running elsewhere.') {
  const user = state.bootstrap.user;
  return `<div class="layout">
    <aside class="sidebar" aria-label="Primary navigation">
      <a class="brand" href="#sessions" aria-label="De Vloer home"><span class="brand-mark"><i></i><i></i><i></i></span><span>de vloer<span class="brand-caption">AGENT WORKBENCH</span></span></a>
      <div class="workspace-label">WORKSPACE <span>01</span></div>
      <nav>${[['sessions','grid','Sessions'],['ploeg','layers','Ploeg queues'],['system','shield','Environment']].map(([id, glyph, label]) => `<a href="#${id}" aria-label="${escape(label)}" class="nav-item ${state.view === id || state.view === 'session' && id === 'sessions' ? 'active' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'sessions' ? `<b>${state.sessions.filter(isActive).length}</b>` : ''}</a>`).join('')}</nav>
      <div class="sidebar-note"><span class="tiny-label">THE WORKING AGREEMENT</span><p>You set the direction.<br>Agents bring back evidence.</p><div class="small-rule"></div><span>Human review stays in the loop.</span></div>
      <div class="user-card"><span class="avatar">${escape(user.name.slice(0, 2).toUpperCase())}</span><div><strong>${escape(user.name)}</strong><span>${escape(user.role)}${state.bootstrap.mode === 'demo' ? ' · local demo' : ''}</span></div>${state.bootstrap.mode !== 'demo' ? `<button class="icon-button" data-action="logout" aria-label="Sign out">${icon('logout')}</button>` : ''}</div>
    </aside>
    <div class="content-wrap"><header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')} <span>${escape(title)}</span></div><div class="topbar-right"><span class="connection ${state.online ? '' : 'offline'}"><i></i>${state.online ? 'Connected' : 'Reconnecting'}</span><span class="mode-pill">${state.bootstrap.mode === 'demo' ? 'DEMO' : 'LIVE'}</span></div></header>
      ${state.bootstrap.mode === 'demo' ? `<div class="demo-ribbon">${icon('info')}<span><strong>Demonstration mode.</strong> Real code changes and tests. No AI model calls or charges.</span></div>` : ''}
      <main id="main" class="main"><div class="page-heading"><div><p class="eyebrow">${state.view === 'session' ? 'SESSION WORKSPACE' : 'DE VLOER / WORKSPACE'}</p><h1>${escape(title)}</h1><p class="page-subtitle">${escape(subtitle)}</p></div>${state.view === 'sessions' && user.role !== 'viewer' ? `<button class="button primary" data-action="new">${icon('plus')} New session <kbd>N</kbd></button>` : ''}</div>${content}</main>
      <footer><span>DE VLOER <b>0.1</b></span><span>Self-hosted. Your models. Your infrastructure.</span></footer>
    </div></div>`;
}

function metrics() {
  const sessions = state.sessions;
  const spent = sessions.reduce((sum, session) => sum + session.spentUsd, 0);
  const attention = sessions.filter(session => ['waiting_input','failed','interrupted'].includes(session.status)).length;
  return `<section class="metrics" aria-label="Workspace totals">${[
    ['Active sessions', sessions.filter(isActive).length, `${state.bootstrap.maxConcurrentSessions} concurrent slots`, 'activity'],
    ['Ready for review', sessions.filter(session => session.status === 'completed').length, 'Required reviewers approved', 'check'],
    ['Needs attention', attention, attention ? 'Your next decision is waiting' : 'No decisions waiting', 'circle'],
    ['Recorded spend', money(spent), state.bootstrap.mode === 'demo' ? 'Demo · no model usage' : sessions.some(session => ['pending','unknown'].includes(session.costStatus)) ? 'Some usage is unsettled' : 'Gateway-reconciled usage', 'layers']
  ].map(([label, value, detail, glyph]) => `<article class="metric"><div>${escape(label)}${icon(glyph)}</div><strong>${escape(value)}</strong><span>${escape(detail)}</span></article>`).join('')}</section>`;
}

function sessionRow(session) {
  return `<button class="session-row" data-action="open" data-id="${escape(session.id)}"><span class="row-symbol ${isActive(session) ? 'working' : ''}">${icon(session.status === 'completed' ? 'check' : session.status === 'failed' ? 'info' : 'code')}</span><span class="row-main"><strong>${escape(session.title)}</strong><span>${escape(repoName(session.repositoryId))}<i>·</i>${escape(crewName(session.crewId))}</span></span><span class="row-status">${status(session.status)}<small>${escape(ago(session.updatedAt))}</small></span>${icon('chevron')}</button>`;
}

function renderDashboard() {
  const selected = state.sessions.filter(session => (state.filter === 'all' || state.filter === 'active' && isActive(session) || state.filter === 'review' && session.status === 'completed') && `${session.title} ${repoName(session.repositoryId)}`.toLowerCase().includes(state.search.toLowerCase()));
  const attention = state.sessions.filter(session => ['waiting_input','failed','interrupted','paused'].includes(session.status));
  const content = `${metrics()}<div class="dashboard-grid"><section class="panel sessions-panel"><div class="panel-heading"><div><h2>Sessions</h2><p>From an objective to reviewable work.</p></div><span class="count-badge">${state.sessions.length}</span></div><div class="list-toolbar"><div class="segmented" aria-label="Filter sessions">${[['all','All work'],['active','Active'],['review','For review']].map(([id,label]) => `<button data-action="filter" data-id="${id}" class="${state.filter === id ? 'selected' : ''}" aria-pressed="${state.filter === id}">${label}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="session-search" type="search" aria-label="Search sessions" placeholder="Find a session" value="${escape(state.search)}"></label></div><div class="session-list">${selected.length ? selected.map(sessionRow).join('') : `<div class="empty"><span class="empty-icon">${icon('branch')}</span><h3>${state.sessions.length ? 'No matching sessions' : 'A clear brief is a good start.'}</h3><p>${state.sessions.length ? 'Try a different filter or search.' : 'Choose a repository, give your crew an objective, and review what comes back.'}</p>${!state.sessions.length && state.bootstrap.user.role !== 'viewer' ? '<button class="button secondary" data-action="new">Create your first session</button>' : ''}</div>`}</div></section><aside class="right-column">
      ${state.bootstrap.mode === 'demo' ? `<section class="demo-card"><div class="demo-kicker">A WORKING WALKTHROUGH <span>~10 SEC</span></div><h2>Meet your<br>delivery crew.</h2><p>Follow a real rounding regression from failing test to reviewed patch.</p><ol><li><span>01</span>Reproduce the failure</li><li><span>02</span>Make and verify the fix</li><li><span>03</span>Review the actual evidence</li></ol><button class="button dark" data-action="quick-demo">Run the demonstration ${icon('arrow')}</button><small>Deterministic fixture · no API keys needed</small></section>` : `<section class="demo-card live-card"><div class="demo-kicker">READY TO WORK</div><h2>Your environment.<br>Your crew.</h2><p>${state.bootstrap.repositories.length} configured repositories and ${state.bootstrap.crews.length} reusable crews are available.</p><button class="button dark" data-action="new">Give a crew an objective ${icon('arrow')}</button></section>`}
      <section class="panel attention-panel"><div class="panel-heading"><h2>Your next decisions</h2>${icon('circle')}</div>${attention.length ? attention.slice(0,4).map(session => `<button class="attention-row" data-action="open" data-id="${escape(session.id)}"><strong>${escape(session.title)}</strong><span>${escape(labels[session.status])} ${icon('arrow')}</span></button>`).join('') : `<div class="all-clear">${icon('check')}<div><strong>All clear for now</strong><p>Approvals and blockers will appear here.</p></div></div>`}</section>
    </aside></div>`;
  renderHtml(shell(content));
}

function runCards(session) {
  return `<section class="crew-strip" aria-label="Crew progress">${session.runs.map((run, index) => `<article class="crew-stage stage-${escape(run.status)}"><div class="stage-number">${run.status === 'completed' ? icon('check') : String(index + 1).padStart(2, '0')}</div><div><span class="tiny-label">${run.mode === 'write' ? 'IMPLEMENTATION' : 'INDEPENDENT REVIEW'}</span><h3>${escape(run.roleName)}</h3><span>${escape(run.status === 'completed' ? run.verdict === 'approve' ? 'Explicitly approved' : 'Work completed' : run.status === 'running' ? 'Working in the remote workspace' : run.status === 'waiting_input' ? 'Waiting for your decision' : run.status === 'queued' ? 'Waiting for its turn' : labels[run.status] || run.status)}</span></div>${index < session.runs.length - 1 ? icon('chevron', 'stage-arrow') : ''}</article>`).join('')}</section>`;
}

function eventMarkup(event) {
  const data = event.data || {};
  const role = state.session?.runs.find(run => run.id === event.runId)?.roleName || (data.role === 'operator' ? 'You' : 'Workbench');
  if (event.type === 'message' || event.type === 'text' || event.type === 'assistant.message') return `<article class="message ${data.role === 'operator' ? 'operator-message' : ''}"><div class="message-avatar">${data.role === 'operator' ? 'Y' : role.slice(0,1)}</div><div class="message-body"><header><strong>${escape(role)}</strong><time>${clock(event.at)}</time>${data.applies === 'next_execution' ? '<span class="text-label">Next execution</span>' : ''}</header><p>${escape(data.text || data.message || '')}</p></div></article>`;
  if (event.type === 'tool' || event.type === 'tool.updated') return `<article class="tool-event"><div class="tool-title">${icon(data.status === 'failed' ? 'info' : data.status === 'completed' ? 'check' : 'terminal')}<strong>${escape(data.name || data.tool || 'Tool operation')}</strong><span class="tool-state ${data.status === 'failed' && !data.expectedFailure ? 'error-text' : ''}">${escape(data.expectedFailure && data.exitCode ? 'Expected baseline failure' : data.status || '')}</span><time>${clock(event.at)}</time></div>${data.output ? `<details><summary>View output${data.exitCode !== undefined ? ` · exit ${escape(data.exitCode)}` : ''}</summary><pre>${escape(data.output)}</pre></details>` : data.text ? `<p>${escape(data.text)}</p>` : ''}</article>`;
  const display = data.message || data.summary || (event.type === 'workspace.ready' ? `Workspace ready · ${data.backend}` : event.type === 'run.started' ? `${data.role} started` : event.type === 'session.created' ? 'Session created. Budget authorized; no work started.' : event.type === 'session.started' ? data.resumed ? 'Session resumed by operator' : 'Session started' : event.type === 'run.completed' ? `${role} completed` : event.type === 'budget.increased' ? `Additional authorization: ${money(data.amountUsd)}` : event.type.startsWith('permission.') ? 'An operator decision was recorded' : event.type.startsWith('budget.') ? `Budget accounting: ${event.type.split('.').at(-1)}` : event.type.replaceAll('.', ' '));
  return `<div class="system-event">${icon(event.type.includes('completed') ? 'check' : event.type.includes('failed') ? 'info' : 'circle')}<span>${escape(display)}</span><time>${clock(event.at)}</time></div>`;
}

function streamMarkup() {
  const visible = [];
  const parts = new Map();
  for (const event of state.events) {
    if (['native.session','usage','message.delta','heartbeat'].includes(event.type)) continue;
    const key = event.type === 'message' && event.data?.partId ? `${event.runId}:${event.data.partId}` : null;
    if (key && parts.has(key)) { parts.get(key).data.text += event.data.text || ''; continue; }
    const item = { ...event, data: { ...event.data } };
    if (key) parts.set(key, item);
    visible.push(item);
  }
  return `<div class="stream-content">${visible.length ? visible.map(eventMarkup).join('') : '<div class="empty compact"><h3>The workspace is ready.</h3><p>Start the session to see the crew work.</p></div>'}${isActive(state.session) ? '<div class="working-indicator"><span></span><span></span><span></span><em>The crew is working</em></div>' : ''}</div>`;
}

function artifactMarkup(kind) {
  const artifacts = state.session.artifacts.filter(artifact => kind === 'handoff' ? ['summary','link'].includes(artifact.kind) : artifact.kind === kind);
  if (!artifacts.length) return `<div class="empty compact">${icon(kind === 'diff' ? 'code' : 'terminal')}<h3>${kind === 'diff' ? 'Changes will appear here' : kind === 'test' ? 'No check evidence yet' : 'No handoff summary yet'}</h3><p>${kind === 'test' ? 'Only commands that actually ran are recorded as evidence.' : 'The crew will attach its work as the session progresses.'}</p></div>`;
  return artifacts.map(artifact => `<article class="artifact"><header><h3>${escape(artifact.name)}</h3><button class="button text-button" data-action="download-artifact" data-id="${escape(artifact.id)}">${icon('download')} Download</button></header>${kind === 'diff' ? `<pre class="diff">${artifact.content.split('\n').map(line => `<span class="${line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') ? 'diff-meta' : line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-delete' : line.startsWith('@@') ? 'diff-location' : ''}">${escape(line) || ' '}</span>`).join('')}</pre>` : `<pre>${escape(artifact.content)}</pre>`}${artifact.url && /^https?:\/\//.test(artifact.url) ? `<a href="${escape(artifact.url)}" target="_blank" rel="noopener noreferrer">Open artifact ${icon('external')}</a>` : ''}</article>`).join('');
}

function permissionsMarkup() {
  return state.permissions.filter(request => !request.resolved).map(request => `<section class="permission-card"><div class="permission-heading">${icon('shield')}<div><span class="tiny-label">YOUR DECISION</span><h3>${escape(request.title)}</h3></div></div><p>${escape(request.detail)}</p>${request.kind === 'permission' ? `<div class="permission-actions"><button class="button primary" data-action="permission" data-id="${escape(request.id)}" data-decision="once">Allow once</button><button class="button secondary" data-action="permission" data-id="${escape(request.id)}" data-decision="reject">Reject</button><button class="button text-button" data-action="permission" data-id="${escape(request.id)}" data-decision="always">Allow matching requests</button></div>` : `<form data-form="question" data-id="${escape(request.id)}">${(request.questions || [{ question: request.detail }]).map((question, index) => `<label>${escape(question.question || question.header || `Question ${index + 1}`)}<input name="answer-${index}" required placeholder="Your answer" list="options-${escape(request.id)}-${index}"><datalist id="options-${escape(request.id)}-${index}">${(question.options || []).map(option => `<option value="${escape(option.label || option)}">${escape(option.description || '')}</option>`).join('')}</datalist></label>`).join('')}<button class="button primary" type="submit">Send answer ${icon('send')}</button></form>`}</section>`).join('');
}

function failureNotice(session) {
  const failure = session.failure;
  if (!failure && !session.blocker) return '';
  const stage = { credentials: 'Gateway authorization', workspace: 'Workspace setup', runtime: 'Runtime startup', prompt: 'Prompt submission', execution: 'Agent execution' }[failure?.stage] || 'Execution';
  const submission = { not_submitted: 'The prompt was not submitted.', rejected: 'The runtime rejected the prompt.', accepted: 'The runtime acknowledged the prompt; this does not confirm that execution finished.', unknown: 'Prompt submission is unconfirmed. Check remote execution and gateway spend before starting new work.' }[failure?.promptAcceptance];
  return `<section class="notice notice-warning" aria-labelledby="session-failure-title">${icon('info')}<div><strong id="session-failure-title">${failure ? `${stage} needs attention` : session.status === 'interrupted' ? 'Execution was interrupted' : 'This session needs attention'}</strong><p>${escape(failure?.message || session.blocker)}</p>${failure?.remediation ? `<p>${escape(failure.remediation)}</p>` : ''}${submission ? `<p>${escape(submission)}</p>` : ''}${failure?.automaticRetry === false ? '<p>No automatic retry will be started.</p>' : ''}</div></section>`;
}

function renderSession() {
  const session = state.session;
  if (!session) return;
  const canOperate = state.bootstrap.user.role !== 'viewer';
  const finished = ['completed','failed','cancelled'].includes(session.status);
  const approved = session.runs.filter(run => run.verdict === 'approve').length;
  const controls = `${session.status === 'queued' ? '<button class="button primary" data-action="start">Start crew '+icon('play')+'</button>' : ''}${isActive(session) ? '<button class="button secondary" data-action="pause">'+icon('pause')+' Pause</button>' : ''}${['paused','interrupted'].includes(session.status) ? '<button class="button primary" data-action="resume">'+icon('play')+' Resume</button>' : ''}${!finished ? '<button class="button text-button danger" data-action="cancel">'+icon('stop')+' Cancel</button>' : ''}`;
  const content = `<div class="session-topline"><a href="#sessions" class="back-link">${icon('back')} All sessions</a><div>${status(session.status)}<span class="tag">${escape(runtimeName(session.runtime))}</span></div></div><section class="session-brief panel"><div><div class="brief-meta"><span>${icon('folder')}${escape(repoName(session.repositoryId))}</span><span>${icon('layers')}${escape(crewName(session.crewId))}</span><span>${icon('clock')}Started ${escape(ago(session.createdAt))}</span></div><p>${escape(session.objective)}</p></div><div class="session-controls">${canOperate ? controls : ''}<button class="button secondary" data-action="export">${icon('download')} Export handoff</button></div></section>
    ${failureNotice(session)}
    ${session.status === 'completed' ? `<div class="notice notice-success">${icon('check')}<div><strong>Evidence is ready for your review.</strong><p>The required reviewers approved. No merge or deployment has been performed.</p></div><button class="button text-button" data-action="tab" data-id="diff">Inspect changes ${icon('arrow')}</button></div>` : ''}
    ${runCards(session)}<div class="session-grid"><section class="panel execution-panel"><div class="tabs" role="tablist" aria-label="Session evidence">${evidenceTabs.map(([id,glyph,label]) => `<button role="tab" id="evidence-tab-${id}" aria-controls="evidence-panel-${id}" tabindex="${state.tab === id ? '0' : '-1'}" aria-selected="${state.tab === id}" data-action="tab" data-id="${id}" class="${state.tab === id ? 'selected' : ''}">${icon(glyph)}${label}${id === 'diff' || id === 'test' ? `<span>${session.artifacts.filter(artifact => artifact.kind === id).length}</span>` : ''}</button>`).join('')}</div>${evidenceTabs.map(([id]) => `<div class="tab-content" role="tabpanel" id="evidence-panel-${id}" aria-labelledby="evidence-tab-${id}" tabindex="0" data-tab="${id}" data-session-id="${escape(session.id)}" ${state.tab === id ? '' : 'hidden'}>${state.tab === id ? id === 'stream' ? streamMarkup() : artifactMarkup(id) : ''}</div>`).join('')}${!finished && canOperate ? `<form class="composer" data-form="message"><label for="operator-message">Steer the next execution</label><div><textarea id="operator-message" name="text" rows="2" placeholder="Add a constraint, clarify the objective, or leave a handoff note…" required>${escape(state.draft)}</textarea><button class="button primary icon-only" type="submit" aria-label="Save instruction">${icon('send')}</button></div><p>Instructions are saved durably. Pause and resume to apply them to the current role.</p></form>` : ''}</section><aside class="right-column">${permissionsMarkup()}<section class="panel budget-panel"><div class="panel-heading"><h2>Session budget</h2>${icon('shield')}</div><div class="budget-value">${money(session.spentUsd)}<span> / ${money(session.budgetUsd)}</span></div><progress max="${session.budgetUsd || 1}" value="${Math.min(session.spentUsd, session.budgetUsd)}" aria-label="Recorded session spend"></progress><div class="budget-details"><span>Accounting</span><strong>${escape(session.costStatus === 'demo' ? 'Demo · no charge' : session.costStatus === 'unknown' ? 'Unresolved · hold retained' : session.costStatus === 'pending' ? 'Awaiting gateway settlement' : 'Settled')}</strong></div><p>${session.costStatus === 'demo' ? 'This session uses a deterministic demonstration runtime. No tokens are consumed.' : session.costStatus === 'unknown' ? 'Unknown usage is never treated as zero. Previous authorization stays reserved.' : 'A scoped gateway key bounds this engagement. Model usage is reconciled independently.'}</p>${state.bootstrap.user.role === 'admin' && !finished ? '<button class="button secondary full" data-action="budget">Authorize more budget</button>' : ''}</section><section class="panel details-panel"><div class="panel-heading"><h2>Working context</h2></div><dl><dt>Branch</dt><dd class="mono">${escape(session.branch)}</dd><dt>Operator</dt><dd>${escape(session.ownerName)}</dd><dt>Explicit reviews</dt><dd>${approved} of ${session.runs.filter(run => run.mode === 'read').length}</dd><dt>Session</dt><dd class="mono">${escape(session.id.slice(0,8))}</dd></dl>${session.trackerUrl ? `<a class="external-link" href="${escape(session.trackerUrl)}" target="_blank" rel="noopener noreferrer">Open tracker ${icon('external')}</a>` : ''}</section></aside></div>`;
  renderHtml(shell(content, session.title, 'A bounded objective. A visible crew. Reviewable evidence.'));
}

function renderSystem() {
  const health = state.health;
  const content = `<div class="environment-grid"><section class="panel"><div class="panel-heading"><h2>Execution environment</h2>${icon('shield')}</div><dl class="environment-list"><dt>Deployment</dt><dd>${state.bootstrap.mode === 'demo' ? 'Local demonstration' : 'Live workbench'}</dd><dt>Workspace backend</dt><dd>${escape(health?.workspaceBackend || 'Loading…')}</dd><dt>Model gateway</dt><dd>${state.bootstrap.mode === 'demo' ? 'Not used in demonstration' : health?.litellm ? 'LiteLLM configured' : 'Not configured · paid execution blocked'}</dd><dt>Concurrent sessions</dt><dd>${state.bootstrap.maxConcurrentSessions}</dd><dt>Maximum session authorization</dt><dd>${money(state.bootstrap.maxBudgetUsd)}</dd><dt>Storage</dt><dd>Persistent SQLite · one application replica</dd></dl></section><section class="panel"><div class="panel-heading"><h2>Registered repositories</h2><span class="count-badge">${state.bootstrap.repositories.length}</span></div>${state.bootstrap.repositories.map(repo => `<article class="profile-row">${icon('folder')}<div><h3>${escape(repo.name)}</h3><p>${escape(repo.description)}</p><span class="tag">${escape(repo.baseBranch)}</span></div></article>`).join('')}</section><section class="panel span-two"><div class="panel-heading"><h2>Reusable crews</h2><p>Procedures are versioned with the configuration.</p></div><div class="crew-profiles">${state.bootstrap.crews.map(crew => `<article><span class="tiny-label">${escape(crew.id)}</span><h3>${escape(crew.name)}</h3><p>${escape(crew.description)}</p><div>${crew.roles.map(role => `<span class="role-chip">${icon(role.mode === 'write' ? 'code' : 'shield')}${escape(role.name)}</span>`).join('')}</div></article>`).join('')}</div></section></div>`;
  renderHtml(shell(content, 'Environment', 'The shared foundation behind every session.'));
}

function renderPloeg() {
  const ploeg = state.ploeg;
  const content = `<section class="panel"><div class="panel-heading"><div><h2>Unattended dispatch</h2><p>Ploeg owns the queue, leases and execution of assigned tracker work.</p></div><span class="tag">READ-ONLY CONNECTION</span></div>${!ploeg ? '<div class="empty compact"><p>Checking the configured connection…</p></div>' : !ploeg.configured ? `<div class="empty"><span class="empty-icon">${icon('layers')}</span><h3>Connect your existing dispatch plane</h3><p>Configure Ploeg’s internal URL and team IDs on the server. This view then shows the actual queue depth for each team.</p><div class="connection-example"><code>ploeg.url</code><span>Internal Ploeg API</span><code>ploeg.teams</code><span>Registered team IDs</span></div></div>` : `<div class="queue-grid">${ploeg.teams.map(team => `<article><span class="tiny-label">${escape(team.team)}</span><strong>${team.available ? team.depth : '—'}</strong><p>${team.available ? 'queued work items' : escape(team.message)}</p></article>`).join('')}</div><div class="panel-bottom"><p>${escape(ploeg.message)}</p>${ploeg.trackerUrl ? `<a class="button secondary" href="${escape(ploeg.trackerUrl)}" target="_blank" rel="noopener noreferrer">Open tracker ${icon('external')}</a>` : ''}</div>`}</section>`;
  renderHtml(shell(content, 'Ploeg queues', 'Interactive work here. Assigned delivery work in Ploeg.'));
}

function renderHtml(markup) {
  const active = document.activeElement;
  const focusId = active?.id;
  const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const oldPanel = $('.tab-content:not([hidden])');
  if (oldPanel && oldPanel.dataset.sessionId === state.session?.id) {
    state.evidenceScroll[oldPanel.dataset.tab] = { top: oldPanel.scrollTop, atBottom: oldPanel.scrollHeight - oldPanel.scrollTop - oldPanel.clientHeight < 90 };
  }
  $('#app').innerHTML = markup;
  if (focusId) {
    const replacement = document.getElementById(focusId);
    replacement?.focus({ preventScroll: true });
    if (selection && replacement?.setSelectionRange) try { replacement.setSelectionRange(...selection); } catch {}
  }
  const panel = $('.tab-content:not([hidden])');
  if (panel) {
    const previous = state.evidenceScroll[panel.dataset.tab];
    panel.scrollTop = panel.dataset.tab === 'stream' && (!previous || previous.atBottom) ? panel.scrollHeight : previous?.top || 0;
  }
}

function render() {
  if (!state.bootstrap) return renderLogin();
  if (state.view === 'session') return renderSession();
  if (state.view === 'ploeg') return renderPloeg();
  if (state.view === 'system') return renderSystem();
  renderDashboard();
}

function renderLogin(error = '') {
  $('#app').innerHTML = `<main class="login-page" id="main"><section class="login-brand"><div class="brand-mark"><i></i><i></i><i></i></div><span>de vloer</span><h1>A place to<br>direct the work.</h1><p>Remote workspaces. Reusable crews.<br>Evidence you can inspect.</p></section><section class="login-form"><div><p class="eyebrow">YOUR TEAM’S WORKBENCH</p><h2>Welcome back.</h2><p>Sign in with your De Vloer account.</p><form data-form="login"><label>Account name<input name="name" autocomplete="username" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}<button class="button primary full" type="submit">Sign in ${icon('arrow')}</button></form><small>Your administrator provisions workbench accounts.</small></div></section></main>`;
}

function openNew() {
  const dialog = $('#new-session');
  const demo = state.bootstrap.mode === 'demo';
  dialog.innerHTML = `<form data-form="new"><header class="dialog-header"><div><p class="eyebrow">A NEW ENGAGEMENT</p><h2 id="new-title">Give your crew a clear brief.</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">${icon('x')}</button></header><div class="dialog-body">${demo ? '<div class="notice compact-notice">Demonstration mode always runs the supplied rounding fixture. Live deployments execute your own objectives.</div>' : ''}<label>Session title<input name="title" placeholder="e.g. Fix the order total rounding regression" maxlength="160" value="${demo ? 'Fix order total rounding' : ''}" required></label><label>Objective and acceptance criteria<textarea name="objective" rows="4" maxlength="16000" placeholder="What should change? What evidence will show it works?" required>${demo ? 'Reproduce the rounding regression in the order service. Apply a minimal fix, keep the tests intact, and have an independent reviewer inspect the patch and rerun the checks.' : ''}</textarea></label><div class="form-grid"><label>Repository<select name="repositoryId">${state.bootstrap.repositories.map(repo => `<option value="${escape(repo.id)}">${escape(repo.name)}</option>`).join('')}</select></label><label>Crew<select name="crewId">${state.bootstrap.crews.map(crew => `<option value="${escape(crew.id)}">${escape(crew.name)}</option>`).join('')}</select></label><label>Runtime<select name="runtime">${state.bootstrap.runtimes.map(runtime => `<option value="${escape(runtime.id)}">${escape(runtime.name)}</option>`).join('')}</select></label><label>Session budget · USD<input name="budgetUsd" type="number" min="0.01" max="${state.bootstrap.maxBudgetUsd}" step="0.01" value="${Math.min(5, state.bootstrap.maxBudgetUsd)}" required></label></div><p class="form-help">${demo ? 'The authorization is illustrative; demonstration spend remains $0.' : 'This caps the engagement across its roles. Additional authorization requires an administrator.'}</p></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Create session ${icon('arrow')}</button></footer></form>`;
  dialog.showModal();
}

function confirmAction(title, description, label, callback) {
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<form method="dialog"><div class="dialog-body"><h2 id="confirm-title">${escape(title)}</h2><p>${escape(description)}</p></div><footer class="dialog-footer"><button class="button secondary" value="cancel">Keep working</button><button class="button primary" value="confirm">${escape(label)}</button></footer></form>`;
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') void callback(); }, { once: true });
  dialog.returnValue = '';
  dialog.showModal();
}

async function openSession(id) {
  disconnect();
  const [session, events, permissions] = await Promise.all([api(`/api/sessions/${id}`), api(`/api/sessions/${id}/history`), api(`/api/sessions/${id}/permissions`)]);
  if (location.hash !== `#session/${id}`) return;
  state.session = session; state.events = events; state.permissions = permissions; state.view = 'session'; state.online = true; state.draft = ''; state.evidenceScroll = {}; render();
  const after = events.at(-1)?.id || 0;
  const stream = new EventSource(`/api/sessions/${id}/events?after=${after}`);
  state.stream = stream;
  stream.onopen = () => { state.online = true; const connection = $('.connection'); if (connection) { connection.classList.remove('offline'); connection.innerHTML = '<i></i>Connected'; } };
  stream.onerror = () => { state.online = false; const connection = $('.connection'); if (connection) { connection.classList.add('offline'); connection.innerHTML = '<i></i>Reconnecting'; } };
  stream.onmessage = event => {
    if (state.session?.id !== id) return;
    const record = JSON.parse(event.data);
    if (!state.events.some(item => item.id === record.id)) state.events.push(record);
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(async () => {
      try {
        const [latest, requests] = await Promise.all([api(`/api/sessions/${id}`), api(`/api/sessions/${id}/permissions`)]);
        if (state.session?.id !== id || state.view !== 'session') return;
        if (latest.status !== state.session.status) $('#announcement').textContent = labels[latest.status];
        state.session = latest; state.permissions = requests;
        const index = state.sessions.findIndex(item => item.id === id);
        if (index >= 0) state.sessions[index] = latest;
        renderSession();
      } catch (error) { notify(error.message, true); }
    }, 120);
  };
}

async function route() {
  if (!state.bootstrap) return;
  const hash = location.hash.slice(1) || 'sessions';
  try {
    if (hash.startsWith('session/')) return await openSession(hash.slice(8));
    disconnect(); state.session = null; state.view = ['sessions','ploeg','system'].includes(hash) ? hash : 'sessions';
    state.sessions = await api('/api/sessions'); render();
    if (state.view === 'ploeg') { state.ploeg = await api('/api/ploeg'); renderPloeg(); }
    if (state.view === 'system') { state.health = await api('/api/health'); renderSystem(); }
  } catch (error) { notify(error.message, true); if (state.bootstrap) { state.view = 'sessions'; renderDashboard(); } }
}

function download(filename, content, type = 'text/plain') {
  const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportHandoff() {
  const session = state.session;
  const content = [`# ${session.title}`, '', `Runtime: ${runtimeName(session.runtime)}`, `Status: ${labels[session.status]}`, `Repository: ${repoName(session.repositoryId)}`, `Branch: ${session.branch}`, `Accounting: ${session.costStatus}; recorded spend ${money(session.spentUsd)}; authorization ${money(session.budgetUsd)}`, '', '## Objective', session.objective, '', ...session.runs.flatMap(run => [`## ${run.roleName}`, `Status: ${run.status}${run.verdict ? `; verdict: ${run.verdict}` : ''}`, run.summary || 'No completed summary.', '']), ...session.artifacts.flatMap(artifact => [`## ${artifact.name}`, '', '````', artifact.content, '````', '']), 'No automatic merge or deployment was performed.'].join('\n');
  download(`de-vloer-${session.id.slice(0,8)}.md`, content, 'text/markdown');
}

async function lifecycle(action) {
  if (state.busy || !state.session) return;
  state.busy = true;
  try { state.session = await api(`/api/sessions/${state.session.id}/${action}`, { method: 'POST', body: '{}' }); renderSession(); notify(action === 'pause' ? 'Paused. Your context and budget remain attached to this session.' : action === 'cancel' ? 'Cancelled. This work will not automatically retry.' : 'The crew is starting.'); }
  catch (error) { notify(error.message, true); }
  finally { state.busy = false; }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === 'new') openNew();
    else if (action === 'close-dialog') $('#new-session').close();
    else if (action === 'open') { state.tab = 'stream'; location.hash = `session/${button.dataset.id}`; }
    else if (action === 'filter') { state.filter = button.dataset.id; renderDashboard(); }
    else if (action === 'tab') selectEvidenceTab(button.dataset.id);
    else if (['start','pause','resume'].includes(action)) await lifecycle(action);
    else if (action === 'cancel') confirmAction('Cancel this session?', 'The active turn will stop and no remaining role will start. This session cannot be resumed after cancellation.', 'Cancel session', () => lifecycle('cancel'));
    else if (action === 'export') exportHandoff();
    else if (action === 'download-artifact') { const artifact = state.session.artifacts.find(item => item.id === button.dataset.id); if (artifact) download(`${artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${artifact.kind === 'diff' ? 'patch' : 'txt'}`, artifact.content); }
    else if (action === 'logout') { await api('/api/logout', { method: 'POST', body: '{}' }); state.bootstrap = null; disconnect(); renderLogin(); }
    else if (action === 'permission') { button.disabled = true; await api(`/api/sessions/${state.session.id}/permissions/${button.dataset.id}`, { method: 'POST', body: JSON.stringify({ decision: button.dataset.decision }) }); notify('Your decision was delivered to the runtime.'); }
    else if (action === 'budget') {
      const dialog = $('#confirm-dialog');
      dialog.innerHTML = `<form data-form="budget"><div class="dialog-body"><h2 id="confirm-title">Authorize additional budget</h2><p>This adds to the existing engagement. Current authorization: ${money(state.session.budgetUsd)}.</p><label>Additional amount · USD<input name="amountUsd" type="number" min="0.01" max="${state.bootstrap.maxBudgetUsd - state.session.budgetUsd}" step="0.01" required></label></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-budget">Cancel</button><button class="button primary" type="submit">Authorize</button></footer></form>`; dialog.showModal();
    } else if (action === 'close-budget') $('#confirm-dialog').close();
    else if (action === 'quick-demo') {
      button.disabled = true;
      const session = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ title: 'Fix order total rounding', objective: 'Reproduce the rounding regression. Apply a minimal fix, preserve the tests, and independently verify the patch.', repositoryId: state.bootstrap.repositories[0].id, crewId: state.bootstrap.crews[0].id, runtime: 'demo', budgetUsd: Math.min(5, state.bootstrap.maxBudgetUsd) }) });
      await api(`/api/sessions/${session.id}/start`, { method: 'POST', body: '{}' });
      state.sessions.unshift(session); state.tab = 'stream'; location.hash = `session/${session.id}`;
    }
  } catch (error) { button.disabled = false; notify(error.message, true); }
});

document.addEventListener('input', event => {
  if (event.target.id === 'operator-message') state.draft = event.target.value;
  if (event.target.id === 'session-search') { state.search = event.target.value; renderDashboard(); }
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
  try {
    if (form.dataset.form === 'login') { await api('/api/login', { method: 'POST', body: JSON.stringify(data) }); await boot(); }
    else if (form.dataset.form === 'new') {
      data.budgetUsd = Number(data.budgetUsd);
      const session = await api('/api/sessions', { method: 'POST', body: JSON.stringify(data) });
      $('#new-session').close(); state.sessions.unshift(session); state.tab = 'stream'; location.hash = `session/${session.id}`;
    } else if (form.dataset.form === 'message') {
      await api(`/api/sessions/${state.session.id}/messages`, { method: 'POST', body: JSON.stringify({ text: data.text }) }); state.draft = ''; form.reset(); notify('Instruction saved for the next execution.');
    } else if (form.dataset.form === 'budget') {
      state.session = await api(`/api/sessions/${state.session.id}/budget`, { method: 'POST', body: JSON.stringify({ amountUsd: Number(data.amountUsd) }) }); $('#confirm-dialog').close(); renderSession(); notify('Additional budget authorized.');
    } else if (form.dataset.form === 'question') {
      const answers = Object.keys(data).sort((a,b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).map(key => [data[key]]);
      await api(`/api/sessions/${state.session.id}/permissions/${form.dataset.id}`, { method: 'POST', body: JSON.stringify({ answers }) }); notify('Your answer was delivered to the crew.');
    }
  } catch (error) { if (form.dataset.form === 'login') renderLogin(error.message); else notify(error.message, true); }
  finally { if (submit) submit.disabled = false; }
});

function selectEvidenceTab(id) {
  if (!evidenceTabs.some(([tab]) => tab === id) || !state.session) return;
  state.tab = id;
  renderSession();
  document.getElementById(`evidence-tab-${id}`)?.focus({ preventScroll: true });
}

document.addEventListener('keydown', event => {
  const tab = event.target.closest('[role="tab"][data-action="tab"]');
  if (tab && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const index = evidenceTabs.findIndex(([id]) => id === tab.dataset.id);
    const next = event.key === 'ArrowRight' ? (index + 1) % evidenceTabs.length : event.key === 'ArrowLeft' ? (index + evidenceTabs.length - 1) % evidenceTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? evidenceTabs.length - 1 : -1;
    if (next !== -1) {
      event.preventDefault();
      selectEvidenceTab(evidenceTabs[next][0]);
      return;
    }
  }
  if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) && state.bootstrap && state.bootstrap.user.role !== 'viewer' && !$('#new-session').open && !$('#confirm-dialog').open) { event.preventDefault(); openNew(); }
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', disconnect);

async function boot() {
  try { state.bootstrap = await api('/api/bootstrap'); state.sessions = await api('/api/sessions'); await route(); }
  catch (error) { if (!state.bootstrap) renderLogin(error.message.includes('Sign in') ? '' : error.message); else notify(error.message, true); }
}
void boot();
