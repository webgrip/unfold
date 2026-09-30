import { state, disconnect, forgetUserData } from './core/state.js';
import { api, onUnauthorized } from './core/api.js';
import { $, notify } from './core/dom.js';
import { configureFormat } from './core/format.js';
import { prefs, prefsKey, applyAppearance } from './core/prefs.js';
import { live } from './core/live.js';
import { createGlobalKeys } from './core/keys.js';
import { useNavigation, openPage } from './core/navigation.js';
import { createRegistry, findRoute } from './core/registry.js';
import { parseHash, redirect } from './core/route.js';
import { views } from './views/index.js';
import { renderLogin, takeReturnHash } from './views/login.js';
import { updateChrome, updateLiveState, closeTransientChrome, handleChromeClick } from './shell.js';
import { refreshCounts, onCountsChange } from './core/counts.js';
import { linkFailure } from './views/account.js';

const registry = createRegistry(views);
const landing = 'now';
const signedOut = 'login';
const unknownView = 'sessions';
const globalKeys = createGlobalKeys({ dispatch: (name, event) => { const action = registry.actions.get(name); if (action) Promise.resolve(action.handler(null, event)).catch(error => notify(error.message, true)); } });

const sharedPrefs = ['theme', 'density', 'format', 'singleKeyShortcuts', 'live'];
const readShared = () => Object.fromEntries(sharedPrefs.map(key => [key, prefs.get(key)]));
let applied = readShared();
prefs.subscribe((key, value) => { if (sharedPrefs.includes(key)) applied = { ...applied, [key]: value }; });

function applyPreferences() { applied = readShared(); configureFormat({ locale: applied.format }); applyAppearance(); }

function preferencesChanged(event) {
  if (event.key !== prefsKey && event.key !== null) return;
  const next = readShared();
  const changed = sharedPrefs.filter(key => next[key] !== applied[key]);
  if (!changed.length) return;
  applyPreferences();
  live.wake();
  if (!state.bootstrap) return;
  if (changed.every(key => key === 'live')) updateChrome(); else render();
}

function render() {
  if (!state.bootstrap) return registry.views.get(signedOut).render();
  const view = registry.views.get(state.view);
  return (view?.render ? view : registry.views.get(unknownView)).render();
}

async function route() {
  if (!state.bootstrap) return;
  const moved = redirect(location.hash);
  if (moved !== null) history.replaceState(null, '', `#${moved}`);
  const { path, query } = parseHash(location.hash);
  state.ploegRequest++;
  try {
    const found = findRoute(registry, path);
    if (found?.view.enter) return await found.view.enter({ ...found.params, query });
    await openPage(found ? found.view.id : landing);
    for (const page of registry.pages) if (page.load && state.view === page.id) await page.load();
  } catch (error) { if (error.status !== 401) notify(error.message, true); if (state.bootstrap) { state.view = landing; registry.views.get(landing).render(); } }
}

function dispatchField(table, event) {
  for (const [selector, { handler }] of table) {
    const element = event.target.closest(selector);
    if (element) handler(element, event);
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const linkNotice = params.get('linked') ? `${({ gitlab: 'GitLab', clickup: 'ClickUp' })[params.get('linked')] || params.get('linked')} is linked to your account.` : params.get('link_error') ? linkFailure(params.get('link_error')) : '';
  if (linkNotice) history.replaceState(null, '', `${location.pathname}#settings/accounts`);
  const editorDone = params.get('editor') === 'done';
  if (editorDone) history.replaceState(null, '', location.pathname);
  try { state.bootstrap = await api('/api/bootstrap'); state.sessions = await api('/api/sessions'); const returnTo = takeReturnHash(); if (returnTo && (!location.hash || location.hash === '#now')) history.replaceState(null, '', `${location.pathname}${returnTo}`); await route(); if (state.view !== 'now') refreshCounts().catch(() => {}); if (linkNotice) notify(linkNotice, Boolean(params.get('link_error'))); if (editorDone) notify('Signed in for your editor. You can return to it now.'); }
  catch (error) { if (!state.bootstrap) renderLogin(error.message.includes('Sign in') ? '' : error.message); else notify(error.message, true); }
}

onUnauthorized(() => {
  const expired = Boolean(state.bootstrap);
  disconnect(); state.bootstrap = null; state.sessionExpired = state.sessionExpired || expired; forgetUserData();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  renderLogin();
});
onCountsChange(updateChrome);
live.subscribe(updateLiveState);
useNavigation({ render, boot });
applyPreferences();
live.start();

document.addEventListener('click', async event => {
  handleChromeClick(event);
  if (event.target.closest('.skip-link')) { event.preventDefault(); $('#main')?.focus(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = registry.actions.get(button.dataset.action);
  try { if (action) await action.handler(button, event); }
  catch (error) { button.disabled = false; notify(error.message, true); }
});
document.addEventListener('input', event => dispatchField(registry.inputs, event));
document.addEventListener('change', event => dispatchField(registry.changes, event));
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
  try { await registry.forms.get(form.dataset.form)?.handler(data, form, event); }
  catch (error) { notify(error.message, true); }
  finally { if (submit) submit.disabled = false; }
});
document.addEventListener('keydown', event => { if (globalKeys(event)) return; for (const binding of registry.keys) if (binding(event)) return; });
document.addEventListener('visibilitychange', () => live.wake());
document.addEventListener('close', () => live.wake(), true);
window.addEventListener('storage', preferencesChanged);
window.addEventListener('hashchange', () => { closeTransientChrome(); state.focusHeading = true; void route(); });
window.addEventListener('beforeunload', disconnect);
void boot();
