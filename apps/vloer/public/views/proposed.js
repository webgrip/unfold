import { proposedMarkup } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, renderHtml, notify } from '../core/dom.js';
import { live } from '../core/live.js';
import { shell } from '../shell.js';
import { confirmAction, openWorkItemRejectDialog } from './dialogs.js';
import { enterPloegView, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible } from './ploeg-common.js';

function renderProposed() {
  renderHtml(shell(proposedMarkup(state.ploegProposed, state.bootstrap.user, ploegHelpers()), { title: 'Proposed', subtitle: 'Work that agents proposed. Nothing runs until someone approves it.' }));
}

async function loadProposed(fresh = false) {
  const view = state.ploegProposed;
  const request = ++state.ploegRequest;
  view.loading = true; renderProposed();
  try { const page = await api(`/api/ploeg/proposed${fresh ? '?refresh=1' : ''}`); if (request !== state.ploegRequest) return; Object.assign(view, { items: page.items, truncated: page.truncated, demo: page.demo, error: null }); live.touch(); }
  catch (error) { if (request !== state.ploegRequest) return; view.error = ploegFailure(error); }
  finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('proposed')) renderProposed(); } }
}

async function decidePloeg(id, decision, reason = '') {
  const view = state.ploegProposed;
  if (view.busy) return;
  view.busy = true; if (ploegVisible('proposed')) renderProposed();
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/${decision}`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });
    notify(result.demo ? 'Recorded in this demo only. Nothing was dispatched.' : decision === 'approve' ? 'Approved. Ploeg queued the Work Item for its Team.' : 'Rejected. Ploeg recorded your reason.');
  } catch (error) { notify(error.message, true); }
  finally { view.busy = false; if (ploegVisible('proposed')) await loadProposed(true); }
}

async function enterProposed() {
  enterPloegView('proposed');
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadProposed();
}

function confirmApproval(button) { const id = button.dataset.id; confirmAction('Approve this Work Item?', 'Ploeg queues it for its Team. Its Runs can then spend from the Team’s budget.', 'Approve', () => decidePloeg(id, 'approve')); }

async function rejectWorkItem(data, form) { $('#confirm-dialog').close(); await decidePloeg(form.dataset.id, 'reject', data.reason); }

onPloegReload('proposed', () => loadProposed(true));

/** Proposed: Work Items that agents proposed across your Teams, with Approve and Reject for operators and administrators. */
export default {
  id: 'proposed',
  match: hash => hash === 'proposed' ? {} : null,
  enter: enterProposed,
  render: renderProposed,
  actions: {
    'ploeg-approve': confirmApproval,
    'ploeg-reject': button => openWorkItemRejectDialog(button.dataset.id),
  },
  forms: { 'ploeg-reject': rejectWorkItem },
};
