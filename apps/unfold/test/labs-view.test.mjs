import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rolloutFrom, ruleWords, valueText } from '../public/views/labs.js';

test('the rollout editor reads a percentage split, a scheduled rule and a ramp, and skips the blank and removed rules', () => {
  const data = {
    defaultVariant: 'off', respectLabs: 'on',
    'r0.audience': 'segment', 'r0.target': 'agency-staff', 'r0.serve': 'split', 'r0.w.on': '12,5', 'r0.w.off': '87.5', 'r0.sticky': 'tenantId',
    'r1.audience': 'roles', 'r1.target': 'admin, operator', 'r1.start': '2026-11-01T09:00', 'r1.serve': 'variant', 'r1.variant': 'on',
    'r2.audience': 'everyone', 'r2.serve': 'ramp', 'r2.rampVariant': 'on', 'r2.rampOtherwise': 'off', 'r2.from': '0', 'r2.to': '100', 'r2.rampStart': '2026-11-01T00:00', 'r2.rampEnd': '2026-11-21T00:00',
    'r3.audience': 'teams', 'r3.target': 'bronze', 'r3.remove': 'on', 'r3.serve': 'variant', 'r3.variant': 'on',
    'r4.audience': 'none',
  };
  const rollout = rolloutFrom(data, 5, ['on', 'off']);
  assert.equal(rollout.respectLabs, true);
  assert.equal(rollout.rules.length, 3);
  assert.deepEqual(rollout.rules[0], { id: 'rule-1', audience: { segment: 'agency-staff' }, serve: { kind: 'split', weights: { on: 1250, off: 8750 }, stickiness: 'tenantId' } });
  assert.deepEqual(rollout.rules[1].audience, { roles: ['admin', 'operator'] });
  assert.equal(rollout.rules[1].window.start, new Date('2026-11-01T09:00').toISOString());
  assert.deepEqual({ from: rollout.rules[2].serve.from, to: rollout.rules[2].serve.to, kind: rollout.rules[2].serve.kind }, { from: 0, to: 10000, kind: 'ramp' });
  assert.equal(rolloutFrom({ defaultVariant: 'on', disabled: 'on' }, 0, ['on']).state, 'DISABLED');
  const prerequisite = rolloutFrom({ defaultVariant: 'off', 'r0.audience': 'prerequisite', 'r0.target': 'work.live-view=on', 'r0.serve': 'variant', 'r0.variant': 'on' }, 1, ['on', 'off']);
  assert.deepEqual(prerequisite.rules[0].audience, { prerequisite: { flag: 'work.live-view', variants: ['on'] } });
});

test('a rule reads in words, and values read as On, Off or themselves', () => {
  assert.equal(ruleWords({ audience: { segment: 'agency-staff' }, serve: { kind: 'split', weights: { on: 1250, off: 8750 }, stickiness: 'tenantId' } }), 'Segment agency-staff: split 12.5 % on · 87.5 % off, by Tenant');
  assert.equal(ruleWords({ audience: {}, serve: { kind: 'variant', variant: 'on' } }), 'Everyone: serve on');
  assert.deepEqual([valueText(true), valueText(false), valueText('baken')], ['On', 'Off', 'baken']);
});
