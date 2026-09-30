import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nowMarkup, digestCounts, sinceLabel, nextBaseline, visibleNow, shownIds, openTarget, byFinish, awayAfter } from '../public/now.js';

const at = '2026-09-20T10:00:00Z';
const nowAt = Date.parse('2026-09-20T10:00:00Z');
const options = { grafanaUrl: 'https://grafana.example.test/', singleKeys: true };
const target = { forge: 'forgejo', owner: 'acme', repo: 'shop', baseBranch: 'main' };
const shift = (closeReason, extra = {}) => ({ round: 2, closeReason, budgetUsd: 3, spentUsd: 1.5, reservedUsd: 0, closedAt: '2026-09-20T08:00:00Z', ...extra });

function nowData() {
  return {
    demo: false,
    teams: ['delivery', 'research'],
    fetchedAt: '2026-09-20T09:59:00Z',
    errors: {},
    waiting: [
      { id: '105', team: 'delivery', state: 'awaiting_review', title: 'Round half-cent totals', url: 'https://tracker.test/tasks/105', createdAt: '2026-09-20T07:00:00Z', updatedAt: '2026-09-20T09:00:00Z', provider: 'vikunja', externalId: 'VIK-105', target, closeReason: 'plan_exhausted', latestShift: shift('plan_exhausted'), spentUsd: 1.5, pullRequestUrl: 'https://forge.test/acme/shop/pulls/9' },
      { id: '101', team: 'delivery', state: 'needs_human', title: 'Review the rounding criteria', url: '', createdAt: at, updatedAt: '2026-09-19T20:00:00Z', spentUsd: null, pullRequestUrl: '' },
      { id: '108', team: 'delivery', state: 'needs_human', title: 'Show VAT per line', url: 'https://tracker.test/tasks/108', createdAt: at, updatedAt: '2026-09-20T09:30:00Z', provider: 'vikunja', externalId: 'VIK-108', target: null, closeReason: 'plan_exhausted', latestShift: shift('plan_exhausted', { spentUsd: 0 }), spentUsd: 0, pullRequestUrl: '' },
      { id: '112', team: 'delivery', state: 'needs_human', title: 'Add retry backoff', url: '', createdAt: at, updatedAt: '2026-09-20T09:40:00Z', provider: 'vikunja', externalId: 'VIK-112', infraFailures: 10, target, closeReason: 'writing_run_killed_repeatedly', latestShift: shift('writing_run_killed_repeatedly'), spentUsd: 0, pullRequestUrl: '' },
      { id: '107', team: 'research', state: 'proposed', title: 'Clarify the research markets', url: 'https://tracker.test/tasks/107', createdAt: '2026-09-20T09:50:00Z', updatedAt: at, provider: 'ploeg', externalId: 'run-46-1', target: null, closeReason: null, latestShift: null, spentUsd: null, pullRequestUrl: '', sourceWorkItemId: '104', sourceTitle: 'Define the research brief', createdKind: 'clarify', ready: false },
    ],
    running: [{ id: '40', workItemId: '102', workItemTitle: 'Regression investigation', team: 'delivery', role: 'implementer', round: 1, state: 'running', startedAt: '2026-09-20T09:30:00Z', authorizedUsd: 2.5, observedUsd: null, reservedModels: [], usage: null }],
    recent: [
      { id: '31', workItemId: '105', workItemTitle: 'Round half-cent totals', team: 'delivery', role: 'reviewer', round: 2, state: 'finished', startedAt: '2026-09-20T09:00:00Z', finishedAt: '2026-09-20T09:30:00Z', outcome: 'pr_opened', verdict: 'approve', failureReason: '', authorizedUsd: 2, observedUsd: null, reservedModels: ['gpt-x'], usage: null },
      { id: '30', workItemId: '103', workItemTitle: 'Order verification', team: 'delivery', role: '', round: 0, state: 'finished', startedAt: '2026-09-20T08:00:00Z', finishedAt: '2026-09-20T09:45:00Z', outcome: 'failed', verdict: '', failureReason: 'lease_lost', authorizedUsd: 0, observedUsd: null, reservedModels: [], usage: null },
    ],
  };
}

const summary = (extra = {}) => ({ data: { demo: false, window: '24h', totals: { workItems: { queued: 2, stale: 1 }, runs: { pending: 1 }, spend: { settledUsd: 4.12, reservedUsd: 0.4 } }, ...extra }, error: null });
const view = (extra = {}) => ({ data: nowData(), error: null, since: '2026-09-20T09:10:00Z', summary: summary(), ...extra });

test('the Now page lists waiting work in the order Review, Needs you, Proposed, then what runs and what finished', () => {
  const html = nowMarkup(view(), options, nowAt);
  for (const title of ['Waiting on you', 'Ready for your review', 'Needs you', 'Proposed', 'Running now', 'Recently finished']) assert.match(html, new RegExp(title));
  const order = ['Ready for your review', 'Needs you<', 'Proposed<', 'Running now', 'Recently finished'].map(text => html.indexOf(text));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'groups are out of order');
  assert.match(html, /<a class="list-row" href="#work\/105"[^>]*data-now-row/);
  assert.match(html, /href="#work\/102"[^>]*data-now-row/, 'a running Run opens its Work Item');
  assert.match(html, /href="#work\/103"[^>]*data-now-row/, 'a finished Run opens its Work Item');
});

test('a waiting row carries its reason chip, the Not routed warning and honest links', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /No pull request or changes unresolved/, 'plan_exhausted in needs_human reads as unresolved');
  assert.match(html, /Cluster kept stopping the writer/);
  assert.match(html, /Stopped; open for details/, 'a row without the reason fields still gets a chip');
  assert.match(html, /<span class="chip" data-tone="attention"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span>Not routed<\/span>/);
  assert.equal(html.match(/>Not routed</g).length, 2, 'only the items without a target are Not routed');
  assert.match(html, /href="https:\/\/forge\.test\/acme\/shop\/pulls\/9"[^>]*aria-label="Pull request for Round half-cent totals"/);
  assert.match(html, /href="https:\/\/tracker\.test\/tasks\/108" target="_blank" rel="noopener noreferrer" aria-label="Open “Show VAT per line” in the tracker \(opens in a new tab\)"/);
  assert.match(html, /href="https:\/\/grafana\.example\.test\/d\/glide-loop\?var-team=delivery"/, 'infrastructure trouble links the Team dashboard');
  assert.equal(html.match(/grafana\.example\.test/g).length, 1, 'Grafana only for infrastructure reasons');
  assert.match(html, /href="#proposed"[^>]*aria-label="Decide on Clarify the research markets"/);
  assert.match(html, /data-open-url="https:\/\/forge\.test\/acme\/shop\/pulls\/9"/, 'o opens the pull request of a review row');
  assert.match(html, /Clarification/);
  assert.match(html, /Needs refinement/);
  assert.match(html, /From <span class="now-source">Define the research brief<\/span>/);
});

test('money is nl-NL and unknown spend is never zero', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /US\$ 1,50<\/span> of <span class="num money">US\$ 3,00/, 'a review row shows spend of the Shift budget');
  assert.match(html, /<span class="meter-value">Not reported<\/span>/, 'a running Run without observed spend says so');
  assert.match(html, /of US\$ 2,50/);
  assert.doesNotMatch(html, /\$0\.00|\$1\.50/);
  const data = nowData();
  data.waiting[0].latestShift = null;
  data.waiting[0].spentUsd = null;
  assert.match(nowMarkup(view({ data }), options, nowAt), /Spend not reported/);
  assert.match(nowMarkup(view(), options, nowAt), /Spend · 24 h[\s\S]*?US\$ 4,12[\s\S]*?Settled · US\$ 0,40 reserved/);
});

test('finished Runs show outcome, agent verdict and failure in plain words, newest finish first', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /Opened a pull request/);
  assert.match(html, /Agent review: approve/, 'an agent verdict is never presented as a human review');
  assert.match(html, /Failed<\/span><\/span><span>The worker lost its lease/);
  assert(html.indexOf('id="now-row-f-30"') < html.indexOf('id="now-row-f-31"'), 'the Run that finished last comes first');
  assert.deepEqual(byFinish([{ id: 'a', finishedAt: '2026-09-20T08:00:00Z' }, { id: 'b', finishedAt: null }, { id: 'c', finishedAt: '2026-09-20T09:00:00Z' }]).map(run => run.id), ['c', 'a', 'b']);
});

test('a failed Ploeg group shows an inline error with retry and never renders as empty', () => {
  const data = nowData();
  data.waiting = [];
  data.errors = { waiting: 'Ploeg could not provide its operator data.' };
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.match(html, /Waiting work could not be read/);
  assert.match(html, /Ploeg could not provide its operator data\./);
  assert.match(html, /data-action="now-retry"/);
  assert.doesNotMatch(html, /Nothing waits on you/);
  assert.match(html, /Waiting on you<\/span><strong class="stat-value">—<\/strong><span class="stat-detail">Could not be read/, 'the stat says it is unknown, not zero');
  assert.match(html, /Recently finished/);
  assert.match(html, /Opened a pull request/, 'the healthy groups still render');
});

test('an empty queue is a positive, specific state', () => {
  const data = nowData();
  data.waiting = [];
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.match(html, /Nothing waits on you/);
  assert.match(html, /1 Run is working; the last Run finished 15 min ago\./);
  data.running = [];
  assert.match(nowMarkup(view({ data }), options, nowAt), /No Run is working right now; the last Run finished 15 min ago; 2 Work Items are queued\./);
  assert.match(nowMarkup(view({ data }), options, nowAt), /No Run is working[\s\S]*1 Run waits for a worker\./);
});

test('the page-level failure names the cause and offers the one way forward', () => {
  const failure = nowMarkup({ data: null, error: { message: 'Ploeg could not be reached.' } }, options, nowAt);
  assert.match(failure, /Now could not be read/);
  assert.match(failure, /Ploeg could not be reached\./);
  assert.match(failure, /data-action="now-retry"/);
  assert.match(nowMarkup({ data: null, error: { message: 'x', code: 'ploeg_unconfigured' } }, options, nowAt), /Connect Ploeg to see your work[\s\S]*href="#settings\/environment"/);
  assert.match(nowMarkup({ data: null, error: { message: 'x', code: 'ploeg_scope' } }, options, nowAt), /Your account has no Ploeg Teams/);
  const loading = nowMarkup({ data: null, error: null }, options, nowAt);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Loading…/);
  const stale = nowMarkup(view({ error: { message: 'Ploeg did not answer.' } }), options, nowAt);
  assert.match(stale, /Could not refresh[\s\S]*Ploeg did not answer\. Showing what Ploeg reported 1 min ago\./);
  assert.match(stale, /Round half-cent totals/, 'the last data stays visible');
});

test('the Grafana link stays hidden without a configured dashboard URL', () => {
  const html = nowMarkup(view(), { singleKeys: true }, nowAt);
  assert.doesNotMatch(html, /grafana/, 'no Grafana link is invented without observability');
});

test('every string from Ploeg is escaped and unsafe links are dropped', () => {
  const data = nowData();
  data.waiting[0].title = '<img src=x onerror=alert(1)>';
  data.waiting[0].pullRequestUrl = 'javascript:alert(1)';
  data.waiting[1].url = 'https://user:secret@tracker.test/1';
  data.recent[0].workItemTitle = '<script>alert(1)</script>';
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.doesNotMatch(html, /<img src=x|<script>|javascript:|secret@/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.deepEqual(openTarget(data.waiting[0]), { href: 'https://tracker.test/tasks/105', label: 'tracker item' }, 'an unsafe pull request link falls back to the tracker');
  assert.equal(openTarget({ ...data.waiting[0], url: 'javascript:alert(1)' }), null);
  assert.deepEqual(openTarget(nowData().waiting[0]), { href: 'https://forge.test/acme/shop/pulls/9', label: 'pull request' });
  assert.deepEqual(openTarget(nowData().waiting[2]), { href: 'https://tracker.test/tasks/108', label: 'tracker item' });
});

test('the demo says it is one, once, and shows no spend', () => {
  const data = { ...nowData(), demo: true };
  const html = nowMarkup(view({ data, summary: summary({ demo: true }) }), options, nowAt);
  assert.equal(html.match(/class="demo-note"/g).length, 1);
  assert.match(html, /Illustrative Ploeg records\. No Run executes, no model is called and nothing is spent\./);
  assert.match(html, /data-demo[\s\S]*Demo · no model calls/, 'the running meter draws no spend in the demo');
  assert.match(html, /Spend · 24 h[\s\S]*?Demo · no model calls/);
  assert.doesNotMatch(html, /1,50<\/span> of/, 'the demo does not show Shift spend');
});

test('the digest counts what changed since the last visit and welcomes a first visit', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /Since \d\d:\d\d/);
  assert.match(html, /<strong class="num">2<\/strong> need you/, 'two Work Items started needing you after 09:10');
  assert.match(html, /<strong class="num">1<\/strong> proposed/);
  assert.match(html, /<strong class="num">2<\/strong> Runs finished/);
  assert.doesNotMatch(html, /ready for review<\/li>/, 'a count of zero is left out');
  assert.match(html, /data-action="now-caught-up"/);
  assert.match(html, /id="now-row-w-108"[^>]*data-unread/, 'rows that changed since the last visit carry the unread dot');
  assert.doesNotMatch(html, /id="now-row-w-101"[^>]*data-unread/);
  assert.match(nowMarkup(view({ since: null }), options, nowAt), /Welcome to De Vloer/);
  const quiet = nowMarkup(view({ since: '2026-09-20T09:59:00Z' }), options, nowAt);
  assert.match(quiet, /Nothing new since/);
  assert.match(quiet, /5 Work Items wait on you\./);
  assert.match(nowMarkup(view({ since: '2026-09-20T09:59:00Z', caughtUp: true }), options, nowAt), /You are caught up/);
  assert.deepEqual(digestCounts(nowData(), '2026-09-20T09:10:00Z'), { review: 0, needsYou: 2, proposed: 1, finished: 2, finishedCapped: false });
  assert.deepEqual(digestCounts({ ...nowData(), errors: { waiting: 'x', recent: 'y' } }, at), { review: null, needsYou: null, proposed: null, finished: null, finishedCapped: false });
  const many = { ...nowData(), recent: Array.from({ length: 25 }, (_, index) => ({ id: String(index + 1), finishedAt: '2026-09-20T09:59:00Z' })) };
  assert.equal(digestCounts(many, '2026-09-20T09:00:00Z').finishedCapped, true, 'a full page of newer Runs may hide more');
  assert.match(nowMarkup(view({ data: many }), options, nowAt), /<strong class="num">25\+<\/strong> Runs finished/);
});

test('the digest names its start today, yesterday or by date', () => {
  const now = new Date(2026, 8, 30, 9, 30).getTime();
  assert.equal(sinceLabel(new Date(2026, 8, 30, 8, 5).toISOString(), now), 'Since 08:05');
  assert.equal(sinceLabel(new Date(2026, 8, 29, 22, 10).toISOString(), now), 'Since yesterday 22:10');
  assert.equal(sinceLabel(new Date(2026, 8, 27, 22, 10).toISOString(), now), 'Since 27-09-2026 22:10');
  assert.equal(sinceLabel(null, now), '');
});

test('the digest baseline starts at the last visit and moves only after a real absence', () => {
  const now = Date.parse('2026-09-30T09:00:00Z');
  assert.equal(nextBaseline({ current: undefined, lastVisit: null, now }), null, 'a first visit has no baseline');
  assert.equal(nextBaseline({ current: undefined, lastVisit: '2026-09-29T22:10:00Z', now }), '2026-09-29T22:10:00Z');
  assert.equal(nextBaseline({ current: '2026-09-29T22:10:00Z', lastVisit: '2026-09-30T08:55:00Z', now }), '2026-09-29T22:10:00Z', 'a reload or a short detour keeps the baseline');
  assert.equal(nextBaseline({ current: '2026-09-29T22:10:00Z', lastVisit: '2026-09-30T08:00:00Z', now }), '2026-09-30T08:00:00Z', 'an hour away starts a new period');
  assert.equal(nextBaseline({ current: '2026-09-30T08:30:00Z', lastVisit: '2026-09-30T08:00:00Z', now }), '2026-09-30T08:30:00Z', 'a newer baseline (caught up) is kept');
  assert.equal(awayAfter, 30 * 60 * 1000);
});

test('a live refresh holds new rows behind an "N new" button instead of moving the list', () => {
  const data = nowData();
  const shown = shownIds(data);
  const next = nowData();
  next.waiting.push({ id: '120', team: 'delivery', state: 'needs_human', title: 'A brand new blocker', url: '', createdAt: at, updatedAt: at, spentUsd: null, pullRequestUrl: '' });
  next.waiting = next.waiting.filter(entry => entry.id !== '101');
  next.recent.unshift({ id: '32', workItemId: '104', workItemTitle: 'Fresh Run', team: 'research', role: 'analyst', round: 1, finishedAt: '2026-09-20T09:58:00Z', outcome: 'no_change_needed', verdict: '' });
  const { data: visible, held } = visibleNow(next, shown);
  assert.deepEqual(held, { waiting: 1, recent: 1 });
  assert.deepEqual(visible.waiting.map(entry => entry.id), ['105', '108', '112', '107'], 'rows that left disappear and new ones wait');
  const html = nowMarkup(view({ data: next, shown }), options, nowAt);
  assert.match(html, /data-action="now-show-new"[^>]*>[\s\S]*?1 new Work Item · Show/);
  assert.match(html, /1 new · Show/);
  assert.doesNotMatch(html, /A brand new blocker/);
  assert.match(html, /Waiting on you<span class="count" data-tone="attention">5<\/span>/, 'the header counts what really waits');
  assert.match(nowMarkup(view({ data: next, shown: shownIds(next) }), options, nowAt), /A brand new blocker/);
  const empty = visibleNow(next, { waiting: new Set(), recent: shown.recent });
  assert.equal(empty.held.waiting, 0, 'an empty list takes new rows directly');
  assert.deepEqual(visibleNow(next, null).held, { waiting: 0, recent: 0 });
});

test('the stat row links into Work, Runs and Insights with honest partial labels', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /<div class="stat" data-tone="attention">[\s\S]*?Waiting on you[\s\S]*?>5<[\s\S]*?1 to review · 3 need you · 1 proposed/);
  assert.match(html, /href="#runs\?state=running"[^>]*>[\s\S]*?Running[\s\S]*?1 Run waiting for a worker/);
  assert.match(html, /href="#work\?lane=queued"[^>]*>[\s\S]*?Queued[\s\S]*?>2</);
  assert.match(html, /href="#insights\?window=24h"/);
  assert.match(html, /1 Work Item stopped retrying/, 'stale work Now cannot list is still mentioned');
  const unsupported = nowMarkup(view({ summary: { data: null, error: { message: 'no', code: 'ploeg_unsupported' } } }), options, nowAt);
  assert.match(unsupported, /Queued<\/span><strong class="stat-value">—<\/strong><span class="stat-detail">Not reported by this Ploeg/);
  assert.doesNotMatch(unsupported, /stopped retrying/);
});

test('the keyboard hints follow the single-key preference', () => {
  assert.match(nowMarkup(view(), options, nowAt), /class="now-keys"[\s\S]*?<kbd class="kbd">j<\/kbd><kbd class="kbd">k<\/kbd>/);
  assert.doesNotMatch(nowMarkup(view(), { singleKeys: false }, nowAt), /now-keys/);
});
