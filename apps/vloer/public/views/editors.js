import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify } from '../core/dom.js';
import { button, callout, dl, emptyState, skeleton, timeAt } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

const view = { editors: null, error: '', loading: false };
onForget(() => Object.assign(view, { editors: null, error: '', loading: false }));

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

function renderEditors() {
  const note = `<p class="settings-footnote">${icon('lock')}<span>Each editor has its own sign-in, separate from this browser's. Signing one out ends it at once, along with any agent host connection it opened.</span></p>`;
  const content = `<div class="settings-page"><section class="card settings-card" aria-labelledby="editors-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="editors-title">Signed-in editors</h2><p class="card-subtitle">VS Code editors you approved to act in this workbench as you.</p></div></header><div class="card-body">${body()}</div></section>${note}</div>`;
  renderHtml(shell(content, { title: 'Signed-in editors', subtitle: 'See and sign out the editors that act as you.' }));
}

async function enterEditors() {
  disconnect(); state.session = null; state.view = 'editors';
  view.loading = true; view.error = '';
  renderEditors();
  try { view.editors = (await api('/api/editor-credentials')).editors; }
  catch (error) { if (error.status !== 401) view.error = error.message; }
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

/** Signed-in editors (`#settings/editors`): the person's approved editor sign-ins, each of which they can sign out. */
export default {
  id: 'editors',
  match: hash => hash === 'settings/editors' ? {} : null,
  enter: enterEditors,
  render: renderEditors,
  actions: { 'editor-revoke': revoke },
};
