import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDiff, changesSource, checkSummary, summaryFacts, remediationSteps } from '../public/views/session.js';
import { sessionGroup, sessionProgress, listStatus } from '../public/views/sessions.js';
import { deliveryGated, deliveryMarkup, deliveryStatus } from '../public/delivery.js';

const demoDiff = `diff --git a/src/order.js b/src/order.js
index 1d029ed..1a31590 100644
--- a/src/order.js
+++ b/src/order.js
@@ -1,6 +1,6 @@
 export function moneyToCents(amount) {
   if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Amount must be a finite non-negative number');
-  return Math.round(amount * 100);
+  return Math.round((amount + Number.EPSILON) * 100);
 }

 export function orderTotal(items) {
`;

const baseline = `Command: node --test test/order.test.js
Exit code: 1
Duration: 58 ms
Runtime: deterministic demo (no model calls)

✖ rounds a half cent upward for the reported 1.005 fixture (0.816178ms)
✖ rounds ordinary prices and sums item quantities in integer cents (0.139541ms)
✔ rejects invalid input rather than inventing totals (0.25104ms)
ℹ tests 3
ℹ suites 0
ℹ pass 1
ℹ fail 2

✖ failing tests:

test at test/order.test.js:5:1
✖ rounds a half cent upward for the reported 1.005 fixture (0.816178ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
`;

test('a unified diff becomes files with counts, numbered lines and no repeated headers', () => {
  const [file, ...rest] = parseDiff(demoDiff);
  assert.equal(rest.length, 0);
  assert.equal(file.path, 'src/order.js');
  assert.deepEqual([file.added, file.removed], [1, 1]);
  assert.deepEqual(file.lines.map(line => line.kind), ['hunk', 'context', 'context', 'del', 'add', 'context', 'context', 'context']);
  assert.deepEqual(file.lines.find(line => line.kind === 'del'), { kind: 'del', text: '-  return Math.round(amount * 100);', old: 3, new: null });
  assert.deepEqual(file.lines.find(line => line.kind === 'add'), { kind: 'add', text: '+  return Math.round((amount + Number.EPSILON) * 100);', old: null, new: 3 });
  assert.deepEqual(file.lines.at(-1), { kind: 'context', text: ' export function orderTotal(items) {', old: 6, new: 6 });
  assert(!file.lines.some(line => /^(diff --git|index |--- |\+\+\+ )/.test(line.text)));
});

test('a diff names new files, keeps hunk text that looks like a header, and splits several files', () => {
  const files = parseDiff('diff --git a/a.md b/a.md\nnew file mode 100644\n--- /dev/null\n+++ b/a.md\n@@ -0,0 +1,2 @@\n+++ not a header\n+second\ndiff --git a/b.js b/b.js\n--- a/b.js\n+++ b/b.js\n@@ -10,2 +10,1 @@\n-gone\n kept\n\\ No newline at end of file\n');
  assert.deepEqual(files.map(file => [file.path, file.added, file.removed]), [['a.md', 2, 0], ['b.js', 0, 1]]);
  assert.deepEqual(files[0].lines.map(line => line.kind), ['note', 'hunk', 'add', 'add']);
  assert.equal(files[0].lines[2].text, '+++ not a header');
  assert.deepEqual(files[1].lines.slice(1).map(line => [line.kind, line.old, line.new]), [['del', 10, null], ['context', 11, 10], ['note', null, null]]);
  assert.deepEqual(parseDiff(''), []);
});

test('a binary file in a patch reads as one note instead of its encoded payload', () => {
  const [image, text] = parseDiff('diff --git a/logo.png b/logo.png\nindex 1111111..2222222 100644\nGIT binary patch\nliteral 12\nTcmZ?l%Ft|ri}v<\n\nliteral 0\nHcmV?d00001\n\ndiff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n');
  assert.equal(image.path, 'logo.png');
  assert.deepEqual(image.lines, [{ kind: 'note', text: 'Binary file changed; its contents are not shown.', old: null, new: null }]);
  assert.deepEqual([text.path, text.added, text.removed], ['a.txt', 1, 1]);
});

test('Changes reads recorded diffs first and falls back to the repository snapshot only when it holds a patch', () => {
  const ready = { status: 'ready', formats: ['bundle', 'patch', 'manifest'] };
  assert.equal(changesSource({ artifacts: [{ kind: 'diff' }], candidate: ready }), 'artifacts');
  assert.equal(changesSource({ artifacts: [{ kind: 'summary' }, { kind: 'test' }], candidate: ready }), 'snapshot');
  assert.equal(changesSource({ artifacts: [], candidate: { status: 'ready', formats: ['bundle'] } }), 'none');
  assert.equal(changesSource({ artifacts: [], candidate: { status: 'unavailable', formats: ['patch'] } }), 'none');
  assert.equal(changesSource({ artifacts: [] }), 'none');
});

test('a recorded node --test run reads as its header, totals and each test once', () => {
  const summary = checkSummary(baseline);
  assert.equal(summary.command, 'node --test test/order.test.js');
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.duration, '58 ms');
  assert.deepEqual([summary.tests, summary.pass, summary.fail], [3, 1, 2]);
  assert.deepEqual(summary.cases, [
    { passed: false, name: 'rounds a half cent upward for the reported 1.005 fixture' },
    { passed: false, name: 'rounds ordinary prices and sums item quantities in integer cents' },
    { passed: true, name: 'rejects invalid input rather than inventing totals' },
  ]);
});

test('TAP output and output without a header still summarise, and unknown values stay unknown', () => {
  const tap = checkSummary('TAP version 13\nok 1 - adds\nnot ok 2 - rounds\n  ---\n# tests 2\n# pass 1\n# fail 1\n');
  assert.deepEqual([tap.tests, tap.pass, tap.fail, tap.exitCode, tap.command], [2, 1, 1, null, null]);
  assert.deepEqual(tap.cases, [{ passed: true, name: 'adds' }, { passed: false, name: 'rounds' }]);
  assert.deepEqual(checkSummary('npm ERR! missing script: test\nExit code: nope'), { command: null, exitCode: null, duration: null, runtime: null, tests: null, pass: null, fail: null, cases: [] });
});

test('a handoff summary separates its leading facts from the prose after them', () => {
  assert.deepEqual(summaryFacts('Runtime: deterministic demo (no model)\nVerdict: approve\nDiff inspected: true\nScope: the supplied rounding fixture only.\nNo merge was performed.'), {
    facts: [['Runtime', 'deterministic demo (no model)'], ['Verdict', 'approve'], ['Diff inspected', 'true'], ['Scope', 'the supplied rounding fixture only.']],
    rest: 'No merge was performed.',
  });
  assert.deepEqual(summaryFacts('The reviewer found no issues.\nVerdict: approve'), { facts: [], rest: 'The reviewer found no issues.\nVerdict: approve' });
});

test('a remediation becomes numbered steps, one per instruction, with statements kept as context', () => {
  assert.deepEqual(remediationSteps('Do not resubmit the prompt. Confirm the remote turn has stopped, inspect its evidence and reconcile gateway spend before deciding whether to start new work.'), {
    steps: ['Do not resubmit the prompt.', 'Confirm the remote turn has stopped.', 'Inspect its evidence.', 'Reconcile gateway spend before deciding whether to start new work.'],
    notes: [],
  });
  assert.deepEqual(remediationSteps('Check the registered repository, clone access, workspace storage and provisioning policy. Inspect restricted infrastructure logs using the session identifier.').steps, ['Check the registered repository, clone access, workspace storage and provisioning policy.', 'Inspect restricted infrastructure logs using the session identifier.']);
  assert.deepEqual(remediationSteps('The session was stopped and its gateway credential revoked. Check the gateway route for the model and the workbench policy before starting new work.'), {
    steps: ['Check the gateway route for the model and the workbench policy before starting new work.'],
    notes: ['The session was stopped and its gateway credential revoked.'],
  });
  assert.deepEqual(remediationSteps('Authorize more budget and resume. The gateway settles the spend it already recorded within a minute.'), { steps: ['Authorize more budget.', 'Resume.'], notes: ['The gateway settles the spend it already recorded within a minute.'] });
  assert.deepEqual(remediationSteps('<img src=x onerror=alert(1)>'), { steps: [], notes: ['<img src=x onerror=alert(1)>'] });
  assert.deepEqual(remediationSteps(undefined), { steps: [], notes: [] });
});

test('the list groups sessions by what they need and says where each one stands without repeating its state', () => {
  const runs = [{ roleName: 'Implementer', mode: 'write', status: 'completed' }, { roleName: 'Reviewer', mode: 'read', status: 'completed', verdict: 'approve' }];
  const review = { decision: 'accepted', byName: 'Ryan', at: '2026-09-30T10:00:00Z' };
  assert.equal(sessionGroup({ status: 'completed', runs }), 'needs');
  assert.equal(sessionProgress({ status: 'completed', runs }), 'Agent approved');
  assert.equal(sessionGroup({ status: 'completed', review, runs }), 'done');
  assert.equal(sessionProgress({ status: 'completed', review, runs }), 'Accepted by Ryan');
  assert.equal(sessionProgress({ status: 'completed', review: { ...review, decision: 'rejected' }, runs }), 'Rejected by Ryan');
  assert.equal(sessionGroup({ status: 'waiting_input', runs: [] }), 'needs');
  assert.equal(sessionProgress({ status: 'waiting_input', runs: [{ roleName: 'Reviewer', status: 'waiting_input' }] }), 'Reviewer is waiting for you');
  assert.equal(sessionProgress({ status: 'running', runs: [{ roleName: 'Implementer', status: 'running' }] }), 'Implementer is working');
  assert.equal(sessionProgress({ status: 'failed', failure: { stage: 'prompt' }, runs: [] }), 'Prompt submission failed');
  for (const status of ['queued', 'paused', 'running', 'exporting']) assert.equal(sessionGroup({ status, runs: [] }), 'active', status);
  for (const status of ['queued', 'paused', 'cancelled']) assert.equal(sessionProgress({ status, runs: [] }), '', status);
  assert.equal(sessionGroup({ status: 'cancelled', runs: [] }), 'done');
});

const gated = (overrides = {}) => ({
  session: { id: 'abc', status: 'completed', repositoryId: 'order-service', execution: { workItemId: '105' }, candidate: { status: 'ready' } },
  bootstrap: { deliveryRepositories: ['order-service'], user: { role: 'operator' } },
  delivery: null, deliveryError: '', deliveryBusy: false,
  ...overrides,
});
const policy = 'b'.repeat(64);
const candidate = { id: 'c'.repeat(32), canonicalSha: 'a'.repeat(40), policySha256: policy };

test('the delivery gate appears only for a finished session under a Ploeg execution on a delivery repository', () => {
  assert.equal(deliveryGated(gated()), true);
  assert.equal(deliveryGated(gated({ bootstrap: { deliveryRepositories: [], user: { role: 'operator' } } })), false);
  assert.equal(deliveryGated(gated({ session: { ...gated().session, execution: undefined } })), false);
  assert.equal(deliveryGated(gated({ session: { ...gated().session, status: 'running' } })), false);
  assert.equal(deliveryMarkup(gated({ session: { ...gated().session, candidate: { status: 'unavailable' } } })), '');
  const waiting = deliveryMarkup(gated());
  assert.match(waiting, /id="delivery-title"[^>]*>.*Delivery gate<\/h2>/);
  assert.match(waiting, /Preserve the exact change/);
  assert.match(waiting, /Approval does not push, merge or deploy\./);
  assert.doesNotMatch(waiting, /data-action="delivery-(verify|approve)"/);
});

test('the delivery gate offers verification, then approval of the verified commit, and never to a viewer', () => {
  const verify = deliveryMarkup(gated({ delivery: { configured: true, policySha256: policy, candidate } }));
  assert.match(verify, /data-action="delivery-verify"/);
  assert.match(verify, /Run independent checks/);
  const verified = gated({ delivery: { configured: true, policySha256: policy, candidate, receipt: { passed: true }, checks: [{ id: 'node --test', passed: true }] } });
  const approve = deliveryMarkup(verified);
  assert.match(approve, /data-action="delivery-approve"/);
  assert.match(approve, /Independent checks passed/);
  assert.match(approve, /<span class="gate-check-name">node --test<\/span><span class="gate-check-result">Passed<\/span>/);
  assert.doesNotMatch(deliveryMarkup({ ...verified, bootstrap: { deliveryRepositories: ['order-service'], user: { role: 'viewer' } } }), /data-action="delivery-(verify|approve)"/);
  const approved = deliveryMarkup(gated({ delivery: { configured: true, policySha256: policy, candidate, receipt: { passed: true }, approval: { actor: '<img src=x onerror=alert(1)>' } } }));
  assert.match(approved, /Recorded by &lt;img src=x onerror=alert\(1\)&gt;\./);
  assert.doesNotMatch(approved, /<img/);
});

test('the delivery gate explains a changed policy, an interrupted verification and a failed read, with a way to retry', () => {
  const changed = deliveryMarkup(gated({ delivery: { configured: true, policySha256: 'e'.repeat(64), candidate, receipt: { passed: true }, approval: { actor: 'Ryan' } } }));
  assert.match(changed, /Policy changed · review required/);
  assert.match(changed, /role="alert"/);
  assert.doesNotMatch(changed, /Commit approved/);
  assert.match(deliveryMarkup(gated({ delivery: { configured: true, policySha256: policy, candidate, localPhase: 'interrupted' } })), /Verification interrupted/);
  const failed = deliveryMarkup(gated({ deliveryError: 'Ploeg did not answer <in time>.' }));
  assert.match(failed, /Ploeg did not answer &lt;in time&gt;\./);
  assert.match(failed, /data-action="delivery-refresh"/);
});

test('a finished session behind the delivery gate reads as awaiting your approval in the list and on its page, until the approval is recorded', () => {
  const session = gated().session;
  const bootstrap = gated().bootstrap;
  assert.deepEqual(listStatus(session, bootstrap), { key: 'awaiting_approval', label: 'Awaiting your approval', tone: 'review', glyph: 'shield' });
  assert.equal(sessionProgress({ ...session, runs: [] }, bootstrap), 'Verify, then approve the frozen commit');
  assert.equal(listStatus(session, { deliveryRepositories: [] }).label, 'Ready for your review');
  assert.equal(listStatus({ ...session, review: { decision: 'accepted', byName: 'Ryan' } }, { deliveryRepositories: [] }).label, 'Accepted');
  assert.equal(deliveryStatus(gated({ delivery: { policySha256: policy, candidate, approval: { actor: 'Ryan' } } })).label, 'Commit approved');
  assert.equal(deliveryStatus(gated({ delivery: { policySha256: 'e'.repeat(64), candidate, approval: { actor: 'Ryan' } } })).label, 'Awaiting your approval');
  assert.equal(deliveryStatus(gated({ session: { ...session, status: 'running' } })), null);
  assert.match(deliveryMarkup(gated()), /class="card session-decision session-gate" data-tone="review"/);
});
