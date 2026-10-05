import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import { StatusBoard, type PloegProbe } from '../src/status.ts';
import { executionFailure } from '../src/failures.ts';
import type { Provisioning } from '../src/engine.ts';
import type { AppConfig, Session, User } from '../src/types.ts';
import { application, login, request } from './api-support.ts';

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const admin: User = { id: 'u-admin', name: 'admin', role: 'admin' };
const alice: User = { id: 'u-alice', name: 'alice', role: 'operator' };
const live = { mode: 'live', runtime: { kind: 'opencode', backend: 'kubernetes', timeoutMs: 30_000 }, kubernetes: { namespace: 'workspaces', image: 'agent', storageSize: '1Gi', cpu: '1', memory: '1Gi', provisionTimeoutMs: 240_000 }, litellm: { baseUrl: 'https://gateway.example/v1', adminUrl: 'https://gateway.example', masterKey: 'key', models: ['coding'], ttl: '4h' } } as AppConfig;

function failed(id: string, ownerId: string, category: Parameters<typeof executionFailure>[0], updatedAt: string, detail?: string): Session {
  return { id, ownerId, title: `Session ${id}`, status: 'failed', updatedAt, failure: executionFailure(category, 'workspace', 'not_submitted', detail), runs: [], artifacts: [] } as unknown as Session;
}

function board(sessions: Session[], waits: Provisioning[] = [], probes: { gateway?: boolean; ploeg?: PloegProbe } = {}, config: AppConfig = live) {
  const store = new Store(':memory:');
  for (const session of sessions) store.saveSession(session);
  return { store, board: new StatusBoard(config, store, () => waits, { gateway: async () => probes.gateway ?? true, ploeg: async () => probes.ploeg ?? 'ok' }) };
}

test('a workspace waiting for a machine makes the workbench down and shows the scheduler reason to administrators only', async () => {
  const reason = '0/6 nodes are available: 1 Insufficient cpu, 2 Insufficient memory.';
  const waits: Provisioning[] = [{ sessionId: 'mine', phase: 'capacity', since: minutesAgo(2), reason }, { sessionId: 'theirs', phase: 'capacity', since: minutesAgo(1), reason }];
  const sessions = [{ id: 'mine', ownerId: alice.id, title: 'Say hi', status: 'running', updatedAt: minutesAgo(2), runs: [], artifacts: [] }, { id: 'theirs', ownerId: 'u-bob', title: 'Private work', status: 'running', updatedAt: minutesAgo(1), runs: [], artifacts: [] }] as unknown as Session[];
  const { board: status } = board(sessions, waits);
  const forAlice = await status.report(alice, now);
  assert.equal(forAlice.overall, 'down');
  assert.equal(forAlice.startLimitSeconds, 240);
  const workspaces = forAlice.checks.find(check => check.id === 'workspaces')!;
  assert.equal(workspaces.state, 'down');
  assert.match(workspaces.summary, /Every machine is busy\. 2 workspaces have been waiting since 2 min ago\./);
  assert.equal(workspaces.detail, undefined);
  assert.deepEqual(forAlice.waiting, [
    { sessionId: 'mine', title: 'Say hi', own: true, phase: 'capacity', since: minutesAgo(2) },
    { own: false, phase: 'capacity', since: minutesAgo(1) },
  ]);
  assert.equal(JSON.stringify(forAlice).includes('Private work'), false);
  const forAdmin = await status.report(admin, now);
  assert.equal(forAdmin.checks.find(check => check.id === 'workspaces')!.detail, reason);
  assert.deepEqual(forAdmin.waiting.map(wait => [wait.title, wait.reason]), [['Say hi', reason], ['Private work', reason]]);
});

test('a recent capacity failure stays degraded until a workspace starts again', async () => {
  const sessions = [failed('one', alice.id, 'capacity', minutesAgo(10), 'Insufficient memory')];
  const { store, board: status } = board(sessions);
  const before = await status.report(admin, now);
  assert.equal(before.overall, 'degraded');
  assert.deepEqual(before.checks.find(check => check.id === 'workspaces'), { id: 'workspaces', title: 'Starting workspaces', checkedAt: now.toISOString(), state: 'degraded', summary: 'A workspace found no free machine 10 min ago, and none has started since.', detail: 'Insufficient memory' });
  store.appendEvent('one', 'workspace.ready', 'system', {});
  const after = await status.report(admin, new Date());
  assert.equal(after.checks.find(check => check.id === 'workspaces')!.state, 'ok');
  assert.equal(after.overall, 'operational');
});

test('recent failures group by cause, leave out cancellations and older failures, and list only visible sessions', async () => {
  const sessions = [
    failed('a', alice.id, 'capacity', minutesAgo(50)),
    failed('b', 'u-bob', 'capacity', minutesAgo(5)),
    failed('c', alice.id, 'gateway_rejected', minutesAgo(30)),
    failed('d', alice.id, 'cancelled', minutesAgo(3)),
    failed('e', alice.id, 'capacity', minutesAgo(60 * 25)),
  ];
  const { board: status } = board(sessions);
  const report = await status.report(alice, now);
  assert.equal(report.failures.total, 3);
  assert.deepEqual(report.failures.causes.map(cause => [cause.category, cause.count, cause.lastAt, cause.sessions.map(session => session.id)]), [
    ['capacity', 2, minutesAgo(5), ['a']],
    ['gateway_rejected', 1, minutesAgo(30), ['c']],
  ]);
  assert.equal(report.failures.causes[0].message, 'No machine had room to start the workspace.');
});

test('an unreachable gateway is down, an unconnected Ploeg is not in use, and nothing recent reads as idle', async () => {
  const { board: status } = board([], [], { gateway: false, ploeg: 'unconfigured' });
  const first = await status.report(alice, now);
  assert.equal((await status.report(alice, now)).checks[1].checkedAt, first.checks[1].checkedAt, 'probes answer from a 15-second cache');
  const report = await status.report(alice, now);
  assert.deepEqual(report.checks.map(check => [check.id, check.state]), [['ploeg', 'not_used'], ['gateway', 'down'], ['workspaces', 'idle']]);
  assert.equal(report.overall, 'down');
});

test('an open outage note sets the overall state and a resolved note stays visible for a week', async () => {
  const { store, board: status } = board([]);
  const note = status.addNote(admin, { severity: 'outage', text: '  Capacity is low; adding a worker.  ' });
  assert.equal(note.text, 'Capacity is low; adding a worker.');
  assert.equal((await status.report(alice)).overall, 'down');
  const resolved = status.resolveNote(admin, note.id);
  assert.equal(resolved.resolvedBy, 'admin');
  const report = await status.report(alice);
  assert.notEqual(report.overall, 'down');
  assert.deepEqual(report.notes.map(item => [item.id, Boolean(item.resolvedAt)]), [[note.id, true]]);
  assert.deepEqual(store.statusNotes(new Date(Date.now() + 8 * 24 * 3_600_000).toISOString()), []);
  assert.throws(() => status.addNote(alice, { severity: 'info', text: 'Hi' }), { status: 403 });
  assert.throws(() => status.addNote(admin, { severity: 'panic', text: 'Hi' }), { status: 400 });
  assert.throws(() => status.addNote(admin, { severity: 'info', text: ' ' }), { status: 400 });
  assert.throws(() => status.resolveNote(admin, '00000000-0000-0000-0000-000000000000'), { status: 404 });
});

test('the status API needs a signed-in person and lets only administrators post and resolve notes', async t => {
  const server = await application('live');
  t.after(() => server.close());
  const auth = await login(server.url);
  const report = await request(server.url, '/api/status', { cookie: auth.cookie });
  assert.equal(report.status, 200, report.text);
  assert.deepEqual(report.body.checks.map((check: { id: string; state: string }) => [check.id, check.state]), [['ploeg', 'not_used'], ['gateway', 'down'], ['workspaces', 'idle']]);
  assert.equal((await request(server.url, '/api/status')).status, 401);
  const posted = await request(server.url, '/api/status/notes', { method: 'POST', cookie: auth.cookie, body: { severity: 'degraded', text: 'Slow starts this morning.' } });
  assert.equal(posted.status, 201, posted.text);
  assert.equal((await request(server.url, '/api/status/notes', { method: 'POST', cookie: auth.cookie, csrf: false, body: { severity: 'info', text: 'No header' } })).status, 403);
  const { hashPassword } = await import('../src/auth.ts');
  server.app.store.addUser({ id: 'u-viewer', name: 'viewer', role: 'viewer', passwordHash: await hashPassword('viewer-password-314159') });
  const viewer = await login(server.url, 'viewer', 'viewer-password-314159');
  assert.equal((await request(server.url, '/api/status', { cookie: viewer.cookie })).body.notes[0].text, 'Slow starts this morning.');
  assert.equal((await request(server.url, `/api/status/notes/${posted.body.id}/resolve`, { method: 'POST', cookie: viewer.cookie })).status, 403);
  const resolved = await request(server.url, `/api/status/notes/${posted.body.id}/resolve`, { method: 'POST', cookie: auth.cookie });
  assert.equal(resolved.status, 200, resolved.text);
  assert.equal(typeof resolved.body.resolvedAt, 'string');
});

test('the demo says its checks are not in use rather than reporting illustrative Ploeg data as live', async () => {
  const { board: status } = board([], [], {}, { mode: 'demo', runtime: { kind: 'demo', backend: 'local', timeoutMs: 1000 } } as AppConfig);
  const report = await status.report(alice);
  assert.deepEqual(report.checks.map(check => [check.id, check.state]), [['ploeg', 'not_used'], ['gateway', 'not_used'], ['workspaces', 'not_used']]);
  assert.match(report.checks[0].summary, /illustrative demo data/);
  assert.equal(report.startLimitSeconds, undefined);
});
