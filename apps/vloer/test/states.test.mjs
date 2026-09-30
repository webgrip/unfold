import assert from 'node:assert/strict';
import { test } from 'node:test';
import { failureReason, failureReasons, runOutcome, runOutcomes, runState, runStates, sessionNeedsYou, sessionStatus, sessionStatuses, stateMeta, tones, verdict, verdicts, workItemState, workItemStates } from '../public/core/states.js';
import { labels, statusLabel } from '../public/core/lookup.js';
import { icons } from '../public/core/icons.js';

const plannedIcons = ['inbox', 'work', 'proposed', 'runs', 'activity', 'insights', 'tasks', 'sessions', 'settings', 'sun', 'moon', 'monitor', 'search', 'command', 'keyboard', 'bell', 'filter', 'copy', 'refresh', 'more', 'menu', 'chevron-down', 'chevron-up', 'chevron-left', 'alert', 'check-circle', 'x-circle', 'pause-circle', 'pull-request', 'branch', 'user', 'bot', 'coins', 'calendar', 'eye', 'lock', 'zap', 'external', 'arrow-up-right', 'spark', 'list', 'panel', 'hash', 'globe', 'tag'];
const knownIcons = new Set([...Object.keys(icons), ...plannedIcons]);
const tables = { workItemStates, runStates, runOutcomes, verdicts, failureReasons, sessionStatuses };

test('every state has a label, a design-system tone and a known glyph, so status is never colour alone', () => {
  for (const [name, table] of Object.entries(tables)) {
    for (const [key, meta] of Object.entries(table)) {
      assert.equal(meta.key, key, `${name}.${key}`);
      assert(meta.label.trim(), `${name}.${key} has no label`);
      assert(tones.includes(meta.tone), `${name}.${key} tone ${meta.tone}`);
      assert(knownIcons.has(meta.glyph), `${name}.${key} glyph ${meta.glyph}`);
    }
  }
  assert.deepEqual(tones, ['neutral', 'live', 'attention', 'review', 'success', 'danger', 'severe']);
});

test('Work Item states use the one vocabulary: Needs you, Ready for review, Done and never Merged', () => {
  assert.deepEqual(Object.keys(workItemStates).sort(), ['awaiting_review', 'done', 'ingested', 'leased', 'needs_human', 'proposed', 'queued', 'stale', 'withdrawn']);
  const read = key => [workItemStates[key].label, workItemStates[key].tone];
  assert.deepEqual(read('proposed'), ['Proposed', 'neutral']);
  assert.deepEqual(read('ingested'), ['Received', 'neutral']);
  assert.deepEqual(read('queued'), ['Queued', 'neutral']);
  assert.deepEqual(read('leased'), ['Running', 'live']);
  assert.deepEqual(read('awaiting_review'), ['Ready for review', 'review']);
  assert.equal(workItemStates.awaiting_review.heading, 'Ready for your review');
  assert.deepEqual(read('needs_human'), ['Needs you', 'attention']);
  assert.deepEqual(read('stale'), ['Stopped retrying', 'severe']);
  assert.deepEqual(read('withdrawn'), ['Withdrawn', 'neutral']);
  assert.deepEqual(read('done'), ['Done', 'success']);
  assert.equal(workItemStates.leased.live, true);
  assert(!Object.values(tables).some(table => Object.values(table).some(meta => /merged/i.test(meta.label))), 'no state reads Merged');
});

test('Run states, outcomes and agent verdicts read in plain words, and agent review never reads as human review', () => {
  assert.deepEqual(Object.values(runStates).map(meta => meta.label), ['Pending', 'Running', 'Finished']);
  assert.deepEqual(Object.fromEntries(Object.entries(runOutcomes).map(([key, meta]) => [key, meta.label])), {
    pr_opened: 'Opened a pull request', pr_updated: 'Updated the pull request', no_change_needed: 'No change needed', follow_up_created: 'Created follow-up work', issue_updated: 'Updated the tracker item', stuck: 'Stuck', failed: 'Failed',
  });
  assert.equal(verdict('approve').label, 'Agent review: approve');
  assert.equal(verdict('request_changes').label, 'Agent review: changes requested');
  assert.equal(verdict('inconclusive').label, 'Agent review: inconclusive');
  assert.equal(verdict('').label, 'No agent verdict');
  assert.equal(verdict(null).label, 'No agent verdict');
  assert(Object.values(verdicts).every(meta => !/human/i.test(meta.label)));
  assert.equal(runOutcome(''), null);
  assert.equal(runOutcome('pr_opened').tone, 'success');
  assert.equal(runState('running').tone, 'live');
  assert.equal(failureReason(null), null);
  assert.equal(failureReason('infra_node').infra, true);
  assert.equal(failureReason('agent_error').infra, false);
});

test('session statuses keep their labels, with the review decision and failure fixed', () => {
  assert.equal(sessionStatus({ status: 'completed' }).label, 'Ready for your review');
  assert.equal(sessionStatus({ status: 'completed', review: { decision: 'accepted' } }).label, 'Accepted');
  assert.equal(sessionStatus({ status: 'completed', review: { decision: 'rejected' } }).label, 'Rejected');
  assert.equal(sessionStatus({ status: 'failed' }).label, 'Failed');
  assert.equal(sessionStatus({ status: 'failed' }).tone, 'danger');
  assert.equal(sessionStatus({ status: 'waiting_input' }).label, 'Needs your input');
  assert.equal(sessionStatus({ status: 'queued' }).label, 'Ready to start');
  assert.equal(labels.completed, 'Ready for your review');
  assert.equal(labels.failed, 'Failed');
  assert.equal(labels.running, 'Working');
  assert.equal(statusLabel({ status: 'completed', review: { decision: 'accepted' } }), 'Accepted');
  assert.equal(statusLabel({ status: 'failed' }), 'Failed');
  assert.deepEqual(['waiting_input', 'failed', 'interrupted', 'completed', 'running', 'queued', 'paused', 'cancelled'].filter(status => sessionNeedsYou({ status })), ['waiting_input', 'failed', 'interrupted', 'completed']);
  assert.equal(sessionNeedsYou({ status: 'completed', review: { decision: 'accepted' } }), false);
});

test('a prefixed key picks its kind, an unprefixed key prefers Work Item states, and an unknown key is humanized', () => {
  assert.equal(stateMeta('queued').label, 'Queued');
  assert.equal(stateMeta('session:queued').label, 'Ready to start');
  assert.equal(stateMeta('running').label, 'Running');
  assert.equal(stateMeta('session:running').label, 'Working');
  assert.equal(stateMeta('failed').label, 'Failed');
  assert.equal(stateMeta('outcome:failed').tone, 'danger');
  assert.equal(stateMeta('verdict:approve').label, 'Agent review: approve');
  assert.equal(stateMeta('failure:timeout').label, 'The Run timed out');
  assert.deepEqual({ ...stateMeta('some_new_state') }, { key: 'some_new_state', label: 'Some new state', tone: 'neutral', glyph: 'circle' });
  assert.equal(stateMeta('session:mystery').label, 'Mystery');
  assert.equal(stateMeta('').label, 'Unknown');
  assert.equal(stateMeta('toString').label, 'ToString');
  assert.equal(stateMeta('workItem:toString').label, 'ToString');
  assert.equal(workItemState('needs_human').label, 'Needs you');
});
