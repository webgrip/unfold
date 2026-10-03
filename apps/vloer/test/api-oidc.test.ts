import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { application, request } from './api-support.ts';

async function provider(options: { groups?: string[]; role?: string; wrongNonce?: boolean; wrongAudience?: boolean } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'k1', use: 'sig', alg: 'RS256' };
  let issuer = '';
  const exchanges: Record<string, string>[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/.well-known/openid-configuration') { res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` })); return; }
    if (req.url === '/jwks') { res.end(JSON.stringify({ keys: [jwk] })); return; }
    if (req.url === '/token' && req.method === 'POST') {
      const params = Object.fromEntries(new URLSearchParams(body));
      exchanges.push(params);
      if (params.code !== 'good-code') { res.writeHead(400); res.end('{"error":"invalid_grant"}'); return; }
      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> = { iss: issuer, aud: options.wrongAudience ? 'someone-else' : 'vloer', sub: 'person@example.com', email: 'Person@example.com', name: 'Ryan Grippeling', preferred_username: 'r.grippeling', groups: options.groups ?? ['vloer-operators', 'team-platform'], exp: now + 300, iat: now, nonce: options.wrongNonce ? 'other' : params.nonce ?? '' };
      if (options.role) claims.vloer_role = options.role;
      res.end(JSON.stringify({ access_token: 'at', id_token: `${await sealed(claims, params)}`, token_type: 'Bearer' }));
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  const pendingNonce = new Map<string, string>();
  const sealed = async (claims: Record<string, unknown>, params: Record<string, string>) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url');
    const nonce = pendingNonce.get('*') ?? claims.nonce;
    const payload = Buffer.from(JSON.stringify({ ...claims, nonce: options.wrongNonce ? 'other' : nonce })).toString('base64url');
    const signature = sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
    return `${header}.${payload}.${signature}`;
  };
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { issuer, exchanges, pendingNonce, close: () => new Promise<void>(done => server.close(() => done())) };
}

async function workbench(t: test.TestContext, options: Parameters<typeof provider>[0] = {}) {
  const idp = await provider(options);
  const server = await application('live', config => { config.baseUrl = undefined; (config.auth as any).oidc = { issuer: idp.issuer, clientId: 'vloer', scopes: ['openid', 'email', 'profile'], displayName: 'Authentik', roleClaim: 'vloer_role', groupsClaim: 'groups', roles: { admin: ['vloer-admins'], operator: ['vloer-operators'], viewer: ['vloer-viewers'] } }; });
  t.after(async () => { await server.close(); await idp.close(); });
  return { server, idp };
}

async function signIn(server: { url: string }, idp: Awaited<ReturnType<typeof provider>>, code = 'good-code') {
  const start = await fetch(`${server.url}/api/auth/oidc`, { redirect: 'manual' });
  assert.equal(start.status, 303);
  const authorize = new URL(start.headers.get('location')!);
  assert.equal(authorize.origin + authorize.pathname, `${idp.issuer}/authorize`);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  const state = authorize.searchParams.get('state')!;
  const nonce = authorize.searchParams.get('nonce')!;
  idp.pendingNonce.set('*', nonce);
  const callback = await fetch(`${server.url}/api/auth/oidc/callback?code=${code}&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } });
  return { callback, state, nonce, challenge: authorize.searchParams.get('code_challenge')! };
}

test('a person signs in through the identity provider, gets the role their groups grant, and returns as the same user', async t => {
  const { server, idp } = await workbench(t);
  const methods = await request(server.url, '/api/auth/methods');
  assert.deepEqual(methods.body, { local: true, oidc: { name: 'Authentik', issuer: idp.issuer } });
  const first = await signIn(server, idp);
  assert.equal(first.callback.status, 303, await first.callback.text());
  assert.equal(first.callback.headers.get('location'), '/');
  const cookie = first.callback.headers.get('set-cookie')!.split(';')[0];
  assert.ok(cookie.startsWith('vloer='));
  const exchange = idp.exchanges.at(-1)!;
  assert.equal(exchange.grant_type, 'authorization_code');
  assert.equal(exchange.client_id, 'vloer');
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

test('an editor signs in through the browser: a one-time code, the usual sign-in, then the session collected with its secret', async t => {
  const { server, idp } = await workbench(t);
  const started = await request(server.url, '/api/auth/editor', { method: 'POST', body: {} });
  assert.equal(started.status, 200);
  assert.match(started.body.code, /^[A-Za-z0-9_-]{8,32}$/);
  assert.ok(started.body.url.endsWith(`/api/auth/oidc?editor=${started.body.code}`));
  const pending = await request(server.url, `/api/auth/editor/${started.body.code}`, { method: 'POST', body: { secret: started.body.secret } });
  assert.equal(pending.status, 202);
  assert.equal(pending.body.status, 'pending');
  const wrong = await request(server.url, `/api/auth/editor/${started.body.code}`, { method: 'POST', body: { secret: 'guess' } });
  assert.equal(wrong.status, 404);
  const unknown = await fetch(`${server.url}/api/auth/oidc?editor=nope12345`, { redirect: 'manual' });
  assert.equal(unknown.status, 404);
  const start = await fetch(`${server.url}/api/auth/oidc?editor=${started.body.code}`, { redirect: 'manual' });
  assert.equal(start.status, 303);
  const authorize = new URL(start.headers.get('location')!);
  idp.pendingNonce.set('*', authorize.searchParams.get('nonce')!);
  const callback = await fetch(`${server.url}/api/auth/oidc/callback?code=good-code&state=${encodeURIComponent(authorize.searchParams.get('state')!)}`, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } });
  assert.equal(callback.headers.get('location'), '/?editor=done');
  const ready = await request(server.url, `/api/auth/editor/${started.body.code}`, { method: 'POST', body: { secret: started.body.secret } });
  assert.equal(ready.status, 200);
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.user.role, 'operator');
  const editorCookie = ready.body.cookie.split(';')[0];
  assert.notEqual(editorCookie, callback.headers.get('set-cookie')!.split(';')[0]);
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie: editorCookie });
  assert.equal(bootstrap.body.user.name, 'person@example.com');
  const again = await request(server.url, `/api/auth/editor/${started.body.code}`, { method: 'POST', body: { secret: started.body.secret } });
  assert.equal(again.status, 404);
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
    config.auth.oidc = { issuer: idp.issuer, clientId: 'vloer', scopes: ['openid'], displayName: 'IdP', roleClaim: 'role', groupsClaim: 'groups', roles: { admin: [], operator: [], viewer: [] } };
  });
  t.after(async () => { await app.close(); await idp.close(); });
  const start = await fetch(`${app.url}/api/auth/oidc`, { redirect: 'manual' });
  assert.equal(start.status, 303);
  assert.match(start.headers.get('set-cookie')!, /^__Host-vloer-oauth=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
});
