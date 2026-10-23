import test from 'node:test';
import assert from 'node:assert/strict';
import { collisionCallout, collisionSentence, collisions, collisionsOf, isLiveSession, repositoryKey, runningRunsOf } from '../public/core/collisions.js';
import { linkedWaitReason, linkedWaitingCard, waitedSeconds, waitingLinked } from '../public/core/linked-waiting.js';
import { linkedSessionPage, linkedSessionsMarkup } from '../public/core/linked-sessions.js';
import { nowMarkup, loopMarkup } from '../public/now.js';
import { fleetBoard, fleetModel } from '../public/live/fleet.js';
import { fleetAt, fleetScenarios } from '../public/live/fleet-fixtures.js';
import { workView } from '../public/live/work-view.js';
import { decisionDock } from '../public/live/work-parts.js';
import { workInputOf } from '../public/live/work-fixtures.js';

const now = Date.parse('2026-10-24T10:00:00.000Z');
const ago = minutes => new Date(now - minutes * 60_000).toISOString();
const session = (id, fields = {}) => ({ id, harness: 'claude-code', ownerName: 'ryan', mine: true, title: `Session ${id}`, repository: 'https://forgejo.example.org/webgrip/unfold.git', branch: `feat/${id}`, state: 'working', waitingFor: '', remoteUrl: '', startedAt: ago(60), lastSeenAt: ago(2), workItems: [], commits: [], aiLines: 0, resume: `claude --resume ${id}`, ...fields });

test('a waiting session says in plain words what it waits for, and an unknown ask still reads', () => {
  assert.deepEqual(linkedWaitReason({ harness: 'claude-code', waitingFor: 'permission_prompt' }), { code: 'permission_prompt', chip: 'Approve a tool', sentence: 'Your Claude Code session waits for you to approve a tool.', fix: 'Approve or deny the tool in your terminal.' });
  assert.equal(linkedWaitReason({ harness: 'claude-code', waitingFor: 'idle_prompt' }).sentence, 'Your Claude Code session waits for your next prompt.');
  assert.equal(linkedWaitReason({ harness: 'claude-code', waitingFor: 'elicitation_dialog' }).sentence, 'Your Claude Code session asks you a question.');
  assert.equal(linkedWaitReason({ harness: 'claude-code', waitingFor: 'something_new' }).code, 'waiting');
  assert.equal(waitedSeconds({ lastSeenAt: ago(12) }, now), 720);
  assert.equal(waitedSeconds({ lastSeenAt: 'never' }, now), null);
});

test('Now lists only your own waiting sessions, longest wait first, never stale or someone else’s', () => {
  const sessions = [
    session('aaaaaaaa1', { state: 'waiting', waitingFor: 'idle_prompt', lastSeenAt: ago(3) }),
    session('aaaaaaaa2', { state: 'waiting', waitingFor: 'permission_prompt', lastSeenAt: ago(20) }),
    session('aaaaaaaa3', { state: 'stale', waitingFor: 'permission_prompt', lastSeenAt: ago(90) }),
    session('aaaaaaaa4', { state: 'waiting', waitingFor: 'permission_prompt', mine: false, ownerName: 'sam' }),
    session('aaaaaaaa5', { state: 'working' }),
  ];
  assert.deepEqual(waitingLinked(sessions, now).map(entry => entry.id), ['aaaaaaaa2', 'aaaaaaaa1']);
  assert.equal(waitingLinked(null, now).length, 0);
  assert.equal(linkedWaitingCard(sessions.slice(2), { now }), '');
});

test('the Now card names why each session waits, how long, and offers its page, the resume command and Claude', () => {
  const html = linkedWaitingCard([
    session('bbbbbbbb1', { state: 'waiting', waitingFor: 'permission_prompt', lastSeenAt: ago(12), title: '<b>x</b>', workItems: [{ id: '184', how: 'branch' }] }),
    session('bbbbbbbb2', { state: 'waiting', waitingFor: 'idle_prompt', lastSeenAt: ago(1), displayTitle: 'Fix the login', remoteUrl: 'https://claude.ai/code/session_0123456789' }),
  ], { now });
  assert.match(html, /Your sessions wait/);
  assert.match(html, /Your Claude Code session waits for you to approve a tool\./);
  assert.match(html, /Waiting <\/span><time[^>]*>12 min<\/time>/);
  assert.match(html, /href="#linked-session\/bbbbbbbb1"/);
  assert.match(html, /data-action="linked-session-copy"[^>]*data-text="claude --resume bbbbbbbb1"/);
  assert.match(html, /href="https:\/\/claude\.ai\/code\/session_0123456789"[^>]*>[\s\S]*Open in Claude/);
  assert.match(html, /Fix the login/, 'a display title wins over the raw title');
  assert.match(html, /Work Item 184/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('the desk and the loop put your waiting sessions above Ploeg work, and leave them out while loading', () => {
  const data = { demo: false, waiting: [], running: [], active: [], recent: [], refused: [], errors: {} };
  const yours = '<section id="probe-yours"></section>';
  assert.match(nowMarkup({ data, since: null }, { yours }, now), /<div class="now-main"><section id="probe-yours">/);
  assert.match(loopMarkup({ data, since: null }, { yours }, now), /<div class="now-main loop-lanes"><section id="probe-yours">/);
  assert.doesNotMatch(nowMarkup({ loading: true }, { yours }, now), /probe-yours/);
});

test('repositories compare by owner and name whatever the address form', () => {
  assert.equal(repositoryKey('https://forgejo.example.org/webgrip/Unfold.git'), 'webgrip/unfold');
  assert.equal(repositoryKey('forgejo.example.org:webgrip/unfold.git'), 'webgrip/unfold');
  assert.equal(repositoryKey({ owner: 'webgrip', repo: 'unfold' }), 'webgrip/unfold');
  assert.equal(repositoryKey(''), '');
  assert.equal(repositoryKey(null), '');
  assert.equal(isLiveSession({ state: 'idle' }), true);
  assert.equal(isLiveSession({ state: 'stale' }), false);
  assert.equal(isLiveSession({ state: 'ended' }), false);
});

const detail = { item: { id: '184', target: { owner: 'webgrip', repo: 'unfold', baseBranch: 'development' } }, shifts: [{ id: 's1', branch: 'agent/vik-2051' }], runs: [{ id: 'r1', workItemId: '184', shiftId: 's1', role: 'builder', state: 'running' }, { id: 'r0', workItemId: '184', shiftId: 's1', role: 'builder', state: 'finished' }] };

test('the running Runs of a Work Item carry its repository and their Shift’s branch', () => {
  assert.deepEqual(runningRunsOf(detail), [{ id: 'r1', workItemId: '184', role: 'builder', repository: 'webgrip/unfold', branch: 'agent/vik-2051' }]);
  assert.deepEqual(runningRunsOf(null), []);
});

test('two live sessions, or a session and a running Run, collide on a Work Item or a branch; ended work and Runs alone do not', () => {
  const mine = session('cccccccc1', { workItems: [{ id: '184', how: 'branch' }] });
  const theirs = session('cccccccc2', { mine: false, ownerName: 'sam', workItems: [{ id: '184', how: 'explicit' }] });
  const ended = session('cccccccc3', { state: 'ended', workItems: [{ id: '184', how: 'explicit' }] });
  const found = collisions({ sessions: [mine, theirs, ended, mine], runs: runningRunsOf(detail) });
  assert.equal(found.length, 1);
  assert.equal(found[0].on, 'work-item');
  assert.deepEqual(found[0].members.map(member => `${member.kind}:${member.id}`), ['session:cccccccc1', 'session:cccccccc2', 'run:r1']);
  assert.equal(collisionSentence(found[0]), 'Your Claude Code session, sam’s Claude Code session and Ploeg’s builder Run all work Work Item 184.');
  assert.equal(collisionSentence(found[0], { sessionId: 'cccccccc2' }), 'This session, your Claude Code session and Ploeg’s builder Run all work Work Item 184.');

  const sameBranch = [session('dddddddd1', { branch: 'main' }), session('dddddddd2', { repository: 'forgejo.example.org:webgrip/unfold', branch: 'main', mine: false, ownerName: 'sam' })];
  const branch = collisions({ sessions: sameBranch });
  assert.deepEqual(branch.map(group => [group.on, group.repository, group.branch]), [['branch', 'webgrip/unfold', 'main']]);
  assert.equal(collisionSentence(branch[0], { sessionId: 'dddddddd1' }), 'This session and sam’s Claude Code session are on webgrip/unfold, branch main.');

  const onRunBranch = collisions({ sessions: [session('eeeeeeee1', { branch: 'agent/vik-2051' })], runs: runningRunsOf(detail) });
  assert.deepEqual(onRunBranch.map(group => group.on), ['branch'], 'a session on the branch a Run pushes to collides even when not linked');
  assert.deepEqual(collisionsOf(onRunBranch, { workItemId: '184' }).length, 1);

  assert.deepEqual(collisions({ sessions: [mine], runs: [] }), []);
  assert.deepEqual(collisions({ sessions: [], runs: [...runningRunsOf(detail), { ...runningRunsOf(detail)[0], id: 'r2' }] }), [], 'Runs Ploeg coordinates never warn alone');
  const both = collisions({ sessions: [session('ffffffff1', { branch: 'x', workItems: [{ id: '9', how: 'explicit' }] }), session('ffffffff2', { branch: 'x', workItems: [{ id: '9', how: 'explicit' }] })] });
  assert.deepEqual(both.map(group => group.on), ['work-item'], 'one clash warns once');
  assert.deepEqual(collisionsOf(found, { sessionId: 'nobody' }), []);
});

test('the Agent sessions card and the session page warn about a collision with links to the others', () => {
  const linked = { sessions: [session('gggggggg1', { workItems: [{ id: '184', how: 'branch' }] }), session('gggggggg2', { mine: false, ownerName: 'sam', workItems: [{ id: '184', how: 'explicit' }] })] };
  const card = linkedSessionsMarkup(detail, linked, { now });
  assert.match(card, /Another agent works the same thing/);
  assert.match(card, /href="#work\/184">builder Run</);
  assert.match(card, /href="#linked-session\/gggggggg2">sam’s session</);
  assert.doesNotMatch(linkedSessionsMarkup(detail, { sessions: [{ ...linked.sessions[0], state: 'ended' }] }, { now }), /collision-warning/);
  const clashes = collisionsOf(collisions({ sessions: linked.sessions, runs: runningRunsOf(detail) }), { sessionId: 'gggggggg1' });
  const page = linkedSessionPage(linked.sessions[0], { now, clashes });
  assert.match(page, /This session, sam’s Claude Code session and Ploeg’s builder Run all work Work Item 184\./);
  assert.doesNotMatch(page, /href="#linked-session\/gggggggg1"/, 'the page does not link to itself');
  assert.doesNotMatch(linkedSessionPage(linked.sessions[0], { now }), /collision-warning/);
});

test('the one-page Work Item dock says a waiting session in plain words and warns about a collision', () => {
  const input = workInputOf('running');
  const id = input.detail.item.id;
  const linked = { sessions: [
    session('hhhhhhhh1', { state: 'waiting', waitingFor: 'permission_prompt', workItems: [{ id, how: 'branch' }] }),
    session('hhhhhhhh2', { mine: false, ownerName: 'sam', state: 'stale', waitingFor: 'permission_prompt', workItems: [{ id, how: 'branch' }] }),
  ] };
  const view = workView({ ...input, linked });
  const kinds = view.decisions.map(each => each.kind);
  assert.ok(kinds.includes('linked'));
  assert.ok(kinds.includes('collision'), JSON.stringify(view.decisions));
  assert.equal(view.decisions.find(each => each.kind === 'linked').title, 'Your Claude Code session waits for you to approve a tool.');
  assert.equal(view.decisions.filter(each => each.kind === 'linked').length, 1, 'a stale session no longer waits');
  const dock = decisionDock({ ...view, decisions: view.decisions.filter(each => each.kind === 'collision') });
  assert.match(dock, /work Work Item/);
  assert.match(dock, /href="#linked-session\/hhhhhhhh1"/);
});

test('the fleet board flies your live sessions in a lane of their own, apart from the Teams', () => {
  const { now: data, summary } = fleetScenarios.today();
  const at = fleetAt;
  const when = minutes => new Date(at - minutes * 60_000).toISOString();
  const linked = [
    session('iiiiiiii1', { state: 'waiting', waitingFor: 'permission_prompt', lastSeenAt: when(7) }),
    session('iiiiiiii2', { state: 'working', lastSeenAt: when(1) }),
    session('iiiiiiii3', { state: 'idle', lastSeenAt: when(30) }),
    session('iiiiiiii4', { state: 'ended' }),
    session('iiiiiiii5', { state: 'stale' }),
    session('iiiiiiii6', { state: 'working', mine: false }),
  ];
  const model = fleetModel({ now: data, summary, linked, at });
  assert.deepEqual(['holding', 'air', 'gate'].map(stage => model.yours[stage].map(entry => entry.id)), [['iiiiiiii1'], ['iiiiiiii2'], ['iiiiiiii3']]);
  assert.equal(model.yours.tone, 'attention');
  assert.equal(model.lanes.some(lane => lane.yours), false, 'your lane stays out of the Team lanes');
  assert.deepEqual(model.totals, fleetModel({ now: data, summary, at }).totals, 'your sessions never change the Team totals');
  const html = fleetBoard(model);
  assert.match(html, /Your sessions<\/h3><p class="fb-lane-note">3 sessions on your machine · not a Ploeg Run/);
  assert.match(html, /class="fb-chip is-holding is-yours" href="#linked-session\/iiiiiiii1"/);
  assert.match(html, /class="fb-chip-sub">waiting 7 min · Approve a tool</);
  assert.match(html, /class="fb-chip-sub">feat\/iiiiiiii3 · idle 30 min</);
  assert.match(html, /Your Claude Code session<\/span>/);
  assert.equal(fleetModel({ now: data, summary, linked: [linked[3], linked[4]], at }).yours, null);
  assert.doesNotMatch(fleetBoard(fleetModel({ now: data, summary, at })), /fb-lanes-yours/);
});
