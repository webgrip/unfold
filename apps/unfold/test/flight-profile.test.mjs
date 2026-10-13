import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flightMarkup, flightPlan, flightSvg, phaseWords, timeRibbon } from '../public/core/flight-profile.js';
import { detailMarkup } from '../public/ploeg.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const now = Date.parse('2026-10-12T02:00:00Z');
const base = { workItemId: '1993', team: 'bronze', expiresAt: null, summary: '', stuckReason: '', links: [], findings: '', verdict: '', failureReason: null, authorizedUsd: 1, usage: null, costStatus: 'unknown', keyAlias: null, outcome: null };
const shift = (id, openedAt, closedAt = null, closeReason = '') => ({ id, workItemId: '1993', team: 'bronze', branch: 'agent/1993', round: 2, budgetUsd: 8, spentUsd: 0, reservedUsd: 0, openedAt, closedAt, closeReason });
const run = (id, shiftId, role, round, writes, extra = {}) => ({ ...base, id, shiftId, role, round, writes, state: 'finished', startedAt: '2026-10-12T00:50:00Z', finishedAt: '2026-10-12T01:19:00Z', ...extra });
const item = (state, extra = {}) => ({ id: '1993', provider: 'vikunja', externalId: '1993', revision: 'r', team: 'bronze', state, title: 'Grace period', description: '', url: '', priority: 1, attempts: 0, infraFailures: 0, nextEligibleAt: null, createdAt: '2026-10-12T00:49:00Z', updatedAt: '2026-10-12T01:30:00Z', target: null, latestShift: null, lease: null, ...extra });
const detail = (state, shifts, runs, extra = {}) => ({ item: item(state, extra), shifts, runs, checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false } });
const marks = plan => plan.legs.flatMap(leg => leg.type === 'round' ? leg.nodes : [leg]);
const current = plan => marks(plan).filter(mark => mark.current);

test('a queued Work Item waits at the gate with the mark there', () => {
  const plan = flightPlan({ detail: detail('queued', [], []), now });
  assert.equal(plan.phase, 'gate');
  assert.deepEqual(plan.legs.map(leg => leg.type), ['gate', 'land', 'taxi', 'taxi', 'arrive']);
  assert.deepEqual(current(plan).map(mark => mark.id), ['gate']);
});

test('a reviewer retrying after machine failures is one waypoint with its tries against the limit of ten', () => {
  const runs = [
    run('1', '9', 'builder', 1, true, { outcome: 'pr_opened', costStatus: 'observed', usage: { costUsd: 0.23 } }),
    run('2', '9', 'reviewer', 2, false, { failureReason: 'infra_node', startedAt: '2026-10-12T01:20:00Z', finishedAt: '2026-10-12T01:20:30Z' }),
    run('3', '9', 'reviewer', 2, false, { failureReason: 'infra_node' }),
    run('4', '9', 'reviewer', 2, false, { failureReason: 'infra_node' }),
    run('5', '9', 'reviewer', 2, false, { state: 'running', startedAt: '2026-10-12T01:54:00Z', finishedAt: null }),
  ];
  const plan = flightPlan({ detail: detail('leased', [shift('9', '2026-10-12T00:50:00Z')], runs), now });
  assert.equal(plan.phase, 'air');
  const reviewer = plan.legs.find(leg => leg.type === 'round' && leg.nodes[0].role === 'Reviewer').nodes[0];
  assert.deepEqual({ tries: reviewer.tries, limit: reviewer.limit, status: reviewer.status, current: reviewer.current, runId: reviewer.runId }, { tries: ['failed', 'failed', 'failed', 'running'], limit: 10, status: 'running', current: true, runId: '5' });
  assert.match(reviewer.meta, /^try 4 · 6 min so far$/);
  const builder = plan.legs.find(leg => leg.type === 'round').nodes[0];
  assert.deepEqual([builder.meta, builder.chip.text], ['29 min · US$\u00a00,23', 'pull request opened']);
});

test('a writer Round after changes were requested is a fix round, and two readers in one Round fly side by side', () => {
  const runs = [
    run('1', '9', 'analyst', 1, false), run('2', '9', 'tests', 1, false),
    run('3', '9', 'builder', 2, true, { outcome: 'pr_opened' }),
    run('4', '9', 'reviewer', 3, false, { verdict: 'request_changes' }),
    run('5', '9', 'builder', 4, true, { outcome: 'pr_updated' }),
    run('6', '9', 'reviewer', 5, false, { verdict: 'approve' }),
  ];
  const plan = flightPlan({ detail: detail('leased', [shift('9', '2026-10-12T00:50:00Z')], runs), now });
  const rounds = plan.legs.filter(leg => leg.type === 'round');
  assert.deepEqual(rounds.map(leg => [leg.nodes.map(node => node.role).join('+'), leg.fix]), [['Analyst+Tests', ''], ['Builder', ''], ['Reviewer', ''], ['Builder', 'holding · fix 1'], ['Reviewer', '']]);
  assert.deepEqual(rounds[2].nodes[0].chip, { text: 'changes requested', tone: 'attention' });
});

test('a pull request ready for review lands, and its review is the current step; a production deploy is the arrival', () => {
  const runs = [run('1', '9', 'builder', 1, true, { outcome: 'pr_opened' }), run('2', '9', 'reviewer', 2, false, { verdict: 'approve' })];
  const play = { number: 303, url: 'https://forge.test/pulls/303', state: 'open', shiftId: '9', changedFiles: 2, additions: 18, deletions: 10, ci: { state: 'success', checks: [], headSha: 'a', capturedAt: null }, reviews: [] };
  const waiting = flightPlan({ detail: detail('awaiting_review', [shift('9', '2026-10-12T00:50:00Z', '2026-10-12T01:30:00Z')], runs), card: { plays: [play] }, now });
  assert.equal(waiting.phase, 'taxi');
  assert.deepEqual(waiting.legs.slice(-5).map(leg => [leg.type, leg.role, leg.status]), [['land', 'PR #303', 'done'], ['taxi', 'Checks', 'done'], ['taxi', 'Your review', 'you'], ['taxi', 'Merge', 'ahead'], ['arrive', 'Production', 'ahead']]);
  assert.equal(waiting.legs.find(leg => leg.type === 'land').meta, '2 files · +18 −10');
  assert.deepEqual(current(waiting).map(mark => mark.id), ['review']);
  const shipped = { ...play, state: 'merged', mergedBy: 'Ryan', reviews: [{ reviewer: 'Ryan', state: 'approved' }], deployments: [{ environment: 'homelab', sha: 'abc1234def', firstDeployedAt: '2026-10-12T03:00:00Z' }, { environment: 'production', sha: 'abc1234def', firstDeployedAt: '2026-10-12T04:00:00Z' }] };
  const arrived = flightPlan({ detail: detail('done', [shift('9', '2026-10-12T00:50:00Z', '2026-10-12T01:30:00Z')], runs), card: { plays: [shipped], deployments: [] }, now });
  assert.equal(arrived.phase, 'arrived');
  assert.deepEqual(arrived.legs.slice(-3).map(leg => [leg.role, leg.status, leg.meta]), [['Merge', 'done', 'Ryan'], ['Homelab', 'done', 'deployed abc1234'], ['Production', 'done', 'deployed abc1234']]);
  assert.deepEqual(current(arrived).map(mark => mark.id), ['arrive']);
});

test('checks that failed after landing send a repair Shift around again', () => {
  const runs = [run('1', '9', 'builder', 1, true, { outcome: 'pr_opened' }), run('2', '9', 'reviewer', 2, false, { verdict: 'approve' }), run('3', '10', 'repair', 1, true, { outcome: 'pr_updated' })];
  const plays = [{ number: 7, url: '', state: 'open', shiftId: '9', ci: { state: 'failure' }, reviews: [] }, { number: 7, url: '', state: 'open', shiftId: '10', ci: { state: 'success' }, reviews: [] }];
  const plan = flightPlan({ detail: detail('awaiting_review', [shift('9', '2026-10-12T00:50:00Z', '2026-10-12T01:00:00Z'), shift('10', '2026-10-12T01:10:00Z', '2026-10-12T01:20:00Z')], runs), card: { plays }, now });
  assert.deepEqual(plan.legs.map(leg => leg.type === 'round' ? `round:${leg.nodes[0].role}` : leg.type), ['gate', 'takeoff', 'round:Builder', 'round:Reviewer', 'land', 'taxi', 'goaround', 'round:Repair', 'land', 'taxi', 'taxi', 'taxi', 'arrive']);
  assert.equal(plan.legs.find(leg => leg.type === 'goaround').label, 'go-around · checks failed');
});

test('a writer that failed three times on its own diverts to Needs you', () => {
  const runs = ['1', '2', '3'].map(id => run(id, '9', 'writer', 1, true, { failureReason: 'agent_error', outcome: 'failed' }));
  const plan = flightPlan({ detail: detail('needs_human', [shift('9', '2026-10-12T00:50:00Z', '2026-10-12T01:00:00Z', 'writing_run_failed_repeatedly')], runs), now });
  assert.equal(plan.phase, 'diverted');
  const writer = plan.legs.find(leg => leg.type === 'round').nodes[0];
  assert.deepEqual([writer.status, writer.limit, writer.tries.length], ['failed', 3, 3]);
  assert.deepEqual(plan.legs.at(-1), { type: 'divert', id: 'divert', role: 'Needs you', status: 'you', meta: 'stopped', current: true });
});

test('a session-driven Work Item flies the session\'s own steps and holds for the person to clear the landing', () => {
  const session = { id: 'sess-187', status: 'completed', createdAt: '2026-10-11T18:52:00Z', updatedAt: '2026-10-11T18:56:00Z', execution: { workItemId: '187' }, candidate: { status: 'ready', files: 1 }, costStatus: 'observed',
    runs: [
      { id: 'r1', roleId: 'implementer', roleName: 'Implementer', mode: 'write', status: 'completed', startedAt: '2026-10-11T18:53:00Z', finishedAt: '2026-10-11T18:54:00Z', summary: 'Done.' },
      { id: 'r2', roleId: 'reviewer', roleName: 'Reviewer', mode: 'read', status: 'completed', verdict: 'approve', startedAt: '2026-10-11T18:55:00Z', finishedAt: '2026-10-11T18:55:20Z', summary: 'VERDICT: approve' },
    ] };
  const ploeg = { ...detail('done', [shift('162', '2026-10-11T18:52:53Z', '2026-10-11T18:55:57Z', 'operator_completed')], [run('291', '162', 'operator', 0, true, { costStatus: 'observed', usage: { costUsd: 0.01 } })]) };
  ploeg.item.id = '187';
  const plan = flightPlan({ detail: ploeg, sessions: [session], now, publisher: true });
  const rounds = plan.legs.filter(leg => leg.type === 'round').map(leg => leg.nodes[0]);
  assert.deepEqual(rounds.map(node => [node.role, node.kind]), [['Implementer', 'writer'], ['Reviewer', 'reader']]);
  assert.deepEqual(rounds[1].chip, { text: 'approved', tone: 'success' });
  assert.equal(plan.phase, 'holding');
  assert.deepEqual(current(plan).map(mark => mark.id), ['hold']);
  assert.equal(plan.legs.find(leg => leg.type === 'land').meta, 'opened by the Unfold bot');
  const rejected = flightPlan({ detail: ploeg, sessions: [{ ...session, review: { decision: 'rejected', byName: 'Ryan' } }], now });
  assert.deepEqual(rejected.legs.at(-1), { type: 'arrive', id: 'arrive', role: 'Done', status: 'done', meta: 'change rejected', current: true });
});

test('the SVG uses classes only, opens each Run from its waypoint and draws the mark once at the current position', () => {
  const runs = [run('1', '9', 'builder', 1, true, { outcome: 'pr_opened' }), run('2', '9', 'reviewer', 2, false, { state: 'running', finishedAt: null })];
  const plan = flightPlan({ detail: detail('leased', [shift('9', '2026-10-12T00:50:00Z')], runs), now });
  const { svg, width } = flightSvg(plan);
  assert.doesNotMatch(svg, /style=|<script/);
  assert.match(svg, /data-action="work-run" data-id="1"/);
  assert.match(svg, /data-action="work-run" data-id="2"/);
  assert.equal(svg.match(/<use href="#flight-mark"/g).length, 1);
  assert.equal(svg.match(/data-current/g).length, 1);
  assert.ok(width > 600);
  const html = flightMarkup(plan, { stats: { beforeFirstRun: 60, agents: 1800, ci: null, review: 3600, deploy: null } });
  assert.match(html, new RegExp(phaseWords.air[0]));
  assert.match(html, /Where the time went/);
  assert.equal(flightMarkup({ phase: 'gate', legs: [] }), '');
});

test('the time ribbon draws each figure to scale and skips the empty ones', () => {
  const html = timeRibbon({ beforeFirstRun: 100, agents: 300, ci: 0, review: 600, deploy: null });
  assert.match(html, /data-part="gate" x="0\.000%" y="0" width="10\.000%"/);
  assert.match(html, /data-part="agents" x="10\.000%" y="0" width="30\.000%"/);
  assert.match(html, /data-part="review" x="40\.000%" y="0" width="60\.000%"/);
  assert.doesNotMatch(html, /data-part="ci"|data-part="deploy"|style=/);
  assert.equal(timeRibbon({}), '');
});

test('with the flag on the Work Item page draws the flight instead of the stage strip, for every demo Work Item', () => {
  const model = extra => ({ lane: 'all', team: '', loading: false, refreshing: false, loadingMore: false, detailId: null, detail: null, detailError: null, listHref: '#work', canCancel: true, cancelBusy: false, cancelResult: null, briefOpen: false, sessions: [], userId: 'u1', now, ...extra });
  for (const [id, recorded] of Object.entries(ploegDemo.details)) {
    const demo = { ...structuredClone(recorded), demo: true };
    const on = detailMarkup(demo, model({ detailId: id, flags: { 'work.flight-profile': true } }));
    assert.match(on, /class="flight"/, id);
    assert.doesNotMatch(on, /class="work-stages"/, id);
    assert.doesNotMatch(on, /style=|<script/, id);
    const off = detailMarkup(demo, model({ detailId: id, flags: { 'work.flight-profile': false } }));
    assert.match(off, /class="work-stages"/, id);
    assert.doesNotMatch(off, /class="flight"/, id);
  }
});
