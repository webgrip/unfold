/** The card theme format version this runtime reads. */
export const themeSchemaVersion = 1;

/**
 * Every custom property a theme may set, with the kind of value it takes. A skin manifest's `themeTokens` names the
 * ones that skin reads; a token the runtime does not know is never set.
 */
export const tokenTypes = Object.freeze({
  '--gc-accent': 'color',
  '--gc-surface': 'color',
  '--gc-radius': 'length',
  '--forge-frame': 'color',
  '--forge-accent': 'color',
  '--forge-back': 'color',
});

/** What the designer calls each token. */
export const tokenLabels = Object.freeze({
  '--gc-accent': 'Accent',
  '--gc-surface': 'Card surface',
  '--gc-radius': 'Corner radius',
  '--forge-frame': 'Frame metal',
  '--forge-accent': 'Frame accent',
  '--forge-back': 'Card back glow',
});

/** The forge frames and what the designer calls them. */
export const frameLabels = Object.freeze({ classic: 'Classic', fullart: 'Full art', slab: 'Graded slab' });

const tokenPatterns = Object.freeze({ color: /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, length: /^(?:[0-9]|[12][0-9]|3[0-2])px$/ });
const themeId = /^[a-z0-9][a-z0-9-]{0,63}$/;
const assetId = /^[a-f0-9]{64}$/;
const cacheMs = 30_000;
const themes = new Map();
const shaders = new Map();

/** Whether `value` is a value the token `name` accepts: a hex colour, or a whole pixel length from 0 to 32. */
export function tokenAllowed(name, value) {
  const type = tokenTypes[name];
  return Boolean(type) && typeof value === 'string' && tokenPatterns[type].test(value);
}

/** Where the server serves a theme asset. */
export function assetUrl(id) {
  if (!assetId.test(String(id))) throw new Error('Invalid asset id');
  return `/api/card-assets/${id}`;
}

/**
 * Reads a theme by id from Vloer (`GET /api/card-themes/:id`), cached for 30 seconds per page. Answers null when the
 * id is not a theme name, the theme does not exist or Vloer cannot be reached, so a card without its theme still draws.
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export function loadTheme(id) {
  if (!themeId.test(String(id ?? ''))) return Promise.resolve(null);
  const cached = themes.get(id);
  if (cached && Date.now() - cached.at < cacheMs) return cached.theme;
  const theme = fetch(`/api/card-themes/${id}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : null)
    .then(data => data && typeof data === 'object' && data.schemaVersion === themeSchemaVersion && data.id === id ? data : null, () => null);
  themes.set(id, { at: Date.now(), theme });
  return theme;
}

/** Forgets cached themes, so the next card reads them again; the designer calls it after a save. */
export function forgetThemes() { themes.clear(); }

/** Reads a stored art shader's GLSL once per page. */
export function loadShader(id) {
  if (!assetId.test(String(id ?? ''))) return Promise.resolve(null);
  if (!shaders.has(id)) shaders.set(id, fetch(assetUrl(id), { credentials: 'same-origin' }).then(response => response.ok ? response.text() : null, () => null));
  return shaders.get(id);
}

/**
 * Sets a theme's tokens on the card element through the CSSOM, only those the drawn skin's manifest lists and only
 * with values the token accepts, and removes every other known token, so a theme change never leaves a stale colour.
 * @param {HTMLElement} host
 * @param {object | null} theme
 * @param {{ themeTokens?: readonly string[] } | null} manifest
 */
export function applyTokens(host, theme, manifest) {
  const listed = new Set(manifest?.themeTokens ?? []);
  const tokens = theme && typeof theme.tokens === 'object' && theme.tokens ? theme.tokens : {};
  for (const name of Object.keys(tokenTypes)) {
    const value = tokens[name];
    if (listed.has(name) && tokenAllowed(name, value)) host.style.setProperty(name, value);
    else host.style.removeProperty(name);
  }
}

/**
 * What a skin reads from a theme, after the runtime checked it against the drawn skin's manifest: the frame, the
 * default foil pattern, the art (a preset, a shader's GLSL or an uploaded image or video), the set symbol and card
 * back URLs, the tokens and the inner `world` (null when the theme shows its art). A field the skin does not draw, or a
 * value its manifest does not list, is null.
 * @param {object | null} theme A theme as `GET /api/card-themes/:id` returns it, or a designer draft.
 * @param {{ id: string, themeTokens?: readonly string[], theme?: object } | null} manifest
 * @param {{ shader?: (id: string) => Promise<string | null> }} [options]
 * @returns {Promise<object | null>}
 */
export async function themeView(theme, manifest, { shader = loadShader } = {}) {
  if (!theme || typeof theme !== 'object' || !manifest) return null;
  const allowed = manifest.theme ?? {};
  const listed = (list, value) => (Array.isArray(list) && list.includes(value) ? value : null);
  const tokens = Object.fromEntries((manifest.themeTokens ?? []).filter(name => tokenAllowed(name, theme.tokens?.[name])).map(name => [name, theme.tokens[name]]));
  const assets = theme.assets && typeof theme.assets === 'object' ? theme.assets : {};
  const media = id => (assetId.test(String(id ?? '')) ? { url: assetUrl(id), mediaType: String(assets[id]?.mediaType ?? '') } : null);
  let art = null;
  const kinds = allowed.art ?? [];
  if (theme.art?.preset && kinds.includes('preset')) art = listed(allowed.artPresets, theme.art.preset) ? { kind: 'preset', preset: theme.art.preset } : null;
  else if (theme.art?.shader && kinds.includes('shader')) {
    const code = typeof theme.art.code === 'string' ? theme.art.code : await shader(theme.art.shader);
    art = code ? { kind: 'shader', asset: theme.art.shader, code } : null;
  } else if (theme.art?.media && kinds.includes('media')) {
    const found = media(theme.art.media);
    art = found && /^(?:image|video)\//.test(found.mediaType) ? { kind: 'media', ...found, video: found.mediaType.startsWith('video/') } : null;
  }
  return Object.freeze({
    id: String(theme.id ?? ''),
    name: String(theme.name ?? ''),
    extends: String(theme.extends ?? ''),
    frame: listed(allowed.frames, theme.frame),
    foilPattern: listed(allowed.foilPatterns, theme.foilPattern),
    art,
    world: listed(allowed.worlds, theme.world),
    setSymbol: allowed.setSymbol ? media(theme.setSymbol)?.url ?? null : null,
    cardBack: allowed.cardBack ? media(theme.cardBack)?.url ?? null : null,
    tokens: Object.freeze(tokens),
  });
}
