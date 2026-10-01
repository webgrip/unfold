import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardAsOf, copyCard, momentText, oddsOneIn, oddsPercent, packSummaryText, patternLabels, periodLabel, pullExtras, pullIntensity, pullText, roleLabel } from '../public/cards/collection-model.js';
import { cardView } from '../public/cards/card-model.js';
import { artFor, artPresets, faceFacts, factsSignature, foilPatterns, patternFor } from '../public/cards/skins/forge/forge-model.js';
import { altArtChoices, finishSteps, patternOdds, publishedOdds } from '../src/packs.ts';
import { finishLadder } from '../public/cards/card-model.js';

const odds = publishedOdds();
const pull = (pattern, extras = {}) => ({ pattern, altArt: null, fullArt: false, goldSignature: false, ...extras });

test('the server\'s odds, alternates and finish ladder match what the forge and the card model draw', () => {
  assert.deepEqual(new Set(patternOdds.map(entry => entry.key)), new Set(foilPatterns.map(pattern => pattern.key)), 'one odds entry per forge pattern');
  assert.equal(altArtChoices, artPresets.length - 1, 'an alternate art is any preset but the card\'s own');
  assert.deepEqual(finishSteps.map(step => [step.key, step.days]), finishLadder.map(step => [step.key, step.days]), 'the server ladder matches the browser ladder');
});

test('odds read as nl-NL percentages with two decimals and as one in N', () => {
  assert.equal(oddsPercent(2400), '24,00%');
  assert.equal(oddsPercent(20), '0,20%');
  assert.equal(oddsOneIn(20), '1 in 500');
  assert.equal(oddsOneIn(80), '1 in 125');
  assert.equal(oddsPercent(undefined), '—');
  assert.deepEqual(Object.keys(patternLabels).sort(), foilPatterns.map(pattern => pattern.key).sort(), 'a label for every forge pattern');
});

test('anticipation scales with the pull only: rarer patterns and extras charge longer and burst bigger', () => {
  assert.equal(pullIntensity(pull('none'), odds).level, 0);
  assert.equal(pullIntensity(pull('holo'), odds).level, 0);
  assert.equal(pullIntensity(pull('cosmos'), odds).level, 1);
  assert.equal(pullIntensity(pull('lenticular'), odds).level, 2);
  assert.equal(pullIntensity(pull('superfractor'), odds).level, 3);
  assert.equal(pullIntensity(pull('none', { altArt: 2 }), odds).level, 1, 'an extra adds one');
  assert.equal(pullIntensity(pull('gold', { fullArt: true, goldSignature: true }), odds).level, 3, 'capped at 3');
  const levels = [0, 1, 2, 3].map(level => pullIntensity(pull(['none', 'cosmos', 'lenticular', 'gold'][level]), odds));
  for (let index = 1; index < levels.length; index++) assert(levels[index].chargeMs > levels[index - 1].chargeMs && levels[index].burst > levels[index - 1].burst);
  assert.equal(pullIntensity(null, odds).level, 0);
});

test('pulls, packs, moments, periods and roles read in plain words', () => {
  assert.equal(pullText(pull('gold', { altArt: 3, goldSignature: true })), 'Gold foil · Alt art · Gold signature');
  assert.equal(pullText(pull('none')), 'Plain');
  assert.deepEqual(pullExtras(pull('holo', { fullArt: true })), ['Full art']);
  assert.equal(packSummaryText([{ kind: 'new', pull: pull('holo', { altArt: 1 }) }, { kind: 'new', pull: pull('none') }, { kind: 'new', pull: pull('gold', { fullArt: true }) }, { kind: 'upgrade', pull: pull('none') }]), '4 cards · 2 foil pulls · 1 alt art · 1 full art · 1 upgrade');
  assert.equal(momentText({ kind: 'finish', detail: { from: 'foil', to: 'holo' } }), 'Finish rose from Foil to Holo');
  assert.equal(momentText({ kind: 'cracked', detail: { severity: 'S2', ref: 'VIK-1642' } }), 'Cracked · S2 · VIK-1642');
  assert.equal(momentText({ kind: 'mended', detail: { ref: 'VIK-1642', pr: 68 } }), 'Mended · VIK-1642 · in #68');
  assert.equal(momentText({ kind: 'merged', detail: { number: 57 } }), 'Merged #57');
  assert.equal(periodLabel({ kind: 'week', week: 40, year: 2026 }), 'Week 40 · 2026');
  assert.equal(periodLabel({ kind: 'sprint', team: 'delivery', start: '2026-09-28T00:00:00Z', end: '2026-10-12T00:00:00Z' }), 'delivery sprint · 28-09-2026 to 11-10-2026');
  assert.equal(roleLabel('qa'), 'QA');
  assert.equal(roleLabel('developer'), 'Developer');
});

const base = { workItemId: '119', title: 'Cache the price', team: 'delivery', style: { skin: 'vloer-native', theme: null }, state: 'merged', steward: { name: 'ryan', source: 'merged_by' }, roster: [], crew: [], totals: { costStatus: 'not_reported' }, events: [],
  plays: [{ number: 5, state: 'merged', mergedAt: '2026-09-02T10:00:00Z', mergedBy: 'ryan', reviews: [] }], release: { at: '2026-09-03T12:00:00Z', source: 'deploy', environment: 'production' },
  condition: { state: 'mended', cracks: [{ id: 'c', severity: 'S2', confirmedAt: '2026-09-20T10:00:00Z', mended: { at: '2026-09-25T10:00:00Z', by: 'ryan', pr: 68, bySteward: true } }] } };

test('a copy draws with the forge skin and carries its role and pull; the view and the forge read them', () => {
  const copy = copyCard(base, { role: 'developer', pull: { pattern: 'gold', altArt: 4, fullArt: true, goldSignature: true } });
  assert.equal(copy.style.skin, 'forge');
  assert.equal(base.style.skin, 'vloer-native', 'the card itself is untouched');
  const view = cardView(copy, { now: Date.parse('2026-10-01T00:00:00Z') });
  assert.equal(view.foilPattern, 'gold');
  assert.deepEqual(view.copy, { role: 'developer', roleLabel: 'Developer', altArt: 4, fullArt: true, goldSignature: true, pulled: true });
  assert.deepEqual(patternFor(view), { key: 'gold', label: 'Gold', derived: true, source: 'pull' });
  const own = artFor({ ...view, copy: null });
  const alternate = artFor(view);
  assert.equal(alternate.source, 'alt');
  assert.notEqual(alternate.key, own.key, 'alternate art is never the card\'s own');
  const reached = new Set(Array.from({ length: artPresets.length - 1 }, (_, index) => artFor({ ...view, copy: { ...view.copy, altArt: index } }).key));
  assert.equal(reached.size, artPresets.length - 1, 'the fourteen alternates are all the other presets');
  assert(!reached.has(own.key));
  const facts = faceFacts(view);
  assert.deepEqual(facts.variant, { altArt: true, fullArt: true, goldSignature: true });
  assert.notEqual(factsSignature(facts), factsSignature(faceFacts({ ...view, copy: { ...view.copy, goldSignature: false } })), 'a cosmetic change repaints the face');
  const plain = cardView(copyCard(base, { role: 'reviewer', pull: null }));
  assert.equal(plain.foilPattern, null, 'a copy without a pull keeps the derived pattern');
  assert.equal(patternFor(plain).source, 'derived');
  assert.equal(patternFor(cardView(copyCard(base, { role: 'qa', pull: { pattern: 'none' } }))).key, 'none', 'a plain pull draws no pattern');
  assert.equal(cardView(base).copy, null, 'a card outside a binder has no copy');
});

test('a card as it stood at a moment undoes later merges, releases, cracks and mends, so the binder can replay them', () => {
  const before = cardAsOf(base, Date.parse('2026-09-01T00:00:00Z'));
  assert.deepEqual([before.state, before.plays[0].state, before.release, before.condition], ['in_review', 'open', null, null]);
  const cracked = cardAsOf(base, Date.parse('2026-09-21T00:00:00Z'));
  assert.equal(cracked.condition.state, 'cracked', 'cracked, not yet mended');
  assert.equal(cracked.condition.cracks[0].mended, null);
  assert.equal(cardAsOf(base, Date.parse('2026-09-26T00:00:00Z')).condition.state, 'mended');
  assert.equal(base.condition.state, 'mended', 'the card itself is untouched');
  assert.equal(cardView(cardAsOf(base, Date.parse('2026-09-12T00:00:00Z')), { now: Date.parse('2026-09-12T00:00:00Z') }).finish.key, 'foil', 'with the same clock the finish is the one it had then');
});
