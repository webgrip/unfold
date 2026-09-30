import { approveDialogMarkup, proposedMarkup, rejectDialogMarkup } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, renderHtml, notify } from '../core/dom.js';
import { live } from '../core/live.js';
import { refreshCounts } from '../core/counts.js';
import { shell } from '../shell.js';
import { enterPloegView, liveRefresh, loadPloegTeams, onPloegReload, openPloegDialog, ploegFailure, ploegHelpers, ploegVisible, refreshButton, settle, track } from './ploeg-common.js';

const hint = 'proposal-reject-hint';
const error = 'proposal-reject-error';

function renderProposed() {
  const view = state.ploegProposed;
  const actions = refreshButton({ busy: view.mode === 'reset' || view.mode === 'refresh', shown: Boolean(view.items) || !view.error });
  renderHtml(shell(proposedMarkup(view, state.bootstrap.user, ploegHelpers()), { title: 'Proposed', subtitle: 'Work that agents proposed while they worked. Nothing runs until someone approves it.', actions }));
}

const signature = view => JSON.stringify([view.items, view.truncated, view.demo, view.error]);

async function load(mode) {
  const view = state.ploegProposed;
  const request = ++state.ploegRequest;
  view.mode = mode;
  view.loading = true;
  if (mode === 'reset') Object.assign(view, { items: null, error: null });
  renderProposed();
  try {
    const page = await api(`/api/ploeg/proposed${mode === 'reset' ? '' : '?refresh=1'}`);
    if (request !== state.ploegRequest) return;
    Object.assign(view, { items: page.items, truncated: page.truncated, demo: page.demo, error: null, loadedAt: Date.now() });
    live.touch('proposed');
  } catch (failure) {
    if (request !== state.ploegRequest) return;
    view.error = ploegFailure(failure);
  } finally {
    if (request === state.ploegRequest) { view.mode = null; view.loading = false; if (ploegVisible('proposed')) renderProposed(); }
  }
}

const loadProposed = mode => track('proposed', load(mode));

async function poll() {
  const view = state.ploegProposed;
  const request = state.ploegRequest;
  const before = signature(view);
  let page;
  try { page = await api('/api/ploeg/proposed?refresh=1'); }
  catch (failure) {
    if (request !== state.ploegRequest) return settle('proposed');
    view.error = ploegFailure(failure);
    if (ploegVisible('proposed') && signature(view) !== before) renderProposed();
    throw failure;
  }
  if (request !== state.ploegRequest || view.busy) return settle('proposed');
  Object.assign(view, { items: page.items, truncated: page.truncated, demo: page.demo, error: null, loadedAt: Date.now() });
  if (ploegVisible('proposed') && signature(view) !== before) renderProposed();
}

function outcomeMessage(result, decision, entry) {
  if (result.demo) return 'Recorded in this demo only. Nothing was dispatched.';
  const title = entry?.title ? `“${entry.title}”` : 'the Work Item';
  const team = result.team || entry?.team;
  return decision === 'approve' ? `Approved. Ploeg queued ${title} for ${team ? `the ${team} Team` : 'its Team'}.` : `Rejected. Ploeg marked ${title} Done and kept your reason.`;
}

function focusAfterDecision(index) {
  const items = state.ploegProposed.items || [];
  const next = items[Math.min(index, items.length - 1)];
  const target = next ? document.getElementById(`proposal-approve-${next.id}`) || document.getElementById(`proposal-${next.id}-title`)?.querySelector('a') : document.getElementById('page-title');
  target?.focus();
}

async function decide(id, decision, reason = '') {
  const view = state.ploegProposed;
  if (view.busy) return;
  const index = Math.max(0, view.items?.findIndex(item => item.id === id) ?? 0);
  const entry = view.items?.[index];
  view.busy = id;
  if (ploegVisible('proposed')) renderProposed();
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/${decision}`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });
    notify(outcomeMessage(result, decision, entry));
  } catch (failure) { notify(failure.message, true); }
  finally {
    view.busy = false;
    refreshCounts().catch(() => {});
    if (ploegVisible('proposed')) { await load('refresh'); focusAfterDecision(index); }
  }
}

const proposal = id => state.ploegProposed.items?.find(item => item.id === id);

function confirmApproval(button) {
  const entry = proposal(button.dataset.id);
  if (!entry) return;
  const dialog = openPloegDialog(approveDialogMarkup(entry, state.ploegProposed.demo, ploegHelpers()));
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') void track('proposed', decide(entry.id, 'approve')); }, { once: true });
}

function openRejection(button) {
  const entry = proposal(button.dataset.id);
  if (!entry) return;
  const dialog = openPloegDialog(rejectDialogMarkup(entry, state.ploegProposed.demo, ploegHelpers()));
  const field = dialog.querySelector('#proposal-reject-reason');
  field?.addEventListener('input', () => {
    field.removeAttribute('aria-invalid');
    field.setAttribute('aria-describedby', hint);
    dialog.querySelector(`#${error}`)?.setAttribute('hidden', '');
  });
}

async function rejectProposal(data, form) {
  const reason = String(data.reason || '').trim();
  if (!reason) {
    const field = form.querySelector('#proposal-reject-reason');
    form.querySelector(`#${error}`)?.removeAttribute('hidden');
    field?.setAttribute('aria-invalid', 'true');
    field?.setAttribute('aria-describedby', `${hint} ${error}`);
    field?.focus();
    return;
  }
  $('#confirm-dialog').close();
  await track('proposed', decide(form.dataset.id, 'reject', reason));
}

async function enterProposed() {
  enterPloegView('proposed');
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadProposed('reset');
}

onPloegReload('proposed', () => loadProposed(state.ploegProposed.items ? 'refresh' : 'reset'));
live.register('proposed', { interval: 30000, refresh: liveRefresh('proposed', poll, () => state.ploegProposed.error) });

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
