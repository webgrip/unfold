import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { cardView, finishLadder } from '../public/cards/card-model.js';
import { firstPartySkins, requiredSlots, validateManifest } from '../public/cards/registry.js';
import { coin, crackPaths, figures, gradeName, honours, initials, markSeed, moments, momentsBetween, seeded, skinView, snapshot } from '../public/cards/skin-kit.js';
import { render as nativeRender } from '../public/cards/skins/unfold-native/skin.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const now = Date.parse('2026-10-01T12:00:00Z');
const day = 86_400_000;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const helpers = face => ({ face, escape, icon: name => `<svg data-icon="${name}"></svg>`, link: value => /^https?:\/\//.test(value) ? value : '' });
const domSkins = ['holo', 'loot', 'arcade', 'ticker', 'patch'];
const tab = (view, id) => view.tabs.find(entry => entry.id === id);
const value = (view, id, label) => tab(view, id).rows.find(entry => entry.label === label)?.value;

function card(extra = {}) {
  return {
    workItemId: '138', title: 'Retry sandbox claims that never become ready', externalRef: 'VIK-1612', url: '', team: 'unfold-core',
    target: { forge: 'forgejo', owner: 'webgrip', repo: 'glide' }, style: { skin: 'holo', theme: null }, state: 'merged',
    rarity: null, finish: 'matte', grade: null, condition: null, steward: { name: 'ryan', source: 'merged_by' }, roster: [], crew: [{ role: 'builder', writes: true, runs: 3 }],
    plays: [{ number: 57, url: '', state: 'merged', mergedAt: '2026-01-01T09:00:00Z', mergedBy: 'ryan', additions: 214, deletions: 38, changedFiles: 6, ci: { state: 'success', checks: [] }, reviews: [] }],
    totals: { costUsd: 0.58, authorizedUsd: 2, costStatus: 'observed', usageComplete: true, runs: 3, rounds: 1, firstRunAt: null, lastRunAt: null, runSeconds: 2100 },
    events: [], demo: false, ...extra,
  };
}
const released = days => ({ release: { at: new Date(now - days * day - 3_600_000).toISOString(), source: 'deploy', environment: 'production' } });
const crack = mended => ({ state: mended ? 'mended' : 'cracked', cracks: [{ id: 'c1', bug: { workItemId: null, ref: 'VIK-1642', title: 'Lease renewal raced the watcher' }, severity: 'S2', share: 'primary', discovery: 'discovered', mended: mended ? { at: '2026-09-25T10:00:00Z', by: 'ryan', pr: 68, bySteward: true } : null }] });
const grade = { formula: '2026.1', overall: 9.5, provisional: false, subgrades: { reliability: 9, durability: 10, delivery: 9.5, review: 9.5 }, label: null, qualifiers: ['HF'] };
const gates = { current: 'done', history: [{ gate: 'development', enteredAt: '2026-09-01T10:00:00Z' }], bounces: [{ from: 'test', to: 'development', at: '2026-09-02T10:00:00Z', reason: 'requirement', actor: 'iris' }, { from: 'acceptance', to: 'development', at: '2026-09-03T10:00:00Z', reason: 'defect', actor: 'iris' }], rightFirstTime: { test: 0, acceptance: 1 } };
const epicSet = complete => ({ role: 'epic', epic: { workItemId: '200', ref: 'VIK-1600', title: 'Run cards' }, position: null, size: 5, children: [1, 2, 3, 4, 5].map(number => ({ workItemId: `20${number}`, title: `Child ${number}`, state: complete || number <= 3 ? 'merged' : 'in_review', settled: complete || number <= 2, cracked: false })), complete });

test('the skin view reshapes the card model\'s gates and set into the compact form the skins print', () => {
  const view = skinView(cardView(card({ gates }), { now }));
  assert.deepEqual([view.gates.current, view.gates.label, view.gates.rank], ['done', 'Done', 3]);
  assert.deepEqual(view.gates.steps.map(step => [step.key, step.reached, step.current, step.bounces]), [['development', true, false, 0], ['test', true, false, 1], ['acceptance', true, false, 1], ['done', true, true, 0]]);
  assert.deepEqual(view.gates.bounces.map(entry => [entry.reason, entry.counted]), [['requirement', false], ['defect', true]], 'only defect and unknown bounces count');
  assert.deepEqual([view.gates.counted, view.gates.rightFirstTime, view.gates.text], [1, false, 'Done · 2 bounces, 1 counted']);
  assert.equal(skinView(cardView(card({ gates: { current: 'acceptance', history: [], bounces: [], rightFirstTime: { test: 0 } } }), { now })).gates.rightFirstTime, true);
  assert.equal(skinView(cardView(card(), { now })).gates, null);
  const epic = skinView(cardView(card({ workItemId: '200', set: epicSet(false) }), { now }));
  assert.deepEqual([epic.set.setCard, epic.set.number, epic.set.size, epic.set.merged, epic.set.settled, epic.set.complete], [true, null, 5, 3, 2, false]);
  assert.deepEqual(epic.set.members.map(member => [member.number, member.ref, member.state]), [[1, '#201', 'settled'], [2, '#202', 'settled'], [3, '#203', 'merged'], [4, '#204', 'open'], [5, '#205', 'open']]);
  assert.equal(epic.set.text, 'Set Card · 5 Work Items · Run cards');
  const child = skinView(cardView(card({ workItemId: '203', set: { role: 'child', epic: { workItemId: '200', ref: 'VIK-1600', title: 'Run cards' }, position: 3, size: 5, children: [], complete: false } }), { now }));
  assert.deepEqual([child.set.setCard, child.set.number, child.set.text, child.set.ref], [false, 3, '3/5 · Run cards', 'VIK-1600']);
  assert.equal(skinView(cardView(card({ set: epicSet(true) }), { now })).set.complete, true);
  const raw = cardView(card({ gates }), { now });
  assert.deepEqual(Object.keys(skinView(raw)).sort(), Object.keys(raw).sort(), 'every other field is the view model\'s');
});

test('the skin kit grades, initials and seeds deterministically', () => {
  assert.deepEqual([10, 9.5, 9, 8.5, 7, 1].map(gradeName), ['Gem mint', 'Mint+', 'Mint', 'NM-MT+', 'Near mint', 'Poor']);
  assert.equal(gradeName(null), '');
  assert.equal(initials('demo-operator'), 'DO');
  assert.equal(initials('Ryan Grippeling'), 'RG');
  assert.equal(initials(''), '');
  const a = seeded(42);
  const b = seeded(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert(Array.from({ length: 100 }, seeded(7)).every(number => number >= 0 && number < 1));
  const view = cardView(card({ condition: crack(false) }), { now });
  assert.equal(markSeed(view), view.condition.seed, 'cracks follow the condition seed');
  assert.deepEqual(crackPaths(markSeed(view)), crackPaths(markSeed(view)), 'the same crack on every page');
  assert.notDeepEqual(crackPaths(1), crackPaths(2));
  const paths = crackPaths(9, { roots: 4 });
  assert.equal(new Set(paths.map(path => path.root)).size, 4);
  assert(paths.every(path => /^M[\d.\- ]+(L[\d.\- ]+)+$/.test(path.d)));
  const ortho = crackPaths(9, { ortho: true });
  for (const path of ortho) {
    const points = path.d.slice(1).split('L').map(point => point.trim().split(' ').map(Number));
    for (let index = 1; index < points.length; index++) assert(points[index][0] === points[index - 1][0] || points[index][1] === points[index - 1][1], 'pixel cracks turn at right angles');
  }
});

test('the skin kit prints cost, figures and honours only from facts: demo spends nothing, unknown never reads as zero, rarity has its own mark', () => {
  assert.deepEqual(coin(cardView(ploegDemo.cards['124'])), { top: 'Cost', main: 'Demo', caption: 'no model calls', status: 'demo' });
  assert.deepEqual(coin(cardView(card(), { now })), { top: 'US$', main: '0,58', caption: 'of US$\u00a02,00', status: 'observed' });
  assert.deepEqual(coin(cardView(card({ totals: { costStatus: 'not_reported' } }), { now })), { top: 'Cost', main: '—', caption: 'not reported', status: 'not_reported' });
  const unknown = figures(cardView(card({ totals: { costStatus: 'not_reported' }, plays: [{ number: 5, state: 'open' }] }), { now }));
  assert.deepEqual([unknown.time.value, unknown.tokens.value, unknown.diff.value, unknown.live.value], ['Not reported', 'Not reported', 'Not reported', 'Not reported']);
  assert.equal(figures(cardView(card({ ...released(41) }), { now })).live.value, 'Day 41');
  assert.equal(figures(cardView(card({ release: null }), { now })).live.value, 'Not live yet');
  const view = cardView(card({ ...released(200), grade: { ...grade, overall: 10, label: 'gold' }, condition: crack(true), gates: { current: 'done', history: [], bounces: [], rightFirstTime: { test: 0, acceptance: 0 } } }), { now });
  assert.deepEqual(honours(view).map(entry => [entry.key, entry.tone]), [['gold-label', 'gold'], ['live', 'gold'], ['green-ci', 'success'], ['first-pass', 'success'], ['right-first-time', 'success'], ['mended', 'gold'], ['q-hf', 'attention'], ['signed', 'neutral']]);
  assert.deepEqual(honours(cardView(card({ steward: null, plays: [], totals: { costStatus: 'not_reported', rounds: 2 } }), { now })), [], 'a card with nothing to show earns nothing');
  assert(!honours(view).some(entry => /common|rare|epic|legendary|rarity/i.test(entry.label)));
});

test('a skin plays a moment only for what changed between two draws of the same card', () => {
  assert.deepEqual(moments, ['reveal', 'state', 'signed', 'merged', 'released', 'rarity', 'finish', 'grade', 'gate', 'bounce', 'crack', 'mend', 'set']);
  const open = snapshot(cardView(card({ state: 'in_review', steward: null, plays: [{ number: 57, state: 'open' }] }), { now }));
  assert.deepEqual(momentsBetween(null, open), ['reveal'], 'the first draw is a reveal');
  assert.deepEqual(momentsBetween(open, open), [], 'a redraw without changes plays nothing');
  assert.deepEqual(momentsBetween({ ...open, id: '1' }, open), ['reveal'], 'another Work Item is a reveal');
  const merged = snapshot(cardView(card(), { now }));
  assert.deepEqual(momentsBetween(open, merged), ['signed', 'merged']);
  const live = snapshot(cardView(card({ ...released(8) }), { now }));
  assert.deepEqual(momentsBetween(merged, live), ['released', 'finish']);
  const graded = snapshot(cardView(card({ ...released(8), grade, gates }), { now }));
  assert.deepEqual(momentsBetween(live, graded), ['grade', 'gate', 'bounce']);
  const cracked = snapshot(cardView(card({ ...released(8), grade, gates, condition: crack(false) }), { now }));
  assert.deepEqual(momentsBetween(graded, cracked), ['crack']);
  const mended = snapshot(cardView(card({ ...released(8), grade, gates, condition: crack(true) }), { now }));
  assert.deepEqual(momentsBetween(cracked, mended), ['mend']);
  const setBefore = snapshot(cardView(card({ set: epicSet(false) }), { now }));
  const setAfter = snapshot(cardView(card({ set: epicSet(true) }), { now }));
  assert.deepEqual(momentsBetween(setBefore, setAfter), ['set']);
  assert.deepEqual(momentsBetween(live, snapshot(cardView(card({ ...released(30) }), { now }))), ['finish'], 'a new finish step is a moment');
  const rarity = (revealed, at = null) => ({ formula: '2026.1', predicted: 'epic', revealed, tier: revealed ?? 'epic', score: 64, percentile: null, cohort: null, inputs: null, revealedAt: at });
  const predicted = snapshot(cardView(card({ rarity: rarity(null) }), { now }));
  const revealed = snapshot(cardView(card({ ...released(1), rarity: rarity('rare', '2026-09-30T10:00:00Z') }), { now }));
  assert.deepEqual(momentsBetween(predicted, revealed), ['released', 'rarity'], 'a revealed rarity is a moment; a prediction is not');
  assert.deepEqual(momentsBetween(merged, predicted), [], 'a prediction alone plays nothing');
});

for (const id of domSkins) {
  test(`the ${id} skin pack is a CSP-safe DOM pack: manifest, stylesheet and markup`, async () => {
    const folder = new URL(`../public/cards/skins/${id}/`, import.meta.url);
    assert(firstPartySkins.includes(id), 'it ships');
    const manifest = validateManifest(JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8')), id);
    assert.deepEqual([manifest.renderer, manifest.extends, manifest.fallback, manifest.script], ['dom', 'unfold-native', null, 'skin.js']);
    assert.deepEqual(manifest.finishes, finishLadder.map(step => step.key), 'it draws every finish');
    const raw = JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8'));
    assert(raw.moments.length >= 7 && raw.moments.every(name => moments.includes(name)), 'it names the moments it plays');
    for (const file of readdirSync(folder)) assert.match(file, /^[a-z0-9][a-z0-9-]*\.(?:css|js|json)$/, 'every file is servable by the /cards/ route');
    const css = readFileSync(new URL('skin.css', folder), 'utf8');
    assert.match(css, /^@import url\("\.\.\/\.\.\/skin-kit\.css"\);\n/, 'the stylesheet starts from the shared kit');
    assert.doesNotMatch(css.replace(/^@import[^\n]*\n/, ''), /@import|url\(\s*["']?(?:https?:|\/\/)|@font-face|expression\(/, 'it loads nothing from elsewhere');
    assert.match(css, /prefers-reduced-motion/, 'motion honours the reader');
    const sources = readdirSync(folder).filter(file => file.endsWith('.js')).map(file => readFileSync(new URL(file, folder), 'utf8')).join('\n');
    assert.doesNotMatch(sources, /\beval\(|new Function|innerHTML|insertAdjacentHTML|document\.write|setAttribute\(\s*['"]style|\.style\.(?!setProperty)[a-z]|https?:\/\/(?!www\.w3\.org)/i, 'no eval, no HTML injection, no inline styles, no remote URLs');
    const { render, attach } = await import(new URL('skin.js', folder));
    assert.equal(typeof attach, 'function');
    const hostile = cardView(card({ title: '<img src=x onerror=alert(1)>', steward: { name: '"><script>x</script>', source: 'merged_by' }, externalRef: '<b>VIK</b>', ...released(400), grade, condition: crack(false), gates, set: { role: 'child', epic: { workItemId: '200', ref: '<i>', title: '<svg onload=x>' }, position: 2, size: 5, children: [], complete: false } }), { now });
    const views = [hostile, ...Object.values(ploegDemo.cards).map(entry => cardView({ ...entry, style: { skin: id, theme: null } })), ...finishLadder.map(step => cardView(card({ ...released(step.days), condition: crack(true) }), { now })), cardView(card({ set: epicSet(true) }), { now })];
    for (const view of views) {
      const front = render(view, helpers('front'));
      const back = render(view, helpers('back'));
      for (const markup of [front, back]) {
        assert(!/\sstyle=/.test(markup), `${id} #${view.id}: no inline style attributes under the CSP`);
        assert(!/<style/i.test(markup), `${id} #${view.id}: no style blocks`);
        assert(!/<[^>]*\son[a-z]+=/i.test(markup.replace(/"[^"]*"/g, '""')), `${id} #${view.id}: no inline handlers`);
        assert(!/<script|<img|javascript:/i.test(markup), `${id} #${view.id}: hostile text is escaped`);
      }
      assert.equal(back, nativeRender(view, helpers('back')), 'one back: Unfold Native\'s tabs');
      for (const slot of requiredSlots) assert(front.includes(`data-slot="${slot}"`), `${id} #${view.id} fills the ${slot} slot`);
      assert.match(front, /data-skin-root/);
      assert.match(front, /data-card-action="flip"/, 'More info turns the card');
      assert.match(front, new RegExp(`data-finish="${view.finish.key}"`), 'the root names its finish');
      assert(front.includes(`<span class="sr-only">${escape(view.steward.text)}</span>`), 'the steward is read out');
      if (view.rarity) {
        assert(front.includes(`class="uc-rarity" data-rarity="${view.rarity.key}" data-state="${view.rarity.state}"`), `${id} #${view.id}: the rarity mark names its tier and state`);
        assert(front.includes(`class="uc-frame" data-rarity="${view.rarity.key}" data-state="${view.rarity.state}"`), `${id} #${view.id}: the frame ring names its tier and state`);
        assert(front.includes(`<span class="sr-only">${escape(view.rarity.description)}</span>`), `${id} #${view.id}: the rarity is read out`);
      } else assert.doesNotMatch(front.replace(/<[^>]+>/g, ' '), /\b(?:common|uncommon|rare|epic|legendary|rarity)\b/i, `${id} #${view.id}: no rarity on a card without one`);
      if (view.demo) {
        assert(!front.includes('US$'), `${id} #${view.id}: a demo card paints no amount`);
        assert.match(front, /no model calls/, `${id} #${view.id}: the demo says so`);
      }
      if (view.condition) assert.match(front, /pathLength="1"/, `${id} #${view.id}: the crack is drawn`);
      if (view.condition?.state === 'mended') assert.match(front, /data-condition="mended"/);
      if (view.set) assert.match(front, new RegExp(`data-set="${view.set.role === 'epic' ? 'card' : 'child'}"`), `${id} #${view.id}: the set variant is marked`);
    }
    assert.match(render(cardView(card(), { now }), helpers('front')), /0,58/, 'a real cost is printed');
    assert.notEqual(render(views.at(-1), helpers('front')).match(/data-layout="([a-z-]+)"/)?.[1], render(cardView(card(), { now }), helpers('front')).match(/data-layout="([a-z-]+)"/)?.[1], 'a Set Card has its own layout');
  });
}

test('the shared skin kit stylesheet loads nothing from elsewhere and honours reduced motion', () => {
  const css = readFileSync(new URL('../public/cards/skin-kit.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /@import|url\(\s*["']?(?:https?:|\/\/)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
