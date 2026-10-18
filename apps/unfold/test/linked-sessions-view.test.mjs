import test from 'node:test';
import assert from 'node:assert/strict';
import { agentsText, attributionLine, linkedSessionPage, linkedSessionsMarkup, linkedStatusLine } from '../public/core/linked-sessions.js';
import { setupSteps } from '../public/views/linked-sessions.js';

const now = Date.parse('2026-10-17T10:00:00.000Z');
const session = { id: 'abcd1234-session', harness: 'claude-code', harnessVersion: '2.1.301', ownerName: 'sam', mine: false, title: '<img src=x onerror=alert(1)>', repository: 'forgejo.example.org:webgrip/unfold.git', branch: 'feat/vik-2051-login', model: 'claude-opus-5-5', remoteUrl: '', state: 'waiting', waitingFor: 'permission_prompt', startedAt: '2026-10-17T09:00:00.000Z', lastSeenAt: '2026-10-17T09:58:00.000Z', endedAt: null, workItems: [{ id: '184', how: 'branch', linkedAt: '2026-10-17T09:00:00.000Z', linkedBy: 'sam' }], pullRequests: [], commits: [{ sha: 'a'.repeat(40), subject: 'feat: login', at: '2026-10-17T09:30:00.000Z', trailer: true, aiLines: 12, files: 2 }, { sha: 'b'.repeat(40), subject: 'docs', at: '2026-10-17T09:40:00.000Z', trailer: false, aiLines: null, files: null }], aiLines: 12, link: 'https://unfold.example.org/#linked-session/abcd1234-session', resume: 'claude --resume abcd1234-session' };

test('the Work Item card lists linked sessions with their state, owner and AI-written lines, escaped, and shows nothing when none is linked', () => {
  const html = linkedSessionsMarkup({ item: { id: '184' } }, { sessions: [session] }, { now });
  assert.match(html, /Agent sessions/);
  assert.match(html, /Waiting for its person · asks for a permission/);
  assert.match(html, /12 AI-written lines in 1 commit of 2/);
  assert.match(html, /linked by its branch/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /linked-session-unlink/, 'someone else’s session offers no Unlink');
  assert.match(linkedSessionsMarkup({ item: { id: '184' } }, { sessions: [{ ...session, mine: true }] }, { now }), /linked-session-unlink/);
  assert.equal(linkedSessionsMarkup({ item: { id: '184' } }, { sessions: [] }, { now }), '');
  assert.equal(linkedSessionsMarkup({ item: { id: '184' } }, null, { now }), '');
});

test('a session page calls the cost an API-price estimate, offers resume only to its owner, and reads with no telemetry', () => {
  const telemetry = { available: true, reason: null, costUsd: 1.5, costStatus: 'estimate', tokens: { input: 1000, output: 200, cacheRead: 5000, cacheCreation: 0 }, activeSeconds: 600, events: { prompts: 4, toolResults: 30, apiRequests: 9, apiErrors: 0 }, tools: [{ name: 'Bash', count: 12 }], account: { uuid: '99bd4052', organization: '' }, dashboardUrl: 'https://grafana.example.org/d/cc?var-session=abcd' };
  const mine = linkedSessionPage({ ...session, mine: true, telemetry }, { now, workItems: { 184: 'Fix login' } });
  assert.match(mine, /API-price estimate/);
  assert.match(mine, /A Claude plan is not billed this/);
  assert.match(mine, /claude --resume abcd1234-session/);
  assert.match(mine, /Open in Grafana/);
  assert.match(mine, /Claude account/);
  assert.match(mine, /184 · Fix login/);
  const theirs = linkedSessionPage(session, { now });
  assert.doesNotMatch(theirs, /claude --resume/);
  assert.doesNotMatch(theirs, /Telemetry/);
  assert.match(linkedSessionPage({ ...session, mine: true, telemetry: { ...telemetry, available: false, reason: 'No metrics store is configured.' } }, { now }), /No telemetry for this session[\s\S]*No metrics store is configured/);
  assert.equal(attributionLine({ commits: [] }), 'No commits yet');
  assert.match(linkedStatusLine({ ...session, state: 'stale' }, now), /^Not heard from · last heard/);
});

test('the setup steps name this workbench and never show a real token', () => {
  const steps = setupSteps('https://unfold.example.org');
  assert.match(steps, /UNFOLD_URL=https:\/\/unfold\.example\.org npm --prefix apps\/unfold run mcp -- login/);
  assert.match(steps, /\/plugin install unfold@unfold/);
  assert.match(steps, /vle_…/);
});

test('a commit row says which agents wrote its AI lines', () => {
  assert.equal(agentsText({ main: 3, 'code-reviewer': 10 }), 'main agent 3 · code-reviewer 10');
  assert.match(agentsText(undefined), /—/);
  assert.match(linkedSessionPage({ ...session, commits: [{ ...session.commits[0], agents: { 'code-reviewer': 12 } }] }, { now }), /code-reviewer 12/);
});
