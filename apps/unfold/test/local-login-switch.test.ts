import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { application, login, request } from './api-support.ts';
import { provider, signIn } from './oidc-support.ts';
import type { AppConfig } from '../src/types.ts';

async function singleSignOn(t: test.TestContext, localLogin: boolean) {
  const idp = await provider();
  const server = await application('live', config => {
    config.baseUrl = undefined;
    config.auth.localLogin = localLogin;
    config.auth.oidc = { issuer: idp.issuer, clientId: 'unfold', scopes: ['openid', 'email', 'profile'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } } satisfies AppConfig['auth']['oidc'];
  });
  t.after(async () => { await server.close(); await idp.close(); });
  return { server, idp };
}

test('with local sign-in off, the methods offer only single sign-on and a password sign-in is refused unchecked', async t => {
  const { server } = await singleSignOn(t, false);
  const methods = await request(server.url, '/api/auth/methods');
  assert.equal(methods.body.local, false);
  assert.equal(methods.body.oidc.name, 'Authentik');
  const refused = await request(server.url, '/api/login', { method: 'POST', body: { name: 'admin', password: 'test-admin-password-314159' } });
  assert.equal(refused.status, 404);
  assert.equal(refused.body.error.code, 'local_login_off');
  assert.equal(refused.response.headers.get('set-cookie'), null);
  const malformed = await request(server.url, '/api/login', { method: 'POST', body: {} });
  assert.equal(malformed.status, 404, 'the switch answers before the request is read as credentials');
});

test('with local sign-in off, UNFOLD_ADMIN_PASSWORD creates no bootstrap administrator', async t => {
  const { server } = await singleSignOn(t, false);
  assert.equal(server.config.auth.bootstrapPassword, 'test-admin-password-314159');
  assert.equal(server.app.store.getUserByName('admin'), undefined);
});

test('turning local sign-in off rejects a password session from before at its next request, while single sign-on keeps working', async t => {
  const { server, idp } = await singleSignOn(t, true);
  assert.equal((await request(server.url, '/api/auth/methods')).body.local, true);
  const local = await login(server.url);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: local.cookie })).status, 200);
  server.config.auth.localLogin = false;
  await server.restart();
  assert.ok(server.app.store.getUserByName('admin'), 'the account from before stays stored');
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: local.cookie })).status, 401);
  const sso = await signIn(server, idp);
  const cookie = sso.callback.headers.get('set-cookie')!.split(';')[0];
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.user.name, 'person@example.com');
});

test('a password session keeps working while local sign-in stays on', async t => {
  const { server } = await singleSignOn(t, true);
  const local = await login(server.url);
  await server.restart();
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: local.cookie })).status, 200);
});

test('the chart turns local sign-in off only together with single sign-on', { skip: spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable' }, () => {
  const chart = fileURLToPath(new URL('../ops/helm/unfold', import.meta.url));
  const render = (...sets: string[]) => spawnSync('helm', ['template', 'unfold', chart, '--set', 'ploeg.enabled=false', '--set', 'mode=live', '--set', 'workspacePodRuntimeClassName=kata', ...sets.flatMap(set => ['--set', set])], { encoding: 'utf8' });
  const configured = (output: string) => JSON.parse(JSON.parse(output.match(/config\.json: (".*")$/m)![1])).auth;
  const defaults = render();
  assert.equal(defaults.status, 0, defaults.stderr);
  assert.equal(configured(defaults.stdout).localLogin, true);
  const off = render('auth.localLogin=false', 'config.auth.oidc.issuer=https://auth.example/application/o/unfold/', 'config.auth.oidc.clientId=unfold');
  assert.equal(off.status, 0, off.stderr);
  assert.deepEqual(configured(off.stdout), { localLogin: false, oidc: { issuer: 'https://auth.example/application/o/unfold/', clientId: 'unfold' } });
  assert.match(render('auth.localLogin=false').stderr, /auth.localLogin false needs config.auth.oidc/);
  assert.match(render('config.auth.localLogin=false').stderr, /through auth.localLogin, not config.auth.localLogin/);
});
