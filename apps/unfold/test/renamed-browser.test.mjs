import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { renamedSkins, resolveSkin } from '../public/cards/registry.js';

test('the browser resolves a skin sent under its former name to the skin that replaced it', () => {
  for (const [former, current] of Object.entries(renamedSkins)) {
    assert.equal(resolveSkin({ skin: former }), current);
    assert.equal(resolveSkin({ skin: 'forge' }, { extends: former }), current);
  }
});

test('the browser moves preferences saved under the former prefix before the first paint and keeps newer ones', async () => {
  const source = await readFile(new URL('../public/core/theme.js', import.meta.url), 'utf8');
  const entries = new Map([['vloer.prefs', '{"theme":"dark"}'], ['vloer.nowSince', '2026-10-01'], ['unfold.nowSince', '2026-10-04'], ['other', 'x']]);
  const storage = {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); },
  };
  const attributes = new Map();
  runInNewContext(source, { window: { localStorage: storage }, document: { documentElement: { setAttribute: (name, value) => attributes.set(name, value) }, querySelectorAll: () => [] } });
  assert.deepEqual(Object.fromEntries(entries), { 'unfold.nowSince': '2026-10-04', other: 'x', 'unfold.prefs': '{"theme":"dark"}' });
  assert.equal(attributes.get('data-theme'), 'dark', 'the moved preference already applies to this page');
});
