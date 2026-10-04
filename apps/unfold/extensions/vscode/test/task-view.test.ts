import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiError, UnfoldClient, transient, type Secrets } from '../src/client.ts';
import { plainText, plural, taskDescription, teamDescription } from '../src/status.ts';
import { awaitingPloeg, currentWorkItemId, ploegFacts, sessionEligibility, unsupportedStatus, workItemMoving } from '../src/task-view.ts';
import type { Bootstrap, TaskPloegStatus, TaskSnapshot, TaskSource } from '../src/types.ts';

const secrets: Secrets = { get: async () => undefined, store: async () => undefined, delete: async () => undefined };

async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

function task(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return { key: 'task:k', sourceId: 'unfold', provider: 'vikunja', id: '1505', revision: 'r'.repeat(64), title: 'Explain the flow', description: '<p>Body</p>', url: 'https://vikunja.example/tasks/1505', status: 'open', repositoryId: 'ploeg', updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), ...overrides };
}

function status(overrides: Partial<TaskPloegStatus> = {}): TaskPloegStatus {
  return { available: true, demo: false, handoff: { allowed: true }, teams: [{ id: 'silver', assignee: 'silver', queueDepth: 0, paused: false, roles: ['engineer', 'reviewer'] }], assignedTeams: [], workItems: [], fetchedAt: new Date().toISOString(), ...overrides };
}

const bootstrap = (role: 'admin' | 'operator' | 'viewer', sharedExecution = false) => ({ user: { id: 'u', name: 'Ryan', role }, sharedExecution } as unknown as Bootstrap);
const ploegSource: TaskSource = { id: 'unfold', name: 'Unfold', provider: 'vikunja', repositoryId: 'ploeg', executionOwner: 'ploeg', handoff: true };
const interactiveSource: TaskSource = { id: 'mine', name: 'Mine', provider: 'forgejo', repositoryId: 'app', executionOwner: 'interactive' };

test('tree labels count in words people read: one role, several roles, and a paused team says so first', () => {
  assert.equal(plural(1, 'role'), '1 role');
  assert.equal(plural(0, 'role'), '0 roles');
  assert.equal(teamDescription({ id: 'copper', paused: false, queueDepth: 0, roles: [{ id: 'engineer', queueDepth: 0 }] }), '1 role · 0 queued');
  assert.equal(teamDescription({ id: 'bronze', paused: true, queueDepth: 2, roles: [{ id: 'a', queueDepth: 0 }, { id: 'b', queueDepth: 0 }] }), 'paused · 2 roles · 2 queued');
});

test('tracker HTML becomes readable text for tooltips, with scripts dropped and entities decoded', () => {
  assert.equal(plainText('<h2>Goal</h2><p>Make <strong>it</strong> work &amp; ship</p><script>alert(1)</script><ul><li>one</li><li>two</li></ul>'), 'Goal\nMake it work & ship\none\ntwo');
});

test('a task row shows the tracker id, who holds it and its age, and folds long assignee lists', () => {
  assert.equal(taskDescription(task({ identifier: '#1505', assignees: [{ username: 'silver' }] })), '#1505 · → silver · 2d ago');
  assert.equal(taskDescription(task({ assignees: [{ username: 'a' }, { username: 'b' }, { username: 'c' }], updatedAt: undefined })), '#1505 · → a, b +1');
});

test('a supervised session follows the server import rules: viewers, closed tasks and Ploeg-owned boards are refused with a reason', () => {
  assert.deepEqual(sessionEligibility(bootstrap('operator'), interactiveSource, task({ provider: 'forgejo' })), { allowed: true });
  assert.equal(sessionEligibility(bootstrap('viewer'), interactiveSource, task()).allowed, false);
  assert.equal(sessionEligibility(bootstrap('operator'), interactiveSource, task({ status: 'closed' })).allowed, false);
  assert.match(sessionEligibility(bootstrap('operator'), ploegSource, task()).reason!, /Ploeg owns execution/);
  assert.equal(sessionEligibility(bootstrap('operator', true), ploegSource, task({ ploeg: { workItemId: '7', expectedTarget: { owner: 'webgrip', repo: 'glide', baseBranch: 'development' } } })).allowed, true);
  assert.match(sessionEligibility(bootstrap('operator', true), ploegSource, task({ ploegUnavailable: { code: 'task_binding_missing', message: 'Check the tracker assignment.' } })).reason!, /assignment/);
});

test('the panel polls quickly only while an assignment waits for Ploeg to queue it', () => {
  assert.equal(awaitingPloeg(status({ assignedTeams: ['silver'] })), true);
  assert.equal(awaitingPloeg(status({ assignedTeams: ['silver'], workItems: [{ id: '9', team: 'silver', state: 'queued', attempts: 0, updatedAt: new Date().toISOString() }] })), false);
  assert.equal(awaitingPloeg(status({ assignedTeams: ['silver'], workItems: [{ id: '9', team: 'silver', state: 'withdrawn', attempts: 0, updatedAt: new Date().toISOString() }] })), true);
  assert.equal(awaitingPloeg(status()), false);
  assert.equal(awaitingPloeg(unsupportedStatus()), false);
});

test('an older workbench without the hand-off routes still yields a readable, inert status', () => {
  const value = unsupportedStatus();
  assert.equal(value.available, false);
  assert.equal(value.handoff.allowed, false);
  assert.match(value.message!, /Update the workbench server/);
});

test('a read retries once when the gateway cannot reach the workbench, and explains a gateway error instead of blaming the URL', async t => {
  let calls = 0;
  const server = await serve((request, response) => {
    calls++;
    if (request.url?.startsWith('/api/flaky') && calls === 1) { response.writeHead(503, { 'content-type': 'text/plain' }); response.end('upstream connect error'); return; }
    if (request.url?.startsWith('/api/down')) { response.writeHead(503, { 'content-type': 'text/plain' }); response.end('no healthy upstream'); return; }
    if (request.url?.startsWith('/api/html')) { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<html></html>'); return; }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"ok":true}');
  });
  t.after(() => server.close());
  const client = new UnfoldClient(server.url, secrets, 2000, 1);
  assert.deepEqual(await client.request('/api/flaky'), { ok: true });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(client.request('/api/down'), (error: unknown) => error instanceof ApiError && error.code === 'gateway_unavailable' && /gateway in front of the workbench answered 503/.test(error.message));
  assert.equal(calls, 2, 'one retry, not a loop');
  calls = 0;
  await assert.rejects(client.request('/api/down', 'POST', {}), (error: unknown) => error instanceof ApiError && error.status === 503);
  assert.equal(calls, 1, 'a mutation is never repeated automatically');
  calls = 0;
  await assert.rejects(client.request('/api/html'), (error: unknown) => error instanceof ApiError && error.code === 'invalid_response' && /server URL or reverse proxy/.test(error.message));
  assert.equal(calls, 1, 'a wrong URL is not a transient failure');
});

test('only unreachable workbenches and gateway failures count as transient', () => {
  assert.equal(transient(new ApiError(0, 'unreachable', '')), true);
  assert.equal(transient(new ApiError(504, 'gateway_unavailable', '')), true);
  assert.equal(transient(new ApiError(502, 'task_service_failed', '')), false, 'the workbench’s own JSON error is an answer, not a lost request');
  assert.equal(transient(new ApiError(401, 'unauthenticated', '')), false);
  assert.equal(transient(new ApiError(409, 'task_changed', '')), false);
  assert.equal(transient(new Error('other')), false);
});

test('task hand-off calls use the contracted routes, and a missing lookup reads as no source', async t => {
  const seen: string[] = [];
  const server = await serve((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      seen.push(`${request.method} ${request.url} ${body}`);
      if (request.url?.startsWith('/api/tasks/lookup')) { response.writeHead(404, { 'content-type': 'application/json' }); response.end('{"error":{"code":"not_found","message":"No source"}}'); return; }
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(status()));
    });
  });
  t.after(() => server.close());
  const client = new UnfoldClient(server.url, secrets, 2000, 1);
  await client.taskPloeg('unfold', '1505');
  await client.handoff('unfold', '1505', 'silver', 'rev1');
  await client.takeBack('unfold', '1505', 'silver');
  assert.equal(await client.lookupTask('vikunja', '1505'), undefined);
  assert.deepEqual(seen, [
    'GET /api/task-sources/unfold/tasks/1505/ploeg ',
    'POST /api/task-sources/unfold/tasks/1505/handoff {"team":"silver","revision":"rev1"}',
    'DELETE /api/task-sources/unfold/tasks/1505/handoff?team=silver ',
    'GET /api/tasks/lookup?provider=vikunja&id=1505 ',
  ]);
  assert.throws(() => client.handoff('unfold', '1505', '../admin', 'rev1'));
});

test('tooltips drop Markdown escapes too', () => {
  assert.equal(plainText('snake\\_case \\& a\\[0\\]'), 'snake_case & a[0]');
});

test('a task panel follows the live Work Item, else the first one, and refreshes sooner while it moves', () => {
  const at = new Date().toISOString();
  assert.equal(currentWorkItemId(status({ workItems: [{ id: '8', team: 'silver', state: 'done', attempts: 1, updatedAt: at }, { id: '9', team: 'silver', state: 'leased', attempts: 1, updatedAt: at }] })), '9');
  assert.equal(currentWorkItemId(status({ workItems: [{ id: '8', team: 'silver', state: 'done', attempts: 1, updatedAt: at }] })), '8');
  assert.equal(currentWorkItemId(status({ workItems: [{ id: '../8', team: 'silver', state: 'queued', attempts: 0, updatedAt: at }] })), undefined);
  assert.equal(currentWorkItemId(status()), undefined);
  assert.equal(workItemMoving('leased'), true);
  assert.equal(workItemMoving('awaiting_review'), false);
  assert.equal(workItemMoving(undefined), false);
});

test('Ploeg facts degrade instead of failing: a missing detail or card stays absent and any other failure becomes a notice', async () => {
  const detail = { item: { id: '9' } } as never;
  const card = { workItemId: '9' } as never;
  assert.deepEqual(await ploegFacts({ workItem: async () => detail, workItemCard: async () => card }, '9', false), { detail, card });
  assert.deepEqual(await ploegFacts({ workItem: async () => detail, workItemCard: async () => undefined }, '9', false), { detail }, 'an older server without the card route');
  assert.deepEqual(await ploegFacts({ workItem: async () => detail, workItemCard: async () => ({ workItemId: '10' }) as never }, '9', false), { detail }, 'a card for another Work Item is dropped');
  assert.deepEqual(await ploegFacts({ workItem: async () => { throw new ApiError(404, 'ploeg_not_found', 'gone'); }, workItemCard: async () => { throw new ApiError(500, 'x', 'boom'); } }, '9', false), {});
  const failed = await ploegFacts({ workItem: async () => { throw new ApiError(502, 'ploeg_unavailable', 'Ploeg is unavailable.'); }, workItemCard: async () => undefined }, '9', true);
  assert.equal(failed.detail, undefined);
  assert.equal(failed.problem, 'Ploeg’s Runs for this Work Item could not be loaded: Ploeg is unavailable. The panel shows the task’s Ploeg status only.');
});
