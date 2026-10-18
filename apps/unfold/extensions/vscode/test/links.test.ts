import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnfoldLink } from '../src/client.ts';

test('a Connect VS Code link from the browser asks to connect the Agents window to the workbench it names', () => {
  assert.deepEqual(parseUnfoldLink('/connect-agents-window', 'origin=https%3A%2F%2Funfold.example%2F'), { kind: 'connect-agents-window', origin: 'https://unfold.example' });
  assert.deepEqual(parseUnfoldLink('/connect-agents-window', ''), { kind: 'connect-agents-window' });
  assert.throws(() => parseUnfoldLink('/connect-agents-window', 'origin=javascript%3Aalert(1)'), /invalid workbench/);
});

test('checkout links keep working, and other paths are refused', () => {
  assert.deepEqual(parseUnfoldLink('/checkout', 'workItem=50&origin=https%3A%2F%2Funfold.example'), { kind: 'checkout', workItem: '50', origin: 'https://unfold.example' });
  assert.throws(() => parseUnfoldLink('/delete-everything', ''), /does not handle \/delete-everything/);
});

test('a link from the Agents window opens a Work Item or a session panel, and refuses an id that names neither', () => {
  assert.deepEqual(parseUnfoldLink('/work-item', 'id=227&origin=https%3A%2F%2Funfold.example&windowId=3'), { kind: 'work-item', id: '227', origin: 'https://unfold.example' });
  assert.deepEqual(parseUnfoldLink('/session', 'id=s_1-a&windowId=3'), { kind: 'session', id: 's_1-a' });
  assert.throws(() => parseUnfoldLink('/work-item', 'id=wi-227'), /names no Work Item/);
  assert.throws(() => parseUnfoldLink('/session', 'id=..%2Fx'), /names no session/);
});
