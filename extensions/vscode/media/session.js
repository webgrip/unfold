const bridge = acquireVsCodeApi();
const saved = bridge.getState() || {};
let detail;
let tab = saved.tab || 'work';
let draft = saved.draft || '';
let connected = true;
let connectionMessage = '';
let pending = false;

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (name === 'className') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name === 'disabled') node.disabled = Boolean(value);
    else node.setAttribute(name, String(value));
  }
  for (const child of children.flat()) if (child !== undefined && child !== null) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function action(label, type, attributes = {}) {
  return element('button', { type: 'button', 'data-action': type, ...attributes }, label);
}

function currency(value) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value); }
function readable(value) { return String(value).replaceAll('_', ' ').replaceAll('.', ' · '); }
function time(value) { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function remember() { bridge.setState({ tab, draft }); }
function labelValue(label, value) { return element('div', { className: 'fact' }, element('dt', {}, label), element('dd', {}, value)); }

function render() {
  if (!detail) return;
  const app = document.getElementById('app');
  const focused = document.activeElement?.id;
  const position = document.activeElement?.selectionStart;
  const scroll = window.scrollY;
  const { session, user, mode, permissions, events } = detail;
  const writer = user.role !== 'viewer';
  const mutable = writer && connected && !pending;
  const actionable = ['queued', 'running', 'waiting_input', 'paused', 'interrupted'].includes(session.status);
  const header = element('header', { className: 'session-header' },
    element('div', { className: 'eyebrow' }, element('span', { className: 'brand-mark', 'aria-hidden': 'true' }, '▦'), 'DE VLOER', element('span', { className: 'remote-label' }, 'REMOTE SESSION')),
    element('div', { className: 'title-row' }, element('h1', {}, session.title), element('span', { className: `pill status-${session.status}` }, readable(session.status))),
    element('p', { className: 'subtitle' }, session.repositoryId, ' / ', session.crewId, ' · ', session.runtime),
    element('div', { className: 'toolbar', 'aria-label': 'Session actions' },
      ...(writer && session.status === 'queued' ? [action('Start remote crew', 'start', { className: 'primary', disabled: !mutable })] : []),
      ...(writer && ['running', 'waiting_input'].includes(session.status) ? [action('Pause', 'pause', { disabled: !mutable })] : []),
      ...(writer && ['paused', 'interrupted'].includes(session.status) ? [action('Resume', 'resume', { className: 'primary', disabled: !mutable })] : []),
      action('Refresh', 'refresh', { disabled: pending }), action('Open dashboard ↗', 'dashboard'),
      ...(writer && actionable ? [action('Cancel session', 'cancel', { className: 'quiet danger', disabled: !mutable })] : []),
    ),
  );
  const notices = [];
  if (mode === 'demo') notices.push(element('div', { className: 'notice demo' }, element('strong', {}, 'Demonstration'), 'Real fixture changes and checks. No AI calls or model spending.'));
  if (!connected) notices.push(element('div', { className: 'notice warning', role: 'status' }, element('strong', {}, 'Disconnected'), connectionMessage, ' Displaying the last received state.'));
  if (session.failure) notices.push(element('div', { className: 'notice warning execution-failure', role: 'status' },
    element('strong', {}, 'Execution needs attention'),
    element('p', { className: 'preserve' }, session.failure.message),
    element('p', { className: 'preserve' }, session.failure.remediation),
    ...(session.failure.promptAcceptance === 'unknown' ? [element('p', { className: 'muted' }, 'Submission outcome unconfirmed · no automatic retry.')] : []),
  ));
  else if (session.blocker) notices.push(element('div', { className: 'notice warning' }, element('strong', {}, 'Decision needed'), session.blocker));
  const requests = permissions.filter(request => !request.resolved);
  for (const request of requests) notices.push(element('div', { className: 'permission-card' }, element('div', {}, element('div', { className: 'eyebrow' }, request.kind === 'question' ? 'CREW QUESTION' : 'PERMISSION REQUEST'), element('h2', {}, request.title), element('p', {}, request.detail)), action('Review request', 'permission', { 'data-id': request.id, className: 'primary', disabled: !mutable })));

  const nav = element('div', { className: 'tabs', role: 'tablist', 'aria-label': 'Session information' }, ...['work', 'evidence', 'activity'].map(value => action(`${value === 'evidence' ? `Evidence (${session.artifacts.length})` : value[0].toUpperCase() + value.slice(1)}`, 'tab', { id: `tab-${value}`, 'data-tab': value, role: 'tab', 'aria-controls': 'tab-content', 'aria-selected': tab === value, tabindex: tab === value ? '0' : '-1', className: tab === value ? 'selected' : '' })));
  let content;
  if (tab === 'work') {
    content = element('div', { className: 'work-content' },
      element('section', { className: 'objective' }, element('h2', {}, 'The outcome'), element('p', { className: 'preserve' }, session.objective)),
      element('section', {}, element('div', { className: 'section-heading' }, element('h2', {}, 'Your crew'), element('span', {}, 'Sequential roles · remote execution')),
        element('ol', { className: 'crew' }, ...session.runs.map((run, index) => element('li', { className: `run run-${run.status}` },
          element('div', { className: 'run-number', 'aria-hidden': 'true' }, run.status === 'completed' ? '✓' : String(index + 1)),
          element('div', { className: 'run-content' }, element('div', { className: 'run-heading' }, element('h3', {}, run.roleName), element('span', { className: 'pill small' }, readable(run.status))), element('p', { className: 'muted' }, run.mode === 'write' ? 'Implementation' : 'Independent review'), ...(run.summary ? [element('p', { className: 'preserve' }, run.summary)] : []), ...(run.verdict ? [element('span', { className: `verdict verdict-${run.verdict}` }, `Review: ${readable(run.verdict)}`)] : [])),
        ))),
        ...(!session.runs.length ? [element('p', { className: 'empty' }, 'The crew is ready. Starting this session creates its remote runs.')] : []),
      ),
    );
  } else if (tab === 'evidence') {
    content = element('section', {}, element('div', { className: 'section-heading' }, element('h2', {}, 'Reviewable evidence'), element('span', {}, 'Read-only editor documents')),
      ...(!session.artifacts.length ? [element('div', { className: 'empty-state' }, element('h3', {}, 'Evidence will appear here'), element('p', {}, 'The crew returns repository changes, actual checks and a handoff as it works.'))] : []),
      element('div', { className: 'evidence-list' }, ...session.artifacts.map(artifact => action('', 'artifact', { className: 'artifact', 'data-id': artifact.id, 'aria-label': `Open ${artifact.kind}: ${artifact.name}` })).map((button, index) => {
        const artifact = session.artifacts[index];
        button.append(element('span', { className: `artifact-type type-${artifact.kind}` }, artifact.kind === 'diff' ? '±' : artifact.kind === 'test' ? '✓' : '≡'), element('span', { className: 'artifact-label' }, element('strong', {}, artifact.name), element('span', {}, `${readable(artifact.kind)} · retained server evidence`)), element('span', { 'aria-hidden': 'true' }, '↗'));
        return button;
      })),
      element('p', { className: 'footnote' }, 'Opening a diff displays the retained patch. Applying it to your local checkout or publishing a merge request requires a separate workflow.'),
    );
  } else {
    content = element('section', {}, element('div', { className: 'section-heading' }, element('h2', {}, 'Durable activity'), action('Open complete history', 'history', { className: 'quiet' })),
      element('p', { className: 'footnote' }, `Showing the latest ${events.length} retained events. New events are read from the server without restarting any work.`),
      element('ol', { className: 'events' }, ...events.slice().reverse().map(event => {
        const payload = event.data.text ?? event.data.message ?? event.data.summary ?? event.data.reason;
        const summary = typeof payload === 'string' ? payload.slice(0, 3000) : '';
        return element('li', { className: 'event' }, element('div', { className: 'event-head' }, element('strong', {}, readable(event.type)), element('time', { datetime: event.at }, time(event.at))), element('span', { className: 'muted' }, `${event.actor} · event ${event.id}`), ...(summary ? [element('p', { className: 'preserve' }, summary)] : []));
      })),
    );
  }
  const main = element('div', { className: 'main-column' }, nav, element('div', { id: 'tab-content', role: 'tabpanel', 'aria-labelledby': `tab-${tab}`, className: 'tab-content' }, content));
  if (writer && !['completed', 'cancelled'].includes(session.status)) {
    const textarea = element('textarea', { id: 'instruction', rows: '4', maxlength: '16000', placeholder: 'Clarify the outcome, add a constraint or steer the next execution…', 'aria-describedby': 'instruction-help', disabled: !connected });
    textarea.value = draft;
    main.append(element('form', { id: 'instruction-form', className: 'composer' }, element('label', { for: 'instruction' }, 'Steer the crew'), textarea, element('div', { className: 'composer-footer' }, element('p', { id: 'instruction-help' }, 'Saved for the next execution. Pause and resume to apply a change to an active run.'), element('button', { type: 'submit', className: 'primary', disabled: !mutable || !draft.trim() }, pending ? 'Saving…' : 'Send instruction'))));
  }
  const side = element('aside', { className: 'side-column', 'aria-label': 'Session context' },
    element('section', { className: 'budget-card' }, element('div', { className: 'eyebrow' }, 'OBSERVED SPEND'), element('p', { className: 'spend' }, currency(session.spentUsd)), element('p', { className: 'muted' }, `of ${currency(session.budgetUsd)} authorized`), element('progress', { max: session.budgetUsd, value: Math.min(session.spentUsd, session.budgetUsd), 'aria-label': 'Observed spending against authorized budget' }), element('div', { className: `cost-status cost-${session.costStatus}` }, session.costStatus === 'demo' ? 'Demo · no AI calls' : session.costStatus === 'settled' ? 'Spend reconciled' : session.costStatus === 'unknown' ? 'Spend unavailable · reservation retained' : 'Settlement pending'), element('p', { className: 'footnote' }, session.costStatus === 'demo' ? 'This fixture verifies the workflow without using an LLM.' : 'In-flight requests and delayed provider reports can affect final spending.')),
    element('section', { className: 'context-card' }, element('h2', {}, 'Session context'), element('dl', {}, labelValue('Operator', session.ownerName), labelValue('Branch', session.branch), labelValue('Runtime', session.runtime), labelValue('Created', new Date(session.createdAt).toLocaleString()), labelValue('Last server change', new Date(session.updatedAt).toLocaleString()))),
    element('p', { className: 'local-note' }, 'Your laptop is the control surface. The server owns execution, history and workspace resources.'),
  );
  app.replaceChildren(header, ...notices, element('div', { className: 'session-layout' }, main, side), element('footer', {}, element('span', { className: connected ? 'connected-dot' : 'offline-dot', 'aria-hidden': 'true' }), connected ? 'Connected · refreshes every few seconds' : 'Disconnected', element('span', { className: 'session-id' }, session.id)));
  if (focused) {
    const restore = document.getElementById(focused);
    restore?.focus({ preventScroll: true });
    if (typeof position === 'number' && restore?.setSelectionRange) restore.setSelectionRange(position, position);
  }
  window.scrollTo(0, scroll);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const type = button.dataset.action;
  if (type === 'tab') { tab = button.dataset.tab; remember(); render(); return; }
  if (['start', 'pause', 'resume', 'cancel', 'permission'].includes(type)) { pending = true; render(); }
  bridge.postMessage({ type, ...(button.dataset.id ? { id: button.dataset.id } : {}) });
});

document.addEventListener('keydown', event => {
  if (event.target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const tabs = ['work', 'evidence', 'activity'];
    const index = tabs.indexOf(tab);
    tab = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : tabs[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
    remember(); render(); document.getElementById(`tab-${tab}`).focus();
  }
  if (event.target.id === 'instruction' && (event.ctrlKey || event.metaKey) && event.key === 'Enter') document.getElementById('instruction-form')?.requestSubmit();
});

document.addEventListener('input', event => {
  if (event.target.id !== 'instruction') return;
  draft = event.target.value;
  remember();
  const button = document.querySelector('#instruction-form button[type="submit"]');
  if (button) button.disabled = !draft.trim() || !connected || pending;
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'instruction-form') return;
  event.preventDefault();
  if (!draft.trim() || !connected || pending) return;
  pending = true; render(); bridge.postMessage({ type: 'instruction', text: draft });
});

window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'session') { detail = message.detail; connected = true; connectionMessage = ''; render(); }
  else if (message.type === 'connection') { connected = message.connected; connectionMessage = message.message; render(); }
  else if (message.type === 'instruction-saved') { draft = ''; pending = false; remember(); render(); document.getElementById('announcement').textContent = 'Instruction saved for the next execution.'; }
  else if (message.type === 'idle') { pending = false; render(); }
});

bridge.postMessage({ type: 'ready' });
