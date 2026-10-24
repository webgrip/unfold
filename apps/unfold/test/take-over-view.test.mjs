import test from 'node:test';
import assert from 'node:assert/strict';
import { actsFor, handBackOffer, takeControlDialogMarkup, takeControlOffer, takeOverCommands, takeOverMarks, takeOverMarkup } from '../public/core/take-over.js';
import { handoverMarks, workTracks } from '../public/core/session-tracks.js';
import { workTracksMarkup } from '../public/core/work-tracks.js';
import { workView } from '../public/live/work-view.js';
import { workPage } from '../public/live/pages.js';
import { workInputOf } from '../public/live/work-fixtures.js';
import { closeReasonLabel, runOutcome } from '../public/core/states.js';
import { listReason } from '../public/core/reasons.js';

const t0 = Date.parse('2026-10-24T08:00:00.000Z');
const at = minutes => new Date(t0 + minutes * 60_000).toISOString();
const now = t0 + 300 * 60_000;
const head = 'b'.repeat(40), wip = 'c'.repeat(40);
const me = { id: 'ryan', role: 'operator' };

const running = (fields = {}) => ({
  item: { id: '184', state: 'leased', title: 'Fix rounding', target: { owner: 'webgrip', repo: 'unfold' }, latestShift: { id: 's2', branch: 'agent/vik-2051', closedAt: null } },
  shifts: [{ id: 's2', branch: 'agent/vik-2051', round: 1, openedAt: at(200), closedAt: null }],
  runs: [{ id: 'r3', workItemId: '184', shiftId: 's2', role: 'builder', round: 1, state: 'running', startedAt: at(205), finishedAt: null, writes: true, harness: 'acp' }],
  events: [],
  ...fields,
});
const held = (state, fields = {}) => ({ id: '7', state, by: 'ryan', shiftId: 's2', round: 1, branch: 'agent/vik-2051', requestedAt: at(240), yieldedAt: state === 'yielding' ? null : at(241), commit: state === 'yielding' ? null : head, workInProgress: state === 'yielding' ? null : wip, pushed: state === 'yielding' ? null : true, detail: null, handedBackAt: state === 'handed_back' ? at(280) : null, handedBackShiftId: state === 'handed_back' ? 's3' : null, ...fields });
const parked = (state = 'taken_over', fields = {}) => {
  const base = running();
  return { ...base, item: { ...base.item, state: 'needs_human', latestShift: { ...base.item.latestShift, closedAt: at(242), closeReason: 'taken_over' } }, shifts: [{ ...base.shifts[0], closedAt: at(242), closeReason: 'taken_over' }], runs: [{ ...base.runs[0], state: 'finished', finishedAt: at(241), outcome: 'yielded' }], takeOver: held(state, fields) };
};

test('running: Take control is offered to the person it acts for, with the Shift they saw', () => {
  const offer = takeControlOffer(running(), me);
  assert.deepEqual([offer.enabled, offer.reason, offer.shiftId, offer.actFor], [true, '', 's2', null]);
  const html = takeOverMarkup(running(), { viewer: me });
  assert.match(html, /data-state="offered"/);
  assert.match(html, /data-action="work-take-control"[^>]*data-id="184"[^>]*data-shift="s2"|data-shift="s2"[^>]*data-action="work-take-control"/s);
  assert.doesNotMatch(html, /disabled/);
  const dialog = takeControlDialogMarkup(running(), offer);
  assert.match(dialog, /data-form="work-take-control"/);
  assert.match(dialog, /the builder Run to stop at its next safe point/);
  assert.match(dialog, /pushes it to agent\/vik-2051, without forcing/);
  assert.equal(takeControlOffer(running(), { id: 'sam', role: 'viewer' }), null, 'a viewer sees no button');
  assert.equal(takeControlOffer({ ...running(), item: { ...running().item, state: 'queued' } }, me), null, 'nothing runs, nothing to take');
  assert.equal(takeControlOffer({ ...running(), runs: [] }, me), null);
});

test('refused: disabled with the reason Ploeg would give for the harness, for another person\'s Work Item, and in the demo', () => {
  const claude = running({ runs: [{ ...running().runs[0], harness: 'claude-code' }] });
  const offer = takeControlOffer(claude, me);
  assert.deepEqual([offer.enabled, offer.code], [false, 'yield_unsupported']);
  assert.match(offer.reason, /^Claude Code Runs cannot stop between steps yet\./);
  const html = takeOverMarkup(claude, { viewer: me });
  assert.match(html, /data-state="refused"/);
  assert.match(html, /disabled/);
  assert.match(html, /Claude Code Runs cannot stop between steps yet/);
  const theirs = running({ events: [{ id: '1', at: at(199), actor: 'sam', action: 'operator.work_item.admitted', workItemId: '184', team: 'delivery', detail: {} }] });
  assert.equal(actsFor(theirs), 'sam');
  assert.match(takeControlOffer(theirs, me).reason, /acts for sam\. Only they, or an administrator/);
  const admin = takeControlOffer(theirs, { id: 'boss', role: 'admin' });
  assert.deepEqual([admin.enabled, admin.actFor], [true, 'sam']);
  assert.match(takeOverMarkup(theirs, { viewer: { id: 'boss', role: 'admin' } }), /Take control for sam/);
  assert.equal(actsFor({ item: { waitingForClient: { actsFor: 'kim' } }, events: [] }), 'kim');
  assert.match(takeControlOffer({ ...running(), demo: true }, me).reason, /demo runs no agents/);
  assert.match(takeOverMarkup(running(), { viewer: me, result: { error: 'Ploeg started another attempt since you looked.' } }), /role="alert">Ploeg started another attempt/);
});

test('yielding: the panel waits for the safe point and offers nothing to press', () => {
  const detail = running({ takeOver: held('yielding') });
  assert.equal(takeControlOffer(detail, me), null);
  const html = takeOverMarkup(detail, { viewer: me });
  assert.match(html, /data-state="yielding"/);
  assert.match(html, /Waiting for the Run to stop at a safe point/);
  assert.doesNotMatch(html, /data-action="work-take-control"|data-form="work-hand-back"/);
});

test('taken over: the branch and commit, the commands that pick it up, and Hand back with an optional note for its taker', () => {
  const detail = parked();
  const html = takeOverMarkup(detail, { viewer: me });
  assert.match(html, /data-state="taken_over"/);
  assert.match(html, /You took control/);
  assert.match(html, /agent\/vik-2051/);
  assert.match(html, new RegExp(head.slice(0, 12)));
  assert.match(html, new RegExp(`work in progress commit <code class="mono">${wip.slice(0, 12)}`));
  assert.deepEqual(takeOverCommands(detail), { plugin: '/unfold:takeover 184', git: "git fetch origin 'agent/vik-2051' && git switch 'agent/vik-2051'" });
  assert.match(html, /\/unfold:takeover 184/);
  assert.match(html, /data-form="work-hand-back" data-id="184"/);
  assert.match(html, /name="note"[^>]*maxlength="4096"/);
  assert.doesNotMatch(html.slice(html.indexOf('data-form="work-hand-back"')), /disabled/);
  const other = takeOverMarkup(detail, { viewer: { id: 'sam', role: 'operator' } });
  assert.match(other, /ryan took control/);
  assert.match(other, /ryan took this over\. Only they, or an administrator acting for them, can hand it back/);
  assert.deepEqual(handBackOffer(detail, { id: 'boss', role: 'admin' }), { enabled: true, reason: '', actFor: 'ryan' });
  assert.match(takeOverMarkup(detail, { viewer: { id: 'boss', role: 'admin' } }), /Hand back for ryan/);
  assert.match(takeOverMarkup(parked('taken_over', { pushed: false, detail: 'the branch moved on the forge' }), { viewer: me }), /could not put the agent’s last changes on the forge: the branch moved on the forge/);
});

test('handed back: a line of history, and Take control again once a Run runs', () => {
  const back = parked('handed_back');
  assert.equal(handBackOffer(back, me), null);
  assert.match(takeOverMarkup(back, { viewer: me }), /You handed it back to Ploeg.*Ploeg continues on agent\/vik-2051/);
  const again = running({ takeOver: held('handed_back') });
  const html = takeOverMarkup(again, { viewer: me });
  assert.match(html, /data-action="work-take-control"/);
  assert.match(html, /You handed it back to Ploeg/);
  assert.match(takeOverMarkup(running({ takeOver: held('ended') }), { viewer: me }), /attempt closed another way first/);
});

test('Ploeg\'s words: the yielded outcome and the taken_over close reason read plainly, and the Needs-you chip says who has it', () => {
  assert.equal(runOutcome('yielded').label, 'Stopped for a person');
  assert.equal(closeReasonLabel('taken_over'), 'A person took it over');
  const reason = listReason({ state: 'needs_human', latestShift: { closeReason: 'taken_over', closedAt: at(242) } });
  assert.equal(reason.chip, 'Taken over by a person');
  assert.equal(reason.requeue, '', 'it is handed back here, not reassigned in the tracker');
});

test('the two tracks mark the take-over and the hand-back, on the person\'s session lane too, and no longer guess a take-over for that session', () => {
  const session = { id: 'mine1', harness: 'claude-code', mine: true, ownerName: 'ryan', branch: 'agent/vik-2051', state: 'ended', startedAt: at(245), lastSeenAt: at(275), endedAt: at(275), workItems: [{ id: '184', how: 'explicit' }], commits: [], handovers: [] };
  const detail = parked('handed_back');
  const marks = takeOverMarks(detail, [session]);
  assert.deepEqual(marks.map(mark => [mark.kind, mark.sessionId, mark.from, mark.to]), [['take-control', 'mine1', 'ploeg', 'people'], ['hand-back', 'mine1', 'people', 'ploeg']]);
  assert.match(marks[0].label, new RegExp(`You took control of the builder Run; its work is ${head.slice(0, 12)} on agent/vik-2051`));
  const all = handoverMarks(detail, [session], now);
  assert.deepEqual(all.map(mark => mark.kind), ['take-control', 'hand-back'], 'the session on the branch is the take-over, not a guessed "Continue in my Claude Code"');
  assert.deepEqual(takeOverMarks(running(), [session]), [], 'no take-over, no mark');
  const yielding = takeOverMarks(running({ takeOver: held('yielding') }), []);
  assert.match(yielding[0].label, /ryan took control.*waiting for the Run to stop at a safe point/);
  const tracks = workTracks({ detail, sessions: [session], now });
  const html = workTracksMarkup(tracks, { detail, sessions: [session], now, control: '<section class="take-over">X</section>' });
  assert.match(html, /data-kind="take-control"/);
  assert.match(html, /data-kind="hand-back"/);
  assert.match(html, /<section class="take-over">X<\/section>/);
});

test('the one-page Work Item draws Take control in the two tracks when they show, else above the decision box', () => {
  const input = workInputOf('running');
  const control = '<section class="take-over" aria-label="Take control">X</section>';
  const alone = workPage(workView(input), { takeControl: control, decision: '<p id="decision">D</p>' });
  assert.ok(alone.includes(control));
  assert.ok(alone.indexOf(control) < alone.indexOf('id="decision"'), 'Take control comes before the decision box');
  const start = input.live.now - 30 * 60_000;
  const linked = { sessions: [{ id: 'pagelink1', harness: 'claude-code', mine: true, ownerName: 'ryan', branch: 'feat/x', state: 'idle', startedAt: new Date(start).toISOString(), lastSeenAt: new Date(start).toISOString(), endedAt: null, workItems: [{ id: input.detail.item.id, how: 'branch' }], commits: [], handovers: [] }] };
  const page = workPage(workView({ ...input, linked }), { takeControl: control });
  assert.equal(page.split(control).length - 1, 1, 'drawn once');
  assert.ok(page.indexOf(control) > page.indexOf('aria-label="Two tracks"'), 'inside the two tracks');
});
