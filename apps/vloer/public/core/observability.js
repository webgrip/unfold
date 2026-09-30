import { state } from './state.js';
import { escape } from './dom.js';
import { icon } from './icons.js';

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
  if (o.tracesDatasource) links.push(`<a href="${escape(explore(o.tracesDatasource, fill(o.traceQuery || '{ resource.service.name = "litellm" }'), 'traceql'))}" target="_blank" rel="noopener noreferrer">Traces ${icon('external')}</a>`);
  if (o.logsDatasource) links.push(`<a href="${escape(explore(o.logsDatasource, fill(o.logsQuery || 'k8s_namespace:"ai" AND k8s_container:"litellm"')))}" target="_blank" rel="noopener noreferrer">Logs ${icon('external')}</a>`);
  return links.join(' ');
}

/** Renders links to the configured Grafana dashboards. */
export function dashboardLinks() {
  const o = state.bootstrap.observability;
  if (!o || !o.grafanaUrl || !o.dashboards) return '';
  const grafana = o.grafanaUrl.replace(/\/$/, '');
  const names = { spend: 'Spend, budgets and savings', reliability: 'Latency and reliability', finops: 'FinOps' };
  return Object.entries(o.dashboards).map(([key, uid]) => `<a class="external-link" href="${escape(`${grafana}/d/${uid}`)}" target="_blank" rel="noopener noreferrer">${escape(names[key] || key)} ${icon('external')}</a>`).join('');
}
