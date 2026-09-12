import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { Store, publicSession } from '../src/store.ts';
import { Engine } from '../src/engine.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';
import type { AgentRuntime, AppConfig, ExecutionContext, ExecutionResult, Session, User, RuntimeKind } from '../src/types.ts';

const owner: User = { id: 'owner', name: 'Owner', role: 'operator' };
const other: User = { id: 'other', name: 'Other', role: 'operator' };
const admin: User = { id: 'admin', name: 'Admin', role: 'admin' };

function configuration(dataDir: string, mode: 'demo' | 'live' = 'demo'): AppConfig {
  return {
    mode, dataDir, publicDir: '', host: '127.0.0.1', port: 0,
    repositories: [{ id: 'order-service', name: 'Order service', description: 'Fixture', url: 'demo://order-service', baseBranch: 'main', verify: ['node --test test/order.test.js'] }],
    crews: [{ id: 'build-review', name: 'Build and review', description: 'Two required roles', roles: [{ id: 'writer', name: 'Writer', mode: 'write', instruction: 'Repair the fixture' }, { id: 'reviewer', name: 'Reviewer', mode: 'read', instruction: 'Review the actual patch' }] }],
    models: [], runtime: { kind: mode === 'demo' ? 'demo' : 'opencode', backend: 'local', timeoutMs: 30000 },
    auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' }, maxConcurrentSessions: 2, maxBudgetUsd: 10,
  };
}

function input(runtime: RuntimeKind = 'demo') { return { title: 'Repair rounding', objective: 'Fix the reported rounding example and show independent verification.', repositoryId: 'order-service', crewId: 'build-review', runtime, budgetUsd: 2 }; }

async function fixture(t: test.TestContext, mode: 'demo' | 'live' = 'demo') {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-core-'));
  const store = new Store(join(directory, 'store.db'));
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, store, config: configuration(directory, mode) };
}

async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for durable state');
    await setTimeout(5);
  }
}

class ControlledRuntime implements AgentRuntime {
  kind: RuntimeKind;
  calls = 0;
  aborted = 0;
  verdict: ExecutionResult['verdict'] = 'approve';
  delayMs = 20;
  constructor(kind: RuntimeKind = 'demo') { this.kind = kind; }
  async prepare(session: Session) { return { id: session.id, backend: 'local' as const, directory: '/managed', metadata: { password: 'not-in-public-json' } }; }
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.calls++;
    try { await setTimeout(this.delayMs, undefined, { signal: context.signal }); }
    catch (error) { this.aborted++; throw error; }
    return { summary: 'Actual fake-runtime test result', artifacts: [], ...(context.role.mode === 'read' ? { verdict: this.verdict } : {}) };
  }
  async interrupt() {}
  async dispose() {}
}

test('demo executes failing baseline, real patch and passing independent checks in an isolated repository', async t => {
  const { directory, store, config } = await fixture(t);
  const engine = new Engine(store, config, { demo: new DemoRuntime({ dataDir: directory, delayMs: 1 }) });
  t.after(() => engine.shutdown());
  const created = engine.create(input(), owner);
  const started = await engine.start(created.id, owner);
  assert.equal(started.status, 'running');
  await until(() => store.getSession(created.id)?.status === 'completed');
  const final = store.getSession(created.id)!;
  assert.equal(final.spentUsd, 0);
  assert.equal(final.costStatus, 'demo');
  assert.deepEqual(final.runs.map(run => run.status), ['completed', 'completed']);
  assert.equal(final.runs[1].verdict, 'approve');
  assert.match(final.artifacts.find(item => item.name === 'Baseline checks (expected failure)')!.content, /Exit code: 1/);
  assert.match(final.artifacts.find(item => item.name === 'Verification checks')!.content, /Exit code: 0/);
  assert.match(final.artifacts.find(item => item.kind === 'diff')!.content, /\+  return Math.round\(\(amount \+ Number.EPSILON\)/);
  assert.match(final.artifacts.find(item => item.name === 'Independent review checks')!.content, /Exit code: 0/);
  assert.match(await readFile(join(final.workspace!.directory, 'src/order.js'), 'utf8'), /Number.EPSILON/);
  assert.doesNotMatch(await readFile(new URL('../examples/order-service/src/order.js', import.meta.url), 'utf8'), /Number.EPSILON/);
  assert.equal(publicSession(final).workspace, undefined);
});

test('pause interrupts and holds state until explicit resume; cancel cannot become a retry', async t => {
  const { store, config } = await fixture(t);
  const runtime = new ControlledRuntime(); runtime.delayMs = 1000;
  const engine = new Engine(store, config, { demo: runtime });
  const session = engine.create(input(), owner);
  await engine.start(session.id, owner);
  await until(() => runtime.calls === 1);
  const paused = await engine.pause(session.id, owner);
  assert.equal(paused.status, 'paused');
  assert.equal(runtime.aborted, 1);
  const calls = runtime.calls;
  await setTimeout(30);
  assert.equal(runtime.calls, calls);
  engine.message(session.id, 'Keep the fixture narrowly scoped.', owner);
  await engine.resume(session.id, owner);
  await until(() => runtime.calls === calls + 1);
  const cancelled = await engine.cancel(session.id, owner);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(runtime.aborted, 2);
  await assert.rejects(engine.resume(session.id, owner), { code: 'invalid_state' });
  await engine.shutdown();
});

test('missing and inconclusive reviewer verdicts cannot approve work', async t => {
  const { store, config } = await fixture(t);
  for (const verdict of [undefined, 'inconclusive', 'request_changes'] as ExecutionResult['verdict'][]) {
    const runtime = new ControlledRuntime(); runtime.verdict = verdict;
    const engine = new Engine(store, config, { demo: runtime });
    const session = engine.create(input(), owner);
    await engine.start(session.id, owner);
    await until(() => store.getSession(session.id)?.status === 'failed');
    const final = store.getSession(session.id)!;
    assert.equal(final.runs[1].status, 'failed');
    assert.equal(final.runs[1].verdict, verdict ?? 'inconclusive');
    assert.equal(store.events(session.id).filter(event => event.type === 'session.completed').length, 0);
    await engine.shutdown();
  }
});

test('session ownership is enforced below HTTP and authorization increases require admin', async t => {
  const { store, config } = await fixture(t);
  const engine = new Engine(store, config, { demo: new ControlledRuntime() });
  const session = engine.create(input(), owner);
  await assert.rejects(engine.start(session.id, other), { status: 404 });
  assert.throws(() => engine.message(session.id, 'intrude', other), { status: 404 });
  await assert.rejects(engine.addBudget(session.id, 1, owner), { status: 403 });
  await assert.rejects(engine.addBudget(session.id, 20, admin), { status: 400 });
  assert.equal((await engine.addBudget(session.id, 1, admin)).budgetUsd, 3);
  assert.throws(() => engine.create(input(), { ...owner, role: 'viewer' }), { status: 403 });
  assert.throws(() => engine.create({ ...input(), repositoryId: 'file:///etc' }, owner), { code: 'invalid_configuration' });
  assert.throws(() => engine.create({ ...input(), trackerUrl: 'https://arbitrary.invalid' }, owner), { code: 'invalid_tracker' });
  await engine.shutdown();
});

test('recovery preserves durable events and marks running work interrupted without executing anything', async t => {
  const { store, config } = await fixture(t);
  const runtime = new ControlledRuntime();
  const engine = new Engine(store, config, { demo: runtime });
  const session = engine.create(input(), owner);
  session.status = 'running'; session.runs[0].status = 'running'; store.saveSession(session);
  const before = store.events(session.id).at(-1)!.id;
  engine.recover();
  assert.equal(store.getSession(session.id)!.status, 'interrupted');
  assert.equal(store.getSession(session.id)!.runs[0].status, 'paused');
  await setTimeout(30);
  assert.equal(runtime.calls, 0);
  assert.equal(store.events(session.id, before)[0].type, 'session.interrupted');
  engine.recover();
  assert.equal(store.events(session.id, before).length, 1);
  await engine.shutdown();
});

test('unknown paid spend retains authorization across interruption and blocks another paid start', async t => {
  const { store, config } = await fixture(t, 'live');
  const runtime = new ControlledRuntime('opencode'); runtime.delayMs = 1000;
  let actualSpend: number | undefined;
  let minted = 0;
  const broker = {
    async mint(session: Session) { minted++; return { key: 'paid-key-secret', reference: `key-${minted}`, alias: `key-${minted}`, budgetUsd: session.budgetUsd }; },
    async spend() { return actualSpend; }, async revoke() {}, async extend() {},
  };
  const engine = new Engine(store, config, { opencode: runtime }, broker);
  const session = engine.create(input('opencode'), owner);
  await engine.start(session.id, owner);
  await until(() => runtime.calls === 1);
  await engine.pause(session.id, owner);
  assert.equal(store.getSession(session.id)!.costStatus, 'unknown');
  assert.equal(store.getSecret<{ authorizedUsd: number }[]>(`budget:${session.id}`)![0].authorizedUsd, 2);
  await assert.rejects(engine.resume(session.id, owner), { code: 'spend_unresolved' });
  assert.equal(minted, 1);
  actualSpend = 0.75;
  await engine.resume(session.id, owner);
  await until(() => minted === 2);
  assert.equal(store.getSession(session.id)!.spentUsd, 0.75);
  assert.equal(store.getSecret<{ authorizedUsd: number }[]>(`budget:${session.id}`)![0].authorizedUsd, 1.25);
  actualSpend = undefined;
  await engine.cancel(session.id, owner);
  await engine.shutdown();
});

test('state transactions roll back together and internal credentials are encrypted on disk', async t => {
  const { directory, store, config } = await fixture(t);
  const engine = new Engine(store, config, { demo: new ControlledRuntime() });
  const session = engine.create(input(), owner);
  const initial = store.events(session.id).length;
  assert.throws(() => store.transaction(() => { store.appendEvent(session.id, 'should_rollback', owner.id, {}); throw new Error('stop'); }));
  assert.equal(store.events(session.id).length, initial);
  const secret = 'sensitive-reference-with-quotes-"-and-\\';
  session.workspace = { id: 'x', backend: 'local', directory: '/private/workspace', metadata: { token: secret } };
  store.saveSession(session);
  store.setSecret('test-secret', { secret });
  assert.equal(store.getSession(session.id)!.workspace!.metadata!.token, secret);
  assert.equal(store.getSecret<{ secret: string }>('test-secret')!.secret, secret);
  for (const path of [join(directory, 'store.db'), join(directory, 'store.db-wal')]) assert.equal((await readFile(path)).includes(Buffer.from(secret)), false);
  await engine.shutdown();
});

test('permission requests survive durable reads, require owner response and cannot be replayed', async t => {
  const { store, config } = await fixture(t);
  let release: (() => void) | undefined;
  class AskingRuntime extends ControlledRuntime {
    async execute(context: ExecutionContext): Promise<ExecutionResult> {
      if (context.role.mode === 'read') return { summary: 'Reviewed evidence', verdict: 'approve', artifacts: [] };
      context.emit({ type: 'permission', data: { nativeId: 'native-permission-1', kind: 'permission', title: 'Allow bounded fixture check?', detail: 'node --test fixture', options: ['once', 'reject'] } });
      await new Promise<void>((resolveRun, reject) => { release = resolveRun; context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }); });
      return { summary: 'Bounded action finished after explicit approval', artifacts: [] };
    }
    async respond() { release!(); }
  }
  const engine = new Engine(store, config, { demo: new AskingRuntime() });
  const session = engine.create(input(), owner);
  await engine.start(session.id, owner);
  await until(() => store.getSession(session.id)!.status === 'waiting_input');
  const request = store.permissions(session.id)[0];
  assert.equal(store.getPermission(request.id)!.nativeId, 'native-permission-1');
  await assert.rejects(engine.respond(session.id, request.id, { decision: 'once' }, other), { status: 404 });
  await engine.respond(session.id, request.id, { decision: 'once' }, owner);
  await until(() => store.getSession(session.id)!.status === 'completed');
  assert.equal(store.getPermission(request.id)!.resolved, true);
  await assert.rejects(engine.respond(session.id, request.id, { decision: 'once' }, owner), { code: 'request_expired' });
  await engine.shutdown();
});

test('live startup recovery interrupts the previous workspace and revokes its held credential without new execution', async t => {
  const { store, config } = await fixture(t, 'live');
  const runtime = new ControlledRuntime('opencode');
  let interruptions = 0; let revocations = 0; let mints = 0;
  runtime.interrupt = async () => { interruptions++; await setTimeout(20); };
  const broker = {
    async mint(session: Session) { mints++; return { key: 'must-not-mint', reference: 'new-ref', alias: 'new-ref', budgetUsd: session.budgetUsd }; },
    async spend() { return undefined; }, async revoke() { revocations++; }, async extend() {},
  };
  const engine = new Engine(store, config, { opencode: runtime }, broker);
  const session = engine.create(input('opencode'), owner);
  session.status = 'running'; session.runs[0].status = 'running';
  session.workspace = { id: 'existing', backend: 'external', directory: '/existing', nativeSessionId: 'existing-native' };
  store.saveSession(session);
  store.setSecret(`budget:${session.id}`, [{ reference: 'existing-credential', authorizedUsd: 2, revoked: false }]);
  engine.recover();
  await assert.rejects(engine.resume(session.id, owner), { code: 'stopping' });
  await until(() => revocations === 1);
  assert.equal(interruptions, 1);
  assert.equal(runtime.calls, 0);
  assert.equal(mints, 0);
  assert.equal(store.getSession(session.id)!.status, 'interrupted');
  assert.equal(store.getSession(session.id)!.costStatus, 'unknown');
  await assert.rejects(engine.resume(session.id, owner), { code: 'spend_unresolved' });
  await engine.shutdown();
});

test('stopped-session reconciliation settles late gateway spend exactly once without restarting execution', async t => {
  const { store, config } = await fixture(t, 'live');
  const runtime = new ControlledRuntime('opencode');
  let spend: number | undefined;
  let mints = 0;
  const broker = {
    async mint(session: Session) { mints++; return { key: 'scoped-key', reference: 'late-key', alias: 'late-key', budgetUsd: session.budgetUsd }; },
    async spend() { return spend; }, async revoke() {}, async extend() {},
  };
  const engine = new Engine(store, config, { opencode: runtime }, broker);
  const session = engine.create(input('opencode'), owner);
  await engine.start(session.id, owner);
  await until(() => store.getSession(session.id)!.status === 'completed' && store.getSession(session.id)!.costStatus === 'unknown');
  await setTimeout(10);
  spend = 0.42;
  await engine.reconcilePending();
  await engine.reconcilePending();
  assert.equal(store.getSession(session.id)!.spentUsd, 0.42);
  assert.equal(store.getSession(session.id)!.costStatus, 'settled');
  assert.equal(runtime.calls, 2);
  assert.equal(mints, 1);
  await engine.shutdown();
});

test('startup discovers a credential minted before its local persistence and never double settles its alias', async t => {
  const { store, config } = await fixture(t, 'live');
  const runtime = new ControlledRuntime('opencode');
  let revocations = 0;
  const broker = {
    async mint() { throw new Error('Startup must never mint'); },
    async spend() { return 0.3; }, async revoke() { revocations++; }, async extend() {},
    async aliasesForSession() { return ['orphaned-at-crash']; },
  };
  const engine = new Engine(store, config, { opencode: runtime }, broker);
  const session = engine.create(input('opencode'), owner);
  session.status = 'running'; store.saveSession(session);
  engine.recover();
  await until(() => store.getSession(session.id)!.costStatus === 'settled');
  assert.equal(store.getSession(session.id)!.spentUsd, 0.3);
  assert.equal(revocations, 1);
  assert.equal(runtime.calls, 0);
  engine.recover();
  await engine.reconcilePending();
  assert.equal(store.getSession(session.id)!.spentUsd, 0.3);
  assert.equal(revocations, 1);
  await engine.shutdown();
});

test('placement is validated against the enabled workspace backends and recorded on the session', async t => {
  const { store, config } = await fixture(t, 'live');
  config.runtime = { kind: 'opencode', backend: 'docker', backends: ['docker', 'kubernetes'], timeoutMs: 30000 };
  const engine = new Engine(store, config, { opencode: new ControlledRuntime('opencode') });
  const defaulted = engine.create(input('opencode'), owner);
  assert.equal(defaulted.placement, 'docker');
  const chosen = engine.create({ ...input('opencode'), placement: 'kubernetes' }, owner);
  assert.equal(chosen.placement, 'kubernetes');
  assert.equal(store.events(chosen.id)[0].data.placement, 'kubernetes');
  assert.throws(() => engine.create({ ...input('opencode'), placement: 'local' }, owner), (error: any) => error.code === 'invalid_placement');
  assert.throws(() => engine.create({ ...input('opencode'), placement: 'anywhere' as any }, owner), (error: any) => error.code === 'invalid_placement');
  await engine.shutdown();
});

test('demonstration sessions carry no placement', async t => {
  const { store, config } = await fixture(t);
  const engine = new Engine(store, config, { demo: new ControlledRuntime() });
  assert.equal(engine.create(input(), owner).placement, undefined);
  assert.throws(() => engine.create({ ...input(), placement: 'docker' }, owner), (error: any) => error.code === 'invalid_placement');
  await engine.shutdown();
});
