import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { cardView, finishLadder, stableHash } from '../public/cards/card-model.js';
import { validateManifest, requiredSlots } from '../public/cards/registry.js';
import { artFor, artPresets, coverageFor, coverageLadder, derivedPatterns, faceFacts, factsSignature, foilPatterns, patternFor, seedFor } from '../public/cards/skins/forge/forge-model.js';
import { attach, render, keepAliveMs } from '../public/cards/skins/forge/skin.js';
import { prelude } from '../public/cards/skins/forge/shader-prelude.js';
import { foils } from '../public/cards/skins/forge/shader-foils.js';
import { art } from '../public/cards/skins/forge/shader-art.js';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { threeVersion, vendoredFiles } from '../scripts/vendor-three.mjs';

const now = Date.parse('2026-10-01T12:00:00Z');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const helpers = face => ({ face, escape, icon: name => `<svg data-icon="${name}"></svg>`, link: value => /^https?:\/\//.test(value) ? value : '' });
const folder = new URL('../public/cards/skins/forge/', import.meta.url);

function card(extra = {}) {
  return {
    workItemId: '138', title: 'Retry sandbox claims that never become ready', externalRef: 'VIK-1612', url: '', team: 'unfold-core',
    target: { forge: 'forgejo', owner: 'webgrip', repo: 'glide' }, style: { skin: 'forge', theme: null }, state: 'merged',
    rarity: null, finish: 'matte', grade: null, condition: null, steward: { name: 'ryan', source: 'merged_by' }, roster: [], crew: [{ role: 'builder', writes: true, runs: 3 }],
    plays: [{ number: 57, url: '', state: 'merged', mergedAt: '2026-01-01T09:00:00Z', mergedBy: 'ryan', additions: 214, deletions: 38, changedFiles: 6, ci: null, reviews: [] }],
    totals: { costUsd: 0.58, authorizedUsd: 2, costStatus: 'observed', usageComplete: true, runs: 3, rounds: 2, firstRunAt: null, lastRunAt: null },
    events: [], demo: false, ...extra,
  };
}
const releasedFor = days => card({ release: { at: new Date(now - days * 86_400_000 - 3_600_000).toISOString(), source: 'deploy', environment: 'production' } });

test('the earned finish sets how much of the card the foil covers', () => {
  assert.deepEqual(coverageLadder.map(step => step.finish), finishLadder.map(step => step.key), 'one coverage per finish');
  const covered = days => coverageFor(cardView(releasedFor(days), { now }).finish.key);
  assert.deepEqual([6, 7, 29, 30, 89, 90, 179, 180, 364, 365].map(days => covered(days).key), ['none', 'frame', 'frame', 'art', 'art', 'card', 'card', 'gilded', 'gilded', 'border']);
  assert.deepEqual(['none', 'frame', 'art', 'card', 'gilded', 'border'].map(key => coverageLadder.find(step => step.key === key)).map(step => [step.frame, step.art, step.card, step.gilded, step.border]), [[0, 0, 0, false, false], [1, 0, 0, false, false], [1, 1, 0, false, false], [1, 1, 1, false, false], [1, 1, 1, true, false], [1, 1, 1, true, true]]);
  for (let i = 1; i < coverageLadder.length; i++) assert(coverageLadder[i].frame + coverageLadder[i].art + coverageLadder[i].card + Number(coverageLadder[i].gilded) + Number(coverageLadder[i].border) > coverageLadder[i - 1].frame + coverageLadder[i - 1].art + coverageLadder[i - 1].card + Number(coverageLadder[i - 1].gilded) + Number(coverageLadder[i - 1].border), 'coverage only grows');
  assert.equal(coverageFor('sparkle').key, 'none');
  assert.equal(coverageFor(cardView(card(), { now }).finish.key).key, 'none', 'an unreleased card has no foil');
});

test('the foil pattern and the art come from stable hashes of the Work Item and the theme, and a pull overrides the pattern', () => {
  assert.equal(stableHash('abc'), 0x1a47e90b, 'FNV-1a 32');
  assert.equal(stableHash(''), 0x811c9dc5);
  assert.equal(stableHash('Ünfold'), stableHash('Ünfold'));
  assert.notEqual(stableHash('a'), stableHash('b'));
  const view = cardView(card(), { now });
  assert.deepEqual(patternFor(view), patternFor(cardView(card(), { now })), 'the same card gets the same pattern on every render');
  assert.equal(patternFor(view).source, 'derived');
  assert(derivedPatterns.some(pattern => pattern.key === patternFor(view).key));
  assert.deepEqual(artFor(view), artFor(cardView(card(), { now })));
  assert.equal(seedFor(view), seedFor(cardView(card(), { now })));
  assert(seedFor(view) >= 0 && seedFor(view) < 1);
  const ids = Array.from({ length: 300 }, (_, index) => String(100 + index));
  const patterns = new Set(ids.map(id => patternFor({ id, style: { skin: 'forge' } }).key));
  const arts = new Set(ids.map(id => artFor({ id, style: { skin: 'forge' } }).key));
  assert.equal(patterns.size, derivedPatterns.length, 'every derived pattern is reachable');
  assert.equal(arts.size, artPresets.length, 'every art preset is reachable');
  assert(![...patterns].some(key => ['holo', 'reverse', 'cosmos'].includes(key)), 'a derived pattern draws on the frame and the art window');
  assert(ids.some(id => patternFor({ id, style: { skin: 'forge', theme: 'acme' } }).key !== patternFor({ id, style: { skin: 'forge', theme: null } }).key), 'a theme reshuffles the patterns');
  assert.deepEqual(patternFor({ ...view, foilPattern: 'holo' }), { key: 'holo', label: 'Holo', derived: false, source: 'pull' }, 'a pull assigns the pattern');
  assert.equal(patternFor({ ...view, foilPattern: 'sparkle' }).source, 'derived', 'an unknown pulled pattern falls back to the derived one');
});

test('the forge paints the same facts as every skin: demo cards spend nothing and unknown never reads as zero', () => {
  const demo = faceFacts(cardView(ploegDemo.cards['117']));
  assert.deepEqual(demo.coin, { top: 'COST', main: 'Demo', caption: '', status: 'demo' });
  assert.equal(demo.demoLine, 'Demo · no model calls · illustrative', 'the face says it is a demo');
  assert(demo.demo);
  assert(!JSON.stringify(demo).includes('US$'), 'a demo card paints no amount');
  const observed = faceFacts(cardView(card(), { now }));
  assert.deepEqual([observed.coin.top, observed.coin.main], ['US$', '0,58']);
  assert.equal(observed.sub, 'webgrip/glide · Round 2');
  assert.deepEqual(observed.rows.map(([label]) => label), ['Crew', 'Plays', 'Diff', 'Run time', 'Live']);
  assert.equal(observed.rows[2][1], '+214 −38 · 6 files');
  assert.equal(observed.grade, null);
  assert.deepEqual(observed.steward, { signed: true, name: 'ryan', detail: 'Merged the pull request' });
  const unknown = faceFacts(cardView(card({ totals: { costStatus: 'not_reported' }, plays: [{ number: 57, state: 'open' }], steward: null }), { now }));
  assert.deepEqual([unknown.coin.main, unknown.coin.caption], ['—', 'not reported']);
  assert.equal(unknown.rows[2][1], 'Not reported');
  assert.equal(unknown.steward.signed, false);
  assert(!/(^|\s)0(,00)?(\s|$)/.test(unknown.rows.map(([, text]) => text).join(' ')), 'no unknown value is painted as zero');
  const graded = faceFacts(cardView(card({ grade: { formula: '2026.1', overall: 10, provisional: false, subgrades: { reliability: 10, durability: 10, delivery: 10, review: 10 }, label: 'black', qualifiers: [] }, condition: { state: 'cracked', cracks: [{ id: 'c', severity: 'S1', bug: { ref: 'VIK-1' } }] } }), { now }));
  assert.deepEqual([graded.grade.text, graded.grade.word, graded.grade.subgrades], ['10', 'BLACK LABEL', 'REL 10 · DUR 10 · DEL 10 · REV 10']);
  assert.deepEqual(graded.condition, { state: 'cracked', label: 'Cracked', text: 'Cracked · VIK-1, S1' });
  assert.notEqual(factsSignature(observed), factsSignature(graded), 'a new grade repaints the face');
  assert.equal(factsSignature(observed), factsSignature(faceFacts(cardView(card(), { now }))), 'the same facts repaint nothing');
});

test('the forge front fills the required slots, escapes every value and draws without inline styles; the back is Vloer Native', () => {
  const hostile = card({ title: '<img src=x onerror=alert(1)>', steward: { name: '"><script>x</script>', source: 'merged_by' } });
  const view = cardView(hostile, { now });
  const front = render(view, helpers('front'));
  const back = render(view, helpers('back'));
  for (const slot of requiredSlots) assert.match(front, new RegExp(`data-slot="${slot}"`), slot);
  assert.match(front, /data-forge-stage/);
  assert.match(front, /data-card-action="flip"/);
  assert.match(front, /data-forge-action="turn"/);
  assert.match(front, new RegExp(`data-pattern="${patternFor(view).key}" data-pattern-source="derived" data-art="${artFor(view).key}"`));
  assert.equal((back.match(/role="tab"/g) || []).length, 10);
  for (const markup of [front, back]) {
    assert(!markup.includes('<img'), 'title is escaped');
    assert(!markup.includes('<script'), 'steward is escaped');
    assert(!/\sstyle=/.test(markup), 'no inline style attributes under the CSP');
    assert(!/<[^>]*\son[a-z]+=/.test(markup.replace(/"[^"]*"/g, '""')), 'no inline handlers');
  }
  assert.match(render(cardView(ploegDemo.cards['105']), helpers('front')), /aria-label="Cost: Demo · no model calls"/);
  assert.equal(typeof attach(null, view), 'function', 'attach without a stage is a no-op');
  assert(keepAliveMs >= 1000);
});

test('the forge manifest declares a WebGL2 skin with every finish and a Vloer Native fallback', () => {
  const manifest = validateManifest(JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8')), 'forge');
  assert.deepEqual([manifest.renderer, manifest.fallback, manifest.extends, manifest.script], ['webgl2', 'vloer-native', 'vloer-native', 'skin.js']);
  assert.deepEqual(manifest.finishes, finishLadder.map(step => step.key));
  const skin = readFileSync(new URL('skin.js', folder), 'utf8');
  assert.doesNotMatch(skin, /from '[^']*vendor\/three/, 'skin.js stays light: three.js loads only when a forge card attaches');
  assert.match(skin, /import\('\.\/engine\.js'\)/);
});

test('the shader libraries define every pattern and preset the catalogue names, as plain GLSL the host compiles', () => {
  for (const pattern of [...foilPatterns, { key: 'none' }]) assert.match(foils, new RegExp(`vec3 foil_${pattern.key}\\(FoilIn f\\)`), pattern.key);
  for (const preset of artPresets) assert.match(art, new RegExp(`vec3 art_${preset.key}\\(vec2 uv, float t\\)`), preset.key);
  for (const library of [prelude, foils, art]) {
    assert.doesNotMatch(library, /#version|\buniform\b|\bsampler2D\b|void main\s*\(/, 'libraries bring no version, uniforms, samplers or main of their own');
    assert.doesNotMatch(library, /`|\$\{/);
  }
  assert.match(prelude, /float hash12\(vec2 p\)/);
  const engine = readFileSync(new URL('engine.js', folder), 'utf8');
  const imports = [...engine.matchAll(/from '([^']+)'/g)].map(match => match[1]);
  assert(imports.every(path => path.startsWith('./') || path.startsWith('../../../vendor/three/')), 'the engine imports only its own files and the vendored three.js');
});

test('three.js is vendored unedited, pinned and loadable without an import map', () => {
  const vendor = new URL('../public/vendor/three/', import.meta.url);
  const pinned = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pinned.devDependencies.three, threeVersion);
  assert.equal(pinned.dependencies, undefined, 'no production npm dependency');
  assert.equal(readFileSync(new URL('VERSION', vendor), 'utf8').trim(), threeVersion);
  assert.match(readFileSync(new URL('LICENSE', vendor), 'utf8'), /The MIT License[\s\S]*three\.js authors/);
  assert.deepEqual(readdirSync(vendor).sort(), [...Object.values(vendoredFiles), 'LICENSE', 'VERSION'].sort());
  for (const name of Object.values(vendoredFiles)) {
    assert.match(name, /^[a-z0-9][a-z0-9-]*\.js$/, `${name} matches the static route`);
    const code = readFileSync(new URL(name, vendor), 'utf8');
    assert(code.startsWith(`// three.js ${threeVersion} (MIT`), name);
    for (const [, specifier] of code.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"\n]+)['"]/g)) {
      assert(specifier.startsWith('./'), `${name} imports ${specifier} relatively`);
      assert(Object.values(vendoredFiles).includes(specifier.slice(2)), `${name} imports a vendored file`);
    }
  }
});
