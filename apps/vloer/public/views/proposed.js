import { approveDialogMarkup, proposedMarkup, rejectDialogMarkup } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, renderHtml, notify } from '../core/dom.js';
import { live } from '../core/live.js';
import { refreshCounts } from '../core/counts.js';
import { shell } from '../shell.js';
import { enterPloegView, loadPloegTeams, onPloegReload, openPloegDialog, ploegFailure, ploegHelpers, ploegVisible, refreshButton } from './ploeg-common.js';

function renderProposed() {
  const view = state.ploegProposed;
  renderHtml(shell(proposedMarkup(view, state.bootstrap.user, ploegHelpers()), { title: 'Proposed', subtitle: 'Work that agents proposed while they worked. Nothing runs until someone approves it.', actions: refreshButton(view.loading) }));
}

async function loadProposed({ fresh = false, quiet = false } = {}) {
  const view = state.ploegProposed;
  if (quiet && (view.loading || view.busy)) return;
  const request = quiet ? state.ploegRequest : ++state.ploegRequest;
  view.loading = true;
  if (!quiet) renderProposed();
  try {
    const page = await api(`/api/ploeg/proposed${fresh || quiet ? '?refresh=1' : ''}`);
    if (request !== state.ploegRequest) return;
    Object.assign(view, { items: page.items, truncated: page.truncated, demo: page.demo, error: null });
    live.touch('proposed');
  } catch (error) {
    if (request !== state.ploegRequest) return;
    view.error = ploegFailure(error);
    if (quiet) throw error;
  } finally { if (request === state.ploegRequest) { view.loading = false; if (ploegVisible('proposed')) renderProposed(); } }
}

function outcomeMessage(result, decision, entry) {
  if (result.demo) return 'Recorded in this demo only. Nothing was dispatched.';
  const title = entry?.title ? `“${entry.title}”` : 'the Work Item';
  const team = result.team || entry?.team;
  return decision === 'approve' ? `Approved. Ploeg queued ${title} for ${team ? `the ${team} Team` : 'its Team'}.` : `Rejected. Ploeg marked ${title} Done and kept your reason.`;
}

async function decide(id, decision, reason = '') {
  const view = state.ploegProposed;
  if (view.busy) return;
  const entry = view.items?.find(item => item.id === id);
  view.busy = id;
  if (ploegVisible('proposed')) renderProposed();
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/${decision}`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });
    notify(outcomeMessage(result, decision, entry));
  } catch (error) { notify(error.message, true); }
  finally { view.busy = false; refreshCounts().catch(() => {}); if (ploegVisible('proposed')) await loadProposed({ fresh: true }); }
}

const proposal = id => state.ploegProposed.items?.find(item => item.id === id);

function confirmApproval(button) {
  const entry = proposal(button.dataset.id);
  if (!entry) return;
  const dialog = openPloegDialog(approveDialogMarkup(entry, state.ploegProposed.demo, ploegHelpers()));
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') void decide(entry.id, 'approve'); }, { once: true });
}

function openRejection(button) {
  const entry = proposal(button.dataset.id);
  if (!entry) return;
  const dialog = openPloegDialog(rejectDialogMarkup(entry, state.ploegProposed.demo, ploegHelpers()));
  const field = dialog.querySelector('#proposal-reject-reason');
  field?.addEventListener('input', () => { field.removeAttribute('aria-invalid'); dialog.querySelector('#proposal-reject-error')?.setAttribute('hidden', ''); });
}

async function rejectProposal(data, form) {
  const reason = String(data.reason || '').trim();
  if (!reason) {
    const field = form.querySelector('#proposal-reject-reason');
    field?.setAttribute('aria-invalid', 'true');
    form.querySelector('#proposal-reject-error')?.removeAttribute('hidden');
    field?.focus();
    return;
  }
  $('#confirm-dialog').close();
  await decide(form.dataset.id, 'reject', reason);
}

async function enterProposed() {
  enterPloegView('proposed');
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadProposed();
}

onPloegReload('proposed', () => loadProposed({ fresh: true }));
live.register('proposed', { interval: 30000, refresh: () => loadProposed({ quiet: true }) });

/** Proposed: Work Items that agents proposed across your Teams, with Approve and Reject for operators and administrators. Refreshes every 30 seconds. */
export default {
  id: 'proposed',
  match: hash => hash === 'proposed' ? {} : null,
  enter: enterProposed,
  render: renderProposed,
  actions: {
    'ploeg-approve': confirmApproval,
    'ploeg-reject': openRejection,
  },
  forms: { 'ploeg-reject': rejectProposal },
};
