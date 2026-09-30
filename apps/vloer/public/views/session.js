import { deliveryMarkup } from '../delivery.js';
import { state, disconnect } from '../core/state.js';
import { api, unauthorized } from '../core/api.js';
import { $, escape, safeUrl, renderHtml, download, notify, announce } from '../core/dom.js';
import { money, clock, ago } from '../core/format.js';
import { icon } from '../core/icons.js';
import { markdown } from '../core/markdown.js';
import { labels, status, repoName, crewName, runtimeName, placementName, isActive, providerName, statusLabel } from '../core/lookup.js';
import { observabilityLinks, dashboardLinks } from '../core/observability.js';
import { render } from '../core/navigation.js';
import { shell, showConnection } from '../shell.js';
import { openNew, confirmAction, openReviewDialog, openBudgetDialog } from './dialogs.js';

const evidenceTabs = [['stream','activity','Activity'],['gateway','layers','Gateway'],['diff','code','Changes'],['test','terminal','Checks'],['handoff','branch','Handoff']];

function runCards(session) {
  return `<section class="crew-strip" aria-label="Crew progress">${session.runs.map((run, index) => `<article class="crew-stage stage-${escape(run.status)}"><div class="stage-number">${run.status === 'completed' ? icon('check') : String(index + 1).padStart(2, '0')}</div><div><span class="tiny-label">${run.mode === 'write' ? 'IMPLEMENTATION' : index === session.runs.length - 1 ? 'INDEPENDENT REVIEW' : 'ANALYSIS'}</span><h3>${escape(run.roleName)}</h3><span>${escape(run.status === 'completed' ? run.verdict === 'approve' ? 'Explicitly approved' : 'Work completed' : run.status === 'running' ? 'Working in the remote workspace' : run.status === 'waiting_input' ? 'Waiting for your decision' : run.status === 'queued' ? 'Waiting for its turn' : labels[run.status] || run.status)}</span></div>${index < session.runs.length - 1 ? icon('chevron', 'stage-arrow') : ''}</article>`).join('')}</section>`;
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

function executionOwnershipMarkup(session) {
  const binding = session.execution;
  if (!binding) return '';
  const canSupervise = state.bootstrap.user.role !== 'viewer' && (state.bootstrap.user.role === 'admin' || state.bootstrap.user.id === session.ownerId) && ['running', 'waiting_input'].includes(session.status);
  const human = binding.supervision === 'human';
  const link = /^[1-9][0-9]{0,19}$/.test(binding.workItemId) ? `<a class="ploeg-link" href="#work/${binding.workItemId}">Inspect Ploeg work ${icon('arrow')}</a>` : '';
  return `<section class="execution-ownership" aria-label="Ploeg execution ownership"><span class="execution-ownership-icon">${icon('shield')}</span><div><strong>Ploeg owns this execution</strong><p>${escape(binding.team)} · ${human ? 'Human supervised' : 'Background supervision'} · ${escape(binding.state.replaceAll('_', ' '))}</p><small>The same execution and workspace continue when supervision changes.</small></div><div class="execution-ownership-actions">${link}${canSupervise ? `<button class="button secondary" data-action="supervision" data-supervision="${human ? 'background' : 'human'}" ${state.busy ? 'disabled' : ''}>${icon(human ? 'layers' : 'activity')}${human ? 'Continue in background' : 'Supervise here'}</button>` : ''}</div></section>`;
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
  const content = `<div class="session-topline"><a href="#sessions" class="back-link">${icon('back')} All sessions</a><div>${status(session.status, session.status === 'completed' && session.execution && state.bootstrap.deliveryRepositories?.includes(session.repositoryId) ? 'Execution completed' : undefined)}<span class="tag">${escape(runtimeName(session.runtime))}</span>${session.placement ? `<span class="tag">${escape(placementName(session.placement))}</span>` : ''}</div></div><section class="session-brief panel"><div><div class="brief-meta"><span>${icon('folder')}${escape(repoName(session.repositoryId))}</span><span>${icon('layers')}${escape(crewName(session.crewId))}</span><span>${icon('clock')}Created ${escape(ago(session.createdAt))}</span></div><p>${escape(session.objective)}</p></div><div class="session-controls">${canOperate ? controls : ''}<button class="button secondary" data-action="export">${icon('download')} Export handoff</button></div></section>
    ${sourceTaskMarkup(session)}${executionOwnershipMarkup(session)}${failureNotice(session)}
    ${session.status === 'completed' && !(session.execution && state.bootstrap.deliveryRepositories?.includes(session.repositoryId)) ? session.review ? `<div class="notice ${session.review.decision === 'accepted' ? 'notice-success' : 'notice-warning'}">${icon(session.review.decision === 'accepted' ? 'check' : 'info')}<div><strong>${session.review.decision === 'accepted' ? 'Accepted' : 'Rejected'} by ${escape(session.review.byName)} · ${escape(ago(session.review.at))}</strong>${session.review.note ? `<p>${escape(session.review.note)}</p>` : '<p>No note.</p>'}<p class="form-help">Recorded in the session history. Nothing was pushed or merged by the workbench.</p></div></div>` : `<div class="notice notice-success">${icon('check')}<div><strong>Your review is next.</strong><p>The crew finished and the candidate is captured. Inspect the changes, checks and transcripts, then record your decision. Nothing has been pushed or merged.</p></div>${canOperate ? `<div class="permission-actions"><button class="button primary" data-action="review" data-decision="accepted">Accept</button><button class="button secondary" data-action="review" data-decision="rejected">Reject…</button><button class="button text-button" data-action="tab" data-id="diff">Inspect changes ${icon('arrow')}</button></div>` : ''}</div>` : ''}
    ${deliveryMarkup(state, { escape, icon })}${runCards(session)}<div class="session-grid"><section class="panel execution-panel"><div class="tabs" role="tablist" aria-label="Session evidence">${evidenceTabs.map(([id,glyph,label]) => `<button role="tab" id="evidence-tab-${id}" aria-controls="evidence-panel-${id}" tabindex="${state.tab === id ? '0' : '-1'}" aria-selected="${state.tab === id}" data-action="tab" data-id="${id}" class="${state.tab === id ? 'selected' : ''}">${icon(glyph)}${label}${id === 'diff' || id === 'test' ? `<span>${session.artifacts.filter(artifact => artifact.kind === id).length}</span>` : ''}</button>`).join('')}</div>${evidenceTabs.map(([id]) => `<div class="tab-content" role="tabpanel" id="evidence-panel-${id}" aria-labelledby="evidence-tab-${id}" tabindex="0" data-tab="${id}" data-session-id="${escape(session.id)}" ${state.tab === id ? '' : 'hidden'}>${state.tab === id ? id === 'stream' ? streamMarkup() : id === 'gateway' ? gatewayMarkup() : artifactMarkup(id) : ''}</div>`).join('')}${!finished && session.status !== 'exporting' && canOperate ? `<form class="composer" data-form="message"><label for="operator-message">Steer the next execution</label><div><textarea id="operator-message" name="text" rows="2" placeholder="Add a constraint, clarify the objective, or leave a handoff note…" required>${escape(state.draft)}</textarea><button class="button primary icon-only" type="submit" aria-label="Save instruction">${icon('send')}</button></div><p>Instructions are saved durably. Pause and resume to apply them to the current role.</p></form>` : ''}</section><aside class="right-column">${permissionsMarkup()}${candidateMarkup(session)}<section class="panel budget-panel"><div class="panel-heading"><h2>Session budget</h2>${icon('shield')}</div><div class="budget-value">${money(shownSpend)}<span> / ${money(session.budgetUsd)}</span></div><progress max="${session.budgetUsd || 1}" value="${Math.min(shownSpend, session.budgetUsd)}" aria-label="Recorded session spend"></progress><div class="budget-details"><span>Accounting</span><strong>${escape(session.costStatus === 'demo' ? 'Demo · no charge' : liveSpend ? 'Observed at the gateway · settles later' : session.costStatus === 'unknown' ? 'Unresolved · hold retained' : session.costStatus === 'pending' ? 'Awaiting gateway settlement' : 'Settled')}</strong></div>${costCurve(session)}${(session.usage || []).length ? `<dl class="usage-list">${session.usage.map(entry => `<dt>${escape(entry.group ? `${entry.group} → ${entry.model}` : entry.model)}</dt><dd>${entry.requests} request${entry.requests === 1 ? '' : 's'}${entry.failures ? ` · ${entry.failures} refused` : ''} · ${money(entry.usd)}</dd>`).join('')}</dl>` : ''}<p>${session.costStatus === 'demo' ? 'This session uses a deterministic demonstration runtime. No tokens are consumed.' : session.costStatus === 'unknown' ? 'Unknown usage is never treated as zero. Previous authorization stays reserved.' : 'A scoped gateway key bounds this engagement. Model usage is reconciled independently.'}</p>${state.bootstrap.observability?.grafanaUrl && state.bootstrap.observability.dashboards?.spend ? `<a class="external-link" href="${escape(`${state.bootstrap.observability.grafanaUrl.replace(/\/$/, '')}/d/${state.bootstrap.observability.dashboards.spend}`)}" target="_blank" rel="noopener noreferrer">Cost per run on Grafana ${icon('external')}</a>` : ''}${state.bootstrap.user.role === 'admin' && !finished && session.status !== 'exporting' ? '<button class="button secondary full" data-action="budget">Authorize more budget</button>' : ''}</section><section class="panel details-panel"><div class="panel-heading"><h2>Working context</h2></div><dl><dt>Branch</dt><dd class="mono">${escape(session.branch)}</dd><dt>Model</dt><dd>${escape(session.model ? (state.bootstrap.models.find(model => model.id === session.model) || { name: session.model }).name : 'Crew default')}</dd><dt>Operator</dt><dd>${escape(session.ownerName)}</dd><dt>Explicit reviews</dt><dd>${approved} of ${session.runs.filter(run => run.mode === 'read').length}</dd><dt>Session</dt><dd class="mono">${escape(session.id.slice(0,8))}</dd></dl>${session.trackerUrl ? `<a class="external-link" href="${escape(session.trackerUrl)}" target="_blank" rel="noopener noreferrer">Open tracker ${icon('external')}</a>` : ''}</section></aside></div>`;
  renderHtml(shell(content, session.title, 'A bounded objective. A visible crew. Reviewable evidence.'));
  if (state.busy) for (const button of document.querySelectorAll('.session-controls [data-action]')) if (['start','pause','resume','cancel'].includes(button.dataset.action)) button.disabled = true;
}

async function loadDelivery(id) {
  const request = ++state.deliveryRequest;
  try { const view = await api(`/api/sessions/${id}/delivery`); if (state.session?.id !== id || request !== state.deliveryRequest) return; state.delivery = view; state.deliveryError = ''; }
  catch (error) { if (state.session?.id !== id || request !== state.deliveryRequest) return; state.delivery = null; state.deliveryError = error.message; }
  if (state.session?.id === id && state.view === 'session') renderSession();
}

async function actDelivery(action) {
  if (state.deliveryBusy || !state.session) return;
  const id = state.session.id;
  const payload = action === 'delivery-approve' ? { candidateId: state.delivery?.candidate?.id, receiptId: state.delivery?.receipt?.id, policySha256: state.delivery?.candidate?.policySha256 } : {};
  ++state.deliveryRequest; state.deliveryBusy = true; renderSession();
  try { const view = await api(`/api/sessions/${id}/delivery/${action === 'delivery-approve' ? 'approve' : 'verify'}`, { method: 'POST', body: JSON.stringify(payload) }); if (state.session?.id === id) { ++state.deliveryRequest; state.delivery = view; state.deliveryError = ''; } }
  catch (error) { if (state.session?.id === id) { ++state.deliveryRequest; state.delivery = null; state.deliveryError = error.message; } }
  finally { if (state.session?.id === id) { state.deliveryBusy = false; renderSession(); } }
}

async function openSession(id) {
  disconnect();
  ++state.deliveryRequest; state.delivery = null; state.deliveryError = ''; state.deliveryBusy = false;
  const [session, events, permissions] = await Promise.all([api(`/api/sessions/${id}`), api(`/api/sessions/${id}/history`), api(`/api/sessions/${id}/permissions`)]);
  if (location.hash !== `#session/${id}`) return;
  state.session = session; state.events = events; state.permissions = permissions; state.view = 'session'; state.online = true; state.draft = ''; state.evidenceScroll = {}; render();
  if (session.execution && state.bootstrap.deliveryRepositories?.includes(session.repositoryId)) void loadDelivery(id);
  const after = events.at(-1)?.id || 0;
  const stream = new EventSource(`/api/sessions/${id}/events?after=${after}`);
  state.stream = stream;
  stream.onopen = () => { state.online = true; showConnection(true); };
  stream.onerror = () => { state.online = false; showConnection(false); };
  stream.onmessage = event => {
    if (state.session?.id !== id) return;
    const record = JSON.parse(event.data);
    if (record.type.startsWith('delivery.')) void loadDelivery(id);
    if (!state.events.some(item => item.id === record.id)) state.events.push(record);
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(async () => {
      try {
        const [latest, requests] = await Promise.all([api(`/api/sessions/${id}`), api(`/api/sessions/${id}/permissions`)]);
        if (state.session?.id !== id || state.view !== 'session') return;
        if (latest.status !== state.session.status) announce(labels[latest.status]);
        state.session = latest; state.permissions = requests;
        const index = state.sessions.findIndex(item => item.id === id);
        if (index >= 0) state.sessions[index] = latest;
        renderSession();
      } catch (error) { notify(error.message, true); }
    }, 120);
  };
}

async function downloadCandidate(format) {
  if (!state.session || !['bundle', 'patch', 'manifest', 'attestation', 'trace'].includes(format)) return;
  const sessionId = state.session.id;
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/candidate/download?format=${format}`, { credentials: 'same-origin' });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) unauthorized();
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

function selectEvidenceTab(id) {
  if (!evidenceTabs.some(([tab]) => tab === id) || !state.session) return;
  state.tab = id;
  renderSession();
  document.getElementById(`evidence-tab-${id}`)?.focus({ preventScroll: true });
}

function moveEvidenceTab(event) {
  const tab = event.target.closest('[role="tab"][data-action="tab"]');
  if (tab && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const index = evidenceTabs.findIndex(([id]) => id === tab.dataset.id);
    const next = event.key === 'ArrowRight' ? (index + 1) % evidenceTabs.length : event.key === 'ArrowLeft' ? (index + evidenceTabs.length - 1) % evidenceTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? evidenceTabs.length - 1 : -1;
    if (next !== -1) {
      event.preventDefault();
      selectEvidenceTab(evidenceTabs[next][0]);
      return true;
    }
  }
  return false;
}

async function retry(button) { button.disabled = true; try { await api(`/api/sessions/${state.session.id}/retry`, { method: 'POST', body: '{}' }); notify('Trying again. The crew starts from the beginning.'); await openSession(state.session.id); } catch (error) { notify(error.message, true); button.disabled = false; } }

function duplicate() { const source = state.session; location.hash = 'sessions'; openNew(); const form = $('#new-session form'); if (form) { for (const [name, value] of Object.entries({ title: source.title, objective: source.objective, repositoryId: source.repositoryId, crewId: source.crewId, model: source.model || '', budgetUsd: source.budgetUsd })) { const field = form.elements[name]; if (field) field.value = value; } if (source.placement && form.elements.placement) form.elements.placement.value = source.placement; if (source.approval === 'auto' && form.elements.approval) form.elements.approval.checked = true; } }

async function setApproval(button) { button.disabled = true; try { state.session = await api(`/api/sessions/${state.session.id}/approval`, { method: 'POST', body: JSON.stringify({ approval: button.dataset.approval }) }); notify(button.dataset.approval === 'auto' ? 'The crew now works without asking for each tool.' : 'The crew asks you again before each tool.'); renderSession(); } finally { button.disabled = false; } }

async function setSupervision(button) {
  if (!state.session || state.busy) return;
  const id = state.session.id; state.busy = true; renderSession();
  try { const session = await api(`/api/sessions/${id}/supervision`, { method: 'POST', body: JSON.stringify({ supervision: button.dataset.supervision }) }); if (state.view === 'session' && state.session?.id === id) state.session = session; notify('Supervision updated on the existing Ploeg execution.'); }
  finally { state.busy = false; if (state.bootstrap && state.view === 'session' && state.session?.id === id) renderSession(); }
}

async function decidePermission(button) { button.disabled = true; await api(`/api/sessions/${state.session.id}/permissions/${button.dataset.id}`, { method: 'POST', body: JSON.stringify({ decision: button.dataset.decision }) }); notify('Your decision was delivered to the runtime.'); }

async function downloadCandidateFormat(button) { button.disabled = true; try { await downloadCandidate(button.dataset.format); } finally { button.disabled = false; } }

function downloadArtifact(button) { const artifact = state.session.artifacts.find(item => item.id === button.dataset.id); if (artifact) download(`${artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${artifact.kind === 'diff' ? 'patch' : 'txt'}`, artifact.content); }

function confirmCancel() { confirmAction('Cancel this session?', 'The active turn will stop and no remaining role will start. This session cannot be resumed after cancellation.', 'Cancel session', () => lifecycle('cancel')); }

async function recordReview(data, form) { $('#confirm-dialog').close(); state.session = await api(`/api/sessions/${state.session.id}/review`, { method: 'POST', body: JSON.stringify({ decision: form.dataset.decision, note: data.note || undefined }) }); notify(form.dataset.decision === 'accepted' ? 'Accepted. Your decision is recorded in the session.' : 'Rejected. Your reason is recorded in the session.'); renderSession(); }

async function saveInstruction(data, form) { await api(`/api/sessions/${state.session.id}/messages`, { method: 'POST', body: JSON.stringify({ text: data.text }) }); state.draft = ''; form.reset(); notify('Instruction saved for the next execution.'); }

async function authorizeBudget(data) { state.session = await api(`/api/sessions/${state.session.id}/budget`, { method: 'POST', body: JSON.stringify({ amountUsd: Number(data.amountUsd) }) }); $('#confirm-dialog').close(); renderSession(); notify('Additional budget authorized.'); }

async function answerQuestion(data, form) {
  const answers = Object.keys(data).sort((a,b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).map(key => [data[key]]);
  await api(`/api/sessions/${state.session.id}/permissions/${form.dataset.id}`, { method: 'POST', body: JSON.stringify({ answers }) }); notify('Your answer was delivered to the crew.');
}

/** The session workspace: brief, controls, notices, crew progress, evidence tabs, decisions, budget, handoff and delivery. */
export default {
  id: 'session',
  match: hash => hash.startsWith('session/') ? { id: hash.slice(8) } : null,
  enter: ({ id }) => openSession(id),
  render: renderSession,
  actions: {
    'delivery-refresh': () => loadDelivery(state.session.id),
    'delivery-verify': button => actDelivery(button.dataset.action),
    'delivery-approve': button => actDelivery(button.dataset.action),
    tab: button => selectEvidenceTab(button.dataset.id),
    start: button => lifecycle(button.dataset.action),
    pause: button => lifecycle(button.dataset.action),
    resume: button => lifecycle(button.dataset.action),
    cancel: confirmCancel,
    export: () => exportHandoff(),
    'candidate-download': downloadCandidateFormat,
    'download-artifact': downloadArtifact,
    review: button => openReviewDialog(button.dataset.decision),
    retry,
    duplicate,
    approval: setApproval,
    supervision: setSupervision,
    permission: decidePermission,
    budget: () => openBudgetDialog(),
  },
  forms: { review: recordReview, message: saveInstruction, budget: authorizeBudget, question: answerQuestion },
  inputs: { '#operator-message': element => { state.draft = element.value; } },
  keys: [moveEvidenceTab],
};
