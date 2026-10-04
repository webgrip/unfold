import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collection, CollectionError, type CardSource } from '../src/collection.ts';
import { Store } from '../src/store.ts';
import { cardWorldLimit, shownWorld, validateWorld, type WorldFacts } from '../src/card-worlds.ts';
import type { PloegCard } from '../src/ploeg.ts';
import type { User } from '../src/types.ts';
import { application, configuration, login, request } from './api-support.ts';
import { card } from './collection-support.ts';

const ryan: User = { id: 'u-ryan', name: 'ryan@example.test', role: 'operator' };
const iris: User = { id: 'u-iris', name: 'iris@example.test', role: 'viewer' };
const sam: User = { id: 'u-sam', name: 'sam@example.test', role: 'admin' };
const fresh: WorldFacts = { days: null, merged: false, condition: null };
const merged28: WorldFacts = { days: 28, merged: true, condition: null };
const decoration = (extra: Record<string, unknown> = {}) => ({ v: 1, kind: 'islands', tod: 'auto', weather: 'clear', objects: [{ t: 'tree', x: -0.9, z: -0.6, s: 0.25 }], ...extra });

function setup(cards: PloegCard[], now: string, withCard = true) {
  const store = new Store(':memory:');
  let clock = Date.parse(now);
  const source: CardSource = {
    async memberCards(_user, logins) { const wanted = new Set(logins); return { cards: cards.filter(entry => entry.roster.some(person => wanted.has(person.name))), source: { kind: 'list', scanned: cards.length, truncated: false } }; },
    async teamCards(_user, team) { return { cards: cards.filter(entry => entry.team === team), source: { kind: 'list', scanned: cards.length, truncated: false } }; },
    async teams() { return [{ id: 'delivery' }]; },
    ...(withCard ? { async card(_user: User, id: string) { const found = cards.find(entry => entry.workItemId === id); if (!found) throw new CollectionError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.'); return { card: found, demo: false, fetchedAt: '' }; } } : {}),
  };
  const collection = new Collection(configuration('/unused', 'live'), store, source, false, () => clock);
  return { store, collection, tick(iso: string) { clock = Date.parse(iso); } };
}

test('a decoration is checked strictly and against what the card has earned now, never on the browser’s word', () => {
  assert.deepEqual(validateWorld(decoration({ objects: [{ t: 'tree', x: -0.9049, z: 1.23456, s: 0.123456 }] }), fresh), { v: 1, kind: 'islands', tod: 'auto', weather: 'clear', objects: [{ t: 'tree', x: -0.9, z: 1.23, s: 0.123 }] }, 'positions and seeds are rounded');
  const refused: [unknown, WorldFacts, RegExp][] = [
    ['islands', fresh, /must be an object/],
    [decoration({ script: 'x' }), fresh, /no field script/],
    [decoration({ v: 2 }), fresh, /v must be 1/],
    [decoration({ kind: 'moon' }), fresh, /kind must be one of islands, deepsea, city, off/],
    [decoration({ tod: 'midnight' }), fresh, /tod must be auto or one of/],
    [decoration({ tod: 'morning' }), fresh, /morning is not earned yet: it unlocks at 7 days live/],
    [decoration({ tod: 'noon' }), merged28, /noon is not earned yet: it unlocks at 30 days live/],
    [decoration({ tod: 'night' }), { ...merged28, days: 364 }, /unlocks at 365 days live/],
    [decoration({ weather: 'lava' }), fresh, /weather must be one of clear, rain, snow, fireflies/],
    [decoration({ objects: 'tree' }), fresh, /at most 24 things/],
    [decoration({ objects: Array.from({ length: 25 }, () => ({ t: 'tree', x: 0, z: 0, s: 0 })) }), fresh, /at most 24 things/],
    [decoration({ objects: [{ t: 'tree', x: 0, z: 0 }] }), fresh, /objects\[0\].s must be a seed/],
    [decoration({ objects: [{ t: 'tree', x: 0, z: 0, s: 0, extra: 1 }] }), fresh, /must be \{ t, x, z, s \}/],
    [decoration({ objects: [{ t: 'dragon', x: 0, z: 0, s: 0 }] }), fresh, /t must be one of crystal, lantern, tree, windmill, lighthouse, koi/],
    [decoration({ objects: [{ t: 'windmill', x: 0, z: 0, s: 0 }] }), fresh, /windmill unlocks when the card merges/],
    [decoration({ objects: [{ t: 'lighthouse', x: 0, z: 0, s: 0 }] }), { ...merged28, days: 179 }, /lighthouse unlocks at 180 days live/],
    [decoration({ objects: [{ t: 'koi', x: 0, z: 0, s: 0 }] }), { ...merged28, condition: 'cracked' }, /koi unlocks when a crack is mended/],
    [decoration({ objects: [{ t: 'tree', x: 4.01, z: 0, s: 0 }] }), fresh, /inside the world/],
    [decoration({ objects: [{ t: 'tree', x: 0, z: -3.5, s: 0 }] }), fresh, /inside the world/],
    [decoration({ objects: [{ t: 'tree', x: Number.NaN, z: 0, s: 0 }] }), fresh, /inside the world/],
    [decoration({ objects: [{ t: 'tree', x: 0, z: 0, s: 1.5 }] }), fresh, /seed from 0 to 1/],
  ];
  for (const [input, facts, reason] of refused) assert.throws(() => validateWorld(input, facts), reason, JSON.stringify(input));
  assert.equal(validateWorld(decoration({ tod: 'golden', objects: [{ t: 'lighthouse', x: 1.5, z: 0.3, s: 0.4 }, { t: 'windmill', x: 0, z: 0, s: 0.1 }] }), { days: 180, merged: true, condition: null }).objects.length, 2, '180 days live earns the lighthouse and golden hour');
  assert.equal(validateWorld(decoration({ tod: 'night', objects: [{ t: 'koi', x: 0, z: 1, s: 0.4 }] }), { days: 365, merged: true, condition: 'mended' }).tod, 'night', 'a year live earns the night sky, a mend the koi pond');
  assert.deepEqual(shownWorld(decoration({ tod: 'noon', objects: [{ t: 'koi', x: 0, z: 1, s: 0.4 }, { t: 'tree', x: 0, z: 0, s: 0.2 }] }), { days: 10, merged: true, condition: 'cracked' }), { v: 1, kind: 'islands', tod: 'auto', weather: 'clear', objects: [{ t: 'tree', x: 0, z: 0, s: 0.2 }] }, 'a mend that reopened takes the koi pond away and an unearned time of day falls back to auto when read');
  assert.equal(shownWorld({ kind: 'moon' }, fresh), null);
});

test('only someone who holds a copy decorates it, the card must be in their Teams, and a decoration is private to its owner', async () => {
  const deck = [card('101'), card('103', { roster: [{ name: 'sam', roles: ['developer'] }], steward: { name: 'sam', source: 'merged_by' } })];
  const { collection, store } = setup(deck, '2026-10-01T12:00:00Z');
  collection.setIdentity(ryan, ['ryan']);
  collection.setIdentity(iris, ['iris']);
  const before = await collection.cardWorld(ryan, '101');
  assert.deepEqual([before.holds, before.role, before.world, before.facts], [true, 'developer', null, { days: 28, merged: true, condition: null }]);
  const saved = await collection.saveCardWorld(ryan, '101', decoration({ tod: 'morning', objects: [{ t: 'windmill', x: 0.5, z: 0.2, s: 0.7 }] }));
  assert.equal(saved.world?.tod, 'morning');
  assert.deepEqual(saved.world?.objects, [{ t: 'windmill', x: 0.5, z: 0.2, s: 0.7 }]);
  const other = await collection.cardWorld(iris, '101');
  assert.deepEqual([other.holds, other.role, other.world], [true, 'reviewer', null], 'iris holds her own copy of 101 and never sees ryan’s decoration');
  const outsider = await collection.cardWorld(sam, '101');
  assert.deepEqual([outsider.holds, outsider.world], [false, null], 'an administrator without a copy sees no decoration');
  assert.match(String(outsider.reason), /holds a copy/);
  await assert.rejects(collection.saveCardWorld(sam, '101', decoration()), (error: CollectionError) => error.status === 403 && error.code === 'card_copy');
  await assert.rejects(collection.resetCardWorld(sam, '101'), (error: CollectionError) => error.status === 403);
  await assert.rejects(collection.saveCardWorld(ryan, '103', decoration()), (error: CollectionError) => error.status === 403, 'ryan holds no copy of sam’s card');
  await assert.rejects(collection.cardWorld(ryan, '999'), (error: CollectionError) => error.status === 404);
  await assert.rejects(collection.cardWorld(ryan, 'abc'), (error: CollectionError) => error.status === 400);
  await assert.rejects(collection.saveCardWorld(ryan, '101', decoration({ objects: [{ t: 'lighthouse', x: 0, z: 0, s: 0 }] })), (error: CollectionError) => error.status === 400 && /180 days live/.test(error.message), 'the server re-checks unlocks');
  assert.deepEqual(store.cardWorld(ryan.id, '101')?.world, saved.world, 'a refused save leaves the last decoration');
  assert.equal(store.cardWorld(iris.id, '101'), undefined);
  const reset = await collection.resetCardWorld(ryan, '101');
  assert.equal(reset.world, null);
  assert.equal(store.cardWorld(ryan.id, '101'), undefined);
});

test('unlocks follow the card as it ages and changes: the lighthouse at 180 days, night at 365, the koi pond once mended', async () => {
  const mended = { state: 'mended', cracks: [{ id: 'c1', bug: { workItemId: '200', ref: 'BUG-1', title: 'x' }, severity: 'S3', share: 'primary', discovery: 'discovered', proposedAt: '2026-09-10T10:00:00Z', confirmedAt: '2026-09-11T10:00:00Z', confirmedBy: ['a', 'b'], disputed: false, weight: 1, warranty: 'full', mended: { at: '2026-09-20T10:00:00Z', by: 'ryan', pr: 9, bySteward: true, confirmedAt: null } }] };
  const deck = [card('101'), card('102', { condition: mended })];
  const { collection, tick } = setup(deck, '2026-10-01T12:00:00Z', false);
  collection.setIdentity(ryan, ['ryan']);
  await assert.rejects(collection.saveCardWorld(ryan, '101', decoration({ tod: 'golden' })), /unlocks at 180 days live/);
  tick('2027-03-03T13:00:00Z');
  assert.equal((await collection.saveCardWorld(ryan, '101', decoration({ tod: 'golden', objects: [{ t: 'lighthouse', x: 1.5, z: 0.3, s: 0.4 }] }))).world?.objects[0].t, 'lighthouse');
  await assert.rejects(collection.saveCardWorld(ryan, '101', decoration({ tod: 'night' })), /365 days live/);
  tick('2027-09-04T13:00:00Z');
  assert.equal((await collection.saveCardWorld(ryan, '101', decoration({ tod: 'night' }))).world?.tod, 'night');
  await assert.rejects(collection.saveCardWorld(ryan, '101', decoration({ objects: [{ t: 'koi', x: 0, z: 1, s: 0.4 }] })), /mended/);
  assert.equal((await collection.saveCardWorld(ryan, '102', decoration({ objects: [{ t: 'koi', x: 0, z: 1, s: 0.4 }] }))).world?.objects[0].t, 'koi', 'a mended card unlocks the koi pond');
});

test('decorations are cosmetic: they change no pull, no binder readout and nothing a pack reads, and a person keeps a bounded number', async () => {
  const { collection, store } = setup([card('101')], '2026-10-01T12:00:00Z');
  collection.setIdentity(ryan, ['ryan']);
  const binder = await collection.binder(ryan);
  const packs = await collection.packs(ryan);
  await collection.saveCardWorld(ryan, '101', decoration());
  assert.deepEqual(await collection.binder(ryan), binder, 'the binder reads the same');
  assert.deepEqual(await collection.packs(ryan), packs, 'packs read the same');
  assert.equal(store.pulls(ryan.id).size, 0);
  for (let index = 0; index <= cardWorldLimit; index++) store.setCardWorld('someone', String(1000 + index), decoration(), new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(), cardWorldLimit);
  assert.equal(store.cardWorld('someone', '1000'), undefined, 'the least recently changed decoration is dropped');
  assert.ok(store.cardWorld('someone', String(1000 + cardWorldLimit)));
});

test('the decoration routes need a sign-in, the request header for writes and a copy of a card in the person’s Teams', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  const first = await request(api.url, '/api/cards/117/world');
  assert.equal(first.status, 200, first.text);
  assert.deepEqual([first.body.workItemId, first.body.demo, first.body.holds, first.body.world], ['117', true, true, null]);
  assert.equal(first.body.facts.merged, true);
  assert.equal((await request(api.url, '/api/cards/117/world', { method: 'PUT', body: { world: decoration() }, csrf: false })).status, 403, 'a write without the request header is refused');
  const put = await request(api.url, '/api/cards/117/world', { method: 'PUT', body: { world: decoration({ weather: 'snow', objects: [{ t: 'windmill', x: 0.4, z: 0.1, s: 0.3 }] }) } });
  assert.equal(put.status, 200, put.text);
  assert.deepEqual(put.body.world, { v: 1, kind: 'islands', tod: 'auto', weather: 'snow', objects: [{ t: 'windmill', x: 0.4, z: 0.1, s: 0.3 }] });
  assert.deepEqual((await request(api.url, '/api/cards/117/world')).body.world, put.body.world, 'the decoration reloads');
  const refused = await request(api.url, '/api/cards/117/world', { method: 'PUT', body: { world: decoration({ objects: [{ t: 'koi', x: 0, z: 0, s: 0 }] }) } });
  assert.deepEqual([refused.status, refused.body.error.code], [400, 'card_world']);
  assert.match(refused.body.error.message, /mended/);
  assert.equal((await request(api.url, '/api/cards/101/world')).body.holds, false, 'a demo card nobody rosters the demo login on has no copy');
  assert.equal((await request(api.url, '/api/cards/101/world', { method: 'PUT', body: { world: decoration() } })).status, 403);
  assert.equal((await request(api.url, '/api/cards/101/world', { method: 'DELETE' })).status, 403);
  assert.equal((await request(api.url, '/api/cards/999/world')).status, 404);
  assert.equal((await request(api.url, '/api/cards/abc/world')).status, 400);
  assert.equal((await request(api.url, '/api/cards/117/world', { method: 'POST' })).status, 405);
  const reset = await request(api.url, '/api/cards/117/world', { method: 'DELETE' });
  assert.deepEqual([reset.status, reset.body.world], [200, null]);
  const live = await application('live');
  t.after(() => live.close());
  assert.equal((await request(live.url, '/api/cards/117/world')).status, 401, 'signed out, nothing');
  const { cookie } = await login(live.url);
  assert.notEqual((await request(live.url, '/api/cards/117/world', { cookie })).status, 200, 'without Ploeg there is no card to decorate');
});
