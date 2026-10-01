/** The localStorage key that holds every preference as one JSON object. core/theme.js reads the same key. */
export const prefsKey = 'vloer.prefs';

/** Each preference and its default. */
export const prefDefaults = Object.freeze({ theme: 'system', density: 'comfortable', singleKeyShortcuts: true, live: true, notify: false, format: 'nl', lastVisit: null, team: null, cardMotion: 'auto', cardSound: false });

const choices = { theme: ['system', 'light', 'dark'], density: ['comfortable', 'compact'], format: ['nl', 'browser'], cardMotion: ['auto', 'full', 'calm', 'off'] };

/** The browser theme colour for each theme: the colour of the top bar. */
export const themeColors = Object.freeze({ light: '#FFFFFF', dark: '#15191C' });

/** Whether `value` is allowed for the preference `key`. */
export function validPref(key, value) {
  if (!Object.hasOwn(prefDefaults, key)) return false;
  if (Object.hasOwn(choices, key)) return choices[key].includes(value);
  if (key === 'singleKeyShortcuts' || key === 'live' || key === 'notify' || key === 'cardSound') return typeof value === 'boolean';
  if (key === 'lastVisit') return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 200);
}

/**
 * Creates a preference store over `storage()` (localStorage by default). Every storage access is wrapped in
 * try/catch: when storage is missing, blocked or throws, preferences still work in memory for this page.
 * Unknown keys and invalid values fall back to the default on read and are refused on write. `subscribe` hears
 * this page's own writes; other tabs' writes arrive as `storage` events.
 */
export function createPrefs(storage = () => globalThis.localStorage) {
  const memory = {};
  const listeners = new Set();
  const stored = () => {
    try { const raw = storage()?.getItem(prefsKey); const value = raw ? JSON.parse(raw) : {}; return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return null; }
  };
  return {
    /** Returns the preference `key`, or its default. */
    get(key) {
      if (!Object.hasOwn(prefDefaults, key)) return undefined;
      const saved = stored();
      if (saved && Object.hasOwn(saved, key) && validPref(key, saved[key])) return saved[key];
      if (Object.hasOwn(memory, key)) return memory[key];
      return prefDefaults[key];
    },
    /** Stores the preference `key`; returns false and stores nothing for an unknown key or an invalid value. */
    set(key, value) {
      if (!validPref(key, value)) return false;
      memory[key] = value;
      try { const saved = stored() ?? {}; saved[key] = value; storage()?.setItem(prefsKey, JSON.stringify(saved)); } catch {}
      for (const listener of listeners) { try { listener(key, value); } catch {} }
      return true;
    },
    /** Calls `listener(key, value)` after this page stores a preference; returns an unsubscribe function. */
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    /** Every preference with its current value. */
    all() { return Object.fromEntries(Object.keys(prefDefaults).map(key => [key, this.get(key)])); },
  };
}

/** The preference store of this page. */
export const prefs = createPrefs();

/** Applies the theme and density preferences to `<html>` (data-theme, data-density) and the theme-color metas. */
export function applyAppearance(root = globalThis.document?.documentElement) {
  if (!root) return;
  const theme = prefs.get('theme');
  if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  if (prefs.get('density') === 'compact') root.setAttribute('data-density', 'compact'); else root.removeAttribute('data-density');
  for (const meta of root.ownerDocument.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = /dark/.test(meta.getAttribute('media') || '') ? 'dark' : 'light';
    meta.setAttribute('content', themeColors[theme === 'system' ? scheme : theme]);
  }
}
