import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErrorReporter, errorReportLimits, otlpErrorPayload, sentryTarget, stackFrames } from '../src/error-reports.ts';
import { errorReportSettings } from '../src/config.ts';
import { routeShape } from '../src/http.ts';

const dsn = 'https://public123@errors.example.test/7';

function tracker(status = 200) {
  const sent: { url: string; headers: Record<string, string>; lines: any[] }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, lines: String(init.body).trim().split('\n').map(line => JSON.parse(line)) });
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
  return { sent, fetcher };
}

test('a Sentry DSN names its envelope endpoint, also behind a path prefix', () => {
  assert.deepEqual(sentryTarget(dsn), { endpoint: 'https://errors.example.test/api/7/envelope/', key: 'public123', dsn });
  assert.equal(sentryTarget('https://k@bugsink.example.test/errors/12').endpoint, 'https://bugsink.example.test/errors/api/12/envelope/');
  for (const bad of ['not a url', 'https://errors.example.test/7', 'https://k@errors.example.test/project', 'ftp://k@errors.example.test/7']) assert.throws(() => sentryTarget(bad), /UNFOLD_SENTRY_DSN/);
});

test('an error leaves as one envelope with its stack, tags, level, release and environment, and is logged', async () => {
  const net = tracker();
  const lines: string[] = [];
  const reports = new ErrorReporter({ sentryDsn: dsn, environment: 'staging' }, [], { fetch: net.fetcher, log: (line: string) => lines.push(line) });
  reports.capture(new TypeError('boom'), { level: 'warning', tags: { feature: 'ask', ask_failure: 'timeout', empty: '' }, fingerprint: ['ask', 'timeout'], extra: { askId: 'a1' }, user: 'ryan@webgrip.nl' });
  await reports.flush();
  assert.equal(net.sent.length, 1);
  const [head, item, event] = net.sent[0].lines;
  assert.equal(net.sent[0].url, 'https://errors.example.test/api/7/envelope/');
  assert.match(net.sent[0].headers['x-sentry-auth'], /^Sentry sentry_version=7, sentry_key=public123, sentry_client=unfold\//);
  assert.equal(net.sent[0].headers['content-type'], 'application/x-sentry-envelope');
  assert.equal(head.event_id, event.event_id);
  assert.match(event.event_id, /^[0-9a-f]{32}$/);
  assert.deepEqual(item, { type: 'event' });
  assert.deepEqual([event.level, event.environment, event.platform], ['warning', 'staging', 'node']);
  assert.match(event.release, /^unfold@/);
  assert.deepEqual(event.tags, { feature: 'ask', ask_failure: 'timeout' });
  assert.deepEqual(event.fingerprint, ['ask', 'timeout']);
  assert.deepEqual(event.extra, { askId: 'a1' });
  assert.match(event.user.id, /^[0-9a-f]{16}$/, 'the user id is hashed');
  assert.doesNotMatch(JSON.stringify(net.sent[0].lines), /ryan@webgrip\.nl/);
  assert.equal(event.exception.values[0].type, 'TypeError');
  assert.equal(event.exception.values[0].value, 'boom');
  assert.ok(event.exception.values[0].stacktrace.frames.length > 0);
  assert.match(lines[0], /"level":"warn","event":"error.reported","message":"boom","feature":"ask","ask_failure":"timeout"/);
});

test('secrets, credentials and the DSN never leave in a report', async () => {
  const net = tracker();
  const reports = new ErrorReporter({ sentryDsn: dsn, environment: 'live' }, ['ploeg-operator-token'], { fetch: net.fetcher, log: () => {} });
  reports.capture(new Error(`failed with sk-live-123 and ploeg-operator-token at https://user:pass@gw.test and ${dsn}`), { extra: { header: 'Bearer abc.def', nested: { token: 'ploeg-operator-token' } } });
  await reports.flush();
  const text = JSON.stringify(net.sent[0].lines.slice(1));
  for (const secret of ['sk-live-123', 'ploeg-operator-token', 'user:pass', 'abc.def', 'public123']) assert.doesNotMatch(text, new RegExp(secret.replace(/\./g, '\\.')), secret);
});

test('without a DSN a report is only logged, and a failing tracker never throws', async () => {
  const lines: string[] = [];
  const offline = new ErrorReporter(undefined, [], { fetch: (async () => { throw new Error('should not send'); }) as unknown as typeof fetch, log: (line: string) => lines.push(line) });
  offline.capture(new Error('quiet'));
  offline.message('also quiet', { level: 'info' });
  await offline.flush();
  assert.equal(lines.length, 2);
  const down = new ErrorReporter({ sentryDsn: dsn, environment: 'live' }, [], { fetch: (async () => { throw new Error('connection refused'); }) as unknown as typeof fetch, log: (line: string) => lines.push(line) });
  down.capture(new Error('x'));
  await down.flush();
  assert.match(lines.at(-1)!, /"event":"error.report_failed"/);
  const refused = tracker(429);
  const limited = new ErrorReporter({ sentryDsn: dsn, environment: 'live' }, [], { fetch: refused.fetcher, log: (line: string) => lines.push(line) });
  limited.capture(new Error('x'));
  await limited.flush();
  assert.match(lines.at(-1)!, /"event":"error.report_failed","destination":"sentry","message":"HTTP 429"/);
});

test('at most 30 events a minute leave; the rest are still logged', async () => {
  const net = tracker();
  const lines: string[] = [];
  const reports = new ErrorReporter({ sentryDsn: dsn, environment: 'live' }, [], { fetch: net.fetcher, log: (line: string) => lines.push(line) });
  for (let index = 0; index < errorReportLimits.perMinute + 5; index++) reports.capture(new Error(`e${index}`));
  await reports.flush();
  assert.equal(net.sent.length, errorReportLimits.perMinute);
  assert.equal(lines.filter(line => line.includes('error.reported')).length, errorReportLimits.perMinute + 5);
});

test('V8 stacks become Sentry frames, oldest call first, with application frames marked', () => {
  const frames = stackFrames('Error: x\n    at inner (file:///app/src/ask/service.ts:10:5)\n    at async outer (/app/node_modules/x/index.js:3:1)\n    at node:internal/process/task_queues:95:5');
  assert.deepEqual(frames.map(frame => [frame.function, frame.filename, frame.lineno, frame.in_app]), [
    ['<anonymous>', 'node:internal/process/task_queues', 95, false],
    ['async outer', '/app/node_modules/x/index.js', 3, false],
    ['inner', '/app/src/ask/service.ts', 10, true],
  ]);
});

test('destinations and environment come from the environment, and a bad one stops start-up', () => {
  const keys = ['UNFOLD_SENTRY_DSN', 'UNFOLD_ERROR_OTLP_URL', 'UNFOLD_ERROR_ENVIRONMENT'] as const;
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(errorReportSettings('live'), undefined);
    process.env.UNFOLD_SENTRY_DSN = dsn;
    assert.deepEqual(errorReportSettings('live'), { sentryDsn: dsn, environment: 'live' });
    process.env.UNFOLD_ERROR_OTLP_URL = 'http://alloy.observability:4318/v1/logs';
    process.env.UNFOLD_ERROR_ENVIRONMENT = 'staging';
    assert.deepEqual(errorReportSettings('live'), { sentryDsn: dsn, otlpUrl: 'http://alloy.observability:4318/v1/logs', environment: 'staging' });
    delete process.env.UNFOLD_SENTRY_DSN;
    assert.deepEqual(errorReportSettings('live'), { otlpUrl: 'http://alloy.observability:4318/v1/logs', environment: 'staging' }, 'OpenTelemetry alone is enough');
    process.env.UNFOLD_ERROR_ENVIRONMENT = 'not ok!';
    assert.throws(() => errorReportSettings('live'), /UNFOLD_ERROR_ENVIRONMENT/);
    process.env.UNFOLD_ERROR_ENVIRONMENT = 'live';
    process.env.UNFOLD_SENTRY_DSN = 'https://errors.example.test/7';
    assert.throws(() => errorReportSettings('live'), /UNFOLD_SENTRY_DSN/);
  } finally {
    for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

test('an OpenTelemetry collector gets one log record with the exception attributes and the tags under unfold.', async () => {
  const sent: { url: string; body: any }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => { sent.push({ url, body: JSON.parse(String(init.body)) }); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
  const reports = new ErrorReporter({ otlpUrl: 'http://alloy.test:4318/v1/logs', environment: 'staging' }, ['ploeg-operator-token'], { fetch: fetcher, log: () => {} });
  assert.deepEqual(reports.destinations, ['otlp']);
  reports.capture(new RangeError('bad ploeg-operator-token'), { level: 'warning', tags: { feature: 'ask', ask_failure: 'cut_off' }, fingerprint: ['ask', 'cut_off'], user: 'ryan@webgrip.nl', extra: { askId: 'a1' } });
  await reports.flush();
  assert.equal(sent[0].url, 'http://alloy.test:4318/v1/logs');
  const [resourceLogs] = sent[0].body.resourceLogs;
  const resource = Object.fromEntries(resourceLogs.resource.attributes.map((entry: any) => [entry.key, entry.value.stringValue]));
  assert.equal(resource['service.name'], 'unfold');
  assert.equal(resource['deployment.environment'], 'staging');
  const record = resourceLogs.scopeLogs[0].logRecords[0];
  const attributes = Object.fromEntries(record.attributes.map((entry: any) => [entry.key, entry.value.stringValue]));
  assert.deepEqual([record.severityNumber, record.severityText, record.body.stringValue], [13, 'WARNING', 'bad [redacted]']);
  assert.equal(attributes['exception.type'], 'RangeError');
  assert.equal(attributes['exception.message'], 'bad [redacted]');
  assert.match(attributes['exception.stacktrace'], /^RangeError: bad \[redacted\]\n\s+at /);
  assert.deepEqual([attributes['unfold.feature'], attributes['unfold.ask_failure'], attributes['unfold.fingerprint'], attributes['unfold.extra']], ['ask', 'cut_off', 'ask cut_off', '{"askId":"a1"}']);
  assert.match(attributes['unfold.user_hash'], /^[0-9a-f]{16}$/);
  assert.doesNotMatch(JSON.stringify(sent[0].body), /ryan@webgrip|ploeg-operator-token/);
  assert.match(record.timeUnixNano, /^\d{19}$/);
});

test('both destinations can be on at once, and one failing does not stop the other', async () => {
  const urls: string[] = [];
  const fetcher = (async (url: string) => { urls.push(url); if (url.includes('envelope')) throw new Error('connection refused'); return new Response('{}'); }) as unknown as typeof fetch;
  const lines: string[] = [];
  const reports = new ErrorReporter({ sentryDsn: dsn, otlpUrl: 'http://alloy.test:4318/v1/logs', environment: 'live' }, [], { fetch: fetcher, log: (line: string) => lines.push(line) });
  assert.deepEqual(reports.destinations, ['sentry', 'otlp']);
  reports.message('a note', { level: 'info' });
  await reports.flush();
  assert.deepEqual(urls.sort(), ['http://alloy.test:4318/v1/logs', 'https://errors.example.test/api/7/envelope/']);
  assert.match(lines.at(-1)!, /"destination":"sentry"/);
  const message = otlpErrorPayload({ id: 'x', at: 0, level: 'info', kind: 'message', type: 'message', message: 'hi', stack: '', frames: [], tags: {}, release: 'unfold@1', environment: 'live', host: 'h' }) as any;
  assert.equal(message.resourceLogs[0].scopeLogs[0].logRecords[0].attributes.some((entry: any) => entry.key.startsWith('exception.')), false, 'a message carries no exception attributes');
});

test('server errors group by route, not by id', () => {
  assert.equal(routeShape('/api/ploeg/work-items/185/asks'), '/api/ploeg/work-items/:id/asks');
  assert.equal(routeShape('/api/sessions/0b5c1f2e-8d3a-4f7e-9c1b-2a3d4e5f6a7b/events'), '/api/sessions/:id/events');
  assert.equal(routeShape('/api/status'), '/api/status');
});
