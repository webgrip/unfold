import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Auth, editorCredentialDays, editorIdleDays, editorLabel } from '../src/auth.ts';
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

test('a sign-in started by unfold-mcp is named after its host on the approval page and on its credential', t => {
  const { auth, tick } = setup(t);
  assert.equal(editorLabel(undefined, undefined), 'VS Code');
  assert.equal(editorLabel('mcp', 'ryan-laptop'), 'unfold-mcp on ryan-laptop');
  for (const host of ['', 'evil host', '<script>', 'a'.repeat(64), 42]) assert.equal(editorLabel('mcp', host), 'unfold-mcp', String(host));
  const started = auth.beginEditor('192.0.2.1', editorLabel('mcp', 'ryan-laptop'));
  assert.equal(auth.claimEditor(started.code, person), true);
  assert.equal(auth.editorRequest(started.code, person)?.label, 'unfold-mcp on ryan-laptop');
  auth.decideEditor(started.code, person, 'approved');
  tick(1000);
  const ready = auth.collectEditor(started.code, started.secret);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(auth.editorCredentials(person).map(item => item.label), ['unfold-mcp on ryan-laptop']);
});

test('a VS Code sign-in is named after the machine it names, and falls back to VS Code for an old or invalid client', () => {
  assert.equal(editorLabel('vscode', 'ryan-laptop'), 'VS Code on ryan-laptop');
  assert.equal(editorLabel('vscode', 'build.example.internal'), 'VS Code on build.example.internal');
  assert.equal(editorLabel('vscode', undefined), 'VS Code');
  assert.equal(editorLabel(undefined, 'ryan-laptop'), 'VS Code', 'an editor that does not say it is VS Code never gets a host on its name');
  assert.equal(editorLabel('Approve me', 'ryan-laptop'), 'VS Code');
  for (const host of ['', 'evil host', '<script>', '-leading', 'a'.repeat(64), 42]) assert.equal(editorLabel('vscode', host), 'VS Code', String(host));
});

test(`an editor credential unused for ${editorIdleDays} days stops working, drops off the list and ends its sign-in`, t => {
  const { auth, store, tick } = setup(t);
  const issue = () => {
    const started = auth.beginEditor('192.0.2.1');
    auth.claimEditor(started.code, person);
    auth.decideEditor(started.code, person, 'approved');
    const ready = auth.collectEditor(started.code, started.secret);
    assert.equal(ready.status, 'ready');
    return ready.status === 'ready' ? ready.token : '';
  };
  const day = 86_400_000;
  const idle = issue();
  const used = issue();
  const idleSignIn = createHash('sha256').update(idle).digest('hex');
  const usedSignIn = createHash('sha256').update(used).digest('hex');
  assert.deepEqual(auth.editorCredentials(person).map(item => item.idleExpiresAt), [new Date(Date.now() + editorIdleDays * day).toISOString(), new Date(Date.now() + editorIdleDays * day).toISOString()]);
  tick(10 * day);
  assert.deepEqual(auth.user(withBearer(used)), person);
  const usedAt = Date.now();
  assert.equal(auth.editorCredentials(person).find(item => item.lastUsedAt)?.idleExpiresAt, new Date(usedAt + editorIdleDays * day).toISOString());
  tick(4 * day + 1);
  assert.equal(store.liveSignIn(idleSignIn), false, 'never used within the window counts from approval');
  assert.equal(store.getEditorCredential(idleSignIn), undefined);
  assert.equal(auth.user(withBearer(idle)), undefined);
  assert.equal(store.liveSignIn(usedSignIn), true);
  assert.deepEqual(auth.editorCredentials(person).map(item => item.lastUsedAt), [new Date(usedAt).toISOString()]);
  tick(editorIdleDays * day - 4 * day);
  assert.equal(store.liveSignIn(usedSignIn), false, 'idle counts from the last use');
  assert.equal(auth.user(withBearer(used)), undefined);
  assert.deepEqual(auth.editorCredentials(person), []);
});

test('using an editor credential keeps it alive, written at most once a minute', t => {
  const { auth, store, tick } = setup(t);
  const started = auth.beginEditor('192.0.2.1');
  auth.claimEditor(started.code, person);
  auth.decideEditor(started.code, person, 'approved');
  const ready = auth.collectEditor(started.code, started.secret);
  if (ready.status !== 'ready') return assert.fail('no credential');
  const signIn = createHash('sha256').update(ready.token).digest('hex');
  for (let week = 0; week < 3; week++) { tick(7 * 86_400_000); assert.deepEqual(auth.user(withBearer(ready.token)), person); }
  const touched = store.getEditorCredential(signIn)!.lastUsedAt;
  tick(30_000);
  auth.user(withBearer(ready.token));
  assert.equal(store.getEditorCredential(signIn)!.lastUsedAt, touched);
  store.touchEditorSignIn(signIn, new Date(Date.now()).toISOString());
  assert.notEqual(store.getEditorCredential(signIn)!.lastUsedAt, touched);
});
