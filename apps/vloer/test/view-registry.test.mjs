import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry, findRoute } from '../public/core/registry.js';
import { views } from '../public/views/index.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const scripts = directory => readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? scripts(path) : path.endsWith('.js') ? [path] : []; });
const named = attribute => new Set(scripts(publicDir).flatMap(path => [...readFileSync(path, 'utf8').matchAll(new RegExp(`${attribute}="([a-z][a-z-]*)"`, 'g'))].map(match => match[1])));
const noop = () => {};
const formsOfTheRemovedCompareDialog = new Set(['compare']);

test('the registered views build one registry with unique view ids', () => {
  const registry = createRegistry(views);
  assert.equal(registry.views.size, views.length);
  for (const id of ['login', 'now', 'sessions', 'session', 'compare', 'tasks', 'work', 'proposed', 'runs', 'activity', 'insights', 'ploeg-feeds', 'account', 'system', 'dialogs']) assert(registry.views.has(id), `no view ${id}`);
  assert.deepEqual(registry.pages.map(view => view.id), ['now', 'sessions', 'tasks', 'account', 'system']);
});

test('every data-action and data-form in the browser markup has exactly one handler, and every handler has markup', () => {
  const registry = createRegistry(views);
  const actions = named('data-action');
  const forms = named('data-form');
  assert.deepEqual([...actions].filter(name => !registry.actions.has(name)), [], 'buttons without a handler');
  assert.deepEqual([...forms].filter(name => !registry.forms.has(name)), [], 'forms without a handler');
  assert.deepEqual([...registry.actions.keys()].filter(name => !actions.has(name)), [], 'action handlers without markup');
  assert.deepEqual([...registry.forms.keys()].filter(name => !forms.has(name) && !formsOfTheRemovedCompareDialog.has(name)), [], 'form handlers without markup');
});

test('the compare view and dialog removed in e0ffac5 are still missing behind the compare route, action and form', () => {
  const compare = createRegistry(views).views.get('compare');
  assert.throws(() => compare.render(), { name: 'ReferenceError', message: 'renderCompare is not defined' });
  assert.throws(() => compare.actions.compare(), { name: 'ReferenceError', message: 'openCompareDialog is not defined' });
  assert(!named('data-form').has('compare'));
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
    ['now', 'now', {}], ['sessions', 'sessions', {}], ['tasks', 'tasks', {}], ['settings/accounts', 'account', {}], ['settings/environment', 'system', {}],
    ['work', 'work', {}], ['work/105', 'work', { id: '105' }], ['proposed', 'proposed', {}], ['runs', 'runs', {}], ['activity', 'activity', {}], ['insights', 'insights', {}],
    ['session/0f1e', 'session', { id: '0f1e' }], ['compare/a/b', 'compare', { left: 'a', right: 'b' }],
    ['nowhere', null], ['sessionsx', null], ['ploeg', null], ['ploeg/105', null], ['account', null], ['system', null], ['work/abc', null], ['work/0', null], ['workx', null], ['', null], ['login', null], ['dialogs', null], ['ploeg-feeds', null],
  ];
  for (const [hash, id, params] of cases) {
    const matches = registry.routes.filter(view => view.match(hash));
    assert(matches.length <= 1, `${hash} matches ${matches.map(view => view.id)}`);
    const found = findRoute(registry, hash);
    assert.equal(found?.view.id ?? null, id, hash);
    if (id) assert.deepEqual(found.params, params, hash);
  }
});
