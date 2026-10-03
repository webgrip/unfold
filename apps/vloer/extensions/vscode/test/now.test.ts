import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from '../src/core.ts';
import { describeItem, describeRun, groupTruncated, nowGroup, pullRequestNumber, waitingCount } from '../src/now.ts';
import type { PloegNow, PloegNowItem, PloegRunRow } from '../src/ploeg-types.ts';

const core = await loadCore(new URL('../media/core/', import.meta.url));
const at = new Date(Date.now() - 3_600_000).toISOString();
const item = (state: string, extra: Partial<PloegNowItem> = {}): PloegNowItem => ({ id: '42', team: 'bronze', state, title: 'vloer: show one provisional total', url: 'https://vikunja.example/tasks/1694', createdAt: at, updatedAt: at, provider: 'vikunja', externalId: '1694', priority: 4, attempts: 1, infraFailures: 0, target: null, closeReason: null, latestShift: null, spentUsd: 0, pullRequestUrl: '', ...extra });
const run = (extra: Partial<PloegRunRow> = {}): PloegRunRow => ({ id: '7', workItemId: '42', workItemTitle: 'vloer: show one provisional total', externalRef: 'VIK-1694', team: 'bronze', role: 'builder', round: 1, writes: true, state: 'running', outcome: '', verdict: '', failureReason: '', startedAt: new Date(Date.now() - 125_000).toISOString(), finishedAt: null, durationSeconds: null, authorizedUsd: 8, settledUsd: null, observedUsd: 0.34, ...extra });
const now = (waiting: PloegNowItem[], running: PloegRunRow[] = []): PloegNow => ({ demo: false, teams: ['bronze'], waiting, running, recent: [], runningTruncated: false, recentTruncated: false, errors: {}, fetchedAt: at });

test('Now groups waiting work as the browser does: review, then needs you (stopped retrying included), then proposed', () => {
  assert.equal(nowGroup(item('awaiting_review')), 'review');
  assert.equal(nowGroup(item('needs_human')), 'needs');
  assert.equal(nowGroup(item('stale')), 'needs');
  assert.equal(nowGroup(item('proposed')), 'proposed');
  assert.equal(nowGroup(item('leased')), undefined);
});

test('the badge counts what waits on a person: review, needs you and sessions waiting for an answer, not proposals or failed sessions', () => {
  const value = now([item('awaiting_review'), item('needs_human', { id: '43' }), item('proposed', { id: '44' })]);
  assert.equal(waitingCount(value, [{ status: 'waiting_input' }, { status: 'failed' }]), 3);
  assert.equal(waitingCount(undefined, []), 0);
});

test('a waiting group is truncated only when the server names its state, and an older server claims nothing', () => {
  const value = { ...now([item('awaiting_review')]), truncatedStates: ['awaiting_review'] };
  assert.equal(groupTruncated(value, 'review'), true);
  assert.equal(groupTruncated(value, 'needs'), false);
  assert.equal(groupTruncated(value, 'running'), false);
  assert.equal(groupTruncated(now([item('awaiting_review')]), 'review'), false);
  assert.equal(groupTruncated(undefined, 'review'), false);
});

test('a pull request number is read only from a pull request path', () => {
  assert.equal(pullRequestNumber('https://forgejo.example/webgrip/glide/pulls/88'), '88');
  assert.equal(pullRequestNumber('https://gitlab.example/g/p/-/merge_requests/12'), '12');
  assert.equal(pullRequestNumber('https://forgejo.example/webgrip/glide/issues/88'), undefined);
  assert.equal(pullRequestNumber(undefined), undefined);
});

test('a Needs you row leads with its reason, and settled spend is named settled', () => {
  const text = describeItem(core, item('needs_human', { latestShift: { closeReason: 'budget exhausted: pool 8, spent 0, reserved 0.43', closedAt: at } }), false);
  const reason = core.listReason(item('needs_human', { latestShift: { closeReason: 'budget exhausted: pool 8, spent 0, reserved 0.43', closedAt: at } }));
  assert.ok(reason);
  assert.ok(text.description.startsWith(reason.chip), text.description);
  assert.match(text.heading, /^Needs you · /);
  assert.ok(text.lines.some(line => /settled US\$\s0,00/u.test(line)), text.lines.join('\n'));
});

test('a review row names its pull request, and unknown spend is never zero', () => {
  const text = describeItem(core, item('awaiting_review', { pullRequestUrl: 'https://forgejo.example/webgrip/glide/pulls/88', spentUsd: null }), false);
  assert.match(text.description, /PR #88 · bronze/);
  assert.ok(text.lines.some(line => line.includes('settled Not reported')));
});

test('a demo row says it is an illustration and shows no spend', () => {
  const text = describeItem(core, item('awaiting_review'), true);
  assert.match(text.description, /illustration/);
  assert.ok(!text.lines.some(line => /US\$/.test(line)));
  const running = describeRun(core, run(), true);
  assert.ok(!/US\$/.test(running.description));
  assert.match(running.lines.join(' '), /Demo fixture: no model calls or spend/);
});

test('a running row shows the role, Round, elapsed time and the gateway reading so far', () => {
  const text = describeRun(core, run(), false);
  assert.match(text.description.replace(/\s/gu, ' '), /^builder · Round 1 · bronze · .+ · US\$ 0,34 so far$/);
  assert.match(text.lines.join(' '), /Not settled yet/);
  assert.match(describeRun(core, run({ observedUsd: null }), false).lines.join(' '), /Cost so far: Not reported/);
});
