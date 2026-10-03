import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detailMarkup, mergeStateView, workMarkup, teamOverview, ploegLanes } from '../public/ploeg.js';
import { nowMarkup } from '../public/now.js';
import { createAttention, conflictKey, conflictNotification } from '../public/core/attention.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const at = '2026-09-20T10:00:00Z';
const target = { forge: 'forgejo', owner: 'acme', repo: 'shop', baseBranch: 'main' };
const pullRequest = (mergeState, extra = {}) => ({ url: 'https://forge.test/acme/shop/pulls/9', number: 9, mergeState, baseBranch: 'development', headSha: 'aaa', checkedAt: '2026-09-20T09:40:00Z', ...extra });
const states = { conflicted: pullRequest('conflicted'), clean: pullRequest('clean'), unknown: pullRequest('unknown', { checkedAt: null }), absent: undefined };

function reviewItem(pr) {
  const shift = { id: '7', workItemId: '50', team: 'delivery', branch: 'agent/vik-50', round: 2, budgetUsd: 2.5, spentUsd: 1, reservedUsd: 0, openedAt: at, closedAt: at, closeReason: 'plan_exhausted' };
  return { id: '50', provider: 'vikunja', externalId: '50', revision: 'r1', team: 'delivery', state: 'awaiting_review', title: 'Fix rounding', description: '', descriptionMarkdown: '', url: '', priority: 1, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: at, updatedAt: at, target, latestShift: shift, lease: null, ...(pr === undefined ? {} : { pullRequest: pr }) };
}

function detail(pr) {
  const item = reviewItem(pr);
  const run = { workItemId: '50', team: 'delivery', state: 'finished', startedAt: at, finishedAt: at, expiresAt: null, summary: '', stuckReason: '', findings: '', verdict: '', failureReason: null, authorizedUsd: 1, usage: null, costStatus: 'unknown', keyAlias: null };
  return { item, shifts: [item.latestShift], runs: [{ ...run, id: '13', shiftId: '7', role: 'builder', round: 1, writes: true, outcome: 'pr_opened', links: ['https://forge.test/acme/shop/pulls/9'] }], checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false }, demo: false, fetchedAt: at };
}

const model = (extra = {}) => ({ lane: 'awaiting_review', team: 'delivery', loading: false, refreshing: false, loadingMore: false, detailId: null, detail: null, detailError: null, listHref: '#work', canCancel: true, cancelBusy: false, cancelResult: null, briefOpen: false, sessions: [], userId: 'u1', now: Date.parse('2026-09-20T12:00:00Z'), ...extra });

function laneHtml(pr) {
  const items = [reviewItem(pr)];
  const data = teamOverview({ configured: true, available: true, demo: false, teams: ploegDemo.teams, selectedTeam: 'delivery', message: '', fetchedAt: at, lanes: Object.fromEntries(ploegLanes.map(({ id }) => [id, { items: items.filter(item => id === 'all' || item.state === id), nextCursor: null }])) });
  return workMarkup(model({ data }));
}

function checklist(html) {
  return [...html.matchAll(/<li class="work-check" data-tone="(\w+)">[^]*?<p class="work-check-title">([^<]*)/g)].map(match => [match[1], match[2]]);
}

function nowHtml(pr) {
  const row = { id: '50', team: 'delivery', state: 'awaiting_review', title: 'Fix rounding', url: '', createdAt: at, updatedAt: at, provider: 'vikunja', externalId: 'VIK-50', target, closeReason: 'plan_exhausted', latestShift: { round: 2, closeReason: 'plan_exhausted', budgetUsd: 3, spentUsd: 1, reservedUsd: 0, closedAt: at }, spentUsd: 1, pullRequestUrl: 'https://forge.test/acme/shop/pulls/9', ...(pr === undefined ? {} : { pullRequest: pr }) };
  const data = { demo: false, teams: ['delivery'], fetchedAt: at, errors: {}, waiting: [row], active: [], running: [], recent: [], runningTruncated: false, recentTruncated: false, truncatedStates: [] };
  return nowMarkup({ data, error: null, since: at, summary: { data: null, error: null } }, { grafanaUrl: '', singleKeys: true });
}

test('only a confirmed clean merge state reads as clean', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(states).map(([name, pr]) => { const view = mergeStateView(reviewItem(pr)); return [name, [view.key, view.tone, view.title]]; })), {
    conflicted: ['conflicted', 'attention', 'Conflicts with development'],
    clean: ['clean', 'success', 'No conflicts with development'],
    unknown: ['unknown', 'neutral', 'Not checked yet'],
    absent: ['unreported', 'neutral', 'Merge state: not reported'],
  });
  assert.equal(mergeStateView(reviewItem(pullRequest('conflicted', { baseBranch: null }))).title, 'Conflicts with main', 'without a reported base it falls back to the Work Item’s target');
  assert.equal(mergeStateView(reviewItem(pullRequest('surprise'))).key, 'unreported');
  assert.equal(mergeStateView(reviewItem(null)).key, 'unreported');
});

test('the Ready for review lane chip says the pull request conflicts, in attention tone, and nothing else does', () => {
  const conflicted = laneHtml(states.conflicted);
  assert.match(conflicted, /<span class="chip" data-tone="attention" title="Conflicts with development\.[^"]*">[^]*?<span>PR #9 · Conflicts<\/span>/);
  for (const name of ['clean', 'unknown', 'absent']) assert.doesNotMatch(laneHtml(states[name]), /Conflicts/, `${name} shows no conflict chip`);
});

test('the Now row carries a Merge conflict chip only for a conflicted pull request', () => {
  assert.match(nowHtml(states.conflicted), /<span class="chip" data-tone="attention" title="Conflicts with development\.[^"]*">[^]*?<span>Merge conflict<\/span>/);
  for (const name of ['clean', 'unknown', 'absent']) assert.doesNotMatch(nowHtml(states[name]), /Merge conflict/, `${name} shows no conflict chip`);
});

test('the Before you merge checklist leads with the merge state and never shows an unknown one as clean', () => {
  const conflicted = checklist(detailMarkup(detail(states.conflicted), model({ detailId: '50' })));
  assert.deepEqual(conflicted[0], ['attention', 'Conflicts with development'], 'a conflict is the first row');
  assert.match(detailMarkup(detail(states.conflicted), model({ detailId: '50' })), /Merge development into the pull request&#39;s branch and resolve the conflicts before you review it\./);
  const clean = detailMarkup(detail(states.clean), model({ detailId: '50' }));
  assert(checklist(clean).some(([tone, title]) => tone === 'success' && title === 'No conflicts with development'));
  assert.match(clean, /No conflicts with development<\/p><p class="meta">Ploeg checked [^<]+\.<\/p>/, 'clean says when Ploeg checked');
  const unknown = checklist(detailMarkup(detail(states.unknown), model({ detailId: '50' })));
  assert(unknown.some(([tone, title]) => tone === 'neutral' && title === 'Not checked yet'));
  const absent = detailMarkup(detail(states.absent), model({ detailId: '50' }));
  assert.match(absent, /<p class="meta work-checklist-note">Merge state: not reported<\/p>/);
  assert(!checklist(absent).some(([, title]) => /conflict/i.test(title)), 'no merge row pretends to know');
  const hero = detailMarkup(detail(states.unknown), model({ detailId: '50', card: { workItemId: '50' } }));
  assert.match(hero, /Not checked yet/, 'with the Run card above, the merge state row stays visible');
  assert.deepEqual(checklist(detailMarkup(detail(states.conflicted), model({ detailId: '50', card: { workItemId: '50' } })))[0], ['attention', 'Conflicts with development']);
});

function notificationEnv() {
  const shown = [];
  const data = new Map();
  class FakeNotification { static permission = 'granted'; constructor(title, options) { Object.assign(this, { title, ...options }); shown.push(this); } close() {} }
  const env = { favicon() {}, notifications: () => FakeNotification, secure: () => true, storage: () => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); } }), attentive: () => false, open() {} };
  return { env, shown };
}

const waitingReview = (mergeState, headSha = 'aaa') => [{ id: '50', state: 'awaiting_review', title: 'Fix rounding', team: 'delivery', updatedAt: at, pullRequest: { number: 9, mergeState, headSha } }];

test('a waiting item that turns conflicted notifies once per head', async () => {
  const { env, shown } = notificationEnv();
  const attention = createAttention(env);
  await attention.enable();
  attention.update({ waiting: 1, items: waitingReview('unknown') });
  attention.update({ waiting: 1, items: waitingReview('conflicted') });
  attention.update({ waiting: 1, items: waitingReview('conflicted') });
  assert.equal(shown.length, 1, 'one notification for the conflict');
  assert.equal(shown[0].body, 'PR #9 now conflicts · delivery · #50');
  assert.equal(shown[0].tag, 'vloer-conflict-50');
  attention.update({ waiting: 1, items: waitingReview('unknown', 'bbb') });
  attention.update({ waiting: 1, items: waitingReview('conflicted', 'bbb') });
  assert.equal(shown.length, 2, 'a conflict at a new head notifies again');
  attention.update({ waiting: 1, items: waitingReview('conflicted', 'aaa') });
  assert.equal(shown.length, 2, 'a head that was announced stays quiet');
});

test('a conflict already there on the first read is the baseline and stays quiet', async () => {
  const { env, shown } = notificationEnv();
  const attention = createAttention(env);
  await attention.enable();
  attention.update({ waiting: 1, items: waitingReview('conflicted') });
  attention.update({ waiting: 1, items: waitingReview('conflicted') });
  assert.equal(shown.length, 0);
  assert.equal(conflictKey(waitingReview('clean')[0]), null);
  assert.equal(conflictNotification({ id: '7', title: 'T', team: 'x', pullRequest: { mergeState: 'conflicted' } }).body, 'Its pull request now conflicts · x · #7');
});
