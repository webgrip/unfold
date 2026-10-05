import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { application, login, request } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';
import { defaultTenant } from '../src/insight.ts';

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

test('POST /api/insight/events stores the catalogue\u2019s events and forwards a Faro payload to the collector', async t => {
  const sink = await collector();
  t.after(() => sink.close());
  const app = await application('demo', config => { config.insight = { export: 'faro', url: sink.url, level: 'events' }; });
  t.after(() => app.close());
  const { cookie, user } = await login(app.url);

  const posted = await request(app.url, '/api/insight/events', {
    method: 'POST', cookie,
    body: { events: [
      { name: 'needs_you.command_sent', at: '2026-10-05T10:00:00.000Z', screen: 'needs-you', workItemId: 42, shiftId: 7, props: { command: 'approve', path: 'A', suggested: true, batch_size: 3, secret: 'must not travel' } },
      { name: 'not.in.the.catalogue', at: '2026-10-05T10:00:01.000Z', screen: 'now', props: { anything: 1 } },
    ] },
  });
  assert.equal(posted.status, 202, posted.text);
  assert.equal(posted.body.accepted, 1, 'the unknown name is dropped');

  const rows = app.app.store.db.prepare('SELECT * FROM product_event ORDER BY id').all() as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant_id, defaultTenant);
  assert.equal(rows[0].work_item_id, 42);
  assert.match(String(rows[0].actor), /^[a-z2-7]{16}$/);
  assert.notEqual(rows[0].actor, user.id);
  assert.deepEqual(JSON.parse(String(rows[0].props)), { command: 'approve', path: 'A', suggested: true, batch_size: 3 }, 'an unlisted property never travels');

  const deadline = Date.now() + 5000;
  while (!sink.received().length && Date.now() < deadline) await new Promise(done => setTimeout(done, 20));
  const body = sink.received()[0];
  assert(body, 'the collector received a payload');
  assert.equal(body.events[0].name, 'needs_you.command_sent');
  assert.equal(body.events[0].attributes['tenant.id'], defaultTenant);
  assert.equal(body.events[0].attributes.command, 'approve');
  assert.equal(body.events[0].attributes.secret, undefined, 'the browser cannot smuggle an unlisted property to the collector');
});

test('a batch over 32 KB is refused and a viewer cannot post', async t => {
  const app = await application('demo');
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const huge = await request(app.url, '/api/insight/events', { method: 'POST', cookie, body: { events: Array.from({ length: 60 }, (_, index) => ({ name: 'screen.viewed', at: '2026-10-05T10:00:00.000Z', screen: 'now', props: { pad: 'x'.repeat(1000) }, index })) } });
  assert.equal(huge.status, 413, huge.text);
  assert.equal(huge.body.error.code, 'insight_batch_too_large');

  app.app.store.addUser({ id: 'viewer-iris', name: 'iris@example.test', role: 'viewer', passwordHash: await hashPassword('viewer-password-1414') });
  const viewer = await login(app.url, 'iris@example.test', 'viewer-password-1414');
  const denied = await request(app.url, '/api/insight/events', { method: 'POST', cookie: viewer.cookie, body: { events: [{ name: 'screen.viewed', at: '2026-10-05T10:00:00.000Z', screen: 'now', props: {} }] } });
  assert.equal(denied.status, 403, denied.text);
  assert.equal(denied.body.error.code, 'forbidden');
});
