import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { application, login, request } from './api-support.ts';

const allowance = { purpose: 'ask', scopeKind: 'team', scopeId: 'delivery', periodStart: '2026-10-01T00:00:00Z', resetAt: '2026-11-01T00:00:00Z', limitUsd: 2, settledUsd: 0.01, heldUsd: 0.02, remainingUsd: 1.97, askCount: 2, askBudgetUsd: 0.02, asksEnabled: true };

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
}

async function listen(t: TestContext, handler: Parameters<typeof createServer>[1]) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function live(t: TestContext, { exhausted = false } = {}) {
  const env = `UNFOLD_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  t.after(() => { delete process.env[env]; });
  const calls: { method: string; path: string; actor?: string; body?: any }[] = [];
  const prompts: any[] = [];
  const ploegUrl = await listen(t, async (req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const data = await body(req);
    calls.push({ method: req.method!, path: url.pathname, actor: req.headers['x-ploeg-actor'] as string | undefined, body: data });
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const send = (status: number, payload: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...payload }));
    const ask = (askId: string) => ({ askId, runId: '900', workItemId: '101', team: 'delivery', actor: 'operator-ryan', askedBy: 'operator-ryan', state: 'finished', budgetUsd: 0.02, questionSha256: 'a'.repeat(64), createdAt: '2026-10-10T10:00:00Z', expiresAt: '2026-10-10T10:02:00Z', finishedAt: null, spend: { costStatus: 'settled', usd: 0.0012, keyState: 'reconciled' } });
    if (url.pathname.endsWith('/teams')) return send(200, { teams: ploegDemo.teams });
    if (url.pathname.endsWith('/operator/allowances')) return send(200, { allowance });
    const admit = /\/work-items\/(\d+)\/asks$/.exec(url.pathname);
    if (admit && req.method === 'POST') {
      if (exhausted) return send(402, { error: { code: 'allowance_exhausted', message: 'used up' }, allowance: { ...allowance, remainingUsd: 0 } });
      return send(201, { created: true, ask: { ...ask(data.askId), state: 'open' }, credential: { key: 'sk-ask-capped', alias: 'ask-1', models: ['glm-5.3-flash'], budgetUsd: 0.02, expiresAt: '2026-10-10T10:02:00Z' }, allowance });
    }
    const one = /\/work-items\/(\d+)\/asks\/([^/]+)(\/finish)?$/.exec(url.pathname);
    if (one) return send(200, { ask: ask(decodeURIComponent(one[2])), ...(one[3] ? { blocked: true } : {}) });
    const id = url.pathname.split('/').at(-1)!;
    const detail = ploegDemo.details[id];
    if (detail && id === '101' && detail.runs[0]) return send(200, { ...detail, runs: [...detail.runs, { ...detail.runs[0], id: '900', role: 'ask', writes: false, shiftId: null, round: 0 }] });
    if (detail) return send(200, detail);
    res.writeHead(404).end();
  });
  const gatewayUrl = await listen(t, async (req, res) => {
    prompts.push({ auth: req.headers.authorization, body: await body(req) });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'It is done and merged.' } }] }));
  });
  const operatorId = 'operator-ryan';
  const api = await application('live', config => {
    config.ploeg = { url: ploegUrl, tokenEnv: env, userTeams: { [operatorId]: ['delivery'] } };
    config.litellm = { baseUrl: gatewayUrl, adminUrl: gatewayUrl, masterKey: 'sk-master-never-used', models: ['coding'], ttl: '1h' };
  });
  t.after(() => api.close());
  api.app.store.addUser({ id: operatorId, name: 'ryan@example.test', role: 'viewer', passwordHash: hashPassword('viewer-password-1414') });
  const { cookie } = await login(api.url, 'ryan@example.test', 'viewer-password-1414');
  return { api, cookie, calls, prompts };
}

test('live: a viewer asks, Ploeg admits it as them, the gateway answers with the capped key, and the Ask is finished', async t => {
  const { api, cookie, calls, prompts } = await live(t);
  const asked = await request(api.url, '/api/ploeg/work-items/101/asks', { method: 'POST', cookie, body: { question: 'Is it merged yet?' } });
  assert.equal(asked.status, 201, asked.text);
  assert.equal(asked.body.status, 'answered');
  assert.equal(asked.body.answer, 'It is done and merged.');
  assert.equal(asked.body.demo, false);
  const admit = calls.find(call => call.method === 'POST' && call.path.endsWith('/work-items/101/asks'));
  assert.deepEqual(admit?.body, { askId: asked.body.id, question: 'Is it merged yet?' });
  assert.equal(admit?.actor, 'operator-ryan');
  assert.ok(calls.some(call => call.method === 'POST' && call.path.endsWith(`/asks/${asked.body.id}/finish`)), 'the Ask is finished so Ploeg blocks its key');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].auth, 'Bearer sk-ask-capped');
  assert.equal(prompts[0].body.model, 'glm-5.3-flash');
  assert.doesNotMatch(asked.text, /sk-ask-capped/, 'the key never reaches the browser');
  const listed = await request(api.url, '/api/ploeg/work-items/101/asks', { cookie });
  assert.equal(listed.status, 200, listed.text);
  assert.deepEqual([listed.body.asks[0].costUsd, listed.body.asks[0].costStatus], [0.0012, 'settled']);
  assert.equal(listed.body.allowance.remainingUsd, 1.97);
  assert.equal(listed.body.allowance.resetAt, '2026-11-01T00:00:00Z');
});

test('live: a used-up allowance refuses the Ask before any model call', async t => {
  const { api, cookie, prompts } = await live(t, { exhausted: true });
  const asked = await request(api.url, '/api/ploeg/work-items/101/asks', { method: 'POST', cookie, body: { question: 'Is it merged yet?' } });
  assert.equal(asked.status, 201, asked.text);
  assert.equal(asked.body.status, 'refused');
  assert.equal(asked.body.failure, 'Ask Allowance used up. It resets on 1 November.');
  assert.equal(prompts.length, 0);
});

test('live: a Work Item outside the caller\'s Teams is not found and Ploeg admits nothing', async t => {
  const { api, cookie, calls } = await live(t);
  const outside = Object.values(ploegDemo.details).find(detail => detail.item.team !== 'delivery')!.item.id;
  const asked = await request(api.url, `/api/ploeg/work-items/${outside}/asks`, { method: 'POST', cookie, body: { question: 'Where?' } });
  assert.equal(asked.status, 404, asked.text);
  assert.ok(!calls.some(call => call.method === 'POST' && call.path.endsWith('/asks')));
});

test('live: Ask Runs stay off the Work Item\'s Runs and the Runs list; the Ask card shows them', async t => {
  const { api, cookie } = await live(t);
  const before = await request(api.url, '/api/ploeg/work-items/101', { cookie });
  assert.equal(before.status, 200, before.text);
  assert.ok(before.body.runs.every((run: { role: string }) => run.role !== 'ask'));
});

test('live: a standing question is answered from the record with no admission, and askModel asks the model anyway', async t => {
  const { api, cookie, calls, prompts } = await live(t);
  const admitted = () => calls.filter(call => call.method === 'POST' && /\/work-items\/101\/asks$/.test(call.path)).length;
  const record = await request(api.url, '/api/ploeg/work-items/101/asks', { method: 'POST', cookie, body: { question: 'Why did it stop?' } });
  assert.equal(record.status, 201, record.text);
  assert.deepEqual([record.body.status, record.body.source, record.body.intent, record.body.costUsd, record.body.costStatus], ['answered', 'record', 'stopped', 0, 'settled']);
  assert.equal(admitted(), 0);
  assert.equal(prompts.length, 0);
  const anyway = await request(api.url, '/api/ploeg/work-items/101/asks', { method: 'POST', cookie, body: { question: 'Why did it stop?', askModel: true } });
  assert.equal(anyway.status, 201, anyway.text);
  assert.deepEqual([anyway.body.source, anyway.body.answer], ['model', 'It is done and merged.']);
  assert.equal(admitted(), 1);
  assert.equal(prompts.length, 1);
});
