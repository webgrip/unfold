import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityMarkup, actorOf, approveDialogMarkup, canDecide, duration, eventDays, eventKind, eventStory, freshRuns, mergeFeed, mergeRuns, newerEvents, overviewMarkup, problemMarkup, proposalCreator, proposedMarkup, rejectDialogMarkup, relativeTime, runFilter, runSpend, runsMarkup, sortRuns, usdNl } from '../public/ploeg-activity.js';
import { liveRefresh, track } from '../public/views/ploeg-common.js';
import { state } from '../public/core/state.js';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { summaryTotals } from '../src/ploeg.ts';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const helpers = { escape, icon: name => `<i data-icon="${name}"></i>`, money: value => `$${value}`, safeUrl: value => value, ago: () => 'now' };
const now = Date.parse('2026-09-10T09:00:00Z');
const space = ' ';
const event = (id, action = 'run.claimed', team = 'delivery', extra = {}) => ({ id: String(id), at: '2026-09-10T08:00:00Z', actor: 'ploegd:shift-engine', action, workItemId: '105', team, detail: {}, workItemTitle: 'Round half-cent totals', ...extra });
const ids = feed => feed.events.map(entry => entry.id);
const summary = (window = '24h', demo = false) => { const { generatedAt, teams } = ploegDemo.summary(window, ploegDemo.items); return { demo, window, generatedAt, teams, totals: summaryTotals(teams), fetchedAt: generatedAt }; };
const run = extra => ({ id: '61', workItemId: '205', workItemTitle: 'Show the delivery window', externalRef: 'VIK-642', team: 'delivery', role: 'implementer', round: 1, writes: true, state: 'finished', outcome: 'pr_opened', verdict: '', failureReason: '', startedAt: '2026-09-10T08:00:00Z', finishedAt: '2026-09-10T08:20:00Z', durationSeconds: 1200, authorizedUsd: 1.5, settledUsd: 0.88, observedUsd: null, reservedModels: [], usage: { inputTokens: 12345, outputTokens: 678, models: ['claude-sonnet', 'claude-haiku'] }, ...extra });
const auditActions = ['work_item.queued', 'work_item.refreshed', 'work_item.proposed', 'work_item.approved', 'work_item.rejected', 'work_item.withdrawn', 'work_item.needs_human', 'work_item.awaiting_review', 'work_item.done', 'work_item.stale', 'created_work_item.accepted', 'created_work_item.rejected', 'follow_up.created', 'follow_up.skipped', 'review.changes_requested', 'round.opened', 'round.reopened', 'run.claimed', 'run.expired', 'shift.closed', 'lease.acquired', 'lease.expired', 'infra_cap', 'checkpoint.written', 'outcome.pr_opened', 'outcome.pr_updated', 'outcome.no_change_needed', 'outcome.follow_up_created', 'outcome.issue_updated', 'outcome.stuck', 'outcome.failed', 'operator.admitted', 'operator.admission_expired', 'delivery.candidate_admitted', 'delivery.verification_recorded', 'delivery.approved', 'delivery.publication_reserved', 'delivery.publication_published', 'delivery.publication_unknown', 'llm.reserved', 'llm.minting', 'llm.issued', 'llm.observed', 'llm.blocked', 'llm.unissued_blocked', 'llm.unknown', 'llm.reconciled'];

test('the earlier formatter names keep working: money is nl-NL and unknown is never zero, Now’s times and durations are unchanged', () => {
  assert.equal(usdNl(0.98), `US$${space}0,98`);
  assert.equal(usdNl(1234.5), `US$${space}1.234,50`);
  assert.equal(usdNl(0.005), `<${space}US$${space}0,01`);
  assert.equal(usdNl(null), 'Not reported');
  assert.equal(relativeTime('2026-09-10T08:59:30Z', now), 'Just now');
  assert.equal(relativeTime('2026-09-10T08:46:00Z', now), '14 min ago');
  assert.equal(relativeTime('2026-09-08T09:00:00Z', now), '2 d ago');
  assert.equal(relativeTime(null, now), 'Never');
  assert.equal(duration(45), '45 s');
  assert.equal(duration(3900), '1 h 5 min');
  assert.equal(duration(null), '');
});

test('every audit action Ploeg writes for a Work Item has its own human label, tone and filter group', () => {
  for (const action of auditActions) {
    const kind = eventKind(action);
    assert.doesNotMatch(kind.label, /_|:/, `${action} reads as "${kind.label}"`);
    assert.notEqual(kind.group, 'other', `${action} has no filter group`);
    assert.ok(kind.glyph && kind.tone, action);
  }
  assert.deepEqual(eventKind('work_item.needs_human'), { group: 'work', label: 'Needs you', tone: 'attention', glyph: 'alert' });
  assert.deepEqual(eventKind('work_item.awaiting_review'), { group: 'work', label: 'Ready for your review', tone: 'review', glyph: 'pull-request' });
  assert.deepEqual(eventKind('work_item.done'), { group: 'work', label: 'Done', tone: 'success', glyph: 'check-circle' });
  assert.deepEqual(eventKind('work_item.stale'), { group: 'work', label: 'Stopped retrying', tone: 'severe', glyph: 'clock' });
  assert.equal(eventKind('infra_cap').label, 'Infrastructure kept failing; Ploeg stopped');
  assert.equal(eventKind('outcome.failed').tone, 'danger');
  assert.equal(eventKind('llm.reconciled').group, 'spend');
  assert.equal(eventKind('delivery.publication_confirmed').label, 'Publication confirmed');
  assert.deepEqual(eventKind('worker.request_rejected'), { group: 'other', label: 'Worker: request rejected', tone: 'neutral', glyph: 'circle' });
});

test('an event tells what happened from its own fields: the Role and Round, Ploeg’s reason, the amount and the failures', () => {
  assert.deepEqual(eventStory(event(1, 'run.claimed', 'delivery', { detail: { role: 'implementer', round: 2, writes: true, authorizedUsd: 1.5 } })), { group: 'runs', label: 'Implementer started Round 2', tone: 'live', glyph: 'runs', detail: `Writes to the branch · up to US$${space}1,50 authorized` });
  assert.equal(eventStory(event(1, 'run.claimed', 'delivery', { detail: { role: 'reviewer', round: 1, writes: false } })).detail, 'Reads only');
  assert.equal(eventStory(event(1, 'round.reopened', 'delivery', { detail: { round: 3 } })).label, 'Round 3 retried after a failed writer');
  const closed = reason => eventStory(event(1, 'shift.closed', 'delivery', { detail: { reason } }));
  assert.equal(closed('plan_exhausted').detail, 'Every planned Round ran');
  assert.deepEqual([closed('review_approved').detail, closed('review_approved').tone], ['The reviewer approved', 'success']);
  assert.equal(closed('budget exhausted: pool 0.04, spent 0.00, reserved 0.00').detail, `The budget of US$${space}0,04 could not pay for the next Round`);
  assert.equal(closed('run stuck: builder round 2').detail, 'The builder reported that it is stuck in Round 2');
  assert.deepEqual([closed('writing_run_killed_repeatedly').detail, closed('writing_run_killed_repeatedly').tone], ['The cluster kept stopping the writer (not the Work Item’s fault)', 'severe']);
  assert.equal(closed('withdrawn_unassigned').detail, 'Withdrawn: the task was unassigned from the Team in the tracker');
  assert.equal(eventStory(event(1, 'work_item.withdrawn', 'delivery', { detail: { reason: 'withdrawn_closed' } })).detail, 'The task was closed in the tracker');
  assert.equal(eventStory(event(1, 'work_item.needs_human', 'delivery', { detail: { reason: 'the budget could not fund the next round; a person is asked to take over' } })).detail, 'The budget could not fund the next round; a person is asked to take over');
  assert.equal(eventStory(event(1, 'checkpoint.written', 'delivery', { detail: { phase: 'branch_created' } })).label, 'Created the branch');
  assert.equal(eventStory(event(1, 'checkpoint.written', 'delivery', { detail: { phase: 'smoke_tested' } })).label, 'Checkpoint: smoke tested');
  assert.equal(eventStory(event(1, 'lease.expired', 'delivery', { detail: { infraFailures: 2 } })).detail, '2 infrastructure failures so far');
  assert.equal(eventStory(event(1, 'infra_cap', 'delivery', { detail: { infraFailures: 10 } })).detail, '10 infrastructure failures so far');
  assert.equal(eventStory(event(1, 'llm.reserved', 'delivery', { detail: { authorizedUsd: 1.5 } })).detail, `Up to US$${space}1,50 authorized`);
});

test('actors read as agents, Ploeg, a tracker or a person, and the signed-in operator reads as you', () => {
  const user = { id: 'u-1', name: 'Ryan' };
  assert.deepEqual(actorOf('team:delivery', user), { name: 'Agent', kind: 'agent', glyph: 'bot', title: 'An agent of the delivery Team' });
  assert.deepEqual(actorOf('ploegd:shift-engine', user), { name: 'Ploeg', kind: 'system', glyph: 'layers', title: 'Ploeg (shift engine)' });
  assert.equal(actorOf('webhook:vikunja', user).name, 'Vikunja');
  assert.equal(actorOf('webhook:demo', user).name, 'Demo tracker');
  assert.deepEqual(actorOf('operator:vloer:u-1', user), { name: 'Ryan (you)', kind: 'person', glyph: 'user', title: 'You, through vloer' });
  assert.deepEqual([actorOf('operator:vloer:u-2', user).name, actorOf('operator:vloer:u-2', user).title], ['An operator', 'Operator u-2, through vloer']);
  assert.equal(actorOf('demo-fixture').name, 'demo-fixture');
  assert.equal(actorOf('').name, 'Unknown');
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

test('a live check counts the events newer than the list without changing it, and flags a gap it cannot bridge', () => {
  const feed = { events: [event(30), event(29)], nextCursor: '29' };
  assert.deepEqual(newerEvents(feed, { events: [event(32), event(31), event(30)], nextCursor: '30' }).events.map(entry => entry.id), ['32', '31']);
  assert.equal(newerEvents(feed, { events: [event(32), event(31), event(30)], nextCursor: '30' }).gap, false);
  assert.equal(newerEvents(feed, { events: [event(90), event(89)], nextCursor: '89' }).gap, true);
  assert.deepEqual(newerEvents(feed, { events: [event(30)], nextCursor: null }).events, []);
  assert.deepEqual(ids(feed), ['30', '29']);
});

test('ids compare as big integers, not strings', () => {
  const merged = mergeFeed({ events: [event('9007199254740993')], nextCursor: null }, { events: [event('10000000000000000'), event('9007199254740993')], nextCursor: null }, 'newer');
  assert.deepEqual(ids(merged), ['10000000000000000', '9007199254740993']);
});

test('events group by local day and keep their order', () => {
  const late = new Date(2026, 8, 10, 23, 30).toISOString();
  const early = new Date(2026, 8, 10, 0, 5).toISOString();
  const before = new Date(2026, 8, 9, 22, 0).toISOString();
  const days = eventDays([event(3, 'run.claimed', 'delivery', { at: late }), event(2, 'run.claimed', 'delivery', { at: early }), event(1, 'run.claimed', 'delivery', { at: before })], new Date(2026, 8, 10, 23, 59).getTime());
  assert.deepEqual(days.map(day => [day.label, day.events.map(entry => entry.id)]), [['Today', ['3', '2']], ['Yesterday', ['1']]]);
});

test('the activity feed groups by day, labels and links every event, humanises actors and escapes Ploeg text', () => {
  const hostile = { ...event(40, 'work_item.proposed', 'delivery', { actor: 'team:delivery' }), workItemTitle: '<img src=x onerror=alert(1)>' };
  const view = { events: [hostile, event(39, 'llm.reconciled', 'delivery', { actor: 'ploegd:reconciliation' }), { ...event(38, 'work_item.approved', 'delivery', { actor: 'operator:vloer:u-1', detail: { reason: 'Worth it <b>now</b>' } }), workItemTitle: '' }], nextCursor: '38', team: '', kind: '', loading: false, demo: false };
  const html = activityMarkup(view, ['delivery'], helpers, now, { id: 'u-1', name: 'Ryan' });
  assert.doesNotMatch(html, /<img|<b>/);
  assert.match(html, /<a class="activity-event-item" href="#work\/105">&#60;img/);
  assert.match(html, /Work Item 105/);
  assert.match(html, /<h2 class="activity-day-title" id="activity-day-2026-09-10">Today<\/h2><span class="meta">3 events<\/span>/);
  assert.match(html, /<span class="timeline-title">Proposed by an agent<\/span>/);
  assert.match(html, /<span class="timeline-title">Approved<\/span>/);
  assert.match(html, /Worth it &#60;b&#62;now&#60;\/b&#62;/);
  assert.match(html, /Ryan \(you\)/);
  assert.match(html, /data-kind="agent"[^>]*>[^<]*<i data-icon="bot"><\/i>Agent/);
  assert.match(html, /<time class="num" datetime="2026-09-10T08:00:00.000Z" title="[^"]+">\d\d:00<\/time>/);
  assert.match(html, /data-action="ploeg-feed-older"/);
  assert.match(html, /<span class="activity-event-team" title="delivery">delivery<\/span>/);
  assert.equal(html.match(/data-event-id=/g).length, 3);
  const spend = activityMarkup({ ...view, kind: 'spend' }, ['delivery'], helpers, now);
  assert.match(spend, /Spend settled/);
  assert.doesNotMatch(spend, /Proposed by an agent/);
  assert.match(spend, /3 events loaded, 1 of this kind/);
});

test('new events from a live check wait behind an "N new" button and never move the list', () => {
  const view = { events: [event(30), event(29)], nextCursor: '29', team: '', kind: '', loading: false, demo: false };
  const latest = { events: [event(33), event(32), event(31, 'llm.reconciled'), event(30)], nextCursor: '30' };
  const html = activityMarkup({ ...view, latest }, [], helpers, now);
  assert.match(html, /data-action="activity-show-new"[^>]*><i data-icon="chevron-up"><\/i><span class="button-label">3 new events<\/span>/);
  assert.deepEqual([...html.matchAll(/data-event-id="(\d+)"/g)].map(match => match[1]), ['30', '29']);
  assert.match(activityMarkup({ ...view, kind: 'spend', latest }, [], helpers, now), /1 new event</);
  assert.match(activityMarkup({ ...view, latest: { events: [event(90), event(89)], nextCursor: '89' } }, [], helpers, now), /2\+ new events/);
  assert.doesNotMatch(activityMarkup({ ...view, latest: { events: [event(30)], nextCursor: null } }, [], helpers, now), /activity-show-new/);
});

test('an empty feed, a kind with no loaded events and a loading feed each say what is going on', () => {
  assert.match(activityMarkup({ events: [], nextCursor: null, team: '', kind: '' }, [], helpers, now), /No activity yet/);
  const filtered = activityMarkup({ events: [event(1)], nextCursor: '1', team: 'delivery', kind: 'spend' }, ['delivery'], helpers, now);
  assert.match(filtered, /No spend events loaded/);
  assert.match(filtered, /href="#activity\?team=delivery"/);
  const loading = activityMarkup({ events: null, team: '', kind: '' }, [], helpers, now);
  assert.match(loading, /aria-busy="true"[\s\S]*Loading…/);
  assert.match(loading, /<header class="activity-day-header"><span class="skeleton activity-skeleton-day"><\/span><\/header>/);
  assert.equal(loading.match(/class="timeline-item activity-event"/g).length, 8);
});

test('Insights shows tiles and per-Team tables for the window and for right now, never a chart', () => {
  const data = summary('30d');
  const html = overviewMarkup({ window: '30d', data, loading: false, error: null }, helpers, now);
  for (const label of ['Runs finished', 'Failed', 'Stuck', 'Settled spend', 'Ready for review', 'Needs you', 'Running', 'Queued', 'Proposed']) assert.match(html, new RegExp(`<span class="stat-label"><i data-icon="[a-z-]+"></i>${label}</span>`), label);
  assert.equal((html.match(/<span class="stat-go" aria-hidden="true"><i data-icon="chevron"><\/i><\/span>/g) || []).length, 8, 'linked tiles show where they go, drawn through helpers.icon');
  for (const href of ['#runs?state=finished"', '#runs?state=finished&amp;outcome=failed"', '#work?lane=awaiting_review"', '#work?lane=needs_human"', '#work?lane=leased"', '#work?lane=queued"', '#proposed"']) assert(html.includes(`href="${href}`), href);
  assert.match(html, /<strong class="stat-value">32<\/strong><span class="stat-detail">Failed and stuck Runs included/);
  assert.match(html, /50% of finished Runs/);
  assert.match(html, /<th scope="row">delivery<\/th>/);
  assert.match(html, /<th scope="row">research<\/th>/);
  assert.match(html, /<th scope="col" class="num">Stopped retrying<\/th>/);
  assert.match(html, /<p class="section-description">Last 30 days · 2 Teams<\/p>/);
  assert.match(html, /<p class="meta insights-footnote">Settled spend is what Ploeg settled with the model gateway\. A running Run holds a reservation until it settles\.<\/p>/);
  assert.doesNotMatch(html, /role="region"|tabindex="0"/);
  assert.match(html, /<dt>Reserved<\/dt>/);
  assert.doesNotMatch(html, /<dt>Reserved now<\/dt>/);
  assert.match(html, /data-action="ploeg-window" data-id="30d" aria-pressed="true">30 days<\/button>/);
  assert.match(html, /US\$\s0,00 reserved by running Runs/);
  assert.match(html, /class="insights-teams"/);
  assert.doesNotMatch(html, /<svg|<canvas|polyline/);
  const demo = overviewMarkup({ window: '24h', data: { ...summary('24h'), demo: true }, loading: false, error: null }, helpers, now);
  assert.match(demo, /Illustrative Ploeg records/);
  assert.match(demo, /Settled spend<\/span><strong class="stat-value is-text">No model calls<\/strong><span class="stat-detail">Demo<\/span>/);
  assert.doesNotMatch(demo, /US\$\s0,00<\/strong>|insights-footnote/);
  assert.match(demo, /<td class="num"><span class="subtle">No model calls<\/span><\/td>/);
  assert.doesNotMatch(demo, /<svg|<canvas|polyline/);
  const unknown = overviewMarkup({ window: '24h', data: { ...summary('24h'), totals: { ...summary('24h').totals, spend: { settledUsd: null, reservedUsd: null } } }, loading: false, error: null }, helpers, now);
  assert.match(unknown, /<strong class="stat-value is-text">Not reported<\/strong><span class="stat-detail">Reservations not reported<\/span>/);
  const loading = overviewMarkup({ window: '7d', data: null, loading: true, error: null }, helpers, now);
  assert.doesNotMatch(loading, /<svg|<canvas|polyline/);
  assert.match(loading, /Runs and spend[\s\S]*Last 7 days[\s\S]*Work Items/);
  assert.equal(loading.match(/insights-tile-skeleton/g).length, 9);
  const noTeams = overviewMarkup({ window: '7d', data: { ...summary('7d'), teams: [], totals: summaryTotals([]) }, loading: false, error: null }, helpers, now);
  assert.match(noTeams, /No Teams are visible to your account/);
  assert.doesNotMatch(noTeams, /class="stat"|Teams your account|insights-window/);
});

test('the demo summary counts window-bound Runs and keeps spend at zero', () => {
  assert.deepEqual(summary('24h').totals.runs, { pending: 1, running: 1, finished: 23, failed: 13, stuck: 1 });
  assert.deepEqual(summary('7d').totals.runs, { pending: 1, running: 1, finished: 32, failed: 16, stuck: 2 });
  assert.deepEqual(summary('30d').totals.runs, { pending: 1, running: 1, finished: 32, failed: 16, stuck: 2 });
  assert.deepEqual(summary('30d').totals.spend, { settledUsd: 0, reservedUsd: 0 });
  assert.equal(summary('24h').totals.workItems.proposed, 2);
});

test('a setup gap reads as guidance, not an error wall; a real failure offers Try again', () => {
  const unsupported = { code: 'ploeg_unsupported', message: 'This Ploeg version does not provide activity data yet.' };
  for (const html of [overviewMarkup({ window: '24h', data: null, error: unsupported }, helpers, now), activityMarkup({ events: null, error: unsupported, team: '', kind: '' }, [], helpers, now), runsMarkup({ runs: null, error: unsupported, filter: {} }, [], helpers, now)]) {
    assert.match(html, /This Ploeg version has no activity data yet/);
    assert.match(html, /href="#work"/);
    assert.doesNotMatch(html, /role="alert"|data-action="ploeg-reload"/);
  }
  assert.match(problemMarkup({ code: 'ploeg_unconfigured', message: '' }, 'Runs', helpers), /Ploeg is not connected[\s\S]*href="#settings\/environment"/);
  assert.match(problemMarkup({ code: 'ploeg_scope', message: '' }, 'Runs', helpers), /Your account has no Ploeg Teams/);
  const other = overviewMarkup({ window: '24h', data: null, error: { code: 'ploeg_unavailable', message: 'Ploeg could not be reached <now>.' } }, helpers, now);
  assert.match(other, /role="alert"[\s\S]*Could not load Insights[\s\S]*Ploeg could not be reached &#60;now&#62;\.[\s\S]*data-action="ploeg-reload"/);
  const loadedAt = Date.parse('2026-09-10T08:48:00Z');
  const stale = runsMarkup({ runs: [run()], error: { code: 'ploeg_unavailable', message: 'Timed out.' }, loadedAt, filter: {}, demo: false }, [], helpers, now);
  assert.match(stale, /<div class="callout feeds-stale" data-tone="attention" role="status">[\s\S]*<p class="callout-title">Could not refresh\. Showing data from <time class="num" datetime="2026-09-10T08:48:00\.000Z" title="[^"]+">\d\d:48<\/time>\.<\/p>[\s\S]*Timed out\.[\s\S]*data-action="ploeg-reload"/);
  assert.doesNotMatch(stale, /data-tone="danger" role="alert"/);
  assert.match(stale, /data-run-id="61"/);
  assert.match(activityMarkup({ events: [event(1)], error: { message: 'Timed out.' }, team: '', kind: '' }, [], helpers, now), /Could not refresh\. Showing the last data Vloer read\./);
});

test('a Run’s spend is settled, observed or authorized, and never an invented zero', () => {
  assert.equal(runSpend(run({ settledUsd: 0.4567 }), false), `US$${space}0,46`);
  assert.equal(runSpend(run({ settledUsd: null, observedUsd: 0.42, state: 'running' }), false), `US$${space}0,42 observed`);
  assert.equal(runSpend(run({ settledUsd: null, state: 'running', authorizedUsd: 1.5 }), false), `Up to US$${space}1,50 authorized`);
  assert.equal(runSpend(run({ settledUsd: null, state: 'pending', authorizedUsd: null }), false), 'Not reported yet');
  assert.equal(runSpend(run({ settledUsd: null }), false), 'Not reported');
  assert.equal(runSpend(run(), true), 'No model calls');
});

test('Runs list running work first, then pending, then finished, newest first within each, and live pages merge in place', () => {
  const runs = [run({ id: '5' }), run({ id: '9', state: 'pending' }), run({ id: '3', state: 'running' }), run({ id: '7' }), run({ id: '4', state: 'running' })];
  assert.deepEqual(sortRuns(runs).map(entry => entry.id), ['4', '3', '9', '7', '5']);
  const merged = mergeRuns([run({ id: '3', state: 'running' }), run({ id: '2' })], [run({ id: '4', state: 'running' }), run({ id: '3', state: 'finished' })]);
  assert.deepEqual(merged.map(entry => [entry.id, entry.state]), [['3', 'finished'], ['2', 'finished'], ['4', 'running']]);
});

test('a fresh first page replaces the Runs in its range, so a Run that left a filter disappears and older pages stay', () => {
  const running = { runs: [run({ id: '71', state: 'running' }), run({ id: '70', state: 'running' })], nextBefore: null };
  assert.deepEqual(freshRuns(running, { runs: [run({ id: '71', state: 'running' })], nextBefore: null }), { runs: [run({ id: '71', state: 'running' })], nextBefore: null });
  assert.deepEqual(freshRuns(running, { runs: [], nextBefore: null }).runs, []);
  const paged = { runs: [run({ id: '60', state: 'running' }), run({ id: '59' }), run({ id: '58' }), run({ id: '40' }), run({ id: '39' })], nextBefore: '39' };
  const fresh = freshRuns(paged, { runs: [run({ id: '61' }), run({ id: '60' }), run({ id: '58' })], nextBefore: '58' });
  assert.deepEqual(fresh.runs.map(entry => [entry.id, entry.state]), [['61', 'finished'], ['60', 'finished'], ['58', 'finished'], ['40', 'finished'], ['39', 'finished']]);
  assert.equal(fresh.nextBefore, '39');
  assert.deepEqual(freshRuns({ runs: [run({ id: '5' })], nextBefore: null }, { runs: [run({ id: '9' }), run({ id: '8' })], nextBefore: '8' }), { runs: [run({ id: '9' }), run({ id: '8' })], nextBefore: '8' }, 'A page that does not reach the Runs on screen replaces them instead of hiding the Runs between');
  assert.deepEqual(freshRuns({ runs: [run({ id: '8' }), run({ id: '5' })], nextBefore: null }, { runs: [run({ id: '9' }), run({ id: '8' })], nextBefore: '8' }).runs.map(entry => entry.id), ['9', '8', '5']);
  assert.deepEqual(freshRuns(null, { runs: [run()], nextBefore: '61' }), { runs: [run()], nextBefore: '61' });
});

test('a Run row shows state and outcome, verdict, failure, Work Item, Role, timing, a spend meter and the model, in the table and the phone cards', () => {
  const runs = [run({ id: '64', state: 'running', outcome: '', settledUsd: null, observedUsd: 0.42, durationSeconds: null, startedAt: '2026-09-10T08:54:00Z', usage: null, reservedModels: ['claude-opus'] }), run({ id: '63', role: 'reviewer', writes: false, outcome: 'no_change_needed', verdict: 'request_changes' }), run({ id: '62', outcome: 'failed', failureReason: 'lease_lost', settledUsd: null, usage: null }), run()];
  const html = runsMarkup({ runs, nextBefore: '25', filter: {}, demo: false }, ['delivery'], helpers, now);
  assert.match(html, /<tbody><tr class="runs-group"><th scope="rowgroup" colspan="5">Running and waiting <span class="count">1<\/span><\/th><\/tr><tr data-run-id="64"[\s\S]*?<\/tbody><tbody><tr class="runs-group"><th scope="rowgroup" colspan="5">Finished <span class="count">3<\/span>/);
  assert.doesNotMatch(runsMarkup({ runs: [run()], filter: {}, demo: false }, [], helpers, now), /runs-group/);
  assert.deepEqual([...html.matchAll(/<tr data-run-id="(\d+)"/g)].map(match => match[1]), ['64', '63', '62', '61']);
  assert.deepEqual([...html.matchAll(/<li class="runs-card" data-run-id="(\d+)"/g)].map(match => match[1]), ['64', '63', '62', '61']);
  assert.match(html, /<span class="live-dot" aria-hidden="true"><\/span>Running/);
  assert.match(html, /<thead><tr><th scope="col">Status<\/th><th scope="col">Work Item<\/th><th scope="col">Started<\/th><th scope="col">Spend<\/th><th scope="col">Model<\/th><\/tr><\/thead>/);
  assert.match(html, /<td class="runs-started"><time class="num" datetime="2026-09-10T08:54:00\.000Z" title="Started [^"]+">Running for 6 min<\/time><\/td>/);
  assert.doesNotMatch(html, /6 min ago/);
  assert.match(html, /Observed, not settled/);
  assert.match(html, /aria-valuetext="US\$\s0,42 observed so far of US\$\s1,50 authorized"/);
  assert.doesNotMatch(html.match(/<tr data-run-id="64"[\s\S]*?<\/tr>/)[0], /settled of/);
  assert.doesNotMatch(html, /class="meter-end"/);
  assert.match(html, /Agent review: changes requested/);
  assert.match(html, /The worker stopped responding/);
  assert.match(html, /<span class="runs-next">Not the agent’s fault\. It retries automatically\.<\/span>/);
  assert.doesNotMatch(html, /title="[^"]*retries automatically/);
  assert.match(html, /Opened a pull request/);
  assert.match(html, /12\.345 in · 678 out/);
  assert.match(html, /<span class="runs-models"><span class="runs-model-name">claude-sonnet<\/span><span class="runs-model-name">claude-haiku<\/span><\/span>/);
  assert.match(html, /<p class="meta runs-card-line"><span class="runs-model-name">claude-sonnet, claude-haiku<\/span> · <span class="num">12\.345 in · 678 out<\/span><\/p>/);
  assert.match(html, /Took 20 min/);
  assert.match(html, /href="#work\/205"/);
  assert.match(html, /VIK-642 · delivery · Run 61/);
  assert.match(html, /<span class="meta">Implementer · Round 1 · writer<\/span><span class="meta">VIK-642 · delivery · Run 61<\/span>/);
  assert.match(html, /<p class="meta runs-card-line">VIK-642 · delivery · Implementer · Round 1 · writer<\/p>/);
  const edges = runsMarkup({ runs: [run({ id: '70', state: 'pending', startedAt: null, settledUsd: null, authorizedUsd: null, usage: null }), run({ id: '69', settledUsd: 1.92, authorizedUsd: 1.5 }), run({ id: '68', startedAt: null, settledUsd: null, authorizedUsd: 0, usage: null, outcome: '' })], filter: {}, demo: false }, [], helpers, now);
  assert.match(edges, /<td class="runs-started"><span class="subtle">Waiting for a worker<\/span><\/td><td class="runs-spend"><span class="subtle">Not authorized yet<\/span><\/td>/);
  assert.match(edges, /data-level="over"[\s\S]*?<span class="meter-end">US\$\s0,42 over<\/span>/, 'the meter itself names the overspend');
  assert.doesNotMatch(edges, /runs-spend-note" data-tone="danger"/, 'the overspend is not repeated under the meter');
  assert.match(edges, /data-level="over"[^>]*aria-valuetext="US\$\s1,92 settled of US\$\s1,50 authorized, US\$\s0,42 over budget"/);
  assert.match(edges, /<div class="meter sm" data-unknown><div class="meter-label"><span class="meter-text"><span class="meter-value">Not reported<\/span><\/span><\/div>/);
  assert.match(html, /data-unknown[^>]*><div class="meter-label"><span class="meter-text"><span class="meter-value">Not reported/);
  assert.match(html, /data-action="ploeg-runs-older"/);
  assert.match(html, /4 Runs loaded/);
  const demo = runsMarkup({ runs: ploegDemo.runs, nextBefore: null, filter: {}, demo: true }, ['delivery'], helpers, now);
  assert.doesNotMatch(demo, /US\$\s0,00/, 'the demo never writes spend it did not have');
  assert.match(demo, /<td class="runs-spend"><span class="subtle" title="Demo · no model calls"><span aria-hidden="true">—<\/span><span class="sr-only">Demo · no model calls<\/span><\/span><\/td>/);
  assert.doesNotMatch(demo, />None<|>No model calls<|runs-card-line">Demo|runs-card-spend/);
  assert.match(demo, /The worker stopped responding/);
  assert.match(demo, /No outcome reported/);
  assert.match(demo, /Illustrative Ploeg records/);
});

test('an outcome filter only applies to finished Runs, and an empty filtered list offers to clear the filters', () => {
  assert.deepEqual(runFilter({ state: 'running', outcome: 'failed' }), { team: '', state: 'running', outcome: '' });
  assert.deepEqual(runFilter({ state: 'finished', outcome: 'failed' }), { team: '', state: 'finished', outcome: 'failed' });
  assert.deepEqual(runFilter({ outcome: 'stuck' }), { team: '', state: '', outcome: 'stuck' });
  const html = runsMarkup({ runs: [], filter: { state: 'pending' } }, [], helpers, now);
  assert.match(html, /<select id="ploeg-runs-outcome" disabled aria-describedby="ploeg-runs-outcome-hint">/);
  assert.match(html, /<span class="field-hint feeds-hint" id="ploeg-runs-outcome-hint">Only finished Runs have an outcome\.<\/span>/);
  assert.doesNotMatch(runsMarkup({ runs: [], filter: { state: 'finished' } }, [], helpers, now), /ploeg-runs-outcome-hint|<select id="ploeg-runs-outcome" disabled/);
  assert.match(html, /No Runs match these filters[\s\S]*href="#runs"/);
  assert.match(runsMarkup({ runs: [], filter: {} }, [], helpers, now), /No Runs yet/);
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
  assert.doesNotMatch(viewer, /data-action="ploeg-(approve|reject)"/);
  assert.equal(viewer.match(/An operator or administrator approves or rejects it/g).length, 1);
  assert.doesNotMatch(proposedMarkup(view, { role: 'operator' }, helpers, now), /An operator or administrator approves/);
  assert.match(viewer, /<p class="proposals-count">2 proposals<\/p>/);
  assert.doesNotMatch(viewer, /in the order Ploeg lists them|If you approve|proposal-decision/);
  assert.match(viewer, /Discovered work/);
  assert.match(viewer, /Clarification/);
  assert.match(viewer, /data-tone="success">[^<]*<svg[^]*?Ready</);
  assert.match(viewer, /Needs refinement/);
  assert.match(viewer, /Found while working on<\/dt><dd><a href="#work\/105">Round half-cent totals consistently<\/a>/);
  assert.match(viewer, /An agent in Run 53/);
  assert.match(viewer, /<footer class="proposal-footer"><p class="proposal-stake"><i data-icon="coins"><\/i><span>Spends from the delivery Team’s budget<\/span><\/p><\/footer>/);
  assert.equal(viewer.match(/Ploeg does not report Team budgets to Vloer yet, so no amounts are shown\./g).length, 1);
  assert.match(viewer, /example\/order-service/);
  assert.match(viewer, /Not routed/);
  const unknown = proposedMarkup({ ...view, items: [{ ...items[0], sourceWorkItemId: undefined, createdKind: undefined, ready: undefined, sourceTitle: '', externalId: 'VIK-9' }] }, { role: 'operator' }, helpers, now);
  assert.match(unknown, /Source Work Item not reported/);
  assert.match(unknown, /Kind not reported/);
  assert.doesNotMatch(unknown, /Readiness not reported/);
  assert.match(unknown, /An agent of the delivery Team/);
  assert.equal(proposalCreator({ externalId: 'run-46-1', team: 'research' }), 'An agent in Run 46');
});

test('a proposal’s brief is rendered Markdown with its text escaped, and a long brief folds after its first paragraph', () => {
  const entry = { ...ploegDemo.items.find(item => item.state === 'proposed'), descriptionMarkdown: 'Cover **negative** totals in `order_total_test` <script>alert(1)</script>' };
  const html = proposedMarkup({ items: [entry], demo: false }, { role: 'admin' }, helpers, now);
  assert.match(html, /<strong>negative<\/strong>/);
  assert.match(html, /<code>order_total_test<\/code>/);
  assert.doesNotMatch(html, /<script>/);
  const long = proposedMarkup({ items: [{ ...entry, descriptionMarkdown: `${'First paragraph. '.repeat(20)}\n\n${'Second paragraph. '.repeat(20)}` }], demo: false }, { role: 'admin' }, helpers, now);
  assert.match(long, /<details class="disclosure plain">[\s\S]*Read the full brief[\s\S]*Second paragraph/);
  assert.match(proposedMarkup({ items: [], demo: false }, { role: 'admin' }, helpers, now), /No proposed work waits for you/);
});

test('the approve confirmation names the money at stake and the reject form says what really happens, live and in the demo', () => {
  const entry = { id: '107', team: 'research', title: 'Clarify <markets>', target: null, provider: 'ploeg', ready: false };
  const approve = approveDialogMarkup(entry, false, helpers);
  assert.match(approve, /<form method="dialog"/);
  assert.match(approve, /Approve this proposal\?/);
  assert.match(approve, /Clarify &#60;markets&#62;/);
  assert.match(approve, /Money at stake<\/dt><dd>Its Runs spend from the research Team’s budget\. Ploeg does not report that budget to Vloer yet, so Vloer cannot show the amount\./);
  assert.match(approve, /Not routed<\/span><\/span><span class="meta proposal-routing">No routing rule matched a repository/);
  assert.match(approve, /Needs refinement/);
  assert.match(approve, /value="cancel" autofocus>Keep it proposed<\/button><button type="submit" class="button primary" value="confirm">/);
  assert.doesNotMatch(approve, /Demo:/);
  assert.match(approveDialogMarkup(entry, true, helpers), /Demo: approving changes only this demo’s sample data\. Nothing is dispatched and nothing is spent\./);
  const reject = rejectDialogMarkup(entry, false, helpers);
  assert.match(reject, /<form data-form="ploeg-reject" data-id="107"/);
  assert.match(reject, /Ploeg marks it Done without running it and keeps your reason in its history\./);
  assert.doesNotMatch(reject, /withdraw/i);
  assert.match(reject, /<label class="field-label" for="proposal-reject-reason">Reason<\/label><textarea id="proposal-reject-reason" name="reason"[^>]* required/);
  assert.match(reject, /class="button danger">Reject<\/button>/);
  assert.match(reject, /required autofocus aria-describedby="proposal-reject-hint"><\/textarea>/);
  assert.match(reject, /data-action="ploeg-dialog-close">Keep it proposed<\/button>/);
  assert.match(rejectDialogMarkup(entry, true, helpers), /In this demo the proposal is withdrawn from the sample data\. Nothing is dispatched\./);
});

test('a live refresh reports an update only for data read without error while its page is on screen', async () => {
  const view = { error: null };
  const polls = [];
  Object.assign(state, { bootstrap: { user: { role: 'operator' } }, view: 'runs' });
  const refresh = liveRefresh('runs', async () => { polls.push('poll'); }, () => view.error);
  await refresh();
  assert.deepEqual(polls, ['poll']);
  view.error = { message: 'Ploeg did not answer.' };
  await assert.rejects(refresh(), /Ploeg did not answer/);
  view.error = null;
  let finish;
  const load = track('runs', new Promise(done => { finish = done; }));
  const waiting = refresh();
  view.error = { message: 'Timed out.' };
  finish();
  await load;
  await assert.rejects(waiting, /Timed out/);
  assert.deepEqual(polls, ['poll', 'poll'], 'A refresh during a load a person started waits for that load instead of polling');
  view.error = null;
  state.view = 'activity';
  assert.equal(await refresh(), false, 'leaving the page reads nothing without counting as a failure');
  Object.assign(state, { bootstrap: null, view: 'now' });
});
