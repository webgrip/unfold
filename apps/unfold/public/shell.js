import { state } from './core/state.js';
import { $, escape, announce } from './core/dom.js';
import { icon } from './core/icons.js';
import { relative } from './core/format.js';
import { live } from './core/live.js';
import { prefs, applyAppearance } from './core/prefs.js';
import { keyLabel, openShortcuts, singleKeysEnabled } from './core/keys.js';
import { sessionsNeedingYou } from './core/counts.js';
import { lockupSvg, markSvg } from './core/brand.js';
import { avatar } from './core/ui.js';

const lockup = lockupSvg({ className: 'app-lockup' });
const mark = markSvg({ className: 'app-mark' });

const groups = [
  { id: 'home', items: [{ id: 'now', href: '#now', glyph: 'inbox', label: 'Now', count: 'waiting', describe: n => `${n} waiting on you`, tone: 'attention' }] },
  { id: 'work', items: [
    { id: 'work', href: '#work', glyph: 'work', label: 'Work' },
    { id: 'proposed', href: '#proposed', glyph: 'proposed', label: 'Proposed', count: 'proposed', describe: n => `${n} proposed`, tone: 'neutral' },
    { id: 'tasks', href: '#tasks', glyph: 'tasks', label: 'Tasks' },
  ] },
  { id: 'follow', items: [
    { id: 'runs', href: '#runs', glyph: 'runs', label: 'Runs' },
    { id: 'activity', href: '#activity', glyph: 'activity', label: 'Activity' },
    { id: 'insights', href: '#insights', glyph: 'insights', label: 'Insights' },
    { id: 'status', href: '#status', glyph: 'monitor', label: 'Status', signal: true },
    { id: 'sessions', href: '#sessions', glyph: 'sessions', label: 'Sessions', count: 'sessions', describe: n => `${n} ${n === 1 ? 'needs' : 'need'} you`, tone: 'attention', when: () => showsSessions() },
  ] },
  { id: 'settings', items: [{ id: 'settings', href: '#settings/preferences', glyph: 'settings', label: 'Settings' }] },
];
const cardPages = [['binder', '#binder', 'cards', 'Binder'], ['packs', '#packs', 'pack', 'Packs'], ['season', '#season', 'calendar', 'Season']];
const quick = ['now', 'work', 'runs'];
const settingsPages = [['preferences', '#settings/preferences', 'Preferences'], ['system', '#settings/environment', 'Environment'], ['account', '#settings/accounts', 'Linked accounts'], ['editors', '#settings/editors', 'Signed-in editors'], ['card-identity', '#settings/cards', 'Card logins'], ['designer', '#settings/card-designer', 'Card designer']];
const areas = { session: 'sessions', account: 'settings', system: 'settings', preferences: 'settings', design: 'settings', 'card-identity': 'settings', designer: 'settings', editors: 'settings', 'editor-sign-in': 'settings' };
const groupOf = { binder: 'Your cards', packs: 'Your cards', season: 'Your cards', settings: 'Settings' };
const themes = [['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']];
const ploegStates = {
  demo: ['neutral', 'Ploeg: demo data', 'Illustrative Ploeg records. No Run executes and no model is called.'],
  connected: ['success', 'Ploeg connected', 'Ploeg answered the last check.'],
  partial: ['attention', 'Ploeg partly unavailable', 'Some of Ploeg’s data could not be read in the last check.'],
  unavailable: ['danger', 'Ploeg unreachable', 'Ploeg did not answer the last check. Pages show the last data they read.'],
  unconfigured: ['neutral', 'Ploeg not configured', 'No Ploeg connection is configured for this workbench.'],
  'no-access': ['neutral', 'No Ploeg teams', 'Your account has no Ploeg teams. Ask an administrator for access.'],
};
let lastTitle = 'Unfold';

const area = () => areas[state.view] || state.view;

/** Whether the Sessions area is offered: in demo mode, with shared execution configured, or when sessions exist. */
export function showsSessions() {
  return state.bootstrap?.mode === 'demo' || Boolean(state.bootstrap?.sharedExecution) || state.sessions.length > 0 || state.view === 'session' || state.view === 'sessions';
}

function countValue(key) {
  const value = state.counts?.[key];
  return typeof value === 'number' && value > 0 ? value : null;
}

function syncSessionCount() {
  state.counts = { ...state.counts, sessions: sessionsNeedingYou(state.sessions) };
}

/** The document title for a page: `(<waiting>) <Page> · Unfold`, without the count when it is zero or unknown. */
export function documentTitle(title, waiting = countValue('waiting')) {
  return `${waiting ? `(${waiting}) ` : ''}${title} · Unfold`;
}

function countMarkup(item, where) {
  if (!item.count) return '';
  const value = countValue(item.count);
  return `<span class="app-count" data-tone="${item.tone}" data-count-for="${item.count}" aria-hidden="true" ${value ? '' : 'hidden'}>${value ?? ''}</span><span class="app-hidden-description" id="${where}-count-${item.id}" data-count-describe="${item.count}" hidden>${value ? escape(item.describe(value)) : ''}</span>`;
}

const signals = { down: 'New work cannot start right now', degraded: 'Work starts, but not reliably' };

function signalMarkup(item, where) {
  if (!item.signal) return '';
  const value = state.statusSignal;
  return `<span class="app-signal" data-signal data-tone="${value === 'down' ? 'danger' : 'attention'}" aria-hidden="true" ${value ? '' : 'hidden'}></span><span class="app-hidden-description" id="${where}-signal-${item.id}" data-signal-describe hidden>${value ? escape(signals[value]) : ''}</span>`;
}

function hrefOf(item) {
  return item.id === 'settings' && state.bootstrap?.user?.role === 'admin' ? '#settings/environment' : item.href;
}

function itemMarkup(item, where) {
  const current = area() === item.id;
  return `<li><a class="app-nav-item" href="${hrefOf(item)}" aria-label="${escape(item.label)}" data-tip="${escape(item.label)}" ${item.count ? `aria-describedby="${where}-count-${item.id}"` : item.signal ? `aria-describedby="${where}-signal-${item.id}"` : ''} ${current ? 'aria-current="page"' : ''}>${icon(item.glyph)}<span class="app-nav-label" aria-hidden="true">${escape(item.label)}</span>${countMarkup(item, where)}${signalMarkup(item, where)}</a></li>`;
}

function navMarkup(where) {
  return `<nav class="app-nav" aria-label="Primary navigation">${groups.map(group => {
    const items = group.items.filter(item => !item.when || item.when());
    if (!items.length) return '';
    const offline = group.id === 'ploeg' && state.ploegStatus === 'unconfigured';
    const heading = group.label ? `<p class="app-nav-group" id="${where}-group-${group.id}">${escape(group.label)}${offline ? '<span class="app-nav-hint"> · Not connected</span>' : ''}</p>` : '';
    return `<div class="app-nav-section" data-group="${group.id}"${offline ? ' data-unconfigured' : ''}>${heading}<ul class="app-nav-list" ${group.label ? `aria-labelledby="${where}-group-${group.id}"` : ''}>${items.map(item => itemMarkup(item, where)).join('')}</ul></div>`;
  }).join('')}</nav>`;
}

function sidebarMarkup() {
  const version = state.bootstrap.version ? `<p class="app-version">Unfold ${escape(state.bootstrap.version)}</p>` : '';
  return `<div class="app-sidebar"><a class="app-brand" href="#now" aria-label="Unfold home">${lockup}${mark}</a>${navMarkup('sidebar')}${version}</div>`;
}

function ploegStatus() {
  const [tone, text, detail] = ploegStates[state.ploegStatus] || ['neutral', 'Checking Ploeg…', 'Unfold has not heard from Ploeg yet.'];
  return { tone, text, detail };
}

function updatedText() { return live.lastUpdated ? `Updated ${relative(live.lastUpdated)}` : ''; }

function streamState() { return state.view === 'session' && state.session ? (state.online ? 'online' : 'offline') : null; }

function statusFacts() {
  const ploeg = ploegStatus();
  const stream = streamState();
  const updated = updatedText();
  const tip = [ploeg.detail, stream === 'online' ? 'The session stream is connected.' : stream === 'offline' ? 'The session stream is reconnecting.' : '', live.paused ? 'Auto-refresh is paused.' : '', updated ? `${updated}.` : ''].filter(Boolean).join(' ');
  return { tone: stream === 'offline' ? 'attention' : ploeg.tone, text: stream === 'offline' ? 'Reconnecting…' : ploeg.text, tip, updated };
}

function liveButton() {
  const paused = live.paused;
  const label = paused ? 'Resume auto-refresh' : 'Pause auto-refresh';
  return `<button class="app-live" type="button" data-action="live-toggle" data-live-toggle data-state="${paused ? 'paused' : 'live'}" aria-label="${label}" title="${label}">${icon(paused ? 'play' : 'pause')}<span class="app-live-label" data-live-label ${paused ? '' : 'hidden'}>Paused</span></button>`;
}

function statusMarkup() {
  const demo = state.bootstrap.mode === 'demo';
  const facts = statusFacts();
  return `<div class="app-status" role="group" aria-label="Status"><span class="app-status-ploeg" data-ploeg-status data-tone="${facts.tone}" title="${escape(facts.tip)}"><span class="app-dot" aria-hidden="true"></span><span data-ploeg-text>${escape(facts.text)}</span><span class="app-visually-hidden" data-live-updated ${facts.updated ? '' : 'hidden'}>${escape(facts.updated)}</span></span>${liveButton()}<span class="app-mode" data-mode="${demo ? 'demo' : 'live'}" title="${demo ? 'Demonstration mode: illustrative Ploeg records and real code changes, no model calls or charges.' : 'Live workbench: Runs spend real budget.'}">${demo ? 'Demo' : 'Live'}</span></div>`;
}

function themeSwitch() {
  const current = prefs.get('theme');
  return `<div class="app-theme-switch" role="group" aria-label="Theme">${themes.map(([value, glyph, label]) => `<button type="button" data-action="theme-set" data-value="${value}" aria-pressed="${current === value}">${icon(glyph)}<span>${label}</span></button>`).join('')}</div>`;
}

function accountItems() {
  const demo = state.bootstrap.mode === 'demo';
  return `${themeSwitch()}<p class="app-menu-heading">Your cards</p>${cardPages.map(([, href, glyph, label]) => `<a class="app-menu-item" href="${href}">${icon(glyph)}<span>${label}</span></a>`).join('')}<hr class="app-menu-rule"><a class="app-menu-item" href="#settings/preferences">${icon('settings')}<span>Preferences</span></a><button class="app-menu-item" type="button" data-action="shortcuts-open">${icon('keyboard')}<span>Keyboard shortcuts</span>${singleKeysEnabled() ? '<kbd class="app-kbd">?</kbd>' : ''}</button>${demo ? '' : `<button class="app-menu-item" type="button" data-action="logout">${icon('logout')}<span>Sign out</span></button>`}`;
}

function userAvatar(size) {
  return `<span class="app-avatar" aria-hidden="true">${avatar({ name: state.bootstrap.user.name, size })}</span>`;
}

function identity() {
  const user = state.bootstrap.user;
  return `<div class="app-identity">${userAvatar()}<span><strong>${escape(user.name)}</strong><small>${escape(user.role)}${state.bootstrap.mode === 'demo' ? ' · local demo' : ''}</small></span></div>`;
}

function userMenuMarkup() {
  const user = state.bootstrap.user;
  return `<div class="app-user"><button class="app-user-trigger" type="button" data-action="user-menu" aria-expanded="false" aria-controls="app-user-menu" aria-label="Account and theme, ${escape(user.name)}">${userAvatar('sm')}<span class="app-user-name" aria-hidden="true">${escape(user.name)}</span>${icon('chevron-down')}</button><div class="app-user-menu" id="app-user-menu" hidden>${identity()}${accountItems()}</div></div>`;
}

function breadcrumbs(page) {
  const trail = page.breadcrumbs?.length ? page.breadcrumbs : [...(groupOf[area()] ? [{ label: groupOf[area()] }] : []), ...(state.view === 'session' ? [{ label: 'Sessions', href: '#sessions' }] : []), { label: page.title }];
  return `<nav class="app-breadcrumbs" aria-label="Breadcrumb"><ol>${trail.map((crumb, index) => `<li>${index === trail.length - 1 ? `<span aria-current="page">${escape(crumb.label)}</span>` : crumb.href ? `<a href="${escape(crumb.href)}">${escape(crumb.label)}</a>` : `<span>${escape(crumb.label)}</span>`}</li>`).join('')}</ol></nav>`;
}

function backMarkup(page) {
  const back = page.back;
  if (!back?.href && !back?.action) return '';
  const inner = `${icon('chevron-left')}<span>${escape(back.label || 'Back')}</span>`;
  if (back.action) return `<button type="button" class="app-back"${back.id ? ` id="${escape(back.id)}"` : ''} data-action="${escape(back.action)}">${inner}</button>`;
  return `<a class="app-back"${back.id ? ` id="${escape(back.id)}"` : ''} href="${escape(back.href)}">${inner}</a>`;
}

function topbarMarkup(page) {
  return `<header class="app-topbar"><button class="app-icon-button app-menu-button" type="button" data-action="nav-open" aria-label="Open navigation" aria-haspopup="dialog" aria-controls="nav-drawer">${icon('menu')}</button><a class="app-home" href="#now" aria-label="Unfold home">${mark}</a>${backMarkup(page)}${breadcrumbs(page)}<div class="app-topbar-end"><button class="app-search" type="button" data-action="palette-open" aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K">${icon('search')}<span class="app-search-text" aria-hidden="true">Search or jump to…</span><kbd class="app-kbd" aria-hidden="true">${escape(keyLabel('Mod'))} K</kbd></button>${statusMarkup()}${userMenuMarkup()}</div></header>`;
}

function headerMarkup(page) {
  const actions = page.actions ?? '';
  return `<div class="app-page-header"><div class="app-page-heading">${page.overline ? `<p class="app-overline">${escape(page.overline)}</p>` : ''}<h1 id="page-title" class="app-page-title" tabindex="-1">${escape(page.title)}</h1>${page.subtitle ? `<p class="app-page-subtitle">${escape(page.subtitle)}</p>` : ''}</div>${actions ? `<div class="app-page-actions">${actions}</div>` : ''}</div>`;
}

function settingsMarkup() {
  if (area() !== 'settings') return '';
  return `<nav class="app-subnav" aria-label="Settings"><ul>${settingsPages.map(([id, href, label]) => `<li><a href="${href}" ${state.view === id ? 'aria-current="page"' : ''}>${escape(label)}</a></li>`).join('')}</ul></nav>`;
}

function tabbarMarkup() {
  const items = groups.flatMap(group => group.items).filter(item => quick.includes(item.id));
  return `<nav class="app-tabbar" aria-label="Quick navigation">${items.map(item => `<a class="app-tab" href="${item.href}" aria-label="${escape(item.label)}" ${item.count ? `aria-describedby="tabbar-count-${item.id}"` : ''} ${area() === item.id ? 'aria-current="page"' : ''}>${icon(item.glyph)}<span aria-hidden="true">${escape(item.label)}</span>${countMarkup(item, 'tabbar')}</a>`).join('')}<button class="app-tab" type="button" data-action="nav-open" aria-haspopup="dialog" aria-controls="nav-drawer">${icon('more')}<span>More</span></button></nav>`;
}

function options(titleOrOptions, subtitle) {
  if (titleOrOptions && typeof titleOrOptions === 'object') return { title: 'Unfold', ...titleOrOptions };
  return { title: titleOrOptions ?? 'Sessions', subtitle: subtitle ?? 'Your work, running elsewhere.', overline: state.view === 'session' ? 'Session' : undefined };
}

/**
 * Wraps a view's `content` in the workbench: the dark sidebar with grouped navigation and counts, the top bar
 * with breadcrumbs, search, the status strip and the account menu, the page header with the page's only `<h1>`
 * (`#page-title`), and on phones a bottom bar. Sets `document.title`.
 * Called as `shell(content, { title, documentTitle, subtitle, overline, actions, breadcrumbs: [{ label, href }], back, wide })`,
 * where `actions` is markup the view built and escaped, `documentTitle` names the browser tab when it should say more
 * than the `<h1>` (a detail page), and `back: { label, href }` puts a back link in place of the title crumb on phones;
 * or as the older `shell(content, title, subtitle)`.
 * @param {string} content
 * @param {string | { title: string, documentTitle?: string, subtitle?: string, overline?: string, actions?: string, breadcrumbs?: { label: string, href?: string }[], back?: { label: string, href: string }, wide?: boolean }} [titleOrOptions]
 * @param {string} [subtitle]
 * @returns {string}
 */
export function shell(content, titleOrOptions, subtitle) {
  const page = options(titleOrOptions, subtitle);
  lastTitle = page.documentTitle || page.title;
  syncSessionCount();
  document.title = documentTitle(lastTitle);
  return `<div class="app-shell" data-area="${escape(area())}">${sidebarMarkup()}<div class="app-body">${topbarMarkup(page)}<main id="main" class="app-main${page.wide ? ' is-wide' : ''}" tabindex="-1">${headerMarkup(page)}${settingsMarkup()}${content}</main></div>${tabbarMarkup()}</div>`;
}

/** Folds whether the open session's event stream is connected into the status dot: its tooltip, and "Reconnecting…" when it is not. */
export function showConnection(online) {
  state.online = online;
  updateStatus();
}

function updateStatus() {
  const facts = statusFacts();
  for (const status of document.querySelectorAll('[data-ploeg-status]')) {
    status.dataset.tone = facts.tone;
    status.title = facts.tip;
    status.querySelector('[data-ploeg-text]').textContent = facts.text;
    const updated = status.querySelector('[data-live-updated]');
    if (updated) { updated.textContent = facts.updated; updated.hidden = !facts.updated; }
  }
}

/** Brings the counts, the Ploeg status, the live state, the theme buttons and the document title up to date without redrawing the page. */
export function updateChrome() {
  if (!state.bootstrap) return;
  syncSessionCount();
  document.title = documentTitle(lastTitle);
  for (const badge of document.querySelectorAll('[data-count-for]')) { const value = countValue(badge.dataset.countFor); badge.textContent = value ?? ''; badge.hidden = !value; }
  for (const description of document.querySelectorAll('[data-count-describe]')) {
    const value = countValue(description.dataset.countDescribe);
    const item = groups.flatMap(group => group.items).find(entry => entry.count === description.dataset.countDescribe);
    description.textContent = value && item ? item.describe(value) : '';
  }
  for (const dot of document.querySelectorAll('[data-signal]')) { dot.hidden = !state.statusSignal; dot.dataset.tone = state.statusSignal === 'down' ? 'danger' : 'attention'; }
  for (const description of document.querySelectorAll('[data-signal-describe]')) description.textContent = state.statusSignal ? signals[state.statusSignal] : '';
  for (const section of document.querySelectorAll('.app-nav-section[data-group="ploeg"]')) section.toggleAttribute('data-unconfigured', state.ploegStatus === 'unconfigured');
  updateLiveState();
  const theme = prefs.get('theme');
  for (const button of document.querySelectorAll('[data-action="theme-set"]')) button.setAttribute('aria-pressed', String(button.dataset.value === theme));
}

/** Refreshes the status tooltip ("Updated … ago") and the pause or resume auto-refresh button. */
export function updateLiveState() {
  updateStatus();
  const paused = live.paused;
  const label = paused ? 'Resume auto-refresh' : 'Pause auto-refresh';
  for (const button of document.querySelectorAll('[data-live-toggle]')) {
    if (button.dataset.state === (paused ? 'paused' : 'live')) continue;
    button.dataset.state = paused ? 'paused' : 'live';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `${icon(paused ? 'play' : 'pause')}<span class="app-live-label" data-live-label ${paused ? '' : 'hidden'}>Paused</span>`;
  }
}

function setUserMenu(open, { focusTrigger = false } = {}) {
  for (const trigger of document.querySelectorAll('.app-user-trigger')) {
    trigger.setAttribute('aria-expanded', String(open));
    const menu = document.getElementById(trigger.getAttribute('aria-controls'));
    if (menu) menu.hidden = !open;
    if (!open && focusTrigger) trigger.focus();
  }
}

function openNavDrawer(trigger) {
  const dialog = $('#nav-drawer');
  if (!dialog || dialog.open) return;
  setUserMenu(false);
  dialog.innerHTML = `<div class="app-drawer"><div class="app-drawer-head"><a class="app-brand" href="#now" aria-label="Unfold home">${lockup}</a><form method="dialog"><button class="app-icon-button" value="close" aria-label="Close navigation">${icon('x')}</button></form></div>${navMarkup('drawer')}<div class="app-drawer-section">${statusMarkup()}</div><div class="app-drawer-section">${identity()}${accountItems()}</div></div>`;
  dialog.addEventListener('close', () => { for (const button of document.querySelectorAll('[data-action="nav-open"]')) button.setAttribute('aria-expanded', 'false'); trigger?.isConnected && trigger.focus(); }, { once: true });
  for (const button of document.querySelectorAll('[data-action="nav-open"]')) button.setAttribute('aria-expanded', 'true');
  dialog.showModal();
}

/** Closes the navigation drawer and the account menu, for example after a route change. */
export function closeTransientChrome() {
  const drawer = $('#nav-drawer');
  if (drawer?.open) drawer.close();
  setUserMenu(false);
}

/** Handles clicks the chrome cares about before actions run: outside the account menu closes it, the drawer's backdrop closes the drawer. */
export function handleChromeClick(event) {
  if (!event.target.closest('.app-user')) setUserMenu(false);
  if (event.target.id === 'nav-drawer') event.target.close();
}

/** Closes the account menu once keyboard focus moves to something outside it, so the open menu never covers the focused control. */
export function handleChromeFocusOut(event) {
  const menu = event.target?.closest?.('.app-user');
  const next = event.relatedTarget;
  if (!menu || !next || menu.contains(next)) return;
  setUserMenu(false);
}

/** Escape hides the tooltip of the hovered or focused rail item until the pointer or focus leaves it (WCAG 1.4.13). */
export function dismissRailTip(event) {
  if (event.key !== 'Escape') return;
  for (const item of document.querySelectorAll('.app-sidebar .app-nav-item:is(:hover, :focus-visible)')) {
    item.dataset.tipHidden = '';
    const show = () => { delete item.dataset.tipHidden; item.removeEventListener('blur', show); item.removeEventListener('mouseleave', show); };
    item.addEventListener('blur', show);
    item.addEventListener('mouseleave', show);
  }
}

function closeMenuOnEscape(event) {
  if (event.key !== 'Escape' || !document.querySelector('.app-user-menu:not([hidden])')) return false;
  event.preventDefault();
  setUserMenu(false, { focusTrigger: true });
  return true;
}

function toggleLive() {
  const paused = live.toggle();
  updateLiveState();
  announce(paused ? 'Auto-refresh paused' : 'Auto-refresh on');
}

function setTheme(button) {
  if (!prefs.set('theme', button.dataset.value)) return;
  applyAppearance();
  updateChrome();
  announce(`${themes.find(([value]) => value === button.dataset.value)[2]} theme`);
}

function toggleUserMenu(button) { setUserMenu(button.getAttribute('aria-expanded') !== 'true'); }

/** The workbench chrome's own actions and keys: navigation drawer, account menu, theme, live updates and the shortcut help. */
export const chrome = {
  id: 'chrome',
  actions: {
    'nav-open': button => openNavDrawer(button),
    'user-menu': toggleUserMenu,
    'theme-set': setTheme,
    'live-toggle': toggleLive,
    'shortcuts-open': () => { closeTransientChrome(); openShortcuts(); },
  },
  keys: [closeMenuOnEscape],
};
