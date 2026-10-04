import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ploegDemo, ploegDemoAnchor } from '../src/ploeg-demo.ts';

test('the illustrative Ploeg records are relative to one exported minute', () => {
  assert.equal(ploegDemoAnchor % 60_000, 0);
  assert(Math.abs(Date.now() - ploegDemoAnchor) < 24 * 60 * 60 * 1000, 'the anchor is the clock when the module loaded');
  const latest = Math.max(...ploegDemo.events.map(event => Date.parse(event.at)));
  assert(latest <= ploegDemoAnchor, 'no illustrative event lies after the anchor');
  assert(ploegDemoAnchor - latest < 60 * 60 * 1000, 'the newest illustrative event sits just before the anchor');
});
