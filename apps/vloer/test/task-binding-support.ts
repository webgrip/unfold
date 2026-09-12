import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { application, login, request } from './api-support.ts';
import type { TaskTarget } from '../src/tasks.ts';
import type { AgentRuntime, Session } from '../src/types.ts';

export const target: TaskTarget = { forge: 'forge', owner: 'team', repo: 'orders', baseBranch: 'main' };
export const itemId = '9007199254740993';

export function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

export async function fixture(t: Pick<TestContext, 'after'>, provider: 'vikunja' | 'clickup' = 'vikunja') {
  const env = `VLOER_TRACKER_BINDING_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  const token = randomBytes(24).toString('hex');
  const linkedToken = randomBytes(24).toString('hex');
  const suffix = provider === 'vikunja' ? '/api/v1' : '/api/v2';
  process.env[env] = token;
  const state = { task: { id: 17, project_id: 42, title: 'Fix the rounding regression', description: 'Use the current order service and retain test evidence.', done: false, updated: '2026-09-11T10:00:00Z' }, rowUpdated: '2026-09-11T10:01:00Z', target: { ...target }, lookups: 0, sourceReads: [] as string[], admissions: [] as any[], unavailable: false, conflict: false, admissionResponseLost: false, nativeMismatch: false, singletonMismatch: false, lookupGate: undefined as ReturnType<typeof deferred> | undefined, execution: undefined as any, prepared: 0, inference: 0 };
  let base = '';
  const remote = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const send = (data: unknown, code = 200) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (url.pathname === '/api/v1/tasks') return send([state.task]);
    if (url.pathname === '/api/v1/tasks/17' || url.pathname === '/api/v2/task/17') { state.sourceReads.push(String(req.headers.authorization)); return send(provider === 'vikunja' ? state.task : { id: String(state.task.id), list: { id: String(state.task.project_id) }, name: state.task.title, markdown_description: state.task.description, status: { type: state.task.done ? 'closed' : 'open' }, date_updated: String(Date.parse(state.task.updated)) }); }
    if (req.headers.authorization !== `Bearer ${token}`) return send({}, 401);
    if (state.unavailable) return send({}, 503);
    if (url.pathname === '/api/v1/operator/work-items/lookup') {
      state.lookups++;
      await state.lookupGate?.promise;
      assert.equal(url.searchParams.get('provider'), provider);
      assert.equal(url.searchParams.get('externalId'), '17');
      assert.equal(url.searchParams.get('scope'), '42');
      assert.equal(url.searchParams.get('baseUrl'), `${base}${suffix}`);
      if (state.conflict) return send({}, 409);
      const source = { workItemId: itemId, provider, externalId: '17', expectedBaseUrl: state.singletonMismatch ? 'https://different.invalid/api/v1' : `${base}${suffix}`, expectedScope: '42', expectedRevision: state.nativeMismatch ? 'different-revision' : provider === 'vikunja' ? state.task.updated : String(Date.parse(state.task.updated)), expectedUpdatedAt: state.rowUpdated, expectedTarget: state.target };
      return send({ schemaVersion: '1.0', source, item: { id: itemId, provider: source.provider, externalId: '17', revision: source.expectedRevision, updatedAt: state.rowUpdated, state: 'queued', team: 'delivery', target: state.target } });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
    if (url.pathname === '/api/v1/operator/executions' && req.method === 'POST') {
      state.admissions.push(input);
      state.execution ??= { id: randomBytes(16).toString('hex'), sessionId: input.sessionId, workItemId: input.source?.workItemId ?? '99', actor: req.headers['x-ploeg-actor'], team: 'delivery', demo: false, state: 'admitted', revision: 1, generation: 1, supervision: 'human', stopConfirmed: true, expiresAt: new Date(Date.now() + 60000).toISOString() };
      if (state.admissionResponseLost) { state.admissionResponseLost = false; return send({}, 503); }
      return send({ schemaVersion: '1.0', execution: state.execution });
    }
    if (!state.execution || !url.pathname.includes(state.execution.id)) return send({}, 404);
    if (url.pathname.endsWith('/commands')) {
      if (input.action === 'start') { state.execution.state = 'running'; state.execution.stopConfirmed = false; state.execution.generation++; }
      if (input.action === 'cancel') state.execution.state = 'cancel_requested';
      if (input.action === 'report') { state.execution.state = input.state; state.execution.stopConfirmed = input.stopConfirmed ?? state.execution.stopConfirmed; }
      state.execution.revision++;
      return send({ schemaVersion: '1.0', execution: state.execution });
    }
    if (url.pathname.endsWith('/credential')) { state.inference++; return send({ schemaVersion: '1.0', credential: { key: randomBytes(32).toString('hex'), reference: state.execution.id, alias: 'test-only', budgetUsd: 3 } }); }
    if (url.pathname.endsWith('/spend')) return send({ schemaVersion: '1.0', costStatus: 'unknown', observedUsd: null, capabilityState: 'issued' });
    if (url.pathname.endsWith('/block')) return send({ schemaVersion: '1.0', blocked: true });
    return send({ schemaVersion: '1.0', execution: state.execution });
  });
  await new Promise<void>(resolve => remote.listen(0, '127.0.0.1', resolve));
  const address = remote.address(); assert(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}`;
  const runtime: AgentRuntime = {
    kind: 'opencode',
    async prepare(session) { state.prepared++; return { id: session.id, backend: 'kubernetes', directory: '/test-only' }; },
    async execute(context) { await delay(60000, undefined, { signal: context.signal }); return { summary: 'No inference performed by the controlled runtime.', artifacts: [] }; },
    async interrupt() {}, async dispose() {},
  };
  const server = await application('live', config => {
    config.repositories[0] = { ...config.repositories[0], url: 'https://forge.example/team/orders.git', executionOwner: 'ploeg' };
    config.taskSources = [{ id: 'board', name: 'Engineering', provider, baseUrl: `${base}${suffix}`, project: '42', repositoryId: 'order-service', ...(provider === 'vikunja' ? { token } : {}), executionOwner: 'ploeg', ploeg: { target } }];
    config.ploeg = { url: base, tokenEnv: env, teams: ['delivery'], userTeams: { outsider: ['delivery'] } };
    config.execution = { team: 'delivery', heartbeatMs: 20000 };
    config.runtime.briefCheck = false;
    config.litellm = { baseUrl: `${base}/gateway`, adminUrl: `${base}/admin`, masterKey: '', models: ['coding'], ttl: '1h', settlementDelayMs: 0 };
  }, new Map([['opencode', runtime]]));
  const admin = await login(server.url);
  if (provider === 'clickup') server.app.store.setSecret(`link:clickup:${admin.user.id}`, { accessToken: linkedToken, method: 'token' });
  t.after(async () => { state.lookupGate?.resolve(); await server.close(); await new Promise<void>(resolve => { remote.close(() => resolve()); remote.closeAllConnections(); }); delete process.env[env]; });
  const preview = async (cookie = admin.cookie) => { const result = await request(server.url, '/api/task-sources/board/tasks/17', { cookie }); assert.equal(result.status, 200, result.text); return result.body; };
  const importTask = (task: any, cookie = admin.cookie) => request(server.url, '/api/task-imports', { method: 'POST', cookie, body: { sourceId: 'board', taskId: '17', revision: task.revision, bindingRevision: task.bindingRevision, crewId: 'delivery', runtime: 'opencode', budgetUsd: 3 } });
  const imported = async (cookie = admin.cookie) => { const task = await preview(cookie); const result = await importTask(task, cookie); assert.equal(result.status, 201, result.text); return result.body as Session; };
  const start = (session: Session) => request(server.url, `/api/sessions/${session.id}/start`, { method: 'POST', cookie: admin.cookie });
  return { state, server, admin, preview, importTask, imported, start };
}
