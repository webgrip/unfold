import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCents } from '../src/split.js';

test('gives the leftover cents to the first people', () => {
  assert.deepEqual(splitCents(1000, 3), [334, 333, 333]);
  assert.deepEqual(splitCents(1001, 4), [251, 250, 250, 250]);
});

test('always adds up to the total, with shares at most one cent apart', () => {
  for (let total = 0; total <= 250; total++) {
    for (let people = 1; people <= 7; people++) {
      const shares = splitCents(total, people);
      assert.equal(shares.reduce((sum, share) => sum + share, 0), total, `${total} over ${people}`);
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, `${total} over ${people}`);
    }
  }
});

test('rejects invalid input rather than inventing shares', () => {
  assert.throws(() => splitCents(10.5, 2), TypeError);
  assert.throws(() => splitCents(-1, 2), TypeError);
  assert.throws(() => splitCents(100, 0), TypeError);
});
