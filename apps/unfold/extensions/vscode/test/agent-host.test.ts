import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, lstat, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SettingsFileError, agentHostStore, agentHostTokenId, attachAgentHost, connectionAddress, detachAgentHost, editSetting, fileStore, hasAgentHost,
  probeAgentHostToken, userSettingsFile, withAgentHost, withoutIssuedAgentHost,
  type AgentHostEntry, type AgentHostStore, type AttachRequest, type SettingsConfiguration, type TokenProbe,
} from '../src/agent-host.ts';

const address = 'wss://unfold.example';

async function folder(t: test.TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'unfold-agent-host-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

function attachRequest(store: AgentHostStore, overrides: Partial<AttachRequest> & { probed?: TokenProbe } = {}) {
  const calls = { minted: 0, remembered: [] as string[], probed: [] as string[], retired: [] as string[] };
  const request: AttachRequest = {
    store,
    address,
    storedToken: undefined,
    when: 'always',
    probe: async token => { calls.probed.push(token); return overrides.probed ?? 'valid'; },
    mint: async () => { calls.minted++; return { token: `minted-${calls.minted}`, entry: { address, name: 'Unfold', connectionToken: `minted-${calls.minted}` } }; },
    remember: async token => { calls.remembered.push(token); },
    retire: async token => { calls.retired.push(token); },
    ...overrides,
  };
  return { request, calls };
}

function fakeConfiguration(registered: boolean, globalValue?: AgentHostEntry[]) {
  const updates: Array<{ key: string; value: unknown; global: boolean }> = [];
  let value = globalValue;
  const configuration: SettingsConfiguration = {
    inspect: key => key === 'chat.remoteAgentHosts' ? { ...(registered ? { defaultValue: [] } : {}), globalValue: value } : undefined,
    update: async (key, next, global) => { updates.push({ key, value: next, global }); value = next as AgentHostEntry[] | undefined; },
  };
  return { configuration, updates };
}

test('a renewed agent host token replaces the entry for the same address and keeps others', () => {
  const entries = [{ address, name: 'Unfold', connectionToken: 'old' }, { address: 'ws://other', name: 'Other', connectionToken: 'kept' }];
  assert.deepEqual(withAgentHost(entries, { address, name: 'Unfold', connectionToken: 'new' }), [{ address: 'ws://other', name: 'Other', connectionToken: 'kept' }, { address, name: 'Unfold', connectionToken: 'new' }]);
  assert.deepEqual(withAgentHost(undefined, { address, connectionToken: 'new' }), [{ address, connectionToken: 'new' }]);
  assert.equal(hasAgentHost(entries, address), true);
  assert.equal(hasAgentHost(entries, 'wss://unknown'), false);
});

test('an address matches the form the Agents window stores, without the ws scheme or a root path', () => {
  assert.equal(hasAgentHost([{ address: '127.0.0.1:4091' }], 'ws://127.0.0.1:4091'), true);
  assert.equal(hasAgentHost([{ address: 'wss://unfold.example/' }], address), true);
  assert.equal(hasAgentHost([{ address: 'unfold.example' }], address), false);
  assert.equal(connectionAddress('ws://127.0.0.1:4091', 'abc'), 'ws://127.0.0.1:4091/?tkn=abc');
});

test('signing out removes only the agent host entry whose token this editor issued', () => {
  const entries = [{ address, name: 'Unfold', connectionToken: 'issued' }, { address: 'ws://other', connectionToken: 'issued' }];
  assert.deepEqual(withoutIssuedAgentHost(entries, address, 'issued'), [{ address: 'ws://other', connectionToken: 'issued' }]);
  assert.deepEqual(withoutIssuedAgentHost(entries, address, 'pasted-elsewhere'), entries);
  assert.deepEqual(withoutIssuedAgentHost(entries, address, undefined), entries);
});

test('the user settings file is the default profile\'s, whichever profile the window uses', () => {
  assert.equal(userSettingsFile('/data/Code/User/globalStorage/webgrip.unfold'), '/data/Code/User/settings.json');
  assert.equal(userSettingsFile('/data/Code/User/profiles/-6e54893e/globalStorage/webgrip.unfold'), '/data/Code/User/settings.json');
  assert.equal(userSettingsFile('/portable/data/user-data/User/globalStorage/webgrip.unfold'), '/portable/data/user-data/User/settings.json');
  assert.equal(userSettingsFile(undefined, { appName: 'Visual Studio Code - Insiders', platform: 'darwin', home: '/Users/me' }), '/Users/me/Library/Application Support/Code - Insiders/User/settings.json');
  assert.equal(userSettingsFile(undefined, { appName: 'VSCodium', platform: 'linux', home: '/home/me', env: {} }), '/home/me/.config/VSCodium/User/settings.json');
  assert.equal(userSettingsFile(undefined, { appName: 'Cursor', platform: 'linux', home: '/home/me', env: { XDG_CONFIG_HOME: '/xdg' } }), '/xdg/Cursor/User/settings.json');
  assert.equal(userSettingsFile('/elsewhere/storage', { appName: 'Visual Studio Code', platform: 'linux', home: '/home/me', env: { VSCODE_PORTABLE: '/usb/code' } }), '/usb/code/user-data/User/settings.json');
  assert.equal(userSettingsFile(undefined, { appName: 'Unknown Editor', platform: 'linux', home: '/home/me' }), undefined);
});

test('the settings writer keeps comments, other keys and the file\'s indentation', async t => {
  const path = join(await folder(t), 'settings.json');
  await writeFile(path, '{\n  // keep me\n  "editor.fontSize": 14, /* and me */\n  "chat.remoteAgentHosts": [\n    { "address": "ws://other", "name": "Other" },\n  ],\n}\n');
  const { request } = attachRequest(fileStore(path));
  assert.deepEqual(await attachAgentHost(request), { status: 'attached', minted: true });
  const text = await readFile(path, 'utf8');
  assert.match(text, /\/\/ keep me/);
  assert.match(text, /\/\* and me \*\//);
  assert.match(text, /"editor\.fontSize": 14/);
  assert.match(text, /\n  "chat\.remoteAgentHosts": \[\n    \{/);
  assert.doesNotMatch(text, /\t/);
  assert.match(text, /"address": "ws:\/\/other"/);
  assert.match(text, /"connectionToken": "minted-1"/);
});

test('a tab-indented file stays tab-indented and a missing file is created readable by its owner only', async t => {
  const dir = await folder(t);
  const tabbed = join(dir, 'tabbed.json');
  await writeFile(tabbed, '{\n\t"a": 1\n}');
  assert.match(editSetting(tabbed, await readFile(tabbed, 'utf8'), 'b', [1]), /\n\t"b": \[\n\t\t1\n\t\]/);
  const created = join(dir, 'User', 'settings.json');
  const { request } = attachRequest(fileStore(created));
  await attachAgentHost(request);
  assert.deepEqual(JSON.parse(await readFile(created, 'utf8')), { 'chat.remoteAgentHosts': [{ address, name: 'Unfold', connectionToken: 'minted-1' }] });
  if (process.platform !== 'win32') assert.equal((await stat(created)).mode & 0o777, 0o600);
});

test('attaching replaces the entry for the same address, keeps a name the person chose, and leaves no temporary files', async t => {
  const dir = await folder(t);
  const path = join(dir, 'settings.json');
  await writeFile(path, JSON.stringify({ 'chat.remoteAgentHosts': [{ address: 'unfold.example', name: 'Work', connectionToken: 'stale' }, { address: 'wss://unfold.example/', name: 'Mine', connectionToken: 'stale' }] }, null, 4));
  const { request, calls } = attachRequest(fileStore(path), { storedToken: 'stale', probed: 'invalid' });
  assert.deepEqual(await attachAgentHost(request), { status: 'attached', minted: true });
  assert.deepEqual(calls.remembered, ['minted-1']);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8'))['chat.remoteAgentHosts'], [{ address: 'unfold.example', name: 'Work', connectionToken: 'stale' }, { address, name: 'Mine', connectionToken: 'minted-1' }]);
  assert.deepEqual(await readdir(dir), ['settings.json']);
});

test('a stored token the workbench still accepts is reused instead of minting another', async t => {
  const path = join(await folder(t), 'settings.json');
  const reuse = attachRequest(fileStore(path), { storedToken: 'kept', probed: 'valid' });
  assert.deepEqual(await attachAgentHost(reuse.request), { status: 'attached', minted: false });
  assert.equal(reuse.calls.minted, 0);
  assert.deepEqual(reuse.calls.remembered, []);
  const again = attachRequest(fileStore(path), { storedToken: 'kept', probed: 'unknown' });
  assert.deepEqual(await attachAgentHost(again.request), { status: 'unchanged', minted: false });
  const missing = attachRequest(fileStore(path), { storedToken: 'kept', when: 'missing' });
  assert.deepEqual(await attachAgentHost(missing.request), { status: 'skipped', minted: false });
  assert.deepEqual(missing.calls.probed, []);
  const optedOut = attachRequest(fileStore(join(path, '..', 'other.json')), { when: 'present' });
  assert.deepEqual(await attachAgentHost(optedOut.request), { status: 'skipped', minted: false });
  assert.equal(optedOut.calls.minted, 0);
});

test('an unparseable settings file is refused before any token is minted and stays byte for byte', async t => {
  const path = join(await folder(t), 'settings.json');
  const broken = '{\n  "editor.fontSize": 14\n  "oops": true\n';
  await writeFile(path, broken);
  const { request, calls } = attachRequest(fileStore(path));
  await assert.rejects(attachAgentHost(request), (error: unknown) => error instanceof SettingsFileError && error.problem === 'unparseable' && /line 3/.test(error.message));
  assert.equal(calls.minted, 0);
  assert.equal(await readFile(path, 'utf8'), broken);
  await writeFile(path, '[]');
  await assert.rejects(attachAgentHost(request), (error: unknown) => error instanceof SettingsFileError && error.problem === 'not-an-object');
});

test('an unwritable settings file is refused before any token is minted', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async t => {
  const path = join(await folder(t), 'settings.json');
  await writeFile(path, '{}');
  await chmod(path, 0o400);
  const { request, calls } = attachRequest(fileStore(path));
  await assert.rejects(attachAgentHost(request), (error: unknown) => error instanceof SettingsFileError && error.problem === 'unwritable');
  assert.equal(calls.minted, 0);
});

test('a minted token is remembered before the write, so a failed write leaves nothing orphaned', async () => {
  const store: AgentHostStore = { kind: 'file', location: 'memory', read: async () => [], update: async () => { throw new Error('disk full'); } };
  const { request, calls } = attachRequest(store);
  await assert.rejects(attachAgentHost(request), /disk full/);
  assert.deepEqual(calls.remembered, ['minted-1']);
});

test('signing out removes the issued entry from the file and keeps the comments around it', async t => {
  const path = join(await folder(t), 'settings.json');
  await writeFile(path, '{\n  // mine\n  "chat.remoteAgentHosts": [{ "address": "wss://unfold.example", "name": "Unfold", "connectionToken": "issued" }],\n  // about other\n  "other": 1\n}');
  assert.equal(await detachAgentHost(fileStore(path), address, 'pasted-elsewhere'), false);
  assert.equal(await detachAgentHost(fileStore(path), address, 'issued'), true);
  const text = await readFile(path, 'utf8');
  assert.match(text, /"chat\.remoteAgentHosts": \[\]/);
  assert.match(text, /\/\/ mine/);
  assert.match(text, /\/\/ about other/);
  assert.match(text, /"other": 1/);
  await writeFile(path, JSON.stringify({ 'chat.remoteAgentHosts': [{ address, connectionToken: 'issued' }, { address: 'ws://other', connectionToken: 'x' }] }));
  await detachAgentHost(fileStore(path), address, 'issued');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { 'chat.remoteAgentHosts': [{ address: 'ws://other', connectionToken: 'x' }] });
});

test('a symlinked settings file is written through the link, which stays a link', { skip: process.platform === 'win32' }, async t => {
  const dir = await folder(t);
  const real = join(dir, 'dotfiles.json');
  const link = join(dir, 'settings.json');
  await writeFile(real, '{}');
  await symlink(real, link);
  await attachAgentHost(attachRequest(fileStore(link)).request);
  assert.equal((await lstat(link)).isSymbolicLink(), true);
  assert.equal(await readlink(link), real);
  assert.match(await readFile(real, 'utf8'), /minted-1/);
});

test('when the window registers chat.remoteAgentHosts the configuration API is used and the file is untouched', async t => {
  const path = join(await folder(t), 'settings.json');
  const { configuration, updates } = fakeConfiguration(true, [{ address: 'ws://other', connectionToken: 'x' }]);
  const store = agentHostStore(configuration, path);
  assert.equal(store.kind, 'configuration');
  await attachAgentHost(attachRequest(store).request);
  assert.deepEqual(updates, [{ key: 'chat.remoteAgentHosts', value: [{ address: 'ws://other', connectionToken: 'x' }, { address, name: 'Unfold', connectionToken: 'minted-1' }], global: true }]);
  await assert.rejects(readFile(path, 'utf8'), { code: 'ENOENT' });
  await detachAgentHost(store, address, 'minted-1');
  assert.deepEqual(updates.at(-1), { key: 'chat.remoteAgentHosts', value: [{ address: 'ws://other', connectionToken: 'x' }], global: true });
  const unregistered = agentHostStore(fakeConfiguration(false).configuration, path);
  assert.equal(unregistered.kind, 'file');
  assert.equal(unregistered.location, path);
  assert.throws(() => agentHostStore(fakeConfiguration(false).configuration, undefined), /could not locate/);
});

test('a token probe tells an accepted handshake from a rejected one', async t => {
  const server = createServer((_req, res) => { res.writeHead(404); res.end(); });
  server.on('upgrade', (req, socket) => {
    const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('tkn');
    if (token === 'good') socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: x\r\n\r\n');
    else socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address() as { port: number };
  assert.equal(await probeAgentHostToken(`ws://127.0.0.1:${port}`, 'good'), 'valid');
  assert.equal(await probeAgentHostToken(`ws://127.0.0.1:${port}`, 'bad'), 'invalid');
  assert.equal(await probeAgentHostToken('ws://127.0.0.1:1', 'good', 500), 'unknown');
});

test('a token the workbench rejected is retired after its replacement is remembered; a reused token is not', async t => {
  const path = join(await folder(t), 'settings.json');
  const order: string[] = [];
  const replaced = attachRequest(fileStore(path), { storedToken: 'rejected', probed: 'invalid', remember: async token => { order.push(`remember ${token}`); }, retire: async token => { order.push(`retire ${token}`); } });
  assert.deepEqual(await attachAgentHost(replaced.request), { status: 'attached', minted: true });
  assert.deepEqual(order, ['remember minted-1', 'retire rejected']);
  const reused = attachRequest(fileStore(path), { storedToken: 'minted-1', probed: 'valid' });
  await attachAgentHost(reused.request);
  assert.deepEqual(reused.calls.retired, []);
  const unreachable = attachRequest(fileStore(join(path, '..', 'other.json')), { storedToken: 'rejected', probed: 'invalid', retire: async () => { throw new Error('offline'); } });
  assert.deepEqual(await attachAgentHost(unreachable.request), { status: 'attached', minted: true }, 'a failed revocation does not undo the attach');
});

test('a token\'s identifier is the SHA-256 digest the workbench stores', () => {
  assert.equal(agentHostTokenId('token-value'), createHash('sha256').update('token-value').digest('hex'));
  assert.match(agentHostTokenId('x'), /^[0-9a-f]{64}$/);
});
