import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import { once } from 'node:events';
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { application } from './api-support.ts';
import { AccessTokenVerifier, TokenRefused, mcpHttpSettings, type McpHttpSettings } from '../src/mcp-auth.ts';
import { createMcpHttp } from '../src/mcp-http.ts';
import { entitledRole, subjectUserId } from '../src/oidc.ts';

const resource = 'https://unfold.example.test/mcp';
const metadataUrl = 'https://unfold.example.test/.well-known/oauth-protected-resource/mcp';
const browserIssuer = 'https://sso.example.test/application/o/unfold/';

type Signer = { alg: string; kid?: string; sign(data: Buffer): Buffer };

function rsaSigner(kid = 'rsa-1') {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { publicKey, signer: { alg: 'RS256', kid, sign: (data: Buffer) => sign('sha256', data, privateKey) } as Signer };
}

function ecSigner(kid = 'ec-1') {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, signer: { alg: 'ES256', kid, sign: (data: Buffer) => sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' }) } as Signer };
}

function jwt(signer: Signer, claims: Record<string, unknown>, header: Record<string, unknown> = {}): string {
  const head = Buffer.from(JSON.stringify({ alg: signer.alg, typ: 'JWT', ...(signer.kid ? { kid: signer.kid } : {}), ...header })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${body}.${signer.sign(Buffer.from(`${head}.${body}`)).toString('base64url')}`;
}

type PublishedKey = { publicKey: KeyObject; kid?: string; use?: string; alg?: string };

async function identityProvider(keys: PublishedKey[], options: { discoveryIssuer?: string; padKeySet?: number; chunked?: boolean } = {}) {
  let issuer = '';
  const fetched = { discovery: 0, jwks: 0 };
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/application/o/unfold-mcp/.well-known/openid-configuration') { fetched.discovery++; return res.end(JSON.stringify({ issuer: options.discoveryIssuer ?? issuer, jwks_uri: `${issuer}jwks/` })); }
    if (req.url === '/application/o/unfold-mcp/jwks/' && options.chunked) {
      fetched.jwks++;
      const text = JSON.stringify({ keys: [], padding: 'x'.repeat(options.padKeySet ?? 0) });
      for (let at = 0; at < text.length; at += 65_536) res.write(text.slice(at, at + 65_536));
      return res.end();
    }
    if (req.url === '/application/o/unfold-mcp/jwks/') { fetched.jwks++; return res.end(JSON.stringify({ keys: keys.map(({ publicKey, kid, use, alg }) => ({ ...(publicKey.export({ format: 'jwk' }) as object), ...(kid === undefined ? {} : { kid }), use: use ?? 'sig', ...(alg ? { alg } : {}) })), ...(options.padKeySet ? { padding: 'x'.repeat(options.padKeySet) } : {}) })); }
    res.statusCode = 404; res.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}/application/o/unfold-mcp/`;
  return { issuer, fetched, close: () => new Promise<void>(done => server.close(() => done())) };
}

function settingsFor(issuer: string): McpHttpSettings {
  return { resource, issuer, clientIds: ['unfold-mcp'], scope: 'unfold:mcp', requestScopes: ['openid', 'unfold:mcp', 'offline_access'], maxLifetimeMs: 600_000 };
}

function claimsFor(issuer: string, extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: issuer, aud: 'unfold-mcp', azp: 'unfold-mcp', sub: 'person-sub', scope: 'openid unfold:mcp offline_access', iat: now, exp: now + 300, email: 'person@example.com', email_verified: true, preferred_username: 'person', groups: ['unfold-operators'], ...extra };
}

const meta = (capabilities: Record<string, unknown> = {}) => ({ 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': capabilities });

async function post(url: string, message: Record<string, any>, options: { token?: string; version?: string | null; headers?: Record<string, string>; method?: string } = {}) {
  const version = options.version === undefined ? '2026-07-28' : options.version;
  const modern = version === '2026-07-28';
  const body = modern && message.method ? { ...message, params: { ...(message.params ?? {}), _meta: message.params?._meta ?? meta() } } : message;
  const headers: Record<string, string> = {
    'content-type': 'application/json', accept: 'application/json, text/event-stream',
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(version ? { 'mcp-protocol-version': version } : {}),
    ...(modern && message.method ? { 'mcp-method': message.method } : {}),
    ...(modern && message.method === 'tools/call' ? { 'mcp-name': message.params.name } : {}),
    ...options.headers,
  };
  const response = await fetch(`${url}/mcp`, { method: options.method ?? 'POST', headers, ...(options.method && options.method !== 'POST' ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, headers: response.headers, json, text };
}

async function served(t: test.TestContext) {
  const rsa = rsaSigner();
  const idp = await identityProvider([{ publicKey: rsa.publicKey, kid: 'rsa-1' }]);
  const unfold = await application('live', config => {
    config.baseUrl = undefined;
    (config.auth as any).oidc = { issuer: browserIssuer, clientId: 'unfold', scopes: ['openid'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } };
    config.mcp = settingsFor(idp.issuer);
  });
  t.after(async () => { await unfold.close(); await idp.close(); });
  const person = { id: subjectUserId(browserIssuer, 'person-sub'), name: 'person@example.com', role: 'operator' as const, passwordHash: '' };
  unfold.app.store.addUser(person);
  return { unfold, idp, signer: rsa.signer, person, token: (extra: Record<string, unknown> = {}, signer: Signer = rsa.signer) => jwt(signer, claimsFor(idp.issuer, extra)) };
}

test('the protected resource metadata names the issuer and the exact resource, at both well-known paths', async t => {
  const { unfold, idp } = await served(t);
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const response = await fetch(`${unfold.url}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await response.json(), { resource, authorization_servers: [idp.issuer], scopes_supported: ['openid', 'unfold:mcp', 'offline_access'], bearer_methods_supported: ['header'], resource_name: 'Unfold' });
  }
  assert.equal((await fetch(`${unfold.url}/.well-known/oauth-protected-resource/mcp`, { method: 'OPTIONS' })).status, 204);
});

test('a request without a token gets 401 with an RFC 6750 challenge that points at the metadata', async t => {
  const { unfold } = await served(t);
  const answer = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(answer.status, 401);
  assert.equal(answer.headers.get('www-authenticate'), `Bearer scope="openid unfold:mcp offline_access", resource_metadata="${metadataUrl}"`);
  const garbage = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { token: 'not-a-jwt' });
  assert.equal(garbage.status, 401);
  assert.match(garbage.headers.get('www-authenticate')!, /^Bearer error="invalid_token", error_description="the token is not a JWT", scope=".*", resource_metadata=".*"$/);
});

test('tokens for another audience or client, expired, long-lived, symmetric, ID tokens and missing scopes are refused', async t => {
  const { unfold, idp, token, signer } = await served(t);
  const now = Math.floor(Date.now() / 1000);
  const refused = async (value: string, reason: RegExp, status = 401) => {
    const answer = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { token: value });
    assert.equal(answer.status, status, `${reason}: ${answer.text}`);
    assert.match(answer.headers.get('www-authenticate') ?? '', reason);
    return answer;
  };
  await refused(token({ aud: 'someone-else' }), /error="invalid_token", error_description="the token is meant for another audience"/);
  await refused(token({ azp: 'other-client' }), /issued to a client this server does not accept/);
  await refused(token({ iss: idp.issuer.replace(/\/$/, '') }), /issued by another issuer/);
  await refused(token({ iat: now - 400, exp: now - 61 }), /the token has expired/);
  await refused(token({ exp: now + 3600 }), /lives longer than 600s/);
  await refused(token({ iat: undefined }), /the token has no iat/);
  await refused(token({ sub: '' }), /the token has no sub/);
  await refused(token({ azp: undefined, scope: undefined }), /an ID token is not an access token/);
  const hmac = { alg: 'HS256', kid: 'rsa-1', sign: (data: Buffer) => createHmac('sha256', 'shared-secret').update(data).digest() };
  await refused(jwt(hmac, claimsFor(idp.issuer)), /not signed with an accepted asymmetric algorithm/);
  await refused(jwt({ ...signer, alg: 'none', sign: () => Buffer.alloc(0) }, claimsFor(idp.issuer)), /not signed with an accepted asymmetric algorithm/);
  await refused(jwt({ ...signer, kid: 'rsa-1' }, claimsFor(idp.issuer), { alg: 'RS384' }), /signature does not verify/);
  const scopeless = await refused(token({ scope: 'openid profile' }), /^Bearer error="insufficient_scope", error_description="requires unfold:mcp"/, 403);
  assert.match(scopeless.json.error.message, /lacks the scope unfold:mcp/);
  const skewed = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { token: token({ iat: now - 330, exp: now - 30 }) });
  assert.equal(skewed.status, 200, 'up to 60 seconds of clock skew is tolerated');
});

test('a valid token runs the tools as the Unfold account its subject maps to; an unmapped subject gets 403', async t => {
  const { unfold, token, person } = await served(t);
  const listed = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { token: token() });
  assert.equal(listed.status, 200, listed.text);
  assert.equal(listed.json.result.resultType, 'complete');
  assert.deepEqual(listed.json.result.tools.map((tool: { name: string }) => tool.name), ['unfold_now', 'unfold_find_work', 'unfold_get_work', 'unfold_sessions', 'unfold_spend', 'unfold_digest', 'unfold_ask']);
  assert.equal(listed.headers.get('mcp-session-id'), null, 'a stateless server mints no session');

  const sessions = await post(unfold.url, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'unfold_sessions', arguments: {} } }, { token: token() });
  assert.equal(sessions.status, 200);
  assert.equal(sessions.json.result.isError, undefined, sessions.text);
  assert.equal(sessions.json.result.structuredContent.summary, '0 sessions.');

  const stranger = await post(unfold.url, { jsonrpc: '2.0', id: 3, method: 'tools/list' }, { token: token({ sub: 'someone-new', email: 'new@example.com' }) });
  assert.equal(stranger.status, 403);
  assert.match(stranger.json.error.message, /^Signed in as new@example\.com, but no Unfold account belongs to this identity/);
  assert.equal(stranger.headers.get('www-authenticate'), null);

  const borrowed = await post(unfold.url, { jsonrpc: '2.0', id: 4, method: 'tools/list' }, { token: token({ sub: 'unknown-sub', email: person.name, email_verified: true, preferred_username: person.name }) });
  assert.equal(borrowed.status, 403, 'another account\'s verified email never maps a token whose subject is unknown');
  assert.match(borrowed.json.error.message, /no Unfold account belongs to this identity/);

  const removed = await post(unfold.url, { jsonrpc: '2.0', id: 5, method: 'tools/list' }, { token: token({ groups: ['team-platform'] }) });
  assert.equal(removed.status, 403, 'a person removed from every admitted group is refused, whatever the stored account says');
  assert.match(removed.json.error.message, /holds none of the groups this workbench admits/);
  assert.equal((await post(unfold.url, { jsonrpc: '2.0', id: 6, method: 'tools/list' }, { token: token({ groups: undefined }) })).status, 403, 'a token without groups is refused');
});

test('server/discover and the stateless 2026-07-28 rules: headers must match the body', async t => {
  const { unfold, token } = await served(t);
  const discovered = await post(unfold.url, { jsonrpc: '2.0', id: 'd', method: 'server/discover' }, { token: token() });
  assert.equal(discovered.status, 200, discovered.text);
  assert.deepEqual(discovered.json.result.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
  assert.equal(discovered.json.result._meta['io.modelcontextprotocol/serverInfo'].name, 'unfold-mcp');

  const mismatch = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { token: token(), headers: { 'mcp-method': 'tools/call' } });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.json.error.code, -32020);
  const wrongName = await post(unfold.url, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'unfold_now', arguments: {} } }, { token: token(), headers: { 'mcp-name': 'unfold_ask' } });
  assert.equal(wrongName.json.error.code, -32020);
  const encodedName = await post(unfold.url, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'unfold_sessions', arguments: {} } }, { token: token(), headers: { 'mcp-name': `=?base64?${Buffer.from('unfold_sessions').toString('base64')}?=` } });
  assert.equal(encodedName.status, 200, 'a Base64-encoded Mcp-Name is decoded before it is compared');
  const unsupported = await post(unfold.url, { jsonrpc: '2.0', id: 4, method: 'tools/list' }, { token: token(), version: '1900-01-01' });
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.json.error.code, -32022);
  const unknown = await post(unfold.url, { jsonrpc: '2.0', id: 5, method: 'resources/list' }, { token: token() });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.error.code, -32601);
  assert.equal((await post(unfold.url, {}, { token: token(), method: 'GET' })).status, 405);
  assert.equal((await post(unfold.url, { jsonrpc: '2.0', id: 6, method: 'tools/list' }, { token: token(), headers: { origin: 'https://evil.example.test' } })).status, 403);
});

test('a 2025-11-25 client initializes over HTTP and lists tools without a session', async t => {
  const { unfold, token } = await served(t);
  const init = await post(unfold.url, { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'vscode', version: '1.142' } } }, { token: token(), version: null });
  assert.equal(init.status, 200, init.text);
  assert.equal(init.json.result.protocolVersion, '2025-11-25');
  assert.equal(init.json.result.serverInfo.name, 'unfold-mcp');
  assert.equal(init.headers.get('mcp-session-id'), null);
  const initialized = await post(unfold.url, { jsonrpc: '2.0', method: 'notifications/initialized' }, { token: token(), version: '2025-11-25' });
  assert.equal(initialized.status, 202);
  const listed = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { token: token(), version: '2025-11-25' });
  assert.equal(listed.json.result.tools.length, 7);
  assert.equal(listed.json.result.resultType, undefined);
});

test('unfold_ask over HTTP refuses to spend when the client cannot confirm', async t => {
  const { unfold, token } = await served(t);
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'unfold_ask', arguments: { id: '184', question: 'Is Firefox affected?', use_model: true } } };
  const legacy = await post(unfold.url, call, { token: token(), version: '2025-11-25' });
  assert.equal(legacy.json.result.isError, true);
  assert.match(legacy.json.result.content[0].text, /cannot ask you to confirm a spend, so no model was asked/);
  const modern = await post(unfold.url, call, { token: token() });
  assert.equal(modern.json.result.isError, true);
  assert.match(modern.json.result.content[0].text, /cannot ask you to confirm a spend, so no model was asked/);
});

test('the tools call Unfold with a short-lived credential of their own, never the caller\'s access token', async t => {
  const rsa = rsaSigner();
  const idp = await identityProvider([{ publicKey: rsa.publicKey, kid: 'rsa-1' }]);
  const seen: string[] = [];
  const api = createServer((req: IncomingMessage, res) => { seen.push(String(req.headers.authorization)); res.setHeader('content-type', 'application/json'); res.end('[]'); });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const revoked: string[] = [];
  const actedAs: string[] = [];
  let stored: 'admin' | 'operator' | 'viewer' = 'operator';
  const mcp = createMcpHttp({
    settings: settingsFor(idp.issuer), subjectNamespace: browserIssuer,
    findUser: id => id === subjectUserId(browserIssuer, 'person-sub') ? { id, name: 'person@example.com', role: stored } : undefined,
    entitle: claims => entitledRole({ roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } }, claims),
    delegate: user => { actedAs.push(user.role); const token = `vlm_${'x'.repeat(43)}`; return { token, revoke: () => { revoked.push(token); } }; },
    apiUrl: () => `http://127.0.0.1:${(api.address() as { port: number }).port}`, linkUrl: 'https://unfold.example.test', version: 'test',
  });
  const front = createServer((req, res) => { void mcp.handle(req, res, new URL(req.url!, 'http://x').pathname); });
  front.listen(0, '127.0.0.1'); await once(front, 'listening');
  t.after(async () => { front.close(); api.close(); await idp.close(); });
  const access = jwt(rsa.signer, claimsFor(idp.issuer));
  const answer = await post(`http://127.0.0.1:${(front.address() as { port: number }).port}`, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'unfold_sessions', arguments: {} } }, { token: access });
  assert.equal(answer.json.result.structuredContent.summary, '0 sessions.', answer.text);
  assert.deepEqual(seen, [`Bearer vlm_${'x'.repeat(43)}`]);
  assert(!seen.some(value => value.includes(access)));
  assert.deepEqual(revoked, [`vlm_${'x'.repeat(43)}`], 'the credential is revoked when the request ends');

  const frontUrl = `http://127.0.0.1:${(front.address() as { port: number }).port}`;
  const list = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'unfold_sessions', arguments: {} } };
  actedAs.length = 0;
  stored = 'admin';
  await post(frontUrl, list, { token: jwt(rsa.signer, claimsFor(idp.issuer, { groups: ['unfold-viewers'] })) });
  stored = 'viewer';
  await post(frontUrl, list, { token: jwt(rsa.signer, claimsFor(idp.issuer, { groups: ['unfold-admins'] })) });
  await post(frontUrl, list, { token: jwt(rsa.signer, claimsFor(idp.issuer, { groups: [], unfold_role: 'admin' })) });
  assert.deepEqual(actedAs, ['viewer', 'viewer', 'viewer'], 'a demotion at the provider applies at once, and a token never raises the stored role');
});

test('the verifier accepts ES256, and refetches keys for an unknown key id at most once per 30 seconds', async t => {
  const ec = ecSigner('ec-1');
  const rotated = ecSigner('ec-2');
  const keys = [{ publicKey: ec.publicKey, kid: 'ec-1' }];
  const idp = await identityProvider(keys);
  t.after(() => idp.close());
  let clock = Date.now();
  const verifier = new AccessTokenVerifier(settingsFor(idp.issuer), { now: () => clock });
  const claims = () => claimsFor(idp.issuer, { iat: Math.floor(clock / 1000), exp: Math.floor(clock / 1000) + 300 });
  assert.equal((await verifier.verify(jwt(ec.signer, claims()))).subject, 'person-sub');
  assert.deepEqual(idp.fetched, { discovery: 1, jwks: 1 });
  keys.push({ publicKey: rotated.publicKey, kid: 'ec-2' });
  await assert.rejects(verifier.verify(jwt(rotated.signer, claims())), (error: unknown) => error instanceof TokenRefused && /key id is not among/.test(error.reason));
  await assert.rejects(verifier.verify(jwt(rotated.signer, claims())), TokenRefused);
  assert.equal(idp.fetched.jwks, 1, 'an unknown key id does not refetch within 30 seconds');
  clock += 31_000;
  assert.equal((await verifier.verify(jwt(rotated.signer, claims()))).subject, 'person-sub');
  assert.equal(idp.fetched.jwks, 2);
  const forged = { alg: 'RS256', kid: 'ec-1', sign: (data: Buffer) => ec.signer.sign(data) };
  await assert.rejects(verifier.verify(jwt(forged, claims())), /algorithm does not match its signing key/);
});

test('UNFOLD_MCP_* settings: off without a resource, no default domains, and strict about shape', () => {
  assert.equal(mcpHttpSettings({}), undefined);
  assert.throws(() => mcpHttpSettings({ UNFOLD_MCP_ISSUER: 'https://sso.example.test/' }), /UNFOLD_MCP_ISSUER is set, but UNFOLD_MCP_RESOURCE is not/);
  assert.throws(() => mcpHttpSettings({ UNFOLD_MCP_RESOURCE: resource }), /UNFOLD_MCP_ISSUER is required/);
  assert.throws(() => mcpHttpSettings({ UNFOLD_MCP_RESOURCE: resource, UNFOLD_MCP_ISSUER: 'https://sso.example.test/' }), /UNFOLD_MCP_CLIENT_IDS/);
  for (const bad of ['https://unfold.example.test/', 'https://unfold.example.test/api/mcp', 'https://unfold.example.test/mcp/', 'https://unfold.example.test/mcp?x=1']) assert.throws(() => mcpHttpSettings({ UNFOLD_MCP_RESOURCE: bad, UNFOLD_MCP_ISSUER: 'https://sso.example.test/', UNFOLD_MCP_CLIENT_IDS: 'unfold-mcp' }), /UNFOLD_MCP_RESOURCE/, bad);
  assert.deepEqual(mcpHttpSettings({ UNFOLD_MCP_RESOURCE: resource, UNFOLD_MCP_ISSUER: 'https://sso.example.test/', UNFOLD_MCP_CLIENT_IDS: 'unfold-mcp, unfold-mcp-vscode', UNFOLD_MCP_REQUEST_SCOPES: 'openid offline_access', UNFOLD_MCP_MAX_TOKEN_LIFETIME: '5m' }), { resource, issuer: 'https://sso.example.test/', clientIds: ['unfold-mcp', 'unfold-mcp-vscode'], scope: 'unfold:mcp', requestScopes: ['openid', 'offline_access', 'unfold:mcp'], maxLifetimeMs: 300_000 });
  assert.throws(() => mcpHttpSettings({ UNFOLD_MCP_RESOURCE: resource, UNFOLD_MCP_ISSUER: 'https://sso.example.test/', UNFOLD_MCP_CLIENT_IDS: 'unfold-mcp', UNFOLD_MCP_MAX_TOKEN_LIFETIME: '2d' }), /at most 24h/);
  assert.throws(() => mcpHttpSettings({ UNFOLD_MCP_RESOURCE: resource, UNFOLD_MCP_ISSUER: 'https://sso.example.test/', UNFOLD_MCP_CLIENT_IDS: 'unfold-mcp', UNFOLD_MCP_SCOPE: 'two scopes' }), /one scope/);
});

async function refusal(verifier: AccessTokenVerifier, token: string): Promise<string> {
  try { await verifier.verify(token); } catch (error) { return error instanceof TokenRefused ? error.reason : `${(error as Error).constructor.name}: ${(error as Error).message}`; }
  return 'accepted';
}

test('each token rule is pinned on its own: time claims, header, key type, curve, alg, size and use', async t => {
  const rsa = rsaSigner('rsa-1');
  const ec384 = (() => { const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-384' }); return { publicKey, signer: { alg: 'ES256', kid: 'p384', sign: (data: Buffer) => sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' }) } as Signer }; })();
  const small = (() => { const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 }); return { publicKey, signer: { alg: 'RS256', kid: 'small', sign: (data: Buffer) => sign('sha256', data, privateKey) } as Signer }; })();
  const encryption = rsaSigner('enc');
  const pinned = rsaSigner('rs512-only');
  const idp = await identityProvider([
    { publicKey: rsa.publicKey, kid: 'rsa-1' }, { publicKey: ec384.publicKey, kid: 'p384' }, { publicKey: small.publicKey, kid: 'small' },
    { publicKey: encryption.publicKey, kid: 'enc', use: 'enc' }, { publicKey: pinned.publicKey, kid: 'rs512-only', alg: 'RS512' },
  ]);
  t.after(() => idp.close());
  const verifier = new AccessTokenVerifier(settingsFor(idp.issuer));
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await refusal(verifier, jwt(rsa.signer, claimsFor(idp.issuer))), 'accepted');
  assert.equal(await refusal(verifier, jwt(rsa.signer, claimsFor(idp.issuer, { iat: now + 120, exp: now + 300 }))), 'the token is not valid yet', 'an iat in the future');
  assert.equal(await refusal(verifier, jwt(rsa.signer, claimsFor(idp.issuer, { nbf: now + 120 }))), 'the token is not valid yet', 'an nbf in the future');
  assert.equal(await refusal(verifier, jwt(rsa.signer, claimsFor(idp.issuer, { nbf: now + 30 }))), 'accepted', 'nbf within the skew');
  assert.equal(await refusal(verifier, jwt(rsa.signer, claimsFor(idp.issuer), { crit: ['exp'] })), 'the token names critical header parameters this server does not understand');
  assert.equal(await refusal(verifier, jwt(ec384.signer, claimsFor(idp.issuer))), 'the token\'s algorithm does not match its signing key', 'ES256 on a P-384 key');
  assert.equal(await refusal(verifier, jwt(pinned.signer, claimsFor(idp.issuer))), 'the token\'s algorithm does not match its signing key', 'RS256 on a key published for RS512 only');
  assert.equal(await refusal(verifier, jwt(small.signer, claimsFor(idp.issuer))), 'the token\'s key id is not among the issuer\'s signing keys', 'a 1024-bit RSA key is never loaded');
  assert.equal(await refusal(verifier, jwt(encryption.signer, claimsFor(idp.issuer))), 'the token\'s key id is not among the issuer\'s signing keys', 'an encryption key is never a signing key');
  assert.equal(await refusal(verifier, jwt({ ...rsa.signer, kid: undefined }, claimsFor(idp.issuer))), 'the token\'s key id is not among the issuer\'s signing keys', 'no kid with several keys');
  const valid = jwt(rsa.signer, claimsFor(idp.issuer));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = valid.at(-1)!;
  const aliased = `${valid.slice(0, -1)}${alphabet[alphabet.indexOf(last) ^ 1]}`;
  assert.equal(await refusal(verifier, aliased), 'the token\'s signature does not verify', 'a non-canonical base64url signature that decodes to the same bytes');
  const [head, body, signature] = valid.split('.');
  assert.equal(await refusal(verifier, `${head}=.${body}.${signature}`), 'the token is not a JWT', 'padding in a segment');
});

test('a lone key needs no kid, a foreign discovery issuer loads no keys, and an oversized key set is refused', async t => {
  const rsa = rsaSigner('only');
  const lone = await identityProvider([{ publicKey: rsa.publicKey }]);
  const foreign = await identityProvider([{ publicKey: rsa.publicKey, kid: 'only' }], { discoveryIssuer: 'https://elsewhere.example.test/' });
  const huge = await identityProvider([{ publicKey: rsa.publicKey, kid: 'only' }], { padKeySet: 1_100_000 });
  const streamed = await identityProvider([], { padKeySet: 1_100_000, chunked: true });
  t.after(async () => { await lone.close(); await foreign.close(); await huge.close(); await streamed.close(); });
  assert.match(await refusal(new AccessTokenVerifier(settingsFor(streamed.issuer)), jwt(rsa.signer, claimsFor(streamed.issuer))), /^KeysUnavailable: .*more than 1 MiB/, 'a key set streamed without a length is cut off at 1 MiB');
  assert.equal(await refusal(new AccessTokenVerifier(settingsFor(lone.issuer)), jwt({ ...rsa.signer, kid: undefined }, claimsFor(lone.issuer))), 'accepted');
  assert.match(await refusal(new AccessTokenVerifier(settingsFor(foreign.issuer)), jwt(rsa.signer, claimsFor(foreign.issuer))), /^KeysUnavailable: discovery names issuer "https:\/\/elsewhere/);
  assert.match(await refusal(new AccessTokenVerifier(settingsFor(huge.issuer)), jwt(rsa.signer, claimsFor(huge.issuer))), /^KeysUnavailable: .*more than 1 MiB/);
});

test('the endpoint caps a message at 1 MiB, and checks origin and method before looking anyone up', async t => {
  const { unfold, token } = await served(t);
  const big = await post(unfold.url, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { padding: 'x'.repeat(1_100_000) } }, { token: token() });
  assert.equal(big.status, 413);
  assert.equal(big.json.error.code, -32600);
  const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta(), padding: 'x'.repeat(1_100_000) } }));
  const stream = new ReadableStream({ start(controller) { for (let at = 0; at < payload.length; at += 65_536) controller.enqueue(payload.subarray(at, at + 65_536)); controller.close(); } });
  const chunked = await fetch(`${unfold.url}/mcp`, { method: 'POST', body: stream, duplex: 'half', headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}`, 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' } } as RequestInit);
  assert.equal(chunked.status, 413, 'a body streamed without a length is cut off at 1 MiB');
  const stranger = token({ sub: 'unknown-sub' });
  const foreign = await post(unfold.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { token: stranger, headers: { origin: 'https://evil.example.test' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.json.error.message, 'This request came from another origin.');
  assert.equal((await post(unfold.url, {}, { token: stranger, method: 'GET' })).status, 405);
});

test('an ask through unfold-mcp over HTTPS is recorded as mcp:<client> with the confirmation the person agreed to; a decline records nothing', async t => {
  const rsa = rsaSigner();
  const idp = await identityProvider([{ publicKey: rsa.publicKey, kid: 'rsa-1' }]);
  t.after(() => idp.close());
  const env = `UNFOLD_MCP_PLOEG_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  t.after(() => { delete process.env[env]; });
  const allowance = { purpose: 'ask', scopeKind: 'team', scopeId: 'delivery', periodStart: '2026-10-01T00:00:00Z', resetAt: '2026-11-01T00:00:00Z', limitUsd: 2, settledUsd: 0, heldUsd: 0, remainingUsd: 1.97, askCount: 0, askBudgetUsd: 0.02, asksEnabled: true };
  const admitted: { via: unknown; confirmation: unknown }[] = [];
  const listen = async (handler: Parameters<typeof createServer>[1]) => { const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise<void>(done => server.close(() => done()))); return `http://127.0.0.1:${(server.address() as { port: number }).port}`; };
  const ploegUrl = await listen(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const data = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (status: number, payload: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...payload }));
    const ask = (askId: string) => ({ askId, runId: '900', workItemId: '101', team: 'delivery', actor: 'x', askedBy: 'x', state: 'finished', budgetUsd: 0.02, questionSha256: 'a'.repeat(64), createdAt: '2026-10-16T10:00:00Z', expiresAt: '2026-10-16T10:02:00Z', finishedAt: null, spend: { costStatus: 'settled', usd: 0.0012, keyState: 'reconciled' } });
    if (url.pathname.endsWith('/teams')) return send(200, { teams: ploegDemo.teams });
    if (url.pathname.endsWith('/operator/allowances')) return send(200, { allowance });
    if (/\/work-items\/101\/asks$/.test(url.pathname) && req.method === 'POST') {
      admitted.push({ via: req.headers['x-ploeg-via'], confirmation: req.headers['x-ploeg-confirmation'] });
      return send(201, { created: true, ask: { ...ask(data.askId), state: 'open' }, credential: { key: 'sk-ask-capped', alias: 'ask-1', models: ['glm-5.3-flash'], budgetUsd: 0.02, expiresAt: '2026-10-16T10:02:00Z' }, allowance });
    }
    const one = /\/work-items\/101\/asks\/([^/]+)(\/finish)?$/.exec(url.pathname);
    if (one) return send(200, { ask: ask(decodeURIComponent(one[1])) });
    const detail = ploegDemo.details[url.pathname.split('/').at(-1)!];
    return detail ? send(200, detail) : send(404, { error: { code: 'not_found', message: 'no' } });
  });
  const gatewayUrl = await listen((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'Firefox is not affected.' } }] })); });
  const personId = subjectUserId(browserIssuer, 'person-sub');
  const unfold = await application('live', config => {
    config.baseUrl = undefined;
    (config.auth as any).oidc = { issuer: browserIssuer, clientId: 'unfold', scopes: ['openid'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } };
    config.mcp = settingsFor(idp.issuer);
    config.ploeg = { url: ploegUrl, tokenEnv: env, userTeams: { [personId]: ['delivery'] } };
    config.litellm = { baseUrl: gatewayUrl, adminUrl: gatewayUrl, masterKey: 'sk-master-never-used', models: ['coding'], ttl: '1h' };
  });
  t.after(() => unfold.close());
  unfold.app.store.addUser({ id: personId, name: 'person@example.com', role: 'operator', passwordHash: '' });
  const access = jwt(rsa.signer, claimsFor(idp.issuer));
  const clientMeta = { ...meta({ elicitation: {} }), 'io.modelcontextprotocol/clientInfo': { name: 'Claude Code', version: '2.1.296' } };
  const ask = (id: number, extra: Record<string, unknown> = {}) => post(unfold.url, { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'unfold_ask', arguments: { id: '101', question: 'Is Firefox affected?', use_model: true }, _meta: clientMeta, ...extra } }, { token: access });
  const records = () => unfold.app.store.actionRecords({ userId: personId, limit: 50 });

  const declinedState = (await ask(1)).json.result.requestState;
  const declined = await ask(2, { inputResponses: { confirm_spend: { action: 'decline' } }, requestState: declinedState });
  assert.equal(declined.json.result.structuredContent.asked, false, declined.text);
  assert.deepEqual(records(), [], 'a declined confirmation records no action at all');
  assert.equal(admitted.length, 0);

  const pending = (await ask(3)).json.result;
  assert.equal(pending.resultType, 'input_required');
  const agreed = `:${createHash('sha256').update(pending.inputRequests.confirm_spend.params.message).digest('hex')}`;
  const answered = await ask(4, { inputResponses: { confirm_spend: { action: 'accept', content: { confirm: true } } }, requestState: pending.requestState });
  assert.equal(answered.json.result.structuredContent.asked, true, answered.text);
  const [record] = records();
  assert.equal(records().length, 1);
  assert.deepEqual({ action: record.action, channel: record.channel, outcome: record.outcome, user: record.userId, target: record.target }, { action: 'POST /api/ploeg/work-items/:id/asks', channel: 'mcp:Claude Code 2.1.296', outcome: 'done', user: personId, target: { kind: 'work-item', id: '101' } });
  assert.ok(record.confirmation?.endsWith(agreed), `the record carries the hash of the exact text agreed to: ${record.confirmation}`);
  assert.deepEqual(admitted, [{ via: 'mcp:Claude Code 2.1.296', confirmation: record.confirmation }], 'Ploeg receives the same channel and confirmation');
});
