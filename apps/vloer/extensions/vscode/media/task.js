const bridge = acquireVsCodeApi();
const saved = bridge.getState() || {};
const taskKey = document.body.dataset.taskKey || saved.taskKey || '';
let view;
let team = saved.team || '';
let busy = '';
let problem = '';
let connected = true;

const providerNames = { vikunja: 'Vikunja', forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', demo: 'Demo' };
const stateNames = { ingested: 'Received', queued: 'Queued', leased: 'In execution', awaiting_review: 'Awaiting review', needs_human: 'Needs a human', done: 'Done', stale: 'Stale', withdrawn: 'Taken back', proposed: 'Proposed' };
const settled = ['done', 'withdrawn', 'stale'];
const priorities = ['', 'Low', 'Medium', 'High', 'Urgent', 'Do now'];

function remember() { bridge.setState({ taskKey, team }); }
function providerName(provider) { return providerNames[provider] || provider; }
function when(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); }
function currentItem(status) { return status.workItems.find(item => !settled.includes(item.state)) || status.workItems[0]; }

/** The one-line answer to "is Glide working on this, and what happens next?" for the current view. */
function ploegSituation(current) {
  const status = current.status;
  const task = current.task;
  if (!status.available) return { tone: 'muted', headline: status.message || 'Ploeg status is unavailable.', next: '' };
  const item = currentItem(status);
  if (item && !settled.includes(item.state)) {
    switch (item.state) {
      case 'queued': case 'ingested': return { tone: 'active', headline: `Queued for team ${item.team}.`, next: `Ploeg starts it when a ${item.team} worker is free. You can take it back until then.` };
      case 'leased': return { tone: 'active', headline: `Team ${item.team} is working on it.`, next: `Attempt ${item.attempts || 1}. Follow the runs in the Ploeg workbench.` };
      case 'awaiting_review': return { tone: 'good', headline: 'A pull request is waiting for your review.', next: 'Ploeg finished its work. Review and merge it on the forge, or request changes there.' };
      case 'needs_human': return { tone: 'warn', headline: `Team ${item.team} stopped and needs a human.`, next: 'Open it in the Ploeg workbench to read why, then decide how to continue.' };
      case 'proposed': return { tone: 'warn', headline: 'Ploeg proposed this as follow-up work.', next: 'Approve or reject it in the Ploeg view.' };
      default: return { tone: 'active', headline: `${stateNames[item.state] || item.state} in team ${item.team}.`, next: '' };
    }
  }
  if (status.assignedTeams.length) return { tone: 'active', headline: `Assigned to ${status.assignedTeams.join(', ')}. Waiting for Ploeg to queue it…`, next: 'Ploeg normally queues an assigned task within seconds. If this stays, check the board webhook and routing in Ploeg.' };
  if (item?.state === 'done') return { tone: 'good', headline: `Done by team ${item.team}.`, next: task.status === 'open' ? 'The task is still open in the tracker. Hand it over again if more work is needed.' : '' };
  if (item?.state === 'withdrawn') return { tone: 'muted', headline: `Taken back from team ${item.team}.`, next: 'Hand it over again when it is ready.' };
  if (task.status !== 'open') return { tone: 'muted', headline: 'This task is closed in the tracker.', next: 'Reopen it there before handing it to Ploeg.' };
  return { tone: 'idle', headline: 'Not with Ploeg yet.', next: 'Choose a team to hand it over. Ploeg works on a branch and opens a pull request for your review; nothing merges without you.' };
}

function canHandOff(current) {
  const status = current.status;
  const item = currentItem(status);
  return status.available && status.handoff.allowed && current.task.status === 'open' && !status.assignedTeams.length && (!item || settled.includes(item.state)) && status.teams.length > 0;
}

function header(current) {
  const task = current.task;
  const meta = [
    element('span', { className: `chip state-${task.status}` }, task.status === 'open' ? 'Open' : task.status === 'closed' ? 'Closed' : 'Unknown'),
    task.identifier || `#${task.id}`,
    task.updatedAt ? `updated ${ago(task.updatedAt)}` : '',
    task.priority ? `priority ${priorities[task.priority] || task.priority}` : '',
    task.dueAt ? `due ${when(task.dueAt)}` : '',
  ].filter(Boolean);
  return element('header', { className: 'task-header' },
    element('div', { className: 'eyebrow' }, element('span', { className: 'brand-mark' }, brandMark()), [providerName(task.provider), current.source.name, current.repositoryName !== current.source.name ? `→ ${current.repositoryName}` : ''].filter(Boolean).join(' · ').replace(' · →', ' →').toUpperCase()),
    element('div', { className: 'title-row' },
      element('h1', {}, task.title),
      element('div', { className: 'toolbar' },
        action('Refresh', 'refresh', { className: 'quiet', disabled: Boolean(busy), title: 'Reload the task and its Ploeg status' }),
        task.url ? action(`Open in ${providerName(task.provider)} ↗`, 'open-tracker', { title: task.url }) : null)),
    element('div', { className: 'task-meta' }, ...meta.flatMap((part, index) => index ? [element('span', { className: 'dot', 'aria-hidden': 'true' }, '·'), part] : [part])),
    people(task));
}

function swatch(color) {
  const node = element('i', { className: 'swatch', 'aria-hidden': 'true' });
  if (/^#?[0-9a-f]{6}$/i.test(color || '') && node.style) node.style.background = color.replace(/^#?/, '#');
  return node;
}

function people(task) {
  const labels = task.labels || [];
  const assignees = task.assignees || [];
  if (!labels.length && !assignees.length) return element('p', { className: 'task-people muted' }, 'Unassigned · no labels');
  return element('div', { className: 'task-people' },
    labels.length ? element('div', { className: 'labels', 'aria-label': 'Labels' }, ...labels.map(label => element('span', { className: 'label' }, swatch(label.color), label.name))) : null,
    element('div', { className: 'assignees muted' }, assignees.length ? `Assigned to ${assignees.map(person => person.name && person.name !== person.username ? `${person.name} (${person.username})` : person.username).join(', ')}` : 'Unassigned'));
}

function workItemRow(item) {
  return element('li', { className: `work-item state-${item.state}` },
    element('span', { className: `chip chip-${item.state}` }, stateNames[item.state] || item.state),
    element('span', { className: 'work-team' }, `team ${item.team}`),
    item.attempts ? element('span', { className: 'muted' }, `${item.attempts} ${item.attempts === 1 ? 'attempt' : 'attempts'}`) : null,
    typeof item.spentUsd === 'number' ? element('span', { className: 'muted' }, `${currency(item.spentUsd)}${typeof item.budgetUsd === 'number' ? ` of ${currency(item.budgetUsd)}` : ''} spent`) : null,
    element('span', { className: 'muted' }, `updated ${ago(item.updatedAt)}`),
    element('span', { className: 'work-actions' },
      safeHttps(item.prUrl) ? element('button', { type: 'button', className: item.state === 'awaiting_review' ? 'primary' : 'link-button', 'data-open-url': safeHttps(item.prUrl) }, item.state === 'awaiting_review' ? 'Review pull request ↗' : 'Pull request ↗') : null,
      action('Open in Ploeg ↗', 'open-ploeg', { className: 'link-button', 'data-id': item.id })));
}

function teamPicker(current) {
  const teams = current.status.teams;
  if (!teams.some(entry => entry.id === team)) team = teams.find(entry => entry.id === current.preferredTeam)?.id || teams.find(entry => !entry.paused)?.id || teams[0]?.id || '';
  const chosen = teams.find(entry => entry.id === team);
  return element('form', { className: 'handoff', id: 'handoff-form' },
    element('fieldset', {},
      element('legend', {}, 'Hand to Ploeg'),
      element('div', { className: 'teams', role: 'radiogroup' }, ...teams.map(entry => element('label', { className: `team-option${entry.id === team ? ' selected' : ''}` },
        element('input', { type: 'radio', name: 'team', value: entry.id, checked: entry.id === team, disabled: Boolean(busy) }),
        element('span', { className: 'team-body' },
          element('strong', {}, entry.id, entry.paused ? element('span', { className: 'tag' }, 'paused') : null),
          element('span', { className: 'muted' }, `${entry.roles.length ? entry.roles.join(' → ') : 'no roles'} · ${entry.queueDepth} queued`)))))),
    element('div', { className: 'toolbar' },
      element('button', { type: 'submit', className: 'primary', disabled: Boolean(busy) || !chosen }, busy === 'handoff' ? 'Handing over…' : chosen ? `Hand to ${chosen.id}` : 'Choose a team'),
      chosen ? element('span', { className: 'muted small' }, `Assigns “${chosen.assignee}” in ${providerName(current.task.provider)} and comments that you handed it over.`) : null));
}

function ploegCard(current) {
  const status = current.status;
  const situation = ploegSituation(current);
  const item = currentItem(status);
  const takeBack = status.available && status.handoff.allowed && status.assignedTeams.length && (!item || ['queued', 'ingested'].includes(item.state) || settled.includes(item.state));
  return element('section', { className: 'card ploeg-card', 'aria-labelledby': 'ploeg-heading' },
    element('div', { className: 'section-heading' }, element('h2', { id: 'ploeg-heading' }, 'Glide'), element('span', {}, status.demo ? 'Demo · no model calls or spend' : status.fetchedAt ? `checked ${clock(status.fetchedAt)}` : '')),
    element('div', { className: `situation tone-${situation.tone}`, role: 'status' }, element('p', { className: 'headline' }, situation.headline), situation.next ? element('p', { className: 'next' }, situation.next) : null),
    status.workItems.length ? element('ul', { className: 'work-items' }, ...status.workItems.map(workItemRow)) : null,
    canHandOff(current) ? teamPicker(current) : null,
    !canHandOff(current) && status.available && !status.handoff.allowed && status.handoff.reason && !item ? element('p', { className: 'muted small' }, status.handoff.reason) : null,
    element('div', { className: 'toolbar secondary-actions' },
      takeBack ? status.assignedTeams.map(name => action(busy === 'take-back' ? 'Taking back…' : `Take back from ${name}`, 'take-back', { 'data-team': name, disabled: Boolean(busy) })) : null,
      current.session.allowed ? action('Start a supervised session', 'start-session', { className: 'quiet', disabled: Boolean(busy), title: 'Set up an operator-led session from this task instead' }) : null));
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!view) { app.replaceChildren(element('div', { className: 'loading', role: 'status' }, problem || 'Loading the task…')); return; }
  const task = view.task;
  const description = task.descriptionMarkdown ?? task.description;
  app.replaceChildren(...[
    !connected ? element('div', { className: 'notice warning', role: 'status' }, element('strong', {}, 'Offline'), 'Showing the last loaded state. Reconnect to the workbench to act on it.') : null,
    problem ? element('div', { className: 'notice warning', role: 'alert' }, element('strong', {}, 'Could not complete that'), problem) : null,
    header(view),
    ploegCard(view),
    element('section', { className: 'card description', 'aria-labelledby': 'description-heading' },
      element('div', { className: 'section-heading' }, element('h2', { id: 'description-heading' }, 'Description'), element('span', {}, task.descriptionTruncated ? 'shortened · open the tracker for the full text' : '')),
      description.trim() ? markdown(description) : element('p', { className: 'muted' }, 'No description.')),
    element('footer', {}, `Fetched ${clock(view.loadedAt)} from ${view.host}`, element('span', { className: 'session-id', title: 'Tracker revision this view was built from' }, `rev ${task.revision.slice(0, 10)}`))].filter(Boolean));
}

document.addEventListener('click', event => {
  const link = event.target.closest('[data-open-url]');
  if (link) { bridge.postMessage({ type: 'open-url', url: link.dataset.openUrl }); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const type = button.dataset.action;
  if (type === 'take-back' || type === 'start-session') busy = type;
  if (type === 'take-back' || type === 'start-session') render();
  bridge.postMessage({ type, id: button.dataset.id, team: button.dataset.team });
});

document.addEventListener('change', event => {
  if (event.target.name !== 'team') return;
  team = event.target.value; remember(); render();
});

document.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id !== 'handoff-form' || !team || busy) return;
  busy = 'handoff'; problem = ''; render();
  bridge.postMessage({ type: 'handoff', team });
});

window.addEventListener('message', event => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'state') { view = message.view; connected = true; busy = ''; problem = message.problem || ''; render(); }
  else if (message.type === 'problem') { busy = ''; problem = message.message || ''; render(); }
  else if (message.type === 'idle') { busy = ''; render(); }
  else if (message.type === 'connection') { connected = Boolean(message.connected); render(); }
});

remember();
render();
bridge.postMessage({ type: 'ready' });
