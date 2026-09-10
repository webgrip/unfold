import test from 'node:test';
import assert from 'node:assert/strict';
import { runLabel, reviewers, situation, failureStage, spendLabel, observedSpend, isolatedPlacement, approvalLabel, presentationFor } from '../src/status.ts';
import type { Session } from '../src/types.ts';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1', title: 'Fix rounding', objective: 'Fix it', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', placement: 'docker',
    ownerId: 'u1', ownerName: 'Ryan', status: 'completed', budgetUsd: 5, spentUsd: 1, costStatus: 'settled', createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:05:00.000Z', branch: 'vloer/s1',
    runs: [
      { id: 'r1', roleName: 'Engineer', mode: 'write', status: 'completed' },
      { id: 'r2', roleName: 'Analyst', mode: 'read', status: 'completed' },
      { id: 'r3', roleName: 'Reviewer', mode: 'read', status: 'completed', verdict: 'approve' },
    ],
    artifacts: [],
    ...overrides,
  };
}

test('run labels: write is implementation, a read role before the end is analysis, the final read role is the independent review', () => {
  const current = session();
  assert.deepEqual(current.runs.map(run => runLabel(current, run)), ['implementation', 'analysis', 'independent review']);
  const writeLast = session({ runs: [{ id: 'r1', roleName: 'Analyst', mode: 'read', status: 'completed' }, { id: 'r2', roleName: 'Engineer', mode: 'write', status: 'completed' }] });
  assert.deepEqual(writeLast.runs.map(run => runLabel(writeLast, run)), ['analysis', 'implementation']);
  assert.deepEqual(reviewers(writeLast), []);
  assert.deepEqual(reviewers(current).map(run => run.id), ['r3']);
});

test('the situation counts only the final read role as a reviewer', () => {
  assert.equal(situation(session()).headline, 'The crew finished and the candidate is captured. Your review is next.');
  assert.equal(situation(session({ review: { decision: 'accepted', by: 'u', byName: 'Ryan', at: '2026-09-10T14:00:00.000Z', note: 'Fine.' } })).headline, 'Accepted by Ryan.');
  assert.equal(presentationFor(session({ review: { decision: 'rejected', by: 'u', byName: 'Ryan', at: '2026-09-10T14:00:00.000Z', note: 'No.' } })).name, 'Rejected');
  assert.equal(presentationFor(session()).name, 'Awaiting your review');
  const rejected = session({ status: 'failed', runs: [{ id: 'r1', roleName: 'Engineer', mode: 'write', status: 'completed' }, { id: 'r2', roleName: 'Reviewer', mode: 'read', status: 'failed', verdict: 'request_changes' }] });
  assert.equal(situation(rejected).headline, 'Reviewer requested changes.');
});

test('a policy violation is presented as a gateway policy failure', () => {
  const failure = { category: 'policy_violation', stage: 'execution', message: 'A model request left the providers or regions this workbench allows.', remediation: 'Check the gateway route.', promptAcceptance: 'accepted' as const, automaticRetry: false as const };
  assert.equal(failureStage(failure), 'Gateway policy');
  assert.equal(failureStage({ ...failure, category: 'runtime_failure' }), 'Agent execution');
  assert.equal(failureStage(undefined), 'Execution');
  assert.equal(situation(session({ status: 'failed', failure })).headline, 'Gateway policy failed: A model request left the providers or regions this workbench allows.');
});

test('observed spend is shown only while running and only above the settled figure', () => {
  assert.equal(observedSpend(session({ status: 'running', observedUsd: 2.5, spentUsd: 1 })), 2.5);
  assert.equal(observedSpend(session({ status: 'running', observedUsd: 0.5, spentUsd: 1 })), undefined);
  assert.equal(observedSpend(session({ status: 'completed', observedUsd: 2.5, spentUsd: 1 })), undefined);
  assert.equal(spendLabel(session({ status: 'running', observedUsd: 2.5, spentUsd: 1 })), '$2.50 observed at the gateway of $5.00');
  assert.equal(spendLabel(session()), '$1.00 of $5.00');
  assert.equal(spendLabel(session({ costStatus: 'demo' })), 'demo · $0');
});

test('approval wording and isolation', () => {
  assert.equal(isolatedPlacement('docker'), true);
  assert.equal(isolatedPlacement('kubernetes'), true);
  assert.equal(isolatedPlacement('local'), false);
  assert.equal(isolatedPlacement(undefined), false);
  assert.equal(approvalLabel(session({ approval: 'auto' })), 'tool use approved automatically');
  assert.equal(approvalLabel(session({ approval: 'manual' })), 'tool use asks you');
});
