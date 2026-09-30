import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, safeUrl, renderHtml, notify } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { date, dateTime, plural, relative } from '../core/format.js';
import { badge, button, callout, chip, disclosure, dl, emptyState, skeleton, timeAt } from '../core/ui.js';
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
const soon = 7 * 86400e3;

function expiresAt(link) {
  const at = link.expiresAt ? Date.parse(link.expiresAt) : NaN;
  return Number.isFinite(at) && link.method !== 'oauth' ? at : null;
}

function linkState(link) {
  const at = expiresAt(link);
  if (link.linked && at !== null && at <= Date.now()) return badge({ tone: 'danger', glyph: 'x-circle', label: 'Expired' });
  if (link.linked) return badge({ tone: 'success', glyph: 'check-circle', label: 'Linked' });
  return badge({ tone: 'neutral', glyph: 'circle-dashed', label: 'Not linked' });
}

function tokenForm(link) {
  const help = tokenHelp[link.provider] || { where: '', placeholder: '' };
  const id = `token-${escape(link.provider)}`;
  return `<form data-form="paste-token" data-provider="${escape(link.provider)}" class="account-token"><div class="field"><label class="field-label" for="${id}">Personal token</label><input id="${id}" name="token" type="password" autocomplete="off" spellcheck="false" required placeholder="${escape(help.placeholder)}" aria-describedby="${id}-hint"><p class="field-hint" id="${id}-hint">${escape(help.where)} Stored encrypted, for your account only.</p></div>${button({ type: 'submit', label: 'Save token', variant: link.oauth ? 'secondary' : 'primary' })}</form>`;
}

function inWords(ms) {
  const days = Math.floor(ms / 86400e3);
  if (days >= 1) return `in ${plural(days, 'day')}`;
  const hours = Math.floor(ms / 3600e3);
  return hours >= 1 ? `in ${plural(hours, 'hour')}` : 'within the hour';
}

function expiry(link) {
  if (link.method === 'oauth') return link.expiresAt && Number.isFinite(Date.parse(link.expiresAt)) ? `<span title="${escape(`The current access token runs until ${dateTime(link.expiresAt)}; the workbench renews it the next time it clones for you.`)}">Renews when used</span>` : null;
  const at = expiresAt(link);
  if (at === null) return null;
  const left = at - Date.now();
  const moment = new Date(at);
  const when = `<time class="num" datetime="${escape(moment.toISOString())}" title="${escape(dateTime(moment))}">${left <= 0 ? `Expired ${escape(relative(moment))}` : left > soon ? `On ${escape(date(moment))}` : escape(inWords(left))}</time>`;
  return left > 0 && left < soon ? `<span class="account-expiry">${when}${badge({ tone: 'attention', glyph: 'alert', label: 'Expires soon', size: 'sm' })}</span>` : when;
}

function linkedFacts(link) {
  const web = safeUrl(link.webUrl || '');
  const who = link.login ? (web ? `<a href="${escape(web)}" target="_blank" rel="noopener noreferrer">${escape(link.login)}<span class="sr-only"> (opens in a new tab)</span></a>` : escape(link.login)) : null;
  const scopes = (link.scopes || []).length ? `<span class="account-scopes">${link.scopes.map(scope => chip({ label: scope })).join('')}</span>` : null;
  const rows = [
    ['Signed in as', who],
    ['Method', link.method === 'token' ? 'Personal token' : link.method === 'oauth' ? 'Signed in with OAuth' : null],
    ['Linked', link.linkedAt ? timeAt(link.linkedAt) : null],
    [link.method === 'oauth' ? 'Access' : 'Expires', expiry(link)],
    ['Scopes', scopes],
  ];
  return dl(rows.filter(([, value]) => value !== null), { rows: true });
}

function linkCard(link) {
  const label = nameOf(link.provider);
  const help = tokenHelp[link.provider] || {};
  const id = `link-${escape(link.provider)}`;
  const why = `<p class="account-why">${escape(help.without || `Link ${label} to use it here.`)}</p>`;
  let body;
  let note;
  if (link.linked) {
    body = linkedFacts(link);
    note = 'The workbench uses this link for you only and never hands it to an agent workspace.';
  } else if (link.oauth) {
    body = `${why}<div class="account-primary">${act('data-action="link"', { label: `Link ${label}`, variant: 'primary', icon: 'link', data: { provider: link.provider } })}</div>${disclosure({ summary: 'Use a personal token instead', body: tokenForm(link), id: `${id}-token` })}`;
    note = `You sign in at ${label}; the workbench never sees your password.`;
  } else {
    body = `${why}${tokenForm(link)}`;
    note = '';
  }
  const unlink = link.linked ? act('data-action="unlink"', { label: `Unlink ${label}`, variant: 'danger-ghost', size: 'sm', data: { provider: link.provider } }) : '';
  const footer = note ? `<footer class="settings-card-footer"><p class="settings-card-note">${icon('lock')}<span>${escape(note)}</span></p>${unlink}</footer>` : '';
  return `<section class="card settings-card account-card" aria-labelledby="${id}-title"><header class="card-header account-header"><div class="account-heading"><h2 class="card-title" id="${id}-title">${escape(label)}</h2><p class="card-subtitle">${escape(link.host)}</p></div>${linkState(link)}</header><div class="card-body">${body}</div>${footer}</section>`;
}

function renderAccount() {
  const links = state.links;
  let content;
  if (loadError && !links) content = callout({ tone: 'danger', title: 'Could not read your linked accounts', body: `<p>${escape(loadError)}</p>`, actions: act('data-action="accounts-retry"', { label: 'Try again', icon: 'refresh', size: 'sm' }) });
  else if (!links) content = `<div class="account-grid" aria-busy="true"><section class="card settings-card account-card account-loading">${skeleton({ rows: 2 })}</section></div>`;
  else if (!links.length) content = `<section class="card settings-card account-empty">${emptyState({ icon: 'link', title: 'No accounts to link', body: 'This workbench has no GitLab or ClickUp connection that works with personal accounts. When an administrator adds one, you link your account here, once.' })}</section>`;
  else content = `<div class="account-grid">${links.map(linkCard).join('')}</div>`;
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
  if (state.view === 'account' && state.bootstrap) renderAccount();
}

async function link(button) { button.disabled = true; try { const { url } = await api(`/api/links/${encodeURIComponent(button.dataset.provider)}`, { method: 'POST', body: '{}' }); location.assign(url); } finally { button.disabled = false; } }

function unlink(button) {
  const provider = button.dataset.provider;
  const label = nameOf(provider);
  const consequence = provider === 'gitlab' ? 'forgets your tokens and asks GitLab to revoke them. Sessions on private repositories from this host cannot clone until you link again' : `forgets your token. ${label} task connections show nothing until you link again`;
  confirmAction(`Unlink ${label}?`, `The workbench ${consequence}.`, 'Unlink', async () => { await api(`/api/links/${encodeURIComponent(provider)}`, { method: 'DELETE' }); state.links = (await api('/api/links')).links; if (state.view === 'account' && state.bootstrap) renderAccount(); notify(`${label} is unlinked.`); }, { tone: 'danger', dismiss: 'Keep it linked' });
}

async function pasteToken(data, form) {
  await api(`/api/links/${encodeURIComponent(form.dataset.provider)}`, { method: 'PUT', body: JSON.stringify({ token: data.token }) });
  notify(`${nameOf(form.dataset.provider)} is linked to your account.`);
  state.links = (await api('/api/links')).links;
  if (state.view === 'account' && state.bootstrap) renderAccount();
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
