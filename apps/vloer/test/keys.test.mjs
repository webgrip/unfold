import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGlobalKeys, isTyping, keyLabel, shortcuts, shortcutsMarkup } from '../public/core/keys.js';
import { createRegistry, findRoute } from '../public/core/registry.js';
import { views } from '../public/views/index.js';

const key = (value, extra = {}) => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, target: null, prevented: false, preventDefault() { this.prevented = true; }, ...extra });

test('the shortcut table is unique, routes every g chord to a registered page and binds nothing that approves, rejects or cancels', () => {
  const registry = createRegistry(views);
  const combos = shortcuts.map(entry => entry.keys.join(' '));
  assert.equal(new Set(combos).size, combos.length, 'two shortcuts share keys');
  assert.equal(new Set(shortcuts.map(entry => entry.id)).size, shortcuts.length);
  const chords = shortcuts.filter(entry => entry.keys[0] === 'g');
  assert.deepEqual(chords.map(entry => entry.keys[1]), ['n', 'w', 'p', 'r', 'a', 'i', 't', 's']);
  for (const entry of chords) {
    assert.equal(entry.single, true);
    assert(findRoute(registry, entry.route), `g ${entry.keys[1]} goes to ${entry.route}, which no view serves`);
  }
  for (const entry of shortcuts) {
    assert(entry.label && entry.group, entry.id);
    assert.equal(entry.single === true, entry.keys.every(part => part.length === 1), `${entry.id}: character-only shortcuts are marked single`);
    assert.doesNotMatch(entry.label, /approve|reject|cancel/i, `${entry.id} must not decide anything`);
  }
  assert.deepEqual(shortcuts.filter(entry => entry.proposed).map(entry => entry.id), ['open-link']);
});

test('? opens the help, / and Mod K open the palette, and g then a letter navigates', () => {
  const dispatched = [];
  const navigated = [];
  let help = 0;
  let clock = 0;
  const keys = createGlobalKeys({ dispatch: name => dispatched.push(name), navigate: route => navigated.push(route), openHelp: () => { help++; }, allowed: () => true, now: () => clock });
  assert.equal(keys(key('?', { shiftKey: true })), true);
  assert.equal(help, 1);
  assert.equal(keys(key('/')), true);
  assert.equal(keys(key('k', { ctrlKey: true })), true);
  assert.equal(keys(key('K', { metaKey: true })), true);
  assert.deepEqual(dispatched, ['palette-open', 'palette-open', 'palette-open']);
  const first = key('g');
  assert.equal(keys(first), true);
  assert.equal(first.prevented, true);
  assert.equal(keys(key('w')), true);
  assert.deepEqual(navigated, ['work']);
  keys(key('g'));
  clock += 2000;
  assert.equal(keys(key('w')), false, 'a chord expires after 1.5 seconds');
  keys(key('g'));
  assert.equal(keys(key('x')), false, 'an unknown second key falls through');
  assert.equal(keys(key('n')), false, 'the chord ended with the unknown key');
  assert.equal(keys(key('j')), false, 'list keys belong to the views');
  assert.equal(keys(key('k', { ctrlKey: true, shiftKey: true })), false);
  assert.equal(keys(key('?', { defaultPrevented: true })), false);
  assert.deepEqual(navigated, ['work']);
});

test('character shortcuts obey the single-key preference, while Mod K always works', () => {
  const dispatched = [];
  const keys = createGlobalKeys({ dispatch: name => dispatched.push(name), navigate: () => assert.fail('navigated'), openHelp: () => assert.fail('opened help'), allowed: () => false });
  for (const value of ['?', '/', 'g']) assert.equal(keys(key(value)), false, value);
  assert.equal(keys(key('n')), false);
  assert.equal(keys(key('k', { ctrlKey: true })), true);
  assert.deepEqual(dispatched, ['palette-open']);
});

test('text fields keep their characters, while checkboxes and buttons do not count as typing', () => {
  const element = (tag, type) => ({ closest: selector => { const tags = selector.split(',').map(part => part.trim()); if (tags.includes(tag)) return { getAttribute: () => type ?? null }; return null; } });
  assert.equal(isTyping(element('textarea')), true);
  assert.equal(isTyping(element('select')), true);
  assert.equal(isTyping(element('input', 'search')), true);
  assert.equal(isTyping(element('input')), true);
  assert.equal(isTyping(element('input', 'checkbox')), false);
  assert.equal(isTyping(element('input', 'radio')), false);
  assert.equal(isTyping(element('button')), false);
  assert.equal(isTyping(null), false);
});

test('the help dialog lists every shortcut, labels the proposed one and names Mod per platform', () => {
  const mac = shortcutsMarkup({ mac: true, singleKeys: true });
  const other = shortcutsMarkup({ mac: false, singleKeys: false });
  assert.match(mac, /<kbd>⌘<\/kbd><kbd>K<\/kbd>/);
  assert.match(other, /<kbd>Ctrl<\/kbd><kbd>K<\/kbd>/);
  assert.match(mac, /<kbd>g<\/kbd><span class="shortcut-then">then<\/span><kbd>w<\/kbd>/);
  assert.match(mac, /id="shortcuts-title">Keyboard shortcuts</);
  assert.match(mac, /data-pref="singleKeyShortcuts" checked/);
  assert.doesNotMatch(other, /data-pref="singleKeyShortcuts" checked/);
  assert.match(mac, /Open the pull request or tracker item of the focused row <span class="shortcut-proposed">Proposed<\/span>/);
  for (const entry of shortcuts) assert(mac.includes(entry.label.replaceAll('’', '’')), entry.id);
  assert.equal(keyLabel('Mod', true), '⌘');
  assert.equal(keyLabel('Mod', false), 'Ctrl');
  assert.equal(keyLabel('Esc'), 'Esc');
});
