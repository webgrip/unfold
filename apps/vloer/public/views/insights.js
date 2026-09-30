import { overviewMarkup, ploegWindows } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { live } from '../core/live.js';
import { shell } from '../shell.js';
import { enterPloegView, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible, refreshButton } from './ploeg-common.js';

const windows = ploegWindows.map(([id]) => id);

function renderInsights() {
  const view = state.ploegSummary;
  renderHtml(shell(overviewMarkup(view, ploegHelpers()), { title: 'Insights', subtitle: 'Throughput and spend per Team, and where the work stands now.', actions: refreshButton(view.loading) }));
}

async function loadSummary({ fresh = false, quiet = false } = {}) {
  const view = state.ploegSummary;
  if (quiet && view.loading) return;
  const request = quiet ? state.ploegRequest : ++state.ploegRequest;
  view.loading = true;
  if (!quiet) renderInsights();
  try {
    const data = await api(`/api/ploeg/summary?window=${encodeURIComponent(view.window)}${fresh ? '&refresh=1' : ''}`);
    if (request !== state.ploegRequest) return;
    view.data = data; view.error = null;
    live.touch('insights');
  } catch (error) {
    if (request !== state.ploegRequest) return;
    view.error = ploegFailure(error);
    if (quiet) throw error;
  } finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('insights')) renderInsights(); } }
}

async function enterInsights({ query = {} } = {}) {
  enterPloegView('insights');
  const window = windows.includes(query.window) ? query.window : state.ploegSummary.window || windows[0];
  if (window !== state.ploegSummary.window || state.ploegSummary.data?.window !== window) state.ploegSummary.data = null;
  state.ploegSummary.window = window;
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadSummary();
}

async function selectWindow(button) {
  if (!windows.includes(button.dataset.id) || button.dataset.id === state.ploegSummary.window) return;
  state.ploegSummary.window = button.dataset.id;
  state.ploegSummary.data = null;
  state.ploegSummary.error = null;
  history.replaceState(null, '', `#${buildHash('insights', { window: button.dataset.id })}`);
  await loadSummary();
}

onPloegReload('insights', () => loadSummary({ fresh: true }));
live.register('insights', { interval: 60000, refresh: () => loadSummary({ fresh: true, quiet: true }) });

/** Insights: Run counts and spend per Team for a 24 hour, 7 day or 30 day window, and Work Items per state right now (`#insights?window=`). Refreshes every minute. */
export default {
  id: 'insights',
  match: hash => hash === 'insights' ? {} : null,
  enter: enterInsights,
  render: renderInsights,
  actions: { 'ploeg-window': selectWindow },
};
