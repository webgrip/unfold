import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig, User } from '../src/types.ts';
import { Store } from '../src/store.ts';
import { InsightService, defaultTenant, faroPayload, otlpPayload, parseInsightEvents } from '../src/insight.ts';

const admin: User = { id: 'user-1', name: 'Admin', role: 'admin' };
const now = () => new Date('2026-10-05T12:00:00.000Z');

async function collector(): Promise<{ url: string; received: () => Record<string, any>[]; close: () => Promise<void> }> {
  const bodies: Record<string, any>[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      try { bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { bodies.push({}); }
      res.writeHead(202, { 'content-type': 'application/json' });
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
    close: () => new Promise<void>((done) => { server.close(() => done()); server.closeIdleConnections(); }),
  };
}

function config(insight: AppConfig['insight']): AppConfig {
  return { mode: 'demo', insight } as AppConfig;
}

async function withStore(t: test.TestContext): Promise<Store> {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-insight-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new Store(join(directory, 'insight.sqlite'));
}

test('the catalogue keeps every RFC-0001 name and refuses properties its entry does not list', () => {
  const events = parseInsightEvents([
    { name: 'ui.rage_click', at: '2026-10-05T10:00:00.000Z', screen: 'work', props: { element: 'needs-you.row.primary', screen: 'wrong', text: 'secret' } },
    { name: 'ui.u_turn', at: '2026-10-05T10:00:00.000Z', screen: 'work', props: { screen: 'wrong' } },
    { name: 'needs_you.verdict_shown', at: '2026-10-05T10:00:00.000Z', screen: 'needs-you', props: { verdict: 'approve', path: 'B', group_size: 7, extra: 'x' } },
    { name: 'not.in.the.catalogue', at: '2026-10-05T10:00:00.000Z', screen: 'now', props: { anything: 1 } },
  ], '2026-10-05T12:00:00.000Z');
  assert.deepEqual(events.map(event => event.name), ['ui.rage_click', 'ui.u_turn', 'needs_you.verdict_shown']);
  assert.deepEqual(events[0].props, { element: 'needs-you.row.primary' });
  assert.deepEqual(events[1].props, {});
  assert.deepEqual(events[2].props, { verdict: 'approve', path: 'B', group_size: 7 });
  assert.equal(parseInsightEvents('not an array', '2026-10-05T12:00:00.000Z').length, 0);
  const long = parseInsightEvents([{ name: 'link_out.opened', at: '2026-10-05T10:00:00.000Z', screen: 'now', props: { target: 'x'.repeat(200) } }], '2026-10-05T12:00:00.000Z');
  assert.deepEqual(long[0].props, {}, 'an over-long value is dropped');
  const payload = faroPayload([{ tenantId: 'default', actor: 'abcd', session: 's', name: 'screen.viewed', screen: 'now', props: {}, at: '2026-10-05T10:00:00.000Z' }], '0.0.0', 'demo');
  assert.equal((payload.events as unknown[]).length, 1);
  const logs = otlpPayload([{ tenantId: 'default', actor: '', session: '', name: 'screen.viewed', screen: 'now', props: {}, at: '2026-10-05T10:00:00.000Z' }], '0.0.0', 'demo');
  assert.equal((logs.resourceLogs as unknown[]).length, 1);
});

test('the service stores a checked batch with a pseudonymous actor and never keeps an unlisted property', async t => {
  const store = await withStore(t);
  const service = new InsightService(store, config({ export: 'off', level: 'aggregate' }), '9.9.9', now);
  const events = parseInsightEvents([
    { name: 'needs_you.command_sent', at: '2026-10-05T10:00:00.000Z', screen: 'needs-you', workItemId: 42, shiftId: 7, props: { command: 'approve', path: 'A', suggested: true, batch_size: 3, secret: 'must not travel' } },
    { name: 'screen.viewed', at: 'not-a-date', screen: 'now', props: {} },
  ], now().toISOString());
  assert.equal(service.ingest(events, admin), 2);

  const rows = store.db.prepare('SELECT * FROM product_event ORDER BY id').all() as Record<string, unknown>[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tenant_id, defaultTenant);
  assert.equal(rows[0].name, 'needs_you.command_sent');
  assert.equal(rows[0].work_item_id, 42);
  assert.equal(rows[0].shift_id, 7);
  assert.match(String(rows[0].actor), /^[a-z2-7]{16}$/, 'the actor is a 16-character base32 hash, not the user id');
  assert.notEqual(rows[0].actor, admin.id);
  assert.deepEqual(JSON.parse(String(rows[0].props)), { command: 'approve', path: 'A', suggested: true, batch_size: 3 }, 'an unlisted property never reaches the row');
  assert.equal(rows[1].screen, 'now');
  assert.equal(String(rows[1].at), now().toISOString(), 'an unparseable time falls back to now');
  service.stop();
  store.close();
});

test('maintain folds the daily rollup, keeps actor counts and prunes events past retention', async t => {
  const store = await withStore(t);
  const service = new InsightService(store, config({ export: 'off', level: 'aggregate' }), '9.9.9', now);
  service.ingest(parseInsightEvents([
    { name: 'screen.viewed', at: '2026-10-05T10:00:00.000Z', screen: 'now', props: {} },
    { name: 'screen.viewed', at: '2026-10-05T11:00:00.000Z', screen: 'now', props: {} },
  ], now().toISOString()), admin);
  store.recordProductEvent({ tenantId: defaultTenant, actor: 'stale', session: 's', name: 'screen.viewed', screen: 'now', props: {}, at: '2000-01-01T00:00:00.000Z' });
  await service.maintain();
  const rollup = store.productEventDaily();
  assert.equal(rollup.length, 1);
  assert.equal(rollup[0].count, 2, 'the stale row was pruned before the fold');
  assert.equal(rollup[0].actors, 1);
  assert.equal(rollup[0].screen, 'now');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM product_event').get()!['n'], 2);
  service.stop();
  store.close();
});

test('an events sink forwards a Faro payload to the collector the operator named', async t => {
  const sink = await collector();
  t.after(() => sink.close());
  const store = await withStore(t);
  const service = new InsightService(store, config({ export: 'faro', url: sink.url, level: 'events' }), '9.9.9', now);
  service.ingest(parseInsightEvents([
    { name: 'needs_you.command_sent', at: '2026-10-05T10:00:00.000Z', screen: 'needs-you', workItemId: 42, props: { command: 'approve' } },
  ], now().toISOString()), admin);
  const deadline = Date.now() + 5000;
  while (!sink.received().length && Date.now() < deadline) await new Promise(done => setTimeout(done, 20));
  const body = sink.received()[0];
  assert(body, 'the collector received a payload');
  assert.equal(body.meta.sdk.name, 'unfold');
  assert.equal(body.meta.app.name, 'unfold');
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].name, 'needs_you.command_sent');
  assert.equal(body.events[0].timestamp, '2026-10-05T10:00:00.000Z');
  assert.equal(body.events[0].attributes['event.name'], 'needs_you.command_sent');
  assert.equal(body.events[0].attributes['tenant.id'], defaultTenant);
  assert.equal(body.events[0].attributes['work_item.id'], 42);
  assert.equal(body.events[0].attributes.command, 'approve');
  assert.match(String(body.events[0].attributes.actor), /^[a-z2-7]{16}$/);
  service.stop();
  store.close();
});

test('an aggregate sink sends the daily rollup as OTLP logs', async t => {
  const sink = await collector();
  t.after(() => sink.close());
  const store = await withStore(t);
  const service = new InsightService(store, config({ export: 'otlp', url: sink.url, level: 'aggregate' }), '9.9.9', now);
  service.ingest(parseInsightEvents([
    { name: 'screen.viewed', at: '2026-10-05T10:00:00.000Z', screen: 'now', props: {} },
    { name: 'screen.viewed', at: '2026-10-05T11:00:00.000Z', screen: 'now', props: {} },
  ], now().toISOString()), admin);
  await service.maintain();
  const body = sink.received()[0];
  assert(body, 'the collector received a payload');
  const records = body.resourceLogs[0].scopeLogs[0].logRecords as Record<string, any>[];
  assert.equal(records.length, 1);
  const attributes = Object.fromEntries(records[0].attributes.map((item: { key: string; value: Record<string, unknown> }) => [item.key, item.value]));
  assert.equal(records[0].body.stringValue, 'screen.viewed');
  assert.equal(attributes.count.intValue, 2);
  assert.equal(attributes.actors.intValue, 1);
  assert.equal(attributes.actor, undefined, 'an aggregate never carries an actor hash');
  service.stop();
  store.close();
});

test('an unreachable collector is logged at most once an hour and never blocks ingest', async t => {
  const store = await withStore(t);
  const service = new InsightService(store, config({ export: 'faro', url: 'http://127.0.0.1:1/collect', level: 'events' }), '9.9.9', now);
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
  t.after(() => { console.error = original; });
  const started = Date.now();
  service.ingest(parseInsightEvents([{ name: 'screen.viewed', at: '2026-10-05T10:00:00.000Z', screen: 'now', props: {} }], now().toISOString()), admin);
  service.ingest(parseInsightEvents([{ name: 'screen.viewed', at: '2026-10-05T10:00:01.000Z', screen: 'now', props: {} }], now().toISOString()), admin);
  assert(Date.now() - started < 1000, 'ingest does not wait on the collector');
  await new Promise(done => setTimeout(done, 400));
  assert.equal(errors.filter(line => line.includes('insight.export_failed')).length, 1, 'the failure is logged once, not once per event');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM product_event').get()!['n'], 2, 'the events are still stored');
  service.stop();
  store.close();
});
