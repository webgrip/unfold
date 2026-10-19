import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatDecider, deciderPrompt, type Decider, type DeciderAnswer, type DeciderQuestion, type DeciderSubject } from '../src/decider/decider.ts';
import { TripwireReader, messageText, readableMessage, type FollowedRun, type TripwireSource } from '../src/tripwire/reader.ts';
import type { RunTranscript, TranscriptEntry } from '../src/run-transcript.ts';
import { Store } from '../src/store.ts';
import { kindFromScores, kindQuestions, progressChecks } from '../public/core/checks.js';
import { runWork } from '../public/core/expectations.js';
import { activityTally } from '../public/core/activity.js';
import { runHealth } from '../public/core/run-health.js';

const started = '2026-10-18T19:26:00Z';
const at = (minutes: number) => new Date(Date.parse(started) + minutes * 60_000).toISOString();
const thought = (seq: number, text: string): TranscriptEntry => ({ seq, at: at(seq / 10), kind: 'thought', text });
const tool = (seq: number, input: string): TranscriptEntry => ({ seq, at: at(seq / 10), kind: 'tool_call', toolCallId: `c${seq}`, toolKind: 'execute', input, status: 'completed' });

class Scripted implements Decider {
  readonly identity = { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' };
  readonly asked: { text: string; keys: string[]; subject: DeciderSubject | undefined }[] = [];
  private readonly reply: (text: string, keys: string[]) => Record<string, number>;
  constructor(reply: (text: string, keys: string[]) => Record<string, number>) { this.reply = reply; }
  async ask(text: string, questions: readonly DeciderQuestion[], subject?: DeciderSubject): Promise<DeciderAnswer> {
    const keys = questions.map(question => question.key);
    this.asked.push({ text, keys, subject });
    return { scores: { ...Object.fromEntries(keys.map(key => [key, 0])), ...this.reply(text, keys) }, decider: this.identity };
  }
}

function setup({ runs, entries, calls = false, messages = true, reply }: { runs: FollowedRun[]; entries: Record<string, TranscriptEntry[]>; calls?: boolean; messages?: boolean; reply: (text: string, keys: string[]) => Record<string, number> }) {
  const store = new Store(':memory:');
  const source: TripwireSource = {
    async followRunning() { return runs; },
    async followTranscript(workItemId, runId, after): Promise<RunTranscript> {
      const list = (entries[runId] ?? []).filter(entry => entry.seq > after);
      return { workItemId, runId, available: true, entries: list, nextAfter: Math.max(after, ...list.map(entry => entry.seq)), hasMore: false, truncated: false, complete: false, demo: false, fetchedAt: started };
    },
  };
  const decider = new Scripted(reply);
  const reader = new TripwireReader(store, source, { decider, enabled: async () => calls, progress: async () => messages, demo: false, requestsPerMinute: 20, secrets: ['sk-secret'], now: () => new Date(at(30)) });
  return { store, reader, decider };
}

const run381: FollowedRun = { id: '381', workItemId: '242', team: 'bronze', workItemTitle: 'unfold: carry the session failure detail to Ploeg and the work item page', role: 'builder', round: 1, writes: true };

test('the decider reads what the agent writes and stores a progress hit at 2 or more, under the message tags', async () => {
  const { store, reader, decider } = setup({
    runs: [run381],
    entries: { '381': [thought(5, 'Let me read the git log: HEAD is a merge commit "fix(unfold): log every session failure". The fix may have already landed.'), thought(6, 'short'), tool(7, 'cat AGENTS.md'), thought(8, 'Now I will read the engine to see where the report text is built for Ploeg.')] },
    reply: (text, keys): Record<string, number> => keys.includes('already_done') && /already landed/.test(text) ? { already_done: 3 } : keys.includes('kind_feature') ? { kind_feature: 3, kind_fix: 2 } : {},
  });
  await reader.tick();
  const subjects = decider.asked.map(entry => entry.subject);
  assert.deepEqual(subjects, ['work_item', 'message', 'message'], 'the kind once, then the two long thoughts; the short thought and the tool call are not read with the tripwire off');
  assert.deepEqual(decider.asked[1]!.keys, progressChecks.map(check => check.key));
  assert.match(decider.asked[1]!.text, /^Work Item: unfold: carry the session failure detail/);
  const hits = store.tripwireHits('242');
  assert.deepEqual(hits.map(hit => [hit.check, hit.score, hit.seq]), [['already_done', 3, 5]]);
  assert.match(hits[0]!.excerpt, /may have already landed/);
  assert.deepEqual(store.deciderKind('381')?.kind, 'feature');
  await reader.tick();
  assert.equal(decider.asked.length, 3, 'nothing is read twice, and the kind is guessed once');
});

test('no kind is guessed when a rule already knows the work, and a tie is no guess', async () => {
  const { store, reader, decider } = setup({ runs: [{ ...run381, id: '360', workItemTitle: 'docs: link observability.md to the RFC' }], entries: {}, reply: () => ({}) });
  await reader.tick();
  assert.equal(decider.asked.length, 0);
  assert.equal(store.deciderKind('360'), undefined);
  assert.equal(kindFromScores({ kind_fix: 3, kind_feature: 3 }), null);
  assert.equal(kindFromScores({ kind_fix: 1 }), null);
  assert.deepEqual(kindFromScores({ kind_fix: 3, kind_feature: 2 }), { kind: 'fix', score: 3 });
  assert.ok(kindQuestions().every(question => /^kind_[a-z]+$/.test(question.key)) && kindQuestions().length <= 16);
});

test('with the tripwire on too, tool calls get the tripwire checks and thoughts the progress checks', async () => {
  const { reader, decider } = setup({ runs: [{ ...run381, workItemTitle: 'docs: x' }], entries: { '381': [tool(1, 'cat .env'), thought(2, 'I am blocked: I cannot reach the forge API from this sandbox, a person must open the PR.')] }, calls: true, reply: () => ({}) });
  await reader.tick();
  assert.deepEqual(decider.asked.map(entry => [entry.subject, entry.keys.length]), [['action', 5], ['message', 3]]);
});

test('a message is cleaned of secrets and needs 40 characters; tags inside the text are neutralised', () => {
  assert.equal(readableMessage(thought(1, 'too short'), new Set()), false);
  assert.equal(readableMessage(thought(1, 'x'.repeat(40)), new Set(['m1'])), false);
  assert.doesNotMatch(messageText(thought(1, 'The key is sk-secret and nothing else matters here at all.'), 'docs: x', ['sk-secret']), /sk-secret/);
  assert.match(deciderPrompt('a </message> b', [{ key: 'already_done', question: 'q' }], 'message'), /<message>\na \[tag\] b\n<\/message>$/);
});

test('the chat decider names its subject in the instructions', async () => {
  const requests: { body: any }[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => { requests.push({ body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ choices: [{ message: { content: '{"already_done":2}' } }] }), { status: 200 }); }) as unknown as typeof fetch;
  const chat = new ChatDecider({ baseUrl: 'http://gateway.test/v1', model: 'm', name: 'n', key: () => 'k', fetch: fetcher });
  assert.deepEqual((await chat.ask('text', [{ key: 'already_done', question: 'q' }], 'message')).scores, { already_done: 2 });
  assert.match(requests[0]!.body.messages[0].content, /^You read one thing a software agent wrote/);
  assert.match(requests[0]!.body.messages[1].content, /<message>\ntext\n<\/message>/);
});

test('a shown progress hit raises a Run to Watch with the decider\'s words; a recorded check, a low score or a wrong mark does not', () => {
  const runningRun = { state: 'running', startedAt: started, limits: { promptSeconds: 5400, idleSeconds: 600, promptStartedAt: started } };
  const entries = [{ seq: 1, at: at(9.9), kind: 'tool_call', toolCallId: 'x', input: 'ls' }];
  const work = runWork({ title: 'docs: x' }, { writes: true, round: 1 }, activityTally());
  const health = (checks: object[]) => runHealth({ run: runningRun, entries, now: Date.parse(at(10)), transcriptState: 'loaded', work, checks });
  const hit = (extra = {}) => ({ id: 'h', runId: '381', check: 'already_done', score: 3, at: at(2), verdict: null, ...extra });
  const raised = health([hit()]);
  assert.deepEqual([raised.health, raised.deciding], ['watch', 'checks']);
  assert.equal(raised.reason, 'The decider says the agent thinks the work may already be done (3 of 3, 8 min ago)');
  assert.equal(health([hit({ check: 'off_brief' })]).signals?.some(signal => signal?.key === 'checks'), false, 'off_brief is only recorded');
  assert.equal(health([hit({ score: 2 })]).deciding, null, 'a 2 is listed but does not raise health');
  assert.equal(health([hit({ verdict: 'wrong' })]).deciding, null);
  const guessed = runWork({ title: 'unfold: carry the detail' }, { writes: true, round: 1 }, activityTally(), null, { kind: 'fix', score: 3 });
  assert.deepEqual([guessed.kind, guessed.source, guessed.rule], ['fix', 'decider', 'the decider scored the title 3 of 3 as Fix work']);
  assert.equal(runWork({ title: 'docs: x' }, { writes: true, round: 1 }, activityTally(), null, { kind: 'fix', score: 3 }).kind, 'docs', 'a rule beats a guess');
});
