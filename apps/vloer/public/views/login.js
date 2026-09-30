import { state, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { button, callout } from '../core/ui.js';
import { boot } from '../core/navigation.js';

const wordmark = 'M405 0L79 0L79-687L405-687Q523-687 606-649Q689-611 733-535Q777-459 777-344L777-344Q777-229 733-152.50Q689-76 606-38Q523 0 405 0L405 0ZM268-543L268-145L399-145Q443-145 477-157Q511-169 535-192Q559-215 571-249Q583-283 583-326L583-326L583-361Q583-405 571-439Q559-473 535-496Q511-519 477-531Q443-543 399-543L399-543L268-543ZM1164 12L1164 12Q1066 12 996-17.50Q926-47 888.50-108Q851-169 851-264L851-264Q851-357 888.50-418Q926-479 994-509Q1062-539 1157-539L1157-539Q1252-539 1319-510Q1386-481 1421-421Q1456-361 1456-268L1456-268L1456-230L1028-230Q1029-188 1044-159.50Q1059-131 1089-117Q1119-103 1164-103L1164-103Q1189-103 1211-108.50Q1233-114 1249-125Q1265-136 1274-152Q1283-168 1283-187L1283-187L1455-187Q1455-140 1434.50-103Q1414-66 1375.50-40.50Q1337-15 1283.50-1.50Q1230 12 1164 12ZM1029-323L1029-323L1277-323Q1277-348 1268.50-366.50Q1260-385 1245-398Q1230-411 1209-417.50Q1188-424 1162-424L1162-424Q1121-424 1093-412Q1065-400 1049.50-377.50Q1034-355 1029-323ZM2207 0L1996 0L1715-687L1921-687L2057-321Q2063-306 2071-283Q2079-260 2087.50-236Q2096-212 2102-193L2102-193L2109-193Q2115-210 2123-233Q2131-256 2139-279.50Q2147-303 2154-320L2154-320L2290-687L2488-687L2207 0ZM2723 0L2550 0L2550-687L2723-687L2723 0ZM3119 12L3119 12Q3024 12 2955-18.50Q2886-49 2848.50-110Q2811-171 2811-264L2811-264Q2811-357 2848.50-418Q2886-479 2955-509Q3024-539 3119-539L3119-539Q3214-539 3283-509Q3352-479 3389-418Q3426-357 3426-264L3426-264Q3426-171 3389-110Q3352-49 3283-18.50Q3214 12 3119 12ZM3119-110L3119-110Q3164-110 3193.50-126.50Q3223-143 3237-174Q3251-205 3251-248L3251-248L3251-279Q3251-322 3237-353.50Q3223-385 3193.50-401.50Q3164-418 3119-418L3119-418Q3073-418 3044-401.50Q3015-385 3001-353.50Q2987-322 2987-279L2987-279L2987-248Q2987-205 3001-174Q3015-143 3044-126.50Q3073-110 3119-110ZM3804 12L3804 12Q3706 12 3636-17.50Q3566-47 3528.50-108Q3491-169 3491-264L3491-264Q3491-357 3528.50-418Q3566-479 3634-509Q3702-539 3797-539L3797-539Q3892-539 3959-510Q4026-481 4061-421Q4096-361 4096-268L4096-268L4096-230L3668-230Q3669-188 3684-159.50Q3699-131 3729-117Q3759-103 3804-103L3804-103Q3829-103 3851-108.50Q3873-114 3889-125Q3905-136 3914-152Q3923-168 3923-187L3923-187L4095-187Q4095-140 4074.50-103Q4054-66 4015.50-40.50Q3977-15 3923.50-1.50Q3870 12 3804 12ZM3669-323L3669-323L3917-323Q3917-348 3908.50-366.50Q3900-385 3885-398Q3870-411 3849-417.50Q3828-424 3802-424L3802-424Q3761-424 3733-412Q3705-400 3689.50-377.50Q3674-355 3669-323ZM4357 0L4184 0L4184-527L4325-527L4337-443L4345-443Q4358-472 4378.50-494Q4399-516 4426.50-528Q4454-540 4487-540L4487-540Q4506-540 4522-536.50Q4538-533 4549-529L4549-529L4549-385L4483-385Q4450-385 4426-375Q4402-365 4386.50-347Q4371-329 4364-304Q4357-279 4357-248L4357-248L4357 0Z';
const lockup = `<svg class="signin-lockup" viewBox="0 0 358.301 50.803" fill="none" role="img" aria-label="De Vloer" focusable="false"><g transform="translate(-10 -7)"><path class="signin-mark-v" d="M17.5 14.5L32 49.5L46.5 14.5" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="10" y="42" width="44" height="8" fill="currentColor"/><g transform="translate(63.71 57) scale(0.067)"><path d="${wordmark}" fill="currentColor"/></g></g></svg>`;
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

function brandPanel() {
  const trust = [['shield', 'Self-hosted on your own infrastructure'], ['lock', 'Your models, your keys and your budgets'], ['eye', 'Every Run and every decision on the record']];
  return `<section class="signin-brand">${lockup}<div class="signin-brand-copy"><p class="signin-tagline">A place to direct the work.</p><p class="signin-pitch">Agents do the work. You review it, steer it and decide what ships.</p></div><span class="signin-floor" aria-hidden="true"></span><ul class="signin-trust">${trust.map(([glyph, text]) => `<li>${icon(glyph)}<span>${escape(text)}</span></li>`).join('')}</ul></section>`;
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

async function signOut() { await api('/api/logout', { method: 'POST', body: '{}' }); state.sessionExpired = false; state.bootstrap = null; state.ploeg = null; state.ploegDetail = null; state.ploegRequest++; disconnect(); renderLogin(); }

function revealPassword(control) {
  const input = $('#login-password');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  control.setAttribute('aria-pressed', String(show));
  control.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  control.title = show ? 'Hide password' : 'Show password';
  control.innerHTML = icon(show ? 'lock' : 'eye');
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
