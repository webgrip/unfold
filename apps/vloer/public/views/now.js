import { nowMarkup, nextBaseline, shownIds, visibleNow, offersRetry } from '../now.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { plural } from '../core/format.js';
import { shell } from '../shell.js';
import { singleKeyAllowed, singleKeysEnabled } from '../core/keys.js';
import { live } from '../core/live.js';
import { prefs } from '../core/prefs.js';
import { applyNowCounts } from '../core/counts.js';

const baselineKey = 'vloer.nowSince';
const view = Object.assign(state.now, { summary: { data: null, error: null }, summaryRequest: 0, shown: null, since: undefined, caughtUp: false, hiddenAt: null, refreshing: false, keepFocus: false });

function readBaseline() {
  try { const saved = JSON.parse(globalThis.sessionStorage?.getItem(baselineKey) ?? 'null'); return saved && typeof saved === 'object' && 'since' in saved ? saved.since : undefined; } catch { return undefined; }
}

function keepBaseline() {
  try { globalThis.sessionStorage?.setItem(baselineKey, JSON.stringify({ since: view.since })); } catch {}
}

function arrive(now = Date.now()) {
  const current = view.since === undefined ? readBaseline() : view.since;
  const since = nextBaseline({ current, lastVisit: prefs.get('lastVisit'), now });
  if (since !== view.since) view.caughtUp = false;
  view.since = since;
  keepBaseline();
}

function markSeen() { prefs.set('lastVisit', new Date().toISOString()); }

const onNow = () => Boolean(state.bootstrap) && state.view === 'now';

function refreshButton() {
  if (!view.data && ['ploeg_unconfigured', 'ploeg_scope'].includes(view.error?.code)) return '';
  if (offersRetry(view)) return '';
  const busy = view.refreshing || (view.loading && !view.data);
  return `<button type="button" class="button secondary icon-only now-refresh" id="now-refresh" data-action="now-refresh" aria-label="Refresh" title="Refresh"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')}</button>`;
}

function focusedTarget() {
  const active = document.activeElement;
  if (!active || active === document.body || active.id || !document.getElementById('main')?.contains(active)) return null;
  const href = active.getAttribute('href');
  return href ? `#main a[href="${CSS.escape(href)}"]` : null;
}

function visible(element) {
  return Boolean(element) && element.getClientRects().length > 0;
}

function restoreFocus(keep) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const kept = keep ? document.querySelector(keep) : null;
  if (kept) { kept.focus({ preventScroll: true }); return; }
  if (!view.keepFocus) return;
  const refresh = document.getElementById('now-refresh');
  (visible(refresh) ? refresh : document.getElementById('page-title'))?.focus({ preventScroll: true });
}

function renderNow() {
  if (view.since === undefined) arrive();
  const content = nowMarkup(view, { grafanaUrl: state.bootstrap?.observability?.grafanaUrl, singleKeys: singleKeysEnabled() });
  const keep = focusedTarget();
  renderHtml(shell(content, { title: 'Now', subtitle: 'What waits on you, what runs and what finished, across your Teams.', actions: refreshButton() }));
  restoreFocus(keep);
}

async function loadSummary(fresh) {
  const request = ++view.summaryRequest;
  let next;
  try { next = { data: await api(`/api/ploeg/summary?window=24h${fresh ? '&refresh=1' : ''}`), error: null }; }
  catch (error) { next = { data: view.summary.data, error: { message: error.message, code: error.code || '' } }; }
  if (request !== view.summaryRequest) return;
  view.summary = next;
  if (onNow() && view.data) renderNow();
}

function announceArrivals(before, after) {
  const grown = after.waiting - before.waiting;
  if (grown > 0) announce(`${plural(grown, 'new Work Item')} ${grown === 1 ? 'waits' : 'wait'} on you. Select Show to list ${grown === 1 ? 'it' : 'them'}.`);
}

async function loadNow(mode = 'open') {
  const request = ++view.request;
  const fresh = mode === 'manual';
  view.loading = true;
  view.refreshing = mode !== 'live' && Boolean(view.data);
  if (mode !== 'live' && onNow()) renderNow();
  const heldBefore = visibleNow(view.data, view.shown).held;
  loadSummary(fresh);
  try {
    const data = await api(`/api/ploeg/now${fresh ? '?refresh=1' : ''}`);
    if (request !== view.request) return;
    const first = !view.data;
    view.data = data;
    view.error = null;
    if (mode !== 'live' || first || !view.shown) view.shown = shownIds(data);
    else announceArrivals(heldBefore, visibleNow(data, view.shown).held);
    applyNowCounts(data);
    live.touch('now');
  } catch (error) {
    if (request !== view.request) return;
    view.error = { message: error.message, code: error.code || '' };
    if (state.bootstrap) applyNowCounts(view.data, error);
    if (mode === 'live') throw error;
  } finally {
    if (request === view.request) {
      view.loading = false;
      view.refreshing = false;
      if (onNow()) renderNow();
      view.keepFocus = false;
    }
  }
}

function manualLoad(element) {
  if (view.refreshing || (view.loading && !view.data)) return undefined;
  view.keepFocus = element === document.activeElement || element.contains(document.activeElement);
  return loadNow('manual');
}

function rows() { return [...document.querySelectorAll('[data-now-row]')]; }

function currentRow(list) {
  const active = document.activeElement;
  if (!active) return -1;
  const direct = list.indexOf(active);
  if (direct !== -1) return direct;
  const item = active.closest('li');
  return item ? list.indexOf(item.querySelector('[data-now-row]')) : -1;
}

function openLink(row) {
  const href = row?.dataset.openUrl;
  if (!href) { announce('This row has no pull request or tracker link. Press Enter to open it.'); return; }
  window.open(href, '_blank', 'noopener,noreferrer');
  announce(`Opened the ${row.dataset.openLabel || 'link'} in a new tab`);
}

function nowKeys(event) {
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (state.view !== 'now' || !['j', 'k', 'o'].includes(key) || !singleKeyAllowed(event)) return false;
  const list = rows();
  if (!list.length) return false;
  const index = currentRow(list);
  if (key === 'o' && index === -1) return false;
  event.preventDefault();
  if (key === 'o') { openLink(list[index]); return true; }
  const next = key === 'j' ? (index === -1 ? 0 : Math.min(list.length - 1, index + 1)) : Math.max(0, index === -1 ? 0 : index - 1);
  list[next].focus();
  return true;
}

function showNew() {
  const before = view.shown || shownIds(null);
  const held = visibleNow(view.data, view.shown).held;
  view.shown = shownIds(view.data);
  renderNow();
  const total = held.waiting + held.recent;
  announce(total ? `${plural(total, 'new row')} shown` : 'Everything is shown');
  const waiting = (view.data?.waiting || []).find(entry => !before.waiting.has(entry.id));
  const recent = (view.data?.recent || []).find(run => !before.recent.has(run.id));
  const first = waiting ? `now-row-w-${waiting.id}` : recent ? `now-row-f-${recent.id}` : null;
  (first && document.getElementById(first) || document.querySelector('[data-now-row]'))?.focus();
}

function caughtUp() {
  view.since = new Date().toISOString();
  view.caughtUp = true;
  keepBaseline();
  markSeen();
  renderNow();
  announce('Marked as caught up');
  document.getElementById('page-title')?.focus({ preventScroll: true });
}

function leave() { if (onNow()) markSeen(); }

globalThis.addEventListener?.('hashchange', leave);
globalThis.addEventListener?.('pagehide', leave);
globalThis.document?.addEventListener('visibilitychange', () => {
  if (!onNow()) return;
  if (document.visibilityState === 'hidden') { view.hiddenAt = Date.now(); markSeen(); return; }
  const away = view.hiddenAt !== null;
  view.hiddenAt = null;
  if (!away) return;
  const before = view.since;
  arrive();
  if (view.since !== before && view.data) renderNow();
});

live.register('now', { interval: 30000, refresh: () => loadNow('live') });

/** The Now page: the "Since you were away" digest, what waits on you, what runs now and what finished recently, across every Team you can read. `j`/`k` move between rows, Enter opens one and `o` opens its pull request or tracker item. Refreshes every 30 seconds and holds new rows behind an "N new" button. */
export default {
  id: 'now',
  match: hash => hash === 'now' ? {} : null,
  load: () => { arrive(); return loadNow('open'); },
  render: renderNow,
  actions: {
    'now-retry': manualLoad,
    'now-refresh': manualLoad,
    'now-show-new': showNew,
    'now-caught-up': caughtUp,
  },
  keys: [nowKeys],
};
