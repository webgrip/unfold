import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardRarity, parseCard } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { fixedRarityTier, percentileRarityTier, rarityComponents, rarityPercentile, rarityQuarter, rarityScore } from '../src/rarity.ts';
import { cardMoments, drawPull, publishedOdds } from '../src/packs.ts';

const inputs = (extra: Record<string, unknown> = {}) => ({ reach: { modules: 4, repos: 1 }, sensitive: { files: 2, paths: ['src/auth/session.ts', 'migrations/0042.sql'] }, novelty: { share: 0.5, files: 6, novel: 3 }, size: { countedLines: 252 }, set: null, truncated: false, notCollected: ['complexity', 'estimate'], ...extra });
const revealed = (extra: Record<string, unknown> = {}) => ({ formula: '2026.1', predicted: 'epic', revealed: 'rare', tier: 'rare', score: 61.4, percentile: 91.2, cohort: { target: 'webgrip/unfold', quarter: '2026Q4', size: 57 }, inputs: inputs(), revealedAt: '2026-10-01T12:00:00Z', ...extra });
const predicted = (extra: Record<string, unknown> = {}) => ({ formula: '2026.1', predicted: 'rare', revealed: null, tier: 'rare', score: 58, percentile: null, cohort: { target: 'webgrip/unfold', quarter: '2026Q4', size: 12 }, inputs: inputs({ set: true }), revealedAt: null, ...extra });
const card = (extra: Record<string, unknown> = {}) => ({ workItemId: '7', title: 'Rotate merchant keys', team: 'delivery', state: 'merged', plays: [], totals: {}, events: [], ...extra });

test('a rarity reads strictly but additively: null, absent, predicted, revealed, an epic set and unknown future fields', () => {
  assert.equal(cardRarity(null), null, 'an older Ploeg sends null');
  assert.equal(cardRarity(undefined), null, 'an absent rarity is null');
  assert.equal(parseCard(card()).rarity, null, 'a card without rarity carries null');
  assert.deepEqual(cardRarity(predicted()), predicted(), 'predicted only: no reveal yet');
  assert.deepEqual(cardRarity(revealed()), revealed(), 'revealed, ranked by percentile');
  const epic = { formula: '2026.1', predicted: null, revealed: null, tier: 'legendary', score: null, percentile: null, cohort: null, inputs: inputs({ reach: { modules: null, repos: null }, sensitive: { files: null, paths: [] }, novelty: { share: null, files: null, novel: null }, size: { countedLines: null } }), revealedAt: null };
  assert.deepEqual(cardRarity(epic), epic, 'an epic’s own card is legendary from its set, with no score of its own');
  const future = { ...revealed(), formula: '2027.1', aura: 'gold', cohort: { target: 'webgrip/unfold', quarter: '2026Q4', size: 57, league: 'eu' }, inputs: { ...inputs(), complexity: 0.4, reach: { modules: 4, repos: 1, services: 2 }, notCollected: ['complexity', 'estimate', 'reviewLoad'] } };
  assert.deepEqual(cardRarity(future), { ...revealed(), formula: '2027.1', inputs: { ...inputs(), notCollected: ['complexity', 'estimate', 'reviewLoad'] } }, 'unknown fields are dropped, a newer formula and a newer uncollected input are kept');
  assert.deepEqual(cardRarity({ ...revealed(), inputs: undefined }), { ...revealed(), inputs: null }, 'missing inputs read null');
  assert.deepEqual(cardRarity({ formula: '2026.1', tier: 'common' }), { formula: '2026.1', predicted: null, revealed: null, tier: 'common', score: null, percentile: null, cohort: null, inputs: null, revealedAt: null }, 'absent optional fields read null');
  for (const [bad, why] of [[{ ...revealed(), tier: 'mythic' }, 'an unknown tier'], [{ ...revealed(), predicted: 'Rare' }, 'a tier in another case'], [{ ...revealed(), tier: undefined }, 'no tier'], [{ ...revealed(), formula: '' }, 'no formula'], [{ ...revealed(), score: -1 }, 'a negative score'], [{ ...revealed(), score: 100.5 }, 'a score above 100'], [{ ...revealed(), percentile: 0 }, 'a percentile of zero'], [{ ...revealed(), percentile: 101 }, 'a percentile above 100'], [{ ...revealed(), cohort: { target: 'ab', quarter: '2026Q4', size: 3 } }, 'a short target'], [{ ...revealed(), cohort: { target: 'webgrip/unfold', quarter: '2026Q5', size: 3 } }, 'a fifth quarter'], [{ ...revealed(), cohort: { target: 'webgrip/unfold', quarter: '2026Q4', size: 0 } }, 'an empty cohort'], [{ ...revealed(), revealedAt: 'soon' }, 'a time that is not a time'], [{ ...revealed(), inputs: inputs({ reach: { modules: 2.5, repos: 1 } }) }, 'a fractional module count'], [{ ...revealed(), inputs: inputs({ truncated: 'no' }) }, 'a truncated flag that is not a boolean'], [{ ...revealed(), inputs: inputs({ sensitive: { files: 21, paths: Array.from({ length: 21 }, (_, index) => `f${index}`) } }) }, 'more than 20 paths'], ['epic', 'a bare word'], [[revealed()], 'a list']] as const) {
    assert.equal(cardRarity(bad), null, `a rarity with ${why} is dropped`);
  }
});

test('the rarity formula 2026.1 weighs reach, sensitive paths, novelty and damped size, and never cost, time, tokens, bounces or grade', () => {
  const parts = rarityComponents(inputs());
  assert.equal(Math.round(parts.reach * 1000) / 1000, 0.558);
  assert.equal(Math.round(parts.sensitive * 1000) / 1000, 0.5);
  assert.equal(parts.novelty, 0.5);
  assert.equal(Math.round(parts.size * 1000) / 1000, 0.728);
  assert.equal(rarityScore(inputs(), false), 57.4);
  assert.equal(rarityScore(inputs({ set: true }), true), 67.4, 'a predicted card in an epic’s set adds 10');
  assert.equal(rarityScore(inputs({ set: true }), false), 57.4, 'a revealed score never adds the set bonus');
  assert.equal(rarityScore(inputs({ reach: { modules: 40, repos: 3 }, sensitive: { files: 40, paths: [] }, novelty: { share: 1, files: 9, novel: 9 }, size: { countedLines: 99_999 }, set: true }), true), 100, 'capped at 100');
  assert.equal(rarityScore(inputs({ reach: { modules: null, repos: null }, sensitive: { files: null, paths: [] }, novelty: { share: null, files: null, novel: null }, size: { countedLines: null } }), false), 0, 'unknown inputs add nothing');
  assert.deepEqual([fixedRarityTier(85), fixedRarityTier(84.9), fixedRarityTier(70), fixedRarityTier(55), fixedRarityTier(35), fixedRarityTier(34.9)], ['legendary', 'epic', 'epic', 'rare', 'uncommon', 'common']);
  assert.deepEqual([percentileRarityTier(99.5), percentileRarityTier(99), percentileRarityTier(96), percentileRarityTier(86), percentileRarityTier(61), percentileRarityTier(60)], ['legendary', 'epic', 'epic', 'rare', 'uncommon', 'common']);
  assert.equal(rarityPercentile(90, [10, 20, 90, 95]), 75, '100 × (1 + scores strictly below) / size');
  assert.deepEqual([rarityQuarter('2026-10-02T10:00:00Z'), rarityQuarter('2026-03-31T23:59:59Z')], ['2026Q4', '2026Q1']);
});

test('demo cards carry a deterministic, illustrative rarity in every tier, readable by the proxy and revealed at their release', () => {
  const rated = Object.values(ploegDemo.cards).filter(entry => entry.rarity);
  for (const entry of rated) {
    assert.deepEqual(cardRarity(entry.rarity), entry.rarity, `${entry.workItemId}: the proxy reads the demo's rarity unchanged`);
    assert.equal(entry.demo, true);
    if (entry.rarity!.revealed) {
      assert.equal(entry.rarity!.revealedAt, entry.release?.at, `${entry.workItemId}: revealed at its release`);
      assert.equal(entry.rarity!.inputs!.set, null, `${entry.workItemId}: a revealed score has no set flag`);
    }
    if (entry.rarity!.score !== null) assert.equal(entry.rarity!.score, rarityScore(entry.rarity!.inputs!, entry.rarity!.revealed === null), `${entry.workItemId}: the score follows formula 2026.1`);
  }
  const tiers = Object.fromEntries(rated.map(entry => [entry.workItemId, `${entry.rarity!.predicted ?? '-'}>${entry.rarity!.revealed ?? '-'}=${entry.rarity!.tier}`]));
  assert.deepEqual(tiers, {
    '105': 'rare>-=rare', '109': 'uncommon>-=uncommon', '114': 'rare>uncommon=uncommon', '117': 'common>common=common', '118': 'uncommon>common=common', '119': 'uncommon>uncommon=uncommon',
    '120': 'epic>rare=rare', '121': 'rare>rare=rare', '122': 'legendary>legendary=legendary', '123': 'epic>epic=epic', '124': 'common>common=common', '134': 'rare>epic=epic',
    '136': 'rare>rare=rare', '137': 'legendary>legendary=legendary', '138': 'uncommon>uncommon=uncommon', '139': '->-=legendary', '140': 'common>common=common', '141': 'epic>epic=epic', '142': 'rare>rare=rare',
  });
  assert.equal(ploegDemo.cards['139'].set?.complete, true, 'the epic legendary comes from its complete set');
  assert.equal(ploegDemo.cards['135'].rarity, null, 'an epic whose set is open has no rarity of its own');
  assert(rated.every(entry => entry.rarity!.percentile === null), 'the demo cohorts are small, so fixed thresholds decide');
});

test('the rarity reveal is a card moment at its release, and never changes a pull', () => {
  const entry = ploegDemo.cards['120'];
  const moments = cardMoments(entry);
  const released = moments.findIndex(moment => moment.kind === 'released');
  assert.deepEqual(moments[released + 1], { workItemId: '120', kind: 'rarity', at: moments[released].at, detail: { tier: 'rare', predicted: 'epic' } }, 'the reveal follows the release it happened at');
  assert.equal(cardMoments(ploegDemo.cards['105']).some(moment => moment.kind === 'rarity'), false, 'a prediction is not a moment');
  const key = Buffer.alloc(32, 7);
  assert.deepEqual(drawPull(key, 'user', '120', '2026-W40'), drawPull(key, 'user', '120', '2026-W40'), 'a pull depends on the person, the card and the pack, never on the card’s facts');
  assert.equal(JSON.stringify(publishedOdds()).includes('rarity'), false, 'the published odds name no rarity');
});
