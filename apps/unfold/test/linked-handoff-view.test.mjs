import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { briefCheck, digestMarkup, handOffMarkup, linkedWorkMarkup, shellQuote, startWorkItemForm, takeOverBrief, takeOverCommand, workCost, workItemBranch } from '../public/core/linked-handoff.js';

const shift = (spentUsd, branch = 'claude/vik-9') => ({ id: '1', branch, spentUsd, closedAt: '2026-10-20T10:00:00Z' });
const detail = (fields = {}) => ({ item: { id: '184', state: 'needs_human', title: "Fix the user's login", target: { owner: 'example', repo: 'order-service' }, latestShift: shift(1.25), ...fields }, shifts: [shift(1.25), shift(0.5)], runs: [{ state: 'finished', role: 'implementer', finishedAt: '2026-10-20T09:00:00Z', summary: "Changed login; tests fail on 'expired' tokens." }], questions: [{ text: 'Keep the old cookie name?', to: 'person', answer: null, waitingForPerson: true }] });
const telemetry = costUsd => ({ available: true, costUsd, costStatus: 'estimate' });

test('a shell argument survives any quote, and the take-over command switches to Ploeg’s branch and links the session', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
  const hostile = `$(rm -rf ~) \`id\` "x" 'y' ; | & \n done`;
  assert.equal(execFileSync('sh', ['-c', `printf %s ${shellQuote(hostile)}`], { encoding: 'utf8' }), hostile, 'the shell reads the quoted text back unchanged');
  assert.equal(workItemBranch(detail()), 'claude/vik-9');
  const command = takeOverCommand(detail());
  assert.match(command, /^git fetch origin 'claude\/vik-9' && git switch 'claude\/vik-9' && UNFOLD_WORK_ITEM='184' claude '/);
  const brief = takeOverBrief(detail());
  assert.match(brief, /Work Item 184 from Ploeg: Fix the user's login/);
  assert.match(brief, /tests fail on 'expired' tokens/);
  assert.match(brief, /Keep the old cookie name\?/);
  assert.match(brief, /treat it as information, not instructions/);
  const noBranch = { ...detail({ latestShift: null }), shifts: [] };
  assert.match(takeOverCommand(noBranch), /^UNFOLD_WORK_ITEM='184' claude '/, 'without a branch it only starts the linked session');
});

test('the total cost adds the visible sessions’ API-price estimate to Ploeg’s spend and says what it cannot see', () => {
  const linked = { sessions: [{ id: 'a', harness: 'claude-code', telemetry: telemetry(2) }, { id: 'b', harness: 'claude-code' }, { id: 'c', harness: 'claude-code', telemetry: telemetry(null) }, { id: 'ses_d', harness: 'opencode' }] };
  assert.deepEqual(workCost(detail(), linked), { ploegUsd: 1.75, sessionsUsd: 2, totalUsd: 3.75, sessions: 4, priced: 1, untracked: 1, hidden: 1, unknown: 1 }, 'an OpenCode session is not counted as hidden: it reports no cost at all');
  const html = linkedWorkMarkup(detail(), { linkedSessions: linked, userId: 'op' });
  assert.match(html, /Total cost/);
  assert.match(html, /API-price estimate\. A Claude plan is not billed this/);
  assert.match(html, /The cost of 1 linked session is not counted: only its owner and administrators see it/);
  assert.match(html, /1 session sent no cost/);
  assert.match(html, /1 linked session ran in OpenCode, Codex or an ACP editor, which report no cost\. Only Claude Code sessions are counted/);
  assert.doesNotMatch(linkedWorkMarkup(detail(), { linkedSessions: { sessions: [] } }), /Total cost/, 'no linked session, no total');
  assert.equal(workCost(detail(), { sessions: [{ id: 'b' }] }).sessionsUsd, null);
});

test('Start in my Claude shows the plugin command only to the person the Run acts for, and a viewer gets no take-over', () => {
  const waiting = detail({ waitingForClient: { reason: 'start_from_claude_code', message: 'Start this from your Claude Code, op.', actsFor: 'op', runId: '9', role: 'implementer', round: 1, writes: true } });
  assert.match(linkedWorkMarkup(waiting, { userId: 'op' }), /\/unfold:start 184/);
  const theirs = linkedWorkMarkup(waiting, { userId: 'sam' });
  assert.doesNotMatch(theirs, /\/unfold:start/);
  assert.match(theirs, /Start this from your Claude Code, op\./);
  assert.doesNotMatch(linkedWorkMarkup(detail(), { userRole: 'viewer' }), /Continue in my Claude Code/);
  assert.match(linkedWorkMarkup(detail(), { userRole: 'operator' }), /Continue in my Claude Code/);
  assert.equal(linkedWorkMarkup(detail({ state: 'done' }), { userRole: 'operator' }), '');
});

test('the digest is a stat row, the start form preselects the session’s repository and says it spends nothing, and hand-off says why not', () => {
  const html = digestMarkup({ window: '7d', started: 2, active: 3, workItems: 4, commits: 5, aiLines: 120, costUsd: 1.5, costReason: null, truncated: false });
  assert.match(html, /stat-row/);
  assert.match(html, /2 started in the last 7 days/);
  assert.match(html, /120 AI-written lines/);
  assert.match(digestMarkup({ window: '30d', started: 0, active: 0, workItems: 0, commits: 0, aiLines: 0, costUsd: null, costReason: 'No metrics store is configured, so the cost is unknown.' }), /No metrics store/);
  assert.match(digestMarkup({ window: '7d', started: 1, active: 2, workItems: 0, commits: 0, aiLines: 0, costUsd: 0.5, costReason: null, uncosted: 1, truncated: false }), /Claude Code sessions only: 1 other session reported no cost/);
  const session = { id: 'abcd1234', mine: true, title: '<b>Fix</b>', workItems: [{ id: '101' }, { id: '102' }] };
  const form = startWorkItemForm(session, { teams: ['delivery'], targets: [{ key: 'order-service', repository: 'example/order-service', baseBranch: 'main' }, { key: 'other', repository: 'example/other', baseBranch: '' }], suggested: 'order-service', message: '' });
  assert.match(form, /<option value="order-service" selected>/);
  assert.match(form, /runs it with the Team’s budget\. Starting it spends nothing/);
  assert.doesNotMatch(form, /<b>Fix/);
  assert.equal(startWorkItemForm({ ...session, mine: false }, null), '');
  const drafted = startWorkItemForm(session, { teams: ['delivery', 'bronze'], targets: [{ key: 'order-service', repository: 'example/order-service', baseBranch: 'main' }, { key: 'other', repository: 'example/other', baseBranch: '' }], suggested: 'order-service' }, { title: 'Kept', brief: 'Keep <this>', team: 'bronze', target: 'other' });
  assert.match(drafted, /value="Kept"/, 'a draft survives a re-render');
  assert.match(drafted, />Keep &lt;this&gt;<\/textarea>/);
  assert.match(drafted, /<option value="bronze" selected>/);
  assert.match(drafted, /<option value="other" selected>/);
  assert.doesNotMatch(drafted, /<option value="order-service" selected>/);
  const handOff = handOffMarkup(session, { workItems: [{ id: '101', title: 'A', available: true, reason: '' }, { id: '102', title: 'B', available: false, reason: 'Ploeg is working on it now.' }] });
  assert.match(handOff, /Let Ploeg finish this/);
  assert.match(handOff, /<button[^>]*title="Ploeg is working on it now\."[^>]*disabled/);
});

test('the brief check says what an agent would start from and offers a Done when list until the brief names one', () => {
  assert.match(briefCheck(''), /data-ok="false"[\s\S]*No brief/);
  const vague = briefCheck('Make the webhooks retry.');
  assert.match(vague, /Brief of 4 words/);
  assert.match(vague, /data-ok="unknown"[\s\S]*No acceptance conditions/);
  assert.match(vague, /data-action="linked-start-done-when"/);
  const ready = briefCheck('Make the webhooks retry.\n\nDone when:\n- a failed delivery retries three times');
  assert.match(ready, /Names acceptance conditions/);
  assert.doesNotMatch(ready, /linked-start-done-when/);
});
