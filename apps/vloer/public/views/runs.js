import { runFilter, runsMarkup } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { runOutcomes, runStates } from '../core/states.js';
import { shell } from '../shell.js';
import { enterPloegView, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible } from './ploeg-common.js';

function renderRuns() {
  renderHtml(shell(runsMarkup(state.ploegRuns, state.ploegTeams || [], ploegHelpers()), { title: 'Runs', subtitle: 'Each Run is one Role working once on a Work Item.' }));
}

async function loadRuns(mode = 'reset', fresh = false) {
  const view = state.ploegRuns;
  if (view.loading && mode === 'older') return;
  const request = mode === 'reset' ? ++state.ploegRequest : state.ploegRequest;
  view.loading = true;
  if (mode === 'reset') { view.runs = null; view.nextBefore = null; view.error = null; }
  renderRuns();
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
  finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('runs')) renderRuns(); } }
}

function filterRuns(field, element) {
  state.ploegRuns.filter = runFilter({ ...state.ploegRuns.filter, [field]: element.value });
  history.replaceState(null, '', `#${buildHash('runs', state.ploegRuns.filter)}`);
  void loadRuns('reset');
}

async function enterRuns({ query = {} } = {}) {
  enterPloegView('runs');
  state.ploegRuns.filter = runFilter({ team: query.team, state: Object.hasOwn(runStates, query.state ?? '') ? query.state : '', outcome: Object.hasOwn(runOutcomes, query.outcome ?? '') ? query.outcome : '' });
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadRuns('reset');
}

onPloegReload('runs', () => loadRuns('reset', true));

/** Runs: the Run history across your Teams, newest first, filtered by Team, state and outcome (`#runs?team=&state=&outcome=`). */
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
