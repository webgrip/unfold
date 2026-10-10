import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { application, createInput, login, request } from './api-support.ts';
import { deadlineAfter, settle } from './timeframes.ts';
import { ExecutionAuthority } from '../src/execution-authority.ts';
import type { AgentRuntime, Credential, ExecutionContext, ExecutionResult, Repository, RepositoryMcp, Session, User } from '../src/types.ts';

const owner: User = { id: 'owner', name: 'Owner', role: 'operator' };
const outsider: User = { id: 'outsider', name: 'Outsider', role: 'operator' };

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function until(predicate: () => boolean, reason: string) { const deadline = deadlineAfter(15_000); while (!predicate()) { if (Date.now() >= deadline) assert.fail(reason); await delay(5); } }

class ControlledExecution implements AgentRuntime {
  readonly kind = 'opencode';
  prepared: { session: string; key?: string; workspace: string; mcp?: RepositoryMcp }[] = [];
  calls = 0;
  interrupted = 0;
  aborted = 0;
  stopFails = false;
  finishImmediately = false;
  beforeResult?: (context: ExecutionContext) => Promise<void> | void;
  onStart?: (context: ExecutionContext) => void;
  async prepare(session: Session, repository: Repository, credential: Credential | undefined) {
    const workspace = session.workspace?.id || `workspace-${session.id}`;
    this.prepared.push({ session: session.id, key: credential?.key, workspace, mcp: repository.mcp });
    return { id: workspace, backend: 'kubernetes' as const, directory: '/managed' };
  }
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.calls++;
    this.onStart?.(context);
    if (!this.finishImmediately) {
      try { await delay(60000, undefined, { signal: context.signal }); }
      catch (error) { this.aborted++; throw error; }
    }
    await this.beforeResult?.(context);
    return { summary: 'Controlled runtime verification, without model inference.', artifacts: [], ...(context.role.mode === 'read' ? { verdict: 'approve' as const } : {}) };
  }
  async interrupt() { this.interrupted++; if (this.stopFails) throw new Error('Fixture cannot confirm remote interruption'); }
  async dispose() {}
}

type RemoteExecution = { id: string; workItemId: string; sessionId: string; actor: string; team: string; demo: boolean; state: string; revision: number; generation: number; supervision: string; expiresAt: string; stopConfirmed: boolean; closed?: boolean };
async function governed(t: TestContext) {
  const env = `UNFOLD_EXECUTION_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  const consumerToken = randomBytes(24).toString('hex');
  const inferenceKey = randomBytes(32).toString('hex');
  const forbiddenMaster = randomBytes(32).toString('hex');
  process.env[env] = consumerToken;
  const state = { unavailable: false, admissionGate: undefined as ReturnType<typeof deferred> | undefined, commandGate: undefined as ReturnType<typeof deferred> | undefined, commandGates: new Map<string, ReturnType<typeof deferred>>(), credentialGate: undefined as ReturnType<typeof deferred> | undefined, credentialStates: [] as string[], failCommands: new Set<string>(), afterApplyFailure: new Set<string>(), admissions: 0, credentialRequests: 0, blocks: 0, gatewayRequests: 0, commandAttempts: [] as { id: string; action: string }[], remote: undefined as RemoteExecution | undefined, capability: 'reserved', dropAdmissionResponse: false, leaseMs: 60000, revisions: [] as { revision: number; at: string; actor: string; kind: string; detail: object }[] };
  const receipts = new Map<string, RemoteExecution>();
  const api = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith('/gateway')) { state.gatewayRequests++; res.writeHead(500).end(); return; }
      if (req.headers.authorization !== `Bearer ${consumerToken}`) { res.writeHead(401).end(); return; }
      if (state.unavailable) { res.writeHead(503).end(); return; }
      const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
      const chunks: Buffer[] = [];
      for await (const chunk of req) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 65536) throw new Error('Oversized fixture input'); }
      const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      if (req.method === 'POST' && req.url === '/api/v1/operator/executions') {
        state.admissions++;
        if (state.admissionGate) await state.admissionGate.promise;
        state.remote ??= { id: randomBytes(16).toString('hex'), workItemId: '9007199254740993', sessionId: input.sessionId, actor: String(req.headers['x-ploeg-actor']), team: input.team, demo: input.demo, state: 'admitted', revision: 1, generation: 1, supervision: 'human', expiresAt: new Date(Date.now() + state.leaseMs).toISOString(), stopConfirmed: true };
        if (state.dropAdmissionResponse) { state.dropAdmissionResponse = false; res.writeHead(503).end(); return; }
        send({ execution: state.remote }); return;
      }
      if (!state.remote || !req.url?.includes(state.remote.id)) { res.writeHead(404).end(); return; }
      if (req.url.endsWith('/commands')) {
        state.commandAttempts.push({ id: input.commandId, action: input.action });
        if (state.failCommands.has(input.action)) { res.writeHead(503).end(); return; }
        const known = receipts.get(input.commandId);
        if (known) { send({ execution: known }); return; }
        if (input.expectedRevision !== state.remote.revision || input.generation !== state.remote.generation) { res.writeHead(409).end(); return; }
        if (input.action === 'start' && state.commandGate) await state.commandGate.promise;
        await state.commandGates.get(input.action)?.promise;
        if (input.action === 'start' || input.action === 'resume') {
          if (!['admitted', 'paused', 'interrupted'].includes(state.remote.state) || !state.remote.stopConfirmed) { res.writeHead(409).end(); return; }
          state.remote.state = 'running'; state.remote.generation++; state.remote.stopConfirmed = false;
        } else if (input.action === 'pause') state.remote.state = 'pause_requested';
        else if (input.action === 'cancel') state.remote.state = 'cancel_requested';
        else if (input.action === 'report') { state.remote.state = input.state; state.remote.stopConfirmed = input.stopConfirmed ?? state.remote.stopConfirmed; }
        else if (input.action === 'handback') state.remote.supervision = 'background';
        else if (input.action === 'take-control') state.remote.supervision = 'human';
        else if (input.action === 'close') {
          if (state.remote.state !== 'failed' || state.remote.closed) { res.writeHead(409).end(); return; }
          state.remote.closed = true;
        }
        state.remote.revision++;
        state.remote.expiresAt = new Date(Date.now() + state.leaseMs).toISOString();
        receipts.set(input.commandId, structuredClone(state.remote));
        state.revisions.push({ revision: state.remote.revision, at: new Date().toISOString(), actor: state.remote.actor, kind: `execution.${input.action}`, detail: { state: state.remote.state } });
        if (state.afterApplyFailure.delete(input.action)) { res.writeHead(503).end(); return; }
        send({ execution: state.remote }); return;
      }
      if (req.url.includes(`${state.remote.id}/events`)) { send({ events: state.revisions, nextCursor: state.revisions.at(-1)?.revision ?? 0, hasMore: false }); return; }
      if (req.url.endsWith('/spend')) { send({ capabilityState: state.capability, costStatus: 'unknown', observedUsd: null }); return; }
      if (req.url.endsWith('/credential')) {
        state.credentialRequests++;
        if (state.capability !== 'reserved') { res.writeHead(409).end(); return; }
        state.capability = 'issued';
        state.credentialStates.push(state.remote.state);
        if (state.credentialGate) await state.credentialGate.promise;
        send({ credential: { key: inferenceKey, alias: 'scoped-fixture', reference: state.remote.id, budgetUsd: 2 } }); return;
      }
      if (req.url.endsWith('/block')) { state.blocks++; state.capability = 'blocked'; send({ blocked: true }); return; }
      if (req.method === 'GET') { send({ execution: state.remote }); return; }
      res.writeHead(404).end();
    } catch { res.writeHead(500).end(); }
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const address = api.address(); assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const runtime = new ControlledExecution();
  let configured: any;
  const server = await application('live', config => {
    configured = config;
    config.ploeg = { url, tokenEnv: env, teams: ['delivery'], userTeams: { owner: ['delivery'] } };
    config.execution = { team: 'delivery', heartbeatMs: 1000 };
    config.runtime.briefCheck = false;
    config.litellm = { baseUrl: `${url}/gateway/v1`, adminUrl: `${url}/gateway`, masterKey: forbiddenMaster, models: ['coding'], ttl: '1h', settlementDelayMs: 0 };
  }, new Map([['opencode', runtime]]));
  t.after(async () => { state.admissionGate?.resolve(); state.commandGate?.resolve(); for (const gate of state.commandGates.values()) gate.resolve(); state.credentialGate?.resolve(); state.unavailable = false; state.failCommands.clear(); await server.close(); await new Promise<void>(resolve => api.close(() => resolve())); delete process.env[env]; });
  const create = () => server.app.engine.create(createInput({ runtime: 'opencode', budgetUsd: 2 }) as any, owner);
  return { state, runtime, server, create, inferenceKey, consumerToken, forbiddenMaster, env, config: configured };
}

test('governed execution refuses unavailable authority and unmapped users before workspace or inference access', async t => {
  const f = await governed(t);
  assert.equal(f.server.app.engine.broker, undefined, 'a governed workbench must not create a local master broker');
  assert.throws(() => f.server.app.engine.create(createInput({ runtime: 'opencode' }) as any, outsider), { code: 'execution_scope' });
  const session = f.create();
  f.state.unavailable = true;
  await assert.rejects(f.server.app.engine.start(session.id, owner), { code: 'execution_unconfirmed' });
  assert.equal(f.server.app.store.getSession(session.id)?.status, 'queued');
  assert.equal(f.runtime.prepared.length, 0);
  assert.equal(f.runtime.calls, 0);
  assert.equal(f.state.credentialRequests, 0);
  assert.equal(f.state.gatewayRequests, 0);
});

test('concurrent starts reserve one execution and one bounded capability; pause and resume reuse identity, workspace and credential', async t => {
  const f = await governed(t);
  const session = f.create();
  f.state.admissionGate = deferred();
  const first = f.server.app.engine.start(session.id, owner);
  await until(() => f.state.admissions === 1, 'admission did not arrive');
  await assert.rejects(f.server.app.engine.start(session.id, owner), { code: 'already_running' });
  f.state.admissionGate.resolve(); await first;
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  const executionId = f.server.app.store.getSession(session.id)!.execution!.id;
  assert.equal(f.state.credentialRequests, 1);
  const paused = await f.server.app.engine.pause(session.id, owner);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.execution?.state, 'paused');
  assert.equal(paused.execution?.stopConfirmed, true);
  assert.equal(f.state.capability, 'issued');
  assert.equal(f.state.blocks, 0);
  assert.equal(f.runtime.aborted, 1);
  await f.server.app.engine.message(session.id, 'Use the same retained repository and acceptance criteria.', owner);
  await f.server.app.engine.resume(session.id, owner);
  await until(() => f.runtime.calls === 2, 'runtime did not explicitly resume');
  assert.equal(f.state.admissions, 1);
  assert.equal(f.state.credentialRequests, 1);
  assert.equal(f.server.app.store.getSession(session.id)?.execution?.id, executionId);
  assert.equal(new Set(f.runtime.prepared.map(value => value.workspace)).size, 1);
  assert(f.runtime.prepared.every(value => value.key === f.inferenceKey && value.key !== f.consumerToken && value.key !== f.forbiddenMaster), 'workspace received an incorrect credential');
  const publicJson = (await request(f.server.url, `/api/sessions/${session.id}`, await login(f.server.url))).text;
  assert(![f.inferenceKey, f.consumerToken, f.forbiddenMaster].some(value => publicJson.includes(value)), 'public projection leaked a credential');
  const cancelled = await f.server.app.engine.cancel(session.id, owner);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.execution?.state, 'cancelled');
  assert.equal(f.state.capability, 'blocked');
  assert.equal(f.state.gatewayRequests, 0);
});

test('blocked inference capability cannot resume or silently mint a replacement', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  await f.server.app.engine.pause(session.id, owner);
  f.state.capability = 'blocked';
  await assert.rejects(f.server.app.engine.resume(session.id, owner), { code: 'inference_blocked' });
  assert.equal(f.runtime.calls, 1);
  assert.equal(f.state.credentialRequests, 1);
  assert.equal(f.server.app.store.getSession(session.id)?.status, 'paused');
});

test('uncertain durable commands retain command identity and an outage preserves intentional cancellation', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  f.state.afterApplyFailure.add('message');
  await assert.rejects(Promise.resolve(f.server.app.engine.message(session.id, 'Retain this instruction exactly once.', owner)), { code: 'execution_unconfirmed' });
  await f.server.app.engine.message(session.id, 'Retain this instruction exactly once.', owner);
  const messages = f.state.commandAttempts.filter(command => command.action === 'message');
  assert.equal(messages.length, 2);
  assert.equal(new Set(messages.map(command => command.id)).size, 1);
  assert.equal(f.server.app.store.events(session.id).filter(event => event.type === 'message').length, 1);
  f.state.unavailable = true;
  const cancelled = await f.server.app.engine.cancel(session.id, owner);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(f.runtime.aborted, 1);
  assert.equal(f.server.app.store.getSecret(`stop-intent:${session.id}`), 'cancelled');
  assert.equal(f.server.app.store.getSecret(`authority-unresolved:${session.id}`), true);
  await assert.rejects(f.server.app.engine.resume(session.id, owner), { code: 'invalid_state' });
  assert.equal(f.runtime.calls, 1);
});

test('restart interrupts active governed work and cannot automatically repeat paid execution', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  const executionId = f.state.remote!.id;
  await f.server.restart();
  await until(() => f.server.app.store.getSession(session.id)?.status === 'interrupted', 'restart did not retain interrupted state');
  assert.equal(f.runtime.calls, 1);
  assert.equal(f.state.admissions, 1);
  assert.equal(f.state.credentialRequests, 1);
  assert.equal(f.server.app.store.getSession(session.id)?.execution?.id, executionId);
  await assert.rejects(f.server.app.engine.resume(session.id, owner), error => ['stopping', 'inference_unresolved', 'inference_blocked'].includes(String((error as any).code)));
  assert.equal(f.runtime.calls, 1);
});

test('pause then explicit resume can complete without carrying the previous pause intent forward', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  await f.server.app.engine.pause(session.id, owner);
  f.runtime.finishImmediately = true;
  await f.server.app.engine.resume(session.id, owner);
  await until(() => f.server.app.store.getSession(session.id)?.execution?.state === 'completed', 'resumed execution retained stale pause intent instead of completing');
  assert.equal(f.server.app.store.getSession(session.id)?.status, 'completed');
  assert.equal(f.state.credentialRequests, 1);
  assert.equal(f.server.app.store.getSecret(`stop-intent:${session.id}`), undefined);
});

test('cancelling while admission is pending cannot resurrect the local session or begin model access', async t => {
  const f = await governed(t); const session = f.create();
  f.state.admissionGate = deferred();
  const start = f.server.app.engine.start(session.id, owner).then(() => undefined, () => undefined);
  await until(() => f.state.admissions === 1, 'admission did not arrive');
  await f.server.app.engine.cancel(session.id, owner);
  f.state.admissionGate.resolve(); await start;
  await settle(30);
  assert.equal(f.server.app.store.getSession(session.id)?.status, 'cancelled');
  assert.equal(f.runtime.calls, 0);
  assert.equal(f.runtime.prepared.length, 0);
  assert.equal(f.state.credentialRequests, 0);
});

test('unconfirmed interruption blocks the existing capability and prevents paid resume until reconciled', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  f.runtime.stopFails = true;
  const paused = await f.server.app.engine.pause(session.id, owner);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.execution?.stopConfirmed, false);
  assert.equal(f.state.capability, 'blocked');
  await assert.rejects(f.server.app.engine.resume(session.id, owner), { code: 'interrupt_unconfirmed' });
  f.runtime.stopFails = false;
  await assert.rejects(f.server.app.engine.resume(session.id, owner), { code: 'inference_blocked' });
  assert.equal(f.runtime.calls, 1);
  assert.equal(f.state.credentialRequests, 1);
});

test('expired authority is checked before any credential or workspace is provided', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  f.state.remote!.expiresAt = new Date(Date.now() - 1000).toISOString();
  await until(() => f.server.app.store.getSession(session.id)?.status === 'failed', 'expired authority did not fence runtime');
  assert.equal(f.runtime.calls, 0);
  assert.equal(f.runtime.prepared.length, 0);
  assert.equal(f.state.credentialRequests, 0);
});

test('HTTP supervision and durable instructions retain the execution and never start a second runtime', async t => {
  const f = await governed(t); const session = f.create();
  const auth = await login(f.server.url);
  assert.equal((await request(f.server.url, `/api/sessions/${session.id}/supervision`, { ...auth, method: 'POST', body: { supervision: 'background' } })).status, 409);
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  const id = f.state.remote!.id;
  const background = await request(f.server.url, `/api/sessions/${session.id}/supervision`, { ...auth, method: 'POST', body: { supervision: 'background' } });
  assert.equal(background.status, 200);
  assert.equal(background.body.execution.id, id);
  assert.equal(background.body.execution.supervision, 'background');
  const human = await request(f.server.url, `/api/sessions/${session.id}/supervision`, { ...auth, method: 'POST', body: { supervision: 'human' } });
  assert.equal(human.status, 200);
  assert.equal(human.body.execution.supervision, 'human');
  const message = await request(f.server.url, `/api/sessions/${session.id}/messages`, { ...auth, method: 'POST', body: { text: 'Retain the existing isolated workspace and review findings.' } });
  assert.equal(message.status, 200);
  assert.equal(message.body.id, session.id, 'HTTP must await the durable Ploeg command before serializing the session');
  assert.equal((await request(f.server.url, `/api/sessions/${session.id}/supervision`, { ...auth, method: 'POST', body: { supervision: 'invalid' } })).status, 400);
  assert.equal(f.runtime.calls, 1);
  assert.equal(f.state.credentialRequests, 1);
  await assert.rejects(f.server.app.engine.setSupervision(session.id, 'human', outsider), { code: 'not_found' });
});

test('local pause interrupts execution while its remote stop is queued behind another command', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  const gate = deferred(); f.state.commandGates.set('message', gate);
  const message = Promise.resolve(f.server.app.engine.message(session.id, 'Hold this remote command while the operator pauses.', owner));
  await until(() => f.state.commandAttempts.some(command => command.action === 'message'), 'remote message did not reach the gate');
  let stopSettled = false;
  const stop = f.server.app.engine.pause(session.id, owner).finally(() => { stopSettled = true; });
  try {
    await until(() => f.runtime.aborted === 1 && f.runtime.interrupted > 0, 'local execution waited for the queued remote stop instead of interrupting');
    assert.equal(f.server.app.store.getSession(session.id)?.status, 'paused');
    assert.equal(f.state.commandAttempts.some(command => command.action === 'pause'), false, 'fixture must keep the stop command queued for this assertion');
    assert.equal(stopSettled, false);
  } finally { gate.resolve(); await Promise.allSettled([message, stop]); }
  assert.equal((await stop).execution?.state, 'paused');
  assert.equal(f.runtime.calls, 1);
});

test('pause before the first credential mint retains a reservation and resume mints only after execution is running', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  const paused = await f.server.app.engine.pause(session.id, owner);
  assert.equal(paused.execution?.state, 'paused');
  assert.equal(paused.execution?.stopConfirmed, true);
  assert.equal(f.state.capability, 'reserved');
  assert.equal(f.server.app.store.getSecret(`inference:${session.id}`), undefined);
  assert.equal(f.state.credentialRequests, 0);
  assert.equal(f.runtime.calls, 0);
  await f.server.app.engine.resume(session.id, owner);
  await until(() => f.runtime.calls === 1, 'reserved execution did not resume after confirmed pause');
  assert.equal(f.state.admissions, 1);
  assert.equal(f.state.credentialRequests, 1);
  assert.deepEqual(f.state.credentialStates, ['running'], 'the first capability must not be minted while Ploeg still considers the execution paused');
});

test('an old replay receipt after a newer refresh clears the pending command without rolling back authority', async t => {
  const f = await governed(t); const session = f.create();
  const authority = new ExecutionAuthority(f.server.app.store, f.server.config);
  await authority.admit(session);
  await authority.command(session, 'start');
  const instruction = { text: 'Recover the pending instruction without duplicating it.' };
  f.state.afterApplyFailure.add('message');
  await assert.rejects(authority.command(session, 'message', instruction), { code: 'execution_unconfirmed' });
  assert(f.server.app.store.getSecret(`command:${session.id}`), 'the uncertain command should retain its durable replay identity');
  f.state.remote!.revision++;
  f.state.remote!.supervision = 'background';
  const refreshed = await authority.refresh(session);
  const replayed = await authority.command(session, 'message', instruction);
  assert.equal(replayed.revision, refreshed.revision);
  assert.equal(replayed.supervision, 'background');
  assert.equal(f.server.app.store.getSecret(`command:${session.id}`), undefined, 'an acknowledged old receipt must not poison the pending command slot');
  const attempts = f.state.commandAttempts.filter(command => command.action === 'message');
  assert.equal(attempts.length, 2);
  assert.equal(new Set(attempts.map(command => command.id)).size, 1);
  const next = await authority.command(session, 'heartbeat');
  assert.equal(next.revision, refreshed.revision + 1);
  assert.equal(f.state.credentialRequests, 0);
  assert.equal(f.runtime.calls, 0);
});

test('authority revoked during credential delivery prevents even the preliminary brief model request', async t => {
  const f = await governed(t); const session = f.create();
  f.server.config.runtime.briefCheck = true;
  f.state.credentialGate = deferred();
  t.mock.timers.enable({ apis: ['setInterval'] });
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.state.credentialRequests === 1, 'credential request did not reach the gate');
  f.state.remote!.state = 'paused'; f.state.remote!.stopConfirmed = true; f.state.remote!.revision++;
  f.state.credentialGate.resolve();
  await until(() => f.server.app.store.getSession(session.id)?.status === 'failed', 'revoked authority did not fence the preliminary model request');
  assert.equal(f.state.gatewayRequests, 0, 'brief checking must be fenced as paid work');
  assert.equal(f.runtime.prepared.length, 0);
  assert.equal(f.runtime.calls, 0);
});

test('a newer generation learned between roles cannot authorize the old executor to submit its next turn', async t => {
  const f = await governed(t); const session = f.create();
  const observer = new ExecutionAuthority(f.server.app.store, f.server.config);
  f.runtime.finishImmediately = true;
  f.runtime.beforeResult = async context => {
    if (context.role.mode !== 'write') return;
    f.state.remote!.generation++; f.state.remote!.revision++;
    await observer.refresh(context.session);
  };
  t.mock.timers.enable({ apis: ['setInterval'] });
  await f.server.app.engine.start(session.id, owner);
  await until(() => ['failed', 'completed'].includes(f.server.app.store.getSession(session.id)!.status), 'crew did not resolve after authority generation changed');
  assert.equal(f.server.app.store.getSession(session.id)?.status, 'failed');
  assert.equal(f.runtime.calls, 1, 'the next role must be fenced against the generation that admitted this executor');
  assert.equal(f.state.credentialRequests, 1);
  assert.equal(f.state.gatewayRequests, 0);
});

function standaloneBroker() {
  const minted: string[] = [];
  const grants: (RepositoryMcp | undefined)[] = [];
  const broker = {
    mint: async (session: Session, mcp?: RepositoryMcp): Promise<Credential> => { minted.push(session.id); grants.push(mcp); return { key: randomBytes(32).toString('hex'), alias: 'standalone-fixture', reference: `standalone-${session.id}`, budgetUsd: session.budgetUsd }; },
    spend: async () => 0, revoke: async () => {},
  };
  return { broker, minted, grants };
}

async function withoutExecutionConfig(f: Awaited<ReturnType<typeof governed>>) {
  delete f.server.config.execution;
  await f.server.restart();
  const standalone = standaloneBroker();
  f.server.app.engine.broker = standalone.broker;
  return standalone;
}

test('a lost admission response keeps the session managed after the execution configuration is removed', async t => {
  const f = await governed(t); const session = f.create();
  f.state.dropAdmissionResponse = true;
  await assert.rejects(f.server.app.engine.start(session.id, owner), { code: 'execution_unconfirmed' });
  assert.equal(f.state.admissions, 1, 'Ploeg applied the admission even though its response was lost');
  assert(f.server.app.store.getSecret(`admission:${session.id}`), 'the admission intent must be durable before Ploeg is called');
  assert.equal(f.server.app.store.getSession(session.id)?.execution, undefined);
  const standalone = await withoutExecutionConfig(f);
  const blocked = f.server.app.store.getSession(session.id)!;
  assert.equal(blocked.status, 'queued');
  assert.match(blocked.blocker ?? '', /never confirmed/);
  assert(f.server.app.store.events(session.id).some(event => event.type === 'execution.reconciliation_pending' && event.data.admission === 'unconfirmed'));
  await assert.rejects(f.server.app.engine.start(session.id, owner), { code: 'authority_required' });
  await assert.rejects(f.server.app.engine.addBudget(session.id, 1, { id: 'admin', name: 'Admin', role: 'admin' }), { code: 'authority_budget' });
  await f.server.restart();
  f.server.app.engine.broker = standalone.broker;
  await assert.rejects(f.server.app.engine.start(session.id, owner), { code: 'authority_required' }, 'a restart must not turn the intent into a standalone session');
  assert.deepEqual(standalone.minted, []);
  assert.equal(f.runtime.prepared.length, 0);
  assert.equal(f.runtime.calls, 0);
  const discarded = await f.server.app.engine.cancel(session.id, owner);
  assert.equal(discarded.status, 'cancelled');
  await assert.rejects(f.server.app.engine.start(session.id, owner), { code: 'invalid_state' });
  await assert.rejects(f.server.app.engine.retry(session.id, owner), { code: 'new_authorization_required' });
  assert.deepEqual(standalone.minted, []);
  assert.equal(f.runtime.calls, 0);
});

test('a lost admission response is reconciled by replaying the same admission to Ploeg', async t => {
  const f = await governed(t); const session = f.create();
  f.state.dropAdmissionResponse = true;
  await assert.rejects(f.server.app.engine.start(session.id, owner), { code: 'execution_unconfirmed' });
  const executionId = f.state.remote!.id;
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'reconciled execution did not start');
  assert.equal(f.state.admissions, 2);
  assert.equal(f.state.remote!.id, executionId, 'the replayed admission must bind the execution Ploeg already admitted');
  assert.equal(f.server.app.store.getSession(session.id)?.execution?.id, executionId);
  assert.equal(f.state.credentialRequests, 1);
});

test('a confirmed Ploeg execution requires its authority and never resumes standalone', async t => {
  const f = await governed(t); const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  const paused = await f.server.app.engine.pause(session.id, owner);
  assert.equal(paused.execution?.state, 'paused');
  const standalone = await withoutExecutionConfig(f);
  await assert.rejects(f.server.app.engine.resume(session.id, owner), { code: 'authority_required' });
  assert.equal(f.server.app.store.getSession(session.id)?.status, 'paused');
  assert.deepEqual(standalone.minted, []);
  assert.equal(f.runtime.calls, 1);
  assert.equal(f.state.admissions, 1);
});

test('losing Ploeg authority mid-run interrupts execution and blocks resume until reconciled', async t => {
  const f = await governed(t); const session = f.create();
  f.server.config.execution!.heartbeatMs = 50;
  f.state.leaseMs = 5500;
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  f.state.unavailable = true;
  await until(() => f.server.app.store.events(session.id).some(event => event.type === 'execution.reconciliation_pending'), 'authority loss was not reconciled locally');
  const interrupted = f.server.app.store.getSession(session.id)!;
  assert.equal(interrupted.status, 'interrupted');
  assert.equal(f.runtime.aborted, 1);
  const lost = f.server.app.store.events(session.id).find(event => event.type === 'execution.authority_lost');
  assert.equal(lost?.data.autoResumed, false);
  assert.equal(lost?.data.cause, 'http');
  assert.equal(lost?.data.status, 503);
  assert.equal(typeof lost?.data.leaseLeftMs, 'number');
  assert.equal(f.server.app.store.getSecret(`authority-unresolved:${session.id}`), true);
  await assert.rejects(f.server.app.engine.resume(session.id, owner), { code: 'execution_unconfirmed' });
  f.state.unavailable = false;
  await settle(150);
  assert.equal(f.runtime.calls, 1, 'authority loss must never become an automatic retry');
  assert.equal(f.state.credentialRequests, 1);
  assert.equal(f.state.gatewayRequests, 0);
});

test('a missed heartbeat is recorded and the Run keeps going while the Ploeg lease holds', async t => {
  const f = await governed(t); const session = f.create();
  f.server.config.execution!.heartbeatMs = 50;
  const errors: string[] = []; const original = console.error;
  console.error = (line: string) => { errors.push(String(line)); };
  t.after(() => { console.error = original; });
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  f.state.failCommands.add('heartbeat');
  await until(() => f.server.app.store.events(session.id).filter(event => event.type === 'execution.heartbeat_missed').length >= 2, 'missed heartbeats were not recorded');
  f.state.failCommands.delete('heartbeat');
  const before = f.state.commandAttempts.filter(command => command.action === 'heartbeat').length;
  await until(() => f.state.commandAttempts.filter(command => command.action === 'heartbeat').length > before + 1, 'heartbeats did not resume');
  const current = f.server.app.store.getSession(session.id)!;
  assert.equal(current.status, 'running');
  assert.equal(f.runtime.aborted, 0);
  assert(!f.server.app.store.events(session.id).some(event => event.type === 'execution.authority_lost'));
  const missed = f.server.app.store.events(session.id).find(event => event.type === 'execution.heartbeat_missed')!;
  assert.equal(missed.data.cause, 'http');
  assert.equal(missed.data.status, 503);
  assert(Number(missed.data.leaseLeftMs) > 5000, 'the lease had time left');
  assert(errors.some(line => line.includes('"event":"execution.heartbeat_missed"')), 'the miss was not logged');
  assert(!errors.some(line => line.includes(f.consumerToken)), 'the log leaked the Ploeg token');
  await f.server.app.engine.cancel(session.id, owner);
});

test('a heartbeat Ploeg rejects as stale stops the Run at once, whatever the lease', async t => {
  const f = await governed(t); const session = f.create();
  f.server.config.execution!.heartbeatMs = 50;
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  f.state.remote!.revision += 5;
  await until(() => f.server.app.store.events(session.id).some(event => event.type === 'execution.authority_lost'), 'a stale heartbeat did not stop the Run');
  const lost = f.server.app.store.events(session.id).find(event => event.type === 'execution.authority_lost')!;
  assert.equal(lost.data.cause, 'stale');
  assert(Number(lost.data.leaseLeftMs) > 5000, 'the lease still had time left');
  assert.equal(f.runtime.aborted, 1);
  assert.equal(f.server.app.store.getSession(session.id)!.status, 'interrupted');
});

test('streamed message deltas are stored as a few events per part without losing or reordering text', async t => {
  const f = await governed(t); const session = f.create();
  f.runtime.finishImmediately = true;
  const deltas = Array.from({ length: 2000 }, (_, index) => `t${index} `);
  f.runtime.beforeResult = context => {
    if (context.role.mode !== 'write') return;
    for (const delta of deltas) context.emit({ type: 'message', data: { role: 'assistant', text: delta, nativeSessionId: 'native', partId: 'first' } });
    context.emit({ type: 'tool', data: { name: 'read', status: 'completed', nativeSessionId: 'native', partId: 'tool-1' } });
    for (const delta of ['after ', 'the ', 'tool']) context.emit({ type: 'message', data: { role: 'assistant', text: delta, nativeSessionId: 'native', partId: 'second' } });
  };
  await f.server.app.engine.start(session.id, owner);
  await until(() => !['queued', 'running', 'waiting_input'].includes(f.server.app.store.getSession(session.id)!.status), 'session did not finish');
  const events = f.server.app.store.events(session.id).filter(event => ['message', 'tool'].includes(event.type) && event.data.nativeSessionId === 'native');
  const messages = events.filter(event => event.type === 'message');
  assert(messages.length < 50, `expected fewer than 50 stored message events, got ${messages.length}`);
  assert.equal(messages.filter(event => event.data.partId === 'first').map(event => event.data.text).join(''), deltas.join(''));
  assert.equal(messages.filter(event => event.data.partId === 'second').map(event => event.data.text).join(''), 'after the tool');
  const toolAt = events.findIndex(event => event.type === 'tool');
  assert(events.slice(0, toolAt).every(event => event.data.partId === 'first'), 'text before the tool must be stored before it');
  assert(events.slice(toolAt + 1).every(event => event.data.partId === 'second'), 'text after the tool must be stored after it');
});

test('buffered message text is stored when the Run is stopped mid-stream', async t => {
  const f = await governed(t); const session = f.create();
  f.runtime.onStart = context => { if (context.role.mode === 'write') for (const delta of ['partial ', 'answer']) context.emit({ type: 'message', data: { role: 'assistant', text: delta, nativeSessionId: 'native', partId: 'only' } }); };
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  await f.server.app.engine.pause(session.id, owner);
  const text = f.server.app.store.events(session.id).filter(event => event.type === 'message' && event.data.partId === 'only').map(event => event.data.text).join('');
  assert.equal(text, 'partial answer');
  await f.server.app.engine.cancel(session.id, owner);
});

test('Investigate reads both sides of an interrupted session without changing it', async t => {
  const f = await governed(t); const session = f.create();
  f.server.config.execution!.heartbeatMs = 50;
  f.state.leaseMs = 5500;
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  f.state.failCommands.add('heartbeat');
  await until(() => f.server.app.store.events(session.id).some(event => event.type === 'execution.reconciliation_required' || event.type === 'execution.reconciliation_pending'), 'the session did not stop');
  f.state.failCommands.clear();
  const commandsBefore = f.state.commandAttempts.length;
  const eventsBefore = f.server.app.store.events(session.id).length;
  const result = await request(f.server.url, `/api/sessions/${session.id}/investigation`, await login(f.server.url));
  assert.equal(result.status, 200, result.text);
  const body = JSON.parse(result.text);
  assert.equal(body.class, 'ploeg_unreachable');
  assert.equal(body.ploeg, 'read');
  assert(body.timeline.some((item: { source: string }) => item.source === 'ploeg'), 'Ploeg revisions are part of the timeline');
  assert.equal(f.state.commandAttempts.length, commandsBefore, 'investigating must not send Ploeg commands');
  assert.equal(f.server.app.store.events(session.id).length, eventsBefore, 'investigating must not record events');
  assert(![f.inferenceKey, f.consumerToken].some(value => result.text.includes(value)));
  f.state.unavailable = true;
  const offline = JSON.parse((await request(f.server.url, `/api/sessions/${session.id}/investigation`, await login(f.server.url))).text);
  assert.equal(offline.ploeg, 'unavailable');
});

const gatewayTools: RepositoryMcp = { litellmTeamId: 'agents-orders', accessGroups: ['observability-read-orders'] };

test('a governed session on an opted-in repository takes its key from Ploeg and still receives the gateway MCP scope for its agent configuration', async t => {
  const f = await governed(t);
  f.server.config.repositories[0] = { ...f.server.config.repositories[0], mcp: gatewayTools };
  const session = f.create();
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.runtime.calls === 1, 'runtime did not start');
  assert.equal(f.state.credentialRequests, 1);
  assert.equal(f.state.gatewayRequests, 0, 'a governed session must not mint its own scoped key');
  assert.deepEqual(f.runtime.prepared.map(value => [value.key, value.mcp]), [[f.inferenceKey, gatewayTools]]);
  await f.server.app.engine.cancel(session.id, owner);
});

test('a standalone session mints its key with the repository MCP scope, and without one when the repository does not opt in', async t => {
  const runtime = new ControlledExecution();
  runtime.finishImmediately = true;
  const server = await application('live', config => {
    config.runtime.briefCheck = false;
    config.repositories.push({ ...config.repositories[0], id: 'scoped', mcp: gatewayTools });
  }, new Map([['opencode', runtime]]));
  t.after(() => server.close());
  const standalone = standaloneBroker();
  server.app.engine.broker = standalone.broker;
  for (const repositoryId of [server.config.repositories[0].id, 'scoped']) {
    const session = server.app.engine.create(createInput({ runtime: 'opencode', budgetUsd: 2, repositoryId }) as any, owner);
    await server.app.engine.start(session.id, owner);
    await until(() => ['completed', 'failed'].includes(server.app.store.getSession(session.id)!.status), 'session did not finish');
  }
  assert.deepEqual(standalone.grants, [undefined, gatewayTools]);
  assert.deepEqual(runtime.prepared.map(value => value.mcp), [undefined, gatewayTools]);
});

test('a failed session closes its Work Item in Ploeg once, and a live session cannot', async t => {
  const f = await governed(t); const session = f.create();
  const auth = await login(f.server.url);
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.state.remote?.state === 'running', 'execution did not start');
  const live = await request(f.server.url, `/api/sessions/${session.id}/close-work-item`, { ...auth, method: 'POST', body: {} });
  assert.equal(live.status, 409);
  f.state.remote!.expiresAt = new Date(Date.now() - 1000).toISOString();
  await until(() => f.server.app.store.getSession(session.id)?.status === 'failed', 'expired authority did not end the session');
  f.state.remote!.state = 'failed';
  const closed = await request(f.server.url, `/api/sessions/${session.id}/close-work-item`, { ...auth, method: 'POST', body: {} });
  assert.equal(closed.status, 200);
  assert.ok(closed.body.workItemClosedAt);
  assert.equal(closed.body.status, 'failed', 'closing the Work Item does not rewrite the session');
  assert.equal(f.state.remote!.closed, true);
  const revision = f.state.remote!.revision;
  const again = await request(f.server.url, `/api/sessions/${session.id}/close-work-item`, { ...auth, method: 'POST', body: {} });
  assert.equal(again.status, 200);
  assert.equal(f.state.remote!.revision, revision, 'a second close sends no second command');
  assert.equal(f.server.app.store.events(session.id).filter(event => event.type === 'session.work_item_closed').length, 1);
  await assert.rejects(f.server.app.engine.closeWorkItem(session.id, outsider), { code: 'not_found' });
});

test('an execution admitted under an earlier team still binds after the configured team changes', async t => {
  const f = await governed(t); const session = f.create();
  const auth = await login(f.server.url);
  await f.server.app.engine.start(session.id, owner);
  await until(() => f.state.remote?.state === 'running', 'execution did not start');
  f.state.remote!.expiresAt = new Date(Date.now() - 1000).toISOString();
  await until(() => f.server.app.store.getSession(session.id)?.status === 'failed', 'expired authority did not end the session');
  f.state.remote!.state = 'failed';
  f.config.execution.team = 'renamed';
  f.config.ploeg.teams = ['delivery', 'renamed'];
  f.config.ploeg.userTeams = { owner: ['renamed'] };
  const closed = await request(f.server.url, `/api/sessions/${session.id}/close-work-item`, { ...auth, method: 'POST', body: {} });
  assert.equal(closed.status, 200, 'a binding keeps the team it was admitted under');
  assert.ok(closed.body.workItemClosedAt);
  assert.equal(f.state.remote!.team, 'delivery');
});
