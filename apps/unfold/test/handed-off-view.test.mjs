import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelLabel, handedOffCard, handedStanding, orderHanded } from '../public/core/handed-off.js';

const nowAt = Date.parse('2026-10-30T12:00:00Z');
const item = (id, state, extra = {}) => ({ id, team: 'bronze', state, title: `Item ${id}`, url: '', createdAt: '2026-10-30T10:00:00Z', updatedAt: '2026-10-30T11:00:00Z', provider: 'vikunja', externalId: `T-${id}`, attempts: 1, infraFailures: 0, target: null, closeReason: null, latestShift: null, spentUsd: null, pullRequestUrl: '', ...extra });
const handOff = (id, at, workItem, extra = {}) => ({ id, at, channel: 'browser', team: 'bronze', origin: { kind: 'task', sourceId: 'board', sourceName: 'Board', taskId: `T-${id}` }, workItem, note: '', ...extra });

test('the channel a hand-off came through reads as the app the person used', () => {
  assert.equal(channelLabel('browser'), 'the browser');
  assert.equal(channelLabel('browser (Unfold PWA)'), 'the browser');
  assert.equal(channelLabel('mcp:ChatGPT'), 'ChatGPT');
  assert.equal(channelLabel('mcp:claude-code 2.1.0'), 'claude-code 2.1.0');
  assert.equal(channelLabel('mcp:unnamed client'), 'an MCP client');
  assert.equal(channelLabel('VS Code (GitHub Copilot)'), 'VS Code (GitHub Copilot)');
  assert.equal(channelLabel(''), 'an unnamed app');
  assert.equal(channelLabel('mcp:\u0007bell'), 'bell');
});

test('what needs the person comes first, then pull requests ready for review, each newest hand-off first', () => {
  const rows = [
    handOff(1, '2026-10-30T09:00:00Z', item('1', 'done')),
    handOff(2, '2026-10-30T09:00:00Z', null, { note: 'Ploeg has not listed a Work Item for this hand-off yet.' }),
    handOff(3, '2026-10-30T08:00:00Z', item('3', 'awaiting_review')),
    handOff(4, '2026-10-30T07:00:00Z', item('4', 'needs_human')),
    handOff(5, '2026-10-30T11:00:00Z', item('5', 'stale')),
    handOff(6, '2026-10-30T10:00:00Z', item('6', 'leased')),
  ];
  assert.deepEqual(orderHanded(rows).map(row => row.id), [5, 4, 3, 6, 2, 1]);
  assert.deepEqual(rows.map(handedStanding), ['finished', 'waiting', 'review', 'needs', 'needs', 'running']);
});

test('the card is empty until the person handed something off', () => {
  assert.equal(handedOffCard(null), '');
  assert.equal(handedOffCard({ handoffs: [], demo: false }), '');
});

test('each row shows its app, Team, state, why it waits, pull request and spend, and agent text as plain text', () => {
  const asked = item('7', 'needs_human', { title: '<img src=x onerror=alert(1)> Fix login', closeReason: 'question_for_person', latestShift: { round: 1, branch: 'b', closeReason: 'question_for_person', budgetUsd: 4, spentUsd: 1.25, reservedUsd: 0, closedAt: '2026-10-30T11:00:00Z' } });
  const ready = item('8', 'awaiting_review', { pullRequestUrl: 'https://forge.example.test/acme/shop/pulls/3' });
  const html = handedOffCard({ demo: false, handoffs: [handOff(7, '2026-10-30T10:00:00Z', asked, { channel: 'mcp:ChatGPT' }), handOff(8, '2026-10-30T09:00:00Z', ready, { channel: 'VS Code (copilot)' }), handOff(9, '2026-10-30T08:00:00Z', null, { note: 'Ploeg has not listed a Work Item for this hand-off yet.' })] }, { now: nowAt });
  assert.match(html, /Handed off by you/);
  assert.match(html, /aria-label="2 wait on you"/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; Fix login/);
  assert.match(html, /From ChatGPT/);
  assert.match(html, /From VS Code \(copilot\)/);
  assert.match(html, /Question for you/i);
  assert.match(html, /href="#work\/7"/);
  assert.match(html, /Answer the question on/);
  assert.match(html, /\$1\.25|1,25/);
  assert.match(html, /href="https:\/\/forge\.example\.test\/acme\/shop\/pulls\/3"/);
  assert.match(html, /Not picked up yet/);
  assert.match(html, /Task T-9 in Board/);
  assert.match(html, /Ploeg has not listed a Work Item for this hand-off yet\./);
  assert.doesNotMatch(html, /<a [^>]*class="list-row"[^>]*>(?:(?!<\/a>).)*<a /s, 'a link inside a row link');
  assert.doesNotMatch(html, /…/, 'no label is clipped with an ellipsis');
});

test('the demo shows no spend and an unsafe pull request link is dropped', () => {
  const html = handedOffCard({ demo: true, handoffs: [handOff(1, '2026-10-30T10:00:00Z', item('1', 'awaiting_review', { spentUsd: 2, pullRequestUrl: 'javascript:alert(1)' }))] }, { now: nowAt });
  assert.doesNotMatch(html, /spent/);
  assert.doesNotMatch(html, /javascript:/);
});
