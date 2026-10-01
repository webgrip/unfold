import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { application, login, request } from './api-support.ts';
import { card } from './collection-support.ts';

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString().replace(/\.\d{3}Z$/, 'Z');

function recentCard(id: string, people: { name: string; roles: string[] }[]) {
  return card(id, { roster: people, steward: { name: people[0].name, source: 'merged_by' }, events: [{ at: ago(12), kind: 'minted', actor: 'team:delivery' }], totals: { costStatus: 'not_reported', firstRunAt: ago(12) }, plays: [{ number: Number(id), state: 'merged', mergedAt: ago(11), mergedBy: people[0].name }], release: { at: ago(10), source: 'deploy', environment: 'production' } });
}

async function upstream(t: TestContext, { cardList = true } = {}) {
  const env = `VLOER_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const cards = [recentCard('201', [{ name: 'ryan', roles: ['developer', 'merger'] }]), recentCard('202', [{ name: 'iris', roles: ['developer'] }, { name: 'ryan', roles: ['reviewer'] }]), recentCard('203', [{ name: 'sam', roles: ['developer'] }])];
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(req.url!);
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (data: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (url.pathname.endsWith('/teams')) return send({ schemaVersion: '1.0', teams: ploegDemo.teams });
    if (url.pathname.endsWith('/operator/cards')) {
      if (!cardList) { res.writeHead(404).end(); return; }
      const members = url.searchParams.getAll('member');
      const matching = cards.filter(entry => entry.roster.some(person => members.includes(person.name)));
      if (!url.searchParams.get('before')) return send({ schemaVersion: 1, cards: [], nextBefore: 'c1.page2' });
      return send({ schemaVersion: 1, cards: matching, nextBefore: null });
    }
    if (url.pathname.endsWith('/work-items')) return send({ schemaVersion: '1.0', items: url.searchParams.get('team') === 'delivery' ? cards.map(entry => ({ ...ploegDemo.items[0], id: entry.workItemId, title: entry.title, team: 'delivery', updatedAt: ago(1), latestShift: null })) : [], nextCursor: null });
    const cardPath = /\/work-items\/([0-9]+)\/card$/.exec(url.pathname);
    const found = cardPath && cards.find(entry => entry.workItemId === cardPath[1]);
    if (found) return send({ schemaVersion: 1, card: found });
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, seen };
}

async function liveWithPloeg(t: TestContext, options?: { cardList?: boolean }) {
  const ploeg = await upstream(t, options);
  const operatorId = 'operator-ryan';
  const api = await application('live', config => { config.ploeg = { ...ploeg.config, userTeams: { [operatorId]: ['delivery'] }, forgeLogins: { [operatorId]: 'ryan' } }; config.cards = { backfillPeriods: 4, teams: {} }; });
  t.after(() => api.close());
  api.app.store.addUser({ id: operatorId, name: 'ryan@example.test', role: 'operator', passwordHash: hashPassword('operator-password-2718') });
  api.app.store.addUser({ id: 'viewer-iris', name: 'iris@example.test', role: 'viewer', passwordHash: hashPassword('viewer-password-1414') });
  const admin = await login(api.url);
  const operator = await login(api.url, 'ryan@example.test', 'operator-password-2718');
  const viewer = await login(api.url, 'iris@example.test', 'viewer-password-1414');
  return { api, ploeg, admin, operator, viewer };
}

test('the collection routes need a sign-in, the application request header for writes, and a supported method', async t => {
  const api = await application('live');
  t.after(() => api.close());
  for (const path of ['/api/binder', '/api/packs', '/api/packs/odds', '/api/season', '/api/me/card-identity']) assert.equal((await request(api.url, path)).status, 401, path);
  const { cookie } = await login(api.url);
  assert.equal((await request(api.url, '/api/me/card-identity', { method: 'PUT', body: { logins: ['ryan'] }, cookie, csrf: false })).status, 403, 'a write without the request header is refused');
  assert.equal((await request(api.url, '/api/binder/seen', { method: 'POST', cookie, csrf: false })).status, 403);
  assert.equal((await request(api.url, '/api/packs/2026-W36/open', { method: 'POST', cookie, csrf: false })).status, 403);
  assert.equal((await request(api.url, '/api/binder', { method: 'DELETE', cookie })).status, 405);
  assert.equal((await request(api.url, '/api/me/card-identity', { method: 'PUT', body: { logins: 'ryan' }, cookie })).status, 400);
});

test('the demo binder, packs, odds and season work without Ploeg, say they are a demo and show no spend', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const binder = await request(api.url, '/api/binder');
  assert.equal(binder.status, 200, binder.text);
  assert.equal(binder.body.demo, true);
  assert.deepEqual(binder.body.identity, { logins: ['demo-operator'], mapped: 'demo-operator', declared: [], verified: ['demo-operator'], source: 'demo', updatedAt: null });
  assert(binder.body.copies.length >= 8 && binder.body.copies.every((entry: any) => entry.card.demo === true && entry.card.totals.costUsd === undefined), 'demo cards, no cost figure');
  const packs = await request(api.url, '/api/packs');
  const next = packs.body.packs.find((pack: any) => pack.next);
  assert(next, 'the demo has a pack to open');
  const opened = await request(api.url, `/api/packs/${next.id}/open`, { method: 'POST' });
  assert.equal(opened.status, 200, opened.text);
  assert.equal(opened.body.pack.demo, true);
  const again = await request(api.url, `/api/packs/${next.id}/open`, { method: 'POST' });
  assert.equal(again.status, 409);
  const odds = await request(api.url, '/api/packs/odds');
  assert.equal(odds.body.patterns.reduce((sum: number, entry: any) => sum + entry.basisPoints, 0), 10_000);
  const season = await request(api.url, '/api/season?team=delivery&quarter=2026-Q3');
  assert.equal(season.status, 200, season.text);
  assert.equal(season.body.demo, true);
  assert(!/demo-operator|demo-reviewer/.test(season.text), 'the season page names nobody');
});

test('live: Vloer asks Ploeg\'s card list for the person\'s own logins and pages until nextBefore is null; nobody reads another person\'s binder or packs', async t => {
  const { api, ploeg, admin, operator, viewer } = await liveWithPloeg(t);
  assert.equal((await request(api.url, '/api/me/card-identity', { method: 'PUT', body: { logins: ['ryan'] }, cookie: operator.cookie })).status, 200);
  assert.equal((await request(api.url, '/api/me/card-identity', { method: 'PUT', body: { logins: ['iris'] }, cookie: viewer.cookie })).status, 200, 'a viewer sets their own logins');
  const mine = await request(api.url, '/api/binder', { cookie: operator.cookie });
  assert.equal(mine.status, 200, mine.text);
  assert.deepEqual(mine.body.copies.map((entry: any) => [entry.card.workItemId, entry.copy.role, entry.copy.steward]).sort(), [['201', 'developer', true], ['202', 'reviewer', false]], 'the mapped login stewards 201');
  assert.deepEqual([mine.body.identity.mapped, mine.body.identity.source], ['ryan', 'mapped']);
  assert.equal(mine.body.source.kind, 'list');
  const listCalls = ploeg.seen.filter(path => path.includes('/operator/cards?'));
  assert(listCalls.some(path => /member=ryan/.test(path) && !/before=/.test(path)) && listCalls.some(path => /before=c1.page2/.test(path)), `paged past a short first page: ${listCalls}`);
  assert(!listCalls.some(path => /member=iris/.test(path) && path.includes('member=ryan')), 'one person\'s logins never travel with another\'s');
  const adminBinder = await request(api.url, '/api/binder?user=operator-ryan', { cookie: admin.cookie });
  assert.equal(adminBinder.body.copies.length, 0, 'an administrator cannot ask for someone else\'s binder; the parameter is ignored');
  assert.deepEqual(adminBinder.body.identity.logins, []);
  const packs = await request(api.url, '/api/packs', { cookie: operator.cookie });
  const next = packs.body.packs.find((pack: any) => pack.next);
  assert(next, JSON.stringify(packs.body.packs));
  const opened = await request(api.url, `/api/packs/${next.id}/open`, { method: 'POST', cookie: operator.cookie });
  assert.equal(opened.status, 200, opened.text);
  assert(opened.body.pack.entries.some((entry: any) => entry.kind === 'new' && /^[0-9a-f]{64}$/.test(entry.pull.digest)));
  assert.equal(JSON.stringify(opened.body).includes('message'), false, 'the HMAC input stays on the server');
  assert.equal((await request(api.url, `/api/packs/${next.id}`, { cookie: admin.cookie })).status, 404, 'an administrator cannot read the operator\'s opened pack');
  assert.equal((await request(api.url, `/api/packs/${next.id}`, { cookie: viewer.cookie })).status, 404, 'nor can another person');
  assert.equal((await request(api.url, `/api/packs/${next.id}`, { cookie: operator.cookie })).status, 200);
  const viewerBinder = await request(api.url, '/api/binder', { cookie: viewer.cookie });
  assert.equal(viewerBinder.status, 403, 'a viewer without Ploeg Team access gets no cards');
  const season = await request(api.url, '/api/season?team=research', { cookie: operator.cookie });
  assert.equal(season.status, 404, 'a Team outside the person\'s scope has no season page for them');
});

test('live: an older Ploeg without the card list answers 404 and Vloer falls back to a bounded scan of recent Work Items', async t => {
  const { api, ploeg, operator } = await liveWithPloeg(t, { cardList: false });
  await request(api.url, '/api/me/card-identity', { method: 'PUT', body: { logins: ['ryan'] }, cookie: operator.cookie });
  const binder = await request(api.url, '/api/binder', { cookie: operator.cookie });
  assert.equal(binder.status, 200, binder.text);
  assert.deepEqual(binder.body.source, { kind: 'scan', scanned: 3, truncated: false });
  assert.deepEqual(binder.body.copies.map((entry: any) => entry.card.workItemId).sort(), ['201', '202']);
  assert(ploeg.seen.some(path => path.includes('/work-items/201/card')), 'it read each recent card');
});
