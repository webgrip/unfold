import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify } from '../core/dom.js';
import { button, callout, disclosure, dl, emptyState, skeleton, timeAt } from '../core/ui.js';
import { agentHostConnectionAddress, agentsWindowLink, extensionViewLink, openVsxListing } from '../core/vscode.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

const view = { editors: null, error: '', loading: false, agentHost: undefined, copying: false, manualAddress: '' };
onForget(() => Object.assign(view, { editors: null, error: '', loading: false, agentHost: undefined, copying: false, manualAddress: '' }));

function editorCard(editor) {
  const facts = dl([
    ['Approved', timeAt(editor.createdAt)],
    ['Last used', editor.lastUsedAt ? timeAt(editor.lastUsedAt) : 'Not yet'],
    ['Signed out automatically', timeAt(editor.expiresAt)],
  ], { rows: true });
  return `<li class="editor-item"><div class="editor-item-text"><p class="settings-row-label">${icon('code')}<span>${escape(editor.label)}</span></p>${facts}</div>${button({ label: 'Sign out', icon: 'logout', variant: 'danger-ghost', size: 'sm', action: 'editor-revoke', data: { id: editor.id } })}</li>`;
}

function body() {
  if (view.error && !view.editors) return callout({ tone: 'danger', title: 'Could not read your signed-in editors', body: `<p>${escape(view.error)}</p>` });
  if (!view.editors) return skeleton({ rows: 2 });
  if (!view.editors.length) return emptyState({ icon: 'code', title: 'No editors are signed in as you', body: 'When you approve a VS Code sign-in, it appears here until it expires or you sign it out.', compact: true });
  return `<ul class="editor-list" aria-label="Signed-in editors">${view.editors.map(editorCard).join('')}</ul>`;
}

function manualSteps() {
  const shown = view.manualAddress ? `<div class="field vscode-connect-address"><label class="field-label" for="vscode-connect-address">Address with your connection token</label><input id="vscode-connect-address" class="mono" type="text" readonly autocomplete="off" spellcheck="false" value="${escape(view.manualAddress)}" aria-describedby="vscode-connect-address-hint"><span class="field-hint" id="vscode-connect-address-hint">Your browser did not allow copying. Select the address and copy it yourself.</span></div>` : '';
  const copy = button({ label: view.copying ? 'Copying…' : 'Copy address', icon: 'copy', variant: 'secondary', size: 'sm', action: 'agent-host-copy', busy: view.copying });
  return `<ol class="vscode-connect-steps"><li><p>${copy}</p><p class="meta">Each click creates a new personal connection token inside the address. Paste it only into VS Code.</p>${shown}</li><li><p>In VS Code, open the Agents window.</p></li><li><p>Run <strong>Sessions: Add Remote Agent Host…</strong> and paste the address.</p></li></ol>`;
}

function connectCard() {
  if (!view.agentHost) return '';
  const viewer = state.bootstrap?.user?.role === 'viewer';
  const fallback = disclosure({ summary: 'No Unfold extension in VS Code?', body: `<p>Install it from <a href="${escape(extensionViewLink)}">the Extensions view in VS Code</a> or from <a href="${escape(openVsxListing)}" target="_blank" rel="noopener noreferrer">Open VSX</a>, then choose Connect VS Code again. Or add this workbench by hand:</p>${manualSteps()}` });
  const body = viewer
    ? callout({ tone: 'neutral', title: 'An operator account connects VS Code', body: '<p>Viewers can inspect sessions here in the browser. Ask an administrator for operator access to work from VS Code\'s Agents window.</p>' })
    : `<div class="vscode-connect"><a class="button primary" href="${escape(agentsWindowLink(location.origin))}">${icon('code')}<span class="button-label">Connect VS Code</span></a><p class="meta">Opens VS Code, adds this workbench to its Agents window and offers to open it. You need the Unfold extension, signed in to this workbench. Then start a session with New → Workspace ▾ → Unfold · &lt;repository&gt;.</p></div>${fallback}`;
  return `<section class="card settings-card" aria-labelledby="vscode-connect-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="vscode-connect-title">Connect VS Code</h2><p class="card-subtitle">Work with this workbench from VS Code's Agents window.</p></div></header><div class="card-body">${body}</div></section>`;
}

function renderEditors() {
  const note = `<p class="settings-footnote">${icon('lock')}<span>Each editor has its own sign-in, separate from this browser's. Signing one out ends it at once, along with any agent host connection it opened.</span></p>`;
  const content = `<div class="settings-page">${connectCard()}<section class="card settings-card" aria-labelledby="editors-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="editors-title">Signed-in editors</h2><p class="card-subtitle">VS Code editors you approved to act in this workbench as you.</p></div></header><div class="card-body">${body()}</div></section>${note}</div>`;
  renderHtml(shell(content, { title: 'Signed-in editors', subtitle: 'Connect VS Code, and see and sign out the editors that act as you.' }));
}

async function enterEditors() {
  disconnect(); state.session = null; state.view = 'editors';
  view.loading = true; view.error = '';
  renderEditors();
  const [editors, agentHost] = await Promise.allSettled([api('/api/editor-credentials'), api('/api/agent-host')]);
  if (editors.status === 'fulfilled') view.editors = editors.value.editors;
  else if (editors.reason.status !== 401) view.error = editors.reason.message;
  view.agentHost = agentHost.status === 'fulfilled' ? agentHost.value : null;
  view.loading = false;
  if (state.view === 'editors') renderEditors();
}

function revoke(element) {
  const id = element.dataset.id;
  confirmAction('Sign out this editor?', 'The editor loses access at once and has to be approved again to sign back in.', 'Sign out', async () => {
    view.editors = (await api(`/api/editor-credentials/${encodeURIComponent(id)}`, { method: 'DELETE' })).editors;
    if (state.view === 'editors') renderEditors();
    notify('The editor is signed out.');
  }, { tone: 'danger', dismiss: 'Keep it signed in' });
}

async function copyAddress() {
  if (view.copying) return;
  view.copying = true; view.manualAddress = '';
  renderEditors();
  try {
    const issued = await api('/api/agent-host/tokens', { method: 'POST', body: JSON.stringify({ label: 'VS Code, added by hand' }) });
    const address = agentHostConnectionAddress(issued.address, issued.token);
    if (!address) throw new Error('This workbench did not return a WebSocket address.');
    try { await navigator.clipboard.writeText(address); notify('Address copied. Paste it into Sessions: Add Remote Agent Host… in VS Code\'s Agents window.'); }
    catch { view.manualAddress = address; notify('The browser did not allow copying. Select the address shown instead.', true); }
  } catch (error) { notify(error.message, true); }
  finally {
    view.copying = false;
    if (state.view === 'editors') renderEditors();
  }
}

/** Signed-in editors (`#settings/editors`): Connect VS Code to the Agents window, and the person's approved editor sign-ins, each of which they can sign out. */
export default {
  id: 'editors',
  match: hash => hash === 'settings/editors' ? {} : null,
  enter: enterEditors,
  render: renderEditors,
  actions: { 'editor-revoke': revoke, 'agent-host-copy': copyAddress },
};
