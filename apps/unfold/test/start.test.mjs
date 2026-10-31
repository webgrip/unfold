import './trackers-support.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handedMarkup, labelledTeam, pendingHandoffs, priorityOf, readiness, retryMarkup, reviewRoom, roomOf, routeOf, sheetMarkup, startCard, startLimit, startQueue, suggestedTeam, taskKey, whyHere } from '../public/start.js';
import { namedDate } from '../public/core/format.js';
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

const connections = {
  supported: true,
  repositories: [{ key: 'unfold', label: 'unfold', repo: 'unfold', readiness: 'ready', reason: '' }, { key: 'ploeg', label: 'ploeg', repo: 'ploeg', readiness: 'ready', reason: '' }, { key: 'homelab', label: 'homelab-cluster', repo: 'homelab-cluster', readiness: 'not_ready', reason: 'webgrip/homelab-cluster has no AGENTS.md on branch "main".' }, { key: 'site', label: 'site', repo: 'site', readiness: 'ready', reason: '' }],
  boards: [{ name: 'Glide', repository: null, default: 'unfold', allow: ['ploeg', 'homelab'], teams: [{ team: 'bronze', assignees: [] }], sources: [{ id: 'glide', name: 'Glide board', target: '', routed: true }] }],
};
const entryOf = (value, sourceId = 'glide', position = 0) => ({ task: value, sourceId, position, readiness: readiness(value), blocker: '' });

test('the Start queue leaves out closed tasks and tasks Ploeg holds, and keeps the tracker order: priority, then due date, then list place', () => {
  const standings = new Map([[taskKey(task(5)), { id: '90', state: 'leased', team: 'bronze' }]]);
  const lists = [{ sourceId: 'glide', tasks: [task(1), task(2, { description: '' }), task(3, { labels: [{ name: 'ready' }], priority: 1 }), task(4, { status: 'closed' }), task(5), task(6, { labels: [{ name: 'ready' }], priority: 3, dueAt: '2026-11-20T00:00:00Z' }), task(7, { title: 'Epic: rebalance the cluster' }), task(8, { labels: [{ name: 'epic' }] }), task(9, { priority: 3, dueAt: '2026-10-30T00:00:00Z' }), task(10), task(11, { priority: 3 })] }];
  const queue = startQueue(lists, standings, [{ sourceId: 'glide', taskId: '1' }], { sources: [source], connections });
  assert.deepEqual(queue.map(entry => entry.task.id), ['9', '6', '11', '3', '2', '10'], 'highest priority first, the earlier due date breaks a tie, then the tracker list; a ready label does not jump the order');
  assert.deepEqual(queue.map(entry => entry.position), [8, 5, 10, 2, 1, 9], 'each entry keeps its place in the list the tracker returned');
  assert.equal(queue.find(entry => entry.task.id === '2').blocker, 'No brief: an agent would start from the title alone');
  assert.equal(queue.filter(entry => entry.blocker).length, 1);
});

test('a ClickUp priority counts down from urgent, a Vikunja one up to do now', () => {
  assert.deepEqual(priorityOf({ provider: 'vikunja', priority: 4 }), { rank: 4, name: 'urgent' });
  assert.deepEqual(priorityOf({ provider: 'vikunja', priority: 5 }), { rank: 5, name: 'do now' });
  assert.deepEqual(priorityOf({ provider: 'clickup', priority: 1 }), { rank: 4, name: 'urgent' });
  assert.deepEqual(priorityOf({ provider: 'clickup', priority: 4 }), { rank: 1, name: 'low' });
  assert.equal(priorityOf({ provider: 'vikunja' }), null);
  assert.deepEqual(priorityOf({ provider: 'demo', priority: 4 }), { rank: 4, name: 'urgent' }, 'the demo fixture reads its tasks as Vikunja does, priority words included');
  const lists = [{ sourceId: 'list', tasks: [{ ...task(1, { provider: 'clickup' }), priority: 4 }, { ...task(2, { provider: 'clickup' }), priority: 1 }] }];
  assert.deepEqual(startQueue(lists, new Map()).map(entry => entry.task.id), ['2', '1'], 'ClickUp urgent comes before ClickUp low');
});

test('a task is agent-ready only when its board routes it to a ready repository with a Team of yours on it', () => {
  const route = (labels, conn = connections, src = source) => routeOf(task(1, { labels: labels.map(name => ({ name })) }), src, conn);
  assert.deepEqual(route([]), { ok: true, repository: 'unfold' }, 'no repo/ label takes the board default');
  assert.deepEqual(route(['repo/ploeg']), { ok: true, repository: 'ploeg' });
  assert.deepEqual(route(['repo/site']), { ok: false, reason: 'repo/site is not allowed on the Glide board' });
  assert.deepEqual(route(['repo/mailboxes']), { ok: false, reason: 'repo/mailboxes names no repository Ploeg knows' });
  assert.deepEqual(route(['repo/ploeg', 'repo/unfold']), { ok: false, reason: 'More than one repo/ label (repo/ploeg, repo/unfold): keep exactly one' });
  assert.deepEqual(route(['repo/homelab']), { ok: false, reason: 'homelab-cluster is not ready for agents: webgrip/homelab-cluster has no AGENTS.md on branch "main"' });
  const noDefault = { ...connections, boards: [{ ...connections.boards[0], default: null }] };
  assert.deepEqual(route([], noDefault), { ok: false, reason: 'The Glide board needs a repo/ label on this task' });
  const noTeam = { ...connections, boards: [{ ...connections.boards[0], teams: [] }] };
  assert.deepEqual(route([], noTeam), { ok: false, reason: 'No Team of yours takes work from the Glide board' });
  assert.deepEqual(route([], { ...connections, boards: [] }), { ok: false, reason: 'Ploeg routes no board for Glide board' });
  const unrouted = { ...connections, boards: [{ ...connections.boards[0], sources: [{ id: 'glide', routed: false }] }] };
  assert.equal(route([], unrouted).ok, false);
  assert.deepEqual(route(['repo/site'], null), { ok: true, repository: 'unfold' }, 'without the connections read, a connection that names a repository routes');
  assert.deepEqual(route([], null, { ...source, repositoryId: '' }), { ok: false, reason: 'This connection names no repository for agents to work in' });
  const refused = new Map([['vikunja:3', 'The Glide board needs a repo/ label on this task.']]);
  const queue = startQueue([{ sourceId: 'glide', tasks: [task(3), task(4, { labels: [{ name: 'repo/site' }] })] }], new Map(), [], { sources: [source], connections, refused });
  assert.deepEqual(queue.map(entry => entry.blocker), ['The Glide board needs a repo/ label on this task.', 'repo/site is not allowed on the Glide board'], 'Ploeg’s own refusal wins over the routing read');
});

test('each Up next row says why it is there, in the tracker’s words', () => {
  assert.equal(whyHere(entryOf(task(1, { priority: 4, dueAt: '2026-10-30T09:00:00Z' }))), `Priority urgent · due ${namedDate('2026-10-30T09:00:00Z')}`);
  assert.equal(whyHere(entryOf(task(1, { priority: 3 }))), 'Priority high');
  assert.equal(whyHere(entryOf(task(1, { dueAt: '2026-10-30T09:00:00Z' }))), `Due ${namedDate('2026-10-30T09:00:00Z')}`);
  assert.equal(whyHere(entryOf(task(1), 'glide', 2)), 'Tracker order #3');
});

test('review room reads as a sentence and is full at the limit', () => {
  const waiting = n => ({ waiting: Array.from({ length: n }, (_, index) => ({ id: String(index), state: 'awaiting_review' })).concat({ id: 'x', state: 'needs_human' }) });
  assert.deepEqual(roomOf(waiting(1)), { used: 1, size: reviewRoom, full: false });
  assert.equal(roomOf(waiting(reviewRoom)).full, true);
  assert.equal(roomOf({ waiting: [], errors: { waiting: 'down' } }), null);
  assert.match(startCard({ queue: [entryOf(task(1))], sources: [source], room: roomOf(waiting(reviewRoom)) }), /Review room full: 4 pull requests wait for you[\s\S]*Decide on what waits first/);
  assert.match(startCard({ queue: [], sources: [source], room: roomOf(waiting(0)) }), />You can take 4 more reviews</);
  const one = startCard({ queue: [], sources: [source], room: roomOf(waiting(1)) });
  assert.match(one, />You can take 3 more reviews · 1 waits now</);
  assert.doesNotMatch(one, /start-room-cell/, 'the meter is words, not empty squares');
});

test('Up next lists the first five tasks agents can take in the tracker’s order, then Show all and Include', () => {
  assert.match(startCard({ queue: [], sources: [], room: null }), /No task connection hands work to Ploeg/);
  assert.match(startCard({ queue: null, sources: [source], error: 'Vikunja is down', room: null }), /Could not list your tasks[\s\S]*Vikunja is down[\s\S]*start-reload/);
  assert.match(startCard({ queue: [], sources: [source], room: null }), /Nothing left to start/);
  const ready = Array.from({ length: startLimit + 3 }, (_, index) => entryOf(task(index + 1, { labels: [{ name: 'ready' }] }), 'glide', index));
  const held = [{ ...entryOf(task(20, { title: 'Create the hello@ mailbox', labels: [{ name: 'repo/mailboxes' }] }), 'glide', 20), blocker: 'repo/mailboxes names no repository Ploeg knows' }];
  const queue = [...ready, ...held];
  const html = startCard({ queue, sources: [source], room: roomOf({ waiting: [] }), singleKeys: true });
  assert.equal(html.match(/data-action="start-open"/g).length, startLimit);
  assert.match(html, /In your tracker’s order · 8 tasks agents can take, all marked ready/);
  assert.doesNotMatch(html, /Marked ready/, 'a badge every row carries says nothing, so the order line says it once');
  assert.match(html, /Tracker order #1[\s\S]*Tracker order #5/);
  assert.doesNotMatch(html, /hello@ mailbox/, 'a task agents cannot take is left out by default');
  assert.match(html, /id="start-all" data-action="start-all" aria-pressed="false">Show all 8</);
  assert.match(html, /id="start-include" data-action="start-include" aria-pressed="false">Include tasks agents cannot take \(1\)</);
  assert.match(html, /data-now-row/, 'Start rows take part in j and k');
  const all = startCard({ queue, sources: [source], room: null, all: true });
  assert.equal(all.match(/data-action="start-open"/g).length, startLimit + 3);
  assert.match(all, /aria-pressed="true">Show the first 5</);
  const included = startCard({ queue, sources: [source], room: null, all: true, include: true });
  assert.equal(included.match(/data-action="start-open"/g).length, startLimit + 4);
  assert.match(included, /data-held[\s\S]*hello@ mailbox[\s\S]*data-blocked>repo\/mailboxes names no repository Ploeg knows/);
  const mixed = startCard({ queue: [entryOf(task(1, { labels: [{ name: 'ready' }] })), entryOf(task(2), 'glide', 1)], sources: [source], room: null });
  assert.match(mixed, /Marked ready/, 'when some rows are not marked ready, the badge tells them apart');
  assert.doesNotMatch(mixed, /Not marked ready/, 'the usual case carries no badge');
  const none = startCard({ queue: held, sources: [source], room: null });
  assert.match(none, /No task agents can take right now[\s\S]*1 open task needs something first/);
  assert.match(none, /Include tasks agents cannot take \(1\)/);
});

test('Up next rows show the board, size and Team label, and Show all adds a board switch that narrows them', () => {
  const other = { ...source, id: 'homelab', name: 'Homelab Roadmap' };
  const queue = [
    entryOf(task(1, { labels: [{ name: 'effort/S' }, { name: 'team/bronze' }, { name: 'spike' }], priority: 3 })),
    entryOf(task(2), 'homelab', 0),
  ];
  const top = startCard({ queue, sources: [source, other], room: null });
  assert.match(top, /Priority high[\s\S]*Spike[\s\S]*#1[\s\S]*Glide board[\s\S]*size S[\s\S]*for bronze/);
  assert.doesNotMatch(top, /data-action="start-board"/, 'the first five carry no board switch');
  const all = startCard({ queue, sources: [source, other], room: null, all: true });
  assert.match(all, /data-action="start-board" data-board="" aria-pressed="true">All 2</);
  assert.match(all, /data-board="homelab" aria-pressed="false">Homelab Roadmap 1</);
  const narrowed = startCard({ queue, sources: [source, other], room: null, all: true, board: 'homelab' });
  assert.equal(narrowed.match(/data-action="start-open"/g).length, 1);
  assert.equal(startCard({ queue, sources: [source, other], room: null, board: 'homelab' }).match(/data-action="start-open"/g).length, 2, 'a chosen board applies only while every task shows');
  assert.match(startCard({ queue, sources: [source, other], room: null, all: true, board: 'gone' }), /aria-pressed="true">All 2</, 'an unknown board falls back to all');
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
  assert.match(html, /<dt>In Vikunja<\/dt><dd>Assigns “pewter” to #1 in Vikunja and leaves a comment there/);
  assert.match(html, /<dt>Next<\/dt><dd>Ploeg queues it for the Team/);
  assert.match(html, /<dt>Take back<\/dt><dd>Free until a worker starts it: Take back on Now or Tasks, which removes “pewter” in Vikunja again\. After a worker starts it, Cancel on its Work Item page stops it\./);
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
  assert.match(html, /2 things need you<span class="loop-day-split">: 1 to decide, 1 to unstick<\/span>/);
  assert.match(html, /<p class="loop-day-facts">nothing running · US\$\s1,50 spent<\/p>/);
  assert.match(html, /class="loop-day" data-tone="attention"/, 'amber: both waiting items are newer than the last visit');
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
  assert.deepEqual({ ...loopCounts(view) }, { decide: 0, stuck: 1, refused: 1, stale: 1, running: 0, needYou: 2 });
  assert.equal(countsFromNow(data, [], Date.parse('2026-10-18T12:00:00Z')).waiting, 2, 'the Now badge counts the same things the day line does');
  const html = loopMarkup(input, {}, Date.parse('2026-10-18T12:00:00Z'));
  assert.match(html, /2 things need you<span class="loop-day-split">: 1 to unstick, 1 could not start<\/span><span class="loop-day-quiet"> · nothing to decide<\/span><\/h2><p class="loop-day-facts">nothing running · US\$\s6,53 spent<\/p>/, 'at most two facts: what runs and what was spent');
  assert.doesNotMatch(html, /Runs finished in 24 h|stopped retrying ·/, 'the Unstick lane, not the day line, says what stopped retrying');
  assert.match(html, /class="loop-day" data-tone="neutral"/, 'nothing got worse since the last visit, so the line stays calm');
  assert.doesNotMatch(html, /loop-decide|Nothing waits for your review or approval/, 'an empty Decide folds into the day line');
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

test('a Run Ploeg left running on a stopped Work Item stays out of In flight and says on its row what it holds', () => {
  const at = Date.parse('2026-10-27T08:00:00Z');
  const stopped = { id: '245', team: 'unfold', state: 'needs_human', title: 'README: tests need Node 24', url: '', createdAt: '2026-10-22T06:00:00Z', updatedAt: '2026-10-22T07:00:00Z', provider: 'manual', externalId: 'x', latestShift: { round: 0, branch: '', closeReason: '', budgetUsd: 1, spentUsd: 0, reservedUsd: 0.25, closedAt: null }, pullRequestUrl: '' };
  const leftover = { id: '395', workItemId: '245', workItemTitle: 'README: tests need Node 24', team: 'unfold', role: 'operator', round: 0, state: 'running', startedAt: '2026-10-22T06:07:48Z', finishedAt: null, outcome: '', authorizedUsd: 1, observedUsd: 0.01, reservedModels: [] };
  const working = { ...leftover, id: '400', workItemId: '300', workItemTitle: 'Moving one', role: 'builder', round: 1, startedAt: '2026-10-27T07:50:00Z' };
  const data = { demo: false, teams: ['unfold'], fetchedAt: '2026-10-27T08:00:00Z', errors: {}, waiting: [stopped], refused: [], running: [leftover], active: [], recent: [] };
  const input = { data, error: null, since: '2026-10-27T07:00:00Z', summary: { data: { demo: false, totals: { runs: { finished: 0 }, spend: { settledUsd: 0, reservedUsd: 0.25 } } }, error: null } };
  const html = loopMarkup(input, {}, at);
  assert.doesNotMatch(html, /id="now-row-r-395"/, 'the leftover Run is not in flight');
  assert.match(html, /In flight<\/h2><p class="loop-clear-text">Nothing runs or waits for a worker/);
  assert.match(html, /nothing running/, 'the day line does not count it as running');
  assert.match(html, /class="loop-day" data-tone="attention"/, 'held money on stopped work turns the line amber');
  assert.match(html, /id="now-row-w-245"[\s\S]*class="now-why now-leftover-run"[\s\S]*Run 395 \(operator, started <time[^>]*>5 d ago<\/time>\) is still marked running: Ploeg did not close it when it stopped this Work Item\. It holds US\$\s0,25 of this Work Item’s budget until the Work Item runs again or is cancelled\./);
  const both = loopMarkup({ ...input, data: { ...data, running: [leftover, working], active: [{ id: '300', team: 'unfold', state: 'leased', title: 'Moving one', latestShift: { round: 1, reservedUsd: 0.5, closedAt: null } }] } }, {}, at);
  assert.match(both, /id="now-row-r-400"/, 'a Run on moving work stays in flight');
  assert.match(both, /US\$\s0,01<\/strong> <span class="meter-of">of US\$\s1,00 · US\$\s0,50 held<\/span>/, 'its row shows what its attempt holds');
  const blind = loopMarkup({ ...input, data: { ...data, errors: { waiting: 'Ploeg could not be read.' } } }, {}, at);
  assert.match(blind, /id="now-row-r-395"/, 'without the waiting group no Run is called left over');
});

test('a finished reviewer that changed nothing leads with its verdict in Recently ended', () => {
  const at = Date.parse('2026-10-27T08:00:00Z');
  const reviewer = { id: '457', workItemId: '50', workItemTitle: 'Merged one', team: 'bronze', role: 'reviewer', round: 4, state: 'finished', startedAt: '2026-10-26T14:45:00Z', finishedAt: '2026-10-26T14:51:00Z', outcome: 'no_change_needed', verdict: 'approve' };
  const data = { demo: false, teams: ['bronze'], fetchedAt: '2026-10-27T08:00:00Z', errors: {}, waiting: [], refused: [], running: [], active: [], recent: [reviewer] };
  const html = loopMarkup({ data, error: null, since: '2026-10-27T07:00:00Z', summary: { data: null, error: null } }, {}, at);
  const row = html.match(/<li><a class="list-row" href="#work\/50"[\s\S]*?<\/li>/)[0];
  assert.match(row, /data-tone="success"/);
  assert.match(row, />Agent approved</);
  assert.doesNotMatch(row, /No change needed/);
});

test('every Unstick row offers the buttons its reason names, and an infrastructure failure leads with Check Status', () => {
  const at = Date.parse('2026-10-27T08:00:00Z');
  const item = (id, extra = {}) => ({ id, team: 'bronze', state: 'needs_human', title: `Item ${id}`, url: `https://tracker.test/tasks/${id}`, createdAt: '2026-10-27T06:00:00Z', updatedAt: '2026-10-27T06:30:00Z', provider: 'vikunja', externalId: id, pullRequestUrl: '', latestShift: { round: 1, branch: `unfold/${id}`, closeReason: 'plan_exhausted', closedAt: '2026-10-27T06:30:00Z' }, ...extra });
  const failed = (id, workItemId, failureReason, stuckReason) => ({ id, workItemId, workItemTitle: `Item ${workItemId}`, team: 'bronze', role: 'builder', round: 1, state: 'finished', startedAt: '2026-10-27T06:00:00Z', finishedAt: `2026-10-27T06:2${id.at(-1)}:00Z`, outcome: 'failed', failureReason, stuckReason, verdict: '' });
  const data = {
    demo: false, teams: ['bronze'], fetchedAt: '2026-10-27T08:00:00Z', errors: {}, running: [], active: [], refused: [],
    waiting: [
      item('60'),
      item('61', { latestShift: { round: 1, branch: 'unfold/61', closeReason: '', closedAt: null, reservedUsd: 0.4 } }),
      item('62', { pullRequestUrl: 'https://forge.test/pulls/62', pullRequestState: 'closed', latestShift: { round: 2, branch: 'unfold/62', closeReason: 'review_approved', closedAt: '2026-10-27T06:30:00Z' } }),
      item('63', { latestShift: { round: 0, branch: 'operator/s-1', closeReason: 'operator_interrupted', closedAt: '2026-10-27T06:30:00Z' } }),
    ],
    recent: [failed('72', '60', 'infra_node', 'pod evicted: the node ran out of memory. Kubelet said more.\nstack'), failed('71', '60', 'lease_lost', ''), failed('73', '61', 'agent_error', 'exit status 1')],
  };
  const input = { data, error: null, since: '2026-10-27T07:00:00Z', summary: { data: null, error: null } };
  const sessions = [{ id: 's-1', createdAt: '2026-10-27T06:00:00Z', execution: { workItemId: '63' } }];
  const html = loopMarkup(input, { canCancel: true, sessions }, at);
  const row = id => html.slice(html.indexOf(`id="now-row-w-${id}"`), html.indexOf('</li>', html.indexOf(`id="now-row-w-${id}"`)));
  const primary = id => row(id).match(/<span class="now-action-primary"[^>]*>([\s\S]*?)<\/span><span class="now-action-links"/)[1];
  const links = id => row(id).match(/<span class="now-action-links"[^>]*>([\s\S]*?)<\/span><\/div>$/)[1];

  assert.match(row('60'), /Last Run: The machine running the Run failed \(builder, Round 1\) · 2 failed Runs lately/);
  assert.match(row('60'), /<span class="now-why now-wrap now-fail-why" data-private>pod evicted: the node ran out of memory\.<\/span>/, 'one sentence of why it failed, wrapped');
  assert.match(primary('60'), /href="#status"[\s\S]*Check Status/, 'infrastructure failures lead with Status');
  assert.match(links('60'), /class="button ghost sm"[^>]*data-action="loop-retry" data-id="60"/, 'Try again stays, as a secondary button');
  assert.match(row('60'), /Trying again is likely to fail the same way until the cluster is healthy/);

  assert.match(row('61'), /now-fail-why" data-private>exit status 1</);
  assert.match(primary('61'), /data-action="loop-retry" data-id="61"[\s\S]*Try again/, 'an agent failure leads with Try again');
  assert.doesNotMatch(row('61'), /now-infra-note|href="#status"/);
  assert.match(links('61'), /data-action="now-cancel" data-id="61"[\s\S]*?>Cancel</, 'an open attempt can be cancelled');
  assert.doesNotMatch(row('60'), /now-cancel/, 'no Cancel where Ploeg has nothing left to withdraw');

  assert.match(primary('62'), /Try again/);
  assert.match(links('62'), /href="https:\/\/forge\.test\/pulls\/62"[\s\S]*?Open pull request/);
  assert.match(links('62'), /href="https:\/\/tracker\.test\/tasks\/62"[^>]*aria-label="Close “Item 62” in Vikunja: Ploeg withdraws a stopped Work Item once its task is closed \(opens in a new tab\)">[\s\S]*?Close in Vikunja/, 'a closed pull request can close the Work Item through its task');
  assert.doesNotMatch(row('62'), /now-cancel|>Open in Vikunja</);
  const open = loopMarkup({ ...input, data: { ...data, waiting: [{ ...data.waiting[2], closeReason: 'review_approved', latestShift: { ...data.waiting[2].latestShift, closedAt: null } }] } }, { canCancel: true }, at);
  assert.match(open, /data-action="now-cancel" data-id="62"[\s\S]*?Close Work Item/, 'with its attempt still open, Close Work Item cancels it in Ploeg');

  assert.match(primary('63'), /href="#session\/s-1"[\s\S]*Open session/, 'a session-driven Work Item opens its session');
  assert.doesNotMatch(row('63'), /loop-retry|now-cancel/, 'its session, not Now, retries or cancels it');
  assert.match(loopMarkup(input, { canCancel: true, sessions: [] }, at), /id="now-session-63" aria-label="Open Sessions[^"]*">[\s\S]*?Open Sessions</, 'without the session it opens Sessions');

  const viewer = loopMarkup(input, { retryHere: false }, at);
  assert.doesNotMatch(viewer, /data-action="now-cancel"|data-action="loop-retry"/, 'a viewer cannot cancel or retry');
  assert.match(viewer, /id="now-status-60"/, 'a viewer still gets Check Status');
});

test('the day line turns amber only when what waits got worse since the last visit', () => {
  const at = Date.parse('2026-10-27T08:00:00Z');
  const stuck = { id: '7', team: 'bronze', state: 'needs_human', title: 'Stuck one', url: '', createdAt: '2026-10-27T05:00:00Z', updatedAt: '2026-10-27T05:30:00Z', provider: 'vikunja', externalId: '7', latestShift: null, pullRequestUrl: '' };
  const data = { demo: false, teams: ['bronze'], fetchedAt: '2026-10-27T08:00:00Z', errors: {}, waiting: [stuck], refused: [], running: [], active: [], recent: [] };
  const tone = (extra, since = '2026-10-27T07:00:00Z') => loopMarkup({ data: { ...data, ...extra }, error: null, since, summary: { data: null, error: null } }, {}, at).match(/class="loop-day" data-tone="(\w+)"/)[1];
  assert.equal(tone({}), 'neutral', 'an old stuck item alone keeps it calm');
  assert.equal(tone({}, null), 'neutral', 'a first visit has nothing to compare with');
  assert.equal(tone({ waiting: [{ ...stuck, updatedAt: '2026-10-27T07:30:00Z' }] }), 'attention', 'a needs-you item newer than the last visit');
  assert.equal(tone({ refused: [{ provider: 'vikunja', externalId: '9', team: 'bronze', title: 'Refused', code: 'label_missing', refusedAt: '2026-10-27T07:45:00Z', url: '', link: 'none' }] }), 'attention', 'a refusal newer than the last visit');
  assert.equal(tone({ waiting: [] }), 'success');
  const demo = loopMarkup({ data: { ...data, demo: true }, error: null, since: null, summary: { data: null, error: null } }, {}, at);
  assert.match(demo, /<p class="loop-day-facts">nothing running · no spend in the demo<\/p>/);
});
