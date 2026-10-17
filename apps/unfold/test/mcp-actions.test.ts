import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { confirmationLedger, createMcpServer, serveStdio } from '../src/mcp.ts';
import { application, createSession, login, request } from './api-support.ts';

type Json = Record<string, any>;
type Decision = Json | 'fail';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const accept = { action: 'accept', content: { confirm: true } };

async function listen(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse, body: any) => void): Promise<string> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    handler(req, res, chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function fakePloeg(t: TestContext) {
  const env = `UNFOLD_MCP_ACTION_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  t.after(() => { delete process.env[env]; });
  const posted: { path: string; body: any; headers: IncomingHttpHeaders }[] = [];
  const details = structuredClone(ploegDemo.details);
  const url = await listen(t, (req, res, body) => {
    const path = new URL(req.url!, 'http://fixture.invalid').pathname;
    const send = (status: number, data: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (path.endsWith('/teams')) return send(200, { teams: ploegDemo.teams });
    const step = /\/work-items\/(\d+)\/(approve|reject|cancel|requeue|notes)$/.exec(path);
    if (req.method === 'POST' && step) {
      posted.push({ path, body, headers: req.headers });
      const [, id, kind] = step;
      const team = details[id].item.team;
      if (kind === 'cancel') return send(200, { cancellation: { workItemId: id, team, state: 'withdrawn', withdrawn: true, shiftId: '20', cancelledRuns: 1, stoppedRuns: 1, keysBlocked: true } });
      if (kind === 'requeue') return send(200, { requeue: { workItemId: id, team, state: 'queued', fromRound: 1, poolUsd: 3, commandId: body.commandId, replayed: false } });
      if (kind === 'notes') return send(201, { note: { id: '5', workItemId: id, commandId: body.commandId, shiftId: '20', replayed: false } });
      return send(200, { decision: { workItemId: id, team, state: kind === 'approve' ? 'queued' : 'withdrawn' } });
    }
    const id = path.split('/').at(-1)!;
    return details[id] ? send(200, details[id]) : send(404, { error: { code: 'not_found', message: 'No such Work Item.' } });
  });
  return { config: { url, tokenEnv: env, teams: ['delivery'] }, posted };
}

function credential(server: Awaited<ReturnType<typeof application>>, userId: string): string {
  const token = `vle_${randomBytes(32).toString('base64url')}`;
  server.app.store.createEditorCredential({ id: randomBytes(12).toString('hex'), tokenHash: sha(token), userId, label: 'unfold-mcp on test-host', scope: 'editor', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  return token;
}

async function overStdio(url: string, token: string | undefined, name: string, args: Json, decision: Decision | null) {
  const input = new PassThrough();
  const output = new PassThrough();
  const replies: Json[] = [];
  const elicited: Json[] = [];
  output.on('data', chunk => {
    for (const line of String(chunk).split('\n').filter(Boolean)) {
      const message = JSON.parse(line);
      if (message.method === 'elicitation/create') {
        elicited.push(message.params);
        input.write(`${JSON.stringify(decision === 'fail' ? { jsonrpc: '2.0', id: message.id, error: { code: -1, message: 'closed' } } : { jsonrpc: '2.0', id: message.id, result: decision })}\n`);
      } else replies.push(message);
    }
  });
  const served = serveStdio(createMcpServer({ url, ...(token ? { token } : {}), version: 'test' }), input, output);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: decision === null ? {} : { elicitation: {} }, clientInfo: { name: 'claude-code', version: '2.1.296' } } })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })}\n`);
  while (!replies.some(reply => reply.id === 2)) await new Promise(resolve => setTimeout(resolve, 10));
  input.end();
  await served;
  return { result: replies.find(reply => reply.id === 2)!.result, elicited };
}

const workCases = [
  { tool: 'unfold_approve_work', args: { id: '106' }, kind: 'approve', message: /^Approve Work Item 106 "Add a regression test for negative half-cent totals"\? Ploeg queues it for Team delivery, and its Runs spend from Team delivery's budget\.$/ },
  { tool: 'unfold_reject_work', args: { id: '106', reason: 'Covered by DEMO-5 already' }, kind: 'reject', message: /^Reject Work Item 106 ".*"\? Ploeg withdraws the proposal with your reason; nothing runs and nothing is spent\. Reason: Covered by DEMO-5 already$/ },
  { tool: 'unfold_stop_work', args: { id: '102' }, kind: 'cancel', message: /^Stop Work Item 102 "Prepare a regression investigation", now leased\? Ploeg withdraws it, stops its running Runs and blocks their model keys, so nothing more is spent\. The \$\d+\.\d\d spent so far stays spent\.$/ },
  { tool: 'unfold_retry_work', args: { id: '101', note: 'Use the rounding fixture' }, kind: 'requeue', message: /^Restart Work Item 101 ".*" from Round 1 with your note\? Ploeg opens a new attempt that spends from Team delivery's budget, up to \$3\.00 like the last attempt\. Note: Use the rounding fixture$/ },
  { tool: 'unfold_add_note', args: { id: '102', text: 'Check negative totals too' }, kind: 'notes', message: /^Leave this note on Work Item 102 ".*" for its next Run\? The running Run does not see it, and the note costs nothing by itself\. Note: Check negative totals too$/ },
] as const;

test('each Work Item action over stdio calls Unfold\'s route only after the person accepts, and leaves an Action Record with the client and the agreed text', async t => {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  const admin = server.app.store.getUserByName('admin')!;
  const token = credential(server, admin.id);
  const records = () => server.app.store.actionRecords({ userId: admin.id, limit: 100 });

  for (const entry of workCases) {
    const route = `/api/v1/operator/work-items/${entry.args.id}/${entry.kind}`;
    const before = { posts: ploeg.posted.length, records: records().length };

    for (const declined of [{ action: 'decline' }, { action: 'accept', content: { confirm: false } }, { action: 'cancel' }, 'fail' as const]) {
      const answer = await overStdio(server.url, token, entry.tool, entry.args, declined);
      assert.equal(answer.elicited.length, 1, entry.tool);
      if (declined === 'fail') assert.match(answer.result.content[0].text, /did not come back, so nothing was changed/);
      else assert.deepEqual(answer.result.structuredContent, { summary: 'Not done: you did not confirm. Nothing was changed.', done: false, demo: false, link: `${server.url}/#work/${entry.args.id}`, result: null }, entry.tool);
    }
    assert.equal(ploeg.posted.length, before.posts, `${entry.tool}: a declined or unanswered confirmation calls nothing`);
    assert.equal(records().length, before.records, `${entry.tool}: and records nothing`);

    const refused = await overStdio(server.url, token, entry.tool, entry.args, null);
    assert.equal(refused.result.isError, true);
    assert.equal(refused.result.content[0].text, `This client cannot ask you to confirm, so nothing was changed. Do it in Unfold instead: ${server.url}/#work/${entry.args.id}`);
    assert.equal(ploeg.posted.length, before.posts);

    const done = await overStdio(server.url, token, entry.tool, entry.args, accept);
    assert.equal(done.result.isError, undefined, JSON.stringify(done.result));
    assert.match(done.elicited[0].message, entry.message);
    assert.deepEqual(done.elicited[0].requestedSchema.required, ['confirm']);
    assert.equal(done.result.structuredContent.done, true);
    assert.equal(done.result.structuredContent.demo, false);
    const [call] = ploeg.posted.slice(before.posts);
    assert.equal(ploeg.posted.length, before.posts + 1, entry.tool);
    assert.equal(call.path, route);
    const [record] = records();
    assert.equal(record.action, `POST /api/ploeg/work-items/:id/${entry.kind}`);
    assert.equal(record.outcome, 'done');
    assert.deepEqual(record.target, { kind: 'work-item', id: entry.args.id });
    assert.equal(record.channel, 'unfold-mcp on test-host (claude-code 2.1.296)');
    assert.match(String(record.confirmation), new RegExp(`^[A-Za-z0-9_-]{16}:${sha(done.elicited[0].message)}$`), 'the record names the exact text the person agreed to');
    assert.equal(call.headers['x-ploeg-confirmation'], record.confirmation, 'Ploeg receives the same confirmation');
    assert.equal(call.headers['x-ploeg-via'], record.channel);
    if (entry.kind === 'requeue') assert.deepEqual({ ...call.body, commandId: String(call.body.commandId).slice(0, 4) }, { commandId: 'mcp-', expectedState: 'needs_human', note: 'Use the rounding fixture' });
    if (entry.kind === 'notes') assert.deepEqual({ ...call.body, commandId: String(call.body.commandId).slice(0, 4) }, { commandId: 'mcp-', text: 'Check negative totals too', expectedShiftId: '20' });
    if (entry.kind === 'reject') assert.deepEqual(call.body, { reason: 'Covered by DEMO-5 already' });
  }
});

test('an action tool refuses a viewer, and work in the wrong state, before asking the person anything', async t => {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  server.app.store.addUser({ id: 'viewer-1', name: 'viewer-1', role: 'viewer', passwordHash: '' });
  const viewer = credential(server, 'viewer-1');
  for (const entry of workCases) {
    const answer = await overStdio(server.url, viewer, entry.tool, entry.args, accept);
    assert.equal(answer.result.isError, true, entry.tool);
    assert.equal(answer.result.content[0].text, 'Your Unfold role is viewer, which cannot change work. Nothing was changed.');
    assert.equal(answer.elicited.length, 0, `${entry.tool}: a viewer is never asked`);
  }
  const admin = credential(server, server.app.store.getUserByName('admin')!.id);
  for (const [tool, args, said] of [
    ['unfold_approve_work', { id: '101' }, /is needs human, not proposed/],
    ['unfold_stop_work', { id: '114' }, /is already done/],
    ['unfold_retry_work', { id: '102' }, /restarts only one that needs you or went stale/],
    ['unfold_add_note', { id: '101', text: 'hello' }, /a note reaches only queued or running work/],
    ['unfold_reject_work', { id: '106', reason: ' ' }, /reason must be 1 to 4096 characters/],
  ] as const) {
    const answer = await overStdio(server.url, admin, tool, args, accept);
    assert.match(answer.result.content[0].text, said, tool);
    assert.equal(answer.elicited.length, 0, tool);
  }
  assert.equal(ploeg.posted.length, 0);
  assert.equal(server.app.store.actionRecords({ limit: 100 }).length, 0);
});

const modernMeta = (capabilities: Json = { elicitation: {} }) => ({ 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': capabilities });

test('over 2026-07-28 an action returns input_required, runs once when the sealed confirmation comes back accepted, and refuses a replay or another action', async t => {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  const admin = server.app.store.getUserByName('admin')!;
  const token = credential(server, admin.id);
  const confirmations = confirmationLedger();
  const mcp = createMcpServer({ url: server.url, token, principal: admin.id, confirmations });
  const act = async (id: number, args: Json, extra: Json = {}, capabilities?: Json) => (await mcp.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'unfold_stop_work', arguments: args, _meta: modernMeta(capabilities), ...extra } }))!.result;

  assert.match((await act(1, { id: '102' }, {}, {})).content[0].text, /cannot ask you to confirm.*#work\/102$/);
  const pending = await act(2, { id: '102' });
  assert.equal(pending.resultType, 'input_required');
  assert.equal(pending.inputRequests.confirm_action.params.mode, 'form');
  assert.match(pending.inputRequests.confirm_action.params.message, /^Stop Work Item 102 /);
  assert.equal(ploeg.posted.length, 0, 'asking posts nothing');

  const inputResponses = { confirm_action: accept };
  assert.match((await act(3, { id: '101' }, { inputResponses, requestState: pending.requestState })).content[0].text, /^The confirmation was for another action\. Nothing was changed; call unfold_stop_work again/);
  const done = await act(4, { id: '102' }, { inputResponses, requestState: pending.requestState });
  assert.equal(done.resultType, 'complete');
  assert.equal(done.structuredContent.done, true, JSON.stringify(done));
  assert.equal(ploeg.posted.length, 1);
  const [record] = server.app.store.actionRecords({ userId: admin.id, limit: 10 });
  assert.equal(record.channel, 'unfold-mcp on test-host (test 1)');
  assert.ok(record.confirmation?.endsWith(`:${sha(pending.inputRequests.confirm_action.params.message)}`));
  assert.match((await act(5, { id: '102' }, { inputResponses, requestState: pending.requestState })).content[0].text, /already used/);
  assert.equal(ploeg.posted.length, 1, 'a sealed confirmation acts at most once');

  const second = await act(6, { id: '102' });
  const declined = await act(7, { id: '102' }, { inputResponses: { confirm_action: { action: 'decline' } }, requestState: second.requestState });
  assert.equal(declined.structuredContent.done, false);
  assert.match((await act(8, { id: '102' }, { inputResponses, requestState: second.requestState })).content[0].text, /already used/, 'a declined confirmation cannot be accepted later');
  assert.equal(ploeg.posted.length, 1);
  assert.equal(server.app.store.actionRecords({ userId: admin.id, limit: 10 }).length, 1);
});

test('the demo says so in the confirmation and the result, and changes nothing real', async t => {
  const demo = await application(); t.after(() => demo.close());
  const approved = await overStdio(demo.url, undefined, 'unfold_approve_work', { id: '106' }, accept);
  assert.match(approved.elicited[0].message, /^Illustrative demo: nothing real changes\. Approve Work Item 106 /);
  assert.equal(approved.result.structuredContent.demo, true);
  assert.match(approved.result.structuredContent.summary, /This is the illustrative demo: nothing real changed\.$/);
  const noted = await overStdio(demo.url, undefined, 'unfold_add_note', { id: '102', text: 'Check negative totals too' }, accept);
  assert.equal(noted.result.structuredContent.demo, true, JSON.stringify(noted.result));
  assert.match(noted.result.structuredContent.summary, /^The note was not stored\. This is the illustrative demo/);
  const record = demo.app.store.actionRecords({ limit: 10 }).find(entry => entry.action === 'POST /api/ploeg/work-items/:id/notes');
  assert.equal(record?.channel, 'browser (claude-code 2.1.296)');
});

test('unfold_steer_session messages and cancels the person\'s session only after they confirm, and names its budget', async t => {
  const demo = await application(); t.after(() => demo.close());
  const session = await createSession(demo.url);
  const steer = (args: Json, decision: Decision | null) => overStdio(demo.url, undefined, 'unfold_steer_session', { id: session.id, ...args }, decision);

  const declined = await steer({ action: 'message', text: 'Also cover negative totals.' }, { action: 'decline' });
  assert.match(declined.elicited[0].message, new RegExp(`^Illustrative demo: nothing real changes\\. Send this message to the agent in session ${session.id} "Correct the order rounding"\\? The agent acts on it and may spend from the session's budget; \\$\\d+\\.\\d\\d of its \\$3\\.00 budget is used\\. Message: Also cover negative totals\\.$`));
  assert.equal(declined.result.structuredContent.done, false);
  assert.equal(demo.app.store.actionRecords({ limit: 50 }).filter(entry => entry.target?.id === session.id && entry.action !== 'POST /api/sessions').length, 0);

  const refused = await steer({ action: 'cancel' }, null);
  assert.equal(refused.result.content[0].text, `This client cannot ask you to confirm, so nothing was changed. Do it in Unfold instead: ${demo.url}/#session/${session.id}`);

  const sent = await steer({ action: 'message', text: 'Also cover negative totals.' }, accept);
  assert.equal(sent.result.structuredContent.done, true, JSON.stringify(sent.result));
  const cancelled = await steer({ action: 'cancel' }, accept);
  assert.match(cancelled.elicited[0].message, /Cancel session .*\? The agent stops for good and the session cannot be resumed; the \$\d+\.\d\d spent so far stays spent\.$/);
  assert.match(cancelled.result.structuredContent.summary, /^Cancelled the session; it is cancelled\./);
  const steps = demo.app.store.actionRecords({ limit: 50 }).filter(entry => entry.target?.id === session.id).map(entry => [entry.action, entry.outcome, entry.channel, /^[A-Za-z0-9_-]{16}:[0-9a-f]{64}$/.test(String(entry.confirmation))]);
  assert.deepEqual(steps, [
    ['POST /api/sessions/:id/cancel', 'done', 'browser (claude-code 2.1.296)', true],
    ['POST /api/sessions/:id/messages', 'done', 'browser (claude-code 2.1.296)', true],
  ]);
  assert.match((await steer({ action: 'pause', text: 'x' }, accept)).result.content[0].text, /text goes only with action message/);
});

test('unfold_hand_off assigns the Team\'s tracker user only after the person confirms, through Unfold\'s hand-off route', async t => {
  const at = '2026-09-30T10:00:00Z';
  const vikunjaToken = randomBytes(24).toString('hex');
  const env = `UNFOLD_MCP_HANDOFF_${randomBytes(6).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  t.after(() => { delete process.env[env]; });
  const task = { id: 1505, project_id: 42, index: 7, identifier: 'UNFOLD-7', title: 'Round the totals', description: '<p>Round half cents.</p>', done: false, updated: at, priority: 2, labels: [], assignees: [] as { id: number; username: string }[] };
  const writes: { method: string; path: string }[] = [];
  const vikunja = await listen(t, (req, res, body) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (value: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    if (req.headers.authorization !== `Bearer ${vikunjaToken}`) return send({ message: 'unauthorized' }, 401);
    if (req.method === 'GET') {
      if (url.pathname === '/api/v1/tasks/1505') return send(task);
      if (url.pathname === '/api/v1/projects/42/projectusers' || url.pathname === '/api/v1/users') return send([{ id: 11, username: 'silver', name: 'Silver team' }]);
      return send({ message: 'not found' }, 404);
    }
    writes.push({ method: req.method!, path: url.pathname });
    if (url.pathname === '/api/v1/tasks/1505/assignees') { task.assignees.push({ id: body.user_id, username: 'silver' }); return send({ user_id: body.user_id }, 201); }
    if (url.pathname === '/api/v1/tasks/1505/comments') return send({ id: 1, comment: body.comment }, 201);
    return send({ message: 'not found' }, 404);
  });
  const ploeg = await listen(t, (req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (value: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...value as object }));
    if (req.headers.authorization !== `Bearer ${bearer}`) return send({}, 401);
    if (url.pathname === '/api/v1/operator/teams') return send({ teams: [{ id: 'silver', paused: false, queueDepth: 2, roles: [{ id: 'implementer', queueDepth: 1 }], assignees: ['silver'], pinnedScopes: [] }] });
    if (url.pathname === '/api/v1/operator/work-items') return send({ items: [], nextCursor: null });
    return send({}, 404);
  });
  const server = await application('live', config => {
    config.taskSources = [{ id: 'board', name: 'Board', provider: 'vikunja', baseUrl: `${vikunja}/api/v1`, project: '42', repositoryId: 'order-service', token: vikunjaToken, executionOwner: 'ploeg' }];
    config.ploeg = { url: ploeg, tokenEnv: env, userTeams: { 'op-1': ['silver'] } };
  });
  t.after(() => server.close());
  server.app.store.addUser({ id: 'op-1', name: 'Op One', role: 'operator', passwordHash: '' });
  const token = credential(server, 'op-1');
  const args = { source: 'board', task: '1505', team: 'silver' };

  const declined = await overStdio(server.url, token, 'unfold_hand_off', args, { action: 'decline' });
  assert.equal(declined.elicited[0].message, 'Hand task board/1505 "Round the totals" to Team silver? Unfold assigns the Team\'s tracker user silver to the task and comments that you handed it over. Ploeg then picks it up, and its Runs spend from Team silver\'s budget.');
  assert.equal(declined.result.structuredContent.done, false);
  assert.equal(writes.length, 0);
  assert.match((await overStdio(server.url, token, 'unfold_hand_off', { ...args, team: 'gold' }, accept)).result.content[0].text, /Team gold is not one you can hand this task to; choose one of silver/);

  const done = await overStdio(server.url, token, 'unfold_hand_off', args, accept);
  assert.equal(done.result.structuredContent.done, true, JSON.stringify(done.result));
  assert.deepEqual(done.result.structuredContent.result.assignedTeams, ['silver']);
  assert.deepEqual(writes.map(write => write.path), ['/api/v1/tasks/1505/assignees', '/api/v1/tasks/1505/comments']);
  const [record] = server.app.store.actionRecords({ userId: 'op-1', limit: 10 });
  assert.deepEqual({ action: record.action, target: record.target, outcome: record.outcome, channel: record.channel }, { action: 'POST /api/task-sources/board/tasks/:id/handoff', target: { kind: 'task', id: 'board:1505' }, outcome: 'done', channel: 'unfold-mcp on test-host (claude-code 2.1.296)' });
  assert.ok(record.confirmation?.endsWith(`:${sha(done.elicited[0].message)}`));
  assert.match((await overStdio(server.url, token, 'unfold_hand_off', args, accept)).result.content[0].text, /^Team silver already holds this task\. Nothing was changed\.$/);
});

test('POST /api/ploeg/work-items/:id/requeue and /notes call Ploeg as the person, refuse viewers and check their input', async t => {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  const admin = await login(server.url);
  const { hashPassword } = await import('../src/auth.ts');
  const password = randomBytes(18).toString('hex');
  server.app.store.addUser({ id: 'viewer-1', name: 'viewer-1', role: 'viewer', passwordHash: hashPassword(password) });
  const viewer = await login(server.url, 'viewer-1', password);

  const requeued = await request(server.url, '/api/ploeg/work-items/101/requeue', { method: 'POST', body: { commandId: 'cmd-1', expectedState: 'needs_human', note: 'Try the fixture' }, ...admin });
  assert.equal(requeued.status, 200, requeued.text);
  assert.deepEqual({ state: requeued.body.state, fromRound: requeued.body.fromRound, commandId: requeued.body.commandId, demo: requeued.body.demo }, { state: 'queued', fromRound: 1, commandId: 'cmd-1', demo: false });
  assert.deepEqual(ploeg.posted.at(-1)!.body, { commandId: 'cmd-1', expectedState: 'needs_human', note: 'Try the fixture' });
  const adminId = server.app.store.getUserByName('admin')!.id;
  assert.equal(ploeg.posted.at(-1)!.headers['x-ploeg-actor'], adminId);

  const noted = await request(server.url, '/api/ploeg/work-items/102/notes', { method: 'POST', body: { text: 'Check negative totals', expectedShiftId: '20' }, ...admin });
  assert.equal(noted.status, 201, noted.text);
  assert.equal(noted.body.noteId, '5');
  assert.match(ploeg.posted.at(-1)!.body.commandId, /^[0-9a-f-]{36}$/, 'a missing commandId gets a fresh one');
  assert.deepEqual({ ...ploeg.posted.at(-1)!.body, commandId: '' }, { commandId: '', text: 'Check negative totals', expectedShiftId: '20' });

  const posts = ploeg.posted.length;
  for (const [path, body, status] of [
    ['/api/ploeg/work-items/101/requeue', { expectedState: 'leased' }, 400],
    ['/api/ploeg/work-items/101/requeue', {}, 400],
    ['/api/ploeg/work-items/102/notes', { text: '' }, 400],
    ['/api/ploeg/work-items/102/notes', { text: 'x'.repeat(4097) }, 400],
  ] as const) assert.equal((await request(server.url, path, { method: 'POST', body, ...admin })).status, status, `${path} ${JSON.stringify(body).slice(0, 40)}`);
  assert.equal((await request(server.url, '/api/ploeg/work-items/101/requeue', { method: 'POST', body: { expectedState: 'needs_human' }, ...viewer })).status, 403);
  assert.equal((await request(server.url, '/api/ploeg/work-items/102/notes', { method: 'POST', body: { text: 'hi' }, ...viewer })).status, 403);
  assert.equal((await request(server.url, '/api/ploeg/work-items/102/notes', admin)).status, 405);
  assert.equal(ploeg.posted.length, posts, 'a refused request calls nothing');

  const demo = await application(); t.after(() => demo.close());
  const demoNote = await request(demo.url, '/api/ploeg/work-items/102/notes', { method: 'POST', body: { text: 'hi' } });
  assert.equal(demoNote.status, 200, demoNote.text);
  assert.deepEqual({ demo: demoNote.body.demo, noteId: demoNote.body.noteId }, { demo: true, noteId: null });
  assert.equal((await request(demo.url, '/api/ploeg/work-items/999/notes', { method: 'POST', body: { text: 'hi' } })).status, 404);
  const demoRequeue = await request(demo.url, '/api/ploeg/work-items/101/requeue', { method: 'POST', body: { expectedState: 'needs_human' } });
  assert.equal(demoRequeue.body.demo, true, demoRequeue.text);
});
