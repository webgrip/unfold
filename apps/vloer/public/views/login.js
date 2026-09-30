import { state, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { boot } from '../core/navigation.js';

function loginFailure(code) {
  if (!code) return '';
  if (code === 'oidc_not_entitled') return 'You signed in, but your account is in none of the groups this workbench admits. Ask an administrator for the vloer group.';
  if (code === 'oidc_state') return 'The sign-in attempt expired. Start it again.';
  if (code === 'access_denied') return 'You cancelled the sign-in at the identity provider.';
  return `Single sign-on failed: ${code}.`;
}

const returnKey = 'vloer.returnTo';

/** Remembers the current hash before single sign-on leaves the page, so the deep link survives the round trip. */
export function rememberReturnHash() {
  try { if (location.hash && location.hash !== '#now') sessionStorage.setItem(returnKey, location.hash); } catch {}
}

/** Returns and forgets the hash remembered before single sign-on, or an empty string. */
export function takeReturnHash() {
  try { const hash = sessionStorage.getItem(returnKey) || ''; sessionStorage.removeItem(returnKey); return /^#[^<>"'\s]{1,500}$/.test(hash) ? hash : ''; } catch { return ''; }
}

/** Draws the sign-in page, with single sign-on when configured, `error` when a sign-in failed and a note when the session expired. */
export async function renderLogin(error = '') {
  if (!state.authMethods) { try { state.authMethods = await (await fetch('/api/auth/methods', { credentials: 'same-origin' })).json(); } catch { state.authMethods = { local: true, oidc: null }; } }
  document.title = 'Sign in · De Vloer';
  const params = new URLSearchParams(location.search);
  if (params.get('login_error')) { error = error || loginFailure(params.get('login_error')); history.replaceState(null, '', location.pathname); }
  const sso = state.authMethods.oidc ? `<a class="button primary full sso-button" href="/api/auth/oidc" data-action="sso">Sign in with ${escape(state.authMethods.oidc.name)}</a><p class="form-help">Your estate identity. Your role follows your groups.</p><div class="login-divider"><span>or a local account</span></div>` : '';
  $('#app').innerHTML = `<main class="login-page" id="main"><section class="login-brand"><svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M17.5 14.5L32 49.5L46.5 14.5" stroke="var(--peil)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="10" y="42" width="44" height="8" fill="currentColor"/></svg><span>De Vloer</span><h1>A place to<br>direct the work.</h1><p>Remote workspaces. Reusable crews.<br>Evidence you can inspect.</p></section><section class="login-form"><div><p class="eyebrow">YOUR TEAM’S WORKBENCH</p><h2>Welcome back.</h2><p>Sign in with your De Vloer account.</p>${sso}${state.sessionExpired && !error ? '<p class="notice compact-notice session-expired" role="status">Your session expired. Sign in to continue where you were.</p>' : ''}<form data-form="login"><label>Account name<input name="name" autocomplete="username" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>${error ? `<p class="form-error" role="alert">${escape(error)}</p>` : ''}<button class="button primary full" type="submit">Sign in ${icon('arrow')}</button></form><small>Your administrator provisions workbench accounts.</small></div></section></main>`;
}

async function signIn(data) {
  try { await api('/api/login', { method: 'POST', body: JSON.stringify(data) }); state.sessionExpired = false; await boot(); }
  catch (error) { renderLogin(error.message); }
}

async function signOut() { await api('/api/logout', { method: 'POST', body: '{}' }); state.sessionExpired = false; state.bootstrap = null; state.ploeg = null; state.ploegDetail = null; state.ploegRequest++; disconnect(); renderLogin(); }

/** The sign-in page and signing out. */
export default {
  id: 'login',
  render: () => renderLogin(),
  actions: { logout: signOut, sso: () => rememberReturnHash() },
  forms: { login: signIn },
};
