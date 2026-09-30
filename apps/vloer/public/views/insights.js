import { overviewMarkup, ploegWindows } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { live } from '../core/live.js';
import { shell } from '../shell.js';
import { enterPloegView, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible } from './ploeg-common.js';

const windows = ploegWindows.map(([id]) => id);

function renderInsights() {
  renderHtml(shell(overviewMarkup(state.ploegSummary, ploegHelpers()), { title: 'Insights', subtitle: 'Work and spend per Team, from Ploeg’s summary.' }));
}

async function loadSummary(fresh = false) {
  const view = state.ploegSummary;
  const request = ++state.ploegRequest;
  view.loading = true; renderInsights();
  try { const data = await api(`/api/ploeg/summary?window=${encodeURIComponent(view.window)}${fresh ? '&refresh=1' : ''}`); if (request !== state.ploegRequest) return; view.data = data; view.error = null; live.touch('insights'); }
  catch (error) { if (request !== state.ploegRequest) return; view.data = null; view.error = ploegFailure(error); }
  finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('insights')) renderInsights(); } }
}

async function enterInsights({ query = {} } = {}) {
  enterPloegView('insights');
  state.ploegSummary.window = windows.includes(query.window) ? query.window : windows[0];
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadSummary();
}

async function selectWindow(button) {
  if (!windows.includes(button.dataset.id)) return;
  state.ploegSummary.window = button.dataset.id;
  history.replaceState(null, '', `#${buildHash('insights', { window: button.dataset.id })}`);
  await loadSummary();
}

onPloegReload('insights', () => loadSummary(true));

/** Insights: Work Item counts, Run counts and settled spend per Team for a 24 hour, 7 day or 30 day window (`#insights?window=`). */
export default {
  id: 'insights',
  match: hash => hash === 'insights' ? {} : null,
  enter: enterInsights,
  render: renderInsights,
  actions: { 'ploeg-window': selectWindow },
};
