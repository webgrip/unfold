import { state, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, safeUrl } from '../core/dom.js';
import { money, ago } from '../core/format.js';
import { icon } from '../core/icons.js';
import { render } from '../core/navigation.js';

const reloaders = new Map();
const flights = new Map();

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
  if ((ploegVisible('activity') || ploegVisible('runs')) && !state.ploegFeed.loading && !state.ploegRuns.loading && !editing()) render();
}

/** Registers what "Try again" and Refresh (`ploeg-reload`) do while the view `id` is on screen. */
export function onPloegReload(id, reload) { reloaders.set(id, reload); }

/** Whether someone is working in a form control on the page, so a background redraw would close or reset it. */
export function editing() {
  const active = globalThis.document?.activeElement;
  return Boolean(active?.matches?.('select, input, textarea') && active.closest('#main'));
}

/** Remembers `promise` as the load a person started on the view `id` until it settles, and returns it. */
export function track(id, promise) {
  flights.set(id, promise);
  const clear = () => { if (flights.get(id) === promise) flights.delete(id); };
  promise.then(clear, clear);
  return promise;
}

/** Waits for the load a person started on the view `id`, if one is running. */
export async function settle(id) {
  const pending = flights.get(id);
  if (pending) await pending;
}

/**
 * Wraps the quiet refresh `poll` of the Ploeg view `id` for the live scheduler. A load a person started runs to its
 * end instead of racing the refresh. It resolves to `false` (nothing read, nothing failed) when the view left the
 * screen meanwhile, and rejects when `failure()` reports an error, so the status strip never says "Updated" for data
 * Unfold did not read.
 */
export function liveRefresh(id, poll, failure) {
  return async () => {
    if (flights.has(id)) await settle(id);
    else await poll();
    if (!ploegVisible(id)) return false;
    const error = failure();
    if (error) throw new Error(error.message || 'Ploeg did not answer.');
  };
}

/**
 * The page-header Refresh button of Insights, Activity, Runs and Proposed: the one icon button every live page uses.
 * `shown: false` leaves it out while the page shows its own Try again.
 */
export function refreshButton({ busy = false, shown = true } = {}) {
  if (!shown) return '';
  return `<button type="button" class="button secondary icon-only" id="ploeg-refresh" data-action="ploeg-reload" aria-label="Refresh" title="Refresh"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')}</button>`;
}

/** Fills and opens the shared `#confirm-dialog` with `markup` as a component dialog, and restores its classes when it closes. */
export function openPloegDialog(markup) {
  const dialog = $('#confirm-dialog');
  const classes = dialog.getAttribute('class');
  dialog.className = 'dialog';
  dialog.innerHTML = markup;
  dialog.returnValue = '';
  dialog.addEventListener('close', () => { if (classes === null) dialog.removeAttribute('class'); else dialog.setAttribute('class', classes); }, { once: true });
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
