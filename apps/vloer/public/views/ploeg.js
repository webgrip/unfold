import { ploegMarkup, ploegLanes, activePloegLane } from '../ploeg.js';
import { activityMarkup, mergeFeed, overviewMarkup, ploegTabsMarkup, proposedMarkup, runFilter, runsMarkup } from '../ploeg-activity.js';
import { state, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, safeUrl, renderHtml, notify } from '../core/dom.js';
import { money, ago } from '../core/format.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';
import { confirmAction, openWorkItemRejectDialog } from './dialogs.js';

function renderPloeg() {
  const helpers = { escape, icon, money, safeUrl, ago };
  const tab = state.ploegTab;
  const teams = state.ploegTeams || [];
  const content = tab === 'overview' ? overviewMarkup(state.ploegSummary, helpers) : tab === 'activity' ? activityMarkup(state.ploegFeed, teams, helpers) : tab === 'runs' ? runsMarkup(state.ploegRuns, teams, helpers) : tab === 'proposed' ? proposedMarkup(state.ploegProposed, state.bootstrap.user, helpers) : ploegMarkup(state, helpers);
  renderHtml(shell(`${ploegTabsMarkup(tab, activePloegLane(state), helpers)}${content}`, 'Ploeg', 'The work in motion. The decisions that need you.'));
}

const ploegVisible = tab => Boolean(state.bootstrap) && state.view === 'ploeg' && state.ploegTab === tab;
const ploegFailure = error => ({ message: error.message, code: error.code || '' });

async function openPloeg(path) {
  const lane = /^lane\/([a-z_]+)$/.exec(path);
  if (/^[1-9][0-9]{0,19}$/.test(path)) { state.ploegTab = 'lanes'; return await loadPloeg(state.ploeg?.selectedTeam, path); }
  if (path === 'work' || (lane && ploegLanes.some(([id]) => id === lane[1]))) { state.ploegTab = 'lanes'; if (lane) state.ploegLane = lane[1]; return await loadPloeg(state.ploeg?.selectedTeam); }
  state.ploegTab = ['activity', 'runs', 'proposed'].includes(path) ? path : 'overview';
  if (state.ploegTeams === null) void loadPloegTeams();
  if (state.ploegTab === 'activity') state.ploegTimer = setInterval(() => { if (document.visibilityState === 'visible' && ploegVisible('activity') && !state.ploegFeed.loading && !document.querySelector('dialog[open]')) void loadFeed('newer'); }, 15000);
  return await loadPloegTab();
}

async function loadPloegTab(fresh = false) {
  if (state.ploegTab === 'overview') return await loadSummary(fresh);
  if (state.ploegTab === 'activity') return await loadFeed('reset', fresh);
  if (state.ploegTab === 'runs') return await loadRuns('reset', fresh);
  if (state.ploegTab === 'proposed') return await loadProposed(fresh);
}

async function loadPloegTeams() {
  try { state.ploegTeams = (await api('/api/ploeg/teams')).teams; } catch { state.ploegTeams = []; }
  if (['activity', 'runs'].some(ploegVisible) && !state.ploegFeed.loading && !state.ploegRuns.loading) renderPloeg();
}

async function loadSummary(fresh = false) {
  const view = state.ploegSummary;
  const request = ++state.ploegRequest;
  view.loading = true; renderPloeg();
  try { const data = await api(`/api/ploeg/summary?window=${encodeURIComponent(view.window)}${fresh ? '&refresh=1' : ''}`); if (request !== state.ploegRequest) return; view.data = data; view.error = null; }
  catch (error) { if (request !== state.ploegRequest) return; view.data = null; view.error = ploegFailure(error); }
  finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('overview')) renderPloeg(); } }
}

function keepReadingPosition(render) {
  const anchor = window.scrollY > 0 ? [...document.querySelectorAll('[data-event-id]')].find(row => row.getBoundingClientRect().top >= 0) : null;
  const before = anchor?.getBoundingClientRect().top;
  render();
  const after = anchor && document.getElementById(anchor.id)?.getBoundingClientRect().top;
  if (anchor && after !== undefined) window.scrollBy(0, after - before);
}

async function loadFeed(mode = 'reset', fresh = false) {
  const feed = state.ploegFeed;
  if (feed.loading && mode !== 'reset') return;
  const request = mode === 'reset' ? ++state.ploegRequest : state.ploegRequest;
  feed.loading = true;
  if (mode === 'reset') { feed.events = null; feed.nextCursor = null; feed.error = null; }
  if (mode !== 'newer') renderPloeg();
  const query = new URLSearchParams();
  if (feed.team) query.set('team', feed.team);
  if (mode === 'older') query.set('before', feed.nextCursor);
  if (fresh || mode === 'newer') query.set('refresh', '1');
  try {
    const page = await api(`/api/ploeg/events?${query}`);
    if (request !== state.ploegRequest) return;
    const merged = mergeFeed(mode === 'reset' ? null : feed, page, mode === 'older' ? 'older' : 'newer');
    Object.assign(feed, { events: merged.events, nextCursor: merged.nextCursor, demo: page.demo, error: null, refreshedAt: page.fetchedAt });
  } catch (error) { if (request !== state.ploegRequest) return; feed.error = ploegFailure(error); }
  finally { if (request === state.ploegRequest) { feed.loading = false; if (ploegVisible('activity')) { if (mode === 'newer') keepReadingPosition(renderPloeg); else renderPloeg(); } } }
}

async function loadRuns(mode = 'reset', fresh = false) {
  const view = state.ploegRuns;
  if (view.loading && mode === 'older') return;
  const request = mode === 'reset' ? ++state.ploegRequest : state.ploegRequest;
  view.loading = true;
  if (mode === 'reset') { view.runs = null; view.nextBefore = null; view.error = null; }
  renderPloeg();
  const query = new URLSearchParams(Object.entries(runFilter(view.filter)).filter(([, value]) => value));
  if (mode === 'older') query.set('before', view.nextBefore);
  if (fresh) query.set('refresh', '1');
  try {
    const page = await api(`/api/ploeg/runs?${query}`);
    if (request !== state.ploegRequest) return;
    const seen = new Set((view.runs || []).map(run => run.id));
    view.runs = mode === 'older' ? [...view.runs, ...page.runs.filter(run => !seen.has(run.id))] : page.runs;
    Object.assign(view, { nextBefore: page.nextBefore, demo: page.demo, error: null });
  } catch (error) { if (request !== state.ploegRequest) return; view.error = ploegFailure(error); }
  finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('runs')) renderPloeg(); } }
}

async function loadProposed(fresh = false) {
  const view = state.ploegProposed;
  const request = ++state.ploegRequest;
  view.loading = true; renderPloeg();
  try { const page = await api(`/api/ploeg/proposed${fresh ? '?refresh=1' : ''}`); if (request !== state.ploegRequest) return; Object.assign(view, { items: page.items, truncated: page.truncated, demo: page.demo, error: null }); }
  catch (error) { if (request !== state.ploegRequest) return; view.error = ploegFailure(error); }
  finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('proposed')) renderPloeg(); } }
}

async function decidePloeg(id, decision, reason = '') {
  const view = state.ploegProposed;
  if (view.busy) return;
  view.busy = true; if (ploegVisible('proposed')) renderPloeg();
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/${decision}`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });
    notify(result.demo ? 'Recorded in this demo only. Nothing was dispatched.' : decision === 'approve' ? 'Approved. Ploeg queued the Work Item for its Team.' : 'Rejected. Ploeg recorded your reason.');
  } catch (error) { notify(error.message, true); }
  finally { view.busy = false; if (ploegVisible('proposed')) await loadProposed(true); }
}

async function loadPloeg(team, id, fresh = false) {
  const request = ++state.ploegRequest;
  state.ploegLoading = true;
  state.ploegDetailLoading = Boolean(id);
  state.ploegDetail = null;
  state.ploegDetailError = '';
  state.ploeg = null;
  renderPloeg();
  try {
    let detail;
    if (id) {
      try { detail = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}${fresh ? '?refresh=1' : ''}`); }
      catch (error) { if (request !== state.ploegRequest || !state.bootstrap) return; state.ploegDetailError = error.message; }
    }
    if (request !== state.ploegRequest || !state.bootstrap) return;
    const query = new URLSearchParams();
    if (detail?.item.team || team) query.set('team', detail?.item.team || team);
    if (fresh) query.set('refresh', '1');
    const [data, sessions] = await Promise.all([api(`/api/ploeg?${query}`), api('/api/sessions')]);
    if (request !== state.ploegRequest || state.view !== 'ploeg' || !state.bootstrap) return;
    state.ploeg = data;
    state.sessions = sessions;
    state.ploegDetail = data.available ? detail || null : null;
  } catch (error) {
    if (request !== state.ploegRequest || state.view !== 'ploeg' || !state.bootstrap) return;
    state.ploeg = { configured: true, available: false, demo: false, teams: [], message: error.message };
  } finally {
    if (request === state.ploegRequest && state.view === 'ploeg' && state.bootstrap) {
      state.ploegLoading = false; state.ploegDetailLoading = false; renderPloeg();
      if (state.ploegDetail) $('#ploeg-item-title')?.focus({ preventScroll: true });
    }
  }
}

async function loadMorePloeg() {
  const lane = activePloegLane(state);
  const data = state.ploeg;
  const page = data?.lanes?.[lane];
  if (state.ploegLoading || !page?.nextCursor) return;
  const request = state.ploegRequest;
  state.ploegLoading = true; renderPloeg();
  try {
    const query = new URLSearchParams({ team: data.selectedTeam, state: lane, after: page.nextCursor });
    const next = await api(`/api/ploeg/work-items?${query}`);
    if (request !== state.ploegRequest || !state.bootstrap) return;
    const seen = new Set(page.items.map(item => item.id));
    page.items.push(...next.items.filter(item => !seen.has(item.id)));
    page.nextCursor = next.nextCursor;
  } catch (error) { if (state.bootstrap) notify(error.message, true); }
  finally { if (request === state.ploegRequest && state.bootstrap) { state.ploegLoading = false; if (state.view === 'ploeg') renderPloeg(); } }
}

async function enterPloeg({ path }) { disconnect(); state.session = null; state.view = 'ploeg'; return await openPloeg(path); }

async function selectWindow(button) { if (!['24h', '7d', '30d'].includes(button.dataset.id)) return; state.ploegSummary.window = button.dataset.id; await loadSummary(); }

function selectLane(button) { if (!ploegLanes.some(([id]) => id === button.dataset.id)) return; state.ploegLane = button.dataset.id; renderPloeg(); }

function confirmApproval(button) { const id = button.dataset.id; confirmAction('Approve this Work Item?', 'Ploeg queues it for its Team. Its Runs can then spend from the Team’s budget.', 'Approve', () => decidePloeg(id, 'approve')); }

async function rejectWorkItem(data, form) { $('#confirm-dialog').close(); await decidePloeg(form.dataset.id, 'reject', data.reason); }

function filterRuns(field, element) { state.ploegRuns.filter = runFilter({ ...state.ploegRuns.filter, [field]: element.value }); void loadRuns('reset'); }

/** The Ploeg area: overview, activity, runs, proposed work, the work lanes and a Work Item's detail. */
export default {
  id: 'ploeg',
  match: hash => hash === 'ploeg' || hash.startsWith('ploeg/') ? { path: hash.slice(6) } : null,
  enter: enterPloeg,
  render: renderPloeg,
  actions: {
    'ploeg-refresh': () => loadPloeg(state.ploeg?.selectedTeam, /^#ploeg\/([1-9][0-9]{0,19})$/.exec(location.hash)?.[1], true),
    'ploeg-item': button => { location.hash = `ploeg/${button.dataset.id}`; },
    'ploeg-close': () => { location.hash = `ploeg/lane/${activePloegLane(state)}`; },
    'ploeg-reload': () => loadPloegTab(true),
    'ploeg-window': selectWindow,
    'ploeg-feed-older': () => loadFeed('older'),
    'ploeg-runs-older': () => loadRuns('older'),
    'ploeg-approve': confirmApproval,
    'ploeg-reject': button => openWorkItemRejectDialog(button.dataset.id),
    'ploeg-lane': selectLane,
    'ploeg-more': () => loadMorePloeg(),
  },
  forms: { 'ploeg-reject': rejectWorkItem },
  changes: {
    '#ploeg-team': element => { history.replaceState(null, '', '#ploeg/work'); state.ploegLane = null; loadPloeg(element.value); },
    '#ploeg-feed-team': element => { state.ploegFeed.team = element.value; void loadFeed('reset'); },
    '#ploeg-feed-kind': element => { state.ploegFeed.kind = element.value; renderPloeg(); },
    '#ploeg-runs-team': element => filterRuns('team', element),
    '#ploeg-runs-state': element => filterRuns('state', element),
    '#ploeg-runs-outcome': element => filterRuns('outcome', element),
  },
};
