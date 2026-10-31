import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import {
  fillCount,
  filterSearch,
  matchesFilter,
  parseFilter,
  withChange,
} from './feature-filter.ts';

describe('feature filter state', () => {
  test('reads the audience and category from the query', () => {
    assert.deepEqual(parseFilter('?for=platform&category=security'), {
      audience: 'platform',
      category: 'security',
    });
  });

  test('ignores values it does not know, so a bad link shows everything', () => {
    assert.deepEqual(parseFilter('?for=cfo&category=<script>'), { audience: null, category: null });
    assert.deepEqual(parseFilter(''), { audience: null, category: null });
  });

  test('writes back a query that parses to the same state', () => {
    const state = { audience: 'agencies', category: 'cost' } as const;
    assert.equal(filterSearch(state), '?for=agencies&category=cost');
    assert.deepEqual(parseFilter(filterSearch(state)), state);
    assert.equal(filterSearch({ audience: null, category: null }), '');
  });

  test('changing one filter keeps the other', () => {
    const next = withChange({ audience: 'teams', category: 'cost' }, { category: null });
    assert.deepEqual(next, { audience: 'teams', category: null });
  });

  test('an item matches when it fits both filters', () => {
    const item = { audiences: ['teams', 'platform'], category: 'security' };
    assert.ok(matchesFilter(item, { audience: null, category: null }));
    assert.ok(matchesFilter(item, { audience: 'platform', category: 'security' }));
    assert.ok(!matchesFilter(item, { audience: 'agencies', category: null }));
    assert.ok(!matchesFilter(item, { audience: 'teams', category: 'cost' }));
  });

  test('fills the visible count into the sentence', () => {
    assert.equal(fillCount('Showing {shown} of {total}.', 3, 9), 'Showing 3 of 9.');
  });
});
