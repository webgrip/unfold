import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { application } from './api-support.ts';
import { createMcpServer, serveStdio } from '../src/mcp.ts';

async function call(server: ReturnType<typeof createMcpServer>, name: string, args: Record<string, unknown> = {}) {
  const answer = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  assert(answer && 'result' in answer, JSON.stringify(answer));
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
  assert.deepEqual(listed?.result.tools.map((tool: { name: string }) => tool.name), ['unfold_now', 'unfold_find_work', 'unfold_get_work', 'unfold_sessions', 'unfold_spend']);
  for (const tool of listed?.result.tools ?? []) {
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
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
  assert.equal(lines[3].result.tools.length, 5);
});

test('unfold_spend names the Work Items whose finished Runs still hold budget, and says when it cannot tell', async t => {
  let unsettled: unknown = { count: 1, heldUsd: 0.25, accounts: [{ runId: '264', workItemId: '184', team: 'unfold', accountState: 'blocked', heldUsd: 0.25, since: '2026-10-10T20:01:39Z' }] };
  let unsettledError: unknown = null;
  const fake = createServer((req, res) => {
    assert.equal(req.url, '/api/ploeg/summary?window=7d');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ demo: false, window: '7d', teams: [{ team: 'unfold', workItems: { needsHuman: 1 }, runs: { finished: 3, failed: 1, stuck: 1 }, spend: { settledUsd: 0.3238, reservedUsd: 0.25 } }], totals: { spend: { settledUsd: 0.3238, reservedUsd: 0.25 } }, unsettled, unsettledError }));
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
  assert.deepEqual(spend.teams[0], { team: 'unfold', settledUsd: 0.32, reservedUsd: 0.25, needsHuman: 1, runsFinished: 3, runsFailed: 1, runsStuck: 1 });

  unsettled = null;
  unsettledError = { code: 'ploeg_unavailable', message: 'Ploeg could not list the Runs whose budget it cannot release.' };
  const unknown = (await call(server, 'unfold_spend')).structuredContent;
  assert.equal(unknown.stuckHolds, null, 'an unreadable list is never reported as zero stuck');
  assert.match(unknown.summary, /Stuck holds unknown: Ploeg could not list/);
});
