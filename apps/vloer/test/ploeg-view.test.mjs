import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activePloegLane, ploegLanes, ploegMarkup, ploegReview, ploegReviewMarkup, usd2 } from '../public/ploeg.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const escape = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const helpers = { escape, icon: name => `<i data-icon="${name}"></i>`, money: value => `$${value}`, safeUrl, ago: () => 'now' };
const at = '2026-09-20T10:00:00Z';

function detail() {
  const shift = { id: '7', workItemId: '50', team: 'delivery', branch: 'agent/vik-50', round: 2, budgetUsd: 2.5, spentUsd: 1.23456, reservedUsd: 0.005, openedAt: at, closedAt: at, closeReason: 'review_approved' };
  const older = { ...shift, id: '6', branch: 'agent/vik-50', closeReason: 'fix_round_cap_reached' };
  const run = { workItemId: '50', team: 'delivery', state: 'finished', startedAt: at, finishedAt: at, expiresAt: null, summary: '', stuckReason: '', links: [], findings: '', verdict: '', failureReason: null, authorizedUsd: 1, usage: null, costStatus: 'unknown', keyAlias: null };
  return {
    item: { id: '50', provider: 'vikunja', externalId: '50', revision: 'r1', team: 'delivery', state: 'awaiting_review', title: 'Fix rounding', description: '', url: '', priority: 1, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: at, updatedAt: at, target: { forge: 'forgejo', owner: 'acme', repo: 'shop', baseBranch: 'main' }, latestShift: shift, lease: null },
    shifts: [shift, older],
    runs: [
      { ...run, id: '14', shiftId: '7', role: 'reviewer', round: 2, writes: false, outcome: 'no_change_needed', verdict: 'approve', findings: 'Looks right. The diff also edits .claude/settings.json and CLAUDE.md.', links: ['https://forge.test/acme/shop/pulls/9'] },
      { ...run, id: '13', shiftId: '7', role: 'builder', round: 1, writes: true, outcome: 'pr_updated', links: ['https://forge.test/acme/shop/pulls/9'] },
      { ...run, id: '12', shiftId: '6', role: 'reviewer', round: 1, writes: false, outcome: 'no_change_needed', verdict: 'request_changes', findings: 'Older Shift finding about AGENTS.md.' },
    ],
    checkpoints: [{ id: '3', workItemId: '50', phase: 'reviewed', branch: 'agent/vik-50', prUrl: '', createdAt: at, nodeName: '', podUid: '' }],
    events: [],
    truncated: { shifts: false, runs: false, checkpoints: false, events: false },
  };
}

test('the awaiting review lane is the default only while it holds work, and an explicit choice wins', () => {
  assert.equal(ploegLanes[0][0], 'awaiting_review');
  const lanes = items => ({ awaiting_review: { items, nextCursor: null }, needs_human: { items: [{ id: '1' }], nextCursor: null } });
  assert.equal(activePloegLane({ ploegLane: null, ploeg: { lanes: lanes([{ id: '2' }]) } }), 'awaiting_review');
  assert.equal(activePloegLane({ ploegLane: null, ploeg: { lanes: lanes([]) } }), 'needs_human');
  assert.equal(activePloegLane({ ploegLane: null, ploeg: null }), 'needs_human');
  assert.equal(activePloegLane({ ploegLane: 'queued', ploeg: { lanes: lanes([{ id: '2' }]) } }), 'queued');
});

test('the Ploeg view lists awaiting review work first and counts it', () => {
  const items = ploegDemo.items.filter(item => item.team === 'delivery');
  const page = state => ({ items: items.filter(item => state === 'all' || item.state === state), nextCursor: null });
  const ploeg = { configured: true, available: true, demo: true, teams: ploegDemo.teams, selectedTeam: 'delivery', message: 'Illustrative', lanes: Object.fromEntries(ploegLanes.map(([id]) => [id, page(id)])) };
  const html = ploegMarkup({ ploeg, ploegLane: null, ploegDetail: null, sessions: [] }, helpers);
  assert.match(html, /class="ploeg-metric selected awaiting_review"[^>]*aria-pressed="true"><span><i data-icon="check"><\/i>Awaiting review<\/span><strong>1<\/strong>/);
  assert.match(html, /data-action="ploeg-item" data-id="105"/);
  assert.doesNotMatch(html, /data-action="ploeg-item" data-id="101"/);
  const empty = ploegMarkup({ ploeg: { ...ploeg, lanes: { ...ploeg.lanes, awaiting_review: { items: [], nextCursor: null } } }, ploegLane: 'awaiting_review', ploegDetail: null, sessions: [] }, helpers);
  assert.match(empty, /No pull requests await your review/);
});

test('the review projection reads the latest Shift: pull request, branch, runs by round, findings, spend and close reason', () => {
  const review = ploegReview(detail());
  assert.equal(review.pullRequestUrl, 'https://forge.test/acme/shop/pulls/9');
  assert.equal(review.branch, 'agent/vik-50');
  assert.equal(review.closeReason, 'review_approved');
  assert.match(review.closeMeaning, /not a human review/);
  assert.deepEqual(review.runs.map(run => [run.role, run.round, run.outcome, run.verdict]), [['builder', 1, 'pr_updated', ''], ['reviewer', 2, 'no_change_needed', 'approve']]);
  assert.deepEqual(review.findings.map(finding => [finding.role, finding.round, finding.verdict]), [['reviewer', 2, 'approve']]);
  assert.deepEqual(review.spend, { authorizedUsd: 2.5, reservedUsd: 0.005, settledUsd: 1.23456 });
  assert.deepEqual(review.instructionFiles, ['CLAUDE.md', '.claude/'], 'only the latest Shift findings are scanned');
  assert.equal(review.truncated, false);
});

test('a checkpoint pull request link wins over run links, and a missing link is reported as missing', () => {
  const withCheckpoint = detail();
  withCheckpoint.checkpoints.unshift({ ...withCheckpoint.checkpoints[0], id: '4', prUrl: 'https://forge.test/acme/shop/pulls/10' });
  assert.equal(ploegReview(withCheckpoint).pullRequestUrl, 'https://forge.test/acme/shop/pulls/10');
  const none = detail();
  for (const run of none.runs) run.links = ['https://tracker.test/tasks/50'];
  assert.equal(ploegReview(none).pullRequestUrl, '');
  const html = ploegReviewMarkup(none, helpers);
  assert.match(html, /reported no pull request link/);
  assert.doesNotMatch(html, /Open pull request/);
});

test('the review screen is read-only, links the pull request and shows money to two decimals', () => {
  const html = ploegReviewMarkup(detail(), helpers);
  assert.match(html, /<a class="button primary ploeg-review-open" href="https:\/\/forge.test\/acme\/shop\/pulls\/9" target="_blank" rel="noopener noreferrer">Open pull request/);
  assert.doesNotMatch(html, /<button|<form|data-action/);
  assert.match(html, /<dd>\$2\.50<\/dd>/);
  assert.match(html, /<dd>\$0\.01<\/dd>/);
  assert.match(html, /<dd>\$1\.23<\/dd>/);
  assert.match(html, /Instruction files named in findings/);
  assert.match(html, /<code>CLAUDE\.md<\/code> <code>\.claude\/<\/code>/);
  assert.match(html, /<td>builder<\/td><td>1<\/td><td>pr updated<\/td><td><span class="ploeg-review-muted">Writer<\/span><\/td>/);
  assert.equal(usd2(0), '$0.00');
});

test('reviewer text is escaped and demo spend never claims model calls', () => {
  const hostile = detail();
  hostile.runs[0].findings = '<img src=x onerror=alert(1)>';
  assert.doesNotMatch(ploegReviewMarkup(hostile, helpers), /<img/);
  const demo = ploegReviewMarkup({ ...ploegDemo.details['105'], demo: true }, helpers);
  assert.match(demo, /Settled<\/dt><dd>No model calls/);
  assert.match(demo, /<code>AGENTS\.md<\/code>/);
  assert.match(demo, /No verdict/);
});
