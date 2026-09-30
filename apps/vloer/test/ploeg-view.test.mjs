import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activePloegLane, appendPage, attemptLabel, cancelDialogMarkup, cancelSummary, decisionPlan, detailMarkup, linkLabel, mergeOverviews, ploegLanes, ploegReview, reasonGroups, refreshOverview, reviewFacts, roundLadder, runAttempts, runGroups, runOrder, runResult, teamOverview, workItemRef, workMarkup, writerAccount } from '../public/ploeg.js';
import { detailReason } from '../public/core/reasons.js';
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
  assert.match(html, /<span class="chip" title="Every planned Round ran and no reviewer asked for more changes\.">[^]*?<span>No changes requested<\/span>/, 'a review row says what the reviewer did, not a close-reason code');
  assert.doesNotMatch(html, /Every Round ran/);
  const facts = workMarkup(model({ data, lane: 'awaiting_review', team: 'delivery', reviewFacts: { 105: reviewFacts(demoDetail('105')) } }));
  assert.match(facts, /<span>PR #5 · No agent verdict<\/span>/, 'once the detail is known the row names the pull request and the agent verdict');
  const stale = { 105: { ...reviewFacts(demoDetail('105')), updatedAt: '2000-01-01T00:00:00Z' } };
  assert.doesNotMatch(workMarkup(model({ data, lane: 'awaiting_review', team: 'delivery', reviewFacts: stale })), /PR #5/, 'facts from an older version of the Work Item are not shown');
  assert.doesNotMatch(html, /ploeg-metric|panel|ploeg-work-row/, 'no legacy classes');
  const empty = workMarkup(model({ data: { ...data, lanes: { ...data.lanes, awaiting_review: { items: [], nextCursor: null, cursors: {}, partial: false } } }, lane: 'awaiting_review' }));
  assert.match(empty, /No pull requests wait for your review/);
});

test('the Needs you lane shows flat rows with their reason chip when no reason repeats', () => {
  const items = ploegDemo.items.filter(item => item.team === 'delivery');
  const html = workMarkup(model({ data: teamOverview(overview('delivery', items)), lane: 'needs_human' }));
  assert.match(html, /<ul class="work-groups"><li class="work-flat">/);
  assert.doesNotMatch(html, /class="reason-band"/, 'a reason no other Work Item shares gets no header');
  for (const chip of ['Every Round ran', 'Reviewer still wants changes', 'Cluster kept stopping the writer', 'Needs a decision']) assert.match(html, new RegExp(`<span class="chip" data-tone="attention" title="[^"]*"><span>${chip}</span></span>`), chip);
  assert.match(html, /<span>Not routed<\/span>/, 'the routing warning stays on its row');
  assert.match(html, /<span class="work-row-attempts">4 attempts<\/span><span>Round 4<\/span>/);
  assert.match(html, /class="work-row-facts dots"/, 'row facts join with dots that never start a line');
  assert.doesNotMatch(html, /work-row-spend/, 'demo rows show no budget meter: nothing was spent');
  assert.doesNotMatch(html, new RegExp(`US\\$${space}0,00`));
  assert.match(html, /<span class="sr-only">Updated <\/span><time class="num" datetime=/);
  const all = workMarkup(model({ data: teamOverview(overview('delivery', items)), lane: 'all' }));
  assert.match(all, /<span class="state-badge"><span class="badge" data-tone="attention" data-state="needs_human">[^]*?Needs you<\/span><span class="state-reason" data-tone="attention">Reviewer still wants changes<\/span>/, 'the All lane shows each state with its reason');
  const research = workMarkup(model({ data: teamOverview(overview('research', ploegDemo.items.filter(item => item.team === 'research'))), lane: 'all' }));
  assert.match(research, /data-id="116"[^]*?<span class="badge" data-tone="neutral" data-state="rejected">[^]*?Rejected<\/span>/, 'a rejected proposal is a neutral Rejected, never a green Done');
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
  assert.match(html, /Showing the loaded pages of each Team\./);
  assert.match(html, /data-action="ploeg-more"/);
  assert.match(html, /research · DEMO-10/, 'rows name their Team when all Teams show');
  const failed = mergeOverviews([{ team: 'delivery', data: delivery }, { team: 'research', error: { message: 'Ploeg did not answer.' } }]);
  assert.deepEqual(failed.errors, [{ team: 'research', message: 'Ploeg did not answer.' }]);
  const partial = workMarkup(model({ data: failed }));
  assert.match(partial, /Could not read Team research/);
  assert.match(partial, /The list and its counts leave out Team research\./);
  assert.match(partial, /data-action="ploeg-lane" data-id="needs_human" aria-pressed="true">Needs you<span class="count">4\+<\/span>/, 'counts say they are a lower bound while a Team is missing');
  assert.match(partial, /data-action="ploeg-refresh" data-id="partial">Try again/, 'Try again is told apart from the toolbar Refresh');
  const none = mergeOverviews([{ team: 'delivery', error: { message: 'down' } }, { team: 'research', error: { message: 'down' } }]);
  assert.equal(none.available, false);
  const unavailable = workMarkup(model({ data: none }));
  assert.match(unavailable, /Could not load Work[^]*down[^]*data-action="ploeg-refresh" data-id="unavailable"/);
  assert.doesNotMatch(unavailable, /work-toolbar/, 'no toolbar Refresh beside the card that has its own Try again');
});

test('grouping bands only reasons two or more Work Items share, after the flat rows, largest first', () => {
  const base = ploegDemo.items.find(item => item.id === '108');
  const other = ploegDemo.items.find(item => item.id === '109');
  const items = [{ ...other, id: '2' }, ...['7', '3', '9'].map(id => ({ ...base, id }))];
  const groups = reasonGroups(items);
  assert.deepEqual(groups.map(group => [group.grouped, group.reason.chip, group.items.map(item => item.id)]), [[false, 'Reviewer still wants changes', ['2']], [true, 'Every Round ran', ['7', '3', '9']]]);
  const html = workMarkup(model({ data: teamOverview(overview('delivery', items)), lane: 'needs_human' }));
  assert.match(html, /<li class="work-group" role="group" aria-labelledby="work-group-1"><div class="reason-band" data-tone="attention"><span class="reason-band-icon" aria-hidden="true"><svg[^]*?<\/svg><\/span><h3 class="reason-band-title" id="work-group-1">Every Round ran<span class="reason-band-count num"><span class="sr-only">, <\/span>3<span class="sr-only"> Work Items<\/span><\/span><\/h3><p class="reason-band-fix" title="[^"]+">Open the Work Item to see whether the writer changed nothing or the reviewer still wants changes\.<\/p><\/div>/);
  const band = html.slice(html.indexOf('class="reason-band"'));
  assert.doesNotMatch(band, /<span>Every Round ran<\/span>/, 'rows in a band leave the reason to it');
  assert.match(band, /<span>Not routed<\/span>/, 'rows keep their own routing warning');
});

test('rows show spend only when there is some, or while a Work Item runs, and never in the demo', () => {
  const running = { ...ploegDemo.items.find(item => item.id === '102'), latestShift: { round: 1, budgetUsd: 3, spentUsd: null, reservedUsd: 0.2, closeReason: '' } };
  const spent = { ...ploegDemo.items.find(item => item.id === '109'), latestShift: { round: 4, budgetUsd: 3, spentUsd: 1.25, reservedUsd: 0, closeReason: 'fix_round_cap_reached', closedAt: at } };
  const idle = { ...ploegDemo.items.find(item => item.id === '110'), latestShift: { round: 1, budgetUsd: 3, spentUsd: 0, reservedUsd: 0, closeReason: 'budget exhausted', closedAt: at } };
  const live = { ...teamOverview(overview('delivery', [running, spent, idle])), demo: false };
  const all = workMarkup(model({ data: live, lane: 'all' }));
  assert.match(all, /Not reported of <span class="num">US\$\u00a03,00<\/span>/, 'a running Work Item without a settlement reads Not reported');
  assert.match(all, /<span class="num">US\$\u00a01,25<\/span> of <span class="num">US\$\u00a03,00<\/span>/);
  assert.equal((all.match(/work-row-spend"/g) || []).length, 2, 'the Work Item that spent nothing shows no meter');
});

test('a live refresh keeps the pages Load more added and their deeper cursors', () => {
  const first = teamOverview(overview('delivery', ploegDemo.items.filter(item => item.team === 'delivery'), 'c1'));
  const extended = structuredClone(first);
  extended.lanes.needs_human = appendPage(extended.lanes.needs_human, 'delivery', { items: [{ id: '999', state: 'needs_human', title: 'From page two' }], nextCursor: 'c2' });
  const fresh = teamOverview(overview('delivery', ploegDemo.items.filter(item => item.team === 'delivery' && item.id !== '101'), 'c1'));
  const merged = refreshOverview(extended, fresh);
  assert.deepEqual(merged.lanes.needs_human.items.map(item => item.id), ['108', '109', '112', '999'], 'page one is fresh (101 left the lane) and the Load more item stays');
  assert.deepEqual(merged.lanes.needs_human.cursors, { delivery: 'c2' }, 'the next page continues after the deeper page');
  assert.equal(merged.lanes.queued, fresh.lanes.queued, 'lanes that never loaded more take the fresh page as it is');
  const exhausted = structuredClone(first);
  exhausted.lanes.needs_human = appendPage(exhausted.lanes.needs_human, 'delivery', { items: [{ id: '999', state: 'needs_human' }], nextCursor: null });
  const done = refreshOverview(exhausted, fresh).lanes.needs_human;
  assert.deepEqual([done.partial, done.cursors], [false, {}], 'a Team whose pages ran out stays complete after a refresh');
  assert.equal(refreshOverview(null, fresh), fresh);
  assert.equal(refreshOverview(extended, { available: false }).available, false);
});

test('loading more appends only new items and forgets a Team whose pages ran out', () => {
  const page = { items: [{ id: '2' }, { id: '10' }], nextCursor: 'a', cursors: { delivery: 'a', research: 'b' }, partial: true };
  const next = appendPage(page, 'delivery', { items: [{ id: '10' }, { id: '4' }], nextCursor: null });
  assert.deepEqual(next.items.map(item => item.id), ['2', '4', '10']);
  assert.deepEqual(next.cursors, { research: 'b' });
  assert.equal(next.partial, true);
  assert.deepEqual(next.more, { delivery: ['4'] }, 'the lane remembers what each Team added');
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
  assert.match(html, /<a class="button primary" href="https:\/\/forge.test\/acme\/shop\/pulls\/9" target="_blank" rel="noopener noreferrer" data-link-out="pr">[^]*Open pull request #9/);
  assert.equal((html.match(/>Open pull request #9</g) || []).length, 2, 'the primary action in the review box and in the phone action bar');
  assert.match(html, /<div class="work-sticky-actions" role="group" aria-label="Next step"><a class="button primary"[^>]*>[^]*Open pull request #9/);
  assert.match(html, /<button type="button" class="button ghost work-jump" data-action="work-run" data-id="14">Read the findings/);
  assert.match(html, /Agent review[^]*Agent approved/);
  assert.match(html, /<dt>Time<\/dt><dd><span class="num">14 min<\/span>/);
  assert.match(html, /Pull request #9 reported by the writer/);
  assert.match(html, /The agent reviewer approved[^]*Agent review is evidence, not a human review\./);
  assert.match(html, new RegExp(`Within its US\\$${space}2,50 budget`));
  assert.match(html, /data-tone="neutral"><span class="work-check-icon" aria-hidden="true">[^]*CI checks: not reported/, 'CI is never shown green');
  assert.match(html, /Findings name instruction files[^]*<code>CLAUDE\.md<\/code> <code>\.claude\/<\/code> are named in the findings\. Check them in the diff before you merge\./);
  const titles = [...html.matchAll(/<li class="work-check" data-tone="(\w+)">[^]*?<p class="work-check-title">([^<]*)/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(titles.map(([tone]) => tone), ['attention', 'neutral', 'success', 'success', 'success', 'success'], 'what needs attention comes first, then unknowns, then passes');
  assert.equal(titles[0][1], 'Findings name instruction files');
  assert.match(html, /<dt>Merge<\/dt><dd>Ploeg marks the Work Item Done\.<\/dd>[^]*<dt>Request changes<\/dt>[^]*<dt>Close without merging<\/dt><dd>The Work Item comes back to you as Needs you\.<\/dd>/);
  assert.match(html, new RegExp(`<strong class="meter-value">US\\$${space}1,23</strong>`), 'money in nl-NL with two decimals');
  assert.doesNotMatch(html, /<form|style=/);
});

test('a needs-you item explains why with Ploeg’s own words, the evidence Runs and what to do in the tracker', () => {
  const html = detailMarkup(demoDetail('109'), model({ detailId: '109' }));
  assert.match(html, /Why this needs you/);
  assert.doesNotMatch(html, /work-decision-headline/, 'the reason is said once, in the status line, not again as a box headline');
  assert.equal((html.match(/Reviewer still wants changes/g) || []).length, 1);
  assert.match(html, /“the reviewer kept asking for changes and the fix-round cap was reached; a person is asked to take over”/);
  assert.match(html, /data-action="work-run" data-id="44"/);
  assert.match(html, /Read the findings\. Finish the branch by hand, or sharpen the ticket\.<\/p><div class="work-step-actions"><a class="button primary" href="https:\/\/forge\.example\.invalid\/example\/order-service\/pulls\/7"[^>]*data-link-out="pr">[^]*Open pull request #7[^]*<button type="button" class="button ghost work-jump" data-action="work-run" data-id="44">Read the reviewer’s findings/, 'the step says which button to press: the pull request first, then the findings');
  assert.match(html, /Then assign the task to the Team again in Vikunja\./);
  assert.match(html, /Starting again from Vloer is proposed Ploeg work\./);
  assert.match(html, /<div class="work-sticky-actions" role="group" aria-label="Next step"><a class="button primary"[^>]*>[^]*Open pull request #7/, 'phones carry the same primary action');
  assert.doesNotMatch(html, /Open the task in|>Open Vikunja</, 'no tracker link when Ploeg reported none');
  const linked = demoDetail('109');
  linked.item.url = 'https://tracker.test/tasks/9';
  assert.match(detailMarkup(linked, model({ detailId: '109' })), /<a class="button secondary" href="https:\/\/tracker.test\/tasks\/9" target="_blank" rel="noopener noreferrer" data-link-out="tracker">[^]*Open the task in Vikunja/);
  assert.match(detailMarkup(demoDetail('109'), model({ detailId: '109', trackerUrl: 'https://tracker.test/' })), />Open Vikunja</, 'only the tracker root is known, so the link says so');
  const stuck = detailMarkup(demoDetail('111'), model({ detailId: '111' }));
  assert.match(stuck, /Agent is stuck[^]*The builder reported that it cannot finish in Round 2 without a person\./);
  assert.doesNotMatch(stuck, /work-quote/, 'Ploeg’s sentence repeats the stuck reason the evidence already shows, so it is left out');
  assert.equal((stuck.match(/every source in the repository stops at 2023/g) || []).length, 4, 'once in the evidence, once in the Run body, and in Activity’s quote and raw JSON');
  assert.doesNotMatch(stuck, /<p class="work-run-summary">Illustrative: the brief asks/, 'the Run summary is dropped when the stuck reason already says it');
  assert.match(stuck, /<details class="work-run" id="work-run-28" data-tone="attention">/, 'the Run stays closed: the box already shows why it is stuck');
});

test('plan_exhausted tells no pull request apart from unresolved changes and never quotes Ploeg’s plan-complete sentence', () => {
  const unrouted = demoDetail('108');
  const reason = detailReason(unrouted);
  assert.deepEqual([reason.variant, reason.chip, reason.headline], ['no_pull_request', 'Every Round ran', null], 'the chip matches the list; the sentence tells the case apart');
  assert.equal(reason.sentence, 'Every planned Round ran, but the writer changed nothing, so there is no pull request to review.');
  const html = detailMarkup(unrouted, model({ detailId: '108' }));
  const box = html.slice(html.indexOf('id="work-decision"'), html.indexOf('id="work-brief"'));
  assert.doesNotMatch(box, /plan complete/, 'the misleading sentence stays in Activity only');
  assert.match(html, /<span class="work-event-detail">Plan complete; a person is asked to review and merge<\/span>/, 'Activity keeps Ploeg’s words, in the same form as the Activity page');
  assert.match(box, /<div class="work-warning" data-tone="attention">[^]*<strong>Not routed\.<\/strong>/);
  assert.match(box, /Add a repository label or a routing rule to the task\.<\/p><div class="work-step-actions"><span class="work-find">Find <strong class="mono">DEMO-8<\/strong> in Vikunja<\/span><button type="button" class="button secondary" data-action="work-copy-ref" data-value="DEMO-8">[^]*Copy DEMO-8/, 'without a link the step names the task to find, with a Copy button');
  assert.doesNotMatch(html, /disabled/, 'no disabled primary action');
  assert.match(box, /Ploeg reported no link to this task, so Vloer cannot open it for you\./);
  assert.doesNotMatch(html, /work-sticky-actions/, 'no phone action bar without an action to open');
  unrouted.item.url = 'https://tracker.test/tasks/8';
  const plan = decisionPlan(unrouted, model(), detailReason(unrouted));
  assert.match(plan.entries[0].actions[0], /class="button primary" href="https:\/\/tracker\.test\/tasks\/8"[^]*Open the task in Vikunja/, 'the routing fix opens the task');
  assert.deepEqual(plan.entries.slice(1).map(entry => entry.actions.length), [0, 0], 'the task link is offered once');
  assert.match(plan.primary, /Open the task in Vikunja/);
  const changes = demoDetail('108');
  changes.runs[0].verdict = 'request_changes';
  const unresolved = detailReason(changes);
  assert.deepEqual([unresolved.variant, unresolved.chip], ['changes_unresolved', 'Every Round ran']);
  assert.match(unresolved.sentence, /the last reviewer still asked for changes/);
});

test('a budget stop shows its meter in the decision box and never zero money in the demo', () => {
  const html = detailMarkup(demoDetail('110'), model({ detailId: '110' }));
  const box = html.slice(html.indexOf('id="work-decision"'), html.indexOf('id="work-brief"'));
  assert.match(box, new RegExp(`The Shift’s budget of US\\$${space}0,04 could not pay for the next Round\\.<`));
  assert.match(box, /<div class="work-decision-meter"><div class="meter" data-demo>[^]*Demo · no model calls/);
  assert.doesNotMatch(html, new RegExp(`US\\$${space}0,00`));
  assert.match(box, /Then assign the task to the Team again in its tracker\.<\/p><div class="work-step-actions"><span class="work-find">Find <strong class="mono">DEMO-10<\/strong> in the demo tracker<\/span><button type="button" class="button secondary" data-action="work-copy-ref" data-value="DEMO-10">/, 'the tracker is the next step, named and copyable');
});

test('the page says each thing once: checkpoints fold into Activity, an empty story is one line and failures read as a cause', () => {
  const html = detailMarkup(demoDetail('109'), model({ detailId: '109' }));
  assert.doesNotMatch(html, /work-checkpoints|work-ladder-list/);
  assert.match(html, /<p class="work-detail-facts dots">[^]*data-link-out="pr">[^]*Pull request #7/, 'the pull request is one fact in the header');
  assert.match(html, /Updated <a class="work-inline-link" href="https:\/\/forge\.example\.invalid\/example\/order-service\/pulls\/7"[^>]*>pull request #7/, 'Activity names the pull request once, as a link');
  assert.doesNotMatch(html, /Updated the pull request Pull request/);
  assert.match(html, /<p class="work-run-group">Round 4<\/p>/, 'Runs are grouped by Round for phones');
  assert.match(html, /<span class="work-run-round">Round 4 · <\/span>reader/, 'and name their Round in the row on wide screens');
  const withdrawn = detailMarkup(demoDetail('115'), model({ detailId: '115' }));
  assert.match(withdrawn, /<p class="work-note" id="work-rounds">[^]*The Shift closed <time[^]*before any Run started: the task was unassigned from the Team\./);
  assert.doesNotMatch(withdrawn, /class="card flush" id="work-rounds"/);
  const legacy = detailMarkup(demoDetail('113'), model({ detailId: '113' }));
  assert.match(legacy, /3 Runs, all failed or stuck\. These Runs ran before Shifts existed/);
  assert.match(legacy, /<p class="work-log">Illustrative log tail/, 'a log tail keeps the mono font');
  const killed = detailMarkup(demoDetail('112'), model({ detailId: '112' }));
  assert.match(killed, /Cause: infrastructure, not the agent\. If it keeps happening, check the nodes and the network\./);
  assert.doesNotMatch(killed, /Who to call|retries automatically/, 'Ploeg stopped retrying this Work Item, so the page does not say it retries');
  const stuck = detailMarkup(demoDetail('111'), model({ detailId: '111' }));
  assert.match(stuck, /<p class="work-run-reason">The brief asks for 2026 market sizes/, 'a stuck reason in prose keeps the body font');
});

test('repeated Runs of one job are numbered, so a silent Run after two machine failures reads as the third attempt', () => {
  const runs = [
    { id: '196', shiftId: '113', round: 1, role: 'builder', writes: true, state: 'finished', outcome: 'failed', failureReason: 'idle' },
    { id: '193', shiftId: '113', round: 1, role: 'builder', writes: true, state: 'finished', outcome: 'failed', failureReason: 'infra_node' },
    { id: '189', shiftId: '113', round: 1, role: 'builder', writes: true, state: 'finished', outcome: 'failed', failureReason: 'infra_node' },
    { id: '190', shiftId: '113', round: 1, role: 'reviewer', writes: false, state: 'finished', outcome: 'no_change_needed' },
  ];
  const attempts = runAttempts(runs);
  assert.deepEqual(attempts.get('189'), { attempt: 1, total: 3, machineFailures: 0, next: 2 });
  assert.deepEqual(attempts.get('196'), { attempt: 3, total: 3, machineFailures: 2, next: null });
  assert.equal(attempts.has('190'), false, 'a job that ran once carries no attempt label');
  assert.equal(attemptLabel(attempts.get('196')), 'Attempt 3 of 3 · after 2 machine failures');
  assert.equal(attemptLabel(attempts.get('189')), 'Attempt 1 of 3');
  const html = detailMarkup(demoDetail('112'), model({ detailId: '112' }));
  assert.match(html, /implementer<\/strong><span class="meta">[^<]*<span class="work-run-round">Round 1 · <\/span>writer · Attempt 10 of 10 · after 9 machine failures/);
  assert.match(html, /Ploeg retried it as attempt 2\./, 'a retried machine failure names the attempt that followed it');
});

test('Runs are grouped by Shift and Round, failures first, newest Round first', () => {
  const runs = [
    { id: '1', shiftId: '6', round: 1, state: 'finished', outcome: 'pr_opened' },
    { id: '2', shiftId: '7', round: 1, state: 'finished', outcome: 'pr_opened' },
    { id: '3', shiftId: '7', round: 2, state: 'finished', outcome: 'no_change_needed' },
    { id: '4', shiftId: '7', round: 1, state: 'finished', outcome: 'failed', failureReason: 'infra_node' },
  ];
  assert.deepEqual(runGroups(runs, '7').map(group => [group.label, group.runs.map(run => run.id)]), [['Round 1', ['4', '2']], ['Round 2', ['3']], ['Earlier Shift · Round 1', ['1']]]);
  assert.deepEqual(runGroups([{ id: '9', round: 0, state: 'finished', outcome: 'failed' }]).map(group => group.label), ['']);
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
  assert.equal(runResult({ state: 'finished', writes: false, verdict: 'request_changes', outcome: 'no_change_needed' }).label, 'Agent asked for changes');
  assert.equal(runResult({ state: 'finished', writes: false, verdict: 'request_changes' }).title, 'Agent review: changes requested');
  assert.equal(runResult({ state: 'finished', writes: true, outcome: 'pr_opened' }).label, 'PR opened');
  assert.equal(runResult({ state: 'finished', writes: true, outcome: 'pr_opened' }).title, 'Opened a pull request');
  assert.equal(runResult({ state: 'finished', writes: false, verdict: 'approve' }).label, 'Agent approved', 'agent review never reads as a human approval');
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
  assert.match(demo, /Findings name an instruction file[^]*<code>AGENTS\.md<\/code> is named in the findings\. Check it in the diff before you merge\./);
  assert.match(demo, /No verdict/);
  assert.match(demo, /The reviewer reported no change needed but gave no verdict\./);
  const unknown = detail();
  unknown.shifts[0].spentUsd = null;
  const html = detailMarkup(unknown, model({ detailId: '50' }));
  assert.match(html, /Spend not reported/);
  assert.match(html, /<span class="meter-value">Not reported<\/span>/);
});

test('the writer’s problem and solution sit under the title, from the newest writing Run of the latest Shift', () => {
  const current = detail();
  current.runs[0].problem = 'A reviewer never reports this.';
  current.runs[1].problem = 'Half-cent totals round differently in the cart and on the invoice.';
  current.runs[1].solution = '- One rounding rule serves both.\n- A test covers half-cent totals.';
  current.runs.push({ ...current.runs[2], id: '11', role: 'builder', writes: true, verdict: '', findings: '', problem: 'Older Shift problem.', solution: 'Older Shift solution.' });
  assert.deepEqual(writerAccount(current), { runId: '13', role: 'builder', round: 1, at: later, problem: 'Half-cent totals round differently in the cart and on the invoice.', solution: '- One rounding rule serves both.\n- A test covers half-cent totals.', earlierShift: false });
  const html = detailMarkup(current, model({ detailId: '50', lane: 'awaiting_review' }));
  assert.ok(html.indexOf('id="work-account"') > html.indexOf('id="ploeg-item-title"') && html.indexOf('id="work-account"') < html.indexOf('id="work-decision"'), 'between the title and the decision box');
  assert.match(html, /<section class="work-account" id="work-account" aria-labelledby="work-account-title"><h3 class="sr-only" id="work-account-title">Problem and solution<\/h3>/);
  assert.match(html, /data-side="problem"><h4 class="work-account-label"><span class="work-account-index" aria-hidden="true">01<\/span>Problem<\/h4><div class="prose work-account-text"><p>Half-cent totals round differently/);
  assert.match(html, /data-side="solution"><h4 class="work-account-label"><span class="work-account-index" aria-hidden="true">02<\/span>Solution<\/h4><div class="prose work-account-text"><ul>/);
  assert.match(html, /Written by<\/span><span>builder<\/span><span>Round 1<\/span><time/);
  assert.match(html, /The agent’s own account: verify it against pull request #9\./);
  assert.match(html, /data-action="work-run" data-id="13"/);
  assert.doesNotMatch(html, /A reviewer never reports this|Older Shift problem/);

  current.runs[1].problem = '';
  current.runs[1].solution = '';
  assert.equal(writerAccount(current).runId, '11');
  assert.equal(writerAccount(current).earlierShift, true, 'a new Shift’s writer has not reported yet, so the earlier account shows and says so');
  assert.match(detailMarkup(current, model({ detailId: '50' })), /<span>Round 1<\/span><span>earlier Shift<\/span>/);
  current.runs.at(-1).solution = '';
  assert.match(detailMarkup(current, model({ detailId: '50' })), /Solution<\/h4><p class="work-account-missing">Not reported\.<\/p>/, 'a missing half says so instead of leaving a hole');

  current.runs.pop();
  assert.equal(writerAccount(current), null);
  assert.doesNotMatch(detailMarkup(current, model({ detailId: '50' })), /work-account/, 'no card until a writer reports');
});

test('the demo’s writer accounts say they are illustrative', () => {
  const html = detailMarkup(demoDetail('105'), model({ detailId: '105', lane: 'awaiting_review' }));
  assert.match(html, /id="work-account"/);
  assert.match(html, /illustrative content, not a result of an executed Run/);
  assert.equal(writerAccount(demoDetail('114')).runId, '25', 'the fix Round’s account replaces the first one');
});

test('untrusted text from the tracker, agents and Ploeg stays inert everywhere on the page', () => {
  const hostile = detail();
  const attack = '<img src=x onerror=alert(1)>';
  hostile.item.title = attack;
  hostile.item.descriptionMarkdown = `${attack}\n\n[x](javascript:alert(1))`;
  hostile.runs[0].findings = attack;
  hostile.runs[0].summary = attack;
  hostile.runs[0].stuckReason = attack;
  hostile.runs[1].problem = `${attack}\n\n[x](javascript:alert(1))`;
  hostile.runs[1].solution = attack;
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
  assert.match(dialog, /<ul class="work-consequences"><li><svg[^]*?<\/svg><span>Withdraws the Work Item\.<\/span><\/li><li><svg[^]*?<\/svg><span>Stops 1 running Run\./, 'the main consequence comes first');
  assert.match(dialog, /Blocks the model keys of those Runs/);
  assert.match(dialog, /Revokes the forge tokens/);
  assert.match(dialog, /Comments on the task in Vikunja/);
  assert.match(dialog, /This cannot be undone/);
  assert.match(dialog, /<button type="submit" class="button secondary" value="keep" autofocus>Keep it<\/button><button type="submit" class="button danger" value="cancel">Cancel Work Item<\/button>/);
  const stopped = cancelDialogMarkup(demoDetail('109'));
  assert.match(stopped, /<ul class="work-consequences"><li><svg[^]*?<\/svg><span>Withdraws the Work Item\.<\/span><\/li><li><svg[^]*?<\/svg><span>Comments on the task in Vikunja/, 'nothing runs, so the dialog promises no stopped Runs');
  assert.doesNotMatch(stopped, /Stops any Run/);
  assert.match(cancelDialogMarkup(demoDetail('102')), /Withdraws the Work Item and closes its open Shift\./);
  const demo = cancelDialogMarkup(demoDetail('109'), { demo: true });
  assert.match(demo, /Not available in the demo/);
  assert.match(demo, /value="cancel" disabled>Cancel Work Item/);
});

test('the cancel result reads Ploeg’s fields and never turns a missing one into zero', () => {
  const done = cancelSummary({ state: 'withdrawn', demo: false, withdrawn: true, cancelledRuns: 1, stoppedRuns: 2, keysBlocked: false, message: '' });
  assert.equal(done.title, 'Cancelled. Ploeg withdrew the Work Item.');
  assert.deepEqual(done.lines, ['Runs stopped: 2', 'Runs cancelled before they started: 1', 'Ploeg has not confirmed the model key block yet. Its sweep retries it.']);
  assert.equal(done.tone, 'attention', 'unblocked model keys can still spend, so the result is not green');
  assert.deepEqual(done.items.map(entry => entry.tone), ['success', 'success', 'attention']);
  assert.equal(cancelSummary({ state: 'withdrawn', demo: false, withdrawn: true, cancelledRuns: 0, stoppedRuns: 1, keysBlocked: true, message: '' }).tone, 'success');
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
  const loading = workMarkup(model({ data: null, demoMode: true, teams: ['delivery', 'research'], team: 'research' }));
  assert.match(loading, /aria-busy="true" aria-label="Loading Work Items"/);
  assert.match(loading, /<select id="ploeg-team"><option value="">All teams<\/option><option value="delivery">delivery<\/option><option value="research" selected>research<\/option><\/select>/, 'the Team select stays, enabled, while a Team loads, so keyboard focus survives');
  assert.match(loading, /class="demo-note"/, 'the demo note does not jump in after loading');
  assert.match(workMarkup(model({ data: null })), /<select id="ploeg-team-loading" disabled><option>All teams<\/option><\/select>/, 'before the Teams are known a placeholder holds their place');
});
