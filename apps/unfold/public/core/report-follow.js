import { state } from './state.js';
import { api } from './api.js';
import { live } from './live.js';
import { notify } from './dom.js';

const listeners = new Set();
const noticedKey = 'unfold.report.noticed';
export const followInterval = 5 * 60_000;

/** Whether reports go to a tracker that Unfold can follow: never in the demo, never without a target. */
export function following() {
  return Boolean(state.bootstrap?.reports?.target) && !state.bootstrap?.reports?.demo;
}

/** Calls `listener()` whenever the number of reports with news changes. Returns an unsubscribe function. */
export function onReportUpdates(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function readNoticed() {
  try { const value = JSON.parse(localStorage.getItem(noticedKey) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}

function writeNoticed(value) {
  try { localStorage.setItem(noticedKey, JSON.stringify(value)); } catch {}
}

/**
 * The toast for the first report with news this browser has not announced yet, such as
 * `Your report “Approve does nothing” is now Fixed in 0.4.0-rc.75.`, or '' when there is none. Each report's stage is
 * announced once.
 * @param {{ id: string, title: string, words: string, unread: boolean }[]} reports
 * @param {Record<string, string>} noticed
 */
export function noticeFor(reports, noticed) {
  const fresh = reports.find(report => report.unread && noticed[report.id] !== report.words);
  return fresh ? `Your report “${fresh.title}” is now ${fresh.words}. Open Report a problem to see it.` : '';
}

/** Stores the person's reports and their news count, tells the listeners, and announces new news once. */
export function applyReports({ reports = [], updates = 0 } = {}) {
  state.myReports = reports;
  const changed = state.reportUpdates !== updates;
  state.reportUpdates = updates;
  const noticed = readNoticed();
  const message = noticeFor(reports, noticed);
  if (message) {
    notify(message);
    writeNoticed(Object.fromEntries(reports.filter(report => report.unread).map(report => [report.id, report.words])));
  }
  if (changed) for (const listener of listeners) { try { listener(); } catch {} }
}

/** Reads the person's reports and where each stands, when Unfold follows a tracker. */
export async function refreshReports() {
  if (!state.bootstrap || !following()) return;
  const epoch = state.epoch;
  const data = await api('/api/reports');
  if (state.bootstrap && state.epoch === epoch) applyReports(data);
}

/** Tells Unfold the person looked at their reports, so nothing so far counts as news. */
export async function markReportsSeen() {
  if (!following() || !state.reportUpdates) return;
  await api('/api/reports/seen', { method: 'POST', body: '{}' });
  applyReports({ reports: (state.myReports ?? []).map(report => ({ ...report, unread: false })), updates: 0 });
}

live.register('report-follow', { interval: followInterval, scope: 'global', refresh: refreshReports });
