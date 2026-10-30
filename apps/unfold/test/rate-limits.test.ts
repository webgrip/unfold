import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/auth.ts';
import { RateLimiter, defaultRateLimits, isSignIn, personLimits, rateLimitSettings, type RateLimits } from '../src/rate-limits.ts';
import { application, login, request } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

const tight = (overrides: Partial<RateLimits>): RateLimits => ({ ...rateLimitSettings(undefined), ...overrides });

test('each route counts against the limits its cost calls for', () => {
  const table: [string, string, string[]][] = [
    ['GET', '/api/sessions', []],
    ['GET', '/api/ploeg/work-items/42', []],
    ['POST', '/api/sessions', ['mutation']],
    ['DELETE', '/api/now/snoozes', ['mutation']],
    ['PUT', '/api/flags/now.loop/choice', ['mutation']],
    ['POST', '/api/ploeg/work-items/42/asks', ['mutation', 'ask']],
    ['GET', '/api/ploeg/work-items/42/asks', []],
    ['POST', '/api/card-art/generate', ['mutation', 'ask']],
    ['GET', '/api/ploeg/cost-export', ['export']],
    ['GET', '/api/admin/flags/export', ['export']],
    ['POST', '/api/admin/tenant-exports', ['mutation', 'export']],
    ['GET', '/api/admin/tenant-exports/0123456789abcdef0123456789abcdef/download', ['export']],
    ['GET', '/api/admin/tenant-exports', []],
    ['GET', '/api/billing/lines', ['export']],
    ['POST', '/api/billing/sync', ['mutation', 'export']],
    ['GET', '/api/sessions/abc/candidate/download', ['export']],
    ['GET', '/api/sessions/abc/delivery/download', ['export']],
    ['GET', '/api/linked-sessions/abcdefgh/agent-trace', ['export']],
    ['POST', '/api/ofrep/v1/evaluate/flags', []],
    ['POST', '/api/ofrep/v1/evaluate/flags/now.loop', []],
    ['POST', '/api/linked-sessions/abcdefgh/conversation/wants', []],
    ['POST', '/api/linked-sessions/abcdefgh/conversation/answers/0f0e0d0c-0b0a-0908-0706-050403020100', ['mutation']],
  ];
  for (const [method, path, expected] of table) assert.deepEqual(personLimits(method, path), expected, `${method} ${path}`);
  for (const [method, path] of [['POST', '/api/login'], ['POST', '/api/auth/editor'], ['GET', '/api/auth/oidc'], ['GET', '/api/auth/oidc/callback'], ['GET', '/api/links/forgejo/callback']]) assert(isSignIn(method, path), `${method} ${path}`);
  for (const [method, path] of [['GET', '/api/login'], ['POST', '/api/auth/editor/abcdefgh'], ['POST', '/api/logout']]) assert(!isSignIn(method, path), `${method} ${path}`);
});

test('rateLimits takes a rate per limit, defaults the rest and refuses anything else', () => {
  assert.deepEqual(rateLimitSettings(undefined), defaultRateLimits);
  assert.deepEqual(rateLimitSettings({ ask: { perMinute: 2, burst: 1 } }).ask, { perMinute: 2, burst: 1 });
  assert.deepEqual(rateLimitSettings({ ask: { perMinute: 2 } }).ask, { perMinute: 2, burst: defaultRateLimits.ask.burst });
  assert.deepEqual(rateLimitSettings({ ask: {} }).mutation, defaultRateLimits.mutation);
  assert.throws(() => rateLimitSettings({ everything: { perMinute: 1, burst: 1 } }), /rateLimits takes mutation, ask, export, scim, mcp, webhook, signIn/);
  assert.throws(() => rateLimitSettings([]), /rateLimits takes/);
  assert.throws(() => rateLimitSettings(null), /rateLimits takes/);
  assert.throws(() => rateLimitSettings({ ask: { perMinute: 0, burst: 1 } }), /rateLimits\.ask\.perMinute must be a whole number/);
  assert.throws(() => rateLimitSettings({ export: { perMinute: 1, burst: 1.5 } }), /rateLimits\.export\.burst must be a whole number/);
  assert.throws(() => rateLimitSettings({ scim: { perMinute: 1, burst: 1, window: 1 } }), /rateLimits\.scim takes perMinute and burst/);
});

test('the limiter counts each subject and limit on its own and answers the longest wait', () => {
  let now = 0;
  const limiter = new RateLimiter(tight({ mutation: { perMinute: 60, burst: 2 }, ask: { perMinute: 6, burst: 1 } }), () => now);
  assert.equal(limiter.take(['mutation', 'ask'], 'user:a'), undefined);
  assert.deepEqual(limiter.take(['mutation', 'ask'], 'user:a'), { limit: 'ask', retryAfter: 10 });
  assert.deepEqual(limiter.take(['mutation'], 'user:a'), { limit: 'mutation', retryAfter: 1 });
  assert.equal(limiter.take(['mutation', 'ask'], 'user:b'), undefined, 'another person has their own buckets');
  now += 10_000;
  assert.equal(limiter.take(['mutation', 'ask'], 'user:a'), undefined, 'the buckets refill with time');
});

test('a person past the mutation limit gets 429 with Retry-After, while reads and other people carry on', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('live', config => { config.rateLimits = tight({ mutation: { perMinute: 1, burst: 3 } }); });
  t.after(() => server.close());
  server.app.store.addUser({ id: 'bob', name: 'bob', role: 'operator', passwordHash: await hashPassword('test-user-password-271828') });
  const admin = await login(server.url);
  const bob = await login(server.url, 'bob', 'test-user-password-271828');
  for (let attempt = 0; attempt < 3; attempt++) assert.notEqual((await request(server.url, '/api/reports/seen', { method: 'POST', cookie: admin.cookie })).status, 429);
  const refused = await request(server.url, '/api/reports/seen', { method: 'POST', cookie: admin.cookie });
  assert.equal(refused.status, 429, refused.text);
  assert.equal(refused.body.error.code, 'rate_limited');
  assert.equal(refused.body.error.limit, 'mutation');
  assert.equal(refused.response.headers.get('retry-after'), '60');
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: admin.cookie })).status, 200, 'a read is not a mutation');
  assert.notEqual((await request(server.url, '/api/reports/seen', { method: 'POST', cookie: bob.cookie })).status, 429, 'bob has his own bucket');
  assert.equal((await request(server.url, '/api/reports/seen', { method: 'POST' })).status, 401, 'an anonymous request is refused for its missing sign-in, not counted');
});

test('Asks and exports have their own, smaller limits', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('live', config => { config.rateLimits = tight({ ask: { perMinute: 1, burst: 1 }, export: { perMinute: 2, burst: 1 } }); });
  t.after(() => server.close());
  const admin = await login(server.url);
  const ask = () => request(server.url, '/api/ploeg/work-items/42/asks', { method: 'POST', cookie: admin.cookie, body: { question: 'Why did this stop?' } });
  assert.notEqual((await ask()).status, 429);
  const refusedAsk = await ask();
  assert.equal(refusedAsk.status, 429, refusedAsk.text);
  assert.equal(refusedAsk.body.error.limit, 'ask');
  const exported = () => request(server.url, '/api/admin/flags/export', { cookie: admin.cookie });
  assert.equal((await exported()).status, 200);
  const refusedExport = await exported();
  assert.equal(refusedExport.status, 429, refusedExport.text);
  assert.equal(refusedExport.body.error.limit, 'export');
  assert.equal(refusedExport.response.headers.get('retry-after'), '30');
});

test('sign-ins are counted per client address, which honours X-Forwarded-For only from trusted proxies', { timeout: testTimeout(15_000) }, async t => {
  const limited = (trusted: boolean) => application('live', config => { config.rateLimits = tight({ signIn: { perMinute: 1, burst: 2 } }); if (trusted) config.trustedProxies = ['127.0.0.1', '::1']; });
  const attempt = (url: string, from: string) => request(url, '/api/login', { method: 'POST', headers: { 'x-forwarded-for': from }, body: { name: 'nobody', password: 'wrong-password' } });
  const trusted = await limited(true);
  t.after(() => trusted.close());
  assert.equal((await attempt(trusted.url, '198.51.100.7')).status, 401);
  assert.equal((await attempt(trusted.url, '198.51.100.7')).status, 401);
  const refused = await attempt(trusted.url, '198.51.100.7');
  assert.equal(refused.status, 429, refused.text);
  assert.equal(refused.body.error.limit, 'signIn');
  assert.equal((await attempt(trusted.url, '198.51.100.8')).status, 401, 'another address has its own bucket');
  const untrusted = await limited(false);
  t.after(() => untrusted.close());
  await attempt(untrusted.url, '198.51.100.7');
  await attempt(untrusted.url, '198.51.100.8');
  assert.equal((await attempt(untrusted.url, '198.51.100.9')).status, 429, 'without trustedProxies every forwarded address is the one peer');
});

test('SCIM and the public webhook receivers are limited per address before they read the request', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('live', config => { config.rateLimits = tight({ scim: { perMinute: 1, burst: 1 }, webhook: { perMinute: 1, burst: 1 } }); });
  t.after(() => server.close());
  const scim = () => fetch(`${server.url}/scim/v2/Users`, { headers: { authorization: 'Bearer not-the-token' } });
  assert.notEqual((await scim()).status, 429);
  const refusedScim = await scim();
  assert.equal(refusedScim.status, 429);
  assert.match(refusedScim.headers.get('content-type') ?? '', /^application\/scim\+json/);
  assert.equal(refusedScim.headers.get('retry-after'), '60');
  const scimError = await refusedScim.json() as { schemas: string[]; status: string };
  assert.deepEqual(scimError.schemas, ['urn:ietf:params:scim:api:messages:2.0:Error']);
  assert.equal(scimError.status, '429');
  const slack = () => fetch(`${server.url}/api/notifications/channels/slack/interactions`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'payload=%7B%7D' });
  assert.notEqual((await slack()).status, 429);
  const refusedSlack = await slack();
  assert.equal(refusedSlack.status, 429);
  assert.equal((await refusedSlack.json() as { error: { limit: string } }).error.limit, 'webhook');
});
