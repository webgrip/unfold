import { state, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { $ } from '../core/dom.js';

/** Comparing two sessions side by side: the compare route, the Compare action and the compare form. */
export default {
  id: 'compare',
  match: hash => { if (!hash.startsWith('compare/')) return null; const [left, right] = hash.slice(8).split('/'); return { left, right }; },
  enter: async ({ left, right }) => { disconnect(); state.session = null; state.view = 'compare'; state.compare = null; renderCompare(); state.compare = await Promise.all([api(`/api/sessions/${encodeURIComponent(left)}`), api(`/api/sessions/${encodeURIComponent(right)}`)]); return renderCompare(); },
  render: () => renderCompare(),
  actions: { compare: () => openCompareDialog() },
  forms: { compare: data => { $('#confirm-dialog').close(); location.hash = `compare/${state.session.id}/${data.other}`; } },
};
