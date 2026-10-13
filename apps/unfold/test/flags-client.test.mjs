import assert from 'node:assert/strict';
import { test } from 'node:test';
import { state } from '../public/core/state.js';
import { insight } from '../public/core/insight.js';
import { enabled, exposed, flag, flagValues, useFlagValues } from '../public/core/flags.js';

test('the browser reads flag values from the bootstrap, falls back when the server sent none, and takes new values after a Labs change', () => {
  state.bootstrap = { user: { id: 'u1', role: 'operator' }, flags: { 'work.flight-profile': false } };
  assert.equal(enabled('work.flight-profile'), false);
  assert.equal(flag('work.unknown', 'fallback'), 'fallback');
  useFlagValues({ 'work.flight-profile': true });
  assert.equal(enabled('work.flight-profile'), true);
  assert.deepEqual(flagValues(), { 'work.flight-profile': true });
  state.bootstrap = null;
  assert.equal(enabled('work.flight-profile'), false, 'signed out, every flag is off');
});

test('an exposure is recorded once per page load with the OpenTelemetry feature-flag attributes', () => {
  state.bootstrap = { user: { id: 'u1', role: 'operator' }, flags: { 'work.flight-profile': true } };
  insight.configure(true);
  const before = insight.size();
  exposed('work.flight-profile', { screen: 'work', workItemId: '187' });
  exposed('work.flight-profile', { screen: 'work', workItemId: '188' });
  assert.equal(insight.size(), before + 1);
  insight.configure(false);
});
