import type { AppConfig } from './types.ts';

/** The Grafana dashboards key whose uid opens Claude Code's per-session explorer with `var-session`. */
export const sessionDashboardKey = 'claude-code-session';
/** How long one telemetry read may take, and the most rows a log store answer may carry. */
export const telemetryLimits = { timeoutMs: 4000, rows: 50, bytes: 1_048_576, windowDays: 30 } as const;

/**
 * What Claude Code's own OpenTelemetry export says about one session, read back from the estate's metrics and log
 * stores. Amounts are what Claude Code estimates at API prices; a session on a Claude plan is not billed them.
 * Prompt and tool content is never read.
 */
export type SessionTelemetry = {
  available: boolean;
  reason: string | null;
  costUsd: number | null;
  costStatus: 'estimate';
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number } | null;
  activeSeconds: number | null;
  events: { prompts: number; toolResults: number; apiRequests: number; apiErrors: number } | null;
  tools: { name: string; count: number }[];
  account: { uuid: string; organization: string } | null;
  dashboardUrl: string | null;
};

type Observability = AppConfig['observability'];

/** A PromQL or LogsQL string literal for `value`. */
export function quoted(value: string): string { return JSON.stringify(value); }

/**
 * The PromQL queries for one session's totals over `range`, such as `86400s`: the highest value each of its cumulative
 * counters reached, summed over its series (model, query source). Claude Code may export a short session's counter
 * once, which `increase()` reads as almost nothing; a counter that restarted when a session was resumed counts only its
 * larger part.
 */
export function metricQueries(sessionId: string, range: string): { cost: string; tokens: string; active: string } {
  const session = `session_id=${quoted(sessionId)}`;
  return {
    cost: `sum(max_over_time(claude_code_cost_usage_USD_total{${session}}[${range}]))`,
    tokens: `sum by (type) (max_over_time(claude_code_token_usage_tokens_total{${session}}[${range}]))`,
    active: `sum(max_over_time(claude_code_active_time_seconds_total{${session}}[${range}]))`,
  };
}

/** The LogsQL queries over Claude Code's log events for one session: counts by event, top tools, and the account it ran as. */
export function logQueries(sessionId: string): { events: string; tools: string; account: string } {
  const base = `{service_name="claude-code"} attributes.session.id:=${quoted(sessionId)}`;
  return {
    events: `${base} | stats by (event_name) count() hits`,
    tools: `${base} event_name:="tool_result" | rename attributes.tool_name as tool_name | stats by (tool_name) count() hits | sort by (hits desc) | limit 8`,
    account: `${base} attributes.user.account_uuid:* | fields attributes.user.account_uuid, attributes.organization.id | limit 1`,
  };
}

/** Grafana's session explorer for one session, when the dashboard uid is configured under `observability.dashboards`. */
export function sessionDashboardUrl(observability: Observability, sessionId: string, startedAt: string): string | null {
  const uid = observability?.dashboards?.[sessionDashboardKey];
  if (!observability?.grafanaUrl || !uid) return null;
  const from = Math.max(0, Date.parse(startedAt) - 300_000);
  const query = new URLSearchParams({ 'var-session': sessionId, from: String(Number.isFinite(from) ? from : Date.now() - 86_400_000), to: 'now' });
  return `${observability.grafanaUrl.replace(/\/$/, '')}/d/${encodeURIComponent(uid)}?${query}`;
}

async function bounded(response: Response): Promise<string> {
  if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); throw new Error(`answered ${response.status}`); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > telemetryLimits.bytes) throw new Error('answered with too much data');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks).toString('utf8');
}

async function promQuery(metricsUrl: string, query: string, fetcher: typeof fetch): Promise<{ labels: Record<string, string>; value: number }[]> {
  const response = await fetcher(`${metricsUrl.replace(/\/$/, '')}/api/v1/query`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ query }).toString(), signal: AbortSignal.timeout(telemetryLimits.timeoutMs), redirect: 'manual' });
  const body = JSON.parse(await bounded(response));
  if (body?.status !== 'success' || !Array.isArray(body?.data?.result)) throw new Error('answered without a result');
  return body.data.result.slice(0, telemetryLimits.rows).map((entry: any) => ({ labels: entry.metric && typeof entry.metric === 'object' ? entry.metric : {}, value: Number(entry.value?.[1]) })).filter((entry: { value: number }) => Number.isFinite(entry.value));
}

async function logsQuery(logsUrl: string, query: string, fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
  const response = await fetcher(`${logsUrl.replace(/\/$/, '')}/select/logsql/query`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ query, limit: String(telemetryLimits.rows), start: `${telemetryLimits.windowDays}d` }).toString(), signal: AbortSignal.timeout(telemetryLimits.timeoutMs), redirect: 'manual' });
  return (await bounded(response)).split('\n').filter(line => line.trim()).slice(0, telemetryLimits.rows).map(line => JSON.parse(line)).filter(row => row && typeof row === 'object' && !Array.isArray(row));
}

const whole = (value: number) => Math.max(0, Math.round(value));
const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : '';

/**
 * Reads one session's telemetry from `observability.metricsUrl` (a Prometheus-compatible query API such as
 * VictoriaMetrics) and `observability.logsUrl` (VictoriaLogs). Either store may be missing or down; what could not be
 * read is null and `reason` says why, so the page still shows what is known.
 */
export async function readSessionTelemetry(observability: Observability, sessionId: string, startedAt: string, options: { fetch?: typeof fetch; now?: number } = {}): Promise<SessionTelemetry> {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now();
  const dashboardUrl = sessionDashboardUrl(observability, sessionId, startedAt);
  const empty: SessionTelemetry = { available: false, reason: null, costUsd: null, costStatus: 'estimate', tokens: null, activeSeconds: null, events: null, tools: [], account: null, dashboardUrl };
  if (!observability?.metricsUrl && !observability?.logsUrl) return { ...empty, reason: 'This workbench reads no telemetry store. Set observability.metricsUrl and observability.logsUrl.' };
  const reasons: string[] = [];
  const out = { ...empty };
  const started = Date.parse(startedAt);
  const seconds = Math.min(telemetryLimits.windowDays * 86_400, Math.max(600, Math.ceil(((Number.isFinite(started) ? now - started : 86_400_000) + 600_000) / 1000)));
  const metrics = observability.metricsUrl ? (async () => {
    const queries = metricQueries(sessionId, `${seconds}s`);
    const [cost, tokens, active] = await Promise.all([promQuery(observability.metricsUrl!, queries.cost, fetcher), promQuery(observability.metricsUrl!, queries.tokens, fetcher), promQuery(observability.metricsUrl!, queries.active, fetcher)]);
    const byType = (type: string) => whole(tokens.find(entry => entry.labels.type === type)?.value ?? 0);
    out.costUsd = cost.length ? Math.round(cost[0].value * 10_000) / 10_000 : 0;
    out.tokens = { input: byType('input'), output: byType('output'), cacheRead: byType('cacheRead'), cacheCreation: byType('cacheCreation') };
    out.activeSeconds = active.length ? whole(active[0].value) : 0;
  })().catch((error: Error) => { reasons.push(`The metrics store ${error.name === 'TimeoutError' ? 'did not answer in time' : error.message.startsWith('answered') ? error.message : 'could not be read'}.`); }) : Promise.resolve(reasons.push('No metrics store is configured, so cost and tokens are unknown.'));
  const logs = observability.logsUrl ? (async () => {
    const queries = logQueries(sessionId);
    const [events, tools, account] = await Promise.all([logsQuery(observability.logsUrl!, queries.events, fetcher), logsQuery(observability.logsUrl!, queries.tools, fetcher), logsQuery(observability.logsUrl!, queries.account, fetcher)]);
    const count = (name: string) => whole(Number(events.find(row => row.event_name === name)?.hits ?? 0));
    out.events = { prompts: count('user_prompt'), toolResults: count('tool_result'), apiRequests: count('api_request'), apiErrors: count('api_error') };
    out.tools = tools.map(row => ({ name: String(row.tool_name ?? '').replace(/[^\w.:-]/g, '').slice(0, 80), count: whole(Number(row.hits ?? 0)) })).filter(row => row.name && row.count);
    const uuid = identifier(account[0]?.['attributes.user.account_uuid']);
    out.account = uuid ? { uuid, organization: identifier(account[0]?.['attributes.organization.id']) } : null;
  })().catch((error: Error) => { reasons.push(`The log store ${error.name === 'TimeoutError' ? 'did not answer in time' : error.message.startsWith('answered') ? error.message : 'could not be read'}.`); }) : Promise.resolve(reasons.push('No log store is configured, so prompts and tools are unknown.'));
  await Promise.all([metrics, logs]);
  out.available = out.costUsd !== null || out.events !== null;
  out.reason = reasons.length ? reasons.join(' ') : null;
  return out;
}

/** The most session ids one digest query names, so the regex matcher stays small. */
export const digestSessionLimit = 100;

/**
 * The PromQL query for the summed cost of several sessions over `range`: the highest value each session's cumulative
 * cost counter reached, through one regex matcher on `session_id`. Only ids of the shape Unfold accepts are kept, so no
 * id can widen the matcher.
 */
export function digestCostQuery(sessionIds: string[], range: string): string {
  const ids = [...new Set(sessionIds.filter(id => /^[A-Za-z0-9_-]{8,128}$/.test(id)))].slice(0, digestSessionLimit);
  return `sum(max_over_time(claude_code_cost_usage_USD_total{session_id=~${quoted(ids.join('|'))}}[${range}]))`;
}

/**
 * Reads the summed API-price estimate of several sessions from `observability.metricsUrl` in one query. Answers null
 * with a reason when no metrics store is configured, it could not be read, or there are no sessions to ask about.
 */
export async function readSessionsCost(observability: Observability, sessionIds: string[], range: string, options: { fetch?: typeof fetch } = {}): Promise<{ costUsd: number | null; reason: string | null }> {
  if (!sessionIds.length) return { costUsd: 0, reason: null };
  if (!observability?.metricsUrl) return { costUsd: null, reason: 'No metrics store is configured, so the cost is unknown.' };
  try {
    const result = await promQuery(observability.metricsUrl, digestCostQuery(sessionIds, range), options.fetch ?? fetch);
    return { costUsd: result.length ? Math.round(result[0].value * 10_000) / 10_000 : 0, reason: null };
  } catch (error) {
    const failure = error as Error;
    return { costUsd: null, reason: `The metrics store ${failure.name === 'TimeoutError' ? 'did not answer in time' : failure.message.startsWith('answered') ? failure.message : 'could not be read'}.` };
  }
}
