import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, safeUrl, renderHtml } from '../core/dom.js';
import { money, plural } from '../core/format.js';
import { icon } from '../core/icons.js';
import { refreshCounts } from '../core/counts.js';
import { badge, button, callout, chip, demoNote, dl, skeleton } from '../core/ui.js';
import { repoName, providerName, providerLabels } from '../core/lookup.js';
import { shell } from '../shell.js';

const looks = {
  ok: { tone: 'success', glyph: 'check-circle' },
  setup: { tone: 'attention', glyph: 'alert' },
  failing: { tone: 'danger', glyph: 'x-circle' },
  info: { tone: 'neutral', glyph: 'circle-dashed' },
  listed: { tone: 'neutral', glyph: 'check' },
  unknown: { tone: 'neutral', glyph: 'help-circle' },
};
const toDo = ['setup', 'failing', 'unknown'];
const dashboardNames = { spend: 'Spend, budgets and savings', reliability: 'Latency and reliability', finops: 'FinOps' };

let loading = false;
let failure = '';

const act = (attribute, options) => button(options).replace('<button ', `<button ${attribute} `);
const code = text => `<code>${escape(text)}</code>`;
const isAdmin = () => state.bootstrap.user.role === 'admin';
const refreshAction = label => act('data-action="environment-refresh"', { label, icon: 'refresh', size: 'sm' });
const askAdmin = 'Ask an administrator to set this up.';

function ploegCheck() {
  const refresh = refreshAction('Check again');
  const cases = {
    demo: { status: 'info', label: 'Demo data', detail: 'Ploeg answers with illustrative Work Items and Runs. Nothing is dispatched and no model is called.' },
    connected: { status: 'ok', label: 'Connected', detail: 'Ploeg answered the last check. Now, Work, Runs and Activity read from it.' },
    partial: { status: 'setup', label: 'Partly unavailable', detail: 'Some of Ploeg’s data could not be read in the last check. Pages show what did load.', next: isAdmin() ? 'Check Ploeg’s logs and the connection from Vloer, then check again.' : 'Try again in a minute. If it stays like this, tell an administrator.', action: refresh },
    unavailable: { status: 'failing', label: 'Unreachable', detail: 'Ploeg did not answer. Nothing new was started, and pages show the last data they read.', next: isAdmin() ? `Check that Ploeg is running and that ${code('ploeg.url')} points at it.` : 'Tell an administrator; nothing is lost while Ploeg is away.', action: refresh },
    unconfigured: { status: 'setup', label: 'Not configured', detail: 'Vloer has no Ploeg connection, so Now, Work and Runs stay empty.', next: isAdmin() ? `Set ${code('ploeg.url')} and ${code('ploeg.tokenEnv')} in the server configuration, then restart Vloer. ${code('docs/operations/live.md')} walks through it.` : askAdmin },
    'no-access': { status: 'setup', label: 'No Teams for you', detail: 'Ploeg is connected, but your account may not read any of its Teams.', next: isAdmin() ? `Add your account to ${code('ploeg.userTeams')} in the server configuration.` : 'Ask an administrator to give your account access to a Team.' },
  };
  return { id: 'ploeg', title: 'Ploeg connection', ...(cases[state.ploegStatus] || { status: 'info', label: 'Checking…', detail: 'Vloer has not heard from Ploeg yet.', action: refresh }) };
}

function gatewayCheck() {
  const policy = state.bootstrap.gatewayPolicy;
  const policyText = policy ? [policy.providers ? `providers ${policy.providers.join(', ')}` : '', policy.regions ? `regions ${policy.regions.join(', ')}` : ''].filter(Boolean).join(' · ') : '';
  if (state.bootstrap.mode === 'demo') return { id: 'gateway', title: 'Model gateway', status: 'info', label: 'Not used', detail: 'The demo runs real Git changes and checks without model calls or spend.' };
  if (!state.health && failure) return { id: 'gateway', title: 'Model gateway', status: 'unknown', label: 'Unknown', detail: 'Vloer could not read its health, so the gateway state is unknown.', action: refreshAction('Check again') };
  if (!state.health) return { id: 'gateway', title: 'Model gateway', status: 'info', label: 'Checking…', detail: 'Reading the workbench health.' };
  if (state.health.litellm) {
    const host = state.bootstrap.gateway || state.health.gateway;
    return { id: 'gateway', title: 'Model gateway', status: 'ok', label: 'Configured', detail: `${host ? `LiteLLM at ${escape(host)}. ` : 'LiteLLM is configured. '}${policyText ? `Sessions may only use ${escape(policyText)}.` : 'Sessions may use any provider and region the gateway routes to.'}` };
  }
  return { id: 'gateway', title: 'Model gateway', status: 'failing', label: 'Not configured', detail: 'Sessions cannot call a model, so paid execution is blocked.', next: isAdmin() ? `Set ${code('LITELLM_BASE_URL')} and ${code('LITELLM_MASTER_KEY')} in the server environment, then restart Vloer.` : askAdmin };
}

function placementCheck() {
  const placements = state.bootstrap.placements || [];
  if (state.bootstrap.mode === 'demo') return { id: 'placements', title: 'Workspace placements', status: 'info', label: 'Demo fixture', detail: 'The demo prepares its repository fixture on this machine.' };
  if (!placements.length) return { id: 'placements', title: 'Workspace placements', status: 'setup', label: 'None', detail: `Workspaces use the ${escape(state.health?.workspaceBackend || 'default')} backend.`, next: isAdmin() ? `List the backends in ${code('runtime.backends')}: ${code('docker')} or ${code('kubernetes')} isolate each workspace.` : askAdmin };
  const names = placements.map(placement => `${escape(placement.name)}${placement.default && placements.length > 1 ? ' · default' : ''}`).join('; ');
  if (placements.every(placement => placement.isolation === 'working-directory')) return { id: 'placements', title: 'Workspace placements', status: 'setup', label: 'Trusted work only', detail: `${names}. No container separates the agents from the host.`, next: isAdmin() ? `Add ${code('docker')} or ${code('kubernetes')} to ${code('runtime.backends')} to isolate workspaces.` : askAdmin };
  return { id: 'placements', title: 'Workspace placements', status: 'ok', label: plural(placements.length, 'placement'), detail: `${names}.` };
}

function runtimeCheck() {
  const runtimes = state.bootstrap.runtimes || [];
  const missing = runtimes.filter(runtime => runtime.available === false);
  const names = runtimes.map(runtime => escape(runtime.name)).join(' · ');
  if (!runtimes.length) return { id: 'runtimes', title: 'Agent runtimes', status: 'failing', label: 'None', detail: 'No agent runtime is registered, so sessions cannot start.', next: isAdmin() ? `Configure ${code('runtime.kind')} in the server configuration.` : askAdmin };
  if (missing.length) return { id: 'runtimes', title: 'Agent runtimes', status: 'setup', label: `${missing.length} unavailable`, detail: `${names}. ${missing.map(runtime => escape(runtime.name)).join(', ')} cannot start sessions right now.`, next: isAdmin() ? 'Check that the runtime is installed and reachable from the workbench.' : askAdmin };
  return { id: 'runtimes', title: 'Agent runtimes', status: 'listed', label: 'Registered', detail: `${names}. Read from the server configuration; this page does not start ${runtimes.length === 1 ? 'it' : 'them'} to check.` };
}

function sourcesCheck() {
  const sources = state.bootstrap.taskSources || [];
  const how = act('data-action="connections"', { label: 'How connections work', size: 'sm' });
  if (!sources.length) return { id: 'sources', title: 'Task connections', status: 'setup', label: 'None yet', detail: 'Tasks stays empty until a tracker project is connected.', next: isAdmin() ? `Add a ${code('taskSources')} entry for each tracker project. ${code('docs/operations/task-connections.md')} has examples for all five trackers.` : askAdmin, action: how };
  const list = sources.map(source => `${escape(source.name)} (${escape(providerName(source.provider))} to ${escape(repoName(source.repositoryId))})`).join(' · ');
  const unlinked = sources.filter(source => source.needsLink && state.links && !state.links.some(link => link.provider === source.needsLink && link.linked));
  if (unlinked.length) return { id: 'sources', title: 'Task connections', status: 'setup', label: 'Needs your link', detail: `${list}.`, next: `${unlinked.map(source => escape(source.name)).join(', ')} ${unlinked.length === 1 ? 'reads' : 'read'} tasks with your own ${escape(providerLabels[unlinked[0].needsLink] || unlinked[0].needsLink)} account. Link it once.`, action: button({ label: 'Open Linked accounts', href: '#settings/accounts', size: 'sm' }) };
  return { id: 'sources', title: 'Task connections', status: 'ok', label: plural(sources.length, 'connection'), detail: `${list}.` };
}

function dashboardLinks() {
  const o = state.bootstrap.observability;
  const grafana = safeUrl(o?.grafanaUrl || '');
  if (!grafana) return [];
  const root = grafana.replace(/\/$/, '');
  const boards = Object.entries(o.dashboards || {}).map(([key, uid]) => [dashboardNames[key] || key, `${root}/d/${encodeURIComponent(uid)}`]);
  return boards.length ? boards : [['Grafana', root]];
}

function dashboardsCheck() {
  const links = dashboardLinks();
  if (!links.length) return { id: 'dashboards', title: 'Dashboards', status: 'info', label: 'Optional', detail: 'Grafana dashboards for spend and reliability can be linked here and on each session.', next: isAdmin() ? `Set ${code('observability.grafanaUrl')} and ${code('observability.dashboards')} in the server configuration.` : '' };
  return { id: 'dashboards', title: 'Dashboards', status: 'ok', label: plural(links.length, 'dashboard'), detail: 'Open them in Grafana.', links };
}

function checkRow(check) {
  const look = looks[check.status];
  const links = check.links ? `<div class="health-links">${check.links.map(([label, href]) => button({ label, href, external: true, size: 'sm' })).join('')}</div>` : '';
  const next = check.next ? `<p class="health-next">${icon('arrow')}<span>${check.next}</span></p>` : '';
  return `<li class="health-check" data-tone="${look.tone}" data-status="${check.status}"><span class="health-icon" aria-hidden="true">${icon(look.glyph)}</span><div class="health-main"><div class="health-heading"><h3 class="health-title" id="health-${check.id}">${escape(check.title)}</h3>${badge({ tone: look.tone, label: check.label, size: 'sm' })}</div><p class="health-detail">${check.detail}</p>${next}${links}</div>${check.action ? `<div class="health-action">${check.action}</div>` : ''}</li>`;
}

function checklist() {
  if (loading && !state.health) return `<header class="settings-card-header health-summary"><div><h2 class="settings-card-title" id="health-title">Health checks</h2><p class="settings-card-description">Checking the workbench…</p></div></header><div class="health-loading">${skeleton({ rows: 5 })}</div>`;
  const checks = [ploegCheck(), gatewayCheck(), runtimeCheck(), placementCheck(), sourcesCheck(), dashboardsCheck()];
  const ready = checks.filter(check => ['ok', 'listed'].includes(check.status)).length;
  const open = checks.filter(check => toDo.includes(check.status)).length;
  const unused = checks.filter(check => check.status === 'info').length;
  const failing = checks.some(check => check.status === 'failing');
  const summary = open ? `${plural(open, 'check')} ${open === 1 ? 'needs' : 'need'} attention` : 'Everything this workbench needs is in place';
  const tally = [ready ? badge({ tone: 'success', glyph: 'check-circle', label: `${ready} ready`, size: 'sm' }) : '', open ? badge({ tone: failing ? 'danger' : 'attention', glyph: failing ? 'x-circle' : 'alert', label: `${open} to do`, size: 'sm' }) : '', unused ? badge({ tone: 'neutral', glyph: 'circle-dashed', label: `${unused} not in use`, size: 'sm' }) : ''].join('');
  return `<header class="settings-card-header health-summary"><div><h2 class="settings-card-title" id="health-title">Health checks</h2><p class="settings-card-description">${escape(summary)}.</p></div><div class="health-tally">${tally}</div></header><ol class="health-list">${checks.map(checkRow).join('')}</ol>`;
}

function facts() {
  const boot = state.bootstrap;
  const policy = boot.gatewayPolicy;
  const policyText = policy ? [policy.providers ? `Providers: ${policy.providers.map(escape).join(', ')}` : '', policy.regions ? `Regions: ${policy.regions.map(escape).join(', ')}` : ''].filter(Boolean).join('<br>') : boot.mode === 'demo' ? 'Not used in the demo' : 'Any provider and region the gateway routes to';
  const rows = [
    ['Mode', boot.mode === 'demo' ? badge({ tone: 'attention', label: 'Demo', size: 'sm', title: 'A local demonstration: no model calls, no spend' }) : badge({ tone: 'success', label: 'Live', size: 'sm' })],
    ['Version', state.health?.version ? `<span class="num">${escape(state.health.version)}</span>` : null],
    ['Session ceiling', `<span class="num">${escape(money(boot.maxBudgetUsd))}</span> per session`],
    ['Sessions at once', `<span class="num">${escape(boot.maxConcurrentSessions)}</span>`],
    ['Shared execution', boot.sharedExecution ? 'On: tasks continue Ploeg Work Items' : 'Off'],
    ['Gateway policy', `<span class="health-policy">${policyText}</span>`],
    ['Storage', 'Local database (SQLite) on one server'],
  ];
  return `<section class="card settings-card" aria-labelledby="workbench-title"><header class="settings-card-header"><div><h2 class="settings-card-title" id="workbench-title">This workbench</h2><p class="settings-card-description">Limits every session runs under.</p></div></header><div class="settings-card-body">${dl(rows.filter(([, value]) => value !== null), { rows: true })}</div></section>`;
}

function repositories() {
  const repos = state.bootstrap.repositories || [];
  const rows = repos.map(repo => {
    const tracker = safeUrl(repo.trackerUrl || '');
    return `<li class="settings-item"><span class="settings-item-icon" aria-hidden="true">${icon('folder')}</span><div class="settings-item-main"><p class="settings-item-title">${escape(repo.name)}</p>${repo.description ? `<p class="settings-item-text">${escape(repo.description)}</p>` : ''}<div class="settings-item-meta">${chip({ label: repo.baseBranch, icon: 'branch', title: 'Base branch' })}${badge({ label: repo.executionOwner === 'ploeg' ? 'Handed to Ploeg' : 'Sessions here', tone: 'neutral', size: 'sm' })}${tracker ? chip({ label: 'Tracker', icon: 'external', href: tracker, external: true }) : ''}</div></div></li>`;
  }).join('');
  return `<section class="card settings-card" aria-labelledby="repositories-title"><header class="settings-card-header"><div><h2 class="settings-card-title" id="repositories-title">Registered repositories <span class="count">${repos.length}</span></h2><p class="settings-card-description">Sessions and imported tasks work in these repositories only.</p></div></header><ul class="settings-items">${rows || '<li class="settings-item settings-item-empty">None registered.</li>'}</ul></section>`;
}

function crews() {
  const list = state.bootstrap.crews || [];
  const rows = list.map(crew => `<li class="settings-item"><span class="settings-item-icon" aria-hidden="true">${icon('bot')}</span><div class="settings-item-main"><p class="settings-item-title">${escape(crew.name)}</p>${crew.description ? `<p class="settings-item-text">${escape(crew.description)}</p>` : ''}<ul class="settings-item-meta" aria-label="Roles">${crew.roles.map(role => `<li>${chip({ label: role.name, icon: role.mode === 'write' ? 'code' : 'eye', title: role.mode === 'write' ? 'Changes code' : 'Reads only' })}</li>`).join('')}</ul></div></li>`).join('');
  return `<section class="card settings-card" aria-labelledby="crews-title"><header class="settings-card-header"><div><h2 class="settings-card-title" id="crews-title">Crews <span class="count">${list.length}</span></h2><p class="settings-card-description">Reusable Roles for sessions. Their instructions are versioned with the configuration.</p></div></header><ul class="settings-items">${rows || '<li class="settings-item settings-item-empty">None configured.</li>'}</ul></section>`;
}

function renderSystem() {
  const error = failure ? callout({ tone: 'danger', title: 'Could not read the workbench health', body: `<p>${escape(failure)}</p>`, actions: act('data-action="environment-refresh"', { label: 'Try again', icon: 'refresh', size: 'sm' }) }) : '';
  const demo = state.bootstrap.mode === 'demo' ? demoNote('Demo workbench: Ploeg data is illustrative and no model gateway is used. No model calls, no spend.') : '';
  const content = `<div class="settings-page">${error}${demo}<div class="environment-layout"><section class="card settings-card" aria-labelledby="health-title"${loading ? ' aria-busy="true"' : ''}>${checklist()}</section>${facts()}</div>${repositories()}${crews()}</div>`;
  renderHtml(shell(content, { title: 'Environment', subtitle: 'What this workbench is connected to, and what to set up next.' }));
}

async function loadSystem() {
  loading = true; failure = '';
  if (state.view === 'system' && state.bootstrap) renderSystem();
  try { state.health = await api('/api/health'); }
  catch (error) { failure = error.message || 'The workbench did not answer.'; if (error.status === 401) { loading = false; return; } }
  await Promise.allSettled([refreshCounts(), state.links ? Promise.resolve() : api('/api/links').then(result => { state.links = result.links; })]);
  loading = false;
  if (state.view === 'system' && state.bootstrap) renderSystem();
}

/** The Environment page (`#settings/environment`): health checks with next steps, the workbench limits, registered repositories and crews. */
export default {
  id: 'system',
  match: hash => hash === 'settings/environment' ? {} : null,
  load: loadSystem,
  render: renderSystem,
  actions: { 'environment-refresh': () => loadSystem() },
};
