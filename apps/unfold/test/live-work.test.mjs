import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefOf, foldGapSeconds, workView } from '../public/live/work-view.js';
import { workInputOf } from '../public/live/work-fixtures.js';
import { scenarios } from '../public/live/fixtures.js';
import { liveModel } from '../public/live/model.js';
import { liveSentence } from '../public/live/parts.js';
import { standingAnswers } from '../public/live/answers.js';
import { flightLegs } from '../public/live/flight-path.js';
import { intentBar, decisionDock, acceptanceLedger, timeline } from '../public/live/work-parts.js';
import { workPage } from '../public/live/pages.js';

test('a brief lists the items under its acceptance heading as conditions and keeps the text before it', () => {
  const brief = briefOf('Make it fast.\n\n## Acceptance\n- under 60 min\n* no test skipped\n1. profile attached\n\n## Notes\n- not a condition');
  assert.equal(brief.text, 'Make it fast.');
  assert.deepEqual(brief.conditions, ['under 60 min', 'no test skipped', 'profile attached']);
  assert.deepEqual(briefOf('Just a sentence.\n- a list without a heading').conditions, []);
  assert.deepEqual(briefOf('### Done when\n- [ ] it ships\n- [x] it is tested').conditions, ['it ships', 'it is tested']);
});

test('the timeline folds quiet stretches, groups Runs a machine ended in a row and never folds while a Run works', () => {
  const view = workView(workInputOf('running'));
  const folds = view.entries.filter(entry => entry.kind === 'fold');
  for (const fold of folds) assert.ok(fold.seconds >= foldGapSeconds);
  const live = view.entries.find(entry => entry.kind === 'run' && entry.ending === 'live');
  assert.ok(live.move, 'the working Run names its move');
  assert.ok(!view.entries.some(entry => entry.kind === 'fold' && entry.at >= live.at), 'no fold while the Run works');
  const bursts = view.entries.filter(entry => entry.kind === 'run' && entry.count > 1);
  assert.ok(bursts.every(entry => entry.ending === 'machine'));
  assert.equal(view.entries.filter(entry => entry.kind === 'run').reduce((sum, entry) => sum + entry.count, 0), view.live.runs.length, 'every Run is counted once');
});

test('a steering message names the first Run that started after it, or none', () => {
  const view = workView(workInputOf('running'));
  const steer = view.entries.find(entry => entry.kind === 'steer');
  assert.ok((steer.readBy && steer.readBy.at >= steer.at) || steer.flying);
  const late = workView({ ...workInputOf('running'), messages: [{ at: new Date(view.live.now - 1000).toISOString(), text: 'later', by: 'Ryan' }] });
  const lateSteer = late.entries.find(entry => entry.kind === 'steer');
  assert.equal(lateSteer.readBy, null);
  assert.equal(lateSteer.flying.role, 'Builder', 'a message sent while a Run works goes to that Run');
});

test('steering opens only for a Work Item started in Unfold that is still open, and the intent bar says why not', () => {
  const unfold = workView(workInputOf('running', { origin: 'unfold' }));
  const tracker = workView(workInputOf('running', { origin: 'tracker' }));
  const landed = workView(workInputOf('landed', { origin: 'unfold' }));
  assert.equal(unfold.canSteer, true);
  assert.match(intentBar(unfold), /data-form="work-steer"[^>]*data-session="session-/);
  assert.equal(tracker.canSteer, false);
  assert.doesNotMatch(intentBar(tracker), /data-form="work-steer"/);
  assert.match(intentBar(tracker), /Steering reaches Work Items started in Unfold/);
  assert.equal(landed.canSteer, false);
  assert.match(intentBar(tracker), /data-form="work-ask"/, 'Asks stay open for any Work Item');
});

test('the dock lists what waits on a person, and says so when nothing does', () => {
  assert.equal(workView(workInputOf('needsYou')).decisions[0].kind, 'stop');
  assert.equal(workView(workInputOf('review')).decisions[0].kind, 'review');
  assert.ok(workView(workInputOf('needsYou', { origin: 'unfold' })).decisions.some(each => each.kind === 'session'));
  const calm = workView(workInputOf('firstTry', { origin: 'tracker' }));
  assert.equal(decisionDock(calm), '');
  assert.match(decisionDock(calm, { quiet: true }), /Nothing waits on you/);
  assert.match(decisionDock(workView(workInputOf('needsYou')), { primary: '<button type="button" class="button primary">Try again</button>' }), /Try again/);
});

test('the spend tape holds money for the running Run and the ledger never claims proof Ploeg did not report', () => {
  const running = workView(workInputOf('running'));
  assert.ok(running.tape.segments.some(segment => segment.kind === 'held'));
  assert.ok(workView(workInputOf('landed')).tape.segments.every(segment => segment.kind !== 'held'));
  const unproven = workView({ ...workInputOf('running'), proofs: [] });
  assert.ok(unproven.brief.conditions.every(condition => condition.state === 'open'));
  assert.match(acceptanceLedger(unproven), /proof not reported yet/);
});

test('the page renders every scenario with one level-one heading, the intent bar and no leaked values', () => {
  for (const name of ['running', 'needsYou', 'review', 'landed', 'queued', 'stress', 'hijacked']) {
    const html = workPage(workView(workInputOf(name)), { runDetail: id => `<p>Run ${id} body</p>` });
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, name);
    assert.match(html, /class="lv-intent"/, name);
    assert.doesNotMatch(html, /undefined|NaN|\[object /, name);
  }
  assert.match(timeline(workView(workInputOf('queued'))), /lv-tl/);
});

test('every Run in the log opens in place to its body, the working Run already open', () => {
  const view = workView(workInputOf('running'));
  const asked = [];
  const html = workPage(view, { runDetail: id => { asked.push(id); return `<p class="probe">Run ${id} body</p>`; } });
  assert.deepEqual(asked.sort(), view.live.runs.filter(run => run.startedAt !== null).map(run => String(run.id)).sort(), 'every started Run is asked for its body once');
  const running = view.live.runs.find(run => run.state === 'running');
  assert.match(html, new RegExp(`<details class="work-run lv-tl-run" id="work-run-${running.id}" open>`));
  assert.doesNotMatch(html, /data-action="work-run"[^>]*>Open the Run/, 'no link out when the Run opens in place');
  const burst = view.entries.find(entry => entry.kind === 'run' && entry.count > 1);
  if (burst) for (const member of burst.members) assert.match(html, new RegExp(`id="work-run-${member.id}"`), 'each Run of a burst opens on its own');
  assert.match(workPage(view), /Open the Run|Follow live/, 'without bodies a Run stays a ticket with its link');
});

test('a Work Item started in Unfold carries its session: what it waits on, its controls, its evidence and its cards', () => {
  const view = workView(workInputOf('running', { origin: 'unfold' }));
  const session = { decision: '<section id="probe-decision"></section>', actions: '<button data-action="pause">Pause</button>', evidence: '<section class="session-evidence">probe</section>', evidenceLabel: 'Evidence', side: '<section id="session-budget"></section>' };
  const html = workPage(view, { session, tab: 'evidence' });
  assert.match(html, /probe-decision/);
  assert.match(html, /data-action="pause"/);
  assert.match(html, /class="lv-desk-radio is-evidence" type="radio"[^>]* checked/);
  assert.match(html, /session-budget/);
  assert.doesNotMatch(html, /href="#session\//, 'nothing sends a person to a separate session page');
  assert.match(workPage(workView(workInputOf('running', { origin: 'tracker' })), { tab: 'evidence' }), /class="lv-desk-radio is-log" type="radio"[^>]* checked/, 'without a session the evidence tab falls back to the log');
});

test('a Run that went off track and came back shows the judge’s history on its flight, not a containment alarm', () => {
  const recovered = workView(workInputOf('driftRecovered'));
  assert.equal(recovered.live.health.health, 'on_track');
  const html = workPage(recovered);
  assert.doesNotMatch(html, /lv-containment/);
  assert.match(html, /Sent to the running Builder/);
  assert.match(workPage(workView(workInputOf('rogue'))), /lv-containment/, 'a Run that is off track now still raises the alarm');
});

test('an open pull request with queued reviewers sits at the pull request, and attempts that never started a Run are not numbered', () => {
  const input = scenarios.agentReview.input();
  const live = liveModel(input);
  assert.deepEqual(live.stages.map(stage => [stage.id, stage.status]), [['ask', 'done'], ['wait', 'done'], ['build', 'done'], ['pr', 'current'], ['review', 'next'], ['merge', 'next'], ['production', 'next']]);
  assert.deepEqual(live.attempts.map(attempt => attempt.n), [1]);
  assert.equal(live.unstarted.length, 2);
  assert.equal(live.spend.budgetUsd, 9.2);
  assert.match(liveSentence(live).sub, /^Pull request #817 is open\. Reviewer and Shadow-reviewer are queued/);
  assert.match(standingAnswers(live).find(answer => answer.id === 'review').answer, /^After the agents\./);
  assert.deepEqual(flightLegs(live).filter(leg => leg.kind === 'attempt').map(leg => leg.head), ['Attempt 1']);
  assert.equal(flightLegs(live).find(leg => leg.kind === 'approach').mode, 'landed');
  const entries = workView({ live, detail: input.detail }).entries;
  assert.deepEqual(entries.filter(entry => entry.kind === 'unstarted').map(entry => entry.reason), ['The task was unassigned from the Team', 'The task was unassigned from the Team']);
  assert.ok(entries.filter(entry => entry.kind === 'fold').every(fold => fold.reason !== 'Waiting for a worker'));
  assert.equal(entries.find(entry => entry.kind === 'run').said, 'The telemetry guide now says when Ploeg passes the telemetry setting to each harness.');
});
