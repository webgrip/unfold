import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handedMarkup, labelledTeam, pendingHandoffs, readiness, retryMarkup, reviewRoom, roomOf, sheetMarkup, startCard, startLimit, startQueue, suggestedTeam, taskKey } from '../public/start.js';
import { loopCounts, loopMarkup } from '../public/now.js';
import { countsFromNow } from '../public/core/counts.js';

const task = (id, extra = {}) => ({ provider: 'vikunja', id: String(id), revision: `r${id}`, title: `Task ${id}`, description: 'Make the totals round half up.\n\nAcceptance criteria:\n- the order page shows 2 decimals', url: `https://tracker.test/tasks/${id}`, status: 'open', updatedAt: `2026-10-18T0${id % 9}:00:00Z`, labels: [], ...extra });
const source = { id: 'glide', name: 'Glide board', provider: 'vikunja', repositoryId: 'unfold', executionOwner: 'ploeg', handoff: true };
const teams = [{ id: 'bronze', assignee: 'bronze', queueDepth: 2, paused: null, roles: ['writer', 'reviewer'] }, { id: 'pewter', assignee: 'pewter', queueDepth: 0, paused: null, roles: ['writer'] }];
const status = (extra = {}) => ({ available: true, demo: false, handoff: { allowed: true }, teams, assignedTeams: [], workItems: [], fetchedAt: '2026-10-18T12:00:00Z', ...extra });
const week = { teams: [{ team: 'bronze', runs: { finished: 33, failed: 21, stuck: 4 }, spend: { settledUsd: 1.48, reservedUsd: 0 } }] };

test('readiness reads the task alone: a label, a brief and acceptance conditions', () => {
  assert.equal(readiness(task(1)).state, 'check', 'a good brief is not ready until a person labels it so');
  assert.equal(readiness(task(1)).facts[0].text, 'Not labelled ready in the tracker');
  assert.equal(readiness(task(1, { labels: [{ name: 'Ready' }] })).state, 'ready');
  assert.deepEqual(readiness(task(1, { labels: [{ name: 'Ready' }] })).facts.map(fact => fact.text), ['Labelled ready', 'Brief of 15 words', 'Names acceptance conditions']);
  const bare = readiness(task(2, { description: '  ' }));
  assert.equal(bare.state, 'blocked');
  assert.deepEqual(bare.facts.map(fact => fact.ok), [false]);
  const refined = readiness(task(3, { labels: [{ name: 'ready' }, { name: 'needs-refinement' }] }));
  assert.equal(refined.state, 'blocked', 'a not-ready label wins over a ready one');
  assert.equal(refined.label, 'Not ready');
  const vague = readiness(task(4, { description: 'Fix it', labels: [{ name: 'do-next' }] }));
  assert.equal(vague.state, 'check');
  assert.deepEqual(vague.facts.map(fact => fact.ok), [true, true, null]);
  assert.equal(vague.state, 'check');
});

test('the Start queue leaves out closed tasks and tasks Ploeg holds, and puts ready ones first', () => {
  const standings = new Map([[taskKey(task(5)), { id: '90', state: 'leased', team: 'bronze' }]]);
  const lists = [{ sourceId: 'glide', tasks: [task(1), task(2, { description: '' }), task(3, { labels: [{ name: 'ready' }], priority: 1 }), task(4, { status: 'closed' }), task(5), task(6, { labels: [{ name: 'ready' }], priority: 3 }), task(7, { title: 'Epic: rebalance the cluster' }), task(8, { labels: [{ name: 'epic' }] }), task(9, { priority: 4 })] }];
  const queue = startQueue(lists, standings, [{ sourceId: 'glide', taskId: '1' }]);
  assert.deepEqual(queue.map(entry => entry.task.id), ['6', '3', '9', '2'], 'labelled ready by priority, then the rest by priority, then not ready; epics, handed and held tasks left out');
});

test('review room counts pull requests waiting on you and is full at the limit', () => {
  const waiting = n => ({ waiting: Array.from({ length: n }, (_, index) => ({ id: String(index), state: 'awaiting_review' })).concat({ id: 'x', state: 'needs_human' }) });
  assert.deepEqual(roomOf(waiting(1)), { used: 1, size: reviewRoom, full: false });
  assert.equal(roomOf(waiting(reviewRoom)).full, true);
  assert.equal(roomOf({ waiting: [], errors: { waiting: 'down' } }), null);
  assert.match(startCard({ queue: [{ task: task(1), sourceId: 'glide', readiness: readiness(task(1)) }], sources: [source], room: roomOf(waiting(reviewRoom)) }), /Review room full: 4 pull requests wait for you[\s\S]*Decide on what waits first/);
  assert.match(startCard({ queue: [], sources: [source], room: roomOf(waiting(1)) }), /Room for 3 more reviews/);
});

test('the Start lane says why it is empty, caps its list and points to Tasks', () => {
  assert.match(startCard({ queue: [], sources: [], room: null }), /No task connection hands work to Ploeg/);
  assert.match(startCard({ queue: null, sources: [source], error: 'Vikunja is down', room: null }), /Could not list your tasks[\s\S]*Vikunja is down[\s\S]*start-reload/);
  assert.match(startCard({ queue: [], sources: [source], room: null }), /Nothing left to start/);
  const many = Array.from({ length: startLimit + 3 }, (_, index) => ({ task: task(index + 1), sourceId: 'glide', readiness: readiness(task(index + 1)) }));
  const html = startCard({ queue: many, sources: [source], room: roomOf({ waiting: [] }), singleKeys: true });
  assert.equal(html.match(/data-action="start-open"/g).length, startLimit);
  assert.match(html, /3 more open tasks in Tasks/);
  assert.match(html, /Up next/);
  assert.doesNotMatch(html, /Not marked ready/, 'the usual case carries no badge');
  assert.match(html, /data-now-row/, 'Start rows take part in j and k');
});

test('Up next rows show the board, size, Team label and priority, and a board switch narrows them', () => {
  const other = { ...source, id: 'homelab', name: 'Homelab Roadmap' };
  const queue = [
    { task: task(1, { labels: [{ name: 'effort/S' }, { name: 'team/bronze' }, { name: 'spike' }], priority: 3 }), sourceId: 'glide' },
    { task: task(2), sourceId: 'homelab' },
  ].map(entry => ({ ...entry, readiness: readiness(entry.task) }));
  const all = startCard({ queue, sources: [source, other], room: null });
  assert.match(all, /Spike[\s\S]*#1[\s\S]*Glide board[\s\S]*size S[\s\S]*for bronze[\s\S]*high priority/);
  assert.match(all, /data-action="start-board" data-board="" aria-pressed="true">All 2</);
  assert.match(all, /data-board="homelab" aria-pressed="false">Homelab Roadmap 1</);
  const narrowed = startCard({ queue, sources: [source, other], room: null, board: 'homelab' });
  assert.equal(narrowed.match(/data-action="start-open"/g).length, 1);
  assert.match(startCard({ queue, sources: [source, other], room: null, board: 'gone' }), /aria-pressed="true">All 2</, 'an unknown board falls back to all');
  assert.equal(labelledTeam(task(1, { labels: [{ name: 'team/pewter' }] })), 'pewter');
});

test('a hand-off stays under Just handed over until Ploeg runs it, with Take back', () => {
  const handed = [{ key: 'vikunja:1', sourceId: 'glide', taskId: '1', title: 'Task 1', team: 'bronze', at: 0 }, { key: 'vikunja:2', sourceId: 'glide', taskId: '2', title: 'Task 2', team: 'bronze', at: 0 }, { key: 'vikunja:3', sourceId: 'glide', taskId: '3', title: 'Task 3', team: 'pewter', at: 0 }];
  const standings = new Map([['vikunja:2', { id: '41', state: 'queued', team: 'bronze' }], ['vikunja:3', { id: '42', state: 'leased', team: 'pewter' }]]);
  const pending = pendingHandoffs(handed, standings);
  assert.deepEqual(pending.map(entry => entry.taskId), ['1', '2']);
  const html = handedMarkup(pending, standings);
  assert.match(html, /Handed to bronze · waiting for Ploeg to queue it/);
  assert.match(html, /Queued for bronze/);
  assert.match(html, /href="#work\/41"/);
  assert.equal(html.match(/data-action="start-take-back"/g).length, 2);
  assert.equal(handedMarkup([], standings), '');
});

test('the sheet shows readiness, each Team with its last 7 days, the terms and one button', () => {
  const html = sheetMarkup({ task: task(1), source, repository: 'webgrip/unfold', status: status(), summary: week, team: 'pewter', remembered: 'bronze', singleKeys: true });
  assert.match(html, /data-form="start-handoff"/);
  assert.match(html, /Names acceptance conditions/);
  assert.match(html, /id="sheet-team-pewter"[^>]*checked/);
  assert.match(html, /bronze<\/span><span class="sheet-team-why">last used here/);
  assert.match(html, /writer → reviewer/);
  assert.match(html, /58 Runs in 7 d: 21 failed, 4 stuck/);
  assert.match(html, /A branch of webgrip\/unfold, then a pull request for your review/);
  assert.match(html, /Assigns “pewter” in Vikunja/);
  assert.match(html, /Hand to pewter/);
  assert.doesNotMatch(html, /id="sheet-submit"[^>]*disabled/);
});

test('the sheet refuses honestly: loading, Ploeg down, already handed, demo fixture', () => {
  assert.match(sheetMarkup({ task: task(1), source, status: null }), /skeleton[\s\S]*id="sheet-submit"[^>]*disabled/);
  assert.match(sheetMarkup({ task: task(1), source, status: null, statusError: 'Ploeg did not answer.' }), /Could not ask Ploeg[\s\S]*Nothing was handed over/);
  assert.match(sheetMarkup({ task: task(1), source, status: status({ assignedTeams: ['bronze'] }) }), /Already handed to bronze[\s\S]*id="sheet-submit"[^>]*disabled/);
  const demo = sheetMarkup({ task: task(1), source: { ...source, provider: 'demo' }, status: { available: false, handoff: { allowed: false, reason: 'Demo fixture tasks are not linked to Ploeg.' }, teams: [], assignedTeams: [] } });
  assert.match(demo, /Fixture task · Ploeg cannot receive it/);
  assert.match(demo, /Demo fixture tasks are not linked to Ploeg/);
  assert.match(demo, /id="sheet-submit"[^>]*disabled/);
  assert.match(sheetMarkup({ task: task(1), source, status: status(), room: { used: 4, size: 4, full: true } }), /4 pull requests already wait for you/);
});

test('the suggested Team is the one last used for the board when it is still on offer', () => {
  assert.equal(suggestedTeam(teams, 'pewter'), 'pewter');
  assert.equal(suggestedTeam(teams, 'silver'), 'bronze');
  assert.equal(suggestedTeam([], 'bronze'), '');
  assert.equal(suggestedTeam(teams, 'bronze', 'pewter'), 'pewter', 'the task\'s own team label wins');
  assert.equal(suggestedTeam(teams, 'bronze', 'gold'), 'bronze', 'a label for a Team not on offer is ignored');
});

test('the loop puts Decide, Unstick and Start in order and hides a queued row the hand-off list shows', () => {
  const data = {
    demo: false, teams: ['bronze'], fetchedAt: '2026-10-18T12:00:00Z', errors: {},
    waiting: [
      { id: '7', team: 'bronze', state: 'needs_human', title: 'Stuck one', url: '', createdAt: '2026-10-18T10:00:00Z', updatedAt: '2026-10-18T11:00:00Z', provider: 'vikunja', externalId: '7', latestShift: null, pullRequestUrl: '' },
      { id: '8', team: 'bronze', state: 'awaiting_review', title: 'Review me', url: '', createdAt: '2026-10-18T10:00:00Z', updatedAt: '2026-10-18T11:30:00Z', provider: 'vikunja', externalId: '8', latestShift: null, pullRequestUrl: 'https://forge.test/pulls/3' },
    ],
    refused: [], running: [], recent: [],
    active: [{ id: '9', team: 'bronze', state: 'queued', title: 'Just handed', provider: 'vikunja', externalId: '1', createdAt: '2026-10-18T11:59:00Z', updatedAt: '2026-10-18T11:59:00Z' }],
  };
  const input = { data, error: null, since: '2026-10-18T09:00:00Z', summary: { data: { demo: false, totals: { spend: { settledUsd: 1.5, reservedUsd: 0 } } }, error: null } };
  const html = loopMarkup(input, { singleKeys: true, start: '<section id="start-lane">Start</section>', handed: '<ul id="handed"></ul>', hideQueued: new Set(['vikunja:1']) }, Date.parse('2026-10-18T12:00:00Z'));
  const order = ['loop-decide-title', 'loop-unstick-title', 'start-lane'].map(id => html.indexOf(`id="${id}"`));
  assert.ok(order.every(at => at > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /2 things need you<span class="loop-day-split">: 1 to decide, 1 stuck<\/span>/);
  assert.match(html, /nothing moving · US\$\s1,50 spent/);
  assert.match(html, /data-tone="attention"/);
  assert.doesNotMatch(html, /Just handed<\/span>/, 'the queued row of a hand-off shown above is not listed twice');
  assert.match(html, /Just handed over/);
  assert.doesNotMatch(html, /assign the task to the Team again/, 'Unstick does not send you back to the tracker');
  assert.match(html, /data-action="loop-retry" data-id="7"/);
  assert.match(html, /Then press Try again/);
  const viewer = loopMarkup(input, { retryHere: false }, Date.parse('2026-10-18T12:00:00Z'));
  assert.doesNotMatch(viewer, /data-action="loop-retry"/);
  assert.match(loopMarkup({ data: null, error: null }), /now-skeleton/);
});

test('Try again says what it costs and takes a note for the next attempt', () => {
  const entry = { id: '7', team: 'bronze', state: 'needs_human', title: 'Stuck one', latestShift: { budgetUsd: 9.2 } };
  const html = retryMarkup(entry);
  assert.match(html, /data-form="loop-retry"/);
  assert.match(html, /starts it over from Round 1 with Team bronze/);
  assert.match(html, /up to US\$\s9,20 like the last one/);
  assert.match(html, /name="note"/);
  assert.match(retryMarkup(entry, { demo: true }), /nothing restarts and nothing is spent/);
  assert.match(retryMarkup(entry, { error: 'Conflict' }), /Ploeg did not restart it[\s\S]*Conflict/);
});

test('the loop takes every count from one place, folds empty lanes and groups ended Runs per Work Item', () => {
  const run = (id, workItemId, extra = {}) => ({ id, workItemId, workItemTitle: `Item ${workItemId}`, team: 'bronze', role: 'builder', round: 1, state: 'finished', startedAt: '2026-10-18T09:00:00Z', finishedAt: `2026-10-18T1${id}:00:00Z`, outcome: 'failed', failureReason: 'agent_error', verdict: '', ...extra });
  const data = {
    demo: false, teams: ['bronze'], fetchedAt: '2026-10-18T12:00:00Z', errors: {}, running: [], active: [],
    waiting: [{ id: '7', team: 'bronze', state: 'needs_human', title: 'Stuck one', url: '', createdAt: '2026-10-18T08:00:00Z', updatedAt: '2026-10-18T08:30:00Z', provider: 'vikunja', externalId: '7', latestShift: null, pullRequestUrl: '' }],
    refused: [{ provider: 'vikunja', externalId: '25', team: 'bronze', title: 'Refused one', code: 'label_unregistered', reason: 'label "repo/ploeg" names no registered target', allowedLabels: ['repo/unfold'], refusedAt: '2026-10-18T07:00:00Z', url: 'https://tracker.test/tasks/25', link: 'task' }],
    recent: [run('3', '7'), run('2', '7'), run('1', '9'), run('0', '9')],
  };
  const input = { data, error: null, since: '2026-10-18T09:00:00Z', summary: { data: { demo: false, totals: { workItems: { stale: 1 }, runs: { finished: 4, failed: 4 }, spend: { settledUsd: 6.53, reservedUsd: 0 } } }, error: null } };
  const view = { ...input, data: { ...data } };
  assert.deepEqual({ ...loopCounts(view) }, { decide: 0, stuck: 1, refused: 1, stale: 1, moving: 0, needYou: 2 });
  assert.equal(countsFromNow(data).waiting, 2, 'the Now badge counts the same things the day line does');
  const html = loopMarkup(input, {}, Date.parse('2026-10-18T12:00:00Z'));
  assert.match(html, /2 things need you<span class="loop-day-split">: 1 stuck, 1 could not start[\s\S]*1 Work Item stopped retrying · nothing moving/);
  assert.match(html, /4 Runs finished in 24 h, 4 failed/);
  assert.match(html, /class="loop-lane loop-clear loop-decide"[\s\S]*Nothing waits for your review or approval/, 'an empty Decide folds to one line');
  assert.match(html, /id="loop-unstick-title">Unstick<span class="count"[^>]*>2</);
  assert.doesNotMatch(html, /id="now-group-needs"/, 'Unstick has no second Needs you header');
  assert.match(html, /Last Run: [^<]+ \(builder, Round 1\) · 2 failed Runs lately/);
  assert.match(html, /Recently ended/);
  assert.equal((html.match(/id="now-row-f-/g) || []).length, 1, 'one row per Work Item, none for the stuck item on the left');
  assert.match(html, /\+1 earlier Run/);
  assert.doesNotMatch(html, /Your questions/);
  assert.doesNotMatch(html, /now-digest/, 'no digest when nothing changed since the last visit');
  assert.match(html, /In flight<\/h2><p class="loop-clear-text">Nothing runs or waits for a worker/);
  assert.doesNotMatch(html, /class="button primary sm"[^>]*now-refused-open/, 'the tracker link is not dressed as the main action');
  const clear = loopMarkup({ ...input, data: { ...data, waiting: [], refused: [] }, summary: { data: { demo: false, totals: { runs: { finished: 0 }, spend: { settledUsd: 0 } } }, error: null } }, {}, Date.parse('2026-10-18T12:00:00Z'));
  assert.match(clear, /data-tone="success"[\s\S]*Nothing needs you/);
});
