import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { cardView } from '../public/cards/card-model.js';
import { validateManifest } from '../public/cards/registry.js';
import { faceFacts } from '../public/cards/skins/forge/forge-model.js';
import { frontShader } from '../public/cards/skins/forge/front-shader.js';
import { render } from '../public/cards/skins/forge/skin.js';
import { autoTimeOfDay, checkWorld, defaultWorld, lockedReason, objectUnlocked, shownWorld, skinWorld, themeWorld, timeUnlocked, worldFacts, worldObjects } from '../public/cards/skins/forge/world/rules.js';
import { panelMarkup, worldActionsMarkup, worldPanelMarkup } from '../public/cards/skins/forge/world/controls.js';
import { ploegDemo } from '../src/ploeg-demo.ts';
import * as server from '../src/card-worlds.ts';
import * as rules from '../public/cards/skins/forge/world/rules.js';
import { application, request } from './api-support.ts';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const helpers = face => ({ face, escape, icon: name => `<svg data-icon="${name}"></svg>`, link: () => '' });
const folder = new URL('../public/cards/skins/forge/world/', import.meta.url);
const demo = id => cardView(ploegDemo.cards[id]);
const fresh = { days: null, merged: false, condition: null };
const merged28 = { days: 28, merged: true, condition: null };
const decoration = (extra = {}) => ({ v: 1, kind: 'islands', tod: 'auto', weather: 'clear', objects: [{ t: 'tree', x: -0.9, z: -0.6, s: 0.25 }], ...extra });

test('the browser and the server read the same world rules: worlds, times of day, weathers, things, limits and the facts a card gives', () => {
  assert.deepEqual([...server.worldChoices], [...rules.worldChoices]);
  assert.deepEqual(server.timesOfDay.map(step => [step.key, step.days]), rules.timesOfDay.map(step => [step.key, step.days]));
  assert.deepEqual([...server.weathers], rules.weathers.map(entry => entry.key));
  assert.deepEqual(server.worldObjects.map(item => [item.type, item.unlock]), rules.worldObjects.map(item => [item.type, item.unlock]));
  assert.deepEqual({ objects: server.worldLimits.objects, x: [...server.worldLimits.x], z: [...server.worldLimits.z] }, { objects: rules.worldLimits.objects, x: [...rules.worldLimits.x], z: [...rules.worldLimits.z] });
  const now = Date.now();
  for (const demo of Object.values(ploegDemo.cards)) assert.deepEqual(rules.worldFacts(cardView(demo, { now })), server.worldFactsOf(demo, now), `card ${demo.workItemId}`);
  const inputs = [decoration(), decoration({ kind: 'city', tod: 'night' }), decoration({ objects: [{ t: 'koi', x: 0, z: 0, s: 0.5 }] }), decoration({ objects: [{ t: 'windmill', x: 0, z: 0, s: 0.5 }] }), decoration({ objects: [{ t: 'tree', x: 9, z: 0, s: 0.5 }] }), decoration({ weather: 'hail' }), decoration({ extra: 1 }), decoration({ tod: 'morning' }), null, []];
  for (const facts of [fresh, merged28, { days: 400, merged: true, condition: 'mended' }]) {
    for (const input of inputs) {
      let fromServer = 'refused';
      let fromBrowser = 'refused';
      try { fromServer = server.validateWorld(input, facts); } catch { fromServer = 'refused'; }
      try { fromBrowser = rules.checkWorld(input, facts); } catch { fromBrowser = 'refused'; }
      assert.deepEqual(fromBrowser, fromServer, `${JSON.stringify(input)} with ${JSON.stringify(facts)}`);
    }
  }
});

test('a card’s world follows its facts: dawn and the starter things before release, then the time of day and the things it earned', () => {
  const drafting = worldFacts(demo('105'));
  assert.deepEqual(drafting, { days: null, merged: false, condition: null }, 'a card in review has no facts yet');
  assert.equal(autoTimeOfDay(drafting), 'dawn');
  assert.deepEqual(defaultWorld('islands', drafting, 0.4).objects.map(item => item.t), ['tree', 'tree', 'tree', 'crystal', 'lantern'], 'the starter things only');
  const foil = worldFacts(demo('117'));
  assert.deepEqual([foil.merged, autoTimeOfDay(foil)], [true, 'morning']);
  assert(defaultWorld('islands', foil, 0.4).objects.some(item => item.t === 'windmill'), 'a merged card earns the windmill');
  const cracked = worldFacts(demo('119'));
  assert.deepEqual([cracked.condition, autoTimeOfDay(cracked), objectUnlocked('koi', cracked)], ['cracked', 'sunset', false]);
  const mended = worldFacts(demo('120'));
  assert.deepEqual([mended.condition, autoTimeOfDay(mended), objectUnlocked('koi', mended), objectUnlocked('lighthouse', mended)], ['mended', 'golden', true, true]);
  assert(defaultWorld('islands', mended, 0.4).objects.some(item => item.t === 'lighthouse'), 'a proven card’s islands get their lighthouse');
  const year = worldFacts(demo('122'));
  assert.deepEqual([autoTimeOfDay(year), timeUnlocked('night', year), timeUnlocked('night', mended)], ['night', true, false], 'the night sky and its aurora wait for a year live');
  assert.equal(lockedReason('lighthouse', foil), 'Unlocks at 180 days live');
  assert.equal(lockedReason('crystal', drafting), '');
  assert.deepEqual(worldObjects.map(item => item.type), ['crystal', 'lantern', 'tree', 'windmill', 'lighthouse', 'koi']);
});

test('the default world is the same on every page, and a theme decides whether a card has one', () => {
  const facts = worldFacts(demo('123'));
  assert.deepEqual(defaultWorld('islands', facts, 0.42), defaultWorld('islands', facts, 0.42));
  assert.notDeepEqual(defaultWorld('islands', facts, 0.42).objects.map(item => item.s), defaultWorld('islands', facts, 0.43).objects.map(item => item.s), 'the seeds come from the card');
  assert.deepEqual(defaultWorld('deepsea', facts, 0.1).objects.map(item => item.t), ['crystal', 'crystal'], 'the koi pond waits for a mend');
  assert.equal(defaultWorld('off', facts, 0.1).kind, 'off');
  const view = demo('123');
  assert.equal(themeWorld(view), skinWorld, 'a forge card without a theme shows the skin’s world');
  assert.equal(themeWorld({ ...view, theme: { id: 'acme', world: null } }), 'off', 'an existing theme without a world keeps its art');
  assert.equal(themeWorld({ ...view, theme: { id: 'acme', world: 'city' } }), 'city');
  const facts117 = faceFacts(demo('117'));
  assert.deepEqual([facts117.worldKind, facts117.worldFacts.merged], ['islands', true], 'the forge’s face facts carry the world');
  assert.deepEqual(checkWorld({ kind: 'city', tod: 'auto', weather: 'rain', objects: [] }, facts), { v: 1, kind: 'city', tod: 'auto', weather: 'rain', objects: [] });
  assert.throws(() => checkWorld({ kind: 'city', tod: 'night', weather: 'rain', objects: [] }, facts), /365 days live/);
  assert.equal(shownWorld({ kind: 'islands', tod: 'night', weather: 'clear', objects: [] }, facts).tod, 'auto');
});

test('the world’s controls are markup the CSP allows, hidden until the forge gives the card a world, with locked things saying why', () => {
  const front = render(demo('117'), helpers('front'));
  assert.match(front, /data-forge-action="flat"[^>]*aria-keyshortcuts="F" hidden>Flatten art</);
  assert.match(front, /data-forge-action="decorate"[^>]*hidden>Decorate</);
  assert.match(front, /<section class="forge-decor"[^>]*hidden><\/section>/);
  assert.match(front, /data-world-description/);
  assert.match(front, /aria-live="polite" data-world-announce/);
  const facts = worldFacts(demo('117'));
  const panel = panelMarkup({ kind: 'islands', tod: 'auto', weather: 'clear', objects: [] }, facts, { tool: 'crystal', status: '', demo: true, count: 0 });
  for (const markup of [front, panel, worldActionsMarkup(), worldPanelMarkup()]) {
    assert(!/\sstyle=/.test(markup), 'no inline style attributes under the CSP');
    assert(!/<[^>]*\son[a-z]+=/.test(markup.replace(/"[^"]*"/g, '""')), 'no inline handlers');
  }
  assert.match(panel, /data-decor-tool="crystal" aria-pressed="true">Crystal</);
  assert.match(panel, /data-decor-tool="windmill" aria-pressed="false">Windmill</, 'a merged card’s windmill is open');
  assert.match(panel, /data-decor-tool="lighthouse" aria-pressed="false" disabled aria-describedby="forge-why-lighthouse">Lighthouse<span class="forge-chip-why" id="forge-why-lighthouse">Unlocks at 180 days live<\/span>/);
  assert.match(panel, /<option value="morning">Morning<\/option>/);
  assert.match(panel, /<option value="noon" disabled>Noon · at 30 days live<\/option>/);
  assert.match(panel, /Only you see how you decorate your copy\. It never changes the grade, the finish, pulls or odds\. Demo card · illustrative\./);
  const off = panelMarkup({ kind: 'off', tod: 'auto', weather: 'clear', objects: [] }, facts, { tool: null, status: '', demo: false, count: 0 });
  assert.match(off, /data-decor-field="tod" disabled/, 'with the world off only the world choice is open');
});

test('the front shader draws a world from its render target: tone-mapped, posterized toward flat, under a subdued foil, without the preset library', () => {
  const world = frontShader({ key: 'world' }, 'holo');
  assert.match(world, /uniform float uFlat;/);
  assert.match(world, /vec2 artUv = clamp\(auv, 0\.0, 1\.0\);\s*vec3 artC = worldArt\(artUv, Vd\);/);
  assert.match(world, /c = c \/ \(1\.0 \+ c \* 0\.18\);/);
  assert.match(world, /mix\(c, mix\(c, poster, 0\.55\), uFlat\)/);
  assert.match(world, /col = mix\(col, mix\(base, col, 0\.22\), m\.r\);/);
  assert.doesNotMatch(world, /vec3 art_nebula\(/, 'a world’s shader leaves the preset library out');
  const art = frontShader({ key: 'nebula' }, 'holo');
  assert.doesNotMatch(art, /uFlat|worldArt|mix\(base, col, 0\.22\)/, 'a card without a world compiles as before');
  assert.match(art, /vec3 artC = art_nebula\(artUv, uTime\);/);
});

test('the forge manifest lists its worlds, and the world modules import only each other, the vendored three.js and Vloer’s API helper', () => {
  const manifest = validateManifest(JSON.parse(readFileSync(new URL('../manifest.json', folder), 'utf8')), 'forge');
  assert.deepEqual(manifest.theme.worlds, ['islands', 'deepsea', 'city']);
  const files = readdirSync(folder).filter(name => name.endsWith('.js')).sort();
  assert.deepEqual(files, ['controls.js', 'index.js', 'kit.js', 'objects.js', 'particles.js', 'rules.js', 'sky.js', 'storage.js', 'worlds.js']);
  for (const name of files) {
    const code = readFileSync(new URL(name, folder), 'utf8');
    for (const [, specifier] of code.matchAll(/from '([^']+)'/g)) assert(specifier.startsWith('./') || specifier === '../../../../vendor/three/three-module.js' || specifier === '../../../../core/api.js', `${name} imports ${specifier}`);
    assert.doesNotMatch(code, /\beval\(|new Function|innerHTML\s*=(?!\s*panelMarkup\()/, `${name} builds no code, and markup only through the escaping panelMarkup`);
  }
  for (const name of ['rules.js', 'controls.js', 'storage.js']) assert.doesNotMatch(readFileSync(new URL(name, folder), 'utf8'), /vendor\/three/, `${name} stays light enough for skin.js to import statically`);
});

test('the world modules are served from the forge’s world folder and nowhere deeper', async t => {
  const api = await application('demo');
  t.after(() => api.close());
  for (const path of ['/cards/skins/forge/world/index.js', '/cards/skins/forge/world/rules.js', '/cards/skins/forge/world/controls.js']) {
    const answer = await request(api.url, path);
    assert.equal(answer.status, 200, path);
    assert.match(answer.response.headers.get('content-type') ?? '', /text\/javascript/);
  }
  for (const path of ['/cards/skins/forge/world/a/b.js', '/cards/skins/forge/scenes/index.js', '/cards/skins/forge/world/../../../../package.json', '/cards/world/index.js']) assert.equal((await request(api.url, path)).status, 404, path);
});
