import { ploegMarkup, ploegLanes, activePloegLane } from '../ploeg.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, renderHtml, notify } from '../core/dom.js';
import { buildHash, parseHash } from '../core/route.js';
import { live } from '../core/live.js';
import { prefs } from '../core/prefs.js';
import { shell } from '../shell.js';
import { enterPloegView, ploegHelpers } from './ploeg-common.js';

const lanes = ploegLanes.map(([id]) => id);
const openItem = () => /^work\/([1-9][0-9]{0,19})$/.exec(parseHash(location.hash).path)?.[1];

function renderWork() {
  renderHtml(shell(ploegMarkup(state, ploegHelpers()), { title: 'Work', subtitle: 'The Work Items of a Team, by lane, with their execution evidence.' }));
}

function keepFiltersInHash() {
  const id = openItem();
  history.replaceState(null, '', `#${buildHash(id ? `work/${id}` : 'work', { lane: state.ploegLane, team: state.ploeg?.selectedTeam })}`);
}

async function loadPloeg(team, id, fresh = false) {
  const request = ++state.ploegRequest;
  state.ploegLoading = true;
  state.ploegDetailLoading = Boolean(id);
  state.ploegDetail = null;
  state.ploegDetailError = '';
  state.ploeg = null;
  renderWork();
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
    if (request !== state.ploegRequest || state.view !== 'work' || !state.bootstrap) return;
    state.ploeg = data;
    state.sessions = sessions;
    state.ploegDetail = data.available ? detail || null : null;
    if (data.available) live.touch();
  } catch (error) {
    if (request !== state.ploegRequest || state.view !== 'work' || !state.bootstrap) return;
    if (error.code === 'ploeg_not_found' && team && team === prefs.get('team')) { prefs.set('team', null); void loadPloeg(undefined, id, fresh); return; }
    state.ploeg = { configured: true, available: false, demo: false, teams: [], message: error.message };
  } finally {
    if (request === state.ploegRequest && state.view === 'work' && state.bootstrap) {
      state.ploegLoading = false; state.ploegDetailLoading = false; renderWork();
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
  state.ploegLoading = true; renderWork();
  try {
    const query = new URLSearchParams({ team: data.selectedTeam, state: lane, after: page.nextCursor });
    const next = await api(`/api/ploeg/work-items?${query}`);
    if (request !== state.ploegRequest || !state.bootstrap) return;
    const seen = new Set(page.items.map(item => item.id));
    page.items.push(...next.items.filter(item => !seen.has(item.id)));
    page.nextCursor = next.nextCursor;
  } catch (error) { if (state.bootstrap) notify(error.message, true); }
  finally { if (request === state.ploegRequest && state.bootstrap) { state.ploegLoading = false; if (state.view === 'work') renderWork(); } }
}

async function enterWork({ id, query = {} } = {}) {
  enterPloegView('work');
  if (lanes.includes(query.lane)) state.ploegLane = query.lane;
  else if (!id) state.ploegLane = null;
  return await loadPloeg(query.team || state.ploeg?.selectedTeam || prefs.get('team') || undefined, id);
}

function selectLane(button) {
  if (!lanes.includes(button.dataset.id)) return;
  state.ploegLane = button.dataset.id;
  keepFiltersInHash();
  renderWork();
}

/** Work: a Team's Work Items by lane (`#work?lane=&team=`, the Team remembered per browser) and one Work Item's execution evidence (`#work/<id>`). */
export default {
  id: 'work',
  match: hash => { if (hash === 'work') return {}; const item = /^work\/([1-9][0-9]{0,19})$/.exec(hash); return item ? { id: item[1] } : null; },
  enter: enterWork,
  render: renderWork,
  actions: {
    'ploeg-refresh': () => loadPloeg(state.ploeg?.selectedTeam, openItem(), true),
    'ploeg-item': button => { location.hash = `work/${button.dataset.id}`; },
    'ploeg-close': () => { location.hash = buildHash('work', { lane: activePloegLane(state), team: state.ploeg?.selectedTeam }); },
    'ploeg-lane': selectLane,
    'ploeg-more': () => loadMorePloeg(),
  },
  changes: {
    '#ploeg-team': element => { state.ploegLane = null; prefs.set('team', element.value); history.replaceState(null, '', `#${buildHash('work', { team: element.value })}`); loadPloeg(element.value); },
  },
};
