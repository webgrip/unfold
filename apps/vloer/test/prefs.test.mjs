import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createPrefs, prefDefaults, prefsKey, themeColors, validPref } from '../public/core/prefs.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => { data.set(key, String(value)); }, data };
}

test('preferences start at their defaults and keep what is set', () => {
  const storage = memoryStorage();
  const prefs = createPrefs(() => storage);
  assert.deepEqual(prefs.all(), { theme: 'system', density: 'comfortable', singleKeyShortcuts: true, live: true, notify: false, format: 'nl', lastVisit: null, team: null });
  assert.deepEqual(prefs.all(), { ...prefDefaults });
  assert.equal(prefs.set('theme', 'dark'), true);
  assert.equal(prefs.set('singleKeyShortcuts', false), true);
  assert.equal(prefs.set('team', 'delivery'), true);
  assert.equal(prefs.set('lastVisit', '2026-09-30T19:30:00.000Z'), true);
  assert.equal(prefs.get('theme'), 'dark');
  assert.equal(prefs.get('singleKeyShortcuts'), false);
  assert.deepEqual(JSON.parse(storage.data.get(prefsKey)), { theme: 'dark', singleKeyShortcuts: false, team: 'delivery', lastVisit: '2026-09-30T19:30:00.000Z' });
  assert.equal(createPrefs(() => storage).get('theme'), 'dark', 'another page reads the same storage');
});

test('invalid values and unknown keys are refused, and stored garbage falls back to the default', () => {
  const storage = memoryStorage({ [prefsKey]: JSON.stringify({ theme: 'purple', density: 'compact', live: 'yes', format: 'browser', lastVisit: 'not a date' }) });
  const prefs = createPrefs(() => storage);
  assert.equal(prefs.get('theme'), 'system');
  assert.equal(prefs.get('density'), 'compact');
  assert.equal(prefs.get('live'), true);
  assert.equal(prefs.get('format'), 'browser');
  assert.equal(prefs.get('lastVisit'), null);
  assert.equal(prefs.get('unknown'), undefined);
  for (const [key, value] of [['theme', 'purple'], ['density', 'tiny'], ['live', 1], ['singleKeyShortcuts', 'false'], ['format', 'en'], ['lastVisit', 'yesterday'], ['team', ''], ['team', 'x'.repeat(201)], ['nope', true]]) {
    assert.equal(prefs.set(key, value), false, `${key}=${value}`);
    assert.equal(validPref(key, value), false, `${key}=${value}`);
  }
  assert.equal(createPrefs(() => memoryStorage({ [prefsKey]: '[1,2]' })).get('theme'), 'system');
  assert.equal(createPrefs(() => memoryStorage({ [prefsKey]: '{not json' })).get('density'), 'comfortable');
});

test('preferences keep working in memory when localStorage throws or is missing', () => {
  const throwing = createPrefs(() => { throw new Error('SecurityError: access denied'); });
  assert.equal(throwing.get('theme'), 'system');
  assert.equal(throwing.set('theme', 'light'), true);
  assert.equal(throwing.get('theme'), 'light');
  const failingWrites = createPrefs(() => ({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } }));
  assert.equal(failingWrites.set('density', 'compact'), true);
  assert.equal(failingWrites.get('density'), 'compact');
  const missing = createPrefs(() => undefined);
  assert.equal(missing.set('live', false), true);
  assert.equal(missing.get('live'), false);
});

function bootTheme(stored) {
  const attributes = new Map();
  const metas = [{ attributes: new Map([['media', '(prefers-color-scheme: light)'], ['content', themeColors.light]]) }, { attributes: new Map([['media', '(prefers-color-scheme: dark)'], ['content', themeColors.dark]]) }];
  for (const meta of metas) meta.setAttribute = (name, value) => meta.attributes.set(name, value);
  const document = { documentElement: { setAttribute: (name, value) => attributes.set(name, value) }, querySelectorAll: () => metas };
  const localStorage = { getItem: key => { if (stored instanceof Error) throw stored; return key === prefsKey ? stored : null; } };
  runInNewContext(readFileSync(new URL('../public/core/theme.js', import.meta.url), 'utf8'), { window: { localStorage }, document });
  return { attributes: Object.fromEntries(attributes), colors: metas.map(meta => meta.attributes.get('content')) };
}

test('the blocking theme script applies the stored theme and density before first paint and never throws', () => {
  assert.deepEqual(bootTheme(JSON.stringify({ theme: 'dark', density: 'compact' })), { attributes: { 'data-theme': 'dark', 'data-density': 'compact' }, colors: [themeColors.dark, themeColors.dark] });
  assert.deepEqual(bootTheme(JSON.stringify({ theme: 'light' })), { attributes: { 'data-theme': 'light' }, colors: [themeColors.light, themeColors.light] });
  assert.deepEqual(bootTheme(JSON.stringify({ theme: 'system', density: 'comfortable' })), { attributes: {}, colors: [themeColors.light, themeColors.dark] });
  assert.deepEqual(bootTheme(JSON.stringify({ theme: '"><script>' })), { attributes: {}, colors: [themeColors.light, themeColors.dark] });
  assert.deepEqual(bootTheme(null), { attributes: {}, colors: [themeColors.light, themeColors.dark] });
  assert.deepEqual(bootTheme('{broken'), { attributes: {}, colors: [themeColors.light, themeColors.dark] });
  assert.deepEqual(bootTheme(new Error('SecurityError')), { attributes: {}, colors: [themeColors.light, themeColors.dark] });
  assert.match(readFileSync(new URL('../public/core/theme.js', import.meta.url), 'utf8'), new RegExp(`'${prefsKey.replace('.', '\\.')}'`), 'theme.js reads the same storage key as prefs.js');
});
