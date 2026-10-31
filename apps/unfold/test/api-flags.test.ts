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
  assert.equal(before.body.flags['work.live-view'], false);
  assert.equal(JSON.stringify(before.body).includes('targeting'), false, 'no targeting rule reaches the browser');

  const labs = await request(app.url, '/api/flags', { cookie: viewer.cookie });
  assert.equal(labs.status, 200);
  const entry = labs.body.labs.find((item: any) => item.key === 'work.live-view');
  assert.deepEqual({ choice: entry.choice, value: entry.value, reason: entry.reason, kind: entry.kind }, { choice: 'default', value: false, reason: 'DEFAULT', kind: 'release' });

  const chosen = await request(app.url, '/api/flags/work.live-view/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'on' } });
  assert.equal(chosen.status, 200, chosen.text);
  assert.equal(chosen.body.values['work.live-view'], true);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: viewer.cookie })).body.flags['work.live-view'], true);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: admin.cookie })).body.flags['work.live-view'], false, 'the choice is per person');

  assert.equal((await request(app.url, '/api/flags/work.live-view/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'maybe' } })).status, 400);
  assert.equal((await request(app.url, '/api/flags/work.nothing/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'on' } })).status, 404);
  assert.equal((await request(app.url, '/api/flags/constructor/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'on' } })).status, 404, 'an Object.prototype name is not a flag');
  assert.equal((await request(app.url, '/api/flags/work.live-view/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'on' }, csrf: false })).status, 403, 'a Labs choice is a guarded mutation');
  const reset = await request(app.url, '/api/flags/work.live-view/choice', { method: 'PUT', cookie: viewer.cookie, body: { choice: 'default' } });
  assert.equal(reset.body.values['work.live-view'], false);
});

test('administrators list every flag and force a variant for everyone with a reason, which the audit trail records', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  app.app.store.addUser({ id: 'operator-otto', name: 'otto@example.test', role: 'operator', passwordHash: await hashPassword('operator-password-1414') });
  const operator = await login(app.url, 'otto@example.test', 'operator-password-1414');

  assert.equal((await request(app.url, '/api/admin/flags', { cookie: operator.cookie })).status, 403);
  assert.equal((await request(app.url, '/api/admin/flags/work.live-view/override', { method: 'PUT', cookie: operator.cookie, body: { variant: 'on', reason: 'x' } })).status, 403);

  const listed = await request(app.url, '/api/admin/flags', { cookie: admin.cookie });
  assert.equal(listed.status, 200);
  const flag = listed.body.flags.find((item: any) => item.key === 'work.live-view');
  assert.deepEqual({ source: flag.source, override: flag.override, expired: flag.expired, owner: flag.metadata.owner }, { source: 'code', override: null, expired: false, owner: 'Ryan Grippeling' });
  assert.equal(listed.body.file.file, null);

  assert.equal((await request(app.url, '/api/admin/flags/work.live-view/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'on' } })).status, 400, 'forcing a variant needs a reason');
  assert.equal((await request(app.url, '/api/admin/flags/work.live-view/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'sideways', reason: 'x' } })).body.error.code, 'flag_variant');
  const forced = await request(app.url, '/api/admin/flags/work.live-view/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'on', reason: 'Try it on homelab' } });
  assert.equal(forced.status, 200, forced.text);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: operator.cookie })).body.flags['work.live-view'], true, 'the override reaches everyone');

  await app.restart();
  const again = await login(app.url);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: again.cookie })).body.flags['work.live-view'], true, 'the override survives a restart');
  const cleared = await request(app.url, '/api/admin/flags/work.live-view/override', { method: 'PUT', cookie: again.cookie, body: { variant: null } });
  assert.deepEqual(cleared.body.audit.map((entry: any) => [entry.action, entry.variant, entry.reason]), [['override_cleared', null, ''], ['override_set', 'on', 'Try it on homelab']]);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: again.cookie })).body.flags['work.live-view'], false);
});

test('a deployment rolls a flag out from its configuration, and a person can still opt out in Labs', async t => {
  const app = await application('live', config => { config.flags = { document: { flags: { 'work.live-view': { defaultVariant: 'on' } } }, unknown: [] }; });
  t.after(() => app.close());
  const admin = await login(app.url);
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: admin.cookie })).body.flags['work.live-view'], true);
  const out = await request(app.url, '/api/flags/work.live-view/choice', { method: 'PUT', cookie: admin.cookie, body: { choice: 'off' } });
  assert.equal(out.body.values['work.live-view'], false);
  assert.equal((await request(app.url, '/api/admin/flags', { cookie: admin.cookie })).body.flags.find((item: any) => item.key === 'work.live-view').source, 'config');
});

test('Unfold answers OFREP for the signed-in person: bulk with an ETag and 304, single flags, and only client flags', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  const bulk = await request(app.url, '/api/ofrep/v1/evaluate/flags', { method: 'POST', cookie: admin.cookie, body: { context: { targetingKey: 'someone-else', screen: 'work' } }, csrf: false });
  assert.equal(bulk.status, 200, bulk.text);
  const flag = bulk.body.flags.find((entry: any) => entry.key === 'work.live-view');
  assert.deepEqual({ value: flag.value, reason: flag.reason, variant: flag.variant }, { value: false, reason: 'STATIC', variant: 'off' });
  const etag = bulk.response.headers.get('etag');
  assert.ok(etag);
  const again = await request(app.url, '/api/ofrep/v1/evaluate/flags', { method: 'POST', cookie: admin.cookie, body: { context: {} }, headers: { 'if-none-match': etag! }, csrf: false });
  assert.equal(again.status, 304);
  const single = await request(app.url, '/api/ofrep/v1/evaluate/flags/work.live-view', { method: 'POST', cookie: admin.cookie, body: { context: {} }, csrf: false });
  assert.deepEqual({ key: single.body.key, value: single.body.value }, { key: 'work.live-view', value: false });
  const missing = await request(app.url, '/api/ofrep/v1/evaluate/flags/work.nothing', { method: 'POST', cookie: admin.cookie, body: { context: {} }, csrf: false });
  assert.deepEqual([missing.status, missing.body.errorCode], [404, 'FLAG_NOT_FOUND']);
  assert.equal((await request(app.url, '/api/ofrep/v1/evaluate/flags', { method: 'POST', body: { context: {} }, csrf: false })).status, 401, 'OFREP needs a signed-in person or editor');
});

test('administrators author a percentage rollout and segments in Unfold, export it as flagd, and read an experiment', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  const segment = await request(app.url, '/api/admin/flag-segments/admins', { method: 'PUT', cookie: admin.cookie, body: { description: 'Administrators', audience: { roles: ['admin'] } } });
  assert.equal(segment.status, 200, segment.text);
  assert.deepEqual(segment.body.segments.map((entry: any) => entry.name), ['admins']);
  assert.equal((await request(app.url, '/api/admin/flags/work.live-view/rollout', { method: 'PUT', cookie: admin.cookie, body: { rollout: { defaultVariant: 'off', rules: [] } } })).status, 400, 'a rollout needs a reason');
  const bad = await request(app.url, '/api/admin/flags/work.live-view/rollout', { method: 'PUT', cookie: admin.cookie, body: { reason: 'x', rollout: { defaultVariant: 'off', rules: [{ audience: {}, serve: { kind: 'split', weights: { on: 1, off: 1 } } }] } } });
  assert.deepEqual([bad.status, bad.body.error.code], [400, 'flag_rollout']);
  const set = await request(app.url, '/api/admin/flags/work.live-view/rollout', { method: 'PUT', cookie: admin.cookie, body: { reason: 'Admins first, everyone else at 0 %', rollout: { defaultVariant: 'off', rules: [{ id: 'admins', audience: { segment: 'admins' }, serve: { kind: 'split', weights: { on: 10000, off: 0 } } }] } } });
  assert.equal(set.status, 200, set.text);
  const flag = set.body.flags.find((entry: any) => entry.key === 'work.live-view');
  assert.equal(flag.source, 'console');
  assert.equal(flag.rollout.rules[0].id, 'admins');
  assert.equal((await request(app.url, '/api/bootstrap', { cookie: admin.cookie })).body.flags['work.live-view'], true);
  const exported = await request(app.url, '/api/admin/flags/export', { cookie: admin.cookie });
  assert.deepEqual(Object.keys(exported.body.flags), ['work.live-view']);
  assert.match(JSON.stringify(exported.body), /"role"/);
  assert.equal((await request(app.url, '/api/admin/flag-segments/admins', { method: 'DELETE', cookie: admin.cookie })).status, 409, 'a segment in use stays');
  const audit = (await request(app.url, '/api/admin/flags', { cookie: admin.cookie })).body.audit.map((entry: any) => entry.action);
  assert.deepEqual(audit.slice(0, 2), ['rollout_set', 'segment_set']);
  const cleared = await request(app.url, '/api/admin/flags/work.live-view/rollout', { method: 'PUT', cookie: admin.cookie, body: { rollout: null } });
  assert.equal(cleared.body.flags.find((entry: any) => entry.key === 'work.live-view').source, 'code');

  const posted = await request(app.url, '/api/insight/events', { method: 'POST', cookie: admin.cookie, body: { events: [
    { name: 'flag.exposed', at: new Date().toISOString(), session: 's1', props: { 'feature_flag.key': 'work.live-view', 'feature_flag.result.variant': 'true' } },
    { name: 'flag.tracked', at: new Date().toISOString(), session: 's1', props: { 'feature_flag.key': 'work.live-view', 'feature_flag.result.variant': 'true', event: 'run.opened', value: 1 } },
  ] } });
  assert.equal(posted.body.accepted, 2, posted.text);
  const operatorStore = app.app.store;
  const readout = operatorStore.flagExperiment('work.live-view', '2000-01-01T00:00:00Z');
  assert.deepEqual(readout, { exposures: { true: 1 }, conversions: [{ event: 'run.opened', variant: 'true', people: 1, value: 1 }] });
});

test('turning on Unified Work Item page turns the Live Work Item view off for that person, and the other way round', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const person = await login(app.url);
  const choose = (key: string, choice: string) => request(app.url, `/api/flags/${key}/choice`, { method: 'PUT', cookie: person.cookie, body: { choice } });
  const choiceOf = (body: any, key: string) => body.labs.find((item: any) => item.key === key).choice;

  const live = await choose('work.live-view', 'on');
  assert.equal(live.status, 200, live.text);
  assert.deepEqual([live.body.values['work.live-view'], live.body.values['work.unified']], [true, false]);

  const page = await choose('work.unified', 'on');
  assert.deepEqual([page.body.values['work.unified'], page.body.values['work.live-view']], [true, false]);
  assert.equal(choiceOf(page.body, 'work.live-view'), 'off', 'the excluded flag is chosen off, not left at its default');
  assert.deepEqual(page.body.labs.find((item: any) => item.key === 'work.unified').excludes, ['work.live-view']);

  const back = await choose('work.live-view', 'on');
  assert.deepEqual([back.body.values['work.live-view'], back.body.values['work.unified']], [true, false]);

  const off = await choose('work.live-view', 'off');
  assert.equal(choiceOf(off.body, 'work.unified'), 'off', 'turning one off leaves the other as it was');
  const neither = await request(app.url, '/api/bootstrap', { cookie: person.cookie });
  assert.deepEqual([neither.body.flags['work.live-view'], neither.body.flags['work.unified']], [false, false]);
});
