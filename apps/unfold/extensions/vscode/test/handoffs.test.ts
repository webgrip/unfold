import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from '../src/core.ts';
import { HandOffNotifier, answerWorkItem, channelName, describeHandOff, handOffAlert, handOffStatus, inFlight, type AnswerPorts, type HandOff, type HandOffList, type Memory } from '../src/handoffs.ts';
import type { PloegDetail, PloegNowItem } from '../src/ploeg-types.ts';

const core = await loadCore(new URL('../media/core/', import.meta.url));
const at = new Date(Date.now() - 3_600_000).toISOString();
const item = (state: string, extra: Partial<PloegNowItem> = {}): PloegNowItem => ({ id: '42', team: 'bronze', state, title: 'unfold: <b>show</b> one provisional total', url: 'https://vikunja.example/tasks/1694', createdAt: at, updatedAt: at, provider: 'vikunja', externalId: '1694', priority: 4, attempts: 1, infraFailures: 0, target: null, closeReason: null, latestShift: null, spentUsd: 1.5, pullRequestUrl: '', ...extra });
const handOff = (workItem: PloegNowItem | null, extra: Partial<HandOff> = {}): HandOff => ({ id: 7, at, channel: 'mcp:Claude Code 2.1.300', team: 'bronze', origin: { kind: 'task', sourceId: 'board', sourceName: 'Glide board', taskId: '1694' }, workItem, note: workItem ? '' : 'Ploeg has not listed a Work Item for this hand-off yet.', ...extra });
const list = (...handoffs: HandOff[]): HandOffList => ({ handoffs, demo: false, fetchedAt: at });
const pr = 'https://forgejo.example/webgrip/unfold/pulls/731';

class FakeMemory implements Memory {
  values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
}

test('a hand-off row shows its title as given, its Team, state, why it waits, the pull request and spend', () => {
  const ready = describeHandOff(core, handOff(item('awaiting_review', { pullRequestUrl: pr })), false);
  assert.equal(ready.label, 'unfold: <b>show</b> one provisional total', 'tracker text stays plain text, never parsed');
  assert.ok(ready.description.includes(`PR #731 · bronze · ${core.money(1.5)} spent · `), ready.description);
  assert.ok(ready.lines.some(line => /^Handed off from Claude Code to team bronze /.test(line)), ready.lines.join('\n'));
  const waiting = describeHandOff(core, handOff(item('needs_human', { closeReason: 'question_for_person' })), false);
  assert.match(waiting.heading, /^Needs you/);
  const pending = describeHandOff(core, handOff(null), false);
  assert.equal(pending.label, 'Task 1694 on Glide board');
  assert.equal(pending.heading, 'Waiting for Ploeg');
  assert.ok(pending.lines.includes('Ploeg has not listed a Work Item for this hand-off yet.'));
  assert.match(describeHandOff(core, handOff(item('leased')), true).description, /demo, no spend/, 'the demo shows no spend');
});

test('the channel reads as the client a person used', () => {
  assert.equal(channelName('browser'), 'the browser');
  assert.equal(channelName('VS Code on ryan-pc (vscode)'), 'VS Code');
  assert.equal(channelName('unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)'), 'Claude Code');
  assert.equal(channelName('mcp:GitHub Copilot Chat 0.33.1'), 'GitHub Copilot Chat');
  assert.equal(channelName('mcp:unnamed client'), 'an AI client');
});

test('the status bar counts hand-offs in flight and hides when none is', () => {
  const flying = list(handOff(item('leased'), { id: 1 }), handOff(null, { id: 2 }), handOff(item('done', { id: '43' }), { id: 3 }), handOff(item('needs_human', { id: '44' }), { id: 4 }));
  assert.deepEqual(flying.handoffs.map(inFlight), [true, true, false, true]);
  const status = handOffStatus(core, flying)!;
  assert.equal(status.text, '$(export) 3 handed off');
  assert.equal(status.waiting, 1);
  assert.match(status.tooltip, /^3 of your hand-offs are in flight, 1 waiting on you/);
  assert.equal(handOffStatus(core, list(handOff(item('withdrawn')))), undefined);
  assert.equal(handOffStatus(core, undefined), undefined);
});

test('a hand-off notifies when it starts waiting or its pull request is ready, once across windows and reloads', async () => {
  const memory = new FakeMemory();
  const origin = 'https://unfold.example';
  const first = new HandOffNotifier(memory);
  assert.deepEqual(await first.observe(core, origin, list(handOff(item('needs_human', { id: '50' }), { id: 1 }))), [], 'the first list is a baseline');
  const running = list(handOff(item('needs_human', { id: '50' }), { id: 1 }), handOff(item('leased'), { id: 2 }));
  assert.deepEqual(await first.observe(core, origin, running), [], 'what already waited is not announced');
  const ready = list(handOff(item('needs_human', { id: '50' }), { id: 1 }), handOff(item('awaiting_review', { pullRequestUrl: pr }), { id: 2 }));
  const alerts = await first.observe(core, origin, ready);
  assert.deepEqual(alerts.map(alert => [alert.kind, alert.workItemId, alert.pullRequestUrl]), [['ready', '42', pr]]);
  assert.match(alerts[0].message, /ready for review: .*\(PR #731\)$/);
  const otherWindow = new HandOffNotifier(memory);
  assert.deepEqual(await otherWindow.observe(core, origin, ready), [], 'another window sees it was announced');
  const reloaded = new HandOffNotifier(memory);
  assert.deepEqual(await reloaded.observe(core, origin, ready), [], 'a reload does not announce it again');
  const asked = list(handOff(item('needs_human', { id: '50' }), { id: 1 }), handOff(item('needs_human', { updatedAt: new Date().toISOString() }), { id: 2 }));
  const waiting = await reloaded.observe(core, origin, asked);
  assert.deepEqual(waiting.map(alert => [alert.kind, alert.workItemId]), [['waiting', '42']]);
  assert.deepEqual(await first.observe(core, origin, asked), []);
  assert.deepEqual(await new HandOffNotifier(memory).observe(core, 'https://other.example', asked), [], 'each workbench keeps its own baseline');
  const demo = { ...list(handOff(item('awaiting_review', { id: '60', pullRequestUrl: pr }), { id: 9 })), demo: true };
  assert.deepEqual(await reloaded.observe(core, origin, demo), [], 'the demo raises none');
  assert.equal(handOffAlert(core, handOff(item('leased'))), undefined);
});

const question = { id: 'q-1', runId: '7', shiftId: '3', role: 'builder', round: 2, to: 'person', text: 'Which currency should the total use?', waitingForPerson: true };
function detail(extra: Record<string, unknown> = {}): PloegDetail {
  return { item: { ...item('needs_human', { closeReason: 'question_for_person' }), description: '', latestShift: { id: '3', branch: 'ploeg/42', round: 2, budgetUsd: 8, spentUsd: 1.5, reservedUsd: 0, openedAt: at, closedAt: at, closeReason: 'question_for_person' } }, shifts: [], runs: [], checkpoints: [], events: [], questions: [question], ...extra } as unknown as PloegDetail;
}
function ports(answers: (string | undefined)[], choice: 'resume' | 'restart' | undefined) {
  const calls: { answer: unknown[]; requeue: unknown[]; asked: string[]; confirmed: { title: string; detail: string; actions: string[] }[] } = { answer: [], requeue: [], asked: [], confirmed: [] };
  const port: AnswerPorts = {
    ask: async asked => { calls.asked.push(asked.text); return answers.shift(); },
    confirm: async offer => { calls.confirmed.push({ title: offer.title, detail: offer.detail, actions: offer.actions.map(action => action.label) }); return choice; },
    answer: async (id, questionId, body) => { calls.answer.push([id, questionId, body]); return {}; },
    requeue: async (id, body) => { calls.requeue.push([id, body]); return { resumed: Boolean(body.resume), fromRound: 2 }; },
    commandId: () => 'cmd-1',
  };
  return { port, calls };
}

test('Answer stores the answer under its question, then restarts after the person confirms the cost, as the browser does', async () => {
  const { port, calls } = ports(['  Use euros.  '], 'restart');
  const outcome = await answerWorkItem(core, detail(), port);
  assert.equal(outcome.status, 'sent');
  assert.deepEqual(calls.asked, ['Which currency should the total use?']);
  assert.equal(calls.confirmed[0].title, 'Answer and restart this Work Item?');
  assert.ok(calls.confirmed[0].detail.includes(`up to ${core.money(8)} like the last attempt`), calls.confirmed[0].detail);
  assert.deepEqual(calls.answer, [['42', 'q-1', { commandId: 'cmd-1-a1', answer: 'Use euros.' }]]);
  assert.deepEqual(calls.requeue, [['42', { commandId: 'cmd-1', expectedState: 'needs_human' }]]);
  assert.match(outcome.message, /^Answered\. Ploeg started the Work Item over/);
});

test('Answer offers to resume the Round that asked when Ploeg offers it, and sends resume only when chosen', async () => {
  const resume = { shiftId: '3', askedRound: 2, fromRound: 2, roundCapUsd: 4, poolUsd: 8, ready: false, waitingQuestionIds: ['q-1'] };
  const { port, calls } = ports(['Use euros.'], 'resume');
  const outcome = await answerWorkItem(core, detail({ resume }), port);
  assert.deepEqual(calls.confirmed[0].actions, ['Answer and resume Round 2', 'Answer and start over']);
  assert.deepEqual(calls.requeue, [['42', { commandId: 'cmd-1', expectedState: 'needs_human', resume: true }]]);
  assert.equal(outcome.message, 'Answered. Ploeg resumed Round 2 with your answer.');
});

test('a question without an id is answered by one restart whose note quotes it', async () => {
  const { port, calls } = ports(['Skip the migration.'], 'restart');
  await answerWorkItem(core, detail({ questions: [], runs: [{ id: '7', role: 'builder', round: 1, writes: true, state: 'finished', outcome: 'stuck', stuckReason: 'Should I run the migration?', links: [], summary: '', findings: '', verdict: '', problem: '', solution: '', failureReason: null, authorizedUsd: 1, usage: null, costStatus: 'unknown', shiftId: '3', startedAt: at, finishedAt: at }], item: { ...detail().item, closeReason: 'run stuck: Should I run the migration?', latestShift: { ...detail().item.latestShift!, closeReason: 'run stuck: Should I run the migration?' } } }), port);
  assert.deepEqual(calls.asked, ['Should I run the migration?']);
  assert.deepEqual(calls.answer, []);
  assert.equal(calls.requeue.length, 1);
  const [, body] = calls.requeue[0] as [string, { note?: string; resume?: boolean }];
  assert.match(body.note ?? '', /Question: “Should I run the migration\?”\n\nAnswer: Skip the migration\.$/);
  assert.equal(body.resume, undefined);
});

test('a dismissed input or a dismissed confirmation sends nothing', async () => {
  const dismissedInput = ports([undefined], 'restart');
  assert.equal((await answerWorkItem(core, detail(), dismissedInput.port)).status, 'dismissed');
  assert.deepEqual([dismissedInput.calls.confirmed, dismissedInput.calls.answer, dismissedInput.calls.requeue], [[], [], []]);
  const dismissedConfirm = ports(['Use euros.'], undefined);
  assert.equal((await answerWorkItem(core, detail(), dismissedConfirm.port)).status, 'dismissed');
  assert.deepEqual([dismissedConfirm.calls.answer, dismissedConfirm.calls.requeue], [[], []]);
  const empty = ports(['   '], 'restart');
  assert.equal((await answerWorkItem(core, detail(), empty.port)).status, 'dismissed', 'a blank answer is not an answer');
  assert.deepEqual(empty.calls.requeue, []);
});

test('a Work Item that no longer waits, or the demo, asks nothing and sends nothing', async () => {
  const gone = ports(['x'], 'restart');
  assert.equal((await answerWorkItem(core, detail({ item: { ...detail().item, state: 'leased' } }), gone.port)).status, 'none');
  const demo = ports(['x'], 'restart');
  assert.equal((await answerWorkItem(core, detail({ demo: true }), demo.port)).status, 'demo');
  assert.deepEqual([gone.calls.asked, demo.calls.asked, demo.calls.requeue], [[], [], []]);
});
