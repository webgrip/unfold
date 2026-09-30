import { state, disconnect, forgetUserData } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { button, callout, stateBadge } from '../core/ui.js';
import { boot } from '../core/navigation.js';
import { lockupSvg } from '../core/brand.js';

const lockup = lockupSvg({ className: 'signin-lockup', label: 'De Vloer' });
const returnKey = 'vloer.returnTo';

let accountName = '';
let invalid = false;

const act = (attribute, options) => button(options).replace(/^<(a|button) /, `<$1 ${attribute} `);

function loginFailure(code) {
  if (!code) return '';
  if (code === 'oidc_not_entitled') return 'You signed in, but your account is in none of the groups this workbench admits. Ask an administrator for the vloer group.';
  if (code === 'oidc_state') return 'The sign-in attempt expired. Start it again.';
  if (code === 'access_denied') return 'You cancelled the sign-in at the identity provider.';
  return `Single sign-on failed: ${code}.`;
}

/** Remembers the current hash before single sign-on leaves the page, so the deep link survives the round trip. */
export function rememberReturnHash() {
  try { if (location.hash && location.hash !== '#now') sessionStorage.setItem(returnKey, location.hash); } catch {}
}

/** Returns and forgets the hash remembered before single sign-on, or an empty string. */
export function takeReturnHash() {
  try { const hash = sessionStorage.getItem(returnKey) || ''; sessionStorage.removeItem(returnKey); return /^#[^<>"'\s]{1,500}$/.test(hash) ? hash : ''; } catch { return ''; }
}

function glimpse() {
  const row = (state, width) => `<span class="signin-glimpse-row">${stateBadge(state)}<span class="signin-glimpse-line" data-width="${width}"></span></span>`;
  return `<span class="signin-glimpse" aria-hidden="true">${row('awaiting_review', 'long')}${row('needs_human', 'mid')}${row('leased', 'short')}</span>`;
}

function brandPanel() {
  const trust = [['shield', 'Self-hosted on your own infrastructure'], ['lock', 'Your models, your keys and your budgets'], ['eye', 'Every Run and every decision on the record']];
  return `<section class="signin-brand">${lockup}<div class="signin-brand-copy"><p class="signin-tagline">A place to direct the work.</p><p class="signin-pitch">Agents do the work. You review it, steer it and decide what ships.</p>${glimpse()}</div><span class="signin-floor" aria-hidden="true"></span><ul class="signin-trust">${trust.map(([glyph, text]) => `<li>${icon(glyph)}<span>${escape(text)}</span></li>`).join('')}</ul></section>`;
}

function formPanel(error) {
  const oidc = state.authMethods.oidc;
  const expired = state.sessionExpired && !error ? callout({ tone: 'attention', icon: 'clock', title: 'Your session expired', body: '<p>Sign in again to continue where you were.</p>' }) : '';
  const sso = oidc ? `${act('data-action="sso"', { label: `Continue with ${oidc.name}`, href: '/api/auth/oidc', variant: 'primary', size: 'lg', icon: 'user' })}<p class="signin-sso-note">Your organisation account. Your role follows your groups.</p><div class="signin-divider"><span>or use a local account</span></div>` : '';
  const alert = error ? `<div id="login-error" role="alert">${callout({ tone: 'danger', body: `<p>${escape(error)}</p>` })}</div>` : '';
  const flagged = invalid && error ? ' aria-invalid="true" aria-describedby="login-error"' : '';
  const reveal = act('data-action="login-reveal"', { icon: 'eye', ariaLabel: 'Show password', title: 'Show password', variant: 'ghost', size: 'sm', id: 'login-reveal' }).replace('<button ', '<button aria-pressed="false" ');
  const fields = `<div class="field"><label class="field-label" for="login-name">Account name</label><input id="login-name" name="name" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${escape(accountName)}"${flagged}></div><div class="field"><label class="field-label" for="login-password">Password</label><div class="signin-password"><input id="login-password" name="password" type="password" autocomplete="current-password" required${flagged}>${reveal}</div><p class="field-hint signin-caps" id="login-caps" hidden>${icon('alert')}Caps Lock is on.</p></div>`;
  const submit = button({ type: 'submit', label: 'Sign in', variant: oidc ? 'secondary' : 'primary', size: 'lg' });
  return `<section class="signin-panel"><div class="signin-card"><header class="signin-header"><h1 class="signin-title">Welcome back.</h1><p class="signin-subtitle">Sign in to your team’s workbench.</p></header>${expired}${sso}<form data-form="login" class="signin-form">${alert}${fields}${submit}</form><p class="signin-help">No account yet? An administrator creates workbench accounts.</p></div></section>`;
}

/** Draws the sign-in page, with single sign-on first when configured, `error` when a sign-in failed and a note when the session expired. */
export async function renderLogin(error = '') {
  if (!state.authMethods) { try { state.authMethods = await (await fetch('/api/auth/methods', { credentials: 'same-origin' })).json(); } catch { state.authMethods = { local: true, oidc: null }; } }
  document.title = 'Sign in · De Vloer';
  const params = new URLSearchParams(location.search);
  if (params.get('login_error')) { error = error || loginFailure(params.get('login_error')); invalid = false; history.replaceState(null, '', `${location.pathname}${location.hash}`); }
  if (!error) invalid = false;
  $('#app').innerHTML = `<main class="signin" id="main" tabindex="-1">${brandPanel()}${formPanel(error)}</main>`;
  const target = invalid || accountName ? $('#login-password') : state.authMethods.oidc ? null : $('#login-name');
  target?.focus({ preventScroll: true });
}

async function signIn(data) {
  accountName = String(data.name || '');
  try { await api('/api/login', { method: 'POST', body: JSON.stringify(data) }); state.sessionExpired = false; invalid = false; accountName = ''; await boot(); }
  catch (error) { invalid = error.status === 401 || error.status === 400; renderLogin(error.message); }
}

async function signOut() { await api('/api/logout', { method: 'POST', body: '{}' }); state.sessionExpired = false; state.bootstrap = null; disconnect(); forgetUserData(); renderLogin(); }

function revealPassword(control) {
  const input = $('#login-password');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  control.setAttribute('aria-pressed', String(show));
  control.innerHTML = show ? icon('eye-off') : icon('eye');
  input.focus();
}

function capsLock(event) {
  if (event.target?.id !== 'login-password' || typeof event.getModifierState !== 'function') return false;
  const hint = $('#login-caps');
  if (hint) hint.hidden = !event.getModifierState('CapsLock');
  return false;
}

/** The sign-in page and signing out. */
export default {
  id: 'login',
  render: () => renderLogin(),
  actions: { logout: signOut, sso: () => rememberReturnHash(), 'login-reveal': revealPassword },
  forms: { login: signIn },
  keys: [capsLock],
};
