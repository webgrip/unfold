import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWebview, type StubElement } from './webview-dom.ts';

const view = loadWebview();
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1', title: 'Fix rounding', objective: 'Fix it', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', placement: 'docker', approval: 'manual',
    ownerId: 'u1', ownerName: 'Ryan', status: 'running', budgetUsd: 5, spentUsd: 0.2, costStatus: 'pending', createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:05:00.000Z', branch: 'vloer/s1',
    runs: [
      { id: 'r1', roleId: 'engineer', roleName: 'Engineer', mode: 'write', status: 'completed', startedAt: '2026-09-10T10:00:00.000Z', finishedAt: '2026-09-10T10:02:00.000Z', costUsd: 0.1 },
      { id: 'r2', roleId: 'analyst', roleName: 'Analyst', mode: 'read', status: 'completed', startedAt: '2026-09-10T10:02:00.000Z', finishedAt: '2026-09-10T10:03:00.000Z', costUsd: 0.05 },
      { id: 'r3', roleId: 'reviewer', roleName: 'Reviewer', mode: 'read', status: 'running', startedAt: '2026-09-10T10:03:00.000Z', costUsd: 0.05 },
    ],
    artifacts: [],
    ...overrides,
  };
}

test('the webview announces itself to the extension host on load', () => {
  assert.deepEqual(plain(view.posted), [{ type: 'ready' }]);
});

test('markdown keeps hostile text inert: no script, image or anchor elements are created and the raw text survives as text', () => {
  const root: StubElement = view.markdown('# Title\n\n<script>window.compromised=true</script> and <img src=x onerror="x()"> plus [link](javascript:alert(1)) and **bold** `code`\n\n- one\n- two');
  assert.equal(root.find('script').length, 0);
  assert.equal(root.find('img').length, 0);
  assert.equal(root.find('a').length, 0);
  assert.ok(root.textContent.includes('<script>window.compromised=true</script>'));
  assert.ok(root.textContent.includes('<img src=x onerror="x()">'));
  assert.equal(root.find('strong').length, 1);
  assert.equal(root.find('code').length, 1);
  assert.equal(root.find('h3')[0]?.textContent, 'Title');
  assert.equal(root.find('li').length, 2);
  assert.ok(root.withClass('link-target')[0]?.textContent.includes('javascript:alert(1)'), 'a link target is displayed as text, never navigable');
});

test('fenced code blocks stay literal inside markdown', () => {
  const root: StubElement = view.markdown('```js\nconst a = "<b>"\n```');
  assert.equal(root.find('pre').length, 1);
  assert.equal(root.find('b').length, 0);
  assert.equal(root.find('code')[0]?.textContent, 'const a = "<b>"');
});

test('tool events collapse per partId with the latest state winning and earlier fields retained', () => {
  const events = [
    { id: 1, sessionId: 's1', type: 'tool', at: '2026-09-10T10:00:01.000Z', actor: 'engineer', runId: 'r1', data: { partId: 'p1', name: 'bash', status: 'running', input: { command: 'npm test' } } },
    { id: 2, sessionId: 's1', type: 'message', at: '2026-09-10T10:00:02.000Z', actor: 'engineer', runId: 'r1', data: { partId: 'm1', text: 'Running ' } },
    { id: 3, sessionId: 's1', type: 'tool', at: '2026-09-10T10:00:03.000Z', actor: 'engineer', runId: 'r1', data: { partId: 'p1', status: 'failed', output: 'not ok', error: 'exit 1' } },
    { id: 4, sessionId: 's1', type: 'message', at: '2026-09-10T10:00:04.000Z', actor: 'engineer', runId: 'r1', data: { partId: 'm1', text: 'the checks.' } },
    { id: 5, sessionId: 's1', type: 'tool', at: '2026-09-10T10:00:05.000Z', actor: 'reviewer', runId: 'r3', data: { partId: 'p1', name: 'read', status: 'completed' } },
    { id: 6, sessionId: 's1', type: 'heartbeat', at: '2026-09-10T10:00:06.000Z', actor: 'system', data: {} },
  ];
  const visible = view.visibleEvents(events);
  assert.deepEqual(plain(visible.map((event: { id: number }) => event.id)), [1, 2, 5]);
  const tool = visible[0];
  assert.equal(tool.data.status, 'failed');
  assert.equal(tool.data.name, 'bash', 'fields from the first part survive later updates');
  assert.deepEqual(plain(tool.data.input), { command: 'npm test' });
  assert.equal(tool.data.output, 'not ok');
  assert.equal(tool.data.error, 'exit 1');
  assert.equal(tool.at, '2026-09-10T10:00:03.000Z');
  assert.equal(visible[1].data.text, 'Running the checks.');
  assert.equal(visible[2].data.name, 'read', 'the same partId in another run is a different tool');
  assert.deepEqual(plain(events[0].data), { partId: 'p1', name: 'bash', status: 'running', input: { command: 'npm test' } }, 'source events are not mutated');
});

test('a tool card shows its title, input, output and error text', () => {
  const node: StubElement = view.eventNode({ id: 3, sessionId: 's1', type: 'tool', at: '2026-09-10T10:00:03.000Z', actor: 'engineer', runId: 'r1', data: { partId: 'p1', name: 'bash', status: 'failed', input: { command: 'npm test' }, output: 'not ok', error: 'exit code 1' } }, session());
  assert.ok(node.className.includes('tool-failed'));
  assert.equal(node.withClass('tool-detail')[0]?.textContent, 'npm test');
  const pres = node.find('pre').map(pre => pre.textContent);
  assert.ok(pres.some(text => text.includes('"command": "npm test"')));
  assert.ok(pres.includes('not ok'));
  assert.equal(node.withClass('tool-error')[0]?.textContent, 'exit code 1');
  assert.equal(node.find('summary')[0]?.textContent, 'Error and input');
});

test('run.started renders the brief this role received and run.finished shows role and verdict without the summary', () => {
  const current = session();
  const started: StubElement = view.eventNode({ id: 7, sessionId: 's1', type: 'run.started', at: '2026-09-10T10:03:00.000Z', actor: 'reviewer', runId: 'r3', data: { role: 'Reviewer', mode: 'read', reviewer: true, model: { id: 'sonnet', modelId: 'claude-sonnet', providerId: 'anthropic' }, promptSha: 'abcdef1234567890', prompt: { objective: 'Fix it', instruction: 'Inspect **carefully**', notes: null, earlier: 'Engineer changed rounding', evidence: null, guidance: 'Conclude with JSON' } } }, current);
  assert.ok(started.className.includes('brief-event'));
  assert.equal(started.find('strong')[0]?.textContent, 'Reviewer started');
  assert.equal(started.withClass('tool-state')[0]?.textContent, 'independent review · claude-sonnet');
  assert.equal(started.find('summary')[0]?.textContent, 'The brief this role receivedabcdef123456');
  const labels = started.withClass('eyebrow').map(node => node.textContent);
  assert.deepEqual(plain(labels), ['OBJECTIVE', 'ROLE INSTRUCTION', 'PRIOR WORK', 'GUIDANCE']);
  assert.equal(started.find('strong').length, 2, 'instruction markdown renders emphasis');
  const finished: StubElement = view.eventNode({ id: 8, sessionId: 's1', type: 'run.finished', at: '2026-09-10T10:04:00.000Z', actor: 'reviewer', runId: 'r3', data: { summary: 'A long summary that must not repeat here', verdict: 'approve', status: 'completed' } }, current);
  assert.equal(finished.withClass('system-text')[0]?.textContent, 'Reviewer finished · Explicitly approved');
  const violated: StubElement = view.eventNode({ id: 9, sessionId: 's1', type: 'policy.violated', at: '2026-09-10T10:04:00.000Z', actor: 'system', data: { message: 'claude answered by openai/us-east', request: { id: 'g1', model: 'claude', provider: 'openai', geo: 'us-east', violation: 'openai/us-east' } } }, current);
  assert.ok(violated.className.includes('system-bad'));
  assert.equal(violated.withClass('system-text')[0]?.textContent, 'Gateway policy: claude answered by openai/us-east');
});

test('crew labels distinguish implementation, analysis and the final independent review', () => {
  const current = session();
  assert.deepEqual(plain(current.runs.map(run => view.runLabel(current, run))), ['implementation', 'analysis', 'independent review']);
  const strip: StubElement = view.crewStrip(current);
  assert.deepEqual(plain(strip.withClass('run-meta').map(node => node.textContent.split(' · ')[0])), ['Implementation', 'Analysis', 'Independent review']);
});

test('the situation counts only the final read role as a reviewer', () => {
  const completed = session({ status: 'completed', runs: [
    { id: 'r1', roleName: 'Engineer', mode: 'write', status: 'completed' },
    { id: 'r2', roleName: 'Analyst', mode: 'read', status: 'completed' },
    { id: 'r3', roleName: 'Reviewer', mode: 'read', status: 'completed', verdict: 'approve' },
  ] });
  assert.equal(view.situation(completed)[0], 'Required reviewers approved (1 of 1).');
  const policy = session({ status: 'failed', failure: { category: 'policy_violation', stage: 'execution', message: 'A model request left the providers this workbench allows.', remediation: 'Check the gateway route.', promptAcceptance: 'accepted', automaticRetry: false } });
  assert.equal(view.situation(policy)[0], 'Gateway policy failed: A model request left the providers this workbench allows.');
  assert.equal(view.failureNotice(policy).find('strong')[0]?.textContent, 'Gateway policy needs attention');
});

test('the gateway tab summarises attribution and lists every request with its flags', () => {
  const requests = [
    { id: 'g1', at: '2026-09-10T10:00:10.000Z', durationMs: 1800, firstTokenMs: 400, provider: 'anthropic', host: 'api.anthropic.com', geo: 'eu-west', model: 'claude-sonnet', group: 'reasoning', tier: 'STANDARD', cause: 'cost_route', savingsUsd: 0.01, retries: 1, fallbacks: 0, guardrails: ['pii'], cacheHit: true, cachedTokens: 120, inputTokens: 1000, outputTokens: 200, usd: 0.05, status: 'success', harness: 'opencode', roleId: 'engineer' },
    { id: 'g2', at: '2026-09-10T10:00:20.000Z', provider: 'openai', host: 'api.openai.com', geo: 'us-east', model: 'gpt', retries: 0, fallbacks: 1, guardrails: [], cacheHit: false, cachedTokens: 0, inputTokens: 10, outputTokens: 0, usd: 0.001, status: 'failure', error: 'refused by policy', roleId: 'reviewer', violation: 'openai/us-east' },
  ];
  const tab: StubElement = view.gatewayTab(session({ requests }), 'litellm.example');
  const facts = tab.withClass('fact').map(node => node.textContent);
  assert.ok(facts[0].startsWith('Gateway') && facts[0].includes('litellm.example'));
  assert.ok(facts[1].includes('anthropic, openai'));
  assert.ok(facts[2].includes('api.anthropic.com') && facts[2].includes('api.openai.com'));
  assert.ok(facts[3].includes('2') && facts[3].includes('1 refused'));
  assert.ok(facts[4].includes('router saved'));
  const rows = tab.find('tbody')[0].find('tr');
  assert.equal(rows.length, 2);
  assert.ok(rows[0].textContent.includes('Engineer'));
  assert.ok(rows[0].textContent.includes('reasoning') && rows[0].textContent.includes('standard · cost route'));
  const flags = rows[0].withClass('tag').map(node => node.textContent);
  assert.deepEqual(plain(flags), ['1 retry', 'cache hit', '120 cached', 'pii']);
  assert.ok(rows[0].textContent.includes('first token 0.4s'));
  assert.ok(rows[1].className.includes('row-failed'));
  assert.deepEqual(plain(rows[1].withClass('tag').map(node => node.textContent)), ['outside policy: openai/us-east', 'refused', 'fallback']);
  assert.ok(rows[1].textContent.includes('refused by policy'));
  assert.ok(rows[1].textContent.includes('pinned'));
  const empty: StubElement = view.gatewayTab(session({ requests: [], costStatus: 'demo' }), undefined);
  assert.ok(empty.textContent.includes('demonstration runtime does not call a model gateway'));
});

test('the budget card prefers the gateway observation while running, lists model usage and draws the cost curve', () => {
  const requests = [
    { id: 'g1', at: '2026-09-10T10:00:10.000Z', model: 'a', retries: 0, fallbacks: 0, guardrails: [], cacheHit: false, cachedTokens: 0, inputTokens: 1, outputTokens: 1, usd: 0.5, status: 'success' },
    { id: 'g2', at: '2026-09-10T10:00:20.000Z', model: 'a', retries: 0, fallbacks: 0, guardrails: [], cacheHit: false, cachedTokens: 0, inputTokens: 1, outputTokens: 1, usd: 0.7, status: 'failure', violation: 'x' },
  ];
  const user = { id: 'u1', name: 'Ryan', role: 'operator' };
  const running: StubElement = view.budgetCard(session({ observedUsd: 1.2, spentUsd: 0.2, usage: [{ model: 'claude-sonnet', group: 'reasoning', requests: 2, failures: 1, usd: 1.2, inputTokens: 2, outputTokens: 2 }], requests }), user);
  assert.equal(running.withClass('eyebrow')[0]?.textContent, 'OBSERVED AT THE GATEWAY');
  assert.equal(running.withClass('spend')[0]?.textContent, '$1.20');
  assert.equal(running.withClass('cost-status')[0]?.textContent, 'Observed at the gateway · settles later');
  assert.ok(running.withClass('usage-list')[0]?.textContent.includes('reasoning → claude-sonnet'));
  assert.ok(running.withClass('usage-list')[0]?.textContent.includes('2 requests · 1 refused · $1.20'));
  const curve = running.withClass('cost-curve')[0];
  assert.ok(curve, 'a cost curve is drawn for two or more requests');
  assert.equal(curve.find('path').length, 1);
  assert.equal(curve.find('circle').length, 1, 'policy violations are marked on the curve');
  assert.ok(curve.find('figcaption')[0]?.textContent.includes('2 requests over'));
  const settled: StubElement = view.budgetCard(session({ status: 'completed', observedUsd: 1.2, spentUsd: 0.9, costStatus: 'settled' }), user);
  assert.equal(settled.withClass('spend')[0]?.textContent, '$0.90', 'a finished session shows settled spend');
  assert.equal(settled.withClass('cost-curve').length, 0);
  const lower: StubElement = view.budgetCard(session({ observedUsd: 0.1, spentUsd: 0.2 }), user);
  assert.equal(lower.withClass('spend')[0]?.textContent, '$0.20', 'an observation below the settled figure is not shown');
});

test('the approval card offers automatic approval only for active isolated sessions and posts the choice', () => {
  const offered: StubElement = view.approvalCard(session({ placement: 'kubernetes' }), true);
  assert.equal(offered.find('h2')[0]?.textContent, 'Every tool use asks you');
  const button = offered.find('button')[0];
  assert.equal(button?.textContent, 'Approve automatically');
  assert.equal(button?.dataset.approval, 'auto');
  const automatic: StubElement = view.approvalCard(session({ approval: 'auto' }), true);
  assert.equal(automatic.find('h2')[0]?.textContent, 'Automatic for this session');
  assert.equal(automatic.find('button')[0]?.textContent, 'Ask me again');
  assert.equal(view.approvalCard(session({ placement: 'local' }), true), null);
  assert.equal(view.approvalCard(session({ status: 'completed' }), true), null);
  const viewer: StubElement = view.approvalCard(session(), false);
  assert.equal(viewer.find('button').length, 0, 'viewers see the state without controls');
});

test('transcript artifacts appear in the brief as collapsible markdown sections', () => {
  const tab: StubElement = view.briefTab(session({ artifacts: [{ id: 'a1', name: 'Engineer transcript', kind: 'transcript', content: '## Turn 1\n\nI ran `npm test` <b>x</b>' }, { id: 'a2', name: 'Summary', kind: 'summary', content: 'done' }] }));
  const transcript = tab.withClass('transcript')[0];
  assert.ok(transcript, 'a transcript section is rendered');
  assert.equal(transcript.tagName, 'details');
  assert.ok(transcript.find('summary')[0]?.textContent.startsWith('Engineer transcript'));
  assert.equal(transcript.find('b').length, 0);
  assert.equal(transcript.find('h3')[0]?.textContent, 'Turn 1');
  assert.equal(transcript.find('button')[0]?.dataset.id, 'a1');
});
