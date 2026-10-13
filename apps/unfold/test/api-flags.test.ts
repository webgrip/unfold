import test from 'node:test';
import assert from 'node:assert/strict';
import { application, login, request } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';

test('the bootstrap carries evaluated client flags, and a Labs choice turns the flight profile on for that person only', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  app.app.store.addUser({ id: 'viewer-iris', name: 'iris@example.test', role: 'viewer', passwordHash: await hashPassword('viewer-password-1414') });
  const viewer = await login(app.url, 'iris@example.test', 'viewer-password-1414');

  const before = await request(app.url, '/api/bootstrap', { cookie: viewer.cookie });
  assert.equal(before.body.flags['work.flight-profile'], false);
  assert.equal(JSON.stringify(before.body).includes('targeting'), false, 'no targeting rule reaches the browser');

  const labs = await request(app.url, '/api/flags', { cookie: viewer.cookie });
  assert.equal(labs.status, 200);
  const entry = labs.body.labs.find((item: any) => item.key === 'work.flight-profile');
  assert.deepEqual({ choice: entry.choice, value: entry.value, reason: entry.reason, kind: entry.kind }, { choice: 'default', value: false, reason: 'DEFAULT', kind: 'release' });

  const chosen = await request(app.url, '/api/flags/work.flight-profile/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'on' } });
  assert.equal(chosen.status, 200, chosen.text);
  assert.equal(chosen.body.values['work.flight-profile'], true);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: viewer.cookie })).body.flags['work.flight-profile'], true);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: admin.cookie })).body.flags['work.flight-profile'], false, 'the choice is per person');

  assert.equal((await request(app.url, '/api/flags/work.flight-profile/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'maybe' } })).status, 400);
  assert.equal((await request(app.url, '/api/flags/work.nothing/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'on' } })).status, 404);
  assert.equal((await request(app.url, '/api/flags/work.flight-profile/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'on' }, csrf: false })).status, 403, 'a Labs choice is a guarded mutation');
  const reset = await request(app.url, '/api/flags/work.flight-profile/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'default' } });
  assert.equal(reset.body.values['work.flight-profile'], false);
});

test('administrators list every flag and force a variant for everyone with a reason, which the audit trail records', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  app.app.store.addUser({ id: 'operator-otto', name: 'otto@example.test', role: 'operator', passwordHash: await hashPassword('operator-password-1414') });
  const operator = await login(app.url, 'otto@example.test', 'operator-password-1414');

  assert.equal((await request(app.url, '/api/admin/flags', { cookie: operator.cookie })).status, 403);
  assert.equal((await request(app.url, '/api/admin/flags/work.flight-profile/override', { method: 'PUT', cookie: operator.cookie, body: { variant: 'on', reason: 'x' } })).status, 403);

  const listed = await request(app.url, '/api/admin/flags', { cookie: admin.cookie });
  assert.equal(listed.status, 200);
  const flag = listed.body.flags.find((item: any) => item.key === 'work.flight-profile');
  assert.deepEqual({ source: flag.source, override: flag.override, expired: flag.expired, owner: flag.metadata.owner }, { source: 'code', override: null, expired: false, owner: 'Ryan Grippeling' });
  assert.equal(listed.body.file.file, null);

  assert.equal((await request(app.url, '/api/admin/flags/work.flight-profile/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'on' } })).status, 400, 'forcing a variant needs a reason');
  assert.equal((await request(app.url, '/api/admin/flags/work.flight-profile/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'sideways', reason: 'x' } })).body.error.code, 'flag_variant');
  const forced = await request(app.url, '/api/admin/flags/work.flight-profile/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'on', reason: 'Try it on homelab' } });
  assert.equal(forced.status, 200, forced.text);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: operator.cookie })).body.flags['work.flight-profile'], true, 'the override reaches everyone');

  await app.restart();
  const again = await login(app.url);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: again.cookie })).body.flags['work.flight-profile'], true, 'the override survives a restart');
  const cleared = await request(app.url, '/api/admin/flags/work.flight-profile/override', { method: 'PUT', cookie: again.cookie, body: { variant: null } });
  assert.deepEqual(cleared.body.audit.map((entry: any) => [entry.action, entry.variant, entry.reason]), [['override_cleared', null, ''], ['override_set', 'on', 'Try it on homelab']]);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: again.cookie })).body.flags['work.flight-profile'], false);
});

test('a deployment rolls a flag out from its configuration, and a person can still opt out in Labs', async t => {
  const app = await application('live', config => { config.flags = { document: { flags: { 'work.flight-profile': { defaultVariant: 'on' } } }, unknown: [] }; });
  t.after(() => app.close());
  const admin = await login(app.url);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: admin.cookie })).body.flags['work.flight-profile'], true);
  const out = await request(app.url, '/api/flags/work.flight-profile/choice', { method: 'PUT', cookie: admin.cookie, body: { choice: 'off' } });
  assert.equal(out.body.values['work.flight-profile'], false);
  assert.equal((await request(app.url, '/api/admin/flags', { cookie: admin.cookie })).body.flags.find((item: any) => item.key === 'work.flight-profile').source, 'config');
});
