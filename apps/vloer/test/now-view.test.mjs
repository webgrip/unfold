import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nowMarkup, digestCounts, sinceLabel, nextBaseline, visibleNow, shownIds, openTarget, byFinish, awayAfter, reasonBuckets, reasonGlyph, offersRetry, mayHoldMore, runPage, groupLimit, subgroupLimit } from '../public/now.js';
import { listReason } from '../public/core/reasons.js';
import { icon } from '../public/core/icons.js';

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

function needsItem(id, closeReason, extra = {}) {
  return { id, team: 'delivery', state: 'needs_human', title: `Blocked item ${id}`, url: '', createdAt: at, updatedAt: `2026-09-20T0${Number(id) % 9}:00:00Z`, provider: 'vikunja', externalId: `VIK-${id}`, target, closeReason, latestShift: shift(closeReason), spentUsd: 0, pullRequestUrl: '', ...extra };
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

test('a waiting row says why it waits and what to do, in words every pointer can read', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /No pull request or changes unresolved/, 'plan_exhausted in needs_human reads as unresolved');
  assert.match(html, /Cluster kept stopping the writer/);
  assert.match(html, /Stopped; open for details/, 'a row without the reason fields still gets a chip');
  assert.match(html, /<span class="now-why" title="[^"]*">Not the Work Item’s fault: the cluster stopped the writer 10 times before it could finish, so the work was never really tried\. <span class="now-why-fix">Look at the cluster \(evictions, node pressure, image pulls\), not the ticket\.<\/span><\/span>/, 'the sentence and the fix sit on the row, not only in a tooltip');
  assert.match(html, /id="now-row-w-107"[\s\S]*?<span class="now-why"[^>]*>Clarifies “Define the research brief”\. No routing rule matched a repository/, 'a proposal says where it came from and why it is not routed');
  assert.match(html, /<span class="now-why"[^>]*>Ploeg stopped this Work Item without a reason Vloer recognises\./);
});

test('Not routed is a secondary outline chip and the repository is a plain fact', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /<span class="chip now-warning" data-tone="attention"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span>Not routed<\/span>/);
  assert.equal(html.match(/>Not routed</g).length, 2, 'only the items without a target are Not routed');
  assert(html.indexOf('>No pull request or changes unresolved<', html.indexOf('id="now-row-w-108"')) < html.indexOf('>Not routed<', html.indexOf('id="now-row-w-108"')), 'the reason comes before the warning');
  assert(html.indexOf('>Needs refinement<', html.indexOf('id="now-row-w-107"')) < html.indexOf('>Not routed<', html.indexOf('id="now-row-w-107"')), 'on a proposal the warning is not the first chip');
  assert.match(html, /<span class="now-repo"><svg[^>]*>[\s\S]*?<\/svg><span title="acme\/shop, base branch main">shop<\/span><\/span>/);
  assert.doesNotMatch(html, /class="chip"[^>]*title="acme\/shop/, 'the repository is not an inert chip');
  assert.doesNotMatch(html, /Clarification</, 'the proposal kind is part of the why line, not a third chip style');
});

test('each reason has its own glyph so rows do not repeat one icon', () => {
  const html = nowMarkup(view(), options, nowAt);
  const lead = id => html.slice(html.indexOf(`id="now-row-w-${id}"`)).match(/<span class="list-row-lead">(<svg[\s\S]*?<\/svg>)/)[1];
  assert.equal(reasonGlyph(listReason(nowData().waiting[3])), 'zap');
  assert.equal(reasonGlyph({ code: 'budget_exhausted' }), 'coins');
  assert.equal(reasonGlyph({ code: 'run_stuck' }), 'pause-circle');
  assert.equal(reasonGlyph({ code: 'unknown' }), 'help-circle');
  assert.equal(reasonGlyph({ code: 'stale_attempts', glyph: 'clock' }), 'clock');
  assert.equal(lead('112'), icon('zap'));
  assert.equal(lead('101'), icon('help-circle'));
  assert.equal(lead('108'), icon('pull-request'));
});

test('row actions put the primary action first, name it fully and go where the decision is made', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /href="https:\/\/forge\.test\/acme\/shop\/pulls\/9"[^>]*aria-label="Open the pull request for “Round half-cent totals” \(opens in a new tab\)"/);
  assert.match(html, /<span class="now-action-primary"><a class="button secondary sm" href="https:\/\/forge\.test[\s\S]*?<\/a><\/span><span class="now-action-links"><a class="button ghost sm icon-only" id="now-tracker-105"/, 'the pull request comes before the tracker link');
  assert.match(html, /href="https:\/\/tracker\.test\/tasks\/108" target="_blank" rel="noopener noreferrer" aria-label="Open “Show VAT per line” in the tracker \(opens in a new tab\)"/);
  assert.match(html, /href="https:\/\/grafana\.example\.test\/d\/glide-loop\?var-team=delivery"/, 'infrastructure trouble links the Team dashboard');
  assert.equal(html.match(/grafana\.example\.test/g).length, 1, 'Grafana only for infrastructure reasons');
  assert.match(html, /href="#proposed\?id=107"[^>]*aria-label="Approve or reject “Clarify the research markets” on Proposed"[^>]*>[\s\S]*?Approve or reject/);
  assert.doesNotMatch(html, />Decide</);
  assert.match(html, /data-open-url="https:\/\/forge\.test\/acme\/shop\/pulls\/9"/, 'o opens the pull request of a review row');
  assert.match(html, /<div class="now-item-actions"><span class="now-action-primary"><\/span><span class="now-action-links"><\/span><\/div>/, 'rows without actions keep the empty slots so the columns line up');
});

test('a review row shows the agent review of its latest Run, never as a human review', () => {
  const html = nowMarkup(view(), options, nowAt);
  const row = html.slice(html.indexOf('id="now-row-w-105"'), html.indexOf('</li>', html.indexOf('id="now-row-w-105"')));
  assert.match(row, /Agent review: approve/);
  assert.match(row, /Round 2/);
  const data = nowData();
  data.recent[0].verdict = '';
  const bare = nowMarkup(view({ data }), options, nowAt);
  assert.doesNotMatch(bare.slice(bare.indexOf('id="now-row-w-105"'), bare.indexOf('</li>', bare.indexOf('id="now-row-w-105"'))), /Agent review/);
});

test('money is nl-NL and unknown spend is never zero', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /US\$\u00a01,50<\/span> of <span class="num money">US\$\u00a03,00/, 'a review row shows spend of the Shift budget');
  assert.match(html, /<span class="meter-value">Not reported<\/span>/, 'a running Run without observed spend says so');
  assert.match(html, /of US\$\u00a02,50/);
  assert.doesNotMatch(html, /\$0\.00|\$1\.50/);
  const data = nowData();
  data.waiting[0].latestShift = null;
  data.waiting[0].spentUsd = null;
  assert.match(nowMarkup(view({ data }), options, nowAt), /Spend not reported/);
  assert.match(nowMarkup(view(), options, nowAt), /Spend · 24 h[\s\S]*?US\$\u00a04,12[\s\S]*?Settled · US\$\u00a00,40 reserved/);
});

test('finished Runs show outcome, agent verdict and failure in plain words, newest finish first', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /Opened a pull request/);
  assert.match(html, /Agent review: approve/, 'an agent verdict is never presented as a human review');
  assert.match(html, /Failed<\/span><\/span><span>The worker lost its lease/);
  assert(html.indexOf('id="now-row-f-30"') < html.indexOf('id="now-row-f-31"'), 'the Run that finished last comes first');
  assert.deepEqual(byFinish([{ id: 'a', finishedAt: '2026-09-20T08:00:00Z' }, { id: 'b', finishedAt: null }, { id: 'c', finishedAt: '2026-09-20T09:00:00Z' }]).map(run => run.id), ['c', 'a', 'b']);
});

test('every moment is a time element, and a running Run shows its elapsed time as a duration', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /<time class="num" datetime="PT30M" title="Started [\d-]+ [\d:]+">30 min<\/time>/);
  assert.match(html, /<h2 class="now-digest-title" id="now-digest-title">Since <time class="num" datetime="2026-09-20T09:10:00\.000Z" title="[^"]+">\d\d:\d\d<\/time><span class="now-digest-ago"> · <time[^>]*>50 min ago<\/time><\/span><\/h2>/);
  assert.match(html, /<span class="now-when-label">Updated <\/span><time class="num" datetime="2026-09-20T09:00:00\.000Z"/);
});

test('a failed Ploeg group shows an inline error with retry and never renders as empty', () => {
  const data = nowData();
  data.waiting = [];
  data.errors = { waiting: 'Ploeg could not provide its operator data.' };
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.match(html, /Could not load what waits on you/);
  assert.match(html, /Ploeg could not provide its operator data\./);
  assert.match(html, /id="now-retry-waiting"[^>]*data-action="now-retry"/, 'the retry button keeps a stable id so focus survives');
  assert.doesNotMatch(html, /Nothing waits on you/);
  assert.match(html, /Waiting on you<\/span><strong class="stat-value" data-quiet>—<\/strong><span class="stat-detail">Could not be loaded/, 'the stat says it is unknown, not zero');
  assert.match(html, /Recently finished/);
  assert.match(html, /Opened a pull request/, 'the healthy groups still render');
  const running = nowData();
  running.errors = { running: 'x' };
  assert.match(nowMarkup(view({ data: running }), options, nowAt), /Could not load what is running[\s\S]*id="now-retry-running"/);
  const recent = nowData();
  recent.errors = { recent: 'x' };
  assert.match(nowMarkup(view({ data: recent }), options, nowAt), /Could not load finished Runs[\s\S]*id="now-retry-recent"/);
});

test('an empty queue is a positive, specific state', () => {
  const data = nowData();
  data.waiting = [];
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.match(html, /Nothing waits on you/);
  assert.match(html, /1 Run is working; the last Run finished <time[^>]*>15 min ago<\/time>\./);
  assert.match(html, /Nothing waits on you[\s\S]*1 Work Item stopped retrying after repeated failures\./, 'stopped work stays visible under the all-clear');
  data.running = [];
  assert.match(nowMarkup(view({ data }), options, nowAt), /No Run is working right now; the last Run finished <time[^>]*>15 min ago<\/time>; 2 Work Items are queued\./);
  assert.match(nowMarkup(view({ data }), options, nowAt), /No Run is working[\s\S]*1 Run waits for a worker\./);
  assert.doesNotMatch(nowMarkup(view({ data }), options, nowAt), /Running now<span class="count"/, 'a zero count is left out');
  assert.doesNotMatch(nowMarkup(view({ data }), options, nowAt), /Waiting on you<span class="count"/);
});

test('the page-level failure names the cause and offers the ways forward', () => {
  const failure = nowMarkup({ data: null, error: { message: 'Ploeg could not be reached.' } }, options, nowAt);
  assert.match(failure, /Could not reach Ploeg/);
  assert.match(failure, /Ploeg could not be reached\./);
  assert.match(failure, /id="now-retry-page"[^>]*data-action="now-retry"/);
  assert.match(failure, /href="#settings\/environment"[^>]*>[\s\S]*?Check Environment/);
  assert.match(nowMarkup({ data: null, error: { message: 'x', code: 'ploeg_unconfigured' } }, options, nowAt), /Connect Ploeg to see your work[\s\S]*href="#settings\/environment"/);
  assert.match(nowMarkup({ data: null, error: { message: 'x', code: 'ploeg_scope' } }, options, nowAt), /Your account has no Ploeg Teams/);
  const loading = nowMarkup({ data: null, error: null }, options, nowAt);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Loading…/);
  assert.equal(loading.match(/class="stat now-stat now-stat-skeleton"/g).length, 4, 'the skeleton draws the four stat tiles as tiles');
  const stale = nowMarkup(view({ error: { message: 'Ploeg did not answer.' } }), options, nowAt);
  assert.match(stale, /Could not refresh[\s\S]*Ploeg did not answer\. Showing what Ploeg reported <time[^>]*>1 min ago<\/time>\./);
  assert.match(stale, /id="now-retry-banner"/);
  assert.match(stale, /Round half-cent totals/, 'the last data stays visible');
});

test('Refresh stays away while a Try again button is on screen', () => {
  assert.equal(offersRetry(view()), false);
  assert.equal(offersRetry({ data: null, error: { message: 'x' } }), true);
  assert.equal(offersRetry({ data: null, error: { message: 'x', code: 'ploeg_unconfigured' } }), false);
  assert.equal(offersRetry(view({ error: { message: 'x' } })), true);
  assert.equal(offersRetry(view({ data: { ...nowData(), errors: { running: 'x' } } })), true);
});

test('malformed groups and unexpected states never break the page or vanish', () => {
  const data = nowData();
  data.running = undefined;
  data.recent = null;
  data.waiting.push({ id: '113', team: 'delivery', state: 'stale', title: 'Migrate the order export', url: '', createdAt: at, updatedAt: at, infraFailures: 10, spentUsd: null, pullRequestUrl: '' });
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.match(html, /No Run is working/);
  assert.match(html, /No Run has finished yet/);
  assert.match(html, /id="now-group-needs">[\s\S]*Migrate the order export/, 'a stale item lands with the items that need you');
  assert.match(html, /Infrastructure kept failing/);
  assert.doesNotMatch(html, /now-stale/, 'the stopped-retrying row does not repeat an item already listed');
});

test('stopped work Now cannot list is a normal row that links to Work', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /<li class="now-item now-stale"><a class="list-row" href="#work\?lane=all" id="now-stale-open" data-tone="severe">[\s\S]*?<span class="list-row-title">1 Work Item stopped retrying after repeated failures\.<\/span>[\s\S]*?See it in Work/);
  assert.doesNotMatch(html, /Now does not list/);
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
  data.waiting[4].sourceTitle = '<b>source</b>';
  data.recent[0].workItemTitle = '<script>alert(1)</script>';
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.doesNotMatch(html, /<img src=x|<script>|<b>source|javascript:|secret@/);
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
  assert.match(html, /Illustrative records · no model calls, no spend/);
  assert.match(html, /data-demo[\s\S]*Demo · no model calls/, 'the running meter draws no spend in the demo');
  assert.match(html, /Spend · 24 h<\/span><strong class="stat-value" data-quiet>—<\/strong><span class="stat-detail">Demo · no model calls/, 'the demo spend tile shows no amount, like the meter');
  assert.doesNotMatch(html, /US\$\u00a04,12|US\$\u00a00,00/);
  assert.doesNotMatch(html, /1,50<\/span> of/, 'the demo does not show Shift spend');
});

test('the digest counts what changed since the last visit and welcomes a first visit', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /<strong class="num">2<\/strong> need you/, 'two Work Items started needing you after 09:10');
  assert.match(html, /<strong class="num">1<\/strong> proposed/);
  assert.match(html, /<strong class="num">2<\/strong> Runs finished/);
  assert.doesNotMatch(html, /ready for review<\/li>/, 'a count of zero is left out');
  assert.match(html, /id="now-caught-up"[^>]*data-action="now-caught-up"/);
  const welcome = nowMarkup(view({ since: null }), options, nowAt);
  assert.match(welcome, /Welcome to De Vloer<\/h2> <p class="now-digest-body">From your next visit, this line sums up what changed while you were away\.<\/p>/);
  const quiet = nowMarkup(view({ since: '2026-09-20T09:59:00Z' }), options, nowAt);
  assert.match(quiet, /Nothing new since <time[^>]*>\d\d:\d\d<\/time>/);
  assert.match(quiet, /5 Work Items still wait on you\./);
  assert.doesNotMatch(quiet, /now-caught-up/, 'nothing new means nothing to mark');
  const caught = nowMarkup(view({ since: '2026-09-20T09:59:00Z', caughtUp: true }), options, nowAt);
  assert.match(caught, /Marked as read at <time[^>]*>\d\d:\d\d<\/time>[\s\S]*5 Work Items still wait on you\./);
  assert.doesNotMatch(caught, /caught up<\/h2>/, 'caught up never contradicts the Work Items that still wait');
  assert.deepEqual(digestCounts(nowData(), '2026-09-20T09:10:00Z'), { review: 0, needsYou: 2, proposed: 1, finished: 2, finishedCapped: false });
  assert.deepEqual(digestCounts({ ...nowData(), errors: { waiting: 'x', recent: 'y' } }, at), { review: null, needsYou: null, proposed: null, finished: null, finishedCapped: false });
  const many = { ...nowData(), recent: Array.from({ length: runPage.live }, (_, index) => ({ id: String(index + 1), finishedAt: '2026-09-20T09:59:00Z' })) };
  assert.equal(digestCounts(many, '2026-09-20T09:00:00Z').finishedCapped, true, 'a full page of newer Runs may hide more');
  assert.match(nowMarkup(view({ data: many }), options, nowAt), /<strong class="num">25\+<\/strong> Runs finished/);
  const demoPage = { ...nowData(), demo: true, recent: many.recent.slice(0, runPage.demo) };
  assert.equal(digestCounts(demoPage, '2026-09-20T09:00:00Z').finishedCapped, true, 'the demo pages Runs by 10');
  assert.equal(digestCounts({ ...demoPage, recentTruncated: false }, '2026-09-20T09:00:00Z').finishedCapped, false, 'a server that says the page is complete is believed');
});

test('a Run list may hold more only when the server says so or the page is full', () => {
  assert.equal(mayHoldMore({ demo: false, running: Array(3).fill({}) }, 'running'), false);
  assert.equal(mayHoldMore({ demo: true, running: Array(10).fill({}) }, 'running'), true);
  assert.equal(mayHoldMore({ demo: false, running: Array(10).fill({}) }, 'running'), false);
  assert.equal(mayHoldMore({ demo: false, running: [], runningTruncated: true }, 'running'), true);
  const data = { ...nowData(), demo: true, running: Array.from({ length: 10 }, (_, index) => ({ ...nowData().running[0], id: String(index) })) };
  assert.match(nowMarkup(view({ data }), options, nowAt), /Running<\/span><strong class="stat-value">10\+<\/strong>/);
});

test('unread dots mark what changed since the last visit, only when they tell rows apart', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /id="now-row-w-108"[^>]*data-unread/, 'rows that changed since the last visit carry the unread dot');
  assert.doesNotMatch(html, /id="now-row-w-101"[^>]*data-unread/);
  assert.match(html.slice(html.indexOf('id="now-row-w-108"')), /^[^]*?<span class="sr-only">New since your last visit\.<\/span>/, 'the dot has a text alternative');
  assert.doesNotMatch(html, /id="now-row-f-3[01]"[^>]*data-unread/, 'every finished Run is new, so the dots would say nothing');
  const all = nowMarkup(view({ since: '2026-09-19T00:00:00Z' }), options, nowAt);
  assert.doesNotMatch(all, /data-unread|New since your last visit/);
});

test('Needs you stays a flat list up to five items or when every reason differs', () => {
  const five = ['plan_exhausted', 'plan_exhausted', 'fix_round_cap_reached', 'plan_exhausted', 'plan_exhausted'].map((code, index) => needsItem(String(200 + index), code));
  assert.equal(reasonBuckets(five), null);
  const distinct = ['plan_exhausted', 'fix_round_cap_reached', 'writing_run_failed_repeatedly', 'writing_run_killed_repeatedly', 'run stuck: builder round 2', 'budget exhausted: pool 1, spent 1, reserved 0'].map((code, index) => needsItem(String(210 + index), code));
  assert.equal(reasonBuckets(distinct), null, 'six different reasons would give six headers of one row');
});

test('a long Needs-you list groups by reason: shared reasons first, largest first, singles pooled', () => {
  const codes = ['run stuck: builder round 2', 'fix_round_cap_reached', 'plan_exhausted', 'fix_round_cap_reached', 'plan_exhausted', 'fix_round_cap_reached', 'budget exhausted: pool 1, spent 1, reserved 0', 'fix_round_cap_reached', 'plan_exhausted'];
  const rows = codes.map((code, index) => needsItem(String(300 + index), code));
  const buckets = reasonBuckets(rows);
  assert.deepEqual(buckets.map(bucket => bucket.reason?.code ?? 'other'), ['fix_round_cap_reached', 'plan_exhausted', 'other']);
  assert.deepEqual(buckets[0].rows.map(row => row.id), ['301', '303', '305', '307'], 'rows keep Ploeg’s oldest-first order');
  assert.deepEqual(buckets[2].rows.map(row => row.id), ['300', '306']);
  const data = { ...nowData(), waiting: rows };
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.match(html, /<section class="now-group" data-group="needs" data-split/);
  assert.match(html, /<h4 class="now-subgroup-title" id="now-reason-fix_round_cap_reached">[\s\S]*?<span>Reviewer still wants changes<\/span><\/span><span class="count">4<\/span><\/h4><p class="now-subgroup-note">The reviewer still asked for changes when the Team’s fix Rounds ran out\. <span class="now-why-fix">Read the findings\. Finish the branch by hand, or sharpen the ticket\.<\/span><\/p><a class="now-subgroup-more" href="#work\?lane=needs_human">1 more in Work/);
  assert.equal((html.match(/aria-labelledby="now-reason-fix_round_cap_reached"><li/g) || []).length, 1);
  const section = html.slice(html.indexOf('id="now-reason-fix_round_cap_reached"'), html.indexOf('id="now-reason-plan_exhausted"'));
  assert.equal((section.match(/<li class="now-item">/g) || []).length, subgroupLimit);
  assert.doesNotMatch(section, /<span class="chip" data-tone="attention"[^>]*title=/, 'grouped rows leave the reason to their header');
  assert.doesNotMatch(section, /class="now-why"/, 'a sentence the whole group shares is said once');
  assert.match(html, /id="now-reason-other">[\s\S]*?Other reasons[\s\S]*?Agent is stuck[\s\S]*?Budget ran out/, 'single reasons keep their chips in one pooled group');
});

test('a long flat group lists the first rows and points to the rest', () => {
  const data = nowData();
  data.waiting = Array.from({ length: groupLimit + 2 }, (_, index) => ({ ...nowData().waiting[4], id: String(400 + index), title: `Proposal ${index}` }));
  const html = nowMarkup(view({ data }), options, nowAt);
  assert.equal((html.match(/id="now-row-w-4\d\d"/g) || []).length, groupLimit);
  assert.match(html, /<a class="now-more" href="#proposed">Show 2 more in Proposed/);
  assert.match(html, /Proposed<\/span><span class="count">10<\/span>/, 'the group counts everything, not only what is shown');
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
  assert(html.includes(`<div class="card-body"><button type="button" class="now-new" id="now-show-new-waiting" data-action="now-show-new">${icon('refresh')}<span>1 new Work Item · Show</span></button>`), 'the pill sits above the first row with a stable id and no external-link glyph');
  assert.match(html, /id="now-show-new-recent"[^>]*>[\s\S]*?1 new · Show/);
  assert.doesNotMatch(html, /A brand new blocker/);
  assert.match(html, /Waiting on you<span class="count" data-tone="attention">5<\/span>/, 'the header counts what really waits');
  assert.match(nowMarkup(view({ data: next, shown: shownIds(next) }), options, nowAt), /A brand new blocker/);
  const empty = visibleNow(next, { waiting: new Set(), recent: shown.recent });
  assert.equal(empty.held.waiting, 0, 'an empty list takes new rows directly');
  assert.deepEqual(visibleNow(next, null).held, { waiting: 0, recent: 0 });
});

test('the stat row links into Work, Runs and Insights with honest partial labels', () => {
  const html = nowMarkup(view(), options, nowAt);
  assert.match(html, /<div class="stat now-stat" data-tone="attention">[\s\S]*?Waiting on you[\s\S]*?>5<[\s\S]*?<span>1 to review<\/span><span>3 need you<\/span><span>1 proposed<\/span>/, 'the breakdown hides separators at line starts');
  assert.match(html, /href="#runs\?state=running"[^>]*>[\s\S]*?Running[\s\S]*?\+1 waiting for a worker/, 'pending Runs read as an addition, not as the running one');
  assert.match(html, /href="#work\?lane=queued"[^>]*>[\s\S]*?Queued[\s\S]*?>2</);
  assert.match(html, /href="#insights\?window=24h"/);
  assert.equal((html.match(/<span class="now-stat-go" aria-hidden="true">/g) || []).length, 3, 'linked tiles show where they go; Waiting stays a summary');
  const unsupported = nowMarkup(view({ summary: { data: null, error: { message: 'no', code: 'ploeg_unsupported' } } }), options, nowAt);
  assert.match(unsupported, /Queued<\/span><strong class="stat-value" data-quiet>—<\/strong><span class="stat-detail">Not reported by this Ploeg/);
  assert.doesNotMatch(unsupported, /stopped retrying/);
  const pending = nowMarkup(view({ summary: { data: null, error: null } }), options, nowAt);
  assert.match(pending, /Queued<\/span><strong class="stat-value" data-quiet>—<\/strong><span class="stat-detail">Loading…/, 'the summary loads after the lists and says so meanwhile');
});

test('the keyboard hints follow the single-key preference', () => {
  assert.match(nowMarkup(view(), options, nowAt), /class="now-keys"[\s\S]*?<kbd class="kbd">j<\/kbd><kbd class="kbd">k<\/kbd>[\s\S]*?open PR or tracker/);
  assert.doesNotMatch(nowMarkup(view(), { singleKeys: false }, nowAt), /now-keys/);
});
