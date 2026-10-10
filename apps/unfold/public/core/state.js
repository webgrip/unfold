/** The single mutable state object every view reads and writes. */
export const state = { deliveryRequest: 0, delivery: null, deliveryError: '', deliveryBusy: false, evidenceScroll: {}, bootstrap: null, sessions: [], session: null, events: [], permissions: [], view: 'now', focusHeading: false, counts: { waiting: null, review: null, needsYou: null, proposed: null, running: null, sessions: null }, ploegStatus: null, statusSignal: null, sessionExpired: false, epoch: 0, now: { data: null, error: null, loading: false, request: 0 }, tab: 'stream', filter: 'all', search: '', draft: '', stream: null, online: true, busy: false, refreshTimer: null, toastTimer: null, ploeg: null, ploegLane: null, ploegDetail: null, ploegDetailError: '', ploegDetailLoading: false, ploegLoading: false, ploegRequest: 0, ploegTeams: null, ploegTimer: null, ploegSummary: { window: '24h', data: null, error: null, loading: false }, ploegFeed: { events: null, nextCursor: null, team: '', kind: '', error: null, loading: false, refreshedAt: null, demo: false }, ploegRuns: { runs: null, nextBefore: null, filter: {}, error: null, loading: false, demo: false }, ploegProposed: { items: null, error: null, loading: false, busy: false, demo: false, truncated: false }, health: null, taskSourceId: '', tasks: [], task: null, taskPage: 1, taskNextPage: null, taskSearch: '', taskLoading: false, taskPreviewLoading: false, taskError: '', taskPreviewError: '', taskChanged: false, taskDraft: null, taskRequest: 0, previewRequest: 0, taskImporting: false };

const forgetters = new Set();

/**
 * Registers `reset`, which forgetUserData calls, so a view can clear the per-person state it keeps outside `state`.
 * Returns a function that removes it again.
 * @param {() => void} reset
 * @returns {() => void}
 */
export function onForget(reset) { forgetters.add(reset); return () => forgetters.delete(reset); }

/**
 * Forgets what was read for the signed-in person: the Now page, Ploeg lists and details, sessions, tasks, linked
 * accounts, models and delivery, the navigation counts and every view's own per-person state (see onForget). It
 * bumps `state.epoch` and the Now request counters, so reads still in flight cannot land after sign-out. `state.now`
 * is reset in place, because the Now view keeps a reference to it.
 */
export function forgetUserData() {
  state.epoch++;
  const now = state.now || {};
  state.now = Object.assign(now, { data: null, error: null, loading: false, refreshing: false, shown: null, since: undefined, caughtUp: false, hiddenAt: null, keepFocus: false, summary: { data: null, error: null }, request: (now.request || 0) + 1, summaryRequest: (now.summaryRequest || 0) + 1 });
  state.ploeg = null; state.ploegDetail = null; state.ploegDetailError = ''; state.ploegTeams = null; state.ploegLane = null; state.ploegRequest++;
  state.ploegSummary = { window: '24h', data: null, error: null, loading: false };
  state.ploegFeed = { events: null, nextCursor: null, team: '', kind: '', error: null, loading: false, refreshedAt: null, demo: false };
  state.ploegRuns = { runs: null, nextBefore: null, filter: {}, error: null, loading: false, demo: false };
  state.ploegProposed = { items: null, error: null, loading: false, busy: false, demo: false, truncated: false };
  state.sessions = []; state.session = null; state.events = []; state.permissions = [];
  state.tasks = []; state.task = null; state.taskDraft = null;
  state.links = null; state.models = null;
  state.deliveryRequest++; state.delivery = null; state.deliveryError = ''; state.deliveryBusy = false;
  state.counts = { waiting: null, review: null, needsYou: null, proposed: null, running: null, sessions: null }; state.ploegStatus = null; state.statusSignal = null;
  for (const reset of forgetters) { try { reset(); } catch {} }
}

/** Closes the session event stream and stops the session refresh and Ploeg polling timers. */
export function disconnect() { state.stream?.close(); state.stream = null; clearTimeout(state.refreshTimer); clearInterval(state.ploegTimer); state.ploegTimer = null; }
