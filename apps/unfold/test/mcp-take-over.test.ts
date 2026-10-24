import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { createMcpServer, serveStdio } from '../src/mcp.ts';
import { application } from './api-support.ts';

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

async function fakePloeg(t: TestContext, holder: () => string) {
  const env = `UNFOLD_MCP_TAKE_OVER_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  t.after(() => { delete process.env[env]; });
  const posted: { path: string; body: any; headers: IncomingHttpHeaders }[] = [];
  const details = structuredClone(ploegDemo.details) as Record<string, any>;
  details['102'].runs.find((run: any) => run.state === 'running').harness = 'acp';
  const url = await listen(t, (req, res, body) => {
    const path = new URL(req.url!, 'http://fixture.invalid').pathname;
    const send = (status: number, data: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (path.endsWith('/teams')) return send(200, { teams: ploegDemo.teams });
    details['101'].takeOver = { id: '7', state: 'taken_over', by: holder(), shiftId: '13', round: 1, branch: 'demo/rounding-review', requestedAt: '2026-10-24T10:00:00Z', yieldedAt: '2026-10-24T10:00:40Z', commit: 'b'.repeat(40), workInProgress: null, pushed: true, detail: null, handedBackAt: null, handedBackShiftId: null };
    details['101'].resume = { shiftId: '13', askedRound: 1, fromRound: 1, roundCapUsd: 0.4, poolUsd: 2.25, ready: true, waitingQuestionIds: [], reason: 'taken_over' };
    const step = /\/work-items\/(\d+)\/(take-over|requeue)$/.exec(path);
    if (req.method === 'POST' && step) {
      posted.push({ path, body, headers: req.headers });
      const [, id, kind] = step;
      if (kind === 'take-over') return send(202, { takeOver: { id: '7', workItemId: id, shiftId: '20', round: 1, branch: 'demo/regression-investigation', state: 'yielding', runs: [{ id: '820', role: 'implementer' }], cancelledPendingRuns: 0, commandId: body.commandId, replayed: false } });
      return send(200, { requeue: { workItemId: id, team: 'delivery', state: 'queued', fromRound: 1, poolUsd: 2.25, shiftId: '30', previousShiftId: '13', commandId: body.commandId, replayed: false, resume: body.resume === true } });
    }
    const id = path.split('/').at(-1)!;
    return details[id] ? send(200, details[id]) : send(404, { error: { code: 'not_found', message: 'No such Work Item.' } });
  });
  return { config: { url, tokenEnv: env, teams: ['delivery'] }, posted, details };
}

async function setup(t: TestContext) {
  let holder = '';
  const ploeg = await fakePloeg(t, () => holder);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  const admin = server.app.store.getUserByName('admin')!;
  holder = admin.id;
  return { ploeg, server, admin, token: credential(server, admin.id) };
}

test('unfold_take_over asks Ploeg to stop the Run only after the person confirms what it stops and where the work goes', async t => {
  const { ploeg, server, admin, token } = await setup(t);
  const declined = await overStdio(server.url, token, 'unfold_take_over', { id: '102' }, { action: 'decline' });
  assert.equal(declined.result.structuredContent.done, false);
  assert.equal(ploeg.posted.length, 0, 'nothing is asked without a yes');
  const done = await overStdio(server.url, token, 'unfold_take_over', { id: '102' }, accept);
  assert.equal(done.result.isError, undefined, JSON.stringify(done.result));
  assert.match(done.elicited[0].message, /^Take control of Work Item 102 ".*"\? Ploeg asks the implementer Run to stop at its next safe point, commits what the agent left uncommitted to demo\/regression-investigation and pushes it without forcing, which updates an open pull request\. The Work Item then waits for you and nothing more is spent until you hand it back\.$/);
  assert.match(done.result.structuredContent.summary, /run \/unfold:takeover 102/);
  assert.equal(done.result.structuredContent.result.state, 'yielding');
  const [call] = ploeg.posted;
  assert.equal(call.path, '/api/v1/operator/work-items/102/take-over');
  assert.deepEqual({ ...call.body, commandId: String(call.body.commandId).slice(0, 4) }, { commandId: 'mcp-', expectedShiftId: '20' });
  const [record] = server.app.store.actionRecords({ userId: admin.id, limit: 10 });
  assert.equal(record.action, 'POST /api/ploeg/work-items/:id/take-over');
  assert.equal(record.outcome, 'done');
  assert.equal(call.headers['x-ploeg-confirmation'], record.confirmation, 'Ploeg receives the confirmation the person agreed to');
  assert.match(String(record.confirmation), new RegExp(`:${sha(done.elicited[0].message)}$`));
});

test('unfold_take_over refuses before asking when nothing runs, a harness cannot yield, or it is already held', async t => {
  const { ploeg, server, token } = await setup(t);
  const idle = await overStdio(server.url, token, 'unfold_take_over', { id: '108' }, accept);
  assert.match(idle.result.content[0].text, /nothing to take over\. .*Nothing was changed\./);
  assert.equal(idle.elicited.length, 0);
  ploeg.details['199'] = JSON.parse(JSON.stringify(ploeg.details['102']).replaceAll('"workItemId":"102"', '"workItemId":"199"').replace('"id":"102"', '"id":"199"'));
  ploeg.details['199'].runs.find((run: any) => run.state === 'running').harness = 'claude-code';
  const claude = await overStdio(server.url, token, 'unfold_take_over', { id: '199' }, accept);
  assert.match(claude.result.content[0].text, /^Claude Code Runs cannot stop between steps yet\. Cancel it instead, or wait for it to finish\. Nothing was changed\.$/);
  assert.equal(claude.elicited.length, 0);
  ploeg.details['102'].takeOver = { id: '8', state: 'yielding', by: 'someone', shiftId: '20', round: 1, branch: 'x', requestedAt: '2026-10-24T10:00:00Z', yieldedAt: null, commit: null, workInProgress: null, pushed: null, detail: null, handedBackAt: null, handedBackShiftId: null };
  const pending = await overStdio(server.url, token, 'unfold_take_over', { id: '102' }, accept);
  assert.match(pending.result.content[0].text, /already took this Work Item over/);
  assert.equal(ploeg.posted.length, 0);
});

test('unfold_hand_back resumes the Round on the same branch with the note, after the person confirms what it spends', async t => {
  const { ploeg, server, admin, token } = await setup(t);
  const done = await overStdio(server.url, token, 'unfold_hand_back', { id: '101', note: 'Fixed the cents rounding' }, accept);
  assert.equal(done.result.isError, undefined, JSON.stringify(done.result));
  assert.match(done.elicited[0].message, /^Hand Work Item 101 ".*" back to Ploeg\? It resumes on demo\/rounding-review from the branch's head on the forge: Round 1 up to \$0\.40, in total up to \$2\.25, from Team delivery's budget\. Note: Fixed the cents rounding$/);
  const [call] = ploeg.posted;
  assert.equal(call.path, '/api/v1/operator/work-items/101/requeue');
  assert.deepEqual({ ...call.body, commandId: String(call.body.commandId).slice(0, 4) }, { commandId: 'mcp-', expectedState: 'needs_human', note: 'Fixed the cents rounding', resume: true });
  assert.equal(call.headers['x-ploeg-actor'], admin.id);
  assert.equal(done.result.structuredContent.result.resumed, true);
  assert.equal(server.app.store.actionRecords({ userId: admin.id, limit: 10 })[0].action, 'POST /api/ploeg/work-items/:id/hand-back');
  const nothing = await overStdio(server.url, token, 'unfold_hand_back', { id: '108' }, accept);
  assert.match(nothing.result.content[0].text, /nothing to hand back\. Nothing was changed\./);
  assert.equal(nothing.elicited.length, 0);
});
