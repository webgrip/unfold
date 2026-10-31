import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { hashPassword } from '../src/auth.ts';
import { Store } from '../src/store.ts';
import { IntakeService, IntakeStore } from '../src/intake/service.ts';
import { standardWebhookSignature } from '../src/intake/signatures.ts';
import type { AppConfig, User } from '../src/types.ts';
import { clientAddress } from '../src/client-address.ts';
import { application, login, request } from './api-support.ts';

type Json = Record<string, any>;
const payloads = JSON.parse(readFileSync(new URL('./fixtures/intake/payloads.json', import.meta.url), 'utf8')) as Json;

async function workbench(t: TestContext, flag = true, configure?: (config: AppConfig) => void) {
  const server = await application('live', config => {
    config.baseUrl = 'https://unfold.example';
    configure?.(config);
    if (flag) config.flags = { document: { flags: { 'intake.requests': { defaultVariant: 'on' } } }, unknown: [] };
  });
  t.after(() => server.close());
  const admin = (await login(server.url)).cookie;
  const password = randomBytes(24).toString('hex');
  server.app.store.addUser({ id: 'vera', name: 'vera', role: 'viewer', passwordHash: await hashPassword(password) });
  const viewer = (await login(server.url, 'vera', password)).cookie;
  return { server, url: server.url, admin, viewer };
}

async function deliver(url: string, source: string, body: string, headers: Record<string, string>) {
  const response = await fetch(`${url}/api/intake/${source}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  return { status: response.status, body: await response.json() as Json };
}

function signed(secret: string, id: string, body: string, at = Math.floor(Date.now() / 1000)) {
  return { 'webhook-id': id, 'webhook-timestamp': String(at), 'webhook-signature': standardWebhookSignature(secret, id, at, body) };
}

test('a signed delivery becomes a Request; a bad signature, an old timestamp and a replay are refused or answered once', async t => {
  const { server, url, admin, viewer } = await workbench(t);
  const created = await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'site-form', name: 'Site form', tenant: 'default', client: 'acme', template: 'form' } });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.source.url, 'https://unfold.example/api/intake/site-form');
  assert.equal(created.body.source.verifier, 'standard-webhooks');
  const secret: string = created.body.secret;
  assert.match(secret, /^whsec_/);
  assert.equal((await request(url, '/api/intake/sources', { cookie: admin })).body.sources[0].secret, undefined, 'the secret is shown once, at creation');
  assert.equal((await request(url, '/api/intake/sources', { method: 'POST', cookie: viewer, body: { id: 'nope', tenant: 'default', template: 'form' } })).status, 403);

  const body = JSON.stringify(payloads.form);
  const first = await deliver(url, 'site-form', body, signed(secret, 'msg_1', body));
  assert.deepEqual([first.status, first.body.outcome], [201, 'created']);
  const replay = await deliver(url, 'site-form', body, signed(secret, 'msg_1', body));
  assert.deepEqual([replay.status, replay.body], [200, { replayed: true, outcome: 'created', request: first.body.request }]);
  const resent = await deliver(url, 'site-form', body, signed(secret, 'msg_2', body));
  assert.deepEqual([resent.status, resent.body.outcome, resent.body.request], [200, 'duplicate', first.body.request], 'a new delivery id with the same external id is the same Request');

  const forged = await deliver(url, 'site-form', body, signed(`whsec_${randomBytes(32).toString('base64')}`, 'msg_3', body));
  assert.deepEqual([forged.status, forged.body.error.code], [401, 'signature_invalid']);
  const stale = Math.floor(Date.now() / 1000) - 600;
  const old = await deliver(url, 'site-form', body, signed(secret, 'msg_4', body, stale));
  assert.deepEqual([old.status, old.body.error.code], [401, 'timestamp_outside_window']);
  const unsigned = await deliver(url, 'site-form', body, {});
  assert.deepEqual([unsigned.status, unsigned.body.error.code], [401, 'signature_missing']);
  assert.equal((await deliver(url, 'no-such-source', body, signed(secret, 'msg_5', body))).status, 404);

  const listed = await request(url, '/api/intake/requests', { cookie: viewer });
  assert.equal(listed.status, 200, listed.text);
  assert.equal(listed.body.requests.length, 1);
  const stored = listed.body.requests[0];
  assert.deepEqual([stored.tenant, stored.client, stored.state, stored.title, stored.links, stored.reporter.email], ['default', 'acme', 'new', 'The checkout button does nothing', ['https://example.com/checkout'], 'jane@example.com']);

  const rotated = await request(url, '/api/intake/sources/site-form/secret', { method: 'POST', cookie: admin, body: {} });
  assert.equal(rotated.status, 200, rotated.text);
  assert.equal((await deliver(url, 'site-form', body, signed(secret, 'msg_6', body))).status, 401, 'the old secret stops working');

  assert.deepEqual(server.app.store.listSessions(), [], 'no delivery started a session or a Run');
  const actions = await request(url, '/api/actions', { cookie: admin });
  assert.deepEqual(actions.body.actions.map((entry: Json) => `${entry.userName} ${entry.action} ${entry.outcome}`).sort(), ['admin POST /api/intake/sources done', 'admin POST /api/intake/sources/site-form/secret done', 'vera POST /api/intake/sources refused'], 'administration is an Action Record; deliveries are not a person\'s action');
});

test('a token source accepts the token in a header and refuses a wrong one; an event the template skips is acknowledged', async t => {
  const { url, admin } = await workbench(t);
  const created = await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'userback', tenant: 'default', template: 'userback' } });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.source.verifier, 'token');
  const token = created.body.secret;
  const ok = await deliver(url, 'userback', JSON.stringify(payloads.userback), { 'x-unfold-intake-token': token });
  assert.equal(ok.status, 201);
  assert.equal((await deliver(url, 'userback', JSON.stringify(payloads.userback), { 'x-unfold-intake-token': 'x'.repeat(43) })).status, 401);
  const skipped = await deliver(url, 'userback', JSON.stringify({ ...payloads.userback, action: 'update' }), { 'x-unfold-intake-token': token });
  assert.deepEqual([skipped.status, skipped.body.outcome], [202, 'ignored']);
  const custom = await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'custom', tenant: 'default', template: 'custom', mapping: { fields: { title: { eval: 'process.exit()' } } } } });
  assert.deepEqual([custom.status, custom.body.error.code], [400, 'intake_mapping']);
  const zendesk = await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'zendesk', tenant: 'default', template: 'zendesk' } });
  assert.deepEqual([zendesk.status, zendesk.body.error.code], [400, 'intake_secret'], 'a vendor-signed source needs the vendor\'s secret');
});

const mime = (lines: string[]) => lines.join('\r\n');

test('an email source threads a reply onto the Request it answers and never sends anything back', async t => {
  const { server, url, admin } = await workbench(t);
  const created = await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'mail-acme', kind: 'email', tenant: 'default', client: 'acme', verifier: 'token', address: 'requests+acme@agency.example', senders: ['acme.example'] } });
  assert.equal(created.status, 201, created.text);
  const token = created.body.secret;
  const post = (content: string, type = 'message/rfc822') => fetch(`${url}/api/intake/mail-acme`, { method: 'POST', headers: { 'content-type': type, authorization: `Bearer ${token}` }, body: content }).then(async response => ({ status: response.status, body: await response.json() as Json }));
  const first = await post(mime(['From: Jane <jane@acme.example>', 'Subject: Kapotte knop', 'Message-ID: <one@acme.example>', 'Content-Type: text/html; charset=utf-8', '', '<p>De <b>knop</b> doet niets.</p><script>x()</script>', '']));
  assert.deepEqual([first.status, first.body.outcome], [201, 'created']);
  const reply = await post(JSON.stringify({ From: 'jane@acme.example', Subject: 'Re: Kapotte knop', TextBody: 'Ook op Safari.\n\nOp do 29 okt 2026 schreef Agency <a@agency.example>:\n> eerder', Headers: [{ Name: 'Message-ID', Value: '<two@acme.example>' }, { Name: 'In-Reply-To', Value: '<one@acme.example>' }], Attachments: [{ Name: 'safari.png', Content: 'aGk=' }] }), 'application/json');
  assert.deepEqual([reply.status, reply.body.outcome, reply.body.request], [200, 'threaded', first.body.request]);
  assert.equal((await post(mime(['From: jane@acme.example', 'Subject: Kapotte knop', 'Message-ID: <one@acme.example>', '', 'again']))).body.outcome, 'duplicate');
  const stranger = await post(mime(['From: spam@elsewhere.example', 'Subject: Buy', 'Message-ID: <s@elsewhere.example>', '', 'x']));
  assert.deepEqual([stranger.status, stranger.body.reason], [202, 'sender_not_allowed']);
  const found = await request(url, `/api/intake/requests/${first.body.request}`, { cookie: admin });
  assert.equal(found.status, 200, found.text);
  const stored = found.body.request;
  assert.deepEqual([stored.channel, stored.title, stored.description, stored.reporter], ['email', 'Kapotte knop', 'De knop doet niets.', { name: 'Jane', email: 'jane@acme.example' }]);
  assert.deepEqual(stored.messages.map((entry: Json) => entry.text), ['De knop doet niets.', 'Ook op Safari.']);
  assert.deepEqual(stored.attachments, [{ name: 'safari.png' }]);
  assert.deepEqual(server.app.store.listSessions(), []);
});

test('with the flag off a source is not found and the Settings routes say the intake is off', async t => {
  const { url, admin } = await workbench(t, false);
  const listed = await request(url, '/api/intake/sources', { cookie: admin });
  assert.deepEqual([listed.status, listed.body.error.code], [404, 'intake_off']);
  assert.equal((await deliver(url, 'anything', '{}', {})).status, 404);
});

test('Requests and sources are scoped by Tenant and Client while tenancy is enforced', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-intake-'));
  const store = new Store(join(directory, 'unfold.sqlite'));
  t.after(async () => { store.db.close(); await rm(directory, { recursive: true, force: true }); });
  const intake = new IntakeService(new IntakeStore(store), { enforced: true, enabled: async () => true });
  const agencyAdmin: User = { id: 'ada', name: 'ada', role: 'admin', memberships: [{ kind: 'tenant', tenant: 'agency', role: 'admin' }] };
  const otherAdmin: User = { id: 'oto', name: 'oto', role: 'admin', memberships: [{ kind: 'tenant', tenant: 'other', role: 'admin' }] };
  const acme: User = { id: 'cli', name: 'cli', role: 'viewer', memberships: [{ kind: 'client', tenant: 'agency', client: 'acme' }] };
  const globex: User = { id: 'glo', name: 'glo', role: 'viewer', memberships: [{ kind: 'client', tenant: 'agency', client: 'globex' }] };
  assert.throws(() => intake.create(otherAdmin, { id: 'xx', tenant: 'agency', template: 'form', verifier: 'token' }), (error: any) => error.status === 403);
  const tokens: Record<string, string> = {};
  for (const client of ['acme', 'globex', null]) {
    const made = intake.create(agencyAdmin, { id: `form-${client ?? 'agency'}`, tenant: 'agency', client, template: 'form', verifier: 'token' });
    tokens[made.source.id] = made.secret!;
    const answer = await intake.receive(made.source.id, { headers: { 'x-unfold-intake-token': made.secret! }, query: new URLSearchParams(), body: Buffer.from(JSON.stringify({ title: `For ${client ?? 'the agency'}` })), contentType: 'application/json', client: '192.0.2.1' });
    assert.equal(answer.status, 201);
  }
  const titles = (user: User) => intake.requests(user).map(entry => entry.title).sort();
  assert.deepEqual(titles(agencyAdmin), ['For acme', 'For globex', 'For the agency']);
  assert.deepEqual(titles(acme), ['For acme']);
  assert.deepEqual(titles(globex), ['For globex']);
  assert.deepEqual(titles(otherAdmin), []);
  assert.deepEqual(intake.sources(otherAdmin), []);
  const acmeRequest = intake.requests(acme)[0];
  assert.throws(() => intake.request(globex, acmeRequest.id), (error: any) => error.status === 404);
  assert.throws(() => intake.remove(otherAdmin, 'form-acme'), (error: any) => error.status === 404);
});

test('the intake never reaches Ploeg, the engine, a runtime or a mail transport', () => {
  const directory = new URL('../src/intake/', import.meta.url);
  for (const file of readdirSync(directory)) {
    const source = readFileSync(new URL(file, directory), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(imports.filter(path => /ploeg|engine|runtime|broker|delivery|smtp|nodemailer|tls$|dgram$|fetch/.test(path)), [], `${file} imports ${imports}`);
    assert.doesNotMatch(source, /\bfetch\(|createConnection|\.connect\(|new Socket\b/, `${file} opens no outbound connection`);
  }
});

test('a sender past its burst gets 429 with Retry-After before any signature is checked', async t => {
  const { url, admin } = await workbench(t, true, config => { config.intake = { rateLimit: { client: { perMinute: 6, burst: 3 }, source: { perMinute: 600, burst: 100 }, failureCost: 5 } }; });
  const created = await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'site-form', tenant: 'default', template: 'form' } });
  const secret = created.body.secret;
  for (let index = 0; index < 3; index++) {
    const body = JSON.stringify({ id: `f${index}`, title: `Request ${index}` });
    assert.equal((await deliver(url, 'site-form', body, signed(secret, `msg_${index}`, body))).status, 201);
  }
  const body = JSON.stringify({ id: 'f9', title: 'One too many' });
  const response = await fetch(`${url}/api/intake/site-form`, { method: 'POST', headers: { 'content-type': 'application/json', ...signed(secret, 'msg_9', body) }, body });
  assert.equal(response.status, 429);
  assert.equal((await response.json() as Json).error.code, 'rate_limited');
  assert.equal(response.headers.get('retry-after'), '10', 'one token refills in ten seconds at six a minute');
});

test('an unknown source id or a failed signature costs the sender several tokens, so probing is throttled', async t => {
  const { url, admin } = await workbench(t, true, config => { config.intake = { rateLimit: { client: { perMinute: 60, burst: 10 }, source: { perMinute: 600, burst: 100 }, failureCost: 5 } }; });
  const created = await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'site-form', tenant: 'default', template: 'form' } });
  assert.equal((await deliver(url, 'guess-1', '{}', {})).status, 404);
  assert.equal((await deliver(url, 'site-form', '{}', signed(`whsec_${randomBytes(32).toString('base64')}`, 'msg_x', '{}'))).status, 401);
  const body = JSON.stringify({ title: 'Real' });
  assert.equal((await deliver(url, 'site-form', body, signed(created.body.secret, 'msg_ok', body))).status, 429, 'two refusals at cost 5 plus their own tokens emptied a burst of 10');
});

test('each source has its own bucket, and a per-source rate overrides the default', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-intake-'));
  const store = new Store(join(directory, 'unfold.sqlite'));
  t.after(async () => { store.db.close(); await rm(directory, { recursive: true, force: true }); });
  const intake = new IntakeService(new IntakeStore(store), { enforced: false, enabled: async () => true, rateLimit: { client: { perMinute: 1000, burst: 1000 }, source: { perMinute: 60, burst: 2 }, failureCost: 5 } });
  const admin: User = { id: 'ada', name: 'ada', role: 'admin' };
  const quiet = intake.create(admin, { id: 'quiet', tenant: 'default', template: 'form', verifier: 'token' });
  const busy = intake.create(admin, { id: 'busy', tenant: 'default', template: 'form', verifier: 'token', rateLimit: { perMinute: 60, burst: 4 } });
  assert.deepEqual(busy.source.rateLimit, { perMinute: 60, burst: 4 });
  const send = (made: typeof quiet, n: number, client: string) => intake.receive(made.source.id, { headers: { 'x-unfold-intake-token': made.secret! }, query: new URLSearchParams(), body: Buffer.from(JSON.stringify({ id: `${made.source.id}-${n}`, title: `t${n}` })), contentType: 'application/json', client });
  const status = (promise: Promise<{ status: number }>) => promise.then(answer => answer.status, (error: any) => error.status);
  assert.deepEqual([await status(send(quiet, 1, 'a')), await status(send(quiet, 2, 'b')), await status(send(quiet, 3, 'c'))], [201, 201, 429], 'the source bucket holds two, whichever address sends');
  assert.deepEqual([await status(send(busy, 1, 'a')), await status(send(busy, 2, 'a')), await status(send(busy, 3, 'a')), await status(send(busy, 4, 'a')), await status(send(busy, 5, 'a'))], [201, 201, 201, 201, 429], 'another source is unaffected, at its own rate');
  assert.throws(() => intake.create(admin, { id: 'bad-rate', tenant: 'default', template: 'form', verifier: 'token', rateLimit: { perMinute: 0 } }), (error: any) => error.code === 'intake_source');
});

test('the client address is the socket peer unless a trusted proxy forwarded the request', () => {
  const req = (peer: string, forwarded?: string) => ({ socket: { remoteAddress: peer }, headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded } }) as any;
  assert.equal(clientAddress(req('10.0.0.5', '203.0.113.9'), undefined), '10.0.0.5', 'without trustedProxies the header is ignored');
  assert.equal(clientAddress(req('10.0.0.5', '203.0.113.9'), ['10.0.0.0/8']), '203.0.113.9');
  assert.equal(clientAddress(req('::ffff:10.0.0.5', '198.51.100.7, 203.0.113.9, 10.1.2.3'), ['10.0.0.0/8']), '203.0.113.9', 'the right-most address that is not a trusted proxy');
  assert.equal(clientAddress(req('192.0.2.50', '203.0.113.9'), ['10.0.0.0/8']), '192.0.2.50', 'a peer that is no trusted proxy cannot choose its address');
  assert.equal(clientAddress(req('10.0.0.5', 'garbage'), ['10.0.0.0/8']), '10.0.0.5');
});

test('behind a trusted proxy each forwarded client has its own bucket; without the setting they share the peer address', async t => {
  const limits = { rateLimit: { client: { perMinute: 6, burst: 1 }, source: { perMinute: 600, burst: 100 }, failureCost: 1 } };
  for (const trusted of [true, false]) {
    const { url, admin } = await workbench(t, true, config => { config.intake = limits; if (trusted) config.trustedProxies = ['127.0.0.1', '::1']; });
    const token = (await request(url, '/api/intake/sources', { method: 'POST', cookie: admin, body: { id: 'tok', tenant: 'default', template: 'form', verifier: 'token' } })).body.secret;
    const from = (address: string, n: number) => deliver(url, 'tok', JSON.stringify({ id: `${address}-${n}`, title: 'x' }), { 'x-unfold-intake-token': token, 'x-forwarded-for': address }).then(answer => answer.status);
    const statuses = [await from('203.0.113.1', 1), await from('203.0.113.2', 1), await from('203.0.113.1', 2)];
    assert.deepEqual(statuses, trusted ? [201, 201, 429] : [201, 429, 429], trusted ? 'keyed by the forwarded address' : 'keyed by the socket address, the header ignored');
  }
});

test('a path with malformed percent-encoding is a missing source or Request, never a server error', async t => {
  const { url, admin } = await workbench(t);
  const body = JSON.stringify({ tenant: {} });
  for (const source of ['%ff', '%E0%A4%A', '%']) {
    const answer = await deliver(url, source, body, {});
    assert.deepEqual([answer.status, answer.body.error?.code], [404, 'not_found'], source);
  }
  for (const [path, method] of [['/api/intake/requests/%ff', 'GET'], ['/api/intake/sources/%ff', 'DELETE'], ['/api/intake/sources/%ff/secret', 'POST']] as const) {
    const answer = await request(url, path, { method, cookie: admin, ...(method === 'POST' ? { body: { tenant: {} } } : {}) });
    assert.deepEqual([answer.status, answer.body.error?.code], [404, 'not_found'], `${method} ${path}`);
  }
});
