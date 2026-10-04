import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Auth, editorCredentialDays } from '../src/auth.ts';
import { Store } from '../src/store.ts';
import { configuration } from './api-support.ts';
import type { User } from '../src/types.ts';

const person: User = { id: 'person-1', name: 'person@example.com', role: 'operator' };
const other: User = { id: 'person-2', name: 'other@example.com', role: 'admin' };

function setup(t: test.TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-03T10:00:00Z') });
  const store = new Store(':memory:');
  t.after(() => store.close());
  for (const user of [person, other]) store.addUser({ ...user, passwordHash: '' });
  const auth = new Auth(store, { ...configuration('/tmp/unused', 'live'), auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' } });
  const tick = (ms: number) => t.mock.timers.tick(ms);
  return { store, auth, tick };
}

const withBearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as unknown as IncomingMessage;
const code = (error: unknown) => (error as { code?: string }).code;

test('signing in alone never makes a ticket collectable; only its own approval does, once', t => {
  const { auth, tick } = setup(t);
  const started = auth.beginEditor('192.0.2.1');
  assert.equal(auth.claimEditor(started.code, person), true);
  assert.equal(auth.claimEditor(started.code, other), false);
  assert.equal(auth.editorPending(started.code), false);
  tick(1000);
  assert.deepEqual(auth.collectEditor(started.code, started.secret), { status: 'pending' });
  assert.equal(auth.editorRequest(started.code, other), undefined);
  assert.throws(() => auth.decideEditor(started.code, other, 'approved'), error => code(error) === 'editor_login_unknown');
  assert.equal(auth.decideEditor(started.code, person, 'approved').status, 'approved');
  tick(1000);
  const ready = auth.collectEditor(started.code, started.secret);
  assert.equal(ready.status, 'ready');
  if (ready.status !== 'ready') return;
  assert.deepEqual(ready.user, person);
  assert.equal(ready.expiresAt, new Date(Date.now() + editorCredentialDays * 86_400_000).toISOString());
  assert.deepEqual(auth.user(withBearer(ready.token)), person);
  assert.equal(auth.scope(withBearer(ready.token)), 'editor');
  tick(1000);
  assert.throws(() => auth.collectEditor(started.code, started.secret), error => code(error) === 'editor_login_unknown');
});

test('an expired request yields no credential, even when it was approved', t => {
  const { auth, store, tick } = setup(t);
  const approved = auth.beginEditor('192.0.2.1');
  auth.claimEditor(approved.code, person);
  auth.decideEditor(approved.code, person, 'approved');
  const unclaimed = auth.beginEditor('192.0.2.1');
  tick(600_001);
  assert.throws(() => auth.collectEditor(approved.code, approved.secret), error => code(error) === 'editor_login_unknown');
  assert.equal(auth.claimEditor(unclaimed.code, person), false);
  assert.equal(auth.editorPending(unclaimed.code), false);
  assert.throws(() => auth.decideEditor(unclaimed.code, person, 'approved'), error => code(error) === 'editor_login_unknown');
  assert.deepEqual(store.editorCredentials(person.id), []);
});

test('a denied request yields no credential and is gone after the editor learns it', t => {
  const { auth, store, tick } = setup(t);
  const started = auth.beginEditor('192.0.2.1');
  auth.claimEditor(started.code, person);
  auth.decideEditor(started.code, person, 'denied');
  assert.throws(() => auth.decideEditor(started.code, person, 'approved'), error => code(error) === 'editor_login_decided');
  assert.throws(() => auth.collectEditor(started.code, started.secret), error => code(error) === 'editor_login_denied');
  tick(1000);
  assert.throws(() => auth.collectEditor(started.code, started.secret), error => code(error) === 'editor_login_unknown');
  assert.deepEqual(store.editorCredentials(person.id), []);
});

test('five wrong secrets end a ticket, so a mismatched poll can never collect it', t => {
  const { auth, tick } = setup(t);
  const started = auth.beginEditor('192.0.2.1');
  auth.claimEditor(started.code, person);
  auth.decideEditor(started.code, person, 'approved');
  for (let attempt = 0; attempt < 5; attempt++) assert.throws(() => auth.collectEditor(started.code, `wrong-${attempt}`), error => code(error) === 'editor_login_unknown');
  tick(1000);
  assert.throws(() => auth.collectEditor(started.code, started.secret), error => code(error) === 'editor_login_unknown');
});

test('starting is limited per address and polling by interval', t => {
  const { auth, tick } = setup(t);
  for (let index = 0; index < 20; index++) auth.beginEditor('192.0.2.1');
  assert.throws(() => auth.beginEditor('192.0.2.1'), error => code(error) === 'rate_limited');
  const elsewhere = auth.beginEditor('192.0.2.2');
  assert.deepEqual(auth.collectEditor(elsewhere.code, elsewhere.secret), { status: 'pending' });
  assert.throws(() => auth.collectEditor(elsewhere.code, elsewhere.secret), error => code(error) === 'slow_down');
  tick(1000);
  assert.deepEqual(auth.collectEditor(elsewhere.code, elsewhere.secret), { status: 'pending' });
  tick(600_001);
  assert.ok(auth.beginEditor('192.0.2.1').code);
});

test('an editor credential expires after its lifetime, is listed without its token and ends its sign-in when revoked', t => {
  const { auth, store, tick } = setup(t);
  const issue = () => {
    const started = auth.beginEditor('192.0.2.1');
    auth.claimEditor(started.code, person);
    auth.decideEditor(started.code, person, 'approved');
    const ready = auth.collectEditor(started.code, started.secret);
    assert.equal(ready.status, 'ready');
    return ready.status === 'ready' ? ready.token : '';
  };
  const first = issue();
  const second = issue();
  const listed = auth.editorCredentials(person);
  assert.equal(listed.length, 2);
  assert.ok(listed.every(item => !('tokenHash' in item) && item.scope === 'editor' && item.label === 'VS Code'));
  const signIn = createHash('sha256').update(first).digest('hex');
  assert.equal(store.liveSignIn(signIn), true);
  const firstId = store.getEditorCredential(signIn)!.id;
  assert.throws(() => auth.revokeEditorCredential(other, firstId), error => code(error) === 'not_found');
  assert.equal(auth.revokeEditorCredential(person, firstId), signIn);
  assert.equal(store.liveSignIn(signIn), false);
  assert.equal(auth.user(withBearer(first)), undefined);
  assert.deepEqual(auth.user(withBearer(second)), person);
  tick(editorCredentialDays * 86_400_000 + 1);
  assert.equal(auth.user(withBearer(second)), undefined);
  assert.deepEqual(auth.editorCredentials(person), []);
});
