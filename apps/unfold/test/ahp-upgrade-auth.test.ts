import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { application, login, request } from './api-support.ts';
import { connect } from './ahp-support.ts';
import { agentHostOriginAllowed, defaultAgentHostOrigins, isAgentHostOriginPattern, renewedExpiry } from '../src/ahp/upgrade-auth.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function handshake(base: string, path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(new URL(path, base), { method: 'GET', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), ...headers } });
    req.on('upgrade', (response, socket) => { socket.destroy(); resolve(response.statusCode ?? 0); });
    req.on('response', response => { response.resume(); resolve(response.statusCode ?? 0); });
    req.on('error', reject);
    req.end();
  });
}

async function tokenOf(server: { url: string }, cookie?: string): Promise<string> {
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', ...(cookie ? { cookie } : {}), body: { label: 'upgrade' } });
  assert.equal(issued.status, 201, issued.text);
  return issued.body.token;
}

test('the upgrade accepts the token in an Authorization header, and an old client\'s tkn query still connects', async t => {
  const server = await application();
  t.after(() => server.close());
  const token = await tokenOf(server);
  assert.equal(await handshake(server.url, '/', { Authorization: `Bearer ${token}` }), 101);
  assert.equal(await handshake(server.url, '/ahp', { Authorization: `bearer ${token}` }), 101);
  assert.equal(await handshake(server.url, '/', { Authorization: 'Bearer not-a-real-token-value' }), 403);
  assert.equal(await handshake(server.url, '/'), 403, 'no token is refused');
  assert.equal(await handshake(server.url, `/?tkn=${token}`), 101, 'the query form VS Code 1.144 sends keeps working');
  const old = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${token}`);
  t.after(() => old.close());
  await old.open;
  assert.deepEqual(await old.rpc('ping', { channel: 'ahp-root://' }), {});
});

test('a token in the URL query is logged once per token, without the token', async t => {
  const server = await application();
  t.after(() => server.close());
  const token = await tokenOf(server);
  const lines: string[] = [];
  t.mock.method(console, 'error', (line: unknown) => { lines.push(String(line)); });
  assert.equal(await handshake(server.url, `/?tkn=${token}`, { 'User-Agent': 'old-client' }), 101);
  assert.equal(await handshake(server.url, `/?tkn=${token}`), 101);
  assert.equal(await handshake(server.url, '/', { Authorization: `Bearer ${token}` }), 101);
  const logged = lines.filter(line => line.includes('agent_host.token_in_query'));
  assert.equal(logged.length, 1);
  assert.equal(JSON.parse(logged[0]).tokenId, sha256(token).slice(0, 12));
  assert.ok(!logged[0].includes(token), 'the log line never carries the token');
});

test('the upgrade refuses a web page from another origin and accepts the Agents window, the workbench and non-browser clients', async t => {
  const server = await application('demo', config => { config.baseUrl = 'https://unfold.example'; });
  t.after(() => server.close());
  const token = await tokenOf(server);
  const lines: string[] = [];
  t.mock.method(console, 'error', (line: unknown) => { lines.push(String(line)); });
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal(await handshake(server.url, '/', { ...auth, Origin: 'https://evil.example' }), 403);
  assert.equal(await handshake(server.url, `/?tkn=${token}`, { Origin: 'https://evil.example' }), 403, 'a valid token does not let another site in');
  assert.ok(lines.some(line => line.includes('agent_host.origin_refused') && line.includes('https://evil.example')));
  assert.equal(await handshake(server.url, '/', { ...auth, Origin: 'vscode-file://vscode-app' }), 101, 'VS Code\'s desktop Agents window');
  assert.equal(await handshake(server.url, '/', { ...auth, Origin: 'https://unfold.example' }), 101, 'the workbench\'s own pages');
  assert.equal(await handshake(server.url, '/', auth), 101, 'a client that is not a web page sends no Origin');
  assert.equal(await handshake(server.url, '/', { Origin: 'https://evil.example' }), 403);
});

test('auth.agentHostOrigins replaces the default origins; "*" accepts any', async t => {
  const server = await application('demo', config => { config.auth.agentHostOrigins = ['https://vscode.dev']; });
  t.after(() => server.close());
  const auth = { Authorization: `Bearer ${await tokenOf(server)}` };
  assert.equal(await handshake(server.url, '/', { ...auth, Origin: 'https://vscode.dev' }), 101);
  assert.equal(await handshake(server.url, '/', { ...auth, Origin: 'vscode-file://vscode-app' }), 403);
  assert.equal(agentHostOriginAllowed('https://any.example', ['*']), true);
  assert.equal(agentHostOriginAllowed('VSCODE-FILE://vscode-app/', undefined), true, 'origins compare without case or a trailing slash');
  assert.equal(agentHostOriginAllowed('null', undefined), false, 'an opaque origin is refused');
  assert.deepEqual(defaultAgentHostOrigins, ['vscode-file://vscode-app']);
  for (const good of ['*', 'https://vscode.dev', 'vscode-file://vscode-app', 'http://127.0.0.1:8080']) assert.equal(isAgentHostOriginPattern(good), true, good);
  for (const bad of ['', 'vscode.dev', 'https://vscode.dev/path', 'https://user@vscode.dev', 'https://*.example', 42]) assert.equal(isAgentHostOriginPattern(bad), false, String(bad));
});

test('renewal never carries a token past the absolute expiry of the sign-in that issued it', async t => {
  const server = await application('live');
  t.after(() => server.close());
  const store = server.app.store;
  const auth = await login(server.url);
  const signIn = sha256(auth.cookie.slice(auth.cookie.indexOf('=') + 1));
  const record = store.getLogin(signIn)!;
  const signInEnds = Date.now() + 30 * 60_000;
  store.deleteLogin(signIn);
  store.createLogin(signIn, record.userId, new Date(signInEnds).toISOString());
  const token = await tokenOf(server, auth.cookie);
  const key = `ahp-token:${sha256(token)}`;
  assert.ok(Date.parse(store.getSecret<{ expiresAt: string }>(key)!.expiresAt) <= signInEnds, 'a new token starts within the sign-in');
  store.setSecret(key, { ...store.getSecret<object>(key)!, expiresAt: new Date(Date.now() + 120_000).toISOString() });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${token}`);
  t.after(() => client.close());
  await client.open;
  assert.deepEqual(await client.rpc('ping', { channel: 'ahp-root://' }), {});
  const renewed = Date.parse(store.getSecret<{ expiresAt: string }>(key)!.expiresAt);
  assert.ok(renewed > Date.now() + 120_000, 'use still renews the token');
  assert.ok(renewed <= signInEnds, 'but only up to the sign-in\'s own expiry');
});

test('the renewed expiry slides only within the issuing sign-in, and a token bound to none does not slide', () => {
  const hour = 3_600_000;
  assert.equal(renewedExpiry(0, 12 * hour, hour, 20 * hour, true), 12 * hour);
  assert.equal(renewedExpiry(0, 12 * hour, hour, 2 * hour, true), 2 * hour);
  assert.equal(renewedExpiry(0, 12 * hour, hour, undefined, true), hour);
  assert.equal(renewedExpiry(0, 12 * hour, hour, undefined, false), hour);
});
