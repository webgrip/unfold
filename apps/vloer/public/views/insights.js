import { overviewMarkup, ploegWindows } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { live } from '../core/live.js';
import { shell } from '../shell.js';
import { enterPloegView, liveRefresh, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible, refreshButton, settle, track } from './ploeg-common.js';

const windows = ploegWindows.map(([id]) => id);

function renderInsights() {
  const view = state.ploegSummary;
  const actions = refreshButton({ busy: view.loading, shown: Boolean(view.data) || !view.error });
  renderHtml(shell(overviewMarkup(view, ploegHelpers()), { title: 'Insights', subtitle: 'Throughput and spend per Team, and where the work stands now.', actions }));
}

const summaryPath = (view, fresh) => `/api/ploeg/summary?window=${encodeURIComponent(view.window)}${fresh ? '&refresh=1' : ''}`;
const signature = view => { const { generatedAt, fetchedAt, ...data } = view.data || {}; return JSON.stringify([data, view.error]); };

async function load(fresh) {
  const view = state.ploegSummary;
  const request = ++state.ploegRequest;
  view.loading = true;
  renderInsights();
  try {
    const data = await api(summaryPath(view, fresh));
    if (request !== state.ploegRequest) return;
    Object.assign(view, { data, error: null, loadedAt: Date.now() });
    live.touch('insights');
  } catch (error) {
    if (request !== state.ploegRequest) return;
    view.error = ploegFailure(error);
  } finally {
    if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('insights')) renderInsights(); }
  }
}

const loadSummary = (fresh = false) => track('insights', load(fresh));

async function poll() {
  const view = state.ploegSummary;
  const request = state.ploegRequest;
  const before = signature(view);
  let data;
  try { data = await api(summaryPath(view, true)); }
  catch (error) {
    if (request !== state.ploegRequest) return settle('insights');
    view.error = ploegFailure(error);
    if (ploegVisible('insights') && signature(view) !== before) renderInsights();
    throw error;
  }
  if (request !== state.ploegRequest) return settle('insights');
  Object.assign(view, { data, error: null, loadedAt: Date.now() });
  if (ploegVisible('insights') && signature(view) !== before) renderInsights();
}

function keepWindowInHash(window) {
  const hash = `#${buildHash('insights', { window: window === windows[0] ? '' : window })}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

async function enterInsights({ query = {} } = {}) {
  enterPloegView('insights');
  const window = windows.includes(query.window) ? query.window : state.ploegSummary.window || windows[0];
  keepWindowInHash(window);
  if (window !== state.ploegSummary.window || state.ploegSummary.data?.window !== window) state.ploegSummary.data = null;
  state.ploegSummary.window = window;
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadSummary();
}

async function selectWindow(button) {
  if (!windows.includes(button.dataset.id) || button.dataset.id === state.ploegSummary.window) return;
  Object.assign(state.ploegSummary, { window: button.dataset.id, data: null, error: null });
  keepWindowInHash(button.dataset.id);
  await loadSummary();
}

onPloegReload('insights', () => loadSummary(true));
live.register('insights', { interval: 60000, refresh: liveRefresh('insights', poll, () => state.ploegSummary.error) });

/** Insights: Run counts and spend per Team for a 24 hour, 7 day or 30 day window, and Work Items per state right now (`#insights?window=`). Refreshes every minute. */
export default {
  id: 'insights',
  match: hash => hash === 'insights' ? {} : null,
  enter: enterInsights,
  render: renderInsights,
  actions: { 'ploeg-window': selectWindow },
};
