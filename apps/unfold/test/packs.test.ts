import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { altArtChoices, cardMoments, copyOf, drawPull, extraOdds, isoWeek, oddsVersion, packFloor, patternOdds, periodAt, periodById, planPacks, publishedOdds } from '../src/packs.ts';
import { quarterAt, quarterById, recentQuarters, seasonAggregates } from '../src/season.ts';
import { card } from './collection-support.ts';
import { validateCards } from '../src/config.ts';

const day = 86_400_000;
const at = (iso: string) => Date.parse(iso);

test('ISO weeks start on Monday 00:00 UTC and number from the week with the first Thursday, across year ends', () => {
  assert.deepEqual(isoWeek(at('2026-10-01T18:00:00Z')), { year: 2026, week: 40, start: at('2026-09-28T00:00:00Z') });
  assert.equal(isoWeek(at('2026-09-27T23:59:59Z')).week, 39, 'Sunday night still belongs to the week before');
  assert.equal(isoWeek(at('2026-09-28T00:00:00Z')).week, 40);
  assert.deepEqual([isoWeek(at('2026-12-31T12:00:00Z')).year, isoWeek(at('2026-12-31T12:00:00Z')).week], [2026, 53], '2026 has 53 weeks');
  assert.deepEqual([isoWeek(at('2027-01-03T12:00:00Z')).year, isoWeek(at('2027-01-03T12:00:00Z')).week], [2026, 53], 'the first days of 2027 still belong to 2026-W53');
  assert.deepEqual([isoWeek(at('2027-01-04T00:00:00Z')).year, isoWeek(at('2027-01-04T00:00:00Z')).week], [2027, 1]);
  assert.deepEqual([isoWeek(at('2024-12-30T00:00:00Z')).year, isoWeek(at('2024-12-30T00:00:00Z')).week], [2025, 1], 'the last days of 2024 belong to 2025-W01');
  for (let ms = at('2020-01-01T00:00:00Z'); ms < at('2030-01-01T00:00:00Z'); ms += 3 * day + 3_600_000) {
    const period = periodAt(ms, 'delivery', { teams: {} });
    assert(Date.parse(period.start) <= ms && ms < Date.parse(period.end), `${new Date(ms).toISOString()} lies in ${period.id}`);
    assert.equal(Date.parse(period.end) - Date.parse(period.start), 7 * day);
    assert.deepEqual(periodById(period.id, { teams: {} }), period, 'a week id round-trips');
  }
});

test('a Team with a sprint uses its length and anchor instead of the ISO week, and other Teams keep the week', () => {
  const rules = { teams: { delivery: { lengthDays: 14, anchor: '2026-09-14' } } };
  const sprint = periodAt(at('2026-10-01T09:00:00Z'), 'delivery', rules);
  assert.deepEqual(sprint, { id: 'delivery~2026-09-28', kind: 'sprint', start: '2026-09-28T00:00:00Z', end: '2026-10-12T00:00:00Z', team: 'delivery', lengthDays: 14 });
  assert.equal(periodAt(at('2026-09-27T23:00:00Z'), 'delivery', rules).id, 'delivery~2026-09-14');
  assert.equal(periodAt(at('2026-09-01T00:00:00Z'), 'delivery', rules).id, 'delivery~2026-08-31', 'sprints run backwards from the anchor too');
  assert.equal(periodAt(at('2026-10-01T09:00:00Z'), 'research', rules).id, '2026-W40');
  assert.deepEqual(periodById('delivery~2026-09-28', rules), sprint);
  assert.equal(periodById('delivery~2026-09-29', rules), null, 'a date that starts no sprint names no pack');
  assert.equal(periodById('research~2026-09-28', rules), null, 'a Team without a sprint has no sprint packs');
  assert.equal(periodById('2026-W54', rules), null);
  assert.equal(packFloor(at('2026-10-01T09:00:00Z'), 'research', rules, 1), at('2026-09-21T00:00:00Z'), 'one week of backfill reaches the week before the first visit');
  assert.equal(packFloor(at('2026-10-01T09:00:00Z'), 'delivery', rules, 2), at('2026-08-31T00:00:00Z'), 'two sprints of backfill');
});

test('pack settings are validated: backfill 0–12, sprints of 7–42 days on a real date', () => {
  assert.deepEqual(validateCards(undefined, 'live'), { backfillPeriods: 1, teams: {} });
  assert.deepEqual(validateCards(undefined, 'demo'), { backfillPeriods: 4, teams: {} });
  assert.deepEqual(validateCards({ backfillPeriods: 0, teams: { delivery: { lengthDays: 14, anchor: '2026-09-14' } } }, 'live'), { backfillPeriods: 0, teams: { delivery: { lengthDays: 14, anchor: '2026-09-14' } } });
  for (const bad of [{ backfillPeriods: 13 }, { backfillPeriods: 1.5 }, { teams: { delivery: { lengthDays: 5, anchor: '2026-09-14' } } }, { teams: { delivery: { lengthDays: 14, anchor: '2026-02-30' } } }, { teams: { delivery: { lengthDays: 14 } } }, { teams: { 'a~b': { lengthDays: 14, anchor: '2026-09-14' } } }, { secret: 'x' }, []]) assert.throws(() => validateCards(bad, 'live'), JSON.stringify(bad));
});

test('a card\'s moments come from its facts only: minted, merged plays, release, each finish step, confirmed cracks and mends', () => {
  const cracked = card('7', { condition: { state: 'mended', cracks: [{ id: 'c1', severity: 'S2', confirmedAt: '2026-09-20T10:00:00Z', bug: { ref: 'VIK-9', title: 'x' }, mended: { at: '2026-09-25T10:00:00Z', by: 'ryan', pr: 68, bySteward: true } }, { id: 'c2', severity: 'S4', proposedAt: '2026-09-21T10:00:00Z' }] } });
  const moments = cardMoments(cracked, at('2026-10-15T00:00:00Z'));
  assert.deepEqual(moments.map(moment => [moment.kind, moment.at]), [
    ['minted', '2026-09-01T08:00:00Z'], ['merged', '2026-09-02T10:00:00Z'], ['released', '2026-09-03T12:00:00Z'],
    ['finish', '2026-09-10T12:00:00Z'], ['cracked', '2026-09-20T10:00:00Z'], ['mended', '2026-09-25T10:00:00Z'], ['finish', '2026-10-03T12:00:00Z'],
  ], 'an unconfirmed crack is no moment, and finish steps still ahead are not counted');
  assert.deepEqual(moments.find(moment => moment.kind === 'finish')!.detail, { from: 'matte', to: 'foil' });
  assert.deepEqual(moments.find(moment => moment.kind === 'mended')!.detail, { ref: 'VIK-9', pr: 68 });
  assert.deepEqual(cardMoments(card('8', { release: null, plays: [], events: [], totals: { costStatus: 'not_reported' } }), Date.now()), [], 'a card with no facts yet has no moments');
});

test('a pack for a period holds every card with a moment in it, and history before the floor never becomes a pack', () => {
  const cards = [card('1'), card('2', { plays: [{ number: 9, state: 'merged', mergedAt: '2026-09-23T10:00:00Z', mergedBy: 'ryan' }], events: [{ at: '2026-09-22T08:00:00Z', kind: 'minted', actor: 'x' }], release: { at: '2026-09-24T09:00:00Z', source: 'merge', environment: 'production' } })];
  const now = at('2026-10-01T12:00:00Z');
  const plans = planPacks(cards, { teams: {} }, () => at('2026-08-31T00:00:00Z'), now);
  assert.deepEqual(plans.map(plan => [plan.period.id, plan.entries.map(entry => [entry.workItemId, entry.moments.map(moment => moment.kind)])]), [
    ['2026-W36', [['1', ['minted', 'merged', 'released']]]],
    ['2026-W37', [['1', ['finish']]]],
    ['2026-W39', [['2', ['minted', 'merged', 'released']]]],
    ['2026-W40', [['2', ['finish']]]],
  ], 'card 1 reaches holo only on 3 October, after now');
  const floored = planPacks(cards, { teams: {} }, () => at('2026-09-21T00:00:00Z'), now);
  assert.deepEqual(floored.map(plan => plan.period.id), ['2026-W39', '2026-W40'], 'weeks before the floor are left out');
});

test('a copy is the person\'s roles on the roster, named by the first of developer, reviewer, qa, po, acceptor and merger; only a mapped login stewards it', () => {
  assert.deepEqual(copyOf(card('1'), ['RYAN'], ['ryan']), { role: 'developer', roles: ['developer', 'merger'], steward: true }, 'logins match case-insensitively');
  assert.deepEqual(copyOf(card('1'), ['ryan']), { role: 'developer', roles: ['developer', 'merger'], steward: false }, 'a self-declared login collects the copy but never makes anyone its steward');
  assert.deepEqual(copyOf(card('1'), ['iris']), { role: 'reviewer', roles: ['reviewer'], steward: false });
  assert.equal(copyOf(card('1'), ['sam']), null);
  assert.deepEqual(copyOf(card('1', { roster: [] }), ['ryan'], ['ryan']), { role: 'steward', roles: [], steward: true }, 'the mapped steward always holds a copy');
  assert.equal(copyOf(card('1', { roster: [] }), ['ryan']), null, 'a self-declared login that only matches the steward\'s name collects nothing');
});

test('the published odds cover the forge\'s sixteen patterns, sum to exactly 100 % and favour plain and common patterns', () => {
  assert.equal(patternOdds.reduce((sum, entry) => sum + entry.basisPoints, 0), 10_000);
  assert.equal(patternOdds.length, 16);
  const odds = Object.fromEntries(patternOdds.map(entry => [entry.key, entry.basisPoints]));
  assert(odds.none > odds.holo && odds.holo > odds.gold, 'plain is the most likely and gold rare');
  for (const rare of ['gold', 'superfractor', 'blacklabel', 'lenticular']) assert(odds[rare] <= 150, `${rare} is rare`);
  assert.deepEqual(extraOdds.map(entry => [entry.key, entry.basisPoints]), [['altArt', 1000], ['fullArt', 800], ['goldSignature', 500]]);
  assert.deepEqual(publishedOdds(), { version: oddsVersion, scale: 10_000, patterns: patternOdds.map(entry => ({ ...entry })), extras: extraOdds.map(entry => ({ ...entry })), altArtChoices });
});

test('a pull is HMAC-SHA256 of userId|workItemId|packId under the server key: the same inputs always give the same pull, and nothing else changes it', () => {
  const key = Buffer.alloc(32, 7);
  const first = drawPull(key, 'user-a', '119', '2026-W36');
  assert.deepEqual(drawPull(key, 'user-a', '119', '2026-W36'), first, 'deterministic');
  assert.equal(first.message, 'user-a|119|2026-W36');
  assert.equal(first.digest, createHmac('sha256', key).update('user-a|119|2026-W36').digest('hex'), 'auditable with the key');
  const digest = Buffer.from(first.digest, 'hex');
  let pick = Math.floor((digest.readUInt32BE(0) / 2 ** 32) * 10_000);
  const expected = patternOdds.find(entry => { if (pick < entry.basisPoints) return true; pick -= entry.basisPoints; return false; })!.key;
  assert.equal(first.pattern, expected, 'bytes 0–3 pick the pattern from the cumulative odds');
  assert.notEqual(drawPull(Buffer.alloc(32, 8), 'user-a', '119', '2026-W36').digest, first.digest, 'another key draws another pull');
  assert.notEqual(drawPull(key, 'user-b', '119', '2026-W36').digest, first.digest, 'another person draws their own pull');
  assert.notEqual(drawPull(key, 'user-a', '119', '2026-W37').digest, first.digest);
});

test('over many draws the pattern and extras follow the published odds, independently of each other', () => {
  const key = Buffer.alloc(32, 3);
  const total = 60_000;
  const patterns = new Map<string, number>();
  let alt = 0; let full = 0; let gold = 0; let altAndFull = 0;
  const alternates = new Set<number>();
  for (let index = 0; index < total; index++) {
    const pull = drawPull(key, 'u', String(index), 'p');
    patterns.set(pull.pattern, (patterns.get(pull.pattern) ?? 0) + 1);
    if (pull.altArt !== null) { alt++; alternates.add(pull.altArt); }
    if (pull.fullArt) full++;
    if (pull.goldSignature) gold++;
    if (pull.altArt !== null && pull.fullArt) altAndFull++;
  }
  for (const entry of patternOdds) {
    const expected = entry.basisPoints / 10_000;
    const tolerance = 4 * Math.sqrt(expected * (1 - expected) / total);
    assert(Math.abs((patterns.get(entry.key) ?? 0) / total - expected) < tolerance, `${entry.key}: ${(patterns.get(entry.key) ?? 0) / total} vs ${expected}`);
  }
  for (const [observed, expected] of [[alt, 0.1], [full, 0.08], [gold, 0.05], [altAndFull, 0.008]] as const) assert(Math.abs(observed / total - expected) < 4 * Math.sqrt(expected * (1 - expected) / total), `${observed / total} vs ${expected}`);
  assert.equal(alternates.size, altArtChoices, 'every alternate art can be drawn');
});

test('quarters are calendar quarters in UTC, and the season counts Team totals only', () => {
  assert.deepEqual(quarterAt(at('2026-10-01T09:00:00Z')), { id: '2026-Q4', start: '2026-10-01T00:00:00Z', end: '2027-01-01T00:00:00Z' });
  assert.deepEqual(quarterById('2026-Q3'), { id: '2026-Q3', start: '2026-07-01T00:00:00Z', end: '2026-10-01T00:00:00Z' });
  assert.equal(quarterById('2026-Q5'), null);
  assert.deepEqual(recentQuarters(at('2026-02-10T00:00:00Z')).map(quarter => quarter.id), ['2026-Q1', '2025-Q4', '2025-Q3', '2025-Q2']);
  const cards = [
    card('1', { gates: { current: 'done', bounces: [{ from: 'test', to: 'development', at: '2026-09-04T00:00:00Z', reason: 'defect' }] }, condition: { state: 'mended', cracks: [{ id: 'c', severity: 'S3', confirmedAt: '2026-09-10T00:00:00Z', mended: { at: '2026-09-12T00:00:00Z', by: 'iris', pr: 3, bySteward: false } }] } }),
    card('2', { gates: { current: 'done', bounces: [{ from: 'acceptance', to: 'development', at: '2026-08-04T00:00:00Z', reason: 'requirement' }] }, set: { role: 'epic', epic: { workItemId: '2', title: 'Checkout epic' }, size: 1, children: [{ workItemId: '9', title: 'Child', state: 'merged', settled: true, cracked: false }], complete: true } }),
    card('3', { team: 'research' }),
  ];
  const season = seasonAggregates(cards, 'delivery', quarterById('2026-Q3')!, at('2026-10-01T09:00:00Z'));
  assert.equal(season.cards, 2, 'only the Team\'s own cards');
  assert.equal(season.shipped, 2);
  assert.equal(season.daysLiveAdded, Math.floor(2 * (at('2026-10-01T00:00:00Z') - at('2026-09-03T12:00:00Z')) / day));
  assert.deepEqual([season.cracks, season.mends], [1, 1]);
  assert.deepEqual(season.rightFirstTime, { share: 0.5, cards: 2 }, 'a defect bounce misses right first time, a requirement bounce does not');
  assert.deepEqual(season.bounceReasons, { defect: 1, requirement: 1, misunderstood: 0, environment: 0, unknown: 0 });
  assert.deepEqual(season.sets, { complete: 1, total: 1 });
  assert.deepEqual(season.finishes, { foil: 2 }, 'holo on 3 October falls in the next quarter');
  assert(!JSON.stringify(season).includes('ryan') && !JSON.stringify(season).includes('iris'), 'no person is named');
  const bare = seasonAggregates([card('9')], 'delivery', quarterById('2026-Q3')!, at('2026-10-01T09:00:00Z'));
  assert.deepEqual([bare.rightFirstTime, bare.bounceReasons, bare.sets], [null, null, null], 'figures whose facts no card carries are null, never zero');
});
