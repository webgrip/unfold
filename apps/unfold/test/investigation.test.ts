import assert from 'node:assert/strict';
import { test } from 'node:test';
import { investigate, type PloegRevision } from '../src/investigation.ts';
import type { Event, Session } from '../src/types.ts';

const at = (clock: string) => `2026-10-10T${clock}Z`;
let nextId = 1;
const event = (clock: string, type: string, data: Record<string, unknown> = {}, runId?: string): Event => ({ id: nextId++, sessionId: 's1', type, at: at(clock), actor: 'system', ...(runId ? { runId } : {}), data });

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1', title: 'Clown readme', objective: 'x', repositoryId: 'r', crewId: 'delivery', runtime: 'opencode', ownerId: 'owner', ownerName: 'Owner', status: 'interrupted', budgetUsd: 0.25, spentUsd: 0, observedUsd: 0.03, costStatus: 'pending', createdAt: at('14:37:04'), updatedAt: at('14:40:58'), branch: 'b', artifacts: [],
    execution: { id: 'e'.repeat(32), workItemId: '184', team: 'unfold', state: 'interrupted', revision: 18, generation: 1, supervision: 'human', expiresAt: at('14:42:28'), stopConfirmed: true },
    runs: [
      { id: 'r1', sessionId: 's1', roleId: 'implementer', roleName: 'Implementer', mode: 'write', status: 'completed', costUsd: 0 },
      { id: 'r2', sessionId: 's1', roleId: 'reviewer', roleName: 'Reviewer', mode: 'read', status: 'running', costUsd: 0 },
    ],
    ...overrides,
  } as Session;
}

function heartbeats(from: number, to: number): PloegRevision[] {
  const revisions: PloegRevision[] = [];
  for (let second = from, revision = 4; second <= to; second += 15, revision++) {
    const minute = Math.floor(second / 60), rest = second % 60;
    revisions.push({ revision, at: at(`14:${String(minute).padStart(2, '0')}:${String(rest).padStart(2, '0')}.900`), actor: 'owner', kind: 'execution.heartbeat', detail: { state: 'running' } });
  }
  return revisions;
}

function incident(lost: Record<string, unknown> = { autoResumed: false }) {
  const events: Event[] = [event('14:37:04.790', 'execution.authority', { expiresAt: at('14:38:34.733') }), event('14:39:42.372', 'run.started', {}, 'r2')];
  for (let second = 36; second <= 56; second++) for (let n = 0; n < 120; n++) events.push(event(`14:40:${second}.${String(n * 8).padStart(3, '0')}`, 'message', { role: 'assistant', text: n === 0 && second === 50 ? 'VERDICT: approve ' : 'x', partId: 'p' }, 'r2'));
  events.push(event('14:40:56.698', 'execution.authority_lost', lost));
  events.push(event('14:40:58.401', 'execution.reconciliation_required', { state: 'interrupted' }));
  return events;
}

const ploeg = [...heartbeats(37 * 60 + 34, 40 * 60 + 19), { revision: 17, at: at('14:40:58.046'), actor: 'owner', kind: 'execution.heartbeat', detail: { state: 'running' } }, { revision: 18, at: at('14:40:58.102'), actor: 'owner', kind: 'execution.report', detail: { state: 'interrupted' } }];

test('the 2026-10-10 interruption is diagnosed as an Unfold stall with lease left and an answer already given', () => {
  const result = investigate(session(), incident(), ploeg, 15000, new Date(at('14:45:00')));
  assert.equal(result.class, 'unfold_stall');
  assert.match(result.verdict, /Ploeg was not the problem/);
  assert.equal(result.stop?.type, 'execution.authority_lost');
  const fact = (label: string) => result.facts.find(item => item.label === label)?.value ?? '';
  assert.match(fact('Last heartbeat Ploeg accepted'), /37 s before the stop \(normally every 15 s\)/);
  assert.match(fact('Lease left when it stopped'), /^\d+ s$/);
  assert(Number(fact('Lease left when it stopped').split(' ')[0]) > 30, 'about a minute of lease was left');
  assert.match(fact('Unfold events in the minute before'), /peak 120 a second/);
  assert.match(fact('Reviewer'), /verdict approve/);
  assert(result.next.some(step => step.includes('Resume repeats: Reviewer')));
  assert(result.timeline.some(item => item.text.startsWith('no heartbeat for')), 'the timeline marks the silent gap');
  assert.equal(result.ploeg, 'read');
});

test('a recorded heartbeat cause and lease decide the class without Ploeg revisions', () => {
  const result = investigate(session(), incident({ cause: 'timeout', leaseLeftMs: 62000 }), undefined, 15000);
  assert.equal(result.class, 'unfold_stall');
  assert.equal(result.ploeg, 'unavailable');
  assert(result.facts.some(fact => fact.label === 'Ploeg side'));
  assert(result.facts.some(fact => fact.value === '62 s'));
});

test('a network failure at a quiet moment points at Ploeg', () => {
  const events = [event('14:39:42.372', 'run.started', {}, 'r2'), event('14:40:56.698', 'execution.authority_lost', { cause: 'network', leaseLeftMs: 4000 })];
  assert.equal(investigate(session(), events, ploeg, 15000).class, 'ploeg_unreachable');
});

test('a stale answer from Ploeg is a refusal, not a failure', () => {
  const events = [event('14:40:56.698', 'execution.authority_lost', { cause: 'stale', status: 409, leaseLeftMs: 60000 })];
  const result = investigate(session(), events, ploeg, 15000);
  assert.equal(result.class, 'ploeg_refused');
  assert.match(result.rule, /stale/);
});

test('a server restart and a person stopping the work are told apart from failures', () => {
  assert.equal(investigate(session(), [event('14:40:00', 'session.interrupted', { message: 'The server restarted.' })], ploeg, 15000).class, 'unfold_restart');
  assert.equal(investigate(session({ status: 'paused' }), [event('14:40:00', 'session.paused')], ploeg, 15000).class, 'operator_stop');
});

test('evidence that fits no rule says so instead of guessing', () => {
  const result = investigate(session({ execution: undefined }), [event('14:40:00', 'execution.reconciliation_pending', { autoResumed: false })], undefined, 15000);
  assert.equal(result.class, 'unclear');
  assert.equal(result.ploeg, 'not_bound');
  assert(result.next.some(step => step.includes('investigate-session')));
});
