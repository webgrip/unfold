import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activePloegLane, appendPage, cancelDialogMarkup, cancelSummary, detailMarkup, linkLabel, mergeOverviews, ploegLanes, ploegReview, roundLadder, runOrder, runResult, teamOverview, usd2, workItemRef, workMarkup } from '../public/ploeg.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const space = '\u00a0';
const at = '2026-09-20T10:00:00Z';
const later = '2026-09-20T10:14:00Z';
const demoDetail = id => ({ ...structuredClone(ploegDemo.details[id]), demo: true, fetchedAt: at });
const model = (extra = {}) => ({ lane: 'needs_human', team: '', loading: false, refreshing: false, loadingMore: false, detailId: null, detail: null, detailError: null, listHref: '#work', canCancel: true, cancelBusy: false, cancelResult: null, briefOpen: false, sessions: [], userId: 'u1', now: Date.parse('2026-09-20T12:00:00Z'), ...extra });

function detail() {
  const shift = { id: '7', workItemId: '50', team: 'delivery', branch: 'agent/vik-50', round: 2, budgetUsd: 2.5, spentUsd: 1.23456, reservedUsd: 0.005, openedAt: at, closedAt: later, closeReason: 'review_approved' };
  const older = { ...shift, id: '6', branch: 'agent/vik-50', closeReason: 'fix_round_cap_reached' };
  const run = { workItemId: '50', team: 'delivery', state: 'finished', startedAt: at, finishedAt: later, expiresAt: null, summary: '', stuckReason: '', links: [], findings: '', verdict: '', failureReason: null, authorizedUsd: 1, usage: null, costStatus: 'unknown', keyAlias: null };
  return {
    item: { id: '50', provider: 'vikunja', externalId: '50', revision: 'r1', team: 'delivery', state: 'awaiting_review', title: 'Fix rounding', description: '', descriptionMarkdown: 'Round **half-cent** totals.', url: 'https://tracker.test/tasks/50', priority: 1, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: at, updatedAt: at, target: { forge: 'forgejo', owner: 'acme', repo: 'shop', baseBranch: 'main' }, latestShift: shift, lease: null },
    shifts: [shift, older],
    runs: [
      { ...run, id: '14', shiftId: '7', role: 'reviewer', round: 2, writes: false, outcome: 'no_change_needed', verdict: 'approve', findings: 'Looks right. The diff also edits .claude/settings.json and CLAUDE.md.', links: ['https://forge.test/acme/shop/pulls/9'] },
      { ...run, id: '13', shiftId: '7', role: 'builder', round: 1, writes: true, outcome: 'pr_updated', links: ['https://forge.test/acme/shop/pulls/9'] },
      { ...run, id: '12', shiftId: '6', role: 'reviewer', round: 1, writes: false, outcome: 'no_change_needed', verdict: 'request_changes', findings: 'Older Shift finding about AGENTS.md.' },
    ],
    checkpoints: [{ id: '3', workItemId: '50', phase: 'reviewed', branch: 'agent/vik-50', prUrl: '', createdAt: at, nodeName: '', podUid: '' }],
    events: [],
    truncated: { shifts: false, runs: false, checkpoints: false, events: false },
    demo: false,
    fetchedAt: at,
  };
}

function overview(team, items, cursor = null) {
  const lane = state => ({ items: items.filter(item => state === 'all' || item.state === state), nextCursor: cursor && state === 'needs_human' ? cursor : null });
  return { configured: true, available: true, demo: true, teams: ploegDemo.teams, selectedTeam: team, message: 'Illustrative', fetchedAt: at, lanes: Object.fromEntries(ploegLanes.map(({ id }) => [id, lane(id)])) };
}

test('the Ready for review lane is the default only while it holds work, and an explicit choice wins', () => {
  assert.deepEqual(ploegLanes.map(lane => [lane.id, lane.label]), [['awaiting_review', 'Ready for review'], ['needs_human', 'Needs you'], ['leased', 'Running'], ['queued', 'Queued'], ['all', 'All']]);
  const lanes = items => ({ awaiting_review: { items, nextCursor: null }, needs_human: { items: [{ id: '1' }], nextCursor: null } });
  assert.equal(activePloegLane({ ploegLane: null, ploeg: { lanes: lanes([{ id: '2' }]) } }), 'awaiting_review');
  assert.equal(activePloegLane({ ploegLane: null, ploeg: { lanes: lanes([]) } }), 'needs_human');
  assert.equal(activePloegLane({ ploegLane: null, ploeg: null }), 'needs_human');
  assert.equal(activePloegLane({ ploegLane: 'queued', ploeg: { lanes: lanes([{ id: '2' }]) } }), 'queued');
});

test('the Work list has one lane control with counts and rows that link to the Work Item with their lane', () => {
  const items = ploegDemo.items.filter(item => item.team === 'delivery');
  const data = teamOverview(overview('delivery', items));
  const html = workMarkup(model({ data, lane: 'awaiting_review', team: 'delivery' }));
  assert.equal((html.match(/data-action="ploeg-lane"/g) || []).length, 5, 'one lane control, five lanes');
  assert.match(html, /data-action="ploeg-lane" data-id="awaiting_review" aria-pressed="true">Ready for review<span class="count">1<\/span>/);
  assert.match(html, /data-action="ploeg-lane" data-id="needs_human" aria-pressed="false">Needs you<span class="count">4<\/span>/);
  assert.match(html, /<a class="list-row" href="#work\/105\?lane=awaiting_review&amp;team=delivery"[^>]*data-work-row data-id="105"/);
  assert.doesNotMatch(html, /data-id="101"/);
  assert.match(html, /Every Round ran/);
  assert.doesNotMatch(html, /ploeg-metric|panel|ploeg-work-row/, 'no legacy classes');
  const empty = workMarkup(model({ data: { ...data, lanes: { ...data.lanes, awaiting_review: { items: [], nextCursor: null, cursors: {}, partial: false } } }, lane: 'awaiting_review' }));
  assert.match(empty, /No pull requests wait for your review/);
});

test('a needs-you row leads with its reason chip, warns when it is not routed and shows attempts, Round, spend of budget and age', () => {
  const items = ploegDemo.items.filter(item => item.team === 'delivery');
  const html = workMarkup(model({ data: teamOverview(overview('delivery', items)), lane: 'needs_human' }));
  assert.match(html, /<span class="chip" data-tone="attention" title="Every planned Round ran[^"]*"><span>No pull request or changes unresolved<\/span><\/span><span class="chip" data-tone="attention" title="No routing rule[^"]*">[^]*?<span>Not routed<\/span>/);
  assert.match(html, /Reviewer still wants changes/);
  assert.match(html, /Cluster kept stopping the writer/);
  assert.match(html, /4 attempts<\/span><span>Round 4<\/span>/);
  assert.match(html, new RegExp(`<span class="num">US\\$${space}3,00</span> budget`), 'demo rows show the budget, never invented spend');
  assert.doesNotMatch(html, new RegExp(`US\\$${space}0,00 of`));
  assert.match(html, /<span class="sr-only">Updated <\/span><time class="num" datetime=/);
  assert.doesNotMatch(html, /Needs you<\/span><span class="chip"/, 'no repeated lane badge in a single-state lane');
  const all = workMarkup(model({ data: teamOverview(overview('delivery', items)), lane: 'all' }));
  assert.match(all, /<span class="state-badge"><span class="badge" data-tone="attention" data-state="needs_human">[^]*?Needs you<\/span><span class="state-reason" data-tone="attention">Reviewer still wants changes<\/span>/, 'the All lane shows each state with its reason');
});

test('All teams merges one overview per Team in id order, keeps each Team’s cursor and reports a Team that failed', () => {
  const delivery = overview('delivery', ploegDemo.items.filter(item => item.team === 'delivery'), 'c-delivery');
  const research = overview('research', ploegDemo.items.filter(item => item.team === 'research'));
  const merged = mergeOverviews([{ team: 'delivery', data: delivery }, { team: 'research', data: research }]);
  assert.equal(merged.available, true);
  assert.equal(merged.allTeams, true);
  assert.deepEqual(merged.lanes.needs_human.items.map(item => item.id), ['101', '108', '109', '110', '111', '112']);
  assert.deepEqual(merged.lanes.needs_human.cursors, { delivery: 'c-delivery' });
  assert.equal(merged.lanes.needs_human.partial, true);
  assert.equal(merged.lanes.queued.partial, false);
  assert.deepEqual(merged.errors, []);
  const html = workMarkup(model({ data: merged, lane: 'needs_human' }));
  assert.match(html, /<span class="count">6\+<\/span>/);
  assert.match(html, /Showing the first page of each Team\./);
  assert.match(html, /data-action="ploeg-more"/);
  assert.match(html, /research · DEMO-10/, 'rows name their Team when all Teams show');
  const failed = mergeOverviews([{ team: 'delivery', data: delivery }, { team: 'research', error: { message: 'Ploeg did not answer.' } }]);
  assert.deepEqual(failed.errors, [{ team: 'research', message: 'Ploeg did not answer.' }]);
  assert.match(workMarkup(model({ data: failed })), /Could not read Team research/);
  const none = mergeOverviews([{ team: 'delivery', error: { message: 'down' } }, { team: 'research', error: { message: 'down' } }]);
  assert.equal(none.available, false);
  assert.match(workMarkup(model({ data: none })), /Could not load Work[^]*down[^]*data-action="ploeg-refresh"/);
});

test('loading more appends only new items and forgets a Team whose pages ran out', () => {
  const page = { items: [{ id: '2' }, { id: '10' }], nextCursor: 'a', cursors: { delivery: 'a', research: 'b' }, partial: true };
  const next = appendPage(page, 'delivery', { items: [{ id: '10' }, { id: '4' }], nextCursor: null });
  assert.deepEqual(next.items.map(item => item.id), ['2', '4', '10']);
  assert.deepEqual(next.cursors, { research: 'b' });
  assert.equal(next.partial, true);
  assert.equal(appendPage(next, 'research', { items: [], nextCursor: null }).partial, false);
  const single = teamOverview(overview('delivery', [], 'c1'));
  assert.deepEqual(single.lanes.needs_human.cursors, { delivery: 'c1' });
  assert.equal(single.allTeams, false);
});

test('a Work Item is referred to by its tracker key', () => {
  assert.equal(workItemRef({ id: '28', provider: 'vikunja', externalId: '624' }), 'Vikunja #624');
  assert.equal(workItemRef({ id: '101', provider: 'demo', externalId: 'DEMO-1' }), 'DEMO-1');
  assert.equal(workItemRef({ id: '106', provider: 'ploeg', externalId: 'run-53-1' }), 'From Run 53');
  assert.equal(workItemRef({ id: '7', provider: 'manual', externalId: '' }), '#7');
});

test('the review projection reads the latest Shift: pull request, branch, runs by Round, findings, verdict, spend, time and close reason', () => {
  const review = ploegReview(detail());
  assert.equal(review.pullRequestUrl, 'https://forge.test/acme/shop/pulls/9');
  assert.equal(review.pullRequestNumber, '9');
  assert.equal(review.branch, 'agent/vik-50');
  assert.equal(review.closeReason, 'review_approved');
  assert.match(review.closeMeaning, /not a human review/);
  assert.deepEqual(review.runs.map(run => [run.role, run.round, run.outcome, run.verdict]), [['builder', 1, 'pr_updated', ''], ['reviewer', 2, 'no_change_needed', 'approve']]);
  assert.deepEqual(review.findings.map(finding => [finding.role, finding.round, finding.verdict]), [['reviewer', 2, 'approve']]);
  assert.equal(review.verdict, 'approve');
  assert.equal(review.rounds, 2);
  assert.equal(review.seconds, 840);
  assert.deepEqual(review.spend, { authorizedUsd: 2.5, reservedUsd: 0.005, settledUsd: 1.23456 });
  assert.deepEqual(review.instructionFiles, ['CLAUDE.md', '.claude/'], 'only the latest Shift findings are scanned');
  assert.equal(review.truncated, false);
});

test('a checkpoint pull request link wins over Run links, and a missing link is reported as missing', () => {
  const withCheckpoint = detail();
  withCheckpoint.checkpoints.unshift({ ...withCheckpoint.checkpoints[0], id: '4', prUrl: 'https://forge.test/acme/shop/pulls/10' });
  assert.equal(ploegReview(withCheckpoint).pullRequestUrl, 'https://forge.test/acme/shop/pulls/10');
  const none = detail();
  for (const run of none.runs) run.links = ['https://tracker.test/tasks/50'];
  assert.equal(ploegReview(none).pullRequestUrl, '');
  const html = detailMarkup(none, model({ detailId: '50' }));
  assert.match(html, /No pull request link reported/);
  assert.match(html, /Find it on the forge by its branch/);
  assert.doesNotMatch(html, /Open pull request/);
});

test('a ready-for-review item gets an evidence receipt, a checklist that is never green for unknowns, and what the forge actions do', () => {
  const html = detailMarkup(detail(), model({ detailId: '50', lane: 'awaiting_review' }));
  assert.match(html, /<h3 class="card-title" id="work-decision-title">[^]*Ready for your review<\/h3>/);
  assert.match(html, /<a class="button primary" href="https:\/\/forge.test\/acme\/shop\/pulls\/9" target="_blank" rel="noopener noreferrer">[^]*Open pull request/);
  assert.equal((html.match(/>Open pull request</g) || []).length, 2, 'the header link and the phone action bar; CSS shows one');
  assert.match(html, /Agent review[^]*Approved/);
  assert.match(html, /<dt>Time<\/dt><dd><span class="num">14 min<\/span>/);
  assert.match(html, /Pull request #9 reported by the writer/);
  assert.match(html, /The agent reviewer approved[^]*Agent review is evidence, not a human review\./);
  assert.match(html, new RegExp(`Within its US\\$${space}2,50 budget`));
  assert.match(html, /data-tone="neutral"><span class="work-check-icon" aria-hidden="true">[^]*CI checks: not reported/, 'CI is never shown green');
  assert.match(html, /Findings name instruction files[^]*<code>CLAUDE\.md<\/code> <code>\.claude\/<\/code>/);
  assert.match(html, /<dt>Merge<\/dt><dd>Ploeg marks the Work Item Done\.<\/dd>[^]*<dt>Request changes<\/dt>[^]*<dt>Close without merging<\/dt><dd>The Work Item comes back to you as Needs you\.<\/dd>/);
  assert.match(html, new RegExp(`<strong class="meter-value">US\\$${space}1,23</strong>`), 'money in nl-NL with two decimals');
  assert.doesNotMatch(html, /<form|style=/);
  assert.equal(usd2(0), '$0.00');
});

test('a needs-you item explains why with Ploeg’s own words, the evidence Runs and what to do in the tracker', () => {
  const html = detailMarkup(demoDetail('109'), model({ detailId: '109' }));
  assert.match(html, /Why this needs you/);
  assert.match(html, /<p class="work-decision-headline">Reviewer still wants changes<\/p>/);
  assert.match(html, /“the reviewer kept asking for changes and the fix-round cap was reached; a person is asked to take over”/);
  assert.match(html, /data-action="work-run" data-id="44"/);
  assert.match(html, /Read the findings\. Finish the branch by hand, or sharpen the ticket\.[^]*Then assign the task to the Team again in Vikunja\./);
  assert.match(html, /Starting again from Vloer is proposed Ploeg work\./);
  assert.doesNotMatch(html, /Open the task in|>Open Vikunja</, 'no tracker link when Ploeg reported none');
  const linked = demoDetail('109');
  linked.item.url = 'https://tracker.test/tasks/9';
  assert.match(detailMarkup(linked, model({ detailId: '109' })), /<a class="work-inline-link" href="https:\/\/tracker.test\/tasks\/9" target="_blank" rel="noopener noreferrer">Open the task in Vikunja/);
  assert.match(detailMarkup(demoDetail('109'), model({ detailId: '109', trackerUrl: 'https://tracker.test/' })), />Open Vikunja</, 'only the tracker root is known, so the link says so');
  const unrouted = detailMarkup(demoDetail('108'), model({ detailId: '108' }));
  assert.match(unrouted, /<div class="work-warning" data-tone="attention">[^]*<strong>Not routed\.<\/strong>/);
  const stuck = detailMarkup(demoDetail('111'), model({ detailId: '111' }));
  assert.match(stuck, /Agent is stuck[^]*The builder reported that it cannot finish in Round 2 without a person\./);
  assert.match(stuck, /<details class="work-run" id="work-run-28" data-tone="attention" open>/, 'the stuck Run opens by default');
});

test('the Round ladder is Roles by Rounds with retries counted, and Runs list failures first', () => {
  const ladder = roundLadder(ploegDemo.details['109'].runs);
  assert.deepEqual(ladder.roles, ['implementer', 'reviewer']);
  assert.deepEqual(ladder.rounds, [1, 2, 3, 4]);
  assert.deepEqual(ladder.cells.reviewer[2].map(run => run.id), ['42']);
  assert.deepEqual(ladder.cells.implementer[2], []);
  assert.equal(ladder.writes.implementer, true);
  assert.equal(roundLadder(ploegDemo.details['112'].runs).cells.implementer[1].length, 10);
  const html = detailMarkup(demoDetail('112'), model({ detailId: '112' }));
  assert.match(html, /10 tries/);
  assert.match(html, /Show 2 more Runs/);
  const mixed = [{ id: '5', state: 'finished', outcome: 'pr_opened' }, { id: '6', state: 'running', outcome: '' }, { id: '3', state: 'finished', outcome: 'failed', failureReason: 'infra_node' }, { id: '4', state: 'finished', outcome: 'stuck' }];
  assert.deepEqual(runOrder(mixed).map(run => run.id), ['4', '3', '6', '5']);
});

test('a Run reads as its verdict when it reviewed and as its outcome when it wrote; a Run cancelled before it started says so', () => {
  assert.equal(runResult({ state: 'finished', writes: false, verdict: 'request_changes', outcome: 'no_change_needed' }).label, 'Changes requested');
  assert.equal(runResult({ state: 'finished', writes: false, verdict: 'request_changes' }).title, 'Agent review: changes requested');
  assert.equal(runResult({ state: 'finished', writes: true, outcome: 'pr_opened' }).label, 'Opened a pull request');
  assert.equal(runResult({ state: 'running' }).label, 'Running');
  assert.equal(runResult(ploegDemo.details['110'].runs[0]).label, 'Cancelled before it started');
  assert.equal(linkLabel('https://forge.test/acme/shop/pulls/9'), 'Pull request #9');
  assert.equal(linkLabel('https://gitlab.test/a/b/-/merge_requests/3'), 'Pull request #3');
  assert.equal(linkLabel('https://forge.test/acme/shop/issues/2'), 'Issue #2');
  assert.equal(linkLabel('https://forge.test/acme/shop/commit/abcdef1234'), 'Commit abcdef1');
  assert.equal(linkLabel('javascript:alert(1)'), '');
});

test('demo spend is never invented and unknown live spend is never zero', () => {
  const demo = detailMarkup(demoDetail('105'), model({ detailId: '105', lane: 'awaiting_review' }));
  assert.match(demo, /Demo · no model calls/);
  assert.doesNotMatch(demo, new RegExp(`US\\$${space}0,00`));
  assert.match(demo, /<code>AGENTS\.md<\/code>/);
  assert.match(demo, /No verdict/);
  const unknown = detail();
  unknown.shifts[0].spentUsd = null;
  const html = detailMarkup(unknown, model({ detailId: '50' }));
  assert.match(html, /Spend not reported/);
  assert.match(html, /<span class="meter-value">Not reported<\/span>/);
});

test('untrusted text from the tracker, agents and Ploeg stays inert everywhere on the page', () => {
  const hostile = detail();
  const attack = '<img src=x onerror=alert(1)>';
  hostile.item.title = attack;
  hostile.item.descriptionMarkdown = `${attack}\n\n[x](javascript:alert(1))`;
  hostile.runs[0].findings = attack;
  hostile.runs[0].summary = attack;
  hostile.runs[0].stuckReason = attack;
  hostile.runs[0].links = ['javascript:alert(1)', 'https://forge.test/"onmouseover="x'];
  hostile.events = [{ id: '1', at, actor: attack, action: attack, workItemId: '50', team: 'delivery', detail: { reason: attack } }];
  hostile.item.url = 'javascript:alert(1)';
  const html = detailMarkup(hostile, model({ detailId: '50' }));
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /"onmouseover=/);
  assert.doesNotMatch(cancelDialogMarkup(hostile), /<img/);
});

test('every demo Work Item renders its title as the focus target, with no inline styles', () => {
  for (const id of Object.keys(ploegDemo.details)) {
    const current = demoDetail(id);
    current.item.descriptionMarkdown = current.item.description;
    const html = workMarkup(model({ data: teamOverview(overview('delivery', ploegDemo.items.filter(item => item.team === 'delivery'))), detailId: id, detail: current }));
    assert.match(html, /<h2 class="work-detail-title" id="ploeg-item-title" tabindex="-1">/, id);
    assert.doesNotMatch(html, /style=|<script/, id);
  }
});

test('Cancel is offered to operators on live work only, and its dialog lists what Ploeg does', () => {
  const live = detail();
  live.item.state = 'needs_human';
  live.runs[0].state = 'running';
  assert.match(detailMarkup(live, model({ detailId: '50' })), /data-action="work-cancel" data-id="50"/);
  assert.doesNotMatch(detailMarkup(live, model({ detailId: '50', canCancel: false })), /work-cancel/, 'viewers get no Cancel button');
  assert.doesNotMatch(detailMarkup(demoDetail('114'), model({ detailId: '114' })), /work-cancel/, 'done work cannot be cancelled');
  const dialog = cancelDialogMarkup(live);
  assert.match(dialog, /<h2 id="confirm-title">Cancel this Work Item\?<\/h2>/);
  assert.match(dialog, /Stops 1 running Run\./);
  assert.match(dialog, /Blocks the model keys of those Runs/);
  assert.match(dialog, /Revokes the forge tokens/);
  assert.match(dialog, /Comments on the task in Vikunja/);
  assert.match(dialog, /This cannot be undone/);
  assert.match(dialog, /<button type="submit" class="button secondary" value="keep" autofocus>Keep it<\/button><button type="submit" class="button danger" value="cancel">Cancel Work Item<\/button>/);
  const demo = cancelDialogMarkup(demoDetail('109'), { demo: true });
  assert.match(demo, /Not available in the demo/);
  assert.match(demo, /value="cancel" disabled>Cancel Work Item/);
});

test('the cancel result reads Ploeg’s fields and never turns a missing one into zero', () => {
  const done = cancelSummary({ state: 'withdrawn', demo: false, withdrawn: true, cancelledRuns: 1, stoppedRuns: 2, keysBlocked: false, message: '' });
  assert.equal(done.title, 'Cancelled. Ploeg withdrew the Work Item.');
  assert.deepEqual(done.lines, ['Runs stopped: 2', 'Runs cancelled before they started: 1', 'Ploeg has not confirmed the model key block yet. Its sweep retries it.']);
  const older = cancelSummary({ state: 'needs_human', demo: false, withdrawn: null, cancelledRuns: null, stoppedRuns: null, keysBlocked: null, message: '' });
  assert.deepEqual(older.lines, ['Runs stopped: not reported', 'Runs cancelled before they started: not reported', 'Model key block: not reported.']);
  assert.match(cancelSummary({ state: 'queued', demo: false, withdrawn: false, cancelledRuns: 0, stoppedRuns: 0, keysBlocked: true, message: '' }).title, /Nothing was running\. The Work Item stays Queued\./);
  assert.equal(cancelSummary({ state: 'leased', demo: true, message: 'Illustrative demo record. Nothing was cancelled.' }).lines[0], 'Illustrative demo record. Nothing was cancelled.');
});

test('the detail shows a skeleton while loading and says so when the Work Item is not in your Teams', () => {
  const data = teamOverview(overview('delivery', []));
  assert.match(workMarkup(model({ data, detailId: '9' })), /<div class="work-detail work-detail-loading" aria-busy="true">/);
  const missing = workMarkup(model({ data, detailId: '999', detailError: { message: 'not found', code: 'ploeg_not_found' }, listHref: '#work?lane=needs_human' }));
  assert.match(missing, /This Work Item is not in your Teams/);
  assert.match(missing, /href="#work\?lane=needs_human"/);
  assert.doesNotMatch(missing, /work-detail-retry/);
  assert.match(workMarkup(model({ data, detailId: '9', detailError: { message: 'Ploeg did not answer.', code: 'ploeg_unavailable' } })), /data-action="work-detail-retry"/);
  assert.match(workMarkup(model({ data: null })), /aria-busy="true" aria-label="Loading Work Items"/);
});
