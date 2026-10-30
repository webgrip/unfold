import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Store } from '../src/store.ts';
import { Auth } from '../src/auth.ts';
import { Revocation } from '../src/identity/revocation.ts';
import { configuration } from './api-support.ts';
import { identitySettings } from '../src/identity/settings.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const bearer = (token: string, url = '/api/ploeg/now') => ({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } }) as unknown as IncomingMessage;
const cookie = (token: string) => ({ method: 'GET', url: '/api/bootstrap', headers: { cookie: `unfold=${token}` } }) as unknown as IncomingMessage;

function bench() {
  const store = new Store(':memory:');
  const config = configuration('/tmp/unused', 'live');
  config.auth.bootstrapPassword = undefined;
  const auth = new Auth(store, config);
  const host = { signIns: [] as string[], users: [] as string[], revokeSignIn(signIn: string) { this.signIns.push(signIn); return 1; }, revokeUser(userId: string) { this.users.push(userId); return 1; } };
  const revocation = new Revocation(store, auth, host);
  const user = { id: 'oidc-person', name: 'person@example.com', role: 'operator' as const, memberships: [] };
  store.addUser({ ...user, passwordHash: '' });
  const login = randomBytes(32).toString('base64url');
  store.createLogin(hash(login), user.id, new Date(Date.now() + 3_600_000).toISOString());
  store.setPersonGrant(hash(login), { userId: user.id, subject: 'person', accessToken: 'at', accessExpiresAt: Date.now() + 60_000, refreshToken: 'rt' });
  const editor = `vle_${randomBytes(32).toString('base64url')}`;
  store.createEditorCredential({ id: randomBytes(12).toString('hex'), tokenHash: hash(editor), userId: user.id, label: 'VS Code', scope: 'editor', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  const delegated = auth.delegate(user, 60_000);
  return { store, auth, host, revocation, user, login, editor, delegated };
}

test('revoking a person ends every credential type they hold', () => {
  const { store, auth, host, revocation, user, login, editor, delegated } = bench();
  assert.ok(auth.user(cookie(login)));
  assert.ok(auth.user(bearer(editor)));
  assert.ok(auth.user(bearer(delegated.token)));
  const counts = revocation.person(user.id);
  assert.deepEqual(counts, { browserSessions: 1, editorCredentials: 1, agentsWindowTokens: 3, delegatedCredentials: 1, personGrants: 1 });
  assert.equal(auth.user(cookie(login)), undefined, 'browser session');
  assert.equal(auth.user(bearer(editor)), undefined, 'editor credential');
  assert.equal(auth.user(bearer(delegated.token)), undefined, 'delegated credential');
  assert.equal(store.getSecret(`person-grant:${hash(login)}`), undefined, 'kept sign-in tokens');
  assert.deepEqual(host.signIns.sort(), [hash(login), hash(editor)].sort(), 'Agents-window tokens of each sign-in');
  assert.deepEqual(host.users, [user.id], 'and every other Agents-window token of the person');
  assert.deepEqual(revocation.person(user.id), { browserSessions: 0, editorCredentials: 0, agentsWindowTokens: 1, delegatedCredentials: 0, personGrants: 0 }, 'revoking again finds nothing new');
});

test('signing out ends one sign-in through the same revocation and leaves the others', () => {
  const { store, auth, host, revocation, login, editor } = bench();
  assert.deepEqual(revocation.signIn(hash(login)), { browserSessions: 1, editorCredentials: 0, agentsWindowTokens: 1, delegatedCredentials: 0, personGrants: 1 });
  assert.equal(auth.user(cookie(login)), undefined);
  assert.ok(auth.user(bearer(editor)), 'the editor credential is another sign-in');
  assert.deepEqual(host.signIns, [hash(login)]);
  assert.equal(store.getSecret(`person-grant:${hash(login)}`), undefined);
});

test('the identity block refuses secrets in the file, a missing token and plain http', () => {
  const env = { UNFOLD_SCIM_TOKEN: 'x'.repeat(40) };
  assert.deepEqual(identitySettings({ scim: { tokenEnv: 'UNFOLD_SCIM_TOKEN' } }, { oidc: true }, env), { scim: { tokenEnv: 'UNFOLD_SCIM_TOKEN', linkBy: 'externalId' } });
  assert.throws(() => identitySettings({ scim: { tokenEnv: 'UNFOLD_SCIM_TOKEN' } }, { oidc: false }, env), /needs auth.oidc/);
  assert.throws(() => identitySettings({ scim: { tokenEnv: 'UNFOLD_MISSING' } }, { oidc: true }, env), /must hold at least 32/);
  assert.throws(() => identitySettings({ scim: { token: 'abc' } }, { oidc: true }, env), /identity.scim.token is not a setting/);
  const transmitter = { name: 'authentik', issuer: 'https://auth.example/ssf', jwksUri: 'http://auth.example/jwks' };
  assert.throws(() => identitySettings({ sharedSignals: { transmitters: [transmitter] } }, { oidc: true, baseUrl: 'https://unfold.example' }, env), /https URL/);
  const parsed = identitySettings({ sharedSignals: { transmitters: [{ ...transmitter, jwksUri: 'https://auth.example/jwks' }] } }, { oidc: true, baseUrl: 'https://unfold.example' }, env);
  assert.equal(parsed.sharedSignals?.audience, 'https://unfold.example');
  assert.equal(parsed.sharedSignals?.maxAgeHours, 24);
});
