import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTokens, assetUrl, themeView, tokenAllowed, tokenTypes } from '../public/cards/themes.js';
import { resolveSkin, validateManifest } from '../public/cards/registry.js';
import { cardView } from '../public/cards/card-model.js';
import { artFor, artPresets, factsSignature, faceFacts, fallbackArt, foilPatterns, frameFor, patternFor } from '../public/cards/skins/forge/forge-model.js';
import { frontShader } from '../public/cards/skins/forge/front-shader.js';
import { extractShader, checkArtSource as browserCheckArtSource } from '../public/cards/skins/forge/art-compiler.js';
import { tokenTypes as serverTokenTypes } from '../src/card-themes.ts';
import { checkArtSource } from '../src/card-assets.ts';
import { render } from '../public/cards/skins/forge/skin.js';
import { generateArt, maxRetries } from '../public/cards/art-generator.js';
import { sampleCard, themeDocument } from '../public/views/designer.js';

const manifest = id => validateManifest(JSON.parse(readFileSync(new URL(`../public/cards/skins/${id}/manifest.json`, import.meta.url), 'utf8')), id);
const forge = manifest('forge');
const native = manifest('vloer-native');
const asset = 'c'.repeat(64);
const helpers = { face: 'front', escape: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])), icon: name => `<svg data-icon="${name}"></svg>`, link: value => value };

function host() {
  const properties = new Map();
  return { properties, style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) } };
}

test('the server and the runtime agree on the theme tokens and the art shader rules', () => {
  const shader = 'vec3 art_custom(vec2 uv, float t) {\n  return vec3(uv, 0.5 + 0.5 * sin(t));\n}';
  assert.deepEqual(serverTokenTypes, tokenTypes);
  for (const code of [shader, '', '#version 300 es\n' + shader, `uniform float x;\n${shader}`, `${shader}\nvoid main() {}`, shader.replace('vec3(uv', 'texture(s, uv).rgb + vec3(uv'), `in float bad;\n${shader}`, 'vec3 art_other(vec2 uv, float t) { return vec3(0.0); }', `${shader}\n// café`, `/* uniform in a comment */\n${shader}`]) {
    assert.deepEqual(checkArtSource(code), browserCheckArtSource(code), code);
  }
  assert.deepEqual(checkArtSource(shader), []);
  assert.deepEqual(checkArtSource(`/* uniform in a comment */\n${shader}`), [], 'comments are not code');
  assert.match(checkArtSource(`uniform float x;\n${shader}`).join(' '), /declares a uniform/);
});

test('the forge manifest lists exactly the frames, patterns and presets the forge draws, and every token the runtime knows', () => {
  assert.deepEqual(forge.theme.frames, ['classic', 'fullart', 'slab']);
  assert.deepEqual(forge.theme.foilPatterns, foilPatterns.map(pattern => pattern.key));
  assert.deepEqual(forge.theme.artPresets, artPresets.map(preset => preset.key));
  assert.deepEqual(forge.theme.art, ['preset', 'shader', 'media']);
  assert.deepEqual([forge.theme.setSymbol, forge.theme.cardBack, forge.theme.soundBanks], [true, true, []]);
  assert.deepEqual([native.theme.frames, native.theme.art, native.theme.setSymbol], [[], [], false], 'Vloer Native takes tokens only');
  assert(forge.themeTokens.every(token => Object.hasOwn(tokenTypes, token)));
  const good = { id: 'x', name: 'X', version: '1.0.0', runtime: 1, stylesheet: 'skin.css', finishes: ['matte'] };
  for (const bad of [{ ...good, themeTokens: ['color'] }, { ...good, theme: { art: ['javascript'] } }, { ...good, theme: { frames: ['../x'] } }, { ...good, theme: { setSymbol: 'yes' } }, { ...good, theme: [] }]) assert.throws(() => validateManifest(bad, 'x'), JSON.stringify(bad));
});

test('a resolved theme picks the skin it extends; without one the card’s style decides', () => {
  assert.equal(resolveSkin({ skin: 'vloer-native' }, { extends: 'forge' }), 'forge');
  assert.equal(resolveSkin({ skin: 'forge' }, null), 'forge');
  assert.equal(resolveSkin({ skin: 'forge' }, { extends: 'https://evil.test/skin' }), 'vloer-native');
});

test('tokens reach the card element only when the drawn skin lists them and the value is a plain hex colour or pixel length', () => {
  assert.equal(tokenAllowed('--gc-accent', '#5b8cff'), true);
  for (const value of ['red', '#5b8cff; color: red', 'url(x)', 'var(--x)', '', null]) assert.equal(tokenAllowed('--gc-accent', value), false, value);
  assert.equal(tokenAllowed('--gc-radius', '40px'), false);
  const element = host();
  element.style.setProperty('--forge-back', '#000000');
  applyTokens(element, { tokens: { '--gc-accent': '#5b8cff', '--forge-frame': '#c0392b', '--gc-radius': 'calc(100% + 1px)', '--evil': '#fff' } }, native);
  assert.deepEqual([...element.properties], [['--gc-accent', '#5b8cff']], 'Vloer Native sets its own tokens only, and a stale token is removed');
  applyTokens(element, { tokens: { '--forge-frame': '#c0392b', '--gc-radius': '20px' } }, forge);
  assert.deepEqual(Object.fromEntries(element.properties), { '--gc-radius': '20px', '--forge-frame': '#c0392b' });
  applyTokens(element, null, forge);
  assert.equal(element.properties.size, 0);
});

test('the theme view keeps only what the drawn skin lists and resolves assets to Vloer URLs', async () => {
  const theme = { id: 'acme', name: 'Acme', extends: 'forge', tokens: { '--forge-frame': '#c0392b', '--gc-accent': 'red' }, frame: 'fullart', foilPattern: 'gold', art: { shader: asset }, setSymbol: asset, cardBack: 'https://evil.test/back.png', assets: { [asset]: { mediaType: 'image/svg+xml' } } };
  const view = await themeView(theme, forge, { shader: async id => (id === asset ? 'vec3 art_custom(vec2 uv, float t) { return vec3(uv, 0.0); }' : null) });
  assert.deepEqual({ ...view, art: { ...view.art } }, { id: 'acme', name: 'Acme', extends: 'forge', frame: 'fullart', foilPattern: 'gold', art: { kind: 'shader', asset, code: 'vec3 art_custom(vec2 uv, float t) { return vec3(uv, 0.0); }' }, world: null, setSymbol: `/api/card-assets/${asset}`, cardBack: null, tokens: { '--forge-frame': '#c0392b' } });
  assert.equal((await themeView({ ...theme, world: 'deepsea' }, forge)).world, 'deepsea', 'the forge lists its inner worlds');
  assert.equal((await themeView({ ...theme, world: 'moon' }, forge)).world, null, 'a world the manifest does not list is dropped');
  assert.equal((await themeView({ ...theme, world: 'islands' }, native)).world, null, 'Vloer Native draws no inner world');
  const plain = await themeView({ ...theme, frame: 'octagon', art: { media: asset }, assets: { [asset]: { mediaType: 'video/mp4' } } }, native);
  assert.deepEqual([plain.frame, plain.art, plain.setSymbol, plain.tokens], [null, null, null, {}], 'Vloer Native draws none of the forge’s fields');
  const media = await themeView({ ...theme, art: { media: asset }, assets: { [asset]: { mediaType: 'video/webm' } } }, forge);
  assert.deepEqual(media.art, { kind: 'media', url: `/api/card-assets/${asset}`, mediaType: 'video/webm', video: true });
  assert.equal(await themeView(null, forge), null);
  assert.throws(() => assetUrl('../../etc/passwd'), /Invalid asset id/);
});

test('the forge draws a theme’s frame, pattern and art, a pull still wins the pattern, and a broken shader falls back to a preset', async () => {
  const card = sampleCard('holo');
  const base = cardView(card);
  assert.deepEqual([frameFor(base), patternFor(base).source, artFor(base).source], ['classic', 'derived', 'derived']);
  const themed = { ...base, theme: await themeView({ id: 'acme', extends: 'forge', frame: 'slab', foilPattern: 'cosmos', art: { preset: 'koi' }, tokens: {} }, forge) };
  assert.equal(frameFor(themed), 'slab');
  assert.deepEqual([patternFor(themed).key, patternFor(themed).source], ['cosmos', 'theme']);
  assert.equal(artFor(themed).source, 'derived', 'an unknown preset is ignored');
  const preset = { ...base, theme: { ...themed.theme, art: { kind: 'preset', preset: 'warp' } } };
  assert.deepEqual([artFor(preset).key, artFor(preset).source], ['warp', 'theme']);
  assert.equal(patternFor({ ...themed, foilPattern: 'gold' }).key, 'gold', 'a pack pull overrides the theme pattern');
  const code = 'vec3 art_custom(vec2 uv, float t) { return vec3(uv, 0.0); }';
  const shaded = { ...base, theme: { ...themed.theme, art: { kind: 'shader', code } } };
  assert.deepEqual([artFor(shaded).key, artFor(shaded).code], ['custom', code]);
  assert.equal(fallbackArt(shaded).source, 'fallback');
  const facts = faceFacts(shaded);
  assert.equal(facts.frame, 'slab');
  assert.notEqual(factsSignature(facts), factsSignature(faceFacts(base)), 'a theme change repaints the card');
  assert.notEqual(factsSignature(faceFacts({ ...shaded, theme: { ...shaded.theme, art: { kind: 'shader', code: code.replace('0.0', '1.0') } } })), factsSignature(facts));
  const source = frontShader(artFor(shaded), 'cosmos');
  assert.match(source, /vec3 art_custom\(vec2 uv, float t\)[\s\S]*vec3 artC = art_custom\(artUv, uTime\);/);
  assert.match(frontShader({ key: 'media' }, 'cosmos'), /vec3 artC = texture\(uArtTex, artUv\)\.rgb;/);
  assert.doesNotMatch(frontShader({ key: 'warp' }, 'gold'), /art_custom/);
  const markup = render({ ...shaded, theme: { ...shaded.theme, id: 'acme"><script>' } }, helpers);
  assert.match(markup, /data-frame="slab" data-theme="acme&quot;&gt;&lt;script&gt;"/);
  assert.doesNotMatch(markup, /style=/);
});

test('the designer saves format v1 only, drops fields the skin does not draw, and previews a demo sample with no spend', () => {
  const rules = { themeTokens: native.themeTokens, theme: native.theme };
  const draft = { schemaVersion: 1, id: 'acme', name: 'Acme', extends: 'vloer-native', tokens: { '--gc-accent': '#123456', '--forge-frame': '#c0392b' }, frame: 'fullart', foilPattern: 'gold', art: { preset: 'warp' }, setSymbol: asset, cardBack: asset, soundBank: 'x', code: 'evil' };
  assert.deepEqual(themeDocument(draft, rules), { schemaVersion: 1, id: 'acme', name: 'Acme', extends: 'vloer-native', tokens: { '--gc-accent': '#123456' }, frame: null, foilPattern: null, art: null, world: null, setSymbol: null, cardBack: null, soundBank: null });
  assert.equal(themeDocument({ ...draft, extends: 'forge', world: 'city' }, { themeTokens: forge.themeTokens, theme: forge.theme }).world, 'city', 'a forge theme saves its inner world');
  const view = cardView(sampleCard('prism'));
  assert.equal(view.demo, true);
  assert.equal(view.finish.key, 'prism');
  assert.match(view.cost.text, /Demo · no model calls/);
});

test('generated art goes back to the model with the compiler log, at most twice, and never runs as JavaScript', async () => {
  const requests = [];
  const answers = ['broken one', 'broken two', 'good'];
  const outcome = await generateArt({
    prompt: 'koi',
    request: async input => { requests.push(input); return { code: answers[requests.length - 1], problems: [] }; },
    compile: code => (code === 'good' ? { ok: true } : { ok: false, log: `ERROR in ${code}` }),
  });
  assert.equal(maxRetries, 2);
  assert.deepEqual(outcome, { ok: true, code: 'good', attempts: 3 });
  assert.deepEqual(requests, [{ prompt: 'koi', attempt: 1 }, { prompt: 'koi', attempt: 2, compilerLog: 'ERROR in broken one' }, { prompt: 'koi', attempt: 3, compilerLog: 'ERROR in broken two' }]);
  const steps = [];
  const failed = await generateArt({ prompt: 'koi', request: async () => ({ code: 'still broken', problems: ['The shader declares a uniform.'] }), compile: () => { throw new Error('server problems skip the compiler'); }, onAttempt: step => steps.push(step) });
  assert.deepEqual([failed.ok, failed.attempts, failed.log, steps.length], [false, 3, 'The shader declares a uniform.', 3]);
  assert.equal(extractShader('text\n```glsl\nvec3 a;\n```'), 'vec3 a;');
});
