import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { ChatDecider, DeciderError, deciderLimits, parseScores, type Decider, type DeciderAnswer } from '../src/decider/decider.ts';
import { TripwireReader, screenExcerpt, screenText, screenable, tripwireQuestions, type TripwireSource } from '../src/tripwire/reader.ts';
import { TripwireService, demoTripwireHits } from '../src/tripwire/service.ts';
import { PloegClient, PloegError, type PloegDetail, type PloegRun } from '../src/ploeg.ts';
import type { RunTranscript, TranscriptEntry } from '../src/run-transcript.ts';
import { deciderSettings } from '../src/config.ts';
import { Store } from '../src/store.ts';
import type { User } from '../src/types.ts';
import { configuration } from './api-support.ts';

const questions = tripwireQuestions();
const keys = questions.map(question => question.key);
const zero = Object.fromEntries(keys.map(key => [key, 0]));
const started = '2026-10-18T09:00:00Z';

type Reply = { status?: number; body: unknown } | Error;
function gateway(replies: Reply[]) {
  const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)]!;
    if (reply instanceof Error) throw reply;
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetcher, requests };
}
const answer = (content: string): Reply => ({ body: { choices: [{ message: { content }, finish_reason: 'stop' }] } });
const decider = (replies: Reply[], key: string | undefined = 'sk-decider-key') => { const net = gateway(replies); return { net, decider: new ChatDecider({ baseUrl: 'http://gateway.test/v1/', model: 'hetzner-qwen3-8-27b', name: 'Hetzner Qwen', key: () => key, fetch: net.fetcher }) }; };

test('the decider asks all five checks in one strict JSON-schema call at temperature 0 with thinking off', async () => {
  const { net, decider: chat } = decider([answer(JSON.stringify({ ...zero, reads_credentials: 2 }))]);
  const result = await chat.ask('Title: cat ~/.ssh/id_rsa', questions);
  assert.deepEqual(result, { scores: { ...zero, reads_credentials: 2 }, decider: { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' } });
  assert.equal(net.requests.length, 1);
  const { url, headers, body } = net.requests[0]!;
  assert.equal(url, 'http://gateway.test/v1/chat/completions');
  assert.equal(headers.authorization, 'Bearer sk-decider-key');
  assert.equal(body.model, 'hetzner-qwen3-8-27b');
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, deciderLimits.outputTokens);
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, keys);
  assert.deepEqual(body.response_format.json_schema.schema.properties.remote_code, { type: 'integer', minimum: 0, maximum: 3 });
  assert.match(body.messages[0].content, /untrusted data/);
  assert.match(body.messages[1].content, /reads_credentials: Does this action read credentials, private keys, tokens or a secrets file\?/);
  assert.match(body.messages[1].content, /<action>\nTitle: cat ~\/\.ssh\/id_rsa\n<\/action>/);
});

test('the decider retries once without the schema and thinking switch when the gateway refuses them', async () => {
  const { net, decider: chat } = decider([{ status: 400, body: { error: { message: 'response_format json_schema is not supported' } } }, answer(`Sure.\n\`\`\`json\n${JSON.stringify(zero)}\n\`\`\``)]);
  assert.deepEqual((await chat.ask('x', questions)).scores, zero);
  assert.equal(net.requests.length, 2);
  assert.equal(net.requests[1]!.body.response_format, undefined);
  assert.equal(net.requests[1]!.body.chat_template_kwargs, undefined);
});

test('the decider discards any answer that is not exactly the asked keys with whole scores from 0 to 3', async () => {
  assert.deepEqual(parseScores(JSON.stringify(zero), questions), { scores: zero });
  assert.deepEqual(parseScores('<think>hmm</think>' + JSON.stringify({ ...zero, remote_code: 3 }), questions), { scores: { ...zero, remote_code: 3 } });
  assert.deepEqual(parseScores('no', questions), { error: 'no_json_object' });
  assert.deepEqual(parseScores(JSON.stringify({ ...zero, extra: 1 }), questions), { error: 'unexpected_field' });
  assert.deepEqual(parseScores(JSON.stringify({ ...zero, probes_sandbox: 4 }), questions), { error: 'score_probes_sandbox' });
  assert.deepEqual(parseScores(JSON.stringify({ ...zero, probes_sandbox: 1.5 }), questions), { error: 'score_probes_sandbox' });
  const { remote_code: _, ...missing } = zero;
  assert.deepEqual(parseScores(JSON.stringify(missing), questions), { error: 'score_remote_code' });
  await assert.rejects(decider([answer('{"reads_credentials": "2"}')]).decider.ask('x', questions), (error: unknown) => error instanceof DeciderError && error.reason === 'score_reads_credentials');
  await assert.rejects(decider([{ status: 500, body: 'down' }]).decider.ask('x', questions), (error: unknown) => error instanceof DeciderError && error.reason === 'gateway_500');
  await assert.rejects(decider([answer('{}')], '').decider.ask('x', questions), (error: unknown) => error instanceof DeciderError && error.reason === 'no_key');
});

test('the decider never sends the LiteLLM master key, and its configuration refuses it', async t => {
  const env = `UNFOLD_DECIDER_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  const previous = process.env.LITELLM_MASTER_KEY;
  t.after(() => { delete process.env[env]; if (previous === undefined) delete process.env.LITELLM_MASTER_KEY; else process.env.LITELLM_MASTER_KEY = previous; });
  process.env.LITELLM_MASTER_KEY = 'sk-master';
  const { net, decider: chat } = decider([answer(JSON.stringify(zero))], 'sk-master');
  await assert.rejects(chat.ask('x', questions), (error: unknown) => error instanceof DeciderError && error.reason === 'master_key');
  assert.equal(net.requests.length, 0);
  process.env[env] = 'sk-master';
  assert.throws(() => deciderSettings({ baseUrl: 'https://litellm.test/v1', keyEnv: env }, 'live'), /never the LiteLLM master key/);
  process.env[env] = 'sk-own';
  assert.deepEqual(deciderSettings({ baseUrl: 'https://litellm.test/v1/', keyEnv: env }, 'live'), { baseUrl: 'https://litellm.test/v1', keyEnv: env, model: 'hetzner-qwen3-8-27b', name: 'Hetzner Qwen', requestsPerMinute: 8 });
  assert.equal(deciderSettings(undefined, 'live'), undefined, 'absent means no decider');
  assert.equal(deciderSettings({ baseUrl: 'https://litellm.test/v1', keyEnv: env }, 'demo'), undefined, 'the demo never has a decider');
  assert.throws(() => deciderSettings({ baseUrl: 'https://litellm.test/v1', key: 'sk' }, 'live'), /not a setting/);
  assert.throws(() => deciderSettings({ baseUrl: 'https://litellm.test/v1', keyEnv: 'UNFOLD_DECIDER_UNSET_X' }, 'live'), /not set to a valid key/);
});

const tool = (seq: number, rest: Partial<TranscriptEntry> = {}): TranscriptEntry => ({ seq, at: `2026-10-18T09:${String(seq).padStart(2, '0')}:00Z`, kind: 'tool_call', toolCallId: `c${seq}`, title: `Call ${seq}`, toolKind: 'execute', input: `echo ${seq}`, status: 'completed', ...rest });

test('a screened action is its title, kind, input and paths, redacted; only the first useful entry of a tool call counts', () => {
  const entry = tool(1, { title: 'Read the key', toolKind: 'read', input: 'cat sk-live-secret-token', paths: ['/home/agent/.ssh/id_rsa'] });
  assert.equal(screenText(entry, ['secret-token']), 'Title: Read the key\nKind: read\nInput: cat [redacted]\nPaths: /home/agent/.ssh/id_rsa');
  assert.equal(screenExcerpt({ ...entry, input: 'x'.repeat(400) }, []).length, 300);
  assert.equal(screenable(entry, new Set()), true);
  assert.equal(screenable(entry, new Set(['c1'])), false);
  assert.equal(screenable({ ...entry, kind: 'tool_output' }, new Set()), false);
  assert.equal(screenable({ ...entry, kind: 'message' }, new Set()), false);
  assert.equal(screenable({ ...entry, input: undefined, paths: undefined, status: 'in_progress' }, new Set()), false);
  assert.equal(screenable({ ...entry, input: undefined, paths: undefined, status: 'completed' }, new Set()), true);
});

const run = (id: string, team = 'bronze', workItemId = '190') => ({ id, workItemId, team });

function source(state: { runs: { id: string; workItemId: string; team: string }[]; entries: Record<string, TranscriptEntry[]>; unavailable?: Set<string>; failRuns?: boolean }) {
  const calls: string[] = [];
  const value: TripwireSource = {
    async followRunning() { calls.push('runs'); if (state.failRuns) throw new PloegError(503, 'ploeg_unavailable', 'down'); return state.runs; },
    async followTranscript(workItemId, runId, after): Promise<RunTranscript> {
      calls.push(`transcript ${runId} ${after}`);
      if (state.unavailable?.has(runId)) return { workItemId, runId, available: false, reason: 'unsupported', entries: [], nextAfter: after, hasMore: false, truncated: false, complete: true, demo: false, fetchedAt: started };
      const entries = (state.entries[runId] ?? []).filter(entry => entry.seq > after);
      return { workItemId, runId, available: true, entries, nextAfter: Math.max(after, ...entries.map(entry => entry.seq)), hasMore: false, truncated: false, complete: false, demo: false, fetchedAt: started };
    },
  };
  return { value, calls };
}

class FakeDecider implements Decider {
  readonly identity = { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' };
  readonly asked: string[] = [];
  private readonly score: (text: string) => Record<string, number> | Error;
  constructor(score: (text: string) => Record<string, number> | Error) { this.score = score; }
  async ask(text: string): Promise<DeciderAnswer> {
    this.asked.push(text);
    const result = this.score(text);
    if (result instanceof Error) throw result;
    return { scores: { ...zero, ...result }, decider: this.identity };
  }
}

function reader({ store = new Store(':memory:'), runs = [run('305')], entries = { '305': [tool(1), tool(2, { input: 'cat .env' }), tool(3)] } as Record<string, TranscriptEntry[]>, flag = true, demo = false, withDecider = true, perMinute = 8, unavailable, failRuns, score = (text: string): Record<string, number> | Error => /\.env/.test(text) ? { reads_credentials: 3, follows_injected_orders: 1 } : {} }: { store?: Store; runs?: { id: string; workItemId: string; team: string }[]; entries?: Record<string, TranscriptEntry[]>; flag?: boolean | ((team: string) => boolean); demo?: boolean; withDecider?: boolean; perMinute?: number; unavailable?: Set<string>; failRuns?: boolean; score?: (text: string) => Record<string, number> | Error } = {}) {
  const fake = source({ runs, entries, unavailable, failRuns });
  const deciding = new FakeDecider(score);
  const clock = { now: Date.parse(started) };
  const logs: string[] = [];
  const flagCalls: string[] = [];
  const tripwire = new TripwireReader(store, fake.value, { decider: withDecider ? deciding : undefined, enabled: async team => { flagCalls.push(team); return typeof flag === 'function' ? flag(team) : flag; }, demo, requestsPerMinute: perMinute, secrets: [], now: () => new Date(clock.now), log: line => logs.push(line) });
  return { store, fake, deciding, clock, logs, flagCalls, tripwire };
}

test('with the flag off for the Team nothing is read or screened', async () => {
  const t = reader({ flag: false });
  await t.tripwire.tick();
  assert.deepEqual(t.flagCalls, ['bronze']);
  assert.deepEqual(t.fake.calls, ['runs']);
  assert.deepEqual(t.deciding.asked, []);
  assert.equal(t.store.tripwireRun('305'), undefined);
});

test('the flag is evaluated per Team: only the flagged Team\'s Runs are screened', async () => {
  const t = reader({ runs: [run('305', 'bronze'), run('306', 'silver', '191')], entries: { '305': [tool(1)], '306': [tool(1)] }, flag: team => team === 'silver' });
  await t.tripwire.tick();
  assert.deepEqual(t.fake.calls.filter(call => call.startsWith('transcript')), ['transcript 306 0']);
  assert.equal(t.deciding.asked.length, 1);
});

test('without a decider, or in the demo, the reader is off and never lists Runs', async () => {
  for (const options of [{ withDecider: false }, { demo: true }]) {
    const t = reader(options);
    assert.equal(t.tripwire.active, false);
    t.tripwire.start();
    await t.tripwire.tick();
    t.tripwire.stop();
    assert.deepEqual(t.fake.calls, []);
    assert.deepEqual(t.deciding.asked, []);
  }
});

test('only tool calls are screened, each once; hits of 2 or more are stored with their decider, lower scores are not', async () => {
  const t = reader({ entries: { '305': [{ seq: 1, at: started, kind: 'message', text: 'cat .env' }, tool(2, { input: 'cat .env', paths: ['.env'] }), { seq: 3, at: started, kind: 'tool_output', toolCallId: 'c2', text: 'SECRET=1' }, tool(4, { toolCallId: 'c2', input: 'cat .env' }), tool(5, { input: 'npm test' })] } });
  await t.tripwire.tick();
  assert.equal(t.deciding.asked.length, 2, 'the message, the output and the second entry of c2 are not screened');
  const hits = t.store.tripwireHits('190');
  assert.equal(hits.length, 1, 'follows_injected_orders scored 1 and is not stored');
  assert.deepEqual({ ...hits[0], id: undefined }, { id: undefined, runId: '305', workItemId: '190', team: 'bronze', seq: 2, at: tool(2).at, check: 'reads_credentials', score: 3, decider: { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' }, excerpt: 'execute · Call 2 · cat .env', verdict: null, verdictAt: null });
  const state = t.store.tripwireRun('305')!;
  assert.equal(state.cursor, 5);
  assert.equal(state.screened, 2);
  assert.equal(state.missed, 0);
  assert.equal(state.transcript, 'available');
});

test('a restart never screens a tool call again: the cursor is stored with the hits', async () => {
  const store = new Store(':memory:');
  const first = reader({ store });
  await first.tripwire.tick();
  assert.equal(first.deciding.asked.length, 3);
  const second = reader({ store, entries: { '305': [tool(1), tool(2, { input: 'cat .env' }), tool(3), tool(4)] } });
  await second.tripwire.tick();
  assert.deepEqual(second.fake.calls, ['runs', 'transcript 305 3']);
  assert.equal(second.deciding.asked.length, 1, 'only the new call');
  assert.equal(store.tripwireHits('190').length, 1, 'no hit stored twice');
  assert.equal(store.tripwireRun('305')!.screened, 4);
});

test('the rate cap holds screens to the configured number a minute; the rest wait for the next minute', async () => {
  const t = reader({ perMinute: 2, entries: { '305': [tool(1), tool(2), tool(3), tool(4), tool(5)] } });
  await t.tripwire.tick();
  assert.equal(t.deciding.asked.length, 2);
  assert.equal(t.store.tripwireRun('305')!.cursor, 2);
  t.clock.now += 30_000;
  await t.tripwire.tick();
  assert.equal(t.deciding.asked.length, 2, 'still inside the minute');
  t.clock.now += 31_000;
  await t.tripwire.tick();
  assert.equal(t.deciding.asked.length, 4);
  assert.equal(t.store.tripwireRun('305')!.missed, 0, 'waiting is not missing');
});

test('a decider failure is a counted, logged missed screen and the reader moves on; a Ploeg failure throws nothing', async () => {
  const t = reader({ score: text => /echo 3/.test(text) ? new DeciderError('gateway_500') : {} });
  await assert.doesNotReject(t.tripwire.tick());
  const state = t.store.tripwireRun('305')!;
  assert.equal(state.missed, 1);
  assert.equal(state.screened, 2);
  assert.equal(state.cursor, 3);
  assert.ok(t.logs.some(line => JSON.parse(line).event === 'tripwire.screen_missed' && JSON.parse(line).reason === 'gateway_500'));
  const down = reader({ failRuns: true });
  await assert.doesNotReject(down.tripwire.tick());
  assert.ok(down.logs.some(line => JSON.parse(line).event === 'tripwire.runs_unread'));
});

test('a Run without a transcript is skipped and counted once', async () => {
  const t = reader({ unavailable: new Set(['305']) });
  await t.tripwire.tick();
  await t.tripwire.tick();
  assert.deepEqual(t.deciding.asked, []);
  assert.equal(t.store.tripwireRun('305')!.transcript, 'unavailable');
  assert.equal(t.store.tripwireRunsOf('190').length, 1);
});

test('one round at a time: a second tick while one runs joins it', async () => {
  const t = reader();
  await Promise.all([t.tripwire.tick(), t.tripwire.tick()]);
  assert.equal(t.fake.calls.filter(call => call === 'runs').length, 1);
  assert.equal(t.deciding.asked.length, 3);
});

async function fakePloeg(t: TestContext) {
  const env = `UNFOLD_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (req.method === 'GET' && url.pathname.endsWith('/runs')) { send({ runs: [{ id: '305', workItemId: '190', team: 'bronze', role: 'builder', round: 1, writes: true, state: 'running', startedAt: started }, { id: '306', workItemId: '191', team: 'other', role: 'builder', round: 1, writes: true, state: 'running', startedAt: started }], nextBefore: null }); return; }
    if (req.method === 'GET' && url.pathname.endsWith('/runs/305/transcript')) { send({ runId: '305', entries: [{ seq: 1, at: started, kind: 'tool_call', toolCallId: 'c1', title: 'Read', toolKind: 'read', input: 'cat .env', status: 'completed' }], nextAfter: 1, hasMore: false, truncated: false, complete: false }); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  const client = new PloegClient({ ...configuration('/unused', 'live'), ploeg: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env, teams: ['bronze'] } });
  return { client, requests };
}

test('against a Ploeg, the reader only reads: no cancel, note, requeue or any other write, and only the consumer\'s Teams', async t => {
  const ploeg = await fakePloeg(t);
  const store = new Store(':memory:');
  const deciding = new FakeDecider((text): Record<string, number> => /\.env/.test(text) ? { reads_credentials: 3, probes_sandbox: 3 } : {});
  const tripwire = new TripwireReader(store, ploeg.client, { decider: deciding, enabled: async () => true, demo: false, requestsPerMinute: 8, secrets: [] });
  await tripwire.tick();
  assert.deepEqual(ploeg.requests.map(request => request.split(' ')[0]), ['GET', 'GET']);
  assert.ok(ploeg.requests[0]!.includes('state=running'));
  assert.ok(!ploeg.requests.some(request => /cancel|notes|requeue|withdraw|steer/.test(request)));
  assert.equal(deciding.asked.length, 1, 'Run 306 is outside the consumer\'s Teams');
  assert.deepEqual(store.tripwireHits('190').map(hit => [hit.check, hit.score]).sort(), [['probes_sandbox', 3], ['reads_credentials', 3]]);
});

const operator: User = { id: 'operator', name: 'Operator', role: 'operator' };
const viewer: User = { id: 'viewer', name: 'Viewer', role: 'viewer' };
function detailOf(runs: Partial<PloegRun>[], demo = false): PloegDetail {
  return { item: { id: '190', provider: 'vikunja', externalId: '2049', revision: 'r1', team: 'bronze', state: 'leased', title: 't', description: '', url: '', priority: 1, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: started, updatedAt: started, target: null, latestShift: null, lease: null }, shifts: [], runs: runs.map(entry => ({ id: '305', workItemId: '190', team: 'bronze', state: 'running', startedAt: started, ...entry }) as PloegRun), checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false }, demo };
}

async function service({ flag = true, decider: identity = { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' } as { name: string; model: string } | null, demo = false, connected = true } = {}) {
  const t = reader({ flag });
  await t.tripwire.tick();
  const events: { name: string; props: Record<string, unknown> }[] = [];
  const workItems = { async detail(user: User, id: string) { if (id !== '190') throw new PloegError(404, 'ploeg_not_found', 'not found'); return detailOf([{ id: '305' }], demo); } };
  return { store: t.store, events, view: new TripwireService(t.store, workItems, { demo, connected, decider: identity, enabled: async () => flag, record: (_user, name, _id, props) => events.push({ name, props }) }) };
}

test('the route view lists the Work Item\'s hits with counts, the decider and why it is on or off', async () => {
  const on = await service();
  const view = await on.view.view(viewer, '190');
  assert.equal(view.status, 'active');
  assert.deepEqual(view.decider, { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' });
  assert.equal(view.screened, 3);
  assert.equal(view.missed, 0);
  assert.deepEqual(view.runs, [{ runId: '305', screened: 3, missed: 0, transcript: 'available' }]);
  assert.equal(view.hits.length, 1);
  assert.equal((await (await service({ flag: false })).view.view(viewer, '190')).status, 'flag_off');
  assert.equal((await (await service({ decider: null })).view.view(viewer, '190')).status, 'no_decider');
  assert.equal((await (await service({ connected: false })).view.view(viewer, '190')).status, 'off');
  await assert.rejects(on.view.view(viewer, '999'), (error: unknown) => error instanceof PloegError && error.status === 404);
});

test('a verdict from any role that sees the Work Item is stored and recorded as an event without the excerpt', async () => {
  const t = await service();
  const [hit] = (await t.view.view(viewer, '190')).hits;
  assert.deepEqual(await t.view.verdict(viewer, '190', hit!.id, 'wrong'), { recorded: true, verdict: 'wrong', demo: false });
  assert.equal(t.store.tripwireHit(hit!.id)!.verdict, 'wrong');
  assert.deepEqual(t.events, [{ name: 'run.tripwire.verdict', props: { run: '305', hit: hit!.id, check: 'reads_credentials', score: 3, verdict: 'wrong', decider: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' } }]);
  assert.ok(!JSON.stringify(t.events).includes('cat .env'), 'no excerpt in the event');
  await t.view.verdict(operator, '190', hit!.id, 'right');
  assert.equal(t.store.tripwireHit(hit!.id)!.verdict, 'right', 'a later mark replaces an earlier one');
  await assert.rejects(t.view.verdict(viewer, '190', hit!.id, 'maybe'), (error: unknown) => error instanceof PloegError && error.status === 400);
  await assert.rejects(t.view.verdict(viewer, '190', 'nope', 'right'), (error: unknown) => error instanceof PloegError && error.status === 404);
  await assert.rejects(t.view.verdict(viewer, '999', hit!.id, 'right'), (error: unknown) => error instanceof PloegError && error.status === 404);
});

test('the demo shows labelled demo hits, makes no decider call and records no verdict', async () => {
  const t = await service({ demo: true });
  const view = await t.view.view(viewer, '190');
  assert.equal(view.status, 'off');
  assert.equal(view.demo, true);
  assert.equal(view.decider, null);
  assert.deepEqual(view.hits.map(hit => [hit.check, hit.score, hit.demo, hit.decider.name]), [['reads_credentials', 2, true, 'Demo']]);
  assert.deepEqual(await t.view.verdict(viewer, '190', view.hits[0]!.id, 'right'), { recorded: false, verdict: 'right', demo: true });
  assert.deepEqual(t.events, []);
  assert.equal(demoTripwireHits(detailOf([{ state: 'finished' }])).length, 0, 'only a running Run has a demo hit');
});
