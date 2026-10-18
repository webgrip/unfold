import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handedMarkup, pendingHandoffs, readiness, retryMarkup, reviewRoom, roomOf, sheetMarkup, startCard, startLimit, startQueue, suggestedTeam, taskKey } from '../public/start.js';
import { loopMarkup } from '../public/now.js';

const task = (id, extra = {}) => ({ provider: 'vikunja', id: String(id), revision: `r${id}`, title: `Task ${id}`, description: 'Make the totals round half up.\n\nAcceptance criteria:\n- the order page shows 2 decimals', url: `https://tracker.test/tasks/${id}`, status: 'open', updatedAt: `2026-10-18T0${id % 9}:00:00Z`, labels: [], ...extra });
const source = { id: 'glide', name: 'Glide board', provider: 'vikunja', repositoryId: 'unfold', executionOwner: 'ploeg', handoff: true };
const teams = [{ id: 'bronze', assignee: 'bronze', queueDepth: 2, paused: null, roles: ['writer', 'reviewer'] }, { id: 'pewter', assignee: 'pewter', queueDepth: 0, paused: null, roles: ['writer'] }];
const status = (extra = {}) => ({ available: true, demo: false, handoff: { allowed: true }, teams, assignedTeams: [], workItems: [], fetchedAt: '2026-10-18T12:00:00Z', ...extra });
const week = { teams: [{ team: 'bronze', runs: { finished: 33, failed: 21, stuck: 4 }, spend: { settledUsd: 1.48, reservedUsd: 0 } }] };

test('readiness reads the task alone: a label, a brief and acceptance conditions', () => {
  assert.equal(readiness(task(1)).state, 'ready', 'a brief with acceptance conditions is ready without a label');
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
});

test('the Start queue leaves out closed tasks and tasks Ploeg holds, and puts ready ones first', () => {
  const standings = new Map([[taskKey(task(5)), { id: '90', state: 'leased', team: 'bronze' }]]);
  const lists = [{ sourceId: 'glide', tasks: [task(1), task(2, { description: '' }), task(3, { labels: [{ name: 'ready' }], priority: 1 }), task(4, { status: 'closed' }), task(5), task(6, { labels: [{ name: 'ready' }], priority: 3 })] }];
  const queue = startQueue(lists, standings, [{ sourceId: 'glide', taskId: '1' }]);
  assert.deepEqual(queue.map(entry => entry.task.id), ['6', '3', '2'], 'ready by priority, then the rest; handed and held tasks left out');
});

test('review room counts pull requests waiting on you and is full at the limit', () => {
  const waiting = n => ({ waiting: Array.from({ length: n }, (_, index) => ({ id: String(index), state: 'awaiting_review' })).concat({ id: 'x', state: 'needs_human' }) });
  assert.deepEqual(roomOf(waiting(1)), { used: 1, size: reviewRoom, full: false });
  assert.equal(roomOf(waiting(reviewRoom)).full, true);
  assert.equal(roomOf({ waiting: [], errors: { waiting: 'down' } }), null);
  assert.match(startCard({ queue: [{ task: task(1), sourceId: 'glide', readiness: readiness(task(1)) }], sources: [source], room: roomOf(waiting(reviewRoom)) }), /Review room full: 4 pull requests wait for you[\s\S]*Decide on what waits first/);
});

test('the Start lane says why it is empty, caps its list and points to Tasks', () => {
  assert.match(startCard({ queue: [], sources: [], room: null }), /No task connection hands work to Ploeg/);
  assert.match(startCard({ queue: null, sources: [source], error: 'Vikunja is down', room: null }), /Could not list your tasks[\s\S]*Vikunja is down[\s\S]*start-reload/);
  assert.match(startCard({ queue: [], sources: [source], room: null }), /Nothing left to start/);
  const many = Array.from({ length: startLimit + 3 }, (_, index) => ({ task: task(index + 1), sourceId: 'glide', readiness: readiness(task(index + 1)) }));
  const html = startCard({ queue: many, sources: [source], room: roomOf({ waiting: [] }), singleKeys: true });
  assert.equal(html.match(/data-action="start-open"/g).length, startLimit);
  assert.match(html, /Show 3 more in Tasks/);
  assert.match(html, /data-now-row/, 'Start rows take part in j and k');
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
  assert.match(html, /<strong class="num">1<\/strong> to decide[\s\S]*<strong class="num">1<\/strong> stuck[\s\S]*<strong class="num">0<\/strong> moving[\s\S]*spent in 24 h/);
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
