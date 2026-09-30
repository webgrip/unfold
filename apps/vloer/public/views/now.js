import { nowMarkup } from '../now.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, safeUrl, renderHtml } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';
import { singleKeyAllowed } from '../core/keys.js';
import { live } from '../core/live.js';
import { applyNowCounts } from '../core/counts.js';

function renderNow() {
  const content = nowMarkup(state.now, { escape, icon, safeUrl, grafanaUrl: state.bootstrap?.observability?.grafanaUrl });
  renderHtml(shell(content, 'Now', 'What waits on you, what runs now, what finished recently — across every team you can read.'));
}

async function loadNow(fresh = false) {
  const view = state.now;
  const request = ++view.request;
  view.loading = true;
  if (state.bootstrap && state.view === 'now') renderNow();
  try { const data = await api(`/api/ploeg/now${fresh ? '?refresh=1' : ''}`); if (request !== view.request) return; view.data = data; view.error = null; applyNowCounts(data); live.touch(); }
  catch (error) { if (request !== view.request) return; view.data = null; view.error = { message: error.message, code: error.code || '' }; if (state.bootstrap) applyNowCounts(null, error); }
  finally { if (request === view.request) { view.loading = false; if (state.bootstrap && state.view === 'now') renderNow(); } }
}

function focusNowRow(event) {
  if (state.view === 'now' && ['j', 'k'].includes(event.key.toLowerCase()) && singleKeyAllowed(event)) {
    const rows = [...document.querySelectorAll('[data-now-row]')];
    if (rows.length) {
      event.preventDefault();
      const current = rows.indexOf(document.activeElement);
      const next = event.key.toLowerCase() === 'j' ? (current === -1 ? 0 : Math.min(rows.length - 1, current + 1)) : Math.max(0, current === -1 ? 0 : current - 1);
      rows[next].focus();
    }
    return true;
  }
  return false;
}

/** The Now page: what waits on a human, what runs now and what finished recently. `j` and `k` move between rows. */
export default {
  id: 'now',
  match: hash => hash === 'now' ? {} : null,
  load: () => loadNow(),
  render: renderNow,
  actions: { 'now-retry': () => loadNow(true) },
  keys: [focusNowRow],
};
