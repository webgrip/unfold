import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { PloegClient, parseCard } from '../src/ploeg.ts';
import { hashPassword } from '../src/auth.ts';
import { assembleCard } from '../src/cards/assemble.ts';
import { CardStore } from '../src/cards/card-store.ts';
import { parseWorkItemFacts, type WorkItemFacts } from '../src/cards/facts.ts';
import { micros } from '../src/cards/go.ts';
import { CardService, importStatusLine, type CardLog } from '../src/cards/service.ts';
import { validateCardRules } from '../src/cards/settings.ts';
import type { AppConfig } from '../src/types.ts';
import { application, configuration, login, request } from './api-support.ts';

type Json = Record<string, any>;
type Seen = { method: string; path: string; query: URLSearchParams; actor?: string; body?: string };
type ExportPage = { items: Json[]; nextAfter: string | null };

const operator = '/api/v1/operator/';

function fixture(name: string): { world: Json[]; card: Json; workItemId: string; options: { now: string } } {
  return JSON.parse(readFileSync(new URL(`./fixtures/cards/assembly/${name}.json`, import.meta.url), 'utf8'));
}

const cardWorld = fixture('TestCrackAttributionFlowNeedsTwoPeopleAndARefereeForDisputes-8dcf872a90');
const crackWorld = fixture('TestCrackProposalRefusals-1d82f343c4');

function detail(facts: Json): Json {
  const w = facts.workItem;
  return {
    schemaVersion: '1.0',
    item: { id: w.id, provider: w.provider, externalId: w.externalId, revision: 'r1', team: w.team, state: w.state, title: w.title, description: '', url: '', priority: 0, attempts: 0, infraFailures: 0, nextEligibleAt: null, createdAt: w.createdAt, updatedAt: w.updatedAt, target: null, latestShift: null, lease: null },
    shifts: [], runs: [], checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false },
  };
}

async function ploegStub(t: TestContext, world: Json[]) {
  const env = `UNFOLD_PLOEG_CARDS_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const seen: Seen[] = [];
  const state = {
    facts: true,
    world: new Map(world.map(f => [String(f.workItem.id), f])),
    cards: {} as Record<string, Json>,
    exportPages: null as null | Record<string, ExportPage>,
    exportFailures: new Set<string>(),
    commentId: 555,
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const url = new URL(req.url!, 'http://fixture.invalid');
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: req.method!, path: url.pathname, query: url.searchParams, ...(req.headers['x-ploeg-actor'] ? { actor: String(req.headers['x-ploeg-actor']) } : {}), ...(body ? { body } : {}) });
      const send = (status: number, data: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
      const missing = () => res.writeHead(404).end();
      if (!url.pathname.startsWith(operator)) return missing();
      const path = url.pathname.slice(operator.length);
      if (req.method === 'GET' && path === 'facts') {
        if (!state.facts) return missing();
        const team = url.searchParams.get('team');
        return send(200, { schemaVersion: '1.0', facts: [...state.world.values()].filter(f => !team || f.workItem.team === team).slice(0, 25), nextBefore: null });
      }
      if (req.method === 'GET' && path === 'card-legacy-export') {
        if (!state.exportPages) return missing();
        const after = url.searchParams.get('after') ?? '';
        if (state.exportFailures.delete(after)) return send(500, { error: { code: 'internal', message: 'boom' } });
        const page = state.exportPages[after];
        return page ? send(200, { schemaVersion: '1.0', deprecated: true, ...page }) : send(400, { error: { code: 'invalid_request', message: 'unknown cursor' } });
      }
      const comment = /^work-items\/(\d+)\/pull-request-comments\/([a-z0-9-]+)$/.exec(path);
      if (req.method === 'PUT' && comment) {
        const sent = JSON.parse(body) as { number?: number };
        const facts = state.world.get(comment[1]);
        const pr = facts?.pullRequests.find((p: Json) => p.number === sent.number) ?? facts?.pullRequests.at(-1);
        if (!pr) return missing();
        return send(200, { schemaVersion: '1.0', comment: { key: comment[2], workItemId: comment[1], pullRequest: { id: pr.id, forge: pr.forge, owner: pr.owner, repo: pr.repo, number: pr.number }, commentId: state.commentId, imageUrl: 'https://forge.example/attachments/card.svg', created: false, updatedAt: '2026-10-10T12:30:00Z' } });
      }
      if (req.method !== 'GET') return send(404, { error: { code: 'not_found', message: 'nope' } });
      const facts = /^work-items\/(\d+)\/facts$/.exec(path);
      if (facts) {
        const entry = state.world.get(facts[1]);
        return state.facts && entry ? send(200, { schemaVersion: '1.0', facts: entry }) : missing();
      }
      const card = /^work-items\/(\d+)\/card$/.exec(path);
      if (card) return state.cards[card[1]] ? send(200, { schemaVersion: '1.0', card: state.cards[card[1]] }) : missing();
      const item = /^work-items\/(\d+)$/.exec(path);
      if (item && state.world.has(item[1])) return send(200, detail(state.world.get(item[1])!));
      return missing();
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, seen, state };
}

type Stub = Awaited<ReturnType<typeof ploegStub>>;

const silent: CardLog = () => undefined;

function service(stub: Stub, options: { settings?: unknown; publish?: boolean; now?: string; log?: CardLog } = {}) {
  const config: AppConfig = { ...configuration('/unused', 'live'), ploeg: stub.config };
  const client = new PloegClient(config);
  const store = new CardStore(new DatabaseSync(':memory:'));
  const now = options.now ? micros(options.now) : undefined;
  const cards = new CardService(client, store, { settings: validateCardRules(options.settings), publish: options.publish ?? false, log: options.log ?? silent, ...(now !== undefined ? { now: () => now } : {}) });
  return { client, store, cards };
}

async function users(server: Awaited<ReturnType<typeof application>>, list: [string, 'admin' | 'operator' | 'viewer'][]) {
  const password = randomBytes(24).toString('hex');
  for (const [id, role] of list) server.app.store.addUser({ id, name: id, role, passwordHash: await hashPassword(password) });
  const sessions: Record<string, { cookie: string }> = {};
  for (const [id] of list) sessions[id] = { cookie: (await login(server.url, id, password)).cookie };
  return sessions;
}

function readNow(value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Math.abs(Date.parse(value) - Date.now()) < 120_000) return 'now';
  if (Array.isArray(value)) return value.map(readNow);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, readNow(entry)]));
  return value;
}

const done = { state: 'done' as const, after: null, cracks: 0, rarities: 0, comments: 0, shapes: 0, attempts: 1, message: '', startedAt: '2026-10-10T12:00:00Z', finishedAt: '2026-10-10T12:00:01Z' };

test('with facts, the card route assembles the card from Ploeg’s facts, never asks Ploeg for a card and keeps the browser contract', async t => {
  const stub = await ploegStub(t, cardWorld.world);
  const server = await application('live', config => { config.ploeg = { ...stub.config, userTeams: { member: ['silver'], outsider: ['gold'] } }; });
  t.after(() => server.close());
  const sessions = await users(server, [['member', 'viewer'], ['outsider', 'viewer']]);

  const answer = await request(server.url, '/api/ploeg/work-items/177/card', sessions.member);
  assert.equal(answer.status, 200, answer.text);
  assert.deepEqual(Object.keys(answer.body).sort(), ['card', 'demo', 'fetchedAt']);
  assert.equal(answer.body.demo, false);
  assert.equal(stub.seen.some(s => s.path.endsWith('/card')), false, 'Ploeg’s card endpoint is never asked');
  assert.ok(stub.seen.some(s => s.path === `${operator}facts` && s.query.get('limit') === '1'), 'Unfold probes the facts list');
  assert.ok(stub.seen.some(s => s.path === `${operator}work-items/177/facts`), 'the card is read from the Work Item’s facts');

  const oldProxy = parseCard(cardWorld.card);
  const keys = Object.keys(answer.body.card);
  assert.deepEqual(Object.keys(oldProxy).filter(key => !keys.includes(key)), [], 'the card has every key the old proxy produced from Ploeg’s card');
  assert.deepEqual(keys.filter(key => !(key in oldProxy)), ['flow'], 'and adds only the flow figures, which this Ploeg card had turned off');
  assert.deepEqual([answer.body.card.workItemId, answer.body.card.team, answer.body.card.steward], [oldProxy.workItemId, oldProxy.team, oldProxy.steward]);
  assert.deepEqual(answer.body.card.plays.map((p: Json) => [p.number, p.state, Date.parse(p.mergedAt)]), oldProxy.plays.map(p => [p.number, p.state, Date.parse(p.mergedAt!)]), 'the same plays merged at the same instant');

  const reference = service(stub);
  const facts: WorkItemFacts = parseWorkItemFacts(cardWorld.world.find(f => f.workItem.id === '177'));
  const expected = parseCard(JSON.parse(JSON.stringify(assembleCard(facts, reference.cards.context(new Map([[facts.workItem.id, facts]]))))));
  assert.deepEqual(readNow(answer.body.card), readNow(JSON.parse(JSON.stringify(expected))), 'the route serves exactly the card assembled from the same facts, through the same browser parser');

  const outside = await request(server.url, '/api/ploeg/work-items/177/card', sessions.outsider);
  assert.deepEqual([outside.status, outside.body.error?.code], [404, 'ploeg_not_found'], 'a viewer outside the Team does not find the card');
  assert.equal((await request(server.url, '/api/ploeg/work-items/999/card', sessions.member)).status, 404, 'a Work Item Ploeg has no facts for is not found');
});

test('without facts, the card route reads Ploeg’s own card endpoint and logs once that it does', async t => {
  const stub = await ploegStub(t, cardWorld.world);
  stub.state.facts = false;
  stub.state.cards['177'] = cardWorld.card;
  const logged = t.mock.method(console, 'error', () => undefined);
  const server = await application('live', config => { config.ploeg = { ...stub.config, userTeams: { member: ['silver'] } }; });
  t.after(() => server.close());
  const sessions = await users(server, [['member', 'viewer']]);

  const answer = await request(server.url, '/api/ploeg/work-items/177/card', sessions.member);
  assert.equal(answer.status, 200, answer.text);
  assert.deepEqual(answer.body.card, JSON.parse(JSON.stringify(parseCard(cardWorld.card))), 'the old proxy passes Ploeg’s card through the browser parser');
  assert.ok(stub.seen.some(s => s.path === `${operator}work-items/177/card`));
  assert.equal(stub.seen.some(s => s.path.endsWith('/177/facts')), false, 'no facts are read from a Ploeg without them');
  await request(server.url, '/api/ploeg/work-items/177/card?refresh=1', sessions.member);
  const warnings = logged.mock.calls.map(call => String(call.arguments[0])).filter(line => line.includes('"cards.facts_unavailable"'));
  assert.equal(warnings.length, 1, 'the fallback is logged once, not on every request');
  assert.equal(JSON.parse(warnings[0]!).level, 'warn');
});

test('crack steps with facts are stored in Unfold, follow the two-person rule and wait for the import', async t => {
  const stub = await ploegStub(t, crackWorld.world);
  const server = await application('live', config => {
    config.ploeg = {
      ...stub.config,
      userTeams: { fixer: ['silver'], stewart: ['silver'], second: ['silver'], referee: ['silver'], watcher: ['silver'], nologin: ['silver'], goldie: ['gold'] },
      forgeLogins: { fixer: 'fixer', stewart: 'stewart', second: 'second', referee: 'referee', watcher: 'watcher', goldie: 'goldie' },
    };
  });
  t.after(() => server.close());
  const s = await users(server, [['fixer', 'operator'], ['stewart', 'operator'], ['second', 'operator'], ['referee', 'operator'], ['watcher', 'viewer'], ['nologin', 'operator'], ['goldie', 'operator']]);
  const store = new CardStore(server.app.store.db);
  const post = (path: string, session: { cookie: string }, body: unknown = {}) => request(server.url, `/api/ploeg/work-items/${path}`, { method: 'POST', body, ...session });
  const proposal = { card: '181', severity: 'S3', share: 'primary', note: 'The pattern rejects a space.' };

  const early = await post('184/cracks', s.fixer, proposal);
  assert.deepEqual([early.status, early.body.error?.code], [503, 'cards_importing'], 'no crack is recorded before Ploeg’s cracks are imported');
  assert.equal((await post('184/cracks', s.watcher, proposal)).status, 403, 'a viewer cannot propose');
  const unmapped = await post('184/cracks', s.nologin, proposal);
  assert.deepEqual([unmapped.status, unmapped.body.error?.code], [403, 'ploeg_forge_login']);
  assert.equal((await post('184/cracks', s.goldie, proposal)).status, 404, 'another Team does not find the bug');

  store.saveImportState(done);
  const proposed = await post('184/cracks', s.fixer, proposal);
  assert.equal(proposed.status, 201, proposed.text);
  const crack = proposed.body.crack;
  assert.deepEqual([crack.state, crack.card.workItemId, crack.bug.workItemId, crack.proposedBy, crack.steward, crack.play, crack.discovery, proposed.body.demo], ['proposed', '181', '184', 'fixer', 'stewart', 10, 'discovered', false]);
  assert.ok(Number(crack.id) >= 1_000_000_000, 'Unfold numbers its own cracks above Ploeg’s');
  assert.equal(store.crack(crack.id)?.state, 'proposed', 'the crack is in Unfold’s store');

  const listed = await request(server.url, '/api/ploeg/work-items/184/cracks', s.fixer);
  assert.equal(listed.status, 200, listed.text);
  assert.deepEqual(listed.body.cracks.map((c: Json) => [c.id, c.state]), [[crack.id, 'proposed']]);
  assert.equal((await request(server.url, '/api/ploeg/work-items/184/cracks', s.goldie)).status, 404, 'another Team does not see the bug’s cracks');
  const candidates = await request(server.url, '/api/ploeg/work-items/184/crack-candidates', s.fixer);
  assert.equal(candidates.status, 200, candidates.text);
  assert.equal(candidates.body.crackCandidates.bug.workItemId, '184');

  store.saveImportState({ ...done, state: 'running' });
  const waiting = await post(`184/cracks/${crack.id}/confirm`, s.second);
  assert.deepEqual([waiting.status, waiting.body.error?.code], [503, 'cards_importing'], 'a step waits while an import runs again');
  store.saveImportState(done);

  for (const who of ['fixer', 'stewart'] as const) {
    const refused = await post(`184/cracks/${crack.id}/confirm`, s[who]);
    assert.deepEqual([refused.status, refused.body.error?.code], [403, 'crack_forbidden_actor'], `${who} cannot be the second person`);
  }
  assert.equal((await post(`184/cracks/${crack.id}/confirm`, s.goldie)).status, 404, 'another Team does not find the crack');
  assert.equal((await post(`184/cracks/${crack.id}/confirm`, s.watcher)).status, 403);

  const confirmed = await post(`184/cracks/${crack.id}/confirm`, s.second, { note: 'Agreed.' });
  assert.equal(confirmed.status, 200, confirmed.text);
  assert.deepEqual([confirmed.body.crack.state, confirmed.body.crack.confirmedBy], ['confirmed', ['fixer', 'second']]);
  assert.ok(confirmed.body.crack.disputeUntil);

  assert.deepEqual((await post(`184/cracks/${crack.id}/dispute`, s.second, { reason: 'Not mine.' })).body.error?.code, 'crack_forbidden_actor', 'only the steward disputes');
  const disputed = await post(`184/cracks/${crack.id}/dispute`, s.stewart, { reason: 'The space was never in the brief.' });
  assert.equal(disputed.status, 200, disputed.text);
  assert.deepEqual([disputed.body.crack.state, disputed.body.crack.disputedBy], ['disputed', 'stewart']);

  for (const who of ['fixer', 'stewart', 'second'] as const) assert.equal((await post(`184/cracks/${crack.id}/resolve`, s[who], { resolution: 'unlinked' })).body.error?.code, 'crack_forbidden_actor', `${who} took part and cannot referee`);
  const resolved = await post(`184/cracks/${crack.id}/resolve`, s.referee, { resolution: 'upheld', note: 'The steward merged it.' });
  assert.equal(resolved.status, 200, resolved.text);
  assert.deepEqual([resolved.body.crack.state, resolved.body.crack.resolution, resolved.body.crack.resolvedBy], ['confirmed', 'upheld', 'referee']);

  assert.deepEqual(store.auditTrail('181').map(entry => [entry.action, entry.actor]), [
    ['card.crack_proposed', 'unfold:fixer'], ['card.crack_confirmed', 'unfold:second'], ['card.crack_disputed', 'unfold:stewart'], ['card.crack_resolved', 'unfold:referee'],
  ]);
  assert.deepEqual(stub.seen.filter(entry => entry.method !== 'GET').map(entry => `${entry.method} ${entry.path}`), [], 'Ploeg hears no crack step');
  assert.equal(stub.seen.some(entry => /\/(cracks|crack-candidates)$/.test(entry.path)), false, 'Ploeg’s crack reads are not used either');
});

const recordedShape = { capturedAt: '2026-09-20T12:27:48Z', complexity: { added: 3, hotspots: [{ added: 3, path: 'pkg/a.go' }], maxDepth: 2, method: 'indentation/2026.1', net: 3, removed: 0 }, countedLines: 150, docsTouched: 1, files: 3, languages: [{ lines: 140, name: 'Go' }, { lines: 10, name: 'Markdown' }], testLines: 40, testRatio: 0.364, truncated: false };

function exportCrack(id: string, card: string, bug: string, extra: Json = {}): Json {
  return {
    id, team: 'silver', state: 'confirmed', cardWorkItemId: card, bugWorkItemId: bug, bug: { provider: 'vikunja', externalId: `bug-${bug}` }, pullRequest: { id: '94', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 10 },
    severity: 'S3', share: 'primary', discovery: 'discovered', steward: 'stewart', note: null, proposedBy: 'fixer', proposedAt: '2026-10-01T10:00:00.123456+02:00', confirmedBy: 'second', confirmedAt: '2026-10-02T10:00:00Z',
    disputeUntil: '2026-10-09T10:00:00Z', disputedBy: null, disputedAt: null, disputeReason: null, resolvedBy: null, resolvedAt: null, resolution: null, evolvedBy: null, evolvedAt: null,
    mendPullRequest: null, mendNumber: null, mendedAt: null, mendedBy: null, mendBySteward: null, mendConfirmedAt: null, mendReopenedAt: null, ...extra,
  };
}

const exportPages: Record<string, ExportPage> = {
  '': {
    items: [{
      workItemId: '177', team: 'silver', provider: 'vikunja', externalId: 'card', cracks: [exportCrack('4', '177', '178')],
      rarity: { formula: '2026.1', revealedTier: 'rare', predictedTier: 'common', score: 61.24, predictedScore: 40, percentile: null, cohortTarget: 'webgrip/ploeg', cohortQuarter: '2026Q3', cohortSize: 1, inputs: { size: 3 }, revealedAt: '2026-09-20T14:27:48+02:00', recordedAt: '2026-09-20T12:30:00Z', checkedAt: '2026-09-20T12:30:00Z' },
      comment: { pullRequest: { id: '94', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 10 }, moment: '', commentId: 555, image: true, publishedAt: '2026-09-20T12:31:00Z', checkedAt: '2026-09-20T12:31:00Z' },
      shapes: [{ pullRequest: { id: '94', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 10 }, shape: recordedShape }],
      future: 'ignored',
    }],
    nextAfter: '177',
  },
  177: {
    items: [{ workItemId: '200', team: 'silver', provider: 'vikunja', externalId: 'near', cracks: [exportCrack('9', '200', '205', { state: 'proposed', confirmedBy: null, confirmedAt: null, disputeUntil: null })], rarity: null, comment: null, shapes: [{ pullRequest: { id: '109', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 10 }, shape: { ...recordedShape, files: 1 } }] }],
    nextAfter: null,
  },
};

const tableCount = (store: CardStore, table: string) => Number((store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);

test('the one-time import reads every export page, counts what it stored and is a no-op once done', async t => {
  const stub = await ploegStub(t, cardWorld.world);
  stub.state.exportPages = structuredClone(exportPages);
  const { cards, store } = service(stub);

  assert.equal(importStatusLine(cards.status().import), "Ploeg's card state has not been imported yet.");
  const result = await cards.importLegacy();
  assert.equal(result.state, 'done', result.message);
  assert.deepEqual({ cracks: result.cracks, rarities: result.rarities, comments: result.comments, shapes: result.shapes, after: result.after, attempts: result.attempts }, { cracks: 2, rarities: 1, comments: 1, shapes: 2, after: '177', attempts: 1 });
  assert.deepEqual(cards.status().import, result);
  assert.equal(importStatusLine(cards.status().import), 'Imported 2 cracks, 1 frozen rarities, 1 card comments and 2 play shapes from Ploeg.');
  assert.match(result.message, /^Read the facts of 2 Work Items/);
  assert.deepEqual(stub.seen.filter(s => s.path.endsWith('card-legacy-export')).map(s => [s.query.get('after'), s.query.get('limit')]), [[null, '200'], ['177', '200']]);

  const imported = store.crack('4')!;
  assert.deepEqual([imported.state, imported.cardWorkItemId, imported.bugWorkItemId, imported.proposedAt, imported.confirmedBy], ['confirmed', '177', '178', '2026-10-01T08:00:00.123456Z', 'second'], 'times are kept in UTC at microsecond precision');
  assert.equal(store.storedRarity('177')?.revealedTier, 'rare');
  assert.equal(store.storedRarity('177')?.score, 61.2, 'a frozen score keeps one decimal');
  assert.deepEqual(store.comment('177'), { workItemId: '177', pullRequest: { id: '94', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 10 }, moment: '', commentId: 555, image: true, publishedAt: '2026-09-20T12:31:00Z', checkedAt: '2026-09-20T12:31:00Z', origin: 'ploeg', adopted: false });
  assert.deepEqual(store.playShape('94'), recordedShape);

  const before = stub.seen.length;
  const again = await cards.importLegacy();
  assert.deepEqual(again, result, 'a finished import is not repeated');
  assert.equal(stub.seen.length, before, 'and asks Ploeg nothing');
  assert.deepEqual(['card_cracks', 'card_rarity', 'card_comments', 'card_play_shapes'].map(table => tableCount(store, table)), [2, 1, 1, 2], 'no row is duplicated');

  const concurrent = service(stub);
  const [one, two] = await Promise.all([concurrent.cards.importLegacy(), concurrent.cards.importLegacy()]);
  assert.equal(one, two, 'two callers share one running import');
  assert.equal(tableCount(concurrent.store, 'card_cracks'), 2);
});

test('an import that fails on page 2 keeps the cursor after page 1 and resumes there without duplicating page 1', async t => {
  const stub = await ploegStub(t, cardWorld.world);
  stub.state.exportPages = structuredClone(exportPages);
  stub.state.exportFailures.add('177');
  const logs: [string, string, Json][] = [];
  const { cards, store } = service(stub, { log: (level, event, detail) => logs.push([level, event, detail]) });

  const failed = await cards.importLegacy();
  assert.equal(failed.state, 'failed');
  assert.deepEqual({ after: failed.after, cracks: failed.cracks, rarities: failed.rarities, comments: failed.comments, shapes: failed.shapes, attempts: failed.attempts }, { after: '177', cracks: 1, rarities: 1, comments: 1, shapes: 1, attempts: 1 });
  assert.equal(importStatusLine(failed), `The import of Ploeg's card state failed after 1 attempt and will be retried: ${failed.message}`);
  assert.ok(failed.message.length > 0);
  assert.ok(logs.some(([level, event, detail]) => level === 'warn' && event === 'cards.import_failed' && detail.after === '177'));

  const crackRefused = await cards.propose('178', '177', { play: 0, severity: 'S3', share: 'primary', discovery: '', note: '' }, { person: 'fixer', audit: 'unfold:fixer' }).then(() => null, (error: Error & { code?: string }) => error.code);
  assert.equal(crackRefused, 'importing', 'a failed import still holds crack steps back');

  const resumed = await cards.importLegacy();
  assert.equal(resumed.state, 'done', resumed.message);
  assert.deepEqual({ cracks: resumed.cracks, rarities: resumed.rarities, comments: resumed.comments, shapes: resumed.shapes, attempts: resumed.attempts }, { cracks: 2, rarities: 1, comments: 1, shapes: 2, attempts: 2 });
  assert.deepEqual(stub.seen.filter(s => s.path.endsWith('card-legacy-export')).map(s => s.query.get('after')), [null, '177', '177'], 'the retry starts at page 2');
  assert.deepEqual(['card_cracks', 'card_rarity', 'card_comments', 'card_play_shapes'].map(table => tableCount(store, table)), [2, 1, 1, 2]);
});

test('a Ploeg without the export leaves the import unsupported, lets crack steps through and is asked again later', async t => {
  const stub = await ploegStub(t, cardWorld.world);
  const { cards } = service(stub);
  const result = await cards.importLegacy();
  assert.equal(result.state, 'unsupported');
  assert.equal(importStatusLine(result), 'Nothing imported from Ploeg: the connected Ploeg offers no card export. Unfold tries again when Ploeg is upgraded.');
  const again = await cards.importLegacy();
  assert.deepEqual([again.state, again.attempts], ['unsupported', 2], 'an unsupported import is tried again');
  const crack = await cards.propose('178', '177', { play: 0, severity: 'S3', share: 'primary', discovery: '', note: '' }, { person: 'fixer', audit: 'unfold:fixer' });
  assert.equal(crack.state, 'proposed', 'there is nothing to wait for');
});

test('the Status page’s Ploeg check carries the Run cards line', async t => {
  const stub = await ploegStub(t, cardWorld.world);
  const server = await application('live', config => { config.ploeg = { ...stub.config }; });
  t.after(() => server.close());
  const admin = await login(server.url);
  const counted = { ...done, cracks: 3, rarities: 2, comments: 1, shapes: 4 };
  new CardStore(server.app.store.db).saveImportState(counted);
  const status = await request(server.url, '/api/status', admin);
  assert.equal(status.status, 200, status.text);
  const ploeg = status.body.checks.find((check: Json) => check.id === 'ploeg');
  assert.equal(ploeg.detail, `Run cards: ${importStatusLine(counted)}`);
  assert.equal(ploeg.detail, 'Run cards: Imported 3 cracks, 2 frozen rarities, 1 card comments and 4 play shapes from Ploeg.');
});

test('the card comment is published through Ploeg’s keyed comment only when turned on, takes over Ploeg’s comment once and is not repeated', async t => {
  const stub = await ploegStub(t, cardWorld.world);
  stub.state.exportPages = { '': { items: [exportPages['']!.items[0]!], nextAfter: null } };
  const now = '2026-10-10T12:27:48Z';
  const puts = () => stub.seen.filter(s => s.method === 'PUT');

  const off = service(stub, { publish: false, now, settings: { teams: { silver: { pullRequestComment: true } } } });
  await off.cards.importLegacy();
  assert.equal(await off.cards.publishComment('177'), null);
  assert.equal(off.cards.status().publish, false);
  assert.deepEqual(puts(), [], 'with cards.publishPullRequestComment off nothing is written');

  const notTeam = service(stub, { publish: true, now, settings: { teams: { silver: { referees: ['referee'] } } } });
  await notTeam.cards.importLegacy();
  assert.equal(await notTeam.cards.publishComment('177'), null);
  assert.deepEqual(puts(), [], 'a Team that did not turn the comment on gets none');

  const on = service(stub, { publish: true, now, settings: { teams: { silver: { pullRequestComment: true } } } });
  assert.equal((await on.cards.importLegacy()).comments, 1);
  const moment = await on.cards.publishComment('177');
  assert.ok(moment?.startsWith('merged:10'), `the moment names the merged play: ${moment}`);
  assert.equal(puts().length, 1);
  const put = puts()[0]!;
  assert.equal(put.path, `${operator}work-items/177/pull-request-comments/run-card`);
  assert.equal(put.actor, 'unfold-cards');
  const body = JSON.parse(put.body!) as { markdown: string; image: { svg: string; alt: string }; number: number; adoptCommentId?: number };
  assert.deepEqual(Object.keys(body).sort(), ['adoptCommentId', 'image', 'markdown', 'number']);
  assert.deepEqual(Object.keys(body.image).sort(), ['alt', 'svg']);
  assert.equal(body.number, 10);
  assert.equal(body.adoptCommentId, 555, 'the first publish takes over the comment Ploeg posted on that pull request');
  assert.match(body.markdown, /^### Run card · /);
  assert.equal(body.markdown.includes('<!-- ploeg:'), false, 'Ploeg adds its own marker; Unfold sends none');
  assert.match(body.image.svg, /^<svg[\s>]/);
  assert.match(body.image.alt, /^Run card: /);
  assert.deepEqual(on.store.comment('177'), { workItemId: '177', pullRequest: { id: '94', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 10 }, moment, commentId: 555, image: true, publishedAt: '2026-10-10T12:27:48Z', checkedAt: '2026-10-10T12:27:48Z', origin: 'unfold', adopted: true });

  assert.equal(await on.cards.publishComment('177'), null, 'the same moment is not published again');
  assert.equal(puts().length, 1, 'and nothing more is written');
});

test('an exported play shape a card cannot show is skipped at import, and a shown shape without complexity reads none', async () => {
  const { storedShape } = await import('../src/cards/service.ts');
  const { shownShape } = await import('../src/cards/playkpi.ts');
  const good = { complexity: null, files: 2, countedLines: 10, testLines: 0, testRatio: 0, docsTouched: 0, languages: [], truncated: false, capturedAt: '2026-10-01T00:00:00Z' };
  assert.equal(storedShape(good), true);
  assert.equal(storedShape({ ...good, complexity: { method: 'indentation/2026.1', added: 1, removed: 0, net: 1, maxDepth: 1, hotspots: [] } }), true);
  for (const bad of [null, [], 'shape', { ...good, files: '2' }, { ...good, languages: null }, { ...good, complexity: { added: 1 } }, { files: 1 }]) assert.equal(storedShape(bad), false, JSON.stringify(bad));
  const { complexity: _omitted, ...withoutComplexity } = good;
  assert.equal(shownShape(withoutComplexity as never).complexity, null);
});
