import { state } from './state.js';
import { api } from './api.js';
import { live } from './live.js';
import { sessionNeedsYou } from './states.js';

const listeners = new Set();

/** Counts that are not known: every value is null, never zero. */
export const unknownCounts = Object.freeze({ waiting: null, review: null, needsYou: null, proposed: null, running: null, sessions: null });

/**
 * Derives the navigation counts from a `GET /api/ploeg/now` response: what waits on you in total and per state,
 * and the Runs running now. A group that failed to load (`errors.waiting`, `errors.running`) counts as unknown.
 */
export function countsFromNow(data) {
  const waiting = !data?.errors?.waiting && Array.isArray(data?.waiting) ? data.waiting : null;
  const inState = name => waiting ? waiting.filter(entry => entry.state === name).length : null;
  return {
    waiting: waiting ? waiting.length : null,
    review: inState('awaiting_review'),
    needsYou: inState('needs_human'),
    proposed: inState('proposed'),
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

/** Calls `listener()` whenever the counts or the Ploeg status change. Returns an unsubscribe function. */
export function onCountsChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }

/** Stores the counts and Ploeg status from a Now response (or its error) in `state.counts` and `state.ploegStatus`. */
export function applyNowCounts(data, error = null) {
  state.counts = { ...(data ? countsFromNow(data) : unknownCounts), sessions: sessionsNeedingYou(state.sessions) };
  state.ploegStatus = ploegStatusFrom(data, error);
  for (const listener of listeners) { try { listener(); } catch {} }
}

/** Reads `GET /api/ploeg/now` and updates the counts. Errors leave the counts unknown and are rethrown for the scheduler's backoff. */
export async function refreshCounts() {
  if (!state.bootstrap) return;
  try { applyNowCounts(await api('/api/ploeg/now')); }
  catch (error) { if (state.bootstrap) applyNowCounts(null, error); throw error; }
}

live.register('counts', { interval: 60000, scope: 'global', refresh: refreshCounts });
