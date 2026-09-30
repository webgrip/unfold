import { state } from './core/state.js';
import { $, escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { isActive } from './core/lookup.js';

/** Wraps a view's `content` in the workbench layout: sidebar, top bar, page heading and footer. */
export function shell(content, title = 'Sessions', subtitle = 'Your work, running elsewhere.') {
  const user = state.bootstrap.user;
  return `<div class="layout">
    <aside class="sidebar" aria-label="Primary navigation">
      <a class="brand" href="#now" aria-label="De Vloer home"><svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M17.5 14.5L32 49.5L46.5 14.5" stroke="var(--peil)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="10" y="42" width="44" height="8" fill="currentColor"/></svg><span>De Vloer<span class="brand-caption">AGENT WORKBENCH</span></span></a>
      <div class="workspace-label">WORKSPACE <span>01</span></div>
      <nav>${[['now','clock','Now'],['sessions','grid','Sessions'],['tasks','folder','Tasks'],['ploeg','layers','Ploeg'],['account','link','Linked accounts'],['system','shield','Environment']].map(([id, glyph, label]) => `<a href="#${id}" aria-label="${escape(label)}" class="nav-item ${state.view === id || state.view === 'session' && id === 'sessions' ? 'active' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${id === 'sessions' ? `<b>${state.sessions.filter(isActive).length}</b>` : ''}</a>`).join('')}</nav>
      <div class="sidebar-note"><span class="tiny-label">THE WORKING AGREEMENT</span><p>You set the direction.<br>Agents bring back evidence.</p><div class="small-rule"></div><span>Human review stays in the loop.</span></div>
      <div class="user-card"><span class="avatar">${escape(user.name.slice(0, 2).toUpperCase())}</span><div><strong>${escape(user.name)}</strong><span>${escape(user.role)}${state.bootstrap.mode === 'demo' ? ' · local demo' : ''}</span></div>${state.bootstrap.mode !== 'demo' ? `<button class="icon-button" data-action="logout" aria-label="Sign out">${icon('logout')}</button>` : ''}</div>
    </aside>
    <div class="content-wrap"><header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')} <span>${escape(title)}</span></div><div class="topbar-right"><span class="connection ${state.online ? '' : 'offline'}"><i></i>${state.online ? 'Connected' : 'Reconnecting'}</span><span class="mode-pill">${state.bootstrap.mode === 'demo' ? 'DEMO' : 'LIVE'}</span></div></header>
      ${state.bootstrap.mode === 'demo' ? `<div class="demo-ribbon">${icon('info')}<span><strong>Demonstration mode.</strong> Real code changes and tests. No AI model calls or charges.</span></div>` : ''}
      <main id="main" class="main"><div class="page-heading"><div><p class="eyebrow">${state.view === 'session' ? 'SESSION WORKSPACE' : 'DE VLOER / WORKSPACE'}</p><h1>${escape(title)}</h1><p class="page-subtitle">${escape(subtitle)}</p></div>${state.view === 'sessions' && user.role !== 'viewer' ? `<button class="button primary" data-action="new">${icon('plus')} New session <kbd>N</kbd></button>` : state.view === 'tasks' ? `<button class="button secondary" data-action="connections">${icon('layers')} Connections</button>` : ''}</div>${content}</main>
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
