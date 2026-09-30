import { state, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, safeUrl } from '../core/dom.js';
import { money, ago } from '../core/format.js';
import { icon } from '../core/icons.js';
import { render } from '../core/navigation.js';

const reloaders = new Map();

/** The helpers the Ploeg markup modules expect. */
export function ploegHelpers() { return { escape, icon, money, safeUrl, ago }; }

/** Keeps a failed Ploeg read as `{ message, code }` for the notices. */
export const ploegFailure = error => ({ message: error.message, code: error.code || '' });

/** Whether the view `id` is the one on screen while signed in. */
export const ploegVisible = id => Boolean(state.bootstrap) && state.view === id;

/** Makes the Ploeg view `id` current: stops the session stream and polling and forgets the open session. */
export function enterPloegView(id) { disconnect(); state.session = null; state.view = id; }

/** Reads the Team ids once for the Team filters, then redraws Activity or Runs when neither list is loading. */
export async function loadPloegTeams() {
  try { state.ploegTeams = (await api('/api/ploeg/teams')).teams; } catch { state.ploegTeams = []; }
  if ((ploegVisible('activity') || ploegVisible('runs')) && !state.ploegFeed.loading && !state.ploegRuns.loading) render();
}

/** Registers what "Try again" and Refresh (`ploeg-reload`) do while the view `id` is on screen. */
export function onPloegReload(id, reload) { reloaders.set(id, reload); }

/** The Refresh and Try again action shared by Insights, Activity, Runs and Proposed. */
export default {
  id: 'ploeg-feeds',
  actions: { 'ploeg-reload': () => reloaders.get(state.view)?.() },
};
