import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, phaseLabel, startLine } from '../public/views/status.js';

const check = (id, state, summary = `${id} ${state}`) => ({ id, title: id, state, summary, checkedAt: '2026-10-05T06:29:14Z' });
const report = (states, extra = {}) => ({ overall: 'operational', notes: [], checks: [check('ploeg', states[0]), check('gateway', states[1]), check('workspaces', states[2], states[2] === 'down' ? 'Every machine is busy.' : states[2] === 'ok' ? 'The last workspace started 12 min ago.' : 'Workspace check.')], ...extra });

test('the start line follows the engine order and the crew step is ready only while nothing before it is down', () => {
  assert.deepEqual(startLine(report(['ok', 'ok', 'ok'])).map(step => [step.number, step.id, step.state]), [[1, 'ploeg', 'ok'], [2, 'gateway', 'ok'], [3, 'workspaces', 'ok'], [4, 'crew', 'ready']]);
  const blocked = startLine(report(['ok', 'ok', 'down']));
  assert.deepEqual(blocked.at(-1), { id: 'crew', name: 'The crew works', number: 4, state: 'unreached', summary: 'Waits for step 3.' });
});

test('a stopped step answers no, names the step, and says how long a new session would wait and that the wait is free', () => {
  assert.deepEqual(answer(report(['ok', 'ok', 'down'], { startLimitSeconds: 180 })), {
    tone: 'danger', verdict: 'Not right now.', reason: 'New sessions stop at step 3. Every machine is busy. This is a problem on the workbench; there is nothing to change in your session.', stop: 3,
    next: 'A session you start now waits up to 3 minutes for a machine, then stops. The wait is not charged. Try again when step 3 turns green. This page checks again every 30 seconds. No administrator has posted a note about it yet.',
  });
  assert.equal(answer(report(['ok', 'down', 'ok'], { startLimitSeconds: 180, notes: [{ severity: 'degraded' }] })).next, 'Try again when step 2 turns green. This page checks again every 30 seconds.');
  assert.match(answer(report(['ok', 'ok', 'down'])).next, /^Try again when step 3/, 'no wait sentence without a known limit');
});

test('notes change the answer only while open, and an outage note says no even when every check passes', () => {
  assert.equal(answer(report(['ok', 'ok', 'ok'], { notes: [{ severity: 'outage' }] })).verdict, 'Not right now.');
  assert.equal(answer(report(['ok', 'ok', 'ok'], { notes: [{ severity: 'degraded' }] })).verdict, 'Yes, but expect problems.');
  assert.equal(answer(report(['ok', 'ok', 'ok'], { notes: [{ severity: 'outage', resolvedAt: '2026-10-05T07:00:00Z' }] })).verdict, 'Yes.');
});

test('the answer never claims more than the checks prove', () => {
  assert.deepEqual(answer(report(['ok', 'ok', 'ok'])), { tone: 'success', verdict: 'Yes.', reason: 'Nothing is in the way. The last workspace started 12 min ago.', next: '', stop: null });
  assert.equal(answer(report(['not_used', 'ok', 'idle'])).verdict, 'Probably.');
  assert.equal(answer(report(['ok', 'ok', 'idle'], { notes: [{ severity: 'degraded' }] })).verdict, 'Probably, but expect problems.');
  assert.deepEqual(startLine(report(['ok', 'ok', 'idle'])).at(-1).state, 'unproven');
  assert.equal(answer(report(['ok', 'degraded', 'ok'])).verdict, 'Yes, but not reliably.');
  assert.deepEqual(answer(report(['not_used', 'not_used', 'not_used'])).verdict, 'This is a demo.');
});

test('wait phases read as plain words, and an unknown phase falls back to preparing', () => {
  assert.equal(phaseLabel('capacity'), 'Waiting for a free machine');
  assert.equal(phaseLabel('image_unavailable'), 'Workspace image unavailable');
  assert.equal(phaseLabel('something-new'), 'Preparing the workspace');
});
