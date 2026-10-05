import type test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, sign } from 'node:crypto';
import { application } from './api-support.ts';

export async function provider(options: { groups?: string[]; role?: string; wrongNonce?: boolean; wrongAudience?: boolean } = {}) {
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
      const claims: Record<string, unknown> = { iss: issuer, aud: options.wrongAudience ? 'someone-else' : 'unfold', sub: 'person@example.com', email: 'Person@example.com', name: 'Ryan Grippeling', preferred_username: 'r.grippeling', groups: options.groups ?? ['unfold-operators', 'team-platform'], exp: now + 300, iat: now, nonce: options.wrongNonce ? 'other' : params.nonce ?? '' };
      if (options.role) claims.unfold_role = options.role;
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

export async function workbench(t: test.TestContext, options: Parameters<typeof provider>[0] & { subjectNamespace?: string } = {}) {
  const idp = await provider(options);
  const server = await application('live', config => { config.baseUrl = undefined; (config.auth as any).oidc = { issuer: idp.issuer, ...(options.subjectNamespace ? { subjectNamespace: options.subjectNamespace } : {}), clientId: 'unfold', scopes: ['openid', 'email', 'profile'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } }; });
  t.after(async () => { await server.close(); await idp.close(); });
  return { server, idp };
}

export async function signIn(server: { url: string }, idp: Awaited<ReturnType<typeof provider>>, code = 'good-code') {
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

/** Follows an editor sign-in URL in a fresh browser: the identity provider signs the person in and the callback lands on the approval page. */
export async function signInForEditor(url: string, idp: Awaited<ReturnType<typeof provider>>) {
  const start = await fetch(url, { redirect: 'manual' });
  if (start.status !== 303) return { status: start.status, location: '', cookie: '' };
  const authorize = new URL(start.headers.get('location')!);
  idp.pendingNonce.set('*', authorize.searchParams.get('nonce')!);
  const callback = await fetch(`${new URL(url).origin}/api/auth/oidc/callback?code=good-code&state=${encodeURIComponent(authorize.searchParams.get('state')!)}`, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } });
  return { status: callback.status, location: callback.headers.get('location') ?? '', cookie: (callback.headers.get('set-cookie') ?? '').split(';')[0] };
}
