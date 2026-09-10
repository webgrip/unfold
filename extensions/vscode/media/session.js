const bridge = acquireVsCodeApi();
let lastRenderKey = '';
const saved = bridge.getState() || {};
const sessionId = document.body.dataset.sessionId || saved.sessionId || '';
const tabs = ['brief', 'changes', 'checks', 'activity', 'gateway'];
let detail;
let tab = tabs.includes(saved.tab) ? saved.tab : 'brief';
let draft = saved.draft || '';
let activityFilter = saved.activityFilter || 'all';
let connected = true;
let connectionMessage = '';
let pending = false;
let instruction = { state: draft ? 'draft' : 'idle', message: '', at: '' };
let pauseFirst = false;
let follow = true;
let focusTarget = null;
let budgetOpen = false;
const openRuns = new Set();
const decisions = new Map();
const confirming = new Set();

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false || value === null) continue;
    if (name === 'className') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name === 'disabled') node.disabled = Boolean(value);
    else if (name === 'checked') node.checked = Boolean(value);
    else if (name === 'open') node.open = Boolean(value);
    else if (name === 'value') node.value = value;
    else node.setAttribute(name, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null && child !== false) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function action(label, type, attributes = {}, ...children) { return element('button', { type: 'button', 'data-action': type, ...attributes }, label, ...children); }
function currency(value) { const amount = value || 0; const digits = amount > 0 && amount < 0.01 ? 5 : amount > 0 && amount < 1 ? 4 : 2; return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(amount); }
function readable(value) { return String(value ?? '').replaceAll('_', ' ').replaceAll('.', ' · '); }
function clock(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function ago(value) { const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000)); return !Number.isFinite(seconds) ? '' : seconds < 45 ? 'just now' : seconds < 3600 ? `${Math.round(seconds / 60)}m ago` : seconds < 86400 ? `${Math.round(seconds / 3600)}h ago` : `${Math.round(seconds / 86400)}d ago`; }
function duration(start, end) { if (!start) return ''; const seconds = Math.max(0, Math.round((Date.parse(end || new Date().toISOString()) - Date.parse(start)) / 1000)); return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`; }
function remember() { bridge.setState({ sessionId, tab, draft, activityFilter }); }
function announce(text) { const node = document.getElementById('announcement'); if (node) node.textContent = text; }
function fact(label, value, attributes = {}) { return element('div', { className: 'fact', ...attributes }, element('dt', {}, label), element('dd', {}, value)); }
function safeHttps(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : ''; } catch { return ''; } }

const stageNames = { credentials: 'Gateway authorization', workspace: 'Workspace setup', runtime: 'Runtime startup', prompt: 'Prompt submission', execution: 'Agent execution' };
const submissionText = { not_submitted: 'The prompt was not submitted.', rejected: 'The runtime rejected the prompt.', accepted: 'The runtime acknowledged the prompt; this does not confirm that execution finished.', unknown: 'Prompt submission is unconfirmed. Check remote execution and gateway spend before starting new work.' };
const statusNames = { queued: 'Ready to start', running: 'Working', exporting: 'Preparing review', waiting_input: 'Needs your decision', paused: 'Paused', interrupted: 'Interrupted', completed: 'Awaiting your review', failed: 'Needs attention', cancelled: 'Cancelled' };

function activeRole(session) { return session.runs.find(run => ['running', 'waiting_input', 'paused'].includes(run.status))?.roleName; }
function isReviewer(session, run) { return run.mode === 'read' && session.runs[session.runs.length - 1]?.id === run.id; }
function runLabel(session, run) { return run.mode === 'write' ? 'implementation' : isReviewer(session, run) ? 'independent review' : 'analysis'; }
function reviewers(session) { return session.runs.filter(run => isReviewer(session, run)); }
function verdictLabel(verdict) { return verdict === 'approve' ? 'Explicitly approved' : verdict === 'request_changes' ? 'Changes requested' : verdict === 'inconclusive' ? 'Inconclusive' : ''; }
function failureStage(failure) { return !failure ? 'Execution' : failure.category === 'policy_violation' ? 'Gateway policy' : stageNames[failure.stage] ?? 'Execution'; }
function isolatedPlacement(placement) { return placement === 'docker' || placement === 'kubernetes'; }
function finished(session) { return ['completed', 'failed', 'cancelled'].includes(session.status); }
function observedSpend(session) { return !finished(session) && typeof session.observedUsd === 'number' && session.observedUsd > session.spentUsd ? session.observedUsd : undefined; }

function situation(session) {
  const role = activeRole(session);
  const reviewing = reviewers(session);
  const rejected = reviewing.find(run => run.verdict === 'request_changes');
  switch (session.status) {
    case 'waiting_input': return [`${role ?? 'The crew'} is waiting for your decision.`, 'Answer the pending request below; nothing continues until you do.'];
    case 'failed': return session.failure ? [`${failureStage(session.failure)} failed: ${session.failure.message}`, session.failure.remediation]
      : rejected ? [`${rejected.roleName} requested changes.`, 'Read the review findings, then send a revised instruction and resume, or cancel.']
      : [session.blocker || 'Execution stopped without approval.', 'Inspect the activity and checks, then decide whether to resume with new instructions.'];
    case 'interrupted': return ['Execution was interrupted; no replacement run started.', 'Inspect retained evidence and spend, then resume deliberately.'];
    case 'paused': return [`Paused${role ? ` while ${role} was working` : ''}.`, 'Add instructions if needed, then resume to continue with them.'];
    case 'running': return [`${role ?? 'The crew'} is working in the remote workspace.`, 'You can keep editing. Pause to steer, or wait for the next decision.'];
    case 'exporting': return ['Capturing the repository state for review.', 'The candidate download appears when the snapshot is complete.'];
    case 'queued': return ['Authorized and ready; nothing has run yet.', 'Start the remote crew when the brief is right.'];
    case 'completed': return [`Required reviewers approved (${reviewing.filter(run => run.verdict === 'approve').length} of ${reviewing.length}).`, 'Machine review is done. Human review and your repository checks are still required.'];
    case 'cancelled': return ['Cancelled by an operator.', 'Evidence stays available. Create a new session to try again.'];
    default: return [readable(session.status), ''];
  }
}

function inline(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) fragment.append(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('`')) fragment.append(element('code', {}, token.slice(1, -1)));
    else if (token.startsWith('**') || token.startsWith('__')) fragment.append(element('strong', {}, inline(token.slice(2, -2))));
    else if (token.startsWith('[')) { const [, label, url] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/); fragment.append(element('span', { className: 'link-text' }, inline(label)), element('span', { className: 'link-target' }, ` (${url})`)); }
    else fragment.append(element('em', {}, inline(token.slice(1, -1))));
    last = match.index + token.length;
  }
  if (last < text.length) fragment.append(text.slice(last));
  return fragment;
}

function markdown(text) {
  const root = element('div', { className: 'markdown' });
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  let paragraph = [];
  const flush = () => { if (paragraph.length) { root.append(element('p', {}, inline(paragraph.join(' ')))); paragraph = []; } };
  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*(\S*)/);
    if (fence) {
      flush();
      const body = [];
      index++;
      while (index < lines.length && !lines[index].startsWith(fence[1])) body.push(lines[index++]);
      index++;
      root.append(element('pre', { 'data-language': fence[2] || undefined }, element('code', {}, body.join('\n'))));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flush(); root.append(element(heading[1].length <= 2 ? 'h3' : 'h4', {}, inline(heading[2].trim()))); index++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); root.append(element('hr')); index++; continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      root.append(element('blockquote', {}, markdown(quote.join('\n'))));
      continue;
    }
    const listItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      flush();
      const ordered = /\d/.test(listItem[2]);
      const list = element(ordered ? 'ol' : 'ul');
      while (index < lines.length) {
        const item = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!item || /\d/.test(item[2]) !== ordered) break;
        const content = [item[3]];
        index++;
        while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !lines[index].match(/^\s*([-*+]|\d+[.)])\s+/)) content.push(lines[index++].trim());
        list.append(element('li', {}, inline(content.join(' '))));
      }
      root.append(list);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
      flush();
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const table = element('table');
      table.append(element('thead', {}, element('tr', {}, ...cells(line).map(cell => element('th', {}, inline(cell))))));
      const body = element('tbody');
      index += 2;
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) body.append(element('tr', {}, ...cells(lines[index++]).map(cell => element('td', {}, inline(cell)))));
      table.append(body);
      root.append(element('div', { className: 'table-scroll' }, table));
      continue;
    }
    if (!line.trim()) { flush(); index++; continue; }
    paragraph.push(line.trim());
    index++;
  }
  flush();
  return root;
}

function parsePatch(content) {
  const files = [];
  let current;
  for (const line of String(content ?? '').split('\n')) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) { current = { path: header[2], from: header[1], added: 0, removed: 0, binary: false, status: header[1] === header[2] ? 'modified' : 'renamed' }; files.push(current); continue; }
    if (!current) continue;
    if (line.startsWith('new file mode')) current.status = 'added';
    else if (line.startsWith('deleted file mode')) current.status = 'deleted';
    else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) current.binary = true;
    else if (line.startsWith('+') && !line.startsWith('+++')) current.added++;
    else if (line.startsWith('-') && !line.startsWith('---')) current.removed++;
  }
  return files;
}

function checkOutcome(artifact) {
  const text = artifact.content || '';
  const exit = text.match(/^Exit code:\s*(\d+)/im);
  const failures = text.match(/^(?:#|ℹ)\s*fail\s+(\d+)/im);
  const passes = text.match(/^(?:#|ℹ)\s*pass\s+(\d+)/im);
  const failed = exit ? Number(exit[1]) !== 0 : failures ? Number(failures[1]) > 0 : /^not ok\b|✖|\bFAIL(?:ED|URE)?\b|\bError:/m.test(text);
  const passed = !failed && (passes ? Number(passes[1]) > 0 : /^ok \d|✔|✓|\bPASS(?:ED)?\b/m.test(text) || Boolean(exit));
  const baseline = /expected failure|baseline/i.test(artifact.name);
  const counts = failures || passes ? `${passes ? passes[1] : 0} passed · ${failures ? failures[1] : 0} failed` : exit ? `exit ${exit[1]}` : '';
  if (baseline) return failed ? { id: 'expected', label: 'Expected failure', detail: `Reproduced before the change${counts ? ` · ${counts}` : ''}` } : { id: 'unexpected', label: 'Baseline passed', detail: 'The baseline did not reproduce the problem.' };
  if (failed) return { id: 'failed', label: 'Failed', detail: counts || 'Failures recorded in the output.' };
  if (passed) return { id: 'passed', label: 'Passed', detail: counts || 'No failures recorded.' };
  return { id: 'unknown', label: 'Recorded', detail: 'Read the output to judge the result.' };
}

function decisionState(request) {
  if (!decisions.has(request.id)) decisions.set(request.id, { answers: (request.questions ?? []).map(() => ({ selected: [], custom: '' })) });
  return decisions.get(request.id);
}

function permissionScope(request) {
  try {
    const parsed = JSON.parse(request.detail);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { permission: typeof parsed.permission === 'string' ? parsed.permission : undefined, patterns: Array.isArray(parsed.patterns) ? parsed.patterns.filter(item => typeof item === 'string').slice(0, 20) : [], always: Boolean(parsed.always) };
  } catch {}
  return null;
}

function roleFor(session, runId) { return session.runs.find(run => run.id === runId)?.roleName; }

function decisionCard(request, session, mutable) {
  const role = roleFor(session, request.runId);
  const busy = !mutable || pending;
  const card = element('section', { className: 'decision-card', id: `decision-${request.id}`, 'aria-labelledby': `decision-title-${request.id}` },
    element('div', { className: 'eyebrow' }, request.kind === 'question' ? 'CREW QUESTION' : 'PERMISSION REQUEST', role ? element('span', { className: 'eyebrow-detail' }, `· ${role}`) : null),
    element('h2', { id: `decision-title-${request.id}` }, request.title));
  if (request.kind === 'permission') {
    const scope = permissionScope(request);
    if (scope) {
      card.append(element('dl', { className: 'scope' }, ...(scope.permission ? [fact('Action', scope.permission)] : []), ...(scope.patterns.length ? [fact('Applies to', element('ul', { className: 'patterns' }, ...scope.patterns.map(pattern => element('li', {}, element('code', {}, pattern)))))] : [])));
    } else card.append(element('p', { className: 'preserve detail' }, request.detail));
    const buttons = [action('Allow once', 'decide', { className: 'primary', 'data-id': request.id, 'data-decision': 'once', disabled: busy }), action('Reject', 'decide', { 'data-id': request.id, 'data-decision': 'reject', disabled: busy })];
    if ((request.options ?? []).includes('always') && scope?.patterns.length) buttons.push(action('Allow matching requests', 'decide', { className: 'quiet', 'data-id': request.id, 'data-decision': 'always', disabled: busy, title: `Allow ${scope.patterns.join(', ')} for the rest of this run` }));
    card.append(element('div', { className: 'toolbar' }, ...buttons), element('p', { className: 'footnote' }, 'A grant applies only to this request. Nothing is approved by opening or scrolling this panel.'));
    return card;
  }
  const questions = request.questions ?? [];
  if (!questions.length) { card.append(element('p', { className: 'preserve detail' }, request.detail), element('p', { className: 'footnote' }, 'This adapter did not supply structured questions. Resolve the request in the web dashboard.'), element('div', { className: 'toolbar' }, action('Open dashboard ↗', 'dashboard'))); return card; }
  const state = decisionState(request);
  const answers = () => state.answers.map(answer => [...answer.selected, ...(answer.custom.trim() ? [answer.custom.trim()] : [])]);
  if (confirming.has(request.id)) {
    card.append(element('div', { className: 'confirm' }, element('p', { className: 'confirm-title' }, 'You are about to answer:'), element('ol', {}, ...questions.map((question, index) => element('li', {}, element('span', { className: 'muted' }, question.header || question.question), element('strong', {}, answers()[index].join(', ') || '(no answer)')))), element('div', { className: 'toolbar' }, action('Send answers', 'answer', { className: 'primary', 'data-id': request.id, disabled: busy }), action('Edit', 'edit-answer', { 'data-id': request.id }))));
    return card;
  }
  const form = element('form', { className: 'question-form', 'data-form': 'question', 'data-id': request.id });
  questions.forEach((question, index) => {
    const answer = state.answers[index];
    const group = element('fieldset', {}, element('legend', {}, question.header ? element('span', { className: 'eyebrow' }, question.header) : null, element('span', { className: 'question' }, question.question)));
    if (question.options?.length) {
      const type = question.multiple ? 'checkbox' : 'radio';
      for (const option of question.options) {
        const id = `q-${request.id}-${index}-${option.label}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        group.append(element('label', { className: 'option', for: id }, element('input', { id, type, name: `q-${index}`, value: option.label, checked: answer.selected.includes(option.label), 'data-question': index, disabled: busy }), element('span', {}, element('strong', {}, option.label), option.description ? element('span', { className: 'muted' }, ` ${option.description}`) : null)));
      }
      if (question.custom !== false) group.append(element('label', { className: 'custom' }, element('span', { className: 'muted' }, question.multiple ? 'Add your own answer' : 'Or write your own answer'), element('input', { type: 'text', maxlength: '4000', 'data-custom': index, value: answer.custom, placeholder: 'Your answer', disabled: busy })));
    } else group.append(element('textarea', { id: `answer-${request.id}-${index}`, rows: '3', maxlength: '4000', 'data-custom': index, placeholder: 'Your answer', disabled: busy, value: answer.custom, 'aria-label': question.question }));
    form.append(group);
  });
  const complete = answers().every(list => list.length);
  form.append(element('div', { className: 'toolbar' }, element('button', { type: 'submit', className: 'primary', disabled: busy || !complete }, 'Review answers'), element('span', { className: 'footnote' }, 'You confirm before anything is sent.')));
  card.append(form);
  return card;
}

function crewStrip(session) {
  if (!session.runs.length) return element('p', { className: 'empty' }, 'The crew is ready. Starting this session creates its remote runs.');
  const total = session.runs.length;
  return element('ol', { className: 'crew' }, ...session.runs.map((run, index) => {
    const stateText = run.status === 'completed' ? (run.verdict === 'approve' ? 'Explicitly approved' : run.verdict === 'request_changes' ? 'Requested changes' : run.verdict === 'inconclusive' ? 'Inconclusive' : 'Work completed') : run.status === 'running' ? 'Working in the remote workspace' : run.status === 'waiting_input' ? 'Waiting for your decision' : run.status === 'queued' ? 'Waiting for its turn' : run.status === 'failed' ? 'Failed' : readable(run.status);
    const elapsed = run.startedAt ? duration(run.startedAt, run.finishedAt) : '';
    const attention = run.status === 'failed' || run.verdict === 'request_changes';
    const open = openRuns.has(run.id) || (!openRuns.has(`closed:${run.id}`) && (attention || run.status === 'running' || index === total - 1));
    const item = element('li', { className: `run run-${run.status}${run.verdict ? ` verdict-${run.verdict}` : ''}`, id: `run-${run.id}` },
      element('div', { className: 'run-number', 'aria-hidden': 'true' }, run.status === 'completed' && run.verdict !== 'request_changes' ? '✓' : attention ? '!' : String(index + 1)),
      element('div', { className: 'run-content' },
        element('div', { className: 'run-heading' }, element('h3', {}, run.roleName), element('span', { className: 'run-meta' }, runLabel(session, run).replace(/^./, first => first.toUpperCase()), elapsed ? ` · ${elapsed}` : '', run.costUsd ? ` · ${currency(run.costUsd)}` : '')),
        element('p', { className: `run-state state-${run.status}` }, stateText),
        run.summary ? element('details', { className: 'run-summary', open, 'data-run': run.id }, element('summary', {}, open ? 'Hide findings' : 'Read findings'), markdown(run.summary)) : null));
    return item;
  }));
}

function candidateCard(session) {
  const candidate = session.candidate;
  if (!candidate) return null;
  const ready = candidate.status === 'ready';
  return element('section', { className: `card candidate-card candidate-${candidate.status}`, 'aria-label': 'Review candidate' },
    element('div', { className: 'section-heading' }, element('h2', {}, ready ? 'Review candidate' : 'Candidate export unavailable'), element('span', {}, ready ? `${candidate.fileCount ?? 'Captured'} ${candidate.fileCount === 1 ? 'file' : 'files'} · Git snapshot` : 'Inspect retained evidence')),
    ...(ready ? [
      element('dl', { className: 'revisions' }, fact('Base', element('code', {}, (candidate.baseSha || '').slice(0, 12) || 'See manifest')), fact('Candidate', element('code', {}, (candidate.headSha || '').slice(0, 12) || 'See manifest'))),
      element('div', { className: 'toolbar' }, action('Download Git bundle', 'download-candidate', { className: 'primary', 'data-format': 'bundle', disabled: !connected || pending }), action('Download patch', 'download-candidate', { 'data-format': 'patch', disabled: !connected || pending }), action('Download manifest', 'download-candidate', { 'data-format': 'manifest', disabled: !connected || pending })),
      element('p', { className: 'footnote' }, 'Files are saved only after you choose a destination. An export records repository state; human review and approval remain separate.'),
    ] : [element('p', { className: 'preserve' }, candidate.message || candidate.reason || 'The server could not retain a complete candidate. Review the session history before proceeding.')]));
}

function transcriptSection(artifact) {
  return element('details', { className: 'transcript card', 'data-transcript': artifact.id },
    element('summary', {}, element('strong', {}, artifact.name), element('span', { className: 'muted' }, ' · transcript · ', `${String(artifact.content || '').length.toLocaleString()} characters`)),
    markdown(artifact.content),
    element('div', { className: 'toolbar' }, action('Open as document', 'artifact', { className: 'quiet', 'data-id': artifact.id })));
}

function briefTab(session) {
  const handoff = session.artifacts.filter(artifact => ['summary', 'link'].includes(artifact.kind));
  const transcripts = session.artifacts.filter(artifact => artifact.kind === 'transcript');
  return element('div', { className: 'brief' },
    element('section', { className: 'objective' }, element('h2', {}, 'The brief'), markdown(session.objective)),
    ...(session.sourceTask ? [element('section', { className: 'card source-task' }, element('div', { className: 'section-heading' }, element('h2', {}, 'Imported task'), element('span', {}, `${session.sourceTask.provider} #${session.sourceTask.id} · ${session.sourceTask.status}`)), element('p', { className: 'preserve' }, session.sourceTask.title), element('div', { className: 'toolbar' }, action('Open imported snapshot', 'source-task', { disabled: !connected }), safeHttps(session.sourceTask.url) ? action('Open in tracker ↗', 'tracker') : null), element('p', { className: 'footnote' }, `Pinned source revision ${session.sourceTask.revision.slice(0, 12)}. Tracker assignment and status stay in the task system.`))] : []),
    candidateCard(session),
    ...(handoff.length ? [element('section', {}, element('div', { className: 'section-heading' }, element('h2', {}, 'Handoff'), element('span', {}, 'Retained summaries and links')), element('div', { className: 'evidence-list' }, ...handoff.map(artifact => evidenceButton(artifact))))] : []),
    ...(transcripts.length ? [element('section', { className: 'transcripts' }, element('div', { className: 'section-heading' }, element('h2', {}, 'Transcripts'), element('span', {}, 'What each role said, as recorded by the workbench')), ...transcripts.map(transcriptSection))] : []));
}

function evidenceButton(artifact, extra) {
  const glyph = artifact.kind === 'diff' ? '±' : artifact.kind === 'test' ? '✓' : artifact.kind === 'link' ? '↗' : artifact.kind === 'transcript' ? '❝' : '≡';
  const button = action('', 'artifact', { className: 'artifact', 'data-id': artifact.id, 'aria-label': `Open ${artifact.kind}: ${artifact.name}` });
  button.append(element('span', { className: `artifact-type type-${artifact.kind}` }, glyph), element('span', { className: 'artifact-label' }, element('strong', {}, artifact.name), element('span', {}, extra || `${readable(artifact.kind)} · opens as a read-only document`)), element('span', { 'aria-hidden': 'true' }, '↗'));
  return button;
}

function changesTab(session) {
  const diffs = session.artifacts.filter(artifact => artifact.kind === 'diff');
  if (!diffs.length) return element('div', { className: 'empty-state' }, element('h3', {}, 'Changes will appear here'), element('p', {}, 'The crew attaches its repository changes as it works. Only retained patches are shown; nothing is applied locally.'));
  return element('div', { className: 'changes' }, ...diffs.map(artifact => {
    const files = parsePatch(artifact.content);
    const added = files.reduce((sum, file) => sum + file.added, 0);
    const removed = files.reduce((sum, file) => sum + file.removed, 0);
    return element('section', { className: 'card' },
      element('div', { className: 'section-heading' }, element('h2', {}, artifact.name), element('span', {}, files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'} · ` : '', element('span', { className: 'added' }, `+${added}`), ' ', element('span', { className: 'removed' }, `−${removed}`))),
      files.length ? element('ul', { className: 'files' }, ...files.map(file => element('li', {}, action('', 'artifact', { className: 'file', 'data-id': artifact.id, 'data-file': file.path, 'aria-label': `Open ${file.path} in the patch` }, element('span', { className: `file-status status-${file.status}` }, file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : file.status === 'renamed' ? 'R' : 'M'), element('span', { className: 'file-path' }, file.status === 'renamed' ? `${file.from} → ${file.path}` : file.path), element('span', { className: 'file-counts' }, file.binary ? 'binary' : [element('span', { className: 'added' }, `+${file.added}`), ' ', element('span', { className: 'removed' }, `−${file.removed}`)]))))) : element('p', { className: 'muted' }, 'The retained patch has no per-file headers; open it in full.'),
      element('div', { className: 'toolbar' }, action('Open full patch', 'artifact', { 'data-id': artifact.id }), session.candidate?.status === 'ready' ? action('Download for review', 'download-candidate', { className: 'quiet', 'data-format': 'patch', disabled: !connected || pending }) : null),
      element('p', { className: 'footnote' }, 'Opening a file reveals its hunk in the retained unified patch. Applying it locally or publishing a merge request is a separate workflow.'));
  }));
}

function checksTab(session) {
  const checks = session.artifacts.filter(artifact => artifact.kind === 'test');
  if (!checks.length) return element('div', { className: 'empty-state' }, element('h3', {}, 'No check evidence yet'), element('p', {}, 'Only commands that actually ran are recorded as evidence.'));
  return element('div', { className: 'checks' }, ...checks.map(artifact => {
    const outcome = checkOutcome(artifact);
    const lines = (artifact.content || '').split('\n');
    return element('section', { className: `card check check-${outcome.id}` },
      element('div', { className: 'section-heading' }, element('h2', {}, element('span', { className: `chip chip-${outcome.id}` }, outcome.label), ' ', artifact.name), element('span', {}, outcome.detail)),
      element('pre', { className: 'output', 'aria-label': `Output of ${artifact.name}` }, lines.slice(0, 14).join('\n'), lines.length > 14 ? `\n… ${lines.length - 14} more lines` : ''),
      element('div', { className: 'toolbar' }, action('Open full output', 'artifact', { 'data-id': artifact.id })));
  }));
}

const hiddenEvents = new Set(['native.session', 'usage', 'message.delta', 'heartbeat', 'budget.observed', 'budget.settled', 'brief.checked']);

function visibleEvents(events) {
  const visible = [];
  const parts = new Map();
  for (const event of events) {
    if (hiddenEvents.has(event.type)) continue;
    const key = event.type === 'message' && event.data?.partId ? `${event.runId}:${event.data.partId}` : event.type === 'tool' && event.data?.partId ? `${event.runId}:tool:${event.data.partId}` : null;
    if (key && parts.has(key)) {
      const current = parts.get(key);
      if (event.type === 'tool') Object.assign(current.data, event.data || {});
      else current.data.text = `${current.data.text || ''}${event.data.text || ''}`;
      current.at = event.at;
      continue;
    }
    const item = { ...event, data: { ...(event.data || {}) } };
    if (key) parts.set(key, item);
    visible.push(item);
  }
  return visible;
}

function eventCategory(event) {
  if (['message', 'text', 'assistant.message'].includes(event.type)) return event.data.role === 'operator' || event.actor === 'operator' ? 'operator' : 'crew';
  if (event.type === 'tool' || event.type === 'tool.updated') return 'tools';
  return 'workbench';
}

function systemText(event, session) {
  const data = event.data;
  const role = (session && roleFor(session, event.runId)) || data.role || 'Role';
  if (event.type === 'run.finished') return `${role} finished${data.verdict ? ` · ${verdictLabel(data.verdict)}` : data.status && data.status !== 'completed' ? ` · ${readable(data.status)}` : ''}`;
  if (event.type === 'permission') return `${roleName} ${data.kind === 'question' ? 'asked a question' : 'asked for permission'}${data.title ? `: ${data.title}` : ''}`;
  if (event.type === 'brief.unclear') return `Brief check: not enough to start on. ${data.reason || ''}${Array.isArray(data.questions) && data.questions.length ? ` Questions: ${data.questions.join(' / ')}` : ''} Answer in the decision panel; the crew starts once you do.`;
  if (event.type === 'brief.clarified') return 'Brief clarified by the operator; the crew starts.';
  if (event.type === 'run.runaway') return String(data.message || 'A role exceeded its tool-call limit.');
  if (event.type === 'budget.observed') return `Observed at the gateway: ${currency(data.observedUsd)} of ${currency(data.budgetUsd)}${typeof data.requests === 'number' ? ` · ${data.requests} request${data.requests === 1 ? '' : 's'}` : ''}`;
  if (event.type === 'approval.changed') return data.approval === 'auto' ? 'Tool use is now approved automatically inside the sandbox' : 'Tool use asks you again';
  if (event.type === 'policy.violated') return `Gateway policy: ${typeof data.message === 'string' ? data.message : `${data.request?.model || 'a model request'} answered by ${data.request?.violation || 'a provider outside policy'}`}`;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.summary === 'string') return data.summary;
  switch (event.type) {
    case 'session.created': return 'Session created. Budget authorized; no work started.';
    case 'session.started': return data.resumed ? 'Session resumed by operator' : 'Session started';
    case 'session.completed': return 'Required reviewers approved. Ready for human review.';
    case 'session.failed': return data.failure?.message ? `Failed: ${data.failure.message}` : 'Session failed';
    case 'session.interrupted': return 'Execution interrupted; no replacement run started.';
    case 'workspace.ready': return `Workspace ready${data.backend ? ` · ${data.backend}` : ''}`;
    case 'run.started': return `${role} started`;
    case 'budget.increased': return `Additional authorization: ${currency(data.amountUsd)}`;
    case 'budget.settled': return data.costStatus === 'settled' ? `Spend settled at ${currency(data.spentUsd)}` : `Awaiting gateway settlement · ${currency(data.reservedUsd || 0)} reserved`;
    case 'review.recorded': return `${data.decision === 'accepted' ? 'Accepted' : 'Rejected'} by ${data.byName || event.actor}${data.note ? `: ${data.note}` : ''}`;
    case 'candidate.ready': return 'Review candidate captured';
    case 'candidate.preparing': return 'Capturing the review candidate';
    case 'candidate.unavailable': return 'Review candidate unavailable';
    case 'permission.asked': return 'The crew asked for a decision';
    case 'permission.resolved': return 'An operator decision was recorded';
    default: return readable(event.type);
  }
}

function eventNode(event, session) {
  const category = eventCategory(event);
  if (category === 'crew' || category === 'operator') {
    const role = category === 'operator' ? 'You' : roleFor(session, event.runId) || 'Crew';
    return element('article', { className: `message message-${category}` }, element('div', { className: 'avatar', 'aria-hidden': 'true' }, role.slice(0, 1)), element('div', { className: 'message-body' }, element('header', {}, element('strong', {}, role), event.data.applies === 'next_execution' ? element('span', { className: 'tag' }, 'Next execution') : null, element('time', { datetime: event.at }, clock(event.at))), markdown(String(event.data.text ?? event.data.message ?? ''))));
  }
  if (category === 'tools') {
    const data = event.data;
    const failed = (data.status === 'failed' || data.status === 'error') && !data.expectedFailure;
    const state = data.expectedFailure && data.exitCode ? 'expected baseline failure' : data.status || '';
    const input = toolInput(data);
    const detail = toolTitle(data);
    const node = element('article', { className: `tool tool-${failed ? 'failed' : data.status || 'unknown'}` }, element('div', { className: 'tool-title' }, element('span', { className: 'tool-glyph', 'aria-hidden': 'true' }, failed ? '✕' : data.status === 'completed' ? '✓' : data.status === 'running' ? '…' : '›'), element('code', {}, String(data.name || data.tool || 'Tool operation')), detail ? element('span', { className: 'tool-detail' }, detail) : null, element('span', { className: 'tool-state' }, state, data.durationMs ? ` · ${Math.round(data.durationMs / 100) / 10}s` : ''), element('time', { datetime: event.at }, clock(event.at))));
    const output = typeof data.output === 'string' && data.output ? data.output : '';
    const error = typeof data.error === 'string' && data.error ? data.error : '';
    if (input || output || error) {
      const body = element('details', {}, element('summary', {}, `${error ? 'Error and input' : output ? 'Input and output' : 'Input'}${data.exitCode !== undefined ? ` · exit ${data.exitCode}` : ''}`));
      if (input) body.append(element('p', { className: 'eyebrow' }, 'INPUT'), element('pre', {}, input.slice(0, 20000)));
      if (output) body.append(element('p', { className: 'eyebrow' }, 'OUTPUT'), element('pre', {}, output.slice(0, 20000)));
      if (error) body.append(element('p', { className: 'eyebrow' }, 'ERROR'), element('pre', { className: 'tool-error' }, error.slice(0, 20000)));
      node.append(body);
    } else if (typeof data.text === 'string' && data.text) node.append(element('p', { className: 'preserve' }, data.text));
    return node;
  }
  if (event.type === 'run.started' && event.data.prompt && typeof event.data.prompt === 'object') return briefEvent(event, session);
  const kind = event.type.includes('completed') || event.type.includes('ready') ? 'good' : event.type.includes('failed') || event.type.includes('interrupted') || event.type.includes('unavailable') || event.type === 'policy.violated' ? 'bad' : 'neutral';
  return element('div', { className: `system-event system-${kind}` }, element('span', { className: 'system-glyph', 'aria-hidden': 'true' }, kind === 'good' ? '✓' : kind === 'bad' ? '!' : '·'), element('span', { className: 'system-text' }, systemText(event, session)), element('span', { className: 'muted' }, event.actor), element('time', { datetime: event.at }, clock(event.at)));
}

function toolInput(data) {
  if (data.input === undefined || data.input === null || data.input === '') return '';
  if (typeof data.input === 'string') return data.input;
  try { return JSON.stringify(data.input, null, 2); } catch { return String(data.input); }
}

function toolTitle(data) {
  const parsed = (() => { try { return typeof data.input === 'string' ? JSON.parse(data.input) : data.input; } catch { return null; } })();
  const detail = data.title || (parsed && typeof parsed === 'object' && (parsed.command || parsed.pattern || parsed.filePath || parsed.path || parsed.query || parsed.url)) || '';
  return detail ? String(detail).slice(0, 160) : '';
}

function briefEvent(event, session) {
  const data = event.data;
  const prompt = data.prompt;
  const role = roleFor(session, event.runId) || data.role || 'Role';
  const label = data.reviewer ? 'independent review' : data.mode === 'write' ? 'implementation' : 'analysis';
  const section = (title, text) => typeof text === 'string' && text.trim() ? [element('p', { className: 'eyebrow' }, title), markdown(text)] : [];
  return element('article', { className: 'brief-event' },
    element('div', { className: 'tool-title' }, element('span', { className: 'tool-glyph', 'aria-hidden': 'true' }, '›'), element('strong', {}, `${role} started`), element('span', { className: 'tool-state' }, label, data.model?.modelId ? ` · ${data.model.modelId}` : ''), element('time', { datetime: event.at }, clock(event.at))),
    element('details', { className: 'brief-body' }, element('summary', {}, 'The brief this role received', typeof data.promptSha === 'string' && data.promptSha ? element('code', {}, data.promptSha.slice(0, 12)) : null),
      ...section('OBJECTIVE', prompt.objective), ...section('ROLE INSTRUCTION', prompt.instruction), ...section('OPERATOR NOTES', prompt.notes), ...section('PRIOR WORK', prompt.earlier), ...section('EVIDENCE SUPPLIED', prompt.evidence), ...section('GUIDANCE', prompt.guidance)));
}

function activityTab(session, events) {
  const filters = [['all', 'All'], ['crew', 'Crew'], ['tools', 'Tools'], ['workbench', 'Workbench']];
  const visible = visibleEvents(events).filter(event => activityFilter === 'all' || eventCategory(event) === activityFilter || (activityFilter === 'crew' && eventCategory(event) === 'operator'));
  const active = ['running', 'exporting', 'waiting_input'].includes(session.status);
  return element('div', { className: 'activity' },
    element('div', { className: 'activity-bar' }, element('div', { className: 'chips', role: 'group', 'aria-label': 'Filter activity' }, ...filters.map(([id, label]) => action(label, 'filter', { className: `chip-button${activityFilter === id ? ' selected' : ''}`, 'data-filter': id, 'aria-pressed': activityFilter === id }))), element('div', { className: 'activity-tools' }, element('label', { className: 'follow' }, element('input', { type: 'checkbox', id: 'follow', checked: follow }), 'Follow newest'), action('Open complete history', 'history', { className: 'quiet' }))),
    element('div', { className: 'stream', id: 'stream', tabindex: '0', 'aria-label': 'Durable activity' }, ...(visible.length ? visible.map(event => eventNode(event, session)) : [element('div', { className: 'empty-state compact' }, element('h3', {}, session.runs.length ? 'Nothing matches this filter' : 'The workspace is ready'), element('p', {}, session.runs.length ? 'Choose another filter.' : 'Start the session to see the crew work.'))]), active ? element('div', { className: 'working', role: 'status' }, element('span', { className: 'dots', 'aria-hidden': 'true' }, element('i'), element('i'), element('i')), session.status === 'exporting' ? 'Preparing the repository handoff' : session.status === 'waiting_input' ? 'Waiting for your decision' : 'The crew is working') : null),
    element('p', { className: 'footnote' }, `Showing ${visible.length} of ${events.length} retained events. Events are read from the server without restarting any work.`));
}

function failureNotice(session) {
  const failure = session.failure;
  if (!failure && !session.blocker) return null;
  return element('section', { className: 'notice warning execution-failure', role: 'status', 'aria-labelledby': 'failure-title' },
    element('strong', { id: 'failure-title' }, failure ? `${failureStage(failure)} needs attention` : session.status === 'interrupted' ? 'Execution was interrupted' : 'Decision needed'),
    element('p', { className: 'preserve' }, failure?.message || session.blocker),
    failure?.remediation ? element('p', { className: 'preserve remediation' }, failure.remediation) : null,
    failure?.detail ? element('details', { className: 'failure-detail-wrap' }, element('summary', {}, 'Recorded error output'), element('pre', { className: 'failure-detail', 'aria-label': 'Recorded error output' }, failure.detail)) : null,
    failure ? element('p', { className: 'muted' }, submissionText[failure.promptAcceptance] || '', failure.promptAcceptance === 'unknown' ? ' Submission outcome unconfirmed · no automatic retry.' : ' No automatic retry will be started.') : null);
}

function composer(session, writer) {
  if (!writer || ['completed', 'cancelled'].includes(session.status)) return null;
  const sending = instruction.state === 'sending';
  const textarea = element('textarea', { id: 'instruction', rows: '4', maxlength: '16000', placeholder: 'Clarify the outcome, add a constraint or steer the next execution…', 'aria-describedby': 'instruction-state', disabled: !connected || sending, value: draft });
  const canPause = ['running', 'waiting_input'].includes(session.status);
  const stateText = instruction.state === 'sending' ? 'Sending…' : instruction.state === 'saved' ? `Saved for the next execution${instruction.at ? ` · ${instruction.at}` : ''}.` : instruction.state === 'unknown' ? 'Delivery unknown. Refresh before sending again; it may already be saved.' : instruction.state === 'failed' ? instruction.message || 'The instruction could not be saved.' : draft.trim() ? 'Draft on this device. Nothing is sent until you choose Send.' : canPause ? 'Saved instructions apply to the next execution. Pause first to apply one to the active run.' : 'Saved for the next execution.';
  return element('form', { id: 'instruction-form', className: 'composer' },
    element('label', { for: 'instruction' }, 'Steer the crew'),
    textarea,
    element('div', { className: 'composer-footer' },
      element('p', { id: 'instruction-state', className: `instruction-state state-${instruction.state}`, role: 'status' }, stateText),
      element('div', { className: 'composer-actions' }, canPause ? element('label', { className: 'pause-first' }, element('input', { type: 'checkbox', id: 'pause-first', checked: pauseFirst, disabled: !connected || sending }), 'Pause the active run first') : null, element('button', { type: 'submit', className: 'primary', disabled: !connected || sending || pending || !draft.trim() }, sending ? 'Sending…' : pauseFirst && canPause ? 'Pause and send' : 'Send instruction'))),
    element('p', { className: 'footnote' }, 'Enter adds a line. Use Ctrl+Enter or Cmd+Enter to send. Sending never approves a pending request.'));
}

function svg(tag, attributes = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) if (value !== undefined && value !== null && value !== false) node.setAttribute(name, String(value));
  for (const child of children.flat(Infinity)) if (child) node.append(child);
  return node;
}

function costCurve(session) {
  const requests = (session.requests || []).filter(request => request && typeof request.at === 'string').slice().sort((a, b) => a.at.localeCompare(b.at));
  if (requests.length < 2) return null;
  const start = Date.parse(session.runs.find(run => run.startedAt)?.startedAt || requests[0].at);
  const end = Math.max(Date.parse(requests[requests.length - 1].at), start + 1000);
  const budget = session.budgetUsd || 1;
  let total = 0;
  const points = [[0, 0]];
  for (const request of requests) { total += Number(request.usd) || 0; points.push([(Date.parse(request.at) - start) / (end - start), total]); }
  const top = Math.max(budget, total) * 1.05;
  const width = 280, height = 72, pad = 4;
  const x = fraction => pad + Math.max(0, Math.min(1, fraction)) * (width - pad * 2);
  const y = value => height - pad - (value / top) * (height - pad * 2);
  const line = points.map(([fraction, value], index) => `${index ? 'L' : 'M'}${x(fraction).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const violations = requests.filter(request => request.violation);
  return element('figure', { className: 'cost-curve' },
    svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Cumulative gateway cost over the session against its budget' },
      svg('line', { x1: pad, x2: width - pad, y1: y(budget).toFixed(1), y2: y(budget).toFixed(1), class: 'budget-line' }),
      svg('path', { d: line, class: 'cost-line' }),
      ...violations.map(request => svg('circle', { cx: x((Date.parse(request.at) - start) / (end - start)).toFixed(1), cy: y(total).toFixed(1), r: 3, class: 'violation-dot' }))),
    element('figcaption', {}, `${requests.length} requests over ${Math.max(1, Math.round((end - start) / 1000))}s · ceiling ${currency(budget)}`));
}

function usageList(session) {
  const usage = Array.isArray(session.usage) ? session.usage : [];
  if (!usage.length) return null;
  return element('dl', { className: 'usage-list' }, ...usage.map(entry => element('div', { className: 'fact' }, element('dt', {}, entry.group ? `${entry.group} → ${entry.model}` : entry.model), element('dd', {}, `${entry.requests} request${entry.requests === 1 ? '' : 's'}${entry.failures ? ` · ${entry.failures} refused` : ''} · ${currency(entry.usd)}`))));
}

function budgetCard(session, user) {
  const observed = observedSpend(session);
  const shown = observed ?? session.spentUsd;
  const ratio = session.budgetUsd ? Math.min(1, shown / session.budgetUsd) : 0;
  const warn = session.costStatus !== 'demo' && ratio >= 0.8;
  const statusText = session.costStatus === 'demo' ? 'Demo · no AI calls' : observed !== undefined ? 'Observed at the gateway · settles later' : session.costStatus === 'settled' ? 'Spend reconciled' : session.costStatus === 'unknown' ? 'Spend unconfirmed · authorization stays reserved' : 'Settlement pending';
  const card = element('section', { className: `card budget-card${warn ? ' budget-warn' : ''}` }, element('div', { className: 'eyebrow' }, observed !== undefined ? 'OBSERVED AT THE GATEWAY' : 'OBSERVED SPEND'), element('p', { className: 'spend' }, currency(shown)), element('p', { className: 'muted' }, `of ${currency(session.budgetUsd)} authorized${observed !== undefined ? ` · ${currency(session.spentUsd)} settled` : ''}${session.costStatus === 'unknown' ? ` · ${currency(session.budgetUsd)} reserved` : ''}`), element('progress', { max: session.budgetUsd || 1, value: Math.min(shown, session.budgetUsd || 1), 'aria-label': 'Observed spending against authorized budget' }), element('div', { className: `cost-status cost-${session.costStatus}` }, statusText), costCurve(session), usageList(session), element('p', { className: 'footnote' }, session.costStatus === 'demo' ? 'This fixture verifies the workflow without using an LLM.' : session.costStatus === 'unknown' ? 'Unknown usage is never treated as zero.' : 'In-flight requests and delayed provider reports can affect final spending.'));
  if (user.role === 'admin' && !['completed', 'cancelled', 'exporting'].includes(session.status)) {
    if (budgetOpen) card.append(element('form', { id: 'budget-form', className: 'budget-form' }, element('label', { for: 'budget-amount' }, 'Additional amount · USD'), element('input', { id: 'budget-amount', type: 'number', min: '0.01', step: '0.01', required: true, disabled: pending }), element('div', { className: 'toolbar' }, element('button', { type: 'submit', className: 'primary', disabled: pending }, 'Authorize'), action('Cancel', 'budget-close', { className: 'quiet' }))));
    else card.append(action('Authorize more budget', 'budget-open', { className: 'quiet', disabled: !connected || pending }));
  }
  return card;
}

function approvalCard(session, writer) {
  const active = !finished(session);
  const isolated = isolatedPlacement(session.placement);
  const automatic = session.approval === 'auto';
  if (!automatic && !(active && isolated)) return null;
  const busy = !writer || !connected || pending;
  return element('section', { className: `card approval-card approval-${automatic ? 'auto' : 'manual'}`, 'aria-label': 'Tool approval' },
    element('div', { className: 'eyebrow' }, 'APPROVAL'),
    element('h2', {}, automatic ? 'Automatic for this session' : 'Every tool use asks you'),
    element('p', { className: 'muted' }, automatic ? 'Tool use inside the sandbox is approved without asking. Questions from the crew still wait for you.' : 'The workspace is isolated, so you can let the crew work unattended for the rest of this session.'),
    active && writer ? element('div', { className: 'toolbar' }, automatic ? action('Ask me again', 'approval', { className: 'quiet', 'data-approval': 'manual', disabled: busy }) : action('Approve automatically', 'approval', { 'data-approval': 'auto', disabled: busy })) : null);
}

function exploreUrl(observability, uid, query, queryType, range) {
  const grafana = observability.grafanaUrl.replace(/\/$/, '');
  const pane = { datasource: uid, queries: [{ refId: 'A', datasource: { uid }, ...(queryType ? { queryType } : {}), ...(queryType === 'traceql' ? { query } : { expr: query }) }], range };
  return `${grafana}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify({ v: pane }))}`;
}

function observabilityLinks(observability, session, request) {
  if (!observability || !observability.grafanaUrl) return [];
  const window = request ? [Date.parse(request.at) - 60000, Date.parse(request.at) + (request.durationMs || 0) + 60000] : session ? [Date.parse(session.runs.find(run => run.startedAt)?.startedAt || session.createdAt) - 60000, Date.parse(session.updatedAt) + 60000] : null;
  const range = window ? { from: String(window[0]), to: String(window[1]) } : { from: 'now-1h', to: 'now' };
  const fill = template => template.replace('{callId}', request?.callId || '').replace('{alias}', session ? `de-vloer-${session.id}` : '').replace('{sessionId}', session?.id || '');
  const links = [];
  if (observability.tracesDatasource) links.push(['Traces ↗', exploreUrl(observability, observability.tracesDatasource, fill(observability.traceQuery || '{ resource.service.name = "litellm" }'), 'traceql', range)]);
  if (observability.logsDatasource) links.push(['Logs ↗', exploreUrl(observability, observability.logsDatasource, fill(observability.logsQuery || 'k8s_namespace:"ai" AND k8s_container:"litellm"'), undefined, range)]);
  return links.map(([label, url]) => element('button', { className: 'link-button', type: 'button', 'data-open-url': url }, label));
}

function dashboardLinks(observability) {
  if (!observability || !observability.grafanaUrl || !observability.dashboards) return [];
  const names = { spend: 'Spend, budgets and savings', reliability: 'Latency and reliability', finops: 'FinOps' };
  const grafana = observability.grafanaUrl.replace(/\/$/, '');
  return Object.entries(observability.dashboards).map(([key, uid]) => element('button', { className: 'link-button', type: 'button', 'data-open-url': `${grafana}/d/${uid}` }, `${names[key] || key} ↗`));
}

function placementText(placement, host) {
  const here = !host || /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
  if (placement === 'docker') return here ? 'container on this machine' : `container on ${host.replace(/:\d+$/, '')}`;
  if (placement === 'kubernetes') return 'pod in the cluster';
  if (placement === 'local') return here ? 'working directory on this machine' : `working directory on ${host.replace(/:\d+$/, '')}`;
  return 'workbench workspace';
}

function gatewayTab(session, gateway, observability) {
  const requests = Array.isArray(session.requests) ? session.requests : [];
  if (!requests.length) return element('div', { className: 'empty-state' }, element('h3', {}, 'No gateway requests recorded yet'), element('p', {}, session.costStatus === 'demo' ? 'The demonstration runtime does not call a model gateway.' : 'Each model call the gateway attributes to this session appears here within fifteen seconds, with the provider that served it.'));
  const roleName = id => id === 'brief' ? 'Brief check' : session.runs.find(run => run.roleId === id)?.roleName || '';
  const totals = requests.reduce((sum, request) => ({ usd: sum.usd + (Number(request.usd) || 0), savings: sum.savings + (Number(request.savingsUsd) || 0), failures: sum.failures + (request.status === 'failure' ? 1 : 0) }), { usd: 0, savings: 0, failures: 0 });
  const providers = [...new Set(requests.map(request => request.provider).filter(Boolean))];
  const hosts = [...new Set(requests.map(request => request.host).filter(Boolean))];
  const tag = (text, bad) => element('span', { className: `tag${bad ? ' tag-error' : ''}` }, text);
  const flags = request => [
    request.violation ? tag(`outside policy: ${request.violation}`, true) : null,
    request.status === 'failure' ? tag('refused', true) : null,
    request.retries ? tag(`${request.retries} retr${request.retries === 1 ? 'y' : 'ies'}`) : null,
    request.fallbacks ? tag('fallback') : null,
    request.cacheHit ? tag('cache hit') : null,
    request.cachedTokens ? tag(`${request.cachedTokens} cached`) : null,
    ...(Array.isArray(request.guardrails) ? request.guardrails.map(name => tag(String(name))) : []),
  ];
  const small = (...children) => element('small', { className: 'muted' }, ...children);
  const rows = requests.map(request => element('tr', { className: request.status === 'failure' || request.violation ? 'row-failed' : '' },
    element('td', {}, clock(request.at)),
    element('td', {}, roleName(request.roleId)),
    element('td', {}, element('code', {}, String(request.model || '')), request.provider ? [element('br'), small(request.provider, request.host ? ` · ${request.host}` : '', request.geo ? ` · ${request.geo}` : '')] : null),
    element('td', {}, request.group ? [element('code', {}, request.group), request.tier ? [element('br'), small(String(request.tier).toLowerCase(), request.cause ? ` · ${String(request.cause).replaceAll('_', ' ')}` : '')] : null] : small('pinned')),
    element('td', {}, `${request.inputTokens ?? 0} in`, element('br'), small(`${request.outputTokens ?? 0} out`)),
    element('td', {}, currency(request.usd), request.savingsUsd ? [element('br'), small(`saved ${currency(request.savingsUsd)}`)] : null),
    element('td', {}, request.durationMs !== undefined ? `${(request.durationMs / 1000).toFixed(1)}s` : '—', request.firstTokenMs !== undefined ? [element('br'), small(`first token ${(request.firstTokenMs / 1000).toFixed(1)}s`)] : null),
    element('td', { className: 'flags' }, ...flags(request), request.error ? [element('br'), element('small', { className: 'tool-error' }, String(request.error))] : null, request.harness ? [element('br'), small(String(request.harness))] : null, observabilityLinks(observability, session, request).length ? [element('br'), element('span', { className: 'link-row' }, ...observabilityLinks(observability, session, request))] : null)));
  return element('div', { className: 'gateway' },
    element('dl', { className: 'gateway-summary' },
      fact('Gateway', element('code', {}, gateway || 'LiteLLM')),
      fact('Providers', providers.length ? providers.join(', ') : '—'),
      fact('Endpoints', hosts.length ? element('span', {}, ...hosts.flatMap((host, index) => index ? [element('br'), element('code', {}, host)] : [element('code', {}, host)])) : '—'),
      fact('Requests', `${requests.length}${totals.failures ? ` · ${totals.failures} refused` : ''}`),
      fact('Attributed cost', `${currency(totals.usd)}${totals.savings ? ` · router saved ${currency(totals.savings)}` : ''}`),
      ...((observabilityLinks(observability, session).length || dashboardLinks(observability).length) ? [fact('Observability', element('span', { className: 'link-row' }, ...observabilityLinks(observability, session), ...dashboardLinks(observability)))] : [])),
    element('div', { className: 'table-scroll' }, element('table', { className: 'gateway-table' },
      element('thead', {}, element('tr', {}, ...['Time', 'Role', 'Answered by', 'Route', 'Tokens', 'Cost', 'Latency', ''].map(label => element('th', {}, label)))),
      element('tbody', {}, ...rows))),
    element('p', { className: 'footnote' }, 'Rows are the gateway\u2019s own attribution for this session\u2019s credential. Costs settle after the run; the budget card shows the same figures.'));
}

function render() {
  if (!detail) return;
  const app = document.getElementById('app');
  const focused = document.activeElement?.id;
  const position = document.activeElement?.selectionStart;
  const scroll = window.scrollY;
  const tableScroll = [...document.querySelectorAll('.table-scroll')].map(node => node.scrollLeft);
  const stream = document.getElementById('stream');
  const atBottom = !stream || stream.scrollHeight - stream.scrollTop - stream.clientHeight < 40;
  const { session, user, mode, permissions, events, origin, freshness, gateway } = detail;
  const writer = user.role !== 'viewer';
  const mutable = writer && connected && !pending;
  const actionable = ['queued', 'running', 'exporting', 'waiting_input', 'paused', 'interrupted'].includes(session.status);
  const [headline, next] = situation(session);
  const requests = permissions.filter(request => !request.resolved);
  const diffs = session.artifacts.filter(artifact => artifact.kind === 'diff').length;
  const checks = session.artifacts.filter(artifact => artifact.kind === 'test').length;
  const requestCount = Array.isArray(session.requests) ? session.requests.length : 0;
  const host = (() => { try { return new URL(origin).host; } catch { return ''; } })();

  const header = element('header', { className: 'session-header' },
    element('div', { className: 'eyebrow' }, element('span', { className: 'brand-mark', 'aria-hidden': 'true' }, '▦'), 'DE VLOER', element('span', { className: 'remote-label' }, 'WORKBENCH SESSION'), host ? element('span', { className: 'remote-label' }, host) : null, element('span', { className: 'remote-label' }, placementText(session.placement, host).toUpperCase())),
    element('div', { className: 'title-row' }, element('h1', {}, session.title), element('span', { className: `pill status-${session.status}` }, session.status === 'completed' && session.review ? (session.review.decision === 'accepted' ? 'Accepted' : 'Rejected') : statusNames[session.status] || readable(session.status))),
    element('p', { className: 'subtitle' }, element('span', {}, session.repositoryId), ' / ', element('span', {}, session.crewId), ' · ', session.runtime, session.placement ? ` · ${session.placement}` : '', session.approval === 'auto' ? ' · approves automatically' : '', ' · ', element('code', {}, session.branch)),
    element('div', { className: `situation situation-${session.status}` }, element('p', { className: 'headline' }, headline), next ? element('p', { className: 'next' }, next) : null),
    element('div', { className: 'toolbar', 'aria-label': 'Session actions' },
      writer && session.status === 'queued' ? action('Start crew', 'start', { className: 'primary', disabled: !mutable }) : null,
      writer && session.status === 'completed' && !session.review ? action('Accept', 'review', { className: 'primary', 'data-decision': 'accepted' }) : null,
      writer && session.status === 'completed' && !session.review ? action('Reject…', 'review', { 'data-decision': 'rejected' }) : null,
      writer && ['running', 'waiting_input'].includes(session.status) ? action('Pause', 'pause', { disabled: !mutable }) : null,
      writer && ['paused', 'interrupted'].includes(session.status) ? action('Resume', 'resume', { className: 'primary', disabled: !mutable }) : null,
      requests.length ? action(`Review ${requests.length === 1 ? 'decision' : `${requests.length} decisions`}`, 'jump-decision', { className: session.status === 'waiting_input' ? 'primary' : '' }) : null,
      action('Refresh', 'refresh', { disabled: pending }), action('Open dashboard ↗', 'dashboard'), action('Copy link', 'copy-link', { className: 'quiet' }),
      safeHttps(session.sourceTask?.url || session.trackerUrl) ? action('Open task ↗', 'tracker', { className: 'quiet' }) : null,
      writer && actionable ? action('Cancel session', 'cancel', { className: 'quiet danger', disabled: !mutable }) : null));

  const notices = [];
  if (mode === 'demo') notices.push(element('div', { className: 'notice demo' }, element('strong', {}, 'Demonstration'), 'Real fixture changes and checks. No AI calls or model spending.'));
  if (!connected) notices.push(element('div', { className: 'notice warning', role: 'status' }, element('strong', {}, 'Disconnected'), connectionMessage, ` Showing the state observed at ${clock(freshness.observedAt)}.`));
  const failure = failureNotice(session);
  if (failure) notices.push(failure);
  const decisionSection = requests.length ? element('section', { className: 'decisions', id: 'decisions', 'aria-label': 'Decisions waiting for you' }, element('div', { className: 'section-heading' }, element('h2', {}, requests.length === 1 ? 'Your decision' : `${requests.length} decisions waiting`), element('span', {}, 'Nothing continues until you answer')), ...requests.map(request => decisionCard(request, session, mutable))) : null;

  const nav = element('div', { className: 'tabs', role: 'tablist', 'aria-label': 'Session information' }, ...tabs.map(value => action('', 'tab', { id: `tab-${value}`, 'data-tab': value, role: 'tab', 'aria-controls': 'tab-content', 'aria-selected': tab === value, tabindex: tab === value ? '0' : '-1', className: tab === value ? 'selected' : '' }, value === 'changes' ? ['Changes', diffs ? element('span', { className: 'count' }, String(diffs)) : null] : value === 'checks' ? ['Checks', checks ? element('span', { className: 'count' }, String(checks)) : null] : value === 'gateway' ? ['Gateway', requestCount ? element('span', { className: 'count' }, String(requestCount)) : null] : value[0].toUpperCase() + value.slice(1))));
  const content = tab === 'brief' ? briefTab(session) : tab === 'changes' ? changesTab(session) : tab === 'checks' ? checksTab(session) : tab === 'gateway' ? gatewayTab(session, gateway, detail.observability) : activityTab(session, events);
  const main = element('div', { className: 'main-column' },
    element('section', { className: 'crew-section' }, element('div', { className: 'section-heading' }, element('h2', {}, 'Your crew'), element('span', {}, `Sequential roles · ${placementText(session.placement, host)}`)), crewStrip(session)),
    nav, element('div', { id: 'tab-content', role: 'tabpanel', 'aria-labelledby': `tab-${tab}`, className: 'tab-content' }, content),
    composer(session, writer));

  const freshnessText = !connected ? `Disconnected · last observed ${clock(freshness.observedAt)}` : freshness.transport === 'live' ? `Live · observed ${clock(freshness.observedAt)}` : `Polling · observed ${clock(freshness.observedAt)}`;
  const side = element('aside', { className: 'side-column', 'aria-label': 'Session context' },
    approvalCard(session, writer),
    budgetCard(session, user),
    element('section', { className: 'card context-card' }, element('h2', {}, 'Session context'), element('dl', {}, fact('Operator', session.ownerName), fact('Branch', element('code', {}, session.branch)), fact('Runtime', session.runtime), session.placement ? fact('Placement', session.placement) : null, session.approval ? fact('Approval', session.approval === 'auto' ? 'automatic inside the sandbox' : 'asks before each tool') : null, session.model ? fact('Model', element('code', {}, session.model)) : null, fact('Created', `${new Date(session.createdAt).toLocaleString()}`), fact('Last server change', `${ago(session.updatedAt)} · ${clock(session.updatedAt)}`), fact('Session', element('code', { className: 'session-id' }, session.id)))),
    element('p', { className: 'local-note' }, 'Your laptop is the control surface. The server owns execution, history and workspace resources.'));

  app.replaceChildren(header, ...notices, ...(decisionSection ? [decisionSection] : []), element('div', { className: 'session-layout' }, main, side), element('footer', {}, element('span', { className: connected ? (freshness.transport === 'live' ? 'live-dot' : 'connected-dot') : 'offline-dot', 'aria-hidden': 'true' }), element('span', { id: 'freshness' }, freshnessText), element('span', { className: 'session-id' }, session.id)));

  if (focusTarget) {
    const target = focusTarget.requestId ? document.getElementById(`decision-${focusTarget.requestId}`) : focusTarget.runId ? document.getElementById(`run-${focusTarget.runId}`) : requests.length && focusTarget.decisions ? document.getElementById('decisions') : null;
    focusTarget = null;
    if (target) { target.scrollIntoView({ block: 'start' }); (target.querySelector('button:not(:disabled), input, textarea') || target).focus({ preventScroll: true }); return; }
  }
  if (focused) {
    const restore = document.getElementById(focused);
    restore?.focus({ preventScroll: true });
    if (typeof position === 'number' && restore?.setSelectionRange) try { restore.setSelectionRange(position, position); } catch {}
  }
  window.scrollTo(0, scroll);
  [...document.querySelectorAll('.table-scroll')].forEach((node, index) => { if (tableScroll[index]) node.scrollLeft = tableScroll[index]; });
  const nextStream = document.getElementById('stream');
  if (nextStream) nextStream.scrollTop = follow && atBottom ? nextStream.scrollHeight : stream?.scrollTop || 0;
}

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const type = button.dataset.action;
  if (type === 'tab') { tab = button.dataset.tab; remember(); render(); return; }
  if (type === 'filter') { activityFilter = button.dataset.filter; remember(); render(); return; }
  if (type === 'jump-decision') { focusTarget = { decisions: true }; render(); return; }
  if (type === 'review') { bridge.postMessage({ type: 'review', decision: button.dataset.decision }); return; }
  if (type === 'budget-open') { budgetOpen = true; render(); document.getElementById('budget-amount')?.focus(); return; }
  if (type === 'budget-close') { budgetOpen = false; render(); return; }
  if (type === 'edit-answer') { confirming.delete(button.dataset.id); render(); return; }
  if (type === 'answer') {
    const request = detail?.permissions.find(item => item.id === button.dataset.id);
    if (!request) return;
    const state = decisionState(request);
    pending = true; confirming.delete(request.id); render();
    bridge.postMessage({ type: 'answer', id: request.id, answers: state.answers.map(answer => [...answer.selected, ...(answer.custom.trim() ? [answer.custom.trim()] : [])]) });
    return;
  }
  if (type === 'decide') { pending = true; render(); bridge.postMessage({ type: 'decide', id: button.dataset.id, decision: button.dataset.decision }); return; }
  if (type === 'approval') { pending = true; render(); bridge.postMessage({ type: 'approval', approval: button.dataset.approval }); return; }
  if (['start', 'pause', 'resume', 'cancel'].includes(type)) { pending = true; render(); }
  bridge.postMessage({ type, ...(button.dataset.id ? { id: button.dataset.id } : {}), ...(button.dataset.format ? { format: button.dataset.format } : {}), ...(button.dataset.file ? { file: button.dataset.file } : {}) });
});

document.addEventListener('toggle', event => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.dataset.run) return;
  if (details.open) { openRuns.add(details.dataset.run); openRuns.delete(`closed:${details.dataset.run}`); } else { openRuns.delete(details.dataset.run); openRuns.add(`closed:${details.dataset.run}`); }
  const summary = details.querySelector('summary');
  if (summary) summary.textContent = details.open ? 'Hide findings' : 'Read findings';
}, true);

document.addEventListener('keydown', event => {
  if (event.target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const index = tabs.indexOf(tab);
    tab = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    remember(); render(); document.getElementById(`tab-${tab}`).focus();
  }
  if (event.target.id === 'instruction' && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); document.getElementById('instruction-form')?.requestSubmit(); }
});

document.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'instruction') {
    draft = target.value;
    if (['saved', 'unknown', 'failed', 'idle'].includes(instruction.state)) instruction = { state: draft.trim() ? 'draft' : 'idle', message: '', at: '' };
    remember();
    const button = document.querySelector('#instruction-form button[type="submit"]');
    if (button) button.disabled = !draft.trim() || !connected || pending;
    const state = document.getElementById('instruction-state');
    if (state && instruction.state === 'draft') { state.textContent = 'Draft on this device. Nothing is sent until you choose Send.'; state.className = 'instruction-state state-draft'; }
    return;
  }
  if (target.dataset.custom !== undefined) {
    const request = detail?.permissions.find(item => item.id === target.closest('[data-form="question"]')?.dataset.id);
    if (!request) return;
    decisionState(request).answers[Number(target.dataset.custom)].custom = target.value;
    const submit = target.closest('form')?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = pending || !decisionState(request).answers.every(answer => answer.selected.length || answer.custom.trim());
  }
});

document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'follow') { follow = target.checked; return; }
  if (target.id === 'pause-first') { pauseFirst = target.checked; render(); return; }
  if (target.dataset.question !== undefined) {
    const form = target.closest('[data-form="question"]');
    const request = detail?.permissions.find(item => item.id === form?.dataset.id);
    if (!request) return;
    const index = Number(target.dataset.question);
    const answer = decisionState(request).answers[index];
    answer.selected = [...form.querySelectorAll(`input[data-question="${index}"]:checked`)].map(input => input.value);
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = pending || !decisionState(request).answers.every(item => item.selected.length || item.custom.trim());
  }
});

document.addEventListener('submit', event => {
  const form = event.target;
  event.preventDefault();
  if (form.id === 'instruction-form') {
    if (!draft.trim() || !connected || pending || instruction.state === 'sending') return;
    instruction = { state: 'sending', message: '', at: '' };
    render();
    bridge.postMessage({ type: 'instruction', text: draft, pauseFirst });
    return;
  }
  if (form.id === 'budget-form') {
    const amount = Number(form.querySelector('#budget-amount')?.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    pending = true; budgetOpen = false; render();
    bridge.postMessage({ type: 'budget', amountUsd: amount });
    return;
  }
  if (form.dataset.form === 'question') { confirming.add(form.dataset.id); render(); document.querySelector(`#decision-${form.dataset.id} button.primary`)?.focus(); }
});

window.addEventListener('message', event => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'session') {
    const previous = detail;
    detail = message.detail; connected = true; connectionMessage = '';
    const key = JSON.stringify({ session: detail.session, permissions: detail.permissions, events: detail.events.length, last: detail.events.at(-1)?.id, user: detail.user, origin: detail.origin });
    if (previous && key === lastRenderKey && !message.focus) { const badge = document.getElementById('freshness'); if (badge) badge.textContent = `${detail.freshness.transport === 'live' ? 'Live' : 'Polling'} · observed ${clock(detail.freshness.observedAt)}`; return; }
    lastRenderKey = key;
    if (message.focus) focusTarget = { tab: message.focus.tab, requestId: message.focus.requestId, runId: message.focus.runId, decisions: Boolean(message.focus.requestId) };
    if (message.focus?.tab && tabs.includes(message.focus.tab) && !message.focus.requestId) { tab = message.focus.tab; remember(); }
    for (const id of [...decisions.keys()]) if (!detail.permissions.some(request => request.id === id && !request.resolved)) { decisions.delete(id); confirming.delete(id); }
    render();
    if (previous && detail.permissions.filter(request => !request.resolved).length > previous.permissions.filter(request => !request.resolved).length) announce('The crew is waiting for your decision.');
    else if (previous && previous.session.status !== detail.session.status) announce(`Session is now ${statusNames[detail.session.status] || detail.session.status}.`);
  } else if (message.type === 'connection') { connected = message.connected; connectionMessage = message.message || ''; if (message.freshness && detail) detail.freshness = message.freshness; render(); }
  else if (message.type === 'focus') { focusTarget = { tab: message.tab, requestId: message.requestId, runId: message.runId, decisions: Boolean(message.requestId) }; if (message.tab && tabs.includes(message.tab) && !message.requestId) tab = message.tab; remember(); render(); }
  else if (message.type === 'instruction') {
    if (message.state === 'saved') { draft = ''; pauseFirst = false; instruction = { state: 'saved', message: '', at: clock(new Date().toISOString()) }; announce('Instruction saved for the next execution.'); }
    else instruction = { state: message.state === 'unknown' ? 'unknown' : 'failed', message: message.message || '', at: '' };
    remember(); render();
  } else if (message.type === 'idle') { pending = false; render(); }
});

remember();
bridge.postMessage({ type: 'ready' });

document.addEventListener('click', event => { const link = event.target.closest('[data-open-url]'); if (link) bridge.postMessage({ type: 'open-url', url: link.dataset.openUrl }); });
