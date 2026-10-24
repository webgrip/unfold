import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { admissionTargets, digestFacts, handoffNote, handoffReadiness, repositoryName } from '../src/linked-handoff.ts';
import { digestCostQuery, readSessionsCost } from '../src/linked-telemetry.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { hashPassword } from '../src/auth.ts';
import { application, login, request } from './api-support.ts';

const sha = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
const repository = (key: string, readiness: 'ready' | 'not_ready' | 'unknown' = 'ready', owner = 'example', repo = 'order-service') => ({ key, label: key as string | null, forge: 'forgejo', owner, repo, baseBranch: 'main', readiness, reason: '', lastForgeEventAt: null, boards: [] as string[] });

test('the digest counts the sessions active in the window, the Work Items they touched and their commits and AI lines', () => {
  const since = Date.parse('2026-10-17T00:00:00Z');
  const session = (id: string, startedAt: string, lastSeenAt: string, workItems: string[], commits: { at: string; aiLines: number | null }[]) => ({ id, startedAt, lastSeenAt, workItems: workItems.map(entry => ({ id: entry, how: 'explicit' as const, linkedAt: startedAt, linkedBy: 'ryan' })), commits: commits.map((commit, index) => ({ sha: String(index).repeat(40), subject: '', trailer: true, files: 1, ...commit })) });
  const facts = digestFacts([
    session('session-new-1', '2026-10-20T10:00:00Z', '2026-10-20T12:00:00Z', ['184', '185'], [{ at: '2026-10-20T11:00:00Z', aiLines: 12 }, { at: '2026-10-20T11:30:00Z', aiLines: null }]),
    session('session-old-2', '2026-10-10T10:00:00Z', '2026-10-18T09:00:00Z', ['184'], [{ at: '2026-10-11T10:00:00Z', aiLines: 99 }, { at: '2026-10-18T08:00:00Z', aiLines: 3 }]),
    session('session-gone-3', '2026-10-01T10:00:00Z', '2026-10-02T09:00:00Z', ['300'], [{ at: '2026-10-02T08:00:00Z', aiLines: 50 }]),
  ], since);
  assert.deepEqual(facts, { started: 1, active: 2, workItems: 2, commits: 3, aiLines: 15, ids: ['session-new-1', 'session-old-2'] });
});

test('the digest cost is one PromQL query with a regex matcher over well-formed session ids only', async () => {
  assert.equal(digestCostQuery(['abcd1234-1', 'bad"}|.*', 'abcd1234-2', 'abcd1234-1'], '604800s'), 'sum(max_over_time(claude_code_cost_usage_USD_total{session_id=~"abcd1234-1|abcd1234-2"}[604800s]))');
  assert.equal(digestCostQuery(Array.from({ length: 150 }, (_, index) => `session-${String(index).padStart(4, '0')}`), '1s').split('|').length, 100, 'the matcher names at most 100 sessions');
  const queries: string[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => { queries.push(new URLSearchParams(String(init.body)).get('query') ?? ''); return new Response(JSON.stringify({ status: 'success', data: { result: [{ metric: {}, value: [0, '3.14159'] }] } })); }) as typeof fetch;
  assert.deepEqual(await readSessionsCost({ metricsUrl: 'http://vm.local' }, ['abcd1234-1'], '600s', { fetch: fetcher }), { costUsd: 3.1416, reason: null });
  assert.equal(queries.length, 1);
  assert.deepEqual(await readSessionsCost({ metricsUrl: 'http://vm.local' }, [], '600s', { fetch: fetcher }), { costUsd: 0, reason: null });
  assert.equal(queries.length, 1, 'no sessions, no query');
  assert.match(String((await readSessionsCost(undefined, ['abcd1234-1'], '600s')).reason), /No metrics store/);
  assert.match(String((await readSessionsCost({ metricsUrl: 'http://vm.local' }, ['abcd1234-1'], '600s', { fetch: (async () => new Response('', { status: 502 })) as typeof fetch })).reason), /answered 502/);
});

test('a Work Item can be handed to Ploeg only when it is stopped with no open attempt, and the note carries ids and links only', () => {
  assert.deepEqual(handoffReadiness({ state: 'needs_human', latestShift: { closedAt: '2026-10-20T10:00:00Z' } }), { available: true, reason: '' });
  assert.deepEqual(handoffReadiness({ state: 'stale', latestShift: null }), { available: true, reason: '' });
  assert.match(handoffReadiness({ state: 'awaiting_review', latestShift: { closedAt: null } }).reason, /attempt is still open/);
  assert.match(handoffReadiness({ state: 'leased', latestShift: { closedAt: null } }).reason, /working on it now/);
  assert.match(handoffReadiness({ state: 'done', latestShift: null }).reason, /closed/);
  const note = handoffNote({ branch: 'feat/vik-2051-login', commits: [{ sha, subject: 'fix: login\nnext', at: '', trailer: true, aiLines: 1, files: 1 }], pullRequests: ['https://forgejo.example.org/webgrip/unfold/pulls/9'] }, 'https://unfold.example.org/#linked-session/abcd1234');
  assert.match(note, /own Claude Code session \(https:\/\/unfold\.example\.org\/#linked-session\/abcd1234\)/);
  assert.match(note, /branch: feat\/vik-2051-login\./);
  assert.match(note, /last commit: a1b2c3d4e5f6 \(fix: login next\)/);
  assert.match(note, /pulls\/9/);
  assert.ok(note.length <= 4096);
  assert.match(handoffNote({ branch: '', commits: [], pullRequests: [] }, 'x'), /no branch\. .*no commits\./);
});

test('the session repository preselects the one ready registered target with the same owner and name', () => {
  assert.equal(repositoryName('https://forgejo.example.org/Example/order-service.git'), 'example/order-service');
  assert.equal(repositoryName('forgejo.example.org:example/order-service.git'), 'example/order-service');
  assert.equal(repositoryName(''), '');
  const options = admissionTargets([repository('order-service'), repository('research', 'not_ready', 'example', 'research'), { ...repository('example/other@main'), label: null }], 'https://forgejo.example.org/example/order-service.git');
  assert.deepEqual(options.targets.map(entry => entry.key), ['order-service'], 'not ready and board-only repositories are not offered');
  assert.equal(options.suggested, 'order-service');
  assert.equal(admissionTargets([repository('order-service')], 'git@github.com:someone/else.git').suggested, null);
  assert.equal(admissionTargets([repository('a'), repository('b')], 'https://x/example/order-service').suggested, null, 'two matches preselect neither');
});

async function fakePloeg(t: TestContext) {
  const env = `UNFOLD_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const details = structuredClone(ploegDemo.details) as Record<string, any>;
  details['109'].item.waitingForClient = { reason: 'start_from_claude_code', message: 'Start this from your Claude Code, operator.', actsFor: 'op', handedBy: null, runId: '9001', role: 'implementer', round: 1, writes: true };
  const calls: { method: string; path: string; actor?: string; acting?: string; authorization?: string; worker?: string; body: any }[] = [];
  let recordStatus = 204;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url!, 'http://fixture.invalid');
    calls.push({ method: req.method!, path: url.pathname, actor: req.headers['x-ploeg-actor'] as string, acting: req.headers['x-ploeg-acting-user'] as string, authorization: req.headers.authorization, worker: req.headers['x-ploeg-worker-id'] as string, body: text ? JSON.parse(text) : null });
    const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data as object }));
    const runSession = /^\/api\/v1\/runs\/([^/]+)\/claude-session$/.exec(url.pathname);
    if (runSession) { res.writeHead(recordStatus).end(); return; }
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const path = url.pathname.replace('/api/v1/operator/', '');
    if (path === 'teams') return send(200, { teams: ploegDemo.teams });
    if (path === 'connections') return send(200, { generatedAt: '2026-10-24T10:00:00Z', checkedAt: null, eventWindowDays: 30, repositories: [repository('order-service'), repository('market-research', 'not_ready', 'example', 'market-research')], boards: [] });
    if (path === 'work-items' && req.method === 'POST') return send(201, { workItem: { id: '109', team: 'delivery', state: 'queued', shiftId: null, budgetUsd: 5, poolUsd: null }, created: true, replayed: false });
    let match = /^work-items\/(\d+)\/requeue$/.exec(path);
    if (match) return send(200, { requeue: { workItemId: match[1], team: 'delivery', state: 'queued', fromRound: 1, poolUsd: 5, commandId: JSON.parse(text).commandId, replayed: false } });
    match = /^work-items\/(\d+)\/claim$/.exec(path);
    if (match) {
      if (req.headers['x-ploeg-actor'] !== 'op') return res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'not_your_run', message: 'no' } }));
      return send(200, { run: { id: '9001', workItemId: match[1], shiftId: '12', team: 'delivery', role: 'implementer', round: 1, writes: true, actsFor: 'op' }, dispatch: { environmentId: 'ccpool_team', ref: 'main', branch: 'claude/vik-9', baseBranch: 'main', repository: { forge: 'forgejo', owner: 'example', repo: 'order-service' }, title: 'Fix rounding', reference: 'VIK-9', prompt: 'Do the work.' }, credential: { runToken: 'run-token-secret', controlToken: 'control-token-secret', workerId: 'client:op', deadline: '2026-10-24T11:00:00Z' } });
    }
    match = /^work-items\/(\d+)$/.exec(path);
    if (match && details[match[1]]) return send(200, details[match[1]]);
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, calls, details, setRecordStatus(status: number) { recordStatus = status; } };
}

async function people(t: TestContext) {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = { ...ploeg.config, userTeams: { op: ['delivery'], other: ['delivery'], watcher: ['delivery'] } }; });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  for (const [id, role] of [['op', 'operator'], ['other', 'operator'], ['watcher', 'viewer']] as const) server.app.store.addUser({ id, name: id, role, passwordHash: await hashPassword(password) });
  return { ploeg, server, op: await login(server.url, 'op', password), other: await login(server.url, 'other', password), watcher: await login(server.url, 'watcher', password) };
}

const report = (url: string, cookie: string, fields: Record<string, unknown>) => request(url, '/api/linked-sessions/events', { method: 'POST', cookie, body: { harness: 'claude-code', sessionId: 'session-handoff-1', event: 'start', title: 'Fix rounding', repository: 'https://forgejo.example.org/example/order-service.git', branch: 'feat/rounding', ...fields } });

test('the owner starts a Work Item from their session: Ploeg admits it as them, the session links to it, and the action is recorded', async t => {
  const { ploeg, server, op, other } = await people(t);
  await report(server.url, op.cookie, {});
  const options = await request(server.url, '/api/linked-sessions/session-handoff-1/start-options', op);
  assert.equal(options.status, 200, options.text);
  assert.deepEqual(options.body.teams, ['delivery']);
  assert.deepEqual(options.body.targets.map((entry: { key: string }) => entry.key), ['order-service']);
  assert.equal(options.body.suggested, 'order-service');
  assert.equal((await request(server.url, '/api/linked-sessions/session-handoff-1/start-options', other)).status, 404, 'only the owner starts work from a session');
  const bad = await request(server.url, '/api/linked-sessions/session-handoff-1/work-items', { method: 'POST', cookie: op.cookie, body: { team: 'delivery', target: 'order-service', title: '', brief: 'x' } });
  assert.equal(bad.body.error.code, 'start_input');
  const started = await request(server.url, '/api/linked-sessions/session-handoff-1/work-items', { method: 'POST', cookie: op.cookie, body: { team: 'delivery', target: 'order-service', title: 'Round half up', brief: 'Make totals round half up.', requestId: 'unfold-linked-test-1' } });
  assert.equal(started.status, 201, started.text);
  assert.equal(started.body.workItem.id, '109');
  assert.equal(started.body.linkError, '');
  assert.deepEqual(started.body.session.workItems.map((entry: { id: string; how: string }) => [entry.id, entry.how]), [['109', 'explicit']]);
  const admitted = ploeg.calls.find(call => call.method === 'POST' && call.path === '/api/v1/operator/work-items')!;
  assert.deepEqual(admitted.body, { requestId: 'unfold-linked-test-1', team: 'delivery', target: 'order-service', title: 'Round half up', description: 'Make totals round half up.' });
  assert.equal(admitted.actor, 'op');
  const actions = await request(server.url, '/api/actions', op);
  assert.ok(actions.body.actions.some((record: { action: string; outcome: string }) => /^POST \/api\/linked-sessions\/[^/]+\/work-items$/.test(record.action) && record.outcome === 'done'), JSON.stringify(actions.body.actions.map((record: { action: string }) => record.action)));
});

test('"Let Ploeg finish this" requeues a stopped linked Work Item with a note on the session, and explains why it cannot otherwise', async t => {
  const { ploeg, server, op, other } = await people(t);
  await report(server.url, op.cookie, { event: 'commit', commit: { sha, subject: 'wip: rounding', trailer: true }, pullRequests: ['https://forgejo.example.org/example/order-service/pulls/4'] });
  for (const id of ['101', '102']) assert.equal((await request(server.url, `/api/linked-sessions/session-handoff-1/work-items/${id}`, { method: 'PUT', cookie: op.cookie, body: {} })).status, 200);
  const readiness = await request(server.url, '/api/linked-sessions/session-handoff-1/handoff', op);
  assert.deepEqual(readiness.body.workItems.map((entry: { id: string; available: boolean }) => [entry.id, entry.available]), [['101', true], ['102', false]]);
  assert.match(readiness.body.workItems[1].reason, /working on it now/);
  const refused = await request(server.url, '/api/linked-sessions/session-handoff-1/work-items/102/handoff', { method: 'POST', cookie: op.cookie, body: {} });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'handoff_unavailable');
  assert.equal((await request(server.url, '/api/linked-sessions/session-handoff-1/work-items/105/handoff', { method: 'POST', cookie: op.cookie, body: {} })).body.error.code, 'handoff_not_linked');
  assert.equal((await request(server.url, '/api/linked-sessions/session-handoff-1/work-items/101/handoff', { method: 'POST', cookie: other.cookie, body: {} })).status, 404);
  const handed = await request(server.url, '/api/linked-sessions/session-handoff-1/work-items/101/handoff', { method: 'POST', cookie: op.cookie, body: { commandId: 'unfold-handoff-test' } });
  assert.equal(handed.status, 200, handed.text);
  const requeue = ploeg.calls.find(call => call.path === '/api/v1/operator/work-items/101/requeue')!;
  assert.equal(requeue.body.commandId, 'unfold-handoff-test');
  assert.equal(requeue.body.expectedState, 'needs_human');
  assert.match(requeue.body.note, /branch: feat\/rounding\. .*last commit: a1b2c3d4e5f6 \(wip: rounding\)\. .*pulls\/4/);
  assert.equal(ploeg.calls.some(call => call.path.endsWith('/notes')), false, 'a stopped Work Item takes its note with the requeue, not on the notes route');
  const after = await request(server.url, '/api/linked-sessions/session-handoff-1', op);
  assert.deepEqual(after.body.session.handovers.map((entry: { kind: string; workItemId: string; at: string }) => [entry.kind, entry.workItemId, typeof entry.at]), [['handoff', '101', 'string']], 'the session remembers it handed the Work Item over');
});

test('a Run that waits for the person is claimed through Unfold, which keeps the Run credential and records the dispatched session with it', async t => {
  const { ploeg, server, op, other, watcher } = await people(t);
  const detail = await request(server.url, '/api/ploeg/work-items/109', op);
  assert.equal(detail.body.item.waitingForClient.reason, 'start_from_claude_code');
  assert.equal((await request(server.url, '/api/ploeg/work-items/109/claim', { method: 'POST', cookie: watcher.cookie, body: {} })).status, 403);
  const notYours = await request(server.url, '/api/ploeg/work-items/109/claim', { method: 'POST', cookie: other.cookie, body: {} });
  assert.equal(notYours.status, 403);
  assert.equal(notYours.body.error.code, 'not_your_run');
  await report(server.url, op.cookie, { sessionId: 'session-claim-1', title: '' });
  await report(server.url, other.cookie, { sessionId: 'session-other-1', title: '' });
  const claimed = await request(server.url, '/api/ploeg/work-items/109/claim', { method: 'POST', cookie: op.cookie, body: { linkedSession: 'session-claim-1' } });
  assert.equal(claimed.status, 200, claimed.text);
  const claimer = (await request(server.url, '/api/linked-sessions/session-claim-1', op)).body.session;
  assert.deepEqual(claimer.workItems.map((entry: { id: string; how: string }) => [entry.id, entry.how]), [['109', 'explicit']], 'the session that ran /unfold:start is linked to the Work Item');
  assert.deepEqual(claimer.handovers.map((entry: { kind: string; workItemId: string; runId: string }) => [entry.kind, entry.workItemId, entry.runId]), [['claim', '109', '9001']]);
  await request(server.url, '/api/ploeg/work-items/109/claim', { method: 'POST', cookie: op.cookie, body: { linkedSession: 'session-other-1' } });
  const untouched = (await request(server.url, '/api/linked-sessions/session-other-1', other)).body.session;
  assert.deepEqual([untouched.workItems, untouched.handovers ?? []], [[], []], 'a claim never marks someone else’s session');
  assert.equal(claimed.body.dispatch.environmentId, 'ccpool_team');
  assert.doesNotMatch(claimed.text, /run-token-secret|control-token-secret/, 'the Run credential stays in Unfold');
  assert.equal((await request(server.url, '/api/ploeg/work-items/109/claude-session', { method: 'POST', cookie: other.cookie, body: { runId: '9001', sessionId: 'session_01abcdef' } })).status, 404, 'only the claimer records the session');
  assert.equal((await request(server.url, '/api/ploeg/work-items/109/claude-session', { method: 'POST', cookie: op.cookie, body: { runId: '9001', sessionId: 'nope' } })).body.error.code, 'claude_session_id');
  const recorded = await request(server.url, '/api/ploeg/work-items/109/claude-session', { method: 'POST', cookie: op.cookie, body: { runId: '9001', sessionId: 'session_01abcdef' } });
  assert.equal(recorded.status, 200, recorded.text);
  const call = ploeg.calls.find(entry => entry.path === '/api/v1/runs/run-token-secret/claude-session')!;
  assert.equal(call.authorization, 'Bearer control-token-secret');
  assert.equal(call.worker, 'client:op');
  assert.deepEqual(call.body, { environmentId: 'ccpool_team', sessionId: 'session_01abcdef', baseBranch: 'main', title: 'Fix rounding', reference: 'VIK-9' });
  assert.equal((await request(server.url, '/api/ploeg/work-items/109/claude-session', { method: 'POST', cookie: op.cookie, body: { runId: '9001', sessionId: 'session_01abcdef' } })).status, 404, 'a recorded claim is forgotten');
  await request(server.url, '/api/ploeg/work-items/109/claim', { method: 'POST', cookie: op.cookie, body: {} });
  ploeg.setRecordStatus(404);
  const lapsed = await request(server.url, '/api/ploeg/work-items/109/claude-session', { method: 'POST', cookie: op.cookie, body: { runId: '9001', sessionId: 'session_01abcdef' } });
  assert.equal(lapsed.body.error.code, 'run_not_running');
});

test('the digest route answers the signed-in person’s own counts, and the Work Item list attaches telemetry only to sessions the viewer may see', async t => {
  const { server, op, other } = await people(t);
  await report(server.url, op.cookie, { event: 'commit', commit: { sha, subject: 'x', trailer: true } });
  await request(server.url, '/api/linked-sessions/session-handoff-1/work-items/101', { method: 'PUT', cookie: op.cookie, body: {} });
  const digest = await request(server.url, '/api/linked-sessions/digest?window=30d', op);
  assert.equal(digest.status, 200, digest.text);
  assert.deepEqual([digest.body.digest.window, digest.body.digest.active, digest.body.digest.started, digest.body.digest.workItems, digest.body.digest.commits], ['30d', 1, 1, 1, 1]);
  assert.equal(digest.body.digest.costUsd, null);
  assert.match(digest.body.digest.costReason, /No metrics store/);
  assert.equal((await request(server.url, '/api/linked-sessions/digest', other)).body.digest.active, 0, 'a digest counts only your own sessions');
  assert.equal((await request(server.url, '/api/linked-sessions/digest?window=1y', op)).body.error.code, 'digest_window');
  const mine = await request(server.url, '/api/linked-sessions?workItemId=101&telemetry=1', op);
  assert.ok(mine.body.sessions[0].telemetry, 'the owner sees their session’s telemetry');
  const theirs = await request(server.url, '/api/linked-sessions?workItemId=101&telemetry=1', other);
  assert.equal(theirs.body.sessions[0].telemetry, undefined, 'a teammate sees the session without its cost');
});
