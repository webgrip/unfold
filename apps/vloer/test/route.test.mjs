import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHash, parseHash, redirect } from '../public/core/route.js';
import { createRegistry, findRoute } from '../public/core/registry.js';
import { views } from '../public/views/index.js';

test('a hash splits into its path and its query parameters, with or without the leading #', () => {
  assert.deepEqual(parseHash('#work?lane=queued&team=delivery'), { path: 'work', query: { lane: 'queued', team: 'delivery' } });
  assert.deepEqual(parseHash('work/105'), { path: 'work/105', query: {} });
  assert.deepEqual(parseHash('#runs?state=running&outcome='), { path: 'runs', query: { state: 'running', outcome: '' } });
  assert.deepEqual(parseHash('#activity?team=a%20b&kind=work'), { path: 'activity', query: { team: 'a b', kind: 'work' } });
  assert.deepEqual(parseHash(''), { path: '', query: {} });
  assert.deepEqual(parseHash(undefined), { path: '', query: {} });
  assert.deepEqual(parseHash('#?lane=x'), { path: '', query: { lane: 'x' } });
});

test('a hash is built from a path and its non-empty query parameters', () => {
  assert.equal(buildHash('work', { lane: 'needs_human', team: 'delivery' }), 'work?lane=needs_human&team=delivery');
  assert.equal(buildHash('work', { lane: '', team: null, other: undefined }), 'work');
  assert.equal(buildHash('insights', { window: '7d' }), 'insights?window=7d');
  assert.equal(buildHash('activity', { team: 'a b&c' }), 'activity?team=a+b%26c');
  assert.deepEqual(parseHash(buildHash('activity', { team: 'a b&c', kind: 'spend' })).query, { team: 'a b&c', kind: 'spend' });
  assert.equal(buildHash('runs'), 'runs');
});

test('every old link redirects permanently to its new home, and current links stay where they are', () => {
  const cases = [
    ['', 'now'], ['#', 'now'],
    ['#ploeg', 'insights'], ['#ploeg/overview', 'insights'], ['#ploeg/105', 'work/105'], ['#ploeg/lane/needs_human', 'work?lane=needs_human'],
    ['#ploeg/lane/queued', 'work?lane=queued'], ['#ploeg/work', 'work'], ['#ploeg/activity', 'activity'], ['#ploeg/runs', 'runs'], ['#ploeg/proposed', 'proposed'],
    ['#ploeg/something-else', 'insights'], ['#ploeg/0', 'insights'],
    ['#account', 'settings/accounts'], ['#system', 'settings/environment'], ['#settings', 'settings/preferences'],
    ['#compare/a/b', 'sessions'], ['#compare', 'sessions'],
  ];
  for (const [from, to] of cases) assert.equal(redirect(from), to, from);
  for (const current of ['#now', '#work', '#work/105', '#work?lane=queued', '#proposed', '#runs?state=running', '#activity', '#insights?window=7d', '#tasks', '#sessions', '#session/abc', '#settings/accounts', '#settings/environment', '#settings/preferences', '#design', '#nowhere']) assert.equal(redirect(current), null, current);
});

test('every redirect lands on a registered view', () => {
  const registry = createRegistry(views);
  for (const old of ['', '#ploeg', '#ploeg/105', '#ploeg/lane/leased', '#ploeg/work', '#ploeg/activity', '#ploeg/runs', '#ploeg/proposed', '#ploeg/overview', '#account', '#system', '#compare/a/b']) {
    const target = redirect(old);
    assert(findRoute(registry, parseHash(target).path), `${old} → ${target} has no view`);
  }
});

test('a Run link carries the Work Item and the Run id, and an old Ploeg Work Item link keeps both', () => {
  assert.deepEqual(parseHash('#work/105?run=14'), { path: 'work/105', query: { run: '14' } });
  assert.equal(buildHash('work/105', { run: '14' }), 'work/105?run=14');
  assert.deepEqual(parseHash(buildHash('work/105', { run: '14' })).query, { run: '14' });
  assert.equal(redirect('#ploeg/105?run=14'), 'work/105?run=14', 'an old Work Item link keeps its Run');
  assert.equal(redirect('#work/105?run=14'), null, 'a Run link needs no redirect');
});

