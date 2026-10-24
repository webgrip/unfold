import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedInboxCard, messageSender } from '../public/core/linked-inbox.js';

const now = Date.parse('2026-10-24T10:00:00.000Z');
const session = { id: 'abcd1234-session', mine: true };
const messages = [
  { id: '2', kind: 'ci', text: 'CI went red on <b>184</b>.', createdAt: '2026-10-24T09:59:00.000Z', createdBy: 'Unfold', fromOwner: false, deliveredAt: null },
  { id: '1', kind: 'person', text: 'Rebase\nfirst', createdAt: '2026-10-24T09:50:00.000Z', createdBy: 'ryan', fromOwner: true, deliveredAt: '2026-10-24T09:51:00.000Z' },
];

test('the Messages card lists what Unfold sent with its delivery state, escaped, and offers its owner a send box', () => {
  const html = linkedInboxCard(session, messages, { now });
  assert.match(html, /Send to this session/);
  assert.match(html, /data-form="linked-session-message" data-id="abcd1234-session"/);
  assert.match(html, /maxlength="2000"/);
  assert.match(html, /Waiting[\s\S]*Unfold · CI notice[\s\S]*Delivered[\s\S]*ryan · you/);
  assert.doesNotMatch(html, /<b>184/);
  assert.equal(linkedInboxCard({ ...session, mine: false }, messages, { now }), '', 'someone else’s session shows no messages');
  assert.match(linkedInboxCard(session, [], { now }), /No messages yet/);
  assert.match(linkedInboxCard(session, [], { now, draft: 'half <typed>' }), />half &lt;typed&gt;<\/textarea>/, 'a draft survives a re-render');
  assert.match(linkedInboxCard(session, null, { now }), /Loading messages/);
  assert.match(linkedInboxCard(session, null, { now, error: 'Unfold is down' }), /Unfold is down/);
  assert.equal(messageSender({ kind: 'person', createdBy: 'admin', fromOwner: false }), 'admin · administrator');
});
