import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { Store } from '../src/store.ts';
import { TenantScope } from '../src/tenant-scope.ts';
import type { PloegEvent } from '../src/ploeg.ts';
import type { WorkItemFacts } from '../src/cards/facts.ts';
import { cloudEvent, eventTypes, fullType, matchesFilter, publishedTypes, validFilter, type CloudEvent } from '../src/outbound/catalogue.ts';
import { sign, verify, webhookHeaders, newSecret } from '../src/outbound/signing.ts';
import { guardedLookup, isPublicAddress, outboundEventsSettings, parseTarget, resolveTarget, targetAllowlist, TargetError } from '../src/outbound/address.ts';
import { OutboundEvents, OutboundError, httpTransport, maxAttempts, nextDelay, ploegEventType, retrySchedule, type OutboundPloeg, type SendResult, type Transport } from '../src/outbound/service.ts';
import { asyncApiDocument, asyncApiYaml, cloudEventSchema, cloudEventSchemaJson, toYaml } from '../src/outbound/contracts.ts';
import { hashPassword } from '../src/auth.ts';
import { application, login, request } from './api-support.ts';

type Json = Record<string, any>;

const vectorKey = ['MfKQ9r8GKYqr', 'TwjUPD8ILPZIo2', 'LaLaSw'].join('');

test('signing matches the Standard Webhooks test vectors', () => {
  const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
  const expected = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';
  assert.equal(sign(`whsec_${vectorKey}`, id, 1614265330, '{"test": 2432232314}'), expected);
  assert.equal(sign(vectorKey, id, 1614265330, '{"test": 2432232314}'), expected, 'the whsec_ prefix is optional');
  assert.equal(sign(`whsec_${vectorKey}`, id, 1614265330, new Uint8Array([...Array(256).keys()])), 'v1,sEcZ042G8Crqgxbybb3y0eDxQR3TcfYsk11I1XULhSI=');
});

test('a receiver verifies the headers, refuses a stale timestamp and a tampered body, and accepts either secret during rotation', () => {
  const old = newSecret();
  const current = newSecret();
  assert.match(current, /^whsec_[A-Za-z0-9+/]{43}=$/);
  const now = 1_800_000_000_000;
  const body = '{"specversion":"1.0"}';
  const headers = webhookHeaders([current, old], 'ploeg-1', now / 1000, body);
  assert.equal(headers['webhook-signature'].split(' ').length, 2);
  assert.equal(verify(current, headers, body, { now }), undefined);
  assert.equal(verify(old, headers, body, { now }), undefined);
  assert.equal(verify(newSecret(), headers, body, { now }), 'no_matching_signature');
  assert.equal(verify(current, headers, `${body} `, { now }), 'no_matching_signature');
  assert.equal(verify(current, headers, body, { now: now + 301_000 }), 'timestamp_out_of_range');
  assert.equal(verify(current, { 'webhook-id': 'x' }, body, { now }), 'missing_headers');
});

test('the retry schedule backs off exponentially with jitter, honours a longer Retry-After and ends dead after ten attempts', () => {
  assert.equal(maxAttempts, 10);
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const base = retrySchedule[attempt - 1];
    assert.equal(nextDelay(attempt, () => 0.5), base);
    assert.equal(nextDelay(attempt, () => 0), Math.round(base * 0.9));
    assert.equal(nextDelay(attempt, () => 1), Math.round(base * 1.1));
    if (attempt > 1) assert(retrySchedule[attempt - 1] >= retrySchedule[attempt - 2], 'never shorter than the wait before it');
  }
  assert.equal(nextDelay(1, () => 0.5, 120_000), 120_000);
  assert.equal(nextDelay(maxAttempts, () => 0.5), null);
  assert(retrySchedule.reduce((sum, ms) => sum + ms, 0) > 3 * 86_400_000, 'retries span more than three days');
});

test('the SSRF guard refuses non-public targets unless the allowlist names them', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '64:ff9b::7f00:1']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address);
  const none = targetAllowlist();
  const refused = (url: string, code: string) => assert.throws(() => parseTarget(url, none), (error: unknown) => error instanceof TargetError && error.code === code, url);
  refused('http://hooks.example.com/x', 'webhook_url_scheme');
  refused('https://127.0.0.1/x', 'webhook_target_private');
  refused('https://[::1]/x', 'webhook_target_private');
  refused('https://localhost/x', 'webhook_target_private');
  refused('https://n8n/x', 'webhook_target_private');
  refused('https://user:pass@hooks.example.com/x', 'webhook_url');
  refused('ftp://hooks.example.com/x', 'webhook_url_scheme');
  assert.equal(parseTarget('https://hooks.example.com/x', none).hostname, 'hooks.example.com');
  await assert.rejects(resolveTarget(new URL('https://hooks.example.com/x'), none, async () => [{ address: '169.254.169.254', family: 4 }]), (error: unknown) => error instanceof TargetError && error.code === 'webhook_target_private');
  await assert.rejects(resolveTarget(new URL('https://hooks.example.com/x'), none, async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]), (error: unknown) => error instanceof TargetError && error.code === 'webhook_target_private', 'one inward address is enough to refuse');
  await resolveTarget(new URL('https://hooks.example.com/x'), none, async () => [{ address: '93.184.216.34', family: 4 }]);
  const allow = targetAllowlist(['10.0.0.0/8', 'n8n.internal', '127.0.0.1']);
  assert.equal(parseTarget('http://n8n.internal:5678/webhook/x', allow).port, '5678');
  assert.equal(parseTarget('http://127.0.0.1:9/x', allow).hostname, '127.0.0.1');
  await resolveTarget(new URL('https://hooks.example.com/x'), allow, async () => [{ address: '10.0.0.5', family: 4 }]);
  assert.throws(() => targetAllowlist(['10.0.0.0/40']));
  assert.throws(() => outboundEventsSettings({ allowedPrivateTargets: ['not a host'] }));
  assert.throws(() => outboundEventsSettings({ other: true }));
  assert.deepEqual(outboundEventsSettings(undefined), { allowedPrivateTargets: [] });
});

test('the connect-time lookup refuses a host that resolves inward, so DNS rebinding cannot pass the check', async () => {
  const lookup = guardedLookup(targetAllowlist());
  const error = await new Promise<NodeJS.ErrnoException | null>(resolve => lookup('localhost', { all: true }, failure => resolve(failure)));
  assert.equal(error?.code, 'webhook_target_private');
  const allowed = guardedLookup(targetAllowlist(['localhost']));
  const answer = await new Promise<unknown>(resolve => allowed('localhost', {}, (failure, address) => resolve(failure ?? address)));
  assert.equal(typeof answer, 'string');
  const result = await httpTransport(new URL('https://127.0.0.1:9/x'), {}, '{}', targetAllowlist());
  assert.deepEqual(result, { error: 'webhook_target_private' }, 'a literal address is checked again before every send');
});

test('event type filters accept published types and whole-segment prefixes only', () => {
  assert.equal(validFilter('dev.unfold.work_item.needs_you'), true);
  assert.equal(validFilter('dev.unfold.work_item.*'), true);
  assert.equal(validFilter('dev.unfold.*'), true);
  assert.equal(validFilter('dev.unfold.work_it*'), false);
  assert.equal(validFilter('dev.unfold.work_item.unknown'), false);
  assert.equal(validFilter('com.other.*'), false);
  assert.equal(matchesFilter(['dev.unfold.work_item.*'], 'dev.unfold.work_item.approved'), true);
  assert.equal(matchesFilter(['dev.unfold.work_item.*'], 'dev.unfold.run.finished'), false);
  assert.equal(matchesFilter(['dev.unfold.run.finished'], 'dev.unfold.run.finished'), true);
  assert.equal(ploegEventType({ action: 'work_item.needs_human', detail: {} }), 'work_item.needs_you');
  assert.equal(ploegEventType({ action: 'checkpoint.written', detail: { phase: 'pr_opened' } }), 'pull_request.opened');
  assert.equal(ploegEventType({ action: 'checkpoint.written', detail: { phase: 'briefed' } }), undefined);
  assert.equal(ploegEventType({ action: 'outcome.pr_opened', detail: {} }), 'run.finished');
  assert.equal(ploegEventType({ action: 'lease.acquired', detail: {} }), undefined);
});

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'unfold-outbound-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'unfold.db');
}

const repositories = [
  { id: 'shop', name: 'Shop', description: '', url: 'https://forgejo.example/agency/shop.git', baseBranch: 'main', verify: [], tenant: 'agency', client: 'shop' },
  { id: 'site', name: 'Site', description: '', url: 'https://forgejo.example/agency/site.git', baseBranch: 'main', verify: [], tenant: 'agency' },
  { id: 'other', name: 'Other', description: '', url: 'https://forgejo.example/other/app.git', baseBranch: 'main', verify: [], tenant: 'other' },
  { id: 'twin', name: 'Twin', description: '', url: 'https://forgejo.example/agency/twin.git', baseBranch: 'main', verify: [], tenant: 'agency' },
  { id: 'twin-copy', name: 'Twin copy', description: '', url: 'https://gitlab.example/agency/twin.git', baseBranch: 'main', verify: [], tenant: 'other' },
];
const tenancy = new TenantScope({ repositories, taskSources: [], tenancy: { enforce: true } });

function facts(id: string, repo: string, extra: Partial<WorkItemFacts> = {}): WorkItemFacts {
  const world = JSON.parse(readFileSync(new URL('./fixtures/cards/service/attribution-flow.json', import.meta.url), 'utf8')).world[0];
  const [owner, name] = repo.split('/');
  world.workItem = { ...world.workItem, id, title: `Work ${id}`, state: 'needs_human', url: `https://tracker.example/${id}`, target: { forge: 'forgejo', owner, repo: name, baseBranch: 'main' } };
  world.pullRequests = world.pullRequests.map((pr: Json) => ({ ...pr, owner, repo: name, shiftId: '9', url: `https://forgejo.example/${repo}/pulls/4`, number: 4, state: 'open', mergedAt: null, openedAt: '2026-10-29T09:00:00Z', firstSeenAt: '2026-10-29T09:00:00Z' }));
  world.runs = [];
  return { ...world, ...extra };
}

type Received = { headers: IncomingMessage['headers']; body: string };
function fakeTransport(answers: Array<SendResult | 'hang'>, received: Received[] = []): Transport {
  return async (_url, headers, body) => {
    received.push({ headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])), body });
    const next = answers.length > 1 ? answers.shift()! : answers[0];
    if (next === 'hang') return new Promise<SendResult>(() => undefined);
    return next;
  };
}

function service(store: Store, options: Partial<ConstructorParameters<typeof OutboundEvents>[1]> & { now?: { value: number } } = {}) {
  const now = options.now ?? { value: Date.parse('2026-10-30T10:00:00Z') };
  return new OutboundEvents(store, { tenancy, enabled: async tenant => tenant !== 'flag-off', clock: () => now.value, random: () => 0.5, resolver: async () => [{ address: '93.184.216.34', family: 4 }], ...options });
}

const admin = { id: 'adam', name: 'adam', role: 'admin' as const, memberships: [{ kind: 'tenant' as const, tenant: 'agency', role: 'admin' as const }] };

async function subscribe(outbound: OutboundEvents, body: Json, user: Json = admin) {
  const answer = await outbound.route(user as never, 'POST', '/api/admin/webhooks', async () => body);
  return answer.body as { subscription: Json; secret: string };
}

function event(id: string, suffix: string, owner: { tenant: string; client?: string }, time = '2026-10-30T10:00:01Z'): CloudEvent {
  return cloudEvent({ id, suffix, owner, subject: 'work-items/1', time, data: { workItem: { id: '1' } } });
}

test('subscriptions are scoped to a Tenant or a Client, filtered by type, never see older events, and wait while the flag is off', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const outbound = service(store);
  const tenantWide = await subscribe(outbound, { url: 'https://hooks.example.com/a', tenant: 'agency', types: ['dev.unfold.work_item.*'] });
  const clientOnly = await subscribe(outbound, { url: 'https://hooks.example.com/b', tenant: 'agency', client: 'shop', types: ['dev.unfold.*'] });
  const at = '2026-10-30T10:00:02Z';
  const on = () => true;
  assert.equal(outbound.store.enqueue(event('e1', 'work_item.approved', { tenant: 'agency', client: 'shop' }), at, on), 2, 'both reach a Client event of the Tenant');
  assert.equal(outbound.store.enqueue(event('e2', 'work_item.approved', { tenant: 'agency' }), at, on), 1, 'a Client subscription misses the Tenant\'s other work');
  assert.equal(outbound.store.enqueue(event('e3', 'run.finished', { tenant: 'agency', client: 'shop' }), at, on), 1, 'the type filter holds');
  assert.equal(outbound.store.enqueue(event('e4', 'work_item.approved', { tenant: 'other' }), at, on), 0, 'another Tenant reaches neither');
  assert.equal(outbound.store.enqueue(event('e5', 'work_item.approved', { tenant: 'agency', client: 'other-client' }), at, on), 1);
  assert.equal(outbound.store.enqueue(event('e6', 'work_item.approved', { tenant: 'agency' }, '2026-10-29T10:00:00Z'), at, on), 0, 'an event older than the subscription is never sent to it');
  assert.equal(outbound.store.enqueue(event('e1', 'work_item.approved', { tenant: 'agency', client: 'shop' }), at, on), 0, 'the same event is queued once');
  assert.equal(outbound.store.enqueue(event('e7', 'work_item.approved', { tenant: 'agency' }), at, () => false), 0, 'nothing is queued while the Tenant\'s flag is off');
  assert.deepEqual(outbound.store.counts(tenantWide.subscription.id), { pending: 3, delivered: 0, dead: 0 });
  assert.deepEqual(outbound.store.counts(clientOnly.subscription.id), { pending: 2, delivered: 0, dead: 0 });
});

test('the admin API checks the target, the types and the Tenant, shows the secret once, and never lists it', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const outbound = service(store, { resolver: async host => host === 'inward.example.com' ? [{ address: '10.0.0.8', family: 4 }] : [{ address: '93.184.216.34', family: 4 }] });
  const refusal = async (body: Json, code: string, user: Json = admin) => assert.rejects(outbound.route(user as never, 'POST', '/api/admin/webhooks', async () => body), (error: unknown) => error instanceof OutboundError && error.code === code, code);
  await refusal({ url: 'https://inward.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] }, 'webhook_target_private');
  await refusal({ url: 'http://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] }, 'webhook_url_scheme');
  await refusal({ url: 'https://hooks.example.com/x', tenant: 'agency', types: [] }, 'webhook_types');
  await refusal({ url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.nope'] }, 'webhook_types');
  await refusal({ url: 'https://hooks.example.com/x', tenant: 'other', types: ['dev.unfold.*'] }, 'forbidden');
  await refusal({ url: 'https://hooks.example.com/x', tenant: 'flag-off', types: ['dev.unfold.*'] }, 'forbidden');
  await refusal({ url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] }, 'forbidden', { ...admin, role: 'operator' });
  await assert.rejects(outbound.route({ ...admin, memberships: [{ kind: 'tenant', tenant: 'flag-off', role: 'admin' }] } as never, 'POST', '/api/admin/webhooks', async () => ({ url: 'https://hooks.example.com/x', tenant: 'flag-off', types: ['dev.unfold.*'] })), (error: unknown) => error instanceof OutboundError && error.code === 'webhooks_off');
  const created = await subscribe(outbound, { url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.work_item.needs_you'], description: 'Slack #delivery' });
  assert.match(created.secret, /^whsec_/);
  const listed = (await outbound.route(admin as never, 'GET', '/api/admin/webhooks', async () => ({}))).body as Json;
  assert.equal(listed.subscriptions.length, 1);
  assert(!JSON.stringify(listed).includes(created.secret), 'the list never carries the secret');
  assert.deepEqual(listed.tenants, [{ tenant: 'agency', enabled: true }]);
  const outsider = { ...admin, memberships: [{ kind: 'tenant', tenant: 'other', role: 'admin' }] };
  assert.equal(((await outbound.route(outsider as never, 'GET', '/api/admin/webhooks', async () => ({}))).body as Json).subscriptions.length, 0, 'an administrator of another Tenant sees none');
  await assert.rejects(outbound.route(outsider as never, 'DELETE', `/api/admin/webhooks/${created.subscription.id}`, async () => ({})), (error: unknown) => error instanceof OutboundError && error.status === 404);
  const rotated = (await outbound.route(admin as never, 'POST', `/api/admin/webhooks/${created.subscription.id}/rotate-secret`, async () => ({}))).body as Json;
  assert.notEqual(rotated.secret, created.secret);
  assert.deepEqual(outbound.store.secrets(created.subscription.id)?.previous, created.secret, 'the old secret keeps signing during the overlap');
  const patched = (await outbound.route(admin as never, 'PATCH', `/api/admin/webhooks/${created.subscription.id}`, async () => ({ active: false }))).body as Json;
  assert.equal(patched.subscription.active, false);
  assert.equal(((await outbound.route(admin as never, 'DELETE', `/api/admin/webhooks/${created.subscription.id}`, async () => ({}))).body as Json).deleted, created.subscription.id);
  assert.equal(outbound.store.secrets(created.subscription.id), undefined);
});

test('a failing receiver is retried on the schedule until the delivery is dead, and an administrator can send it again', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const now = { value: Date.parse('2026-10-30T10:00:00Z') };
  const received: Received[] = [];
  const outbound = service(store, { now, transport: fakeTransport([{ status: 500 }], received) });
  const { subscription } = await subscribe(outbound, { url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] });
  outbound.store.enqueue(event('ploeg-77', 'work_item.done', { tenant: 'agency' }, '2026-10-30T10:00:01Z'), '2026-10-30T10:00:01Z', () => true);
  now.value += 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    assert.equal(await outbound.dispatch(), 1, `attempt ${attempt} is due`);
    const [delivery] = outbound.store.deliveries(subscription.id, 1);
    assert.equal(delivery.attempts, attempt);
    if (attempt < maxAttempts) {
      assert.equal(delivery.status, 'pending');
      assert.equal(Date.parse(delivery.nextAttemptAt!) - now.value, retrySchedule[attempt - 1]);
      now.value += retrySchedule[attempt - 1] - 1;
      assert.equal(await outbound.dispatch(), 0, 'nothing is sent before the wait is over');
      now.value += 1;
    } else assert.deepEqual([delivery.status, delivery.lastStatus, delivery.nextAttemptAt], ['dead', 500, null]);
  }
  assert.equal(new Set(received.map(entry => entry.headers['webhook-id'])).size, 1, 'every retry carries the same webhook-id');
  assert.equal(new Set(received.map(entry => entry.headers['webhook-timestamp'])).size, maxAttempts, 'each attempt is signed at its own time');
  const [dead] = outbound.store.deliveries(subscription.id, 1);
  await outbound.route(admin as never, 'POST', `/api/admin/webhooks/${subscription.id}/deliveries/${dead.id}/resend`, async () => ({}));
  assert.equal(outbound.store.delivery(dead.id)?.status, 'pending');
  await assert.rejects(outbound.route(admin as never, 'POST', `/api/admin/webhooks/${subscription.id}/deliveries/${dead.id}/resend`, async () => ({})), (error: unknown) => error instanceof OutboundError && error.code === 'webhook_delivery_not_dead');
});

test('a receiver that answers 410 Gone disables its subscription; a redirect is a failure', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const outbound = service(store, { transport: fakeTransport([{ status: 302 }, { status: 410 }]) });
  const { subscription } = await subscribe(outbound, { url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] });
  outbound.store.enqueue(event('e-gone', 'work_item.done', { tenant: 'agency' }), '2026-10-30T10:00:00Z', () => true);
  outbound.store.enqueue(event('e-gone-2', 'work_item.done', { tenant: 'agency' }), '2026-10-30T10:00:00Z', () => true);
  await outbound.dispatch();
  const deliveries = outbound.store.deliveries(subscription.id, 5);
  assert.deepEqual(deliveries.map(entry => [entry.status, entry.lastError]).sort(), [['dead', 'gone'], ['pending', 'redirect']]);
  const disabled = outbound.store.subscription(subscription.id)!;
  assert.equal(disabled.active, false);
  assert.match(disabled.disabledReason!, /410/);
});

test('the outbox survives a restart: a delivery sent but not recorded goes out again with the same webhook-id', async t => {
  const path = scratch(t);
  const key = randomBytes(32);
  const first: Received[] = [];
  let store = new Store(path, { key });
  let outbound = service(store, { transport: fakeTransport(['hang'], first) });
  const { subscription, secret } = await subscribe(outbound, { url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] });
  outbound.store.enqueue(event('ploeg-900', 'work_item.proposed', { tenant: 'agency' }), '2026-10-30T10:00:00Z', () => true);
  void outbound.dispatch();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.length, 1, 'the receiver got it');
  outbound.stop();
  store.close();
  store = new Store(path, { key });
  t.after(() => store.close());
  const second: Received[] = [];
  outbound = service(store, { transport: fakeTransport([{ status: 204 }], second) });
  assert.equal(await outbound.dispatch(), 1);
  assert.equal(second[0].headers['webhook-id'], first[0].headers['webhook-id']);
  assert.equal(second[0].body, first[0].body, 'the same stored body');
  assert.equal(verify(secret, second[0].headers as Record<string, string>, second[0].body, { now: Date.parse('2026-10-30T10:00:00Z') }), undefined, 'the secret survives the restart, sealed in the store');
  assert.equal(outbound.store.deliveries(subscription.id, 1)[0].status, 'delivered');
  assert.equal(await outbound.dispatch(), 0, 'a delivered event is not sent again');
});

function ploegStub(events: PloegEvent[], world: Record<string, WorkItemFacts>, options: { fail?: () => boolean } = {}) {
  const calls: string[] = [];
  const ploeg: OutboundPloeg = {
    latestEvents: async () => { calls.push('latest'); return { lastCursor: '100' }; },
    followEvents: async after => {
      calls.push(`follow:${after}`);
      const page = events.filter(entry => BigInt(entry.id) > BigInt(after));
      return { events: page, lastCursor: page.at(-1)?.id ?? after, more: false };
    },
    workItemFacts: async id => { if (options.fail?.()) throw Object.assign(new Error('down'), { status: 503 }); if (!world[id]) throw Object.assign(new Error('missing'), { status: 404 }); return world[id]; },
    factsPage: async () => ({ facts: Object.values(world), nextBefore: null }),
  };
  return { ploeg, calls };
}

const ploegEvent = (id: string, workItemId: string, action: string, detail: Record<string, unknown> = {}): PloegEvent => ({ id, at: '2026-10-30T10:05:00Z', actor: 'team:silver', action, workItemId, team: 'silver', detail });

test('Ploeg\'s audit events become CloudEvents owned by the Work Item\'s Tenant and Client, and the cursor moves only with what was queued', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const world = { 11: facts('11', 'agency/shop'), 12: facts('12', 'agency/site'), 13: facts('13', 'agency/twin') };
  const events = [ploegEvent('101', '11', 'work_item.needs_human', { reason: 'the reviewer escalated' }), ploegEvent('102', '12', 'checkpoint.written', { phase: 'pr_opened' }), ploegEvent('103', '11', 'outcome.pr_opened', { role: 'implementer', round: 1, shiftId: '9' }), ploegEvent('104', '13', 'work_item.done'), ploegEvent('105', '11', 'lease.acquired')];
  let failing = false;
  const { ploeg, calls } = ploegStub(events, world, { fail: () => failing });
  const received: Received[] = [];
  const outbound = service(store, { ploeg, transport: fakeTransport([{ status: 200 }], received), baseUrl: 'https://unfold.example/' });
  assert.equal(await outbound.followPloeg(), 0);
  assert.deepEqual(calls, [], 'nothing reads Ploeg while no subscription is active');
  const { secret } = await subscribe(outbound, { url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] });
  assert.equal(await outbound.followPloeg(), 0);
  assert.deepEqual(calls, ['latest'], 'the first read starts at Ploeg\'s newest event, sending no history');
  failing = true;
  await assert.rejects(outbound.followPloeg());
  assert.equal(outbound.store.cursor('ploeg-events'), '100', 'a failed read moves no cursor');
  failing = false;
  assert.equal(await outbound.followPloeg(), 3, 'the ambiguous owner and the unmapped action emit nothing');
  assert.equal(outbound.store.cursor('ploeg-events'), '105');
  assert.equal(await outbound.followPloeg(), 0, 'nothing is queued twice');
  await outbound.dispatch();
  const bodies = received.map(entry => JSON.parse(entry.body) as Json);
  assert.deepEqual(bodies.map(body => [body.type, body.source, body.tenant, body.client ?? null]), [
    ['dev.unfold.work_item.needs_you', '/tenants/agency/clients/shop', 'agency', 'shop'],
    ['dev.unfold.pull_request.opened', '/tenants/agency', 'agency', null],
    ['dev.unfold.run.finished', '/tenants/agency/clients/shop', 'agency', 'shop'],
  ]);
  assert.deepEqual(bodies[0].data.workItem, { id: '11', title: 'Work 11', team: 'silver', state: 'needs_human', externalRef: 'VIK-card', trackerUrl: 'https://tracker.example/11', unfoldUrl: 'https://unfold.example/#work/11' });
  assert.equal(bodies[0].data.reason, 'the reviewer escalated');
  assert.deepEqual(bodies[1].data.pullRequest, { url: 'https://forgejo.example/agency/site/pulls/4', number: 4, repository: 'agency/site' });
  assert.deepEqual(bodies[2].data.run, { outcome: 'pr_opened', role: 'implementer', round: 1, shiftId: '9' });
  assert.equal(bodies[0].id, 'ploeg-101');
  assert.equal(received[0].headers['content-type'], 'application/cloudevents+json; charset=utf-8');
  for (const entry of received) assert.equal(verify(secret, entry.headers as Record<string, string>, entry.body, { now: Date.parse('2026-10-30T10:00:00Z') }), undefined);
});

test('a Client Sign-off and its dismissal become events through the store\'s triggers, in the Sign-off\'s own transaction', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const { ploeg } = ploegStub([], { 11: facts('11', 'agency/shop') });
  const received: Received[] = [];
  const outbound = service(store, { ploeg, transport: fakeTransport([{ status: 200 }], received) });
  await subscribe(outbound, { url: 'https://hooks.example.com/x', tenant: 'agency', client: 'shop', types: ['dev.unfold.client_sign_off.*'] });
  const body = { id: 'so-1', workItemId: '11', client: '', pullRequest: { id: 'pr-1' }, headSha: 'c'.repeat(40), answer: 'looks_good', note: 'private note', person: { id: 'olga', name: 'Olga', attribution: 'asserted' }, recordedAt: '2026-10-30T10:01:00Z', state: 'current', endedAt: null };
  store.db.prepare('INSERT INTO client_sign_offs(id,work_item_id,pull_request_id,head_sha,state,recorded_at,body) VALUES(?,?,?,?,?,?,?)').run('so-1', '11', 'pr-1', body.headSha, 'current', body.recordedAt, JSON.stringify(body));
  store.db.prepare('UPDATE client_sign_offs SET state=?, body=? WHERE id=?').run('dismissed', JSON.stringify({ ...body, state: 'dismissed', endedAt: '2026-10-30T10:02:00Z' }), 'so-1');
  assert.equal(await outbound.collectSignOffs(), 2);
  assert.equal(outbound.store.signOffChanges(10).length, 0);
  await outbound.dispatch();
  const events = received.map(entry => JSON.parse(entry.body) as Json);
  assert.deepEqual(events.map(entry => [entry.type, entry.time, entry.client]), [['dev.unfold.client_sign_off.recorded', '2026-10-30T10:01:00.000Z', 'shop'], ['dev.unfold.client_sign_off.dismissed', '2026-10-30T10:02:00.000Z', 'shop']]);
  assert(!received.some(entry => entry.body.includes('private note') || entry.body.includes('Olga')), 'no note and no person leave Unfold');
});

test('an accepted Delivery is published once, dated at its Acceptance', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const merged = facts('21', 'agency/site');
  merged.pullRequests = merged.pullRequests.map(pr => ({ ...pr, state: 'merged', mergedAt: '2026-10-30T10:30:00Z' }));
  const open = facts('22', 'agency/site');
  const { ploeg } = ploegStub([], { 21: merged, 22: open });
  const now = { value: Date.parse('2026-10-30T10:00:00Z') };
  const outbound = service(store, { ploeg, now });
  const created = await outbound.route(admin as never, 'POST', '/api/admin/webhooks', async () => ({ url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.delivery.accepted'] }));
  assert.equal(created.status, 201);
  assert.equal(await outbound.sweepAcceptance(), 0, 'not before the merge');
  now.value = Date.parse('2026-10-30T12:00:00Z');
  assert.equal(await outbound.sweepAcceptance(), 1);
  assert.equal(await outbound.sweepAcceptance(), 0, 'once per Work Item');
  const stored = JSON.parse(String((store.db.prepare("SELECT body FROM outbound_events WHERE type='dev.unfold.delivery.accepted'").get() as { body: string }).body));
  assert.deepEqual([stored.id, stored.time, stored.data.acceptance.kind], ['delivery-accepted-21', '2026-10-30T10:30:00.000Z', 'merged']);
});

type Schema = Record<string, any>;
function validate(schema: Schema, value: unknown, root: Schema, at = '$'): string[] {
  if (schema.$ref) return validate(schema.$ref.slice(2).split('/').reduce((node: Schema, part: string) => node[part], root), value, root, at);
  const errors: string[] = [];
  const types = schema.type === undefined ? [] : [schema.type].flat();
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (types.length && !types.some((type: string) => type === kind || (type === 'number' && kind === 'integer'))) return [`${at}: ${kind} is not ${types.join('|')}`];
  if ('const' in schema && value !== schema.const) errors.push(`${at}: not ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: not in enum`);
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: pattern`);
  if (typeof value === 'string' && schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: too long`);
  if (schema.anyOf && !schema.anyOf.some((option: Schema) => !validate(option, value, root, at).length)) errors.push(`${at}: no anyOf`);
  for (const part of schema.allOf ?? []) {
    if (part.if) { if (!validate(part.if, value, root, at).length) errors.push(...validate(part.then, value, root, at)); }
    else errors.push(...validate(part, value, root, at));
  }
  if (kind === 'object') {
    const record = value as Record<string, unknown>;
    for (const name of schema.required ?? []) if (!(name in record)) errors.push(`${at}.${name}: required`);
    for (const [name, item] of Object.entries(record)) {
      if (schema.properties?.[name]) errors.push(...validate(schema.properties[name], item, root, `${at}.${name}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${name}: not allowed`);
    }
  }
  return errors;
}

test('the checked-in contracts match the catalogue, resolve every reference, and describe the events Unfold builds', async t => {
  assert.equal(readFileSync(new URL('../docs/contracts/events.asyncapi.yaml', import.meta.url), 'utf8'), asyncApiYaml(), 'run node scripts/outbound-contracts.ts');
  assert.equal(readFileSync(new URL('../docs/contracts/cloudevent.v1.schema.json', import.meta.url), 'utf8'), cloudEventSchemaJson(), 'run node scripts/outbound-contracts.ts');
  const document = asyncApiDocument() as Json;
  assert.equal(document.asyncapi, '3.1.0');
  const refs: string[] = [];
  const walk = (node: unknown) => { if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) { if (key === '$ref') refs.push(String(value)); else walk(value); } };
  walk(document);
  for (const ref of refs) assert.notEqual(ref.slice(2).split('/').reduce((node: any, part) => node?.[part], document), undefined, `${ref} resolves`);
  assert.equal(Object.keys(document.components.messages).length, eventTypes.length);
  assert.equal(document.operations.deliverEvent.messages.length, eventTypes.length);
  assert.deepEqual(Object.values(document.components.messages).map((message: any) => message.name).sort(), [...publishedTypes].sort());
  const schema = cloudEventSchema() as Schema;
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const merged = facts('31', 'agency/shop');
  merged.pullRequests = merged.pullRequests.map(pr => ({ ...pr, state: 'merged', mergedAt: '2026-10-30T10:30:00Z' }));
  const { ploeg } = ploegStub([ploegEvent('101', '31', 'work_item.proposed'), ploegEvent('102', '31', 'work_item.approved'), ploegEvent('103', '31', 'operator.work_item.admitted'), ploegEvent('104', '31', 'work_item.stale'), ploegEvent('105', '31', 'work_item.awaiting_review'), ploegEvent('106', '31', 'work_item.done'), ploegEvent('107', '31', 'checkpoint.written', { phase: 'pr_opened' }), ploegEvent('108', '31', 'outcome.failed')], { 31: merged });
  const now = { value: Date.parse('2026-10-30T10:00:00Z') };
  const outbound = service(store, { ploeg, now });
  const { subscription } = await subscribe(outbound, { url: 'https://hooks.example.com/x', tenant: 'agency', types: ['dev.unfold.*'] });
  await outbound.followPloeg();
  await outbound.followPloeg();
  now.value = Date.parse('2026-10-30T12:00:00Z');
  await outbound.sweepAcceptance();
  await outbound.route(admin as never, 'POST', `/api/admin/webhooks/${subscription.id}/test`, async () => ({}));
  const built = (store.db.prepare('SELECT body FROM outbound_events').all() as { body: string }[]).map(row => JSON.parse(row.body));
  assert.deepEqual([...new Set(built.map(entry => entry.type))].sort(), publishedTypes.filter(type => !type.includes('client_sign_off')).sort(), 'every non-Sign-off type is produced by a source');
  for (const entry of built) assert.deepEqual(validate(schema, entry, schema), [], entry.type);
  assert.deepEqual(validate(schema, { ...built[0], data: { workItem: { id: 'x' } } }, schema).length > 0, true, 'the schema rejects a malformed event');
  assert.equal(fullType('run.finished'), 'dev.unfold.run.finished');
  assert.equal(toYaml({ a: 'yes', b: '1.0', c: ['x: y'], d: {} }), '\na: "yes"\nb: "1.0"\nc:\n  - "x: y"\nd: {}');
});

async function receiver(t: TestContext) {
  const received: Received[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }); res.writeHead(204).end(); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}/hook`, received };
}

test('through the workbench, an administrator subscribes a local receiver the allowlist permits and gets a signed test event', async t => {
  const target = await receiver(t);
  const server = await application('live', config => {
    config.outboundEvents = { allowedPrivateTargets: ['127.0.0.1'] };
    config.flags = { document: { flags: { 'events.webhooks': { defaultVariant: 'on' } } }, unknown: [] };
  });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  server.app.store.addUser({ id: 'otto', name: 'otto', role: 'operator', passwordHash: await hashPassword(password) });
  const adminCookie = (await login(server.url, 'admin', 'test-admin-password-314159')).cookie;
  const operator = (await login(server.url, 'otto', password)).cookie;
  assert.equal((await request(server.url, '/api/admin/webhooks', { cookie: operator })).status, 403);
  const refused = await request(server.url, '/api/admin/webhooks', { method: 'POST', cookie: adminCookie, body: { url: 'https://10.0.0.1/hook', types: ['dev.unfold.*'] } });
  assert.deepEqual([refused.status, refused.body.error.code], [400, 'webhook_target_private']);
  const created = await request(server.url, '/api/admin/webhooks', { method: 'POST', cookie: adminCookie, body: { url: target.url, types: ['dev.unfold.webhook.test'] } });
  assert.equal(created.status, 201, created.text);
  const id = created.body.subscription.id;
  assert.equal((await request(server.url, `/api/admin/webhooks/${id}/test`, { method: 'POST', cookie: adminCookie })).status, 202);
  const deadline = Date.now() + 20_000;
  while (!target.received.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(target.received.length, 1, 'the dispatcher delivered the test event');
  const [delivery] = target.received;
  assert.equal(verify(created.body.secret, delivery.headers as Record<string, string>, delivery.body), undefined);
  const body = JSON.parse(delivery.body);
  assert.deepEqual([body.specversion, body.type, body.source, body.tenant, body.data.test], ['1.0', 'dev.unfold.webhook.test', '/tenants/default', 'default', true]);
  const listed = await request(server.url, '/api/admin/webhooks', { cookie: adminCookie });
  assert(!listed.text.includes(created.body.secret));
  assert.equal(listed.body.subscriptions[0].deliveries.delivered, 1);
  const jobs = await request(server.url, '/api/admin/jobs?kind=outbound.delivery', { cookie: adminCookie });
  assert.equal(jobs.status, 200, jobs.text);
  assert.deepEqual(jobs.body.kinds.find((entry: Json) => entry.kind === 'outbound.delivery'), { kind: 'outbound.delivery', pending: 0, running: 0, done: 1, dead: 0, oldestDueAt: null }, 'operators see the delivery job in the queue');
  assert.deepEqual(jobs.body.troubled, []);
  assert.equal((await request(server.url, '/api/admin/jobs', { cookie: operator })).status, 403);
  assert.equal((await request(server.url, '/api/admin/jobs?kind=Bad%20Kind', { cookie: adminCookie })).body.error.code, 'job_kind');
});
