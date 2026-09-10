import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { application, login, request } from './api-support.ts';

async function gitlab() {
  const revoked: string[] = [];
  let base = '';
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : {};
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/oauth/token') { res.end(JSON.stringify({ access_token: 'access-secret-1', refresh_token: 'refresh-secret-1', expires_in: 7200, scope: 'read_api read_repository' })); return; }
    if (req.method === 'GET' && req.url === '/api/v4/user') { res.end(JSON.stringify({ username: 'ryan', web_url: `${base}/ryan` })); return; }
    if (req.method === 'POST' && req.url === '/oauth/revoke') { revoked.push(String(data.token)); res.end('{}'); return; }
    res.writeHead(404); res.end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { base, revoked, close: () => new Promise<void>(done => server.close(() => done())) };
}

test('links are absent until configured and a start is refused without an application id', async t => {
  const app = await application('live', config => { config.links = { gitlab: { baseUrl: 'https://gitlab.example', scopes: ['read_api'] } }; });
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const listed = await request(app.url, '/api/links', { cookie });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.links, [{ provider: 'gitlab', host: 'gitlab.example', configured: false, linked: false }]);
  const started = await request(app.url, '/api/links/gitlab', { method: 'POST', body: {}, cookie, csrf: true });
  assert.equal(started.status, 409);
  assert.equal(started.body.error.code, 'link_unconfigured');
});

test('a person links GitLab through the browser, sees the account without its tokens, and can unlink', async t => {
  const fake = await gitlab();
  const app = await application('live', config => { config.links = { gitlab: { baseUrl: fake.base, clientId: 'application-id-1234', scopes: ['read_api', 'read_repository'] } }; });
  t.after(async () => { await app.close(); await fake.close(); });
  const { cookie } = await login(app.url);
  const anonymous = await request(app.url, '/api/links');
  assert.equal(anonymous.status, 401);
  const started = await request(app.url, '/api/links/gitlab', { method: 'POST', body: {}, cookie, csrf: true });
  assert.equal(started.status, 200);
  const authorize = new URL(started.body.url);
  assert.equal(authorize.origin, fake.base);
  const state = authorize.searchParams.get('state')!;
  const callback = await fetch(`${app.url}/api/links/gitlab/callback?code=good-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/?linked=gitlab');
  const replay = await fetch(`${app.url}/api/links/gitlab/callback?code=good-code&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
  assert.equal(replay.headers.get('location'), '/?link_error=link_state');
  const denied = await fetch(`${app.url}/api/links/gitlab/callback?error=access_denied&state=x`, { redirect: 'manual' });
  assert.equal(denied.headers.get('location'), '/?link_error=access_denied');
  const listed = await request(app.url, '/api/links', { cookie });
  assert.equal(listed.body.links[0].linked, true);
  assert.equal(listed.body.links[0].login, 'ryan');
  assert.equal(JSON.stringify(listed.body).includes('secret-1'), false);
  const removed = await request(app.url, '/api/links/gitlab', { method: 'DELETE', cookie, csrf: true });
  assert.equal(removed.status, 200);
  assert.deepEqual(fake.revoked.sort(), ['access-secret-1', 'refresh-secret-1']);
  const after = await request(app.url, '/api/links', { cookie });
  assert.equal(after.body.links[0].linked, false);
});

test('a task connection without its own token uses the person\'s link and says so when there is none', async t => {
  const app = await application('live', config => {
    config.links = { clickup: { clientId: 'cu-app', clientSecret: 'cu-secret', apiUrl: 'https://api.clickup.example', appUrl: 'https://app.clickup.example' } };
    config.taskSources = [{ id: 'board', name: 'Board', provider: 'clickup', baseUrl: 'https://api.clickup.example/api/v2', project: '123', repositoryId: 'order-service', executionOwner: 'interactive' }];
  });
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const sources = await request(app.url, '/api/task-sources', { cookie });
  assert.equal(sources.body[0].needsLink, 'clickup');
  const tasks = await request(app.url, '/api/task-sources/board/tasks', { cookie });
  assert.equal(tasks.status, 409);
  assert.equal(tasks.body.error.code, 'source_unlinked');
  const listed = await request(app.url, '/api/links', { cookie });
  assert.deepEqual(listed.body.links.map((link: any) => link.provider), ['clickup']);
});
