import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from './api-support.ts';
import { signInForEditor, workbench } from './oidc-support.ts';

type Started = { code: string; secret: string; userCode: string; url: string; expiresIn: number; interval: number };

const lastPoll = new Map<string, number>();

async function poll(url: string, started: Started, secret = started.secret) {
  const wait = (lastPoll.get(started.code) ?? 0) + 1050 - Date.now();
  if (wait > 0) await delay(wait);
  lastPoll.set(started.code, Date.now());
  return request(url, `/api/auth/editor/${started.code}`, { method: 'POST', body: { secret }, csrf: false });
}

async function begin(url: string): Promise<Started> {
  const started = await request(url, '/api/auth/editor', { method: 'POST', body: {}, csrf: false });
  assert.equal(started.status, 200, started.text);
  return started.body;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

test('the phishing flow fails: a victim who follows an attacker\'s editor link and signs in hands over nothing', async t => {
  const { server, idp } = await workbench(t);
  const attacker = await begin(server.url);
  assert.match(attacker.userCode, /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.equal(attacker.interval, 2);
  const victim = await signInForEditor(attacker.url, idp);
  assert.equal(victim.status, 303);
  assert.equal(victim.location, `/#editor-sign-in/${attacker.code}`);
  assert.match(victim.cookie, /^vloer=/);
  const afterSignIn = await poll(server.url, attacker);
  assert.equal(afterSignIn.status, 202);
  assert.deepEqual(afterSignIn.body, { status: 'pending' });
  const page = await request(server.url, `/api/editor-requests/${attacker.code}`, { cookie: victim.cookie });
  assert.equal(page.status, 200);
  assert.equal(page.body.userCode, attacker.userCode);
  assert.equal(page.body.status, 'waiting');
  assert.equal(page.body.workbench, new URL(server.url).host);
  assert.equal(page.body.user, 'person@example.com');
  assert.equal(page.body.credentialDays, 30);
  const stillPending = await poll(server.url, attacker);
  assert.equal(stillPending.status, 202);
  const denied = await request(server.url, `/api/editor-requests/${attacker.code}/deny`, { method: 'POST', cookie: victim.cookie });
  assert.equal(denied.status, 200);
  assert.equal(denied.body.status, 'denied');
  const refused = await poll(server.url, attacker);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error.code, 'editor_login_denied');
  assert.equal(refused.body.token, undefined);
  const gone = await poll(server.url, attacker);
  assert.equal(gone.status, 404);
  const victimId = (await request(server.url, '/api/bootstrap', { cookie: victim.cookie })).body.user.id;
  assert.deepEqual(server.app.store.editorCredentials(victimId), []);
});

test('an approved editor collects its own credential once, uses it as a bearer token, and loses it when signed out from the workbench', async t => {
  const { server, idp } = await workbench(t);
  const started = await begin(server.url);
  const browser = await signInForEditor(started.url, idp);
  const approved = await request(server.url, `/api/editor-requests/${started.code}/approve`, { method: 'POST', cookie: browser.cookie });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'approved');
  const again = await request(server.url, `/api/editor-requests/${started.code}/deny`, { method: 'POST', cookie: browser.cookie });
  assert.equal(again.status, 409);
  const wrong = await poll(server.url, started, 'guess');
  assert.equal(wrong.status, 404);
  const ready = await poll(server.url, started);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.cookie, undefined);
  assert.match(ready.body.token, /^vle_[A-Za-z0-9_-]{43}$/);
  assert.equal(ready.body.user.role, 'operator');
  assert.ok(Date.parse(ready.body.expiresAt) > Date.now() + 29 * 86_400_000);
  assert.ok(!browser.cookie.includes(ready.body.token));
  const consumed = await poll(server.url, started);
  assert.equal(consumed.status, 404);
  const token: string = ready.body.token;
  const bootstrap = await request(server.url, '/api/bootstrap', { headers: bearer(token) });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.user.name, 'person@example.com');
  for (const [path, method] of [['/api/editor-credentials', 'GET'], [`/api/editor-requests/${started.code}`, 'GET'], [`/api/editor-requests/${started.code}/approve`, 'POST']] as const) {
    const scoped = await request(server.url, path, { method, headers: bearer(token) });
    assert.equal(scoped.status, 403, path);
    assert.equal(scoped.body.error.code, 'browser_only');
  }
  assert.equal((await request(server.url, '/api/bootstrap', { headers: bearer('vle_' + 'x'.repeat(43)) })).status, 401);
  assert.equal((await request(server.url, '/api/bootstrap', { headers: bearer('not-a-token'), cookie: browser.cookie })).status, 401);
  const host = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'editor' }, headers: bearer(token) });
  assert.equal(host.status, 201);
  const hostKey = `ahp-token:${createHash('sha256').update(host.body.token).digest('hex')}`;
  assert.ok(server.app.store.getSecret(hostKey));
  const listed = await request(server.url, '/api/editor-credentials', { cookie: browser.cookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.editors.length, 1);
  const [editor] = listed.body.editors;
  assert.deepEqual(Object.keys(editor).sort(), ['createdAt', 'expiresAt', 'id', 'label', 'lastUsedAt', 'scope']);
  assert.equal(editor.scope, 'editor');
  assert.equal(JSON.stringify(listed.body).includes(token), false);
  const forged = await request(server.url, `/api/editor-credentials/${editor.id}`, { method: 'DELETE', cookie: browser.cookie, csrf: false });
  assert.equal(forged.status, 403);
  const revoked = await request(server.url, `/api/editor-credentials/${editor.id}`, { method: 'DELETE', cookie: browser.cookie });
  assert.equal(revoked.status, 200);
  assert.deepEqual(revoked.body.editors, []);
  assert.equal((await request(server.url, '/api/bootstrap', { headers: bearer(token) })).status, 401);
  assert.equal(server.app.store.getSecret(hostKey), undefined);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: browser.cookie })).status, 200);
});

test('an editor signing out ends only its own credential', async t => {
  const { server, idp } = await workbench(t);
  const started = await begin(server.url);
  const browser = await signInForEditor(started.url, idp);
  await request(server.url, `/api/editor-requests/${started.code}/approve`, { method: 'POST', cookie: browser.cookie });
  const token: string = (await poll(server.url, started)).body.token;
  const out = await request(server.url, '/api/logout', { method: 'POST', headers: bearer(token) });
  assert.equal(out.status, 200);
  assert.equal((await request(server.url, '/api/bootstrap', { headers: bearer(token) })).status, 401);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: browser.cookie })).status, 200);
});

test('nobody but the person who signed in for a request sees or decides it, and a claimed request takes no second sign-in', async t => {
  const { server, idp } = await workbench(t);
  const started = await begin(server.url);
  const admin = await request(server.url, '/api/login', { method: 'POST', body: { name: 'admin', password: 'test-admin-password-314159' } });
  const adminCookie = admin.response.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await request(server.url, `/api/editor-requests/${started.code}`, { cookie: adminCookie })).status, 404);
  assert.equal((await request(server.url, `/api/editor-requests/${started.code}/approve`, { method: 'POST', cookie: adminCookie })).status, 404);
  const browser = await signInForEditor(started.url, idp);
  assert.equal(browser.status, 303);
  assert.equal((await request(server.url, `/api/editor-requests/${started.code}/approve`, { method: 'POST', cookie: adminCookie })).status, 404);
  const second = await signInForEditor(started.url, idp);
  assert.equal(second.status, 404);
  assert.equal((await poll(server.url, started)).status, 202);
  const unauthenticated = await request(server.url, `/api/editor-requests/${started.code}/approve`, { method: 'POST' });
  assert.equal(unauthenticated.status, 401);
  const unknown = await fetch(`${server.url}/api/auth/oidc?editor=nope12345`, { redirect: 'manual' });
  assert.equal(unknown.status, 404);
});

test('editor sign-ins are rate-limited per address and polling faster than the interval is told to slow down', async t => {
  const { server } = await workbench(t);
  const first = await begin(server.url);
  for (let index = 1; index < 20; index++) await begin(server.url);
  const limited = await request(server.url, '/api/auth/editor', { method: 'POST', body: {}, csrf: false });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'rate_limited');
  const once = await request(server.url, `/api/auth/editor/${first.code}`, { method: 'POST', body: { secret: first.secret }, csrf: false });
  assert.equal(once.status, 202);
  const twice = await request(server.url, `/api/auth/editor/${first.code}`, { method: 'POST', body: { secret: first.secret }, csrf: false });
  assert.equal(twice.status, 429);
  assert.equal(twice.body.error.code, 'slow_down');
});
