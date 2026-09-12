import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { login, request } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';
import { validateTaskSources } from '../src/tasks.ts';
import { fixture, target, itemId, deferred } from './task-binding-support.ts';

test('Ploeg tracker mappings require supported singleton provider, exact repository target and consistent aliases', () => {
  const repository = { id: 'orders', name: 'Orders', description: '', url: 'https://forge.example/team/orders.git', baseBranch: 'main', verify: [] };
  const source = { id: 'board', name: 'Engineering', provider: 'vikunja', baseUrl: 'https://tracker.example/api/v1', project: '42', repositoryId: 'orders', executionOwner: 'ploeg', ploeg: { target } };
  assert.deepEqual(validateTaskSources([source], [repository], 'live')[0].ploeg, { target });
  for (const invalid of [{ ...source, provider: 'forgejo', project: 'team/orders' }, { ...source, executionOwner: 'interactive' }, { ...source, ploeg: { target: { ...target, repo: 'elsewhere' } } }, { ...source, ploeg: { target: { ...target, baseBranch: 'other' } } }, { ...source, ploeg: { target, token: 'not-a-field' } }]) assert.throws(() => validateTaskSources([invalid], [repository], 'live'));
  assert.throws(() => validateTaskSources([source, { ...source, id: 'alias', ploeg: { target: { ...target, forge: 'other' } } }], [repository], 'live'), /Aliases/);
});

test('tracker import preserves native revision, binds one existing item, remains queued and deduplicates privately', async t => {
  const f = await fixture(t);
  const preview = await f.preview();
  assert.equal(preview.nativeRevision, f.state.task.updated);
  assert.notEqual(preview.revision, preview.nativeRevision);
  assert.equal(preview.scope, '42');
  assert.equal(preview.ploeg.workItemId, itemId);
  assert.match(preview.bindingRevision, /^[a-f0-9]{64}$/);
  const first = await f.importTask(preview); assert.equal(first.status, 201, first.text);
  const second = await f.importTask(preview); assert.equal(second.status, 200, second.text); assert.equal(second.body.id, first.body.id);
  assert.equal(first.body.status, 'queued'); assert.equal(f.state.admissions.length, 0); assert.equal(f.state.prepared, 0);
  f.server.app.store.addUser({ id: 'outsider', name: 'outsider', role: 'operator', passwordHash: await hashPassword('test-outsider-password') });
  const outsider = await login(f.server.url, 'outsider', 'test-outsider-password');
  const denied = await f.importTask(preview, outsider.cookie); assert.equal(denied.status, 409); assert.equal(denied.body.error.code, 'task_in_use'); assert(!denied.text.includes(first.body.id)); assert(!denied.text.includes(f.admin.user.id));
});

test('unmapped, unavailable, mismatched singleton or native revision cannot prepare a shared tracker session', async t => {
  for (const mutation of ['unmapped', 'unavailable', 'nativeMismatch', 'singletonMismatch', 'target'] as const) await t.test(mutation, async t => {
    const f = await fixture(t);
    if (mutation === 'unmapped') delete f.server.config.taskSources![0].ploeg;
    else if (mutation === 'target') f.state.target = { ...target, baseBranch: 'changed' };
    else f.state[mutation] = true;
    const preview = await f.preview(); assert(preview.ploegUnavailable); assert.equal(preview.ploeg, undefined);
    const result = await f.importTask(preview); assert(result.status >= 400, result.text); assert.equal(f.server.app.store.listSessions().length, 0); assert.equal(f.state.admissions.length, 0);
  });
});

test('a Ploeg row change after preview requires a new binding review before import', async t => {
  const f = await fixture(t); const preview = await f.preview();
  f.state.rowUpdated = '2026-09-11T10:02:00Z';
  const rejected = await f.importTask(preview); assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, 'task_binding_changed');
  assert.equal(f.server.app.store.listSessions().length, 0);
  const accepted = await f.importTask(await f.preview()); assert.equal(accepted.status, 201, accepted.text);
});

test('a cancelled unstarted draft permits a newly reviewed row binding with unchanged task content', async t => {
  const f = await fixture(t); const session = await f.imported();
  f.state.rowUpdated = '2026-09-11T10:02:00Z';
  const stale = await f.start(session); assert.equal(stale.status, 409);
  const preview = await f.preview(); assert.equal(preview.revision, session.sourceTask!.revision); assert.notEqual(preview.bindingRevision, session.sourceTask!.bindingRevision);
  const busy = await f.importTask(preview); assert.equal(busy.status, 409); assert.equal(busy.body.error.code, 'task_in_use');
  const cancelled = await request(f.server.url, `/api/sessions/${session.id}/cancel`, { method: 'POST', cookie: f.admin.cookie }); assert.equal(cancelled.status, 200, cancelled.text);
  const fresh = await f.importTask(preview); assert.equal(fresh.status, 201, fresh.text); assert.notEqual(fresh.body.id, session.id); assert.equal(fresh.body.sourceTask.ploeg.workItemId, itemId); assert.equal(fresh.body.status, 'queued'); assert.equal(f.state.admissions.length, 0);
});

test('an administrator starts a ClickUp draft using the original owner’s linked account', async t => {
  const f = await fixture(t, 'clickup');
  const ownerToken = randomBytes(24).toString('hex');
  f.server.app.store.addUser({ id: 'outsider', name: 'task-owner', role: 'operator', passwordHash: await hashPassword('test-owner-password') });
  f.server.app.store.setSecret('link:clickup:outsider', { accessToken: ownerToken, method: 'token' });
  const owner = await login(f.server.url, 'task-owner', 'test-owner-password');
  const session = await f.imported(owner.cookie);
  assert.equal(session.sourceTask!.nativeRevision, String(Date.parse(f.state.task.updated)));
  assert.notEqual(session.sourceTask!.revision, session.sourceTask!.nativeRevision);
  const result = await f.start(session);
  assert.equal(result.status, 200, result.text);
  assert(f.state.sourceReads.every(value => value === ownerToken));
  assert.equal(f.state.execution.actor, 'outsider');
});

test('lost owner tracker access cannot fall back to the acting administrator’s credential', async t => {
  const f = await fixture(t, 'clickup');
  f.server.app.store.addUser({ id: 'outsider', name: 'task-owner', role: 'operator', passwordHash: await hashPassword('test-owner-password') });
  f.server.app.store.setSecret('link:clickup:outsider', { accessToken: randomBytes(24).toString('hex'), method: 'token' });
  const owner = await login(f.server.url, 'task-owner', 'test-owner-password');
  const session = await f.imported(owner.cookie);
  f.server.app.store.deleteSecret('link:clickup:outsider');
  const count = f.state.sourceReads.length;
  const result = await f.start(session);
  assert.equal(result.status, 409, result.text); assert.equal(result.body.error.code, 'source_unlinked');
  assert.equal(f.state.sourceReads.length, count); assert.equal(f.state.admissions.length, 0); assert.equal(f.state.prepared, 0);
});

test('the owner’s linked tracker credential is scrubbed before preview hashing, persistence and prompt creation', async t => {
  const f = await fixture(t, 'clickup');
  const linked = f.server.app.store.getSecret<{ accessToken: string }>(`link:clickup:${f.admin.user.id}`)!;
  f.state.task.title = `Correct checkout rounding ${linked.accessToken}`;
  f.state.task.description = `The tracker accidentally echoed its Authorization token: ${linked.accessToken}. Keep the acceptance criteria.`;
  const preview = await f.preview();
  assert(!JSON.stringify(preview).includes(linked.accessToken));
  assert.match(preview.title, /\[redacted\]/); assert.match(preview.description, /\[redacted\]/);
  const imported = await f.importTask(preview); assert.equal(imported.status, 201, imported.text);
  assert(!imported.text.includes(linked.accessToken));
  assert(!JSON.stringify(f.server.app.store.getSession(imported.body.id)).includes(linked.accessToken));
  assert(!JSON.stringify(f.server.app.store.events(imported.body.id)).includes(linked.accessToken));
  const session = await f.start(imported.body); assert.equal(session.status, 200, session.text);
  assert(!JSON.stringify(f.state.admissions).includes(linked.accessToken));
});

test('first start refetches source status, membership, content, row freshness and target before admission', async t => {
  for (const mutation of ['closed', 'moved', 'content', 'native', 'row', 'target', 'source-config'] as const) await t.test(mutation, async t => {
    const f = await fixture(t); const session = await f.imported();
    if (mutation === 'closed') f.state.task.done = true;
    if (mutation === 'moved') f.state.task.project_id = 43;
    if (mutation === 'content') f.state.task.description = 'Changed without a native revision bump';
    if (mutation === 'native') f.state.task.updated = '2026-09-11T10:02:00Z';
    if (mutation === 'row') f.state.rowUpdated = '2026-09-11T10:02:00Z';
    if (mutation === 'target') f.state.target = { ...target, repo: 'elsewhere' };
    if (mutation === 'source-config') f.server.config.taskSources![0].baseUrl = 'https://unreachable.invalid/api/v1';
    const result = await f.start(session); assert(result.status >= 400, result.text); assert.equal(f.state.admissions.length, 0); assert.equal(f.state.prepared, 0); assert.equal(f.state.inference, 0); assert.equal(f.server.app.store.getSession(session.id)!.status, 'queued');
  });
});

test('uncertain tracker admission replays the original source pin and keeps the existing work item', async t => {
  const f = await fixture(t); const session = await f.imported();
  f.state.admissionResponseLost = true;
  const uncertain = await f.start(session); assert.equal(uncertain.status, 503); assert.equal(f.state.prepared, 0);
  const reads = f.state.sourceReads.length; const lookups = f.state.lookups;
  f.state.task.description = 'The mandate changes after the admission response was lost';
  const retry = await f.start(session); assert.equal(retry.status, 200, retry.text); assert.equal(f.state.admissions.length, 2); assert.deepEqual(f.state.admissions[0], f.state.admissions[1]);
  assert.equal(f.state.sourceReads.length, reads); assert.equal(f.state.lookups, lookups); assert.equal(f.state.admissions[0].source.workItemId, itemId); assert.equal(f.state.admissions[0].source.expectedRevision, session.sourceTask!.nativeRevision); assert.equal(f.state.execution.workItemId, itemId);
});

test('cancel while first-start lookup is pending prevents any admission or runtime launch', async t => {
  const f = await fixture(t); const session = await f.imported(); const previous = f.state.lookups;
  f.state.lookupGate = deferred();
  const starting = f.start(session);
  while (f.state.lookups === previous) await delay(5);
  const cancelled = await request(f.server.url, `/api/sessions/${session.id}/cancel`, { method: 'POST', cookie: f.admin.cookie }); assert.equal(cancelled.status, 200, cancelled.text);
  f.state.lookupGate.resolve();
  const result = await starting; assert.equal(result.status, 409); assert.equal(f.state.admissions.length, 0); assert.equal(f.state.prepared, 0); assert.equal(f.server.app.store.getSession(session.id)!.status, 'cancelled');
});
