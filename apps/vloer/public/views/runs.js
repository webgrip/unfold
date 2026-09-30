import { mergeRuns, runFilter, runsMarkup } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { runOutcomes, runStates } from '../core/states.js';
import { live } from '../core/live.js';
import { shell } from '../shell.js';
import { enterPloegView, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible, refreshButton } from './ploeg-common.js';

function renderRuns() {
  const view = state.ploegRuns;
  renderHtml(shell(runsMarkup(view, state.ploegTeams || [], ploegHelpers()), { title: 'Runs', subtitle: 'Each Run is one Role working once on a Work Item. Running work first, then newest.', actions: refreshButton(view.loading && view.mode !== 'older') }));
}

function query(view, mode, fresh) {
  const params = new URLSearchParams(Object.entries(runFilter(view.filter)).filter(([, value]) => value));
  if (mode === 'older') params.set('before', view.nextBefore);
  if (fresh) params.set('refresh', '1');
  return params;
}

async function loadRuns(mode = 'reset', fresh = false) {
  const view = state.ploegRuns;
  if (view.loading && mode !== 'reset') return;
  const quiet = mode === 'live';
  const request = mode === 'reset' || mode === 'refresh' ? ++state.ploegRequest : state.ploegRequest;
  view.loading = true;
  view.mode = mode;
  if (mode === 'reset') { view.runs = null; view.nextBefore = null; view.error = null; }
  if (!quiet) renderRuns();
  try {
    const page = await api(`/api/ploeg/runs?${query(view, mode, fresh || quiet)}`);
    if (request !== state.ploegRequest) return;
    if (mode === 'older') view.runs = mergeRuns(view.runs, page.runs);
    else if (mode === 'live' && view.runs) view.runs = mergeRuns(view.runs, page.runs);
    else { view.runs = page.runs; view.nextBefore = page.nextBefore; }
    if (mode === 'older') view.nextBefore = page.nextBefore;
    Object.assign(view, { demo: page.demo, error: null });
    live.touch('runs');
  } catch (error) {
    if (request !== state.ploegRequest) return;
    view.error = ploegFailure(error);
    if (quiet) throw error;
  } finally { if (request === state.ploegRequest) { view.loading = false; view.mode = null; if (ploegVisible('runs')) renderRuns(); } }
}

function filterRuns(field, element) {
  state.ploegRuns.filter = runFilter({ ...state.ploegRuns.filter, [field]: element.value });
  history.replaceState(null, '', `#${buildHash('runs', state.ploegRuns.filter)}`);
  void loadRuns('reset');
}

async function enterRuns({ query: hash = {} } = {}) {
  enterPloegView('runs');
  state.ploegRuns.filter = runFilter({ team: hash.team, state: Object.hasOwn(runStates, hash.state ?? '') ? hash.state : '', outcome: Object.hasOwn(runOutcomes, hash.outcome ?? '') ? hash.outcome : '' });
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadRuns('reset');
}

onPloegReload('runs', () => loadRuns(state.ploegRuns.runs ? 'refresh' : 'reset', true));
live.register('runs', { interval: 30000, refresh: () => loadRuns('live') });

/** Runs: the Run history across your Teams, running work first, filtered by Team, state and outcome (`#runs?team=&state=&outcome=`). Refreshes every 30 seconds. */
export default {
  id: 'runs',
  match: hash => hash === 'runs' ? {} : null,
  enter: enterRuns,
  render: renderRuns,
  actions: { 'ploeg-runs-older': () => loadRuns('older') },
  changes: {
    '#ploeg-runs-team': element => filterRuns('team', element),
    '#ploeg-runs-state': element => filterRuns('state', element),
    '#ploeg-runs-outcome': element => filterRuns('outcome', element),
  },
};
