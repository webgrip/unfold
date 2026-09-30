import { deliveryMarkup, deliveryGated, deliveryStatus } from '../delivery.js';
import { state, disconnect } from '../core/state.js';
import { api, unauthorized } from '../core/api.js';
import { $, escape, safeUrl, renderHtml, download, notify, announce } from '../core/dom.js';
import { money, moneyHtml, parseAmount, plural, duration, time, dateTime, timeHtml, seconds, count as formatCount } from '../core/format.js';
import { icon } from '../core/icons.js';
import { markdown } from '../core/markdown.js';
import { avatar, badge, button, card, chip, disclosure, dl, emptyState, iconButton, meter, skeleton, stateBadge, tabs, timeAgo, timeAt } from '../core/ui.js';
import { sessionStatus, verdict as verdictMeta, workItemState } from '../core/states.js';
import { repoName, crewName, runtimeName, placementName, isActive, providerName, statusLabel } from '../core/lookup.js';
import { observabilityLinks, dashboardLinks } from '../core/observability.js';
import { live } from '../core/live.js';
import { render } from '../core/navigation.js';
import { shell, showConnection } from '../shell.js';
import { openNew, confirmAction, openReviewDialog, openBudgetDialog, fieldError } from './dialogs.js';

const evidenceTabs = [
  { id: 'stream', icon: 'activity', label: 'Activity' },
  { id: 'gateway', icon: 'globe', label: 'Gateway' },
  { id: 'diff', icon: 'code', label: 'Changes' },
  { id: 'test', icon: 'terminal', label: 'Checks' },
  { id: 'handoff', icon: 'branch', label: 'Handoff' },
];
const hiddenEvents = new Set(['native.session', 'usage', 'message.delta', 'heartbeat', 'budget.observed', 'budget.settled', 'brief.checked']);
const failureStages = { credentials: 'Gateway authorization', workspace: 'Workspace setup', runtime: 'Runtime startup', prompt: 'Prompt submission', execution: 'Agent execution' };
const submissions = {
  not_submitted: 'The prompt was not submitted.',
  rejected: 'The runtime rejected the prompt.',
  accepted: 'The runtime acknowledged the prompt; this does not confirm that execution finished.',
  unknown: 'Prompt submission is unconfirmed. Check remote execution and gateway spend before starting new work.',
};
const downloads = [['bundle', 'Git bundle'], ['patch', 'Binary patch'], ['manifest', 'Manifest'], ['attestation', 'Signed provenance'], ['trace', 'Agent Trace']];
const stepVerbs = ['do not', 'confirm', 'inspect', 'reconcile', 'check', 'ask', 'authorize', 'read', 'sharpen', 'raise', 'wait', 'resume', 'review', 'retry', 'try', 'verify', 'rotate', 'revoke', 'fix', 'update', 'open', 'run', 'stop'];
const startsWithVerb = text => { const lower = text.toLowerCase(); return stepVerbs.some(verb => lower === verb || lower.startsWith(`${verb} `)); };

let load = { id: null, error: null };
let busyAction = null;
let renderedId = null;
let opening = 0;
const answers = new Map();

const canOperate = () => state.bootstrap.user.role !== 'viewer';
const isFinished = session => ['completed', 'failed', 'cancelled'].includes(session.status);
const humanize = value => { const words = String(value ?? '').replaceAll('_', ' ').replaceAll('.', ' ').trim(); return words ? words[0].toUpperCase() + words.slice(1) : ''; };
const shortSha = value => String(value || '').slice(0, 12);
const notStarted = session => session.status === 'queued' && session.runs.every(run => !run.startedAt && ['queued', 'pending'].includes(run.status)) && !session.artifacts.length && !(session.requests || []).length;

/**
 * Splits a unified diff into files with their added and removed line counts and numbered lines. Each line is
 * `{ kind: 'hunk' | 'add' | 'del' | 'context' | 'note', text, old, new }`; header lines (`diff --git`, `index`,
 * `---`, `+++`) name the file and are not repeated as lines.
 * @param {string} text
 * @returns {{ path: string, added: number, removed: number, lines: { kind: string, text: string, old: number|null, new: number|null }[] }[]}
 */
export function parseDiff(text) {
  const files = [];
  let file = null;
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  const lines = String(text ?? '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const begin = path => { file = { path, added: 0, removed: 0, lines: [] }; files.push(file); inHunk = false; };
  for (const line of lines) {
    if (line.startsWith('diff --git ')) { begin(/ b\/(.+)$/.exec(line)?.[1] ?? line.slice(11)); continue; }
    if (!file) begin('');
    if (line.startsWith('@@')) {
      const range = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      if (range) { oldLine = Number(range[1]); newLine = Number(range[2]); }
      inHunk = true;
      file.lines.push({ kind: 'hunk', text: line, old: null, new: null });
      continue;
    }
    if (!inHunk) {
      if (line.startsWith('+++ ')) { const path = line.slice(4).replace(/^b\//, ''); if (path !== '/dev/null') file.path = path; }
      else if (line.startsWith('--- ')) { const path = line.slice(4).replace(/^a\//, ''); if (!file.path && path !== '/dev/null') file.path = path; }
      else if (!line.startsWith('index ') && line.trim()) file.lines.push({ kind: 'note', text: line, old: null, new: null });
      continue;
    }
    if (line.startsWith('+')) { file.added += 1; file.lines.push({ kind: 'add', text: line, old: null, new: newLine++ }); }
    else if (line.startsWith('-')) { file.removed += 1; file.lines.push({ kind: 'del', text: line, old: oldLine++, new: null }); }
    else if (line.startsWith('\\')) file.lines.push({ kind: 'note', text: line, old: null, new: null });
    else file.lines.push({ kind: 'context', text: line, old: oldLine++, new: newLine++ });
  }
  return files;
}

/**
 * Reads a recorded check run: the `Command:`, `Exit code:`, `Duration:` and `Runtime:` header lines, the test
 * totals (node --test `ℹ pass 3` or TAP `# pass 3`), and each top-level test with its result.
 * @param {string} text
 * @returns {{ command: string|null, exitCode: number|null, duration: string|null, runtime: string|null, tests: number|null, pass: number|null, fail: number|null, cases: { passed: boolean, name: string }[] }}
 */
export function checkSummary(text) {
  const body = String(text ?? '');
  const header = name => { const found = new RegExp(`^${name}:[ \\t]*(.*)$`, 'm').exec(body); return found ? found[1].trim() : null; };
  const total = name => { const found = new RegExp(`^[ℹ#][ \\t]*${name}[ \\t]+(\\d+)[ \\t]*$`, 'm').exec(body); return found ? Number(found[1]) : null; };
  const listed = body.split(/^✖ failing tests:/m)[0].split('\n');
  const cases = [];
  for (const line of listed) {
    const node = /^([✔✖])\s+(.+?)(?:\s+\([\d.]+\s*m?s\))?\s*$/.exec(line);
    const tap = /^(ok|not ok)\s+\d+\s+-\s+(.+?)\s*$/.exec(line);
    if (node) cases.push({ passed: node[1] === '✔', name: node[2] });
    else if (tap) cases.push({ passed: tap[1] === 'ok', name: tap[2] });
  }
  const exit = header('Exit code');
  return { command: header('Command'), exitCode: exit !== null && /^-?\d+$/.test(exit) ? Number(exit) : null, duration: header('Duration'), runtime: header('Runtime'), tests: total('tests'), pass: total('pass'), fail: total('fail'), cases };
}

/**
 * Splits a handoff summary into its leading `Key: value` facts and the prose after them.
 * @param {string} text
 * @returns {{ facts: [string, string][], rest: string }}
 */
export function summaryFacts(text) {
  const lines = String(text ?? '').split('\n');
  const facts = [];
  let index = 0;
  for (; index < lines.length; index++) {
    const fact = /^([A-Z][A-Za-z0-9 ()/-]{0,40}):\s+(.+)$/.exec(lines[index].trim());
    if (!fact) break;
    facts.push([fact[1], fact[2]]);
  }
  return { facts, rest: lines.slice(index).join('\n').trim() };
}

/**
 * Turns a failure's remediation into numbered steps and context. Each sentence that starts with an instruction
 * becomes a step; a sentence that lists several instructions (`Confirm X, inspect Y and reconcile Z.`) becomes one
 * step per instruction. Other sentences are context, kept in order.
 * @param {string} text
 * @returns {{ steps: string[], notes: string[] }}
 */
export function remediationSteps(text) {
  const sentences = String(text ?? '').trim().split(/(?<=[.!?])\s+(?=[A-Z])/).map(sentence => sentence.trim()).filter(Boolean);
  const steps = [];
  const notes = [];
  for (const sentence of sentences) {
    if (!startsWithVerb(sentence)) { notes.push(sentence); continue; }
    const body = sentence.replace(/[.!?]$/, '');
    const parts = body.split(/,\s+|\s+and\s+/);
    if (parts.length > 1 && parts.every(startsWithVerb)) steps.push(...parts.map(part => `${part[0].toUpperCase()}${part.slice(1)}.`));
    else steps.push(sentence);
  }
  return { steps, notes };
}

function plainTaskText(task) {
  const text = String(task?.description ?? '');
  if (task?.provider !== 'vikunja' || !/<\/?[a-z][^>]*>/i.test(text)) return text;
  const entities = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };
  return text.replace(/<li[^>]*>/gi, '\n- ').replace(/<(br|\/p|\/div|\/li|\/ul|\/ol|\/h[1-6])\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&(nbsp|lt|gt|quot|#39|amp);/g, entity => entities[entity]).replace(/\n{3,}/g, '\n\n').trim();
}

function externalLink(label, url, variant = 'ghost') {
  return safeUrl(url) ? button({ label, variant, size: 'sm', href: url, external: true }) : '';
}

function streamTime(at, className = 'stream-time') {
  const moment = new Date(at);
  if (!at || Number.isNaN(moment.getTime())) return '';
  return `<time class="num ${className}" datetime="${escape(moment.toISOString())}" title="${escape(dateTime(moment))}">${escape(time(moment, { seconds: true }))}</time>`;
}

function failureStage(failure) {
  return failure?.category === 'policy_violation' ? 'Gateway policy' : failure?.category === 'runaway' ? 'Tool-call limit' : failureStages[failure?.stage] || 'Execution';
}

function failureItem(failure, message, at = '') {
  return streamItem({ kind: 'system', tone: 'danger', marker: icon('x-circle'), head: `<span class="stream-text-inline"><strong>${escape(failureStage(failure))}</strong> failed</span>${at}`, body: message ? `<p class="stream-note">${escape(message)}</p>` : '' });
}

function roleOf(event) {
  const data = event.data || {};
  return state.session?.runs.find(run => run.id === event.runId)?.roleName || (data.role === 'operator' ? 'You' : 'Workbench');
}

function streamItem({ kind, tone, marker = '', head, body = '' }) {
  return `<li class="stream-item" data-kind="${kind}"${tone ? ` data-tone="${tone}"` : ''}><span class="stream-marker" aria-hidden="true">${marker}</span><div class="stream-body"><div class="stream-head">${head}</div>${body}</div></li>`;
}

function toolTitle(data) {
  const input = (() => { try { return typeof data.input === 'string' ? JSON.parse(data.input) : data.input; } catch { return null; } })();
  const detail = data.title || (input && (input.command || input.pattern || input.filePath || input.path || input.query || input.url)) || '';
  return detail ? String(detail).slice(0, 160) : '';
}

function toolState(data) {
  const failed = data.status === 'error' || data.status === 'failed';
  if (failed && data.expectedFailure) return { tone: 'attention', label: 'Failed as expected', glyph: 'alert' };
  if (failed) return { tone: 'danger', label: 'Failed', glyph: 'x-circle' };
  if (data.status === 'completed') return { tone: 'success', label: 'Done', glyph: 'check-circle' };
  if (data.status === 'running' || data.status === 'pending') return { tone: 'live', label: 'Running', glyph: 'activity' };
  return { tone: 'neutral', label: humanize(data.status) || 'Recorded', glyph: 'terminal' };
}

function io(label, value, tone) {
  return value ? `<p class="overline stream-io-label">${label}</p><pre class="stream-pre"${tone ? ` data-tone="${tone}"` : ''}>${escape(String(value))}</pre>` : '';
}

function eventMarkup(event) {
  const data = event.data || {};
  const role = roleOf(event);
  const at = streamTime(event.at);
  if (event.type === 'message' || event.type === 'text' || event.type === 'assistant.message') {
    const operator = data.role === 'operator';
    return streamItem({ kind: 'message', marker: avatar({ name: role, kind: operator ? 'person' : 'agent', size: 'sm' }), head: `<strong class="stream-actor">${escape(role)}</strong>${data.applies === 'next_execution' ? chip({ label: 'Next execution', tone: 'accent' }) : ''}${at}`, body: `<div class="prose stream-text">${markdown(data.text || data.message || '')}</div>` });
  }
  if (event.type === 'tool' || event.type === 'tool.updated') {
    const shown = toolState(data);
    const detail = toolTitle(data);
    const facts = [data.phase ? humanize(data.phase) : '', Number.isFinite(data.exitCode) ? `exit ${data.exitCode}` : '', Number.isFinite(data.durationMs) ? `${formatCount(data.durationMs)} ms` : ''].filter(Boolean).join(' · ');
    const output = data.input || data.output || data.error ? disclosure({ id: `stream-${event.id}-io`, plain: true, summary: shown.tone === 'danger' ? 'Error and input' : 'Input and output', body: `${io('Input', data.input)}${io('Output', data.output)}${io('Error', data.error, 'danger')}` }) : '';
    return streamItem({ kind: 'tool', tone: shown.tone, marker: icon(shown.glyph), head: `<span class="stream-tool">${escape(data.name || data.tool || 'Tool call')}</span>${badge({ tone: shown.tone, label: shown.label, size: 'sm' })}${facts ? `<span class="stream-facts">${escape(facts)}</span>` : ''}${at}`, body: `${detail ? `<p class="stream-detail">${escape(detail)}</p>` : ''}${data.text ? `<p class="stream-note">${escape(data.text)}</p>` : ''}${output}` });
  }
  if (event.type === 'run.started' && data.prompt) {
    const prompt = data.prompt;
    const part = (label, text) => text ? `<p class="overline stream-io-label">${label}</p><div class="prose stream-text">${markdown(text)}</div>` : '';
    const kind = data.reviewer ? 'Independent review' : data.mode === 'write' ? 'Implementation' : 'Analysis';
    return streamItem({ kind: 'run', tone: 'accent', marker: icon('play'), head: `<strong class="stream-actor">${escape(data.role)}</strong><span class="stream-text-inline">started</span><span class="stream-facts">${escape(kind)}${data.model?.modelId ? ` · ${escape(data.model.modelId)}` : ''}</span>${at}`, body: disclosure({ id: `stream-${event.id}-brief`, plain: true, summary: `The brief this role received${data.promptSha ? ` · ${shortSha(data.promptSha)}` : ''}`, body: `${part('Objective', prompt.objective)}${part('Role instruction', prompt.instruction)}${part('Operator notes', prompt.notes)}${part('Prior work', prompt.earlier)}${part('Evidence supplied', prompt.evidence)}${part('Guidance', prompt.guidance)}` }) });
  }
  if (event.type === 'permission') return streamItem({ kind: 'system', tone: 'attention', marker: icon('lock'), head: `<span class="stream-text-inline">${escape(role)} ${data.kind === 'question' ? 'asked a question' : 'asked for permission'}${data.title ? `: ${escape(data.title)}` : ''}</span>${at}` });
  if (event.type === 'brief.unclear') {
    const questions = (data.questions || []).length ? `<ul class="stream-list">${data.questions.map(question => `<li>${escape(question)}</li>`).join('')}</ul>` : '';
    return streamItem({ kind: 'message', tone: 'attention', marker: icon('help-circle'), head: `<strong class="stream-actor">Brief check</strong>${at}`, body: `<p class="stream-note">The brief is not enough to start on. ${escape(data.reason || '')}</p>${questions}<p class="stream-note subtle">Answer the question at the top of this page; the crew starts once you do. Nothing beyond one small check has been spent.</p>` });
  }
  if (event.type === 'brief.clarified') return streamItem({ kind: 'system', tone: 'success', marker: icon('check'), head: `<span class="stream-text-inline">You clarified the brief; the crew starts.</span>${at}` });
  if (event.type === 'session.failed') return failureItem(data.failure, data.message || data.failure?.message, at);
  if (event.type === 'run.runaway') return streamItem({ kind: 'system', tone: 'danger', marker: icon('alert'), head: `<span class="stream-text-inline">${escape(data.message || 'A role exceeded its tool-call limit.')}</span>${at}` });
  if (event.type === 'review.recorded') return streamItem({ kind: 'system', tone: data.decision === 'accepted' ? 'success' : 'neutral', marker: icon(data.decision === 'accepted' ? 'check-circle' : 'x-circle'), head: `<span class="stream-text-inline">${escape(data.decision === 'accepted' ? 'Accepted' : 'Rejected')} by ${escape(data.byName || role)}${data.note ? `: ${escape(data.note)}` : ''}</span>${at}` });
  if (event.type === 'run.finished') {
    const verdict = data.verdict ? verdictMeta(data.verdict) : null;
    return streamItem({ kind: 'system', tone: verdict?.tone === 'attention' ? 'attention' : 'success', marker: icon(verdict ? verdict.glyph : 'check'), head: `<span class="stream-text-inline"><strong>${escape(role)}</strong> finished${verdict ? ` · <span title="${escape(verdict.label)}">${escape(verdict.short)}</span>` : ''}</span>${at}`, body: data.summary ? `<p class="stream-note">${escape(data.summary)}</p>` : '' });
  }
  const display = data.message || data.summary || (event.type === 'workspace.ready' ? `Workspace ready · ${data.backend}` : event.type === 'run.started' ? `${data.role} started` : event.type === 'session.created' ? 'Session created. Budget authorized; no work started.' : event.type === 'session.started' ? data.resumed ? 'Resumed by the operator' : 'Session started' : event.type === 'run.completed' ? `${role} completed` : event.type === 'budget.increased' ? `Additional authorization: ${money(data.amountUsd)}` : event.type.startsWith('permission.') ? 'An operator decision was recorded' : event.type.startsWith('budget.') ? `Budget accounting: ${event.type.split('.').at(-1)}` : humanize(event.type));
  const tone = event.type.includes('failed') ? 'danger' : event.type.includes('completed') || event.type.endsWith('.ready') ? 'success' : '';
  return streamItem({ kind: 'system', tone, marker: tone === 'danger' ? icon('x-circle') : tone === 'success' ? icon('check') : '', head: `<span class="stream-text-inline">${escape(display)}</span>${at}` });
}

function visibleEvents() {
  const visible = [];
  const parts = new Map();
  for (const event of state.events) {
    if (hiddenEvents.has(event.type)) continue;
    const key = event.type === 'message' && event.data?.partId ? `${event.runId}:${event.data.partId}` : event.type === 'tool' && event.data?.partId ? `${event.runId}:tool:${event.data.partId}` : null;
    if (key && parts.has(key)) { if (event.type === 'tool') { Object.assign(parts.get(key).data, event.data); parts.get(key).at = event.at; } else parts.get(key).data.text += event.data.text || ''; continue; }
    const item = { ...event, data: { ...event.data } };
    if (key) parts.set(key, item);
    const previous = visible.at(-1);
    if (event.type === 'tool' && previous?.type === 'tool' && previous.runId === event.runId && previous.data.status === 'running' && (previous.data.name || previous.data.tool) === (item.data.name || item.data.tool) && item.data.status !== 'running') visible.pop();
    visible.push(item);
  }
  return visible;
}

function workingMarkup(session) {
  const run = session.runs.find(item => ['running', 'waiting_input'].includes(item.status));
  if (session.status === 'waiting_input') return streamItem({ kind: 'status', tone: 'attention', marker: icon('alert'), head: `<span class="stream-text-inline">${escape(run?.roleName || 'The crew')} is waiting for your decision at the top of this page.</span>` });
  if (!isActive(session)) return '';
  const text = session.status === 'exporting' ? 'Preparing the repository handoff' : `${run?.roleName || 'The crew'} is working`;
  return `<li class="stream-item" data-kind="status" data-tone="live"><span class="stream-marker" aria-hidden="true"><span class="live-dot"></span></span><div class="stream-body"><div class="stream-head"><span class="stream-text-inline">${escape(text)}${run?.startedAt ? ` · started ${timeHtml(run.startedAt, { display: 'time' })}` : ''}</span></div></div></li>`;
}

function streamMarkup(session) {
  const events = visibleEvents();
  const failure = session.status === 'failed' && session.failure && !events.some(event => event.type === 'session.failed') ? failureItem(session.failure, session.failure.message) : '';
  if (!events.length && !failure) return emptyState({ icon: 'activity', compact: true, title: 'Nothing has happened yet', body: '<p>Start the crew to see its work here as it happens.</p>' });
  return `<ol class="session-stream">${events.map(eventMarkup).join('')}${failure}${workingMarkup(session)}</ol>`;
}

function gatewayMarkup(session) {
  const requests = session.requests || [];
  if (!requests.length) return emptyState({ icon: 'globe', compact: true, title: isFinished(session) ? 'No gateway requests were recorded' : 'No gateway requests yet', body: `<p>${session.costStatus === 'demo' ? 'The demonstration runtime does not call a model gateway.' : 'Each model call the gateway attributes to this session appears here within fifteen seconds, with the provider that served it.'}</p>` });
  const roleName = id => id === 'brief' ? 'Brief check' : session.runs.find(run => run.roleId === id)?.roleName || '';
  const totals = requests.reduce((sum, request) => ({ usd: sum.usd + (Number(request.usd) || 0), savings: sum.savings + (request.savingsUsd || 0), failures: sum.failures + (request.status === 'failure' ? 1 : 0) }), { usd: 0, savings: 0, failures: 0 });
  const providers = [...new Set(requests.map(request => request.provider).filter(Boolean))];
  const hosts = [...new Set(requests.map(request => request.host).filter(Boolean))];
  const links = `${observabilityLinks(session)} ${dashboardLinks()}`.trim();
  const facts = dl([
    ['Gateway', `<code>${escape(state.bootstrap.gateway || 'LiteLLM')}</code>`],
    ['Providers', providers.length ? escape(providers.join(', ')) : null],
    ['Endpoints', hosts.length ? hosts.map(host => `<code>${escape(host)}</code>`).join(' ') : null],
    ['Requests', `<span class="num">${escape(formatCount(requests.length))}</span>${totals.failures ? ` · ${escape(plural(totals.failures, 'refused', 'refused'))}` : ''}`],
    ['Attributed cost', `${moneyHtml(totals.usd)}${totals.savings ? ` · router saved ${moneyHtml(totals.savings)}` : ''}`],
    ...(links ? [['Observability', `<span class="session-links">${links}</span>`]] : []),
  ]);
  const flags = request => [request.violation ? badge({ tone: 'danger', label: `Outside policy: ${request.violation}`, size: 'sm' }) : '', request.status === 'failure' ? badge({ tone: 'danger', label: 'Refused', size: 'sm' }) : '', request.retries ? badge({ label: plural(request.retries, 'retry', 'retries'), size: 'sm' }) : '', request.fallbacks ? badge({ label: 'Fallback', size: 'sm' }) : '', request.cacheHit ? badge({ label: 'Cache hit', size: 'sm' }) : '', request.cachedTokens ? badge({ label: `${formatCount(request.cachedTokens)} cached`, size: 'sm' }) : '', ...(request.guardrails || []).map(name => badge({ label: name, size: 'sm' }))].filter(Boolean).join('');
  const route = request => [request.provider, request.geo, request.group ? `${request.group}${request.tier ? ` ${request.tier.toLowerCase()}` : ''}${request.cause ? ` (${humanize(request.cause).toLowerCase()})` : ''}` : 'pinned'].filter(Boolean).join(' · ');
  const sub = text => text ? `<span class="session-table-sub">${text}</span>` : '';
  const groups = requests.map(request => {
    const tone = request.status === 'failure' || request.violation ? ' data-tone="danger"' : '';
    const links = observabilityLinks(session, request);
    const notes = [flags(request) ? `<span class="session-flags">${flags(request)}</span>` : '', request.error ? `<span class="session-gateway-error">${icon('alert')}${escape(request.error)}</span>` : '', request.harness ? `<span class="session-gateway-harness">${escape(request.harness)}</span>` : '', links ? `<span class="session-links">${links}</span>` : ''].filter(Boolean).join('');
    const latency = seconds(request.durationMs);
    const main = `<tr><td class="session-gateway-when">${streamTime(request.at, 'session-gateway-time') || '<span class="subtle">—</span>'}${sub(escape(roleName(request.roleId)))}</td><td class="session-gateway-model"><code>${escape(request.model)}</code>${sub(escape(route(request)))}</td><td class="num">${escape(formatCount(request.inputTokens))} in${sub(`${escape(formatCount(request.outputTokens))} out`)}</td><td class="num">${latency ? escape(latency) : '<span class="subtle">—</span>'}${Number.isFinite(request.firstTokenMs) ? sub(`first token ${escape(seconds(request.firstTokenMs))}`) : ''}</td><td class="num">${moneyHtml(request.usd)}${request.savingsUsd ? sub(`saved ${moneyHtml(request.savingsUsd)}`) : ''}</td></tr>`;
    return `<tbody${tone}>${main}${notes ? `<tr class="session-gateway-note"><td colspan="5"><div class="session-gateway-notes">${notes}</div></td></tr>` : ''}</tbody>`;
  }).join('');
  return `<div class="session-panel-section">${facts}</div><div class="table-wrap session-gateway-wrap" role="region" tabindex="0" aria-label="Gateway requests"><table class="table compact session-gateway"><caption class="sr-only">Gateway requests</caption><thead><tr><th scope="col">When</th><th scope="col">Answered by</th><th scope="col" class="num">Tokens</th><th scope="col" class="num">Latency</th><th scope="col" class="num">Cost</th></tr></thead>${groups}</table></div>`;
}

function artifactHeader(artifact, level = 3) {
  return `<header class="session-artifact-header"><h${level} class="session-artifact-title">${escape(artifact.name)}</h${level}>${button({ label: 'Download', icon: 'download', variant: 'ghost', size: 'sm', action: 'download-artifact', data: { id: artifact.id } })}</header>`;
}

function diffFile(file, artifact, index) {
  const rows = file.lines.map(line => {
    if (line.kind === 'hunk' || line.kind === 'note') return `<tr class="diff-line" data-kind="${line.kind}"><td class="diff-num" aria-hidden="true"></td><td class="diff-num" aria-hidden="true"></td><td class="diff-code">${escape(line.text)}</td></tr>`;
    return `<tr class="diff-line" data-kind="${line.kind}"><td class="diff-num" aria-hidden="true" data-n="${line.old ?? ''}"></td><td class="diff-num" aria-hidden="true" data-n="${line.new ?? ''}"></td><td class="diff-code">${escape(line.text) || ' '}</td></tr>`;
  }).join('');
  const id = `diff-${escape(artifact.id)}-${index}`;
  return `<details class="diff-file" id="${id}" open><summary class="diff-file-header">${icon('chevron-down', 'diff-chevron')}<span class="diff-path">${escape(file.path || artifact.name)}</span><span class="diff-stat"><span class="diff-stat-add">+${file.added}</span> <span class="diff-stat-del">−${file.removed}</span></span></summary><div class="diff-scroll"><table class="diff-table"><tbody>${rows}</tbody></table></div></details>`;
}

function diffMarkup(session) {
  const artifacts = session.artifacts.filter(artifact => artifact.kind === 'diff');
  if (!artifacts.length) return emptyState({ icon: 'code', compact: true, title: isFinished(session) ? 'No changes were recorded' : 'Changes will appear here', body: '<p>The crew attaches the actual diff of its workspace as the session progresses.</p>' });
  const parsed = artifacts.map(artifact => ({ artifact, files: parseDiff(artifact.content) }));
  const all = parsed.flatMap(entry => entry.files);
  const added = all.reduce((sum, file) => sum + file.added, 0);
  const removed = all.reduce((sum, file) => sum + file.removed, 0);
  const single = artifacts.length === 1;
  const summary = `<div class="diff-summary"><p class="diff-summary-text"><strong>${escape(plural(all.length, 'file'))} changed</strong><span class="diff-stat"><span class="diff-stat-add">+${added}</span> <span class="diff-stat-del">−${removed}</span></span></p><div class="diff-summary-actions"><label class="diff-wrap-toggle"><input type="checkbox" id="diff-wrap"${state.diffWrap ? ' checked' : ''}> Wrap long lines</label>${single ? button({ label: 'Download', icon: 'download', variant: 'ghost', size: 'sm', action: 'download-artifact', data: { id: artifacts[0].id } }) : ''}</div></div>`;
  const files = all.length > 1 ? `<ul class="diff-files">${all.map(file => `<li><span class="diff-path">${escape(file.path || 'Unnamed file')}</span><span class="diff-stat"><span class="diff-stat-add">+${file.added}</span> <span class="diff-stat-del">−${file.removed}</span></span></li>`).join('')}</ul>` : '';
  return `<div class="diff-view">${summary}${files}${parsed.map(({ artifact, files }) => `<section class="session-artifact" aria-label="${escape(artifact.name)}">${single ? '' : artifactHeader(artifact)}${files.map((file, index) => diffFile(file, artifact, index)).join('')}</section>`).join('')}</div>`;
}

function checkResult(artifact, summary) {
  const expected = /expected failure/i.test(artifact.name);
  if (summary.exitCode === null) return { tone: 'neutral', label: 'Recorded', glyph: 'terminal' };
  if (summary.exitCode === 0) return { tone: 'success', label: 'Passed', glyph: 'check-circle' };
  return expected ? { tone: 'attention', label: 'Failed as expected', glyph: 'alert' } : { tone: 'danger', label: 'Failed', glyph: 'x-circle' };
}

function checkName(name) {
  return String(name).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+checks?$/i, '').trim() || String(name);
}

function passedText(summary) {
  if (Number.isFinite(summary.pass) && Number.isFinite(summary.tests)) return `${summary.pass} of ${summary.tests} passed`;
  if (summary.cases.length) return `${summary.cases.filter(item => item.passed).length} of ${summary.cases.length} passed`;
  return summary.exitCode === null ? 'Output recorded' : `Exit code ${summary.exitCode}`;
}

function checksMarkup(session) {
  const artifacts = session.artifacts.filter(artifact => artifact.kind === 'test');
  if (!artifacts.length) return emptyState({ icon: 'terminal', compact: true, title: 'No check evidence yet', body: '<p>Only commands that actually ran are recorded as evidence.</p>' });
  const entries = artifacts.map(artifact => ({ artifact, summary: checkSummary(artifact.content) }));
  const overview = entries.length > 1 ? `<ol class="session-check-flow" aria-label="Checks in the order they ran">${entries.map(({ artifact, summary }) => { const result = checkResult(artifact, summary); return `<li data-tone="${result.tone}" title="${escape(artifact.name)}">${icon(result.glyph)}<span class="session-check-flow-name">${escape(checkName(artifact.name))}</span><span class="session-check-flow-value num">${escape(passedText(summary).replace(/ passed$/, ''))}</span><span class="sr-only">${escape(result.label)}</span></li>`; }).join('')}</ol>` : '';
  const sections = entries.map(({ artifact, summary }, index) => {
    const result = checkResult(artifact, summary);
    const facts = dl([['Command', summary.command ? `<code>${escape(summary.command)}</code>` : null], ['Result', escape(passedText(summary))], ['Exit code', summary.exitCode === null ? null : `<span class="num">${summary.exitCode}</span>`], ['Duration', summary.duration ? escape(summary.duration) : null]]);
    const cases = summary.cases.length ? `<ul class="session-cases">${summary.cases.map(item => `<li data-tone="${item.passed ? 'success' : result.tone === 'attention' ? 'attention' : 'danger'}">${icon(item.passed ? 'check-circle' : 'x-circle')}<span>${escape(item.name)}</span><span class="sr-only">${item.passed ? 'passed' : 'failed'}</span></li>`).join('')}</ul>` : '';
    const output = disclosure({ id: `check-${escape(artifact.id)}-output`, summary: 'Full output', open: !summary.cases.length && summary.exitCode === null, body: `<pre class="session-pre">${escape(artifact.content)}</pre>` });
    return `<section class="session-artifact session-check" aria-labelledby="check-${index}-title"><header class="session-artifact-header"><h3 class="session-artifact-title" id="check-${index}-title">${escape(artifact.name)}</h3>${badge({ tone: result.tone, glyph: result.glyph, label: result.label })}${button({ label: 'Download', icon: 'download', variant: 'ghost', size: 'sm', action: 'download-artifact', data: { id: artifact.id } })}</header>${facts}${cases}${output}</section>`;
  }).join('');
  return `${overview}${sections}`;
}

function handoffMarkup(session) {
  const artifacts = session.artifacts.filter(artifact => ['summary', 'link', 'transcript'].includes(artifact.kind));
  const summaries = session.runs.filter(run => run.summary);
  if (!artifacts.length && !summaries.length) return emptyState({ icon: 'branch', compact: true, title: 'No handoff yet', body: '<p>Each role leaves a summary and the reviewer its findings when they finish.</p>' });
  const crew = summaries.length ? `<section class="session-artifact" aria-labelledby="handoff-crew-title"><header class="session-artifact-header"><h3 class="session-artifact-title" id="handoff-crew-title">What the crew reported</h3></header><ul class="session-summaries">${summaries.map(run => `<li>${avatar({ name: run.roleName, kind: 'agent', size: 'sm' })}<div class="session-summary-body"><p class="session-summary-head"><strong>${escape(run.roleName)}</strong>${run.verdict ? (meta => badge({ tone: meta.tone, glyph: meta.glyph, label: meta.short, title: `${meta.label}. Agent review is evidence, not a human review.` }))(verdictMeta(run.verdict)) : ''}</p><p class="session-summary-text">${escape(run.summary)}</p></div></li>`).join('')}</ul></section>` : '';
  const parts = artifacts.map(artifact => {
    if (artifact.kind === 'summary') {
      const { facts, rest } = summaryFacts(artifact.content);
      const value = ([key, text]) => /^verdict$/i.test(key) ? (meta => badge({ tone: meta.tone, glyph: meta.glyph, label: meta.short, title: `${meta.label}. Agent review is evidence, not a human review.` }))(verdictMeta(text.trim())) : /^(true|false)$/i.test(text.trim()) ? (text.trim().toLowerCase() === 'true' ? 'Yes' : 'No') : escape(text);
      return `<section class="session-artifact" aria-label="${escape(artifact.name)}">${artifactHeader(artifact)}${facts.length ? dl(facts.map(fact => [fact[0], value(fact)]), { rows: true }) : ''}${rest ? `<div class="prose session-prose">${markdown(rest)}</div>` : ''}</section>`;
    }
    if (artifact.kind === 'transcript') return `<section class="session-artifact" aria-label="${escape(artifact.name)}">${artifactHeader(artifact)}${disclosure({ id: `transcript-${escape(artifact.id)}`, summary: 'Show the full transcript', body: `<div class="prose session-prose">${markdown(artifact.content)}</div>` })}</section>`;
    const link = safeUrl(artifact.url);
    return `<section class="session-artifact" aria-label="${escape(artifact.name)}">${artifactHeader(artifact)}${artifact.content ? `<pre class="session-pre">${escape(artifact.content)}</pre>` : ''}${link ? externalLink('Open artifact', link) : ''}</section>`;
  }).join('');
  return `${crew}${parts}`;
}

function panelMarkup(session, id) {
  if (id === 'stream') return streamMarkup(session);
  if (id === 'gateway') return gatewayMarkup(session);
  if (id === 'diff') return diffMarkup(session);
  if (id === 'test') return checksMarkup(session);
  return handoffMarkup(session);
}

function composerMarkup(session) {
  if (isFinished(session) || session.status === 'exporting' || !canOperate()) return '';
  const hint = session.status === 'queued' ? 'Saved instructions reach the first role when the crew starts.' : session.status === 'paused' || session.status === 'interrupted' ? 'Saved instructions reach the role when you resume.' : 'Saved instructions reach the next role that starts. To give them to the role working now, pause and resume.';
  return `<form class="session-composer" data-form="message"><label class="field-label" for="operator-message">Steer the next execution</label><div class="session-composer-row"><textarea id="operator-message" name="text" rows="2" maxlength="16000" placeholder="Add a constraint, clarify the objective or leave a note for the next role…" aria-describedby="operator-message-hint" required>${escape(state.draft)}</textarea>${button({ label: 'Save instruction', icon: 'send', type: 'submit' })}</div><p class="field-hint" id="operator-message-hint">${escape(hint)}</p></form>`;
}

function evidenceMarkup(session) {
  if (notStarted(session)) return `<section class="card flush session-evidence" aria-labelledby="session-evidence-title"><header class="card-header"><h2 class="card-title" id="session-evidence-title">Evidence</h2></header><div class="session-evidence-empty">${emptyState({ icon: 'activity', compact: true, title: 'Evidence appears once the crew starts', body: '<p>Activity, gateway calls, changes, checks and the handoff show up here as each role works.</p>' })}</div>${composerMarkup(session)}</section>`;
  const counts = { diff: session.artifacts.filter(artifact => artifact.kind === 'diff').length, test: session.artifacts.filter(artifact => artifact.kind === 'test').length };
  const list = tabs({ id: 'evidence', label: 'Session evidence', action: 'tab', items: evidenceTabs.map(tab => ({ ...tab, selected: state.tab === tab.id, count: counts[tab.id] || null })) });
  const panels = evidenceTabs.map(({ id }) => `<div class="session-panel" role="tabpanel" id="evidence-panel-${id}" aria-labelledby="evidence-tab-${id}" tabindex="0" data-tab="${id}" data-session-id="${escape(session.id)}"${state.tab === id ? '' : ' hidden'}>${state.tab === id ? panelMarkup(session, id) : ''}</div>`).join('');
  return `<section class="card flush session-evidence" aria-label="Evidence">${list}${panels}${composerMarkup(session)}</section>`;
}

function stepState(run) {
  if (run.status === 'completed') return run.verdict ? (meta => ({ tone: meta.tone, html: `<span title="${escape(meta.label)}">${escape(meta.short)}</span>`, marker: icon(meta.glyph), verdict: true }))(verdictMeta(run.verdict)) : { tone: 'success', html: 'Done', marker: icon('check') };
  if (run.status === 'running') return { tone: 'live', html: run.startedAt ? `Working since ${timeHtml(run.startedAt, { display: 'time' })}` : 'Working', marker: '<span class="live-dot"></span>' };
  if (run.status === 'waiting_input') return { tone: 'attention', html: 'Waiting for you', marker: icon('alert') };
  if (run.status === 'failed') return { tone: 'danger', html: 'Failed', marker: icon('x') };
  if (run.status === 'paused') return { tone: 'neutral', html: 'Paused', marker: icon('pause') };
  if (run.status === 'cancelled') return { tone: 'neutral', html: 'Cancelled', marker: icon('stop') };
  return { tone: '', html: 'Waiting for its turn', marker: '' };
}

function crewMarkup(session) {
  if (!session.runs.length) return '';
  const current = session.runs.findIndex(run => ['running', 'waiting_input', 'paused', 'failed'].includes(run.status));
  const steps = session.runs.map((run, index) => {
    const shown = stepState(run);
    const kind = run.mode === 'write' ? 'Writes the change' : index === session.runs.length - 1 ? 'Reviews independently' : 'Analyses';
    return `<li class="step session-step"${shown.tone ? ` data-tone="${shown.tone}"` : ''}${index === current ? ' aria-current="step"' : ''}><span class="step-marker">${shown.marker}</span><span class="session-step-text"><span class="step-label">${escape(run.roleName)}</span><span class="session-step-state">${shown.html}</span><span class="session-step-kind">${escape(kind)}</span></span></li>`;
  }).join('');
  return `<section class="card session-crew" aria-labelledby="session-crew-title"><div class="session-crew-heading"><h2 class="session-section-title" id="session-crew-title">Crew</h2><p class="session-section-note">${escape(crewName(session.crewId))}</p></div><ol class="steps session-steps">${steps}</ol></section>`;
}

function briefMarkup(session) {
  const task = session.sourceTask;
  if (!task) return card({ id: 'session-brief', title: 'Objective', body: `<div class="prose session-prose">${markdown(session.objective)}</div>` });
  const description = plainTaskText(task);
  const actions = externalLink('Open original task', task.url);
  const source = `<p class="session-source">${icon('tag')}<span>Imported from <strong>${escape(providerName(task.provider))} #${escape(task.id)}</strong></span><span class="session-source-revision">revision <code>${escape(shortSha(task.revision))}</code></span></p>`;
  const body = `${source}${description.trim() ? `<div class="prose session-prose">${markdown(description)}</div>` : '<p class="subtle">The task has no description.</p>'}${disclosure({ id: 'session-agent-prompt', plain: true, summary: 'What the crew was told', body: `<p class="session-prompt-note">The workbench wraps the task in this prompt. The task text inside it is treated as untrusted reference material.</p><pre class="session-pre session-prompt">${escape(session.objective)}</pre>` })}`;
  return card({ id: 'session-brief', title: 'Brief', subtitle: task.title && task.title !== session.title ? task.title : undefined, actions, body });
}

function failureMarkup(session) {
  const failure = session.failure;
  if (!failure && !session.blocker && session.status !== 'interrupted') return '';
  const title = failure ? `${failureStage(failure)} needs attention` : session.status === 'interrupted' ? 'Execution was interrupted' : 'This session needs attention';
  const message = failure?.message || session.blocker || 'The runtime stopped before the role finished. Resume to continue; nothing restarts on its own.';
  const { steps, notes } = remediationSteps(failure?.remediation);
  const reconciling = session.status === 'failed' && canOperate() && session.costStatus === 'unknown';
  const actions = session.status === 'failed' && canOperate() ? `${session.costStatus !== 'unknown' ? button({ label: 'Try again', icon: 'refresh', variant: 'primary', action: 'retry' }) : ''}${button({ label: 'Duplicate as a new session', icon: 'copy', action: 'duplicate' })}` : '';
  const facts = [submissions[failure?.promptAcceptance], failure?.automaticRetry === false ? 'No automatic retry will be started.' : '', reconciling ? 'Try again becomes available once spend is reconciled.' : ''].filter(Boolean);
  const body = [
    `<p class="session-failure-lead">${escape(message)}</p>`,
    notes.length ? `<p class="session-failure-context">${notes.map(note => `<span>${escape(note)}</span>`).join(' ')}</p>` : '',
    steps.length ? `<div class="session-failure-steps"><h3 class="overline session-failure-steps-title">What to do</h3>${steps.length > 1 ? `<ol class="session-steps-list">${steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>` : `<p>${escape(steps[0])}</p>`}</div>` : '',
    facts.length ? `<p class="session-failure-facts">${facts.map(fact => `<span>${escape(fact)}</span>`).join(' ')}</p>` : '',
    failure?.detail ? disclosure({ id: 'session-failure-detail', plain: true, summary: 'Recorded error output', body: `<pre class="session-pre" aria-label="Recorded error output">${escape(failure.detail)}</pre>` }) : '',
  ].join('');
  const tone = session.status === 'interrupted' ? 'severe' : 'danger';
  return `<section class="callout session-callout session-failure" data-tone="${tone}" aria-labelledby="session-failure-title"><span class="callout-icon" aria-hidden="true">${icon(tone === 'danger' ? 'x-circle' : 'zap')}</span><div class="callout-content"><h2 class="callout-title" id="session-failure-title">${escape(title)}</h2><div class="callout-body">${body}</div></div>${actions ? `<div class="callout-actions">${actions}</div>` : ''}</section>`;
}

function permissionMarkup(session, request) {
  const role = session.runs.find(run => run.id === request.runId)?.roleName || 'The crew';
  const id = `permission-${escape(request.id)}`;
  if (request.kind === 'permission') {
    const actions = canOperate() ? `<div class="session-decision-actions">${button({ label: 'Allow once', icon: 'check', variant: 'primary', action: 'permission', data: { id: request.id, decision: 'once' } })}${button({ label: 'Allow matching requests', action: 'permission', data: { id: request.id, decision: 'always' } })}${button({ label: 'Reject', icon: 'x', variant: 'danger-ghost', action: 'permission', data: { id: request.id, decision: 'reject' } })}</div>` : '<p class="subtle">An operator decides this request.</p>';
    return `<section class="card session-decision" data-tone="attention" aria-labelledby="${id}-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="${id}-title">${icon('lock')}${escape(role)} asks for permission</h2><p class="card-subtitle">The role waits until you decide.</p></div></header><div class="card-body"><p class="session-request">${escape(request.title)}</p>${request.detail && request.detail !== request.title ? `<p class="session-decision-text">${escape(request.detail)}</p>` : ''}${actions}</div></section>`;
  }
  const questions = request.questions?.length ? request.questions : [{ question: request.detail || request.title }];
  const draft = answers.get(request.id) || { choices: {}, other: {}, error: '' };
  const base = `question-${request.id}`;
  const errorId = `${base}-error`;
  const fields = questions.map((question, index) => {
    const text = question.question || question.header || request.title || `Question ${index + 1}`;
    const options = (question.options || []).map(option => typeof option === 'string' ? { label: option } : option).filter(option => option?.label);
    const choices = options.length ? `<div class="session-options">${options.map((option, choice) => `<label class="session-option"><input type="radio" id="${escape(`${base}-${index}-option-${choice}`)}" name="answer-${index}" value="${escape(option.label)}" data-question-choice data-request="${escape(request.id)}" data-index="${index}"${draft.choices[index] === option.label ? ' checked' : ''}><span><span class="session-option-label">${escape(option.label)}</span>${option.description ? `<span class="session-option-hint">${escape(option.description)}</span>` : ''}</span></label>`).join('')}</div>` : '';
    const otherId = `${base}-${index}-other`;
    return `<fieldset class="session-question" data-question="${index}"><legend class="session-question-text">${escape(text)}</legend>${choices}<div class="field"><label class="field-label" for="${escape(otherId)}">${options.length ? 'Or answer in your own words' : 'Your answer'}</label><input id="${escape(otherId)}" name="other-${index}" autocomplete="off" maxlength="4000" placeholder="Type your answer" data-question-other data-request="${escape(request.id)}" data-index="${index}" aria-describedby="${escape(errorId)}" value="${escape(draft.other[index] || '')}"></div></fieldset>`;
  }).join('');
  const form = canOperate() ? `<form class="session-question-form" data-form="question" data-id="${escape(request.id)}" novalidate>${fields}<p class="field-error" id="${escape(errorId)}" data-question-error role="alert"${draft.error ? '' : ' hidden'}>${escape(draft.error)}</p><div class="session-decision-actions">${button({ label: 'Send answer', icon: 'send', variant: 'primary', type: 'submit' })}</div></form>` : `<p class="session-decision-text">${escape(questions.map(question => question.question || question.header || '').join(' '))}</p><p class="subtle">An operator answers this question.</p>`;
  return `<section class="card session-decision" data-tone="attention" aria-labelledby="${id}-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="${id}-title">${icon('help-circle')}${escape(role)} has a question</h2><p class="card-subtitle">The role waits for your answer.</p></div></header><div class="card-body">${form}</div></section>`;
}

function answerDraft(element) {
  const id = element.dataset.request;
  if (!answers.has(id)) answers.set(id, { choices: {}, other: {}, error: '' });
  return answers.get(id);
}

function receiptMarkup(session) {
  const review = [...session.runs].reverse().find(run => run.mode === 'read' && run.verdict);
  const files = session.artifacts.filter(artifact => artifact.kind === 'diff').flatMap(artifact => parseDiff(artifact.content));
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  const checks = session.artifacts.filter(artifact => artifact.kind === 'test').map(artifact => ({ artifact, summary: checkSummary(artifact.content) }));
  const last = checks.at(-1);
  const first = checks.length > 1 && /expected failure/i.test(checks[0].artifact.name) ? checks[0] : null;
  const started = session.runs.map(run => Date.parse(run.startedAt)).filter(Number.isFinite);
  const ended = session.runs.map(run => Date.parse(run.finishedAt)).filter(Number.isFinite);
  const took = started.length && ended.length ? duration((Math.max(...ended) - Math.min(...started)) / 1000) : '';
  const spend = session.costStatus === 'demo' ? 'Demo · no model calls' : session.costStatus === 'unknown' ? 'Not reported' : `${money(session.spentUsd)} of ${money(session.budgetUsd)}`;
  return dl([
    ['Agent review', review ? (meta => badge({ tone: meta.tone, glyph: meta.glyph, label: meta.short, title: `${meta.label}. Agent review is evidence, not a human review.` }))(verdictMeta(review.verdict)) : escape('No agent verdict')],
    ['Changes', files.length ? `${escape(plural(files.length, 'file'))} <span class="diff-stat"><span class="diff-stat-add">+${added}</span> <span class="diff-stat-del">−${removed}</span></span>` : null],
    ['Checks', last ? `${escape(passedText(last.summary))}${first ? `<span class="session-receipt-was">${escape(passedText(first.summary).replace(' passed', ''))} before the change</span>` : ''}` : null],
    ['Spend', escape(spend)],
    ['Took', took ? escape(took) : null],
  ]);
}

function reviewMarkup(session) {
  if (session.status !== 'completed' || deliveryGated(state)) return '';
  if (session.review) {
    const accepted = session.review.decision === 'accepted';
    const actions = !accepted && canOperate() ? `<div class="callout-actions">${button({ label: 'Duplicate as a new session', icon: 'copy', action: 'duplicate' })}</div>` : '';
    return `<section class="callout session-callout" data-tone="${accepted ? 'success' : 'neutral'}" aria-labelledby="session-review-title"><span class="callout-icon" aria-hidden="true">${icon(accepted ? 'check-circle' : 'x-circle')}</span><div class="callout-content"><h2 class="callout-title" id="session-review-title" tabindex="-1">${accepted ? 'Accepted' : 'Rejected'} by ${escape(session.review.byName)} <span class="session-callout-time">${timeAgo(session.review.at)}</span></h2><div class="callout-body">${session.review.note ? `<p>“${escape(session.review.note)}”</p>` : '<p>No note was left.</p>'}<p class="subtle">Recorded in the session history. The workbench did not push or merge anything.</p></div></div>${actions}</section>`;
  }
  const actions = canOperate() ? `<div class="session-decision-actions session-review-actions">${button({ label: 'Accept', icon: 'check', variant: 'primary', action: 'review', data: { decision: 'accepted' } })}${button({ label: 'Reject…', icon: 'x', variant: 'danger-ghost', action: 'review', data: { decision: 'rejected' } })}${button({ label: 'Inspect changes', icon: 'arrow', variant: 'ghost', action: 'tab', data: { id: 'diff' } })}</div>` : '<p class="subtle">An operator records the review.</p>';
  return `<section class="card session-decision session-review" data-tone="review" aria-labelledby="session-review-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="session-review-title" tabindex="-1">${icon('eye')}Your review is next</h2><p class="card-subtitle">The crew finished and captured the change. Nothing has been pushed or merged.</p></div></header><div class="card-body">${receiptMarkup(session)}<p class="session-decision-text">An agent review is not your review. Inspect the changes, checks and transcripts, then record your decision.</p>${actions}</div></section>`;
}

function stateNoticeMarkup(session) {
  if (session.status === 'paused') return `<section class="callout session-callout" data-tone="neutral" aria-labelledby="session-paused-title"><span class="callout-icon" aria-hidden="true">${icon('pause-circle')}</span><div class="callout-content"><h2 class="callout-title" id="session-paused-title">Paused</h2><div class="callout-body"><p>The context and budget stay attached. Resume continues the current role with the instructions you saved.</p></div></div></section>`;
  if (session.status === 'queued' && canOperate()) {
    const busy = state.busy && busyAction === 'start';
    const spend = session.costStatus === 'demo' ? 'This demonstration makes real Git changes and runs real checks without model calls or spend.' : `The crew may spend up to ${money(session.budgetUsd)}; nothing is spent until you start it.`;
    return `<section class="callout session-callout session-start" data-tone="neutral" aria-labelledby="session-queued-title"><span class="callout-icon" aria-hidden="true">${icon('play')}</span><div class="callout-content"><h2 class="callout-title" id="session-queued-title">Start the crew when the brief is right</h2><div class="callout-body"><p>${escape(spend)} Check the brief and the budget first.</p></div></div><div class="callout-actions">${button({ id: 'session-start', label: 'Start crew', icon: 'play', variant: 'primary', action: 'start', disabled: state.busy, busy })}</div></section>`;
  }
  return '';
}

function decisionMarkup(session) {
  const permissions = state.permissions.filter(request => !request.resolved).map(request => permissionMarkup(session, request)).join('');
  const parts = [failureMarkup(session), permissions, deliveryMarkup(state), reviewMarkup(session), stateNoticeMarkup(session)].filter(Boolean);
  return parts.length ? `<div class="session-decisions">${parts.join('')}</div>` : '';
}

function budgetMarkup(session) {
  const finished = isFinished(session);
  const observed = !finished && typeof session.observedUsd === 'number' && session.observedUsd > session.spentUsd;
  const gauge = session.costStatus === 'demo' ? meter({ demo: true, authorized: session.budgetUsd, label: '', size: 'lg' }) : session.costStatus === 'unknown' ? meter({ settled: null, authorized: session.budgetUsd, label: '', size: 'lg' }) : meter({ settled: observed ? session.observedUsd : session.spentUsd, authorized: session.budgetUsd, label: observed ? 'Observed' : '', size: 'lg' });
  const accounting = session.costStatus === 'demo' ? 'A deterministic demonstration: no model is called and nothing is spent.' : observed ? 'Observed at the gateway. It settles later.' : session.costStatus === 'unknown' ? 'Spend was not reported. Unknown usage is never treated as zero; the earlier authorization stays reserved.' : session.costStatus === 'pending' ? 'Waiting for the gateway to settle the last requests.' : 'Settled at the gateway.';
  const usage = (session.usage || []).length ? `<ul class="session-usage">${session.usage.map(entry => `<li><span class="session-usage-model">${escape(entry.group ? `${entry.group} → ${entry.model}` : entry.model)}</span><span class="session-usage-value">${escape(plural(entry.requests, 'request'))}${entry.failures ? ` · ${escape(formatCount(entry.failures))} refused` : ''} · ${moneyHtml(entry.usd)}</span></li>`).join('')}</ul>` : '';
  const grafana = state.bootstrap.observability?.grafanaUrl && state.bootstrap.observability.dashboards?.spend ? externalLink('Cost per run in Grafana', `${state.bootstrap.observability.grafanaUrl.replace(/\/$/, '')}/d/${state.bootstrap.observability.dashboards.spend}`, 'secondary') : '';
  const authorize = state.bootstrap.user.role === 'admin' && !finished && session.status !== 'exporting' && session.costStatus !== 'demo' ? button({ id: 'session-budget-authorize', label: 'Authorize more budget', icon: 'coins', action: 'budget' }) : '';
  const footer = grafana || authorize ? `<div class="session-card-actions">${authorize}${grafana}</div>` : '';
  return card({ id: 'session-budget', title: 'Budget', body: `${gauge}<p class="session-card-note">${escape(accounting)}</p>${usage}${footer}` });
}

function candidateMarkup(session) {
  const candidate = session.candidate;
  if (!candidate) return '';
  if (candidate.status !== 'ready') return card({ id: 'session-candidate', title: 'Repository handoff', body: `<p class="session-card-note">${escape(candidate.message || 'A complete repository export is unavailable for this session. Review the retained evidence and workspace before taking over.')}</p>` });
  const formats = downloads.filter(([format]) => candidate.formats?.includes(format));
  const facts = dl([['Commit', candidate.headSha ? `<code title="${escape(candidate.headSha)}">${escape(shortSha(candidate.headSha))}</code>` : null], ['Changed files', candidate.fileCount === undefined ? null : `<span class="num">${escape(formatCount(candidate.fileCount))}</span>`]], { rows: true });
  const control = ([format, label]) => button({ label, icon: 'download', size: 'sm', action: 'candidate-download', data: { format } });
  const main = formats.filter(([format]) => ['bundle', 'patch', 'manifest'].includes(format));
  const more = formats.filter(([format]) => !['bundle', 'patch', 'manifest'].includes(format));
  const buttons = `${main.length ? `<div class="session-downloads">${main.map(control).join('')}</div>` : ''}${more.length ? disclosure({ id: 'session-provenance', plain: true, summary: 'Provenance and trace', body: `<div class="session-downloads">${more.map(control).join('')}</div>` }) : ''}`;
  return card({ id: 'session-candidate', title: 'Repository handoff', body: `<p class="session-ready">${icon('check-circle')}Repository snapshot saved</p>${facts}${buttons}<p class="session-card-note">${escape(session.review ? `${session.review.decision === 'accepted' ? 'Accepted' : 'Rejected'} by ${session.review.byName}. No changes have been pushed or merged.` : 'Human review and your repository’s checks are still required. No changes have been pushed or merged.')}</p>` });
}

function executionMarkup(session) {
  const binding = session.execution;
  if (!binding) return '';
  const canSupervise = canOperate() && (state.bootstrap.user.role === 'admin' || state.bootstrap.user.id === session.ownerId) && ['running', 'waiting_input'].includes(session.status);
  const human = binding.supervision === 'human';
  const link = /^[1-9][0-9]{0,19}$/.test(binding.workItemId) ? button({ label: 'Open the Work Item', icon: 'arrow', size: 'sm', href: `#work/${binding.workItemId}` }) : '';
  const toggle = canSupervise ? button({ label: human ? 'Continue in background' : 'Supervise here', icon: human ? 'layers' : 'activity', size: 'sm', action: 'supervision', data: { supervision: human ? 'background' : 'human' }, disabled: state.busy }) : '';
  const facts = dl([['Team', escape(binding.team)], ['Supervision', escape(human ? 'You supervise here' : 'In the background')], ['Work Item', stateBadge(workItemState(binding.state))]], { rows: true });
  return card({ id: 'session-execution', title: 'Ploeg runs this session', icon: 'shield', body: `${facts}<p class="session-card-note">The same execution and workspace continue when supervision changes.</p>${link || toggle ? `<div class="session-card-actions">${toggle}${link}</div>` : ''}` });
}

function approvalMarkup(session) {
  const isolated = ['docker', 'kubernetes'].includes(session.placement);
  const active = !isFinished(session);
  if (session.approval === 'auto') return card({ id: 'session-approval', title: 'Tool approval', body: `<p class="session-card-note">Automatic for this session: tool use inside the sandbox runs without asking. Questions still reach you.</p>${active && canOperate() ? `<div class="session-card-actions">${button({ label: 'Ask me again', size: 'sm', action: 'approval', data: { approval: 'manual' } })}</div>` : ''}` });
  if (active && isolated && canOperate()) return card({ id: 'session-approval', title: 'Tool approval', body: `<p class="session-card-note">Every tool use asks you. The workspace is isolated, so you can let the crew work unattended for the rest of this session.</p><div class="session-card-actions">${button({ label: 'Approve automatically', size: 'sm', action: 'approval', data: { approval: 'auto' } })}</div>` });
  return '';
}

function detailsMarkup(session) {
  const reviewed = session.runs.filter(run => run.mode === 'read' && run.status === 'completed');
  const approved = reviewed.filter(run => run.verdict === 'approve').length;
  const reviewers = reviewed.length;
  const model = session.model ? (state.bootstrap.models.find(item => item.id === session.model) || { name: session.model }).name : 'Crew default';
  const tracker = session.trackerUrl ? externalLink('Open tracker', session.trackerUrl, 'secondary') : '';
  const facts = dl([
    ['Branch', `<code class="session-truncate" title="${escape(session.branch)}">${escape(session.branch)}</code>`],
    ['Runtime', escape([runtimeName(session.runtime), session.placement ? placementName(session.placement) : ''].filter(Boolean).join(' · '))],
    ['Model', escape(model)],
    ['Operator', escape(session.ownerName)],
    ['Agent reviews', reviewers ? escape(`${approved} of ${reviewers} approved`) : null],
    ['Created', timeAt(session.createdAt)],
    ['Session', `<code title="${escape(session.id)}">${escape(session.id.slice(0, 8))}</code>`],
  ], { rows: true });
  return card({ id: 'session-details', title: 'Details', body: `${facts}${tracker ? `<div class="session-card-actions">${tracker}</div>` : ''}` });
}

function contextMarkup(session) {
  const meta = deliveryStatus(state) || sessionStatus(session);
  const facts = [
    `<span class="session-fact">${icon('folder')}${escape(repoName(session.repositoryId))}</span>`,
    `<span class="session-fact">${icon('bot')}${escape(crewName(session.crewId))}</span>`,
    `<span class="session-fact" data-fact="runtime">${icon('terminal')}${escape(runtimeName(session.runtime))}</span>`,
    `<span class="session-fact">${icon('clock')}Created ${timeAgo(session.createdAt)}</span>`,
  ].join('');
  return `<div class="session-context">${stateBadge(meta)}${facts}</div>`;
}

function headerActions(session) {
  const finished = isFinished(session);
  const busy = action => state.busy && busyAction === action;
  const evidence = session.artifacts.length > 0 || session.runs.some(run => run.status === 'completed');
  const parts = [];
  if (evidence) parts.push(button({ id: 'session-export', label: 'Export handoff', icon: 'download', variant: 'ghost', action: 'export' }));
  if (canOperate()) {
    if (!finished) parts.push(button({ id: 'session-cancel', label: 'Cancel', icon: 'stop', variant: 'danger-ghost', action: 'cancel', disabled: state.busy, busy: busy('cancel') }));
    if (['running', 'waiting_input'].includes(session.status)) parts.push(button({ id: 'session-pause', label: 'Pause', icon: 'pause', action: 'pause', disabled: state.busy, busy: busy('pause') }));
    if (['paused', 'interrupted'].includes(session.status)) parts.push(button({ id: 'session-resume', label: 'Resume', icon: 'play', variant: 'primary', action: 'resume', disabled: state.busy, busy: busy('resume') }));
  }
  return parts.join('');
}

function reviewBarMarkup(session) {
  if (session.status !== 'completed' || session.review || deliveryGated(state) || !canOperate()) return '';
  return `<div class="session-review-bar" role="group" aria-label="Record your review"><span class="session-review-bar-text">${icon('eye')}<span>Your review</span></span>${iconButton({ icon: 'code', label: 'Inspect changes', action: 'tab', data: { id: 'diff' } })}${button({ label: 'Reject…', variant: 'danger-ghost', action: 'review', data: { decision: 'rejected' } })}${button({ label: 'Accept', icon: 'check', variant: 'primary', action: 'review', data: { decision: 'accepted' } })}</div>`;
}

function pendingMarkup() {
  const known = state.sessions.find(item => item.id === load.id);
  if (load.error) {
    const missing = load.error.status === 404;
    const actions = missing ? button({ label: 'All sessions', icon: 'arrow', variant: 'primary', href: '#sessions' }) : [button({ id: 'session-reload', label: 'Try again', icon: 'refresh', variant: 'primary', action: 'session-reload' }), button({ label: 'All sessions', variant: 'ghost', href: '#sessions' })];
    const content = `<div class="session-page" data-pending><div class="card session-error">${emptyState({ icon: missing ? 'search' : 'x-circle', tone: missing ? undefined : 'danger', title: missing ? 'This link does not open a session' : 'The session did not load', body: `<p>${escape(missing ? 'The session may have been removed, or your account cannot see it. Your other sessions are on the Sessions page.' : load.error.message)}</p>`, actions })}</div></div>`;
    return { content, title: missing ? 'Session not found' : known?.title || 'Session unavailable' };
  }
  const content = `<div class="session-page" data-pending aria-busy="true"><div class="session-context">${known ? stateBadge(sessionStatus(known)) : ''}</div><div class="session-layout"><div class="session-primary"><div class="card"><div class="card-body">${skeleton({ variant: 'text', rows: 3 })}</div></div><div class="card"><div class="card-body">${skeleton({ variant: 'list', rows: 6 })}</div></div></div><aside class="session-secondary" aria-label="Session details"><div class="card"><div class="card-body">${skeleton({ variant: 'text', rows: 2 })}</div></div><div class="card"><div class="card-body">${skeleton({ variant: 'text', rows: 4 })}</div></div></aside></div></div>`;
  return { content, title: known?.title || 'Session' };
}

function focusTarget() {
  const element = document.activeElement;
  if (!element || element === document.body || !$('#main')?.contains(element)) return null;
  if (element.id) return { id: element.id };
  const details = element.tagName === 'SUMMARY' ? element.closest('details[id]') : null;
  if (details) return { selector: `#${CSS.escape(details.id)} > summary` };
  const data = element.dataset || {};
  if (data.action) return { selector: ['action', 'id', 'decision', 'format'].filter(key => data[key]).map(key => `[data-${key}="${CSS.escape(data[key])}"]`).join('') };
  return {};
}

function restoreFocus(target) {
  if (!target || (document.activeElement && document.activeElement !== document.body)) return;
  const visible = element => element.getClientRects().length > 0;
  const same = target.selector ? [...document.querySelectorAll(`#main ${target.selector}`)].find(visible) : null;
  (same || document.getElementById('session-review-title') || document.getElementById('page-title'))?.focus({ preventScroll: true });
}

function renderSession() {
  const session = state.session;
  const target = focusTarget();
  if (!session) {
    if (!load.id) return;
    const { content, title } = pendingMarkup();
    renderHtml(shell(content, { title, overline: load.error?.status === 404 ? undefined : 'Session', back: { label: 'Sessions', href: '#sessions' } }));
    restoreFocus(target);
    return;
  }
  const open = renderedId === session.id ? [...document.querySelectorAll('#main details[id]')].map(element => [element.id, element.open]) : [];
  const content = `<div class="session-page">${contextMarkup(session)}${decisionMarkup(session)}<div class="session-layout"><div class="session-primary">${briefMarkup(session)}${crewMarkup(session)}${evidenceMarkup(session)}</div><aside class="session-secondary" aria-label="Session details">${budgetMarkup(session)}${candidateMarkup(session)}${executionMarkup(session)}${approvalMarkup(session)}${detailsMarkup(session)}</aside></div>${reviewBarMarkup(session)}</div>`;
  renderHtml(shell(content, { title: session.title, overline: 'Session', actions: headerActions(session), back: { label: 'Sessions', href: '#sessions' } }));
  for (const [id, expanded] of open) { const element = document.getElementById(id); if (element) element.open = expanded; }
  renderedId = session.id;
  restoreFocus(target);
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
  const token = ++opening;
  disconnect();
  if (state.session?.id !== id) state.tab = 'stream';
  ++state.deliveryRequest; state.delivery = null; state.deliveryError = ''; state.deliveryBusy = false;
  load = { id, error: null };
  state.session = null; state.view = 'session'; state.online = false;
  renderSession();
  let session; let events; let permissions;
  try { [session, events, permissions] = await Promise.all([api(`/api/sessions/${id}`), api(`/api/sessions/${id}/history`), api(`/api/sessions/${id}/permissions`)]); }
  catch (error) {
    if (token !== opening || !state.bootstrap || location.hash !== `#session/${id}`) return;
    load = { id, error };
    renderSession();
    return;
  }
  if (token !== opening || location.hash !== `#session/${id}`) return;
  state.session = session; state.events = events; state.permissions = permissions; state.view = 'session'; state.online = true; state.draft = ''; state.evidenceScroll = isFinished(session) ? { stream: { top: 0, atBottom: false } } : {}; render();
  live.touch('session');
  if (session.execution && state.bootstrap.deliveryRepositories?.includes(session.repositoryId)) void loadDelivery(id);
  const after = events.at(-1)?.id || 0;
  state.stream?.close();
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
        if (latest.status !== state.session.status) announce(sessionStatus(latest).label);
        state.session = latest; state.permissions = requests;
        const index = state.sessions.findIndex(item => item.id === id);
        if (index >= 0) state.sessions[index] = latest;
        renderSession();
        live.touch('session');
      } catch (error) { notify(error.message, true); }
    }, 120);
  };
}

async function downloadCandidate(format) {
  if (!state.session || !downloads.some(([name]) => name === format)) return;
  const sessionId = state.session.id;
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/candidate/download?format=${format}`, { credentials: 'same-origin' });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) unauthorized();
    throw new Error(data.error?.message || 'The repository export could not be downloaded.');
  }
  const blob = await response.blob();
  download(`de-vloer-${sessionId.slice(0, 8)}.${format === 'manifest' ? 'json' : format}`, blob, blob.type);
}

function exportHandoff() {
  const session = state.session;
  const content = [`# ${session.title}`, '', `Runtime: ${runtimeName(session.runtime)}`, `Status: ${statusLabel(session)}`, `Repository: ${repoName(session.repositoryId)}`, `Branch: ${session.branch}`, `Accounting: ${session.costStatus}; recorded spend ${money(session.spentUsd)}; authorization ${money(session.budgetUsd)}`, '', '## Objective', session.objective, '', ...session.runs.flatMap(run => [`## ${run.roleName}`, `Status: ${run.status}${run.verdict ? `; verdict: ${run.verdict}` : ''}`, run.summary || 'No completed summary.', '']), ...session.artifacts.flatMap(artifact => [`## ${artifact.name}`, '', '````', artifact.content, '````', '']), 'No automatic merge or deployment was performed.'].join('\n');
  download(`de-vloer-${session.id.slice(0, 8)}.md`, content, 'text/markdown');
}

async function lifecycle(action) {
  if (state.busy || !state.session) return;
  const sessionId = state.session.id;
  state.busy = true; busyAction = action;
  renderSession();
  try {
    const session = await api(`/api/sessions/${sessionId}/${action}`, { method: 'POST', body: '{}' });
    state.sessions = state.sessions.map(item => item.id === sessionId ? session : item);
    if (state.view === 'session' && state.session?.id === sessionId) state.session = session;
    notify(action === 'pause' ? 'Paused. Your context and budget remain attached to this session.' : action === 'cancel' ? 'Cancelled. This work will not automatically retry.' : 'The crew is starting.');
  }
  catch (error) { notify(error.message, true); }
  finally { state.busy = false; busyAction = null; if (state.view === 'session' && state.session?.id === sessionId) renderSession(); }
}

function selectEvidenceTab(id) {
  if (!evidenceTabs.some(tab => tab.id === id) || !state.session) return;
  state.tab = id;
  renderSession();
  document.getElementById(`evidence-tab-${id}`)?.focus({ preventScroll: true });
}

function moveEvidenceTab(event) {
  const tab = event.target.closest?.('[role="tab"][data-action="tab"]');
  if (tab && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const index = evidenceTabs.findIndex(item => item.id === tab.dataset.id);
    const next = event.key === 'ArrowRight' ? (index + 1) % evidenceTabs.length : event.key === 'ArrowLeft' ? (index + evidenceTabs.length - 1) % evidenceTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? evidenceTabs.length - 1 : -1;
    if (next !== -1) {
      event.preventDefault();
      selectEvidenceTab(evidenceTabs[next].id);
      return true;
    }
  }
  return false;
}

function inspectEvidence(control) {
  const id = control.dataset.id;
  selectEvidenceTab(id);
  if (control.getAttribute('role') !== 'tab') $('.session-evidence')?.scrollIntoView({ block: 'start' });
}

async function retry(control) { control.disabled = true; try { await api(`/api/sessions/${state.session.id}/retry`, { method: 'POST', body: '{}' }); notify('Trying again. The crew starts from the beginning.'); await openSession(state.session.id); } catch (error) { notify(error.message, true); control.disabled = false; } }

function duplicate() { const source = state.session; location.hash = 'sessions'; openNew(); const form = $('#new-session form'); if (form) { for (const [name, value] of Object.entries({ title: source.title, objective: source.objective, repositoryId: source.repositoryId, crewId: source.crewId, model: source.model || '', budgetUsd: source.budgetUsd })) { const field = form.elements[name]; if (field) field.value = value; } if (source.placement && form.elements.placement) form.elements.placement.value = source.placement; if (source.approval === 'auto' && form.elements.approval) form.elements.approval.checked = true; const advanced = $('#new-advanced'); if (advanced && (source.model || source.approval === 'auto' || source.placement)) advanced.open = true; } }

async function setApproval(control) { control.disabled = true; try { state.session = await api(`/api/sessions/${state.session.id}/approval`, { method: 'POST', body: JSON.stringify({ approval: control.dataset.approval }) }); notify(control.dataset.approval === 'auto' ? 'The crew now works without asking for each tool.' : 'The crew asks you again before each tool.'); renderSession(); } finally { control.disabled = false; } }

async function setSupervision(control) {
  if (!state.session || state.busy) return;
  const id = state.session.id; state.busy = true; renderSession();
  try { const session = await api(`/api/sessions/${id}/supervision`, { method: 'POST', body: JSON.stringify({ supervision: control.dataset.supervision }) }); if (state.view === 'session' && state.session?.id === id) state.session = session; notify('Supervision updated on the existing Ploeg execution.'); }
  finally { state.busy = false; if (state.bootstrap && state.view === 'session' && state.session?.id === id) renderSession(); }
}

async function decidePermission(control) {
  for (const sibling of control.closest('.session-decision-actions')?.querySelectorAll('button') || []) sibling.disabled = true;
  try { await api(`/api/sessions/${state.session.id}/permissions/${control.dataset.id}`, { method: 'POST', body: JSON.stringify({ decision: control.dataset.decision }) }); }
  catch (error) { for (const sibling of control.closest('.session-decision-actions')?.querySelectorAll('button') || []) sibling.disabled = false; throw error; }
  notify('Your decision was delivered to the runtime.');
}

async function downloadCandidateFormat(control) { control.disabled = true; try { await downloadCandidate(control.dataset.format); } finally { control.disabled = false; } }

function downloadArtifact(control) { const artifact = state.session.artifacts.find(item => item.id === control.dataset.id); if (artifact) download(`${artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${artifact.kind === 'diff' ? 'patch' : 'txt'}`, artifact.content); }

function confirmCancel() {
  const queued = state.session?.status === 'queued';
  const description = queued ? 'Nothing has started, so nothing stops and nothing is spent. A cancelled session cannot be started again.' : 'The role that is working stops and no remaining role starts. You cannot resume a cancelled session; spend so far stays recorded.';
  confirmAction('Cancel this session?', description, 'Cancel session', () => lifecycle('cancel'), { tone: 'danger', dismiss: queued ? 'Keep session' : 'Keep working' });
}

async function recordReview(data, form) {
  const decision = form.dataset.decision;
  const note = String(data.note || '').trim();
  if (decision === 'rejected' && !note) { fieldError(form, 'review-note', 'Say what is wrong before you reject.')?.focus(); return; }
  state.session = await api(`/api/sessions/${state.session.id}/review`, { method: 'POST', body: JSON.stringify({ decision, note: note || undefined }) });
  $('#confirm-dialog').close();
  notify(decision === 'accepted' ? 'Accepted. Your decision is recorded in the session.' : 'Rejected. Your reason is recorded in the session.');
  renderSession();
  document.getElementById('session-review-title')?.focus();
}

async function saveInstruction(data, form) { await api(`/api/sessions/${state.session.id}/messages`, { method: 'POST', body: JSON.stringify({ text: data.text }) }); state.draft = ''; form.reset(); notify('Instruction saved for the next execution.'); }

async function authorizeBudget(data, form) {
  const amount = parseAmount(data.amountUsd);
  const room = state.bootstrap.maxBudgetUsd - state.session.budgetUsd;
  if (!Number.isFinite(amount) || amount <= 0 || amount > room + 1e-9) { fieldError(form, 'budget-amount', `Enter an amount above zero and at most ${money(Math.max(0, room))}.`)?.focus(); return; }
  state.session = await api(`/api/sessions/${state.session.id}/budget`, { method: 'POST', body: JSON.stringify({ amountUsd: amount }) });
  $('#confirm-dialog').close();
  renderSession();
  (document.getElementById('session-budget-authorize') || document.getElementById('session-budget-title'))?.focus();
  notify('Additional budget authorized.');
}

async function answerQuestion(data, form) {
  const id = form.dataset.id;
  const draft = answers.get(id) || { choices: {}, other: {}, error: '' };
  const error = form.querySelector('[data-question-error]');
  const replies = [...form.querySelectorAll('[data-question]')].map(fieldset => { const index = fieldset.dataset.question; return [String(data[`other-${index}`] || '').trim() || String(data[`answer-${index}`] || '').trim()]; });
  const missing = replies.findIndex(([answer]) => !answer);
  if (missing !== -1) {
    draft.error = replies.length > 1 ? 'Answer every question before you send.' : 'Choose an option or write an answer before you send.';
    answers.set(id, draft);
    if (error) { error.textContent = draft.error; error.hidden = false; }
    form.querySelector(`[data-question="${missing}"] input`)?.focus();
    return;
  }
  draft.error = '';
  if (error) error.hidden = true;
  await api(`/api/sessions/${state.session.id}/permissions/${id}`, { method: 'POST', body: JSON.stringify({ answers: replies }) });
  answers.delete(id);
  notify('Your answer was delivered to the crew.');
}

function keepOtherAnswer(element) { answerDraft(element).other[element.dataset.index] = element.value; }

function keepChoice(element) { const draft = answerDraft(element); draft.choices[element.dataset.index] = element.value; }

/** The session workspace: the decision the crew waits on first, then the brief, crew progress, evidence, budget, handoff and delivery, kept live over the event stream. */
export default {
  id: 'session',
  match: hash => hash.startsWith('session/') ? { id: hash.slice(8) } : null,
  enter: ({ id }) => openSession(id),
  render: renderSession,
  actions: {
    'delivery-refresh': () => loadDelivery(state.session.id),
    'delivery-verify': control => actDelivery(control.dataset.action),
    'delivery-approve': control => actDelivery(control.dataset.action),
    'session-reload': () => openSession(load.id),
    tab: inspectEvidence,
    start: control => lifecycle(control.dataset.action),
    pause: control => lifecycle(control.dataset.action),
    resume: control => lifecycle(control.dataset.action),
    cancel: confirmCancel,
    export: () => exportHandoff(),
    'candidate-download': downloadCandidateFormat,
    'download-artifact': downloadArtifact,
    review: control => openReviewDialog(control.dataset.decision),
    retry,
    duplicate,
    approval: setApproval,
    supervision: setSupervision,
    permission: decidePermission,
    budget: () => openBudgetDialog(),
  },
  forms: { review: recordReview, message: saveInstruction, budget: authorizeBudget, question: answerQuestion },
  inputs: { '#operator-message': element => { state.draft = element.value; }, '[data-question-other]': keepOtherAnswer },
  changes: { '#diff-wrap': element => { state.diffWrap = element.checked; }, '[data-question-choice]': keepChoice },
  keys: [moveEvidenceTab],
};
