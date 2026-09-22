import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/main.ts';
import { defaultCrews } from '../src/config.ts';
import type { AgentRuntime, AppConfig, Credential, ExecutionContext, ExecutionResult, Session, User } from '../src/types.ts';

const upstream = process.env.PLOEG_QUALIFICATION_URL;
const token = process.env.PLOEG_QUALIFICATION_TOKEN;
const gateway = process.env.PLOEG_QUALIFICATION_LITELLM_URL;
if (!upstream || !token || !gateway) throw new Error('Run through the Ploeg opt-in operator workbench inference qualification test.');

class GatedRuntime implements AgentRuntime {
  readonly kind = 'opencode';
  hold = false;
  calls = 0;
  aborted = 0;
  keys: (string | undefined)[] = [];
  async prepare(session: Session, _repository: unknown, credential: Credential | undefined) {
    this.keys.push(credential?.key);
    return { id: session.workspace?.id || `workspace-${session.id}`, backend: 'kubernetes' as const, directory: '/managed' };
  }
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.calls++;
    if (this.hold) {
      try { await delay(60000, undefined, { signal: context.signal }); } catch (error) { this.aborted++; throw error; }
    }
    return { summary: 'Qualification runtime finished without model inference.', artifacts: [], ...(context.role.mode === 'read' ? { verdict: 'approve' as const } : {}) };
  }
  async interrupt() {}
  async dispose() {}
}

const owner: User = { id: 'qualification-operator', name: 'Qualification operator', role: 'operator' };
const vloerMaster = `sk-vloer-must-not-be-used-${randomBytes(16).toString('hex')}`;
const directory = await mkdtemp(join(tmpdir(), 'vloer-inference-'));
const config: AppConfig = {
  mode: 'live', dataDir: directory, publicDir: fileURLToPath(new URL('../public', import.meta.url)), host: '127.0.0.1', port: 0,
  repositories: [{ id: 'order-service', name: 'Order service', description: 'Paid-path fixture; never cloned by the qualification runtime', url: 'https://fixture.invalid/order-service.git', baseBranch: 'main', verify: ['node', '--test'], executionOwner: 'ploeg' }],
  crews: defaultCrews.filter(crew => crew.id === 'delivery'),
  models: [{ id: 'coding', name: 'Qualification coding alias', providerId: 'litellm', modelId: 'qualification-coding' }],
  runtime: { kind: 'opencode', backend: 'local', timeoutMs: 30000, briefCheck: false },
  auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin', bootstrapPassword: randomBytes(18).toString('hex') },
  maxConcurrentSessions: 2, maxBudgetUsd: 1,
  litellm: { baseUrl: `${gateway}/v1`, adminUrl: gateway, masterKey: vloerMaster, models: ['qualification-coding'], ttl: '1h', settlementDelayMs: 0 },
  ploeg: { url: upstream, tokenEnv: 'PLOEG_QUALIFICATION_TOKEN', teams: ['delivery'], userTeams: { [owner.id]: ['delivery'] } }, execution: { team: 'delivery', heartbeatMs: 1000 },
};
const runtime = new GatedRuntime();
const app = await createApplication(config, { runtimes: new Map([['opencode', runtime]]) });

async function account(executionId: string): Promise<{ capabilityState: string; costStatus: string; observedUsd: number | null }> {
  const response = await fetch(`${upstream}/api/v1/operator/executions/${executionId}/spend`, { headers: { authorization: `Bearer ${token}`, 'X-Ploeg-Actor': owner.id }, signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok, `Ploeg spend: HTTP ${response.status}`);
  return response.json();
}
async function until(read: () => boolean | Promise<boolean>, label: string, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!await read()) { assert.ok(Date.now() < end, `Timed out: ${label}`); await delay(25); }
}
const create = (title: string) => app.engine.create({ title, objective: 'Fix the reproducible rounding fixture and prove it with independent executed checks.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', budgetUsd: 1 } as any, owner);

try {
  assert.equal(app.engine.broker, undefined, 'a governed workbench must not hold a gateway master broker');

  const complete = create('Managed inference completion');
  await app.engine.start(complete.id, owner);
  await until(() => app.store.getSession(complete.id)!.status === 'failed' || app.store.getSession(complete.id)!.execution?.state === 'completed', 'managed execution resolves');
  const finished = app.store.getSession(complete.id)!;
  assert.equal(finished.status, 'completed', finished.blocker);
  assert.equal(finished.execution!.state, 'completed');
  await until(async () => (await account(finished.execution!.id)).capabilityState === 'blocked', 'completion blocks the gateway key');
  const settled = await account(finished.execution!.id);
  assert.ok(settled.observedUsd === null || settled.observedUsd === 0, `unexpected spend ${settled.observedUsd}`);
  const issued = runtime.keys.filter(Boolean);
  assert.ok(runtime.calls >= 2, 'both crew roles ran');
  assert.ok(issued.length >= 1 && issued.length === runtime.keys.length, 'the managed workspace received the minted credential');
  assert.equal(new Set(issued).size, 1, 'one execution uses one minted credential');
  assert.match(issued[0]!, /^sk-fake-/);
  assert.ok(![token, vloerMaster].includes(issued[0]!), 'workspace received an authority or master credential');

  runtime.hold = true;
  const stopped = create('Managed inference cancellation');
  await app.engine.start(stopped.id, owner);
  const callsBefore = runtime.calls;
  await until(() => runtime.calls > callsBefore, 'second execution receives its credential and starts');
  const second = app.store.getSession(stopped.id)!.execution!.id;
  assert.equal((await account(second)).capabilityState, 'issued');
  const cancelled = await app.engine.cancel(stopped.id, owner);
  assert.equal(cancelled.status, 'cancelled');
  await until(async () => (await account(second)).capabilityState === 'blocked', 'cancellation blocks the gateway key');
  assert.equal(runtime.aborted, 1);
  await assert.rejects(app.engine.resume(stopped.id, owner));
  assert.ok(runtime.keys.filter(Boolean).every(key => key!.startsWith('sk-fake-')));
  assert.equal(new Set(runtime.keys.filter(Boolean)).size, 2, 'each execution is issued its own credential');

  const publicJson = JSON.stringify([app.store.getSession(complete.id), app.store.getSession(stopped.id), app.store.events(complete.id), app.store.events(stopped.id)]);
  assert.ok(!runtime.keys.filter(Boolean).some(key => publicJson.includes(key!)), 'session projection leaked a minted key');

  process.stdout.write(`${JSON.stringify({
    ok: true,
    qualification: 'real Ploeg PostgreSQL, HTTP authority and LiteLLM broker with De Vloer managed execution against a fake LiteLLM gateway',
    mode: 'live', gateway: 'fake', modelCalls: 0, spendUsd: 0,
    credentialsIssued: new Set(runtime.keys.filter(Boolean)).size,
    checks: ['admission reserves a managed inference budget', 'credential minted through the gateway on first role', 'one credential serves every crew role', 'completion blocks the gateway key', 'cancellation blocks the gateway key', 'blocked capability cannot resume', 'no minted key in session projection', 'workbench holds no gateway master broker'],
  })}\n`);
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
