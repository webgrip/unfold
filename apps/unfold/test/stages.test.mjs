import test from 'node:test';
import assert from 'node:assert/strict';
import { workStages } from '../public/core/stages.js';
import { deliveryStages } from '../public/core/delivery-track.js';

const statuses = result => result.stages.map(stage => `${stage.id}:${stage.status}`).join(' ');
const play = (extra = {}) => ({ number: 7, state: 'open', ci: { state: 'success', capturedAt: '2026-10-04T10:00:00Z' }, reviews: [], mergedAt: null, mergedBy: '', closedAt: null, ...extra });

test('a Work Item opens on the stage it is in, and the earlier stages show as done', () => {
  assert.equal(statuses(workStages({ state: 'proposed' })), 'define:current execute:ahead review:ahead deliver:ahead');
  assert.equal(statuses(workStages({ state: 'leased' })), 'define:done execute:current review:ahead deliver:ahead');
  assert.equal(statuses(workStages({ state: 'awaiting_review' }, { plays: [play()] })), 'define:done execute:done review:current deliver:ahead');
  assert.equal(statuses(workStages({ state: 'done' }, { plays: [play({ state: 'merged' })], release: null })), 'define:done execute:done review:done deliver:current');
  assert.equal(statuses(workStages({ state: 'done' }, { plays: [play({ state: 'merged' })], release: { at: '2026-10-04T12:00:00Z', source: 'deploy', environment: 'production' } })), 'define:done execute:done review:done deliver:done');
});

test('stopped work stops on the stage it reached, and work that ended without a merge skips Deliver', () => {
  const stuck = workStages({ state: 'needs_human' });
  assert.equal(statuses(stuck), 'define:done execute:stopped review:ahead deliver:ahead');
  assert.equal(stuck.stopped, 'needs_human');
  assert.equal(statuses(workStages({ state: 'withdrawn' }, { plays: [play()] })), 'define:done execute:done review:stopped deliver:ahead');
  const nothing = workStages({ state: 'done' }, { plays: [] });
  assert.equal(nothing.current, null);
  assert.equal(statuses(nothing), 'define:done execute:done review:done deliver:skipped');
});

test('an unknown state or a missing card falls back to Define and never claims progress', () => {
  assert.equal(statuses(workStages(undefined)), 'define:current execute:ahead review:ahead deliver:ahead');
  assert.equal(workStages({ state: 'done' }, null).stages.at(-1).status, 'skipped', 'without a card a done Work Item never claims delivery');
});

test('the delivery track takes every stage from card facts and marks the next one', () => {
  const open = deliveryStages({ plays: [play()], deployments: [] });
  assert.deepEqual(open.stages.map(stage => [stage.id, stage.status]), [['opened', 'done'], ['checks', 'done'], ['approved', 'current'], ['merged', 'ahead']]);
  assert.equal(open.known, true);
  const shipped = deliveryStages({ plays: [play({ state: 'merged', mergedAt: '2026-10-04T11:00:00Z', mergedBy: 'ryan', reviews: [{ reviewer: 'anna', state: 'approved', receivedAt: '2026-10-04T10:30:00Z', headSha: 'abc' }], deployments: [{ environment: 'production', firstDeployedAt: '2026-10-04T13:00:00Z', sha: 'abcdef1234', url: '' }, { environment: 'staging', firstDeployedAt: '2026-10-04T11:30:00Z', sha: 'abcdef1234', url: '' }] })] });
  assert.deepEqual(shipped.stages.map(stage => stage.label), ['Pull request', 'Checks', 'Approved', 'Merged', 'Staging', 'Production'], 'environments follow in the order they were reached');
  assert(shipped.stages.every(stage => stage.status === 'done'));
});

test('failed checks and a closed pull request show as failed, never as done, and an older card says deploys are unknown', () => {
  const failed = deliveryStages({ plays: [play({ ci: { state: 'failure', capturedAt: null } })] });
  assert.equal(failed.stages.find(stage => stage.id === 'checks').status, 'failed');
  assert(!failed.stages.some(stage => stage.status === 'current'), 'nothing is next while a stage failed');
  assert.equal(failed.known, false);
  const closed = deliveryStages({ plays: [play({ state: 'closed', closedAt: '2026-10-04T10:00:00Z' })], deployments: [] });
  assert.equal(closed.stages.find(stage => stage.id === 'merged').status, 'failed');
  assert.deepEqual(deliveryStages({ plays: [] }).stages, []);
  assert.deepEqual(deliveryStages(null).stages, []);
});
