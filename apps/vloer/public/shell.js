import { state } from './core/state.js';
import { $, escape, announce } from './core/dom.js';
import { icon } from './core/icons.js';
import { relative } from './core/format.js';
import { live } from './core/live.js';
import { prefs, applyAppearance } from './core/prefs.js';
import { keyLabel, openShortcuts, singleKeysEnabled } from './core/keys.js';
import { sessionsNeedingYou } from './core/counts.js';

const wordmarkPath = 'M405 0L79 0L79-687L405-687Q523-687 606-649Q689-611 733-535Q777-459 777-344L777-344Q777-229 733-152.50Q689-76 606-38Q523 0 405 0L405 0ZM268-543L268-145L399-145Q443-145 477-157Q511-169 535-192Q559-215 571-249Q583-283 583-326L583-326L583-361Q583-405 571-439Q559-473 535-496Q511-519 477-531Q443-543 399-543L399-543L268-543ZM1164 12L1164 12Q1066 12 996-17.50Q926-47 888.50-108Q851-169 851-264L851-264Q851-357 888.50-418Q926-479 994-509Q1062-539 1157-539L1157-539Q1252-539 1319-510Q1386-481 1421-421Q1456-361 1456-268L1456-268L1456-230L1028-230Q1029-188 1044-159.50Q1059-131 1089-117Q1119-103 1164-103L1164-103Q1189-103 1211-108.50Q1233-114 1249-125Q1265-136 1274-152Q1283-168 1283-187L1283-187L1455-187Q1455-140 1434.50-103Q1414-66 1375.50-40.50Q1337-15 1283.50-1.50Q1230 12 1164 12ZM1029-323L1029-323L1277-323Q1277-348 1268.50-366.50Q1260-385 1245-398Q1230-411 1209-417.50Q1188-424 1162-424L1162-424Q1121-424 1093-412Q1065-400 1049.50-377.50Q1034-355 1029-323ZM2207 0L1996 0L1715-687L1921-687L2057-321Q2063-306 2071-283Q2079-260 2087.50-236Q2096-212 2102-193L2102-193L2109-193Q2115-210 2123-233Q2131-256 2139-279.50Q2147-303 2154-320L2154-320L2290-687L2488-687L2207 0ZM2723 0L2550 0L2550-687L2723-687L2723 0ZM3119 12L3119 12Q3024 12 2955-18.50Q2886-49 2848.50-110Q2811-171 2811-264L2811-264Q2811-357 2848.50-418Q2886-479 2955-509Q3024-539 3119-539L3119-539Q3214-539 3283-509Q3352-479 3389-418Q3426-357 3426-264L3426-264Q3426-171 3389-110Q3352-49 3283-18.50Q3214 12 3119 12ZM3119-110L3119-110Q3164-110 3193.50-126.50Q3223-143 3237-174Q3251-205 3251-248L3251-248L3251-279Q3251-322 3237-353.50Q3223-385 3193.50-401.50Q3164-418 3119-418L3119-418Q3073-418 3044-401.50Q3015-385 3001-353.50Q2987-322 2987-279L2987-279L2987-248Q2987-205 3001-174Q3015-143 3044-126.50Q3073-110 3119-110ZM3804 12L3804 12Q3706 12 3636-17.50Q3566-47 3528.50-108Q3491-169 3491-264L3491-264Q3491-357 3528.50-418Q3566-479 3634-509Q3702-539 3797-539L3797-539Q3892-539 3959-510Q4026-481 4061-421Q4096-361 4096-268L4096-268L4096-230L3668-230Q3669-188 3684-159.50Q3699-131 3729-117Q3759-103 3804-103L3804-103Q3829-103 3851-108.50Q3873-114 3889-125Q3905-136 3914-152Q3923-168 3923-187L3923-187L4095-187Q4095-140 4074.50-103Q4054-66 4015.50-40.50Q3977-15 3923.50-1.50Q3870 12 3804 12ZM3669-323L3669-323L3917-323Q3917-348 3908.50-366.50Q3900-385 3885-398Q3870-411 3849-417.50Q3828-424 3802-424L3802-424Q3761-424 3733-412Q3705-400 3689.50-377.50Q3674-355 3669-323ZM4357 0L4184 0L4184-527L4325-527L4337-443L4345-443Q4358-472 4378.50-494Q4399-516 4426.50-528Q4454-540 4487-540L4487-540Q4506-540 4522-536.50Q4538-533 4549-529L4549-529L4549-385L4483-385Q4450-385 4426-375Q4402-365 4386.50-347Q4371-329 4364-304Q4357-279 4357-248L4357-248L4357 0Z';
const markShapes = '<path d="M17.5 14.5L32 49.5L46.5 14.5" stroke="#3D84E8" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="10" y="42" width="44" height="8" fill="currentColor"/>';
const lockup = `<svg class="app-lockup" viewBox="0 0 358.301 50.803" fill="none" aria-hidden="true" focusable="false"><g transform="translate(-10 -7)">${markShapes}<g transform="translate(63.71 57) scale(0.067)"><path d="${wordmarkPath}" fill="currentColor"/></g></g></svg>`;
const mark = `<svg class="app-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">${markShapes}</svg>`;

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
  const stream = state.view === 'session' ? `<span class="connection app-stream ${state.online ? '' : 'offline'}"><i></i>${state.online ? 'Connected' : 'Reconnecting'}</span>` : '';
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

function topbarMarkup(page) {
  return `<header class="app-topbar"><button class="app-icon-button app-menu-button" type="button" data-action="nav-open" aria-label="Open navigation" aria-haspopup="dialog" aria-controls="nav-drawer">${icon('menu')}</button><a class="app-home" href="#now" aria-label="De Vloer home">${mark}</a>${breadcrumbs(page)}<div class="app-topbar-end"><button class="app-search" type="button" data-action="palette-open" aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K">${icon('search')}<span class="app-search-text" aria-hidden="true">Search or jump to…</span><kbd class="app-kbd" aria-hidden="true">${escape(keyLabel('Mod'))} K</kbd></button>${statusMarkup()}${userMenuMarkup()}</div></header>`;
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
 * Called as `shell(content, { title, subtitle, overline, actions, breadcrumbs: [{ label, href }], wide })`, where
 * `actions` is markup the view built and escaped, or as the older `shell(content, title, subtitle)`.
 * @param {string} content
 * @param {string | { title: string, subtitle?: string, overline?: string, actions?: string, breadcrumbs?: { label: string, href?: string }[], wide?: boolean }} [titleOrOptions]
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
  const connection = $('.connection');
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
