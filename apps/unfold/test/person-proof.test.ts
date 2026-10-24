import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { PersonProof, personProof, personTokenHeader, tokenExpiry, type SignInTokens } from '../src/person-proof.ts';
import { actionContext } from '../src/action-records.ts';
import { validatePloeg } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { application, configuration, request } from './api-support.ts';
import { provider, signIn } from './oidc-support.ts';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const jwt = (claims: Record<string, unknown>) => `${Buffer.from('{"alg":"RS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.c2lnbmF0dXJl`;
const exchangeGrant = 'urn:ietf:params:oauth:grant-type:token-exchange';

async function listen(t: TestContext, handler: (method: string, path: string, headers: IncomingHttpHeaders, body: string) => { status: number; body: unknown }): Promise<string> {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const answer = handler(req.method!, new URL(req.url!, 'http://fixture.invalid').pathname, req.headers, body);
    res.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

type Exchange = Record<string, string>;
async function exchangeServer(t: TestContext, options: { subject?: string; status?: () => number; lifetimeSeconds?: number } = {}) {
  const seen: Exchange[] = [];
  let issued = 0;
  const url = await listen(t, (method, _path, _headers, body) => {
    const params = Object.fromEntries(new URLSearchParams(body));
    seen.push(params);
    const status = options.status?.() ?? 200;
    if (status !== 200) return { status, body: { error: 'invalid_grant' } };
    issued += 1;
    const now = Math.floor(Date.now() / 1000);
    return { status: 200, body: { access_token: jwt({ iss: 'https://idp.example/', sub: options.subject ?? 'person-sub', aud: 'ploeg-for-unfold', azp: 'ploeg-for-unfold', iat: now, exp: now + (options.lifetimeSeconds ?? 300), n: issued }), issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', token_type: 'Bearer', expires_in: options.lifetimeSeconds ?? 300 } };
  });
  return { url: `${url}/application/o/token/`, seen };
}

function scratchStore(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'unfold-person-proof-'));
  const store = new Store(join(dir, 'unfold.sqlite'));
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.addUser({ id: 'oidc-person', name: 'person@example.com', role: 'operator', passwordHash: '' });
  return store;
}

function secretEnv(t: TestContext): string {
  const name = `UNFOLD_EXCHANGE_SECRET_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[name] = `exchange-secret-${randomBytes(16).toString('hex')}`;
  t.after(() => { delete process.env[name]; });
  return name;
}

function login(store: Store, userId = 'oidc-person', hours = 12): string {
  const signIn = digest(randomBytes(32).toString('hex'));
  store.createLogin(signIn, userId, new Date(Date.now() + hours * 3_600_000).toISOString());
  return signIn;
}

function captured<T>(work: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const error = console.error, log = console.log, warn = console.warn;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  console.log = console.error; console.warn = console.error;
  return work().then(value => ({ value, lines }), thrown => { throw thrown; }).finally(() => { console.error = error; console.log = log; console.warn = warn; });
}

function recordingPloeg(status = () => 200) {
  const calls: Record<string, string>[] = [];
  const call = async (headers: Record<string, string>) => { calls.push(headers); return new Response('{}', { status: status(), headers: { 'content-type': 'application/json' } }); };
  return { calls, call };
}

test('ploeg.personTokens is validated and stays off when absent', () => {
  const base = { url: 'https://ploeg.internal.example', tokenEnv: 'PLOEG_OPERATOR_UNFOLD_TOKEN' };
  assert.equal(validatePloeg(base, 'live')!.personTokens, undefined);
  const settings = { tokenUrl: 'https://authentik.example/application/o/token/', clientId: 'unfold-exchange', clientSecretEnv: 'UNFOLD_EXCHANGE_CLIENT_SECRET', audience: 'ploeg-for-unfold' };
  assert.deepEqual(validatePloeg({ ...base, personTokens: settings }, 'live')!.personTokens, settings);
  assert.throws(() => validatePloeg({ ...base, personTokens: { ...settings, clientSecret: 'inline' } }, 'live'), /Unknown ploeg.personTokens field/);
  assert.throws(() => validatePloeg({ ...base, personTokens: { ...settings, clientSecretEnv: 'lower-case' } }, 'live'), /clientSecretEnv must name an environment variable/);
  assert.throws(() => validatePloeg({ ...base, personTokens: { ...settings, tokenUrl: 'https://user:pw@authentik.example/token/' } }, 'live'), /without credentials/);
  assert.throws(() => validatePloeg({ ...base, personTokens: { ...settings, audience: 'two words' } }, 'live'), /audience/);
  assert.throws(() => validatePloeg({ url: base.url, demo: true, personTokens: settings }, 'demo'), /needs a real Ploeg/);
  const config = configuration('/unused', 'live');
  config.ploeg = base;
  assert.equal(personProof(config, undefined as never), undefined, 'no ploeg.personTokens, no person proof');
  config.ploeg = { ...base, personTokens: settings };
  assert.equal(personProof(config, undefined as never), undefined, 'no single sign-on, nothing to exchange');
});

test('the exchange request has the RFC 8693 shape and its token is cached until 30 seconds before it expires', async t => {
  const store = scratchStore(t);
  const idp = await exchangeServer(t, { lifetimeSeconds: 300 });
  const env = secretEnv(t);
  let now = Date.now();
  const proof = new PersonProof({ tokenUrl: idp.url, clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' }, store, { now: () => now });
  const signIn = login(store);
  const access = jwt({ sub: 'person-sub', exp: Math.floor(now / 1000) + 3600 });
  proof.remember(signIn, 'oidc-person', 'person-sub', { accessToken: access, expiresInSeconds: 3600 });
  const ploeg = recordingPloeg();
  await proof.send('oidc-person', 'oidc-person', ploeg.call);
  assert.deepEqual(idp.seen, [{ grant_type: exchangeGrant, client_id: 'unfold-exchange', client_secret: process.env[env]!, subject_token: access, subject_token_type: 'urn:ietf:params:oauth:token-type:access_token', audience: 'ploeg-for-unfold' }]);
  const first = ploeg.calls[0][personTokenHeader];
  assert.ok(first && first.split('.').length === 3);
  await proof.send('oidc-person', undefined, ploeg.call);
  assert.equal(idp.seen.length, 1, 'a second change within the token lifetime reuses it');
  assert.equal(ploeg.calls[1][personTokenHeader], first);
  now += 269_000;
  await proof.send('oidc-person', undefined, ploeg.call);
  assert.equal(idp.seen.length, 1, 'still more than 30 seconds left');
  now += 2_000;
  await proof.send('oidc-person', undefined, ploeg.call);
  assert.equal(idp.seen.length, 2, 'within 30 seconds of expiry a new token is exchanged');
  assert.notEqual(ploeg.calls[3][personTokenHeader], first);
  assert.equal(proof.status('oidc-person', signIn).state, 'proven');
});

test('an expired access token is refreshed when a refresh token is kept, and the refreshed tokens replace the old ones', async t => {
  const store = scratchStore(t);
  const idp = await exchangeServer(t);
  const env = secretEnv(t);
  const refreshed: string[] = [];
  const refresh = async (token: string): Promise<SignInTokens> => { refreshed.push(token); return { accessToken: 'fresh-access', refreshToken: 'rotated-refresh', expiresInSeconds: 3600 }; };
  const proof = new PersonProof({ tokenUrl: idp.url, clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' }, store, { refresh });
  const signIn = login(store);
  proof.remember(signIn, 'oidc-person', 'person-sub', { accessToken: jwt({ exp: Math.floor(Date.now() / 1000) - 5 }), refreshToken: 'first-refresh' });
  const ploeg = recordingPloeg();
  await proof.send('oidc-person', 'oidc-person', ploeg.call);
  assert.deepEqual(refreshed, ['first-refresh']);
  assert.equal(idp.seen[0].subject_token, 'fresh-access');
  assert.ok(ploeg.calls[0][personTokenHeader]);
  const kept = store.personGrant(signIn)!;
  assert.equal(kept.accessToken, 'fresh-access');
  assert.equal(kept.refreshToken, 'rotated-refresh');
});

test('a subject token the provider refuses is refreshed once and exchanged again', async t => {
  const store = scratchStore(t);
  let answers = [400, 200];
  const idp = await exchangeServer(t, { status: () => answers.shift() ?? 200 });
  const env = secretEnv(t);
  const proof = new PersonProof({ tokenUrl: idp.url, clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' }, store, { refresh: async () => ({ accessToken: 'second-access', expiresInSeconds: 3600 }) });
  const signIn = login(store);
  proof.remember(signIn, 'oidc-person', 'person-sub', { accessToken: 'first-access', refreshToken: 'refresh', expiresInSeconds: 3600 });
  const ploeg = recordingPloeg();
  await proof.send('oidc-person', 'oidc-person', ploeg.call);
  assert.deepEqual(idp.seen.map(entry => entry.subject_token), ['first-access', 'second-access']);
  assert.ok(ploeg.calls[0][personTokenHeader]);
});

test('without a refresh token an expired sign-in falls back to the asserted headers and the Status page says so', async t => {
  const store = scratchStore(t);
  const idp = await exchangeServer(t);
  const env = secretEnv(t);
  const proof = new PersonProof({ tokenUrl: idp.url, clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' }, store);
  const signIn = login(store);
  proof.remember(signIn, 'oidc-person', 'person-sub', { accessToken: 'old-access', expiresInSeconds: 10 });
  const status = proof.status('oidc-person', signIn);
  assert.equal(status.state, 'degraded');
  assert.equal(status.gap, 'expired');
  assert.match(status.summary, /named by Unfold, not proven\. Sign out and sign in again/);
  const ploeg = recordingPloeg();
  const { lines } = await captured(() => proof.send('oidc-person', 'oidc-person', ploeg.call));
  assert.equal(idp.seen.length, 0, 'an expired subject token is never sent');
  assert.deepEqual(ploeg.calls, [{}]);
  assert.ok(lines.some(line => line.includes('person_proof.degraded')));
  assert.equal(proof.status('oidc-person').gap, 'expired', 'without a browser login the newest login answers');
  const other = login(store);
  assert.equal(proof.status('oidc-person', other).gap, 'no_grant', 'a login without kept tokens proves nobody');
});

test('the token goes only with a change made by the person it proves, never for someone acting for another or through unfold-mcp over HTTP', async t => {
  const store = scratchStore(t);
  const idp = await exchangeServer(t);
  const env = secretEnv(t);
  const proof = new PersonProof({ tokenUrl: idp.url, clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' }, store);
  const signIn = login(store);
  proof.remember(signIn, 'oidc-person', 'person-sub', { accessToken: 'access', expiresInSeconds: 3600 });
  const ploeg = recordingPloeg();
  await proof.send('oidc-person', 'oidc-admin', ploeg.call);
  await proof.send('unfold-cards', undefined, ploeg.call);
  await actionContext.run({ via: 'mcp:claude-code', confirmation: null, scope: 'mcp' }, () => proof.send('oidc-person', undefined, ploeg.call));
  assert.deepEqual(ploeg.calls, [{}, {}, {}]);
  assert.equal(idp.seen.length, 0);
  await actionContext.run({ via: 'browser', confirmation: null, scope: 'browser', signIn }, () => proof.send('oidc-person', undefined, ploeg.call));
  assert.ok(ploeg.calls[3][personTokenHeader]);
});

test('a token for another subject is never sent, and a person token Ploeg refuses is retried once without it', async t => {
  const store = scratchStore(t);
  const stranger = await exchangeServer(t, { subject: 'someone-else' });
  const env = secretEnv(t);
  const settings = { clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' };
  const signIn = login(store);
  const mismatched = new PersonProof({ ...settings, tokenUrl: stranger.url }, store);
  mismatched.remember(signIn, 'oidc-person', 'person-sub', { accessToken: 'access', expiresInSeconds: 3600 });
  const ploeg = recordingPloeg();
  await captured(() => mismatched.send('oidc-person', undefined, ploeg.call));
  assert.deepEqual(ploeg.calls, [{}]);
  assert.equal(mismatched.status('oidc-person', signIn).gap, 'mismatch');

  const idp = await exchangeServer(t);
  const proof = new PersonProof({ ...settings, tokenUrl: idp.url }, store);
  proof.remember(signIn, 'oidc-person', 'person-sub', { accessToken: 'access', expiresInSeconds: 3600 });
  const answers = [401, 200];
  const refusing = recordingPloeg(() => answers.shift() ?? 200);
  const { value } = await captured(() => proof.send('oidc-person', undefined, refusing.call));
  assert.equal(value.status, 200);
  assert.equal(refusing.calls.length, 2);
  assert.ok(refusing.calls[0][personTokenHeader]);
  assert.deepEqual(refusing.calls[1], {});
  assert.equal(proof.status('oidc-person', signIn).gap, 'rejected');
});

test('an unreachable provider or a missing exchange secret degrades to asserted headers without throwing', async t => {
  const store = scratchStore(t);
  const env = secretEnv(t);
  const signIn = login(store);
  const down = new PersonProof({ tokenUrl: 'http://127.0.0.1:9/token/', clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' }, store);
  down.remember(signIn, 'oidc-person', 'person-sub', { accessToken: 'access', expiresInSeconds: 3600 });
  const ploeg = recordingPloeg();
  await captured(() => down.send('oidc-person', undefined, ploeg.call));
  assert.deepEqual(ploeg.calls, [{}]);
  assert.equal(down.status('oidc-person', signIn).gap, 'unreachable');
  const unset = new PersonProof({ tokenUrl: 'http://127.0.0.1:9/token/', clientId: 'unfold-exchange', clientSecretEnv: 'UNFOLD_EXCHANGE_SECRET_NEVER_SET', audience: 'ploeg-for-unfold' }, store);
  await captured(() => unset.send('oidc-person', undefined, ploeg.call));
  assert.equal(unset.status('oidc-person', signIn).gap, 'unconfigured');
});

test('kept tokens are encrypted at rest, bound to their login and deleted with it', async t => {
  const store = scratchStore(t);
  const env = secretEnv(t);
  const proof = new PersonProof({ tokenUrl: 'http://127.0.0.1:9/token/', clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' }, store);
  const signIn = login(store);
  const access = `access-${randomBytes(12).toString('hex')}`;
  const refresh = `refresh-${randomBytes(12).toString('hex')}`;
  proof.remember(signIn, 'oidc-person', 'person-sub', { accessToken: access, refreshToken: refresh, expiresInSeconds: 3600 });
  const rows = store.db.prepare("SELECT id, ciphertext FROM internal_state WHERE id LIKE 'person-grant:%'").all() as { id: string; ciphertext: string }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, `person-grant:${signIn}`);
  assert.ok(!rows[0].ciphertext.includes(access) && !Buffer.from(rows[0].ciphertext, 'base64').toString('latin1').includes(access));
  assert.ok(!Buffer.from(rows[0].ciphertext, 'base64').toString('latin1').includes(refresh));
  assert.equal(store.personGrant(signIn)?.refreshToken, refresh);
  assert.deepEqual(store.personGrantLogins('oidc-person'), [signIn]);
  store.deleteLogin(signIn);
  assert.equal(store.getSecret(`person-grant:${signIn}`), undefined, 'signing out deletes the kept tokens');
  const lapsed = login(store);
  proof.remember(lapsed, 'oidc-person', 'person-sub', { accessToken: access, expiresInSeconds: 3600 });
  store.db.prepare('UPDATE logins SET expires_at=? WHERE token_hash=?').run(new Date(Date.now() - 1000).toISOString(), lapsed);
  assert.equal(store.personGrant(lapsed), undefined, 'an expired login yields nothing');
  assert.equal(store.prunePersonGrants(), 1);
  assert.equal(store.getSecret(`person-grant:${lapsed}`), undefined, 'upkeep deletes the tokens of expired logins');
});

test('tokenExpiry takes the earlier of the JWT exp and expires_in, and five minutes when neither is known', () => {
  const now = 1_800_000_000_000;
  assert.equal(tokenExpiry(jwt({ exp: now / 1000 + 60 }), 3600, now), now + 60_000);
  assert.equal(tokenExpiry(jwt({ exp: now / 1000 + 3600 }), 120, now), now + 120_000);
  assert.equal(tokenExpiry('opaque', undefined, now), now + 300_000);
});

async function proofWorkbench(t: TestContext, options: { personTokens?: boolean } = {}) {
  const idp = await provider({ groups: ['unfold-admins'] });
  t.after(() => idp.close());
  const exchange = await exchangeServer(t, { subject: 'person@example.com' });
  const env = secretEnv(t);
  const ploegEnv = `UNFOLD_PROOF_PLOEG_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[ploegEnv] = randomBytes(24).toString('hex');
  t.after(() => { delete process.env[ploegEnv]; });
  const calls: { method: string; path: string; headers: IncomingHttpHeaders }[] = [];
  const ploegUrl = await listen(t, (method, path, headers) => {
    calls.push({ method, path, headers });
    const envelope = (data: object) => ({ status: 200, body: { schemaVersion: '1.0', ...data } });
    if (path.endsWith('/teams')) return envelope({ teams: ploegDemo.teams });
    const step = /\/work-items\/(\d+)\/(approve|reject)$/.exec(path);
    if (method === 'POST' && step) return envelope({ decision: { workItemId: step[1], team: (ploegDemo.details as Record<string, any>)[step[1]].item.team, state: step[2] === 'approve' ? 'queued' : 'withdrawn' } });
    const id = path.split('/').at(-1)!;
    const detail = (ploegDemo.details as Record<string, any>)[id];
    return detail ? envelope(detail) : { status: 404, body: { schemaVersion: '1.0', error: { code: 'not_found', message: 'No such Work Item.' } } };
  });
  const server = await application('live', config => {
    config.baseUrl = undefined;
    (config.auth as any).oidc = { issuer: idp.issuer, clientId: 'unfold', scopes: ['openid', 'email', 'profile'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } };
    config.ploeg = { url: ploegUrl, tokenEnv: ploegEnv, teams: ['delivery'], ...(options.personTokens === false ? {} : { personTokens: { tokenUrl: exchange.url, clientId: 'unfold-exchange', clientSecretEnv: env, audience: 'ploeg-for-unfold' } }) };
  });
  t.after(() => server.close());
  const signedIn = await signIn(server, idp);
  assert.equal(signedIn.callback.status, 303);
  const cookie = signedIn.callback.headers.get('set-cookie')!.split(';')[0];
  return { server, idp, exchange, calls, cookie, secret: process.env[env]! };
}

const proposed = Object.entries(ploegDemo.details as Record<string, any>).find(([, detail]) => detail.item.state === 'proposed' && detail.item.team === 'delivery')![0];

test('a signed-in person’s Ploeg changes carry their exchanged token, reads do not, and no token reaches the browser', async t => {
  const { server, exchange, calls, cookie, secret } = await proofWorkbench(t);
  const user = server.app.store.getUserByName('person@example.com')!;
  const logins = server.app.store.personGrantLogins(user.id);
  assert.equal(logins.length, 1, 'sign-in keeps the access token for this login');
  assert.equal(server.app.store.personGrant(logins[0])!.accessToken, 'at');
  const { value: results, lines } = await captured(async () => {
    const read = await request(server.url, `/api/ploeg/work-items/${proposed}`, { cookie });
    const approve = await request(server.url, `/api/ploeg/work-items/${proposed}/approve`, { method: 'POST', cookie, body: {} });
    const status = await request(server.url, '/api/status', { cookie });
    return { read, approve, status };
  });
  assert.equal(results.read.status, 200, results.read.text);
  assert.equal(results.approve.status, 200, results.approve.text);
  assert.equal(exchange.seen.length, 1);
  assert.equal(exchange.seen[0].subject_token, 'at');
  const posts = calls.filter(call => call.method === 'POST');
  const gets = calls.filter(call => call.method === 'GET');
  assert.equal(posts.length, 1);
  const sent = posts[0].headers['x-ploeg-person-token'] as string;
  assert.ok(sent && sent.split('.').length === 3);
  assert.equal(posts[0].headers['x-ploeg-actor'], user.id, 'the asserted headers still name the same person');
  assert.ok(gets.length > 0 && gets.every(call => call.headers['x-ploeg-person-token'] === undefined), 'reads stay as they were');
  assert.equal(results.status.body.personProof.state, 'proven');
  for (const text of [results.read.text, results.approve.text, results.status.text, ...lines]) {
    assert.ok(!text.includes(sent), 'the Ploeg token never reaches a response or a log');
    assert.ok(!text.includes(secret), 'the exchange secret never does either');
  }
  const logout = await request(server.url, '/api/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 200);
  assert.deepEqual(server.app.store.personGrantLogins(user.id), [], 'signing out deletes the kept tokens');
  assert.equal(server.app.store.db.prepare("SELECT COUNT(*) AS n FROM internal_state WHERE id LIKE 'person-grant:%'").get()!.n, 0);
});

test('without ploeg.personTokens sign-in keeps no tokens and changes go out exactly as before', async t => {
  const { server, exchange, calls, cookie } = await proofWorkbench(t, { personTokens: false });
  assert.equal(server.app.store.db.prepare("SELECT COUNT(*) AS n FROM internal_state WHERE id LIKE 'person-grant:%'").get()!.n, 0);
  const approve = await request(server.url, `/api/ploeg/work-items/${proposed}/approve`, { method: 'POST', cookie, body: {} });
  assert.equal(approve.status, 200, approve.text);
  assert.equal(exchange.seen.length, 0);
  assert.ok(calls.every(call => call.headers['x-ploeg-person-token'] === undefined));
  const status = await request(server.url, '/api/status', { cookie });
  assert.equal(status.body.personProof, undefined);
});
