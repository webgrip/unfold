import { state } from './core/state.js';
import { $, escape, announce } from './core/dom.js';
import { icon } from './core/icons.js';
import { relative } from './core/format.js';
import { live } from './core/live.js';
import { prefs, applyAppearance } from './core/prefs.js';
import { keyLabel, openShortcuts, singleKeysEnabled } from './core/keys.js';
import { sessionsNeedingYou } from './core/counts.js';
import { lockupSvg, markSvg } from './core/brand.js';

const lockup = lockupSvg({ className: 'app-lockup' });
const mark = markSvg({ className: 'app-mark' });

const groups = [
  { id: 'home', items: [{ id: 'now', href: '#now', glyph: 'inbox', label: 'Now', count: 'waiting', describe: n => `${n} waiting on you`, tone: 'attention' }] },
  { id: 'ploeg', label: 'Ploeg', items: [
    { id: 'work', href: '#work', glyph: 'work', label: 'Work' },
    { id: 'proposed', href: '#proposed', glyph: 'proposed', label: 'Proposed', count: 'proposed', describe: n => `${n} proposed`, tone: 'neutral' },
    { id: 'runs', href: '#runs', glyph: 'runs', label: 'Runs' },
    { id: 'activity', href: '#activity', glyph: 'activity', label: 'Activity' },
    { id: 'insights', href: '#insights', glyph: 'insights', label: 'Insights' },
  ] },
  { id: 'workbench', label: 'Workbench', items: [
    { id: 'tasks', href: '#tasks', glyph: 'tasks', label: 'Tasks' },
    { id: 'sessions', href: '#sessions', glyph: 'sessions', label: 'Sessions', count: 'sessions', describe: n => `${n} ${n === 1 ? 'needs' : 'need'} you`, tone: 'attention', when: () => showsSessions() },
  ] },
  { id: 'settings', items: [{ id: 'settings', href: '#settings/accounts', glyph: 'settings', label: 'Settings' }] },
];
const quick = ['now', 'work', 'runs'];
const settingsPages = [['account', '#settings/accounts', 'Linked accounts'], ['system', '#settings/environment', 'Environment'], ['preferences', '#settings/preferences', 'Preferences']];
const areas = { session: 'sessions', account: 'settings', system: 'settings', preferences: 'settings', design: 'settings' };
const groupOf = { work: 'Ploeg', proposed: 'Ploeg', runs: 'Ploeg', activity: 'Ploeg', insights: 'Ploeg', tasks: 'Workbench', sessions: 'Workbench', settings: 'Settings' };
const themes = [['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']];
const ploegStates = {
  demo: ['neutral', 'Ploeg: demo data', 'Illustrative Ploeg records. No Run executes and no model is called.'],
  connected: ['success', 'Ploeg connected', 'Ploeg answered the last check.'],
  partial: ['attention', 'Ploeg partly unavailable', 'Some of Ploeg’s data could not be read in the last check.'],
  unavailable: ['danger', 'Ploeg unreachable', 'Ploeg did not answer the last check. Pages show the last data they read.'],
  unconfigured: ['neutral', 'Ploeg not configured', 'No Ploeg connection is configured for this workbench.'],
  'no-access': ['neutral', 'No Ploeg teams', 'Your account has no Ploeg teams. Ask an administrator for access.'],
};
let lastTitle = 'De Vloer';

const area = () => areas[state.view] || state.view;
const initials = name => escape(String(name || '?').trim().slice(0, 2).toUpperCase());

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

/** The document title for a page: `(<waiting>) <Page> · De Vloer`, without the count when it is zero or unknown. */
export function documentTitle(title, waiting = countValue('waiting')) {
  return `${waiting ? `(${waiting}) ` : ''}${title} · De Vloer`;
}

function countMarkup(item, where) {
  if (!item.count) return '';
  const value = countValue(item.count);
  return `<span class="app-count" data-tone="${item.tone}" data-count-for="${item.count}" aria-hidden="true" ${value ? '' : 'hidden'}>${value ?? ''}</span><span class="app-hidden-description" id="${where}-count-${item.id}" data-count-describe="${item.count}" hidden>${value ? escape(item.describe(value)) : ''}</span>`;
}

function itemMarkup(item, where) {
  const current = area() === item.id;
  return `<li><a class="app-nav-item" href="${item.href}" aria-label="${escape(item.label)}" data-tip="${escape(item.label)}" ${item.count ? `aria-describedby="${where}-count-${item.id}"` : ''} ${current ? 'aria-current="page"' : ''}>${icon(item.glyph)}<span class="app-nav-label" aria-hidden="true">${escape(item.label)}</span>${countMarkup(item, where)}</a></li>`;
}

function navMarkup(where) {
  return `<nav class="app-nav" aria-label="Primary navigation">${groups.map(group => {
    const items = group.items.filter(item => !item.when || item.when());
    if (!items.length) return '';
    const heading = group.label ? `<p class="app-nav-group" id="${where}-group-${group.id}">${escape(group.label)}</p>` : '';
    return `<div class="app-nav-section" data-group="${group.id}">${heading}<ul class="app-nav-list" ${group.label ? `aria-labelledby="${where}-group-${group.id}"` : ''}>${items.map(item => itemMarkup(item, where)).join('')}</ul></div>`;
  }).join('')}</nav>`;
}

function sidebarMarkup() {
  const version = state.bootstrap.version ? `<p class="app-version">De Vloer ${escape(state.bootstrap.version)}</p>` : '';
  return `<aside class="app-sidebar"><a class="app-brand" href="#now" aria-label="De Vloer home">${lockup}${mark}</a>${navMarkup('sidebar')}${version}</aside>`;
}

function ploegStatus() {
  const [tone, text, detail] = ploegStates[state.ploegStatus] || ['neutral', 'Checking Ploeg…', 'Vloer has not heard from Ploeg yet.'];
  return { tone, text, detail };
}

function updatedText() { return live.lastUpdated ? `Updated ${relative(live.lastUpdated)}` : ''; }

function liveButton() {
  const paused = live.paused;
  return `<button class="app-live" type="button" data-action="live-toggle" data-live-toggle data-state="${paused ? 'paused' : 'live'}" title="${paused ? 'Live updates are paused. Select to resume.' : 'Pages refresh themselves. Select to pause.'}"><span class="app-dot" aria-hidden="true"></span><span class="app-visually-hidden">Updates: </span><span data-live-label>${paused ? 'Paused' : 'Live'}</span></button>`;
}

function statusMarkup() {
  const demo = state.bootstrap.mode === 'demo';
  const ploeg = ploegStatus();
  const updated = updatedText();
  const stream = state.view === 'session' && state.session ? `<span class="app-stream${state.online ? '' : ' offline'}"><i></i>${state.online ? 'Connected' : 'Reconnecting'}</span>` : '';
  return `<div class="app-status" role="group" aria-label="Status">${stream}<span class="app-status-ploeg" data-ploeg-status data-tone="${ploeg.tone}" title="${escape(ploeg.detail)}"><span class="app-dot" aria-hidden="true"></span><span data-ploeg-text>${escape(ploeg.text)}</span></span><span class="app-status-updated" data-live-updated ${updated ? '' : 'hidden'}>${escape(updated)}</span>${liveButton()}<span class="app-mode" data-mode="${demo ? 'demo' : 'live'}" title="${demo ? 'Demonstration mode: real code changes and tests, no AI model calls or charges.' : 'Live workbench: Runs spend real budget.'}">${demo ? 'Demo' : 'Live'}</span></div>`;
}

function themeSwitch() {
  const current = prefs.get('theme');
  return `<div class="app-theme-switch" role="group" aria-label="Theme">${themes.map(([value, glyph, label]) => `<button type="button" data-action="theme-set" data-value="${value}" aria-pressed="${current === value}">${icon(glyph)}<span>${label}</span></button>`).join('')}</div>`;
}

function accountItems() {
  const demo = state.bootstrap.mode === 'demo';
  return `${themeSwitch()}<a class="app-menu-item" href="#settings/preferences">${icon('settings')}<span>Preferences</span></a><button class="app-menu-item" type="button" data-action="shortcuts-open">${icon('keyboard')}<span>Keyboard shortcuts</span>${singleKeysEnabled() ? '<kbd class="app-kbd">?</kbd>' : ''}</button>${demo ? '' : `<button class="app-menu-item" type="button" data-action="logout">${icon('logout')}<span>Sign out</span></button>`}`;
}

function identity() {
  const user = state.bootstrap.user;
  return `<div class="app-identity"><span class="app-avatar" aria-hidden="true">${initials(user.name)}</span><span><strong>${escape(user.name)}</strong><small>${escape(user.role)}${state.bootstrap.mode === 'demo' ? ' · local demo' : ''}</small></span></div>`;
}

function userMenuMarkup() {
  const user = state.bootstrap.user;
  return `<div class="app-user"><button class="app-user-trigger" type="button" data-action="user-menu" aria-expanded="false" aria-controls="app-user-menu" aria-label="Account and theme, ${escape(user.name)}"><span class="app-avatar" aria-hidden="true">${initials(user.name)}</span><span class="app-user-name" aria-hidden="true">${escape(user.name)}</span>${icon('chevron-down')}</button><div class="app-user-menu" id="app-user-menu" hidden>${identity()}${accountItems()}</div></div>`;
}

function breadcrumbs(page) {
  const trail = page.breadcrumbs?.length ? page.breadcrumbs : [...(groupOf[area()] ? [{ label: groupOf[area()] }] : []), ...(state.view === 'session' ? [{ label: 'Sessions', href: '#sessions' }] : []), { label: page.title }];
  return `<nav class="app-breadcrumbs" aria-label="Breadcrumb"><ol>${trail.map((crumb, index) => `<li>${index === trail.length - 1 ? `<span aria-current="page">${escape(crumb.label)}</span>` : crumb.href ? `<a href="${escape(crumb.href)}">${escape(crumb.label)}</a>` : `<span>${escape(crumb.label)}</span>`}</li>`).join('')}</ol></nav>`;
}

function backMarkup(page) {
  if (!page.back?.href) return '';
  return `<a class="app-back" href="${escape(page.back.href)}">${icon('chevron-left')}<span>${escape(page.back.label || 'Back')}</span></a>`;
}

function topbarMarkup(page) {
  return `<header class="app-topbar"><button class="app-icon-button app-menu-button" type="button" data-action="nav-open" aria-label="Open navigation" aria-haspopup="dialog" aria-controls="nav-drawer">${icon('menu')}</button><a class="app-home" href="#now" aria-label="De Vloer home">${mark}</a>${backMarkup(page)}${breadcrumbs(page)}<div class="app-topbar-end"><button class="app-search" type="button" data-action="palette-open" aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K">${icon('search')}<span class="app-search-text" aria-hidden="true">Search or jump to…</span><kbd class="app-kbd" aria-hidden="true">${escape(keyLabel('Mod'))} K</kbd></button>${statusMarkup()}${userMenuMarkup()}</div></header>`;
}

function legacyActions() {
  if (state.view === 'sessions' && state.bootstrap.user.role !== 'viewer') return `<button class="button primary" data-action="new">${icon('plus')} New session${singleKeysEnabled() ? ' <kbd>N</kbd>' : ''}</button>`;
  if (state.view === 'tasks') return `<button class="button secondary" data-action="connections">${icon('layers')} Connections</button>`;
  return '';
}

function headerMarkup(page) {
  const actions = page.actions ?? legacyActions();
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
  if (titleOrOptions && typeof titleOrOptions === 'object') return { title: 'De Vloer', ...titleOrOptions };
  return { title: titleOrOptions ?? 'Sessions', subtitle: subtitle ?? 'Your work, running elsewhere.', overline: state.view === 'session' ? 'Session' : undefined };
}

/**
 * Wraps a view's `content` in the workbench: the dark sidebar with grouped navigation and counts, the top bar
 * with breadcrumbs, search, the status strip and the account menu, the page header with the page's only `<h1>`
 * (`#page-title`), and on phones a bottom bar. Sets `document.title`.
 * Called as `shell(content, { title, subtitle, overline, actions, breadcrumbs: [{ label, href }], back, wide })`,
 * where `actions` is markup the view built and escaped and `back: { label, href }` puts a back link in place of the
 * title crumb on phones; or as the older `shell(content, title, subtitle)`.
 * @param {string} content
 * @param {string | { title: string, subtitle?: string, overline?: string, actions?: string, breadcrumbs?: { label: string, href?: string }[], back?: { label: string, href: string }, wide?: boolean }} [titleOrOptions]
 * @param {string} [subtitle]
 * @returns {string}
 */
export function shell(content, titleOrOptions, subtitle) {
  const page = options(titleOrOptions, subtitle);
  lastTitle = page.title;
  syncSessionCount();
  document.title = documentTitle(page.title);
  return `<div class="app-shell" data-area="${escape(area())}">${sidebarMarkup()}<div class="app-body">${topbarMarkup(page)}<main id="main" class="app-main${page.wide ? ' is-wide' : ''}" tabindex="-1">${headerMarkup(page)}${settingsMarkup()}${content}</main></div>${tabbarMarkup()}</div>`;
}

/** Shows in the status strip whether the open session's event stream is connected. */
export function showConnection(online) {
  const connection = $('.app-stream');
  if (!connection) return;
  if (online) { connection.classList.remove('offline'); connection.innerHTML = '<i></i>Connected'; }
  else { connection.classList.add('offline'); connection.innerHTML = '<i></i>Reconnecting'; }
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
  const ploeg = ploegStatus();
  for (const status of document.querySelectorAll('[data-ploeg-status]')) { status.dataset.tone = ploeg.tone; status.title = ploeg.detail; status.querySelector('[data-ploeg-text]').textContent = ploeg.text; }
  updateLiveState();
  const theme = prefs.get('theme');
  for (const button of document.querySelectorAll('[data-action="theme-set"]')) button.setAttribute('aria-pressed', String(button.dataset.value === theme));
}

/** Refreshes the "Updated … ago" text and the Live or Paused button. */
export function updateLiveState() {
  const updated = updatedText();
  for (const element of document.querySelectorAll('[data-live-updated]')) { element.textContent = updated; element.hidden = !updated; }
  const paused = live.paused;
  for (const button of document.querySelectorAll('[data-live-toggle]')) {
    button.dataset.state = paused ? 'paused' : 'live';
    button.title = paused ? 'Live updates are paused. Select to resume.' : 'Pages refresh themselves. Select to pause.';
    button.querySelector('[data-live-label]').textContent = paused ? 'Paused' : 'Live';
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
  dialog.innerHTML = `<div class="app-drawer"><div class="app-drawer-head"><a class="app-brand" href="#now" aria-label="De Vloer home">${lockup}</a><form method="dialog"><button class="app-icon-button" value="close" aria-label="Close navigation">${icon('x')}</button></form></div>${navMarkup('drawer')}<div class="app-drawer-section">${statusMarkup()}</div><div class="app-drawer-section">${identity()}${accountItems()}</div></div>`;
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

function closeMenuOnEscape(event) {
  if (event.key !== 'Escape' || !document.querySelector('.app-user-menu:not([hidden])')) return false;
  event.preventDefault();
  setUserMenu(false, { focusTrigger: true });
  return true;
}

function toggleLive() {
  const paused = live.toggle();
  updateLiveState();
  announce(paused ? 'Live updates paused' : 'Live updates on');
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
