import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify, announce } from '../core/dom.js';
import { button, callout, dl, skeleton, timeAt } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';

const view = { code: '', request: null, error: '', loading: false };
onForget(() => Object.assign(view, { code: '', request: null, error: '', loading: false }));

const roleNames = { admin: 'administrator', operator: 'operator', viewer: 'viewer' };

/**
 * The plain-language question the approval page asks, naming the workbench and the person.
 * @param {{ workbench: string }} request
 * @returns {string}
 */
export function editorQuestion(request) {
  return `A VS Code editor is asking to sign in to ${request.workbench} as you.`;
}

function decided(request) {
  if (request.status === 'approved') return callout({ tone: 'success', icon: 'check-circle', title: 'Approved', body: '<p>Return to VS Code: it finishes signing in by itself. You can sign this editor out at any time under <a href="#settings/editors">Settings › Signed-in editors</a>.</p>' });
  return callout({ tone: 'neutral', icon: 'x-circle', title: 'Denied', body: '<p>The editor gets no access. If you did not start this sign-in, someone may have sent you the link on purpose; you do not need to do anything else.</p>' });
}

function body() {
  if (view.loading && !view.request) return skeleton({ rows: 4 });
  if (!view.request) return callout({ tone: 'danger', title: 'This editor sign-in cannot be approved', body: `<p>${escape(view.error || 'It is unknown, has expired or was started for someone else.')} Start the sign-in again from your editor.</p>` });
  const request = view.request;
  const facts = dl([
    ['Signing in as', `${escape(request.user)} <span class="subtle">(${escape(roleNames[request.role] || request.role)})</span>`],
    ['Started', timeAt(request.createdAt)],
    ['Request expires', timeAt(request.expiresAt)],
    ['What approving gives', escape(`A separate editor sign-in that acts in this workbench as you, with your role, for ${request.credentialDays} days or until you sign it out. It cannot approve other editors.`)],
  ], { rows: true });
  const code = `<div class="editor-code"><p class="settings-row-label">Your editor shows this code</p><p class="editor-code-value num" aria-label="${escape(request.userCode.split('').join(' '))}">${escape(request.userCode)}</p></div>`;
  const warning = `<p class="settings-footnote">${icon('alert')}<span>Approve only if you started this sign-in in your own VS Code just now and it shows the same code. If someone sent you this link, deny it.</span></p>`;
  const actions = request.status === 'waiting' ? `<div class="editor-actions">${button({ label: 'Approve', icon: 'check', variant: 'primary', action: 'editor-approve' })}${button({ label: 'Deny', icon: 'x', variant: 'danger-ghost', action: 'editor-deny' })}</div>` : decided(request);
  return `<p class="editor-question"><strong>${escape(editorQuestion(request))}</strong></p>${code}${facts}${warning}${actions}`;
}

function renderRequest() {
  const content = `<div class="settings-page"><section class="card settings-card" aria-labelledby="editor-request-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="editor-request-title">Editor sign-in</h2><p class="card-subtitle">Signing in to your identity provider is not enough: you approve each editor here.</p></div></header><div class="card-body">${body()}</div></section></div>`;
  renderHtml(shell(content, { title: 'Approve an editor sign-in', subtitle: 'Check the code before you approve.' }));
}

async function enterRequest({ code }) {
  disconnect(); state.session = null; state.view = 'editor-sign-in';
  Object.assign(view, { code, request: null, error: '', loading: true });
  renderRequest();
  try { view.request = await api(`/api/editor-requests/${encodeURIComponent(code)}`); }
  catch (error) { if (error.status !== 401) view.error = error.message; }
  view.loading = false;
  if (state.view === 'editor-sign-in') renderRequest();
}

async function decide(element, decision) {
  element.disabled = true;
  view.request = await api(`/api/editor-requests/${encodeURIComponent(view.code)}/${decision}`, { method: 'POST', body: '{}' });
  renderRequest();
  announce(decision === 'approve' ? 'Editor sign-in approved' : 'Editor sign-in denied');
  notify(decision === 'approve' ? 'Approved. Return to your editor.' : 'Denied. The editor gets no access.');
}

/** Editor sign-in (`#editor-sign-in/<code>`): after a browser sign-in for an editor, names the request, shows its code and offers Approve and Deny. */
export default {
  id: 'editor-sign-in',
  match: hash => { const found = /^editor-sign-in\/([A-Za-z0-9_-]{8,32})$/.exec(hash); return found ? { code: found[1] } : null; },
  enter: enterRequest,
  render: renderRequest,
  actions: { 'editor-approve': element => decide(element, 'approve'), 'editor-deny': element => decide(element, 'deny') },
};
