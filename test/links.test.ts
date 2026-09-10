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

type Fake = { base: string; tokens: Record<string, unknown>[]; clickupExchanges: Record<string, string>[]; revoked: string[]; users: number; expiresIn: number; close(): Promise<void> };

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
      if (req.headers.authorization !== 'Bearer access-1') { res.writeHead(401); res.end('{}'); return; }
      res.end(JSON.stringify({ username: 'ryan', web_url: `${fake.base}/ryan` }));
      return;
    }
    if (req.method === 'POST' && req.url === '/oauth/revoke') { fake.revoked.push(String(data.token)); res.end('{}'); return; }
    if (req.method === 'POST' && req.url?.startsWith('/api/v2/oauth/token')) {
      const params = Object.fromEntries(new URL(req.url, fake.base).searchParams);
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
  const dataDir = await mkdtemp(join(tmpdir(), 'vloer-links-'));
  const fake = await gitlab();
  const store = new Store(join(dataDir, 'vloer.sqlite'));
  const config = configuration(dataDir, 'live');
  config.baseUrl = 'http://127.0.0.1:4080';
  config.links = { gitlab: { baseUrl: fake.base, clientId: 'application-id-1234', scopes: ['read_api', 'read_repository', 'write_repository'] } };
  const links = new Links(store, config);
  t.after(async () => { store.close(); await fake.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { links, store, fake, config };
}

test('a link starts with PKCE, completes against the account, and yields clone access for that host only', async t => {
  const { links, store, fake } = await harness(t);
  assert.deepEqual(links.describe('user-1'), { provider: 'gitlab', host: new URL(fake.base).host, configured: true, linked: false });
  const url = new URL(links.begin('gitlab', 'user-1'));
  assert.equal(url.origin + url.pathname, `${fake.base}/oauth/authorize`);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4080/api/links/gitlab/callback');
  assert.equal(url.searchParams.get('scope'), 'read_api read_repository write_repository');
  const state = url.searchParams.get('state')!;
  await assert.rejects(links.complete('gitlab', 'good-code', 'not-a-state'), (error: any) => error instanceof LinkError && error.code === 'link_state');
  const completed = await links.complete('gitlab', 'good-code', state);
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
  assert.equal(await links.complete('gitlab', 'good-code', state).catch((error: any) => error.code), 'link_state');
  assert.ok(store.getSecret('link:gitlab:user-1'));
});

test('an expiring link is refreshed before the clone and revocation forgets and revokes both tokens', async t => {
  const { links, store, fake } = await harness(t);
  fake.expiresIn = 60;
  const state = new URL(links.begin('gitlab', 'user-1')).searchParams.get('state')!;
  await links.complete('gitlab', 'good-code', state);
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
  const state = new URL(links.begin('gitlab', 'user-1')).searchParams.get('state')!;
  await assert.rejects(links.complete('gitlab', 'bad-code', state), (error: any) => error instanceof RuntimeFailure && error.category === 'workspace_setup' && error.httpStatus === 400);
  fake.expiresIn = 60;
  const again = new URL(links.begin('gitlab', 'user-1')).searchParams.get('state')!;
  await links.complete('gitlab', 'good-code', again);
  const record = (links as any).record('gitlab', 'user-1');
  (links as any).store.setSecret('link:gitlab:user-1', { ...record, refreshToken: 'stale' });
  await assert.rejects(links.access('user-1', `${fake.base}/p.git`), (error: any) => error instanceof RuntimeFailure && error.category === 'workspace_setup' && error.detail === 'The GitLab OAuth exchange answered HTTP 400');
});

test('an unconfigured link describes itself and refuses to start', async t => {
  const { links, config } = await harness(t);
  config.links = { gitlab: { baseUrl: 'https://gitlab.example', scopes: ['read_api'] } };
  assert.deepEqual(links.describe('user-1'), { provider: 'gitlab', host: 'gitlab.example', configured: false, linked: false });
  assert.throws(() => links.begin('gitlab', 'user-1'), (error: any) => error instanceof LinkError && error.status === 409);
  assert.equal(await links.access('user-1', 'https://gitlab.example/p.git'), undefined);
});

test('a ClickUp link exchanges the code with the client secret, keeps the token for task sources, and is listed beside GitLab', async t => {
  const { links, config, fake } = await harness(t);
  config.links = { ...config.links, clickup: { clientId: 'cu-app', clientSecret: 'cu-secret', apiUrl: fake.base, appUrl: fake.base } };
  const listed = links.describeAll('user-1').map(link => `${link.provider}:${link.configured}:${link.linked}`);
  assert.deepEqual(listed, ['gitlab:true:false', 'clickup:true:false']);
  const url = new URL(links.begin('clickup', 'user-1'));
  assert.equal(url.pathname, '/api');
  assert.equal(url.searchParams.get('client_id'), 'cu-app');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4080/api/links/clickup/callback');
  const state = url.searchParams.get('state')!;
  const other = new URL(links.begin('clickup', 'user-1')).searchParams.get('state')!;
  await assert.rejects(links.complete('gitlab', 'good-code', other), (error: any) => error.code === 'link_state');
  await assert.rejects(links.complete('clickup', 'cu-code', other), (error: any) => error.code === 'link_state');
  const completed = await links.complete('clickup', 'cu-code', state);
  assert.equal(completed.link.linked, true);
  assert.equal(completed.link.login, 'ryan');
  assert.equal(await links.token('user-1', 'clickup'), 'cu-access-1');
  assert.equal(await links.token('user-2', 'clickup'), undefined);
  assert.equal(fake.clickupExchanges[0].client_secret, 'cu-secret');
  await links.revoke('clickup', 'user-1');
  assert.equal(links.describe('user-1', 'clickup').linked, false);
});
