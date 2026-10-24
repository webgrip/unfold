import { state } from './state.js';
import { api } from './api.js';
import { live } from './live.js';
import { button, callout } from './ui.js';
import { escape } from './dom.js';

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

/**
 * The contract mismatch a `GET /api/status` report carries, or null while Ploeg serves what this Unfold requires,
 * has not been checked, or is not connected (system ADR-0044).
 * @param {{ ploegContract?: { state?: string, message?: string } } | null | undefined} report
 * @returns {{ state: 'incompatible', message: string } | null}
 */
export function contractFrom(report) {
  const contract = report?.ploegContract;
  return contract?.state === 'incompatible' && typeof contract.message === 'string' ? { state: 'incompatible', message: contract.message } : null;
}

/**
 * The banner every page shows while Ploeg's version does not match this Unfold: managed actions are paused, Unfold's own
 * pages keep working, and the sentence naming both versions. Empty while there is no mismatch.
 * @param {{ message: string } | null} contract
 * @returns {string}
 */
export function contractBanner(contract) {
  if (!contract) return '';
  return callout({
    tone: 'danger',
    title: 'Ploeg’s version doesn’t match this Unfold',
    body: `<p>Managed actions are paused: Unfold sends nothing to Ploeg until the versions match. Your sessions and Unfold’s own pages keep working.</p><p>${escape(contract.message)}</p>`,
    actions: button({ label: 'Open Status', icon: 'monitor', size: 'sm', href: '#status' }),
  });
}

/** Calls `listener()` whenever the navigation signal changes. Returns an unsubscribe function. */
export function onStatusSignal(listener) { listeners.add(listener); return () => listeners.delete(listener); }

/** Stores the signal and the contract mismatch of a status report in `state.statusSignal` and `state.ploegContract`, and tells the listeners when either changed. */
export function applyStatusReport(report) {
  const next = signalFrom(report);
  const contract = contractFrom(report);
  if (next === state.statusSignal && contract?.message === state.ploegContract?.message) return;
  state.statusSignal = next;
  state.ploegContract = contract;
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
