import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { PloegClient, type PloegItem } from '../src/ploeg.ts';
import { money } from '../public/core/format.js';
import { noAgentMessages, noRunMessages, ploegRunToolName, workItemActivity, workItemRefusals } from '../src/ahp/work-items.ts';
import { application, login, request } from './api-support.ts';
import { action, connect, defaultChatOf, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';

const password = 'work-items-password-161803';
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);
const runTemplate = ploegDemo.details['102'].runs[0];
const itemTemplate = ploegDemo.details['102'].item;

type Shape = { team?: string; state: PloegItem['state']; updated?: string; closeReason?: string; branch?: string; round?: number; spent?: number; pullRequest?: number; runs?: Array<{ id: string; role: string; round: number; state?: 'pending' | 'running' | 'finished'; outcome?: string; summary?: string; writes?: boolean }>; attempts?: number };

function workItem(id: string, shape: Shape): Json {
  const team = shape.team ?? 'delivery';
  const shiftId = `9${id}`;
  const runs = (shape.runs ?? []).map(run => ({ ...structuredClone(runTemplate), id: run.id, workItemId: id, shiftId, team, role: run.role, round: run.round, writes: run.writes ?? run.role === 'implementer', state: run.state ?? 'finished', startedAt: minutesAgo(60 - Number(run.id) % 50), finishedAt: (run.state ?? 'finished') === 'finished' ? minutesAgo(59 - Number(run.id) % 50) : null, outcome: (run.state ?? 'finished') === 'finished' ? run.outcome ?? 'pr_opened' : null, summary: run.summary ?? '', verdict: run.role === 'reviewer' ? 'approve' : '', failureReason: null, stuckReason: '' }));
  const hasShift = shape.branch !== undefined || runs.length > 0 || shape.closeReason !== undefined || shape.state === 'leased';
  const shift = hasShift ? { id: shiftId, workItemId: id, team, branch: shape.branch ?? `agent/${id}`, round: shape.round ?? Math.max(1, ...runs.map(run => run.round)), budgetUsd: 3, spentUsd: shape.spent ?? 0, reservedUsd: 0, openedAt: minutesAgo(90), closedAt: shape.state === 'leased' ? null : minutesAgo(30), closeReason: shape.closeReason ?? '' } : null;
  const item = { ...structuredClone(itemTemplate), id, team, state: shape.state, title: `Work Item ${id}`, externalId: `T-${id}`, attempts: shape.attempts ?? 1, createdAt: minutesAgo(120), updatedAt: shape.updated ?? minutesAgo(Number(id) % 100), latestShift: shift, lease: null, ...(shape.pullRequest ? { pullRequest: { url: `https://forge.invalid/pulls/${shape.pullRequest}`, number: shape.pullRequest, mergeState: 'clean', baseBranch: 'main', headSha: 'abc', checkedAt: minutesAgo(5) } } : {}) };
  return { item, shifts: shift ? [shift] : [], runs: runs.reverse(), checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false } };
}

function world() {
  const details = new Map<string, Json>([
    ['201', workItem('201', { state: 'queued', updated: minutesAgo(50) })],
    ['202', workItem('202', { state: 'leased', spent: 0.5, updated: minutesAgo(2), runs: [{ id: '301', role: 'implementer', round: 1, state: 'running' }] })],
    ['203', workItem('203', { state: 'proposed', updated: minutesAgo(40) })],
    ['204', workItem('204', { state: 'needs_human', closeReason: 'run stuck: implementer round 1', updated: minutesAgo(30), runs: [{ id: '302', role: 'implementer', round: 1, outcome: 'stuck' }] })],
    ['205', workItem('205', { state: 'awaiting_review', pullRequest: 42, updated: minutesAgo(10), runs: [{ id: '303', role: 'implementer', round: 1, summary: 'Rounded half up in the order totals.' }, { id: '304', role: 'reviewer', round: 2, summary: 'The change is correct.' }] })],
    ['206', workItem('206', { state: 'stale', attempts: 5, updated: minutesAgo(20) })],
    ['207', workItem('207', { state: 'done', pullRequest: 41, updated: daysAgo(2) })],
    ['208', workItem('208', { state: 'withdrawn', closeReason: 'withdrawn_by_operator', updated: daysAgo(3) })],
    ['209', workItem('209', { team: 'research', state: 'leased', updated: minutesAgo(1), runs: [{ id: '305', role: 'analyst', round: 1, state: 'running' }] })],
    ['210', workItem('210', { state: 'leased', branch: 'operator/session-1', updated: minutesAgo(3), runs: [{ id: '306', role: 'operator', round: 1, state: 'running' }] })],
    ['211', workItem('211', { state: 'done', pullRequest: 40, updated: daysAgo(20) })],
  ]);
  const events: Json[] = [
    { id: '1001', at: daysAgo(20), actor: 'ploegd:merge', action: 'work_item.done', workItemId: '211', team: 'delivery', detail: {} },
    { id: '1002', at: daysAgo(3), actor: 'operator:unfold:op-1', action: 'work_item.withdrawn', workItemId: '208', team: 'delivery', detail: {} },
    { id: '1003', at: daysAgo(2), actor: 'ploegd:merge', action: 'work_item.done', workItemId: '207', team: 'delivery', detail: {} },
  ];
  return { details, events, down: false, seen: [] as string[] };
}

type World = ReturnType<typeof world>;

async function ploegServer(t: TestContext, bearer: string, state: World): Promise<string> {
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    state.seen.push(`${url.pathname.replace('/api/v1/operator/', '')}${url.search}`);
    const send = (value: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...value as object }));
    if (req.headers.authorization !== `Bearer ${bearer}` || req.method !== 'GET') return send({}, 401);
    if (state.down) return send({ error: 'unavailable' }, 503);
    const path = url.pathname.replace('/api/v1/operator/', '');
    if (path === 'teams') return send({ teams: ploegDemo.teams });
    if (path === 'work-items') {
      const after = BigInt(url.searchParams.get('after') || '0');
      const limit = Number(url.searchParams.get('limit') || 50);
      const items = [...state.details.values()].map(detail => detail.item).filter(item => item.team === url.searchParams.get('team') && (!url.searchParams.has('state') || item.state === url.searchParams.get('state')) && BigInt(item.id) > after).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      return send({ items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null });
    }
    const detail = /^work-items\/([0-9]+)$/.exec(path);
    if (detail) return state.details.has(detail[1]) ? send(state.details.get(detail[1])) : send({}, 404);
    if (path === 'events') {
      const limit = Number(url.searchParams.get('limit') || 50);
      const sorted = [...state.events].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      if (url.searchParams.get('order') === 'desc') {
        const before = url.searchParams.get('before');
        const page = sorted.reverse().filter(event => !before || BigInt(event.id) < BigInt(before));
        const events = page.slice(0, limit);
        return send({ events, nextCursor: page.length > limit ? events.at(-1)!.id : null, lastCursor: events[0]?.id ?? '0', hasMore: page.length > limit, consistency: 'snapshot' });
      }
      const after = url.searchParams.get('after') ?? '0';
      const page = sorted.filter(event => BigInt(event.id) > BigInt(after));
      const events = page.slice(0, limit);
      return send({ events, nextCursor: page.length > limit ? events.at(-1)!.id : null, lastCursor: events.at(-1)?.id ?? after, hasMore: page.length > limit, consistency: 'snapshot' });
    }
    return send({}, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function fixture(t: TestContext) {
  const env = `UNFOLD_WORK_ITEMS_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  t.after(() => { delete process.env[env]; });
  const state = world();
  const ploeg = await ploegServer(t, bearer, state);
  const server = await application('live', config => { config.ploeg = { url: ploeg, tokenEnv: env, userTeams: { 'op-1': ['delivery'] } }; });
  t.after(() => server.close());
  const host = server.app.agentHost;
  host.workItems.pollMs = 3_600_000;
  host.workItems.reconcileMs = 3_600_000;
  server.app.store.addUser({ id: 'op-1', name: 'op-1', role: 'operator', passwordHash: await hashPassword(password) });
  server.app.store.addUser({ id: 'viewer-1', name: 'viewer-1', role: 'viewer', passwordHash: await hashPassword(password) });
  const unfoldSession = server.app.engine.create({ title: 'An Unfold session', objective: 'Fix the order rounding regression.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', budgetUsd: 1 }, { id: 'op-1', name: 'op-1', role: 'operator' });
  const attach = async (name: 'op-1' | 'viewer-1' | 'admin') => {
    const token = name === 'admin'
      ? (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: (await login(server.url)).cookie, body: { label: 'work items' } })).body.token
      : name === 'viewer-1' ? host.issueToken({ id: 'viewer-1', name: 'viewer-1', role: 'viewer' }) : (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: (await login(server.url, name, password)).cookie, body: { label: 'work items' } })).body.token;
    const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${token}`);
    t.after(() => client.close());
    await client.open;
    await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: `${name}-${randomBytes(3).toString('hex')}`, clientInfo: { name: 'vscode-agents-window' }, initialSubscriptions: ['ahp-root://'] });
    return client;
  };
  const listed = async (client: Awaited<ReturnType<typeof attach>>) => (await client.rpc('listSessions', {})).items as Json[];
  return { server, host, state, attach, listed, unfoldSession };
}

const settled = (...clients: Array<{ rpc(method: string, params: Json): Promise<Json> }>) => Promise.all(clients.map(client => client.rpc('ping', {})));
const workItemsOf = (items: Json[]) => items.filter(item => /^unfold:\/wi-/.test(item.resource));

test('every Ploeg state maps to the Agents window status and activity of ADR 0023', () => {
  const item = (id: string) => world().details.get(id)!.item as PloegItem;
  const runs = world().details.get('202')!.runs;
  const cases: Array<[string, string, string, unknown?]> = [
    ['201', 'idle', 'Queued for delivery'],
    ['202', 'inProgress', `Implementer · Round 1 · ${money(0.5)}/${money(3)}`, runs],
    ['203', 'inputNeeded', 'Waiting for approval'],
    ['204', 'inputNeeded', 'Agent is stuck'],
    ['205', 'inputNeeded', 'Ready for review · PR #42'],
    ['206', 'error', ''],
    ['207', 'idle', 'Merged'],
    ['208', 'idle', 'An operator cancelled it'],
  ];
  for (const [id, status, activity, extra] of cases) {
    const mapped = workItemActivity(item(id), (extra as PloegItem[] | undefined) as never);
    assert.equal(mapped.status, status, `Work Item ${id} (${item(id).state})`);
    if (activity) assert.equal(mapped.activity, activity, `Work Item ${id}`);
  }
  assert.ok(workItemActivity(item('204')).reason?.chip, 'a needs-human stop carries its reason chip');
  assert.ok(workItemActivity(item('206')).reason, 'a stale item carries why');
  assert.equal(workItemActivity({ ...item('201'), state: 'ingested' }).activity, 'Queued for delivery');
  assert.equal(workItemActivity({ ...item('205'), pullRequest: undefined }).activity, 'Ready for review', 'no PR number Ploeg did not report');
  assert.equal(workItemActivity({ ...item('207'), pullRequest: undefined }).activity, 'Done', 'done without a pull request is not called merged');
});

test('a viewer lists the open and recently finished Work Items of their teams, open first, beside their Unfold sessions', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const op = await f.attach('op-1');
  const items = await f.listed(op);
  assert.ok(items.some(item => item.title === 'An Unfold session'), 'Unfold sessions still list');
  const work = workItemsOf(items);
  assert.deepEqual(work.map(item => item.resource), ['unfold:/wi-202', 'unfold:/wi-205', 'unfold:/wi-206', 'unfold:/wi-204', 'unfold:/wi-203', 'unfold:/wi-201', 'unfold:/wi-207', 'unfold:/wi-208'],
    'open by last change, then finished in the last 14 days; no research item, no operator-owned item, nothing finished 20 days ago');
  const byId = new Map(work.map(item => [item.resource.slice('unfold:/'.length), item]));
  assert.equal(byId.get('wi-205')!.title, '#205 Work Item 205');
  assert.equal(byId.get('wi-205')!.provider, 'unfold');
  assert.equal(byId.get('wi-205')!.status & 24, 24, 'awaiting review needs the person');
  assert.equal(byId.get('wi-205')!.activity, 'Ready for review · PR #42');
  assert.equal(byId.get('wi-202')!.status & 8, 8);
  assert.equal(byId.get('wi-206')!.status & 2, 2);
  assert.equal(byId.get('wi-201')!.status & 1, 1);
  assert.deepEqual(byId.get('wi-205')!._meta['unfold.workItem'].pullRequest, { url: 'https://forge.invalid/pulls/42', number: 42 });
  assert.equal(byId.get('wi-205')!._meta['unfold.workItem'].readOnly, true);

  const admin = await f.attach('admin');
  assert.ok(workItemsOf(await f.listed(admin)).some(item => item.resource === 'unfold:/wi-209'), 'an administrator sees every team');
  const viewer = await f.attach('viewer-1');
  assert.deepEqual(workItemsOf(await f.listed(viewer)), [], 'a viewer without a Ploeg team sees no Work Item');
  await assert.rejects(op.rpc('subscribe', { channel: 'unfold:/wi-209' }), (error: Json) => error.code === -32001, 'another team\'s Work Item is not found');
  await assert.rejects(viewer.rpc('subscribe', { channel: 'unfold:/wi-205' }), (error: Json) => error.code === -32001);
  await assert.rejects(op.rpc('subscribe', { channel: 'unfold:/wi-210' }), (error: Json) => error.code === -32001, 'an operator-owned Work Item is its Unfold session');
});

test('a Work Item\'s chat is one turn per Round with each Run a ploeg_run subagent, and no message Ploeg did not record', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const op = await f.attach('op-1');
  const session = (await op.rpc('subscribe', { channel: 'unfold:/wi-205' })).snapshot.state;
  assert.equal(session.defaultChat, defaultChatOf('unfold:/wi-205'));
  assert.deepEqual(session.inputNeeded, []);
  assert.equal(session.changesets, undefined);
  assert.equal(session.chats.length, 3, 'the default chat and one read-only chat per Run');
  const chat = (await op.rpc('subscribe', { channel: session.defaultChat })).snapshot.state;
  assert.equal(chat.activeTurn, undefined);
  assert.deepEqual(chat.turns.map((turn: Json) => turn.message.text), ['Round 1', 'Round 2']);
  assert.ok(chat.turns.every((turn: Json) => turn.message.origin.kind === 'systemNotification' && turn.state === 'complete'));
  const parts = chat.turns.flatMap((turn: Json) => turn.responseParts);
  assert.deepEqual(parts.filter((part: Json) => part.kind === 'toolCall').map((part: Json) => [part.toolCall.toolName, part.toolCall.displayName, part.toolCall.status, part.toolCall._meta.toolKind]), [[ploegRunToolName, 'Implementer', 'completed', 'subagent'], [ploegRunToolName, 'Reviewer', 'completed', 'subagent']]);
  assert.ok(!parts.some((part: Json) => part.kind === 'markdown'), 'no agent message is invented in the session chat');
  assert.deepEqual(parts.filter((part: Json) => part.kind === 'systemNotification').map((part: Json) => part.content), [noAgentMessages]);
  const reviewer = parts.find((part: Json) => part.kind === 'toolCall' && part.toolCall.displayName === 'Reviewer').toolCall;
  assert.equal(reviewer.pastTenseMessage, 'Reviewer approved');
  assert.deepEqual(reviewer.content[1], { type: 'text', text: 'The change is correct.' });
  const runChat = (await op.rpc('subscribe', { channel: reviewer.content[0].resource })).snapshot.state;
  assert.equal(runChat.interactivity, 'read-only');
  assert.equal(runChat.turns[0].responseParts[0].content, noRunMessages);
  assert.match(runChat.turns[0].responseParts[1].content, /The change is correct\./);
});

test('the fleet poller follows Ploeg\'s events in order from its cursor and tells only the viewers of the Work Item\'s team', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const admin = await f.attach('admin');
  const op = await f.attach('op-1');
  const viewer = await f.attach('viewer-1');
  await f.listed(op); await f.listed(admin); await f.listed(viewer);
  await op.rpc('subscribe', { channel: defaultChatOf('unfold:/wi-202') });
  await f.host.workItems.tick();
  assert.equal(f.host.workItems.eventCursor, '1003', 'seeded at the newest event');

  f.state.details.set('201', workItem('201', { state: 'leased', updated: minutesAgo(0), runs: [{ id: '310', role: 'implementer', round: 1, state: 'running' }] }));
  f.state.details.set('202', workItem('202', { state: 'leased', spent: 1.25, updated: minutesAgo(0), runs: [{ id: '301', role: 'implementer', round: 1 }, { id: '311', role: 'reviewer', round: 2, state: 'running' }] }));
  f.state.details.set('209', workItem('209', { team: 'research', state: 'awaiting_review', pullRequest: 7, updated: minutesAgo(0), runs: [{ id: '305', role: 'analyst', round: 1 }] }));
  f.state.events.push(
    { id: '1004', at: minutesAgo(0), actor: 'ploegd:dispatch', action: 'lease.granted', workItemId: '201', team: 'delivery', detail: {} },
    { id: '1005', at: minutesAgo(0), actor: 'team:delivery', action: 'run.finished', workItemId: '202', team: 'delivery', detail: {} },
    { id: '1006', at: minutesAgo(0), actor: 'team:research', action: 'work_item.awaiting_review', workItemId: '209', team: 'research', detail: {} },
  );
  await f.host.workItems.tick();
  await settled(op, admin, viewer);
  assert.ok(f.state.seen.includes('events?order=asc&limit=200&after=1003'), `follows ascending from the cursor; saw ${f.state.seen.filter(path => path.startsWith('events')).join(', ')}`);
  assert.equal(f.host.workItems.eventCursor, '1006');
  const changes = op.inbox.filter(message => message.method === 'root/sessionSummaryChanged').map(message => message.params.session);
  assert.deepEqual(changes, ['unfold:/wi-201', 'unfold:/wi-202'], 'in the order of their events, and nothing of the research team');
  const leased = op.inbox.find(message => message.method === 'root/sessionSummaryChanged' && message.params.session === 'unfold:/wi-201')!.params.changes;
  assert.equal(leased.status & 8, 8);
  assert.equal(leased.activity, `Implementer · Round 1 · ${money(0)}/${money(3)}`);
  const chat = defaultChatOf('unfold:/wi-202');
  const completed = await op.until(message => action(message, chat, 'chat/toolCallComplete'));
  assert.equal(completed.params.action.toolCallId, 'ploeg-run-301');
  await op.until(message => action(message, chat, 'chat/turnComplete'));
  const started = await op.until(message => action(message, chat, 'chat/turnStarted'));
  assert.equal(started.params.action.message.text, 'Round 2');
  const order = op.inbox.filter(message => message.method === 'action' && message.params.channel === chat).map(message => message.params.action.type);
  assert.ok(order.indexOf('chat/turnComplete') < order.indexOf('chat/turnStarted'), 'Round 1 ends before Round 2 starts');

  assert.ok(admin.inbox.some(message => message.method === 'root/sessionSummaryChanged' && message.params.session === 'unfold:/wi-209'), 'the administrator sees the research item change');
  assert.ok(!viewer.inbox.some(message => /wi-/.test(JSON.stringify(message.params ?? {}))), 'a viewer without a team hears of no Work Item');
  assert.ok(!op.inbox.some(message => /wi-209/.test(JSON.stringify(message.params ?? {}))), 'op-1 never hears of the research item');

  f.state.down = true;
  await f.host.workItems.tick();
  f.state.events.push({ id: '1007', at: minutesAgo(0), actor: 'ploegd:dispatch', action: 'work_item.queued', workItemId: '203', team: 'delivery', detail: {} });
  f.state.details.set('203', workItem('203', { state: 'queued', updated: minutesAgo(0) }));
  f.state.down = false;
  f.state.seen.length = 0;
  await f.host.workItems.tick();
  await settled(op);
  assert.equal(f.state.seen.find(path => path.startsWith('events')), 'events?order=asc&limit=200&after=1006', 'resumes from its cursor after an outage, without seeding again');
  assert.equal(f.host.workItems.eventCursor, '1007');
  assert.ok(op.inbox.some(message => message.method === 'root/sessionSummaryChanged' && message.params.session === 'unfold:/wi-203' && message.params.changes.activity === 'Queued for delivery'));
});

test('Ploeg events page oldest first from an after cursor, scoped to the caller\'s teams', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  f.state.events.push({ id: '1004', at: minutesAgo(0), actor: 'team:research', action: 'run.started', workItemId: '209', team: 'research', detail: {} });
  const ploeg = new PloegClient(f.server.config);
  const page = await ploeg.events({ id: 'op-1', name: 'op-1', role: 'operator' }, { after: '1001' });
  assert.deepEqual(page.events.map(event => event.id), ['1002', '1003'], 'ascending, and the research event is not op-1\'s');
  assert.equal(page.nextCursor, null);
  assert.ok(f.state.seen.includes('events?order=asc&limit=25&after=1001'));
  await assert.rejects(ploeg.events({ id: 'admin', name: 'admin', role: 'admin' }, { after: '1001', before: '1003' }), /valid page cursor/);
  assert.deepEqual((await ploeg.followEvents('1002')).events.map(event => event.id), ['1003', '1004'], 'the fleet follows every team in the consumer\'s scope');
});

test('a Ploeg outage marks Work Item sessions stale while Unfold sessions keep listing', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const op = await f.attach('op-1');
  assert.equal(workItemsOf(await f.listed(op)).length, 8);
  await f.host.workItems.tick();
  f.state.down = true;
  await f.host.workItems.tick();
  await settled(op);
  const stale = op.inbox.filter(message => message.method === 'root/sessionSummaryChanged' && /wi-/.test(message.params.session));
  assert.equal(stale.length, 8, 'each Work Item session is marked');
  assert.ok(stale.every(message => /^Ploeg is unreachable; last known state: /.test(message.params.changes.activity)));
  const items = await f.listed(op);
  assert.ok(items.some(item => item.title === 'An Unfold session'), 'Unfold sessions list');
  assert.equal(workItemsOf(items).length, 8);
  assert.ok(workItemsOf(items).every(item => item._meta['unfold.workItem'].stale === true));
  const subscribed = (await op.rpc('subscribe', { channel: 'ahp-session:/' + f.unfoldSession.id })).snapshot.state;
  assert.equal(subscribed.title, 'An Unfold session', 'an Unfold session still opens');

  f.state.down = false;
  op.inbox.length = 0;
  await f.host.workItems.tick();
  await settled(op);
  const recovered = op.inbox.filter(message => message.method === 'root/sessionSummaryChanged' && /wi-/.test(message.params.session));
  assert.equal(recovered.length, 8, 'recovery reads every list again');
  assert.ok(recovered.every(message => !/unreachable/.test(message.params.changes.activity)));
});

test('every change to a Work Item session is refused with what to do instead, and read and archive stay with the viewer', { timeout: testTimeout(20_000) }, async t => {
  const f = await fixture(t);
  const op = await f.attach('op-1');
  const admin = await f.attach('admin');
  await f.listed(op); await f.listed(admin);
  const session = 'unfold:/wi-202';
  const chat = defaultChatOf(session);
  await op.rpc('subscribe', { channel: session });
  await op.rpc('subscribe', { channel: chat });
  const dispatch = (channel: string, clientSeq: number, body: Json) => op.notify('dispatchAction', { channel, clientSeq, action: body });
  const answer = (seq: number) => op.until(message => message.method === 'action' && message.params.origin?.clientSeq === seq);
  dispatch(chat, 1, { type: 'chat/turnStarted', turnId: 't1', message: { text: 'Use the other rounding mode', origin: { kind: 'user' } } });
  dispatch(chat, 2, { type: 'chat/pendingMessageSet', kind: 'steering', id: 'p1', message: { text: 'Hurry', origin: { kind: 'user' } } });
  dispatch(chat, 3, { type: 'chat/turnCancelled', turnId: 'wi-202-round-1-1' });
  dispatch(chat, 4, { type: 'chat/turnResume', turnId: 'wi-202-round-1-1' });
  dispatch(session, 5, { type: 'session/titleChanged', title: 'Renamed' });
  dispatch(chat, 6, { type: 'chat/truncated', turnId: 'wi-202-round-1-1' });
  assert.equal((await answer(1)).params.rejectionReason, workItemRefusals.message);
  assert.equal((await answer(2)).params.rejectionReason, workItemRefusals.message);
  assert.equal((await answer(3)).params.rejectionReason, workItemRefusals.stop);
  assert.equal((await answer(4)).params.rejectionReason, workItemRefusals.tryAgain);
  assert.equal((await answer(5)).params.rejectionReason, workItemRefusals.readOnly);
  assert.equal((await answer(6)).params.rejectionReason, workItemRefusals.readOnly);
  await assert.rejects(op.rpc('disposeSession', { channel: session }), (error: Json) => error.code === -32009 && error.message === workItemRefusals.dispose);
  await assert.rejects(op.rpc('createSession', { channel: 'unfold:/wi-999', provider: 'unfold' }), (error: Json) => error.code === -32003, 'no Unfold session takes a Work Item id');

  dispatch(session, 7, { type: 'session/isArchivedChanged', isArchived: true });
  const archived = await answer(7);
  assert.equal(archived.params.rejectionReason, undefined, 'archiving is the viewer\'s own');
  const mine = workItemsOf(await f.listed(op)).find(item => item.resource === session)!;
  assert.equal(mine.status & 64, 64);
  const theirs = workItemsOf(await f.listed(admin)).find(item => item.resource === session)!;
  assert.equal(theirs.status & 64, 0, 'another person\'s view is unchanged');
});
