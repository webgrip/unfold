import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify, announce } from '../core/dom.js';
import { button, callout, chip, skeleton } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';

const view = { identity: null, suggestions: [], error: '', loading: false };
onForget(() => Object.assign(view, { identity: null, suggestions: [], error: '', loading: false }));

/** Splits what a person typed into logins: commas, spaces and new lines separate them. */
export function parseLogins(text) {
  return [...new Set(String(text ?? '').split(/[\s,]+/).map(login => login.trim()).filter(Boolean))];
}

function body() {
  if (view.loading && !view.identity) return skeleton({ rows: 3 });
  const identity = view.identity ?? { logins: [], declared: [], mapped: null, source: 'none' };
  const demoMode = state.bootstrap?.mode === 'demo';
  const mapped = identity.mapped ? `<li>${chip({ label: identity.mapped, icon: 'shield', title: demoMode ? 'The demo login' : 'Mapped to you by an administrator' })}</li>` : '';
  const current = identity.logins.length ? `<ul class="identity-logins" aria-label="Your logins">${mapped}${identity.declared.filter(login => login !== identity.mapped).map(login => `<li>${chip({ label: login, icon: 'user' })}</li>`).join('')}</ul>` : '<p class="identity-empty">No logins yet, so your binder is empty.</p>';
  const note = identity.mapped ? `<p class="settings-row-hint"><strong>${escape(identity.mapped)}</strong> is ${demoMode ? 'the demo\'s login' : 'mapped to you by an administrator'}. Only that login can name you as a card's steward. The logins you add here only find cards to collect: they never attribute a card to you or give you any say over it.</p>` : '<p class="settings-row-hint">These logins only find cards to collect. They never attribute a card to you or give you any say over it; an administrator maps the login that does.</p>';
  const suggestions = view.suggestions.filter(login => !identity.logins.includes(login.toLowerCase()));
  const suggest = suggestions.length ? `<p class="settings-row-hint">From your linked accounts: ${suggestions.map(login => `<button type="button" class="identity-suggest" data-action="card-login-add" data-login="${escape(login)}">${icon('plus')}<span>${escape(login)}</span></button>`).join(' ')}</p>` : '';
  return `<div class="settings-row identity-row"><div class="settings-row-text"><p class="settings-row-label">Your logins</p>${current}${note}${suggest}</div></div>
  <form class="settings-row identity-form" data-form="card-identity"><div class="field"><label class="field-label" for="card-logins">Your other forge and tracker logins</label><input id="card-logins" name="logins" type="text" autocomplete="off" spellcheck="false" value="${escape(identity.declared.join(', '))}" aria-describedby="card-logins-hint"><p class="field-hint" id="card-logins-hint">Separate them with commas or spaces, up to 10. Use the names a card's roster shows: who merged, reviewed or carried the ticket.</p></div>${button({ type: 'submit', label: 'Save logins', variant: 'primary' })}</form>`;
}

function renderIdentity() {
  const error = view.error ? callout({ tone: 'danger', title: 'Could not read your card logins', body: `<p>${escape(view.error)}</p>` }) : '';
  const privacy = `<p class="settings-footnote">${icon('lock')}<span>Your binder and packs are private: they are read with your own sign-in, and no one else, an administrator included, can open them. Team pages show Team totals only.</span></p>`;
  const content = `<div class="settings-page">${error}<section class="card settings-card" aria-labelledby="identity-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="identity-title">Card logins</h2><p class="card-subtitle">Unfold finds your copies of Run cards by these logins on each card's roster.</p></div></header><div class="settings-rows">${body()}</div></section>${privacy}</div>`;
  renderHtml(shell(content, { title: 'Card logins', subtitle: 'Which forge and tracker accounts are yours, for your binder and packs.' }));
}

async function enterIdentity() {
  disconnect(); state.session = null; state.view = 'card-identity';
  view.loading = true; view.error = '';
  renderIdentity();
  try {
    const [identity, links] = await Promise.all([api('/api/me/card-identity'), api('/api/links').catch(() => ({ links: [] }))]);
    view.identity = identity;
    view.suggestions = [...new Set((links.links ?? []).map(link => link.login).filter(login => typeof login === 'string' && login))];
  } catch (error) { if (error.status !== 401) view.error = error.message; }
  view.loading = false;
  if (state.view === 'card-identity') renderIdentity();
}

async function save(logins) {
  view.identity = await api('/api/me/card-identity', { method: 'PUT', body: JSON.stringify({ logins }) });
  renderIdentity();
  announce(logins.length ? `Saved ${logins.length === 1 ? 'one login' : `${logins.length} logins`}` : 'Logins cleared');
  notify('Card logins saved. Your binder uses them now.');
}

/** Card logins (`#settings/cards`): the person's own forge and tracker logins, which find their card copies for the binder and packs. */
export default {
  id: 'card-identity',
  match: hash => hash === 'settings/cards' ? {} : null,
  enter: enterIdentity,
  render: renderIdentity,
  forms: { 'card-identity': data => save(parseLogins(data.logins)) },
  actions: { 'card-login-add': element => save([...(view.identity?.declared ?? []), element.dataset.login]) },
};
