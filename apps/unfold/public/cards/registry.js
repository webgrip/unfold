import { finishLadder } from './card-model.js';
import { tokenTypes } from './themes.js';

/** The card runtime's contract version. A skin pack's manifest names the one it was written for. */
export const runtimeVersion = 1;
/** The skin a card gets when its Work Target names none, or one this Unfold does not ship. */
export const defaultSkin = 'unfold-native';
/** Skin names that Ploeg and saved card themes still send from before the product was named Unfold, with the skin that replaced each. */
export const renamedSkins = Object.freeze({ 'vloer-native': 'unfold-native' });
/** The skin packs shipped in the image. P1 loads first-party skins only; custom code skins need an administrator's opt-in, which is not built. */
export const firstPartySkins = Object.freeze(['unfold-native', 'forge', 'holo', 'loot', 'arcade', 'ticker', 'patch']);
/** How a skin draws: `dom` with markup and CSS, or `webgl2` in a canvas, which needs a fallback pack for browsers without WebGL2. */
export const renderers = Object.freeze(['dom', 'webgl2']);
/** The slots every skin must fill on the front. The runtime adds what a skin leaves out. */
export const requiredSlots = Object.freeze(['title', 'state', 'cost', 'steward', 'ids']);

const skinName = /^[a-z0-9][a-z0-9-]{0,63}$/;
const themeLists = Object.freeze(['frames', 'foilPatterns', 'artPresets', 'art', 'worlds', 'soundBanks']);
const artKinds = Object.freeze(['preset', 'shader', 'media']);
const listItem = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const fileName = /^[a-z0-9][a-z0-9-]*\.(?:css|js)$/;
const loaded = new Map();

/**
 * The skin to load for a card: the skin its resolved theme `extends` when it has one, otherwise its `style.skin`, and
 * the default when neither names a shipped pack.
 * @param {{ skin?: string } | null | undefined} style
 * @param {{ extends?: string } | null} [theme]
 */
export function resolveSkin(style, theme = null) {
  const named = theme && typeof theme.extends === 'string' ? theme.extends : style && typeof style.skin === 'string' ? style.skin : '';
  const id = renamedSkins[named] ?? named;
  return skinName.test(id) && firstPartySkins.includes(id) ? id : defaultSkin;
}

function themeSection(value) {
  if (value === undefined || value === null) return Object.freeze({ frames: Object.freeze([]), foilPatterns: Object.freeze([]), artPresets: Object.freeze([]), art: Object.freeze([]), worlds: Object.freeze([]), soundBanks: Object.freeze([]), setSymbol: false, cardBack: false });
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Skin theme section must be an object');
  const lists = {};
  for (const key of themeLists) {
    const list = value[key] ?? [];
    if (!Array.isArray(list) || list.length > 64 || !list.every(item => typeof item === 'string' && listItem.test(item)) || new Set(list).size !== list.length) throw new Error(`Skin theme ${key} must list unique names`);
    lists[key] = Object.freeze([...list]);
  }
  if (!lists.art.every(kind => artKinds.includes(kind))) throw new Error('Skin theme names an art kind the card runtime does not know');
  for (const key of ['setSymbol', 'cardBack']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`Skin theme ${key} must be true or false`);
  return Object.freeze({ ...lists, setSymbol: value.setSymbol === true, cardBack: value.cardBack === true });
}

/** Where a skin pack's files live. */
export function skinBase(id) {
  if (!skinName.test(id)) throw new Error('Invalid skin name');
  return new URL(`./skins/${id}/`, import.meta.url).href;
}

/**
 * Checks a skin pack's `manifest.json` and returns its normalized form. A pack names itself, its version, the runtime
 * version it targets, its stylesheet, an optional script and the finishes it draws. Every pack draws `matte`; a card
 * whose finish the pack does not list is drawn matte. `themeTokens` lists the custom properties a theme may set, and
 * the optional `theme` section lists what else a theme may choose for this skin: frames, foil patterns, art presets,
 * art kinds, inner worlds, sound banks, and whether it draws a set symbol and a card back.
 * @param {unknown} manifest
 * @param {string} id The pack's folder name, which the manifest must repeat.
 */
export function validateManifest(manifest, id) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Skin manifest must be an object');
  const { id: name, name: label, version, runtime, stylesheet, script = null, finishes, renderer = 'dom', fallback = null, extends: parent = null, themeTokens = [], theme } = manifest;
  if (name !== id) throw new Error('Skin manifest names another skin');
  if (typeof label !== 'string' || !label.trim()) throw new Error('Skin manifest needs a name');
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Skin manifest needs a semantic version');
  if (runtime !== runtimeVersion) throw new Error(`Skin targets card runtime ${runtime}, not ${runtimeVersion}`);
  if (typeof stylesheet !== 'string' || !fileName.test(stylesheet) || !stylesheet.endsWith('.css')) throw new Error('Skin manifest needs a stylesheet in its folder');
  if (script !== null && (typeof script !== 'string' || !fileName.test(script) || !script.endsWith('.js'))) throw new Error('Skin script must be a module in its folder');
  if (!Array.isArray(finishes) || !finishes.includes('matte')) throw new Error('Skin must draw the matte finish');
  if (!finishes.every(finish => finishLadder.some(step => step.key === finish))) throw new Error('Skin names a finish the card runtime does not know');
  if (!renderers.includes(renderer)) throw new Error('Skin names a renderer the card runtime does not know');
  for (const other of [fallback, parent]) if (other !== null && (typeof other !== 'string' || !skinName.test(other) || other === id || !firstPartySkins.includes(other))) throw new Error('Skin falls back to or extends a skin this Unfold does not ship');
  if (renderer === 'webgl2' && fallback === null) throw new Error('A WebGL2 skin needs a fallback skin');
  if (!Array.isArray(themeTokens) || !themeTokens.every(token => Object.hasOwn(tokenTypes, token))) throw new Error('Skin lists a theme token the card runtime does not know');
  return Object.freeze({ id, name: label.trim(), version, runtime, stylesheet, script, finishes: Object.freeze([...finishes]), renderer, fallback, extends: parent, themeTokens: Object.freeze([...new Set(themeTokens)]), theme: themeSection(theme) });
}

/**
 * Loads a skin pack once: its manifest, its stylesheet URLs, its `render`, its optional `attach(frontFace, view)`,
 * which lights the drawn front and returns a cleanup function, and its optional `onMoment(moment, api)`, which plays
 * the effects director's reaction on the card. A pack without a script borrows the default skin's markup, lighting
 * and reactions under its own stylesheet. A pack that `extends` another links that pack's stylesheet before its own,
 * so it can borrow its markup.
 * @param {string} id
 * @returns {Promise<{ manifest: object, stylesheet: string, stylesheets: string[], render: Function, attach: Function | null, onMoment: Function | null }>}
 */
export function loadSkin(id) {
  if (!loaded.has(id)) {
    const base = skinBase(id);
    const pack = fetch(`${base}manifest.json`, { credentials: 'same-origin' })
      .then(response => { if (!response.ok) throw new Error(`Skin ${id} is not available`); return response.json(); })
      .then(async data => {
        const manifest = validateManifest(data, id);
        const module = manifest.script ? await import(`${base}${manifest.script}`) : id === defaultSkin ? null : await loadSkin(defaultSkin);
        const render = manifest.script ? module.render : module?.render;
        const attach = manifest.script ? module.attach : module?.attach;
        const onMoment = manifest.script ? module.onMoment : module?.onMoment;
        if (typeof render !== 'function') throw new Error(`Skin ${id} has no render function`);
        const parent = manifest.extends ? await loadSkin(manifest.extends) : null;
        const stylesheet = `${base}${manifest.stylesheet}`;
        return Object.freeze({ manifest, stylesheet, stylesheets: Object.freeze([...(parent?.stylesheets ?? []), stylesheet]), render, attach: typeof attach === 'function' ? attach : null, onMoment: typeof onMoment === 'function' ? onMoment : null });
      });
    pack.catch(() => loaded.delete(id));
    loaded.set(id, pack);
  }
  return loaded.get(id);
}

let webgl;

/**
 * Whether this browser can draw a WebGL2 skin: `hardware`, `software` (a software rasteriser such as SwiftShader,
 * which a skin should draw as a still frame) or `none`. The probe runs once per page and releases its context.
 * @returns {'hardware' | 'software' | 'none'}
 */
export function webglSupport() {
  if (webgl) return webgl;
  webgl = 'none';
  try {
    const probe = canvas => canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ?? null;
    const plain = canvas => canvas.getContext('webgl2') ?? null;
    const release = gl => gl?.getExtension('WEBGL_lose_context')?.loseContext();
    const software = gl => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)));
    const fast = probe(document.createElement('canvas'));
    if (fast) { webgl = software(fast) ? 'software' : 'hardware'; release(fast); }
    else { const slow = plain(document.createElement('canvas')); if (slow) { webgl = 'software'; release(slow); } }
  } catch { webgl = 'none'; }
  return webgl;
}
