import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationCard, conversationGaps, conversationKept, mergedConversation } from '../public/core/linked-conversation.js';

const session = { id: 'abcd1234-session', mine: true };
const entry = (id, kind, text) => ({ id, kind, text, at: '2026-10-25T10:00:00.000Z' });

test('reads append new entries once, a restart replaces them, a failed read keeps what was shown, and the page keeps at most its bound', () => {
  const first = mergedConversation(null, { reachable: true, entries: [entry('a', 'prompt', 'hi')], cursor: 10, truncated: true, restarted: false });
  assert.deepEqual(first.entries.map(item => item.id), ['a']);
  assert.equal(first.truncated, true);
  const second = mergedConversation(first, { reachable: true, entries: [entry('a', 'prompt', 'hi'), entry('b', 'reply', 'hello')], cursor: 20, truncated: false, restarted: false });
  assert.deepEqual(second.entries.map(item => item.id), ['a', 'b'], 'an entry seen before is not shown twice');
  assert.equal(second.cursor, 20);
  const asleep = mergedConversation(second, { reachable: false, reason: 'not_relaying' });
  assert.deepEqual(asleep.entries.map(item => item.id), ['a', 'b']);
  assert.equal(asleep.cursor, 20);
  assert.equal(asleep.reason, 'not_relaying');
  const rewritten = mergedConversation(asleep, { reachable: true, entries: [entry('z', 'prompt', 'new')], cursor: 5, truncated: false, restarted: true });
  assert.deepEqual(rewritten.entries.map(item => item.id), ['z']);
  const many = Array.from({ length: conversationKept + 5 }, (_, index) => entry(`m${index}`, 'tool', 'Bash: x'));
  assert.equal(mergedConversation(rewritten, { reachable: true, entries: many, cursor: 9, restarted: false }).entries.length, conversationKept);
});

test('the Conversation card shows prompts, Markdown replies and tool lines escaped and private, says why it is unreachable, and only to the owner', () => {
  const conversation = mergedConversation(null, { reachable: true, entries: [entry('a', 'prompt', 'fix <b>it</b>'), entry('b', 'reply', 'Done, **two** files.'), entry('c', 'tool', 'Bash: Run tests · Runs npm test')], cursor: 1, truncated: true, restarted: false });
  const html = conversationCard(session, conversation);
  assert.match(html, /id="linked-conversation-list"/);
  assert.match(html, /fix &lt;b&gt;it&lt;\/b&gt;/);
  assert.match(html, /<strong>two<\/strong>/);
  assert.match(html, /Bash: Run tests · Runs npm test/);
  assert.match(html, /Older messages are on the machine/);
  assert.equal((html.match(/data-private/g) ?? []).length, 3, 'every entry is blurred in bug reports');
  assert.match(html, /keeps none of it/);
  assert.equal(conversationCard({ ...session, mine: false }, conversation), '');
  assert.match(conversationCard(session, null), /Asking the session’s machine/);
  const asleep = conversationCard(session, mergedConversation(conversation, { reachable: false, reason: 'not_relaying' }));
  assert.match(asleep, /role="status"/);
  assert.ok(asleep.includes(conversationGaps.not_relaying));
  assert.match(conversationCard(session, mergedConversation(null, { reachable: false, reason: 'ended' })), /The session ended/);
  assert.match(conversationCard(session, mergedConversation(null, { reachable: true, entries: [], cursor: 0, restarted: false })), /Nothing said yet/);
});
