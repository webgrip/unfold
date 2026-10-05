import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { application, request } from './api-support.ts';
import { Oidc } from '../src/oidc.ts';
import type { AppConfig } from '../src/types.ts';
import { provider, signIn, workbench } from './oidc-support.ts';

test('a person signs in through the identity provider, gets the role their groups grant, and returns as the same user', async t => {
  const { server, idp } = await workbench(t);
  const methods = await request(server.url, '/api/auth/methods');
  assert.deepEqual(methods.body, { local: true, oidc: { name: 'Authentik', issuer: idp.issuer } });
  const first = await signIn(server, idp);
  assert.equal(first.callback.status, 303, await first.callback.text());
  assert.equal(first.callback.headers.get('location'), '/');
  const cookie = first.callback.headers.get('set-cookie')!.split(';')[0];
  assert.ok(cookie.startsWith('unfold='));
  const exchange = idp.exchanges.at(-1)!;
  assert.equal(exchange.grant_type, 'authorization_code');
  assert.equal(exchange.client_id, 'unfold');
  assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'), first.challenge);
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.user.role, 'operator');
  assert.equal(bootstrap.body.user.name, 'person@example.com');
  const second = await signIn(server, idp);
  const again = await request(server.url, '/api/bootstrap', { cookie: second.callback.headers.get('set-cookie')!.split(';')[0] });
  assert.equal(again.body.user.id, bootstrap.body.user.id);
  const replay = await fetch(`${server.url}/api/auth/oidc/callback?code=good-code&state=${encodeURIComponent(first.state)}`, { redirect: 'manual' });
  assert.equal(replay.headers.get('location'), '/?login_error=oidc_state');
});

test('a person outside every admitted group is refused, and a role claim outranks groups', async t => {
  const refused = await workbench(t, { groups: ['team-platform'] });
  const denied = await signIn(refused.server, refused.idp);
  assert.equal(denied.callback.headers.get('location'), '/?login_error=oidc_not_entitled');
  assert.equal(denied.callback.headers.get('set-cookie'), null);
  const claimed = await workbench(t, { groups: ['team-platform'], role: 'admin' });
  const admitted = await signIn(claimed.server, claimed.idp);
  const cookie = admitted.callback.headers.get('set-cookie')!.split(';')[0];
  const bootstrap = await request(claimed.server.url, '/api/bootstrap', { cookie });
  assert.equal(bootstrap.body.user.role, 'admin');
});

test('a token for another audience or another sign-in is rejected', async t => {
  const audience = await workbench(t, { wrongAudience: true });
  const first = await signIn(audience.server, audience.idp);
  assert.equal(first.callback.headers.get('location'), '/?login_error=oidc_token');
  const nonce = await workbench(t, { wrongNonce: true });
  const second = await signIn(nonce.server, nonce.idp);
  assert.equal(second.callback.headers.get('location'), '/?login_error=oidc_token');
  const bad = await signIn(audience.server, audience.idp, 'bad-code');
  assert.equal(bad.callback.headers.get('location'), '/?login_error=oidc_exchange');
});

test('OIDC rejects a callback in another browser before exchanging its code', async t => {
  const { server, idp } = await workbench(t);
  const first = await fetch(`${server.url}/api/auth/oidc`, { redirect: 'manual' });
  const second = await fetch(`${server.url}/api/auth/oidc`, { redirect: 'manual' });
  const authorize = new URL(first.headers.get('location')!);
  idp.pendingNonce.set('*', authorize.searchParams.get('nonce')!);
  const callbackUrl = `${server.url}/api/auth/oidc/callback?code=good-code&state=${encodeURIComponent(authorize.searchParams.get('state')!)}`;
  for (const cookie of ['', second.headers.get('set-cookie')!.split(';')[0]]) {
    const denied = await fetch(callbackUrl, { redirect: 'manual', headers: { cookie } });
    assert.equal(denied.headers.get('location'), '/?login_error=oidc_state');
    assert.equal(denied.headers.get('set-cookie'), null);
    assert.equal(idp.exchanges.length, 0);
  }
  const completed = await fetch(callbackUrl, { redirect: 'manual', headers: { cookie: first.headers.get('set-cookie')!.split(';')[0] } });
  assert.equal(completed.headers.get('location'), '/');
  assert.equal(idp.exchanges.length, 1);
});

test('HTTPS OIDC uses a host-only, secure, short-lived browser cookie', async t => {
  const idp = await provider();
  const app = await application('live', config => {
    config.auth.secureCookies = true;
    config.auth.oidc = { issuer: idp.issuer, clientId: 'unfold', scopes: ['openid'], displayName: 'IdP', roleClaim: 'role', groupsClaim: 'groups', roles: { admin: [], operator: [], viewer: [] } };
  });
  t.after(async () => { await app.close(); await idp.close(); });
  const start = await fetch(`${app.url}/api/auth/oidc`, { redirect: 'manual' });
  assert.equal(start.status, 303);
  assert.match(start.headers.get('set-cookie')!, /^__Host-unfold-oauth=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
});

test('a person whose email another account already holds still signs in, under a numbered name, and that account is untouched', async t => {
  const { server, idp } = await workbench(t);
  server.app.store.addUser({ id: 'local-person', name: 'Person@example.com', role: 'admin', passwordHash: 'local-hash' });
  const first = await signIn(server, idp);
  assert.equal(first.callback.headers.get('location'), '/');
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie: first.callback.headers.get('set-cookie')!.split(';')[0] });
  assert.equal(bootstrap.body.user.name, 'person@example.com (2)');
  assert.equal(bootstrap.body.user.role, 'operator');
  assert.notEqual(bootstrap.body.user.id, 'local-person');
  assert.deepEqual(server.app.store.getUser('local-person'), { id: 'local-person', name: 'Person@example.com', role: 'admin', passwordHash: 'local-hash' });
  const second = await signIn(server, idp);
  const again = await request(server.url, '/api/bootstrap', { cookie: second.callback.headers.get('set-cookie')!.split(';')[0] });
  assert.equal(again.body.user.id, bootstrap.body.user.id);
  assert.equal(again.body.user.name, 'person@example.com (2)');
});


test('a renamed issuer keeps every account id when the subject namespace names the issuer they were created under', () => {
  const identify = (issuer: string, subjectNamespace?: string) => new Oidc({ auth: { oidc: { issuer, ...(subjectNamespace ? { subjectNamespace } : {}), clientId: 'unfold', scopes: ['openid'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: [], operator: ['unfold-operators'], viewer: [] } } } } as unknown as AppConfig)
    .identity({ sub: 'hashed-user-1', email: 'person@example.com', groups: ['unfold-operators'] });
  const created = identify('https://auth.example/application/o/vloer/');
  assert.notEqual(identify('https://auth.example/application/o/unfold/').id, created.id);
  assert.equal(identify('https://auth.example/application/o/unfold/', 'https://auth.example/application/o/vloer/').id, created.id);
  assert.equal(identify('https://auth.example/application/o/unfold/', 'https://auth.example/application/o/vloer').id, created.id);
});

test('after an issuer rename, a person whose account predates it signs back in to that same account under its own name', async t => {
  const formerIssuer = 'https://auth.example/application/o/vloer/';
  const { server, idp } = await workbench(t, { subjectNamespace: formerIssuer });
  const formerId = 'oidc-' + createHash('sha256').update('https://auth.example/application/o/vloer|person@example.com').digest('hex').slice(0, 32);
  server.app.store.upsertUser({ id: formerId, name: 'person@example.com', role: 'operator', passwordHash: '' });
  const signedIn = await signIn(server, idp);
  assert.equal(signedIn.callback.headers.get('location'), '/');
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie: signedIn.callback.headers.get('set-cookie')!.split(';')[0] });
  assert.equal(bootstrap.body.user.id, formerId);
  assert.equal(bootstrap.body.user.name, 'person@example.com');
});
