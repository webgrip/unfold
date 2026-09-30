import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { providerLabels } from '../core/lookup.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

function linkRow(link) {
  const label = providerLabels[link.provider] || link.provider;
  const where = link.provider === 'clickup' ? 'ClickUp → your avatar → Settings → Apps → API Token' : 'GitLab → Preferences → Access tokens, with read_api, read_repository and write_repository';
  const status = link.linked ? `Linked as ${link.webUrl ? `<a href="${escape(link.webUrl)}" target="_blank" rel="noopener noreferrer">${escape(link.login)}</a>` : escape(link.login)}${link.method === 'token' ? ' · personal token' : ''}${(link.scopes || []).length ? ` · ${link.scopes.map(escape).join(', ')}` : ''}` : link.provider === 'gitlab' ? 'Not linked. Private repositories on this host cannot be cloned until you link.' : 'Not linked. Task connections on ClickUp show nothing until you link.';
  const actions = link.linked ? `<button class="button secondary" data-action="unlink" data-provider="${escape(link.provider)}">Unlink</button>` : `${link.oauth ? `<button class="button primary" data-action="link" data-provider="${escape(link.provider)}">Link ${escape(label)}</button>` : ''}<form data-form="paste-token" data-provider="${escape(link.provider)}" class="paste-token"><label>${link.oauth ? 'Or paste a personal token' : 'Paste a personal token'}<input name="token" type="password" autocomplete="off" required placeholder="${escape(link.provider === 'clickup' ? 'pk_…' : 'glpat-…')}"></label><button class="button ${link.oauth ? 'secondary' : 'primary'}" type="submit">Save</button><p class="form-help">${escape(where)}. Stored encrypted for your account only.</p></form>`;
  return `<article class="profile-row link-row-card">${icon('link')}<div><h3>${escape(label)} · ${escape(link.host)}</h3><p>${status}</p></div><div class="link-actions">${actions}</div></article>`;
}

function renderAccount() {
  const links = state.links || [];
  const content = `<section class="panel"><div class="panel-heading"><div><h2>Linked accounts</h2><p>Links are yours. The workbench clones and reads tasks with them and never hands them to a sandbox.</p></div></div>${!state.links ? '<div class="empty compact"><p>Loading…</p></div>' : links.length ? links.map(linkRow).join('') : '<div class="empty compact"><p>This workbench has no linkable accounts configured.</p></div>'}</section>`;
  renderHtml(shell(content, 'Linked accounts', 'Sign in once, link what you need.'));
}

/** Explains a `link_error` code returned from a provider's authorization page. */
export function linkFailure(code) {
  if (code === 'exchange_401') return 'The provider refused the exchange. For GitLab that means the application is marked Confidential: edit it, untick Confidential, and link again.';
  if (code === 'link_state') return 'The link attempt expired or was started elsewhere. Start it again from this page.';
  if (code === 'access_denied') return 'You declined the authorization at GitLab.';
  return `Linking GitLab failed: ${code}.`;
}

async function link(button) { button.disabled = true; try { const { url } = await api(`/api/links/${button.dataset.provider}`, { method: 'POST', body: '{}' }); location.assign(url); } finally { button.disabled = false; } }

function unlink(button) { const label = providerLabels[button.dataset.provider] || button.dataset.provider; confirmAction(`Unlink ${label}?`, `The workbench forgets the token${button.dataset.provider === 'gitlab' ? 's and asks GitLab to revoke them. Sessions on private repositories from this host will fail to clone until you link again' : '. Task connections on ClickUp will show nothing until you link again'}.`, 'Unlink', async () => { await api(`/api/links/${button.dataset.provider}`, { method: 'DELETE' }); state.links = (await api('/api/links')).links; renderAccount(); }); }

async function pasteToken(data, form) { await api(`/api/links/${form.dataset.provider}`, { method: 'PUT', body: JSON.stringify({ token: data.token }) }); notify(`${providerLabels[form.dataset.provider] || form.dataset.provider} is linked to your account.`); state.links = (await api('/api/links')).links; renderAccount(); }

/** The Linked accounts page: link, unlink or paste a personal token per provider. */
export default {
  id: 'account',
  match: hash => hash === 'account' ? {} : null,
  load: async () => { state.links = (await api('/api/links')).links; renderAccount(); },
  render: renderAccount,
  actions: { link, unlink },
  forms: { 'paste-token': pasteToken },
};
