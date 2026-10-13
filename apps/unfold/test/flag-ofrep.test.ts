import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { checkRegistry, FeatureFlags, flagSettings } from '../src/flags.ts';
import { clientContext, contextKey, ofrepBulk, OfrepProvider } from '../src/flag-ofrep.ts';

const meta = { kind: 'release', owner: 'Test', created: '2026-10-13', expires: '2027-01-13', title: 'A flag', description: 'For tests.', client: true, labs: false };
const registry = () => checkRegistry({ flags: {
  'work.remote': { state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'off', metadata: meta },
  'work.local': { state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'on', metadata: meta },
} });
const quiet = () => {};

type Answer = (req: IncomingMessage, body: any) => { status: number; body?: unknown; headers?: Record<string, string> };

async function ofrepServer(answer: Answer) {
  const calls: { headers: IncomingMessage['headers']; body: any; path: string }[] = [];
  const server = createServer(async (req, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    calls.push({ headers: req.headers, body, path: req.url ?? '' });
    const result = answer(req, body);
    res.writeHead(result.status, { 'content-type': 'application/json', ...result.headers });
    res.end(result.body === undefined ? '' : JSON.stringify(result.body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, calls, close: () => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }) };
}

test('a remote OFREP service answers known flags, the in-process evaluator answers the rest, and the bulk answer is cached and revalidated', async t => {
  process.env.TEST_OFREP_KEY = 'secret-key-123';
  const remote = await ofrepServer((req, body) => {
    if (req.headers['if-none-match'] === '"v1"') return { status: 304 };
    return { status: 200, headers: { etag: '"v1"' }, body: { flags: [{ key: 'work.remote', value: body.context.targetingKey === 'ann', reason: 'TARGETING_MATCH', variant: body.context.targetingKey === 'ann' ? 'on' : 'off', metadata: { flagSetId: 'unfold' } }] } };
  });
  t.after(() => remote.close());
  let now = Date.parse('2026-10-13T12:00:00Z');
  const settings = flagSettings({ providers: [{ kind: 'ofrep', name: 'flagd-remote', url: remote.url, apiKeyEnv: 'TEST_OFREP_KEY', cacheMs: 1000 }] }, registry(), {});
  const flags = new FeatureFlags({ registry: registry(), settings, now: () => new Date(now), log: quiet });
  const ann = await flags.getBooleanDetails('work.remote', false, { targetingKey: 'ann' });
  assert.deepEqual({ value: ann.value, reason: ann.reason, variant: ann.variant, provider: ann.flagMetadata.provider, set: ann.flagMetadata.flagSetId }, { value: true, reason: 'TARGETING_MATCH', variant: 'on', provider: 'flagd-remote', set: 'unfold' });
  assert.equal(remote.calls[0].path, '/ofrep/v1/evaluate/flags');
  assert.equal(remote.calls[0].headers['x-api-key'], 'secret-key-123');
  assert.deepEqual(remote.calls[0].body, { context: { targetingKey: 'ann' } });
  const local = await flags.getBooleanDetails('work.local', false, { targetingKey: 'ann' });
  assert.deepEqual([local.value, local.flagMetadata.provider], [true, 'flagd'], 'FLAG_NOT_FOUND at the remote falls through under first-match');
  assert.equal(remote.calls.length, 1, 'one bulk call per context while the cache is fresh');
  now += 2000;
  assert.equal(await flags.getBooleanValue('work.remote', false, { targetingKey: 'ann' }), true);
  assert.equal(remote.calls.length, 2);
  assert.equal(remote.calls[1].headers['if-none-match'], '"v1"', 'an expired cache revalidates with its ETag, and a 304 keeps it');
  assert.equal(await flags.getBooleanValue('work.remote', true, { targetingKey: 'bob' }), false, 'another context is its own bulk call');
  assert.equal(flags.providerStatus()[0].ready, true);
});

test('a refused credential stops the remote provider, a 429 waits, and first-successful falls back to the in-process rules', async t => {
  let mode: 'refuse' | 'busy' | 'down' = 'refuse';
  const remote = await ofrepServer(() => mode === 'refuse' ? { status: 401, body: {} } : mode === 'busy' ? { status: 429, headers: { 'retry-after': '120' }, body: {} } : { status: 500, body: {} });
  t.after(() => remote.close());
  const lines: string[] = [];
  const refusing = new FeatureFlags({ registry: registry(), settings: flagSettings({ providers: [{ kind: 'ofrep', url: remote.url }], strategy: 'first-successful' }, registry(), {}), log: line => lines.push(line) });
  assert.equal(await refusing.getBooleanValue('work.remote', true, { targetingKey: 'a' }), false, 'the in-process default answers');
  await refusing.getBooleanValue('work.remote', true, { targetingKey: 'b' });
  assert.equal(remote.calls.length, 1, 'no further calls after a 401');
  assert.match(refusing.providerStatus()[0].error, /refused the credentials/);
  assert.ok(lines.some(line => line.includes('flag.provider_refused')));

  mode = 'busy';
  const before = remote.calls.length;
  const busy = new FeatureFlags({ registry: registry(), settings: flagSettings({ providers: [{ kind: 'ofrep', url: remote.url, cacheMs: 0 }], strategy: 'first-successful' }, registry(), {}), log: quiet });
  await busy.getBooleanValue('work.remote', true, { targetingKey: 'a' });
  await busy.getBooleanValue('work.remote', true, { targetingKey: 'a' });
  assert.equal(remote.calls.length - before, 1, 'Retry-After holds further calls');

  mode = 'down';
  const strict = new FeatureFlags({ registry: registry(), settings: flagSettings({ providers: [{ kind: 'ofrep', url: remote.url, cacheMs: 0 }], strategy: 'first-match' }, registry(), {}), log: quiet });
  const failed = await strict.getBooleanDetails('work.remote', true, { targetingKey: 'a' });
  assert.deepEqual([failed.value, failed.reason, failed.errorCode], [true, 'ERROR', 'GENERAL'], 'first-match returns the remote error with the caller default');
});

test('a remote value of the wrong type is a TYPE_MISMATCH, and a remote without a value defers to the code default', async () => {
  const provider = new OfrepProvider({ kind: 'ofrep', name: 'r', url: 'http://flags.invalid', timeoutMs: 1000, cacheMs: 1000 }, { fetcher: async () => new Response(JSON.stringify({ flags: [{ key: 'a', value: 'yes', reason: 'STATIC' }, { key: 'b', reason: 'DISABLED' }, { key: 'c', errorCode: 'TARGETING_KEY_MISSING', errorDetails: 'no key' }] }), { status: 200 }) });
  assert.equal((await provider.resolveBooleanEvaluation('a', false, {})).errorCode, 'TYPE_MISMATCH');
  assert.deepEqual(await provider.resolveBooleanEvaluation('b', true, {}).then(r => [r.value, r.reason]), [true, 'DISABLED']);
  assert.deepEqual(await provider.resolveBooleanEvaluation('c', true, {}).then(r => [r.errorCode, r.errorMessage]), ['TARGETING_KEY_MISSING', 'no key']);
});

test('the server side of OFREP keeps the signed-in person\'s attributes, and its bulk ETag changes only with the answer', () => {
  assert.deepEqual(clientContext({ targetingKey: 'someone-else', role: 'admin', screen: 'work', version: '0.4.0', nested: { a: 1 }, 'bad key': 1 }), { screen: 'work', version: '0.4.0' });
  const one = ofrepBulk([{ flagKey: 'a', value: true, variant: 'on', reason: 'STATIC', flagMetadata: { provider: 'flagd', source: 'code' } }]);
  assert.deepEqual(one.body, { flags: [{ key: 'a', value: true, reason: 'STATIC', variant: 'on', metadata: { provider: 'flagd' } }] });
  assert.equal(ofrepBulk([{ flagKey: 'a', value: true, variant: 'on', reason: 'STATIC', flagMetadata: { provider: 'flagd' } }]).etag, one.etag);
  assert.notEqual(ofrepBulk([{ flagKey: 'a', value: false, variant: 'off', reason: 'STATIC', flagMetadata: {} }]).etag, one.etag);
  assert.equal(contextKey({ b: 1, a: [2] }), contextKey({ a: [2], b: 1 }));
});
