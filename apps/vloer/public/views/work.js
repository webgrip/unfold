import { workMarkup, ploegLanes, activePloegLane, mergeOverviews, teamOverview, appendPage, cancelDialogMarkup, workItemRef } from '../ploeg.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, renderHtml, notify, announce, safeUrl } from '../core/dom.js';
import { buildHash, parseHash } from '../core/route.js';
import { live } from '../core/live.js';
import { prefs } from '../core/prefs.js';
import { singleKeyAllowed, isTyping } from '../core/keys.js';
import { shell } from '../shell.js';
import { enterPloegView } from './ploeg-common.js';

const lanes = ploegLanes.map(lane => lane.id);
const itemPath = /^work\/([1-9][0-9]{0,19})$/;
const liveInterval = 30000;
const work = { team: '', loadedTeam: null, listRequest: 0, detailRequest: 0, detailId: null, loadingMore: false, refreshing: false, cancelBusy: false, cancelResult: null, briefOpen: new Set(), sessionsLoaded: false, listScroll: 0, registered: false };

const canCancel = () => ['operator', 'admin'].includes(state.bootstrap?.user?.role);
const visible = () => Boolean(state.bootstrap) && state.view === 'work';

function listHash() {
  return buildHash('work', { lane: state.ploegLane, team: work.team });
}

function model() {
  const detail = state.ploegDetail && state.ploegDetail.item.id === work.detailId ? state.ploegDetail : null;
  return {
    data: state.ploeg,
    lane: activePloegLane(state),
    team: work.team,
    loading: state.ploegLoading,
    refreshing: work.refreshing,
    loadingMore: work.loadingMore,
    detailId: work.detailId,
    detail,
    detailLoading: state.ploegDetailLoading,
    detailError: state.ploegDetailError || null,
    listHref: `#${listHash()}`,
    canCancel: canCancel(),
    cancelBusy: work.cancelBusy,
    cancelResult: work.cancelResult?.id === work.detailId ? work.cancelResult : null,
    briefOpen: work.briefOpen.has(work.detailId),
    sessions: state.sessions,
    userId: state.bootstrap?.user?.id,
    trackerUrl: state.ploeg?.trackerUrl,
    now: Date.now(),
  };
}

function shellOptions(current) {
  const title = 'Work';
  if (!current.detailId) return { title };
  const item = current.detail?.item;
  return { title, breadcrumbs: [{ label: 'Ploeg' }, { label: 'Work', href: current.listHref }, { label: item ? workItemRef(item) : `#${current.detailId}` }] };
}

function renderWork() {
  if (!visible()) return;
  const open = new Map([...document.querySelectorAll('#app details[id]')].map(element => [element.id, element.open]));
  const scroller = $('.work-list-pane .work-list');
  const listTop = scroller ? scroller.scrollTop : 0;
  const current = model();
  renderHtml(shell(workMarkup(current), shellOptions(current)));
  for (const element of document.querySelectorAll('#app details[id]')) if (open.has(element.id)) element.open = open.get(element.id);
  const list = $('.work-list-pane .work-list');
  if (list && listTop) list.scrollTop = listTop;
  revealLane();
}

function revealLane() {
  const lanes = $('.work-lanes');
  const pressed = lanes?.querySelector('[aria-pressed="true"]');
  if (!pressed || lanes.scrollWidth <= lanes.clientWidth) return;
  const start = pressed.offsetLeft - lanes.offsetLeft;
  if (start < lanes.scrollLeft || start + pressed.offsetWidth > lanes.scrollLeft + lanes.clientWidth) lanes.scrollLeft = Math.max(0, start - (lanes.clientWidth - pressed.offsetWidth) / 2);
}

function keepFiltersInHash() {
  const id = work.detailId;
  history.replaceState(null, '', `#${buildHash(id ? `work/${id}` : 'work', { lane: state.ploegLane, team: work.team })}`);
}

async function readOverview(team, fresh) {
  const refresh = fresh ? { refresh: '1' } : {};
  if (team) return teamOverview(await api(`/api/ploeg?${new URLSearchParams({ team, ...refresh })}`));
  const first = await api(`/api/ploeg?${new URLSearchParams(refresh)}`);
  if (!first.available || first.teams.length < 2) return teamOverview(first);
  const others = first.teams.map(entry => entry.id).filter(id => id !== first.selectedTeam);
  const rest = await Promise.all(others.map(id => api(`/api/ploeg?${new URLSearchParams({ team: id, ...refresh })}`).then(data => ({ team: id, data }), error => ({ team: id, error }))));
  return mergeOverviews([{ team: first.selectedTeam, data: first }, ...rest]);
}

async function loadOverview({ fresh = false, quiet = false } = {}) {
  const request = ++work.listRequest;
  const team = work.team;
  if (quiet) work.refreshing = true;
  else { state.ploegLoading = true; if (work.loadedTeam !== team) state.ploeg = null; }
  renderWork();
  try {
    const data = await readOverview(team, fresh);
    if (request !== work.listRequest || !visible()) return;
    state.ploeg = data;
    work.loadedTeam = team;
    if (data.available) live.touch('work');
  } catch (error) {
    if (request !== work.listRequest || !state.bootstrap) return;
    if (error.code === 'ploeg_not_found' && team) {
      if (prefs.get('team') === team) prefs.set('team', null);
      work.team = '';
      keepFiltersInHash();
      notify(`Team ${team} is not available to your account. Showing all Teams.`, true);
      state.ploegLoading = false; work.refreshing = false;
      return loadOverview({ fresh });
    }
    if (quiet && state.ploeg?.available) throw error;
    state.ploeg = { configured: error.code !== 'ploeg_unconfigured', available: false, demo: false, teams: [], message: error.message };
    work.loadedTeam = team;
    if (quiet) throw error;
  } finally {
    if (request === work.listRequest) { state.ploegLoading = false; work.refreshing = false; renderWork(); }
  }
}

async function ensureSessions() {
  if (work.sessionsLoaded) return;
  work.sessionsLoaded = true;
  try {
    const sessions = await api('/api/sessions');
    state.sessions = sessions;
    if (visible() && work.detailId && sessions.some(session => session.execution?.workItemId === work.detailId)) renderWork();
  } catch { work.sessionsLoaded = false; }
}

async function loadDetail(id, { fresh = false, quiet = false } = {}) {
  const request = ++work.detailRequest;
  if (!quiet) { state.ploegDetailLoading = true; state.ploegDetailError = ''; if (state.ploegDetail?.item.id !== id) state.ploegDetail = null; renderWork(); }
  try {
    const detail = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}${fresh ? '?refresh=1' : ''}`);
    if (request !== work.detailRequest || !visible() || work.detailId !== id) return;
    state.ploegDetail = detail;
    state.ploegDetailError = '';
  } catch (error) {
    if (request !== work.detailRequest || !visible() || work.detailId !== id) return;
    if (quiet && state.ploegDetail?.item.id === id) throw error;
    state.ploegDetail = null;
    state.ploegDetailError = { message: error.message, code: error.code || '' };
    if (quiet) throw error;
  } finally {
    if (request === work.detailRequest && visible() && work.detailId === id) {
      state.ploegDetailLoading = false;
      renderWork();
      if (!quiet && state.ploegDetail) {
        const title = $('#ploeg-item-title');
        title?.focus({ preventScroll: true });
        if (title && title.getBoundingClientRect().top < 0) window.scrollTo({ top: 0 });
        announce(`${state.ploegDetail.item.title || `Work Item ${id}`}, ${workItemRef(state.ploegDetail.item)}`);
        void ensureSessions();
      }
    }
  }
}

async function refreshQuietly() {
  if (!visible() || work.cancelBusy) return;
  await Promise.all([loadOverview({ quiet: true }), work.detailId ? loadDetail(work.detailId, { quiet: true }) : null]);
}

function registerLive() {
  if (work.registered) return;
  work.registered = true;
  live.register('work', { interval: liveInterval, refresh: refreshQuietly });
}

function teamFromQuery(query) {
  if (Object.hasOwn(query, 'team')) return query.team || '';
  return prefs.get('team') || '';
}

async function enterWork({ id, query = {} } = {}) {
  const within = state.view === 'work';
  const previous = within ? work.detailId : null;
  enterPloegView('work');
  registerLive();
  if (lanes.includes(query.lane)) state.ploegLane = query.lane;
  else if (!id && !within) state.ploegLane = null;
  const team = teamFromQuery(query);
  const teamChanged = team !== work.team;
  work.team = team;
  if (!previous && id) work.listScroll = window.scrollY;
  work.detailId = id || null;
  if (!id) { state.ploegDetailLoading = false; state.ploegDetailError = ''; }
  const listReady = within && !teamChanged && state.ploeg && work.loadedTeam === team;
  const detailReady = id && state.ploegDetail?.item.id === id && !state.ploegDetailError;
  const loads = [];
  if (!listReady) loads.push(loadOverview());
  if (id && !detailReady) loads.push(loadDetail(id));
  if (!loads.length) {
    renderWork();
    if (!id && previous) restoreListPosition(previous);
    return;
  }
  await Promise.all(loads);
  if (!id && previous) restoreListPosition(previous);
}

function restoreListPosition(id) {
  if (!visible()) return;
  window.scrollTo({ top: work.listScroll || 0 });
  document.querySelector(`[data-work-row][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}

function selectLane(button) {
  if (!lanes.includes(button.dataset.id)) return;
  state.ploegLane = button.dataset.id;
  keepFiltersInHash();
  renderWork();
  announce(`${ploegLanes.find(lane => lane.id === button.dataset.id).label}`);
}

function changeTeam(select) {
  const team = select.value || '';
  prefs.set('team', team || null);
  work.team = team;
  keepFiltersInHash();
  void loadOverview();
}

async function loadMore() {
  const lane = activePloegLane(state);
  const data = state.ploeg;
  const page = data?.lanes?.[lane];
  if (work.loadingMore || !page?.partial) return;
  const request = work.listRequest;
  work.loadingMore = true;
  renderWork();
  try {
    let next = page;
    const pages = await Promise.all(Object.entries(page.cursors).map(([team, after]) => api(`/api/ploeg/work-items?${new URLSearchParams({ team, state: lane, after })}`).then(result => [team, result])));
    if (request !== work.listRequest || !visible()) return;
    for (const [team, result] of pages) next = appendPage(next, team, result);
    data.lanes[lane] = next;
  } catch (error) { if (state.bootstrap) notify(error.message, true); }
  finally { work.loadingMore = false; renderWork(); }
}

function closeDetail() {
  location.hash = listHash();
}

async function copyLink(button) {
  const url = `${location.origin}${location.pathname}#work/${button.dataset.id}`;
  try { await navigator.clipboard.writeText(url); notify('Link copied'); }
  catch { notify(`Copy did not work. The link is ${url}`, true); }
}

function openCancel() {
  const detail = state.ploegDetail;
  if (!detail || !canCancel()) return;
  const dialog = $('#confirm-dialog');
  const previousClass = dialog.className;
  const demo = Boolean(detail.demo || state.bootstrap?.mode === 'demo');
  dialog.className = 'dialog work-cancel-dialog';
  dialog.innerHTML = cancelDialogMarkup(detail, { demo });
  dialog.returnValue = '';
  dialog.addEventListener('close', () => {
    dialog.className = previousClass;
    if (dialog.returnValue === 'cancel' && !demo) void submitCancel(detail.item.id);
    else $('[data-action="work-cancel"]')?.focus();
  }, { once: true });
  dialog.showModal();
}

async function submitCancel(id) {
  work.cancelBusy = true;
  work.cancelResult = null;
  renderWork();
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
    work.cancelResult = { id, ...result };
    notify(result.withdrawn ? 'Cancelled. Ploeg withdrew the Work Item.' : 'Ploeg answered the cancel.');
  } catch (error) {
    work.cancelResult = { id, error: error.message };
    notify(error.message, true);
  } finally {
    work.cancelBusy = false;
    if (visible() && work.detailId === id) {
      await Promise.all([loadOverview({ fresh: true, quiet: true }).catch(() => {}), loadDetail(id, { fresh: true, quiet: true }).catch(() => {})]);
      renderWork();
    }
  }
}

function toggleBrief() {
  const id = work.detailId;
  if (!id) return;
  if (work.briefOpen.has(id)) work.briefOpen.delete(id); else work.briefOpen.add(id);
  renderWork();
  $('[data-action="work-brief"]')?.focus();
}

function jumpToRun(button) {
  const run = document.getElementById(`work-run-${button.dataset.id}`);
  if (!run) return;
  const more = run.closest('details:not(.work-run)');
  if (more) more.open = true;
  run.open = true;
  run.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  run.querySelector('summary')?.focus({ preventScroll: true });
}

function openLinkOut() {
  const detail = state.ploegDetail;
  if (!detail || detail.item.id !== work.detailId) return false;
  const link = document.querySelector('.work-actions a[href^="http"], .work-sticky-actions a[href^="http"]');
  const url = link && safeUrl(link.href);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

function moveRow(step) {
  const rows = [...document.querySelectorAll('.work-list-pane [data-work-row]')];
  if (!rows.length) return false;
  const current = rows.indexOf(document.activeElement);
  const selected = rows.findIndex(row => row.getAttribute('aria-current') === 'true');
  const from = current !== -1 ? current : selected;
  const next = from === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, from + step));
  rows[next].focus();
  rows[next].scrollIntoView({ block: 'nearest' });
  return true;
}

function workKeys(event) {
  if (state.view !== 'work' || event.defaultPrevented) return false;
  if (event.key === 'Escape') {
    if (!work.detailId || document.querySelector('dialog[open]') || document.querySelector('.app-user-menu:not([hidden])') || isTyping(event.target)) return false;
    event.preventDefault();
    closeDetail();
    return true;
  }
  if (!['j', 'k', 'o'].includes(event.key) || !singleKeyAllowed(event)) return false;
  if (event.key === 'o') { if (!openLinkOut()) return false; event.preventDefault(); return true; }
  if (!moveRow(event.key === 'j' ? 1 : -1)) return false;
  event.preventDefault();
  return true;
}

/**
 * Work: the Work Items of one Team or all Teams by lane (`#work?lane=&team=`, the Team remembered per browser),
 * and one Work Item's decision, evidence and history (`#work/<id>`), beside the list on wide screens. Refreshes
 * every 30 s while on screen. `j`/`k` move between rows, `o` opens the pull request or tracker task, Esc closes.
 */
export default {
  id: 'work',
  match: hash => { if (hash === 'work') return {}; const item = itemPath.exec(hash); return item ? { id: item[1] } : null; },
  enter: enterWork,
  render: renderWork,
  actions: {
    'ploeg-refresh': () => Promise.all([loadOverview({ fresh: true, quiet: Boolean(state.ploeg?.available) }).catch(error => notify(error.message, true)), work.detailId ? loadDetail(work.detailId, { fresh: true, quiet: Boolean(state.ploegDetail) }).catch(error => notify(error.message, true)) : null]),
    'ploeg-close': () => closeDetail(),
    'ploeg-lane': selectLane,
    'ploeg-more': () => loadMore(),
    'work-detail-retry': () => work.detailId && loadDetail(work.detailId, { fresh: true }),
    'work-copy-link': copyLink,
    'work-cancel': () => openCancel(),
    'work-brief': () => toggleBrief(),
    'work-run': jumpToRun,
  },
  changes: {
    '#ploeg-team': changeTeam,
  },
  keys: [workKeys],
};

