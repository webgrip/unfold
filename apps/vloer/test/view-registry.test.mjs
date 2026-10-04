import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry, findRoute } from '../public/core/registry.js';
import { views } from '../public/views/index.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const scripts = directory => readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? scripts(path) : path.endsWith('.js') ? [path] : []; });
const builderKey = { 'data-action': 'action' };
const named = attribute => new Set(scripts(publicDir).flatMap(path => { const text = readFileSync(path, 'utf8'); return [...text.matchAll(new RegExp(`${attribute}="([a-z][a-z-]*)"`, 'g')), ...(builderKey[attribute] ? text.matchAll(new RegExp(`\\b${builderKey[attribute]}: '([a-z][a-z-]*)'`, 'g')) : [])].map(match => match[1]); }));
const noop = () => {};

test('the registered views build one registry with unique view ids', () => {
  const registry = createRegistry(views);
  assert.equal(registry.views.size, views.length);
  for (const id of ['login', 'now', 'sessions', 'session', 'tasks', 'work', 'proposed', 'runs', 'activity', 'insights', 'ploeg-feeds', 'account', 'system', 'preferences', 'card-identity', 'editors', 'editor-sign-in', 'binder', 'packs', 'season', 'palette', 'chrome', 'dialogs', 'designer']) assert(registry.views.has(id), `no view ${id}`);
  assert.deepEqual(registry.pages.map(view => view.id), ['now', 'sessions', 'tasks', 'account', 'system', 'preferences', 'designer']);
});

test('every data-action and data-form in the browser markup has exactly one handler, and every handler has markup', () => {
  const registry = createRegistry(views);
  const actions = named('data-action');
  const forms = named('data-form');
  assert.deepEqual([...actions].filter(name => !registry.actions.has(name)), [], 'buttons without a handler');
  assert.deepEqual([...forms].filter(name => !registry.forms.has(name)), [], 'forms without a handler');
  assert.deepEqual([...registry.actions.keys()].filter(name => !actions.has(name)), [], 'action handlers without markup');
  assert.deepEqual([...registry.forms.keys()].filter(name => !forms.has(name)), [], 'form handlers without markup');
});

test('Compare is gone: no view, action or form serves it, and core/route.js sends old links to Sessions', () => {
  const registry = createRegistry(views);
  assert.equal(registry.views.has('compare'), false);
  assert(!named('data-action').has('compare'));
  assert(!named('data-form').has('compare'));
  assert.equal(findRoute(registry, 'compare/a/b'), null);
});

test('two views cannot register the same action, form, field selector or id', () => {
  assert.throws(() => createRegistry([{ id: 'a', actions: { open: noop } }, { id: 'b', actions: { open: noop } }]), /action "open" is registered by both "a" and "b"/);
  assert.throws(() => createRegistry([{ id: 'a', forms: { login: noop } }, { id: 'b', forms: { login: noop } }]), /form "login" is registered by both "a" and "b"/);
  assert.throws(() => createRegistry([{ id: 'a', inputs: { '#search': noop } }, { id: 'b', inputs: { '#search': noop } }]), /input selector "#search"/);
  assert.throws(() => createRegistry([{ id: 'a', changes: { '#team': noop } }, { id: 'b', changes: { '#team': noop } }]), /change selector "#team"/);
  assert.throws(() => createRegistry([{ id: 'a' }, { id: 'a' }]), /share the id "a"/);
  assert.throws(() => createRegistry([...views, { id: 'intruder', actions: { new: noop } }]), /action "new" is registered by both "dialogs" and "intruder"/);
  assert.throws(() => createRegistry([...views, { id: 'intruder', forms: { 'task-import': noop } }]), /form "task-import" is registered by both "tasks" and "intruder"/);
  assert.doesNotThrow(() => createRegistry([{ id: 'a', inputs: { '#x': noop } }, { id: 'b', changes: { '#x': noop } }]));
});

test('a registry rejects malformed descriptors', () => {
  assert.throws(() => createRegistry([{ actions: {} }]), /string id/);
  assert.throws(() => createRegistry([{ id: 'a', actions: { open: 'not a function' } }]), /not a function/);
  assert.throws(() => createRegistry([{ id: 'a', keys: ['n'] }]), /key binding of "a" is not a function/);
  assert.throws(() => createRegistry([{ id: 'a', load: noop }]), /has load but is not a page/);
  assert.throws(() => createRegistry([{ id: 'a', match: () => ({}), enter: noop, load: noop }]), /has load but is not a page/);
});

test('every hash routes to at most one view with the params that view expects', () => {
  const registry = createRegistry(views);
  const cases = [
    ['now', 'now', {}], ['sessions', 'sessions', {}], ['tasks', 'tasks', {}], ['settings/accounts', 'account', {}], ['settings/environment', 'system', {}], ['settings/preferences', 'preferences', {}],
    ['work', 'work', {}], ['work/105', 'work', { id: '105' }], ['proposed', 'proposed', {}], ['runs', 'runs', {}], ['activity', 'activity', {}], ['insights', 'insights', {}],
    ['session/0f1e', 'session', { id: '0f1e' }], ['compare/a/b', null],
    ['binder', 'binder', {}], ['season', 'season', {}], ['settings/cards', 'card-identity', {}], ['settings/card-designer', 'designer', {}], ['settings/editors', 'editors', {}], ['editor-sign-in/AbC-12_xyz', 'editor-sign-in', { code: 'AbC-12_xyz' }], ['editor-sign-in/short', null], ['editor-sign-in', null], ['packs', 'packs', { page: 'shelf' }], ['packs/odds', 'packs', { page: 'odds' }], ['packs/2026-W40', 'packs', { page: 'pack', id: '2026-W40' }], ['packs/delivery~2026-09-28', 'packs', { page: 'pack', id: 'delivery~2026-09-28' }], ['packs/a/b', null], ['binderx', null],
    ['nowhere', null], ['sessionsx', null], ['ploeg', null], ['ploeg/105', null], ['account', null], ['system', null], ['work/abc', null], ['work/0', null], ['workx', null], ['', null], ['login', null], ['dialogs', null], ['ploeg-feeds', null], ['palette', null], ['chrome', null], ['settings', null],
  ];
  for (const [hash, id, params] of cases) {
    const matches = registry.routes.filter(view => view.match(hash));
    assert(matches.length <= 1, `${hash} matches ${matches.map(view => view.id)}`);
    const found = findRoute(registry, hash);
    assert.equal(found?.view.id ?? null, id, hash);
    if (id) assert.deepEqual(found.params, params, hash);
  }
});

test('the editor approval page asks its question in plain language, naming the workbench', async () => {
  const { editorQuestion } = await import('../public/views/editor-sign-in.js');
  assert.equal(editorQuestion({ workbench: 'vloer.example' }), 'A VS Code editor is asking to sign in to vloer.example as you.');
});
