import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSession, attachmentWords, commitSpine, handoverMarks, roundWindows, sessionWindow, shiftWindows, workTracks } from '../public/core/session-tracks.js';
import { clashesWithRun, collisions, collisionsOf, runningRunsOf, startedBy } from '../public/core/collisions.js';
import { foldedWindow, workTracksMarkup } from '../public/core/work-tracks.js';
import { flightSpot, momentAt, shareAt } from '../public/core/time-cursor.js';
import { streamLanes } from '../public/core/value-stream.js';
import { workView } from '../public/live/work-view.js';
import { workPage } from '../public/live/pages.js';
import { workInputOf } from '../public/live/work-fixtures.js';

const t0 = Date.parse('2026-10-24T08:00:00.000Z');
const at = minutes => new Date(t0 + minutes * 60_000).toISOString();
const now = t0 + 300 * 60_000;

const detail = {
  item: { id: '184', target: { owner: 'webgrip', repo: 'unfold' } },
  shifts: [
    { id: 's1', branch: 'agent/vik-2051', round: 2, openedAt: at(0), closedAt: at(60) },
    { id: 's2', branch: 'agent/vik-2051', round: 1, openedAt: at(200), closedAt: null },
  ],
  runs: [
    { id: 'r1', workItemId: '184', shiftId: 's1', role: 'builder', round: 1, state: 'finished', startedAt: at(5), finishedAt: at(25), writes: true },
    { id: 'r2', workItemId: '184', shiftId: 's1', role: 'reviewer', round: 2, state: 'finished', startedAt: at(30), finishedAt: at(55), writes: false },
    { id: 'r3', workItemId: '184', shiftId: 's2', role: 'builder', round: 1, state: 'running', startedAt: at(205), finishedAt: null, writes: true },
  ],
};

const session = (id, fields = {}) => ({ id, harness: 'claude-code', ownerName: 'ryan', mine: true, displayTitle: `Session ${id}`, repository: 'https://forgejo.example.org/webgrip/unfold.git', branch: `feat/${id}`, state: 'ended', startedAt: at(0), lastSeenAt: at(0), endedAt: null, workItems: [{ id: '184', how: 'explicit' }], commits: [], handovers: [], ...fields });

test('attempts and Rounds become time windows; an open attempt and a running Round reach now', () => {
  assert.deepEqual(shiftWindows(detail, now).map(shift => [shift.id, shift.attempt, shift.open]), [['s1', 1, false], ['s2', 2, true]]);
  assert.equal(shiftWindows(detail, now)[1].to, now);
  assert.deepEqual(roundWindows(detail, now).map(round => [round.shiftId, round.round, round.runIds]), [['s1', 1, ['r1']], ['s1', 2, ['r2']], ['s2', 1, ['r3']]]);
  assert.equal(roundWindows(detail, now).at(-1).to, now);
  assert.deepEqual(sessionWindow(session('a', { state: 'idle', startedAt: at(10) }), now), { from: t0 + 600_000, to: now, open: true });
  assert.equal(sessionWindow(session('a', { state: 'stale', startedAt: at(10), lastSeenAt: at(20) }), now).to, t0 + 20 * 60_000);
  assert.equal(sessionWindow({ id: 'x' }, now), null);
});

test('a session attaches to the attempt and Round it overlapped most, or sits before, between or after them', () => {
  const during = attachSession(session('a', { startedAt: at(32), endedAt: at(50) }), detail, now);
  assert.deepEqual([during.place, during.shiftId, during.attempt, during.round], ['during', 's1', 1, 2]);
  assert.deepEqual(during.overlaps.map(run => run.runId), ['r2']);
  assert.equal(attachmentWords(during), 'During attempt 1, Round 2');
  const gap = attachSession(session('b', { startedAt: at(26), endedAt: at(29) }), detail, now);
  assert.equal(attachmentWords(gap), 'During attempt 1, between Rounds');
  const most = attachSession(session('c', { startedAt: at(50), endedAt: at(250) }), detail, now);
  assert.deepEqual([most.shiftId, most.round], ['s2', 1], 'the attempt it overlapped longest wins');
  assert.equal(attachmentWords(attachSession(session('d', { startedAt: at(100), endedAt: at(150) }), detail, now)), 'Between attempts 1 and 2');
  assert.equal(attachSession(session('e', { startedAt: at(-90), endedAt: at(-30) }), detail, now).place, 'before');
  const after = attachSession(session('f', { startedAt: at(100), endedAt: at(150) }), { ...detail, shifts: [detail.shifts[0]] }, now);
  assert.equal(attachmentWords(after), 'After Ploeg’s last attempt (1)');
  assert.equal(attachSession(session('g', { startedAt: at(1) }), { item: detail.item, shifts: [], runs: [] }, now).place, 'alone');
});

test('hand-overs: let Ploeg finish, /unfold:start, continuing on Ploeg’s branch and starting while a Run worked', () => {
  const handed = session('handed', { startedAt: at(80), endedAt: at(190), handovers: [{ kind: 'handoff', workItemId: '184', at: at(190) }, { kind: 'handoff', workItemId: '999', at: at(190) }] });
  const took = session('took', { branch: 'agent/vik-2051', startedAt: at(70), endedAt: at(150) });
  const overlap = session('overlap', { mine: false, ownerName: 'sam', startedAt: at(210), state: 'working' });
  const marks = handoverMarks(detail, [handed, took, overlap], now);
  assert.deepEqual(marks.map(mark => [mark.kind, mark.sessionId]), [['take-over', 'took'], ['handoff', 'handed'], ['overlap', 'overlap']]);
  assert.equal(marks[0].label, 'You continued on Ploeg’s branch agent/vik-2051 in Claude Code');
  assert.equal(marks[1].shiftId, 's2');
  assert.equal(marks[1].label, 'You let Ploeg finish this: attempt 2 read the hand-off note');
  assert.equal(marks[2].label, 'sam started a Claude Code session while the builder Run worked');
  const claimer = session('claimer', { startedAt: at(203), state: 'working', handovers: [{ kind: 'claim', workItemId: '184', runId: 'r3', at: at(204) }] });
  const claim = handoverMarks(detail, [claimer], now);
  assert.deepEqual(claim.map(mark => mark.kind), ['claim'], 'a session that claimed the Run does not also read as overlapping it');
  assert.equal(claim[0].label, 'You started the builder Run with /unfold:start');
});

test('the commit spine colours each commit by who wrote its lines and each push by who was working', () => {
  const sessions = [session('a', { startedAt: at(70), endedAt: at(150), branch: 'agent/vik-2051', commits: [
    { sha: 'a'.repeat(40), subject: 'feat: login', at: at(80), aiLines: 12, files: 2 },
    { sha: 'b'.repeat(40), subject: 'docs: typo', at: at(90), aiLines: 0, files: 1 },
    { sha: 'c'.repeat(40), subject: '', at: at(100), aiLines: null, files: null },
  ] }), session('dup', { startedAt: at(70), commits: [{ sha: 'a'.repeat(40), subject: 'feat: login', at: at(80), aiLines: 12 }] })];
  const stream = { lanes: [{ group: 'pullRequest', marks: [{ at: at(20), label: 'Pushed', tone: 'neutral' }, { at: at(120), label: 'Force-pushed', tone: 'neutral' }, { at: at(180), label: 'Pushed', tone: 'neutral' }, { at: at(181), label: 'Approved by sam', tone: 'success' }] }] };
  const spine = commitSpine(detail, sessions, stream, now);
  assert.deepEqual(spine.map(dot => [dot.kind, dot.by]), [['push', 'ploeg'], ['commit', 'agent'], ['commit', 'person'], ['commit', 'unknown'], ['push', 'person'], ['push', 'unknown']]);
  assert.match(spine[1].label, /^Commit aaaaaaa feat: login · 12 AI-written lines by Claude Code on your machine$/);
  assert.equal(spine[0].runId, 'r1');
  assert.equal(spine[4].label, 'Force-pushed to the pull request · while only your session was open');
});

test('an idle session never collides with a Run, and a session never collides with the Run it claimed or handed over', () => {
  const runs = runningRunsOf(detail);
  assert.equal(runs[0].shiftOpenedAt, at(200));
  const idle = session('idle', { state: 'idle', branch: 'agent/vik-2051' });
  assert.deepEqual(collisions({ sessions: [idle], runs }), [], 'idle and linked after "Let Ploeg finish this": no clash');
  const handedWorking = session('handed', { state: 'working', handovers: [{ kind: 'handoff', workItemId: '184', at: at(190) }] });
  assert.equal(startedBy(handedWorking, runs[0]), true);
  assert.deepEqual(collisions({ sessions: [handedWorking], runs }), []);
  const claimer = session('claimer', { state: 'working', handovers: [{ kind: 'claim', workItemId: '184', runId: 'r3', at: at(204) }] });
  assert.deepEqual(collisions({ sessions: [claimer], runs }), [], 'the /unfold:start session and its client-carried Run');
  const earlier = session('earlier', { state: 'working', handovers: [{ kind: 'handoff', workItemId: '184', at: at(201) }] });
  assert.equal(clashesWithRun(earlier, runs[0]), true, 'a Run of an attempt opened before the hand-off was not started by it');
  const other = session('other', { state: 'waiting', mine: false, ownerName: 'sam' });
  const found = collisions({ sessions: [other, claimer], runs });
  assert.deepEqual(found[0].members.map(member => `${member.kind}:${member.id}`), ['session:other', 'session:claimer', 'run:r3'], 'someone else’s session still collides with the Run');
  assert.equal(collisionsOf(collisions({ sessions: [idle, session('idle2', { state: 'idle', mine: false, ownerName: 'sam' })] }), { workItemId: '184' }).length, 0, 'two idle sessions edit nothing, so they do not collide');
});

test('linked sessions join the value stream as one lane per person and harness that links to each session', () => {
  const lanes = streamLanes({ stream: null, shifts: detail.shifts, runs: detail.runs, runTone: () => ({ tone: 'neutral', label: 'x' }), sessions: [session('a', { startedAt: at(70), endedAt: at(150) }), session('b', { startedAt: at(160), state: 'working' }), session('c', { mine: false, ownerName: 'sam', harness: 'codex', startedAt: at(10), endedAt: at(20) })] });
  const people = lanes.filter(lane => lane.group === 'people');
  assert.deepEqual(people.map(lane => [lane.label, lane.sublabel, lane.bars.length]), [['You', 'Claude Code', 2], ['sam', 'Codex', 1]]);
  assert.equal(people[0].bars[1].end, null, 'a working session still runs');
  assert.equal(lanes.at(-1).group, 'people', 'after the Runs');
});

test('the two tracks draw Ploeg above the people on one axis with hand-over connectors and the commit spine, and stack into a list on a phone', () => {
  const sessions = [
    session('handed', { startedAt: at(80), endedAt: at(190), branch: 'agent/vik-2051', commits: [{ sha: 'd'.repeat(40), subject: 'fix: rounding', at: at(100), aiLines: 3 }], handovers: [{ kind: 'handoff', workItemId: '184', at: at(190) }] }),
    session('sam1', { mine: false, ownerName: 'sam', harness: 'codex', state: 'working', startedAt: at(210) }),
  ];
  const tracks = workTracks({ detail, sessions, now });
  assert.deepEqual(tracks.people.map(row => [row.person, row.harness]), [['You', 'Claude Code'], ['sam', 'Codex']]);
  const html = workTracksMarkup(tracks, { detail, sessions, now });
  assert.match(html, /class="tracks-group" data-track="ploeg"/);
  assert.ok(html.indexOf('data-track="ploeg"') < html.indexOf('data-track="people"') && html.indexOf('data-track="people"') < html.indexOf('data-track="spine"'), 'Ploeg, then people, then the spine');
  assert.match(html, /<line class="tracks-handover" data-kind="handoff"/);
  assert.match(html, /<line class="tracks-handover" data-kind="overlap"/);
  assert.match(html, /<a class="stream-bar"[^>]*href="#linked-session\/handed"/);
  assert.match(html, /data-by="agent" role="img" aria-label="Commit ddddddd fix: rounding · 3 AI-written lines/);
  assert.match(html, /<circle r="5"\/>/);
  assert.doesNotMatch(html, /style=/, 'the CSP forbids inline styles');
  assert.match(html, /<ol class="tracks-list"/);
  const items = [...html.matchAll(/<li class="tracks-item" data-track="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(items, ['ploeg', 'ploeg', 'ploeg', 'people', 'handover', 'spine', 'handover', 'ploeg', 'ploeg', 'people', 'handover'], 'the phone list keeps one time order across both tracks');
  assert.match(html, /During attempt 2, Round 1/);
  assert.equal(workTracksMarkup(workTracks({ detail, sessions: [], now }), { detail, sessions: [], now }), '', 'nothing to add without a linked session');
});

test('the two tracks fold quiet hours away, name each stretch after the attempts, and key every bar colour', () => {
  const later = 3000;
  const lane = (key, bars) => ({ key, group: 'run', label: key, sublabel: '', url: null, bars, marks: [] });
  const lanes = [lane('builder', [{ start: at(5), end: at(25) }]), lane('reviewer', [{ start: at(30), end: at(55) }]), { ...lane('you', [{ start: at(later), end: at(later + 30) }]), group: 'people' }];
  const shifts = [{ attempt: 1, from: t0, to: t0 + 60 * 60_000 }];
  const window = foldedWindow(lanes, shifts, now);
  assert.equal(window.folds.length, 1, 'two days of nothing fold into one band');
  assert.deepEqual(window.stretches.map(stretch => stretch.name), ['Attempt 1', 'After attempt 1']);
  assert.ok(window.stretches.every(stretch => stretch.end - stretch.start > 25), 'every stretch keeps room to read its bars');
  assert.ok(window.place(Date.parse(at(25))) > window.place(Date.parse(at(5))) + 10, 'a 20-minute Run is wide, not a sliver');
  assert.equal(window.pieces.at(-1).end, 100);
  const together = foldedWindow([lane('builder', [{ start: at(5), end: at(25) }]), lane('reviewer', [{ start: at(40), end: at(55) }])], shifts, now);
  assert.equal(together.folds.length, 0, 'minutes apart stay on one straight scale');
  assert.equal(together.place(Date.parse(at(5))), 0);

  const stopped = { ...detail, shifts: [detail.shifts[0], { ...detail.shifts[1], closedAt: at(240) }], runs: [...detail.runs.slice(0, 2), { ...detail.runs[2], state: 'finished', finishedAt: at(235), failureReason: 'crashed' }] };
  const sessions = [session('far', { startedAt: at(later), endedAt: at(later + 30) })];
  const html = workTracksMarkup(workTracks({ detail: stopped, sessions, now: Date.parse(at(later + 40)) }), { detail: stopped, sessions, now: Date.parse(at(later + 40)) });
  assert.match(html, />Attempts 1 to 2<.*>After attempt 2</, 'attempts two hours apart share a stretch');
  assert.match(html, /A Run: failed/);
  assert.match(html, /<rect class="tracks-fold"/);
  assert.match(html, /class="tracks-fold-label"[^>]*>1 d \d\d h</);
  assert.match(html, /Quiet hours are folded away/);
  assert.match(html, /<li><span class="tracks-swatch" data-tone="success" aria-hidden="true"><\/span>A Run: finished<\/li>/);
  assert.match(html, /<li><span class="tracks-swatch" data-tone="neutral" aria-hidden="true"><\/span>A person’s own session, ended<\/li>/);
  assert.match(html, /data-time-scale="\[\[/);
  assert.doesNotMatch(html, /style=/, 'the CSP forbids inline styles');
});

test('the time cursor turns a pointer position into a moment and back, and finds that moment on the flight path', () => {
  const pieces = [[0, 100, 0, 40], [100, 1000, 40, 45], [1000, 1100, 45, 100]];
  assert.equal(momentAt(pieces, 20), 50);
  assert.equal(momentAt(pieces, 72.5), 1050);
  assert.equal(shareAt(pieces, 1050), 72.5);
  assert.equal(shareAt(pieces, 2000), null);
  assert.equal(momentAt(pieces, -1), null);
  const spans = [[0, 10], [20, 40], [50, 60]];
  assert.deepEqual(flightSpot(spans, 30), { index: 1, fraction: 0.5 });
  assert.deepEqual(flightSpot(spans, 45), { index: 2, fraction: 0 }, 'between two Runs the cursor waits at the next one');
  assert.equal(flightSpot(spans, 61), null);
});

test('the one-page Work Item shows the two tracks above its views when a session is linked, and says where each session sat', () => {
  const input = workInputOf('running');
  const start = input.live.now - 30 * 60_000;
  const linked = { sessions: [session('pagelink1', { startedAt: new Date(start).toISOString(), state: 'idle', workItems: [{ id: input.detail.item.id, how: 'branch' }] })] };
  const view = workView({ ...input, linked });
  assert.equal(view.tracks.model.people.length, 1);
  const page = workPage(view, {});
  assert.match(page, /aria-label="Two tracks"/);
  assert.ok(page.indexOf('aria-label="Two tracks"') < page.indexOf('lv-desk-main'));
  const entry = view.entries.find(each => each.kind === 'linked');
  assert.ok(entry.place, 'the log says where the session sat');
  assert.doesNotMatch(workPage(workView(input), {}), /aria-label="Two tracks"/);
});
