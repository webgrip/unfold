import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Collection, CollectionError, type CardSource } from '../src/collection.ts';
import { Store } from '../src/store.ts';
import { drawPull } from '../src/packs.ts';
import type { PloegCard } from '../src/ploeg.ts';
import type { User } from '../src/types.ts';
import { configuration } from './api-support.ts';
import { card } from './collection-support.ts';

const ryan: User = { id: 'u-ryan', name: 'ryan@example.test', role: 'operator' };
const iris: User = { id: 'u-iris', name: 'iris@example.test', role: 'operator' };
const admin: User = { id: 'u-admin', name: 'admin', role: 'admin' };
const at = (iso: string) => Date.parse(iso);

function source(cards: PloegCard[], teams = ['delivery'], mapping: Record<string, string> = {}): CardSource & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    forgeLogin(user) { return mapping[user.id] ?? null; },
    async memberCards(_user, logins) { calls.push(logins); const wanted = new Set(logins); return { cards: cards.filter(entry => entry.roster.some(person => wanted.has(person.name)) || (entry.steward && wanted.has(entry.steward.name))), source: { kind: 'list', scanned: cards.length, truncated: false } }; },
    async teamCards(_user, team) { return { cards: cards.filter(entry => entry.team === team), source: { kind: 'list', scanned: cards.length, truncated: false } }; },
    async teams() { return teams.map(id => ({ id })); },
  };
}

function setup(cards: PloegCard[], now: string, configure: (config: ReturnType<typeof configuration>) => void = () => {}, mapping: Record<string, string> = {}) {
  const store = new Store(':memory:');
  const config = configuration('/unused', 'live');
  configure(config);
  let clock = at(now);
  const collection = new Collection(config, store, source(cards, ['delivery'], mapping), false, () => clock);
  return { store, collection, tick(iso: string) { clock = at(iso); } };
}

const deck = () => [
  card('101'),
  card('102', { plays: [{ number: 9, state: 'merged', mergedAt: '2026-09-23T10:00:00Z', mergedBy: 'iris' }], steward: { name: 'iris', source: 'merged_by' }, roster: [{ name: 'iris', roles: ['developer'] }, { name: 'ryan', roles: ['reviewer'] }], events: [{ at: '2026-09-22T08:00:00Z', kind: 'minted', actor: 'x' }], release: { at: '2026-09-24T09:00:00Z', source: 'merge', environment: 'production' } }),
  card('103', { roster: [{ name: 'sam', roles: ['developer'] }], steward: { name: 'sam', source: 'merged_by' } }),
];

test('logins are the person\'s own: validated, folded, and never read for anyone else', () => {
  const { collection, store } = setup(deck(), '2026-10-01T12:00:00Z');
  assert.deepEqual(collection.identity(ryan), { logins: [], mapped: null, declared: [], verified: [], source: 'none', updatedAt: null });
  assert.deepEqual(collection.setIdentity(ryan, [' Ryan ', 'ryan', 'gitlab:ryan']).logins, ['ryan', 'gitlab:ryan']);
  assert.deepEqual(collection.identity(iris).logins, [], 'one person\'s logins are not another\'s');
  assert.deepEqual(collection.identity(admin).logins, [], 'an administrator has only their own');
  for (const bad of ['ryan', ['has space'], Array.from({ length: 11 }, (_, index) => `login${index}`), [42], ['']]) assert.throws(() => collection.setIdentity(ryan, bad), CollectionError, JSON.stringify(bad));
  assert.deepEqual(store.cardIdentity(ryan.id)?.logins, ['ryan', 'gitlab:ryan']);
});

test('an administrator\'s mapped login comes first and is the only one that stewards; self-declared logins only collect', async () => {
  const { collection } = setup(deck(), '2026-10-01T12:00:00Z', () => {}, { [iris.id]: 'iris' });
  assert.deepEqual(collection.identity(iris), { logins: ['iris'], mapped: 'iris', declared: [], verified: ['iris'], source: 'mapped', updatedAt: null });
  collection.setIdentity(iris, ['ryan']);
  assert.deepEqual(collection.identity(iris).logins, ['iris', 'ryan'], 'the mapping stays first when the person adds logins');
  const binder = await collection.binder(iris);
  assert.deepEqual(binder.copies.map(entry => [entry.card.workItemId, entry.copy.role, entry.copy.steward]), [['102', 'developer', true], ['101', 'developer', false]], 'iris stewards 102 by her mapped login; claiming ryan collects 101 but makes her no steward of it');
  collection.setIdentity(ryan, ['ryan']);
  assert((await collection.binder(ryan)).copies.every(entry => !entry.copy.steward), 'without a mapping nobody is a steward through their own logins');
});

test('the binder lists only the person\'s copies, with the role from the roster, newest moment first, and personal readouts only', async () => {
  const { collection } = setup(deck(), '2026-10-01T12:00:00Z');
  collection.setIdentity(ryan, ['ryan']);
  const binder = await collection.binder(ryan);
  assert.deepEqual(binder.copies.map(entry => [entry.card.workItemId, entry.copy.role, entry.copy.steward]), [['102', 'reviewer', false], ['101', 'developer', false]], 'sam\'s card is not in ryan\'s binder');
  assert.deepEqual(binder.readouts, { cards: 2, released: 2, daysLive: 28 + 7, daysLiveThisQuarter: 0, quarter: '2026-Q4', mends: 0, pulled: 0 });
  assert.deepEqual(binder.filters, { teams: ['delivery'], roles: ['reviewer', 'developer'] });
  assert(!('ranking' in binder) && !JSON.stringify(binder.readouts).includes('iris'), 'no comparison with anyone');
  assert.deepEqual(binder.away, [], 'the first visit replays nothing');
  const empty = await collection.binder(iris);
  assert.equal(empty.copies.length, 0, 'without logins there are no copies, even for a card that rosters the same person');
});

test('moments since the last visit replay once: marking seen moves forward only', async () => {
  const { collection, tick, store } = setup(deck(), '2026-09-20T12:00:00Z');
  collection.setIdentity(ryan, ['ryan']);
  collection.markSeen(ryan, '2026-09-20T12:00:00Z');
  tick('2026-10-01T12:00:00Z');
  const binder = await collection.binder(ryan);
  assert.deepEqual(binder.away.map(moment => [moment.workItemId, moment.kind]), [['102', 'minted'], ['102', 'merged'], ['102', 'released'], ['102', 'finish']], 'oldest first');
  collection.markSeen(ryan, binder.seenUntil);
  assert.deepEqual((await collection.binder(ryan)).away, [], 'nothing replays twice');
  collection.markSeen(ryan, '2026-09-01T00:00:00Z');
  assert.equal(store.binderMark(ryan.id)?.seenAt, '2026-10-01T12:00:00Z', 'an older marker never moves the seen moment back');
  collection.markSeen(ryan, '2030-01-01T00:00:00Z');
  assert.equal(store.binderMark(ryan.id)?.seenAt, '2026-10-01T12:00:00Z', 'nor past now');
});

test('packs open in order, once per period, and only once their period has ended; a first pull is drawn, stored and never changes', async () => {
  const { collection, store, tick } = setup(deck(), '2026-09-02T12:00:00Z', config => { config.cards = { backfillPeriods: 1, teams: {} }; });
  collection.setIdentity(ryan, ['ryan']);
  collection.markSeen(ryan, undefined);
  tick('2026-10-01T12:00:00Z');
  const list = await collection.packs(ryan);
  assert.deepEqual(list.packs.map(pack => [pack.id, pack.state, pack.count, pack.firsts, pack.upgrades, pack.next]), [
    ['2026-W36', 'sealed', 1, 1, 0, true], ['2026-W37', 'sealed', 1, 0, 1, false], ['2026-W39', 'sealed', 1, 1, 0, false], ['2026-W40', 'filling', 1, 0, 1, false],
  ]);
  await assert.rejects(collection.openPack(ryan, '2026-W39'), (error: CollectionError) => error.status === 409 && error.code === 'pack_order');
  await assert.rejects(collection.openPack(ryan, '2026-W40'), (error: CollectionError) => error.code === 'pack_filling');
  await assert.rejects(collection.openPack(ryan, '2026-W30'), (error: CollectionError) => error.status === 404);
  await assert.rejects(collection.openPack(ryan, 'nonsense'), (error: CollectionError) => error.status === 404);
  const opened = await collection.openPack(ryan, '2026-W36');
  assert.deepEqual(opened.pack.entries.map(entry => [entry.workItemId, entry.kind, entry.moments.map(moment => moment.kind)]), [['101', 'new', ['minted', 'merged', 'released']]]);
  const key = Buffer.from(store.getSecret<string>('cards:pull-key')!, 'base64');
  const expected = drawPull(key, ryan.id, '101', '2026-W36');
  assert.deepEqual(opened.pack.entries[0].pull, { workItemId: '101', packId: '2026-W36', pattern: expected.pattern, altArt: expected.altArt, fullArt: expected.fullArt, goldSignature: expected.goldSignature, oddsVersion: '2026.1', digest: expected.digest, pulledAt: '2026-10-01T12:00:00Z' }, 'the stored pull is the HMAC draw, with its digest for audit');
  await assert.rejects(collection.openPack(ryan, '2026-W36'), (error: CollectionError) => error.code === 'pack_opened', 'no second opening, so no re-roll');
  const upgrade = await collection.openPack(ryan, '2026-W37');
  assert.deepEqual(upgrade.pack.entries.map(entry => [entry.workItemId, entry.kind, entry.pull?.packId]), [['101', 'upgrade', '2026-W36']], 'a later pack shows the upgrade and keeps the first pull');
  assert.equal(store.pulls(ryan.id).size, 1);
  assert.deepEqual((await collection.pack(ryan, '2026-W36')).pack.entries[0].pull?.digest, expected.digest, 'an opened pack reads back the same pull');
  const binder = await collection.binder(ryan);
  assert.deepEqual(binder.copies.map(entry => [entry.card.workItemId, entry.copy.pull?.pattern ?? null, entry.copy.waitingIn]), [['102', null, '2026-W39'], ['101', expected.pattern, null]]);
});

test('nobody reads another person\'s binder or packs: each person draws and sees only their own pulls, an administrator included', async () => {
  const { collection, store, tick } = setup(deck(), '2026-09-02T12:00:00Z');
  collection.setIdentity(ryan, ['ryan']);
  collection.setIdentity(iris, ['iris']);
  collection.markSeen(ryan, undefined);
  collection.markSeen(iris, undefined);
  tick('2026-10-01T12:00:00Z');
  await collection.openPack(ryan, '2026-W36');
  await assert.rejects(collection.pack(iris, '2026-W36'), (error: CollectionError) => error.status === 404, 'iris has not opened ryan\'s pack, and cannot read it');
  await assert.rejects(collection.pack(admin, '2026-W36'), (error: CollectionError) => error.status === 404, 'nor can an administrator');
  assert.equal(store.pulls(iris.id).size, 0);
  const irisPacks = await collection.packs(iris);
  assert(irisPacks.packs.every(pack => pack.state !== 'opened'), 'ryan\'s opening opens nothing for iris');
  const irisOpened = await collection.openPack(iris, irisPacks.packs.find(pack => pack.next)!.id);
  assert(irisOpened.pack.entries.every(entry => entry.pull?.digest !== store.pulls(ryan.id).get(entry.workItemId)?.digest), 'iris draws her own pull for a card ryan also holds');
  assert.equal((await collection.binder(admin)).copies.length, 0, 'an administrator\'s binder holds only their own copies');
});

test('the season page aggregates a Team the person belongs to, names nobody, and refuses other Teams', async () => {
  const { collection } = setup(deck(), '2026-10-20T12:00:00Z');
  const season = await collection.season(ryan, 'delivery', '2026-Q3');
  assert.equal(season.aggregates?.shipped, 3);
  assert(!/ryan|iris|sam/.test(JSON.stringify(season)), 'no person appears on a team page');
  await assert.rejects(collection.season(ryan, 'finance', undefined), (error: CollectionError) => error.status === 404);
  await assert.rejects(collection.season(ryan, 'delivery', '2027-Q2'), (error: CollectionError) => error.status === 400, 'a quarter that has not started');
  const { collection: early } = setup(deck(), '2026-10-02T12:00:00Z');
  const fresh = await early.season(ryan, undefined, undefined);
  assert.deepEqual([fresh.quarter.id, fresh.justStarted], ['2026-Q3', '2026-Q4'], 'in a quarter\'s first week the page shows the one before');
});

test('the store creates the collection tables on an existing database without touching its data', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'vloer-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'vloer.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL, password_hash TEXT NOT NULL);
    INSERT INTO users VALUES ('u1', 'kept', 'admin', 'x');`);
  legacy.close();
  const store = new Store(path);
  const tables = (store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name);
  for (const table of ['card_identities', 'card_binders', 'card_packs', 'card_pulls']) assert(tables.includes(table), table);
  assert.equal(store.getUser('u1')?.name, 'kept', 'existing rows survive');
  store.setCardIdentity('u1', ['kept'], '2026-10-01T00:00:00Z');
  const pull = { workItemId: '1', packId: '2026-W40', pattern: 'gold', altArt: null, fullArt: false, goldSignature: true, oddsVersion: '2026.1', message: 'u1|1|2026-W40', digest: 'ab', pulledAt: '2026-10-01T00:00:00Z' };
  assert.equal(store.recordPack('u1', { packId: '2026-W40', openedAt: '2026-10-01T00:00:00Z', period: {}, entries: [], demo: false }, [pull]), true);
  assert.equal(store.recordPack('u1', { packId: '2026-W40', openedAt: '2026-10-02T00:00:00Z', period: {}, entries: [], demo: false }, [{ ...pull, pattern: 'none' }]), false, 'a pack records once');
  store.close();
  const reopened = new Store(path);
  assert.deepEqual(reopened.cardIdentity('u1')?.logins, ['kept'], 'opening again keeps the collection');
  assert.equal(reopened.pulls('u1').get('1')?.pattern, 'gold', 'the first pull is kept');
  reopened.close();
});
