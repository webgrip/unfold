import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentHostAuthority, carriesConnectionToken, agentsWindowSessionLink, agentsWindowSessionLinks, normalizedAgentHostAddress, parseSessionUri } from '../public/core/agents-window.js';

const hex = text => `hex-${Buffer.from(text, 'utf8').toString('hex')}`;

test('the connection authority matches VS Code 1.142 agentHostAuthority, including its own test vectors', () => {
  assert.equal(agentHostAuthority('localhost'), 'localhost');
  assert.equal(agentHostAuthority('localhost:8081'), 'localhost__8081');
  assert.equal(agentHostAuthority('192.168.1.1:8080'), '192.168.1.1__8080');
  assert.equal(agentHostAuthority('my-host:9090'), 'my-host__9090');
  assert.equal(agentHostAuthority('LOCALHOST'), 'hex-4c4f43414c484f5354');
  assert.equal(agentHostAuthority('ws://127.0.0.1:8080'), agentHostAuthority('127.0.0.1:8080'), 'ws:// is dropped before encoding');
  assert.equal(agentHostAuthority('local'), 'remote_local', 'the reserved ambient name never names a remote host');
  assert.equal(agentHostAuthority('ws://local'), 'remote_local');
  assert.equal(agentHostAuthority('hex-41'), hex('hex-41'), 'an address that looks encoded is encoded again');
  assert.equal(agentHostAuthority('wss://unfold.example'), hex('wss://unfold.example'), 'wss:// keeps its scheme, so the address is hex encoded');
  assert.equal(agentHostAuthority('wss://unfold.example/'), hex('wss://unfold.example/'), 'a trailing slash is part of the address VS Code keys');
  assert.equal(agentHostAuthority(''), '');
  assert.equal(agentHostAuthority(undefined), '');
  assert.equal(normalizedAgentHostAddress('ws://host:1'), 'host:1');
  assert.equal(normalizedAgentHostAddress('wss://host'), 'wss://host');
});

test('a session link names the session in the spelling the host gave that client, and the host by its authority', () => {
  const address = 'wss://unfold.example';
  assert.equal(agentsWindowSessionLink({ session: 'ahp-session:/7f3c', address }), `vscode://agents/agent-host-session/ahp-session/7f3c?connectionAuthority=${hex(address)}`);
  assert.equal(agentsWindowSessionLink({ session: 'unfold:/wi-205', address }), `vscode://agents/agent-host-session/unfold/wi-205?connectionAuthority=${hex(address)}`);
  assert.equal(agentsWindowSessionLink({ protocol: 'vscode-insiders', session: 'ahp-session:/s1', address: 'ws://localhost:8080' }), 'vscode-insiders://agents/agent-host-session/ahp-session/s1?connectionAuthority=localhost__8080');
  assert.deepEqual(agentsWindowSessionLinks({ session: 'ahp-session:/s1', address: 'localhost:8080' }), {
    stable: 'vscode://agents/agent-host-session/ahp-session/s1?connectionAuthority=localhost__8080',
    insiders: 'vscode-insiders://agents/agent-host-session/ahp-session/s1?connectionAuthority=localhost__8080',
  });
});

test('no link is built without a host address, for another scheme or for an id the host never gives out', () => {
  assert.equal(agentsWindowSessionLink({ session: 'ahp-session:/s1', address: '' }), '', 'a missing host address gives no link');
  assert.deepEqual(agentsWindowSessionLinks({ session: 'ahp-session:/s1', address: undefined }), { stable: '', insiders: '' });
  for (const session of ['copilotcli:/s1', 'ahp-session://tenant/s1', 'ahp-session:/a/b', 'ahp-session:/s1?x=1', 'unfold:/', 'ahp-session:/a b', '', null]) {
    assert.equal(agentsWindowSessionLink({ session, address: 'localhost:1' }), '', String(session));
  }
  assert.equal(agentsWindowSessionLink({ protocol: 'java script', session: 'ahp-session:/s1', address: 'localhost:1' }), '');
  assert.deepEqual(parseSessionUri('ahp-session:/wi-12'), { scheme: 'ahp-session', id: 'wi-12' });
});

test('an address that carries a connection token never becomes a link, because VS Code would encode the token into it', () => {
  for (const address of ['wss://unfold.example/?tkn=secret', 'ws://localhost:4080?tkn=secret', 'wss://unfold.example/ahp?x=1&TKN=secret']) {
    assert.equal(carriesConnectionToken(address), true, address);
    assert.equal(agentsWindowSessionLink({ session: 'ahp-session:/s1', address }), '', address);
  }
  assert.equal(carriesConnectionToken('wss://unfold.example'), false);
});
