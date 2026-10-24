import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LinkedPermissions, permissionLimits, summaryText, type PermissionCaller } from '../src/linked-permissions.ts';
import { LinkedSessionStore, type LinkedSession } from '../src/linked-sessions.ts';
import type { User } from '../src/types.ts';
import { application, login, request } from './api-support.ts';

const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
const outsider: User = { id: 'u-eve', name: 'eve', role: 'operator' };
const admin: User = { id: 'u-admin', name: 'admin', role: 'admin' };
const sessionId = '0f6c1c9e-1111-4222-8333-944445555666';
const plugin: PermissionCaller = { user: owner, scope: 'editor', credential: 'digest-of-plugin-token' };
const browser: PermissionCaller = { user: owner, scope: 'browser', credential: undefined };
const confirmation = `nonce:${'a'.repeat(64)}`;

function linkedSession(): LinkedSession {
  return { id: sessionId, harness: 'claude-code', harnessVersion: '', ownerId: owner.id, ownerName: owner.name, title: '', repository: '', branch: '', model: '', remoteUrl: '', status: 'waiting', waitingFor: 'permission_prompt', startedAt: '2026-10-24T10:00:00.000Z', lastSeenAt: '2026-10-24T10:00:00.000Z', endedAt: null, workItems: [], dismissed: [], resolvedBranch: '', pullRequests: [], commits: [] };
}

function setup({ optIn = true } = {}) {
  const db = new DatabaseSync(':memory:');
  const sessions = new LinkedSessionStore(db);
  sessions.save(linkedSession());
  const clock = { at: Date.parse('2026-10-24T10:00:00.000Z') };
  const permissions = new LinkedPermissions(db, sessions, { now: () => new Date(clock.at) });
  if (optIn) permissions.setOptIn(owner, sessionId, true);
  return { permissions, sessions, clock };
}

const bash = { tool: 'Bash', summary: 'Remove node_modules', detail: 'Runs rm', waitSeconds: 60 };

test('the plugin reports a prompt with its editor credential once the session opted in, and Unfold redacts and clips the summary again', () => {
  const { permissions } = setup({ optIn: false });
  assert.throws(() => permissions.create(plugin, sessionId, bash), { status: 409, code: 'remote_approval_off' }, 'a session that did not opt in cannot report a prompt');
  permissions.setOptIn(owner, sessionId, true);
  assert.throws(() => permissions.create(browser, sessionId, bash), { status: 403, code: 'remote_approval_editor' }, 'a browser page cannot invent a prompt');
  assert.throws(() => permissions.create({ ...plugin, user: outsider }, sessionId, bash), { status: 404 });
  assert.throws(() => permissions.create({ ...plugin, user: admin }, sessionId, bash), { status: 404 });
  assert.throws(() => permissions.create(plugin, sessionId, { ...bash, tool: 'Bash; rm' }), { code: 'permission_tool' });
  const created = permissions.create(plugin, sessionId, { tool: 'Bash', summary: `Push with token=${'x'.repeat(10)} to https://ryan:hunter2@forge.example.org and sk-ant-secret\u001b[31m now ${'y'.repeat(400)}`, detail: 'Runs git push', waitSeconds: 9999 });
  assert.equal(created.summary.length, permissionLimits.summary);
  assert.doesNotMatch(created.summary, /hunter2|sk-ant|xxxxxxxxxx|\u001b/);
  assert.match(created.summary, /token=\[redacted\]/);
  assert.equal(Date.parse(created.expiresAt) - Date.parse(created.createdAt), permissionLimits.maxWaitSeconds * 1000, 'the wait is clamped');
  assert.equal('credential' in created, false, 'the reporting credential is never shown');
  assert.equal(permissions.create(plugin, sessionId, { tool: 'Read' }).summary, 'Use Read');
  assert.equal(summaryText('a\nb\tc', 10), 'a b c');
});

test('only the owner sees and answers a prompt: an administrator and another person get not found', () => {
  const { permissions } = setup();
  const created = permissions.create(plugin, sessionId, bash);
  assert.deepEqual(permissions.pending(owner).map(entry => entry.id), [created.id]);
  assert.deepEqual(permissions.pending(owner, sessionId).map(entry => [entry.tool, entry.summary, entry.detail]), [['Bash', 'Remove node_modules', 'Runs rm']]);
  assert.deepEqual(permissions.pending(admin), [], 'an administrator lists none of another person’s prompts');
  assert.throws(() => permissions.pending(admin, sessionId), { status: 404 });
  assert.throws(() => permissions.pending(outsider, sessionId), { status: 404 });
  assert.throws(() => permissions.answer({ user: admin, scope: 'browser' }, sessionId, created.id, { decision: 'allow' }), { status: 404 });
  assert.throws(() => permissions.answer({ user: outsider, scope: 'browser' }, sessionId, created.id, { decision: 'allow' }), { status: 404 });
  assert.throws(() => permissions.collect({ ...plugin, user: admin }, sessionId, created.id), { status: 404 });
  assert.throws(() => permissions.collect({ ...plugin, credential: 'another-token' }, sessionId, created.id), { status: 404 }, 'only the credential that reported a prompt collects its answer');
  assert.throws(() => permissions.answer(browser, sessionId, randomBytes(16).toString('hex'), { decision: 'allow' }), { status: 404 });
});

test('an answer is allow or deny, single use, bound to its request, and reaches the plugin exactly once', () => {
  const { permissions, sessions } = setup();
  const created = permissions.create(plugin, sessionId, bash);
  assert.throws(() => permissions.answer(browser, sessionId, created.id, { decision: 'always' }), { code: 'permission_decision' }, 'never "always allow"');
  assert.throws(() => permissions.answer(browser, sessionId, created.id, { decision: 'allow', reason: 'why' }), { code: 'permission_reason' });
  assert.throws(() => permissions.answer(plugin, sessionId, created.id, { decision: 'allow' }), { status: 403, code: 'remote_approval_same_credential' }, 'a stolen plugin credential cannot approve its own prompts');
  assert.throws(() => permissions.answer({ user: owner, scope: 'editor', credential: 'unfold-mcp-token' }, sessionId, created.id, { decision: 'allow' }), { status: 403, code: 'confirmation_required' });
  assert.throws(() => permissions.answer({ user: owner, scope: 'mcp' }, sessionId, created.id, { decision: 'allow' }), { status: 403, code: 'confirmation_required' });
  assert.deepEqual(permissions.collect(plugin, sessionId, created.id), { state: 'pending' });
  const answered = permissions.answer({ user: owner, scope: 'editor', credential: 'unfold-mcp-token', confirmation }, sessionId, created.id, { decision: 'deny', reason: 'Run\u0007 the tests first' });
  assert.deepEqual([answered.state, answered.decision, answered.reason, answered.answeredBy], ['answered', 'deny', 'Run the tests first', 'ryan']);
  assert.throws(() => permissions.answer(browser, sessionId, created.id, { decision: 'allow' }), { status: 409, code: 'permission_closed' }, 'a second answer is refused');
  assert.deepEqual(permissions.collect(plugin, sessionId, created.id), { state: 'delivered', decision: 'deny', reason: 'Run the tests first' });
  assert.deepEqual(permissions.collect(plugin, sessionId, created.id), { state: 'delivered' }, 'the answer is handed over once');
  assert.equal(sessions.get(sessionId)?.status, 'working', 'once the answer is collected the session works again');
  const other = permissions.create(plugin, sessionId, bash);
  assert.throws(() => permissions.answer(browser, '1f6c1c9e-1111-4222-8333-944445555666', other.id, { decision: 'allow' }), { status: 404 }, 'an answer is bound to its session');
});

test('a prompt expires with its wait, and a withdrawn or settled prompt can no longer be answered', () => {
  const { permissions, clock, sessions } = setup();
  const created = permissions.create(plugin, sessionId, { ...bash, waitSeconds: 30 });
  clock.at += 31_000;
  assert.deepEqual(permissions.pending(owner), []);
  assert.throws(() => permissions.answer(browser, sessionId, created.id, { decision: 'allow' }), { status: 410, code: 'permission_expired' });
  assert.deepEqual(permissions.collect(plugin, sessionId, created.id), { state: 'expired' });
  const answeredLate = permissions.create(plugin, sessionId, { ...bash, waitSeconds: 10 });
  permissions.answer(browser, sessionId, answeredLate.id, { decision: 'allow' });
  clock.at += 11_000;
  assert.deepEqual(permissions.collect(plugin, sessionId, answeredLate.id), { state: 'expired' }, 'an answer the plugin did not collect in time expires with the prompt');
  const local = permissions.create(plugin, sessionId, bash);
  assert.deepEqual(permissions.withdraw(plugin, sessionId, local.id, { answered: true }), { state: 'withdrawn' });
  assert.equal(sessions.get(sessionId)?.status, 'working', 'a prompt answered in the terminal leaves the session working');
  assert.throws(() => permissions.answer(browser, sessionId, local.id, { decision: 'allow' }), { status: 409, code: 'permission_closed' });
  const stopped = permissions.create(plugin, sessionId, bash);
  permissions.settle(sessionId);
  assert.throws(() => permissions.answer(browser, sessionId, stopped.id, { decision: 'allow' }), { status: 409 });
  const off = permissions.create(plugin, sessionId, bash);
  permissions.setOptIn(owner, sessionId, false);
  assert.throws(() => permissions.answer(browser, sessionId, off.id, { decision: 'allow' }), { status: 409, code: 'remote_approval_off' });
  assert.deepEqual(permissions.pending(owner), []);
  permissions.setOptIn(owner, sessionId, true);
  for (let index = 0; index < permissionLimits.pendingPerSession; index += 1) permissions.create(plugin, sessionId, bash);
  assert.throws(() => permissions.create(plugin, sessionId, bash), { code: 'permission_requests_full' });
});

function editorToken(app: Awaited<ReturnType<typeof application>>, userId: string, label: string): string {
  const token = `vle_${randomBytes(32).toString('base64url')}`;
  app.app.store.createEditorCredential({ id: randomBytes(12).toString('hex'), tokenHash: createHash('sha256').update(token).digest('hex'), userId, label, scope: 'editor', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  return token;
}

test('the API: the plugin opts in at start and reports, the owner answers from the browser as a recorded action, and everyone else gets not found', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const { hashPassword } = await import('../src/auth.ts');
  const password = randomBytes(24).toString('hex');
  app.app.store.addUser({ id: 'peer', name: 'peer', role: 'operator', passwordHash: await hashPassword(password) });
  const peer = await login(app.url, 'peer', password);
  const adminCookie = (await login(app.url)).cookie;
  const pluginToken = editorToken(app, 'peer', 'claude-code-plugin on laptop');
  const asPlugin = { authorization: `Bearer ${pluginToken}`, 'x-unfold-client': 'claude-code-plugin' };
  const id = 'session-under-test-permissions';
  const events = (body: Record<string, unknown>) => request(app.url, '/api/linked-sessions/events', { method: 'POST', headers: asPlugin, body: { harness: 'claude-code', sessionId: id, ...body } });
  assert.equal((await events({ event: 'start', remoteApproval: false })).status, 200);
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/permissions`, { method: 'POST', headers: asPlugin, body: bash })).status, 409, 'off until the plugin starts with remote approval');
  assert.equal((await events({ event: 'start', remoteApproval: true })).status, 200);
  const created = await request(app.url, `/api/linked-sessions/${id}/permissions`, { method: 'POST', headers: asPlugin, body: bash });
  assert.equal(created.status, 201, created.text);
  const requestId = created.body.request.id;
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/permissions`, { method: 'POST', cookie: peer.cookie, body: bash })).status, 403, 'the browser cannot report a prompt');

  const mine = await request(app.url, '/api/linked-permissions', { cookie: peer.cookie });
  assert.deepEqual(mine.body.requests.map((entry: { id: string }) => entry.id), [requestId]);
  assert.deepEqual((await request(app.url, '/api/linked-permissions', { cookie: adminCookie })).body.requests, []);
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/permissions`, { cookie: adminCookie })).status, 404);
  const answerPath = `/api/linked-sessions/${id}/permissions/${requestId}/answer`;
  assert.equal((await request(app.url, answerPath, { method: 'POST', cookie: adminCookie, body: { decision: 'allow' } })).status, 404, 'an administrator never answers another person’s prompt');
  assert.equal((await request(app.url, answerPath, { method: 'POST', headers: asPlugin, body: { decision: 'allow' } })).status, 403, 'the plugin credential never answers');
  assert.equal((await request(app.url, answerPath, { method: 'POST', cookie: peer.cookie, csrf: false, body: { decision: 'allow' } })).status, 403, 'a cross-site form post is refused');
  const collect = () => request(app.url, `/api/linked-sessions/${id}/permissions/${requestId}/collect`, { method: 'POST', headers: asPlugin });
  assert.deepEqual((await collect()).body, { state: 'pending' });
  const answered = await request(app.url, answerPath, { method: 'POST', cookie: peer.cookie, body: { decision: 'allow' } });
  assert.equal(answered.status, 200, answered.text);
  assert.equal((await request(app.url, answerPath, { method: 'POST', cookie: peer.cookie, body: { decision: 'deny' } })).status, 409);
  assert.deepEqual((await collect()).body, { state: 'delivered', decision: 'allow' });
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/permissions/${requestId}/collect`, { method: 'POST', cookie: peer.cookie })).status, 404, 'only the reporting credential collects');

  const records = app.app.store.actionRecords({ userId: 'peer', limit: 50 });
  const answers = records.filter(record => record.action === 'POST /api/linked-sessions/:id/permissions/:id/answer');
  assert.ok(answers.some(record => record.outcome === 'refused' && record.inputs.decision === 'deny'), 'the refused second answer is recorded too');
  assert.ok(answers.some(record => record.outcome === 'done' && record.inputs.decision === 'allow' && record.channel === 'browser'), JSON.stringify(answers));
  assert.equal(records.some(record => /\/permissions(\/[^/]+\/(collect|withdraw))?$/.test(record.action)), false, 'reporting and collecting stay out of the action log');

  const settled = await request(app.url, `/api/linked-sessions/${id}/permissions`, { method: 'POST', headers: asPlugin, body: bash });
  assert.equal((await events({ event: 'idle' })).status, 200);
  assert.equal((await request(app.url, `/api/linked-sessions/${id}/permissions/${settled.body.request.id}/answer`, { method: 'POST', cookie: peer.cookie, body: { decision: 'allow' } })).status, 409, 'a stopped turn leaves no prompt to answer');
});
