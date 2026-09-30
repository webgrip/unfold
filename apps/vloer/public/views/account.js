import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, safeUrl, renderHtml, notify } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { badge, button, callout, chip, disclosure, dl, emptyState, skeleton, timeAgo, timeAt } from '../core/ui.js';
import { providerLabels } from '../core/lookup.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

const tokenHelp = {
  gitlab: { where: 'In GitLab: Preferences › Access tokens, with read_api, read_repository and write_repository.', placeholder: 'glpat-…', without: 'Sessions cannot clone private repositories from this host until you link.' },
  clickup: { where: 'In ClickUp: your avatar › Settings › Apps › API Token.', placeholder: 'pk_…', without: 'ClickUp task connections show nothing until you link.' },
};

let loadError = '';

const act = (attribute, options) => button(options).replace('<button ', `<button ${attribute} `);
const nameOf = provider => providerLabels[provider] || provider;

function linkState(link) {
  const expires = link.expiresAt ? Date.parse(link.expiresAt) : NaN;
  if (link.linked && Number.isFinite(expires) && expires <= Date.now()) return badge({ tone: 'danger', glyph: 'x-circle', label: 'Expired' });
  if (link.linked) return badge({ tone: 'success', glyph: 'check-circle', label: 'Linked' });
  return badge({ tone: 'neutral', glyph: 'circle-dashed', label: 'Not linked' });
}

function tokenForm(link) {
  const help = tokenHelp[link.provider] || { where: '', placeholder: '' };
  const id = `token-${escape(link.provider)}`;
  return `<form data-form="paste-token" data-provider="${escape(link.provider)}" class="account-token"><div class="field"><label class="field-label" for="${id}">Personal token</label><input id="${id}" name="token" type="password" autocomplete="off" spellcheck="false" required placeholder="${escape(help.placeholder)}" aria-describedby="${id}-hint"><p class="field-hint" id="${id}-hint">${escape(help.where)} Stored encrypted, for your account only.</p></div>${button({ type: 'submit', label: 'Save token', variant: link.oauth ? 'secondary' : 'primary' })}</form>`;
}

function linkedFacts(link) {
  const who = link.login ? (safeUrl(link.webUrl || '') ? `<a href="${escape(safeUrl(link.webUrl))}" target="_blank" rel="noopener noreferrer">${escape(link.login)}<span class="sr-only"> (opens in a new tab)</span></a>` : escape(link.login)) : null;
  const scopes = (link.scopes || []).length ? `<span class="account-scopes">${link.scopes.map(scope => chip({ label: scope })).join('')}</span>` : null;
  const expires = link.expiresAt ? `${timeAgo(link.expiresAt)}` : 'No expiry reported';
  return dl([
    ['Signed in as', who],
    ['Method', link.method === 'token' ? 'Personal token' : link.method === 'oauth' ? 'Signed in with OAuth' : null],
    ['Scopes', scopes],
    ['Linked', link.linkedAt ? timeAt(link.linkedAt) : null],
    ['Expires', expires],
  ]);
}

function linkCard(link) {
  const label = nameOf(link.provider);
  const help = tokenHelp[link.provider] || {};
  const id = `link-${escape(link.provider)}`;
  let body;
  let footer;
  if (link.linked) {
    body = linkedFacts(link);
    footer = `<p class="settings-card-note">${icon('lock')}<span>The workbench uses this link for you only and never hands it to an agent workspace.</span></p>${act('data-action="unlink"', { label: `Unlink ${label}`, variant: 'danger-ghost', size: 'sm', data: { provider: link.provider } })}`;
  } else if (link.oauth) {
    body = `<p class="account-why">${escape(help.without || `Link ${label} to use it here.`)}</p>${disclosure({ summary: 'Use a personal token instead', body: tokenForm(link), id: `${id}-token` })}`;
    footer = `<p class="settings-card-note">${icon('lock')}<span>You sign in at ${escape(label)}; the workbench never sees your password.</span></p>${act('data-action="link"', { label: `Link ${label}`, variant: 'primary', icon: 'link', data: { provider: link.provider } })}`;
  } else {
    body = `<p class="account-why">${escape(help.without || `Link ${label} to use it here.`)}</p>${tokenForm(link)}`;
    footer = '';
  }
  return `<section class="card settings-card" aria-labelledby="${id}-title"><header class="settings-card-header account-header"><span class="account-mark" aria-hidden="true">${escape(label.slice(0, 1))}</span><div class="account-heading"><h2 class="settings-card-title" id="${id}-title">${escape(label)}</h2><p class="settings-card-description">${escape(link.host)}</p></div>${linkState(link)}</header><div class="settings-card-body">${body}</div>${footer ? `<footer class="settings-card-footer">${footer}</footer>` : ''}</section>`;
}

function renderAccount() {
  const links = state.links;
  let content;
  if (loadError && !links) content = callout({ tone: 'danger', title: 'Could not read your linked accounts', body: `<p>${escape(loadError)}</p>`, actions: act('data-action="accounts-retry"', { label: 'Try again', icon: 'refresh', size: 'sm' }) });
  else if (!links) content = `<section class="card settings-card" aria-busy="true"><div class="settings-card-body">${skeleton({ rows: 2 })}</div></section>`;
  else if (!links.length) content = `<section class="card settings-card account-empty">${emptyState({ icon: 'link', title: 'No accounts to link', body: 'This workbench has no GitLab or ClickUp connection that works with personal accounts. When an administrator adds one, you link your account here, once.' })}</section>`;
  else content = links.map(linkCard).join('');
  renderHtml(shell(`<div class="settings-page">${content}</div>`, { title: 'Linked accounts', subtitle: 'Personal accounts the workbench uses on your behalf. Only you can use them.' }));
}

/** Explains a `link_error` code returned from a provider's authorization page. */
export function linkFailure(code) {
  if (code === 'exchange_401') return 'The provider refused the exchange. For GitLab that means the application is marked Confidential: edit it, untick Confidential, and link again.';
  if (code === 'link_state') return 'The link attempt expired or was started elsewhere. Start it again from this page.';
  if (code === 'access_denied') return 'You declined the authorization at GitLab.';
  return `Linking GitLab failed: ${code}.`;
}

async function loadAccount() {
  loadError = '';
  try { state.links = (await api('/api/links')).links; }
  catch (error) { loadError = error.message; state.links = null; }
  if (state.view === 'account') renderAccount();
}

async function link(button) { button.disabled = true; try { const { url } = await api(`/api/links/${encodeURIComponent(button.dataset.provider)}`, { method: 'POST', body: '{}' }); location.assign(url); } finally { button.disabled = false; } }

function unlink(button) {
  const provider = button.dataset.provider;
  const label = nameOf(provider);
  const consequence = provider === 'gitlab' ? 'forgets your tokens and asks GitLab to revoke them. Sessions on private repositories from this host cannot clone until you link again' : `forgets your token. ${label} task connections show nothing until you link again`;
  confirmAction(`Unlink ${label}?`, `The workbench ${consequence}.`, 'Unlink', async () => { await api(`/api/links/${encodeURIComponent(provider)}`, { method: 'DELETE' }); state.links = (await api('/api/links')).links; renderAccount(); notify(`${label} is unlinked.`); });
}

async function pasteToken(data, form) {
  await api(`/api/links/${encodeURIComponent(form.dataset.provider)}`, { method: 'PUT', body: JSON.stringify({ token: data.token }) });
  notify(`${nameOf(form.dataset.provider)} is linked to your account.`);
  state.links = (await api('/api/links')).links;
  renderAccount();
}

/** The Linked accounts page (`#settings/accounts`): per provider its link state, and link, unlink or paste a personal token. */
export default {
  id: 'account',
  match: hash => hash === 'settings/accounts' ? {} : null,
  load: loadAccount,
  render: renderAccount,
  actions: { link, unlink, 'accounts-retry': () => { state.links = null; renderAccount(); return loadAccount(); } },
  forms: { 'paste-token': pasteToken },
};
