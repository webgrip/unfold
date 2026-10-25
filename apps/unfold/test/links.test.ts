import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { Links, LinkError } from '../src/links.ts';
import { RuntimeFailure } from '../src/failures.ts';
import { configuration } from './api-support.ts';

type Fake = { base: string; tokens: Record<string, unknown>[]; clickupExchanges: Record<string, string>[]; revoked: string[]; users: number; expiresIn: number; privateToken?: string; close(): Promise<void> };

async function gitlab(): Promise<Fake> {
  const fake: Fake = { base: '', tokens: [], clickupExchanges: [], revoked: [], users: 0, expiresIn: 7200, close: async () => {} };
  let issued = 0;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : {};
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/oauth/token') {
      fake.tokens.push(data);
      if (data.grant_type === 'authorization_code' && data.code !== 'good-code') { res.writeHead(400); res.end('{"error":"invalid_grant"}'); return; }
      if (data.grant_type === 'refresh_token' && !String(data.refresh_token).startsWith('refresh-')) { res.writeHead(400); res.end('{"error":"invalid_grant"}'); return; }
      issued += 1;
      res.end(JSON.stringify({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, token_type: 'Bearer', expires_in: fake.expiresIn, created_at: Math.floor(Date.now() / 1000), scope: 'read_api read_repository write_repository' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v4/user') {
      fake.users += 1;
      if (req.headers.authorization !== 'Bearer access-1' && req.headers['private-token'] !== fake.privateToken) { res.writeHead(401); res.end('{}'); return; }
      res.end(JSON.stringify({ username: 'ryan', web_url: `${fake.base}/ryan` }));
      return;
    }
    if (req.method === 'POST' && req.url === '/oauth/revoke') { fake.revoked.push(String(data.token)); res.end('{}'); return; }
    if (req.method === 'POST' && req.url?.startsWith('/api/v2/oauth/token')) {
      assert.equal(new URL(req.url, fake.base).search, '');
      assert.equal(req.headers['content-type'], 'application/json');
      const params = data as Record<string, string>;
      fake.clickupExchanges.push(params);
      if (params.code !== 'cu-code') { res.writeHead(400); res.end('{"err":"bad code"}'); return; }
      res.end(JSON.stringify({ access_token: 'cu-access-1' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v2/user') {
      if (req.headers.authorization !== 'cu-access-1') { res.writeHead(401); res.end('{}'); return; }
      res.end(JSON.stringify({ user: { id: 1, username: 'ryan', email: 'ryan@example.test' } }));
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  fake.base = `http://127.0.0.1:${address.port}`;
  fake.close = () => new Promise(done => server.close(() => done()));
  return fake;
}

async function harness(t: test.TestContext) {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-links-'));
  const fake = await gitlab();
  const store = new Store(join(dataDir, 'unfold.sqlite'));
  const config = configuration(dataDir, 'live');
  config.baseUrl = 'http://127.0.0.1:4080';
  config.links = { gitlab: { baseUrl: fake.base, clientId: 'application-id-1234', scopes: ['read_api', 'read_repository', 'write_repository'] } };
  const links = new Links(store, config);
  t.after(async () => { store.close(); await fake.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { links, store, fake, config };
}

test('a link starts with PKCE, completes against the account, and yields clone access for that host only', async t => {
  const { links, store, fake } = await harness(t);
  assert.deepEqual(links.describe('user-1'), { provider: 'gitlab', host: new URL(fake.base).host, configured: true, oauth: true, linked: false });
  const url = new URL(links.begin('gitlab', 'user-1', 'test-browser'));
  assert.equal(url.origin + url.pathname, `${fake.base}/oauth/authorize`);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4080/api/links/gitlab/callback');
  assert.equal(url.searchParams.get('scope'), 'read_api read_repository write_repository');
  const state = url.searchParams.get('state')!;
  await assert.rejects(links.complete('gitlab', 'good-code', 'not-a-state', 'test-browser'), (error: any) => error instanceof LinkError && error.code === 'link_state');
  const completed = await links.complete('gitlab', 'good-code', state, 'test-browser');
  assert.equal(completed.userId, 'user-1');
  assert.equal(completed.link.linked, true);
  assert.equal(completed.link.login, 'ryan');
  const exchange = fake.tokens[0] as Record<string, string>;
  assert.equal(exchange.grant_type, 'authorization_code');
  assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(JSON.stringify(links.describe('user-1')).includes('access-1'), false);
  assert.deepEqual(await links.access('user-1', `${fake.base}/group/project.git`), { username: 'oauth2', password: 'access-1' });
  assert.equal(await links.access('user-1', 'https://forge.example/project.git'), undefined);
  assert.equal(await links.access('user-2', `${fake.base}/group/project.git`), undefined);
  assert.equal(await links.complete('gitlab', 'good-code', state, 'test-browser').catch((error: any) => error.code), 'link_state');
  assert.ok(store.getSecret('link:gitlab:user-1'));
});

test('an expiring link is refreshed before the clone and revocation forgets and revokes both tokens', async t => {
  const { links, store, fake } = await harness(t);
  fake.expiresIn = 60;
  const state = new URL(links.begin('gitlab', 'user-1', 'test-browser')).searchParams.get('state')!;
  await links.complete('gitlab', 'good-code', state, 'test-browser');
  assert.deepEqual(await links.access('user-1', `${fake.base}/p.git`), { username: 'oauth2', password: 'access-2' });
  const refresh = fake.tokens[1] as Record<string, string>;
  assert.equal(refresh.grant_type, 'refresh_token');
  assert.equal(refresh.refresh_token, 'refresh-1');
  assert.equal(refresh.code_verifier, (fake.tokens[0] as Record<string, string>).code_verifier);
  await links.revoke('gitlab', 'user-1');
  assert.equal(links.describe('user-1').linked, false);
  assert.equal(store.getSecret('link:gitlab:user-1'), undefined);
  assert.deepEqual(fake.revoked.sort(), ['access-2', 'refresh-2']);
  assert.equal(await links.access('user-1', `${fake.base}/p.git`), undefined);
});

test('a rejected code and a broken refresh are failures the session can explain', async t => {
  const { links, fake } = await harness(t);
  const state = new URL(links.begin('gitlab', 'user-1', 'test-browser')).searchParams.get('state')!;
  await assert.rejects(links.complete('gitlab', 'bad-code', state, 'test-browser'), (error: any) => error instanceof RuntimeFailure && error.category === 'workspace_setup' && error.httpStatus === 400);
  fake.expiresIn = 60;
  const again = new URL(links.begin('gitlab', 'user-1', 'test-browser')).searchParams.get('state')!;
  await links.complete('gitlab', 'good-code', again, 'test-browser');
  const record = (links as any).record('gitlab', 'user-1');
  (links as any).store.setSecret('link:gitlab:user-1', { ...record, refreshToken: 'stale' });
  await assert.rejects(links.access('user-1', `${fake.base}/p.git`), (error: any) => error instanceof RuntimeFailure && error.category === 'workspace_setup' && error.detail === 'The GitLab OAuth exchange answered HTTP 400');
});

test('an unconfigured link describes itself and refuses to start', async t => {
  const { links, config } = await harness(t);
  config.links = { gitlab: { baseUrl: 'https://gitlab.example', scopes: ['read_api'] } };
  assert.deepEqual(links.describe('user-1'), { provider: 'gitlab', host: 'gitlab.example', configured: true, oauth: false, linked: false });
  assert.throws(() => links.begin('gitlab', 'user-1', 'test-browser'), (error: any) => error instanceof LinkError && error.status === 409);
  assert.equal(await links.access('user-1', 'https://gitlab.example/p.git'), undefined);
});

test('a ClickUp link exchanges the code with the client secret, keeps the token for task sources, and is listed beside GitLab', async t => {
  const { links, config, fake } = await harness(t);
  config.links = { ...config.links, clickup: { clientId: 'cu-app', clientSecret: 'cu-secret', apiUrl: fake.base, appUrl: fake.base } };
  const listed = links.describeAll('user-1').map(link => `${link.provider}:${link.configured}:${link.linked}`);
  assert.deepEqual(listed, ['gitlab:true:false', 'clickup:true:false']);
  const url = new URL(links.begin('clickup', 'user-1', 'test-browser'));
  assert.equal(url.pathname, '/api');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('client_id'), 'cu-app');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4080/api/links/clickup/callback');
  const state = url.searchParams.get('state')!;
  const other = new URL(links.begin('clickup', 'user-1', 'test-browser')).searchParams.get('state')!;
  await assert.rejects(links.complete('gitlab', 'good-code', other, 'test-browser'), (error: any) => error.code === 'link_state');
  await assert.rejects(links.complete('clickup', 'cu-code', other, 'test-browser'), (error: any) => error.code === 'link_state');
  const completed = await links.complete('clickup', 'cu-code', state, 'test-browser');
  assert.equal(completed.link.linked, true);
  assert.equal(completed.link.login, 'ryan');
  assert.deepEqual(await links.token('user-1', 'clickup'), { token: 'cu-access-1', type: 'private' });
  assert.equal(await links.token('user-2', 'clickup'), undefined);
  assert.equal(fake.clickupExchanges[0].client_secret, 'cu-secret');
  assert.equal(createHash('sha256').update(fake.clickupExchanges[0].code_verifier).digest('base64url'), url.searchParams.get('code_challenge'), 'the exchange proves the verifier behind the challenge');
  await links.revoke('clickup', 'user-1');
  assert.equal(links.describe('user-1', 'clickup').linked, false);
});

test('the ClickUp code exchange sends its credentials in a JSON body, never in the URL, and keeps them out of errors', async t => {
  const { store, config } = await harness(t);
  config.links = { ...config.links, clickup: { clientId: 'cu-app', clientSecret: 'cu-secret', apiUrl: 'https://api.clickup.test', appUrl: 'https://app.clickup.test' } };
  const requests: { url: URL; init: RequestInit }[] = [];
  let tokenStatus = 200;
  const intercepted: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname === '/api/v2/oauth/token') return new Response(tokenStatus === 200 ? JSON.stringify({ access_token: 'cu-access-1' }) : '{"err":"cu-secret rejected"}', { status: tokenStatus });
    if (url.pathname === '/api/v2/user') return new Response(JSON.stringify({ user: { username: 'ryan' } }));
    return new Response('{}', { status: 404 });
  };
  const links = new Links(store, config, intercepted);
  const begin = () => new URL(links.begin('clickup', 'user-1', 'test-browser')).searchParams.get('state')!;

  await links.complete('clickup', 'cu-code', begin(), 'test-browser');
  const exchange = requests.find(request => request.url.pathname === '/api/v2/oauth/token')!;
  assert.equal(exchange.url.href, 'https://api.clickup.test/api/v2/oauth/token');
  assert.equal(exchange.url.search, '');
  assert.equal(exchange.init.method, 'POST');
  assert.equal(exchange.init.redirect, 'error');
  assert.ok(exchange.init.signal instanceof AbortSignal);
  assert.equal(new Headers(exchange.init.headers).get('content-type'), 'application/json');
  const sent = JSON.parse(String(exchange.init.body));
  assert.deepEqual({ ...sent, code_verifier: undefined }, { client_id: 'cu-app', client_secret: 'cu-secret', code: 'cu-code', code_verifier: undefined });
  assert.match(sent.code_verifier, /^[A-Za-z0-9_-]{43,128}$/);

  await links.revoke('clickup', 'user-1');
  tokenStatus = 401;
  await assert.rejects(links.complete('clickup', 'cu-code', begin(), 'test-browser'), (error: any) => error instanceof RuntimeFailure && !JSON.stringify({ message: error.message, error }).includes('cu-secret'));
});

test('a person can paste a personal token for ClickUp or GitLab with no application registered', async t => {
  const { links, config, fake } = await harness(t);
  config.links = { gitlab: { baseUrl: fake.base, scopes: ['read_api'] }, clickup: { apiUrl: fake.base, appUrl: fake.base } };
  config.taskSources = [{ id: 'board', name: 'Board', provider: 'clickup', baseUrl: `${fake.base}/api/v2`, project: '1', repositoryId: 'r', executionOwner: 'interactive' }];
  const listed = links.describeAll('user-1');
  assert.deepEqual(listed.map(link => `${link.provider}:${link.configured}:${link.oauth}`), ['gitlab:true:false', 'clickup:true:false']);
  assert.throws(() => links.begin('clickup', 'user-1', 'test-browser'), (error: any) => error.code === 'link_unconfigured');
  await assert.rejects(links.paste('clickup', 'user-1', 'wrong-token'), (error: any) => error.code === 'link_profile');
  await assert.rejects(links.paste('clickup', 'user-1', '   '), (error: any) => error.code === 'link_token');
  const clickup = await links.paste('clickup', 'user-1', 'cu-access-1');
  assert.equal(clickup.linked, true);
  assert.equal(clickup.method, 'token');
  assert.equal(clickup.login, 'ryan');
  assert.deepEqual(await links.token('user-1', 'clickup'), { token: 'cu-access-1', type: 'private' });
  fake.privateToken = 'glpat-personal';
  const gitlab = await links.paste('gitlab', 'user-1', 'glpat-personal');
  assert.equal(gitlab.method, 'token');
  assert.deepEqual(await links.token('user-1', 'gitlab'), { token: 'glpat-personal', type: 'private' });
  assert.deepEqual(await links.access('user-1', `${fake.base}/group/project.git`), { username: 'oauth2', password: 'glpat-personal' });
  await links.revoke('gitlab', 'user-1');
  assert.equal(fake.revoked.length, 0);
  assert.equal(links.describe('user-1', 'gitlab').linked, false);
});

test('unlinking logs, without the token, a GitLab revocation that failed and a ClickUp token that cannot be revoked', async t => {
  const { store, config } = await harness(t);
  config.links = { gitlab: { baseUrl: 'https://gitlab.test', clientId: 'application-id-1234', scopes: ['read_api'] }, clickup: { clientId: 'cu-app', clientSecret: 'cu-secret', apiUrl: 'https://api.clickup.test', appUrl: 'https://app.clickup.test' } };
  let revokeStatus = 503;
  const intercepted: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/oauth/revoke') { if (revokeStatus === 0) throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); return new Response('{}', { status: revokeStatus }); }
    return new Response('{}', { status: 404 });
  };
  const links = new Links(store, config, intercepted);
  const logged: Record<string, unknown>[] = [];
  const lines: string[] = [];
  t.mock.method(console, 'error', (line: string) => { lines.push(line); logged.push(JSON.parse(line)); });
  store.setSecret('link:gitlab:user-1', { accessToken: 'gl-access-secret', refreshToken: 'gl-refresh-secret', scopes: [], login: 'ryan', webUrl: 'https://gitlab.test/ryan', linkedAt: new Date().toISOString(), method: 'oauth' });
  await links.revoke('gitlab', 'user-1');
  assert.equal(links.describe('user-1').linked, false, 'the link is forgotten even when the provider did not confirm');
  assert.deepEqual(logged.map(entry => [entry.event, entry.token, entry.status]), [['link.revoke_failed', 'access', 503], ['link.revoke_failed', 'refresh', 503]]);
  logged.length = 0;
  revokeStatus = 0;
  store.setSecret('link:gitlab:user-1', { accessToken: 'gl-access-secret', scopes: [], login: 'ryan', webUrl: 'https://gitlab.test/ryan', linkedAt: new Date().toISOString(), method: 'oauth' });
  await links.revoke('gitlab', 'user-1');
  assert.deepEqual(logged.map(entry => [entry.event, entry.reason]), [['link.revoke_failed', 'ECONNREFUSED']]);
  logged.length = 0;
  store.setSecret('link:clickup:user-1', { accessToken: 'cu-access-secret', scopes: [], login: 'ryan', webUrl: 'https://app.clickup.test', linkedAt: new Date().toISOString(), method: 'oauth' });
  await links.revoke('clickup', 'user-1');
  assert.deepEqual(logged.map(entry => [entry.event, entry.level]), [['link.revoke_unsupported', 'info']]);
  revokeStatus = 200;
  logged.length = 0;
  store.setSecret('link:gitlab:user-1', { accessToken: 'gl-access-secret', scopes: [], login: 'ryan', webUrl: 'https://gitlab.test/ryan', linkedAt: new Date().toISOString(), method: 'oauth' });
  await links.revoke('gitlab', 'user-1');
  assert.deepEqual(logged, [], 'a confirmed revocation logs nothing');
  assert.equal(lines.some(line => line.includes('-secret')), false, 'no log line carries a token');
});
