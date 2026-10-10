import test from 'node:test';
import assert from 'node:assert/strict';
import { agentHostConnectionAddress, agentsWindowLink, extensionViewLink } from '../public/core/vscode.js';

test('Connect VS Code opens the extension\'s connect-agents-window link for this workbench', () => {
  assert.equal(agentsWindowLink('https://unfold.example'), 'vscode://webgrip.unfold/connect-agents-window?origin=https%3A%2F%2Funfold.example');
  assert.equal(agentsWindowLink(''), 'vscode://webgrip.unfold/connect-agents-window');
  assert.equal(extensionViewLink, 'vscode:extension/webgrip.unfold');
});

test('the manual address carries the token as tkn, and only for a WebSocket address', () => {
  assert.equal(agentHostConnectionAddress('wss://unfold.example', 'abc_DEF-123'), 'wss://unfold.example/?tkn=abc_DEF-123');
  assert.equal(agentHostConnectionAddress('ws://127.0.0.1:4080', 'abc'), 'ws://127.0.0.1:4080/?tkn=abc');
  assert.equal(agentHostConnectionAddress('https://unfold.example', 'abc'), '');
  assert.equal(agentHostConnectionAddress('wss://unfold.example', ''), '');
  assert.equal(agentHostConnectionAddress('not a url', 'abc'), '');
});
