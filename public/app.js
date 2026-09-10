const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => { const amount = value || 0; const digits = amount > 0 && amount < 0.01 ? 5 : amount > 0 && amount < 1 ? 4 : 3; return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(amount); };
const clock = value => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
const ago = value => { const minutes = Math.floor((Date.now() - Date.parse(value)) / 60000); return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : new Date(value).toLocaleDateString(); };
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
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
const labels = { queued: 'Ready to start', running: 'Working', exporting: 'Preparing review', waiting_input: 'Needs your input', paused: 'Paused', completed: 'Awaiting your review', failed: 'Needs attention', cancelled: 'Cancelled', interrupted: 'Interrupted' };
const evidenceTabs = [['stream','activity','Activity'],['gateway','layers','Gateway'],['diff','code','Changes'],['test','terminal','Checks'],['handoff','branch','Handoff']];
const providers = { forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', vikunja: 'Vikunja', demo: 'Demo fixture' };
const state = { evidenceScroll: {}, bootstrap: null, sessions: [], session: null, events: [], permissions: [], view: 'sessions', tab: 'stream', filter: 'all', search: '', draft: '', stream: null, online: true, busy: false, refreshTimer: null, toastTimer: null, ploeg: null, health: null, taskSourceId: '', tasks: [], task: null, taskPage: 1, taskNextPage: null, taskSearch: '', taskLoading: false, taskPreviewLoading: false, taskError: '', taskPreviewError: '', taskChanged: false, taskDraft: null, taskRequest: 0, previewRequest: 0, taskImporting: false };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Vloer-Request': '1', ...options.headers }, credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') { disconnect(); state.bootstrap = null; renderLogin(); }
    const error = new Error(data.error?.message || 'The request could not be completed.');
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
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
function placementName(id) { return state.bootstrap.placements?.find(placement => placement.id === id)?.name || id; }
function placementField(idPrefix, selected) {
  const placements = state.bootstrap.placements || [];
  if (placements.length < 2) return '';
  const current = selected || placements.find(placement => placement.default)?.id || placements[0].id;
  return `<label>Workspace placement<select id="${idPrefix}-placement" name="placement">${placements.map(placement => `<option value="${escape(placement.id)}" ${current === placement.id ? 'selected' : ''}>${escape(placement.name)}</option>`).join('')}</select></label>`;
}
function isActive(session) { return ['running','waiting_input','exporting'].includes(session.status); }
function disconnect() { state.stream?.close(); state.stream = null; clearTimeout(state.refreshTimer); }
function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }
function taskSources() { return state.bootstrap.taskSources || []; }
function selectedTaskSource() { return taskSources().find(source => source.id === state.taskSourceId); }
function providerName(id) { return providers[id] || id; }

function shell(content, title = 'Sessions', subtitle = 'Your work, running elsewhere.') {
  const user = state.bootstrap.user;
  return `<div class="layout">
    <aside class="sidebar" aria-label="Primary navigation">
      <a class="brand" href="#sessions" aria-label="De Vloer home"><span class="brand-mark"><i></i><i></i><i></i></span><span>de vloer<span class="brand-caption">AGENT WORKBENCH</span></span></a>
      <div class="workspace-label">WORKSPACE <span>01</span></div>
      <nav>${[['sessions','grid','Sessions'],['tasks','folder','Tasks'],['ploeg','layers','Ploeg queues'],['account','link','Linked accounts'],['system','shield','Environment']].map(([id, glyph, label]) => `<a href="#${id}" aria-label="${escape(label)}" class="nav-item ${state.view === id || state.view === 'session' && id === 'sessions' ? 'active' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'sessions' ? `<b>${state.sessions.filter(isActive).length}</b>` : ''}</a>`).join('')}</nav>
      <div class="sidebar-note"><span class="tiny-label">THE WORKING AGREEMENT</span><p>You set the direction.<br>Agents bring back evidence.</p><div class="small-rule"></div><span>Human review stays in the loop.</span></div>
      <div class="user-card"><span class="avatar">${escape(user.name.slice(0, 2).toUpperCase())}</span><div><strong>${escape(user.name)}</strong><span>${escape(user.role)}${state.bootstrap.mode === 'demo' ? ' · local demo' : ''}</span></div>${state.bootstrap.mode !== 'demo' ? `<button class="icon-button" data-action="logout" aria-label="Sign out">${icon('logout')}</button>` : ''}</div>
    </aside>
    <div class="content-wrap"><header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')} <span>${escape(title)}</span></div><div class="topbar-right"><span class="connection ${state.online ? '' : 'offline'}"><i></i>${state.online ? 'Connected' : 'Reconnecting'}</span><span class="mode-pill">${state.bootstrap.mode === 'demo' ? 'DEMO' : 'LIVE'}</span></div></header>
      ${state.bootstrap.mode === 'demo' ? `<div class="demo-ribbon">${icon('info')}<span><strong>Demonstration mode.</strong> Real code changes and tests. No AI model calls or charges.</span></div>` : ''}
      <main id="main" class="main"><div class="page-heading"><div><p class="eyebrow">${state.view === 'session' ? 'SESSION WORKSPACE' : 'DE VLOER / WORKSPACE'}</p><h1>${escape(title)}</h1><p class="page-subtitle">${escape(subtitle)}</p></div>${state.view === 'sessions' && user.role !== 'viewer' ? `<button class="button primary" data-action="new">${icon('plus')} New session <kbd>N</kbd></button>` : state.view === 'tasks' ? `<button class="button secondary" data-action="connections">${icon('layers')} Connections</button>` : ''}</div>${content}</main>
      <footer><span>DE VLOER <b>0.2</b></span><span>Self-hosted. Your models. Your infrastructure.</span></footer>
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

function statusLabel(session) {
  if (session.status === 'completed' && session.review) return session.review.decision === 'accepted' ? 'Accepted' : 'Rejected';
  return labels[session.status] || session.status;
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

function runCards(session) {
  return `<section class="crew-strip" aria-label="Crew progress">${session.runs.map((run, index) => `<article class="crew-stage stage-${escape(run.status)}"><div class="stage-number">${run.status === 'completed' ? icon('check') : String(index + 1).padStart(2, '0')}</div><div><span class="tiny-label">${run.mode === 'write' ? 'IMPLEMENTATION' : index === session.runs.length - 1 ? 'INDEPENDENT REVIEW' : 'ANALYSIS'}</span><h3>${escape(run.roleName)}</h3><span>${escape(run.status === 'completed' ? run.verdict === 'approve' ? 'Explicitly approved' : 'Work completed' : run.status === 'running' ? 'Working in the remote workspace' : run.status === 'waiting_input' ? 'Waiting for your decision' : run.status === 'queued' ? 'Waiting for its turn' : labels[run.status] || run.status)}</span></div>${index < session.runs.length - 1 ? icon('chevron', 'stage-arrow') : ''}</article>`).join('')}</section>`;
}

function markdown(text) {
  const blocks = [];
  let html = escape(text || '').replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => { blocks.push(`<pre class="md-code"${lang ? ` data-lang="${escape(lang)}"` : ''}>${code.replace(/\n$/, '')}</pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = []; let list = null;
  for (const line of html.split('\n')) {
    const item = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line);
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (item) { if (!list) { list = []; } list.push(`<li>${item[1]}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (heading) out.push(`<h${heading[1].length + 2}>${heading[2]}</h${heading[1].length + 2}>`);
    else if (/^\u0000\d+\u0000$/.test(line.trim())) out.push(line.trim());
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, index) => blocks[Number(index)]);
}

function verdictLabel(verdict) { return verdict === 'approve' ? 'Explicitly approved' : verdict === 'request_changes' ? 'Changes requested' : verdict === 'inconclusive' ? 'Inconclusive' : ''; }

function toolTitle(data) {
  const input = (() => { try { return typeof data.input === 'string' ? JSON.parse(data.input) : data.input; } catch { return null; } })();
  const detail = data.title || (input && (input.command || input.pattern || input.filePath || input.path || input.query || input.url)) || '';
  return detail ? String(detail).slice(0, 160) : '';
}

function eventMarkup(event) {
  const data = event.data || {};
  const role = state.session?.runs.find(run => run.id === event.runId)?.roleName || (data.role === 'operator' ? 'You' : 'Workbench');
  if (event.type === 'message' || event.type === 'text' || event.type === 'assistant.message') return `<article class="message ${data.role === 'operator' ? 'operator-message' : ''}"><div class="message-avatar">${data.role === 'operator' ? 'Y' : role.slice(0,1)}</div><div class="message-body"><header><strong>${escape(role)}</strong><time>${clock(event.at)}</time>${data.applies === 'next_execution' ? '<span class="text-label">Next execution</span>' : ''}</header><div class="markdown">${markdown(data.text || data.message || '')}</div></div></article>`;
  if (event.type === 'tool' || event.type === 'tool.updated') { const failed = data.status === 'error' || data.status === 'failed'; const detail = toolTitle(data); const body = data.input || data.output || data.error; return `<article class="tool-event ${failed && !data.expectedFailure ? 'tool-failed' : ''}"><div class="tool-title">${icon(failed ? 'info' : data.status === 'completed' ? 'check' : 'terminal')}<strong>${escape(data.name || data.tool || 'Tool operation')}</strong>${detail ? `<span class="tool-detail mono">${escape(detail)}</span>` : ''}<span class="tool-state ${failed && !data.expectedFailure ? 'error-text' : ''}">${escape(data.expectedFailure && data.exitCode ? 'Expected baseline failure' : data.status || '')}</span><time>${clock(event.at)}</time></div>${body ? `<details class="tool-body"><summary>${failed ? 'Error and input' : 'Input and output'}</summary>${data.input ? `<p class="tiny-label">INPUT</p><pre>${escape(String(data.input))}</pre>` : ''}${data.output ? `<p class="tiny-label">OUTPUT</p><pre>${escape(String(data.output))}</pre>` : ''}${data.error ? `<p class="tiny-label">ERROR</p><pre class="error-text">${escape(String(data.error))}</pre>` : ''}</details>` : ''}</article>`; }
  if (event.type === 'run.started' && data.prompt) {
    const prompt = data.prompt;
    const section = (label, text) => text ? `<p class="tiny-label">${label}</p><div class="markdown">${markdown(text)}</div>` : '';
    return `<article class="brief-event"><div class="tool-title">${icon('circle')}<strong>${escape(data.role)} started</strong><span class="tool-state">${escape(data.reviewer ? 'independent review' : data.mode === 'write' ? 'implementation' : 'analysis')}${data.model ? ` · ${escape(data.model.modelId)}` : ''}</span><time>${clock(event.at)}</time></div><details class="tool-body"><summary>The brief this role received${data.promptSha ? ` · <span class="mono">${escape(data.promptSha.slice(0, 12))}</span>` : ''}</summary>${section('OBJECTIVE', prompt.objective)}${section('ROLE INSTRUCTION', prompt.instruction)}${section('OPERATOR NOTES', prompt.notes)}${section('PRIOR WORK', prompt.earlier)}${section('EVIDENCE SUPPLIED', prompt.evidence)}${section('GUIDANCE', prompt.guidance)}</details></article>`;
  }
  if (event.type === 'permission') return `<div class="system-event">${icon('shield')}<span>${escape(role)} ${data.kind === 'question' ? 'asked a question' : 'asked for permission'}${data.title ? `: ${escape(data.title)}` : ''}</span><time>${clock(event.at)}</time></div>`;
  if (event.type === 'brief.unclear') return `<article class="message"><div class="message-avatar">?</div><div class="message-body"><header><strong>Brief check</strong><time>${clock(event.at)}</time></header><p>The brief is not enough to start on. ${escape(data.reason || '')}</p>${(data.questions || []).length ? `<ul>${data.questions.map(question => `<li>${escape(question)}</li>`).join('')}</ul>` : ''}<p class="form-help">Answer in the decision panel; the crew starts once you do. Nothing beyond one cheap check has been spent.</p></div></article>`;
  if (event.type === 'brief.clarified') return `<div class="system-event">${icon('check')}<span>Brief clarified by the operator; the crew starts.</span><time>${clock(event.at)}</time></div>`;
  if (event.type === 'run.runaway') return `<div class="system-event">${icon('info')}<span>${escape(data.message || 'A role exceeded its tool-call limit.')}</span><time>${clock(event.at)}</time></div>`;
  if (event.type === 'review.recorded') return `<div class="system-event">${icon(data.decision === 'accepted' ? 'check' : 'info')}<span>${escape(data.decision === 'accepted' ? 'Accepted' : 'Rejected')} by ${escape(data.byName || role)}${data.note ? `: ${escape(data.note)}` : ''}</span><time>${clock(event.at)}</time></div>`;
  const display = event.type === 'run.finished' ? `${role} finished${data.verdict ? ` · ${verdictLabel(data.verdict)}` : ''}` : data.message || data.summary || (event.type === 'workspace.ready' ? `Workspace ready · ${data.backend}` : event.type === 'run.started' ? `${data.role} started` : event.type === 'session.created' ? 'Session created. Budget authorized; no work started.' : event.type === 'session.started' ? data.resumed ? 'Session resumed by operator' : 'Session started' : event.type === 'run.completed' ? `${role} completed` : event.type === 'budget.increased' ? `Additional authorization: ${money(data.amountUsd)}` : event.type.startsWith('permission.') ? 'An operator decision was recorded' : event.type.startsWith('budget.') ? `Budget accounting: ${event.type.split('.').at(-1)}` : event.type.replaceAll('.', ' '));
  return `<div class="system-event">${icon(event.type.includes('completed') ? 'check' : event.type.includes('failed') ? 'info' : 'circle')}<span>${escape(display)}</span><time>${clock(event.at)}</time></div>`;
}

function streamMarkup() {
  const visible = [];
  const parts = new Map();
  for (const event of state.events) {
    if (['native.session','usage','message.delta','heartbeat','budget.observed','budget.settled','brief.checked'].includes(event.type)) continue;
    const key = event.type === 'message' && event.data?.partId ? `${event.runId}:${event.data.partId}` : event.type === 'tool' && event.data?.partId ? `${event.runId}:tool:${event.data.partId}` : null;
    if (key && parts.has(key)) { if (event.type === 'tool') { Object.assign(parts.get(key).data, event.data); parts.get(key).at = event.at; } else parts.get(key).data.text += event.data.text || ''; continue; }
    const item = { ...event, data: { ...event.data } };
    if (key) parts.set(key, item);
    visible.push(item);
  }
  return `<div class="stream-content">${visible.length ? visible.map(eventMarkup).join('') : '<div class="empty compact"><h3>The workspace is ready.</h3><p>Start the session to see the crew work.</p></div>'}${isActive(state.session) ? '<div class="working-indicator"><span></span><span></span><span></span><em>'+ (state.session.status === 'exporting' ? 'Preparing the repository handoff' : 'The crew is working') +'</em></div>' : ''}</div>`;
}

function costCurve(session) {
  const requests = (session.requests || []).filter(request => request.at).slice().sort((a, b) => a.at.localeCompare(b.at));
  if (requests.length < 2) return '';
  const start = Date.parse(session.runs.find(run => run.startedAt)?.startedAt || requests[0].at);
  const end = Math.max(Date.parse(requests[requests.length - 1].at), start + 1000);
  const budget = session.budgetUsd || 1;
  let total = 0;
  const points = [[0, 0]];
  for (const request of requests) { total += request.usd; points.push([(Date.parse(request.at) - start) / (end - start), total]); }
  const top = Math.max(budget, total) * 1.05;
  const width = 280, height = 72, pad = 4;
  const x = fraction => pad + Math.max(0, Math.min(1, fraction)) * (width - pad * 2);
  const y = value => height - pad - (value / top) * (height - pad * 2);
  const line = points.map(([fraction, value], index) => `${index ? 'L' : 'M'}${x(fraction).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const violations = requests.filter(request => request.violation);
  return `<figure class="cost-curve"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative gateway cost over the session against its budget"><line x1="${pad}" x2="${width - pad}" y1="${y(budget).toFixed(1)}" y2="${y(budget).toFixed(1)}" class="budget-line"/><path d="${line}" class="cost-line"/>${violations.map(request => `<circle cx="${x((Date.parse(request.at) - start) / (end - start)).toFixed(1)}" cy="${y(total).toFixed(1)}" r="3" class="violation-dot"/>`).join('')}</svg><figcaption>${requests.length} requests over ${Math.max(1, Math.round((end - start) / 1000))}s · ceiling ${money(budget)}</figcaption></figure>`;
}

function observabilityLinks(session, request) {
  const o = state.bootstrap.observability;
  if (!o || !o.grafanaUrl) return '';
  const grafana = o.grafanaUrl.replace(/\/$/, '');
  const window = request ? [Date.parse(request.at) - 60000, Date.parse(request.at) + (request.durationMs || 0) + 60000] : session ? [Date.parse(session.runs.find(run => run.startedAt)?.startedAt || session.createdAt) - 60000, Date.parse(session.updatedAt) + 60000] : null;
  const range = window ? { from: String(window[0]), to: String(window[1]) } : { from: 'now-1h', to: 'now' };
  const explore = (uid, query, queryType) => `${grafana}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify({ v: { datasource: uid, queries: [{ refId: 'A', datasource: { uid }, ...(queryType ? { queryType } : {}), ...(query !== undefined ? (queryType === 'traceql' ? { query } : { expr: query }) : {}) }], range } }))}`;
  const fill = template => template.replace('{callId}', request?.callId || '').replace('{alias}', session ? `de-vloer-${session.id}` : '').replace('{sessionId}', session?.id || '');
  const links = [];
  if (o.tracesDatasource) links.push(`<a href="${escape(explore(o.tracesDatasource, fill(o.traceQuery || '{ resource.service.name = "litellm" }'), 'traceql'))}" target="_blank" rel="noopener noreferrer">Traces ${icon('external')}</a>`);
  if (o.logsDatasource) links.push(`<a href="${escape(explore(o.logsDatasource, fill(o.logsQuery || 'k8s_namespace:"ai" AND k8s_container:"litellm"')))}" target="_blank" rel="noopener noreferrer">Logs ${icon('external')}</a>`);
  return links.join(' ');
}

function dashboardLinks() {
  const o = state.bootstrap.observability;
  if (!o || !o.grafanaUrl || !o.dashboards) return '';
  const grafana = o.grafanaUrl.replace(/\/$/, '');
  const names = { spend: 'Spend, budgets and savings', reliability: 'Latency and reliability', finops: 'FinOps' };
  return Object.entries(o.dashboards).map(([key, uid]) => `<a class="external-link" href="${escape(`${grafana}/d/${uid}`)}" target="_blank" rel="noopener noreferrer">${escape(names[key] || key)} ${icon('external')}</a>`).join('');
}

function gatewayMarkup() {
  const session = state.session;
  const requests = session.requests || [];
  if (!requests.length) return `<div class="empty compact">${icon('layers')}<h3>No gateway requests recorded yet</h3><p>${session.costStatus === 'demo' ? 'The demonstration runtime does not call a model gateway.' : 'Each model call the gateway attributes to this session appears here within fifteen seconds, with the provider that served it.'}</p></div>`;
  const roleName = id => id === 'brief' ? 'Brief check' : session.runs.find(run => run.roleId === id)?.roleName || '';
  const totals = requests.reduce((sum, request) => ({ usd: sum.usd + request.usd, savings: sum.savings + (request.savingsUsd || 0), failures: sum.failures + (request.status === 'failure' ? 1 : 0), cached: sum.cached + (request.cachedTokens || 0) }), { usd: 0, savings: 0, failures: 0, cached: 0 });
  const providers = [...new Set(requests.map(request => request.provider).filter(Boolean))];
  const hosts = [...new Set(requests.map(request => request.host).filter(Boolean))];
  const flags = request => [request.violation ? `<span class="tag tag-error">outside policy: ${escape(request.violation)}</span>` : '', request.status === 'failure' ? `<span class="tag tag-error">refused</span>` : '', request.retries ? `<span class="tag">${request.retries} retr${request.retries === 1 ? 'y' : 'ies'}</span>` : '', request.fallbacks ? `<span class="tag">fallback</span>` : '', request.cacheHit ? `<span class="tag">cache hit</span>` : '', request.cachedTokens ? `<span class="tag">${request.cachedTokens} cached</span>` : '', ...(request.guardrails || []).map(name => `<span class="tag">${escape(name)}</span>`)].filter(Boolean).join('');
  return `<div class="gateway-summary"><dl><dt>Gateway</dt><dd class="mono">${escape(state.bootstrap.gateway || 'LiteLLM')}</dd><dt>Providers</dt><dd>${providers.length ? providers.map(escape).join(', ') : '—'}</dd><dt>Endpoints</dt><dd class="mono">${hosts.length ? hosts.map(escape).join('<br>') : '—'}</dd><dt>Requests</dt><dd>${requests.length}${totals.failures ? ` · ${totals.failures} refused` : ''}</dd><dt>Attributed cost</dt><dd>${money(totals.usd)}${totals.savings ? ` · router saved ${money(totals.savings)}` : ''}</dd>${observabilityLinks(session) || dashboardLinks() ? `<dt>Observability</dt><dd class="link-row">${observabilityLinks(session)} ${dashboardLinks()}</dd>` : ''}</dl></div><div class="table-scroll"><table class="gateway-table"><thead><tr><th>Time</th><th>Role</th><th>Answered by</th><th>Route</th><th>Tokens</th><th>Cost</th><th>Latency</th><th></th></tr></thead><tbody>${requests.map(request => `<tr class="${request.status === 'failure' || request.violation ? 'row-failed' : ''}"><td>${clock(request.at)}</td><td>${escape(roleName(request.roleId))}</td><td><span class="mono">${escape(request.model)}</span>${request.provider ? `<br><small>${escape(request.provider)}${request.host ? ` · ${escape(request.host)}` : ''}${request.geo ? ` · ${escape(request.geo)}` : ''}</small>` : ''}</td><td>${request.group ? `<span class="mono">${escape(request.group)}</span>${request.tier ? `<br><small>${escape(request.tier.toLowerCase())}${request.cause ? ` · ${escape(request.cause.replaceAll('_', ' '))}` : ''}</small>` : ''}` : '<small>pinned</small>'}</td><td>${request.inputTokens} in<br><small>${request.outputTokens} out</small></td><td>${money(request.usd)}${request.savingsUsd ? `<br><small>saved ${money(request.savingsUsd)}</small>` : ''}</td><td>${request.durationMs !== undefined ? `${(request.durationMs / 1000).toFixed(1)}s` : '—'}${request.firstTokenMs !== undefined ? `<br><small>first token ${(request.firstTokenMs / 1000).toFixed(1)}s</small>` : ''}</td><td>${flags(request)}${request.error ? `<br><small class="error-text">${escape(request.error)}</small>` : ''}${request.harness ? `<br><small>${escape(request.harness)}</small>` : ''}${observabilityLinks(session, request) ? `<br><small class="link-row">${observabilityLinks(session, request)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function artifactMarkup(kind) {
  const artifacts = state.session.artifacts.filter(artifact => kind === 'handoff' ? ['summary','link','transcript'].includes(artifact.kind) : artifact.kind === kind);
  if (!artifacts.length) return `<div class="empty compact">${icon(kind === 'diff' ? 'code' : 'terminal')}<h3>${kind === 'diff' ? 'Changes will appear here' : kind === 'test' ? 'No check evidence yet' : 'No handoff summary yet'}</h3><p>${kind === 'test' ? 'Only commands that actually ran are recorded as evidence.' : 'The crew will attach its work as the session progresses.'}</p></div>`;
  return artifacts.map(artifact => `<article class="artifact"><header><h3>${escape(artifact.name)}</h3><button class="button text-button" data-action="download-artifact" data-id="${escape(artifact.id)}">${icon('download')} Download</button></header>${kind === 'diff' ? `<pre class="diff">${artifact.content.split('\n').map(line => `<span class="${line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') ? 'diff-meta' : line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-delete' : line.startsWith('@@') ? 'diff-location' : ''}">${escape(line) || ' '}</span>`).join('')}</pre>` : artifact.kind === 'summary' ? `<div class="markdown">${markdown(artifact.content)}</div>` : artifact.kind === 'transcript' ? `<details class="transcript"><summary>Show the full transcript</summary><div class="markdown">${markdown(artifact.content)}</div></details>` : `<pre>${escape(artifact.content)}</pre>`}${artifact.url && /^https?:\/\//.test(artifact.url) ? `<a href="${escape(artifact.url)}" target="_blank" rel="noopener noreferrer">Open artifact ${icon('external')}</a>` : ''}</article>`).join('');
}

function permissionsMarkup() {
  const session = state.session;
  const isolated = ['docker', 'kubernetes'].includes(session?.placement);
  const active = session && !['completed', 'failed', 'cancelled'].includes(session.status);
  const approval = !session ? '' : session.approval === 'auto' ? `<section class="permission-card auto"><div class="permission-heading">${icon('shield')}<div><span class="tiny-label">APPROVAL</span><h3>Automatic for this session</h3></div></div><p>Tool use inside the sandbox is approved without asking. Questions from the crew still wait for you.</p>${active ? `<div class="permission-actions"><button class="button text-button" data-action="approval" data-approval="manual">Ask me again</button></div>` : ''}</section>` : active && isolated ? `<section class="permission-card"><div class="permission-heading">${icon('shield')}<div><span class="tiny-label">APPROVAL</span><h3>Every tool use asks you</h3></div></div><p>The workspace is isolated, so you can let the crew work unattended for the rest of this session.</p><div class="permission-actions"><button class="button secondary" data-action="approval" data-approval="auto">Approve automatically</button></div></section>` : '';
  return approval + state.permissions.filter(request => !request.resolved).map(request => `<section class="permission-card"><div class="permission-heading">${icon('shield')}<div><span class="tiny-label">YOUR DECISION</span><h3>${escape(request.title)}</h3></div></div><p>${escape(request.detail)}</p>${request.kind === 'permission' ? `<div class="permission-actions"><button class="button primary" data-action="permission" data-id="${escape(request.id)}" data-decision="once">Allow once</button><button class="button secondary" data-action="permission" data-id="${escape(request.id)}" data-decision="reject">Reject</button><button class="button text-button" data-action="permission" data-id="${escape(request.id)}" data-decision="always">Allow matching requests</button></div>` : `<form data-form="question" data-id="${escape(request.id)}">${(request.questions || [{ question: request.detail }]).map((question, index) => `<label>${escape(question.question || question.header || `Question ${index + 1}`)}<input name="answer-${index}" required placeholder="Your answer" list="options-${escape(request.id)}-${index}"><datalist id="options-${escape(request.id)}-${index}">${(question.options || []).map(option => `<option value="${escape(option.label || option)}">${escape(option.description || '')}</option>`).join('')}</datalist></label>`).join('')}<button class="button primary" type="submit">Send answer ${icon('send')}</button></form>`}</section>`).join('');
}

function failureNotice(session) {
  const failure = session.failure;
  if (!failure && !session.blocker) return '';
  const stage = failure?.category === 'policy_violation' ? 'Gateway policy' : failure?.category === 'runaway' ? 'Tool-call limit' : ({ credentials: 'Gateway authorization', workspace: 'Workspace setup', runtime: 'Runtime startup', prompt: 'Prompt submission', execution: 'Agent execution' }[failure?.stage] || 'Execution');
  const submission = { not_submitted: 'The prompt was not submitted.', rejected: 'The runtime rejected the prompt.', accepted: 'The runtime acknowledged the prompt; this does not confirm that execution finished.', unknown: 'Prompt submission is unconfirmed. Check remote execution and gateway spend before starting new work.' }[failure?.promptAcceptance];
  return `<section class="notice notice-warning" aria-labelledby="session-failure-title">${icon('info')}<div><strong id="session-failure-title">${failure ? `${stage} needs attention` : session.status === 'interrupted' ? 'Execution was interrupted' : 'This session needs attention'}</strong><p>${escape(failure?.message || session.blocker)}</p>${failure?.remediation ? `<p>${escape(failure.remediation)}</p>` : ''}${failure?.detail ? `<pre class="failure-detail" aria-label="Recorded error output">${escape(failure.detail)}</pre>` : ''}${submission ? `<p>${escape(submission)}</p>` : ''}${failure?.automaticRetry === false ? '<p>No automatic retry will be started.</p>' : ''}${session.status === 'failed' && state.bootstrap.user.role !== 'viewer' ? `<div class="permission-actions">${session.costStatus !== 'unknown' ? '<button class="button primary" data-action="retry">Try again</button>' : '<span class="form-help">Spend is still being reconciled; try again once accounting settles.</span>'}<button class="button secondary" data-action="duplicate">Duplicate as a new session</button></div>` : ''}</div></section>`;
}

function sourceTaskMarkup(session) {
  const task = session.sourceTask;
  if (!task) return '';
  const link = safeUrl(task.url);
  return `<div class="source-task-context">${icon('folder')}<span>Imported from <strong>${escape(providerName(task.provider))} #${escape(task.id)}</strong><span class="source-task-revision"> · source revision ${escape(task.revision.slice(0,12))}</span></span>${link ? `<a href="${escape(link)}" target="_blank" rel="noopener noreferrer">Open original task ${icon('external')}</a>` : ''}</div>`;
}

function candidateMarkup(session) {
  const candidate = session.candidate;
  if (!candidate) return '';
  if (candidate.status !== 'ready') return `<section class="panel candidate-panel" aria-labelledby="candidate-title"><div class="panel-heading"><h2 id="candidate-title">Repository handoff</h2>${icon('branch')}</div><div class="candidate-body"><p>${escape(candidate.message || 'A complete repository export is unavailable for this session. Review the retained evidence and workspace before taking over.')}</p></div></section>`;
  return `<section class="panel candidate-panel" aria-labelledby="candidate-title"><div class="panel-heading"><h2 id="candidate-title">Repository handoff</h2>${icon('branch')}</div><div class="candidate-body"><span class="candidate-ready">${icon('check')} Repository snapshot saved</span><p>Download the captured changes and their manifest for review in your own tools.</p>${candidate.headSha ? `<p class="mono">${escape(candidate.headSha.slice(0,12))}${candidate.fileCount !== undefined ? ` · ${escape(candidate.fileCount)} changed files` : ''}</p>` : ''}<div class="candidate-downloads">${[['bundle','Git bundle','branch'],['patch','Binary patch','code'],['manifest','Manifest','shield'],['attestation','Signed provenance','shield'],['trace','Agent Trace','layers']].filter(([format]) => candidate.formats?.includes(format)).map(([format,label,glyph]) => `<button class="button secondary full" data-action="candidate-download" data-format="${format}">${icon(glyph)}${label}${icon('download')}</button>`).join('')}</div><p class="candidate-review-note">Human review and your repository’s checks are still required. No changes have been pushed or merged.</p></div></section>`;
}

function renderSession() {
  const session = state.session;
  if (!session) return;
  const canOperate = state.bootstrap.user.role !== 'viewer';
  const finished = ['completed','failed','cancelled'].includes(session.status);
  const approved = session.runs.filter(run => run.verdict === 'approve').length;
  const liveSpend = !finished && typeof session.observedUsd === 'number' && session.observedUsd > session.spentUsd;
  const shownSpend = liveSpend ? session.observedUsd : session.spentUsd;
  const controls = `${session.status === 'queued' ? '<button class="button primary" data-action="start">Start crew '+icon('play')+'</button>' : ''}${['running','waiting_input'].includes(session.status) ? '<button class="button secondary" data-action="pause">'+icon('pause')+' Pause</button>' : ''}${['paused','interrupted'].includes(session.status) ? '<button class="button primary" data-action="resume">'+icon('play')+' Resume</button>' : ''}${!finished ? '<button class="button text-button danger" data-action="cancel">'+icon('stop')+' Cancel</button>' : ''}`;
  const content = `<div class="session-topline"><a href="#sessions" class="back-link">${icon('back')} All sessions</a><div>${status(session.status)}<span class="tag">${escape(runtimeName(session.runtime))}</span>${session.placement ? `<span class="tag">${escape(placementName(session.placement))}</span>` : ''}</div></div><section class="session-brief panel"><div><div class="brief-meta"><span>${icon('folder')}${escape(repoName(session.repositoryId))}</span><span>${icon('layers')}${escape(crewName(session.crewId))}</span><span>${icon('clock')}Created ${escape(ago(session.createdAt))}</span></div><p>${escape(session.objective)}</p></div><div class="session-controls">${canOperate ? controls : ''}<button class="button secondary" data-action="export">${icon('download')} Export handoff</button></div></section>
    ${sourceTaskMarkup(session)}${failureNotice(session)}
    ${session.status === 'completed' ? session.review ? `<div class="notice ${session.review.decision === 'accepted' ? 'notice-success' : 'notice-warning'}">${icon(session.review.decision === 'accepted' ? 'check' : 'info')}<div><strong>${session.review.decision === 'accepted' ? 'Accepted' : 'Rejected'} by ${escape(session.review.byName)} · ${escape(ago(session.review.at))}</strong>${session.review.note ? `<p>${escape(session.review.note)}</p>` : '<p>No note.</p>'}<p class="form-help">Recorded in the session history. Nothing was pushed or merged by the workbench.</p></div></div>` : `<div class="notice notice-success">${icon('check')}<div><strong>Your review is next.</strong><p>The crew finished and the candidate is captured. Inspect the changes, checks and transcripts, then record your decision. Nothing has been pushed or merged.</p></div>${canOperate ? `<div class="permission-actions"><button class="button primary" data-action="review" data-decision="accepted">Accept</button><button class="button secondary" data-action="review" data-decision="rejected">Reject…</button><button class="button text-button" data-action="tab" data-id="diff">Inspect changes ${icon('arrow')}</button></div>` : ''}</div>` : ''}
    ${runCards(session)}<div class="session-grid"><section class="panel execution-panel"><div class="tabs" role="tablist" aria-label="Session evidence">${evidenceTabs.map(([id,glyph,label]) => `<button role="tab" id="evidence-tab-${id}" aria-controls="evidence-panel-${id}" tabindex="${state.tab === id ? '0' : '-1'}" aria-selected="${state.tab === id}" data-action="tab" data-id="${id}" class="${state.tab === id ? 'selected' : ''}">${icon(glyph)}${label}${id === 'diff' || id === 'test' ? `<span>${session.artifacts.filter(artifact => artifact.kind === id).length}</span>` : ''}</button>`).join('')}</div>${evidenceTabs.map(([id]) => `<div class="tab-content" role="tabpanel" id="evidence-panel-${id}" aria-labelledby="evidence-tab-${id}" tabindex="0" data-tab="${id}" data-session-id="${escape(session.id)}" ${state.tab === id ? '' : 'hidden'}>${state.tab === id ? id === 'stream' ? streamMarkup() : id === 'gateway' ? gatewayMarkup() : artifactMarkup(id) : ''}</div>`).join('')}${!finished && session.status !== 'exporting' && canOperate ? `<form class="composer" data-form="message"><label for="operator-message">Steer the next execution</label><div><textarea id="operator-message" name="text" rows="2" placeholder="Add a constraint, clarify the objective, or leave a handoff note…" required>${escape(state.draft)}</textarea><button class="button primary icon-only" type="submit" aria-label="Save instruction">${icon('send')}</button></div><p>Instructions are saved durably. Pause and resume to apply them to the current role.</p></form>` : ''}</section><aside class="right-column">${permissionsMarkup()}${candidateMarkup(session)}<section class="panel budget-panel"><div class="panel-heading"><h2>Session budget</h2>${icon('shield')}</div><div class="budget-value">${money(shownSpend)}<span> / ${money(session.budgetUsd)}</span></div><progress max="${session.budgetUsd || 1}" value="${Math.min(shownSpend, session.budgetUsd)}" aria-label="Recorded session spend"></progress><div class="budget-details"><span>Accounting</span><strong>${escape(session.costStatus === 'demo' ? 'Demo · no charge' : liveSpend ? 'Observed at the gateway · settles later' : session.costStatus === 'unknown' ? 'Unresolved · hold retained' : session.costStatus === 'pending' ? 'Awaiting gateway settlement' : 'Settled')}</strong></div>${costCurve(session)}${(session.usage || []).length ? `<dl class="usage-list">${session.usage.map(entry => `<dt>${escape(entry.group ? `${entry.group} → ${entry.model}` : entry.model)}</dt><dd>${entry.requests} request${entry.requests === 1 ? '' : 's'}${entry.failures ? ` · ${entry.failures} refused` : ''} · ${money(entry.usd)}</dd>`).join('')}</dl>` : ''}<p>${session.costStatus === 'demo' ? 'This session uses a deterministic demonstration runtime. No tokens are consumed.' : session.costStatus === 'unknown' ? 'Unknown usage is never treated as zero. Previous authorization stays reserved.' : 'A scoped gateway key bounds this engagement. Model usage is reconciled independently.'}</p>${state.bootstrap.observability?.grafanaUrl && state.bootstrap.observability.dashboards?.spend ? `<a class="external-link" href="${escape(`${state.bootstrap.observability.grafanaUrl.replace(/\/$/, '')}/d/${state.bootstrap.observability.dashboards.spend}`)}" target="_blank" rel="noopener noreferrer">Cost per run on Grafana ${icon('external')}</a>` : ''}${state.bootstrap.user.role === 'admin' && !finished && session.status !== 'exporting' ? '<button class="button secondary full" data-action="budget">Authorize more budget</button>' : ''}</section><section class="panel details-panel"><div class="panel-heading"><h2>Working context</h2></div><dl><dt>Branch</dt><dd class="mono">${escape(session.branch)}</dd><dt>Model</dt><dd>${escape(session.model ? (state.bootstrap.models.find(model => model.id === session.model) || { name: session.model }).name : 'Crew default')}</dd><dt>Operator</dt><dd>${escape(session.ownerName)}</dd><dt>Explicit reviews</dt><dd>${approved} of ${session.runs.filter(run => run.mode === 'read').length}</dd><dt>Session</dt><dd class="mono">${escape(session.id.slice(0,8))}</dd></dl>${session.trackerUrl ? `<a class="external-link" href="${escape(session.trackerUrl)}" target="_blank" rel="noopener noreferrer">Open tracker ${icon('external')}</a>` : ''}${state.sessions.some(other => other.id !== session.id && other.repositoryId === session.repositoryId) ? `<button class="button secondary full" data-action="compare">Compare with another session</button>` : ''}</section></aside></div>`;
  renderHtml(shell(content, session.title, 'A bounded objective. A visible crew. Reviewable evidence.'));
  if (state.busy) for (const button of document.querySelectorAll('.session-controls [data-action]')) if (['start','pause','resume','cancel'].includes(button.dataset.action)) button.disabled = true;
}

function renderSystem() {
  const health = state.health;
  const content = `<div class="environment-grid"><section class="panel"><div class="panel-heading"><h2>Execution environment</h2>${icon('shield')}</div><dl class="environment-list"><dt>Deployment</dt><dd>${state.bootstrap.mode === 'demo' ? 'Local demonstration' : 'Live workbench'}</dd><dt>Workspace placements</dt><dd>${state.bootstrap.mode === 'demo' ? 'Demonstration fixture' : (state.bootstrap.placements || []).length ? (state.bootstrap.placements || []).map(placement => `${escape(placement.name)}${placement.default ? ' · default' : ''}`).join('<br>') : escape(health?.workspaceBackend || 'Loading…')}</dd><dt>Model gateway</dt><dd>${state.bootstrap.mode === 'demo' ? 'Not used in demonstration' : health?.litellm ? 'LiteLLM configured' : 'Not configured · paid execution blocked'}</dd>${dashboardLinks() ? `<dt>Dashboards</dt><dd class="link-row">${dashboardLinks()}</dd>` : ''}<dt>Gateway policy</dt><dd>${state.bootstrap.gatewayPolicy ? [state.bootstrap.gatewayPolicy.providers ? `providers: ${state.bootstrap.gatewayPolicy.providers.map(escape).join(', ')}` : '', state.bootstrap.gatewayPolicy.regions ? `regions: ${state.bootstrap.gatewayPolicy.regions.map(escape).join(', ')}` : ''].filter(Boolean).join('<br>') : 'Any provider and region the gateway routes to'}</dd><dt>Concurrent sessions</dt><dd>${state.bootstrap.maxConcurrentSessions}</dd><dt>Maximum session authorization</dt><dd>${money(state.bootstrap.maxBudgetUsd)}</dd><dt>Storage</dt><dd>Persistent SQLite · one application replica</dd></dl></section><section class="panel"><div class="panel-heading"><h2>Registered repositories</h2><span class="count-badge">${state.bootstrap.repositories.length}</span></div>${state.bootstrap.repositories.map(repo => `<article class="profile-row">${icon('folder')}<div><h3>${escape(repo.name)}</h3><p>${escape(repo.description)}</p><span class="tag">${escape(repo.baseBranch)}</span></div></article>`).join('')}</section><section class="panel span-two"><div class="panel-heading"><h2>Reusable crews</h2><p>Procedures are versioned with the configuration.</p></div><div class="crew-profiles">${state.bootstrap.crews.map(crew => `<article><span class="tiny-label">${escape(crew.id)}</span><h3>${escape(crew.name)}</h3><p>${escape(crew.description)}</p><div>${crew.roles.map(role => `<span class="role-chip">${icon(role.mode === 'write' ? 'code' : 'shield')}${escape(role.name)}</span>`).join('')}</div></article>`).join('')}</div></section></div>`;
  renderHtml(shell(content, 'Environment', 'The shared foundation behind every session.'));
}

const providerLabels = { gitlab: 'GitLab', clickup: 'ClickUp' };

function linkRow(link) {
  const label = providerLabels[link.provider] || link.provider;
  const where = link.provider === 'clickup' ? 'ClickUp → your avatar → Settings → Apps → API Token' : 'GitLab → Preferences → Access tokens, with read_api, read_repository and write_repository';
  const status = link.linked ? `Linked as ${link.webUrl ? `<a href="${escape(link.webUrl)}" target="_blank" rel="noopener noreferrer">${escape(link.login)}</a>` : escape(link.login)}${link.method === 'token' ? ' · personal token' : ''}${(link.scopes || []).length ? ` · ${link.scopes.map(escape).join(', ')}` : ''}` : link.provider === 'gitlab' ? 'Not linked. Private repositories on this host cannot be cloned until you link.' : 'Not linked. Task connections on ClickUp show nothing until you link.';
  const actions = link.linked ? `<button class="button secondary" data-action="unlink" data-provider="${escape(link.provider)}">Unlink</button>` : `${link.oauth ? `<button class="button primary" data-action="link" data-provider="${escape(link.provider)}">Link ${escape(label)}</button>` : ''}<form data-form="paste-token" data-provider="${escape(link.provider)}" class="paste-token"><label>${link.oauth ? 'Or paste a personal token' : 'Paste a personal token'}<input name="token" type="password" autocomplete="off" required placeholder="${escape(link.provider === 'clickup' ? 'pk_…' : 'glpat-…')}"></label><button class="button ${link.oauth ? 'secondary' : 'primary'}" type="submit">Save</button><p class="form-help">${escape(where)}. Stored encrypted for your account only.</p></form>`;
  return `<article class="profile-row link-row-card">${icon('link')}<div><h3>${escape(label)} · ${escape(link.host)}</h3><p>${status}</p></div><div class="link-actions">${actions}</div></article>`;
}

function renderAccount() {
  const links = state.links || [];
  const content = `<section class="panel"><div class="panel-heading"><div><h2>Linked accounts</h2><p>Links are yours. The workbench clones and reads tasks with them and never hands them to a sandbox.</p></div></div>${!state.links ? '<div class="empty compact"><p>Loading…</p></div>' : links.length ? links.map(linkRow).join('') : '<div class="empty compact"><p>This workbench has no linkable accounts configured.</p></div>'}</section>`;
  renderHtml(shell(content, 'Linked accounts', 'Sign in once, link what you need.'));
}

function renderPloeg() {
  const ploeg = state.ploeg;
  const content = `<section class="panel"><div class="panel-heading"><div><h2>Unattended dispatch</h2><p>Ploeg owns the queue, leases and execution of assigned tracker work.</p></div><span class="tag">READ-ONLY CONNECTION</span></div>${!ploeg ? '<div class="empty compact"><p>Checking the configured connection…</p></div>' : !ploeg.configured ? `<div class="empty"><span class="empty-icon">${icon('layers')}</span><h3>Connect your existing dispatch plane</h3><p>Configure Ploeg’s internal URL and team IDs on the server. This view then shows the actual queue depth for each team.</p><div class="connection-example"><code>ploeg.url</code><span>Internal Ploeg API</span><code>ploeg.teams</code><span>Registered team IDs</span></div></div>` : `<div class="queue-grid">${ploeg.teams.map(team => `<article><span class="tiny-label">${escape(team.team)}</span><strong>${team.available ? team.depth : '—'}</strong><p>${team.available ? 'queued work items' : escape(team.message)}</p></article>`).join('')}</div><div class="panel-bottom"><p>${escape(ploeg.message)}</p>${ploeg.trackerUrl ? `<a class="button secondary" href="${escape(ploeg.trackerUrl)}" target="_blank" rel="noopener noreferrer">Open tracker ${icon('external')}</a>` : ''}</div>`}</section>`;
  renderHtml(shell(content, 'Ploeg queues', 'Interactive work here. Assigned delivery work in Ploeg.'));
}

function taskPreviewMarkup() {
  const task = state.task;
  const source = selectedTaskSource();
  if (state.taskPreviewLoading) return '<div class="empty task-preview-empty" role="status"><span class="empty-icon">'+icon('clock')+'</span><h3>Opening the latest task</h3><p>Fetching its current description and revision.</p></div>';
  if (!task) return `<div class="empty task-preview-empty"><span class="empty-icon">${icon('branch')}</span><h3>Select a task. Shape the work.</h3><p>Review the source brief, choose your crew, then start a session when you are ready.</p>${state.taskPreviewError ? `<p class="form-error" role="alert">${escape(state.taskPreviewError)}</p>` : ''}</div>`;
  const draft = state.taskDraft;
  const link = safeUrl(task.url);
  const blocked = source?.executionOwner === 'ploeg' || state.bootstrap.user.role === 'viewer' || task.status !== 'open';
  return `<article class="task-preview" aria-labelledby="task-preview-title"><header><div><span class="tiny-label">SOURCE BRIEF · ${escape(providerName(task.provider))}</span><h2 id="task-preview-title">${escape(task.title)}</h2></div>${link ? `<a class="icon-button" href="${escape(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open original task">${icon('external')}</a>` : ''}</header><div class="task-preview-meta"><span class="tag">${escape(task.status)}</span><span>${icon('folder')}${escape(repoName(task.repositoryId))}</span><span class="mono">#${escape(task.id)}</span></div><div class="task-description">${escape(task.description || 'This task has no description. Review the original task before starting work.')}</div><div class="task-revision"><span>Snapshot ${escape(task.revision.slice(0,12))}</span>${task.updatedAt ? `<span>Updated ${escape(ago(task.updatedAt))}</span>` : ''}</div>${state.taskChanged ? '<div class="notice notice-warning task-import-notice" role="alert"><div><strong>The source task changed.</strong><p>This is its latest version. Review the updated brief before creating the session. Your crew and budget choices are preserved.</p></div></div>' : ''}${state.taskPreviewError ? `<div class="form-error task-import-notice" role="alert">${escape(state.taskPreviewError)}</div>` : ''}${source?.executionOwner === 'ploeg' ? `<div class="notice task-import-notice"><div><strong>Ploeg manages this connection.</strong><p>Interactive import is disabled. Use your tracker’s assignment workflow for unattended delivery.</p></div></div>` : state.bootstrap.user.role === 'viewer' ? '<div class="notice task-import-notice">Your account can inspect tasks. An operator can create a session.</div>' : blocked ? '<div class="notice task-import-notice">Only open tasks can be imported. Check its state in the source system before starting work.</div>' : `<form data-form="task-import" class="task-import-form"><div class="task-import-heading"><span class="tiny-label">YOUR WORKING AGREEMENT</span><h3>Bring this task onto the floor.</h3><p>The registered repository is fixed by this connection. You choose the crew and spending limit.</p></div><div class="form-grid"><label>Crew<select id="task-crew" name="crewId">${state.bootstrap.crews.map(crew => `<option value="${escape(crew.id)}" ${draft.crewId === crew.id ? 'selected' : ''}>${escape(crew.name)}</option>`).join('')}</select></label><label>Runtime<select id="task-runtime" name="runtime">${state.bootstrap.runtimes.map(runtime => `<option value="${escape(runtime.id)}" ${draft.runtime === runtime.id ? 'selected' : ''}>${escape(runtime.name)}</option>`).join('')}</select></label>${placementField('task', draft.placement)}<label>Session budget · USD<input id="task-budget" name="budgetUsd" type="number" min="0.01" max="${state.bootstrap.maxBudgetUsd}" step="0.01" value="${escape(draft.budgetUsd)}" required></label><div class="task-start-contract">${icon('shield')}<span>Created ready to start.<br>You decide when the crew runs.</span></div></div><button class="button primary full" type="submit" ${state.taskImporting ? 'disabled' : ''}>${state.taskImporting ? 'Creating session…' : 'Create session'} ${icon('arrow')}</button><p class="form-help">The source task stays in its tracker. Importing does not assign it, change its status or start model usage.</p></form>`}</article>`;
}

function renderTasks() {
  const sources = taskSources();
  const source = selectedTaskSource();
  const unlinked = source?.needsLink && !(state.links || []).some(link => link.provider === source.needsLink && link.linked);
  const selected = state.tasks.filter(task => `${task.id} ${task.title}`.toLowerCase().includes(state.taskSearch.toLowerCase()));
  const content = !sources.length ? `<section class="panel"><div class="empty"><span class="empty-icon">${icon('layers')}</span><h2>Your work already has a home.</h2><p>Connect Forgejo, GitHub, GitLab, ClickUp or Vikunja. Bring their tasks into the same remote workbench.</p><button class="button primary" data-action="connections">Set up a connection ${icon('arrow')}</button></div></section>` : `<div class="task-source-strip" role="group" aria-label="Task connections">${sources.map(item => `<button id="task-source-${escape(item.id)}" class="task-source ${state.taskSourceId === item.id ? 'selected' : ''}" data-action="task-source" data-id="${escape(item.id)}" aria-pressed="${state.taskSourceId === item.id}"><span class="source-avatar">${escape(providerName(item.provider).slice(0,1))}</span><span><strong>${escape(item.name)}</strong><small>${escape(providerName(item.provider))}${item.executionOwner === 'ploeg' ? ' · Ploeg managed' : ' · Operator led'}</small></span>${icon('chevron')}</button>`).join('')}</div>${state.bootstrap.mode === 'demo' ? '<div class="task-demo-caption">'+icon('info')+'<span>Sample tracker data. Import the rounding task to run the real demonstration fixture.</span></div>' : ''}<div class="task-grid"><section class="panel task-list-panel" aria-label="Source tasks"><div class="panel-heading"><div><h2>${escape(source?.name || 'Tasks')}</h2><p>${escape(source ? repoName(source.repositoryId) : '')}</p></div><button class="icon-button" data-action="task-refresh" aria-label="Refresh tasks" ${state.taskLoading ? 'disabled' : ''}>${icon('activity')}</button></div><label class="search-box task-search">${icon('search')}<input id="task-search" type="search" aria-label="Search loaded tasks" placeholder="Find a task on this page" value="${escape(state.taskSearch)}"></label><div class="task-list" aria-busy="${state.taskLoading}">${state.taskLoading ? '<div class="empty compact" role="status"><p>Loading tasks from the connection…</p></div>' : state.taskError ? `<div class="empty compact"><h3>Connection needs attention</h3><p role="alert">${escape(state.taskError)}</p><button class="button secondary" data-action="task-refresh">Try again</button></div>` : selected.length ? selected.map(task => `<button id="task-row-${escape(task.id)}" class="task-row ${state.task?.id === task.id ? 'selected' : ''}" data-action="task-preview" data-id="${escape(task.id)}" aria-pressed="${state.task?.id === task.id}"><span class="task-row-meta"><span>#${escape(task.id)}</span><span>${escape(task.status)}</span></span><strong>${escape(task.title)}</strong><span class="task-row-footer">Review brief ${icon('arrow')}</span></button>`).join('') : `<div class="empty compact"><h3>${state.taskSearch ? 'No matching tasks' : 'No open tasks on this page'}</h3><p>${state.taskSearch ? 'Try another title or task number.' : 'Refresh after adding work to the connected project.'}</p></div>`}</div><div class="task-pagination"><button class="button text-button" data-action="task-page" data-page="${state.taskPage - 1}" ${state.taskPage <= 1 || state.taskLoading ? 'disabled' : ''}>${icon('back')} Previous</button><span>Page ${state.taskPage}</span><button class="button text-button" data-action="task-page" data-page="${state.taskNextPage || ''}" ${!state.taskNextPage || state.taskLoading ? 'disabled' : ''}>Next ${icon('arrow')}</button></div></section><section class="panel task-preview-panel">${taskPreviewMarkup()}</section></div>`;
  renderHtml(shell((unlinked ? `<div class="notice notice-warning">${icon('link')}<div><strong>${escape(providerLabels[source.needsLink] || source.needsLink)} is not linked.</strong><p>This connection reads tasks with your own account. <a href="#account">Open Linked accounts</a> to link it.</p></div></div>` : '') + content, 'Tasks', 'Your tracker’s work. One shared way to move it forward.'));
}

function openConnections() {
  const dialog = $('#task-connections');
  dialog.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">LINK THE SYSTEMS YOU USE</p><h2 id="connections-title">Your tasks, connected.</h2></div><button class="icon-button" data-action="close-connections" aria-label="Close connections">${icon('x')}</button></header><div class="dialog-body"><div class="provider-chips">${['forgejo','github','gitlab','clickup','vikunja'].map(provider => `<span>${escape(providerName(provider))}</span>`).join('')}</div><p>An administrator links each project or list to a registered repository. Everyone then uses the same task preview and session workflow.</p><ol class="connection-steps"><li><strong>Register the connection</strong><span>Set its provider, server address and project or list in the server’s taskSources configuration.</span></li><li><strong>Supply a read-only credential</strong><span>Store the token in the server environment and reference its variable name in the connection. Credentials stay on the server.</span></li><li><strong>Choose who owns execution</strong><span>Use interactive for operator-created sessions, or ploeg to keep the connection under unattended dispatch.</span></li></ol><p class="form-help">Setup examples for all five providers ship in docs/operations/task-connections.md. Restart the server after updating its configuration.</p>${taskSources().length ? `<div class="configured-connections"><h3>Registered connections</h3>${taskSources().map(source => `<div><span><strong>${escape(source.name)}</strong><small>${escape(providerName(source.provider))} → ${escape(repoName(source.repositoryId))}</small></span><span class="tag">${source.executionOwner === 'ploeg' ? 'Ploeg managed' : 'Operator led'}</span></div>`).join('')}</div>` : ''}</div><footer class="dialog-footer"><button class="button primary" data-action="close-connections">Done</button></footer>`;
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
    if (state.view === 'tasks') $('#announcement').textContent = `Task preview ready: ${task.title}`;
  } catch (error) { if (request === state.previewRequest) { state.task = null; state.taskPreviewError = error.message; } }
  finally { if (request === state.previewRequest) { state.taskPreviewLoading = false; if (state.view === 'tasks' && state.bootstrap) renderTasks(); } }
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
  if (state.view === 'account') return renderAccount();
  if (state.view === 'compare') return renderCompare();
  if (state.view === 'system') return renderSystem();
  if (state.view === 'tasks') return renderTasks();
  renderDashboard();
}

function loginFailure(code) {
  if (!code) return '';
  if (code === 'oidc_not_entitled') return 'You signed in, but your account is in none of the groups this workbench admits. Ask an administrator for the vloer group.';
  if (code === 'oidc_state') return 'The sign-in attempt expired. Start it again.';
  if (code === 'access_denied') return 'You cancelled the sign-in at the identity provider.';
  return `Single sign-on failed: ${code}.`;
}

async function renderLogin(error = '') {
  if (!state.authMethods) { try { state.authMethods = await (await fetch('/api/auth/methods', { credentials: 'same-origin' })).json(); } catch { state.authMethods = { local: true, oidc: null }; } }
  const params = new URLSearchParams(location.search);
  if (params.get('login_error')) { error = error || loginFailure(params.get('login_error')); history.replaceState(null, '', location.pathname); }
  const sso = state.authMethods.oidc ? `<a class="button primary full sso-button" href="/api/auth/oidc">Sign in with ${escape(state.authMethods.oidc.name)}</a><p class="form-help">Your estate identity. Your role follows your groups.</p><div class="login-divider"><span>or a local account</span></div>` : '';
  $('#app').innerHTML = `<main class="login-page" id="main"><section class="login-brand"><div class="brand-mark"><i></i><i></i><i></i></div><span>de vloer</span><h1>A place to<br>direct the work.</h1><p>Remote workspaces. Reusable crews.<br>Evidence you can inspect.</p></section><section class="login-form"><div><p class="eyebrow">YOUR TEAM’S WORKBENCH</p><h2>Welcome back.</h2><p>Sign in with your De Vloer account.</p>${sso}<form data-form="login"><label>Account name<input name="name" autocomplete="username" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}<button class="button primary full" type="submit">Sign in ${icon('arrow')}</button></form><small>Your administrator provisions workbench accounts.</small></div></section></main>`;
}

function modelHint(models, id) {
  const first = state.bootstrap.models[0];
  const model = models.find(item => item.id === (id || first?.id));
  if (!model) return '';
  const tiers = model.tiers ? Object.entries(model.tiers).map(([tier, target]) => { const resolved = models.find(item => item.modelId === target); return `${tier.toLowerCase()} → ${target}${resolved?.provider ? ` (${resolved.provider})` : ''}`; }).join(' · ') : '';
  return `${id ? '' : 'Crew default: '}${escape(model.modelId)}${model.provider && !model.tiers ? ` · served by ${escape(model.provider)}` : ''}${tiers ? ` · router: ${escape(tiers)}` : ''}${model.providers?.length && model.tiers ? ` · providers: ${model.providers.map(escape).join(', ')}` : ''}`;
}

async function loadModels() {
  if (state.models) return;
  try { state.models = (await api('/api/models')).models; } catch { state.models = []; }
  const hint = document.querySelector('[data-model-hint]'); const select = document.querySelector('[data-model-select]');
  if (hint && select) hint.innerHTML = modelHint(state.models, select.value);
}

function openNew() {
  const dialog = $('#new-session');
  const demo = state.bootstrap.mode === 'demo';
  void loadModels();
  dialog.innerHTML = `<form data-form="new"><header class="dialog-header"><div><p class="eyebrow">A NEW ENGAGEMENT</p><h2 id="new-title">Give your crew a clear brief.</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">${icon('x')}</button></header><div class="dialog-body">${demo ? '<div class="notice compact-notice">Demonstration mode always runs the supplied rounding fixture. Live deployments execute your own objectives.</div>' : ''}<label>Session title<input name="title" placeholder="e.g. Fix the order total rounding regression" maxlength="160" value="${demo ? 'Fix order total rounding' : ''}" required></label><label>Objective and acceptance criteria<textarea name="objective" rows="4" maxlength="16000" placeholder="What should change? What evidence will show it works?" required>${demo ? 'Reproduce the rounding regression in the order service. Apply a minimal fix, keep the tests intact, and have an independent reviewer inspect the patch and rerun the checks.' : ''}</textarea></label><div class="form-grid"><label>Repository<select name="repositoryId">${state.bootstrap.repositories.map(repo => `<option value="${escape(repo.id)}">${escape(repo.name)}</option>`).join('')}</select></label><label>Crew<select name="crewId">${state.bootstrap.crews.map(crew => `<option value="${escape(crew.id)}">${escape(crew.name)}</option>`).join('')}</select></label><label>Runtime<select name="runtime">${state.bootstrap.runtimes.map(runtime => `<option value="${escape(runtime.id)}">${escape(runtime.name)}</option>`).join('')}</select></label>${placementField('new')}<label>Model<select name="model" data-model-select><option value="">Crew default</option>${state.bootstrap.models.map(model => `<option value="${escape(model.id)}">${escape(model.name)}</option>`).join('')}</select><span class="form-help" data-model-hint>${state.models ? modelHint(state.models, '') : 'Checking routes at the gateway…'}</span></label><label class="checkbox-field"><input type="checkbox" name="approval" value="auto"> Approve tool use automatically<span class="form-help">Only in a container or pod. Questions still reach you.</span></label><label>Session budget · USD<input name="budgetUsd" type="number" min="0.01" max="${state.bootstrap.maxBudgetUsd}" step="0.01" value="${Math.min(5, state.bootstrap.maxBudgetUsd)}" required></label></div><p class="form-help">${demo ? 'The authorization is illustrative; demonstration spend remains $0.' : 'This caps the engagement across its roles. Additional authorization requires an administrator.'}</p></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Create session ${icon('arrow')}</button></footer></form>`;
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
    if (hash.startsWith('compare/')) { const [left, right] = hash.slice(8).split('/'); disconnect(); state.session = null; state.view = 'compare'; state.compare = null; renderCompare(); state.compare = await Promise.all([api(`/api/sessions/${encodeURIComponent(left)}`), api(`/api/sessions/${encodeURIComponent(right)}`)]); return renderCompare(); }
    disconnect(); state.session = null; state.view = ['sessions','tasks','ploeg','account','system'].includes(hash) ? hash : 'sessions';
    state.sessions = await api('/api/sessions'); render();
    if (state.view === 'tasks' && !state.links) { try { state.links = (await api('/api/links')).links; } catch { state.links = []; } }
    if (state.view === 'tasks' && taskSources().length) await loadTasks(state.taskSourceId || taskSources()[0].id);
    if (state.view === 'ploeg') { state.ploeg = await api('/api/ploeg'); renderPloeg(); }
    if (state.view === 'account') { state.links = (await api('/api/links')).links; renderAccount(); }
    if (state.view === 'system') { state.health = await api('/api/health'); renderSystem(); }
  } catch (error) { notify(error.message, true); if (state.bootstrap) { state.view = 'sessions'; renderDashboard(); } }
}

function download(filename, content, type = 'text/plain') {
  const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadCandidate(format) {
  if (!state.session || !['bundle', 'patch', 'manifest', 'attestation', 'trace'].includes(format)) return;
  const sessionId = state.session.id;
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/candidate/download?format=${format}`, { credentials: 'same-origin' });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) { disconnect(); state.bootstrap = null; renderLogin(); }
    throw new Error(data.error?.message || 'The repository export could not be downloaded.');
  }
  const blob = await response.blob();
  download(`de-vloer-${sessionId.slice(0,8)}.${format === 'manifest' ? 'json' : format}`, blob, blob.type);
}

function exportHandoff() {
  const session = state.session;
  const content = [`# ${session.title}`, '', `Runtime: ${runtimeName(session.runtime)}`, `Status: ${statusLabel(session)}`, `Repository: ${repoName(session.repositoryId)}`, `Branch: ${session.branch}`, `Accounting: ${session.costStatus}; recorded spend ${money(session.spentUsd)}; authorization ${money(session.budgetUsd)}`, '', '## Objective', session.objective, '', ...session.runs.flatMap(run => [`## ${run.roleName}`, `Status: ${run.status}${run.verdict ? `; verdict: ${run.verdict}` : ''}`, run.summary || 'No completed summary.', '']), ...session.artifacts.flatMap(artifact => [`## ${artifact.name}`, '', '````', artifact.content, '````', '']), 'No automatic merge or deployment was performed.'].join('\n');
  download(`de-vloer-${session.id.slice(0,8)}.md`, content, 'text/markdown');
}

async function lifecycle(action) {
  if (state.busy || !state.session) return;
  const sessionId = state.session.id;
  state.busy = true;
  renderSession();
  try {
    const session = await api(`/api/sessions/${sessionId}/${action}`, { method: 'POST', body: '{}' });
    state.sessions = state.sessions.map(item => item.id === sessionId ? session : item);
    if (state.view === 'session' && state.session?.id === sessionId) state.session = session;
    notify(action === 'pause' ? 'Paused. Your context and budget remain attached to this session.' : action === 'cancel' ? 'Cancelled. This work will not automatically retry.' : 'The crew is starting.');
  }
  catch (error) { notify(error.message, true); }
  finally { state.busy = false; if (state.view === 'session' && state.session?.id === sessionId) renderSession(); }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === 'new') openNew();
    else if (action === 'connections') openConnections();
    else if (action === 'close-connections') $('#task-connections').close();
    else if (action === 'task-source') await loadTasks(button.dataset.id);
    else if (action === 'task-refresh') await loadTasks(state.taskSourceId, state.taskPage);
    else if (action === 'task-page') await loadTasks(state.taskSourceId, Number(button.dataset.page));
    else if (action === 'task-preview') await openTask(button.dataset.id);
    else if (action === 'close-dialog') $('#new-session').close();
    else if (action === 'open') { state.tab = 'stream'; location.hash = `session/${button.dataset.id}`; }
    else if (action === 'filter') { state.filter = button.dataset.id; renderDashboard(); }
    else if (action === 'tab') selectEvidenceTab(button.dataset.id);
    else if (['start','pause','resume'].includes(action)) await lifecycle(action);
    else if (action === 'cancel') confirmAction('Cancel this session?', 'The active turn will stop and no remaining role will start. This session cannot be resumed after cancellation.', 'Cancel session', () => lifecycle('cancel'));
    else if (action === 'export') exportHandoff();
    else if (action === 'candidate-download') { button.disabled = true; try { await downloadCandidate(button.dataset.format); } finally { button.disabled = false; } }
    else if (action === 'download-artifact') { const artifact = state.session.artifacts.find(item => item.id === button.dataset.id); if (artifact) download(`${artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${artifact.kind === 'diff' ? 'patch' : 'txt'}`, artifact.content); }
    else if (action === 'link') { button.disabled = true; try { const { url } = await api(`/api/links/${button.dataset.provider}`, { method: 'POST', body: '{}' }); location.assign(url); } finally { button.disabled = false; } }
    else if (action === 'unlink') { const label = providerLabels[button.dataset.provider] || button.dataset.provider; confirmAction(`Unlink ${label}?`, `The workbench forgets the token${button.dataset.provider === 'gitlab' ? 's and asks GitLab to revoke them. Sessions on private repositories from this host will fail to clone until you link again' : '. Task connections on ClickUp will show nothing until you link again'}.`, 'Unlink', async () => { await api(`/api/links/${button.dataset.provider}`, { method: 'DELETE' }); state.links = (await api('/api/links')).links; renderAccount(); }); }
    else if (action === 'review') {
      const decision = button.dataset.decision; const dialog = $('#confirm-dialog');
      dialog.innerHTML = `<form data-form="review" data-decision="${escape(decision)}"><div class="dialog-body"><h2 id="confirm-title">${decision === 'accepted' ? 'Accept this outcome' : 'Reject this outcome'}</h2><p>${decision === 'accepted' ? 'You have reviewed the candidate and it is fit to take further. A note is optional.' : 'Say why, so the next attempt can use it. The note is required.'}</p><label>Note<textarea name="note" rows="3" maxlength="2000" ${decision === 'rejected' ? 'required' : ''}></textarea></label></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-budget">Cancel</button><button class="button primary" type="submit">${decision === 'accepted' ? 'Accept' : 'Reject'}</button></footer></form>`;
      dialog.showModal();
    }
    else if (action === 'retry') { button.disabled = true; try { await api(`/api/sessions/${state.session.id}/retry`, { method: 'POST', body: '{}' }); notify('Trying again. The crew starts from the beginning.'); await openSession(state.session.id); } catch (error) { notify(error.message, true); button.disabled = false; } }
    else if (action === 'duplicate') { const source = state.session; location.hash = 'sessions'; openNew(); const form = $('#new-session form'); if (form) { for (const [name, value] of Object.entries({ title: source.title, objective: source.objective, repositoryId: source.repositoryId, crewId: source.crewId, model: source.model || '', budgetUsd: source.budgetUsd })) { const field = form.elements[name]; if (field) field.value = value; } if (source.placement && form.elements.placement) form.elements.placement.value = source.placement; if (source.approval === 'auto' && form.elements.approval) form.elements.approval.checked = true; } }
    else if (action === 'logout') { await api('/api/logout', { method: 'POST', body: '{}' }); state.bootstrap = null; disconnect(); renderLogin(); }
    else if (action === 'compare') openCompareDialog();
    else if (action === 'approval') { button.disabled = true; try { state.session = await api(`/api/sessions/${state.session.id}/approval`, { method: 'POST', body: JSON.stringify({ approval: button.dataset.approval }) }); notify(button.dataset.approval === 'auto' ? 'The crew now works without asking for each tool.' : 'The crew asks you again before each tool.'); renderSession(); } finally { button.disabled = false; } }
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
  if (event.target.id === 'task-search') { state.taskSearch = event.target.value; renderTasks(); }
  if (event.target.closest('[data-form="task-import"]') && state.taskDraft) state.taskDraft[event.target.name] = event.target.value;
});
document.addEventListener('change', event => {
  const select = event.target.closest('[data-model-select]');
  if (select) { const hint = document.querySelector('[data-model-hint]'); if (hint && state.models) hint.innerHTML = modelHint(state.models, select.value); }
  if (event.target.closest('[data-form="task-import"]') && state.taskDraft) state.taskDraft[event.target.name] = event.target.value;
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
  try {
    if (form.dataset.form === 'login') { await api('/api/login', { method: 'POST', body: JSON.stringify(data) }); await boot(); }
    else if (form.dataset.form === 'paste-token') { await api(`/api/links/${form.dataset.provider}`, { method: 'PUT', body: JSON.stringify({ token: data.token }) }); notify(`${providerLabels[form.dataset.provider] || form.dataset.provider} is linked to your account.`); state.links = (await api('/api/links')).links; renderAccount(); }
    else if (form.dataset.form === 'review') { $('#confirm-dialog').close(); state.session = await api(`/api/sessions/${state.session.id}/review`, { method: 'POST', body: JSON.stringify({ decision: form.dataset.decision, note: data.note || undefined }) }); notify(form.dataset.decision === 'accepted' ? 'Accepted. Your decision is recorded in the session.' : 'Rejected. Your reason is recorded in the session.'); renderSession(); }
    else if (form.dataset.form === 'compare') { $('#confirm-dialog').close(); location.hash = `compare/${state.session.id}/${data.other}`; }
    else if (form.dataset.form === 'new') {
      data.budgetUsd = Number(data.budgetUsd);
      if (!data.model) delete data.model;
      const session = await api('/api/sessions', { method: 'POST', body: JSON.stringify(data) });
      $('#new-session').close(); state.sessions.unshift(session); state.tab = 'stream'; location.hash = `session/${session.id}`;
    } else if (form.dataset.form === 'task-import') {
      if (state.taskImporting || !state.task) return;
      state.taskImporting = true;
      const selected = state.task;
      const existingIds = new Set(state.sessions.map(session => session.id));
      try {
        const session = await api('/api/task-imports', { method: 'POST', body: JSON.stringify({ sourceId: selected.sourceId, taskId: selected.id, revision: selected.revision, crewId: data.crewId, runtime: data.runtime, ...(data.placement ? { placement: data.placement } : {}), budgetUsd: Number(data.budgetUsd) }) });
        state.sessions = [session, ...state.sessions.filter(item => item.id !== session.id)]; state.tab = 'stream';
        location.hash = `session/${session.id}`;
        notify(existingIds.has(session.id) ? 'Opened the existing session for this task. No additional work was started.' : 'Task imported. Review the brief, then start the crew when you are ready.');
      } catch (error) {
        if (error.status === 409 && error.code === 'task_changed' && state.view === 'tasks' && state.taskSourceId === selected.sourceId) {
          await openTask(selected.id, true);
          state.taskPreviewError = error.message;
        } else state.taskPreviewError = error.message;
        if (state.view === 'tasks') renderTasks();
        notify(error.message, true);
      } finally { state.taskImporting = false; if (state.view === 'tasks') renderTasks(); }
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
  if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) && state.bootstrap && state.bootstrap.user.role !== 'viewer' && !$('#new-session').open && !$('#confirm-dialog').open && !$('#task-connections').open) { event.preventDefault(); openNew(); }
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', disconnect);

function linkFailure(code) {
  if (code === 'exchange_401') return 'The provider refused the exchange. For GitLab that means the application is marked Confidential: edit it, untick Confidential, and link again.';
  if (code === 'link_state') return 'The link attempt expired or was started elsewhere. Start it again from this page.';
  if (code === 'access_denied') return 'You declined the authorization at GitLab.';
  return `Linking GitLab failed: ${code}.`;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const linkNotice = params.get('linked') ? `${({ gitlab: 'GitLab', clickup: 'ClickUp' })[params.get('linked')] || params.get('linked')} is linked to your account.` : params.get('link_error') ? linkFailure(params.get('link_error')) : '';
  if (linkNotice) history.replaceState(null, '', `${location.pathname}#account`);
  const editorDone = params.get('editor') === 'done';
  if (editorDone) history.replaceState(null, '', location.pathname);
  try { state.bootstrap = await api('/api/bootstrap'); state.sessions = await api('/api/sessions'); await route(); if (linkNotice) notify(linkNotice, Boolean(params.get('link_error'))); if (editorDone) notify('Signed in for your editor. You can return to it now.'); }
  catch (error) { if (!state.bootstrap) renderLogin(error.message.includes('Sign in') ? '' : error.message); else notify(error.message, true); }
}
void boot();
