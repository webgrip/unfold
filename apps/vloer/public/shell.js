import { state } from './core/state.js';
import { $, escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { isActive } from './core/lookup.js';

const navigation = [
  ['now', '#now', 'clock', 'Now'],
  ['work', '#work', 'layers', 'Work'],
  ['proposed', '#proposed', 'plus', 'Proposed'],
  ['runs', '#runs', 'code', 'Runs'],
  ['activity', '#activity', 'activity', 'Activity'],
  ['insights', '#insights', 'grid', 'Insights'],
  ['tasks', '#tasks', 'folder', 'Tasks'],
  ['sessions', '#sessions', 'grid', 'Sessions'],
  ['settings', '#settings/accounts', 'shield', 'Settings'],
];
const settingsPages = [['account', '#settings/accounts', 'Linked accounts'], ['system', '#settings/environment', 'Environment']];
const areaOf = view => view === 'session' ? 'sessions' : settingsPages.some(([id]) => id === view) ? 'settings' : view;

/** Whether the Sessions area is offered: in demo mode, with shared execution configured, or when sessions exist. */
export function showsSessions() {
  return state.bootstrap?.mode === 'demo' || Boolean(state.bootstrap?.sharedExecution) || state.sessions.length > 0 || state.view === 'session' || state.view === 'sessions';
}

function options(titleOrOptions, subtitle) {
  if (titleOrOptions && typeof titleOrOptions === 'object') return { title: 'Sessions', subtitle: '', ...titleOrOptions };
  return { title: titleOrOptions ?? 'Sessions', subtitle: subtitle ?? 'Your work, running elsewhere.' };
}

/**
 * Wraps a view's `content` in the workbench layout: sidebar, top bar and page heading, and sets the document
 * title. Takes `shell(content, { title, subtitle })` or the older `shell(content, title, subtitle)`.
 */
export function shell(content, titleOrOptions, subtitle) {
  const { title, subtitle: lead } = options(titleOrOptions, subtitle);
  const user = state.bootstrap.user;
  const area = areaOf(state.view);
  document.title = `${title} · De Vloer`;
  const items = navigation.filter(([id]) => id !== 'sessions' || showsSessions());
  const settings = area === 'settings' ? `<nav class="ploeg-tabs" aria-label="Settings">${settingsPages.map(([id, href, label]) => `<a href="${href}" class="${state.view === id ? 'selected' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${escape(label)}</a>`).join('')}</nav>` : '';
  return `<div class="layout">
    <aside class="sidebar">
      <a class="brand" href="#now" aria-label="De Vloer home"><svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M17.5 14.5L32 49.5L46.5 14.5" stroke="var(--peil)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="10" y="42" width="44" height="8" fill="currentColor"/></svg><span>De Vloer<span class="brand-caption">AGENT WORKBENCH</span></span></a>
      <nav aria-label="Primary navigation">${items.map(([id, href, glyph, label]) => `<a href="${href}" aria-label="${escape(label)}" class="nav-item ${area === id ? 'active' : ''}" ${area === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'sessions' ? `<b>${state.sessions.filter(isActive).length}</b>` : ''}</a>`).join('')}</nav>
      <div class="sidebar-note"><span class="tiny-label">THE WORKING AGREEMENT</span><p>You set the direction.<br>Agents bring back evidence.</p><div class="small-rule"></div><span>Human review stays in the loop.</span></div>
      <div class="user-card"><span class="avatar">${escape(user.name.slice(0, 2).toUpperCase())}</span><div><strong>${escape(user.name)}</strong><span>${escape(user.role)}${state.bootstrap.mode === 'demo' ? ' · local demo' : ''}</span></div>${state.bootstrap.mode !== 'demo' ? `<button class="icon-button" data-action="logout" aria-label="Sign out">${icon('logout')}</button>` : ''}</div>
    </aside>
    <div class="content-wrap"><header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')} <span>${escape(title)}</span></div><div class="topbar-right"><span class="connection ${state.online ? '' : 'offline'}"><i></i>${state.online ? 'Connected' : 'Reconnecting'}</span><span class="mode-pill">${state.bootstrap.mode === 'demo' ? 'DEMO' : 'LIVE'}</span></div></header>
      ${state.bootstrap.mode === 'demo' ? `<div class="demo-ribbon">${icon('info')}<span><strong>Demonstration mode.</strong> Real code changes and tests. No AI model calls or charges.</span></div>` : ''}
      <main id="main" class="main"><div class="page-heading"><div><p class="eyebrow">${state.view === 'session' ? 'SESSION WORKSPACE' : 'DE VLOER / WORKSPACE'}</p><h1 id="page-title" tabindex="-1">${escape(title)}</h1>${lead ? `<p class="page-subtitle">${escape(lead)}</p>` : ''}</div>${state.view === 'sessions' && user.role !== 'viewer' ? `<button class="button primary" data-action="new">${icon('plus')} New session <kbd>N</kbd></button>` : state.view === 'tasks' ? `<button class="button secondary" data-action="connections">${icon('layers')} Connections</button>` : ''}</div>${settings}${content}</main>
      <footer><span>DE VLOER <b>0.2</b></span><span>Self-hosted. Your models. Your infrastructure.</span></footer>
    </div></div>`;
}

/** Shows in the top bar whether the session event stream is connected. */
export function showConnection(online) {
  const connection = $('.connection');
  if (!connection) return;
  if (online) { connection.classList.remove('offline'); connection.innerHTML = '<i></i>Connected'; }
  else { connection.classList.add('offline'); connection.innerHTML = '<i></i>Reconnecting'; }
}
