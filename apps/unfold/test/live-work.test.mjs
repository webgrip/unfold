import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefOf, foldGapSeconds, workView } from '../public/live/work-view.js';
import { workInputOf } from '../public/live/work-fixtures.js';
import { intentBar, decisionDock, acceptanceLedger, timeline } from '../public/live/work-parts.js';
import { workLayouts, workPage } from '../public/live/pages.js';

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

test('every layout renders every scenario with one level-one heading, the intent bar and no leaked values', () => {
  for (const name of ['running', 'needsYou', 'review', 'landed', 'queued', 'stress', 'hijacked']) {
    for (const { id } of workLayouts) {
      const html = workPage(id, workView(workInputOf(name)));
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${name} ${id}`);
      assert.match(html, /class="lv-intent"/, `${name} ${id}`);
      assert.doesNotMatch(html, /undefined|NaN|\[object /, `${name} ${id}`);
    }
  }
  assert.match(timeline(workView(workInputOf('queued'))), /lv-tl/);
});

test('a Run that went off track and came back shows the judge’s history on its flight, not a containment alarm', () => {
  const recovered = workView(workInputOf('driftRecovered'));
  assert.equal(recovered.live.health.health, 'on_track');
  const html = workPage('unified', recovered);
  assert.doesNotMatch(html, /lv-containment/);
  assert.match(html, /Sent to the running Builder/);
  assert.match(workPage('unified', workView(workInputOf('rogue'))), /lv-containment/, 'a Run that is off track now still raises the alarm');
});
