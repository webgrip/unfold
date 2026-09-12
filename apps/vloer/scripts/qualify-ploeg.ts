import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/main.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';
import { defaultCrews } from '../src/config.ts';
import type { AppConfig, ExecutionContext, Session } from '../src/types.ts';

const upstream = process.env.PLOEG_QUALIFICATION_URL;
const token = process.env.PLOEG_QUALIFICATION_TOKEN;
if (!upstream || !token) throw new Error('Run through the Ploeg opt-in operator workbench qualification test.');
const directory = await mkdtemp(join(tmpdir(), 'vloer-unified-'));
const config: AppConfig = {
  mode: 'demo', dataDir: directory, publicDir: fileURLToPath(new URL('../public', import.meta.url)), host: '127.0.0.1', port: 0,
  repositories: [{ id: 'order-service', name: 'Order service', description: 'Real bounded demo fixture', url: fileURLToPath(new URL('../examples/order-service', import.meta.url)), baseBranch: 'main', verify: ['node', '--test'], executionOwner: 'ploeg' }],
  crews: defaultCrews.filter(crew => crew.id === 'delivery'), models: [],
  runtime: { kind: 'demo', backend: 'local', timeoutMs: 30000 },
  auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' }, maxConcurrentSessions: 2, maxBudgetUsd: 1,
  ploeg: { url: upstream, tokenEnv: 'PLOEG_QUALIFICATION_TOKEN', teams: ['delivery'] }, execution: { team: 'delivery', heartbeatMs: 1000 },
};
class MeasuredDemo extends DemoRuntime {
  calls = 0;
  override execute(context: ExecutionContext) { this.calls++; return super.execute(context); }
}
let runtime = new MeasuredDemo({ dataDir: directory, delayMs: 120 });
let app = await createApplication(config, { runtimes: new Map([['demo', runtime]]) });
let base = '';
async function listen() {
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}`;
}
async function request(path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { origin: base, 'x-vloer-request': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  assert.ok(response.ok, `${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function ploeg(path: string): Promise<any> {
  const response = await fetch(`${upstream}/api/v1/operator/${path}`, { headers: { authorization: `Bearer ${token}`, 'X-Ploeg-Actor': 'demo-operator' }, signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok, `Ploeg ${path}: HTTP ${response.status}`);
  return response.json();
}
async function until(read: () => boolean | Promise<boolean>, label: string, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!await read()) { assert.ok(Date.now() < end, `Timed out: ${label}`); await delay(25); }
}
async function create(title: string): Promise<Session> {
  return request('sessions', { title, objective: 'Fix the reproducible rounding fixture and prove it with independent executed checks.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 });
}
try {
  await listen();
  const complete = await create('Unified authority qualification');
  const started: Session = await request(`sessions/${complete.id}/start`, {});
  assert.ok(started.execution);
  const detach = new AbortController();
  const stream = await fetch(`${base}/api/sessions/${complete.id}/events`, { signal: detach.signal });
  const reader = stream.body!.getReader();
  const firstEvent = await reader.read();
  assert.ok(firstEvent.value?.length);
  detach.abort();
  await reader.cancel().catch(() => undefined);
  await request(`sessions/${complete.id}/supervision`, { supervision: 'background' });
  await until(() => app.store.getSession(complete.id)?.execution?.state === 'completed', 'work completes after client disconnect');
  const finished: Session = await request(`sessions/${complete.id}`);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.execution!.id, started.execution.id);
  assert.equal(finished.execution!.supervision, 'background');
  assert.equal(finished.costStatus, 'demo');
  assert.equal(finished.spentUsd, 0);
  assert.equal(finished.candidate?.status, 'ready');
  for (const [name, exit] of [['Baseline checks (expected failure)', 1], ['Verification checks', 0], ['Independent review checks', 0]] as const) assert.match(finished.artifacts.find(artifact => artifact.name === name)!.content, new RegExp(`Exit code: ${exit}`));
  const snapshot = await ploeg(`work-items/${finished.execution!.workItemId}`);
  assert.equal(snapshot.item.state, 'done');
  assert.equal(snapshot.runs.length, 1);
  assert.match(snapshot.runs[0].summary, /independent|approval|review/i);
  const history = await ploeg(`executions/${started.execution.id}/events?after=0`);
  assert.ok(history.events.some((event: any) => event.kind === 'execution.handback'));
  const cursor = history.events[1].revision;
  const replay = await ploeg(`executions/${started.execution.id}/events?after=${cursor}`);
  assert.deepEqual(replay.events, history.events.filter((event: any) => event.revision > cursor));

  const stopped = await create('Pause and cancellation qualification');
  const initial: Session = await request(`sessions/${stopped.id}/start`, {});
  await until(() => Boolean(app.store.getSession(stopped.id)?.workspace), 'workspace prepared');
  const paused: Session = await request(`sessions/${stopped.id}/pause`, {});
  assert.equal(paused.execution!.state, 'paused');
  assert.equal(paused.execution!.stopConfirmed, true);
  const resumed: Session = await request(`sessions/${stopped.id}/resume`, {});
  assert.equal(resumed.execution!.id, initial.execution!.id);
  assert.equal(resumed.execution!.generation, initial.execution!.generation + 1);
  await request(`sessions/${stopped.id}/supervision`, { supervision: 'background' });
  await request(`sessions/${stopped.id}/supervision`, { supervision: 'human' });
  const cancelled: Session = await request(`sessions/${stopped.id}/cancel`, {});
  assert.equal(cancelled.execution!.state, 'cancelled');
  const before = runtime.calls;
  await delay(1200);
  assert.equal(runtime.calls, before);
  const cancelledView = await ploeg(`work-items/${cancelled.execution!.workItemId}`);
  assert.equal(cancelledView.runs.length, 1);

  const interrupted = await create('Restart qualification');
  await request(`sessions/${interrupted.id}/start`, {});
  await until(() => Boolean(app.store.getSession(interrupted.id)?.workspace), 'restart workspace prepared');
  await app.close();
  runtime = new MeasuredDemo({ dataDir: directory, delayMs: 120 });
  app = await createApplication(config, { runtimes: new Map([['demo', runtime]]) });
  await listen();
  await delay(1200);
  const recovered: Session = await request(`sessions/${interrupted.id}`);
  assert.equal(recovered.status, 'interrupted');
  assert.equal(recovered.execution!.state, 'interrupted');
  assert.equal(runtime.calls, 0);
  const recoveredComplete: Session = await request(`sessions/${complete.id}`);
  assert.equal(recoveredComplete.candidate?.status, 'ready');
  const captureDir = process.env.PLOEG_QUALIFICATION_EVIDENCE_DIR;
  const capture = captureDir ? await (await import('./capture-unified.mjs')).captureUnified(base, complete.id, finished.execution!.workItemId, captureDir) : undefined;
  const evidence = { ok: true, ...(capture ? { capture } : {}), qualification: 'real Ploeg PostgreSQL and HTTP authority with De Vloer HTTP API and deterministic runtime', mode: 'demo', modelCalls: 0, spendUsd: 0, checks: ['real failing baseline', 'real patch and passing verification', 'independent passing review', 'client disconnect and reconnect', 'same-execution background supervision', 'serialized durable event replay', 'confirmed pause and generation-fenced resume', 'cancellation does not retry', 'service-instance restart does not execute', 'candidate evidence survives restart'], completedWorkItemId: finished.execution!.workItemId, candidateStatus: finished.candidate?.status };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
