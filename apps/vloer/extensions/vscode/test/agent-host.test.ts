import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAgentHost, withAgentHost, withoutIssuedAgentHost } from '../src/agent-host.ts';

const address = 'wss://vloer.example';

test('a renewed agent host token replaces the entry for the same address and keeps others', () => {
  const entries = [{ address, name: 'De Vloer', connectionToken: 'old' }, { address: 'ws://other', name: 'Other', connectionToken: 'kept' }];
  assert.deepEqual(withAgentHost(entries, { address, name: 'De Vloer', connectionToken: 'new' }), [{ address: 'ws://other', name: 'Other', connectionToken: 'kept' }, { address, name: 'De Vloer', connectionToken: 'new' }]);
  assert.deepEqual(withAgentHost(undefined, { address, connectionToken: 'new' }), [{ address, connectionToken: 'new' }]);
  assert.equal(hasAgentHost(entries, address), true);
  assert.equal(hasAgentHost(entries, 'wss://unknown'), false);
});

test('signing out removes only the agent host entry whose token this editor issued', () => {
  const entries = [{ address, name: 'De Vloer', connectionToken: 'issued' }, { address: 'ws://other', connectionToken: 'issued' }];
  assert.deepEqual(withoutIssuedAgentHost(entries, address, 'issued'), [{ address: 'ws://other', connectionToken: 'issued' }]);
  assert.deepEqual(withoutIssuedAgentHost(entries, address, 'pasted-elsewhere'), entries);
  assert.deepEqual(withoutIssuedAgentHost(entries, address, undefined), entries);
});
