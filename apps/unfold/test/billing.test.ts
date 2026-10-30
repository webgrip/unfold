import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import type { FactsPullRequest, WorkItemFacts } from '../src/cards/facts.ts';
import { amountText, billingCsv, billingSettings, billingTarget, priceCents, ublInvoiceLines, type BillingLine, type BillingSettings } from '../src/billing-export.ts';
import { billingExporters } from '../src/billing-exporters.ts';
import { BillingService, BillingStore, billingRoute } from '../src/billing.ts';
import { refuseDemoCredentials } from '../src/config.ts';
import { hashPassword } from '../src/auth.ts';
import { TenantScope } from '../src/tenant-scope.ts';
import type { AppConfig, Repository, User } from '../src/types.ts';
import { application, login, request } from './api-support.ts';

type Recorded = { method: string; path: string; headers: IncomingMessage['headers']; body: any };
type Reply = { status: number; body?: unknown } | 'hang';

async function fakeSimplicate(t: TestContext, replies: Reply[] = []) {
  const requests: Recorded[] = [];
  const queue = [...replies];
  let serial = 0;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    requests.push({ method: req.method!, path: req.url!, headers: req.headers, body: text ? JSON.parse(text) : null });
    const reply = queue.shift() ?? { status: 200 };
    if (reply === 'hang') return;
    const body = reply.body ?? (reply.status < 300 ? { data: { id: `service:${++serial}` }, errors: null, debug: null } : { data: null, errors: ['refused'], debug: null });
    res.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  return { apiUrl: `http://127.0.0.1:${address.port}/api/v2`, requests, push: (...more: Reply[]) => queue.push(...more) };
}

const iso = (ms: number) => new Date(ms).toISOString();
const merged = Date.parse('2026-10-20T09:00:00Z');

function pr(extra: Partial<FactsPullRequest> = {}): FactsPullRequest {
  return {
    id: '1', forge: 'forgejo', owner: 'agency', repo: 'shop', number: 7, url: 'https://forge.example/agency/shop/pulls/7', shiftId: '1', branch: 'ploeg/1', baseBranch: 'main',
    state: 'merged', draft: false, author: 'ploeg-bot', headSha: 'abc', mergeCommitSha: 'def', openedAt: iso(merged - 86_400_000), firstSeenAt: iso(merged - 86_400_000), mergedAt: iso(merged), mergedBy: 'ryan', closedAt: iso(merged), updatedAt: iso(merged),
    additions: 1, deletions: 1, changedFiles: 1, labels: [], commits: 1, firstCommitAt: null, forcePushes: 0, activityCapturedAt: null, activityTruncated: false, commitStatus: null,
    ciRunsCapturedAt: null, ciRunsSource: null, ciRunsTruncated: false, ciRuns: [], reviews: [], events: [], filesCapturedAt: null, filesTruncated: false, files: [], changedPaths: null, reverts: [], deployments: [],
    ...extra,
  };
}

function facts(id: string, repo: string, pull: Partial<FactsPullRequest> = {}): WorkItemFacts {
  const owner = repo === 'site' ? 'other' : 'agency';
  return {
    workItem: { id, provider: 'vikunja', externalId: id, externalRef: `VIK-${id}`, url: `https://tracker.example/tasks/${id}`, title: `Fix checkout ${id}`, state: 'done', team: 'silver', createdAt: iso(merged - 5 * 86_400_000), updatedAt: iso(merged), trackerCreatedAt: null, estimateSeconds: null, target: { forge: 'forgejo', owner, repo, baseBranch: 'main' }, epics: [], withdrawals: [] },
    activityAt: iso(merged), shifts: [], runs: [{ id: `${id}-r`, shiftId: '1', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: iso(merged - 90_000_000), finishedAt: iso(merged - 86_400_000), outcome: 'pr_opened', links: [], authorizedUsd: 2, usage: { costUsd: 1 } }],
    liveUsage: [], pullRequests: [pr({ owner, repo, url: `https://forge.example/${owner}/${repo}/pulls/${id}`, ...pull })], statusTransitions: [], gateTransitions: [], deployEnvironments: [], roster: [], botLogins: ['ploeg-bot'],
    truncated: { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false },
  };
}

const repositories: Repository[] = [
  { id: 'shop', name: 'Shop', description: '', url: 'https://forge.example/agency/shop.git', baseBranch: 'main', verify: [], tenant: 'agency', client: 'acme' },
  { id: 'blog', name: 'Blog', description: '', url: 'https://forge.example/agency/blog.git', baseBranch: 'main', verify: [], tenant: 'agency', client: 'globex' },
  { id: 'site', name: 'Site', description: '', url: 'https://forge.example/other/site.git', baseBranch: 'main', verify: [], tenant: 'other' },
];

const admin: User = { id: 'adam', name: 'adam', role: 'admin', memberships: [{ kind: 'tenant', tenant: 'agency', role: 'admin' }, { kind: 'tenant', tenant: 'other', role: 'admin' }] };

function credential(t: TestContext) {
  const name = `UNFOLD_TEST_SIMPLICATE_${randomBytes(6).toString('hex').toUpperCase()}`;
  const key = randomBytes(12).toString('hex');
  const secret = randomBytes(12).toString('hex');
  process.env[name] = `${key}:${secret}`;
  t.after(() => { delete process.env[name]; });
  return { name, key, secret };
}

function world(t: TestContext, apiUrl: string, items: WorkItemFacts[], options: { enforce?: boolean; enabled?: (tenant: string) => boolean } = {}) {
  const token = credential(t);
  const settings = billingSettings({ exporter: 'simplicate', simplicate: { apiUrl, tokenEnv: token.name } }, billingExporters, { env: process.env, dataDir: tmpdir(), agentEnvironment: [] })!;
  const definition = billingExporters.get('simplicate')!;
  const db = new DatabaseSync(':memory:');
  const clock = { now: Date.parse('2026-10-22T12:00:00Z') };
  const make = () => new BillingService(new BillingStore(db), {
    settings, definition, exporter: definition.create(settings.options, { fetch, env: process.env, dataDir: tmpdir(), timeoutMs: 500 }),
    facts: { factsPage: async () => ({ facts: items, nextBefore: null }) },
    tenants: new TenantScope({ repositories, taskSources: [], tenancy: { enforce: options.enforce ?? false } } as Pick<AppConfig, 'repositories' | 'taskSources' | 'tenancy'>),
    enabled: async tenant => options.enabled ? options.enabled(tenant) : true, demo: false, now: () => clock.now, schedule: false, log: () => undefined,
  });
  return { service: make(), make, db, clock, token };
}

const map = (service: BillingService, client: string, projectId: string, extra: Record<string, unknown> = {}) => service.setMapping(admin, { tenant: 'agency', client, target: { projectId, defaultServiceId: 'defaultservice:fixed' }, price: { perTicket: '450.00' }, since: '2026-10-01', ...extra });

test('an accepted Work Item becomes one fixed-fee project service in the mapped Simplicate project, sent exactly once', async t => {
  const simplicate = await fakeSimplicate(t);
  const { service, token } = world(t, simplicate.apiUrl, [facts('41', 'shop')]);
  map(service, 'acme', 'project:acme');
  const first = await service.sync();
  const second = await service.sync();
  assert.deepEqual({ added: first.added, sent: first.sent }, { added: 1, sent: 1 });
  assert.deepEqual({ added: second.added, sent: second.sent }, { added: 0, sent: 0 });
  assert.equal(simplicate.requests.length, 1, 'two syncs, one request');
  const [sent] = simplicate.requests;
  assert.equal(sent.method, 'POST');
  assert.equal(sent.path, '/api/v2/projects/service');
  assert.equal(sent.headers['authentication-key'], token.key);
  assert.equal(sent.headers['authentication-secret'], token.secret);
  assert.equal(sent.headers['content-type'], 'application/json');
  assert.deepEqual(sent.body, {
    project_id: 'project:acme', default_service_id: 'defaultservice:fixed', name: 'VIK-41 Fix checkout 41',
    explanation: 'VIK-41: merged on 2026-10-20.\nPull request: https://forge.example/agency/shop/pulls/41\nUnfold line unfold:agency:41:acceptance',
    invoice_method: 'FixedFee', amount: 1, price: 450, external_id: 'unfold:agency:41:acceptance', start_date: '2026-10-20', end_date: '2026-10-20', track_hours: false, track_cost: false,
  });
  const [line] = service.store.recent(10);
  assert.equal(line.state, 'sent');
  assert.equal(line.remoteId, 'service:1');
});

test('each Client’s lines go to its own project, switched-off Tenants get none, and lines start at the mapping date', async t => {
  const simplicate = await fakeSimplicate(t);
  const items = [facts('41', 'shop'), facts('42', 'blog'), facts('43', 'site'), facts('44', 'shop', { mergedAt: '2026-09-20T09:00:00Z' })];
  const { service } = world(t, simplicate.apiUrl, items, { enabled: tenant => tenant === 'agency' });
  map(service, 'acme', 'project:acme', { since: '2026-10-01' });
  map(service, 'globex', 'project:globex', { price: { perTicket: '1200.00' } });
  const result = await service.sync();
  assert.equal(result.added, 2);
  assert.deepEqual(simplicate.requests.map(entry => [entry.body.project_id, entry.body.external_id, entry.body.price]).sort(), [['project:acme', 'unfold:agency:41:acceptance', 450], ['project:globex', 'unfold:agency:42:acceptance', 1200]]);
  service.setMapping(admin, { tenant: 'other', target: { projectId: 'project:other', defaultServiceId: 'defaultservice:fixed' }, price: { perTicket: 10 }, since: '2026-10-01' });
  assert.equal((await service.sync()).added, 0, 'billing.export is off for Tenant other');
});

test('a rate limit and a refused connection are retried with backoff; a server error is uncertain and waits for a person', async t => {
  const simplicate = await fakeSimplicate(t, [{ status: 429, body: 'Too Many Requests' }, { status: 200 }]);
  const { service, clock } = world(t, simplicate.apiUrl, [facts('41', 'shop')]);
  map(service, 'acme', 'project:acme');
  const first = await service.sync();
  assert.deepEqual({ sent: first.sent, waiting: first.waiting }, { sent: 0, waiting: 1 });
  let [line] = service.store.recent(1);
  assert.equal(line.state, 'pending');
  assert.equal(line.nextAttemptAt, iso(clock.now + 60_000), 'the first retry waits a minute');
  assert.match(line.lastError!, /429/);
  assert.equal((await service.sendDue()).sent, 0, 'not due yet');
  clock.now += 61_000;
  assert.equal((await service.sendDue()).sent, 1);
  assert.equal(simplicate.requests.length, 2);

  simplicate.push({ status: 500, body: { data: null, errors: ['Internal'], debug: null } }, { status: 200 });
  const second = world(t, simplicate.apiUrl, [facts('51', 'shop')]);
  map(second.service, 'acme', 'project:acme');
  await second.service.sync();
  [line] = second.service.store.recent(1);
  assert.equal(line.state, 'failed');
  assert.equal(line.uncertain, true);
  await assert.rejects(second.service.sendAgain(admin, line.id, {}), { code: 'billing_check_first' });
  const again = await second.service.sendAgain(admin, line.id, { checked: true });
  assert.equal(again.state, 'sent');
  assert.equal(simplicate.requests.filter(entry => entry.body.external_id === 'unfold:agency:51:acceptance').length, 2, 'sent again only after a person checked');

  const vacant = createServer();
  await new Promise<void>(resolve => vacant.listen(0, '127.0.0.1', resolve));
  const port = (vacant.address() as { port: number }).port;
  await new Promise<void>(resolve => vacant.close(() => resolve()));
  const closed = world(t, `http://127.0.0.1:${port}/api/v2`, [facts('61', 'shop')]);
  map(closed.service, 'acme', 'project:acme');
  await closed.service.sync();
  [line] = closed.service.store.recent(1);
  assert.equal(line.state, 'pending', 'no connection made: retried');
  assert.equal(line.uncertain, false);
});

test('a refusal is a visible failure with Simplicate’s message, and a hung request is uncertain', async t => {
  const simplicate = await fakeSimplicate(t, [{ status: 422, body: { data: null, errors: ['project_id is unknown'], debug: null } }, 'hang']);
  const items = [facts('41', 'shop')];
  const { service } = world(t, simplicate.apiUrl, items);
  map(service, 'acme', 'project:acme');
  await service.sync();
  items.push(facts('42', 'shop'));
  await service.sync();
  const lines = service.store.recent(10);
  const refused = lines.find(entry => entry.line.workItemId === '41')!;
  const hung = lines.find(entry => entry.line.workItemId === '42')!;
  assert.equal(refused.state, 'failed');
  assert.equal(refused.uncertain, false);
  assert.equal(refused.lastError, 'Simplicate answered 422: project_id is unknown');
  assert.equal(hung.state, 'failed');
  assert.equal(hung.uncertain, true);
  assert.equal(service.markSent(admin, hung.id).state, 'sent', 'a person found it in Simplicate');
});

test('a Reversal within 14 days writes one credit line; a line never sent is cancelled; late or repeated Reversals are refused', async t => {
  const simplicate = await fakeSimplicate(t);
  const revert = { forge: 'forgejo', owner: 'agency', repo: 'shop', number: 9, mergeCommitSha: 'aaa', mergedAt: '2026-10-24T10:00:00Z', mergedBy: 'ryan', matchedBy: 'revert_commit', detectedAt: '2026-10-24T10:05:00Z' };
  const items = [facts('41', 'shop')];
  const { service, clock } = world(t, simplicate.apiUrl, items);
  map(service, 'acme', 'project:acme');
  await service.sync();
  items[0] = facts('41', 'shop', { reverts: [revert] });
  clock.now = Date.parse('2026-10-25T12:00:00Z');
  await service.sync();
  const [line] = service.store.recent(1);
  assert.deepEqual(line.revertDetected, { reference: 'agency/shop#9', mergedAt: '2026-10-24T10:00:00Z' });
  await assert.rejects(service.reverse(admin, line.id, {}), { code: 'billing_reason' });
  const credit = await service.reverse(admin, line.id, { reason: 'Checkout total rounded wrongly, inside AC 2', revertUrl: 'https://forge.example/agency/shop/pulls/9' });
  assert.equal(credit.state, 'sent');
  assert.equal(credit.line.key, 'unfold:agency:41:acceptance:reversal');
  const body = simplicate.requests[1].body;
  assert.equal(body.amount, -1);
  assert.equal(body.price, 450);
  assert.equal(body.name, 'Credit: VIK-41 Fix checkout 41');
  assert.equal(body.external_id, 'unfold:agency:41:acceptance:reversal');
  assert.match(body.explanation, /Reverses the accepted ticket: Checkout total rounded wrongly, inside AC 2 \(revert: https:\/\/forge\.example\/agency\/shop\/pulls\/9\)\./);
  await assert.rejects(service.reverse(admin, line.id, { reason: 'again' }), { code: 'billing_reversed' });
  assert.equal(simplicate.requests.length, 2);

  const late = world(t, simplicate.apiUrl, [facts('42', 'shop')]);
  map(late.service, 'acme', 'project:acme');
  await late.service.sync();
  late.clock.now = merged + 15 * 86_400_000;
  await assert.rejects(late.service.reverse(admin, late.service.store.recent(1)[0].id, { reason: 'too late' }), { code: 'billing_reversal_late' });

  const quiet = world(t, simplicate.apiUrl, [facts('43', 'shop')]);
  map(quiet.service, 'acme', 'project:acme');
  const before = simplicate.requests.length;
  simplicate.push({ status: 503 });
  await quiet.service.sync();
  const pending = quiet.service.store.recent(1)[0];
  assert.equal(pending.state, 'pending');
  const cancelled = await quiet.service.reverse(admin, pending.id, { reason: 'Reverted before it was billed' });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(simplicate.requests.length, before + 1, 'no credit line for a line Simplicate never took');
  assert.equal((await quiet.service.sendDue()).sent, 0, 'a cancelled line is never sent');
});

test('a per-Size price waits for the administrator’s price while Ploeg records no Size, and a restart mid-send is uncertain', async t => {
  const simplicate = await fakeSimplicate(t);
  const { service, make } = world(t, simplicate.apiUrl, [facts('41', 'shop')]);
  map(service, 'acme', 'project:acme', { price: { perSize: { S: '150', M: '450.5' } } });
  assert.equal(service.store.mapping({ tenant: 'agency', client: 'acme' })!.price.perSizeCents.M, 45050);
  await service.sync();
  const [line] = service.store.recent(1);
  assert.equal(line.state, 'needs_price');
  assert.equal(simplicate.requests.length, 0);
  await assert.rejects(service.setPrice(admin, line.id, { price: 'twelve' }), { code: 'billing_price' });
  const priced = await service.setPrice(admin, line.id, { price: '450.5', size: 'M' });
  assert.equal(priced.state, 'sent');
  assert.equal(simplicate.requests[0].body.price, 450.5);

  service.store.save({ ...service.store.get(line.id)!, state: 'sending' });
  const restarted = make().store.get(line.id)!;
  assert.equal(restarted.state, 'failed');
  assert.equal(restarted.uncertain, true);
});

test('with tenancy enforced, an administrator sees and changes only the Tenants they reach, and others get 404', async t => {
  const simplicate = await fakeSimplicate(t);
  const { service } = world(t, simplicate.apiUrl, [facts('41', 'shop'), facts('43', 'site')], { enforce: true });
  map(service, 'acme', 'project:acme');
  service.setMapping(admin, { tenant: 'other', target: { projectId: 'project:other', defaultServiceId: 'defaultservice:fixed' }, price: { perTicket: 10 }, since: '2026-10-01' });
  await service.sync();
  assert.equal(simplicate.requests.length, 2);
  const agencyOnly: User = { id: 'olga', name: 'olga', role: 'admin', memberships: [{ kind: 'tenant', tenant: 'agency', role: 'admin' }] };
  const view = await service.view(agencyOnly) as { lines: { line: BillingLine; id: string }[]; owners: { tenant: string }[] };
  assert.deepEqual(view.lines.map(entry => entry.line.tenant), ['agency']);
  assert(view.owners.every(owner => owner.tenant === 'agency'));
  const otherLine = service.store.recent(10).find(entry => entry.line.tenant === 'other')!;
  await assert.rejects(service.reverse(agencyOnly, otherLine.id, { reason: 'x' }), { status: 404 });
  assert.throws(() => service.setMapping(agencyOnly, { tenant: 'other', target: { projectId: 'p', defaultServiceId: 'd' }, price: { perTicket: 1 } }), { status: 404 });
  const operator: User = { id: 'otto', name: 'otto', role: 'operator', memberships: admin.memberships };
  await assert.rejects(service.view(operator), { status: 403 });
  assert.equal(service.export(agencyOnly, 'csv').text.split('\r\n').filter(Boolean).length, 2, 'a header and the agency line');
});

test('the file exporter writes one UBL 2.1 JSON line and one CSV record per line, once', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-billing-files-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const definition = billingExporters.get('file')!;
  const settings = definition.settings({ directory }, { env: {}, dataDir: directory, agentEnvironment: [] });
  const exporter = definition.create(settings, { fetch, env: {}, dataDir: directory, timeoutMs: 1000 });
  const line: BillingLine & { unitPriceCents: number } = { key: 'unfold:agency:41:acceptance:reversal', kind: 'reversal', tenant: 'agency', client: 'acme', workItemId: '41', externalRef: 'VIK-41', title: '=Fix, "checkout"', workItemUrl: null, acceptance: { kind: 'approved', at: '2026-10-20T09:00:00Z', pullRequestUrl: 'https://forge.example/pulls/41' }, size: 'M', quantity: -1, unitPriceCents: 45000, currency: 'EUR', reversal: { reverses: 'unfold:agency:41:acceptance', reason: 'Defect in AC 1', revertUrl: null, at: '2026-10-22T09:00:00Z', by: 'adam' } };
  await exporter.send(line, { reference: 'ACME-01' });
  await exporter.send(line, { reference: 'ACME-01' });
  const files = (await readdir(join(directory, 'agency'))).sort();
  assert.deepEqual(files, ['lines.csv', 'unfold_agency_41_acceptance_reversal.json']);
  const csv = await readFile(join(directory, 'agency', 'lines.csv'), 'utf8');
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2, 'a header and one record');
  assert.match(csv, /,"'=Fix, ""checkout""",approved,2026-10-20,https:\/\/forge\.example\/pulls\/41,M,-1,450\.00,-450\.00,EUR,Defect in AC 1,,ACME-01\r\n$/);
  const ubl = JSON.parse(await readFile(join(directory, 'agency', 'unfold_agency_41_acceptance_reversal.json'), 'utf8'));
  assert.equal(ubl._D, 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
  const [entry] = ubl.InvoiceLine;
  assert.deepEqual(entry.InvoicedQuantity, [{ _: -1, unitCode: 'C62' }]);
  assert.deepEqual(entry.LineExtensionAmount, [{ _: -450, currencyID: 'EUR' }]);
  assert.deepEqual(entry.Price, [{ PriceAmount: [{ _: 450, currencyID: 'EUR' }] }], 'EN 16931: the price stays positive on a credit');
  assert.deepEqual(entry.AccountingCost, [{ _: 'ACME-01' }]);
  assert.deepEqual(entry.Item[0].SellersItemIdentification, [{ ID: [{ _: 'VIK-41' }] }]);
  assert.deepEqual(entry.DocumentReference[0].ID, [{ _: 'https://forge.example/pulls/41' }]);
  assert.equal(billingCsv([]), 'key,kind,tenant,client,work_item_id,external_ref,title,acceptance_kind,accepted_on,pull_request_url,size,quantity,unit_price,line_amount,currency,reversal_reason,revert_url,target_reference\r\n');
  assert.deepEqual(ublInvoiceLines([]).InvoiceLine, []);
});

test('billing settings take the credential only from the environment, refuse unknown fields and never run in the demo', () => {
  const env = { BILLING_TOKEN: `${randomBytes(8).toString('hex')}:${randomBytes(8).toString('hex')}` } as NodeJS.ProcessEnv;
  const context = { env, dataDir: '/data', agentEnvironment: [] as string[] };
  assert.equal(billingSettings(undefined, billingExporters, context), undefined, 'off by default');
  const settings = billingSettings({ exporter: 'simplicate', simplicate: { domain: 'agency', tokenEnv: 'BILLING_TOKEN' } }, billingExporters, context) as BillingSettings;
  assert.deepEqual(settings, { exporter: 'simplicate', options: { apiUrl: 'https://agency.simplicate.nl/api/v2', tokenEnv: 'BILLING_TOKEN' }, currency: 'EUR', syncMinutes: 15 });
  assert.throws(() => billingSettings({ exporter: 'moneybird' }, billingExporters, context), /billing\.exporter must be one of simplicate, file/);
  assert.throws(() => billingSettings({ exporter: 'simplicate', simplicate: { domain: 'agency', tokenEnv: 'BILLING_TOKEN', key: 'k' } }, billingExporters, context), /does not take key/);
  assert.throws(() => billingSettings({ exporter: 'simplicate', simplicate: { domain: 'agency', tokenEnv: 'MISSING' } }, billingExporters, context), /key:secret/);
  assert.throws(() => billingSettings({ exporter: 'simplicate', simplicate: { domain: 'agency', tokenEnv: 'BILLING_TOKEN' } }, billingExporters, { ...context, agentEnvironment: ['BILLING_TOKEN'] }), /never enter an agent workspace/);
  assert.throws(() => billingSettings({ exporter: 'simplicate', simplicate: { apiUrl: 'http://simplicate.example', tokenEnv: 'BILLING_TOKEN' } }, billingExporters, context), /https/);
  assert.throws(() => refuseDemoCredentials({ billing: { exporter: 'file' } }, {}), /Demo mode gives every visitor admin; it cannot use billing/);
  assert.throws(() => billingTarget({ projectId: 'p' }, billingExporters.get('simplicate')!.targetFields), /Simplicate service id is required/);
  assert.equal(priceCents('450'), 45000);
  assert.equal(priceCents(0.5), 50);
  assert.throws(() => priceCents('450,00'), /amount/);
  assert.equal(amountText(-5), '-0.05');
});

test('the billing routes are for administrators, answer the demo plainly, and download CSV and UBL', async t => {
  const simplicate = await fakeSimplicate(t);
  const token = credential(t);
  const server = await application('live', config => {
    config.repositories = [...config.repositories, ...repositories];
    config.billing = billingSettings({ exporter: 'simplicate', simplicate: { apiUrl: simplicate.apiUrl, tokenEnv: token.name } }, billingExporters, { env: process.env, dataDir: config.dataDir, agentEnvironment: [] });
  });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  server.app.store.addUser({ id: 'otto', name: 'otto', role: 'operator', passwordHash: await hashPassword(password) });
  const otto = (await login(server.url, 'otto', password)).cookie;
  const adminCookie = (await login(server.url)).cookie;
  assert.equal((await request(server.url, '/api/billing', { cookie: otto })).status, 403);
  const view = await request(server.url, '/api/billing', { cookie: adminCookie });
  assert.equal(view.status, 200, view.text);
  assert.equal(view.body.configured, true);
  assert.equal(view.body.exporter.name, 'simplicate');
  assert(view.body.owners.some((owner: { tenant: string; client: string | null }) => owner.tenant === 'agency' && owner.client === 'acme'));
  const saved = await request(server.url, '/api/billing/mappings', { method: 'PUT', cookie: adminCookie, body: { tenant: 'agency', client: 'acme', target: { projectId: 'project:acme', defaultServiceId: 'defaultservice:fixed' }, price: { perTicket: '450.00' } } });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body.price.perTicketCents, 45000);
  const bad = await request(server.url, '/api/billing/mappings', { method: 'PUT', cookie: adminCookie, body: { tenant: 'agency', client: 'acme', target: { projectId: 'project:acme' }, price: { perTicket: '450' } } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'billing_mapping');
  const csv = await request(server.url, '/api/billing/lines?format=csv', { cookie: adminCookie });
  assert.equal(csv.response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(csv.text, /^key,kind,tenant/);
  const ublFile = await request(server.url, '/api/billing/lines?format=ubl', { cookie: adminCookie });
  assert.deepEqual(ublFile.body.InvoiceLine, []);
  const sync = await request(server.url, '/api/billing/sync', { method: 'POST', cookie: adminCookie });
  assert.equal(sync.status, 200, sync.text);
  assert.equal(simplicate.requests.length, 0, 'the flag is off by default, and no Ploeg is connected');
  assert.equal(JSON.stringify(view.body).includes(token.secret), false);

  const demo = await application('demo');
  t.after(() => demo.close());
  const demoView = await request(demo.url, '/api/billing');
  assert.deepEqual(demoView.body, { demo: true });
});

test('a route that is not a billing route answers 404, and an unconfigured billing refuses changes', async () => {
  const service = new BillingService(new BillingStore(new DatabaseSync(':memory:')), { tenants: new TenantScope({ repositories: [], taskSources: [] } as unknown as AppConfig), enabled: async () => false, demo: false, schedule: false });
  await assert.rejects(billingRoute(service, admin, 'GET', '/api/billing/elsewhere', new URLSearchParams(), async () => ({})), { status: 404 });
  await assert.rejects(billingRoute(service, admin, 'PUT', '/api/billing/mappings', new URLSearchParams(), async () => ({})), { code: 'billing_unconfigured' });
});
