import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyToCents, orderTotal } from '../src/order.js';

test('rounds a half cent upward for the reported 1.005 fixture', () => {
  assert.equal(moneyToCents(1.005), 101);
});

test('rounds ordinary prices and sums item quantities in integer cents', () => {
  assert.equal(moneyToCents(2.675), 268);
  assert.equal(orderTotal([{ price: 1.005, quantity: 2 }, { price: 2.5, quantity: 1 }]), 452);
});

test('rejects invalid input rather than inventing totals', () => {
  assert.throws(() => moneyToCents(NaN), TypeError);
  assert.throws(() => moneyToCents(-1), TypeError);
  assert.throws(() => orderTotal([{ price: 1, quantity: -1 }]), TypeError);
});
