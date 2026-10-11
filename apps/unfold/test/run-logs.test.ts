import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunLogs, runLogLimits, RunLogsError, type RunLogsRun } from '../src/run-logs.ts';
import { PloegClient, PloegError } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { configuration } from './api-support.ts';

const logsUrl = 'http://victorialogs.example.invalid:9428';
const observability = { logsUrl, grafanaUrl: 'https://grafana.example.invalid', logsDatasource: 'victorialogs' };
const run: RunLogsRun = { id: '31', workItemId: '104', state: 'finished', startedAt: '2026-10-11T10:00:00Z', finishedAt: '2026-10-11T10:20:00Z', keyAlias: 'ploeg-f84d713980ea' };
const pod = { namespace: 'ploeg', pod: 'sbx-ploeg-worker-bronze-builder-frbbg-sjpx5', container: 'worker' };

function victoriaLogs(answer: (query: string, limit: string) => unknown[] | Response) {
  const queries: { url: string; query: string; limit: string }[] = [];
  const fake = (async (url: string | URL, init?: RequestInit) => {
    const form = new URLSearchParams(String(init?.body));
    const entry = { url: String(url), query: form.get('query') ?? '', limit: form.get('limit') ?? '' };
    queries.push(entry);
    const rows = answer(entry.query, entry.limit);
    if (rows instanceof Response) return rows;
    return new Response(rows.map(row => JSON.stringify(row)).join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/stream+json' } });
  }) as typeof fetch;
  return { fetch: fake, queries };
}

const isStats = (query: string) => query.includes('| stats by');

test('a finished Run reads its pod in two steps and returns the lines oldest first, cleaned and bounded', async () => {
  const fake = victoriaLogs(query => isStats(query)
    ? [{ ...pod, n: '3' }]
    : [
      { _time: '2026-10-11T10:19:59.000000002Z', _msg: '\u001b[32mrun finished\u001b[0m outcome=done', pod: pod.pod },
      { _time: '2026-10-11T10:19:59.000000002Z', _msg: '\u001b[32mrun finished\u001b[0m outcome=done', pod: pod.pod },
      { _time: '2026-10-11T10:05:00.5Z', _msg: `token=abc123 ${'x'.repeat(runLogLimits.lineLength + 50)}`, pod: pod.pod },
      { _time: '2026-10-11T10:00:01Z', _msg: 'level=INFO msg="minted per-run key" trace=ploeg-f84d713980ea Authorization: Bearer sk-live-secret', pod: pod.pod },
    ]);
  const logs = await readRunLogs(observability, run, { fetch: fake.fetch });
  assert.equal(logs.available, true);
  assert.equal(logs.live, false);
  assert.deepEqual(logs.pods, [pod]);
  assert.deepEqual(logs.lines.map(line => line.at), ['2026-10-11T10:00:01Z', '2026-10-11T10:05:00.5Z', '2026-10-11T10:19:59.000000002Z'], 'oldest first');
  assert.equal(logs.lines[2].text, 'run finished outcome=done', 'terminal escapes are stripped');
  assert.equal(logs.lines.length, 3, 'a line the shipper delivered twice shows once');
  assert.doesNotMatch(logs.lines[0].text, /sk-live-secret/, 'credentials are masked');
  assert.match(logs.lines[1].text, /^token=\[redacted\]/);
  assert.equal(logs.lines[1].text.length, runLogLimits.lineLength + 1, 'a long line is cut');
  assert.equal(logs.lines[0].stream, undefined, 'one pod needs no label');
  assert.equal(logs.cursor, '2026-10-11T10:19:59.000000002Z');
  assert.equal(logs.truncated, false);
  assert.equal(fake.queries.length, 2);
  assert.equal(fake.queries[0].url, `${logsUrl}/select/logsql/query`);
  assert.equal(fake.queries[0].query, '_time:[2026-10-11T09:58:00.000Z, 2026-10-11T10:22:00.000Z] "trace=ploeg-f84d713980ea" | stats by (namespace, pod, container) count() n');
  assert.equal(fake.queries[1].query, `_time:[2026-10-11T09:58:00.000Z, 2026-10-11T10:22:00.000Z] (namespace:="ploeg" pod:="${pod.pod}" container:="worker") | sort by (_time desc) | limit ${runLogLimits.lines + 1} | fields _time, _msg, pod`);
  const panes = JSON.parse(decodeURIComponent(new URL(logs.grafanaUrl!).searchParams.get('panes')!.replace(/\+/g, ' ')));
  assert.equal(panes.v.queries[0].expr, `(namespace:="ploeg" pod:="${pod.pod}" container:="worker")`);
  assert.deepEqual(panes.v.range, { from: String(Date.parse('2026-10-11T09:58:00Z')), to: String(Date.parse('2026-10-11T10:22:00Z')) });
});

test('a retried Run shows each pod, labelled, and pod names the log store returns are never trusted into a query', async () => {
  const fake = victoriaLogs(query => isStats(query)
    ? [{ ...pod, n: '2' }, { namespace: 'ploeg', pod: 'sbx-second-attempt', container: 'worker', n: '1' }, { namespace: 'ploeg', pod: 'bad" or namespace:="ai', container: 'worker', n: '1' }]
    : [{ _time: '2026-10-11T10:10:00Z', _msg: 'second', pod: 'sbx-second-attempt' }, { _time: '2026-10-11T10:01:00Z', _msg: 'first', pod: pod.pod }]);
  const logs = await readRunLogs(observability, run, { fetch: fake.fetch });
  assert.deepEqual(logs.pods.map(entry => entry.pod), [pod.pod, 'sbx-second-attempt'].sort());
  assert.deepEqual(logs.lines.map(line => [line.stream, line.text]), [[pod.pod, 'first'], ['sbx-second-attempt', 'second']]);
  assert.doesNotMatch(fake.queries[1].query, /namespace:="ai/);
});

test('a running Run reads only lines after the cursor and says it is live; a full page says it is truncated', async () => {
  const rows = Array.from({ length: runLogLimits.lines + 1 }, (_, index) => ({ _time: new Date(Date.parse('2026-10-11T10:30:00Z') - index * 1000).toISOString(), _msg: `line ${index}`, pod: pod.pod }));
  const fake = victoriaLogs(query => isStats(query) ? [pod] : rows);
  const running = { ...run, state: 'running' as const, finishedAt: null };
  const logs = await readRunLogs(observability, running, { fetch: fake.fetch, after: '2026-10-11T10:05:00.123456789Z', now: Date.parse('2026-10-11T10:30:00Z') });
  assert.equal(logs.live, true);
  assert.equal(logs.truncated, true);
  assert.equal(logs.lines.length, runLogLimits.lines);
  assert.equal(logs.lines.at(-1)!.text, 'line 0', 'the newest line is last');
  assert.match(fake.queries[1].query, /^_time:\(2026-10-11T10:05:00\.123456789Z, 2026-10-11T10:32:00\.000Z\] \(/);
  await assert.rejects(readRunLogs(observability, running, { fetch: fake.fetch, after: '2026-10-11 10:05" or *' }), (error: RunLogsError) => error.status === 400 && error.code === 'run_logs_cursor');
});

test('without logsUrl the logs say they are not connected and link Grafana Explore to the same search', async () => {
  const fake = victoriaLogs(() => { throw new Error('no query expected'); });
  const logs = await readRunLogs({ grafanaUrl: 'https://grafana.example.invalid/', logsDatasource: 'victorialogs' }, run, { fetch: fake.fetch });
  assert.equal(logs.available, false);
  assert.equal(logs.reason, 'not_connected');
  assert.equal(logs.message, 'Logs are not connected: set observability.logsUrl.');
  assert.ok(logs.grafanaUrl!.startsWith('https://grafana.example.invalid/explore?'));
  assert.match(decodeURIComponent(logs.grafanaUrl!), /"expr":"\\"trace=ploeg-f84d713980ea\\""/);
  const bare = await readRunLogs(undefined, run, { fetch: fake.fetch });
  assert.equal(bare.grafanaUrl, undefined, 'no Grafana link without a logs datasource');
  assert.equal(fake.queries.length, 0);
});

test('the demo has no pod logs and says so, without reading a log store', async () => {
  const fake = victoriaLogs(() => { throw new Error('no query expected'); });
  const logs = await readRunLogs(observability, run, { demo: true, fetch: fake.fetch });
  assert.equal(logs.available, false);
  assert.equal(logs.reason, 'demo');
  assert.equal(logs.demo, true);
  assert.match(logs.message!, /demo/);
  assert.deepEqual(logs.lines, []);
  assert.equal(fake.queries.length, 0);
});

test('an unexpected key alias is refused, a Run without one says why, and an unreachable log store is an error', async () => {
  const fake = victoriaLogs(() => new Response('boom', { status: 500 }));
  await assert.rejects(readRunLogs(observability, { ...run, keyAlias: 'ploeg-x" or "' }, { fetch: fake.fetch }), (error: RunLogsError) => error.status === 422 && error.code === 'run_logs_alias');
  const missing = await readRunLogs(observability, { ...run, keyAlias: null }, { fetch: fake.fetch });
  assert.equal(missing.available, false);
  assert.equal(missing.reason, 'no_alias');
  const pending = await readRunLogs(observability, { ...run, state: 'pending', startedAt: null, finishedAt: null }, { fetch: fake.fetch });
  assert.equal(pending.reason, 'not_started');
  assert.equal(pending.live, true);
  assert.equal(fake.queries.length, 0);
  await assert.rejects(readRunLogs(observability, run, { fetch: fake.fetch }), (error: RunLogsError) => error.status === 503 && error.code === 'run_logs_unavailable');
  const thrown = victoriaLogs(() => { throw new TypeError('fetch failed'); });
  await assert.rejects(readRunLogs(observability, run, { fetch: thrown.fetch }), (error: RunLogsError) => error.code === 'run_logs_unavailable');
});

test('Run logs are read only for a Run of a Work Item the caller may see', async () => {
  const client = new PloegClient(configuration(mkdtempSync(join(tmpdir(), 'unfold-run-logs-')), 'demo'));
  const admin = { id: 'admin', name: 'admin', role: 'admin' as const };
  const detail = ploegDemo.details['104'];
  const own = detail.runs[0];
  const logs = await client.runLogs(admin, '104', own.id);
  assert.equal(logs.reason, 'demo');
  assert.equal(logs.runId, own.id);
  const other = Object.values(ploegDemo.details).flatMap(entry => entry.runs).find(entry => entry.workItemId !== '104')!;
  await assert.rejects(client.runLogs(admin, '104', other.id), (error: PloegError) => error.status === 404);
  await assert.rejects(client.runLogs(admin, '104', '../1'), (error: PloegError) => error.status === 400);
  await assert.rejects(client.runLogs({ id: 'stranger', name: 'stranger', role: 'operator' }, '104', own.id), (error: PloegError) => error.status === 403);
});
