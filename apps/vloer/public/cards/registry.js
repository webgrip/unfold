/** The card runtime's contract version. A skin pack's manifest names the one it was written for. */
export const runtimeVersion = 1;
/** The skin a card gets when its Work Target names none, or one this Vloer does not ship. */
export const defaultSkin = 'vloer-native';
/** The skin packs shipped in the image. P1 loads first-party skins only; custom code skins need an administrator's opt-in, which is not built. */
export const firstPartySkins = Object.freeze(['vloer-native']);
/** The slots every skin must fill on the front. The runtime adds what a skin leaves out. */
export const requiredSlots = Object.freeze(['title', 'state', 'cost', 'steward', 'ids']);

const skinName = /^[a-z0-9][a-z0-9-]{0,63}$/;
const fileName = /^[a-z0-9][a-z0-9-]*\.(?:css|js)$/;
const loaded = new Map();

/** The skin to load for a card's `style`: its `skin` when it is a shipped pack, otherwise the default. */
export function resolveSkin(style) {
  const id = style && typeof style.skin === 'string' ? style.skin : '';
  return skinName.test(id) && firstPartySkins.includes(id) ? id : defaultSkin;
}

/** Where a skin pack's files live. */
export function skinBase(id) {
  if (!skinName.test(id)) throw new Error('Invalid skin name');
  return `/cards/skins/${id}/`;
}

/**
 * Checks a skin pack's `manifest.json` and returns its normalized form. A pack names itself, its version, the runtime
 * version it targets, its stylesheet, an optional script and the finishes it draws; P1 accepts only `matte`.
 * @param {unknown} manifest
 * @param {string} id The pack's folder name, which the manifest must repeat.
 */
export function validateManifest(manifest, id) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Skin manifest must be an object');
  const { id: name, name: label, version, runtime, stylesheet, script = null, finishes } = manifest;
  if (name !== id) throw new Error('Skin manifest names another skin');
  if (typeof label !== 'string' || !label.trim()) throw new Error('Skin manifest needs a name');
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Skin manifest needs a semantic version');
  if (runtime !== runtimeVersion) throw new Error(`Skin targets card runtime ${runtime}, not ${runtimeVersion}`);
  if (typeof stylesheet !== 'string' || !fileName.test(stylesheet) || !stylesheet.endsWith('.css')) throw new Error('Skin manifest needs a stylesheet in its folder');
  if (script !== null && (typeof script !== 'string' || !fileName.test(script) || !script.endsWith('.js'))) throw new Error('Skin script must be a module in its folder');
  if (!Array.isArray(finishes) || !finishes.includes('matte')) throw new Error('Skin must draw the matte finish');
  return Object.freeze({ id, name: label.trim(), version, runtime, stylesheet, script, finishes: Object.freeze([...finishes]) });
}

/**
 * Loads a skin pack once: its manifest, its stylesheet URL and its `render`. A pack without a script borrows the
 * default skin's markup under its own stylesheet.
 * @param {string} id
 * @returns {Promise<{ manifest: object, stylesheet: string, render: Function }>}
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
        if (typeof render !== 'function') throw new Error(`Skin ${id} has no render function`);
        return Object.freeze({ manifest, stylesheet: `${base}${manifest.stylesheet}`, render });
      });
    pack.catch(() => loaded.delete(id));
    loaded.set(id, pack);
  }
  return loaded.get(id);
}
