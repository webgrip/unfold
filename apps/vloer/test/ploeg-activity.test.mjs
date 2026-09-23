import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityMarkup, canDecide, duration, eventKind, mergeFeed, overviewMarkup, ploegTabsMarkup, proposedMarkup, relativeTime, runFilter, runSpend, runsMarkup, usdNl } from '../public/ploeg-activity.js';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { summaryTotals } from '../src/ploeg.ts';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const helpers = { escape, icon: name => `<i data-icon="${name}"></i>`, money: value => `$${value}`, safeUrl: value => value, ago: () => 'now' };
const now = Date.parse('2026-09-10T09:00:00Z');
const event = (id, action = 'run.claimed', team = 'delivery') => ({ id: String(id), at: '2026-09-10T08:00:00Z', actor: 'ploegd', action, workItemId: '105', team, detail: {}, workItemTitle: 'Round half-cent totals' });
const ids = feed => feed.events.map(entry => entry.id);
const summary = (window = '24h', demo = false) => { const { generatedAt, teams } = ploegDemo.summary(window, ploegDemo.items); return { demo, window, generatedAt, teams, totals: summaryTotals(teams), fetchedAt: generatedAt }; };

test('money uses the owner format: US dollars, two decimals, nl-NL grouping', () => {
  assert.equal(usdNl(0.98), 'US$\u00a00,98');
  assert.equal(usdNl(1234.5), 'US$\u00a01.234,50');
  assert.equal(usdNl(0.005), 'US$\u00a00,01');
  assert.equal(usdNl(null), 'US$\u00a00,00');
});

test('times and durations read in plain words', () => {
  assert.equal(relativeTime('2026-09-10T08:59:30Z', now), 'Just now');
  assert.equal(relativeTime('2026-09-10T08:46:00Z', now), '14 min ago');
  assert.equal(relativeTime('2026-09-10T06:00:00Z', now), '3 h ago');
  assert.equal(relativeTime('2026-09-08T09:00:00Z', now), '2 d ago');
  assert.equal(relativeTime(null, now), 'Never');
  assert.equal(duration(45), '45 s');
  assert.equal(duration(840), '14 min');
  assert.equal(duration(3900), '1 h 5 min');
  assert.equal(duration(7200), '2 h');
  assert.equal(duration(null), '');
});

test('event kinds have plain names and filter groups, with a readable fallback', () => {
  assert.deepEqual(eventKind('work_item.proposed'), { group: 'work', label: 'Proposed by an agent' });
  assert.deepEqual(eventKind('shift.closed'), { group: 'runs', label: 'Shift closed' });
  assert.deepEqual(eventKind('llm.reconciled'), { group: 'spend', label: 'Spend settled' });
  assert.deepEqual(eventKind('delivery.publication_confirmed'), { group: 'review', label: 'Delivery: publication confirmed' });
  assert.deepEqual(eventKind('worker.request_rejected'), { group: 'other', label: 'Worker: request rejected' });
});

test('loading older events appends without duplicates and keeps newest first', () => {
  const first = mergeFeed(null, { events: [event(30), event(29), event(28)], nextCursor: '28' }, 'newer');
  assert.deepEqual(ids(first), ['30', '29', '28']);
  const older = mergeFeed(first, { events: [event(28), event(27), event(26)], nextCursor: null }, 'older');
  assert.deepEqual(ids(older), ['30', '29', '28', '27', '26']);
  assert.equal(older.nextCursor, null);
});

test('a refresh folds in new events without duplicating the ones already shown, and keeps the older-page cursor', () => {
  const feed = { events: [event(30), event(29), event(28)], nextCursor: '28' };
  const refreshed = mergeFeed(feed, { events: [event(32), event(31), event(30), event(29)], nextCursor: '29' }, 'newer');
  assert.deepEqual(ids(refreshed), ['32', '31', '30', '29', '28']);
  assert.equal(refreshed.added, 2);
  assert.equal(refreshed.nextCursor, '28');
  const again = mergeFeed(refreshed, { events: [event(32), event(31), event(30)], nextCursor: '30' }, 'newer');
  assert.deepEqual(ids(again), ids(refreshed));
  assert.equal(again.added, 0);
});

test('a refresh that cannot reach the shown events replaces the feed instead of leaving a silent gap', () => {
  const feed = { events: [event(10), event(9)], nextCursor: '9' };
  const jumped = mergeFeed(feed, { events: [event(80), event(79)], nextCursor: '79' }, 'newer');
  assert.equal(jumped.reset, true);
  assert.deepEqual(ids(jumped), ['80', '79']);
  assert.equal(jumped.nextCursor, '79');
  const complete = mergeFeed(feed, { events: [event(11)], nextCursor: null }, 'newer');
  assert.deepEqual(ids(complete), ['11', '10', '9']);
});

test('ids compare as big integers, not strings', () => {
  const merged = mergeFeed({ events: [event('9007199254740993')], nextCursor: null }, { events: [event('10000000000000000'), event('9007199254740993')], nextCursor: null }, 'newer');
  assert.deepEqual(ids(merged), ['10000000000000000', '9007199254740993']);
});

test('the activity feed links each Work Item, filters by kind and escapes Ploeg text', () => {
  const hostile = { ...event(40, 'work_item.proposed'), workItemTitle: '<img src=x onerror=alert(1)>' };
  const view = { events: [hostile, event(39, 'llm.reconciled'), { ...event(38), workItemTitle: '' }], nextCursor: '38', team: '', kind: '', loading: false, demo: false, refreshedAt: '2026-09-10T08:59:00Z' };
  const html = activityMarkup(view, ['delivery'], helpers, now);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<a class="ploeg-link" href="#ploeg\/105">&#60;img/);
  assert.match(html, /Work Item 105/);
  assert.match(html, /<strong>Proposed by an agent<\/strong>/);
  assert.match(html, /<time datetime="2026-09-10T08:00:00Z" title="[^"]+">1 h ago<\/time>/);
  assert.match(html, /data-action="ploeg-feed-older"/);
  const spend = activityMarkup({ ...view, kind: 'spend' }, ['delivery'], helpers, now);
  assert.match(spend, /Spend settled/);
  assert.doesNotMatch(spend, /Proposed by an agent/);
});

test('the overview shows totals as tiles and a per-team table, never a chart', () => {
  const data = summary('30d');
  const html = overviewMarkup({ window: '30d', data, loading: false, error: null }, helpers, now);
  for (const label of ['Awaiting review', 'Needs human', 'Running', 'Queued', 'Proposed', 'Settled · 30d']) assert.match(html, new RegExp(`${label}</span>`));
  assert.match(html, /href="#ploeg\/lane\/awaiting_review"/);
  assert.match(html, /href="#ploeg\/proposed"/);
  assert.match(html, /<th scope="row">delivery<\/th>/);
  assert.match(html, /<th scope="row">research<\/th>/);
  assert.match(html, /<th scope="row">All teams<\/th>/);
  assert.match(html, /Reserved now US\$\s0,00/);
  assert.match(html, /aria-pressed="true" aria-label="30 days"/);
  assert.doesNotMatch(html, /<svg|<canvas|polyline/);
  const demo = overviewMarkup({ window: '24h', data: { ...summary('24h'), demo: true }, loading: false, error: null }, helpers, now);
  assert.match(demo, /Illustrative Ploeg records/);
  assert.match(demo, /Demo · no model calls/);
  assert.match(demo, /<td class="num">No model calls<\/td>/);
});

test('the demo summary counts window-bound Runs and keeps spend at zero', () => {
  assert.deepEqual(summary('24h').totals.runs, { pending: 1, running: 1, finished: 3, failed: 0, stuck: 1 });
  assert.deepEqual(summary('7d').totals.runs, { pending: 1, running: 1, finished: 4, failed: 1, stuck: 1 });
  assert.deepEqual(summary('30d').totals.runs, { pending: 1, running: 1, finished: 5, failed: 2, stuck: 1 });
  assert.deepEqual(summary('30d').totals.spend, { settledUsd: 0, reservedUsd: 0 });
  assert.equal(summary('24h').totals.workItems.proposed, 2);
});

test('an older Ploeg without the activity routes gets a clear note, not an error wall', () => {
  const error = { code: 'ploeg_unsupported', message: 'This Ploeg version does not provide activity data yet.' };
  for (const html of [overviewMarkup({ window: '24h', data: null, error }, helpers, now), activityMarkup({ events: null, error, team: '', kind: '' }, [], helpers, now), runsMarkup({ runs: null, error, filter: {} }, [], helpers, now)]) {
    assert.match(html, /This Ploeg version does not provide activity data yet/);
    assert.match(html, /href="#ploeg\/work"/);
    assert.doesNotMatch(html, /Ploeg needs attention|role="alert"/);
  }
  const other = overviewMarkup({ window: '24h', data: null, error: { code: 'ploeg_unavailable', message: 'Ploeg could not be reached.' } }, helpers, now);
  assert.match(other, /Ploeg needs attention/);
});

test('Run rows show settled, reserved or unsettled spend, tokens and models', () => {
  const run = { ...ploegDemo.runs[1], settledUsd: 0.4567, usage: { inputTokens: 12345, outputTokens: 678, models: ['claude-sonnet', 'claude-haiku'] } };
  assert.equal(runSpend(run, false), 'US$\u00a00,46');
  assert.equal(runSpend({ ...run, settledUsd: null, state: 'running', authorizedUsd: 1.5 }, false), 'Reserved · up to US$\u00a01,50');
  assert.equal(runSpend({ ...run, settledUsd: null, state: 'pending', authorizedUsd: null }, false), 'Reserved');
  assert.equal(runSpend({ ...run, settledUsd: null }, false), 'Not settled yet');
  assert.equal(runSpend(run, true), 'No model calls');
  const html = runsMarkup({ runs: [run], nextBefore: '25', filter: {}, demo: false }, ['delivery'], helpers, now);
  assert.match(html, /12\.345 in · 678 out/);
  assert.match(html, /claude-sonnet, claude-haiku/);
  assert.match(html, /14 min/);
  assert.match(html, /href="#ploeg\/105"/);
  assert.match(html, /data-action="ploeg-runs-older"/);
  const demo = runsMarkup({ runs: ploegDemo.runs, nextBefore: null, filter: {}, demo: true }, ['delivery'], helpers, now);
  assert.doesNotMatch(demo, /US\$\s0,00<\/td>/);
  assert.match(demo, /infra node/);
});

test('an outcome filter only applies to finished Runs', () => {
  assert.deepEqual(runFilter({ state: 'running', outcome: 'failed' }), { team: '', state: 'running', outcome: '' });
  assert.deepEqual(runFilter({ state: 'finished', outcome: 'failed' }), { team: '', state: 'finished', outcome: 'failed' });
  assert.deepEqual(runFilter({ outcome: 'stuck' }), { team: '', state: '', outcome: 'stuck' });
  assert.match(runsMarkup({ runs: [], filter: { state: 'pending' } }, [], helpers, now), /id="ploeg-runs-outcome" aria-label="Run outcome" disabled/);
});

test('only operators and administrators see Approve and Reject; viewers never do', () => {
  const items = ploegDemo.items.filter(item => item.state === 'proposed').map(item => ({ ...item, sourceTitle: ploegDemo.items.find(entry => entry.id === item.sourceWorkItemId).title }));
  const view = { items, loading: false, busy: false, demo: false, truncated: false };
  assert.equal(canDecide({ role: 'viewer' }), false);
  assert.equal(canDecide(undefined), false);
  for (const role of ['admin', 'operator']) {
    const html = proposedMarkup(view, { role }, helpers, now);
    assert.equal(html.match(/data-action="ploeg-approve"/g).length, 2);
    assert.equal(html.match(/data-action="ploeg-reject"/g).length, 2);
  }
  const viewer = proposedMarkup(view, { role: 'viewer' }, helpers, now);
  assert.doesNotMatch(viewer, /data-action="ploeg-(approve|reject)"|<button class="button primary"/);
  assert.match(viewer, /An operator or administrator approves or rejects it/);
  assert.match(viewer, /Discovered work/);
  assert.match(viewer, /Clarification/);
  assert.match(viewer, /<span class="ploeg-flag ready">Ready<\/span>/);
  assert.match(viewer, /<span class="ploeg-flag not-ready">Needs refinement<\/span>/);
  assert.match(viewer, /From <a class="ploeg-link" href="#ploeg\/105">Round half-cent totals consistently<\/a>/);
  const unknown = proposedMarkup({ ...view, items: [{ ...items[0], sourceWorkItemId: undefined, createdKind: undefined, ready: undefined, sourceTitle: '' }] }, { role: 'operator' }, helpers, now);
  assert.match(unknown, /Source Work Item not reported/);
  assert.match(unknown, /Kind not reported/);
  assert.match(unknown, /Ready not reported/);
});

test('the tabs put Overview, Activity, Runs and Proposed before the existing lanes', () => {
  const html = ploegTabsMarkup('lanes', 'needs_human', helpers);
  assert.deepEqual([...html.matchAll(/data-tab="([a-z_]+)"/g)].map(match => match[1]), ['overview', 'activity', 'runs', 'proposed', 'awaiting_review', 'needs_human', 'leased', 'queued', 'all']);
  assert.match(html, /href="#ploeg\/lane\/needs_human" data-tab="needs_human" class="selected" aria-current="page"/);
  assert.match(ploegTabsMarkup('overview', 'needs_human', helpers), /href="#ploeg" data-tab="overview" class="selected"/);
});
