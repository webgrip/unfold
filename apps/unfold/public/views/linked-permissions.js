import { api } from '../core/api.js';
import { $, escape, notify } from '../core/dom.js';
import { button, iconButton } from '../core/ui.js';
import { permissionsChangedEvent } from '../core/linked-permissions.js';
import { confirmAction } from './dialogs.js';

const reasonLimit = 500;

async function answer(session, request, body) {
  await api(`/api/linked-sessions/${encodeURIComponent(session)}/permissions/${encodeURIComponent(request)}/answer`, { method: 'POST', body: JSON.stringify(body) });
  window.dispatchEvent(new CustomEvent(permissionsChangedEvent, { detail: { session, request } }));
}

async function allow(element) {
  const { session, request, tool, line } = element.dataset;
  const go = async () => {
    element.disabled = true;
    try { await answer(session, request, { decision: 'allow' }); notify('Approved. The session picks it up within a few seconds, unless you answered in the terminal first.'); }
    catch (error) { element.disabled = false; notify(error.message, true); }
  };
  if (tool !== 'Bash') return go();
  confirmAction('Run this shell command on your machine?', `Your session asks: ${line}. The summary is the agent’s own description of the command; Unfold cannot check that it matches. Approve only if you expect this command now.`, 'Approve once', go, { details: ['It runs once, in your session, as if you approved it in the terminal.', 'Unfold records who approved it and from where.'] });
}

function deny(element) {
  const { session, request, line } = element.dataset;
  const dialog = $('#confirm-dialog');
  dialog.className = 'dialog session-dialog sm';
  dialog.addEventListener('close', () => dialog.classList.remove('session-dialog'), { once: true });
  dialog.innerHTML = `<form data-form="linked-permission-deny" data-session="${escape(session)}" data-request="${escape(request)}" novalidate><header class="dialog-header"><h2 id="confirm-title">Deny this tool?</h2>${iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' })}</header><div class="dialog-body"><p>${escape(`Your session asks: ${line}. The agent is told no and carries on.`)}</p><div class="field"><label class="field-label" for="linked-permission-reason">What should it do instead?</label><textarea id="linked-permission-reason" name="reason" rows="3" maxlength="${reasonLimit}" aria-describedby="linked-permission-reason-hint"></textarea><p class="field-hint" id="linked-permission-reason-hint">Optional. The agent reads it as your instruction.</p></div></div><footer class="dialog-footer">${button({ label: 'Cancel', action: 'close-dialog' })}${button({ label: 'Deny', icon: 'x', variant: 'danger', type: 'submit' })}</footer></form>`;
  dialog.showModal();
  dialog.querySelector('#linked-permission-reason')?.focus();
}

async function submitDeny(data, form) {
  const reason = String(data.reason ?? '').trim().slice(0, reasonLimit);
  await answer(form.dataset.session, form.dataset.request, reason ? { decision: 'deny', reason } : { decision: 'deny' });
  form.closest('dialog')?.close();
  notify('Denied. The session picks it up within a few seconds, unless you answered in the terminal first.');
}

/** Approve and Deny for the tool prompts of the person's own sessions, wherever Now, the fleet or a session page shows one. */
export default {
  id: 'linked-permissions',
  actions: { 'linked-permission-allow': allow, 'linked-permission-deny': deny },
  forms: { 'linked-permission-deny': submitDeny },
};
