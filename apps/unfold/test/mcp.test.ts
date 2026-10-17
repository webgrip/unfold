import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { application } from './api-support.ts';
import { confirmationLedger, createMcpServer, serveStdio } from '../src/mcp.ts';

function conforms(schema: Record<string, any>, value: unknown, at: string): string[] {
  const types = [schema.type ?? []].flat();
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (types.length && !types.includes(actual) && !(actual === 'integer' && types.includes('number'))) return [`${at} is ${actual}, not ${types.join(' or ')}`];
  if (actual === 'array' && schema.items) return (value as unknown[]).flatMap((item, index) => conforms(schema.items, item, `${at}[${index}]`));
  if (actual !== 'object' || !schema.properties) return [];
  const record = value as Record<string, unknown>;
  return [
    ...(schema.required ?? []).filter((key: string) => !(key in record)).map((key: string) => `${at}.${key} is missing`),
    ...(schema.additionalProperties === false ? Object.keys(record).filter(key => !(key in schema.properties)).map(key => `${at}.${key} is not in the output schema`) : []),
    ...Object.entries(record).filter(([key]) => key in schema.properties).flatMap(([key, item]) => conforms(schema.properties[key], item, `${at}.${key}`)),
  ];
}

const schemas = new WeakMap<object, Promise<Map<string, Record<string, any>>>>();

async function call(server: ReturnType<typeof createMcpServer>, name: string, args: Record<string, unknown> = {}) {
  const answer = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  assert(answer && 'result' in answer, JSON.stringify(answer));
  if (!answer.result.isError && answer.result.structuredContent) {
    if (!schemas.has(server)) schemas.set(server, Promise.resolve(server.handle({ jsonrpc: '2.0', id: 'schemas', method: 'tools/list' })).then(listed => new Map(listed?.result.tools.map((tool: { name: string; outputSchema: Record<string, any> }) => [tool.name, tool.outputSchema]))));
    const schema = (await schemas.get(server)!).get(name);
    assert(schema, `${name} has no output schema`);
    assert.deepEqual(conforms(schema, answer.result.structuredContent, name), [], 'MCP clients reject structured content that does not match the tool\'s output schema');
  }
  return answer.result;
}

test('unfold-mcp tells a client what waits, why, and what to do, from the demo without inventing spend', async t => {
  const demo = await application(); t.after(() => demo.close());
  const server = createMcpServer({ url: demo.url, version: 'test' });

  const init = await server.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  assert.equal(init?.result.protocolVersion, '2025-06-18');
  assert.equal(init?.result.serverInfo.name, 'unfold-mcp');
  assert(init?.result.instructions.length <= 500);
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);

  const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(listed?.result.tools.map((tool: { name: string }) => tool.name), ['unfold_now', 'unfold_find_work', 'unfold_get_work', 'unfold_sessions', 'unfold_linked_sessions', 'unfold_link_session', 'unfold_spend', 'unfold_digest', 'unfold_ask']);
  for (const tool of listed?.result.tools ?? []) {
    assert.equal(tool.annotations.readOnlyHint, !['unfold_ask', 'unfold_link_session'].includes(tool.name), tool.name);
    assert.match(tool.name, /^[a-z][a-z0-9_]{0,29}$/);
    assert(tool.outputSchema && tool.title && tool.description.length < 1000, tool.name);
  }

  const now = await call(server, 'unfold_now');
  assert.equal(now.isError, undefined, JSON.stringify(now));
  assert.equal(now.structuredContent.demo, true);
  assert.match(now.structuredContent.summary, /illustrative demo: nothing ran and nothing was spent/);
  const stuck = now.structuredContent.waiting.find((item: { state: string }) => item.state === 'needs_human');
  assert(stuck, 'the demo has a Work Item that needs a person');
  assert(stuck.reason?.chip && stuck.reason.fix, JSON.stringify(stuck));
  assert.equal(stuck.link, `${demo.url}/#work/${stuck.id}`);
  assert.equal(typeof stuck.untrusted.title, 'string');
  assert.deepEqual(JSON.parse(now.content[0].text), now.structuredContent);
  const review = now.structuredContent.waiting.find((item: { state: string }) => item.state === 'awaiting_review');
  assert.equal(review?.reason.code, 'awaiting_review');

  for (const id of ['101', `${demo.url}/#work/101`, '#work/101']) {
    const detail = await call(server, 'unfold_get_work', { id });
    assert.equal(detail.isError, undefined, JSON.stringify(detail));
    assert.equal(detail.structuredContent.item.id, '101');
    assert(detail.structuredContent.reason?.chip, JSON.stringify(detail.structuredContent));
    assert.match(detail.structuredContent.summary, /^Work Item 101 is needs_human: .*Fix: /);
    assert.match(detail.structuredContent.summary, /Illustrative demo, nothing was spent/);
    assert(detail.structuredContent.shifts.every((shift: { heldUsd: unknown; reservedUsd: unknown }) => typeof shift.heldUsd === 'number' && shift.heldUsd === shift.reservedUsd), 'each Shift says what it holds as heldUsd, and as reservedUsd for one release');
  }

  assert(now.structuredContent.teams.includes(stuck.team));
  const found = await call(server, 'unfold_find_work', { team: stuck.team, state: 'needs_human' });
  assert(found.structuredContent.items.length > 0 && found.structuredContent.items.every((item: { state: string }) => item.state === 'needs_human'));
  assert.equal((await call(server, 'unfold_sessions')).structuredContent.sessions.length, 0);
  const demoSpend = await call(server, 'unfold_spend', { window: '24h' });
  assert.equal(demoSpend.isError, undefined, JSON.stringify(demoSpend));
  assert.equal(demoSpend.structuredContent.demo, true);
  assert.equal(demoSpend.structuredContent.summary, 'This is the illustrative demo: nothing ran and nothing was spent.');
  assert.equal((await call(server, 'unfold_spend', { window: '1y' })).isError, true);

  const missing = await call(server, 'unfold_get_work', { id: 'not a link' });
  assert.equal(missing.isError, true);
  const extra = await call(server, 'unfold_now', { team: 'x' });
  assert.equal(extra.isError, true);
  const unknown = await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'unfold_delete_everything', arguments: {} } });
  assert.equal(unknown?.error.code, -32602);
  assert.equal((await server.handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' }))?.error.code, -32601);
});

test('unfold-mcp reads as the person behind an editor credential and never repeats the token', async t => {
  const live = await application('live'); t.after(() => live.close());
  const admin = live.app.store.getUserByName('admin');
  assert(admin);
  const token = `vle_${randomBytes(32).toString('base64url')}`;
  live.app.store.createEditorCredential({ id: randomBytes(12).toString('hex'), tokenHash: createHash('sha256').update(token).digest('hex'), userId: admin.id, label: 'VS Code', scope: 'editor', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() });

  const signedIn = createMcpServer({ url: live.url, token });
  const sessions = await call(signedIn, 'unfold_sessions');
  assert.equal(sessions.isError, undefined, JSON.stringify(sessions));

  const wrong = `vle_${randomBytes(32).toString('base64url')}`;
  const refused = await call(createMcpServer({ url: live.url, token: wrong }), 'unfold_sessions');
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /refused UNFOLD_TOKEN/);
  assert(!JSON.stringify(refused).includes(wrong));
  const anonymous = await call(createMcpServer({ url: live.url }), 'unfold_now');
  assert.match(anonymous.content[0].text, /npm run mcp -- login/);
});

test('unfold-mcp turns an echoing, slow or unreachable Unfold into tool errors and keeps serving', async t => {
  const token = `vle_${'a'.repeat(43)}`;
  const echo = createServer((req, res) => {
    if (req.url?.startsWith('/api/sessions')) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: `saw ${req.headers.authorization}` } })); return; }
    if (req.url?.startsWith('/api/ploeg/now')) return;
    res.writeHead(302, { location: 'http://elsewhere.invalid/' }); res.end();
  });
  await new Promise<void>(resolve => echo.listen(0, '127.0.0.1', resolve));
  t.after(() => { echo.closeAllConnections(); echo.close(); });
  const address = echo.address();
  assert(address && typeof address !== 'string');
  const server = createMcpServer({ url: `http://127.0.0.1:${address.port}`, token, timeoutMs: 200 });
  const echoed = await call(server, 'unfold_sessions');
  assert.equal(echoed.isError, true);
  assert(!echoed.content[0].text.includes(token), echoed.content[0].text);
  assert.match((await call(server, 'unfold_now')).content[0].text, /did not answer within/);
  assert.match((await call(server, 'unfold_get_work', { id: '7' })).content[0].text, /answered 302/);
  const gone = await call(createMcpServer({ url: 'http://127.0.0.1:9', token }), 'unfold_now');
  assert.match(gone.content[0].text, /unreachable/);
});

test('unfold-mcp speaks newline-delimited JSON-RPC on stdio and answers bad lines with errors', async () => {
  const server = createMcpServer({ url: 'http://127.0.0.1:9' });
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: any[] = [];
  output.on('data', chunk => { for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line)); });
  const served = serveStdio(server, input, output);
  input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  input.write('not json\n');
  input.write('[{"jsonrpc":"2.0","id":2,"method":"ping"}]\n');
  input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  input.end('{"jsonrpc":"2.0","id":3,"method":"tools/list"}\n');
  await served;
  assert.deepEqual(lines.map(line => line.id ?? null), [1, null, null, 3]);
  assert.equal(lines[1].error.code, -32700);
  assert.equal(lines[2].error.code, -32600);
  assert.equal(lines[3].result.tools.length, 9);
});

test('unfold_spend names the Work Items whose finished Runs still hold budget, and says when it cannot tell', async t => {
  let unsettled: unknown = { count: 1, heldUsd: 0.25, accounts: [{ runId: '264', workItemId: '184', team: 'unfold', accountState: 'blocked', heldUsd: 0.25, since: '2026-10-10T20:01:39Z' }] };
  let unsettledError: unknown = null;
  const fake = createServer((req, res) => {
    assert.equal(req.url, '/api/ploeg/summary?window=7d');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ demo: false, window: '7d', teams: [{ team: 'unfold', workItems: { needsHuman: 1 }, runs: { finished: 3, failed: 1, stuck: 1 }, spend: { settledUsd: 0.3238, heldUsd: 0.25 } }], totals: { spend: { settledUsd: 0.3238, reservedUsd: 0.25 } }, unsettled, unsettledError }));
  });
  await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve));
  t.after(() => fake.close());
  const address = fake.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const server = createMcpServer({ url, token: `vle_${'b'.repeat(43)}` });

  const spend = (await call(server, 'unfold_spend')).structuredContent;
  assert.equal(spend.summary, '$0.32 settled and $0.25 held in 7d. 1 finished Runs still hold $0.25: Work Item 184.');
  assert.deepEqual(spend.stuckHolds, [{ workItemId: '184', runId: '264', team: 'unfold', keyState: 'blocked', heldUsd: 0.25, since: '2026-10-10T20:01:39Z', link: `${url}/#work/184` }]);
  assert.deepEqual(spend.teams[0], { team: 'unfold', settledUsd: 0.32, heldUsd: 0.25, reservedUsd: 0.25, needsHuman: 1, runsFinished: 3, runsFailed: 1, runsStuck: 1 }, 'a newer Ploeg reports heldUsd, and reservedUsd still carries it for one release');
  assert.deepEqual([spend.heldUsd, spend.reservedUsd], [0.25, 0.25], 'an older Ploeg reports only reservedUsd');

  unsettled = null;
  unsettledError = { code: 'ploeg_unavailable', message: 'Ploeg could not list the Runs whose budget it cannot release.' };
  const unknown = (await call(server, 'unfold_spend')).structuredContent;
  assert.equal(unknown.stuckHolds, null, 'an unreadable list is never reported as zero stuck');
  assert.match(unknown.summary, /Stuck holds unknown: Ploeg could not list/);
});

function askingUnfold(t: { after(fn: () => void): void }) {
  const posted: Record<string, unknown>[] = [];
  const headers: Record<string, unknown>[] = [];
  const fake = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') { res.end(JSON.stringify({ asks: [], allowance: { limitUsd: 2, settledUsd: 0, heldUsd: 0, remainingUsd: 1.97, resetAt: '2026-11-01T00:00:00Z', askCount: 1, askBudgetUsd: 0.02, asksEnabled: true } })); return; }
    assert.equal(req.headers['x-unfold-request'], '1');
    const body = JSON.parse(Buffer.concat(chunks).toString());
    posted.push(body);
    headers.push({ client: req.headers['x-unfold-client'], confirmation: req.headers['x-unfold-confirmation'] });
    if (body.recordOnly && body.question !== 'What did it cost so far?') { res.statusCode = 409; res.end(JSON.stringify({ error: { code: 'ask_needs_model', message: 'The record does not answer this question.' } })); return; }
    res.statusCode = 201;
    res.end(JSON.stringify(body.askModel
      ? { question: body.question, answer: 'Firefox is not affected.', status: 'answered', source: 'model', costUsd: 0.0011, costStatus: 'provisional' }
      : { question: body.question, answer: 'US$ 0.03 so far.', status: 'answered', source: 'record', costUsd: 0, costStatus: 'settled' }));
  });
  t.after(() => fake.close());
  return { fake, posted, headers, ready: new Promise<string>(resolve => fake.listen(0, '127.0.0.1', () => { const a = fake.address(); assert(a && typeof a !== 'string'); resolve(`http://127.0.0.1:${a.port}`); })) };
}

test('unfold_ask answers standing questions free and never spends without a person confirming', async t => {
  const unfold = askingUnfold(t);
  const url = await unfold.ready;
  const server = createMcpServer({ url, token: `vle_${'c'.repeat(43)}` });
  await server.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });

  const free = (await call(server, 'unfold_ask', { id: '184', question: 'What did it cost so far?' })).structuredContent;
  assert.equal(free.asked, true);
  assert.equal(free.summary, 'Answered (free, from the record).');
  assert.equal(free.untrusted.answer, 'US$ 0.03 so far.');

  const open = (await call(server, 'unfold_ask', { id: '184', question: 'Is Firefox affected?' })).structuredContent;
  assert.equal(open.asked, false);
  assert.equal(open.needsModel, true);
  assert.match(open.summary, /use_model: true .* confirm first\. It would spend up to \$0\.02; \$1\.97 is left this month\./);

  const refused = await call(server, 'unfold_ask', { id: '184', question: 'Is Firefox affected?', use_model: true });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /cannot ask you to confirm a spend, so no model was asked/);
  assert.deepEqual(unfold.posted.map(body => body.askModel === true), [false, false], 'no model Ask was ever posted');
});

test('unfold_ask asks a model only after the person accepts the confirmation over stdio', async t => {
  const unfold = askingUnfold(t);
  const url = await unfold.ready;
  for (const [decision, expectAsked] of [[{ action: 'accept', content: { confirm: true } }, true], [{ action: 'decline' }, false], [{ action: 'accept', content: { confirm: false } }, false]] as const) {
    unfold.posted.length = 0;
    const input = new PassThrough();
    const output = new PassThrough();
    const replies: any[] = [];
    let elicited: any;
    output.on('data', chunk => {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        const message = JSON.parse(line);
        if (message.method === 'elicitation/create') { elicited = message; input.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: decision })}\n`); }
        else replies.push(message);
      }
    });
    const served = serveStdio(createMcpServer({ url, token: `vle_${'d'.repeat(43)}` }), input, output);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: { elicitation: {} }, clientInfo: { name: 'claude-code', version: '2.1.296' } } })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'unfold_ask', arguments: { id: '184', question: 'Is Firefox affected?', use_model: true } } })}\n`);
    while (!replies.some(reply => reply.id === 2)) await new Promise(resolve => setTimeout(resolve, 10));
    input.end();
    await served;
    assert.match(elicited.params.message, /^Ask a model about Work Item 184\? One answer spends up to \$0\.02 from the Team's Ask Allowance \(\$1\.97 left until 2026-11-01\)/);
    const answer = replies.find(reply => reply.id === 2).result.structuredContent;
    assert.equal(answer.asked, expectAsked, JSON.stringify(decision));
    assert.equal(unfold.posted.some(body => body.askModel === true), expectAsked, 'a model Ask is posted only after an explicit yes');
    if (expectAsked) {
      const spent = unfold.headers[unfold.posted.findIndex(body => body.askModel === true)];
      assert.equal(spent.client, 'claude-code 2.1.296');
      assert.match(String(spent.confirmation), new RegExp(`^[A-Za-z0-9_-]{16}:${createHash('sha256').update(elicited.params.message).digest('hex')}$`));
    }
    if (!expectAsked) assert.equal(answer.summary, 'Not asked: the spend was not confirmed. Nothing was spent.');
  }
});

const modernMeta = (capabilities: Record<string, unknown> = {}) => ({ 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': capabilities });

test('unfold-mcp serves 2026-07-28 requests without a handshake: server/discover, _meta versions and resultType', async () => {
  const server = createMcpServer({ url: 'http://127.0.0.1:9', version: 'test' });
  const discovered = await server.handle({ jsonrpc: '2.0', id: 'd', method: 'server/discover', params: { _meta: modernMeta() } });
  assert.equal(discovered?.result.resultType, 'complete');
  assert.deepEqual(discovered?.result.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
  assert.deepEqual(discovered?.result.capabilities, { tools: {} });
  assert.match(discovered?.result.instructions, /Call unfold_now first/);
  assert.equal(discovered?.result._meta['io.modelcontextprotocol/serverInfo'].name, 'unfold-mcp');

  const listed = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: modernMeta() } });
  assert.equal(listed?.result.resultType, 'complete');
  assert.equal(listed?.result.tools.length, 9);
  assert.equal(typeof listed?.result.ttlMs, 'number');

  const legacy = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(legacy?.result.resultType, undefined, 'a 2025 request gets the 2025 result shape');

  const unsupported = await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { ...modernMeta(), 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } } });
  assert.equal(unsupported?.error.code, -32022);
  assert.deepEqual(unsupported?.error.data, { supported: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'], requested: '1900-01-01' });
  const noCapabilities = await server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } });
  assert.equal(noCapabilities?.error.code, -32602);
  const bareDiscover = await server.handle({ jsonrpc: '2.0', id: 5, method: 'server/discover' });
  assert.equal(bareDiscover?.error.code, -32602, 'server/discover without _meta is malformed');
});

test('unfold_ask over 2026-07-28 spends only after the person confirms through an input_required round trip', async t => {
  const unfold = askingUnfold(t);
  const url = await unfold.ready;
  const confirmations = confirmationLedger();
  const server = createMcpServer({ url, token: `vle_${'f'.repeat(43)}`, principal: 'user-a', confirmations });
  const ask = (id: number, extra: Record<string, unknown> = {}, capabilities: Record<string, unknown> = { elicitation: {} }, question = 'Is Firefox affected?', on = server) =>
    on.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'unfold_ask', arguments: { id: '184', question, use_model: true }, _meta: modernMeta(capabilities), ...extra } });

  const withoutElicitation = await ask(1, {}, {});
  assert.equal(withoutElicitation?.result.isError, true);
  assert.match(withoutElicitation?.result.content[0].text, /cannot ask you to confirm a spend, so no model was asked/);
  assert.equal((await ask(2, {}, { elicitation: { url: {} } }))?.result.isError, true, 'URL-only elicitation cannot confirm in a form');

  const pending = (await ask(3))?.result;
  assert.equal(pending.resultType, 'input_required');
  assert.equal(pending.inputRequests.confirm_spend.method, 'elicitation/create');
  assert.equal(pending.inputRequests.confirm_spend.params.mode, 'form');
  assert.match(pending.inputRequests.confirm_spend.params.message, /^Ask a model about Work Item 184\? One answer spends up to \$0\.02/);
  assert.equal(typeof pending.requestState, 'string');
  assert.equal(unfold.posted.length, 0, 'asking for confirmation posts nothing');

  const accept = { confirm_spend: { action: 'accept', content: { confirm: true } } };
  const tampered = `${pending.requestState.slice(0, -2)}AA`;
  assert.match((await ask(4, { inputResponses: accept, requestState: tampered }))?.result.content[0].text, /not one this server issued\. Nothing was asked or spent/);
  const other = createMcpServer({ url, token: `vle_${'f'.repeat(43)}`, principal: 'user-b', confirmations });
  assert.match((await ask(5, { inputResponses: accept, requestState: pending.requestState }, { elicitation: {} }, 'Is Firefox affected?', other))?.result.content[0].text, /given to someone else/);
  assert.match((await ask(6, { inputResponses: accept, requestState: pending.requestState }, { elicitation: {} }, 'Is Safari affected?'))?.result.content[0].text, /for another question/);
  assert.equal(unfold.posted.length, 0);

  const answered = (await ask(7, { inputResponses: accept, requestState: pending.requestState }))?.result;
  assert.equal(answered.resultType, 'complete');
  const agreedText = pending.inputRequests.confirm_spend.params.message;
  const spent = unfold.headers.at(-1)!;
  assert.equal(spent.client, 'test 1', 'the client named in _meta reaches Unfold');
  assert.match(String(spent.confirmation), new RegExp(`^[A-Za-z0-9_-]{22}:${createHash('sha256').update(agreedText).digest('hex')}$`), 'the confirmation names the exact text the person agreed to');
  assert.equal(answered.structuredContent.asked, true, JSON.stringify(answered));
  assert.deepEqual(unfold.posted.map(body => body.askModel), [true]);
  const replayed = (await ask(8, { inputResponses: accept, requestState: pending.requestState }))?.result;
  assert.match(replayed.content[0].text, /already used/);
  assert.equal(unfold.posted.length, 1, 'a confirmation spends at most once');

  const second = (await ask(9))?.result;
  const declined = (await ask(10, { inputResponses: { confirm_spend: { action: 'decline' } }, requestState: second.requestState }))?.result;
  assert.equal(declined.structuredContent.summary, 'Not asked: the spend was not confirmed. Nothing was spent.');
  assert.equal(unfold.posted.length, 1);
  assert.match((await ask(11, { inputResponses: accept, requestState: second.requestState }))?.result.content[0].text, /already used/, 'a declined confirmation cannot be accepted later');
  assert.equal(unfold.posted.length, 1);
});

test('an unfold_ask confirmation expires after 10 minutes and is refused after that, spending nothing', async t => {
  const unfold = askingUnfold(t);
  const url = await unfold.ready;
  let clock = Date.parse('2026-10-16T12:00:00Z');
  const server = createMcpServer({ url, token: `vle_${'g'.repeat(43)}`, principal: 'user-a', now: () => new Date(clock) });
  const ask = (id: number, extra: Record<string, unknown> = {}) => server.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'unfold_ask', arguments: { id: '184', question: 'Is Firefox affected?', use_model: true }, _meta: modernMeta({ elicitation: {} }), ...extra } });
  const accept = { confirm_spend: { action: 'accept', content: { confirm: true } } };
  const late = (await ask(1))?.result.requestState;
  clock += 600_001;
  assert.match((await ask(2, { inputResponses: accept, requestState: late }))?.result.content[0].text, /The confirmation expired\. Nothing was asked or spent/);
  const timely = (await ask(3))?.result.requestState;
  clock += 599_000;
  assert.equal((await ask(4, { inputResponses: accept, requestState: timely }))?.result.structuredContent.asked, true, 'within 10 minutes it still spends once');
  assert.deepEqual(unfold.posted.map(body => body.askModel), [true]);
});

test('unfold_digest reports only what changed since the cutoff, and remembers it for next time', async t => {
  const at = (hour: number) => `2026-10-13T${String(hour).padStart(2, '0')}:00:00Z`;
  const item = (id: string, state: string, updated: string, extra: Record<string, unknown> = {}) => ({ id, state, team: 'unfold', title: `Item ${id}`, provider: 'vikunja', externalId: id, url: '', attempts: 1, infraFailures: 0, createdAt: updated, updatedAt: updated, closeReason: state === 'needs_human' ? 'plan_exhausted' : null, latestShift: state === 'needs_human' ? { round: 1, closeReason: 'plan_exhausted', budgetUsd: 1, spentUsd: 0.2, reservedUsd: 0, closedAt: updated } : null, spentUsd: null, pullRequestUrl: '', target: null, ...extra });
  const fake = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/ploeg/now') return res.end(JSON.stringify({ demo: false, teams: ['unfold'], waiting: [item('1', 'needs_human', at(9)), item('2', 'needs_human', at(5)), item('3', 'awaiting_review', at(10)), item('4', 'proposed', at(11))], active: [], refused: [{ provider: 'vikunja', externalId: '9', team: 'unfold', title: 'Unroutable', code: 'label_missing', reason: 'No repo/ label', refusedAt: at(8), url: '' }], running: [], recent: [{ id: '70', workItemId: '3', workItemTitle: 'Item 3', team: 'unfold', role: 'writer', outcome: 'pr_opened', verdict: '', failureReason: '', finishedAt: at(10), settledUsd: 0.12 }, { id: '60', workItemId: '2', workItemTitle: 'Item 2', team: 'unfold', role: 'writer', outcome: 'stuck', finishedAt: at(4), settledUsd: 0.5 }], runningTruncated: false, recentTruncated: false, truncatedStates: [], errors: {}, fetchedAt: at(12) }));
    if (req.url?.startsWith('/api/ploeg/summary?window=')) return res.end(JSON.stringify({ demo: false, window: req.url.split('=')[1], teams: [], totals: { spend: { settledUsd: 0.6212, reservedUsd: 0 } }, unsettled: { count: 0, heldUsd: 0, accounts: [] }, unsettledError: null }));
    if (req.url === '/api/sessions') return res.end(JSON.stringify([{ id: 's1', status: 'completed', updatedAt: at(9), title: 'Fix login' }, { id: 's0', status: 'failed', updatedAt: at(2) }]));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve));
  t.after(() => fake.close());
  const address = fake.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const dir = await mkdtemp(join(tmpdir(), 'unfold-digest-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state', 'digest.json');
  const server = createMcpServer({ url, token: `vle_${'e'.repeat(43)}`, stateFile, now: () => new Date(at(12)) });

  const digest = (await call(server, 'unfold_digest', { since: at(6) })).structuredContent;
  assert.deepEqual(digest.needsYou.map((entry: { id: string }) => entry.id), ['1'], 'item 2 changed before the cutoff');
  assert.equal(digest.needsYou[0].reason.code, 'plan_exhausted');
  assert.deepEqual(digest.readyForReview.map((entry: { id: string }) => entry.id), ['3']);
  assert.deepEqual(digest.proposed.map((entry: { id: string }) => entry.id), ['4']);
  assert.deepEqual(digest.finishedRuns.map((run: { id: string; costUsd: number }) => [run.id, run.costUsd]), [['70', 0.12]]);
  assert.deepEqual(digest.sessions.map((session: { id: string }) => session.id), ['s1']);
  assert.deepEqual(digest.refused.map((task: { tracker: string }) => task.tracker), ['vikunja:9']);
  assert.equal(digest.counts.needsYou, 1);
  assert.match(digest.summary, /^Since 2026-10-13 06:00 UTC: 1 started needing you \(1: [^)]+\), 1 ready for review, 1 proposed, 1 Runs finished, 1 sessions changed, 1 tasks refused\. \$0\.62 settled in the last 24h; no budget is stuck\.$/);
  assert.equal(JSON.parse(await readFile(stateFile, 'utf8'))[url], '2026-10-13T12:00:00.000Z');

  const later = createMcpServer({ url, token: `vle_${'e'.repeat(43)}`, stateFile, now: () => new Date('2026-10-13T12:30:00Z') });
  const nextCall = await call(later, 'unfold_digest', {});
  assert.equal(nextCall.isError, undefined, JSON.stringify(nextCall.content));
  const next = nextCall.structuredContent;
  assert.equal(next.since, '2026-10-13T12:00:00.000Z', 'the next digest starts where the previous one ended');
  assert.match(next.summary, /nothing changed/);

  const peek = (await call(later, 'unfold_digest', { since: '7d', remember: false })).structuredContent;
  assert.equal(peek.since, '2026-10-06T12:30:00.000Z');
  assert.equal(JSON.parse(await readFile(stateFile, 'utf8'))[url], '2026-10-13T12:30:00.000Z', 'remember: false leaves the previous digest');
  assert.equal((await call(later, 'unfold_digest', { since: '90d' })).isError, true);
});

test('unfold-mcp links and unlinks the caller’s agent session with PUT and DELETE, and lists Linked Sessions of a Work Item', async () => {
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  const session = { id: 'abcd1234-session', harness: 'claude-code', ownerName: 'ryan', state: 'working', waitingFor: '', lastSeenAt: '2026-10-17T10:00:00.000Z', link: 'https://unfold.example.org/#linked-session/abcd1234-session', resume: 'claude --resume abcd1234-session', workItems: [{ id: '184', how: 'explicit' }], aiLines: 12, commits: [{ sha: 'a'.repeat(40), subject: 'fix', aiLines: 12, files: 1, trailer: true }], pullRequests: [], title: 'Fix login', branch: 'feat/vik-2051', repository: 'forgejo.example.org:webgrip/unfold.git' };
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ method: String(init.method), url: String(url), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(String(init.method) === 'GET' ? { sessions: [session] } : { session }), { status: 200 });
  }) as typeof fetch;
  const server = createMcpServer({ url: 'https://unfold.example.org', token: 'vle_test', fetch: fetcher });
  const linked = await call(server, 'unfold_link_session', { session_id: 'abcd1234-session', id: 'https://unfold.example.org/#work/184' });
  assert.match(linked.structuredContent.summary, /linked to Work Item 184/);
  assert.deepEqual([calls[0].method, calls[0].url, calls[0].headers['x-unfold-request']], ['PUT', 'https://unfold.example.org/api/linked-sessions/abcd1234-session/work-items/184', '1']);
  await call(server, 'unfold_link_session', { session_id: 'abcd1234-session', id: '184', unlink: true });
  assert.equal(calls[1].method, 'DELETE');
  const refused = await call(server, 'unfold_link_session', { session_id: '../x', id: '184' });
  assert.equal(refused.isError, true);
  const listed = await call(server, 'unfold_linked_sessions', { id: '184' });
  assert.equal(calls.at(-1)!.url, 'https://unfold.example.org/api/linked-sessions?workItemId=184');
  assert.equal(listed.structuredContent.sessions[0].untrusted.title, 'Fix login');
  assert.match(listed.structuredContent.summary, /1 linked sessions on Work Item 184; 1 working or waiting/);
});
