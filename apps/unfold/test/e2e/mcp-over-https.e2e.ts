import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { SdkHttpError } from '@modelcontextprotocol/client';
import { cleanups, provision, setGroups, signInAtAuthentik, submitCredentials, startAuthentik, type Authentik, type Person, type Realm } from './authentik.ts';
import { startFakePloeg } from './fake-ploeg.ts';
import { LoopbackSignIn, connect, loopbackCallback, type Connection, type Elicit } from './mcp-client.ts';

const unfoldRoot = fileURLToPath(new URL('../../', import.meta.url));
const log = (line: string) => process.stderr.write(`[mcp-e2e] ${line}\n`);
const modernMeta = (capabilities: Record<string, unknown> = {}) => ({ 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'unfold-e2e-raw', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': capabilities });

const conformanceScenarios = ['server-initialize', 'ping', 'tools-list'];

type Unfold = { url: string; resource: string; lines: string[]; process: ChildProcess };
type Persona = 'alice' | 'bob' | 'erin' | 'frank';

let authentik: Authentik;
let realm: Realm;
let ploeg: Awaited<ReturnType<typeof startFakePloeg>>;
let unfold: Unfold;
let browser: Browser;
let workdir: string;
const contexts = new Map<string, BrowserContext>();
const connections: Connection[] = [];
const seen: string[] = [];
const secrets = new Set<string>();

function accountId(issuer: string, subject: string): string {
  return 'oidc-' + createHash('sha256').update(`${issuer.replace(/\/$/, '')}|${subject}`).digest('hex').slice(0, 32);
}

function claims(jwt: string): Record<string, any> {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(done => server.close(() => done()));
  return port;
}

async function startUnfold(): Promise<Unfold> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const ploegTokenEnv = 'UNFOLD_E2E_PLOEG_TOKEN';
  const userTeams = {
    [accountId(realm.browser.issuer, realm.people.alice.uid)]: ['delivery'],
    [accountId(realm.browser.issuer, realm.people.bob.uid)]: ['research'],
    [accountId(realm.browser.issuer, realm.people.frank.uid)]: ['delivery'],
  };
  const config = {
    mode: 'live',
    repositories: [{ id: 'order-service', name: 'Order service', description: 'Never cloned by this suite', url: 'https://forge.e2e.invalid/delivery/order-service.git', baseBranch: 'main', verify: ['true'] }],
    auth: { oidc: { issuer: realm.browser.issuer, clientId: realm.browser.clientId, scopes: ['openid', 'email', 'profile', 'groups'], displayName: 'Authentik', groupsClaim: 'groups', roles: { admin: [realm.groups.admins.name], operator: [realm.groups.operators.name], viewer: [realm.groups.viewers.name] } } },
    ploeg: { url: ploeg.ploegUrl, tokenEnv: ploegTokenEnv, userTeams },
    execution: { team: 'delivery' },
  };
  const configFile = join(workdir, 'unfold.json');
  await writeFile(configFile, JSON.stringify(config, null, 2));
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: workdir,
    UNFOLD_MODE: 'live',
    UNFOLD_HOST: '127.0.0.1',
    UNFOLD_PORT: String(port),
    UNFOLD_BASE_URL: url,
    UNFOLD_DATA_DIR: join(workdir, 'data'),
    UNFOLD_ADMIN_PASSWORD: randomBytes(18).toString('base64url'),
    UNFOLD_MCP_RESOURCE: `${url}/mcp`,
    UNFOLD_MCP_ISSUER: realm.mcp.issuer,
    UNFOLD_MCP_CLIENT_IDS: realm.mcp.clientId,
    UNFOLD_MCP_TOKEN_AUDIENCE: 'client-id',
    UNFOLD_MCP_REQUEST_SCOPES: 'openid unfold:mcp offline_access',
    LITELLM_BASE_URL: ploeg.gatewayUrl,
    LITELLM_MASTER_KEY: `sk-master-${randomBytes(12).toString('hex')}`,
    [ploegTokenEnv]: ploeg.bearer,
  };
  secrets.add(env.LITELLM_MASTER_KEY).add(ploeg.bearer).add('sk-ask-capped-e2e');
  const child = spawn(process.execPath, ['src/main.ts', '--config', configFile], { cwd: unfoldRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines: string[] = [];
  let ready!: () => void;
  const started = new Promise<void>(done => { ready = done; });
  for (const stream of [child.stdout!, child.stderr!]) {
    let buffered = '';
    stream.setEncoding('utf8').on('data', chunk => {
      buffered += chunk;
      for (let at = buffered.indexOf('\n'); at >= 0; at = buffered.indexOf('\n')) {
        const line = buffered.slice(0, at);
        buffered = buffered.slice(at + 1);
        lines.push(line);
        if (process.env.UNFOLD_E2E_VERBOSE) log(`unfold: ${line}`);
        if (line.includes('"server.ready"')) ready();
      }
    });
  }
  const exited = once(child, 'exit').then(([code]) => { throw new Error(`Unfold exited with ${code} before it was ready:\n${lines.join('\n')}`); });
  await Promise.race([started, exited, new Promise((_, reject) => setTimeout(() => reject(new Error(`Unfold was not ready within 60 s:\n${lines.join('\n')}`)), 60_000))]);
  exited.catch(() => undefined);
  return { url, resource: `${url}/mcp`, lines, process: child };
}

function context(name: string): Promise<BrowserContext> {
  const existing = contexts.get(name);
  if (existing) return Promise.resolve(existing);
  return browser.newContext().then(created => { contexts.set(name, created); return created; });
}

async function signInToUnfold(who: Person, name: string) {
  const page = await (await context(name)).newPage();
  await page.goto(`${unfold.url}/api/auth/oidc`);
  await signInAtAuthentik(page, authentik, who, new RegExp(`^${unfold.url.replace(/[.]/g, '\\.')}/`));
  await page.waitForLoadState('networkidle');
  const bootstrap = await page.evaluate(async () => { const response = await fetch('/api/bootstrap', { headers: { 'x-unfold-request': '1' } }); return { status: response.status, body: await response.json().catch(() => null) }; });
  await page.close();
  return bootstrap;
}

async function mcpAs(persona: Persona, options: { era?: 'legacy' | 'modern'; elicit?: Elicit } = {}): Promise<Connection> {
  const connection = await connect({ url: unfold.resource, clientId: realm.mcp.clientId, era: options.era ?? 'legacy', authentik, person: realm.people[persona], context: await context(persona), ...(options.elicit ? { elicit: options.elicit } : {}) });
  connections.push(connection);
  remember(connection);
  return connection;
}

function remember(connection: Connection) {
  const tokens = connection.signIn.stored;
  for (const value of [tokens?.access_token, tokens?.refresh_token, (tokens as { id_token?: string } | undefined)?.id_token]) if (value) secrets.add(value);
}

async function call(connection: Connection, name: string, args: Record<string, unknown>) {
  const result = await connection.client.callTool({ name, arguments: args });
  seen.push(JSON.stringify(result));
  return result as { isError?: boolean; structuredContent?: any; content: { type: string; text: string }[] };
}

async function raw(token: string | undefined, message: Record<string, any>, options: { headers?: Record<string, string>; method?: string; modern?: boolean } = {}) {
  const modern = options.modern ?? true;
  const body = modern && message.method ? { ...message, params: { ...(message.params ?? {}), _meta: message.params?._meta ?? modernMeta() } } : message;
  const headers: Record<string, string> = {
    'content-type': 'application/json', accept: 'application/json, text/event-stream',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(modern ? { 'mcp-protocol-version': '2026-07-28', 'mcp-method': message.method } : {}),
    ...(modern && message.method === 'tools/call' ? { 'mcp-name': message.params.name } : {}),
    ...options.headers,
  };
  const response = await fetch(unfold.resource, { method: options.method ?? 'POST', headers, ...(options.method && options.method !== 'POST' ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  seen.push(text);
  let json: any;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, headers: response.headers, text, json };
}

async function tokenEndpoint(issuer: string): Promise<string> {
  const discovery = await (await fetch(`${issuer}.well-known/openid-configuration`)).json();
  assert.equal(discovery.issuer, issuer);
  return discovery.token_endpoint;
}

function mcpRequests(): { actor: string; method: string; tool?: string; protocol: string }[] {
  return unfold.lines.filter(line => line.includes('"mcp.request"')).map(line => JSON.parse(line));
}

before(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'unfold-mcp-e2e-'));
  authentik = await startAuthentik(log);
  realm = await provision(authentik);
  log(`provisioned run ${realm.run}: browser ${realm.browser.issuer}, MCP ${realm.mcp.issuer}`);
  ploeg = await startFakePloeg();
  unfold = await startUnfold();
  log(`Unfold is ready at ${unfold.url}`);
  browser = await chromium.launch({ headless: true, ...(process.env.UNFOLD_CHROMIUM_BIN ? { executablePath: process.env.UNFOLD_CHROMIUM_BIN, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
}, { timeout: 600_000 });

after(async () => {
  for (const connection of connections) await connection.close();
  await browser?.close();
  unfold?.process.kill('SIGTERM');
  if (unfold?.process.exitCode === null) await Promise.race([once(unfold.process, 'exit'), new Promise(done => setTimeout(done, 5000))]);
  await ploeg?.close();
  await authentik?.close();
  for (const cleanup of cleanups) await cleanup();
  if (workdir) await rm(workdir, { recursive: true, force: true });
}, { timeout: 120_000 });

test('the endpoint points clients at the Authentik provider and refuses a request without a token', async () => {
  const metadata = await (await fetch(`${unfold.url}/.well-known/oauth-protected-resource/mcp`)).json();
  assert.deepEqual([metadata.resource, metadata.authorization_servers], [unfold.resource, [realm.mcp.issuer]]);
  await tokenEndpoint(realm.mcp.issuer);
  const refused = await raw(undefined, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(refused.status, 401);
  const challenge = refused.headers.get('www-authenticate') ?? '';
  assert.match(challenge, /^Bearer /);
  assert.match(challenge, new RegExp(`resource_metadata="${unfold.url}/.well-known/oauth-protected-resource/mcp"`));
  assert.match(challenge, /scope="openid unfold:mcp offline_access"/);
});

test('people sign in to Unfold on Authentik\'s own login page and get the account their subject names', async () => {
  const expected: Record<Persona, string> = { alice: 'operator', bob: 'viewer', erin: 'admin', frank: 'operator' };
  for (const persona of Object.keys(expected) as Persona[]) {
    const signedIn = await signInToUnfold(realm.people[persona], persona);
    assert.equal(signedIn.status, 200, `${persona}: ${JSON.stringify(signedIn.body)}`);
    assert.equal(signedIn.body.user.id, accountId(realm.browser.issuer, realm.people[persona].uid), `${persona}'s browser account comes from the browser provider's sub, which is Authentik's hashed user id`);
    assert.equal(signedIn.body.user.role, expected[persona]);
  }
  const page = await (await context('carol')).newPage();
  await page.goto(`${unfold.url}/api/auth/oidc`);
  await submitCredentials(page, realm.people.carol);
  await page.getByText(/denied|permission/i).first().waitFor({ timeout: 20_000 });
  assert.ok(page.url().startsWith(authentik.url), 'Authentik refuses someone outside the bound groups before Unfold sees a callback');
  await page.close();
});

test('the official MCP client signs in through Authentik with PKCE and works as the person who signed in', async () => {
  const alice = await mcpAs('alice');
  const token = claims(alice.signIn.accessToken);
  assert.equal(token.iss, realm.mcp.issuer);
  assert.equal(token.sub, realm.people.alice.uid, 'the MCP provider gives the same subject as the browser provider');
  assert.equal(token.azp, realm.mcp.clientId);
  assert.ok([token.aud].flat().includes(realm.mcp.clientId), 'Authentik puts the client id in aud, which needs UNFOLD_MCP_TOKEN_AUDIENCE=client-id');
  assert.ok(String(token.scope).split(' ').includes('unfold:mcp'), `scope: ${token.scope}`);
  assert.deepEqual(token.groups, [realm.groups.operators.name], 'the unfold:mcp mapping puts the groups in the access token');
  assert.equal(token.exp - token.iat, 600);
  assert.ok(alice.signIn.stored?.refresh_token, 'offline_access gives the client a refresh token');

  const tools = await alice.client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name), ['unfold_now', 'unfold_find_work', 'unfold_get_work', 'unfold_sessions', 'unfold_linked_sessions', 'unfold_link_session', 'unfold_spend', 'unfold_digest', 'unfold_ask', 'unfold_hand_off', 'unfold_approve_work', 'unfold_reject_work', 'unfold_stop_work', 'unfold_retry_work', 'unfold_answer_question', 'unfold_add_note', 'unfold_steer_session']);
  const found = await call(alice, 'unfold_find_work', { team: 'delivery' });
  assert.notEqual(found.isError, true, found.content[0]?.text);
  assert.ok(found.structuredContent.items.length > 0);
  assert.ok(found.structuredContent.items.every((item: { team: string }) => item.team === 'delivery'));
  const own = await call(alice, 'unfold_get_work', { id: ploeg.itemsOf('delivery')[0] });
  assert.notEqual(own.isError, true, own.content[0]?.text);
  const foreign = await call(alice, 'unfold_get_work', { id: ploeg.itemsOf('research')[0] });
  assert.equal(foreign.isError, true, 'a Work Item of a Team the person is not in stays out of reach');
  const outside = await call(alice, 'unfold_find_work', { team: 'research' });
  assert.ok(outside.isError || outside.structuredContent.items.length === 0, 'another Team lists nothing');

  const aliceId = accountId(realm.browser.issuer, realm.people.alice.uid);
  assert.ok(mcpRequests().length > 0 && mcpRequests().every(entry => entry.actor === aliceId), 'every MCP request ran as the browser account');
});

test('the refresh token from Authentik yields a new access token the endpoint accepts', async () => {
  const alice = connections[0];
  const endpoint = await tokenEndpoint(realm.mcp.issuer);
  const refreshed = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: alice.signIn.stored!.refresh_token!, client_id: realm.mcp.clientId }) });
  const tokens = await refreshed.json();
  assert.equal(refreshed.status, 200, JSON.stringify(tokens));
  secrets.add(tokens.access_token); if (tokens.refresh_token) secrets.add(tokens.refresh_token);
  assert.notEqual(tokens.access_token, alice.signIn.accessToken);
  const listed = await raw(tokens.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(listed.status, 200, listed.text);
});

test('a 2026-07-28 client asks the person before an Ask spends, and one confirmation spends once', async () => {
  const prompts: string[] = [];
  let answer: 'accept' | 'decline' = 'accept';
  const alice = await mcpAs('alice', { era: 'modern', elicit: async request => { prompts.push(String(request.params.message)); return answer === 'accept' ? { action: 'accept', content: { confirm: true } } : { action: 'decline' }; } });
  const before = { admitted: ploeg.ledger.admitted.length, prompts: ploeg.ledger.prompts.length };
  const workItem = ploeg.itemsOf('delivery')[0];
  const asked = await call(alice, 'unfold_ask', { id: workItem, question: 'Why did this stop?', use_model: true });
  assert.notEqual(asked.isError, true, asked.content[0]?.text);
  assert.equal(asked.structuredContent.asked, true);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /spends up to \$0\.02 from the Team's Ask Allowance/);
  assert.equal(ploeg.ledger.admitted.length, before.admitted + 1, 'Ploeg admitted exactly one Ask');
  assert.equal(ploeg.ledger.prompts.length, before.prompts + 1, 'the gateway answered exactly one completion');
  assert.equal(ploeg.ledger.admitted.at(-1)!.actor, accountId(realm.browser.issuer, realm.people.alice.uid));
  assert.equal(ploeg.ledger.prompts.at(-1)!.auth, 'Bearer sk-ask-capped-e2e');

  answer = 'decline';
  const declined = await call(alice, 'unfold_ask', { id: workItem, question: 'And what did it cost?', use_model: true });
  assert.equal(declined.structuredContent.asked, false);
  assert.equal(ploeg.ledger.admitted.length, before.admitted + 1, 'a declined confirmation spends nothing');
});

test('a confirmation is single-use, sealed, and bound to the person and question, with real tokens', async () => {
  const alice = connections[0].signIn.accessToken;
  const bob = (await mcpAs('bob')).signIn.accessToken;
  const capabilities = { elicitation: { form: {} } };
  const workItem = ploeg.itemsOf('delivery')[1];
  const ask = (token: string, id: number, extra: Record<string, unknown> = {}, question = 'Who reviewed this?') => raw(token, { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'unfold_ask', arguments: { id: workItem, question, use_model: true }, _meta: modernMeta(capabilities), ...extra } });
  const accept = { inputResponses: { confirm_spend: { action: 'accept', content: { confirm: true } } } };

  const first = await ask(alice, 1);
  assert.equal(first.json.result.resultType, 'input_required', first.text);
  const state = first.json.result.requestState as string;
  const before = ploeg.ledger.admitted.length;

  const foreign = await ask(bob, 2, { ...accept, requestState: state });
  assert.equal(foreign.json.result.isError, true);
  assert.match(foreign.json.result.content[0].text, /given to someone else/);
  const otherQuestion = await ask(alice, 3, { ...accept, requestState: state }, 'Something else?');
  assert.match(otherQuestion.json.result.content[0].text, /another question/);
  const [payload, mac] = state.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), e: Date.now() + 86_400_000 })).toString('base64url');
  const tampered = await ask(alice, 4, { ...accept, requestState: `${forged}.${mac}` });
  assert.match(tampered.json.result.content[0].text, /not one this server issued/);
  assert.equal(ploeg.ledger.admitted.length, before, 'no refused confirmation reached Ploeg');

  const redeemed = await ask(alice, 5, { ...accept, requestState: state });
  assert.equal(redeemed.json.result.structuredContent?.asked, true, redeemed.text);
  assert.equal(ploeg.ledger.admitted.length, before + 1);
  const replayed = await ask(alice, 6, { ...accept, requestState: state });
  assert.match(replayed.json.result.content[0].text, /already used/);
  assert.equal(ploeg.ledger.admitted.length, before + 1, 'a replayed confirmation spends nothing');
});

test('a 2025 client over HTTP can never spend, even when it declares elicitation', async () => {
  const before = ploeg.ledger.admitted.length;
  const alice = await mcpAs('alice', { elicit: async () => ({ action: 'accept', content: { confirm: true } }) });
  const refused = await call(alice, 'unfold_ask', { id: ploeg.itemsOf('delivery')[0], question: 'Why did this stop?', use_model: true });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /cannot ask you to confirm a spend/);
  assert.equal(ploeg.ledger.admitted.length, before);
});

test('the groups in the token cap the role: a demoted admin acts as a viewer, a removed member is refused', async () => {
  const erin = await mcpAs('erin');
  const asAdmin = await call(erin, 'unfold_find_work', { team: 'research' });
  assert.notEqual(asAdmin.isError, true, `an admin sees every Team: ${asAdmin.content[0]?.text}`);

  await setGroups(authentik, realm, realm.people.erin, ['viewers']);
  const endpoint = await tokenEndpoint(realm.mcp.issuer);
  const refreshed = await (await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: erin.signIn.stored!.refresh_token!, client_id: realm.mcp.clientId }) })).json();
  assert.ok(refreshed.access_token, JSON.stringify(refreshed));
  secrets.add(refreshed.access_token);
  assert.deepEqual(claims(refreshed.access_token).groups, [realm.groups.viewers.name], 'a refreshed token carries the groups Authentik has now');
  const asViewer = await raw(refreshed.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'unfold_find_work', arguments: { team: 'research' } } });
  assert.equal(asViewer.status, 200, asViewer.text);
  assert.equal(asViewer.json.result.isError, true, 'the stored admin role is capped at the token\'s viewer');
  assert.match(asViewer.json.result.content[0].text, /may not read this Team/);
});

test('a person removed from every admitted group gets 403 with the reason, not a tool result', async () => {
  await setGroups(authentik, realm, realm.people.frank, ['staff']);
  const callback = await loopbackCallback();
  const signIn = new LoopbackSignIn(realm.mcp.clientId, callback.redirect);
  await assert.rejects(connect({ url: unfold.resource, clientId: realm.mcp.clientId, era: 'legacy', authentik, person: realm.people.frank, context: await context('frank'), signIn, callback }), (error: unknown) => error instanceof SdkHttpError || /403/.test(String(error)));
  await callback.close();
  assert.ok(signIn.stored?.access_token, 'Authentik still issues a token: staff may sign in at Authentik');
  secrets.add(signIn.stored.access_token);
  assert.deepEqual(claims(signIn.stored.access_token).groups, [realm.groups.staff.name]);
  const refused = await raw(signIn.stored.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(refused.status, 403);
  assert.match(refused.json.error.message, /holds none of the groups this workbench admits/);
});

test('tokens Authentik issued for something else are refused', async () => {
  const alice = connections[0];
  const idToken = (alice.signIn.stored as { id_token?: string }).id_token;
  assert.ok(idToken, 'Authentik returns an ID token next to the access token');
  const withId = await raw(idToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(withId.status, 401, withId.text);
  const withRefresh = await raw(alice.signIn.stored!.refresh_token!, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(withRefresh.status, 401);

  const page = await (await context('alice')).newPage();
  const verifier = randomBytes(32).toString('base64url');
  const port = await freePort();
  const redirect = `http://127.0.0.1:${port}/api/auth/oidc/callback`;
  const capture = createServer((req, res) => { res.writeHead(200).end('ok'); capture.emit('code', new URL(req.url!, redirect).searchParams.get('code')); });
  capture.listen(port, '127.0.0.1');
  await once(capture, 'listening');
  const code = once(capture, 'code');
  const discovery = await (await fetch(`${realm.browser.issuer}.well-known/openid-configuration`)).json();
  const authorize = new URL(discovery.authorization_endpoint);
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: realm.browser.clientId, redirect_uri: redirect, scope: 'openid profile email groups', state: 'x', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) authorize.searchParams.set(key, value);
  await page.goto(authorize.href);
  const [received] = await code;
  await page.close();
  capture.closeAllConnections(); capture.close();
  const exchanged = await (await fetch(discovery.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: String(received), redirect_uri: redirect, client_id: realm.browser.clientId, code_verifier: verifier }) })).json();
  assert.ok(exchanged.access_token, JSON.stringify(exchanged));
  secrets.add(exchanged.access_token);
  const browserToken = await raw(exchanged.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.equal(browserToken.status, 401, 'an access token for Unfold\'s browser client is not one for unfold-mcp');
  assert.match(browserToken.headers.get('www-authenticate') ?? '', /error="invalid_token", error_description="the token was issued by another issuer"/, 'each Authentik provider has its own issuer, so the issuer pin refuses it first');
});

test('a browser cannot use the endpoint with its session cookie or from another origin', async () => {
  const alice = connections[0].signIn.accessToken;
  const page = await (await context('alice')).newPage();
  await page.goto(unfold.url);
  const before = mcpRequests().length;
  const withCookie = await page.evaluate(async () => (await fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-unfold-request': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status);
  assert.equal(withCookie, 401, 'the browser session cookie alone does not reach the MCP endpoint');

  const evil = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>elsewhere</title>'));
  evil.listen(0, '127.0.0.1');
  await once(evil, 'listening');
  const evilUrl = `http://localhost:${(evil.address() as { port: number }).port}/`;
  await page.goto(evilUrl);
  const crossOrigin = await page.evaluate(async ({ endpoint, token }) => {
    const outcome: Record<string, string> = {};
    try { const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }); outcome.bearer = `read ${response.status}`; } catch (error) { outcome.bearer = `blocked ${(error as Error).name}`; }
    try { const response = await fetch(endpoint, { method: 'POST', mode: 'no-cors', credentials: 'include', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'unfold_ask', arguments: { id: '101', question: 'x', use_model: true } } }) }); outcome.simple = `opaque ${response.type}`; } catch (error) { outcome.simple = `blocked ${(error as Error).name}`; }
    try { const response = await fetch(endpoint.replace('/mcp', '/.well-known/oauth-protected-resource/mcp')); outcome.metadata = `read ${response.status}`; } catch (error) { outcome.metadata = `blocked ${(error as Error).name}`; }
    return outcome;
  }, { endpoint: unfold.resource, token: alice });
  await page.close();
  evil.closeAllConnections(); evil.close();
  assert.equal(crossOrigin.bearer, 'blocked TypeError', 'no CORS on the endpoint: another origin cannot send a bearer token');
  assert.equal(crossOrigin.simple, 'opaque opaque');
  assert.equal(crossOrigin.metadata, 'read 200', 'the metadata stays readable for browser-based clients');
  assert.equal(mcpRequests().length, before, 'neither cross-origin request ran a tool');

  const wrongOrigin = await raw(alice, { jsonrpc: '2.0', id: 3, method: 'tools/list' }, { headers: { origin: 'http://localhost:1' } });
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await raw(alice, { jsonrpc: '2.0', id: 4, method: 'tools/list' }, { method: 'GET' })).status, 405);
  assert.equal((await raw(alice, { jsonrpc: '2.0', id: 5, method: 'tools/list' }, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal(ploeg.ledger.admitted.filter(entry => entry.question === 'x').length, 0);
});

test('the MCP conformance suite passes the scenarios that apply to a tools-only server, through a real token', async () => {
  const token = connections[0].signIn.accessToken;
  const proxy = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string' && !['host', 'connection', 'content-length', 'origin'].includes(key)) headers[key] = value;
    const upstream = await fetch(unfold.resource, { method: req.method, headers: { ...headers, authorization: `Bearer ${token}` }, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
    const reply = Buffer.from(await upstream.arrayBuffer());
    seen.push(reply.toString('utf8'));
    res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([key]) => !['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(key)))).end(reply);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const url = `http://127.0.0.1:${(proxy.address() as { port: number }).port}/mcp`;
  const cli = fileURLToPath(new URL('../../node_modules/@modelcontextprotocol/conformance/dist/index.js', import.meta.url));
  const outcomes: Record<string, string> = {};
  try {
    for (const scenario of conformanceScenarios) {
      const child = spawn(process.execPath, [cli, 'server', '--url', url, '--scenario', scenario], { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout!.on('data', chunk => { output += chunk; });
      child.stderr!.on('data', chunk => { output += chunk; });
      const [code] = await once(child, 'exit');
      outcomes[scenario] = code === 0 ? 'passed' : `failed:\n${output.slice(-1500)}`;
    }
  } finally { proxy.closeAllConnections(); proxy.close(); }
  assert.deepEqual(outcomes, Object.fromEntries(conformanceScenarios.map(scenario => [scenario, 'passed'])));
});

test('no access, refresh or ID token, delegated credential or upstream key appears in a tool result or a log line', () => {
  const output = [...seen, ...unfold.lines].join('\n');
  for (const secret of secrets) assert.ok(!output.includes(secret), `a secret ending in …${secret.slice(-6)} leaked`);
  assert.doesNotMatch(output, /vlm_[A-Za-z0-9_-]{43}/, 'the per-request credential never leaves the process');
});
