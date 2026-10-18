import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Auth } from '../src/auth.ts';
import { Store } from '../src/store.ts';
import type { AppConfig } from '../src/types.ts';

async function setup(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-delegate-'));
  const store = new Store(join(dir, 'unfold.sqlite'));
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  store.addUser({ id: 'oidc-person', name: 'person@example.com', role: 'operator', passwordHash: '' });
  const auth = new Auth(store, { mode: 'live', auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' } } as AppConfig);
  const request = (token: string, method: string, url: string) => ({ method, url, headers: { authorization: `Bearer ${token}` } }) as unknown as IncomingMessage;
  return { store, auth, request };
}

test('a delegated credential reaches only the routes the MCP tools call, its action tools included', async t => {
  const { auth, request } = await setup(t);
  const { token } = auth.delegate({ id: 'oidc-person', name: 'person@example.com', role: 'operator' }, 60_000);
  assert.match(token, /^vlm_[A-Za-z0-9_-]{43}$/);
  for (const [method, url] of [['GET', '/api/ploeg/now'], ['GET', '/api/ploeg/summary?window=7d'], ['GET', '/api/ploeg/work-items?team=a&state=needs_human'], ['GET', '/api/ploeg/work-items/184'], ['GET', '/api/ploeg/work-items/184/asks'], ['POST', '/api/ploeg/work-items/184/asks'], ['GET', '/api/sessions'], ['POST', '/api/ploeg/work-items/184/approve'], ['POST', '/api/ploeg/work-items/184/requeue'], ['POST', '/api/ploeg/work-items/184/notes'], ['GET', '/api/sessions/s-1'], ['POST', '/api/sessions/s-1/pause'], ['GET', '/api/task-sources/board/tasks/1505'], ['GET', '/api/task-sources/board/tasks/1505/ploeg?refresh=1'], ['POST', '/api/task-sources/board/tasks/1505/handoff']]) {
    assert.equal(auth.user(request(token, method, url))?.id, 'oidc-person', `${method} ${url}`);
  }
  for (const [method, url] of [['POST', '/api/agent-host/tokens'], ['GET', '/api/agent-host'], ['GET', '/api/editor-credentials'], ['POST', '/api/editor-requests/abcdefgh/approve'], ['GET', '/api/bootstrap'], ['POST', '/api/sessions'], ['POST', '/api/sessions/s-1/delivery/publish'], ['POST', '/api/sessions/s-1/budget'], ['DELETE', '/api/task-sources/board/tasks/1505/handoff'], ['POST', '/api/ploeg/work-items/184/context'], ['DELETE', '/api/ploeg/work-items/184/asks'], ['GET', '/api/ploeg/work-items/184/runs/1/logs'], ['GET', '/api/ploeg/work-items/x/asks']]) {
    assert.equal(auth.user(request(token, method, url)), undefined, `${method} ${url} is outside the allowlist`);
    assert.equal(auth.scope(request(token, method, url)), undefined);
  }
  assert.equal(auth.scope(request(token, 'GET', '/api/sessions')), 'mcp', 'it is its own channel, never a browser sign-in');
});

test('a delegated credential acts at the lower of its role and the stored role, and ends at expiry or revocation', async t => {
  const { store, auth, request } = await setup(t);
  const capped = auth.delegate({ id: 'oidc-person', name: 'person@example.com', role: 'viewer' }, 60_000);
  assert.equal(auth.user(request(capped.token, 'GET', '/api/sessions'))?.role, 'viewer');
  const raised = auth.delegate({ id: 'oidc-person', name: 'person@example.com', role: 'admin' }, 60_000);
  assert.equal(auth.user(request(raised.token, 'GET', '/api/sessions'))?.role, 'operator', 'a delegation never raises the stored role');
  raised.revoke();
  assert.equal(auth.user(request(raised.token, 'GET', '/api/sessions')), undefined, 'revoked');
  const brief = auth.delegate({ id: 'oidc-person', name: 'person@example.com', role: 'operator' }, 20);
  assert.equal(auth.user(request(brief.token, 'GET', '/api/sessions'))?.id, 'oidc-person');
  await delay(40);
  assert.equal(auth.user(request(brief.token, 'GET', '/api/sessions')), undefined, 'expired');
  assert.equal(auth.user(request(`vlm_${'z'.repeat(43)}`, 'GET', '/api/sessions')), undefined, 'never issued');
  const orphan = auth.delegate({ id: 'oidc-gone', name: 'gone', role: 'admin' }, 60_000);
  assert.equal(auth.user(request(orphan.token, 'GET', '/api/sessions')), undefined, 'an account that no longer exists');
  assert.equal(store.getUser('oidc-gone'), undefined);
});
