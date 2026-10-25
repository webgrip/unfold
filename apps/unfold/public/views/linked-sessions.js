import { state, disconnect, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify } from '../core/dom.js';
import { button, callout, card, emptyState, skeleton, stateBadge } from '../core/ui.js';
import { linkedSessionPage, linkedStates, linkedStatusLine, attributionLine, sessionTitle } from '../core/linked-sessions.js';
import { icon } from '../core/icons.js';
import { collisions, collisionsOf, isLiveSession, runningRunsOf } from '../core/collisions.js';
import { linkedInboxCard } from '../core/linked-inbox.js';
import { conversationCard, conversationList, mergedConversation } from '../core/linked-conversation.js';
import { permissionsCard, permissionsChangedEvent } from '../core/linked-permissions.js';
import { shell } from '../shell.js';
import { briefCheck, digestMarkup, handOffMarkup, startWorkItemForm } from '../core/linked-handoff.js';

const sessionPath = /^linked-session\/([A-Za-z0-9_-]{8,128})$/;
const view = { mode: null, id: null, session: null, sessions: null, error: '', request: 0, titles: {}, clashes: [], suggestions: [], digest: null, window: '7d', options: null, readiness: null, messages: null, messagesError: '', permissions: null, draft: {}, conversation: null, conversing: 0 };
onForget(() => Object.assign(view, { mode: null, id: null, session: null, sessions: null, error: '', request: view.request + 1, titles: {}, clashes: [], suggestions: [], digest: null, window: '7d', options: null, readiness: null, messages: null, messagesError: '', permissions: null, draft: {}, conversation: null, conversing: view.conversing + 1 }));
const clashItems = 5;
const conversationEveryMs = 3000;

/** The event other views listen for after a Linked Session gained or lost a Work Item here. */
export const linkedChangedEvent = 'unfold:linked-sessions-changed';

/** The steps that connect a person's Claude Code to this workbench, with the workbench address filled in. */
export function setupSteps(origin) {
  const settings = JSON.stringify({ env: { UNFOLD_URL: origin, UNFOLD_TOKEN: 'vle_…' } }, null, 2);
  return `<ol class="linked-setup-steps">
    <li><p>Sign in a client for Claude Code and copy the token it prints:</p><pre class="mono" data-private><code>UNFOLD_URL=${escape(origin)} npm --prefix apps/unfold run mcp -- login</code></pre></li>
    <li><p>Put the address and token in <code>~/.claude/settings.json</code>, beside the telemetry settings you already have:</p><pre class="mono" data-private><code>${escape(settings)}</code></pre></li>
    <li><p>In Claude Code, add the Unfold marketplace and install the plugin:</p><pre class="mono" data-private><code>/plugin marketplace add https://forgejo.webgrip.dev/webgrip/unfold.git
/plugin install unfold@unfold</code></pre></li>
    <li><p>Start a session. It appears below and links itself to the Work Item its branch names, such as <code>feat/vik-2051-login</code>. Ask it to link to another Work Item at any time.</p></li>
  </ol>`;
}

function listRows(sessions, now) {
  return sessions.map(session => `<li class="linked-session-row"><div class="linked-session-text"><p class="linked-session-title"><a class="work-inline-link" href="#linked-session/${escape(encodeURIComponent(session.id))}">${escape(sessionTitle(session))}${icon('arrow')}</a> ${stateBadge(linkedStates[session.state] ?? linkedStates.idle)}</p><p class="meta">${escape(linkedStatusLine(session, now))}</p><ul class="linked-session-facts"><li>${escape(session.workItems.length ? `Work Items ${session.workItems.map(entry => entry.id).join(', ')}` : 'Not linked to a Work Item')}</li><li>${escape(attributionLine(session))}</li></ul></div></li>`).join('');
}

function settingsContent() {
  const now = Date.now();
  const setup = card({ id: 'linked-setup', title: 'Connect Claude Code', subtitle: 'Your own Claude Code sessions report here and link to Work Items. Unfold never holds your Claude sign-in.', icon: 'terminal', body: setupSteps(location.origin) });
  let list;
  if (view.error && !view.sessions) list = callout({ tone: 'danger', title: 'Could not read your agent sessions', body: `<p>${escape(view.error)}</p>` });
  else if (!view.sessions) list = skeleton({ rows: 3 });
  else if (!view.sessions.length) list = emptyState({ icon: 'bot', title: 'No sessions have reported yet', body: 'Once the plugin is installed, each Claude Code session you start shows up here within a second.', compact: true });
  else list = `<ul class="linked-session-list">${listRows(view.sessions, now)}</ul>`;
  const note = `<p class="settings-footnote">${icon('lock')}<span>The plugin sends the session id, title, repository, branch, model, state and commit ids. While you read a session’s conversation here, it passes the prompts, replies and redacted tool lines to you; Unfold stores none of it. Files, tool output and your Claude credentials never leave your machine through it.</span></p>`;
  const windows = ['7d', '30d'].map(window => button({ label: window === '7d' ? '7 days' : '30 days', size: 'sm', variant: view.window === window ? 'primary' : 'ghost', action: 'linked-digest-window', data: { window } })).join(' ');
  const digest = card({ id: 'linked-digest', title: 'Your sessions at a glance', subtitle: 'Counted from what your sessions reported; the cost is Claude Code’s own estimate.', actions: windows, body: view.digest?.error ? `<p class="meta">${escape(view.digest.error)}</p>` : view.digest ? digestMarkup(view.digest) : skeleton({ rows: 1 }) });
  return `<div class="settings-page">${digest}${setup}${card({ id: 'linked-mine', title: 'Your agent sessions', subtitle: 'Newest report first.', body: list })}${note}</div>`;
}

function sessionContent() {
  if (view.error && !view.session) return callout({ tone: 'danger', title: 'Could not read this agent session', body: `<p>${escape(view.error)}</p>` });
  if (!view.session) return `<div class="card">${skeleton({ rows: 6, variant: 'text' })}</div>`;
  const options = { workItems: view.titles, suggestions: view.suggestions, clashes: view.clashes };
  const inboxCard = linkedInboxCard(view.session, view.messages, { error: view.messagesError, draft: view.draft.message });
  if (!view.session.mine) return linkedSessionPage(view.session, { ...options, act: inboxCard });
  const talk = conversationCard(view.session, view.conversation);
  const handOff = handOffMarkup(view.session, view.readiness);
  const start = `<div class="linked-hand-start"><p class="field-label">${handOff ? 'Or start a new Work Item' : 'Start a new Work Item'}</p>${startWorkItemForm(view.session, view.options, view.draft)}</div>`;
  const handCard = card({ id: 'linked-session-start', title: 'Hand to Ploeg', subtitle: 'Ploeg runs it with the Team’s budget, and this session stays linked to it.', icon: 'work', body: `${handOff}${start}` });
  return linkedSessionPage(view.session, { ...options, act: `${talk}${permissionsCard(view.session, view.permissions)}${inboxCard}${handCard}` });
}

function conversationScroll() {
  const list = document.getElementById('linked-conversation-list');
  return list ? { top: list.scrollTop, atBottom: list.scrollHeight - list.scrollTop - list.clientHeight < 40 } : null;
}

function settleConversation(before) {
  const list = document.getElementById('linked-conversation-list');
  if (list) list.scrollTop = !before || before.atBottom ? list.scrollHeight : before.top;
}

function renderLinked() {
  const before = globalThis.document ? conversationScroll() : null;
  try { renderPage(); } finally { if (globalThis.document) settleConversation(before); }
}

function renderPage() {
  if (view.mode === 'settings') return renderHtml(shell(settingsContent(), { title: 'Agent sessions', subtitle: 'Connect Claude Code, and see the sessions of yours that report to Unfold.' }));
  const title = view.session ? sessionTitle(view.session) : 'Agent session';
  renderHtml(shell(sessionContent(), { title, subtitle: 'An agent session that runs outside Unfold and reports to it.' }));
}

async function loadSession(id) {
  const request = ++view.request;
  try {
    const { session } = await api(`/api/linked-sessions/${encodeURIComponent(id)}?telemetry=1`);
    if (request !== view.request) return;
    view.session = session; view.error = '';
    renderLinked();
    if (session.mine) { void loadMessages(id, request); void loadPermissions(id, request); if (session.state !== 'ended') void followConversation(id); else view.conversation = mergedConversation(null, { reachable: false, reason: 'ended' }); }
    const details = await Promise.all(session.workItems.slice(0, 10).map(entry => api(`/api/ploeg/work-items/${encodeURIComponent(entry.id)}`).then(detail => [entry.id, detail], () => [entry.id, null])));
    if (request !== view.request) return;
    view.titles = Object.fromEntries(details.filter(([, detail]) => detail?.item?.title).map(([id, detail]) => [id, detail.item.title]));
    view.clashes = isLiveSession(session) ? await clashesOf(session, details.map(([, detail]) => detail)) : [];
    if (request !== view.request) return;
    view.suggestions = session.mine ? await api(`/api/linked-sessions/${encodeURIComponent(id)}/suggestions`).then(answer => answer.suggestions ?? [], () => []) : [];
    if (request !== view.request) return;
    if (session.mine) {
      const [options, readiness] = await Promise.all([
        api(`/api/linked-sessions/${encodeURIComponent(id)}/start-options`).catch(error => ({ error: error.message })),
        session.workItems.length ? api(`/api/linked-sessions/${encodeURIComponent(id)}/handoff`).catch(error => ({ workItems: session.workItems.slice(0, 5).map(entry => ({ id: entry.id, title: '', state: '', available: false, reason: error.message })) })) : null,
      ]);
      if (request !== view.request) return;
      view.options = options; view.readiness = readiness;
    }
  } catch (error) { if (request === view.request) view.error = error.message; }
  if (request === view.request && state.view === 'linked-sessions') renderLinked();
}

async function clashesOf(session, details) {
  const lists = await Promise.all([api('/api/linked-sessions'), ...session.workItems.slice(0, clashItems).map(entry => api(`/api/linked-sessions?workItemId=${encodeURIComponent(entry.id)}`))].map(call => call.then(answer => answer.sessions || [], () => [])));
  return collisionsOf(collisions({ sessions: [session, ...lists.flat()], runs: details.flatMap(runningRunsOf) }), { sessionId: session.id });
}

async function loadMessages(id, request = view.request) {
  try { const { messages } = await api(`/api/linked-sessions/${encodeURIComponent(id)}/messages`); if (request !== view.request) return; view.messages = messages; view.messagesError = ''; }
  catch (error) { if (request === view.request) view.messagesError = error.message; }
  if (request === view.request && state.view === 'linked-sessions') renderLinked();
}

function showConversation() {
  const list = document.getElementById('linked-conversation-list');
  const card = document.getElementById('linked-session-conversation');
  if (!card || !list || !view.conversation?.reachable) { renderLinked(); return; }
  const before = conversationScroll();
  list.innerHTML = conversationList(view.conversation);
  card.querySelector('.linked-conversation-gap')?.remove();
  settleConversation(before);
}

async function followConversation(id) {
  const turn = ++view.conversing;
  const following = () => turn === view.conversing && state.view === 'linked-sessions' && view.session?.id === id;
  while (following()) {
    if (document.visibilityState === 'visible') {
      const after = Number.isSafeInteger(view.conversation?.cursor) ? `?after=${view.conversation.cursor}` : '';
      const read = await api(`/api/linked-sessions/${encodeURIComponent(id)}/conversation${after}`).catch(error => ({ reachable: false, reason: 'no_answer', message: error.message }));
      if (!following()) return;
      const had = view.conversation;
      view.conversation = mergedConversation(view.conversation, read);
      const changed = !had || had.reachable !== view.conversation.reachable || had.reason !== view.conversation.reason || had.entries.length !== view.conversation.entries.length || read.restarted;
      if (changed) showConversation();
    }
    await new Promise(done => setTimeout(done, conversationEveryMs));
  }
}

async function loadPermissions(id, request = view.request) {
  const requests = await api(`/api/linked-sessions/${encodeURIComponent(id)}/permissions`).then(answer => answer.requests ?? [], () => []);
  if (request !== view.request) return;
  view.permissions = requests;
  if (state.view === 'linked-sessions') renderLinked();
}

if (globalThis.window) window.addEventListener(permissionsChangedEvent, event => { if (state.view === 'linked-sessions' && view.session?.id === event.detail?.session) void loadPermissions(view.session.id); });

async function sendMessage(data, form) {
  const text = String(data.text ?? '').trim();
  if (!text) throw new Error('Write a message first.');
  await api(`/api/linked-sessions/${encodeURIComponent(form.dataset.id)}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
  notify('Sent. The session reads it on its next prompt, command or stop.');
  delete view.draft.message;
  form.reset();
  await loadMessages(form.dataset.id);
}

async function enterLinked(params) {
  disconnect(); state.session = null; state.view = 'linked-sessions';
  view.mode = params.id ? 'session' : 'settings';
  view.id = params.id ?? null; view.session = null; view.error = ''; view.titles = {}; view.clashes = []; view.suggestions = []; view.options = null; view.readiness = null; view.messages = null; view.messagesError = ''; view.permissions = null; view.draft = {}; view.conversation = null; view.conversing += 1;
  renderLinked();
  if (view.mode === 'session') return loadSession(view.id);
  const request = ++view.request;
  void loadDigest();
  try { const { sessions } = await api('/api/linked-sessions'); if (request === view.request) view.sessions = sessions; }
  catch (error) { if (request === view.request) view.error = error.message; }
  if (request === view.request && state.view === 'linked-sessions') renderLinked();
}

async function changeLink(id, workItem, linked) {
  const { session } = await api(`/api/linked-sessions/${encodeURIComponent(id)}/work-items/${encodeURIComponent(workItem)}`, { method: linked ? 'PUT' : 'DELETE', body: '{}' });
  window.dispatchEvent(new CustomEvent(linkedChangedEvent, { detail: { id, workItem } }));
  if (state.view === 'linked-sessions' && view.session?.id === id) { view.session = { ...session, telemetry: view.session.telemetry }; renderLinked(); }
  return session;
}

async function unlink(element) {
  element.disabled = true;
  await changeLink(element.dataset.id, element.dataset.workItem, false);
  notify(`Unlinked from Work Item ${element.dataset.workItem}. Its branch will not link it again.`);
}

async function linkSuggested(element) {
  element.disabled = true;
  await changeLink(element.dataset.id, element.dataset.workItem, true);
  view.suggestions = view.suggestions.filter(entry => entry.id !== element.dataset.workItem);
  notify(`Linked to Work Item ${element.dataset.workItem}.`);
  void loadSession(element.dataset.id);
}

async function link(data, form) {
  const workItem = String(data.workItem ?? '').trim().replace(/^#/, '');
  if (!/^[1-9][0-9]{0,18}$/.test(workItem)) throw new Error('Enter a Work Item id, such as 184.');
  await changeLink(form.dataset.id, workItem, true);
  notify(`Linked to Work Item ${workItem}.`);
  void loadSession(form.dataset.id);
}

async function loadDigest() {
  const chosen = view.window;
  try { const { digest } = await api(`/api/linked-sessions/digest?window=${chosen}`); if (view.window === chosen) view.digest = digest; }
  catch (error) { if (view.window === chosen) view.digest = { error: error.message }; }
  if (state.view === 'linked-sessions' && view.mode === 'settings') renderLinked();
}

async function digestWindow(element) {
  view.window = element.dataset.window === '30d' ? '30d' : '7d';
  view.digest = null;
  renderLinked();
  await loadDigest();
}

async function startWorkItem(data, form) {
  const id = form.dataset.id;
  const result = await api(`/api/linked-sessions/${encodeURIComponent(id)}/work-items`, { method: 'POST', body: JSON.stringify({ team: data.team, target: data.target, title: data.title, brief: data.brief, requestId: `unfold-linked-${crypto.randomUUID()}` }) });
  window.dispatchEvent(new CustomEvent(linkedChangedEvent, { detail: { id, workItem: result.workItem.id } }));
  view.draft = view.draft.message ? { message: view.draft.message } : {};
  notify(result.linkError || `Ploeg queued Work Item ${result.workItem.id} for ${result.workItem.team}. This session is linked to it.`, Boolean(result.linkError));
  void loadSession(id);
}

const keepDraft = key => element => { view.draft[key] = element.value; };

function checkBrief(textarea) {
  view.draft.brief = textarea.value;
  const check = textarea.form?.querySelector('[data-brief-check]');
  if (check) check.innerHTML = briefCheck(textarea.value);
}

function addDoneWhen(element) {
  const brief = element.closest('form')?.querySelector('#linked-start-brief');
  if (!brief) return;
  brief.value = `${brief.value.trimEnd()}${brief.value.trim() ? '\n\n' : ''}Done when:\n- `;
  brief.focus();
  brief.setSelectionRange(brief.value.length, brief.value.length);
  checkBrief(brief);
}

async function handOff(element) {
  element.disabled = true;
  const { id, workItem } = element.dataset;
  try {
    const result = await api(`/api/linked-sessions/${encodeURIComponent(id)}/work-items/${encodeURIComponent(workItem)}/handoff`, { method: 'POST', body: JSON.stringify({ commandId: `unfold-handoff-${crypto.randomUUID()}` }) });
    notify(result.requeue.demo ? 'This is the demo: nothing restarted and nothing was spent.' : `Ploeg started Work Item ${workItem} over from Round ${result.requeue.fromRound}. Its Runs read where your session left off.`);
  } catch (error) { element.disabled = false; throw error; }
  void loadSession(id);
}

async function copy(element) {
  try { await navigator.clipboard.writeText(element.dataset.text); notify('Copied. Paste it into a terminal on the machine that ran the session.'); }
  catch { notify('The browser did not allow copying. Select the command instead.', true); }
}

/**
 * Agent sessions: `#settings/agent-sessions` connects Claude Code and lists the person's Linked Sessions, and
 * `#linked-session/<id>` shows one with its Work Items, telemetry, commits and the command that resumes it.
 */
export default {
  id: 'linked-sessions',
  match: hash => hash === 'settings/agent-sessions' ? {} : (sessionPath.exec(hash) ? { id: sessionPath.exec(hash)[1] } : null),
  enter: enterLinked,
  render: renderLinked,
  actions: { 'linked-session-unlink': unlink, 'linked-session-copy': copy, 'linked-session-suggest': linkSuggested, 'linked-session-hand-off': handOff, 'linked-digest-window': digestWindow, 'linked-start-done-when': addDoneWhen },
  inputs: { '#linked-start-brief': checkBrief, '#linked-start-title': keepDraft('title'), '#linked-session-message': keepDraft('message') },
  changes: { '#linked-start-team': keepDraft('team'), '#linked-start-target': keepDraft('target') },
  forms: { 'linked-session-link': link, 'linked-session-start': startWorkItem, 'linked-session-message': sendMessage },
};

