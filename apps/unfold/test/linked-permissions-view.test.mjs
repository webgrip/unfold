import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionButtons, permissionPrompt, permissionsBySession, permissionsCard, secondsLeft } from '../public/core/linked-permissions.js';
import { linkedWaitReason, linkedWaitingCard } from '../public/core/linked-waiting.js';
import { fleetBoard, fleetModel } from '../public/live/fleet.js';
import { fleetScenarios } from '../public/live/fleet-fixtures.js';

const now = Date.parse('2026-10-24T10:00:00.000Z');
const ago = minutes => new Date(now - minutes * 60_000).toISOString();
const session = (id, fields = {}) => ({ id, harness: 'claude-code', ownerName: 'ryan', mine: true, title: `Session ${id}`, repository: 'https://forgejo.example.org/webgrip/unfold.git', branch: `feat/${id}`, state: 'waiting', waitingFor: 'permission_prompt', remoteUrl: '', startedAt: ago(60), lastSeenAt: ago(2), workItems: [], commits: [], aiLines: 0, resume: `claude --resume ${id}`, ...fields });
const prompt = (fields = {}) => ({ id: '7d1f0c2a-3b4c-4d5e-8f60-718293a4b5c6', sessionId: 'aaaaaaaa1', tool: 'Bash', summary: 'Remove <b>node_modules</b>', detail: 'Runs rm', createdAt: ago(1), expiresAt: new Date(now + 90_000).toISOString(), state: 'pending', ...fields });

test('a waiting prompt shows its tool and the agent’s summary as text, how long it still waits here, and Approve and Deny', () => {
  const html = permissionPrompt(prompt(), { now });
  assert.match(html, /<span class="chip" data-tone="attention">Bash<\/span>/);
  assert.match(html, /Remove &lt;b&gt;node_modules&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>/, 'the summary is data from the agent, never markup');
  assert.match(html, /Waits for an answer here for 1 min more, until \d\d:\d\d;/);
  assert.match(html, /data-action="linked-permission-allow"/);
  assert.match(html, /data-action="linked-permission-deny"/);
  assert.match(html, /data-tool="Bash"/);
  assert.doesNotMatch(html, /always/i);
  const expired = permissionPrompt(prompt({ expiresAt: ago(1) }), { now });
  assert.match(expired, /Answer it in your terminal/);
  assert.doesNotMatch(expired, /linked-permission-allow/);
  assert.equal(secondsLeft(prompt(), now), 90);
  assert.equal(permissionsCard(session('aaaaaaaa1', { mine: false }), [prompt()]), '', 'only the owner gets the card');
  assert.equal(permissionsCard(session('aaaaaaaa1'), []), '');
  assert.match(permissionsCard(session('aaaaaaaa1'), [prompt()], { now }), /Waiting for your answer/);
  assert.deepEqual([...permissionsBySession([prompt(), prompt({ id: 'x', sessionId: 'bbbbbbbb2' }), null]).keys()], ['aaaaaaaa1', 'bbbbbbbb2']);
});

test('Now offers Approve and Deny on a session that asked Unfold, and keeps the terminal advice for one that did not', () => {
  const sessions = [session('aaaaaaaa1'), session('bbbbbbbb2', { lastSeenAt: ago(1) })];
  const html = linkedWaitingCard(sessions, { now, permissions: [prompt()] });
  assert.match(html, /Your Claude Code session asks to use Bash: Remove &lt;b&gt;node_modules&lt;\/b&gt; \(Runs rm\)\./);
  assert.match(html, /id="now-linked-aaaaaaaa1-7d1f0c2a-3b4c-4d5e-8f60-718293a4b5c6-allow"/);
  assert.equal((html.match(/linked-permission-allow/g) ?? []).length, 1, 'only the session that asked shows the buttons');
  assert.match(html, /Copy resume command/, 'the resume command stays');
  assert.match(html, /Answer a tool prompt here when its session asked Unfold to/);
  assert.equal(linkedWaitReason(session('x'), [prompt()]).fix, 'Approve or deny it here, or in your terminal.');
  assert.doesNotMatch(linkedWaitingCard(sessions, { now }), /linked-permission-allow/);
});

test('the fleet chip of a waiting session that asked Unfold carries the prompt and its buttons beside the link', () => {
  const { now: data, summary } = fleetScenarios.today();
  const model = fleetModel({ now: data, summary, linked: [session('aaaaaaaa1')], permissions: [prompt()], at: now });
  assert.equal(model.yours.holding[0].permission.id, prompt().id);
  const html = fleetBoard(model);
  assert.match(html, /<\/a><div class="fb-chip-answer">/, 'the buttons sit outside the chip’s link');
  assert.match(html, /id="fleet-7d1f0c2a-3b4c-4d5e-8f60-718293a4b5c6-deny"/);
  assert.equal(fleetModel({ now: data, summary, linked: [session('aaaaaaaa1')], at: now }).yours.holding[0].permission, null);
  assert.ok(permissionButtons(prompt()).includes('Approve'));
});
