import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/auth.ts';
import { agentHostAuthority } from '../public/core/agents-window.js';
import { application, login, request } from './api-support.ts';
import { connect, vscodeAgentsWindow } from './ahp-support.ts';

const password = 'agents-window-link-271828';

async function workbench(t: test.TestContext) {
  const server = await application('live');
  t.after(() => server.close());
  for (const [id, role] of [['owner-1', 'operator'], ['peer-1', 'operator'], ['viewer-1', 'viewer']] as const) server.app.store.addUser({ id, name: id, role, passwordHash: await hashPassword(password) });
  const owner = await login(server.url, 'owner-1', password);
  const peer = await login(server.url, 'peer-1', password);
  const viewer = await login(server.url, 'viewer-1', password);
  const admin = await login(server.url);
  const session = server.app.engine.create({ title: 'Linked session', objective: 'Fix the order rounding regression.', repositoryId: 'order-service', teamId: 'delivery', runtime: 'opencode', budgetUsd: 1 }, { id: 'owner-1', name: 'owner-1', role: 'operator' });
  const address: string = (await request(server.url, '/api/agent-host', { cookie: owner.cookie })).body.address;
  const socket = server.url.replace(/^http/, 'ws');
  const attach = async (meta?: Record<string, unknown>) => {
    const { token } = (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: owner.cookie, body: { label: 'link test' } })).body;
    const client = connect(`${socket}/?tkn=${token}`);
    t.after(() => client.close());
    await client.open;
    await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['1.0.0', '0.9.0'], clientId: `window-${Math.random().toString(36).slice(2)}`, clientInfo: vscodeAgentsWindow, initialSubscriptions: [], ...(meta ? { _meta: meta } : {}) });
    return client;
  };
  return { server, owner, peer, viewer, admin, session, address, attach };
}

test('the owner gets an Agents window link that names this host by its connection authority', async t => {
  const w = await workbench(t);
  const authority = agentHostAuthority(w.address);
  assert.match(w.address, /^ws:\/\/[a-z0-9.]+:\d+$/);
  assert.equal(authority, w.address.replace(/^ws:\/\//, '').replaceAll(':', '__'), 'a ws:// host loses its scheme and its port colon');
  const info = (await request(w.server.url, '/api/agent-host', { cookie: w.owner.cookie })).body;
  assert.equal(info.connectionAuthority, authority);

  const link = await request(w.server.url, `/api/agent-host/sessions/${w.session.id}/link`, { cookie: w.owner.cookie });
  assert.equal(link.status, 200, link.text);
  assert.deepEqual(link.body, {
    session: `ahp-session:/${w.session.id}`,
    attached: false,
    address: w.address,
    connectionAuthority: authority,
    links: {
      stable: `vscode://agents/agent-host-session/ahp-session/${w.session.id}?connectionAuthority=${authority}`,
      insiders: `vscode-insiders://agents/agent-host-session/ahp-session/${w.session.id}?connectionAuthority=${authority}`,
    },
  }, 'without an attached Agents window the link uses the spelling VS Code 1.142 is given');
  assert.ok(!link.text.includes('tkn') && !/connectionToken/.test(link.text), 'a link never carries a connection token');
});

test('the link follows the session spelling the person\'s attached Agents window was given', async t => {
  const w = await workbench(t);
  const older = await w.attach();
  const linked = async () => (await request(w.server.url, `/api/agent-host/sessions/${w.session.id}/link`, { cookie: w.owner.cookie })).body;
  const first = await linked();
  assert.equal(first.attached, true);
  assert.equal(first.session, `unfold:/${w.session.id}`, 'a VS Code 1.141 Agents window addresses sessions by the provider');
  assert.match(first.links.stable, new RegExp(`^vscode://agents/agent-host-session/unfold/${w.session.id}\\?connectionAuthority=`));

  await new Promise(resolve => setTimeout(resolve, 5));
  await w.attach({ 'vscode.ahpSessionUris': true });
  assert.equal((await linked()).session, `ahp-session:/${w.session.id}`, 'the newest Agents window, a 1.142 one, decides');
  older.close();
  assert.equal((await linked()).session, `ahp-session:/${w.session.id}`);
});

test('a session\'s link goes to whoever the host lists it to: its owner and administrators; a peer is not told it exists and a viewer is refused', async t => {
  const w = await workbench(t);
  const peer = await request(w.server.url, `/api/agent-host/sessions/${w.session.id}/link`, { cookie: w.peer.cookie });
  assert.equal(peer.status, 404, peer.text);
  assert.equal(peer.body.error.code, 'not_found');
  const admin = await request(w.server.url, `/api/agent-host/sessions/${w.session.id}/link`, { cookie: w.admin.cookie });
  assert.equal(admin.status, 200, admin.text);
  assert.equal(admin.body.session, `ahp-session:/${w.session.id}`, 'an administrator\'s Agents window lists another person\'s session, so the link opens it');
  assert.equal(admin.body.attached, false, 'the owner\'s attached window is not the administrator\'s');
  const viewer = await request(w.server.url, `/api/agent-host/sessions/${w.session.id}/link`, { cookie: w.viewer.cookie });
  assert.equal(viewer.status, 403, viewer.text);
  assert.equal((await request(w.server.url, '/api/agent-host/sessions/no-such-session/link', { cookie: w.owner.cookie })).status, 404);
  assert.equal((await request(w.server.url, `/api/agent-host/sessions/${w.session.id}/link`)).status, 401, 'an anonymous caller gets nothing');
  for (const body of [peer.text, viewer.text]) assert.ok(!body.includes('agent-host-session'), 'a refusal carries no link');
});

test('a Work Item link needs a live Ploeg: without one there is no Work Item session to open', async t => {
  const w = await workbench(t);
  const result = await request(w.server.url, '/api/agent-host/work-items/205/link', { cookie: w.owner.cookie });
  assert.equal(result.status, 404, result.text);
  assert.equal((await request(w.server.url, '/api/agent-host/work-items/not-a-number/link', { cookie: w.owner.cookie })).status, 404);
});

test('the host names each repository\'s folder, which the folder picker resolves, so an editor can start a session there', async t => {
  const w = await workbench(t);
  const { folders } = (await request(w.server.url, '/api/agent-host', { cookie: w.owner.cookie })).body;
  assert.ok(folders.length >= 1);
  assert.deepEqual(folders.map((folder: { repositoryId: string }) => folder.repositoryId), w.server.config.repositories.map(repo => repo.id));
  const client = await w.attach();
  for (const folder of folders) {
    assert.match(folder.path, /^\/unfold-repositories\/[^/]+$/);
    assert.equal((await client.rpc('resourceResolve', { channel: 'ahp-root://', uri: `file://${folder.path}` })).type, 'directory', `${folder.path} is a folder the picker offers`);
  }
});
