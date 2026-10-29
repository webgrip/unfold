import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { hashPassword } from '../src/auth.ts';
import { application, login, request } from './api-support.ts';

type Json = Record<string, any>;
const head = 'c'.repeat(40);

function world(): Json {
  const facts = JSON.parse(readFileSync(new URL('./fixtures/cards/service/attribution-flow.json', import.meta.url), 'utf8')).world[0];
  facts.pullRequests[0] = { ...facts.pullRequests[0], state: 'open', mergedAt: null, mergedBy: null, mergeCommitSha: null, headSha: head, changedPaths: { headSha: head, truncated: false, capturedAt: '2026-10-29T09:00:00Z', paths: [{ path: 'src/pages/home.tsx', status: 'modified' }, { path: 'infra/deploy.yaml', status: 'modified' }] } };
  return facts;
}

async function ploegStub(t: TestContext, facts: Json) {
  const env = `UNFOLD_PLOEG_SIGNOFF_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const writes: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const path = new URL(req.url!, 'http://fixture.invalid').pathname.replace('/api/v1/operator/', '');
    const send = (status: number, data: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (req.method !== 'GET') { writes.push(`${req.method} ${path}`); return send(404, { error: { code: 'not_found', message: 'nope' } }); }
    if (path === 'facts') return send(200, { schemaVersion: '1.0', facts: [facts], nextBefore: null });
    if (path === `work-items/${facts.workItem.id}/facts`) return send(200, { schemaVersion: '1.0', facts });
    const w = facts.workItem;
    if (path === `work-items/${w.id}`) return send(200, { schemaVersion: '1.0', item: { id: w.id, provider: w.provider, externalId: w.externalId, revision: 'r1', team: w.team, state: 'awaiting_review', title: w.title, description: '', url: '', priority: 0, attempts: 0, infraFailures: 0, nextEligibleAt: null, createdAt: w.createdAt, updatedAt: w.updatedAt, target: null, latestShift: null, lease: null }, shifts: [], runs: [], checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false } });
    return res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, writes };
}

async function signedIn(t: TestContext, flag: boolean) {
  const facts = world();
  const stub = await ploegStub(t, facts);
  const server = await application('live', config => {
    config.ploeg = { ...stub.config, userTeams: { olga: ['silver'], vera: ['silver'], otto: ['gold'] } };
    if (flag) config.flags = { document: { flags: { 'client.sign-off': { defaultVariant: 'on' } } }, unknown: [] };
  });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  const people: Record<string, string> = {};
  for (const [id, role] of [['olga', 'operator'], ['vera', 'viewer'], ['otto', 'operator'], ['adam', 'admin']] as const) {
    server.app.store.addUser({ id, name: id, role, passwordHash: await hashPassword(password) });
    people[id] = (await login(server.url, id, password)).cookie;
  }
  return { url: server.url, people, id: String(facts.workItem.id), stub };
}

test('an operator records and withdraws a Client Sign-off at the head they saw, with exclusions an administrator set, and Ploeg sees no write', async t => {
  const { url, people, id, stub } = await signedIn(t, true);
  const route = `/api/ploeg/work-items/${id}/client-sign-off`;
  const excluded = await request(url, '/api/client-sign-off/exclusions', { method: 'PUT', cookie: people.adam, body: { repository: 'WebGrip/Ploeg', exclude: ['infra/**'] } });
  assert.equal(excluded.status, 200, excluded.text);
  assert.equal((await request(url, '/api/client-sign-off/exclusions', { method: 'PUT', cookie: people.olga, body: { repository: 'webgrip/ploeg', exclude: [] } })).status, 403, 'only administrators set exclusions');
  const before = await request(url, route, { cookie: people.olga });
  assert.equal(before.status, 200, before.text);
  assert.deepEqual([before.body.current, before.body.pullRequest.headSha, before.body.scope.excluded], [null, head, ['infra/deploy.yaml']]);
  assert.equal((await request(url, route, { method: 'POST', cookie: people.olga, body: { answer: 'looks_good', headSha: 'd'.repeat(40) } })).body.error.code, 'head_moved');
  const signed = await request(url, route, { method: 'POST', cookie: people.olga, body: { answer: 'looks_good', headSha: head } });
  assert.equal(signed.status, 201, signed.text);
  assert.deepEqual([signed.body.headSha, signed.body.person.id, signed.body.person.attribution, signed.body.scope.covered], [head, 'olga', 'asserted', ['src/pages/home.tsx']]);
  assert.equal((await request(url, route, { method: 'POST', cookie: people.vera, body: { answer: 'looks_good', headSha: head } })).status, 403, 'a viewer cannot sign off');
  assert.equal((await request(url, route, { cookie: people.otto })).status, 404, 'a Work Item outside the caller’s Teams is not found');
  const withdrawn = await request(url, `${route}/withdraw`, { method: 'POST', cookie: people.olga });
  assert.equal(withdrawn.status, 200, withdrawn.text);
  assert.equal(withdrawn.body.state, 'withdrawn');
  const actions = await request(url, `/api/actions?workItemId=${id}`, { cookie: people.olga });
  assert.deepEqual(actions.body.actions.map((entry: Json) => entry.action).sort(), ['POST /api/ploeg/work-items/:id/client-sign-off', 'POST /api/ploeg/work-items/:id/client-sign-off', 'POST /api/ploeg/work-items/:id/client-sign-off/withdraw'].sort());
  assert.deepEqual(stub.writes, [], 'a Sign-off changes no Ploeg state, and the comment flag is off');
});

test('with the flag off a Sign-off is refused and nothing is stored', async t => {
  const { url, people, id } = await signedIn(t, false);
  const refused = await request(url, `/api/ploeg/work-items/${id}/client-sign-off`, { method: 'POST', cookie: people.olga, body: { answer: 'looks_good', headSha: head } });
  assert.deepEqual([refused.status, refused.body.error.code], [404, 'client_sign_off_off']);
});
