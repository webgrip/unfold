import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { application, createSession, request } from './api-support.ts';
import { scaledTimeout } from './timeframes.ts';
import { FeedTranslator, TranscriptTranslator, runPlan } from '../extensions/acp-agent/lib/feed.mjs';
import { parsePrompt, reference } from '../extensions/acp-agent/lib/agent.mjs';
import { formAnswers, handOffRequest, questionForm, workItemOfSession, workSessionId } from '../extensions/acp-agent/lib/work.mjs';
import { credentialFile, signIn, storeCredential, storedCredential } from '../extensions/acp-agent/lib/credentials.mjs';

const agentBin = fileURLToPath(new URL('../extensions/acp-agent/bin/unfold-acp-agent.mjs', import.meta.url));
const registryEntry = fileURLToPath(new URL('../extensions/acp-agent/registry/unfold/agent.json', import.meta.url));
const registryIcon = fileURLToPath(new URL('../extensions/acp-agent/registry/unfold/icon.svg', import.meta.url));

type Message = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: any; result?: any; error?: { code: number; message: string } };
type PermissionAnswer = (params: any) => { outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string } };
type ElicitationAnswer = (params: any) => { action: 'accept'; content: Record<string, unknown> } | { action: 'decline' } | { action: 'cancel' };

async function until(check: () => boolean, what: string, ms = scaledTimeout(20_000)) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(done => setTimeout(done, 10));
  }
}

/** A fake ACP client: it starts the agent as an editor does and answers its permission prompts with `answer`. */
async function editor(url: string, env: Record<string, string> = {}) {
  const home = await mkdtemp(join(tmpdir(), 'unfold-acp-agent-'));
  const child = spawn(process.execPath, [agentBin], { env: { PATH: process.env.PATH ?? '', HOME: home, XDG_CONFIG_HOME: join(home, 'config'), UNFOLD_URL: url, UNFOLD_ACP_POLL_MS: '50', ...env }, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;
  const received: Message[] = [];
  const permissions: any[] = [];
  const elicitations: any[] = [];
  let answer: PermissionAnswer = () => ({ outcome: { outcome: 'cancelled' } });
  let elicited: ElicitationAnswer = () => ({ action: 'cancel' });
  let buffered = '';
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffered += chunk;
    let newline;
    while ((newline = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      const message = JSON.parse(line) as Message;
      received.push(message);
      if (message.method === 'session/request_permission') {
        permissions.push(message.params);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: answer(message.params) })}\n`);
      }
      if (message.method === 'elicitation/create') {
        elicitations.push(message.params);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: elicited(message.params) })}\n`);
      }
    }
  });
  let next = 1;
  const client = {
    home, received, permissions, elicitations, child,
    get stderr() { return stderr; },
    answerWith(handler: PermissionAnswer) { answer = handler; },
    elicitWith(handler: ElicitationAnswer) { elicited = handler; },
    send(method: string, params: unknown) {
      const id = next++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return id;
    },
    notify(method: string, params: unknown) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); },
    async call(method: string, params: unknown) {
      const id = client.send(method, params);
      await until(() => received.some(entry => entry.id === id && !entry.method), `${method} answer`);
      return received.find(entry => entry.id === id && !entry.method)!;
    },
    /** Sends a prompt and answers the text the agent streamed for it, with the updates and the stop reason. */
    async prompt(sessionId: string, text: string) {
      const from = received.length;
      const answered = await client.call('session/prompt', { sessionId, prompt: [{ type: 'text', text }] });
      const updates = received.slice(from).filter(entry => entry.method === 'session/update' && entry.params.sessionId === sessionId).map(entry => entry.params.update);
      const said = updates.filter(update => update.sessionUpdate === 'agent_message_chunk').map(update => update.content.text).join('');
      return { answered, updates, said };
    },
    async close() {
      child.stdin.end();
      if (child.exitCode === null) await once(child, 'exit');
      await rm(home, { recursive: true, force: true });
    },
  };
  return client;
}

async function start(client: Awaited<ReturnType<typeof editor>>, capabilities: Record<string, unknown> = {}) {
  const initialized = await client.call('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, ...capabilities }, clientInfo: { name: 'fake-phpstorm', version: '2026.3' } });
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error));
  return initialized.result;
}

test('an ACP client follows, asks about and watches Unfold work against the demo, which says it is a demo and spends nothing', async t => {
  const demo = await application(); t.after(() => demo.close());
  const client = await editor(demo.url); t.after(() => client.close());
  const initialized = await start(client);
  assert.equal(initialized.protocolVersion, 1);
  assert.equal(initialized.agentInfo.name, 'unfold');
  assert.deepEqual(initialized.authMethods.map((method: any) => [method.id, method.type, method.args]), [['unfold-sign-in', 'terminal', ['login']]]);
  const waitingBefore = (await request(demo.url, '/api/ploeg/now')).body.waiting.map((item: any) => `${item.id}:${item.state}`);

  const created = await client.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  const sessionId = created.result.sessionId;
  assert.deepEqual(created.result.modes.availableModes.map((mode: any) => mode.id), ['ask', 'steer']);
  assert.equal(created.result.modes.currentModeId, 'ask');
  const picker = created.result.configOptions[0];
  assert.equal(picker.id, 'work-item');
  assert.equal(picker.currentValue, 'none');
  assert(picker.options.some((option: any) => option.value === '111'), 'Work Items that wait for the person are offered');
  await until(() => client.received.some(entry => entry.params?.update?.sessionUpdate === 'available_commands_update'), 'the command list');

  const first = await client.prompt(sessionId, 'hello');
  assert.equal(first.answered.result.stopReason, 'end_turn');
  assert.match(first.said, /illustrative demo: nothing runs and nothing is spent/);
  assert.match(first.said, /#111/);
  assert.match(first.said, /follows no Work Item yet/);

  const bound = await client.prompt(sessionId, '/work 101');
  assert.match(bound.said, /Work Item #101/);
  assert.match(bound.said, /demo, nothing spent/);
  assert(bound.updates.some(update => update.sessionUpdate === 'session_info_update' && /#101/.test(update.title)), 'the session is titled after its Work Item');

  const asked = await client.prompt(sessionId, 'Why did it stop?');
  assert.match(asked.said, /waiting for a person/);
  assert.match(asked.said, /not sent to the team · demo, no model call, nothing spent/);
  const offRecord = await client.prompt(sessionId, '/ask Write me a poem about the moon');
  assert.match(offRecord.said, /cannot answer this one/);
  assert.equal(client.permissions.length, 0, 'the demo never asks to spend: it has no model');

  const steered = await client.prompt(sessionId, '/steer use the shared rounding helper');
  assert.match(steered.said, /Nothing runs Work Item 101 now/);
  assert.match(steered.said, /waits for a person/);

  const followed = await client.prompt(sessionId, '/watch');
  assert.equal(followed.answered.result.stopReason, 'end_turn');
  assert.match(followed.said, /Work Item #101 needs you/);
  assert(followed.updates.some(update => update.sessionUpdate === 'plan' && update.entries.length), 'the Work Item\'s Runs arrive as the plan');

  const proposed = await client.prompt(sessionId, '/propose Add VAT per line to the invoice PDF');
  assert.match(proposed.said, /nothing was admitted and nothing runs/);
  assert.deepEqual((await request(demo.url, '/api/ploeg/now')).body.waiting.map((item: any) => `${item.id}:${item.state}`), waitingBefore, 'an editor delegation never admits work');

  const workbench = await createSession(demo.url);
  assert.equal((await request(demo.url, `/api/sessions/${workbench.id}/start`, { method: 'POST' })).status, 200);
  await client.prompt(sessionId, `/work ${demo.url}/#session/${workbench.id}`);
  const watched = await client.prompt(sessionId, '/watch');
  assert.equal(watched.answered.result.stopReason, 'end_turn');
  assert.match(watched.said, /DEMO: this deterministic runtime uses no model/);
  assert(watched.updates.some(update => update.sessionUpdate === 'tool_call' && /node --test/.test(update.title) && update.kind === 'execute'), 'tool calls from the feed arrive as ACP tool calls');
  assert(watched.updates.some(update => update.sessionUpdate === 'tool_call_update' && update.status === 'failed' && watched.updates.some(call => call.sessionUpdate === 'tool_call' && call.toolCallId === update.toolCallId && call.status === 'in_progress')), 'the baseline check that was running is updated when it fails, as the demo intends');
  assert.match(watched.said, /The session is (completed|failed)|preparing the result for review/);
  assert(!client.received.some(entry => entry.params?.update?.sessionUpdate === 'usage_update'), 'the demo reports no spend');
});

test('a cancelled watch ends the prompt turn and leaves the session running', async t => {
  const demo = await application(); t.after(() => demo.close());
  const client = await editor(demo.url); t.after(() => client.close());
  await start(client);
  const { result } = await client.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] });
  const workbench = await createSession(demo.url, { overrides: { title: 'Slow demo' } });
  await client.prompt(result.sessionId, `/work ${workbench.id}`);
  const id = client.send('session/prompt', { sessionId: result.sessionId, prompt: [{ type: 'text', text: '/watch' }] });
  await new Promise(done => setTimeout(done, scaledTimeout(200)));
  client.notify('session/cancel', { sessionId: result.sessionId });
  await until(() => client.received.some(entry => entry.id === id && !entry.method), 'the cancelled prompt');
  assert.equal(client.received.find(entry => entry.id === id && !entry.method)!.result.stopReason, 'cancelled');
  assert.notEqual((await request(demo.url, `/api/sessions/${workbench.id}`)).body.status, 'cancelled', 'ACP cancel only stops following');
});

type Seen = { method: string; path: string; auth: string; confirmation: string; client: string; body: any };

async function fakeUnfold(token: string) {
  const seen: Seen[] = [];
  const state = { sessionStatus: 'waiting_input', permissionResolved: false, permissionKind: 'permission', history: [{ id: 1, sessionId: 's1', type: 'message', at: '', actor: 'builder', data: { role: 'assistant', text: 'Running the checks.', partId: 'p1' } }, { id: 2, sessionId: 's1', type: 'permission', at: '', actor: 'builder', data: { requestId: 'r1' } }] };
  const session = () => ({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', title: 'Fix rounding', objective: 'Fix rounding', ownerId: 'u1', status: state.sessionStatus, spentUsd: 0.4, budgetUsd: 3, execution: { workItemId: '7' } });
  const body = async (req: IncomingMessage) => { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer); const text = Buffer.concat(chunks).toString('utf8'); return text ? JSON.parse(text) : undefined; };
  const server = createServer(async (req, res) => {
    const path = String(req.url);
    const data = await body(req);
    seen.push({ method: String(req.method), path, auth: String(req.headers.authorization ?? ''), confirmation: String(req.headers['x-unfold-confirmation'] ?? ''), client: String(req.headers['x-unfold-client'] ?? ''), body: data });
    const send = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: { code: 'unauthenticated', message: 'Sign in.' } });
    if (path === '/api/bootstrap') return send(200, { user: { id: 'u1', name: 'Dev', role: 'operator' }, mode: 'live', teams: [{ id: 'shop' }] });
    if (path === '/api/ploeg/now') return send(200, { demo: false, waiting: [{ id: '7', state: 'active', team: 'shop', title: 'Round VAT per line' }] });
    if (path === '/api/ploeg/work-items/7') return send(200, { item: { id: '7', title: 'Round VAT per line', state: 'active', team: 'shop', attempts: 1 }, shifts: [{ id: '3', spentUsd: 0.4, closedAt: null }] });
    if (path === '/api/sessions') return send(200, [session()]);
    if (path === `/api/sessions/${session().id}`) return send(200, session());
    if (path.startsWith(`/api/sessions/${session().id}/history`)) return send(200, Number(new URL(path, 'http://x').searchParams.get('after')) === 0 ? state.history : []);
    if (path === `/api/sessions/${session().id}/permissions`) return send(200, [state.permissionKind === 'question'
      ? { id: 'r1', sessionId: session().id, runId: 'run1', kind: 'question', title: 'Agent needs your answer', detail: 'Which rounding?', questions: [{ question: 'Round VAT per line or per total?', header: 'Rounding', options: [{ label: 'per line' }, { label: 'per total' }] }, { question: 'Anything else?' }], resolved: state.permissionResolved }
      : { id: 'r1', sessionId: session().id, runId: 'run1', kind: 'permission', title: 'bash: composer test', detail: 'Runs the PHPUnit suite', resolved: state.permissionResolved }]);
    if (path === `/api/sessions/${session().id}/permissions/r1`) { state.permissionResolved = true; state.sessionStatus = 'completed'; return send(200, session()); }
    if (path === `/api/sessions/${session().id}/messages`) { state.sessionStatus = 'completed'; return send(200, session()); }
    if (path === '/api/ploeg/work-items/7/asks' && req.method === 'GET') return send(200, { asks: [], allowance: { asksEnabled: true, askBudgetUsd: 0.05, remainingUsd: 4.2, limitUsd: 5, resetAt: '2026-11-01T00:00:00Z' } });
    if (path === '/api/ploeg/work-items/7/asks' && data?.recordOnly) return send(422, { error: { code: 'ask_needs_model', message: 'The record does not answer this.' } });
    if (path === '/api/ploeg/work-items/7/asks' && data?.askModel) return send(201, { status: 'answered', answer: 'Because the helper rounds per total.', source: 'model', costUsd: 0.0021, costStatus: 'observed', demo: false });
    send(404, { error: { code: 'not_found', message: 'Not found.' } });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, seen, state, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

test('without a credential the agent answers auth_required, and with one it acts as that person', async t => {
  const token = `vle_${'k'.repeat(43)}`;
  const unfold = await fakeUnfold(token); t.after(() => unfold.close());
  const anonymous = await editor(unfold.url); t.after(() => anonymous.close());
  await start(anonymous);
  const refused = await anonymous.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] });
  assert.equal(refused.error?.code, -32000);
  assert.match(refused.error!.message, /unfold-acp-agent login/);
  await storeCredential(unfold.url, { token, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), user: 'Dev' }, credentialFile({ XDG_CONFIG_HOME: join(anonymous.home, 'config') }));
  const authenticated = await anonymous.call('authenticate', { methodId: 'unfold-sign-in' });
  assert.equal(authenticated.error, undefined, JSON.stringify(authenticated.error));
  assert.equal((await anonymous.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] })).error, undefined);
  assert(unfold.seen.filter(entry => entry.auth).every(entry => entry.client === 'unfold-acp-agent'), 'every call names the client for the action record');
  assert(!anonymous.stderr.includes(token), 'the token never reaches the editor log');
});

test('a model Ask, a steer and a harness permission each wait for the person, and a permission offers allow and deny only', async t => {
  const token = `vle_${'m'.repeat(43)}`;
  const unfold = await fakeUnfold(token); t.after(() => unfold.close());
  const client = await editor(unfold.url, { UNFOLD_TOKEN: token }); t.after(() => client.close());
  await start(client);
  const { result } = await client.call('session/new', { cwd: '/home/dev/shop', mcpServers: [], _meta: { unfold: { workItem: '7' } } });
  assert.equal(result.configOptions[0].currentValue, '7', 'the Work Item named at session/new is bound');

  client.answerWith(() => ({ outcome: { outcome: 'selected', optionId: 'deny' } }));
  const declined = await client.prompt(result.sessionId, 'Why is the VAT per total?');
  assert.match(declined.said, /Not asked: you did not confirm the spend. Nothing was spent./);
  assert.equal(unfold.seen.filter(entry => entry.body?.askModel).length, 0, 'no model is asked without a yes');
  assert.match(client.permissions[0].toolCall.content[0].content.text, /spends up to US\$0\.05 from Team shop's Ask Allowance \(US\$4\.20 left/);

  client.answerWith(() => ({ outcome: { outcome: 'selected', optionId: 'allow' } }));
  const answered = await client.prompt(result.sessionId, 'Why is the VAT per total?');
  assert.match(answered.said, /Because the helper rounds per total/);
  assert.match(answered.said, /US\$0\.00 from the Ask Allowance, not final yet/);
  const spent = unfold.seen.find(entry => entry.body?.askModel)!;
  assert.match(spent.confirmation, /^[A-Za-z0-9_-]{1,100}:[0-9a-f]{64}$/, 'the spend carries the confirmation Unfold records');

  client.answerWith(params => {
    assert.deepEqual(params.options.map((option: any) => option.kind), ['allow_once', 'reject_once'], 'never "always allow"');
    return { outcome: { outcome: 'selected', optionId: 'allow' } };
  });
  const watched = await client.prompt(result.sessionId, '/watch');
  assert.match(watched.said, /Running the checks/);
  const relayed = client.permissions.at(-1);
  assert.match(relayed.toolCall.title, /bash: composer test/);
  assert.match(relayed.toolCall.content[0].content.text, /The agent wrote this request; Unfold did not check it/);
  const decided = unfold.seen.find(entry => entry.path.endsWith('/permissions/r1'))!;
  assert.deepEqual(decided.body, { decision: 'once' });
  assert.match(decided.confirmation, /:[0-9a-f]{64}$/);

  unfold.state.sessionStatus = 'running';
  client.answerWith(() => ({ outcome: { outcome: 'cancelled' } }));
  const kept = await client.prompt(result.sessionId, '/steer use bcmath');
  assert.match(kept.said, /Not sent: you did not confirm/);
  assert.equal(unfold.seen.filter(entry => entry.path.endsWith('/messages')).length, 0);
  client.answerWith(() => ({ outcome: { outcome: 'selected', optionId: 'allow' } }));
  await client.call('session/set_mode', { sessionId: result.sessionId, modeId: 'steer' });
  const sent = await client.prompt(result.sessionId, 'use bcmath');
  assert.match(sent.said, /Sent\. The session is completed/);
  assert.deepEqual(unfold.seen.find(entry => entry.path.endsWith('/messages'))!.body, { text: 'use bcmath' });
});

test('a permission prompt the person closes leaves the request waiting in Unfold', async t => {
  const token = `vle_${'w'.repeat(43)}`;
  const unfold = await fakeUnfold(token); t.after(() => unfold.close());
  const client = await editor(unfold.url, { UNFOLD_TOKEN: token, UNFOLD_WORK_ITEM: '7' }); t.after(() => client.close());
  await start(client);
  const { result } = await client.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] });
  client.answerWith(() => ({ outcome: { outcome: 'cancelled' } }));
  const watched = await client.prompt(result.sessionId, '/watch');
  assert.equal(watched.answered.result.stopReason, 'end_turn');
  assert.match(watched.said, /Not answered; the request still waits/);
  assert.equal(unfold.seen.filter(entry => entry.path.includes('/permissions/')).length, 0, 'no decision reaches Unfold');
});

test('a workbench session\'s question arrives as a form elicitation, and only a submitted form answers it', async t => {
  const token = `vle_${'q'.repeat(43)}`;
  const unfold = await fakeUnfold(token); t.after(() => unfold.close());
  unfold.state.permissionKind = 'question';
  const client = await editor(unfold.url, { UNFOLD_TOKEN: token, UNFOLD_WORK_ITEM: '7' }); t.after(() => client.close());
  await start(client, { elicitation: { form: {} } });
  const { result } = await client.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] });
  client.elicitWith(() => ({ action: 'decline' }));
  const declined = await client.prompt(result.sessionId, '/watch');
  assert.match(declined.said, /Not answered; the question still waits/);
  assert.equal(unfold.seen.filter(entry => entry.path.includes('/permissions/')).length, 0, 'a declined form is not an answer');
  const form = client.elicitations[0];
  assert.equal(form.mode, 'form');
  assert.equal(form.sessionId, result.sessionId);
  assert.deepEqual(form.requestedSchema.properties.q0.oneOf, [{ const: 'per line', title: 'per line' }, { const: 'per total', title: 'per total' }]);
  assert.equal(form.requestedSchema.properties.q1.type, 'string');
  client.elicitWith(() => ({ action: 'accept', content: { q0: 'per line', q1: '' } }));
  const answered = await client.prompt(result.sessionId, '/watch');
  assert.match(answered.said, /Answer sent to the agent/);
  const sent = unfold.seen.find(entry => entry.path.endsWith('/permissions/r1'))!;
  assert.deepEqual(sent.body, { answers: [['per line'], []] });
  assert.match(sent.confirmation, /:[0-9a-f]{64}$/);
});

/** A fake Unfold in front of Ploeg-run work: a person's waiting and handed-off Work Items, their Runs, transcripts, questions and pull requests. */
async function fakePloeg(token: string) {
  const seen: Seen[] = [];
  const pullRequest = { url: 'https://forge.test/shop/app/pulls/12', number: 12 };
  const items: Record<string, any> = {
    21: { item: { id: '21', title: 'Fix VAT rounding', state: 'needs_human', team: 'shop', updatedAt: '2026-10-30T10:00:00Z', latestShift: { budgetUsd: 2 } }, shifts: [{ id: '1', spentUsd: 0.75, budgetUsd: 2, closedAt: '2026-10-30T10:00:00Z' }], runs: [{ id: '4', role: 'builder', round: 1, state: 'finished', outcome: 'needs_human' }], questions: [{ id: 'q1', to: 'person', waitingForPerson: true, role: 'builder', round: 1, text: 'Round per line or per total?' }], resume: { fromRound: 1, askedRound: 1, roundCapUsd: 1.5, poolUsd: 3, ready: false, waitingQuestionIds: ['q1'] } },
    22: { item: { id: '22', title: 'Invoice PDF shows VAT per line', state: 'active', team: 'shop', updatedAt: '2026-10-30T11:00:00Z' }, shifts: [{ id: '2', spentUsd: 1.25, closedAt: null }], runs: [{ id: '5', role: 'builder', round: 1, state: 'running' }] },
    30: { item: { id: '30', title: 'Approved proposal', state: 'awaiting_review', team: 'shop', updatedAt: '2026-10-29T09:00:00Z', pullRequest }, shifts: [{ id: '3', spentUsd: 0.5, closedAt: '2026-10-29T09:00:00Z' }], runs: [] },
  };
  const state = { detailReads: {} as Record<string, number>, handedOff: false, task43Assigned: [] as string[] };
  const transcript = [
    { seq: 1, at: '2026-10-30T11:00:01Z', kind: 'message', text: 'Reading the invoice template.' },
    { seq: 2, at: '2026-10-30T11:00:02Z', kind: 'tool_call', toolCallId: 'c1', title: 'composer test', toolKind: 'execute', status: 'in_progress' },
    { seq: 3, at: '2026-10-30T11:00:03Z', kind: 'tool_output', toolCallId: 'c1', text: 'OK (12 tests)' },
  ];
  const body = async (req: IncomingMessage) => { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer); const text = Buffer.concat(chunks).toString('utf8'); return text ? JSON.parse(text) : undefined; };
  const server = createServer(async (req, res) => {
    const url = new URL(String(req.url), 'http://x');
    const path = url.pathname;
    const data = await body(req);
    seen.push({ method: String(req.method), path: String(req.url), auth: String(req.headers.authorization ?? ''), confirmation: String(req.headers['x-unfold-confirmation'] ?? ''), client: String(req.headers['x-unfold-client'] ?? ''), body: data });
    const send = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: { code: 'unauthenticated', message: 'Sign in.' } });
    if (path === '/api/bootstrap') return send(200, { user: { id: 'u1', name: 'Dev', role: 'operator' }, mode: 'live', teams: [{ id: 'shop' }] });
    if (path === '/api/ploeg/now') return send(200, { demo: false, waiting: [{ id: '21', state: items[21].item.state, team: 'shop', title: 'Fix VAT rounding', updatedAt: '2026-10-30T10:00:00Z' }] });
    if (path === '/api/actions') return send(200, { actions: [
      { id: 3, action: 'POST /api/ploeg/work-items/:id/notes', target: { kind: 'work-item', id: '99' }, inputs: {}, outcome: 'done' },
      { id: 2, action: 'POST /api/task-sources/board/tasks/:id/handoff', target: { kind: 'task', id: 'board:42' }, inputs: { team: 'shop' }, outcome: 'done' },
      { id: 1, action: 'POST /api/ploeg/work-items/:id/approve', target: { kind: 'work-item', id: '30' }, inputs: {}, outcome: 'done' },
    ], nextBefore: null });
    if (path === '/api/sessions') return send(200, []);
    if (path === '/api/task-sources') return send(200, [{ id: 'board', name: 'Board', handoff: true }]);
    if (path === '/api/task-sources/board/tasks/42/ploeg') return send(200, { available: true, demo: false, handoff: { allowed: true }, teams: [], assignedTeams: ['shop'], workItems: [{ id: '22', team: 'shop', state: items[22].item.state, updatedAt: '2026-10-30T11:00:00Z' }, { id: '8', team: 'other', state: 'done', updatedAt: '2026-01-01T00:00:00Z' }] });
    if (path === '/api/task-sources/board/tasks/43') return send(200, { id: '43', title: 'Add a credit note', revision: 'r1' });
    if (path === '/api/task-sources/board/tasks/43/ploeg') return send(200, { available: true, demo: false, handoff: { allowed: true }, teams: [{ id: 'shop', assignee: 'ploeg-shop' }], assignedTeams: state.task43Assigned, workItems: state.handedOff ? [{ id: '9', team: 'shop', state: 'done' }, { id: '30', team: 'shop', state: 'awaiting_review', updatedAt: '2026-10-30T12:00:00Z' }] : [{ id: '9', team: 'shop', state: 'done' }] });
    if (path === '/api/task-sources/board/tasks/43/handoff') { state.handedOff = true; state.task43Assigned = ['shop']; return send(200, { assignedTeams: ['shop'], warnings: [] }); }
    const detail = /^\/api\/ploeg\/work-items\/(\d+)$/.exec(path);
    if (detail && items[detail[1]]) {
      state.detailReads[detail[1]] = (state.detailReads[detail[1]] ?? 0) + 1;
      if (detail[1] === '22' && state.detailReads[22] === 4) { items[22].item = { ...items[22].item, state: 'awaiting_review', pullRequest }; items[22].shifts[0].spentUsd = 1.9; items[22].runs = [{ id: '5', role: 'builder', round: 1, state: 'finished', outcome: 'pr_opened' }]; }
      return send(200, items[detail[1]]);
    }
    if (path === '/api/ploeg/work-items/22/runs/5/transcript') {
      const after = Number(url.searchParams.get('after'));
      const entries = transcript.filter(entry => entry.seq > after);
      return send(200, { available: true, entries, nextAfter: entries.at(-1)?.seq ?? after, hasMore: false, complete: items[22].runs[0].state === 'finished', demo: false });
    }
    if (path === '/api/ploeg/work-items/21/questions/q1/answer') { items[21].questions[0].waitingForPerson = false; return send(200, { ok: true }); }
    if (path === '/api/ploeg/work-items/21/requeue') { items[21].item = { ...items[21].item, state: 'awaiting_review', pullRequest }; items[21].questions = []; return send(200, { state: 'queued', resumed: true, fromRound: 1 }); }
    send(404, { error: { code: 'not_found', message: 'Not found.' } });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, seen, items, state, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

test('session/list offers the Work Items the person handed off or that wait for them, and a resumed one streams its Runs, its spend and its ready pull request', async t => {
  const token = `vle_${'l'.repeat(43)}`;
  const unfold = await fakePloeg(token); t.after(() => unfold.close());
  const client = await editor(unfold.url, { UNFOLD_TOKEN: token }); t.after(() => client.close());
  const initialized = await start(client);
  assert.deepEqual(initialized.agentCapabilities.sessionCapabilities, { list: {}, resume: {}, close: {} });

  const listed = await client.call('session/list', { cwd: '/home/dev/shop' });
  assert.equal(listed.error, undefined, JSON.stringify(listed.error));
  const sessions = listed.result.sessions;
  assert.deepEqual(sessions.map((entry: any) => entry.sessionId), ['unfold-work-22', 'unfold-work-21', 'unfold-work-30'], 'newest first; a note is not a hand-off and another Team\'s Work Item is not the person\'s');
  assert(sessions.every((entry: any) => entry.cwd === '/home/dev/shop'));
  assert.match(sessions[0].title, /#22 running · Invoice PDF shows VAT per line/);
  assert.deepEqual(sessions[1]._meta.unfold, { workItem: '21', state: 'needs_human', team: 'shop', waitsForYou: true, handedOff: false, pullRequestUrl: null, link: `${unfold.url}/#work/21` });
  assert.equal(sessions[2]._meta.unfold.pullRequestUrl, 'https://forge.test/shop/app/pulls/12');

  const resumed = await client.call('session/resume', { sessionId: 'unfold-work-22', cwd: '/home/dev/shop', mcpServers: [] });
  assert.equal(resumed.error, undefined, JSON.stringify(resumed.error));
  assert.equal(resumed.result.configOptions[0].currentValue, '22');
  await until(() => client.received.some(entry => entry.params?.sessionId === 'unfold-work-22' && entry.params.update.sessionUpdate === 'usage_update'), 'the spend after resume');
  assert.deepEqual(client.received.find(entry => entry.params?.update?.sessionUpdate === 'usage_update')!.params.update, { sessionUpdate: 'usage_update', used: 0, size: 0, cost: { amount: 1.25, currency: 'USD' }, _meta: { unfold: { workItem: '22', contextWindow: false } } });

  const watched = await client.prompt('unfold-work-22', '/watch');
  assert.equal(watched.answered.result.stopReason, 'end_turn');
  assert(watched.updates.some(update => update.sessionUpdate === 'plan' && update.entries[0].content === 'Round 1 · builder' && update.entries[0].status === 'in_progress'), 'the running Run is the plan\'s step in progress');
  assert(watched.updates.some(update => update.sessionUpdate === 'plan' && update.entries[0].status === 'completed'), 'and completes with it');
  assert.match(watched.said, /Reading the invoice template/);
  assert(watched.updates.some(update => update.sessionUpdate === 'tool_call' && update.toolCallId === '5:c1' && update.kind === 'execute'));
  assert(watched.updates.some(update => update.sessionUpdate === 'tool_call_update' && update.toolCallId === '5:c1' && update.content[0].content.text === 'OK (12 tests)'));
  assert(watched.updates.some(update => update.sessionUpdate === 'usage_update' && update.cost.amount === 1.9), 'the spend is reported again when it grows');
  assert.match(watched.said, /The pull request for Work Item #22 is ready for your review:\*\* https:\/\/forge\.test\/shop\/app\/pulls\/12/);
  assert.match(watched.said, /Spent US\$1\.90 over 1 Shift/);
  assert.equal(unfold.seen.filter(entry => entry.method === 'POST').length, 0, 'following never changes anything');

  assert.equal((await client.call('session/resume', { sessionId: 'unfold-work-404', cwd: '/home/dev/shop' })).error?.code, -32602);
  assert.equal((await client.call('session/close', { sessionId: 'unfold-work-22' })).error, undefined);
  assert.equal((await client.call('session/prompt', { sessionId: 'unfold-work-22', prompt: [{ type: 'text', text: '/now' }] })).error?.code, -32602, 'a closed session is gone');
});

test('a question a handed-off Work Item waits on arrives as a form elicitation; a dismissed form is not an answer, a submitted one resumes the Round', async t => {
  const token = `vle_${'e'.repeat(43)}`;
  const unfold = await fakePloeg(token); t.after(() => unfold.close());
  const client = await editor(unfold.url, { UNFOLD_TOKEN: token }); t.after(() => client.close());
  await start(client, { elicitation: { form: {} } });
  await client.call('session/resume', { sessionId: 'unfold-work-21', cwd: '/home/dev/shop' });

  client.elicitWith(() => ({ action: 'cancel' }));
  const dismissed = await client.prompt('unfold-work-21', '/watch');
  assert.match(dismissed.said, /Not answered; the question stays open/);
  const form = client.elicitations[0];
  assert.equal(form.sessionId, 'unfold-work-21');
  assert.match(form.message, /Question: "Round per line or per total\?"/);
  assert.match(form.message, /Ploeg resumes Round 1 on the same branch: this Round up to US\$1\.50, in total up to US\$3\.00, from Team shop's budget/);
  assert.deepEqual(form.requestedSchema.required, ['answer']);
  assert.equal(unfold.seen.filter(entry => entry.method === 'POST').length, 0, 'a dismissed form answers nothing');

  client.elicitWith(() => ({ action: 'accept', content: { answer: 'Per line, as the tax office wants.' } }));
  const answered = await client.prompt('unfold-work-21', '/watch');
  const answer = unfold.seen.find(entry => entry.path.endsWith('/questions/q1/answer'))!;
  assert.equal(answer.body.answer, 'Per line, as the tax office wants.');
  assert.match(answer.confirmation, /:[0-9a-f]{64}$/, 'the submitted form is the confirmation Unfold records');
  const requeue = unfold.seen.find(entry => entry.path.endsWith('/requeue'))!;
  assert.equal(requeue.body.resume, true);
  assert.equal(requeue.body.expectedState, 'needs_human');
  assert.match(answered.said, /Answered and resumed Work Item 21 from Round 1/);
  assert.match(answered.said, /The pull request for Work Item #21 is ready for your review/);
});

test('without form elicitation a question is answered with /answer after the person allows what it spends', async t => {
  const token = `vle_${'a'.repeat(43)}`;
  const unfold = await fakePloeg(token); t.after(() => unfold.close());
  const client = await editor(unfold.url, { UNFOLD_TOKEN: token, UNFOLD_WORK_ITEM: '21' }); t.after(() => client.close());
  await start(client);
  const { result } = await client.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] });
  const asked = await client.prompt(result.sessionId, '/watch');
  assert.match(asked.said, /Answer it here with `\/answer <your answer>`/);
  assert.equal(client.elicitations.length, 0, 'no elicitation for a client that did not offer forms');
  client.answerWith(() => ({ outcome: { outcome: 'selected', optionId: 'deny' } }));
  const refused = await client.prompt(result.sessionId, '/answer Per line');
  assert.match(refused.said, /Not answered: you did not confirm/);
  assert.equal(unfold.seen.filter(entry => entry.method === 'POST').length, 0);
  client.answerWith(() => ({ outcome: { outcome: 'selected', optionId: 'allow' } }));
  const sent = await client.prompt(result.sessionId, '/answer Per line');
  assert.match(client.permissions.at(-1).toolCall.content[0].content.text, /Ploeg resumes Round 1/);
  assert.equal(unfold.seen.find(entry => entry.path.endsWith('/questions/q1/answer'))!.body.answer, 'Per line');
  assert.match(sent.said, /Answered and resumed Work Item 21/);
  assert.match(sent.said, /ready for your review/);
});

test('"hand off <task> to <Team>" hands a tracker task over after the person allows it, then follows the Work Item Ploeg makes of it', async t => {
  const token = `vle_${'h'.repeat(43)}`;
  const unfold = await fakePloeg(token); t.after(() => unfold.close());
  const client = await editor(unfold.url, { UNFOLD_TOKEN: token }); t.after(() => client.close());
  await start(client);
  const { result } = await client.call('session/new', { cwd: '/home/dev/shop', mcpServers: [] });
  client.answerWith(() => ({ outcome: { outcome: 'cancelled' } }));
  const kept = await client.prompt(result.sessionId, 'hand off board/43 to shop');
  assert.match(kept.said, /Not handed off: you did not confirm/);
  assert.equal(unfold.seen.filter(entry => entry.method === 'POST').length, 0, 'a dismissed prompt hands nothing off');
  assert.match(client.permissions[0].toolCall.content[0].content.text, /Hand task board\/43 "Add a credit note" to Team shop\? Unfold assigns the Team's tracker user ploeg-shop/);

  client.answerWith(() => ({ outcome: { outcome: 'selected', optionId: 'allow' } }));
  const handed = await client.prompt(result.sessionId, '/handoff 43 shop');
  assert.match(handed.said, /Handed task board\/43 to Team shop/);
  const call = unfold.seen.find(entry => entry.path.endsWith('/handoff'))!;
  assert.deepEqual(call.body, { team: 'shop', revision: 'r1' });
  assert.match(call.confirmation, /:[0-9a-f]{64}$/);
  assert.equal(call.client, 'unfold-acp-agent');

  const followed = await client.prompt(result.sessionId, '/watch');
  assert.match(followed.said, /Ploeg picked up task board\/43 as Work Item #30 for Team shop/);
  assert.match(followed.said, /The pull request for Work Item #30 is ready for your review/);
});

test('the editor sign-in names the agent, keeps the credential for the user alone and forgets it on expiry', async t => {
  const home = await mkdtemp(join(tmpdir(), 'unfold-acp-login-')); t.after(() => rm(home, { recursive: true, force: true }));
  const file = credentialFile({ XDG_CONFIG_HOME: home });
  let started: any;
  let polls = 0;
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.endsWith('/api/auth/editor')) { started = JSON.parse(String(init.body)); return Response.json({ code: 'c0de', secret: 's3cret', userCode: 'BCDF-GHJK', url: 'https://unfold.test/api/auth/oidc?editor=c0de', expiresIn: 30, interval: 1 }); }
    polls += 1;
    return polls < 2 ? new Response(JSON.stringify({ status: 'pending' }), { status: 202 }) : Response.json({ token: `vle_${'z'.repeat(43)}`, expiresAt: '2099-01-01T00:00:00Z', user: { name: 'Dev' } });
  }) as typeof fetch;
  const said: string[] = [];
  const credential = await signIn({ url: 'https://unfold.test/', say: line => said.push(line), fetch: fetcher, host: 'dev-laptop' });
  assert.deepEqual(started, { client: 'acp', host: 'dev-laptop' });
  assert.match(said.join('\n'), /check that the page shows BCDF-GHJK/);
  await storeCredential('https://unfold.test/', credential, file);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await storedCredential('https://unfold.test', file))?.token, credential.token);
  assert.equal(await storedCredential('https://unfold.test', file, Date.parse('2100-01-01')), null, 'an expired credential is not offered');
  await storeCredential('https://unfold.test', null, file);
  assert.equal(await storedCredential('https://unfold.test', file), null);
});

test('prompts, references and feed events translate to ACP as the agent documents', () => {
  assert.deepEqual(parsePrompt('/ask why?'), { command: 'ask', rest: 'why?' });
  assert.deepEqual(parsePrompt('why /ask?'), { command: '', rest: 'why /ask?' });
  assert.deepEqual(reference('https://unfold.example/#work/105'), { kind: 'work', id: '105' });
  assert.deepEqual(reference('#session/AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'), { kind: 'session', id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
  assert.equal(reference('105; rm -rf'), null);
  const feed = new FeedTranslator() as { updates(event: unknown): any[] };
  assert.deepEqual(feed.updates({ id: 1, type: 'message', data: { role: 'operator', text: 'mine' } }), []);
  assert.equal(feed.updates({ id: 2, type: 'tool', data: { partId: 't1', name: 'composer test', command: 'composer test', status: 'running' } })[0].sessionUpdate, 'tool_call');
  assert.deepEqual(feed.updates({ id: 3, type: 'tool', data: { partId: 't1', status: 'completed', output: 'OK (12 tests)' } })[0], { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'OK (12 tests)' } }] });
  assert.deepEqual(feed.updates({ id: 4, type: 'permission', data: { requestId: 'r1' } }), [], 'permissions are relayed by the agent, not echoed');

  assert.deepEqual(handOffRequest('board/42 to shop'), { source: 'board', task: '42', team: 'shop' });
  assert.deepEqual(handOffRequest('task board:42 to team shop.'), { source: 'board', task: '42', team: 'shop' });
  assert.deepEqual(handOffRequest('#42 shop'), { source: '', task: '42', team: 'shop' });
  assert.equal(handOffRequest('board/42; rm -rf / to shop'), null);
  assert.equal(workItemOfSession(workSessionId('105')), '105');
  assert.equal(workItemOfSession('unfold-work-1; drop'), null);
  assert.deepEqual(runPlan([{ id: '2', role: 'reviewer', round: 1, state: 'running' }, { id: '1', role: 'builder', round: 1, state: 'finished', outcome: 'pr_opened' }, { id: '3', role: 'reviewer', round: 1, state: 'running', shadow: true }]), [
    { content: 'Round 1 · builder (pr opened)', priority: 'medium', status: 'completed' },
    { content: 'Round 1 · reviewer', priority: 'medium', status: 'in_progress' },
  ], 'shadow Runs are not part of the plan');
  const transcript = new TranscriptTranslator() as { updates(runId: string, entry: unknown): any[] };
  assert.equal(transcript.updates('5', { seq: 1, kind: 'thought', text: 'hmm' })[0].sessionUpdate, 'agent_thought_chunk');
  assert.deepEqual(transcript.updates('5', { seq: 2, kind: 'tool_call', toolCallId: 'c1', title: 'Edit app.php', toolKind: 'edit', status: 'completed', paths: ['/repo/app.php'] }), [{ sessionUpdate: 'tool_call', toolCallId: '5:c1', title: 'Edit app.php', kind: 'edit', status: 'completed', locations: [{ path: '/repo/app.php' }] }]);
  assert.match(transcript.updates('5', { seq: 3, kind: 'plan', plan: [{ content: 'Read', status: 'completed' }, { content: 'Fix', status: 'pending' }] })[0].content.text, /- \[x\] Read\n- \[ \] Fix/);
  const questions = [{ question: 'Which?', options: ['a', 'b'], multiple: true }, 'Free text?'];
  const form = questionForm(questions) as { properties: Record<string, any> };
  assert.deepEqual(form.properties.q0.items, { anyOf: [{ const: 'a', title: 'a' }, { const: 'b', title: 'b' }] });
  assert.equal(form.properties.q1.description, 'Free text?');
  assert.deepEqual(formAnswers(questions, { q0: ['a', 'b'], q1: ' yes ' }), [['a', 'b'], ['yes']]);
  assert.equal(formAnswers(questions, { q0: [], q1: '  ' }), null, 'an empty form is not an answer');
});

test('the ACP registry entry matches the registry schema rules and the package', async () => {
  const entry = JSON.parse(await readFile(registryEntry, 'utf8'));
  const pkg = JSON.parse(await readFile(fileURLToPath(new URL('../extensions/acp-agent/package.json', import.meta.url)), 'utf8'));
  assert.match(entry.id, /^[a-z][a-z0-9-]*$/);
  assert.equal(entry.id, 'unfold');
  assert.equal(entry.version, pkg.version);
  assert.match(entry.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
  for (const field of ['name', 'description', 'license_url', 'distribution']) assert(entry[field], `${field} is required`);
  assert.equal(entry.distribution.npx.package, `${pkg.name}@${pkg.version}`, 'npx names the exact version, never latest');
  const icon = await readFile(registryIcon, 'utf8');
  assert.match(icon, /viewBox="0 0 16 16"/);
  assert.doesNotMatch(icon, /(fill|stroke)="(?!currentColor|none|inherit)[^"]*"/, 'the icon is monochrome');
});
