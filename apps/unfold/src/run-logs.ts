import type { AppConfig } from './types.ts';
import { plainRedactedText } from './redaction.ts';

export type RunLogPod = { namespace: string; pod: string; container: string };
export type RunLogLine = { at: string; text: string; stream?: string };
export type RunLogsReason = 'demo' | 'not_connected' | 'no_alias' | 'not_started';
export type RunLogs = { workItemId: string; runId: string; available: boolean; reason?: RunLogsReason; message?: string; pods: RunLogPod[]; lines: RunLogLine[]; truncated: boolean; live: boolean; cursor: string | null; grafanaUrl?: string; demo: boolean; fetchedAt: string };
export type RunLogsRun = { id: string; workItemId: string; state: 'pending' | 'running' | 'finished'; startedAt: string | null; finishedAt: string | null; keyAlias: string | null };
export type RunLogsOptions = { demo?: boolean; after?: string; now?: number; fetch?: typeof fetch };

/** The bounds of one read: the newest `lines` lines, each cut at `lineLength` characters, from at most `pods` pods, in a window `margin` ms wider than the Run on each side. */
export const runLogLimits = Object.freeze({ lines: 500, lineLength: 4000, pods: 5, margin: 120_000, timeoutMs: 5000, bytes: 8 * 1024 * 1024 });

export class RunLogsError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'RunLogsError'; this.status = status; this.code = code; }
}

const aliasPattern = /^[a-z0-9-]{1,64}$/;
const namePattern = /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/;
const sandboxPod = /^sbx-[a-z0-9]/;
const cursorPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const unreachable = 'The log store could not be reached or answered with something unexpected. Try again in a moment.';

/** A LogsQL quoted string: the value in double quotes, with quotes and backslashes escaped. */
export function logsqlString(value: string): string { return JSON.stringify(value); }

/** The LogsQL filter that finds the pods whose lines carry the Run's trace key. */
export function traceFilter(alias: string): string { return logsqlString(`trace=${alias}`); }

/** The LogsQL filter that selects every line of `pods`. */
export function podsFilter(pods: RunLogPod[]): string {
  return `(${pods.map(entry => `namespace:=${logsqlString(entry.namespace)} pod:=${logsqlString(entry.pod)} container:=${logsqlString(entry.container)}`).join(' or ')})`;
}

function explore(grafanaUrl: string, datasource: string, expr: string, from: number, to: number): string {
  const panes = { v: { datasource, queries: [{ refId: 'A', datasource: { uid: datasource }, expr }], range: { from: String(from), to: String(to) } } };
  return `${grafanaUrl.replace(/\/$/, '')}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify(panes))}`;
}

function cleanLine(value: unknown): string {
  const text = plainRedactedText(typeof value === 'string' ? value : '').replace(/\s+$/, '');
  return text.length > runLogLimits.lineLength ? `${text.slice(0, runLogLimits.lineLength)}…` : text;
}

async function query(logsUrl: string, logsql: string, limit: number, fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
  let response: Response;
  try {
    response = await fetcher(`${logsUrl.replace(/\/$/, '')}/select/logsql/query`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ query: logsql, limit: String(limit) }).toString(), signal: AbortSignal.timeout(runLogLimits.timeoutMs), redirect: 'manual' });
  } catch { throw new RunLogsError(503, 'run_logs_unavailable', unreachable); }
  if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); throw new RunLogsError(503, 'run_logs_unavailable', unreachable); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > runLogLimits.bytes) throw new RunLogsError(502, 'run_logs_too_large', 'The log store answered with more than the 8 MiB a Run\'s logs may take.');
      chunks.push(chunk.value);
    }
  } catch (error) { if (error instanceof RunLogsError) throw error; throw new RunLogsError(503, 'run_logs_unavailable', unreachable); }
  finally { await reader.cancel().catch(() => undefined); }
  const rows: Record<string, unknown>[] = [];
  for (const line of Buffer.concat(chunks).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    let row: unknown;
    try { row = JSON.parse(line); } catch { throw new RunLogsError(502, 'run_logs_unavailable', unreachable); }
    if (row && typeof row === 'object' && !Array.isArray(row)) rows.push(row as Record<string, unknown>);
  }
  return rows;
}

/**
 * Reads the agent pod logs of one Run from VictoriaLogs at `observability.logsUrl`. It finds the pods whose lines
 * carry the Run's trace key (its gateway key alias) inside the Run's window, and for a sandbox pod `sbx-<name>` the
 * worker pod `<name>` that claimed it, whose lines carry no trace key, then returns their newest lines oldest
 * first, without the duplicates a log shipper may deliver twice, with terminal escapes removed and credentials masked. `after` (a returned `cursor`) reads only newer lines.
 * Without `logsUrl` it answers `available: false` with a Grafana Explore link when Grafana and a logs datasource are
 * configured. The demo has no pods and says so.
 */
export async function readRunLogs(observability: AppConfig['observability'], run: RunLogsRun, options: RunLogsOptions = {}): Promise<RunLogs> {
  const base = { workItemId: run.workItemId, runId: run.id, pods: [] as RunLogPod[], lines: [] as RunLogLine[], truncated: false, live: run.state !== 'finished', cursor: null as string | null, demo: options.demo === true };
  const stamp = () => new Date().toISOString();
  if (options.demo) return { ...base, live: false, available: false, reason: 'demo', message: 'The demo runs no agent pods, so it has no pod logs to show.', fetchedAt: stamp() };
  if (options.after !== undefined && !cursorPattern.test(options.after)) throw new RunLogsError(400, 'run_logs_cursor', 'Use a cursor from an earlier read of these logs.');
  if (!run.keyAlias) return { ...base, available: false, reason: 'no_alias', message: 'Ploeg reported no key for this Run, so its pod cannot be found.', fetchedAt: stamp() };
  if (!aliasPattern.test(run.keyAlias)) throw new RunLogsError(422, 'run_logs_alias', 'This Run\'s key has a form Unfold does not search logs for.');
  const now = options.now ?? Date.now();
  const started = run.startedAt ? Date.parse(run.startedAt) : NaN;
  const ended = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const from = Number.isFinite(started) ? started - runLogLimits.margin : now - runLogLimits.margin;
  const to = (Number.isFinite(ended) ? ended : now) + runLogLimits.margin;
  const grafana = observability?.grafanaUrl && observability.logsDatasource ? (expr: string) => explore(observability.grafanaUrl!, observability.logsDatasource!, expr, from, to) : null;
  const traced = traceFilter(run.keyAlias);
  if (!observability?.logsUrl) return { ...base, available: false, reason: 'not_connected', message: 'Logs are not connected: set observability.logsUrl.', ...(grafana ? { grafanaUrl: grafana(traced) } : {}), fetchedAt: stamp() };
  if (!run.startedAt) return { ...base, available: true, reason: 'not_started', message: 'The Run has not started, so it has no pod yet.', ...(grafana ? { grafanaUrl: grafana(traced) } : {}), fetchedAt: stamp() };
  const fetcher = options.fetch ?? fetch;
  const window = `_time:[${new Date(from).toISOString()}, ${new Date(to).toISOString()}]`;
  const found = await query(observability.logsUrl, `${window} ${traced} | stats by (namespace, pod, container) count() n`, 100, fetcher);
  const workers = [...new Map(found.map(row => [String(row.namespace ?? ''), String(row.pod ?? '')] as const).filter(([namespace, pod]) => namePattern.test(namespace) && sandboxPod.test(pod)).map(([namespace, pod]) => [`${namespace}/${pod}`, { namespace, pod: pod.slice('sbx-'.length) }])).values()].slice(0, runLogLimits.pods);
  const launched = workers.length ? await query(observability.logsUrl, `${window} (${workers.map(entry => `namespace:=${logsqlString(entry.namespace)} pod:=${logsqlString(entry.pod)}`).join(' or ')}) | stats by (namespace, pod, container) count() n`, 100, fetcher) : [];
  const seen = new Set<string>();
  const pods = [...found, ...launched]
    .map(row => ({ namespace: String(row.namespace ?? ''), pod: String(row.pod ?? ''), container: String(row.container ?? '') }))
    .filter(entry => namePattern.test(entry.namespace) && namePattern.test(entry.pod) && namePattern.test(entry.container) && !seen.has(`${entry.namespace}/${entry.pod}/${entry.container}`) && seen.add(`${entry.namespace}/${entry.pod}/${entry.container}`))
    .sort((a, b) => a.pod.localeCompare(b.pod) || a.container.localeCompare(b.container))
    .slice(0, runLogLimits.pods);
  if (!pods.length) return { ...base, available: true, ...(grafana ? { grafanaUrl: grafana(traced) } : {}), fetchedAt: stamp() };
  const selected = podsFilter(pods);
  const after = options.after && Date.parse(options.after) > from ? `_time:(${options.after}, ${new Date(to).toISOString()}]` : window;
  const rows = await query(observability.logsUrl, `${after} ${selected} | sort by (_time desc) | limit ${runLogLimits.lines + 1} | fields _time, _msg, pod`, runLogLimits.lines + 1, fetcher);
  const truncated = rows.length > runLogLimits.lines;
  const several = new Set(pods.map(entry => entry.pod)).size > 1;
  const lines = rows.slice(0, runLogLimits.lines).filter(row => typeof row._time === 'string' && cursorPattern.test(row._time)).reverse().map(row => ({ at: row._time as string, text: cleanLine(row._msg), ...(several && typeof row.pod === 'string' ? { stream: row.pod } : {}) })).filter((line, index, all) => index === 0 || line.at !== all[index - 1].at || line.text !== all[index - 1].text || line.stream !== all[index - 1].stream);
  return { ...base, available: true, pods, lines, truncated, cursor: lines.at(-1)?.at ?? options.after ?? null, ...(grafana ? { grafanaUrl: grafana(selected) } : {}), fetchedAt: stamp() };
}
