import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { changedFiles, checksOf, elapsedClock, reportFindings, roleCosts, timelineOf, outcomeMarkdown, patchCounts, ploegRunActive, progressGroup, sessionForWorkItem, sessionProgress, spendOf, transcriptVerdict } from '../public/core/progress.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const at = Date.parse(fixture.now);
const worst = (session = fixture.session, extra = {}) => sessionProgress(session, { events: fixture.events, now: at, ploeg: fixture.ploeg, card: fixture.card, ...extra });
const ids = progress => progress.actions.map(action => action.id);

test('the 059675b9 worst case reads as one stopped state, never as running', () => {
  const progress = worst();
  assert.equal(progress.phase, 'stopped');
  assert.equal(progress.headline, 'Reviewer approved in its transcript · stopped before delivery');
  assert.equal(progress.short, 'Stopped · reviewer approved in its transcript');
  assert.equal(progress.reason.code, 'reconciliation');
  assert.match(progress.next, /^Unfold lost Ploeg's authority to run it at \d\d:\d\d, after Ploeg did not answer in time\. Ploeg stopped the execution and holds it for reconciliation/, 'the cause comes before the hold');
  assert.match(progress.next, /does not offer delivery of approved work yet/);
  assert.equal(progress.current, null, 'no Role is working in a stopped session');
  assert.deepEqual(progress.steps.map(step => [step.role, step.state]), [['Implementer', 'done'], ['Reviewer', 'cut_off']]);
  assert.equal(progress.steps[1].verdict.key, 'approve');
  assert.equal(progress.steps[1].verdict.recorded, false, 'a transcript verdict is never shown as recorded');
  assert.equal(progress.steps[1].seconds, 31.5, 'a cut-off Run ends at the stop');
  assert.deepEqual([progress.change.files, progress.change.added, progress.change.removed], [1, 57, 45]);
  assert.equal(progress.spend.status, 'observed');
  assert.match(progress.spend.note, /observed, not settled/);
  assert.ok(progress.facts.some(fact => /Ploeg still lists its operator Run as running/.test(fact)));
  assert.ok(progress.facts.some(fact => /no finished Run recorded that verdict/.test(fact)));
  const halted = sessionProgress({ ...fixture.session, runs: [fixture.session.runs[0], { ...fixture.session.runs[1], status: 'paused', verdict: 'approve', verdictSource: 'transcript' }] }, { now: at });
  assert.deepEqual([halted.steps[1].state, halted.steps[1].verdict.key, halted.steps[1].verdict.recorded], ['cut_off', 'approve', false], 'a Run the server halted with a transcript verdict reads the same without events');
  assert.ok(progress.facts.some(fact => /No candidate was captured/.test(fact)));
  assert.equal(progressGroup(progress), 'needs');
});

test('without the recovery interface, Investigate leads and nothing that is not offered is shown', () => {
  const progress = worst();
  assert.deepEqual(ids(progress), ['investigate', 'view-change', 'open-session', 'cancel']);
  assert.equal(progress.actions[0].primary, true);
  assert.ok(!ids(progress).includes('resume'), 'an execution Ploeg retains is not offered Resume');
});

test('when the server lists recovery, an approved stop offers delivery first, each with a specific confirmation', () => {
  const recovery = { summary: 'Reviewer approved the work before Ploeg stopped the session. It will not run again on its own: deliver the approved work, or run it again as a new session.', actions: [{ id: 'deliver', label: 'Deliver the approved work', available: true }, { id: 'resume', label: 'Resume', available: false }, { id: 'run_again', label: 'Run again', available: true }, { id: 'cancel', label: 'Cancel', available: true }] };
  const progress = worst(fixture.session, { recovery });
  assert.deepEqual(ids(progress).slice(0, 3), ['deliver', 'run-again', 'investigate']);
  const [deliver, again] = progress.actions;
  assert.equal(deliver.primary, true);
  assert.equal(deliver.label, 'Deliver the approved work');
  assert.match(deliver.confirm.detail, /unfold\/059675b9-clown-readme/);
  assert.match(progress.next, /deliver the approved work, or run it again as a new session\.$/, 'the server\'s own summary says what to do');
  assert.ok(!ids(progress).includes('resume'), 'Resume follows the server: unavailable here');
  assert.match(deliver.confirm.detail, /Nothing merges without you/);
  assert.match(deliver.confirm.detail, /^The reviewer gave its approval in its own transcript before it was cut off/, 'the confirmation says where the approval comes from');
  assert.equal(again.confirm, undefined, 'Run again only queues a new session, so it asks nothing');
  assert.match(again.hint, /does not start until you start it/);
  assert.match(deliver.confirm.detail, /Ploeg opens a pull request with it for your review/);
  const unavailable = worst(fixture.session, { recovery: { actions: [{ id: 'deliver', available: false }] } });
  assert.ok(!ids(unavailable).includes('deliver'));
});

test('a viewer sees no mutating action', () => {
  assert.deepEqual(ids(worst(fixture.session, { viewer: true })), ['view-change']);
});

test('a working session names the Role, the Round and a running clock, and the last thing it did', () => {
  const session = { ...fixture.session, status: 'running', blocker: undefined, runs: [{ ...fixture.session.runs[0], status: 'running', finishedAt: undefined }] };
  const events = fixture.events.filter(event => event.id <= 1007);
  const progress = sessionProgress(session, { events, now: Date.parse('2026-10-10T14:39:42.000Z'), ploeg: { ...fixture.ploeg, item: { ...fixture.ploeg.item, state: 'leased', latestShift: { ...fixture.ploeg.item.latestShift, round: 1 } } } });
  assert.equal(progress.phase, 'working');
  assert.equal(progress.headline, 'Implementer is working · Round 1');
  assert.equal(elapsedClock(progress.current.seconds), '0:41');
  assert.equal(progress.current.activity.text, 'ran git diff --check');
  assert.equal(progress.activity, 'Implementer is working');
  assert.equal(progressGroup(progress), 'running');
  assert.deepEqual(ids(progress), ['open-session', 'pause']);
});

test('a completed session with a captured candidate is ready for review with the change in the headline', () => {
  const session = { ...fixture.session, status: 'completed', blocker: undefined, costStatus: 'settled', spentUsd: 0.031, runs: [fixture.session.runs[0], { ...fixture.session.runs[1], status: 'completed', finishedAt: '2026-10-10T14:40:00.000Z', verdict: 'approve' }], candidate: { status: 'ready', fileCount: 1 } };
  const progress = sessionProgress(session, { now: at });
  assert.equal(progress.phase, 'review');
  assert.equal(progress.headline, 'Ready for your review · reviewer approved · 1 file +57 −45');
  assert.deepEqual(ids(progress), ['view-change', 'accept', 'reject']);
  assert.equal(progress.spend.status, 'settled');
  assert.equal(progressGroup(progress), 'review');
});

test('a reviewer that asked for changes is not presented as ready', () => {
  const session = { ...fixture.session, status: 'completed', blocker: undefined, runs: [fixture.session.runs[0], { ...fixture.session.runs[1], status: 'completed', finishedAt: '2026-10-10T14:40:00.000Z', verdict: 'request_changes' }] };
  assert.equal(sessionProgress(session, { now: at }).phase, 'changes_requested');
});

test('a question, a pause, a failure, a restart and a demo each read as themselves', () => {
  const base = { ...fixture.session, blocker: undefined, execution: undefined };
  assert.equal(sessionProgress({ ...base, status: 'waiting_input', runs: [{ ...base.runs[0], status: 'waiting_input', finishedAt: undefined }] }, { now: at }).actions[0].id, 'answer');
  assert.deepEqual(ids(sessionProgress({ ...base, status: 'paused' }, { now: at })), ['resume', 'cancel']);
  const failed = sessionProgress({ ...base, status: 'failed', failure: { stage: 'execution', message: 'The model provider refused the request.', remediation: 'Choose another model.' } }, { now: at });
  assert.equal(failed.headline, 'Execution failed: The model provider refused the request.');
  assert.equal(failed.next, 'Choose another model.');
  const restarted = sessionProgress({ ...base, status: 'interrupted', blocker: 'The server restarted. Execution has not been resumed; review the workspace and explicitly resume.' }, { now: at });
  assert.equal(restarted.reason.code, 'restart');
  assert.ok(ids(restarted).includes('resume'), 'a restart with nothing retained may resume');
  const demo = sessionProgress({ ...base, status: 'running', costStatus: 'demo' }, { now: at });
  assert.equal(demo.spend.text, 'Demo');
  assert.equal(demo.demo, true);
});

test('spend is never a made-up zero', () => {
  assert.equal(spendOf({ costStatus: 'pending', spentUsd: 0, budgetUsd: 1 }).text, 'Not reported');
  assert.equal(spendOf({ costStatus: 'unknown', budgetUsd: 1 }).status, 'unknown');
});

test('helpers: the clock, patch counts, transcript verdicts, the driving session and Ploeg Run activity', () => {
  assert.deepEqual([elapsedClock(7), elapsedClock(725), elapsedClock(3723), elapsedClock(undefined)], ['0:07', '12:05', '1:02:03', '']);
  assert.deepEqual([...patchCounts('diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1 +1,2 @@\n-x\n+y\n+z\n')], [['a.md', { added: 2, removed: 1 }]]);
  assert.equal(changedFiles(fixture.session)[0].before.startsWith('# Unfold'), true);
  assert.equal(transcriptVerdict(fixture.events, 'run-review'), 'approve');
  assert.equal(transcriptVerdict(fixture.events, 'run-impl'), null);
  assert.equal(sessionForWorkItem([{ id: 'a', createdAt: '2026-10-01T00:00:00Z', execution: { workItemId: '184' } }, { id: 'b', createdAt: '2026-10-02T00:00:00Z', execution: { workItemId: 184 } }, { id: 'c' }], '184').id, 'b');
  assert.equal(sessionForWorkItem([], '184'), null);
  assert.equal(ploegRunActive(fixture.ploeg.item, fixture.ploeg.runs[0]), false, 'a needs_human Work Item has no running Run');
  assert.equal(ploegRunActive({ state: 'leased' }, { state: 'running' }), true);
});

test('the outcome Markdown for the Agents window says what happened, what it cost and what to do', () => {
  const markdown = outcomeMarkdown(worst(), { sessionUrl: 'https://unfold.example/#session/059675b9' });
  assert.match(markdown, /^\*\*Stopped\*\* · Reviewer approved in its transcript · stopped before delivery/);
  assert.match(markdown, /- \*\*Reviewer\*\* \(reader\): cut off, approved in its transcript/);
  assert.match(markdown, /Change: 1 file \+57 −45 on `unfold\/059675b9-clown-readme`/);
  assert.match(markdown, /Spend: US\$\s0,03 \(observed, not settled · of US\$\s0,25\)/);
  assert.match(markdown, /Next: Investigate · View change — in VS Code's Work Item view or on \[the session page\]\(https:\/\/unfold\.example\/#session\/059675b9\)\./);
});

test('Ploeg\'s detail reads as the session does: a listed-running Run on a stopped Work Item is stopped, and Rounds never read 0 beside Round 1', async () => {
  const { reconcileDetail } = await import('../public/core/progress.js');
  const reconciled = reconcileDetail(fixture.ploeg, [fixture.session]);
  assert.equal(reconciled.runs[0].state, 'stopped');
  assert.equal(reconciled.runs[0].listedAs, 'running');
  assert.equal(reconciled.item.latestShift.round, 1);
  assert.equal(reconciled.shifts[0].round, 1);
  assert.ok(worst(fixture.session, { ploeg: reconciled }).facts.some(fact => /Ploeg still lists its operator Run as running/.test(fact)), 'the fact survives reconciliation');
  const leased = { ...fixture.ploeg, item: { ...fixture.ploeg.item, state: 'leased' } };
  assert.equal(reconcileDetail(leased, []).runs[0].state, 'running', 'a leased Work Item without a stopped session keeps its running Run');
  assert.equal(reconcileDetail(leased, [fixture.session]).runs[0].state, 'stopped', 'a stopped driving session wins');
});

test('an uncaptured approved change can be captured and read before it is delivered', () => {
  const withoutDiff = { ...fixture.session, artifacts: fixture.session.artifacts.filter(artifact => artifact.kind !== 'diff') };
  const recovery = { summary: 'Deliver it, or run it again.', actions: [{ id: 'capture', label: 'Capture the change', available: true }, { id: 'deliver', label: 'Deliver the approved work', available: true }, { id: 'run_again', label: 'Run again', available: true }] };
  const progress = worst(withoutDiff, { recovery });
  assert.deepEqual(ids(progress).slice(0, 3), ['capture', 'deliver', 'run-again'], 'reading the change comes before delivering it');
  assert.equal(progress.actions[0].primary, true);
  assert.ok(progress.facts.some(fact => /Capture it to read it before you deliver/.test(fact)));
  const captured = worst({ ...withoutDiff, candidate: { status: 'ready', fileCount: 1 } }, { recovery: { ...recovery, actions: recovery.actions.filter(action => action.id !== 'capture') } });
  assert.deepEqual(ids(captured).slice(0, 2), ['deliver', 'run-again']);
  assert.ok(ids(captured).includes('view-change'), 'a captured change is viewable');
  assert.match(captured.headline, /captured, not delivered yet$/);
});

test('the timeline, findings, checks and cost per role come from the session\'s own record', () => {
  const timeline = timelineOf(fixture.session, fixture.events).map(entry => entry.text);
  assert.deepEqual(timeline.slice(2, 5), ['Implementer started', 'Implementer finished', 'Reviewer started']);
  assert.match(timeline.at(-2), /^Unfold lost Ploeg's authority to run it: Ploeg did not answer in time$/);
  assert.deepEqual(reportFindings('Findings: - **Tone/objective:** Fully rewritten. - **Links:** All resolve. VERDICT: approve'), [{ label: 'Tone/objective', detail: 'Fully rewritten.' }, { label: 'Links', detail: 'All resolve.' }]);
  assert.deepEqual(reportFindings('No labelled findings here.'), []);
  assert.deepEqual(checksOf(fixture.session).map(check => [check.name, check.passed]), [['git diff --check', true]]);
  assert.equal(checksOf({ artifacts: [{ id: 'a', kind: 'test', name: 'npm test', content: '3 failed' }] })[0].passed, false);
  const steps = worst().steps;
  assert.deepEqual(roleCosts(fixture.session, steps).map(entry => entry.costUsd), [null, null], 'nothing reported reads null, never zero');
  const requests = [{ roleId: 'implementer', usd: 0.02, inputTokens: 1000, outputTokens: 200 }, { roleId: 'reviewer', usd: 0.006, inputTokens: 800, outputTokens: 40 }, { roleId: 'reviewer', usd: 0.001, inputTokens: 100, outputTokens: 5 }];
  const costs = roleCosts({ ...fixture.session, requests }, steps);
  assert.deepEqual(costs.map(entry => [entry.role, entry.costUsd, entry.inputTokens, entry.source]), [['Implementer', 0.02, 1000, 'gateway'], ['Reviewer', 0.007, 900, 'gateway']]);
});
