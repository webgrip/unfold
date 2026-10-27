import { state } from './state.js';
import { api } from './api.js';
import { live } from './live.js';
import { sessionNeedsYou, stoppedWorkIds } from './states.js';
import { waitingGroup } from './reasons.js';

const listeners = new Set();

/** Counts that are not known: every value is null, never zero. */
export const unknownCounts = Object.freeze({ waiting: null, review: null, needsYou: null, proposed: null, refused: null, running: null, sessions: null });

/**
 * Derives the navigation counts from a `GET /api/ploeg/now` response: what waits on you in total and per state,
 * the tracker tasks Ploeg could not start (`refused`, part of `waiting` but not Work Items), and the Runs running now. A pull request whose CI did not pass counts as needing you, not as ready for review. A group that failed to load (`errors.waiting`, `errors.running`) counts as unknown.
 */
export function countsFromNow(data) {
  const waiting = !data?.errors?.waiting && Array.isArray(data?.waiting) ? data.waiting : null;
  const inGroup = (name, states) => waiting ? waiting.filter(entry => states.includes(entry.state) && waitingGroup(entry) === name).length : null;
  const refused = !data?.errors?.refused && Array.isArray(data?.refused) ? data.refused.length : null;
  return {
    waiting: waiting ? waiting.length + (refused ?? 0) : null,
    review: inGroup('review', ['awaiting_review']),
    needsYou: inGroup('needs', ['awaiting_review', 'needs_human']),
    proposed: inGroup('proposed', ['proposed']),
    refused,
    running: !data?.errors?.running && Array.isArray(data?.running) ? data.running.length : null,
  };
}

/** Counts the sessions that wait on a person, or null without a session list. */
export function sessionsNeedingYou(sessions) { return Array.isArray(sessions) ? sessions.filter(sessionNeedsYou).length : null; }

/**
 * Describes the Ploeg connection from a `GET /api/ploeg/now` response or the error it failed with:
 * `demo`, `connected`, `partial` (some groups failed), `unconfigured`, `no-access` or `unavailable`.
 */
export function ploegStatusFrom(data, error = null) {
  if (error) return error.code === 'ploeg_unconfigured' ? 'unconfigured' : error.code === 'ploeg_scope' ? 'no-access' : 'unavailable';
  if (!data) return null;
  if (data.demo) return 'demo';
  const failed = Object.values(data.errors || {}).filter(Boolean).length;
  return failed === 0 ? 'connected' : failed >= 3 ? 'unavailable' : 'partial';
}

/**
 * Calls `listener(data, error)` whenever the counts or the Ploeg status change; `data` is the Now response, null when
 * it failed, and `error` the failure. Returns an unsubscribe function.
 */
export function onCountsChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }

/**
 * Stores the counts and Ploeg status from a Now response (or its error) in `state.counts` and `state.ploegStatus`,
 * and the stopped Work Items in `state.stoppedWork`; an error keeps the last known stopped Work Items.
 */
export function applyNowCounts(data, error = null) {
  state.counts = { ...(data ? countsFromNow(data) : unknownCounts), sessions: sessionsNeedingYou(state.sessions) };
  if (data) state.stoppedWork = stoppedWorkIds(data);
  state.ploegStatus = ploegStatusFrom(data, error);
  for (const listener of listeners) { try { listener(data, error); } catch {} }
}

/**
 * Reads `GET /api/ploeg/now` and updates the counts. Errors leave the counts unknown and are rethrown for the
 * scheduler's backoff. It skips the read while the Now page is on screen, because Now reads the same data itself, and
 * drops an answer that arrives after the person signed out (`state.epoch` changed).
 */
export async function refreshCounts() {
  if (!state.bootstrap) return;
  if (state.view === 'now' && globalThis.document?.visibilityState === 'visible') return;
  const epoch = state.epoch;
  const current = () => Boolean(state.bootstrap) && state.epoch === epoch;
  try { const data = await api('/api/ploeg/now'); if (current()) applyNowCounts(data); }
  catch (error) { if (current()) applyNowCounts(null, error); throw error; }
}

live.register('counts', { interval: 60000, scope: 'global', hidden: true, refresh: refreshCounts });
