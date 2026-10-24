import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { Engine } from '../src/engine.ts';
import { KubernetesWorkspaces, workspaceName, type KubernetesClient } from '../src/runtime/kubernetes.ts';
import { defaultWorkspaceRetentionDays, workspaceRetention } from '../src/runtime/retention.ts';
import type { AgentRuntime, AppConfig, Run, Session, Workspace } from '../src/types.ts';
import type { Candidate } from '../src/candidates.ts';
import { SandboxWorkspaces } from '../src/runtime/sandbox.ts';
import { WorkspaceManager } from '../src/runtime/workspace.ts';

const day = 86_400_000;
const now = Date.parse('2026-10-24T12:00:00Z');
const ago = (days: number) => new Date(now - days * day).toISOString();
const writer = (status: Run['status'] = 'completed'): Run => ({ id: 'r1', sessionId: 's', roleId: 'writer', roleName: 'Writer', mode: 'write', status, costUsd: 0 });
const ready = { status: 'ready' } as Candidate;

function finished(overrides: Partial<Session> = {}): Pick<Session, 'status' | 'updatedAt' | 'workItemClosedAt' | 'candidate' | 'runs'> {
  return { status: 'completed', updatedAt: ago(8), runs: [writer()], candidate: ready, ...overrides };
}

test('a finished session whose change was captured gives its volume back after seven idle days', () => {
  assert.equal(defaultWorkspaceRetentionDays, 7);
  assert.deepEqual(workspaceRetention(finished(), now, 7, false), { release: true, reason: 'idle' });
  assert.deepEqual(workspaceRetention(finished({ updatedAt: ago(6.9) }), now, 7, false), { release: false, reason: 'recent' });
  assert.deepEqual(workspaceRetention(finished({ workItemClosedAt: ago(2) }), now, 7, false), { release: false, reason: 'recent' }, 'closing its Work Item later restarts the clock');
  assert.deepEqual(workspaceRetention(finished({ status: 'cancelled', runs: [writer('cancelled')], candidate: undefined }), now, 7, false), { release: true, reason: 'idle' }, 'a session that wrote nothing has nothing to capture');
});

test('a volume stays while its session can still run, still holds spend, or holds a change nobody captured', () => {
  for (const status of ['queued', 'running', 'waiting_input', 'exporting', 'paused', 'interrupted'] as const) assert.deepEqual(workspaceRetention(finished({ status, updatedAt: ago(90) }), now, 7, false), { release: false, reason: 'active' }, status);
  assert.deepEqual(workspaceRetention(finished({ updatedAt: ago(90) }), now, 7, true), { release: false, reason: 'unresolved' });
  assert.deepEqual(workspaceRetention(finished({ status: 'failed', candidate: undefined, updatedAt: ago(90) }), now, 7, false), { release: false, reason: 'uncaptured' }, 'recovery captures from the workspace');
  assert.deepEqual(workspaceRetention(finished({ candidate: { status: 'unavailable' } as Candidate, updatedAt: ago(90) }), now, 7, false), { release: false, reason: 'uncaptured' });
  assert.deepEqual(workspaceRetention(finished({ updatedAt: ago(90) }), now, 0, false), { release: false, reason: 'kept_forever' }, '0 days keeps every volume');
  assert.deepEqual(workspaceRetention(finished({ updatedAt: 'not a date' }), now, 7, false), { release: false, reason: 'recent' }, 'an unreadable time never releases');
});

function config(dataDir: string, provisioner: 'pod' | 'sandbox' = 'pod', days?: number): AppConfig {
  return {
    mode: 'live', dataDir, publicDir: '', host: '127.0.0.1', port: 0, repositories: [], teams: [], models: [],
    runtime: { kind: 'opencode', backend: 'kubernetes', timeoutMs: 30000 },
    auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' }, maxConcurrentSessions: 2, maxBudgetUsd: 10,
    kubernetes: { namespace: 'unfold-workspaces', image: 'agent', storageSize: '8Gi', cpu: '1', memory: '1Gi', provisioner, transport: 'publish', ...(days === undefined ? {} : { workspaceRetentionDays: days }) },
  } as unknown as AppConfig;
}

test('releasing a volume removes the pod and its objects first, then the claim; the sandbox provisioner owns its own claims', async () => {
  const calls: string[] = [];
  const client = { request: async (path: string, method = 'GET') => { calls.push(`${method} ${path}`); return null; } } as unknown as KubernetesClient;
  const workspace: Workspace = { id: 'session-1', backend: 'kubernetes', directory: '/workspace/repository' };
  const name = workspaceName('session-1');
  assert.equal(await new KubernetesWorkspaces(config('/tmp'), client).releaseVolume(workspace), true);
  assert.deepEqual(calls, [
    `DELETE /api/v1/namespaces/unfold-workspaces/pods/${name}`,
    `GET /api/v1/namespaces/unfold-workspaces/pods/${name}`,
    `DELETE /api/v1/namespaces/unfold-workspaces/secrets/${name}`,
    `DELETE /api/v1/namespaces/unfold-workspaces/services/${name}`,
    `DELETE /apis/networking.k8s.io/v1/namespaces/unfold-workspaces/networkpolicies/${name}`,
    `DELETE /api/v1/namespaces/unfold-workspaces/persistentvolumeclaims/${name}`,
  ]);
  calls.length = 0;
  const sandbox = new WorkspaceManager(config('/tmp', 'sandbox'), { kubernetes: Object.create(SandboxWorkspaces.prototype) as SandboxWorkspaces });
  assert.equal(await sandbox.releaseVolume(workspace), false);
  assert.deepEqual(calls, []);
});

test('a cluster that refuses unannotated claim deletes gets its annotation on the claim first, and other annotations stay', async () => {
  const calls: { method: string; path: string; body?: any }[] = [];
  const name = workspaceName('session-2');
  const claim = `/api/v1/namespaces/unfold-workspaces/persistentvolumeclaims/${name}`;
  const client = { request: async (path: string, method = 'GET', body?: unknown) => {
    calls.push({ method, path, body });
    return path === claim && method === 'GET' ? { metadata: { name, annotations: { 'volume.kubernetes.io/storage-provisioner': 'driver.longhorn.io' } }, spec: {} } : null;
  } } as unknown as KubernetesClient;
  const annotated = config('/tmp');
  annotated.kubernetes!.volumeDeleteAnnotations = { 'policy.example/allow-stateful-delete': 'true' };
  assert.equal(await new KubernetesWorkspaces(annotated, client).releaseVolume({ id: 'session-2', backend: 'kubernetes', directory: '/workspace/repository' }), true);
  const onClaim = calls.filter(call => call.path === claim);
  assert.deepEqual(onClaim.map(call => call.method), ['GET', 'PUT', 'DELETE']);
  assert.deepEqual(onClaim[1]!.body.metadata.annotations, { 'volume.kubernetes.io/storage-provisioner': 'driver.longhorn.io', 'policy.example/allow-stateful-delete': 'true' });
});

class VolumeRuntime implements AgentRuntime {
  kind = 'opencode' as const;
  released: string[] = [];
  async prepare(): Promise<Workspace> { throw new Error('not used'); }
  async execute(): Promise<never> { throw new Error('not used'); }
  async interrupt() {}
  async dispose() {}
  async releaseVolume(workspace: Workspace) { this.released.push(workspace.id); return true; }
}

function stored(id: string, overrides: Partial<Session>): Session {
  return { id, title: id, objective: 'o', repositoryId: 'r', teamId: 't', runtime: 'opencode', ownerId: 'owner', ownerName: 'Owner', status: 'completed', budgetUsd: 1, spentUsd: 0, costStatus: 'observed', createdAt: ago(30), updatedAt: ago(8), branch: `operator/${id}`, runs: [writer()], artifacts: [], candidate: ready, workspace: { id, backend: 'kubernetes', directory: '/workspace/repository' }, ...overrides };
}

test('the engine releases each idle volume once and records it on the session', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-retention-'));
  const store = new Store(join(directory, 'store.db'));
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  store.saveSession(stored('idle', {}));
  store.saveSession(stored('recent', { updatedAt: ago(1) }));
  store.saveSession(stored('uncaptured', { status: 'failed', candidate: undefined }));
  store.saveSession(stored('docker', { workspace: { id: 'docker', backend: 'docker', directory: '/workspace' } }));
  const runtime = new VolumeRuntime();
  const engine = new Engine(store, config(directory), { opencode: runtime });
  assert.deepEqual(await engine.releaseRetainedVolumes(now), { released: ['idle'], failed: [] });
  assert.deepEqual(runtime.released, ['idle']);
  const event = store.events('idle').find(entry => entry.type === 'workspace.volume_released');
  assert.ok(event, 'the session records that its volume went');
  assert.deepEqual(event!.data, { retentionDays: 7, lastChangedAt: ago(8), candidateRetained: true });
  assert.deepEqual(await engine.releaseRetainedVolumes(now + day), { released: [], failed: [] }, 'a released volume is never asked for again');
  assert.deepEqual(runtime.released, ['idle']);
  assert.deepEqual(await new Engine(store, config(directory, 'pod', 0), { opencode: runtime }).releaseRetainedVolumes(now + 90 * day), { released: [], failed: [] }, '0 days turns the sweep off');
});
