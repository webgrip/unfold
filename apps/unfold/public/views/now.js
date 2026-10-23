import { nowMarkup, loopMarkup, nextBaseline, shownIds, visibleNow, offersRetry, digestSection } from '../now.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, renderHtml, announce, notify } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { plural } from '../core/format.js';
import { shell } from '../shell.js';
import { singleKeyAllowed, singleKeysEnabled } from '../core/keys.js';
import { live } from '../core/live.js';
import { prefs } from '../core/prefs.js';
import { applyNowCounts } from '../core/counts.js';
import { repoName, taskSources } from '../core/lookup.js';
import { enabled, exposed, track } from '../core/flags.js';
import { segmented } from '../core/ui.js';
import { fleetBoard, fleetModel } from '../live/fleet.js';
import { linkedWaitingCard } from '../core/linked-waiting.js';
import { taskStandings } from '../handoff.js';
import { handedMarkup, labelledTeam, pendingHandoffs, retryMarkup, roomOf, sheetMarkup, startCard, startQueue, suggestedTeam, taskKey } from '../start.js';

const baselineKey = 'unfold.nowSince';
const view = Object.assign(state.now, { summary: { data: null, error: null }, summaryRequest: 0, shown: null, since: undefined, caughtUp: false, hiddenAt: null, refreshing: false, keepFocus: false, linked: null });

function readBaseline() {
  try { const saved = JSON.parse(globalThis.sessionStorage?.getItem(baselineKey) ?? 'null'); return saved && typeof saved === 'object' && 'since' in saved ? saved.since : undefined; } catch { return undefined; }
}

function keepBaseline() {
  try { globalThis.sessionStorage?.setItem(baselineKey, JSON.stringify({ since: view.since })); } catch {}
}

function arrive(now = Date.now()) {
  const current = view.since === undefined ? readBaseline() : view.since;
  const since = nextBaseline({ current, lastVisit: prefs.get('lastVisit'), now });
  if (since !== view.since) view.caughtUp = false;
  view.since = since;
  keepBaseline();
}

function markSeen() { prefs.set('lastVisit', new Date().toISOString()); }

const onNow = () => Boolean(state.bootstrap) && state.view === 'now';

function refreshButton() {
  if (!view.data && ['ploeg_unconfigured', 'ploeg_scope'].includes(view.error?.code)) return '';
  if (offersRetry(view)) return '';
  const busy = view.refreshing || (view.loading && !view.data);
  return `<button type="button" class="button secondary icon-only now-refresh" id="now-refresh" data-action="now-refresh" aria-label="Refresh" title="Refresh"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')}</button>`;
}

function focusedTarget() {
  const active = document.activeElement;
  if (!active || active === document.body || active.id || !document.getElementById('main')?.contains(active)) return null;
  const href = active.getAttribute('href');
  return href ? `#main a[href="${CSS.escape(href)}"]` : null;
}

function visible(element) {
  return Boolean(element) && element.getClientRects().length > 0;
}

function restoreFocus(keep) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const kept = keep ? document.querySelector(keep) : null;
  if (kept) { kept.focus({ preventScroll: true }); return; }
  if (!view.keepFocus) return;
  const refresh = document.getElementById('now-refresh');
  (visible(refresh) ? refresh : document.getElementById('page-title'))?.focus({ preventScroll: true });
}

function fleetShown() {
  if (!enabled('now.fleet')) return false;
  exposed('now.fleet', { screen: 'now' });
  return prefs.get('nowView') === 'fleet';
}

function modeSwitch(fleet) {
  if (!enabled('now.fleet')) return '';
  return `<span class="now-mode">${segmented({ label: 'Show Now as', action: 'now-mode', items: [{ id: 'desk', label: enabled('now.loop') ? 'Loop' : 'Desk', selected: !fleet }, { id: 'fleet', label: 'Fleet', selected: fleet }] })}</span>`;
}

const start = { lists: new Map(), loading: false, loaded: false, handed: [], sheet: null, week: null, weekAt: 0 };
const teamKey = 'unfold.handoffTeam';
const boardKey = 'unfold.startBoard';

function chosenBoard() {
  try { return globalThis.localStorage?.getItem(boardKey) || ''; } catch { return ''; }
}

function chooseBoard(element) {
  try { globalThis.localStorage?.setItem(boardKey, element.dataset.board || ''); } catch {}
  renderNow();
  document.querySelector(`[data-action="start-board"][data-board="${CSS.escape(element.dataset.board || '')}"]`)?.focus({ preventScroll: true });
}
const weekFor = 5 * 60 * 1000;

function loopShown() {
  if (!enabled('now.loop')) return false;
  exposed('now.loop', { screen: 'now' });
  return true;
}

const canStart = () => state.bootstrap?.user?.role !== 'viewer';
const startSources = () => taskSources().filter(source => source.executionOwner === 'ploeg' || source.provider === 'demo');

function rememberedTeam(sourceId) {
  try { const saved = JSON.parse(globalThis.localStorage?.getItem(teamKey) ?? 'null'); return saved && typeof saved[sourceId] === 'string' ? saved[sourceId] : ''; } catch { return ''; }
}

function rememberTeam(sourceId, team) {
  try { const saved = JSON.parse(globalThis.localStorage?.getItem(teamKey) ?? 'null'); globalThis.localStorage?.setItem(teamKey, JSON.stringify({ ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}), [sourceId]: team })); } catch {}
}

function startLane(standings) {
  if (!canStart()) return '';
  const sources = startSources();
  const lists = sources.map(source => ({ sourceId: source.id, tasks: start.lists.get(source.id)?.tasks || [] }));
  const errors = sources.map(source => start.lists.get(source.id)?.error).filter(Boolean);
  const failed = sources.length > 0 && errors.length === sources.length;
  const queue = !start.loaded || failed ? null : startQueue(lists, standings, start.handed);
  return startCard({ queue, sources, error: failed ? errors[0] : '', room: roomOf(view.data), singleKeys: singleKeysEnabled(), demo: Boolean(view.data?.demo), board: chosenBoard() });
}

function loopContent() {
  const standings = taskStandings(view.data);
  const pending = pendingHandoffs(start.handed, standings);
  start.handed = pending;
  return loopMarkup(view, { yours: yoursCard(), grafanaUrl: state.bootstrap?.observability?.grafanaUrl, singleKeys: singleKeysEnabled(), start: view.data ? startLane(standings) : '', handed: handedMarkup(pending, standings), hideQueued: new Set(pending.map(entry => entry.key)), retryHere: canStart() });
}

function yoursCard() { return view.data ? linkedWaitingCard(view.linked?.sessions) : ''; }

function renderNow() {
  if (view.since === undefined) arrive();
  const handOver = state.bootstrap?.user?.role !== 'viewer' && taskSources().some(source => source.executionOwner === 'ploeg');
  const fleet = fleetShown();
  const loop = !fleet && loopShown();
  const content = fleet && view.data
    ? fleetBoard(fleetModel({ now: view.data, summary: view.summary.data, linked: view.linked?.sessions, at: Date.now() }))
    : loop ? loopContent()
    : nowMarkup(view, { yours: yoursCard(), grafanaUrl: state.bootstrap?.observability?.grafanaUrl, singleKeys: singleKeysEnabled(), handOver });
  const subtitle = fleet ? 'Every Team you can read, from the gate to landed.' : loop ? 'Decide, unstick, then start: in that order.' : 'What waits on you, what runs and what finished, across your Teams.';
  const keep = focusedTarget();
  renderHtml(shell(content, { title: 'Now', subtitle, actions: `${modeSwitch(fleet)}${refreshButton()}` }));
  restoreFocus(keep);
}

function switchMode(element) {
  const mode = element.dataset.id;
  if (!prefs.set('nowView', mode)) return;
  track(`now.view_${mode}`);
  renderNow();
  announce(mode === 'fleet' ? 'Showing the fleet' : enabled('now.loop') ? 'Showing the loop' : 'Showing the desk');
  document.querySelector(`[data-action="now-mode"][data-id="${mode}"]`)?.focus({ preventScroll: true });
}

async function loadSummary(fresh) {
  const request = ++view.summaryRequest;
  let next;
  try { next = { data: await api(`/api/ploeg/summary?window=24h${fresh ? '&refresh=1' : ''}`), error: null }; }
  catch (error) { next = { data: view.summary.data, error: { message: error.message, code: error.code || '' } }; }
  if (request !== view.summaryRequest) return;
  view.summary = next;
  if (onNow() && view.data) renderNow();
}

function announceArrivals(before, after) {
  const grown = after.waiting - before.waiting;
  if (grown > 0) announce(`${plural(grown, 'new Work Item')} ${grown === 1 ? 'waits' : 'wait'} on you. Select Show to list ${grown === 1 ? 'it' : 'them'}.`);
}

async function loadAsks() {
  try { view.asks = await api('/api/asks'); }
  catch (error) { if (!view.asks || view.asks.error) view.asks = { error: error.message || 'Unfold could not list your questions.' }; }
  if (onNow()) renderNow();
}

async function loadLinked() {
  try { view.linked = { sessions: (await api('/api/linked-sessions')).sessions || [] }; }
  catch { if (!view.linked) view.linked = { sessions: [] }; }
  if (onNow() && view.data) renderNow();
}

async function loadNow(mode = 'open') {
  const request = ++view.request;
  const fresh = mode === 'manual';
  view.loading = true;
  view.refreshing = mode !== 'live' && Boolean(view.data);
  if (mode !== 'live' && onNow()) renderNow();
  const heldBefore = visibleNow(view.data, view.shown).held;
  loadSummary(fresh);
  loadAsks();
  loadLinked();
  try {
    const data = await api(`/api/ploeg/now${fresh ? '?refresh=1' : ''}`);
    if (request !== view.request) return;
    const first = !view.data;
    view.data = data;
    view.error = null;
    if (mode !== 'live' || first || !view.shown) view.shown = shownIds(data);
    else announceArrivals(heldBefore, visibleNow(data, view.shown).held);
    applyNowCounts(data);
    live.touch('now');
  } catch (error) {
    if (request !== view.request) return;
    view.error = { message: error.message, code: error.code || '' };
    if (state.bootstrap) applyNowCounts(view.data, error);
    if (mode === 'live') throw error;
  } finally {
    if (request === view.request) {
      view.loading = false;
      view.refreshing = false;
      if (onNow()) renderNow();
      view.keepFocus = false;
    }
  }
}

function manualLoad(element) {
  if (view.refreshing || (view.loading && !view.data)) return undefined;
  view.keepFocus = element === document.activeElement || element.contains(document.activeElement);
  return loadNow('manual');
}

function rows() { return [...document.querySelectorAll('[data-now-row]')]; }

function currentRow(list) {
  const active = document.activeElement;
  if (!active) return -1;
  const direct = list.indexOf(active);
  if (direct !== -1) return direct;
  const item = active.closest('li');
  return item ? list.indexOf(item.querySelector('[data-now-row]')) : -1;
}

function openLink(row) {
  const href = row?.dataset.openUrl;
  if (!href) { announce('This row has no pull request or tracker link. Press Enter to open it.'); return; }
  window.open(href, '_blank', 'noopener,noreferrer');
  announce(`Opened the ${row.dataset.openLabel || 'link'} in a new tab`);
}

function nowKeys(event) {
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (state.view !== 'now' || !['j', 'k', 'o'].includes(key) || !singleKeyAllowed(event)) return false;
  const list = rows();
  if (!list.length) return false;
  const index = currentRow(list);
  if (key === 'o' && index === -1) return false;
  event.preventDefault();
  if (key === 'o') { openLink(list[index]); return true; }
  const next = key === 'j' ? (index === -1 ? 0 : Math.min(list.length - 1, index + 1)) : Math.max(0, index === -1 ? 0 : index - 1);
  list[next].focus();
  return true;
}

function showNew() {
  const before = view.shown || shownIds(null);
  const held = visibleNow(view.data, view.shown).held;
  view.shown = shownIds(view.data);
  renderNow();
  const total = held.waiting + held.recent;
  announce(total ? `${plural(total, 'new row')} shown` : 'Everything is shown');
  const waiting = (view.data?.waiting || []).find(entry => !before.waiting.has(entry.id));
  const recent = (view.data?.recent || []).find(run => !before.recent.has(run.id));
  const first = waiting ? `now-row-w-${waiting.id}` : recent ? `now-row-f-${recent.id}` : null;
  (first && document.getElementById(first) || document.querySelector('[data-now-row]'))?.focus();
}

function caughtUp() {
  view.since = new Date().toISOString();
  view.caughtUp = true;
  keepBaseline();
  markSeen();
  renderNow();
  announce('Marked as caught up');
  document.getElementById('page-title')?.focus({ preventScroll: true });
}

function jumpToDigest(element) {
  const selector = digestSection(element.dataset.target);
  if (!selector) return;
  const held = visibleNow(view.data, view.shown).held;
  if (held.waiting || held.recent) { view.shown = shownIds(view.data); renderNow(); }
  const section = document.querySelector(selector);
  if (!section) return;
  const first = section.querySelector('[data-now-row][data-unread]') || section.querySelector('[data-now-row]');
  const heading = section.querySelector('h2, h3');
  section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (first) first.focus({ preventScroll: true });
  else if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}

function leave() { if (onNow()) markSeen(); }

globalThis.addEventListener?.('hashchange', leave);
globalThis.addEventListener?.('pagehide', leave);
globalThis.document?.addEventListener('visibilitychange', () => {
  if (!onNow()) return;
  if (document.visibilityState === 'hidden') { view.hiddenAt = Date.now(); markSeen(); return; }
  const away = view.hiddenAt !== null;
  view.hiddenAt = null;
  if (!away) return;
  const before = view.since;
  arrive();
  if (view.since !== before && view.data) renderNow();
});

async function loadStart() {
  if (!loopShown() || !canStart()) return;
  const sources = startSources();
  start.loading = true;
  const lists = await Promise.all(sources.map(async source => {
    try { return [source.id, { tasks: (await api(`/api/task-sources/${encodeURIComponent(source.id)}/tasks?page=1`)).tasks || [] }]; }
    catch (error) { return [source.id, { tasks: start.lists.get(source.id)?.tasks || [], error: error.message || 'The tracker did not answer.' }]; }
  }));
  start.lists = new Map(lists);
  start.loading = false;
  start.loaded = true;
  if (onNow()) renderNow();
}

const sheetDialog = () => $('#confirm-dialog');
const sheetTask = sheet => start.lists.get(sheet.sourceId)?.tasks.find(task => String(task.id) === String(sheet.taskId));
const statusPath = (sourceId, taskId, tail) => `/api/task-sources/${encodeURIComponent(sourceId)}/tasks/${encodeURIComponent(taskId)}/${tail}`;

function renderSheet() {
  const sheet = start.sheet;
  const dialog = sheetDialog();
  if (!sheet || !dialog?.open) return;
  const task = sheetTask(sheet);
  const source = taskSources().find(entry => entry.id === sheet.sourceId);
  if (!task || !source) { dialog.close(); return; }
  const focused = dialog.contains(document.activeElement) ? document.activeElement.id : '';
  const team = sheet.team || suggestedTeam(sheet.status?.teams, rememberedTeam(sheet.sourceId), labelledTeam(task));
  dialog.innerHTML = sheetMarkup({ task, source, repository: source.repositoryId ? repoName(source.repositoryId) : '', status: sheet.status, statusError: sheet.statusError, summary: start.week, team, remembered: rememberedTeam(sheet.sourceId), busy: sheet.busy, error: sheet.error, room: roomOf(view.data), singleKeys: singleKeysEnabled() });
  const target = (focused && document.getElementById(focused)) || document.querySelector('#sheet-submit:not([disabled])') || dialog.querySelector('[data-action="close-dialog"]');
  target?.focus();
}

async function loadSheet() {
  const sheet = start.sheet;
  if (!sheet) return;
  sheet.statusError = '';
  const week = Date.now() - start.weekAt > weekFor
    ? api('/api/ploeg/summary?window=7d').then(data => { start.week = data; start.weekAt = Date.now(); }).catch(() => {})
    : Promise.resolve();
  try { sheet.status = await api(statusPath(sheet.sourceId, sheet.taskId, 'ploeg')); }
  catch (error) { sheet.statusError = error.message || 'Ploeg did not answer.'; }
  await week;
  if (start.sheet === sheet) renderSheet();
}

function openSheet(element) {
  const sheet = { sourceId: element.dataset.source, taskId: element.dataset.task, status: null, statusError: '', team: '', busy: false, error: '', opener: element.id };
  if (!sheetTask(sheet)) return;
  const dialog = sheetDialog();
  if (!dialog || dialog.open) return;
  start.sheet = sheet;
  dialog.className = 'dialog session-dialog sheet-dialog';
  dialog.addEventListener('close', () => { dialog.classList.remove('session-dialog', 'sheet-dialog'); const opener = start.sheet?.opener; start.sheet = null; if (opener) document.getElementById(opener)?.focus({ preventScroll: true }); }, { once: true });
  dialog.showModal();
  renderSheet();
  track('now.start_sheet');
  loadSheet();
}

function chooseTeam(element, event) {
  if (!start.sheet || event.target.name !== 'team') return;
  start.sheet.team = event.target.value;
  renderSheet();
}

async function handOff(data) {
  const sheet = start.sheet;
  const task = sheet && sheetTask(sheet);
  const team = data.team || sheet?.team || suggestedTeam(sheet?.status?.teams, rememberedTeam(sheet?.sourceId), labelledTeam(task));
  if (!sheet || !task || !team || sheet.busy) return;
  sheet.busy = true; sheet.error = '';
  renderSheet();
  try {
    const status = await api(statusPath(sheet.sourceId, task.id, 'handoff'), { method: 'POST', body: JSON.stringify({ team, revision: task.revision }) });
    rememberTeam(sheet.sourceId, team);
    start.handed = [{ key: taskKey(task), sourceId: sheet.sourceId, taskId: String(task.id), title: task.title || `Task ${task.id}`, team, at: Date.now() }, ...start.handed.filter(entry => entry.key !== taskKey(task))];
    sheet.opener = '';
    sheetDialog()?.close();
    track('now.start_handoff');
    notify(`Handed to ${team}. Take it back from Now until a worker starts it.`);
    announce(`Handed to ${team}.`);
    for (const warning of status.warnings || []) notify(warning, true);
    renderNow();
    document.getElementById(`start-take-back-${sheet.sourceId}-${task.id}`)?.focus({ preventScroll: true });
    loadNow('manual');
  } catch (error) {
    sheet.busy = false;
    sheet.error = error.message || 'Ploeg did not answer.';
    if (error.status === 409 && error.code === 'task_changed') { await loadStart(); sheet.error = `${sheet.error} The sheet now shows the current version.`; }
    renderSheet();
  }
}

async function takeBack(element) {
  const entry = start.handed.find(item => item.sourceId === element.dataset.source && item.taskId === element.dataset.task);
  if (!entry || entry.busy) return;
  entry.busy = true;
  renderNow();
  try {
    await api(`${statusPath(entry.sourceId, entry.taskId, 'handoff')}?team=${encodeURIComponent(entry.team)}`, { method: 'DELETE' });
    start.handed = start.handed.filter(item => item !== entry);
    track('now.start_take_back');
    notify(`Taken back from ${entry.team}. Nothing was spent.`);
    announce(`Taken back from ${entry.team}.`);
    await Promise.all([loadStart(), loadNow('manual')]);
  } catch (error) {
    entry.busy = false;
    notify(error.message, true);
    renderNow();
  }
}

function openRetry(element) {
  const entry = (view.data?.waiting || []).find(item => String(item.id) === element.dataset.id);
  const dialog = sheetDialog();
  if (!entry || !dialog || dialog.open) return;
  dialog.className = 'dialog session-dialog';
  dialog.innerHTML = retryMarkup(entry, { demo: Boolean(view.data?.demo) });
  dialog.addEventListener('close', () => { dialog.classList.remove('session-dialog'); document.getElementById(element.id)?.focus({ preventScroll: true }); }, { once: true });
  dialog.showModal();
  dialog.querySelector('#loop-retry-note')?.focus();
}

async function retry(data) {
  const entry = (view.data?.waiting || []).find(item => String(item.id) === data.id);
  const dialog = sheetDialog();
  if (!entry) { dialog?.close(); return; }
  const note = String(data.note || '').trim();
  dialog.innerHTML = retryMarkup(entry, { demo: Boolean(view.data?.demo), busy: true });
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(entry.id)}/requeue`, { method: 'POST', body: JSON.stringify({ commandId: crypto.randomUUID(), expectedState: entry.state, ...(note ? { note } : {}) }) });
    dialog.close();
    track('now.loop_retry');
    notify(result.demo ? 'This is the demo: nothing restarted and nothing was spent.' : `Started “${entry.title || `Work Item ${entry.id}`}” again from Round ${result.fromRound ?? 1}.`);
    loadNow('manual');
  } catch (error) {
    dialog.innerHTML = retryMarkup(entry, { demo: Boolean(view.data?.demo), error: error.message || 'Ploeg did not answer.' });
    const field = dialog.querySelector('#loop-retry-note');
    if (field) field.value = note;
  }
}

function startKeys(event) {
  const key = typeof event.key === 'string' ? event.key : '';
  const dialog = sheetDialog();
  if (start.sheet && dialog?.open && /^[1-9]$/.test(key) && singleKeysEnabled() && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const radio = dialog.querySelectorAll('input[name="team"]:not([disabled])')[Number(key) - 1];
    if (!radio) return false;
    event.preventDefault();
    radio.checked = true;
    start.sheet.team = radio.value;
    renderSheet();
    return true;
  }
  if (state.view !== 'now' || key !== 'h' || !singleKeyAllowed(event) || !loopShown()) return false;
  const focused = document.activeElement?.closest?.('[data-action="start-open"]');
  const row = focused || document.querySelector('[data-action="start-open"]');
  if (!row) return false;
  event.preventDefault();
  openSheet(row);
  return true;
}

live.register('now', { interval: 30000, refresh: () => loadNow('live') });

/** The Now page: the "Since you were away" digest, what waits on you, what runs now and what finished recently, across every Team you can read. `j`/`k` move between rows, Enter opens one and `o` opens its pull request or task. Refreshes every 30 seconds and holds new rows behind an "N new" button. */
export default {
  id: 'now',
  match: hash => hash === 'now' ? {} : null,
  load: () => { arrive(); loadStart(); return loadNow('open'); },
  render: renderNow,
  actions: {
    'now-retry': manualLoad,
    'now-refresh': element => { loadStart(); return manualLoad(element); },
    'now-show-new': showNew,
    'now-caught-up': caughtUp,
    'now-digest-jump': jumpToDigest,
    'now-mode': switchMode,
    'start-open': openSheet,
    'start-reload': () => loadStart(),
    'start-sheet-retry': () => { if (start.sheet) { start.sheet.status = null; renderSheet(); loadSheet(); } },
    'start-take-back': takeBack,
    'loop-retry': openRetry,
    'start-board': chooseBoard,
  },
  forms: { 'start-handoff': handOff, 'loop-retry': retry },
  changes: { '[data-form="start-handoff"]': chooseTeam },
  keys: [nowKeys, startKeys],
};
