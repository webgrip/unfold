import { state } from './state.js';
import { api } from './api.js';
import { live } from './live.js';

const listeners = new Set();

/**
 * The signal beside Status in the navigation for a `GET /api/status` report: `down` when new work cannot start,
 * `degraded` when it starts unreliably, and null while everything works or the report is unknown.
 * @param {{ overall?: string } | null | undefined} report
 * @returns {'down'|'degraded'|null}
 */
export function signalFrom(report) {
  return report?.overall === 'down' || report?.overall === 'degraded' ? report.overall : null;
}

/** Calls `listener()` whenever the navigation signal changes. Returns an unsubscribe function. */
export function onStatusSignal(listener) { listeners.add(listener); return () => listeners.delete(listener); }

/** Stores the signal for a status report in `state.statusSignal` and tells the listeners when it changed. */
export function applyStatusReport(report) {
  const next = signalFrom(report);
  if (next === state.statusSignal) return;
  state.statusSignal = next;
  for (const listener of listeners) { try { listener(); } catch {} }
}

/** Reads `GET /api/status` for the navigation signal, except while the Status page reads it itself. */
export async function refreshStatusSignal() {
  if (!state.bootstrap || state.view === 'status') return;
  const epoch = state.epoch;
  const report = await api('/api/status');
  if (state.bootstrap && state.epoch === epoch) applyStatusReport(report);
}

live.register('status-signal', { interval: 60000, scope: 'global', refresh: refreshStatusSignal });
