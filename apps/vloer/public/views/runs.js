import { freshRuns, mergeRuns, runFilter, runsMarkup } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { runOutcomes, runStates } from '../core/states.js';
import { live } from '../core/live.js';
import { shell } from '../shell.js';
import { editing, enterPloegView, liveRefresh, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible, refreshButton, settle, track } from './ploeg-common.js';

function renderRuns() {
  const view = state.ploegRuns;
  const actions = refreshButton({ busy: view.mode === 'reset' || view.mode === 'refresh', shown: Boolean(view.runs) || !view.error });
  renderHtml(shell(runsMarkup(view, state.ploegTeams || [], ploegHelpers()), { title: 'Runs', subtitle: 'Each Run is one Role working once on a Work Item. Running work first, then newest.', actions }));
}

function query(view, { before, fresh } = {}) {
  const params = new URLSearchParams(Object.entries(runFilter(view.filter)).filter(([, value]) => value));
  if (before) params.set('before', before);
  if (fresh) params.set('refresh', '1');
  return params;
}

const signature = view => JSON.stringify([view.runs, view.nextBefore, view.demo, view.error]);

async function load(mode) {
  const view = state.ploegRuns;
  const request = ++state.ploegRequest;
  view.mode = mode;
  view.loading = true;
  if (mode === 'reset') Object.assign(view, { runs: null, nextBefore: null, error: null });
  renderRuns();
  try {
    const page = await api(`/api/ploeg/runs?${query(view, { fresh: mode === 'refresh' })}`);
    if (request !== state.ploegRequest) return;
    Object.assign(view, mode === 'refresh' ? freshRuns(view, page) : { runs: page.runs, nextBefore: page.nextBefore }, { demo: page.demo, error: null, loadedAt: Date.now() });
    live.touch('runs');
  } catch (error) {
    if (request !== state.ploegRequest) return;
    view.error = ploegFailure(error);
  } finally {
    if (request === state.ploegRequest) { view.mode = null; view.loading = false; if (ploegVisible('runs')) renderRuns(); }
  }
}

const loadRuns = mode => track('runs', load(mode));

async function loadOlder() {
  const view = state.ploegRuns;
  if (view.mode || !view.nextBefore) return;
  const request = state.ploegRequest;
  view.mode = 'older';
  view.loading = true;
  renderRuns();
  try {
    const page = await api(`/api/ploeg/runs?${query(view, { before: view.nextBefore })}`);
    if (request !== state.ploegRequest) return;
    Object.assign(view, { runs: mergeRuns(view.runs, page.runs), nextBefore: page.nextBefore, error: null });
  } catch (error) {
    if (request !== state.ploegRequest) return;
    view.error = ploegFailure(error);
  } finally {
    if (request === state.ploegRequest) { view.mode = null; view.loading = false; if (ploegVisible('runs')) renderRuns(); }
  }
}

async function poll() {
  const view = state.ploegRuns;
  const request = state.ploegRequest;
  const before = signature(view);
  let page;
  try { page = await api(`/api/ploeg/runs?${query(view, { fresh: true })}`); }
  catch (error) {
    if (request !== state.ploegRequest) return settle('runs');
    view.error = ploegFailure(error);
    if (ploegVisible('runs') && signature(view) !== before) renderRuns();
    throw error;
  }
  if (request !== state.ploegRequest) return settle('runs');
  Object.assign(view, freshRuns(view, page), { demo: page.demo, error: null, loadedAt: Date.now() });
  const running = view.runs.some(run => run.state === 'running');
  if (ploegVisible('runs') && (signature(view) !== before || (running && !editing()))) renderRuns();
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

onPloegReload('runs', () => loadRuns(state.ploegRuns.runs ? 'refresh' : 'reset'));
live.register('runs', { interval: 30000, refresh: liveRefresh('runs', poll, () => state.ploegRuns.error) });

/** Runs: the Run history across your Teams, running work first, filtered by Team, state and outcome (`#runs?team=&state=&outcome=`). Refreshes every 30 seconds. */
export default {
  id: 'runs',
  match: hash => hash === 'runs' ? {} : null,
  enter: enterRuns,
  render: renderRuns,
  actions: { 'ploeg-runs-older': loadOlder },
  changes: {
    '#ploeg-runs-team': element => filterRuns('team', element),
    '#ploeg-runs-state': element => filterRuns('state', element),
    '#ploeg-runs-outcome': element => filterRuns('outcome', element),
  },
};
