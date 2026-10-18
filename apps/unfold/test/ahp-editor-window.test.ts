import test from 'node:test';
import assert from 'node:assert/strict';
import { editorLink, openElsewherePart, parseEditorWindow, withLeadingPart } from '../src/ahp/editor-window.ts';

test('only a VS Code build with an Agents window and a numeric window id is accepted as an editor window', () => {
  assert.deepEqual(parseEditorWindow({ protocol: 'vscode-insiders', windowId: 12 }), { protocol: 'vscode-insiders', windowId: '12' });
  for (const body of [{ protocol: 'cursor', windowId: '1' }, { protocol: 'vscode', windowId: '0' }, { protocol: 'vscode', windowId: '1e3' }, null, 'vscode'])
    assert.equal(parseEditorWindow(body), undefined, JSON.stringify(body));
});

test('an editor link names the target, the workbench it belongs to and the window VS Code sends it to', () => {
  const window = { protocol: 'vscode', windowId: '4' };
  assert.equal(editorLink(window, { kind: 'work-item', id: '227' }, 'https://unfold.example/'), 'vscode://webgrip.unfold/work-item?id=227&origin=https%3A%2F%2Funfold.example&windowId=4');
  assert.equal(editorLink(window, { kind: 'session', id: 'abc_1-2' }), 'vscode://webgrip.unfold/session?id=abc_1-2&windowId=4');
  assert.equal(editorLink(window, { kind: 'work-item', id: 'wi-227' }), '', 'a Work Item link takes Ploeg\'s numeric id');
});

test('the open-elsewhere line offers VS Code first and the browser second, and is left out when it has neither', () => {
  assert.deepEqual(openElsewherePart('p', { editor: 'vscode://webgrip.unfold/work-item?id=1&windowId=2', page: 'https://unfold.example/#work/1' }, 'Work Item'), { kind: 'markdown', id: 'p', content: '[Open the Work Item in VS Code](vscode://webgrip.unfold/work-item?id=1&windowId=2) · [Open in the browser ↗](https://unfold.example/#work/1)\n\n' });
  assert.equal(openElsewherePart('p', { page: 'https://unfold.example/#session/s' }, 'session')?.content, '[Open in the browser ↗](https://unfold.example/#session/s)\n\n');
  assert.equal(openElsewherePart('p', {}, 'session'), undefined);
});

test('the line leads the first turn shown, or the active turn of a chat with no finished turn, and changes nothing else', () => {
  const part = { kind: 'markdown', id: 'lead', content: 'x' };
  const chat = { turns: [{ id: 't1', responseParts: [{ id: 'a' }] }, { id: 't2', responseParts: [] }], activeTurn: { id: 't3', responseParts: [] } };
  const led = withLeadingPart(chat, part);
  assert.deepEqual(led.turns[0].responseParts, [part, { id: 'a' }]);
  assert.equal(led.turns[1], chat.turns[1]);
  assert.equal(led.activeTurn, chat.activeTurn);
  assert.deepEqual(chat.turns[0].responseParts, [{ id: 'a' }], 'the host\'s own projection is not changed');
  assert.deepEqual(withLeadingPart({ turns: [], activeTurn: { id: 't', responseParts: [{ id: 'b' }] } }, part).activeTurn.responseParts, [part, { id: 'b' }]);
  assert.deepEqual(withLeadingPart({ turns: [] }, part), { turns: [] });
  assert.equal(withLeadingPart(chat, undefined), chat);
});
