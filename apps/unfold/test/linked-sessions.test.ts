import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LinkedSessions, branchReferences, linkedState, linkedStaleMs, parseLinkedEvent, repositoryAddress, type LinkedPloeg } from '../src/linked-sessions.ts';
import { AgentTraceError, parseAgentTrace, traceLines } from '../src/agent-trace.ts';
import { logQueries, metricQueries, readSessionTelemetry, sessionDashboardUrl } from '../src/linked-telemetry.ts';
import type { AppConfig, User } from '../src/types.ts';
import { application, login, request } from './api-support.ts';

const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
const teammate: User = { id: 'u-sam', name: 'sam', role: 'operator' };
const outsider: User = { id: 'u-eve', name: 'eve', role: 'operator' };
const base = 'https://unfold.example.org';
const sha = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
const at = new Date('2026-10-17T10:00:00.000Z');

function fakePloeg(readable: Record<string, string[]> = { 'u-ryan': ['184', '185'], 'u-sam': ['184'] }): LinkedPloeg & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    async detail(user, id) {
      if (!readable[user.id]?.includes(id)) throw Object.assign(new Error('not found'), { status: 404, code: 'ploeg_not_found' });
      return { item: { id, title: id === '184' ? 'Fix login' : 'Other', provider: 'vikunja', externalId: id === '184' ? '2051' : '2052' } };
    },
    async trackerItems(user, provider, externalId) {
      lookups.push(`${provider}:${externalId}`);
      return { items: provider === 'vikunja' && externalId === '2051' && readable[user.id]?.includes('184') ? [{ id: '184', state: 'active' }] : [] };
    },
  };
}

function service(ploeg = fakePloeg(), config: Partial<AppConfig> = {}, fetcher?: typeof fetch) {
  return new LinkedSessions(new DatabaseSync(':memory:'), config as AppConfig, ploeg, { now: () => at, ...(fetcher ? { fetch: fetcher } : {}) });
}

const event = (fields: Record<string, unknown>) => parseLinkedEvent({ harness: 'claude-code', sessionId: '0f6c1c9e-1111-4222-8333-944445555666', event: 'start', ...fields }, at);

function trace(fields: Record<string, unknown> = {}) {
  return {
    version: '0.1', id: '550e8400-e29b-41d4-a716-446655440000', timestamp: '2026-10-17T10:05:00Z', vcs: { type: 'git', revision: sha }, tool: { name: 'claude-code', version: '2.1.301' },
    files: [{ path: 'src/login.ts', conversations: [{ url: `${base}/#linked-session/x`, contributor: { type: 'ai', model_id: 'anthropic/claude-opus-5-5' }, ranges: [{ start_line: 3, end_line: 12, content_hash: 'sha256:0011' }, { start_line: 20, end_line: 20, contributor: { type: 'human' } }] }] }],
    metadata: { 'dev.unfoldhq': { session_id: 'x' } },
    ...fields,
  };
}

test('a hook report keeps only the fields Unfold uses, strips credentials from the repository and refuses unknown harnesses and events', () => {
  const parsed = event({ title: 'Fix\nlogin', repository: 'https://ryan:secret@forgejo.example.org/webgrip/unfold.git?x=1', branch: 'feat/vik-2051-login', model: 'claude-opus-5-5[1m]', prompt: 'never kept', remoteUrl: 'https://claude.ai/code/session_01abcdefgh', waitingFor: 'permission_prompt' });
  assert.equal(parsed.title, 'Fix login');
  assert.equal(parsed.repository, 'https://forgejo.example.org/webgrip/unfold.git');
  assert.equal(parsed.remoteUrl, 'https://claude.ai/code/session_01abcdefgh');
  assert.equal('prompt' in parsed, false);
  assert.equal(repositoryAddress('git@forgejo.example.org:webgrip/unfold.git'), 'forgejo.example.org:webgrip/unfold.git');
  assert.equal(event({ remoteUrl: 'https://evil.example/code/x' }).remoteUrl, '');
  assert.throws(() => event({ harness: 'codex' }), { code: 'linked_harness' });
  assert.throws(() => event({ event: 'deploy' }), { code: 'linked_event' });
  assert.throws(() => event({ sessionId: '../etc' }), { code: 'linked_session_id' });
  assert.throws(() => event({ event: 'commit', commit: { sha: 'abc' } }), { code: 'linked_commit' });
});

test('a branch names its tracker tasks by prefix, and unknown prefixes are ignored', () => {
  assert.deepEqual(branchReferences('feat/vik-2051-login'), [{ provider: 'vikunja', externalId: '2051', ref: 'VIK-2051' }]);
  assert.deepEqual(branchReferences('agent/VIK-12').map(ref => ref.ref), ['VIK-12']);
  assert.deepEqual(branchReferences('fix/abc-12-utf-8'), []);
  assert.deepEqual(branchReferences('development'), []);
});

test('the first report claims the session, its branch links the Work Item the person may read, and the session is told its link and trailer', async () => {
  const ploeg = fakePloeg();
  const linked = service(ploeg);
  const first = await linked.report(owner, event({ branch: 'feat/vik-2051-login', model: 'claude-opus-5-5' }), base);
  assert.deepEqual(first.session.workItems.map(entry => [entry.id, entry.how]), [['184', 'branch']]);
  assert.equal(first.session.state, 'idle');
  assert.equal(first.session.link, `${base}/#linked-session/0f6c1c9e-1111-4222-8333-944445555666`);
  assert.equal(first.session.resume, 'claude --resume 0f6c1c9e-1111-4222-8333-944445555666');
  assert.match(first.context, /Unfold-Session: https:\/\/unfold\.example\.org\/#linked-session\//);
  assert.match(first.context, /Work Item 184 \(Fix login\)/);
  assert.equal(first.suggestedTitle, 'VIK-2051 Fix login');
  await linked.report(owner, event({ event: 'prompt', branch: 'feat/vik-2051-login' }), base);
  assert.deepEqual(ploeg.lookups, ['vikunja:2051'], 'an unchanged branch is not looked up again');
  await assert.rejects(linked.report(outsider, event({ event: 'prompt' }), base), { status: 404 });
});

test('states follow the hooks, a silent working session reads as stale, and a commit after the end reopens it as idle', async () => {
  const linked = service();
  assert.equal((await linked.report(owner, event({ event: 'prompt' }), base)).session.state, 'working');
  const waiting = (await linked.report(owner, event({ event: 'waiting', waitingFor: 'permission_prompt' }), base)).session;
  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.waitingFor, 'permission_prompt');
  assert.equal(linkedState({ status: 'working', lastSeenAt: at.toISOString() }, at.getTime() + linkedStaleMs + 1), 'stale');
  assert.equal(linkedState({ status: 'idle', lastSeenAt: at.toISOString() }, at.getTime() + linkedStaleMs + 1), 'idle');
  assert.equal((await linked.report(owner, event({ event: 'end' }), base)).session.state, 'ended');
  const committed = (await linked.report(owner, event({ event: 'commit', commit: { sha, subject: 'fix(unfold): login', trailer: true } }), base)).session;
  assert.equal(committed.state, 'idle');
  assert.deepEqual(committed.commits.map(entry => [entry.sha, entry.trailer, entry.aiLines]), [[sha, true, null]]);
});

test('an explicit link needs a Work Item the person may read, an unlink stops the branch linking it again, and only the owner changes links', async () => {
  const linked = service();
  const id = '0f6c1c9e-1111-4222-8333-944445555666';
  await linked.report(owner, event({ branch: 'feat/vik-2051-login' }), base);
  await assert.rejects(linked.setLink(outsider, id, '185', true, base), { status: 404 });
  await assert.rejects(linked.setLink(teammate, id, '184', false, base), { status: 404 });
  const unlinked = await linked.setLink(owner, id, '184', false, base);
  assert.deepEqual(unlinked.workItems, []);
  await linked.report(owner, event({ branch: 'feat/vik-2051-login-again' }), base);
  assert.deepEqual((await linked.view(owner, id, base)).workItems, [], 'a dismissed Work Item is not linked by a later branch');
  const relinked = await linked.setLink(owner, id, '185', true, base);
  assert.deepEqual(relinked.workItems.map(entry => [entry.id, entry.how, entry.linkedBy]), [['185', 'explicit', 'ryan']]);
  await assert.rejects(linked.setLink(owner, id, '999', true, base), { status: 404 });
  const ignored = await linked.report(owner, event({ event: 'prompt', workItem: '999' }), base);
  assert.deepEqual(ignored.session.workItems.map(entry => entry.id), ['185'], 'a report naming an unreadable Work Item links nothing');
});

test('a teammate who may read a linked Work Item sees the session without its telemetry; anyone else gets not found', async () => {
  const requests: string[] = [];
  const fetcher = (async (url: string) => { requests.push(String(url)); return new Response(JSON.stringify({ status: 'success', data: { result: [] } })); }) as typeof fetch;
  const linked = service(fakePloeg(), { observability: { metricsUrl: 'http://metrics.local' } }, fetcher);
  const id = '0f6c1c9e-1111-4222-8333-944445555666';
  await linked.report(owner, event({ branch: 'feat/vik-2051-login' }), base);
  const seen = await linked.view(teammate, id, base, true);
  assert.equal(seen.mine, false);
  assert.equal(seen.telemetry, undefined);
  assert.equal(requests.length, 0);
  assert.equal((await linked.forWorkItem(teammate, '184', base)).length, 1);
  await assert.rejects(linked.view(outsider, id, base), { status: 404 });
  await assert.rejects(linked.forWorkItem(outsider, '184', base), { status: 404 });
  assert.ok((await linked.view(owner, id, base, true)).telemetry);
});

test('Agent Trace records are validated as strictly as the hosted schema and counted per contributor', () => {
  const record = parseAgentTrace(trace());
  assert.deepEqual(traceLines(record), { ai: 10, human: 1, mixed: 0, unknown: 0, files: 1 });
  assert.equal(parseAgentTrace(trace({ version: '0.1.0' })).version, '0.1.0');
  const refused = (fields: Record<string, unknown>, path: RegExp) => assert.throws(() => parseAgentTrace(trace(fields)), (error: unknown) => error instanceof AgentTraceError && path.test(error.path));
  refused({ extra: true }, /^record\.extra$/);
  refused({ tool: { name: 'claude-code' } }, /^record\.tool\.version$/);
  refused({ id: 'not-a-uuid' }, /^record\.id$/);
  refused({ files: [{ path: '../etc/passwd', conversations: [] }] }, /^files\[0\]\.path$/);
  refused({ files: [{ path: 'a.ts', conversations: [{ ranges: [{ start_line: 5, end_line: 2 }] }] }] }, /end_line$/);
  refused({ files: [{ path: 'a.ts', conversations: [{ ranges: [], url: 'https://u:p@x.example' }] }] }, /url$/);
  refused({ files: [{ path: 'a.ts', conversations: [{ ranges: [], vendor: 1 }] }] }, /vendor$/);
});

test('a session keeps the Agent Trace of its commits, counts AI lines on the commit, and refuses another person’s trace', async () => {
  const linked = service();
  const id = '0f6c1c9e-1111-4222-8333-944445555666';
  await linked.report(owner, event({ branch: 'feat/vik-2051-login' }), base);
  await linked.report(owner, event({ event: 'commit', commit: { sha, subject: 'fix: login', trailer: true } }), base);
  assert.deepEqual(linked.addTrace(owner, id, trace()), { stored: true, aiLines: 10, files: 1 });
  assert.deepEqual(linked.addTrace(owner, id, trace()), { stored: false, aiLines: 10, files: 1 }, 'the same record twice is stored once');
  assert.throws(() => linked.addTrace(teammate, id, trace()), { status: 404 });
  assert.throws(() => linked.addTrace(owner, id, trace({ id: '650e8400-e29b-41d4-a716-446655440000', vcs: { type: 'git', revision: 'main' } })), { code: 'agent_trace_revision' });
  const shown = await linked.view(owner, id, base);
  assert.equal(shown.aiLines, 10);
  assert.deepEqual(shown.commits.map(entry => [entry.subject, entry.aiLines, entry.files]), [['fix: login', 10, 1]]);
  assert.equal((await linked.traces(teammate, id)).length, 1, 'a reader of a linked Work Item may read its Agent Trace');
  assert.equal((await linked.tracesFor(outsider, sha)).length, 0);
  assert.equal((await linked.tracesFor(teammate, sha)).length, 1);
});

test('telemetry is read by session id from the metrics and log stores, never reads prompt text, and says what it could not read', async () => {
  assert.equal(metricQueries('s"1', '600s').cost, 'sum(max_over_time(claude_code_cost_usage_USD_total{session_id="s\\"1"}[600s]))');
  assert.match(logQueries('abc').events, /^\{service_name="claude-code"\} attributes\.session\.id:="abc" \| stats by \(event_name\) count\(\) hits$/);
  assert.doesNotMatch(Object.values(logQueries('abc')).join(' '), /prompt\b(?!s)|body|user\.email/);
  const seen: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const query = new URLSearchParams(String(init.body)).get('query') ?? '';
    seen.push(query);
    if (String(url).endsWith('/api/v1/query')) {
      const result = query.includes('cost_usage') ? [{ metric: {}, value: [0, '1.23456'] }] : query.includes('token_usage') ? [{ metric: { type: 'input' }, value: [0, '1000'] }, { metric: { type: 'output' }, value: [0, '250'] }, { metric: { type: 'cacheRead' }, value: [0, '9000'] }] : [{ metric: {}, value: [0, '420.4'] }];
      return new Response(JSON.stringify({ status: 'success', data: { result } }));
    }
    if (query.includes('stats by (event_name)')) return new Response('{"event_name":"user_prompt","hits":"7"}\n{"event_name":"tool_result","hits":"40"}\n');
    if (query.includes('tool_name')) return new Response('{"tool_name":"Bash","hits":"20"}\n{"tool_name":"<script>","hits":"1"}\n');
    return new Response('{"attributes.user.account_uuid":"99bd4052-efc1-4c3e-9d1a-000000000000","attributes.organization.id":"33e98669-309f-4b0f-9d1a-000000000000"}\n');
  }) as typeof fetch;
  const observability = { metricsUrl: 'http://vm.local:8429', logsUrl: 'http://vl.local:9428', grafanaUrl: 'https://grafana.example.org', dashboards: { 'claude-code-session': 'cc-session' } };
  const telemetry = await readSessionTelemetry(observability, 'abc', '2026-10-17T09:00:00.000Z', { fetch: fetcher, now: at.getTime() });
  assert.equal(telemetry.available, true);
  assert.equal(telemetry.costUsd, 1.2346);
  assert.equal(telemetry.costStatus, 'estimate');
  assert.deepEqual(telemetry.tokens, { input: 1000, output: 250, cacheRead: 9000, cacheCreation: 0 });
  assert.equal(telemetry.activeSeconds, 420);
  assert.deepEqual(telemetry.events, { prompts: 7, toolResults: 40, apiRequests: 0, apiErrors: 0 });
  assert.deepEqual(telemetry.tools, [{ name: 'Bash', count: 20 }, { name: 'script', count: 1 }]);
  assert.equal(telemetry.account?.uuid, '99bd4052-efc1-4c3e-9d1a-000000000000');
  assert.equal(telemetry.reason, null);
  assert.ok(seen.some(query => query.includes('[4200s]')), 'the metric window covers the session since it started');
  assert.equal(sessionDashboardUrl(observability, 'abc', '2026-10-17T09:00:00.000Z'), 'https://grafana.example.org/d/cc-session?var-session=abc&from=1792227300000&to=now');
  const down = await readSessionTelemetry({ metricsUrl: 'http://vm.local' }, 'abc', at.toISOString(), { fetch: (async () => new Response('nope', { status: 503 })) as typeof fetch, now: at.getTime() });
  assert.equal(down.available, false);
  assert.match(String(down.reason), /metrics store answered 503/);
  assert.match(String(down.reason), /No log store is configured/);
  assert.match(String((await readSessionTelemetry(undefined, 'abc', at.toISOString())).reason), /reads no telemetry store/);
});

test('the API takes hook reports from a signed-in person, lists them as theirs and keeps heartbeats out of the action log', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const { cookie } = await login(app.url);
  const reported = await request(app.url, '/api/linked-sessions/events', { method: 'POST', cookie, body: { harness: 'claude-code', sessionId: 'session-under-test-1', event: 'start', title: 'Try linking', branch: 'main' } });
  assert.equal(reported.status, 200);
  assert.equal(reported.body.session.state, 'idle');
  assert.match(reported.body.context, /session-under-test-1/);
  const listed = await request(app.url, '/api/linked-sessions', { cookie });
  assert.deepEqual(listed.body.sessions.map((session: { id: string; mine: boolean }) => [session.id, session.mine]), [['session-under-test-1', true]]);
  const traced = await request(app.url, '/api/linked-sessions/session-under-test-1/traces', { method: 'POST', cookie, body: trace() });
  assert.equal(traced.status, 201);
  const exported = await fetch(`${app.url}/api/linked-sessions/session-under-test-1/agent-trace`, { headers: { cookie } });
  assert.equal(exported.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(JSON.parse((await exported.text()).trim()).id, '550e8400-e29b-41d4-a716-446655440000');
  const bad = await request(app.url, '/api/linked-sessions/session-under-test-1/traces', { method: 'POST', cookie, body: trace({ id: '750e8400-e29b-41d4-a716-446655440000', extra: 1 }) });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'agent_trace_invalid');
  const actions = await request(app.url, '/api/actions', { cookie });
  assert.equal(actions.body.actions.some((record: { action: string }) => record.action.includes('linked-sessions')), false);
});

test('a commit counts its AI lines per agent from the conversation URLs of its Agent Trace record', async () => {
  const { traceLinesByAgent } = await import('../src/agent-trace.ts');
  const record = parseAgentTrace(trace({ files: [{ path: 'src/a.ts', conversations: [
    { url: `${base}/#linked-session/x`, contributor: { type: 'ai' }, ranges: [{ start_line: 1, end_line: 3 }] },
    { url: `${base}/#linked-session/x?agent=code-reviewer`, contributor: { type: 'ai' }, ranges: [{ start_line: 5, end_line: 14 }, { start_line: 20, end_line: 20, contributor: { type: 'human' } }] },
  ] }] }));
  assert.deepEqual(traceLinesByAgent(record), { main: 3, 'code-reviewer': 10 });
  const linked = service();
  await linked.report(owner, event({ event: 'commit', commit: { sha, subject: 'fix', trailer: false } }), base);
  linked.addTrace(owner, '0f6c1c9e-1111-4222-8333-944445555666', record);
  assert.deepEqual((await linked.view(owner, '0f6c1c9e-1111-4222-8333-944445555666', base)).commits[0].agents, { main: 3, 'code-reviewer': 10 });
});
