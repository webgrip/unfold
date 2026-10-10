import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from '../src/core.ts';
import { readFileSync } from 'node:fs';
import { describeItem, describeRun, describeSession, groupTruncated, linkedWorkItems, nowGroup, pullRequestNumber, sessionRows, statusSummary, waitingCount } from '../src/now.ts';
import type { PloegNow, PloegNowItem, PloegRunRow } from '../src/ploeg-types.ts';
import type { Session } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('../../../test/fixtures/session-059675b9.json', import.meta.url), 'utf8'));

const core = await loadCore(new URL('../media/core/', import.meta.url));
const at = new Date(Date.now() - 3_600_000).toISOString();
const item = (state: string, extra: Partial<PloegNowItem> = {}): PloegNowItem => ({ id: '42', team: 'bronze', state, title: 'unfold: show one provisional total', url: 'https://vikunja.example/tasks/1694', createdAt: at, updatedAt: at, provider: 'vikunja', externalId: '1694', priority: 4, attempts: 1, infraFailures: 0, target: null, closeReason: null, latestShift: null, spentUsd: 0, pullRequestUrl: '', ...extra });
const run = (extra: Partial<PloegRunRow> = {}): PloegRunRow => ({ id: '7', workItemId: '42', workItemTitle: 'unfold: show one provisional total', externalRef: 'VIK-1694', team: 'bronze', role: 'builder', round: 1, writes: true, state: 'running', outcome: '', verdict: '', failureReason: '', startedAt: new Date(Date.now() - 125_000).toISOString(), finishedAt: null, durationSeconds: null, authorizedUsd: 8, settledUsd: null, observedUsd: 0.34, ...extra });
const now = (waiting: PloegNowItem[], running: PloegRunRow[] = []): PloegNow => ({ demo: false, teams: ['bronze'], waiting, running, recent: [], runningTruncated: false, recentTruncated: false, errors: {}, fetchedAt: at });

test('Now groups waiting work as the browser does: review, then needs you (stopped retrying included), then proposed', () => {
  assert.equal(nowGroup(item('awaiting_review')), 'review');
  assert.equal(nowGroup(item('needs_human')), 'needs');
  assert.equal(nowGroup(item('stale')), 'needs');
  assert.equal(nowGroup(item('proposed')), 'proposed');
  assert.equal(nowGroup(item('leased')), undefined);
});

test('the badge counts what waits on a person, each once: review, needs you and sessions that need you, not proposals', () => {
  const value = now([item('awaiting_review'), item('needs_human', { id: '43' }), item('proposed', { id: '44' }), item('needs_human', { id: '184' })]);
  const rows = sessionRows(core, [fixture.session as Session, { ...(fixture.session as Session), id: 'ask', execution: undefined, status: 'waiting_input', blocker: undefined }]);
  assert.equal(waitingCount(value, rows), 4, 'Work Item 184 counts once, as its stopped session');
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

test('the 059675b9 session sits in Needs you as stopped, and replaces Ploeg\'s rows for its Work Item', () => {
  const rows = sessionRows(core, [fixture.session as Session]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].group, 'needs');
  assert.deepEqual([...linkedWorkItems(rows)], ['184']);
  const text = describeSession(core, rows[0], Date.parse(fixture.now));
  assert.match(text.description, /^Stopped · Ploeg holds it for reconciliation · US\$\s0,03 so far · /);
  assert.ok(text.lines.some(line => /^Stopped: /.test(line)));
  const summary = statusSummary(core, now([item('needs_human', { id: '184' })], [run({ workItemId: '184', role: 'operator' })]), rows);
  assert.equal(summary.text, '$(layers) $(bell-dot) 1', 'neither Ploeg\'s needs row nor its running operator Run is counted beside the session');
  assert.equal(summary.warning, true);
  assert.equal(summary.focus, undefined);
});

test('while exactly one session runs, the status bar names its Role and a running clock, and a click follows it', () => {
  const started = Date.parse('2026-10-10T14:39:42.500Z');
  const session = { ...fixture.session, status: 'running', blocker: undefined, runs: [fixture.session.runs[0], fixture.session.runs[1]] } as Session;
  const rows = sessionRows(core, [session], started + 41_000);
  assert.equal(rows[0].group, 'running');
  const summary = statusSummary(core, now([], [run({ workItemId: '184' })]), rows, started + 41_000);
  assert.equal(summary.text, '$(layers) $(sync~spin) Reviewer 0:41');
  assert.equal(summary.focus?.progress.workItemId, '184');
  assert.match(describeSession(core, rows[0], started + 41_000).description, /^Reviewer · 41 s · US\$\s0,03 so far$/);
  const two = statusSummary(core, now([], [run({ workItemId: '9' })]), rows, started);
  assert.equal(two.text, '$(layers) $(sync~spin) 2', 'more than one running thing shows a count');
});

test('a reviewed, cancelled or closed-failed session leaves Now', () => {
  const base = { ...fixture.session, execution: undefined, blocker: undefined } as Session;
  assert.equal(sessionRows(core, [{ ...base, status: 'cancelled' }, { ...base, status: 'completed', review: { decision: 'accepted', by: 'r', byName: 'Ryan', at: fixture.now } }, { ...base, status: 'failed', workItemClosedAt: fixture.now }]).length, 0);
});
