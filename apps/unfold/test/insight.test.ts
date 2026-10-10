import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig, User } from '../src/types.ts';
import { Store } from '../src/store.ts';
import { InsightService, dailyDomain, defaultTenant, eventDomain, faroPayload, maxEventsPerMinute, otlpPayload, parseInsightEvents, type ExportedRow } from '../src/insight.ts';

const admin: User = { id: 'user-1', name: 'Admin', role: 'admin' };
const now = () => new Date('2026-10-05T12:00:00.000Z');

async function collector(status = 202): Promise<{ url: string; received: () => Record<string, any>[]; setStatus: (next: number) => void; close: () => Promise<void> }> {
  const bodies: Record<string, any>[] = [];
  let answer = status;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      try { bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { bodies.push({}); }
      res.writeHead(answer, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}/collect`,
    received: () => bodies,
    setStatus: next => { answer = next; },
    close: () => new Promise<void>((done) => { server.close(() => done()); server.closeIdleConnections(); }),
  };
}

function config(insight: AppConfig['insight']): AppConfig {
  return { mode: 'demo', insight } as AppConfig;
}

async function withStore(t: test.TestContext): Promise<Store> {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-insight-'));
  const store = new Store(join(directory, 'insight.sqlite'));
  t.after(async () => { try { store.close(); } catch {} await rm(directory, { recursive: true, force: true }); });
  return store;
}

function service(t: test.TestContext, store: Store, insight: AppConfig['insight'], clock: () => Date = now): InsightService {
  const created = new InsightService(store, config(insight), '9.9.9', clock, { schedule: false });
  t.after(() => created.stop());
  return created;
}

async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition() && Date.now() < deadline) await new Promise(done => setTimeout(done, 20));
}

const eventRow: ExportedRow = { kind: 'event', tenantId: 'default', actor: 'abcdefghijklmnop', session: 's', name: 'needs_you.command_sent', screen: 'needs-you', workItemId: 42, props: { command: 'approve', suggested: true, batch_size: 3, seconds_after: 4.5 }, at: '2026-10-05T10:00:00.000Z' };
const dailyRow: ExportedRow = { kind: 'daily', tenantId: 'default', day: '2026-10-04', name: 'screen.viewed', screen: 'now', count: 12, actors: 6 };

test('the catalogue keeps every RFC-0001 name and refuses properties its entry does not list', () => {
  const events = parseInsightEvents([
    { name: 'ui.rage_click', at: '2026-10-05T11:30:00.000Z', screen: 'work', props: { element: 'needs-you.row.primary', screen: 'wrong', text: 'secret' } },
    { name: 'ui.u_turn', at: '2026-10-05T11:30:00.000Z', screen: 'work', props: { screen: 'wrong' } },
    { name: 'needs_you.verdict_shown', at: '2026-10-05T11:30:00.000Z', screen: 'needs-you', props: { verdict: 'approve', path: 'B', group_size: 7, extra: 'x' } },
    { name: 'not.in.the.catalogue', at: '2026-10-05T11:30:00.000Z', screen: 'now', props: { anything: 1 } },
    { name: 'constructor', screen: 'now' },
    { name: '__proto__', screen: 'now' },
  ], now().toISOString());
  assert.deepEqual(events.map(event => event.name), ['ui.rage_click', 'ui.u_turn', 'needs_you.verdict_shown'], 'an inherited object key is not a catalogue entry');
  assert.deepEqual(events[0].props, { element: 'needs-you.row.primary' });
  assert.deepEqual(events[1].props, {});
  assert.deepEqual(events[2].props, { verdict: 'approve', path: 'B', group_size: 7 });
  assert.equal(parseInsightEvents('not an array', now().toISOString()).length, 0);
  const long = parseInsightEvents([{ name: 'link_out.opened', screen: 'now', props: { target: 'x'.repeat(200) } }], now().toISOString());
  assert.deepEqual(long[0].props, {}, 'an over-long value is dropped');
});

test('Work Item and Shift ids arrive as integers or digit strings and are stored as integers', () => {
  const [numeric, text, refused] = parseInsightEvents([
    { name: 'screen.viewed', screen: 'work', workItemId: 124, shiftId: 7 },
    { name: 'screen.viewed', screen: 'work', workItemId: '124', shiftId: '7' },
    { name: 'screen.viewed', screen: 'work', workItemId: 'VIK-124', shiftId: -1 },
  ], now().toISOString());
  assert.deepEqual([numeric.workItemId, numeric.shiftId], [124, 7]);
  assert.deepEqual([text.workItemId, text.shiftId], [124, 7]);
  assert.deepEqual([refused.workItemId, refused.shiftId], [undefined, undefined]);
});

test('an event time is clamped into the hour before arrival, so a finished day stops changing', () => {
  const [future, stale, recent, missing] = parseInsightEvents([
    { name: 'screen.viewed', at: '2026-10-06T00:00:00.000Z' },
    { name: 'screen.viewed', at: '2026-09-01T00:00:00.000Z' },
    { name: 'screen.viewed', at: '2026-10-05T11:45:00.000Z' },
    { name: 'screen.viewed', at: 'not-a-date' },
  ], now().toISOString());
  assert.equal(future.at, '2026-10-05T12:00:00.000Z', 'a clock ahead of the server is brought back to arrival');
  assert.equal(stale.at, '2026-10-05T11:00:00.000Z', 'an event older than an hour is brought forward');
  assert.equal(recent.at, '2026-10-05T11:45:00.000Z');
  assert.equal(missing.at, '2026-10-05T12:00:00.000Z', 'an unparseable time falls back to arrival');
});

test('a Faro payload carries only string attributes, which is all Alloy faro.receiver accepts', () => {
  const payload = faroPayload([eventRow, dailyRow], '9.9.9', 'live') as { meta: Record<string, any>; events: Record<string, any>[] };
  assert.deepEqual(payload.meta.app, { name: 'unfold', version: '9.9.9', environment: 'live' });
  const [event, daily] = payload.events;
  for (const sent of payload.events) for (const [key, value] of Object.entries(sent.attributes)) assert.equal(typeof value, 'string', `${sent.name} attribute ${key}`);
  assert.equal(event.domain, eventDomain);
  assert.equal(event.timestamp, eventRow.kind === 'event' ? eventRow.at : '');
  assert.deepEqual(event.attributes, { 'event.name': 'needs_you.command_sent', screen: 'needs-you', 'tenant.id': 'default', 'session.id': 's', 'work_item.id': '42', actor: 'abcdefghijklmnop', at_ms: String(Date.parse('2026-10-05T10:00:00.000Z')), command: 'approve', suggested: 'true', batch_size: '3', seconds_after: '4.5' });
  assert.equal(daily.domain, dailyDomain);
  assert.equal(daily.timestamp, '2026-10-04T00:00:00.000Z');
  assert.deepEqual(daily.attributes, { 'event.name': 'screen.viewed', screen: 'now', 'tenant.id': 'default', day: '2026-10-04', count: '12', actors: '6' }, 'a rollup row never carries an actor hash');
});

test('an OTLP payload types integers, decimals and booleans the way OTLP/JSON requires', () => {
  const payload = otlpPayload([eventRow], '9.9.9', 'live') as { resourceLogs: { scopeLogs: { logRecords: Record<string, any>[] }[] }[] };
  const [record] = payload.resourceLogs[0].scopeLogs[0].logRecords;
  const attributes = Object.fromEntries(record.attributes.map((item: { key: string; value: unknown }) => [item.key, item.value]));
  assert.equal(record.timeUnixNano, `${Date.parse('2026-10-05T10:00:00.000Z')}000000`);
  assert.deepEqual(attributes['event.domain'], { stringValue: eventDomain });
  assert.deepEqual(attributes['work_item.id'], { intValue: '42' });
  assert.deepEqual(attributes.batch_size, { intValue: '3' });
  assert.deepEqual(attributes.seconds_after, { doubleValue: 4.5 }, 'a decimal is never sent as intValue, which collectors refuse');
  assert.deepEqual(attributes.suggested, { boolValue: true });
});

test('the service stores a checked batch with a pseudonymous actor and never keeps an unlisted property', async t => {
  const store = await withStore(t);
  const insight = service(t, store, { export: 'off', level: 'aggregate' });
  const events = parseInsightEvents([
    { name: 'needs_you.command_sent', at: '2026-10-05T11:50:00.000Z', screen: 'needs-you', workItemId: 42, shiftId: 7, props: { command: 'approve', path: 'A', suggested: true, batch_size: 3, secret: 'must not travel' } },
    { name: 'screen.viewed', at: 'not-a-date', screen: 'now', props: {} },
  ], now().toISOString());
  assert.equal(insight.ingest(events, admin), 2);

  const rows = store.db.prepare('SELECT * FROM product_event ORDER BY id').all() as Record<string, unknown>[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tenant_id, defaultTenant);
  assert.equal(rows[0].work_item_id, 42);
  assert.equal(rows[0].shift_id, 7);
  assert.match(String(rows[0].actor), /^[a-z2-7]{16}$/, 'the actor is a 16-character base32 hash, not the user id');
  assert.notEqual(rows[0].actor, admin.id);
  assert.equal(rows[0].actor, rows[1].actor, 'one person has one actor id under one key');
  assert.deepEqual(JSON.parse(String(rows[0].props)), { command: 'approve', path: 'A', suggested: true, batch_size: 3 }, 'an unlisted property never reaches the row');
});

test('the actor key is replaced after 13 months, so old and new actor ids cannot be linked', async t => {
  const store = await withStore(t);
  let clock = new Date('2026-10-05T12:00:00.000Z');
  const insight = service(t, store, { export: 'off', level: 'aggregate' }, () => clock);
  const actor = () => String((store.db.prepare('SELECT actor FROM product_event ORDER BY id DESC LIMIT 1').get() as { actor: string }).actor);
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed' }], clock.toISOString()), admin);
  const first = actor();
  clock = new Date('2027-11-04T12:00:00.000Z');
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed' }], clock.toISOString()), admin);
  assert.equal(actor(), first, 'the key holds for 13 months');
  clock = new Date('2027-11-05T12:00:00.000Z');
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed' }], clock.toISOString()), admin);
  assert.notEqual(actor(), first, 'a 13-month-old key is rotated');
  const restarted = service(t, store, { export: 'off', level: 'aggregate' }, () => clock);
  restarted.ingest(parseInsightEvents([{ name: 'screen.viewed' }], clock.toISOString()), admin);
  assert.notEqual(actor(), first, 'a restart keeps the rotated key');
});

test('one person may post at most the per-minute event rate', async t => {
  const store = await withStore(t);
  const insight = service(t, store, { export: 'off', level: 'aggregate' });
  const batch = parseInsightEvents(Array.from({ length: 50 }, () => ({ name: 'screen.viewed' })), now().toISOString());
  for (let posted = 0; posted + batch.length <= maxEventsPerMinute; posted += batch.length) insight.ingest(batch, admin);
  assert.throws(() => insight.ingest(batch, admin), (error: Error & { status?: number; code?: string }) => error.status === 429 && error.code === 'rate_limited');
  assert.equal(insight.ingest(batch, { ...admin, id: 'user-2' }), 50, 'another person has their own allowance');
});

test('maintain folds the daily rollup, keeps actor counts and prunes events past retention', async t => {
  const store = await withStore(t);
  const insight = service(t, store, { export: 'off', level: 'aggregate' });
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed', at: '2026-10-05T11:10:00.000Z', screen: 'now' }, { name: 'screen.viewed', at: '2026-10-05T11:20:00.000Z', screen: 'now' }], now().toISOString()), admin);
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed', at: '2026-10-05T11:30:00.000Z', screen: 'now' }], now().toISOString()), { ...admin, id: 'user-2' });
  store.recordProductEvents([{ tenantId: defaultTenant, actor: 'stale', session: 's', name: 'screen.viewed', screen: 'now', props: {}, at: '2024-09-01T00:00:00.000Z' }]);
  await insight.maintain();
  const rollup = store.productEventDaily();
  assert.deepEqual(rollup, [{ tenantId: defaultTenant, day: '2026-10-05', name: 'screen.viewed', screen: 'now', count: 3, actors: 2 }], 'the 25-month-old row was pruned before the fold');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM product_event').get()!['n'], 3);
});

test('an aggregate sink sends each finished day once, and retries a day the collector refused', async t => {
  const sink = await collector(503);
  t.after(() => sink.close());
  const store = await withStore(t);
  let clock = new Date('2026-10-05T12:00:00.000Z');
  const insight = service(t, store, { export: 'otlp', url: sink.url, level: 'aggregate' }, () => clock);
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed', screen: 'now' }, { name: 'screen.viewed', screen: 'now' }], clock.toISOString()), admin);

  await insight.maintain();
  assert.equal(sink.received().length, 0, 'today is still open, so nothing is sent');

  clock = new Date('2026-10-06T00:30:00.000Z');
  await insight.maintain();
  assert.equal(sink.received().length, 0, 'within an hour of midnight a late event can still land on yesterday');

  clock = new Date('2026-10-06T01:30:00.000Z');
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
  t.after(() => { console.error = original; });
  await insight.maintain();
  assert.equal(sink.received().length, 1, 'the finished day was offered');
  assert(errors.some(line => line.includes('insight.export_failed')), 'the refusal was logged');

  sink.setStatus(202);
  clock = new Date('2026-10-06T02:30:00.000Z');
  await insight.maintain();
  assert.equal(sink.received().length, 2, 'the refused day is retried on the next run');
  const records = sink.received()[1].resourceLogs[0].scopeLogs[0].logRecords as Record<string, any>[];
  const attributes = Object.fromEntries(records[0].attributes.map((item: { key: string; value: Record<string, unknown> }) => [item.key, item.value]));
  assert.equal(records.length, 1);
  assert.deepEqual(attributes['event.domain'], { stringValue: dailyDomain });
  assert.deepEqual(attributes.count, { intValue: '2' });
  assert.deepEqual(attributes.actors, { intValue: '1' });
  assert.equal(attributes.actor, undefined, 'an aggregate never carries an actor hash');

  clock = new Date('2026-10-06T03:30:00.000Z');
  await insight.maintain();
  assert.equal(sink.received().length, 2, 'an accepted day is never sent again');
});

test('an events sink forwards each batch to the collector as a Faro payload', async t => {
  const sink = await collector();
  t.after(() => sink.close());
  const store = await withStore(t);
  const insight = service(t, store, { export: 'faro', url: sink.url, level: 'events' });
  insight.ingest(parseInsightEvents([{ name: 'needs_you.command_sent', at: '2026-10-05T11:59:00.000Z', screen: 'needs-you', workItemId: 42, props: { command: 'approve' } }], now().toISOString()), admin);
  await until(() => sink.received().length > 0);
  const body = sink.received()[0];
  assert(body, 'the collector received a payload');
  assert.equal(body.meta.app.name, 'unfold');
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].name, 'needs_you.command_sent');
  assert.equal(body.events[0].domain, eventDomain);
  assert.equal(body.events[0].timestamp, '2026-10-05T11:59:00.000Z');
  assert.equal(body.events[0].attributes['tenant.id'], defaultTenant);
  assert.equal(body.events[0].attributes['work_item.id'], '42');
  assert.equal(body.events[0].attributes.command, 'approve');
  assert.match(String(body.events[0].attributes.actor), /^[a-z2-7]{16}$/);
});

test('an unreachable collector is logged at most once an hour and never blocks ingest', async t => {
  const store = await withStore(t);
  const insight = service(t, store, { export: 'faro', url: 'http://127.0.0.1:1/collect', level: 'events' });
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
  t.after(() => { console.error = original; });
  const started = Date.now();
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed', screen: 'now' }], now().toISOString()), admin);
  insight.ingest(parseInsightEvents([{ name: 'screen.viewed', screen: 'now' }], now().toISOString()), admin);
  assert(Date.now() - started < 1000, 'ingest does not wait on the collector');
  await until(() => errors.length > 0);
  await new Promise(done => setTimeout(done, 200));
  assert.equal(errors.filter(line => line.includes('insight.export_failed')).length, 1, 'the failure is logged once, not once per batch');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM product_event').get()!['n'], 2, 'the events are still stored');
});

test('an actor key stored in the rc.49 string form is replaced by a fresh key instead of hashing with undefined', async t => {
  const store = await withStore(t);
  store.setSecret('insight:actorKey', 'legacy-install-wide-key');
  const insight = service(t, store, { export: 'off', level: 'aggregate' });
  const events = parseInsightEvents([{ name: 'screen.viewed', at: '2026-10-05T11:50:00.000Z', screen: 'now', props: {} }], now().toISOString());
  assert.equal(insight.ingest(events, admin), 1);
  const stored = store.getSecret<{ key: string; createdAt: string }>('insight:actorKey');
  assert.equal(typeof stored?.key, 'string');
  assert.notEqual(stored?.key, 'legacy-install-wide-key');
  assert.equal(stored?.createdAt, now().toISOString());
});

test('three links out before a command on the same Work Item record one server-side link-out burst', async t => {
  const sink = await collector();
  t.after(() => sink.close());
  const store = await withStore(t);
  const insight = service(t, store, { export: 'faro', url: sink.url, level: 'events' });
  const at = (minute: number) => `2026-10-05T11:${String(minute).padStart(2, '0')}:00.000Z`;
  insight.ingest(parseInsightEvents([
    { name: 'link_out.opened', at: at(10), screen: 'work', workItemId: 42, props: { target: 'pr' } },
    { name: 'link_out.opened', at: at(11), screen: 'work', workItemId: 42, props: { target: 'tracker' } },
    { name: 'link_out.opened', at: at(12), screen: 'work', workItemId: 99, props: { target: 'pr' } },
    { name: 'link_out.opened', at: at(13), screen: 'work', workItemId: 42, props: { target: 'forge' } },
    { name: 'needs_you.command_sent', at: at(14), screen: 'work', workItemId: 42, props: { command: 'retry' } },
  ], now().toISOString()), admin);
  const bursts = () => store.db.prepare("SELECT work_item_id, props, at FROM product_event WHERE name='ui.link_out_burst' ORDER BY id").all() as Record<string, unknown>[];
  assert.deepEqual(bursts().map(row => ({ ...row })), [{ work_item_id: 42, props: '{"count":3}', at: at(14) }], 'the link-out on another item is not counted');

  insight.ingest(parseInsightEvents([
    { name: 'link_out.opened', at: at(20), screen: 'work', workItemId: 42, props: { target: 'pr' } },
    { name: 'link_out.opened', at: at(21), screen: 'work', workItemId: 42, props: { target: 'pr' } },
    { name: 'needs_you.command_sent', at: at(22), screen: 'work', workItemId: 42, props: { command: 'retry' } },
  ], now().toISOString()), admin);
  assert.equal(bursts().length, 1, 'only link-outs since the previous command count, and two are not a burst');

  insight.ingest(parseInsightEvents([
    { name: 'link_out.opened', at: at(30), screen: 'work', workItemId: 42, props: { target: 'pr' } },
    { name: 'link_out.opened', at: at(31), screen: 'work', workItemId: 42, props: { target: 'pr' } },
    { name: 'link_out.opened', at: at(32), screen: 'work', workItemId: 42, props: { target: 'pr' } },
    { name: 'needs_you.command_sent', at: at(33), screen: 'work', workItemId: 42, props: { command: 'retry' } },
  ], now().toISOString()), { ...admin, id: 'user-2' });
  assert.equal(bursts().length, 2, 'another person has their own count');
  await until(() => sink.received().some(body => body.events.some((event: { name: string }) => event.name === 'ui.link_out_burst')));
  const exported = sink.received().flatMap(body => body.events).find((event: { name: string }) => event.name === 'ui.link_out_burst');
  assert.equal(exported.attributes.count, '3', 'the burst is exported like any other event');
});

test('a browser cannot post an event only the server records', async t => {
  const events = parseInsightEvents([
    { name: 'ui.link_out_burst', props: { count: 99 } },
    { name: 'work_item.back_in_needs_you', workItemId: 1, props: { days_after: 1 } },
    { name: 'ui.rage_click', screen: 'now', props: { element: 'unnamed' } },
  ], now().toISOString());
  assert.deepEqual(events.map(event => event.name), ['ui.rage_click']);
});
