import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agentsWindowPlan, agentsWindowSubject, type AgentsWindowLinkView } from '../src/agent-host.ts';
import { loadCore } from '../src/core.ts';
import { agentsWindowSessionLink } from '../../../public/core/agents-window.js';

const core = await loadCore(new URL('../media/core/', import.meta.url));
const view = (extra: Partial<AgentsWindowLinkView> = {}): AgentsWindowLinkView => ({ session: 'ahp-session:/s1', attached: true, address: 'wss://unfold.example', ...extra });
const hex = (text: string) => `hex-${Buffer.from(text, 'utf8').toString('hex')}`;

test('the command finds its session or Work Item in every row it is offered on', () => {
  assert.deepEqual(agentsWindowSubject('s1'), { kind: 'sessions', id: 's1' });
  assert.deepEqual(agentsWindowSubject({ kind: 'session', session: { id: 's2' } }), { kind: 'sessions', id: 's2' }, 'a Sessions row');
  assert.deepEqual(agentsWindowSubject({ kind: 'session', row: { session: { id: 's3' } } }), { kind: 'sessions', id: 's3' }, 'a Now row for a session');
  assert.deepEqual(agentsWindowSubject({ kind: 'item', item: { id: '205' }, demo: false }), { kind: 'work-items', id: '205' }, 'a Now or Ploeg row for a Work Item');
  assert.deepEqual(agentsWindowSubject({ kind: 'run', run: { workItemId: '202' } }), { kind: 'work-items', id: '202' }, 'a Run opens its Work Item');
  for (const value of [undefined, '', 'a/b', { kind: 'group', id: 'review' }, { kind: 'message', label: 'x' }, { kind: 'item', item: { id: '../x' } }]) assert.equal(agentsWindowSubject(value), undefined, JSON.stringify(value));
});

test('the link names the host as this person\'s own chat.remoteAgentHosts entry spells it, in this editor\'s URL scheme', () => {
  const written = agentsWindowPlan(view(), [{ address: 'wss://unfold.example', name: 'Unfold', connectionToken: 't' }], 'vscode', core.agentsWindowSessionLink);
  assert.deepEqual(written, { kind: 'open', attached: true, url: `vscode://agents/agent-host-session/ahp-session/s1?connectionAuthority=${hex('wss://unfold.example')}` });
  const byHand = agentsWindowPlan(view(), [{ address: 'wss://unfold.example/', name: 'Mine' }], 'vscode-insiders', core.agentsWindowSessionLink);
  assert.deepEqual(byHand, { kind: 'open', attached: true, url: `vscode-insiders://agents/agent-host-session/ahp-session/s1?connectionAuthority=${hex('wss://unfold.example/')}` }, 'VS Code keys the authority on the entry as written, slash included');
  const legacy = agentsWindowPlan(view({ session: 'unfold:/wi-205', attached: false, address: 'ws://127.0.0.1:4080' }), [{ address: 'ws://127.0.0.1:4080' }], 'vscode', core.agentsWindowSessionLink);
  assert.deepEqual(legacy, { kind: 'open', attached: false, url: 'vscode://agents/agent-host-session/unfold/wi-205?connectionAuthority=127.0.0.1__4080' }, 'the 1.141 spelling and a ws:// host');
  const options = { protocol: 'vscode', session: 'ahp-session:/s1', address: 'wss://unfold.example' };
  assert.equal(core.agentsWindowSessionLink(options), agentsWindowSessionLink(options), 'the extension builds links with the browser\'s own module');
});

test('without this host in the settings the person connects first, and an unusable session opens nothing', () => {
  assert.deepEqual(agentsWindowPlan(view(), undefined, 'vscode', core.agentsWindowSessionLink), { kind: 'connect' });
  assert.deepEqual(agentsWindowPlan(view(), [{ address: 'wss://other.example' }], 'vscode', core.agentsWindowSessionLink), { kind: 'connect' }, 'another host is not this one');
  const leaky = agentsWindowPlan(view(), [{ address: 'wss://unfold.example/?tkn=secret-token' }], 'vscode', core.agentsWindowSessionLink);
  assert.deepEqual(leaky, { kind: 'token-in-address', address: 'wss://unfold.example' }, 'an entry with its token in the address opens nothing');
  assert.ok(!JSON.stringify(leaky).includes('secret-token'), 'and the refusal does not repeat the token');
  assert.deepEqual(agentsWindowPlan(view({ session: 'copilotcli:/s1' }), [{ address: 'wss://unfold.example' }], 'vscode', core.agentsWindowSessionLink), { kind: 'unusable' });
});

test('Open in Agents Window is on the Now, Sessions and Ploeg rows and in the palette once connected', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const context: Array<{ command: string; when: string }> = manifest.contributes.menus['view/item/context'].filter((item: { command: string }) => item.command === 'unfold.openInAgentsWindow');
  assert.deepEqual(context.map(item => item.when), [
    'view == unfold.sessions && viewItem =~ /^session:/',
    'view == unfold.now && viewItem =~ /^now:(item|run|session)/',
    'view == unfold.ploeg && viewItem == ploeg:item',
  ]);
  assert.ok(manifest.contributes.menus.commandPalette.some((item: { command: string; when: string }) => item.command === 'unfold.openInAgentsWindow' && item.when === 'unfold.connected'));
  assert.equal(manifest.engines.vscode, '^1.99.0', 'the link needs 1.142 in the Agents window, not in this extension');
  assert.match(readFileSync(new URL('../src/extension.ts', import.meta.url), 'utf8'), /vscode\.env\.openExternal\(vscode\.Uri\.parse\(plan\.url, true\)\)/);
});
