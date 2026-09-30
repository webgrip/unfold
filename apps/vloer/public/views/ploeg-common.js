import { state, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, safeUrl } from '../core/dom.js';
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

/** The page-header Refresh button of Insights, Activity, Runs and Proposed. It keeps its label while `busy`. */
export function refreshButton(busy = false) {
  return `<button type="button" class="button secondary" id="ploeg-refresh" data-action="ploeg-reload"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')}<span class="button-label">Refresh</span></button>`;
}

/** Fills and opens the shared `#confirm-dialog` with `markup`, styled as a dialog, and returns it. */
export function openPloegDialog(markup) {
  const dialog = $('#confirm-dialog');
  dialog.className = 'dialog';
  dialog.innerHTML = markup;
  dialog.returnValue = '';
  dialog.showModal();
  return dialog;
}

/** The Refresh and Try again action shared by Insights, Activity, Runs and Proposed, and the close button of their dialogs. */
export default {
  id: 'ploeg-feeds',
  actions: {
    'ploeg-reload': () => reloaders.get(state.view)?.(),
    'ploeg-dialog-close': () => $('#confirm-dialog')?.close(),
  },
};
