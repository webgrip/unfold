import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AskAllowanceUsedUp, type AskAuthority, type AskGrant } from '../src/ask/service.ts';
import { PloegError, type PloegDetail, type PloegRun } from '../src/ploeg.ts';
import { RunHealthService, type RunHealthWorkItems } from '../src/run-health/service.ts';
import { RunJudge, defaultJudgeModels, judgeLimits, judgeWindow, parseVerdict } from '../src/run-health/judge.ts';
import type { RunTranscript, TranscriptEntry } from '../src/run-transcript.ts';
import { runHealthSettings } from '../src/config.ts';
import { Store } from '../src/store.ts';
import type { User } from '../src/types.ts';

const operator: User = { id: 'operator', name: 'Operator', role: 'operator' };
const viewer: User = { id: 'viewer', name: 'Viewer', role: 'viewer' };
const started = '2026-10-17T08:34:05Z';

function runOf(overrides: Partial<PloegRun> = {}): PloegRun {
  return { id: '305', workItemId: '190', shiftId: '7', team: 'bronze', role: 'builder', round: 1, writes: true, state: 'running', startedAt: started, finishedAt: null, expiresAt: null, outcome: null, summary: '', stuckReason: '', links: [], findings: '', verdict: '', problem: '', solution: '', failureReason: null, authorizedUsd: 1, usage: { costUsd: 0.1 }, costStatus: 'observed', keyAlias: null, limits: { promptSeconds: 5400, idleSeconds: 600, promptStartedAt: started }, ...overrides };
}

function detailOf(run: PloegRun, demo = false): PloegDetail {
  return { item: { id: '190', provider: 'vikunja', externalId: '2049', revision: 'r1', team: 'bronze', state: 'leased', title: 'ci: finish under 60 minutes', description: 'Acceptance: the CI job finishes in under 60 minutes.', url: '', priority: 1, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: started, updatedAt: started, target: null, latestShift: null, lease: null }, shifts: [], runs: [run], checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false }, demo };
}

const entry = (seq: number, time: string, rest: Partial<TranscriptEntry>): TranscriptEntry => ({ seq, at: `2026-10-17T${time}Z`, kind: 'message', ...rest });
const planEntry = (seq: number, time: string, done: number) => entry(seq, time, { kind: 'plan', plan: Array.from({ length: 6 }, (_, index) => ({ content: `step ${index + 1}`, status: index < done ? 'completed' : index === done ? 'in_progress' : 'pending' })) });

function items(state: { run: PloegRun; entries: TranscriptEntry[]; demo?: boolean; available?: boolean; fail?: boolean }) {
  const calls: string[] = [];
  const value: RunHealthWorkItems = {
    async detail(_user, id) { calls.push(`detail ${id}`); if (id !== '190') throw new PloegError(404, 'ploeg_not_found', 'not found'); return detailOf(state.run, state.demo); },
    async runTranscript(_user, id, runId, after = '0'): Promise<RunTranscript> {
      calls.push(`transcript ${after}`);
      if (state.fail) throw new PloegError(503, 'ploeg_unavailable', 'down');
      const entries = state.entries.filter(item => item.seq > Number(after));
      if (state.available === false) return { workItemId: id, runId, available: false, reason: 'unsupported', entries: [], nextAfter: Number(after), hasMore: false, truncated: false, complete: true, demo: false, fetchedAt: started };
      return { workItemId: id, runId, available: true, entries, nextAfter: Math.max(Number(after), ...entries.map(item => item.seq)), hasMore: false, truncated: false, complete: false, demo: state.demo === true, fetchedAt: started };
    },
  };
  return { value, calls };
}

const grant = (models: string[]): AskGrant => ({ askId: 'ask-1', key: 'sk-judge-key', models, expiresAt: started, allowance: null });

function authority(models = ['hetzner-qwen3-8-27b', 'claude-sonnet'], overrides: Partial<AskAuthority> = {}) {
  const calls: string[] = [];
  const value: AskAuthority = {
    async admit(_user, workItemId, _askId, question) { calls.push(`admit ${workItemId} ${question}`); return grant(models); },
    async finish(_user, workItemId, askId) { calls.push(`finish ${workItemId} ${askId}`); },
    async spend() { return { costUsd: null, costStatus: 'unknown' }; },
    async allowance() { return null; },
    ...overrides,
  };
  return { value, calls };
}

type Reply = { status?: number; body: unknown } | Error;
function gateway(replies: Reply[]) {
  const requests: any[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetcher, requests };
}
const answer = (content: string): Reply => ({ body: { choices: [{ message: { content }, finish_reason: 'stop' }] } });

function setup({ run = runOf(), entries = [planEntry(10, '08:37:00', 0), entry(11, '09:05:00', { kind: 'tool_call', toolCallId: 'a', input: 'go test ./...', status: 'completed' })], flag = true, demo = false, models, replies = [answer('{"health":"watch","reason":"Still on the CI timing, but slow.","evidence":[11]}')], authorityOverrides = {}, now = '2026-10-17T09:06:00Z', available, fail }: { run?: PloegRun; entries?: TranscriptEntry[]; flag?: boolean; demo?: boolean; models?: string[]; replies?: Reply[]; authorityOverrides?: Partial<AskAuthority>; now?: string; available?: boolean; fail?: boolean } = {}) {
  const store = new Store(':memory:');
  const state = { run, entries, demo, available, fail };
  const work = items(state);
  const auth = authority(models, authorityOverrides);
  const net = gateway(replies);
  const clock = { now: Date.parse(now) };
  const events: { name: string; props: Record<string, unknown> }[] = [];
  const flagCalls: string[] = [];
  const logs: string[] = [];
  const judge = new RunJudge(auth.value, { gatewayUrl: 'http://gateway.test/v1', models: defaultJudgeModels, secrets: ['ploeg-operator-token'], fetch: net.fetcher, now: () => new Date(clock.now), log: line => logs.push(line) });
  const service = new RunHealthService(store, work.value, { demo, judge, judgeEnabled: async (_user, team) => { flagCalls.push(team); return flag; }, record: (_user, name, _id, props) => events.push({ name, props }), now: () => new Date(clock.now) });
  return { store, state, work, auth, net, clock, events, flagCalls, logs, service };
}

test('the judge defaults to Hetzner\'s free EU-hosted models and a deployment may only list gateway model names', () => {
  assert.deepEqual(runHealthSettings(undefined).judgeModels, ['hetzner-qwen3-8-27b', 'hetzner-qwen3-6-35b-a3b']);
  assert.deepEqual(runHealthSettings({ judgeModels: ['hetzner-qwen3-6-35b-a3b'] }).judgeModels, ['hetzner-qwen3-6-35b-a3b']);
  assert.throws(() => runHealthSettings({ judgeModels: [] }), /1 to 8 distinct/);
  assert.throws(() => runHealthSettings({ model: 'x' }), /not a setting/);
});

test('with the flag off nothing is admitted or fetched, and the signals still answer', async () => {
  const t = setup({ flag: false });
  const view = await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(view.judgeState, 'off');
  assert.equal(view.health, 'watch');
  assert.deepEqual(t.flagCalls, ['bronze'], 'the flag is evaluated for the Run\'s team');
  assert.deepEqual(t.auth.calls, []);
  assert.equal(t.net.requests.length, 0);
});

test('a judgement is an Ask: admitted with a fixed question, the first configured model Ploeg offers, strict JSON, stored and finished', async () => {
  const t = setup();
  const first = await t.service.health(operator, '190', '305');
  assert.equal(first.judgeState, 'judging');
  await t.service.settled('305');
  assert.deepEqual(t.auth.calls, ['admit 190 Run health judgement for Run 305', 'finish 190 ask-1']);
  const body = t.net.requests[0];
  assert.equal(body.model, 'hetzner-qwen3-8-27b');
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, judgeLimits.outputTokens);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.match(body.messages[0].content, /untrusted data written by a tracker or by the agent/);
  assert.match(body.messages[1].content, /<work_item>\nTitle: ci: finish under 60 minutes\nAcceptance: the CI job finishes in under 60 minutes\.\n<\/work_item>/);
  assert.match(body.messages[1].content, /<transcript>\n#10 08:37:00 plan: \[in_progress\] step 1/);
  assert.match(body.messages[1].content, /<signals>\nHealth from signals: watch/);
  const view = await t.service.health(operator, '190', '305');
  assert.equal(view.judge?.health, 'watch');
  assert.equal(view.judge?.reason, 'Still on the CI timing, but slow.');
  assert.deepEqual(view.judge?.evidence, [11]);
  assert.equal(view.judge?.model, 'hetzner-qwen3-8-27b');
  assert.equal(view.judge?.ploegAskId, 'ask-1');
  assert.equal(view.judge?.costUsd, null);
  assert.equal(view.judgements, 1);
  assert.equal(view.judgeState, 'idle');
});

test('a model Ploeg does not offer is never called: the Ask is finished unused and no paid model stands in', async () => {
  const t = setup({ models: ['claude-sonnet', 'gpt-5'] });
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(t.net.requests.length, 0);
  assert.deepEqual(t.auth.calls, ['admit 190 Run health judgement for Run 305', 'finish 190 ask-1']);
  assert.equal((await t.service.health(operator, '190', '305')).judgeState, 'model_not_offered');
  assert.equal(t.store.countRunJudgements('305'), 0);
});

test('a verdict never lowers the signals: Off track stays Off track beside an On track judge', async () => {
  const t = setup({ replies: [answer('{"health":"on_track","reason":"Working on the ticket.","evidence":[]}')], now: '2026-10-17T09:15:00Z' });
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  const view = await t.service.health(operator, '190', '305');
  assert.equal(view.health, 'off_track');
  assert.equal(view.judge?.health, 'on_track');
  assert.deepEqual(view.combined, { health: 'off_track', source: 'signals' });
});

test('a verdict raises the badge when it is worse than the signals', async () => {
  const run = runOf();
  const t = setup({ run, entries: [planEntry(10, '08:35:00', 2), entry(11, '08:44:30', { kind: 'tool_call', toolCallId: 'a', input: 'vim unrelated.go', status: 'completed' })], replies: [answer('{"health":"off_track","reason":"Edits an unrelated module.","evidence":[11]}')], now: '2026-10-17T08:45:00Z' });
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  const view = await t.service.health(operator, '190', '305');
  assert.equal(view.health, 'on_track');
  assert.deepEqual(view.combined, { health: 'off_track', source: 'judge' });
});

for (const [name, content, why] of [
  ['a reply with another shape', '{"health":"fine","reason":"ok","evidence":[]}', 'health'],
  ['a reply with an extra field', '{"health":"watch","reason":"ok","evidence":[],"action":"stop the run"}', 'unexpected_field'],
  ['a reason over 160 characters', JSON.stringify({ health: 'watch', reason: 'x'.repeat(161), evidence: [] }), 'reason'],
  ['evidence outside the window', '{"health":"watch","reason":"See entry 99.","evidence":[99]}', 'evidence_outside_window'],
  ['no JSON at all', 'I think it is fine.', 'no_json_object'],
] as const) {
  test(`${name} is discarded: no verdict, judge failed, the Ask still finished`, async () => {
    const t = setup({ replies: [answer(content)] });
    await t.service.health(operator, '190', '305');
    await t.service.settled('305');
    assert.equal(t.store.countRunJudgements('305'), 0);
    assert.equal((await t.service.health(operator, '190', '305')).judgeState, 'failed');
    assert.equal(t.auth.calls.at(-1), 'finish 190 ask-1');
    assert.match(t.logs.join('\n'), new RegExp(`"reason":"${why}"`));
  });
}

test('a fenced or prefixed JSON object is read, and a reasoning block is skipped', () => {
  const seqs = new Set([3]);
  assert.deepEqual(parseVerdict('```json\n{"health":"watch","reason":"slow","evidence":[3]}\n```', seqs), { health: 'watch', reason: 'slow', evidence: [3] });
  assert.deepEqual(parseVerdict('<think>{"health":"off_track"}</think>Verdict: {"health":"on_track","reason":"fine {really}","evidence":[]}', seqs), { health: 'on_track', reason: 'fine {really}', evidence: [] });
});

test('the transcript window is the newest 40 entries cut to 8 KB', () => {
  const entries = Array.from({ length: 60 }, (_, index) => entry(index + 1, '09:00:00', { text: 'y'.repeat(500) }));
  const window = judgeWindow(entries);
  assert(window.lines.length <= 40);
  assert(Buffer.byteLength(window.lines.join('\n')) <= 8192);
  assert(!window.seqs.has(20));
  assert(window.seqs.has(60));
});

test('a gateway that refuses response_format is asked once more without it', async () => {
  const t = setup({ replies: [{ status: 400, body: { error: { message: 'response_format json_schema is not supported for this model' } } }, answer('{"health":"watch","reason":"slow","evidence":[]}')] });
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(t.net.requests.length, 2);
  assert.ok(t.net.requests[0].response_format);
  assert.equal(t.net.requests[1].response_format, undefined);
  assert.equal(t.store.countRunJudgements('305'), 1);
});

test('a failing gateway leaves no verdict and the Ask is still finished', async () => {
  const t = setup({ replies: [new Error('connection refused')] });
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.deepEqual(t.auth.calls, ['admit 190 Run health judgement for Run 305', 'finish 190 ask-1']);
  assert.equal((await t.service.health(operator, '190', '305')).judgeState, 'failed');
});

test('a spent allowance pauses the judge without a call or a counted attempt', async () => {
  const t = setup({ authorityOverrides: { async admit() { throw new AskAllowanceUsedUp('2026-11-01T00:00:00Z'); } } });
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(t.net.requests.length, 0);
  const view = await t.service.health(operator, '190', '305');
  assert.equal(view.judgeState, 'paused_allowance');
  assert.equal(view.health, 'watch', 'the signals still answer');
});

test('one judgement at a time per Run, at most every 10 minutes without a trigger, and at most 9 per Run', async () => {
  let release: () => void = () => undefined;
  const t = setup({ entries: [planEntry(10, '08:37:00', 2), entry(11, '08:40:00', { kind: 'tool_call', toolCallId: 'a', input: 'ls', status: 'completed' })], now: '2026-10-17T08:41:00Z', replies: [answer('{"health":"on_track","reason":"ok","evidence":[]}')] });
  const slow = t.net.fetcher;
  const held = new Promise<void>(done => { release = done; });
  (t.service as any).options.judge.options.fetch = (async (url: string, init: RequestInit) => { await held; return slow(url, init); }) as typeof fetch;
  const [a, b] = await Promise.all([t.service.health(operator, '190', '305'), t.service.health(operator, '190', '305')]);
  assert.deepEqual([a.judgeState, b.judgeState], ['judging', 'judging']);
  release();
  await t.service.settled('305');
  assert.equal(t.auth.calls.filter(call => call.startsWith('admit')).length, 1, 'single-flight');
  const advance = (seconds: number) => { t.clock.now += seconds * 1000; t.state.entries.push(entry(t.state.entries.at(-1)!.seq + 1, new Date(t.clock.now - 5000).toISOString().slice(11, 19), { kind: 'tool_call', toolCallId: `c${t.clock.now}`, input: `step ${t.clock.now}`, status: 'completed' })); };
  advance(300);
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(t.auth.calls.filter(call => call.startsWith('admit')).length, 1, 'not again within 10 minutes');
  advance(301);
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(t.auth.calls.filter(call => call.startsWith('admit')).length, 2, 'again after 10 minutes');
  for (let index = 0; index < 12; index += 1) { advance(601); await t.service.health(operator, '190', '305'); await t.service.settled('305'); }
  assert.equal(t.auth.calls.filter(call => call.startsWith('admit')).length, judgeLimits.perRun);
  assert.equal(t.store.countRunJudgements('305'), 9);
  assert.equal((await t.service.health(operator, '190', '305')).judgeState, 'cap_reached');
});

test('a plan change and a signal turning to Watch each trigger a judgement inside the 10 minutes', async () => {
  const t = setup({ entries: [planEntry(10, '08:37:00', 2), entry(11, '08:40:00', { kind: 'tool_call', toolCallId: 'a', input: 'ls', status: 'completed' })], now: '2026-10-17T08:41:00Z', replies: [answer('{"health":"on_track","reason":"ok","evidence":[]}')] });
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  t.clock.now += 60_000;
  t.state.entries.push(planEntry(12, '08:41:30', 3));
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(t.auth.calls.filter(call => call.startsWith('admit')).length, 2, 'plan change');
  t.clock.now += 5 * 60_000;
  const view = await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  assert.equal(view.signals.find(signal => signal.key === 'quiet')?.health, 'watch');
  assert.equal(t.auth.calls.filter(call => call.startsWith('admit')).length, 3, 'quiet turned to Watch');
});

test('a viewer reads health and verdicts but never starts a judgement', async () => {
  const t = setup();
  const view = await t.service.health(viewer, '190', '305');
  assert.equal(view.health, 'watch');
  assert.notEqual(view.judgeState, 'judging');
  assert.deepEqual(t.auth.calls, []);
});

test('the demo never calls a judge and labels its health as demo', async () => {
  const t = setup({ demo: true, available: false });
  const view = await t.service.health(operator, '190', '305');
  assert.equal(view.demo, true);
  assert.equal(view.judgeState, 'off');
  assert.deepEqual(t.flagCalls, []);
  assert.deepEqual(t.auth.calls, []);
  assert.equal(t.net.requests.length, 0);
});

test('a finished Run answers only its stored verdicts and is never judged again', async () => {
  const t = setup();
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  t.state.run = runOf({ state: 'finished', finishedAt: '2026-10-17T09:19:00Z', outcome: 'failed' });
  const view = await t.service.health(operator, '190', '305');
  assert.equal(view.health, null);
  assert.equal(view.combined, null);
  assert.equal(view.judgeState, 'off');
  assert.equal(view.history.length, 1);
  assert.equal(view.judge?.health, 'watch');
  assert.equal(t.auth.calls.filter(call => call.startsWith('admit')).length, 1);
});

test('the transcript is read incrementally after the last seq, and a failing read keeps the last health, marked stale', async () => {
  const t = setup({ flag: false });
  const first = await t.service.health(operator, '190', '305');
  t.state.entries.push(entry(12, '09:05:30', { text: 'still timing' }));
  t.clock.now += 30_000;
  await t.service.health(operator, '190', '305');
  assert.deepEqual(t.work.calls.filter(call => call.startsWith('transcript')), ['transcript 0', 'transcript 11']);
  t.state.fail = true;
  t.clock.now += 120_000;
  const stale = await t.service.health(operator, '190', '305');
  assert.equal(stale.stale, true);
  assert.equal(stale.health, first.health);
  assert.equal(stale.asOf, new Date(Date.parse('2026-10-17T09:06:30Z')).toISOString());
});

test('a Ploeg without transcripts judges Time and Budget only', async () => {
  const t = setup({ flag: false, available: false });
  const view = await t.service.health(operator, '190', '305');
  for (const key of ['quiet', 'pace', 'repeat']) assert.equal(view.signals.find(signal => signal.key === key)?.reason, 'no transcript');
});

test('a health change is a product event with the deciding signal and the Run id, never transcript text', async () => {
  const t = setup({ flag: false });
  await t.service.health(operator, '190', '305');
  await t.service.health(operator, '190', '305');
  assert.deepEqual(t.events, [{ name: 'run.health.changed', props: { old: 'none', new: 'watch', signal: 'pace', run: '305' } }]);
});

test('"This was wrong" records the disagreement for a verdict on this Run only', async () => {
  const t = setup();
  await t.service.health(operator, '190', '305');
  await t.service.settled('305');
  const id = t.store.runJudgements('305')[0].id;
  assert.deepEqual(await t.service.wrong(viewer, '190', '305', id), { recorded: true });
  assert.deepEqual(t.events.at(-1), { name: 'run.health.judge_wrong', props: { run: '305', judgement: id, health: 'watch', model: 'hetzner-qwen3-8-27b' } });
  await assert.rejects(t.service.wrong(viewer, '190', '999', id), /not part of the Run/);
  await assert.rejects(t.service.wrong(viewer, '191', '305', id), /not found/);
});
