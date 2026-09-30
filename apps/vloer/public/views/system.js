import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml } from '../core/dom.js';
import { money } from '../core/format.js';
import { icon } from '../core/icons.js';
import { dashboardLinks } from '../core/observability.js';
import { shell } from '../shell.js';

function renderSystem() {
  const health = state.health;
  const content = `<div class="environment-grid"><section class="panel"><div class="panel-heading"><h2>Execution environment</h2>${icon('shield')}</div><dl class="environment-list"><dt>Deployment</dt><dd>${state.bootstrap.mode === 'demo' ? 'Local demonstration' : 'Live workbench'}</dd><dt>Workspace placements</dt><dd>${state.bootstrap.mode === 'demo' ? 'Demonstration fixture' : (state.bootstrap.placements || []).length ? (state.bootstrap.placements || []).map(placement => `${escape(placement.name)}${placement.default ? ' · default' : ''}`).join('<br>') : escape(health?.workspaceBackend || 'Loading…')}</dd><dt>Model gateway</dt><dd>${state.bootstrap.mode === 'demo' ? 'Not used in demonstration' : health?.litellm ? 'LiteLLM configured' : 'Not configured · paid execution blocked'}</dd>${dashboardLinks() ? `<dt>Dashboards</dt><dd class="link-row">${dashboardLinks()}</dd>` : ''}<dt>Gateway policy</dt><dd>${state.bootstrap.gatewayPolicy ? [state.bootstrap.gatewayPolicy.providers ? `providers: ${state.bootstrap.gatewayPolicy.providers.map(escape).join(', ')}` : '', state.bootstrap.gatewayPolicy.regions ? `regions: ${state.bootstrap.gatewayPolicy.regions.map(escape).join(', ')}` : ''].filter(Boolean).join('<br>') : 'Any provider and region the gateway routes to'}</dd><dt>Concurrent sessions</dt><dd>${state.bootstrap.maxConcurrentSessions}</dd><dt>Maximum session authorization</dt><dd>${money(state.bootstrap.maxBudgetUsd)}</dd><dt>Storage</dt><dd>Persistent SQLite · one application replica</dd></dl></section><section class="panel"><div class="panel-heading"><h2>Registered repositories</h2><span class="count-badge">${state.bootstrap.repositories.length}</span></div>${state.bootstrap.repositories.map(repo => `<article class="profile-row">${icon('folder')}<div><h3>${escape(repo.name)}</h3><p>${escape(repo.description)}</p><span class="tag">${escape(repo.baseBranch)}</span></div></article>`).join('')}</section><section class="panel span-two"><div class="panel-heading"><h2>Reusable crews</h2><p>Procedures are versioned with the configuration.</p></div><div class="crew-profiles">${state.bootstrap.crews.map(crew => `<article><span class="tiny-label">${escape(crew.id)}</span><h3>${escape(crew.name)}</h3><p>${escape(crew.description)}</p><div>${crew.roles.map(role => `<span class="role-chip">${icon(role.mode === 'write' ? 'code' : 'shield')}${escape(role.name)}</span>`).join('')}</div></article>`).join('')}</div></section></div>`;
  renderHtml(shell(content, 'Environment', 'The shared foundation behind every session.'));
}

/** The Environment page: execution environment, registered repositories and reusable crews. */
export default {
  id: 'system',
  match: hash => hash === 'system' ? {} : null,
  load: async () => { state.health = await api('/api/health'); renderSystem(); },
  render: renderSystem,
};
