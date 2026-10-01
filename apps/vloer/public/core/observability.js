import { state } from './state.js';
import { escape, safeUrl } from './dom.js';
import { icon } from './icons.js';

const link = (href, label) => { const target = safeUrl(href); return target ? `<a href="${escape(target)}" target="_blank" rel="noopener noreferrer">${escape(label)} ${icon('external')}<span class="sr-only"> (opens in a new tab)</span></a>` : ''; };

/** Renders Grafana trace and log links for a session, or for one gateway request of it. */
export function observabilityLinks(session, request) {
  const o = state.bootstrap.observability;
  if (!o || !o.grafanaUrl) return '';
  const grafana = o.grafanaUrl.replace(/\/$/, '');
  const window = request ? [Date.parse(request.at) - 60000, Date.parse(request.at) + (request.durationMs || 0) + 60000] : session ? [Date.parse(session.runs.find(run => run.startedAt)?.startedAt || session.createdAt) - 60000, Date.parse(session.updatedAt) + 60000] : null;
  const range = window ? { from: String(window[0]), to: String(window[1]) } : { from: 'now-1h', to: 'now' };
  const explore = (uid, query, queryType) => `${grafana}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify({ v: { datasource: uid, queries: [{ refId: 'A', datasource: { uid }, ...(queryType ? { queryType } : {}), ...(query !== undefined ? (queryType === 'traceql' ? { query } : { expr: query }) : {}) }], range } }))}`;
  const fill = template => template.replace('{callId}', request?.callId || '').replace('{alias}', session ? `de-vloer-${session.id}` : '').replace('{sessionId}', session?.id || '');
  const links = [];
  if (o.tracesDatasource) links.push(link(explore(o.tracesDatasource, fill(o.traceQuery || '{ resource.service.name = "litellm" }'), 'traceql'), 'Traces'));
  if (o.logsDatasource) links.push(link(explore(o.logsDatasource, fill(o.logsQuery || 'k8s_namespace:"ai" AND k8s_container:"litellm"')), 'Logs'));
  return links.filter(Boolean).join(' ');
}

const loopDashboard = 'glide-loop';
const runDashboard = 'dark-factory-run-explorer';

/**
 * A Grafana link to the loop dashboard for one Team, or null without a configured Grafana URL. The dashboard
 * uid is a constant here, so no setting beyond `observability.grafanaUrl` is needed.
 * @param {string} team
 * @param {string} [grafanaUrl] Defaults to the configured `observability.grafanaUrl`.
 * @returns {string | null}
 */
export function grafanaTeam(team, grafanaUrl = state.bootstrap?.observability?.grafanaUrl) {
  const base = safeUrl(grafanaUrl);
  return base && team ? `${base.replace(/\/$/, '')}/d/${loopDashboard}?var-team=${encodeURIComponent(team)}` : null;
}

/**
 * A Grafana link to the run explorer for one Run's key alias, or null without a configured Grafana URL or an
 * alias.
 * @param {string} alias
 * @param {string} [grafanaUrl] Defaults to the configured `observability.grafanaUrl`.
 * @returns {string | null}
 */
export function runExplorer(alias, grafanaUrl = state.bootstrap?.observability?.grafanaUrl) {
  const base = safeUrl(grafanaUrl);
  return base && alias ? `${base.replace(/\/$/, '')}/d/${runDashboard}?var-run=${encodeURIComponent(alias)}` : null;
}

/** Renders links to the configured Grafana dashboards. */
export function dashboardLinks() {
  const o = state.bootstrap.observability;
  if (!o || !o.grafanaUrl || !o.dashboards) return '';
  const grafana = o.grafanaUrl.replace(/\/$/, '');
  const names = { spend: 'Spend, budgets and savings', reliability: 'Latency and reliability', finops: 'FinOps' };
  return Object.entries(o.dashboards).map(([key, uid]) => link(`${grafana}/d/${encodeURIComponent(uid)}`, names[key] || key)).filter(Boolean).join(' ');
}
