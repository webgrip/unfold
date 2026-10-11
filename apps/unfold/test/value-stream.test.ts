import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FactsPullRequest, WorkItemFacts } from '../src/cards/facts.ts';
import { valueStream } from '../src/value-stream.ts';

const pull = (patch: Partial<FactsPullRequest> = {}): FactsPullRequest => ({
  id: '7', forge: 'forgejo', owner: 'webgrip', repo: 'glide', number: 42, url: 'https://forge.example/webgrip/glide/pulls/42', shiftId: '3', branch: 'b', baseBranch: 'development',
  state: 'merged', draft: false, author: 'unfold-bot', headSha: 'abcdef1234', mergeCommitSha: 'feedbeef99', openedAt: '2026-10-02T10:00:00Z', firstSeenAt: '2026-10-02T10:00:00Z',
  mergedAt: '2026-10-02T15:00:00Z', mergedBy: 'ryan', closedAt: null, updatedAt: '2026-10-02T15:00:00Z', additions: 1, deletions: 1, changedFiles: 1, labels: null,
  commits: 2, firstCommitAt: null, forcePushes: 0, activityCapturedAt: null, activityTruncated: false, commitStatus: null, ciRunsCapturedAt: null, ciRunsSource: null, ciRunsTruncated: false,
  ciRuns: [
    { key: 'r1', headSha: 'aaaaaaa111', workflow: 'verify', status: 'failure', createdAt: '2026-10-02T10:01:00Z', startedAt: '2026-10-02T10:03:00Z', completedAt: '2026-10-02T10:13:00Z', jobs: [{ name: 'test', status: 'failure', attempt: 1 }] },
    { key: 'r2', headSha: 'abcdef1234', workflow: 'verify', status: 'success', createdAt: '2026-10-02T11:00:00Z', startedAt: '2026-10-02T11:00:00Z', completedAt: '2026-10-02T11:09:00Z', jobs: [] },
  ],
  reviews: [{ reviewer: 'ryan', state: 'approved', headSha: 'abcdef1234', receivedAt: '2026-10-02T14:00:00Z' }],
  events: [{ kind: 'ready', actor: 'unfold-bot', at: '2026-10-02T12:00:00Z', state: null, headSha: null }, { kind: 'push', actor: 'unfold-bot', at: '2026-10-02T10:55:00Z', state: null, headSha: null }],
  filesCapturedAt: null, filesTruncated: false, files: [], changedPaths: null, reverts: [],
  deployments: [{ environment: 'staging', firstDeployedAt: '2026-10-02T15:20:00Z', sha: 'feedbeef99', deployedAt: '2026-10-02T15:20:00Z', url: null, source: null }],
  ...patch,
});

const facts = (patch: Partial<WorkItemFacts> = {}): WorkItemFacts => ({
  workItem: {
    id: '181', provider: 'vikunja', externalId: '1990', externalRef: 'VIK-1990', url: 'https://tracker.example/tasks/1990', title: 'Gantt', state: 'awaiting_review', team: 'unfold',
    createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-02T15:00:00Z', trackerCreatedAt: '2026-09-30T08:00:00Z', estimateSeconds: null, target: null, epics: [], withdrawals: [], admittedAt: '2026-10-01T09:00:00Z',
  },
  activityAt: '2026-10-02T15:00:00Z', shifts: [], runs: [], liveUsage: [], pullRequests: [pull()],
  statusTransitions: [
    { status: 'Backlog', gate: null, at: '2026-10-01T09:00:00Z', observed: false, receivedAt: '2026-10-01T09:00:00Z' },
    { status: 'In progress', gate: 'development', at: '2026-10-02T09:00:00Z', observed: true, receivedAt: '2026-10-02T09:00:00Z' },
    { status: 'Review', gate: 'test', at: '2026-10-02T12:00:00Z', observed: true, receivedAt: '2026-10-02T12:00:00Z' },
  ],
  gateTransitions: [], deployEnvironments: [{ forge: 'forgejo', owner: 'webgrip', repo: 'glide', environment: 'staging', firstDeployedAt: '2026-01-01T00:00:00Z' }, { forge: 'forgejo', owner: 'webgrip', repo: 'glide', environment: 'production', firstDeployedAt: '2026-01-02T00:00:00Z' }],
  roster: [], botLogins: [], truncated: { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false },
  ...patch,
});

test('the value stream draws the ticket, each status visit, the pull request, its CI and each environment in that order', () => {
  const stream = valueStream(facts(), '2026-10-03T00:00:00Z');
  assert.deepEqual(stream.lanes.map(lane => lane.key), ['ticket', 'status', 'pull:7', 'ci:7', 'env:staging', 'env:production']);
  assert.equal(stream.trackerCreatedAt, '2026-09-30T08:00:00Z');
  const [ticket, status, pullRequest, ci, staging, production] = stream.lanes;
  assert.deepEqual(ticket!.bars.map(bar => [bar.start, bar.end, bar.waiting]), [['2026-09-30T08:00:00Z', '2026-10-01T09:00:00Z', true]]);
  assert.deepEqual(status!.bars.map(bar => [bar.label, bar.start, bar.end, bar.tone]), [
    ['Backlog', '2026-10-01T09:00:00Z', '2026-10-02T09:00:00Z', 'neutral'],
    ['In progress', '2026-10-02T09:00:00Z', '2026-10-02T12:00:00Z', 'live'],
    ['Review', '2026-10-02T12:00:00Z', null, 'attention'],
  ]);
  assert.match(status!.bars[0]!.detail, /inferred/);
  assert.deepEqual(pullRequest!.bars.map(bar => [bar.label, bar.start, bar.end]), [['Draft', '2026-10-02T10:00:00Z', '2026-10-02T12:00:00Z'], ['In review', '2026-10-02T12:00:00Z', '2026-10-02T15:00:00Z']]);
  assert.deepEqual(pullRequest!.marks.map(mark => mark.label), ['Pushed', 'Approved by ryan', 'Merged by ryan']);
  assert.deepEqual(ci!.bars.map(bar => [bar.label, bar.tone, bar.waiting]), [['Queued', 'neutral', true], ['failure', 'danger', false], ['success', 'success', false]]);
  assert.equal(ci!.sublabel, '2 runs, 1 failed');
  assert.deepEqual(staging!.bars.map(bar => [bar.start, bar.end]), [['2026-10-02T15:00:00Z', '2026-10-02T15:20:00Z']]);
  assert.deepEqual(production!.bars.map(bar => [bar.end, bar.label]), [[null, '#42 not deployed yet']]);
});

test('a closed Work Item ends its last status, and a pull request that never left draft has no review span', () => {
  const stream = valueStream(facts({ workItem: { ...facts().workItem, state: 'done' }, pullRequests: [pull({ draft: true, state: 'closed', mergedAt: null, closedAt: '2026-10-02T13:00:00Z', events: [{ kind: 'draft', actor: 'a', at: '2026-10-02T10:00:00Z', state: null, headSha: null }], deployments: [] })] }));
  const status = stream.lanes.find(lane => lane.key === 'status')!;
  assert.equal(status.bars.at(-1)!.end, status.bars.at(-1)!.start);
  const pullRequest = stream.lanes.find(lane => lane.key === 'pull:7')!;
  assert.deepEqual(pullRequest.bars.map(bar => bar.label), ['Draft']);
  assert.ok(pullRequest.marks.some(mark => mark.label === 'Closed without merging' && mark.tone === 'danger'));
  assert.equal(stream.lanes.some(lane => lane.group === 'environment'), false);
});

test('the value stream names what it does not know', () => {
  const late = valueStream(facts({ deployEnvironments: [], pullRequests: [pull({ ciRunsTruncated: true, deployments: [] })] }));
  assert.deepEqual(late.notes, [
    'The status history starts when Ploeg first saw the task; earlier moves are not known.',
    'CI shows the latest runs Ploeg read for each pull request, at most 30.',
    'No deploy has been reported for this repository, so environments are not shown.',
  ]);
  const capped = valueStream(facts({ truncated: { shifts: false, runs: false, pullRequests: false, statusTransitions: true, gateTransitions: false } }));
  assert.equal(capped.notes[0], 'Ploeg capped the status history; earlier moves are missing.');
});
