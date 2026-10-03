import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorName, auditActor, auditEvent, displayState, tileDetail, unreportedOutcome, checkpointPhase, checkpointPhases, failureNote, failureReason, failureReasons, runFailure, runFailureText, runOutcome, runOutcomes, runState, runStates, sessionNeedsYou, sessionStatus, sessionStatuses, stateMeta, tones, verdict, verdicts, workItemState, workItemStates } from '../public/core/states.js';
import { stateBadge } from '../public/core/ui.js';
import { labels, statusLabel } from '../public/core/lookup.js';
import { icons } from '../public/core/icons.js';

const plannedIcons = ['inbox', 'work', 'proposed', 'runs', 'activity', 'insights', 'tasks', 'sessions', 'settings', 'sun', 'moon', 'monitor', 'search', 'command', 'keyboard', 'bell', 'filter', 'copy', 'refresh', 'more', 'menu', 'chevron-down', 'chevron-up', 'chevron-left', 'alert', 'check-circle', 'x-circle', 'pause-circle', 'pull-request', 'branch', 'user', 'bot', 'coins', 'calendar', 'eye', 'lock', 'zap', 'external', 'arrow-up-right', 'spark', 'list', 'panel', 'hash', 'globe', 'tag'];
const knownIcons = new Set([...Object.keys(icons), ...plannedIcons]);
const tables = { workItemStates, runStates, runOutcomes, verdicts, failureReasons, sessionStatuses, checkpointPhases };

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
  assert.deepEqual(Object.keys(workItemStates).filter(key => !workItemStates[key].derived).sort(), ['awaiting_review', 'done', 'ingested', 'leased', 'needs_human', 'proposed', 'queued', 'stale', 'withdrawn']);
  assert.deepEqual([workItemStates.rejected.label, workItemStates.rejected.tone, workItemStates.rejected.glyph], ['Rejected', 'neutral', 'circle-slash']);
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

test('Work Item state glyphs match the state badge, so a list glyph and its badge never disagree', () => {
  for (const [key, meta] of Object.entries(workItemStates)) {
    const badge = stateBadge(key);
    if (meta.live) assert.match(badge, /live-dot/, key);
    else assert.equal(badge, stateBadge(meta), key);
  }
  assert.equal(workItemStates.queued.glyph, 'circle-dashed');
  assert.equal(workItemStates.leased.glyph, 'circle-half');
  assert.equal(workItemStates.withdrawn.glyph, 'circle-slash');
});

test('verdicts have a short form for a reviewer’s own cell that still never says human', () => {
  assert.deepEqual(Object.values(verdicts).map(meta => meta.short), ['Agent approved', 'Agent asked for changes', 'Inconclusive', 'No verdict']);
  assert(Object.values(verdicts).every(meta => !/human/i.test(meta.short)));
});

test('outcomes have a short form that fits one line of a Round ladder cell', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(runOutcomes).map(([key, meta]) => [key, meta.short])), {
    pr_opened: 'PR opened', pr_updated: 'PR updated', no_change_needed: 'No change', follow_up_created: 'Follow-up created', issue_updated: 'Tracker updated', stuck: 'Stuck', failed: 'Failed',
  });
  assert(Object.values(runOutcomes).every(meta => meta.short.length <= 17));
});

test('a failure reads as its cause, and only a live Work Item is said to retry', () => {
  assert.equal(failureNote('lease_lost'), 'Cause: infrastructure, not the agent. Ploeg retries it automatically. If it keeps happening, check the nodes and the network.');
  assert.equal(failureNote('lease_lost', { live: false }), 'Cause: infrastructure, not the agent. If it keeps happening, check the nodes and the network.');
  assert.equal(failureNote('agent_error', { live: false }), 'Cause: the agent harness exited with an error. Read its log tail. Fix the brief, the model or the harness.');
  assert.equal(failureNote('timeout'), 'Cause: the harness time limit. Split the ticket or raise the timeout.', 'agent-side failures never promise a retry');
  assert.equal(failureNote('idle'), 'Cause: the harness printed nothing and made no model call for its idle timeout. Read its log tail. A hung command or an unanswered prompt is the usual cause. Raising the idle timeout only delays the stop.', 'silence is not advised as a time limit');
  assert.equal(failureNote(null), '');
  assert.equal(failureReasons.infra_node.action, 'It retries automatically. If it keeps happening, check the nodes and images.', 'owner and action stay for existing callers');
  assert(Object.values(failureReasons).every(meta => meta.cause && typeof meta.retries === 'boolean' && meta.next));
  assert(Object.values(failureReasons).every(meta => meta.retries === meta.infra), 'only infrastructure failures are retried by Ploeg');
});

test('a Run an ACP watchdog stopped reads as an agent that stopped responding, whichever summary it carries', () => {
  const tail = 'no protocol activity for 10m0s after 29 events | last agent message: still reading | stderr: npm WARN deprecated';
  for (const summary of ['acp idle watchdog stopped the agent: no protocol activity for 10m0s', 'acp prompt wall stopped the agent: the turn ran past 45m0s', 'acp agent stopped responding']) {
    const meta = runFailure({ failureReason: 'agent_error', summary, stuckReason: tail });
    assert.equal(meta.label, 'The agent stopped responding', summary);
    assert.equal(meta.infra, false);
    assert.equal(meta.key, 'agent_error', 'the failure reason stays agent_error');
    assert.equal(failureNote(meta, { live: false }), 'Cause: the agent stopped responding. Its reason names the watchdog that stopped it. A hung command or a long silent model call is the usual cause.');
    assert.doesNotMatch(failureNote(meta), /log tail|exited with an error/);
  }
  assert.deepEqual(runFailureText({ failureReason: 'agent_error', summary: 'acp idle watchdog stopped the agent: no protocol activity for 10m0s', stuckReason: tail }), { reason: 'no protocol activity for 10m0s after 29 events | last agent message: still reading', output: 'npm WARN deprecated', outputLabel: 'Last lines it printed' });
  assert.deepEqual(runFailureText({ failureReason: 'agent_error', summary: 'acp prompt wall stopped the agent: the turn ran past 45m0s', stuckReason: 'prompt ran past 45m0s' }), { reason: 'prompt ran past 45m0s', output: '', outputLabel: 'Last lines it printed' });
});

test('other agent_error Runs and other failures keep their table wording', () => {
  const crash = { failureReason: 'agent_error', summary: 'acp agent exited before answering the prompt', stuckReason: 'EOF | stderr: panic' };
  assert.equal(runFailure(crash), failureReason('agent_error'));
  assert.deepEqual(runFailureText(crash), { reason: 'EOF | stderr: panic', output: '', outputLabel: '' });
  assert.equal(runFailure({ failureReason: 'lease_lost', summary: 'acp agent stopped responding' }), failureReason('lease_lost'));
  assert.equal(runFailure({ failureReason: null, summary: 'acp idle watchdog stopped the agent: x' }), null);
  assert.equal(runFailure({ failureReason: 'agent_error', summary: 'it said acp idle watchdog stopped the agent' }), failureReason('agent_error'), 'only a summary that starts with the watchdog wording counts');
});

test('checkpoint phases read as what the Run did', () => {
  assert.equal(checkpointPhase('pr_opened').label, 'Opened a pull request');
  assert.equal(checkpointPhase('branch_created').label, 'Created the branch');
  assert.equal(checkpointPhase('review').label, checkpointPhase('reviewed').label, 'the demo phase reads like the real one');
  assert.equal(checkpointPhase('mystery_phase').label, 'Mystery phase');
});

test('audit events read in plain words from their action and kept detail, and unknown actions are humanized', () => {
  const label = (action, detail = {}) => auditEvent({ action, detail }).label;
  assert.equal(label('work_item.needs_human', { reason: 'x' }), 'Needs you');
  assert.equal(auditEvent({ action: 'work_item.needs_human' }).tone, 'attention');
  assert.equal(label('work_item.awaiting_review'), 'Ready for your review');
  assert.deepEqual([label('work_item.done', { reason: 'pull request merged' }), auditEvent({ action: 'work_item.done', detail: { reason: 'pull request merged' } }).detail], ['Done', 'The pull request was merged']);
  assert.equal(label('work_item.stale'), 'Stopped retrying');
  assert.equal(label('work_item.queued'), 'Queued');
  assert.equal(label('work_item.queued', { reason: 'changes requested' }), 'Queued again');
  assert.equal(label('round.opened', { round: 2 }), 'Round 2 started');
  assert.equal(label('run.claimed', { role: 'reviewer', round: 2, writes: false }), 'Reviewer started Round 2 as reader');
  assert.equal(label('run.claimed', {}), 'An agent started');
  assert.equal(label('run.expired', { role: 'implementer' }), 'Implementer stopped responding');
  assert.equal(label('lease.expired'), 'Worker stopped responding · Ploeg retries');
  assert.equal(auditEvent({ action: 'run.claimed', detail: { role: 'implementer', round: 2, writes: true, authorizedUsd: 1.5 } }).detail, 'Up to US$\u00a01,50 authorized');
  assert.equal(label('work_item.proposed'), 'Proposed by an agent');
  assert.deepEqual(auditEvent({ action: 'work_item.rejected', detail: { reason: 'duplicate of DEMO-3' } }), { label: 'Rejected', tone: 'neutral', glyph: 'circle-slash', detail: 'Duplicate of DEMO-3' });
  assert.deepEqual([label('work_item.withdrawn', { reason: 'withdrawn_unassigned' }), auditEvent({ action: 'work_item.withdrawn', detail: { reason: 'withdrawn_unassigned' } }).detail], ['Withdrawn', 'The task was unassigned from the Team.']);
  assert.deepEqual([label('shift.closed', { reason: 'fix_round_cap_reached' }), auditEvent({ action: 'shift.closed', detail: { reason: 'fix_round_cap_reached' } }).detail], ['Shift closed', 'The fix Rounds ran out']);
  assert.equal(label('checkpoint.written', { phase: 'smoke_tested' }), 'Checkpoint: smoke tested');
  assert.equal(label('delivery.publication_confirmed'), 'Publication confirmed');
  assert.equal(label('checkpoint.written', { phase: 'pr_opened' }), 'Opened a pull request');
  assert.equal(label('outcome.no_change_needed'), 'Reported no change needed');
  assert.equal(auditEvent({ action: 'outcome.failed' }).tone, 'danger');
  assert.equal(label('infra_cap'), 'Infrastructure kept failing; Ploeg stopped');
  assert.equal(label('delivery.publication_reserved'), 'Publication reserved');
  assert.equal(label('llm.unknown'), 'Spend could not be settled');
  assert.equal(label('something.new_here'), 'Something: new here');
  assert.equal(auditEvent(null).label, 'Event');
});

test('actors are named in plain words, and the signed-in operator reads as You', () => {
  assert.equal(actorName('team:delivery'), 'Agent · delivery');
  assert.equal(actorName('ploegd:shift-engine'), 'Ploeg');
  assert.equal(actorName('webhook:vikunja'), 'Vikunja');
  assert.equal(actorName('webhook:demo'), 'Demo tracker');
  assert.equal(actorName('operator:vloer:u1', { userId: 'u1' }), 'You');
  assert.equal(actorName('operator:vloer:u2', { userId: 'u1' }), 'An operator');
  assert.equal(actorName(''), 'Ploeg');
  assert.equal(actorName('something-else'), 'something-else');
  assert.deepEqual(auditActor('team:delivery'), { name: 'Agent · delivery', kind: 'agent', glyph: 'bot', title: 'An agent of the delivery Team', team: 'delivery' });
  assert.deepEqual(auditActor('operator:vloer:u-1', { userId: 'u-1' }), { name: 'You', kind: 'person', glyph: 'user', title: 'You, through vloer', team: '' });
  assert.deepEqual([auditActor('operator:vloer:u-2', { userId: 'u-1' }).name, auditActor('operator:vloer:u-2', { userId: 'u-1' }).title], ['An operator', 'Operator u-2, through vloer']);
  assert.equal(auditActor('ploegd:shift-engine').title, 'Ploeg (shift engine)');
});

test('a rejected proposal reads as neutral Rejected, never a green Done, while its state stays done', () => {
  const proposal = { state: 'done', provider: 'ploeg', latestShift: null, attempts: 0 };
  assert.equal(displayState(proposal), 'rejected');
  assert.equal(displayState(proposal, [{ id: '2', action: 'work_item.rejected' }, { id: '1', action: 'work_item.proposed' }]), 'rejected');
  assert.equal(displayState({ ...proposal, latestShift: { id: '9' } }), 'done', 'a proposal that ran is Done');
  assert.equal(displayState({ state: 'done', provider: 'vikunja', latestShift: { id: '1' }, attempts: 3 }, [{ id: '5', action: 'work_item.done' }]), 'done');
  assert.equal(displayState({ state: 'needs_human' }), 'needs_human');
  assert.equal(proposal.state, 'done');
});

test('a Run cancelled before it started says so, and tiles say the same thing on Now and Insights', () => {
  assert.equal(unreportedOutcome({ startedAt: null, summary: 'cancelled: shift closed (budget exhausted)' }).label, 'Cancelled before it started');
  assert.equal(unreportedOutcome({ startedAt: '2026-09-30T10:00:00Z', summary: 'cancelled: x' }).label, 'No outcome reported');
  assert.equal(unreportedOutcome({}).label, 'No outcome reported');
  assert.equal(tileDetail.queued(2), 'Waiting for a worker');
  assert.equal(tileDetail.running({ running: 1, pending: 1 }), '1 Run working · 1 waiting for a worker');
  assert.equal(tileDetail.running({ running: 0, pending: 0 }), 'Nothing is working');
});
