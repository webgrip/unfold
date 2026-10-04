import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { cardView, rarityComponents, rarityParts, rarityTiers, rarityTop } from '../public/cards/card-model.js';
import { cardAsOf, momentText } from '../public/cards/collection-model.js';
import { rarityFrame, rarityMark } from '../public/cards/skin-kit.js';
import { momentTier, rarityRevealTiers, tierSpecs } from '../public/cards/effects/tiers.js';
import { ceremonyTimeline, flashSafe, momentLook, rarityLooks } from '../public/cards/effects/timeline.js';
import { cardMoments, momentHeadline } from '../public/cards/effects/moments.js';
import { faceFacts, factsSignature, rarityMetals } from '../public/cards/skins/forge/forge-model.js';
import { frontShader } from '../public/cards/skins/forge/front-shader.js';
import { rarityComponents as serverComponents } from '../src/rarity.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const h = { escape };
const inputs = (extra = {}) => ({ reach: { modules: 4, repos: 1 }, sensitive: { files: 2, paths: ['src/auth/session.ts', 'migrations/0042.sql'] }, novelty: { share: 0.5, files: 6, novel: 3 }, size: { countedLines: 252 }, set: null, truncated: false, notCollected: ['complexity', 'estimate'], ...extra });
const revealed = (extra = {}) => ({ formula: '2026.1', predicted: 'rare', revealed: 'epic', tier: 'epic', score: 74.2, percentile: 96.5, cohort: { target: 'webgrip/unfold', quarter: '2026Q4', size: 200 }, inputs: inputs(), revealedAt: '2026-10-01T12:00:00Z', ...extra });
const predicted = (extra = {}) => ({ formula: '2026.1', predicted: 'rare', revealed: null, tier: 'rare', score: 67.4, percentile: null, cohort: { target: 'webgrip/unfold', quarter: '2026Q4', size: 12 }, inputs: inputs({ set: true }), revealedAt: null, ...extra });
const card = (extra = {}) => ({ workItemId: '7', title: 'Rotate merchant keys', team: 'delivery', state: 'merged', target: { forge: 'forgejo', owner: 'webgrip', repo: 'unfold' }, style: { skin: 'unfold-native', theme: null }, plays: [{ number: 9, state: 'merged', mergedAt: '2026-09-30T10:00:00Z', additions: 200, deletions: 52, changedFiles: 6 }], totals: {}, events: [], release: { at: '2026-10-01T12:00:00Z', source: 'deploy', environment: 'production' }, ...extra });
const tab = view => view.tabs.find(entry => entry.id === 'rarity');
const row = (view, label) => tab(view).rows.find(entry => entry.label === label);
const now = Date.parse('2026-10-02T12:00:00Z');

test('the tiers climb steel, bronze, silver, gold, prismatic frames with black, silver, gold, mythic and iridescent set symbols', () => {
  assert.deepEqual(rarityTiers.map(tier => [tier.key, tier.metal, tier.symbol, tier.top, tier.from]), [
    ['common', 'steel', 'black', 100, 0], ['uncommon', 'bronze', 'silver', 40, 35], ['rare', 'silver', 'gold', 15, 55], ['epic', 'gold', 'mythic', 5, 70], ['legendary', 'prismatic', 'iridescent', 1, 85],
  ]);
  assert.deepEqual(rarityParts.map(part => [part.key, part.weight]), [['reach', 0.3], ['sensitive', 0.25], ['novelty', 0.2], ['size', 0.25]]);
  assert.equal(rarityParts.reduce((total, part) => total + part.weight, 0), 1);
});

test('a card without a rarity, or with one Unfold cannot read, shows none and says why on its back', () => {
  for (const raw of [null, undefined, 'epic', { formula: '2026.1', tier: 'mythic' }, { formula: '2026.1' }]) {
    const view = cardView(card({ rarity: raw }), { now });
    assert.equal(view.rarity, null, JSON.stringify(raw));
    assert.equal(row(view, 'Rarity').value, 'Not rated');
  }
  const { rarity: _absent, ...older } = card({ rarity: null });
  assert.match(tab(cardView(older, { now })).note, /^This Ploeg does not send rarity\./, 'an absent rarity is an older Ploeg');
  assert.match(tab(cardView(card({ rarity: null }), { now })).note, /An older Ploeg sends no rarity/);
});

test('a predicted rarity is a hint: its tier, a glow on the card, no reveal yet, and the set bonus in its components', () => {
  const view = cardView(card({ state: 'in_review', release: null, rarity: predicted() }), { now });
  const rarity = view.rarity;
  assert.deepEqual([rarity.key, rarity.state, rarity.chip, rarity.change], ['rare', 'predicted', 'Predicted rare', null]);
  assert.equal(rarity.rank, '', 'a small cohort has no percentile rank');
  assert.match(rarity.why, /^Predicted rare because it /);
  assert.match(rarity.why, /The merged change reveals its rarity at release\.$/);
  assert.deepEqual([row(view, 'Rarity').value, row(view, 'Predicted').value, row(view, 'Revealed').value, row(view, 'Revealed').status], ['Rare, predicted', 'Rare, before the merge', 'At release, from the merged change', 'unreported']);
  assert.equal(row(view, 'Rank').value, 'Fixed thresholds: 12 cards in webgrip/unfold for 2026-Q4, fewer than 30');
  assert.equal(row(view, 'On the card').value, 'A silver glow until release');
  const parts = tab(view).groups[0].rows.map(entry => [entry.label, entry.value]);
  assert.deepEqual(parts.slice(0, 5), [
    ['Reach · 30%', '16,7 of 30 points · 4 modules in 1 repository'],
    ['Sensitive paths · 25%', '12,5 of 25 points · 2 files on sensitive ground'],
    ['Novelty · 20%', '10 of 20 points · 3 of 6 files new to the repository'],
    ['Size, damped · 25%', '18,2 of 25 points · 252 counted lines'],
    ['Epic set', '+10 points · In an epic’s set: adds 10 while predicted'],
  ]);
  assert.deepEqual(parts.slice(5).map(([label]) => label), ['Complexity of the code touched', 'Estimate versus actual'], 'what Ploeg does not collect yet says so');
  assert.deepEqual(tab(view).lists[0].items.map(item => item.title), ['src/auth/session.ts', 'migrations/0042.sql']);
});

test('a revealed rarity shows its tier, score, rank in its cohort, formula and a plain why line, apart from grade and finish', () => {
  const view = cardView(card({ rarity: revealed() }), { now });
  const rarity = view.rarity;
  assert.deepEqual([rarity.key, rarity.state, rarity.chip, rarity.change, rarity.scoreText, rarity.topText], ['epic', 'revealed', 'Epic', 'up', '74,2 of 100', '4%']);
  assert.equal(rarity.rank, 'top 4% of webgrip/unfold in 2026-Q4');
  assert.equal(rarity.text, 'Epic · top 4% of webgrip/unfold in 2026-Q4');
  assert.equal(rarity.why, 'Epic because it reached 4 modules and broke new ground in 50% of its files: a challenge score of 74,2, in the top 4% of webgrip/unfold in 2026-Q4.');
  assert.deepEqual([row(view, 'Challenge score').value, row(view, 'Rank').value, row(view, 'Formula').value, row(view, 'On the card').value], ['74,2 of 100', 'Top 4% of webgrip/unfold in 2026-Q4 · 200 cards', '2026.1', 'Gold frame, mythic orange set symbol']);
  assert.match(row(view, 'Revealed').value, /^Epic · /);
  assert.equal(tab(view).lead, rarity.why, 'the back leads with the why line');
  assert.match(tab(view).note, /^Rarity is how exceptional the work was/);
  assert.match(tab(view).note, /not the grade \(how well it was done\) or the finish \(how long it has lived\)/);
  assert.match(tab(view).note, /cost, time, tokens, bounces and the grade never count/);
  assert.match(tab(view).note, /never changes what Ploeg authorizes, budgets or merges, or a pack’s odds/);
  assert.equal(tab(view).groups[0].rows.some(entry => entry.label === 'Epic set'), false, 'a revealed score has no set bonus');
  assert.match(rarity.description, /how challenging the change was, not how well it was done/);
});

test('a reveal below its prediction is told plainly, with no loss words', () => {
  const view = cardView(card({ rarity: revealed({ predicted: 'epic', revealed: 'rare', tier: 'rare', score: 61.4, percentile: 88 }) }), { now });
  assert.equal(view.rarity.change, 'down');
  assert.equal(row(view, 'Predicted').value, 'Epic, before the merge');
  for (const text of [view.rarity.why, view.rarity.description, view.rarity.text, momentHeadline({ kind: 'rarity', detail: { tier: 'rare', predicted: 'epic' } }).sub]) assert.doesNotMatch(text, /\b(?:lost|loss|lower|down|demoted|downgrad|only|missed|fell|dropped)\b/i, text);
  assert.deepEqual(momentHeadline({ kind: 'rarity', detail: { tier: 'rare', predicted: 'epic' } }), { main: 'Rare', sub: 'revealed at release' });
  assert.deepEqual(momentHeadline({ kind: 'rarity', detail: { tier: 'epic', predicted: 'rare' } }), { main: 'Epic', sub: 'beat its prediction of rare' });
  assert.deepEqual(momentHeadline({ kind: 'rarity', detail: { tier: 'rare', predicted: 'rare' } }), { main: 'Rare', sub: 'revealed at release, as predicted' });
  assert.equal(momentText({ kind: 'rarity', detail: { tier: 'legendary' } }), 'Rarity revealed: Legendary');
});

test('an epic’s own card is legendary while its set is complete, and rated by its set rather than a score', () => {
  const set = { role: 'epic', epic: { workItemId: '200', ref: 'VIK-1600', title: 'Run cards' }, position: null, size: 4, children: [], complete: true };
  const raw = { formula: '2026.1', predicted: null, revealed: null, tier: 'legendary', score: null, percentile: null, cohort: null, inputs: null, revealedAt: null };
  const view = cardView(card({ plays: [], release: null, state: 'drafting', set, rarity: raw }), { now });
  assert.deepEqual([view.rarity.key, view.rarity.state, view.rarity.fromSet, view.rarity.chip], ['legendary', 'revealed', true, 'Legendary']);
  assert.match(view.rarity.why, /^Legendary while its epic’s set is complete/);
  assert.match(view.rarity.why, /It drops back if the set reopens\./);
  assert.deepEqual([row(view, 'Revealed').value, row(view, 'Challenge score').value], ['Legendary while the set is complete', 'None: an epic’s card is rated by its set']);
  assert.deepEqual(tab(view).groups, [], 'no score components to show');
  const reopened = cardView(card({ plays: [], release: null, set: { ...set, complete: false }, rarity: { ...raw, predicted: 'common', tier: 'common' } }), { now });
  assert.deepEqual([reopened.rarity.key, reopened.rarity.state, reopened.rarity.fromSet], ['common', 'predicted', false], 'a reopened set drops the epic back to its own prediction');
});

test('a newer formula or missing inputs still show the tier, without a breakdown Unfold cannot make', () => {
  const newer = cardView(card({ rarity: revealed({ formula: '2027.1' }) }), { now });
  assert.equal(newer.rarity.parts, null);
  assert.match(newer.rarity.why, /This Unfold cannot break formula 2027\.1 down\./);
  assert.deepEqual(tab(newer).groups[0].rows.map(entry => entry.value), ['Formula 2027.1 is newer than this Unfold']);
  const bare = cardView(card({ rarity: revealed({ inputs: null }) }), { now });
  assert.deepEqual(tab(bare).groups[0].rows.map(entry => entry.value), ['This Ploeg did not send them']);
  const truncated = cardView(card({ rarity: revealed({ inputs: inputs({ truncated: true }) }) }), { now });
  assert(tab(truncated).groups[0].rows.some(entry => entry.label === 'File facts' && /lower bound/.test(entry.value)));
});

test('the share from the top comes from Ploeg’s percentile and the cohort size', () => {
  assert.equal(rarityTop(100, 200), 0.5, 'the top card of 200 is in the top half percent');
  assert.equal(rarityTop(96.5, 200), 4);
  assert.equal(rarityTop(100, 30), 100 / 30);
  assert.equal(rarityTop(null, 200), null);
  assert.equal(rarityTop(90, null), null);
  assert.equal(cardView(card({ rarity: revealed({ percentile: 100, tier: 'legendary', revealed: 'legendary' }) }), { now }).rarity.topText, '0,5%');
});

test('Unfold’s breakdown of formula 2026.1 matches the server’s for every demo card', () => {
  for (const sample of [inputs(), inputs({ reach: { modules: 12, repos: 3 } }), inputs({ novelty: { share: null, files: 8, novel: 2 } }), inputs({ reach: { modules: null, repos: null }, size: { countedLines: null } })]) assert.deepEqual(rarityComponents(sample), serverComponents(sample));
  for (const entry of Object.values(ploegDemo.cards).filter(item => item.rarity?.inputs)) assert.deepEqual(rarityComponents(entry.rarity.inputs), serverComponents(entry.rarity.inputs), entry.workItemId);
});

test('the skin kit prints one escaped rarity mark and frame ring for every skin, and nothing without a rarity', () => {
  const view = cardView(card({ rarity: revealed() }), { now });
  assert.equal(rarityMark(cardView(card({ rarity: null }), { now }), h), '');
  assert.equal(rarityFrame(cardView(card({ rarity: null }), { now })), '');
  const mark = rarityMark(view, h);
  assert.match(mark, /^<span class="uc-rarity" data-rarity="epic" data-state="revealed" title="Rarity: Epic, top 4% of webgrip\/unfold in 2026-Q4\./);
  assert.match(mark, /<span class="uc-rarity-word" aria-hidden="true">Epic<\/span>/);
  assert.match(mark, /<span class="sr-only">Rarity: Epic/);
  assert.match(rarityMark(cardView(card({ rarity: predicted() }), { now }), h), /<small>Predicted<\/small> Rare/);
  assert.match(rarityMark(view, h, { compact: true }), /data-compact/);
  assert.equal(rarityFrame(view), '<i class="uc-frame" data-rarity="epic" data-state="revealed" aria-hidden="true"></i>');
  assert(!/\sstyle=/.test(mark) && !/\son[a-z]+=/.test(mark), 'no inline style or handler');
  const css = readFileSync(new URL('../public/cards/unfold-card.css', import.meta.url), 'utf8');
  for (const tier of rarityTiers) assert.match(css, new RegExp(`:host\\(\\[data-rarity="${tier.key}"\\]\\)`), `${tier.key} has its tokens`);
  assert.match(css, /\.uc-frame\[data-state="predicted"\]/, 'a predicted rarity draws a hint, not the metal');
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*\.uc-frame,\s*\.uc-rarity \*\s*\{\s*animation: none !important;/, 'reduced motion stills the glow and the iridescence');
});

test('the reveal plays bigger for higher tiers, through the director’s rules, and never as a loss', () => {
  assert.deepEqual(rarityRevealTiers, { common: 'minor', uncommon: 'minor', rare: 'major', epic: 'epic', legendary: 'legendary' });
  for (const tier of rarityTiers) assert.equal(momentTier({ kind: 'rarity', detail: { tier: tier.key, predicted: 'legendary' } }), rarityRevealTiers[tier.key], `${tier.key}: the size follows the revealed tier, not the prediction`);
  assert.equal(momentTier({ kind: 'merged', detail: { tier: 'legendary' } }), 'major', 'other moments still never follow rarity');
  const levels = rarityTiers.map(tier => momentLook({ kind: 'rarity', detail: { tier: tier.key } }).level);
  assert.deepEqual(levels, [0, 1, 2, 3, 4], 'the cue rises with the tier');
  assert(Object.values(rarityLooks).every(look => look.sound === 'rarity' && look.palette !== 'ink'), 'every tier rises in the same cue; none uses the crack’s dark palette');
  const legendary = ceremonyTimeline({ kind: 'rarity', detail: { tier: 'legendary' } }, 'legendary', 'full');
  assert.equal(legendary.durationMs, tierSpecs.legendary.maxMs, 'legendary gets the full treatment');
  assert(legendary.cues.some(cue => cue.type === 'takeover') && legendary.cues.some(cue => cue.type === 'slowmo'));
  assert.equal(legendary.cues.find(cue => cue.type === 'sound').level, 4);
  const down = ceremonyTimeline({ kind: 'rarity', detail: { tier: 'rare', predicted: 'epic' } }, 'major', 'full');
  const level = ceremonyTimeline({ kind: 'rarity', detail: { tier: 'rare', predicted: 'rare' } }, 'major', 'full');
  assert.deepEqual(down, level, 'a reveal below its prediction plays exactly like the same tier revealed as predicted');
  for (const tier of rarityTiers) for (const mode of ['full', 'calm']) assert(flashSafe([{ timeline: ceremonyTimeline({ kind: 'rarity', detail: { tier: tier.key } }, rarityRevealTiers[tier.key], mode) }]), `${tier.key} ${mode} is flash safe`);
  assert.equal(ceremonyTimeline({ kind: 'rarity', detail: { tier: 'legendary' } }, 'legendary', 'calm').durationMs <= 400, true, 'calm caps the reveal');
});

test('a card’s moments carry the reveal at its time, and the card as it was before shows only the prediction', () => {
  const raw = card({ rarity: revealed() });
  const moments = cardMoments(raw, now);
  assert.deepEqual(moments.filter(moment => ['released', 'rarity'].includes(moment.kind)).map(moment => [moment.kind, moment.detail]), [['released', { source: 'deploy', environment: 'production' }], ['rarity', { tier: 'epic', predicted: 'rare' }]]);
  const before = cardAsOf(raw, Date.parse('2026-10-01T11:59:00Z'));
  assert.deepEqual([before.rarity.revealed, before.rarity.tier, before.rarity.score], [null, 'rare', null]);
  assert.equal(cardView(before, { now }).rarity.state, 'predicted');
  assert.equal(cardAsOf(card({ rarity: revealed({ predicted: null }) }), Date.parse('2026-09-01T00:00:00Z')).rarity, null, 'a card revealed without a prediction had no rarity before');
  assert.deepEqual(cardAsOf(raw, now).rarity, raw.rarity, 'after the reveal nothing changes');
});

test('the forge paints the tier’s metal in its front shader, the symbol in the tier’s colour and the word on the type line', () => {
  assert.deepEqual(Object.keys(rarityMetals), rarityTiers.map(tier => tier.key));
  assert(Object.values(rarityMetals).every(metal => metal.lo.length === 3 && metal.hi.length === 3 && metal.hint.length === 3), 'every tier has its metal stops and hint');
  assert.equal(rarityMetals.legendary.irid > 0, true);
  assert(Object.entries(rarityMetals).filter(([key]) => key !== 'legendary').every(([, metal]) => metal.irid === 0));
  const view = cardView(card({ style: { skin: 'forge', theme: null }, rarity: revealed() }), { now });
  const facts = faceFacts(view);
  assert.deepEqual([facts.rarity.key, facts.rarity.state, facts.rarity.word], ['epic', 'revealed', 'Epic']);
  const hint = faceFacts(cardView(card({ style: { skin: 'forge', theme: null }, rarity: predicted() }), { now }));
  assert.equal(hint.rarity.word, 'Predicted Rare');
  assert.notEqual(factsSignature(facts), factsSignature(hint), 'a reveal repaints the face');
  assert.equal(faceFacts(cardView(card({ style: { skin: 'forge', theme: null }, rarity: null }), { now })).rarity, null);
  const shader = frontShader({ key: 'nebula' }, 'holo');
  assert.match(shader, /uniform vec3 uMetalLo, uMetalHi, uHint; uniform vec4 uRarity;/);
  assert.match(shader, /float frameBand = m\.g \* \(1\.0 - m\.r\);/, 'the metal stays on the frame band');
  assert.match(shader, /col = mix\(col, metal \* \(0\.5 \+ 0\.7 \* fl\), frameBand \* uRarity\.x/);
});
