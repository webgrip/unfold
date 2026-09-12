import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/main.ts';
import { defaultCrews } from '../src/config.ts';
import type { AgentRuntime, AppConfig, ExecutionContext, ExecutionResult, Session } from '../src/types.ts';

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Run through the opt-in Ploeg tracker workbench qualification: ${name} is required.`); return value; }
const upstream = required('PLOEG_QUALIFICATION_URL');
const token = required('PLOEG_QUALIFICATION_TOKEN');
const trackerUrl = required('PLOEG_QUALIFICATION_TRACKER_URL');
const workItemId = required('PLOEG_QUALIFICATION_WORK_ITEM_ID');
const provider = process.env.PLOEG_QUALIFICATION_PROVIDER ?? 'vikunja';
assert.equal(provider, 'vikunja', 'This qualification uses the bounded Vikunja HTTP fixture.');
const taskId = process.env.PLOEG_QUALIFICATION_TASK_ID ?? '585';
const scope = process.env.PLOEG_QUALIFICATION_SCOPE ?? '11';
const team = process.env.PLOEG_QUALIFICATION_TEAM ?? 'delivery';
const repositoryUrl = process.env.PLOEG_QUALIFICATION_REPOSITORY_URL ?? 'https://forge.example/webgrip/example.git';
const target = { forge: process.env.PLOEG_QUALIFICATION_TARGET_FORGE ?? 'forgejo', owner: process.env.PLOEG_QUALIFICATION_TARGET_OWNER ?? 'webgrip', repo: process.env.PLOEG_QUALIFICATION_TARGET_REPO ?? 'example', baseBranch: process.env.PLOEG_QUALIFICATION_BASE_BRANCH ?? 'development' };
const directory = await mkdtemp(join(tmpdir(), 'vloer-tracker-authority-'));
let release!: () => void;
const held = new Promise<void>(resolve => { release = resolve; });
let calls = 0;
let prepares = 0;
const runtime: AgentRuntime = {
  kind: 'demo',
  async prepare(session) { prepares++; return { id: session.id, backend: 'local', directory }; },
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    calls++;
    if (context.role.mode === 'write') await Promise.race([held, new Promise<never>((_, reject) => context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }))]);
    context.signal.throwIfAborted();
    return { summary: 'Deterministic authority qualification completed. This runtime performs no code changes, tests, model calls or publication.', artifacts: [], ...(context.role.mode === 'read' ? { verdict: 'approve' as const } : {}) };
  },
  async interrupt() { release(); }, async dispose() {},
};
const config: AppConfig = {
  mode: 'demo', dataDir: directory, publicDir: fileURLToPath(new URL('../public', import.meta.url)), host: '127.0.0.1', port: 0,
  repositories: [{ id: 'source-repository', name: 'Tracker authority fixture', description: 'Ploeg source binding qualification; no clone or model execution.', url: repositoryUrl, baseBranch: target.baseBranch, verify: [], executionOwner: 'ploeg' }],
  crews: defaultCrews.filter(crew => crew.id === 'delivery'), models: [], runtime: { kind: 'demo', backend: 'local', timeoutMs: 15000, briefCheck: false },
  auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' }, maxConcurrentSessions: 1, maxBudgetUsd: 1,
  ploeg: { url: upstream, tokenEnv: 'PLOEG_QUALIFICATION_TOKEN', teams: [team] }, execution: { team, heartbeatMs: 1000 },
  taskSources: [{ id: 'tracker-qualification', name: 'Fixture Vikunja · no model calls', provider, baseUrl: trackerUrl, project: scope, repositoryId: 'source-repository', executionOwner: 'ploeg', ploeg: { target } }],
};
const app = await createApplication(config, { runtimes: new Map([['demo', runtime]]) });
app.store.addUser({ id: 'demo-operator', name: 'Demo operator', role: 'admin', passwordHash: '!qualification-demo-identity' });
let base = '';
const originalFetch = globalThis.fetch;
const registrations: object[] = [];
const admissionStatuses: number[] = [];
let discardFirstAdmissionResponse = true;
globalThis.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  if (String(input) === `${upstream}/api/v1/operator/executions` && init?.method === 'POST') {
    registrations.push(JSON.parse(String(init.body)));
    admissionStatuses.push(response.status);
    if (response.ok && discardFirstAdmissionResponse) { discardFirstAdmissionResponse = false; await response.body?.cancel(); throw new Error('Qualification deliberately discards the first committed admission response.'); }
  }
  return response;
};
async function request(path: string, payload?: object, expected = 200): Promise<any> {
  const response = await fetch(`${base}/api/${path}`, { method: payload === undefined ? 'GET' : 'POST', headers: { origin: base, 'x-vloer-request': '1', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  const data = await response.json(); assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`); return data;
}
async function ploeg(path: string): Promise<any> {
  const response = await fetch(`${upstream}/api/v1/operator/${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`); return response.json();
}
async function until(predicate: () => boolean, label: string) { const deadline = Date.now() + 15000; while (!predicate()) { assert(Date.now() < deadline, label); await delay(20); } }
try {
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address(); assert(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}`;
  const before = await ploeg(`work-items?team=${encodeURIComponent(team)}&limit=200`);
  assert(before.items.some((item: any) => item.id === workItemId));
  const preview = await request(`task-sources/tracker-qualification/tasks/${taskId}`);
  assert.equal(preview.ploeg.workItemId, workItemId); assert.equal(preview.ploeg.expectedRevision, preview.nativeRevision); assert.notEqual(preview.revision, preview.nativeRevision); assert.equal(preview.ploeg.expectedBaseUrl, trackerUrl); assert.equal(preview.ploeg.expectedScope, scope); assert.deepEqual(preview.ploeg.expectedTarget, target);
  const input = { sourceId: preview.sourceId, taskId, revision: preview.revision, bindingRevision: preview.bindingRevision, crewId: 'delivery', runtime: 'demo', budgetUsd: 1 };
  const stale = await request('task-imports', { ...input, revision: 'stale-preview' }, 409); assert.equal(stale.error.code, 'task_changed'); assert.equal(app.store.listSessions().length, 0);
  const session: Session = await request('task-imports', input, 201);
  const repeated: Session = await request('task-imports', input); assert.equal(repeated.id, session.id); assert.equal(session.status, 'queued'); assert.equal(registrations.length, 0); assert.equal(calls, 0);
  await request(`sessions/${session.id}/start`, {}, 503); assert.equal(calls, 0); assert.equal(prepares, 0);
  const started: Session = await request(`sessions/${session.id}/start`, {}); assert.equal(started.execution!.workItemId, workItemId);
  assert.equal(registrations.length, 2); assert.deepEqual(registrations[0], registrations[1]); assert.deepEqual(admissionStatuses, [201, 200]);
  await until(() => calls === 1, 'controlled writer did not start');
  await request(`sessions/${session.id}/start`, {}, 409); assert.equal(registrations.length, 2); assert.equal(prepares, 1);
  await request(`sessions/${session.id}/supervision`, { supervision: 'background' });
  release();
  await until(() => app.store.getSession(session.id)?.execution?.state === 'completed', 'Ploeg execution did not complete');
  const finished: Session = await request(`sessions/${session.id}`);
  assert.equal(finished.status, 'completed'); assert.equal(finished.execution!.id, started.execution!.id); assert.equal(finished.execution!.workItemId, workItemId); assert.equal(finished.costStatus, 'demo'); assert.equal(finished.spentUsd, 0); assert.equal(calls, 2);
  const detail = await ploeg(`work-items/${workItemId}`);
  assert.equal(detail.item.id, workItemId); assert.equal(detail.item.provider, provider); assert.equal(detail.item.externalId, taskId); assert.equal(detail.item.state, 'done'); assert.equal(detail.runs.filter((run: any) => run.role === 'operator').length, 1);
  const after = await ploeg(`work-items?team=${encodeURIComponent(team)}&limit=200`);
  assert.deepEqual(after.items.map((item: any) => item.id).sort(), before.items.map((item: any) => item.id).sort());
  const result = { ok: true, at: new Date().toISOString(), qualification: 'real PostgreSQL, Ploeg HTTP and De Vloer task import/start; Vikunja HTTP fixture and deterministic controlled runtime', workItemId, executionId: finished.execution!.id, source: { provider, taskId, scope, nativeRevision: preview.nativeRevision }, admissionRequests: registrations.length, admissionsCreated: admissionStatuses.filter(status => status === 201).length, workItemsBefore: before.items.length, workItemsAfter: after.items.length, operatorRuns: 1, modelCalls: 0, spendUsd: 0, repositoryChanges: false, checks: ['distinct content and native revisions', 'fresh canonical source pin', 'stale preview rejected', 'queued import deduplication', 'committed admission response loss replayed', 'one existing Work Item and one operator Run', 'repeated Start never readmits', 'background supervision retains execution identity'], publication: 'not attempted' };
  if (process.env.PLOEG_QUALIFICATION_EVIDENCE_DIR) { await mkdir(process.env.PLOEG_QUALIFICATION_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.PLOEG_QUALIFICATION_EVIDENCE_DIR, 'tracker-authority-qualification.json'), JSON.stringify(result, null, 2) + '\n'); }
  process.stdout.write(JSON.stringify(result) + '\n');
} finally { release(); await app.close(); globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); }
