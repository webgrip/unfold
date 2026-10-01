import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { PloegClient, parseCard, validatePloeg } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { hashPassword } from '../src/auth.ts';
import { application, configuration, login, request } from './api-support.ts';

type Post = { path: string; actor?: string; acting?: string; body: string };

async function upstream(t: TestContext) {
  const env = `VLOER_PLOEG_CRACKS_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const posts: Post[] = [];
  const reads: string[] = [];
  const state = { cracks: structuredClone(ploegDemo.cracks) as unknown[], candidates: structuredClone(ploegDemo.crackCandidates['124']) as unknown, refusal: null as null | { status: number; code: string; message: string } };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (status: number, data: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        posts.push({ path: url.pathname, actor: req.headers['x-ploeg-actor'] as string, acting: req.headers['x-ploeg-acting-user'] as string, body: Buffer.concat(chunks).toString('utf8') });
        if (state.refusal) { send(state.refusal.status, { error: { code: state.refusal.code, message: state.refusal.message } }); return; }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const propose = /\/work-items\/(\d+)\/(cracks|evolved)$/.exec(url.pathname);
        if (propose) { send(propose[2] === 'cracks' ? 201 : 200, { crack: { ...ploegDemo.cracks[1], id: '7200', state: propose[2] === 'cracks' ? 'proposed' : 'evolved', card: { workItemId: body.card, title: 'Card', externalRef: '' }, bug: { workItemId: propose[1], title: 'Bug', externalRef: '' }, proposedBy: req.headers['x-ploeg-acting-user'] } }); return; }
        const step = /\/cracks\/(\d+)\/(confirm|dispute|resolve)$/.exec(url.pathname);
        if (step) { send(200, { crack: { ...ploegDemo.cracks[1], id: step[1], state: 'confirmed', confirmedBy: ['demo-dev', req.headers['x-ploeg-acting-user']], confirmedAt: '2026-10-01T10:00:00Z' } }); return; }
        send(404, { error: { code: 'not_found', message: 'nope' } });
      });
      return;
    }
    reads.push(url.pathname);
    if (/\/work-items\/\d+\/cracks$/.test(url.pathname)) { send(200, { cracks: state.cracks }); return; }
    if (/\/work-items\/124\/crack-candidates$/.test(url.pathname)) { send(200, { crackCandidates: state.candidates }); return; }
    const id = url.pathname.split('/').at(-1)!;
    if (ploegDemo.details[id]) { send(200, ploegDemo.details[id]); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, posts, reads, state, bearer };
}

const contractCard = (extra: Record<string, unknown> = {}) => ({ workItemId: '118', title: 'Validate postcodes', team: 'delivery', target: null, style: { skin: 'vloer-native', theme: null }, state: 'merged', rarity: null, finish: 'matte', grade: null, condition: null, steward: { name: 'ryan', source: 'merged_by' }, roster: [], crew: [], plays: [], totals: { costStatus: 'not_reported', usageComplete: null, firstRunAt: null, lastRunAt: null }, events: [], deployments: [], release: null, live: null, demo: false, ...extra });
const inputs = { reliability: { crackWeight: 1.25, reverted: false }, durability: { daysLive: 41, liveSince: '2026-08-20T10:00:00Z', reverts: 0, hotfixes: 1, survival: null }, delivery: { budgetShare: 0.5, defectBounces: 1, extraPlays: 0, failedRuns: 0 }, review: { ciFirstGreen: null, findings: null, changeRequests: 2, reviewRounds: 2 }, notCollected: ['durability.survival', 'review.ciFirstGreen', 'review.findings', 'bogus key'] };

test('the card proxy passes gates, evolved, a set, grade inputs, crack weights and the cosigner through validated, and keeps them absent for an older Ploeg', () => {
  const older = parseCard(contractCard());
  assert.deepEqual(['gates', 'evolved', 'set'].filter(key => key in older), [], 'an older Ploeg sends none of them and they stay absent');
  const gates = { current: 'done', history: [{ gate: 'development', enteredAt: '2026-08-01T10:00:00Z', leftAt: '2026-08-02T10:00:00Z' }, { gate: 'test', enteredAt: '2026-08-02T10:00:00Z' }], bounces: [{ from: 'test', to: 'development', at: '2026-08-03T10:00:00Z', reason: 'defect', actor: 'iris', extra: 1 }], rightFirstTime: { test: 1, acceptance: 0, bogus: 3 } };
  const grade = { formula: '2026.2', overall: 9, provisional: true, subgrades: { reliability: 9, durability: 9, delivery: 9, review: 9 }, label: null, qualifiers: ['HF'], inputs };
  const condition = { state: 'cracked', cracks: [{ id: '7101', bug: { workItemId: '124', ref: 'DEMO-24', title: 'Postcode with a space' }, severity: 'S3', share: 'primary', discovery: 'discovered', proposedAt: '2026-09-29T10:00:00Z', confirmedAt: '2026-09-30T10:00:00Z', confirmedBy: ['dev', 'tester'], disputed: false, weight: 1, warranty: 'full', mended: { at: '2026-09-29T12:00:00Z', by: 'dev', pr: 24, bySteward: false, confirmedAt: null } }] };
  const set = { role: 'child', epic: { workItemId: '125', ref: 'DEMO-25', title: 'Checkout hardening' }, position: 2, size: 5, complete: false };
  const card = parseCard(contractCard({ gates, evolved: true, set, grade, condition, roster: [{ name: 'dev', roles: ['cosigner'] }] }));
  assert.deepEqual(card.gates, { current: 'done', history: [{ gate: 'development', enteredAt: '2026-08-01T10:00:00Z', leftAt: '2026-08-02T10:00:00Z' }, { gate: 'test', enteredAt: '2026-08-02T10:00:00Z', leftAt: null }], bounces: [{ from: 'test', to: 'development', at: '2026-08-03T10:00:00Z', reason: 'defect', actor: 'iris' }], rightFirstTime: { test: 1, acceptance: 0 } });
  assert.equal(card.evolved, true);
  assert.deepEqual(card.set, { ...set, children: [] });
  assert.deepEqual(card.grade?.inputs, { ...inputs, notCollected: ['durability.survival', 'review.ciFirstGreen', 'review.findings'] }, 'the inputs pass through, unknown names dropped');
  assert.deepEqual(card.condition?.cracks[0], condition.cracks[0]);
  assert.deepEqual(card.roster, [{ name: 'dev', roles: ['cosigner'] }]);
  const epic = parseCard(contractCard({ set: { role: 'epic', epic: { workItemId: '125', title: 'Checkout hardening' }, position: null, size: 2, children: [{ workItemId: 118, title: 'Postcodes', state: 'merged', settled: true, cracked: true }, { workItemId: '121', title: '404s', state: 'in_review', settled: false, cracked: false, extra: 1 }], complete: false } }));
  assert.deepEqual(epic.set?.children, [{ workItemId: '118', title: 'Postcodes', state: 'merged', settled: true, cracked: true }, { workItemId: '121', title: '404s', state: 'in_review', settled: false, cracked: false }]);
  for (const [bad, why] of [[{ ...gates, current: 'staging' }, 'an unknown gate'], [{ ...gates, bounces: [{ ...gates.bounces[0], reason: 'blame' }] }, 'an unknown bounce reason'], [{ ...gates, history: [{ gate: 'test', enteredAt: 'soon' }] }, 'a time that is not a time']] as const) assert.equal(parseCard(contractCard({ gates: bad })).gates, null, `gates with ${why} become null`);
  for (const [bad, why] of [[{ ...set, position: 6 }, 'a position past the size'], [{ ...set, role: 'parent' }, 'an unknown role'], [{ ...set, epic: null }, 'no epic']] as const) assert.equal(parseCard(contractCard({ set: bad })).set, null, `a set with ${why} becomes null`);
  assert.equal(parseCard(contractCard({ evolved: 'yes' })).evolved, undefined, 'only a true evolved passes');
  assert.equal(parseCard(contractCard({ condition: { ...condition, cracks: [{ ...condition.cracks[0], warranty: 'lifetime' }] } })).condition, null, 'an unknown warranty drops the condition');
  assert.equal(parseCard(contractCard({ grade: { ...grade, inputs: { reliability: {} } } })).grade?.inputs, undefined, 'inputs missing a subgrade are dropped, the grade stays');
});

test('crack attribution goes through an authenticated, CSRF-guarded, role-, forge-login- and team-scoped proxy', async t => {
  const fixture = await upstream(t);
  const server = await application('live', config => { config.ploeg = { ...fixture.config, userTeams: { op: ['delivery'], nologin: ['delivery'], watcher: ['delivery'] }, forgeLogins: { op: 'op-forge', watcher: 'watch-forge' } }; });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  for (const [id, role] of [['op', 'operator'], ['nologin', 'operator'], ['watcher', 'viewer']] as const) server.app.store.addUser({ id, name: id, role, passwordHash: await hashPassword(password) });
  const op = await login(server.url, 'op', password);
  const nologin = await login(server.url, 'nologin', password);
  const watcher = await login(server.url, 'watcher', password);
  const post = (path: string, session: { cookie: string } | undefined, body: unknown = {}, csrf = true) => request(server.url, `/api/ploeg/work-items/${path}`, { method: 'POST', body, csrf, ...session });
  const proposal = { card: '118', severity: 'S3', share: 'primary', discovery: 'discovered', note: '  The pattern rejects a space.  ' };

  const cracks = await request(server.url, '/api/ploeg/work-items/124/cracks', op);
  assert.equal(cracks.status, 200, cracks.text);
  assert.deepEqual(cracks.body.viewer, { login: 'op-forge', canAct: true, reason: '' });
  assert.deepEqual(cracks.body.cracks.map((entry: { id: string; state: string }) => [entry.id, entry.state]), [['7101', 'confirmed'], ['7102', 'proposed']]);
  assert.equal((await request(server.url, '/api/ploeg/work-items/124/cracks', watcher)).body.viewer.canAct, false, 'a viewer reads but cannot act');
  assert.match((await request(server.url, '/api/ploeg/work-items/124/cracks', nologin)).body.viewer.reason, /no forge login yet/);
  const candidates = await request(server.url, '/api/ploeg/work-items/124/crack-candidates', op);
  assert.equal(candidates.status, 200, candidates.text);
  assert.deepEqual(candidates.body.crackCandidates.candidates.map((entry: { card: { workItemId: string }; attribution: string | null }) => [entry.card.workItemId, entry.attribution]), [['118', 'confirmed'], ['121', 'proposed'], ['120', null]]);
  assert.equal((await request(server.url, '/api/ploeg/work-items/104/cracks', op)).status, 404, 'another Team’s Work Item is not found');
  assert.equal((await request(server.url, '/api/ploeg/work-items/124/cracks')).status, 401);

  assert.equal((await post('124/cracks', undefined, proposal)).status, 401);
  assert.equal((await post('124/cracks', op, proposal, false)).body.error.code, 'csrf');
  assert.equal((await post('124/cracks', watcher, proposal)).status, 403, 'viewers cannot attribute');
  const unmapped = await post('124/cracks', nologin, proposal);
  assert.deepEqual([unmapped.status, unmapped.body.error.code], [403, 'ploeg_forge_login'], 'an account without a forge login cannot act, because Ploeg compares it with the steward');
  assert.equal((await post('124/cracks', op, { ...proposal, severity: 'S9' })).status, 400);
  assert.equal((await post('124/cracks', op, { ...proposal, card: '124' })).status, 400, 'a bug cannot crack its own card');
  assert.equal((await post('124/cracks', op, { ...proposal, note: 'x'.repeat(2001) })).status, 400);
  assert.equal((await post('124/cracks', op, { ...proposal, card: '104' })).status, 404, 'a card in another Team is not found');
  assert.equal((await post('104/cracks', op, proposal)).status, 404, 'a bug in another Team is not found');
  assert.equal((await post('124/cracks/9999/confirm', op)).status, 404, 'a crack that is not on this Work Item is not found');
  assert.equal((await post('124/cracks/7101/dispute', op, { reason: '   ' })).status, 400, 'a dispute needs a reason');
  assert.equal((await post('124/cracks/7101/resolve', op, { resolution: 'maybe' })).status, 400);
  assert.equal((await request(server.url, '/api/ploeg/work-items/124/cracks/7102/withdraw', { method: 'POST', body: {}, ...op })).status, 405);
  assert.equal(fixture.posts.length, 0, 'refused steps never reach Ploeg');

  const proposed = await post('124/cracks', op, proposal);
  assert.equal(proposed.status, 201, proposed.text);
  assert.deepEqual([proposed.body.demo, proposed.body.crack.state, proposed.body.crack.card.workItemId], [false, 'proposed', '118']);
  const confirmed = await post('124/cracks/7102/confirm', op, { severity: 'S3', note: 'Agreed.' });
  assert.equal(confirmed.status, 200, confirmed.text);
  assert.deepEqual(confirmed.body.crack.confirmedBy, ['demo-dev', 'op-forge']);
  assert.equal((await post('124/evolved', op, { card: '121' })).status, 200);
  assert.deepEqual(fixture.posts, [
    { path: '/api/v1/operator/work-items/124/cracks', actor: 'op-forge', acting: 'op-forge', body: '{"card":"118","severity":"S3","share":"primary","discovery":"discovered","note":"The pattern rejects a space."}' },
    { path: '/api/v1/operator/cracks/7102/confirm', actor: 'op-forge', acting: 'op-forge', body: '{"severity":"S3","note":"Agreed."}' },
    { path: '/api/v1/operator/work-items/124/evolved', actor: 'op-forge', acting: 'op-forge', body: '{"card":"121"}' },
  ], 'Ploeg hears the forge login as the actor, never the Vloer account');

  fixture.state.refusal = { status: 403, code: 'forbidden_actor', message: 'The second person is neither the card’s steward nor the proposer.' };
  const forbidden = await post('124/cracks/7102/confirm', op);
  assert.deepEqual([forbidden.status, forbidden.body.error.code, forbidden.body.error.message], [403, 'crack_forbidden_actor', 'The second person is neither the card’s steward nor the proposer.'], 'Ploeg’s refusal reaches the person in its own words');
  fixture.state.refusal = { status: 409, code: 'dispute_closed', message: `bad\u0000${fixture.bearer}` };
  const closed = await post('124/cracks/7101/dispute', op, { reason: 'Not mine.' });
  assert.deepEqual([closed.status, closed.body.error.code, closed.body.error.message], [409, 'crack_dispute_closed', 'The five working days to dispute this crack have passed.'], 'an unsafe Ploeg message is replaced by Vloer’s own');
  fixture.state.refusal = { status: 403, code: 'execution_forbidden', message: 'This consumer cannot control executions.' };
  assert.equal((await post('124/evolved', op, { card: '121' })).body.error.code, 'ploeg_decision_forbidden');
  fixture.state.refusal = null;
  fixture.state.candidates = { ...ploegDemo.crackCandidates['124'], candidates: [{ ...ploegDemo.crackCandidates['124'].candidates[0], share: 3 }] };
  assert.equal((await request(server.url, '/api/ploeg/work-items/124/crack-candidates?refresh=1', op)).status, 502, 'a candidate list outside the contract fails closed');
  fixture.state.cracks = [{ ...ploegDemo.cracks[0], bug: { workItemId: '999', title: 'Elsewhere' }, card: { workItemId: '998', title: 'Elsewhere' } }];
  assert.equal((await request(server.url, '/api/ploeg/work-items/124/cracks?refresh=1', op)).status, 502, 'an attribution about other Work Items fails closed');
  assert.equal(JSON.stringify(fixture.posts).includes(fixture.bearer), false);
});

test('the demo traces bug DEMO-24 with candidates and a pending crack, applies Ploeg’s rules and records nothing', async t => {
  const demo = await application(); t.after(() => demo.close());
  const cracks = await request(demo.url, '/api/ploeg/work-items/124/cracks');
  assert.equal(cracks.status, 200, cracks.text);
  assert.deepEqual([cracks.body.demo, cracks.body.viewer.login, cracks.body.viewer.canAct], [true, 'demo-operator', true]);
  assert.equal((await request(demo.url, '/api/ploeg/work-items/124/crack-candidates')).body.crackCandidates.candidates.length, 3);
  assert.deepEqual((await request(demo.url, '/api/ploeg/work-items/114/crack-candidates')).body.crackCandidates.candidates, [], 'a Work Item without a traced fix has no candidates');
  const post = (path: string, body: unknown = {}) => request(demo.url, `/api/ploeg/work-items/${path}`, { method: 'POST', body });
  const confirmed = await post('124/cracks/7102/confirm');
  assert.equal(confirmed.status, 200, confirmed.text);
  assert.deepEqual([confirmed.body.demo, confirmed.body.crack.state, confirmed.body.crack.confirmedBy], [true, 'confirmed', ['demo-dev', 'demo-operator']]);
  assert.match(confirmed.body.message, /^Demo: Ploeg recorded nothing/);
  assert.equal((await request(demo.url, '/api/ploeg/work-items/124/cracks')).body.cracks[1].state, 'proposed', 'the demo keeps nothing');
  assert.equal((await post('124/cracks/7101/confirm')).body.error.code, 'crack_invalid_state', 'a confirmed crack cannot be confirmed again');
  const disputed = await post('124/cracks/7101/dispute', { reason: 'The space was never in the brief.' });
  assert.deepEqual([disputed.status, disputed.body.crack.state], [200, 'disputed'], 'the steward of the card disputes within five working days');
  assert.equal((await post('124/cracks/7101/resolve', { resolution: 'upheld' })).body.error.code, 'crack_invalid_state');
  const self = await post('124/cracks', { card: '120', severity: 'S4', share: 'contributing' });
  assert.deepEqual([self.status, self.body.crack.discovery, self.body.crack.state], [201, 'self', 'proposed'], 'the steward proposing a crack on their own card self-reports');
  assert.equal((await post('124/cracks', { card: '118', severity: 'S3', share: 'primary' })).body.error.code, 'crack_already_attributed');
  assert.equal((await post('124/cracks', { card: '105', severity: 'S3', share: 'primary' })).body.error.code, 'crack_not_merged', 'a card without a merged play cannot crack');
  assert.equal((await post('124/cracks', { card: '120', severity: 'S3', share: 'primary', discovery: 'concealed' })).body.crack.discovery, 'self', 'the steward naming their own card self-reports, whatever they chose');
  const evolved = await post('124/evolved', { card: '121' });
  assert.deepEqual([evolved.status, evolved.body.crack.state], [200, 'evolved']);
  assert.equal((await post('124/evolved', { card: '120' })).body.error.code, 'crack_forbidden_actor', 'the steward does not decide that their own card evolved');
  assert.equal(demo.app.store.listSessions().length, 0);
});

test('a forge login comes only from the administrator’s mapping, never from the caller', () => {
  assert.deepEqual(validatePloeg({ url: 'https://ploeg.example', tokenEnv: 'PLOEG_TOKEN', forgeLogins: { ryan: 'ryangr0' } }, 'live')?.forgeLogins, { ryan: 'ryangr0' });
  for (const forgeLogins of [{ ryan: 'has space' }, { 'bad id!': 'ryan' }, { ryan: 7 }, ['ryan']]) assert.throws(() => validatePloeg({ url: 'https://ploeg.example', tokenEnv: 'PLOEG_TOKEN', forgeLogins }, 'live'), /forgeLogins|ploeg/, JSON.stringify(forgeLogins));
  const client = new PloegClient({ ...configuration('/unused', 'live'), ploeg: { url: 'https://ploeg.example', tokenEnv: 'PLOEG_TOKEN', forgeLogins: { op: 'op-forge' } } });
  assert.equal(client.forgeLogin({ id: 'op', name: 'Op', role: 'operator' }), 'op-forge');
  assert.equal(client.forgeLogin({ id: 'other', name: 'op-forge', role: 'operator' }), null, 'a display name is never taken as a forge login');
  assert.equal(new PloegClient(configuration('/unused', 'demo')).forgeLogin({ id: 'demo-operator', name: 'Demo operator', role: 'admin' }), 'demo-operator', 'the demo knows the demo account by its id');
});
