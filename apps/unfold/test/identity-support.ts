import type test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { application } from './api-support.ts';
import { provider } from './oidc-support.ts';
import type { AppConfig } from '../src/types.ts';

export const scimToken = 'scim-test-token-0123456789abcdef0123456789';
process.env.UNFOLD_SCIM_TEST_TOKEN = scimToken;

/** A Shared Signals transmitter: a JWKS endpoint and a signer for the SETs it pushes. */
export async function transmitter() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'ssf-1', use: 'sig', alg: 'ES256' };
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/jwks') { res.end(JSON.stringify({ keys: [jwk] })); return; }
    res.writeHead(404); res.end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const issuer = `${base}/ssf`;
  const set = (claims: Record<string, unknown>, options: { typ?: string | null; wrongKey?: boolean; kid?: string } = {}) => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: options.kid ?? 'ssf-1', ...(options.typ === null ? {} : { typ: options.typ ?? 'secevent+jwt' }) })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: issuer, jti: randomUUID(), iat: Math.floor(Date.now() / 1000), ...claims })).toString('base64url');
    const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: options.wrongKey ? other.privateKey : privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return `${header}.${payload}.${signature}`;
  };
  return { issuer, jwksUri: `${base}/jwks`, set, close: () => new Promise<void>(done => server.close(() => done())) };
}

/** A live workbench with single sign-on, SCIM and the Shared Signals receiver configured and their flags as given. */
export async function identityBench(t: test.TestContext, options: { scim?: boolean; signals?: boolean; linkBy?: 'externalId' | 'userName' | 'email'; configure?: (config: AppConfig) => void } = {}) {
  const idp = await provider({ groups: ['unfold-operators'] });
  const sender = await transmitter();
  const audience = 'https://unfold.test';
  const server = await application('live', config => {
    config.baseUrl = undefined;
    config.auth.oidc = { issuer: idp.issuer, clientId: 'unfold', scopes: ['openid', 'email', 'profile'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } };
    config.identity = { scim: { tokenEnv: 'UNFOLD_SCIM_TEST_TOKEN', linkBy: options.linkBy ?? 'externalId' }, sharedSignals: { audience, maxAgeHours: 24, transmitters: [{ name: 'test-idp', issuer: sender.issuer, jwksUri: sender.jwksUri }] } };
    config.flags = { document: { flags: { 'identity.scim': { defaultVariant: options.scim === false ? 'off' : 'on' }, 'identity.shared-signals': { defaultVariant: options.signals === false ? 'off' : 'on' } } }, unknown: [] };
    options.configure?.(config);
  });
  t.after(async () => { await server.close(); await idp.close(); await sender.close(); });
  return { server, idp, sender, audience };
}

/** Sends one SCIM request with the bearer token. */
export async function scim(url: string, path: string, options: { method?: string; body?: unknown; token?: string | null } = {}) {
  const headers: Record<string, string> = { accept: 'application/scim+json', ...(options.body === undefined ? {} : { 'content-type': 'application/scim+json' }), ...(options.token === null ? {} : { authorization: `Bearer ${options.token ?? scimToken}` }) };
  const response = await fetch(`${url}/scim/v2${path}`, { method: options.method ?? 'GET', headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  const text = await response.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}

/** Pushes one SET to the receiver. */
export async function push(url: string, token: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${url}/ssf/events`, { method: 'POST', headers: { 'content-type': 'application/secevent+jwt', accept: 'application/json', ...headers }, body: token });
  const text = await response.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}
