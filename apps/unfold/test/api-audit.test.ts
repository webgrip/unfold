import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { application, login, request } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';
import { verifyExported } from '../src/audit/export.ts';
import type { AppConfig } from '../src/types.ts';
import { ocsfErrors } from './ocsf-schema.ts';

const exportOn = (config: AppConfig) => { config.flags = { document: { flags: { 'audit.export': { defaultVariant: 'on' } } }, unknown: [] }; };

async function lines(url: string, path: string, cookie: string) {
  const result = await request(url, path, { cookie });
  assert.equal(result.status, 200, result.text);
  assert.match(result.response.headers.get('content-type') ?? '', /application\/x-ndjson/);
  return { result, events: result.text.split('\n').filter(Boolean).map(line => JSON.parse(line)) };
}

function signIn(app: Awaited<ReturnType<typeof application>>, id: string, memberships: any[]) {
  app.app.store.upsertUser({ id, name: `${id}@example.test`, role: 'admin', passwordHash: '', memberships });
  const token = randomBytes(32).toString('base64url');
  app.app.store.createLogin(createHash('sha256').update(token).digest('hex'), id, new Date(Date.now() + 3_600_000).toISOString());
  return `unfold=${token}`;
}

test('sign-ins, sign-outs, flag changes and Actions reach the audit as OCSF, read back as paged NDJSON that verifies', async t => {
  const app = await application('live', exportOn);
  t.after(() => app.close());
  assert.equal((await request(app.url, '/api/login', { method: 'POST', body: { name: 'admin', password: 'wrong-password-123456' } })).status, 401);
  const admin = await login(app.url);
  assert.equal((await request(app.url, '/api/admin/flags/work.live-view/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'on', reason: 'Try it on homelab' } })).status, 200);
  assert.equal((await request(app.url, '/api/flags/work.live-view/choice', { method: 'PUT', cookie: admin.cookie, body: { choice: 'off' } })).status, 200);
  const second = await login(app.url);
  assert.equal((await request(app.url, '/api/logout', { method: 'POST', cookie: second.cookie })).status, 200);

  const all = await lines(app.url, '/api/admin/audit', admin.cookie);
  assert.equal(all.result.response.headers.get('x-unfold-audit-tenant'), 'default');
  const kinds = all.events.map(event => `${event.class_uid}:${event.activity_id}:${event.status_id}`);
  assert.deepEqual(kinds, ['3001:1:1', '3006:3:1', '3002:1:2', '3002:1:1', '3004:3:1', '6003:3:1', '3002:1:1', '3002:2:1'], 'bootstrap account, its Tenant, failed and good sign-ins, the override, the Labs Action, a sign-in and a sign-out');
  for (const event of all.events) assert.deepEqual(ocsfErrors(event), [], JSON.stringify(event));
  const [failed, override, labs] = [all.events[2], all.events[4], all.events[5]];
  assert.deepEqual([failed.user.name, failed.status_detail, failed.src_endpoint.ip.endsWith('127.0.0.1'), failed.auth_protocol], ['admin', 'invalid_credentials', true, 'Password']);
  assert.deepEqual([override.entity.uid, override.entity.data, override.actor.user.name], ['work.live-view', { change: 'override_set', variant: 'on', reason: 'Try it on homelab' }, 'admin']);
  assert.deepEqual([labs.api.operation, labs.api.response.code, labs.unmapped.channel], ['PUT /api/flags/work.live-view/choice', 200, 'browser']);
  assert.equal(JSON.stringify(all.events).includes('wrong-password'), false, 'a password never reaches the audit');
  assert.equal(verifyExported(all.events).ok, true);

  const paged: any[] = [];
  let next: string | null = '/api/admin/audit?limit=3';
  while (next) {
    const page = await lines(app.url, next, admin.cookie);
    paged.push(...page.events);
    next = page.result.response.headers.get('link')?.match(/^<([^>]+)>; rel="next"$/)?.[1] ?? null;
    if (next) assert.equal(page.result.response.headers.get('x-unfold-audit-next-cursor'), String(page.events.at(-1).metadata.sequence));
  }
  assert.deepEqual(paged.slice(0, all.events.length).map(event => event.metadata.uid), all.events.map(event => event.metadata.uid), 'pages follow each other without gaps or repeats');
  assert.equal(paged[all.events.length].web_resources[0].type, 'Audit records', 'reading the audit is itself audited');
  const after = await lines(app.url, '/api/admin/audit?cursor=6', admin.cookie);
  assert.equal(after.events[0].metadata.sequence, 7);
  assert.equal((await lines(app.url, `/api/admin/audit?since=${new Date(Date.now() + 60_000).toISOString()}`, admin.cookie)).events.length, 0);
  assert.equal((await request(app.url, '/api/admin/audit?cursor=-1', { cookie: admin.cookie })).body.error.code, 'audit_cursor');
  assert.equal((await request(app.url, '/api/admin/audit?since=yesterday', { cookie: admin.cookie })).body.error.code, 'audit_since');

  const verified = await request(app.url, '/api/admin/audit/verify', { cookie: admin.cookie });
  assert.deepEqual([verified.status, verified.body.ok, verified.body.tenant], [200, true, 'default']);
});

test('the admin audit API answers only an administrator of the Tenant asked for, and only with export on', async t => {
  const app = await application('live', config => { config.flags = { document: { flags: { 'audit.export': { defaultVariant: 'off', targeting: { if: [{ '===': [{ var: 'tenantId' }, 'acme'] }, 'on', null] } } } }, unknown: [] }; });
  t.after(() => app.close());
  const admin = await login(app.url);
  app.app.store.addUser({ id: 'operator-otto', name: 'otto@example.test', role: 'operator', passwordHash: await hashPassword('operator-password-1414') });
  const operator = await login(app.url, 'otto@example.test', 'operator-password-1414');
  const acme = signIn(app, 'acme-admin', [{ kind: 'tenant', tenant: 'acme', role: 'admin' }]);
  const both = signIn(app, 'both-admin', [{ kind: 'tenant', tenant: 'acme', role: 'admin' }, { kind: 'tenant', tenant: 'beta', role: 'developer' }, { kind: 'tenant', tenant: 'gamma', role: 'admin' }]);

  assert.equal((await request(app.url, '/api/admin/audit', { cookie: operator.cookie })).status, 403, 'an operator reads no audit');
  const off = await request(app.url, '/api/admin/audit', { cookie: admin.cookie });
  assert.deepEqual([off.status, off.body.error.code], [404, 'audit_export_off'], 'export is off for the default Tenant');
  assert.equal((await request(app.url, '/api/admin/audit/verify', { cookie: admin.cookie })).body.ok, true, 'verification works with export off');
  assert.equal((await request(app.url, '/api/admin/audit?tenant=default', { cookie: acme })).body.error.code, 'audit_tenant_forbidden');
  assert.equal((await request(app.url, '/api/admin/audit?tenant=acme', { cookie: admin.cookie })).status, 403, 'the default Tenant\'s administrator cannot read acme');
  assert.equal((await request(app.url, '/api/admin/audit', { cookie: both })).body.error.code, 'audit_tenant', 'two administered Tenants need a choice');
  assert.equal((await request(app.url, '/api/admin/audit?tenant=beta', { cookie: both })).status, 403, 'a developer membership is not enough');

  const read = await lines(app.url, '/api/admin/audit', acme);
  assert.ok(read.events.length >= 2);
  assert.ok(read.events.every(event => event.metadata.tenant_uid === 'acme'));
  assert.equal(read.events.some(event => JSON.stringify(event).includes('otto@example.test')), false, 'nothing of the default Tenant leaks into acme');
  assert.deepEqual(read.events.filter(event => event.class_uid === 3006).map(event => event.user.uid).sort(), ['acme-admin', 'both-admin']);
  assert.equal(verifyExported(read.events).ok, true);
});
