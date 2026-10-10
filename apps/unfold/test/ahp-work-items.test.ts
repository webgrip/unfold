import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { PloegClient, cancelShiftChanged, noteFailures, type PloegItem } from '../src/ploeg.ts';
import { money } from '../public/core/format.js';
import { noAgentMessages, noRunMessages, ploegRunToolName, workItemActivity, workItemRefusals } from '../src/ahp/work-items.ts';
import { workItemCommandText } from '../src/ahp/work-item-commands.ts';
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
  return { details, events, down: false, seen: [] as string[], writes: [] as Write[], requeues: new Map<string, Json>(), notes: new Map<string, Json>(), notesRoute: true, cancelBody: true, consumerMaxBudgetUsd: 5, pendingCommand: (_key: string): unknown => undefined };
}

type Write = { path: string; actor?: string; acting?: string; body: string; pending: unknown };

type World = ReturnType<typeof world>;

function ploegWrite(state: World, path: string, body: string): [Json, number] {
  const [, id, command] = /^work-items\/([0-9]+)\/([a-z]+)$/.exec(path) ?? [];
  const detail = state.details.get(id);
  if (!detail) return [{ error: { code: 'not_found', message: 'The resource was not found in the consumer\'s scope.' } }, 404];
  const item = detail.item;
  const input = body ? JSON.parse(body) : {};
  const moved = (next: string) => { item.state = next; item.updatedAt = new Date().toISOString(); state.events.push({ id: String(2000 + state.events.length), at: item.updatedAt, actor: 'operator:unfold:op-1', action: `work_item.${next}`, workItemId: id, team: item.team, detail: {} }); };
  if (command === 'approve' || command === 'reject') {
    if (item.state !== 'proposed') return [{ error: { code: 'not_proposed', message: 'Only a proposed Work Item can be approved or rejected.' } }, 409];
    if (command === 'reject' && !String(input.reason ?? '').trim()) return [{ error: { code: 'invalid_decision', message: 'A rejection needs a reason of at most 4096 characters.' } }, 400];
    moved(command === 'approve' ? 'queued' : 'withdrawn');
    return [{ decision: { workItemId: id, team: item.team, state: item.state, approved: command === 'approve' } }, 200];
  }
  if (command === 'cancel') {
    if (body && !state.cancelBody) return [{ error: { code: 'invalid_request', message: 'Cancel takes no request body.' } }, 400];
    if (input.expectedShiftId !== undefined && (item.latestShift?.closedAt !== null || item.latestShift?.id !== input.expectedShiftId)) return [{ error: { code: 'shift_changed', message: 'The work item\'s open Shift is not the expected one.' } }, 409];
    const withdrawn = item.state !== 'withdrawn';
    if (withdrawn) moved('withdrawn');
    return [{ cancellation: { workItemId: id, state: 'withdrawn', withdrawn, shiftId: item.latestShift?.id ?? null, cancelledRuns: 0, stoppedRuns: withdrawn ? 1 : 0, keysBlocked: withdrawn } }, 200];
  }
  if (command === 'notes') {
    const replay = state.notes.get(input.commandId);
    if (replay) return replay.text === input.text ? [{ note: { ...replay, replayed: true } }, 200] : [{ error: { code: 'command_conflict', message: 'Another note holds this commandId.' } }, 409];
    if (['done', 'needs_human', 'awaiting_review', 'stale', 'withdrawn'].includes(item.state)) return [{ error: { code: 'work_item_terminal', message: 'The work item is terminal.' } }, 409];
    const open = item.latestShift && item.latestShift.closedAt === null ? item.latestShift.id : null;
    if (input.expectedShiftId !== undefined && input.expectedShiftId !== open) return [{ error: { code: 'shift_changed', message: 'The work item\'s open Shift is not the expected one.' } }, 409];
    const note = { id: String(500 + state.notes.size), workItemId: id, commandId: input.commandId, shiftId: open, createdAt: new Date().toISOString(), consumed: false, replayed: false, text: input.text };
    state.notes.set(input.commandId, note);
    const { text: _text, ...stored } = note;
    return [{ note: stored }, 201];
  }
  if (command === 'requeue') {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(String(input.commandId ?? ''))) return [{ error: { code: 'command_required', message: 'A requeue body needs a commandId of 1 to 128 identifier characters.' } }, 400];
    const replay = state.requeues.get(input.commandId);
    if (replay) return [{ requeue: { ...replay, replayed: true } }, 200];
    if (input.poolUsd !== undefined && input.poolUsd > state.consumerMaxBudgetUsd) return [{ error: { code: 'pool_above_limit', message: 'The pool exceeds the consumer\'s maxBudgetUsd.' } }, 400];
    if (!['needs_human', 'stale', 'awaiting_review'].includes(item.state)) return [{ error: { code: 'not_requeueable', message: 'Only a needs_human, stale or awaiting_review work item with no open Shift can be requeued.' } }, 409];
    if (input.expectedState && input.expectedState !== item.state) return [{ error: { code: 'state_changed', message: 'The work item is no longer in the expected state.' } }, 409];
    moved('queued');
    const requeued = { workItemId: id, team: item.team, state: 'queued', fromRound: 1, poolUsd: input.poolUsd ?? 3, shiftId: null, previousShiftId: item.latestShift?.id ?? null, commandId: input.commandId, replayed: false };
    state.requeues.set(input.commandId, requeued);
    return [{ requeue: requeued }, 200];
  }
  return [{ error: { code: 'not_found', message: 'Unknown command.' } }, 404];
}

async function ploegServer(t: TestContext, bearer: string, state: World): Promise<string> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    state.seen.push(`${url.pathname.replace('/api/v1/operator/', '')}${url.search}`);
    const send = (value: unknown, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...value as object }));
    if (req.headers.authorization !== `Bearer ${bearer}`) return send({}, 401);
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString('utf8');
      const path = url.pathname.replace('/api/v1/operator/', '');
      const acting = req.headers['x-ploeg-acting-user'] as string | undefined;
      state.writes.push({ path, actor: req.headers['x-ploeg-actor'] as string | undefined, acting, body, pending: state.pendingCommand(`work-item-command:${acting}:${path.split('/')[1]}`) });
      if (state.down) return send({ error: { code: 'unavailable', message: 'down' } }, 503);
      if (path.endsWith('/notes') && !state.notesRoute) return res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 page not found\n');
      const [answer, status] = ploegWrite(state, path, body);
      return send(answer, status);
    }
    if (req.method !== 'GET') return send({}, 401);
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
  const server = await application('live', config => { config.ploeg = { url: ploeg, tokenEnv: env, userTeams: { 'op-1': ['delivery'], 'viewer-2': ['delivery'] } }; });
  t.after(() => server.close());
  const host = server.app.agentHost;
  host.workItems.pollMs = 3_600_000;
  host.workItems.reconcileMs = 3_600_000;
  server.app.store.addUser({ id: 'op-1', name: 'op-1', role: 'operator', passwordHash: await hashPassword(password) });
  server.app.store.addUser({ id: 'viewer-1', name: 'viewer-1', role: 'viewer', passwordHash: await hashPassword(password) });
  server.app.store.addUser({ id: 'viewer-2', name: 'viewer-2', role: 'viewer', passwordHash: await hashPassword(password) });
  state.pendingCommand = key => server.app.store.getSecret(key);
  const unfoldSession = server.app.engine.create({ title: 'An Unfold session', objective: 'Fix the order rounding regression.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', budgetUsd: 1 }, { id: 'op-1', name: 'op-1', role: 'operator' });
  const attach = async (name: 'op-1' | 'viewer-1' | 'viewer-2' | 'admin') => {
    const token = name === 'admin'
      ? (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: (await login(server.url)).cookie, body: { label: 'work items' } })).body.token
      : name.startsWith('viewer-') ? host.issueToken({ id: name, name, role: 'viewer' }) : (await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie: (await login(server.url, name, password)).cookie, body: { label: 'work items' } })).body.token;
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
  f.state.notesRoute = false;
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
  assert.equal((await answer(3)).params.rejectionReason, workItemCommandText.confirmStop('202'), 'Stop only asks');
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

const picked = (option: string, reason?: string): Json => ({ '0': { state: 'submitted', value: { kind: 'selected', value: option } }, ...(reason !== undefined ? { '1': { state: 'submitted', value: { kind: 'text', value: reason } } } : {}) });

async function commanding(t: TestContext, who: 'op-1' | 'viewer-2' = 'op-1') {
  const f = await fixture(t);
  const client = await f.attach(who);
  await f.listed(client);
  let seq = 100;
  const dispatch = (channel: string, body: Json) => { const clientSeq = ++seq; client.notify('dispatchAction', { channel, clientSeq, action: body }); return clientSeq; };
  const answered = (clientSeq: number) => client.until(message => message.method === 'action' && message.params.origin?.clientSeq === clientSeq);
  const requested = (chat: string, after = 0) => client.until(message => action(message, chat, 'chat/inputRequested') && client.inbox.indexOf(message) >= after);
  const replied = (chat: string, pattern: RegExp) => client.until(message => action(message, chat, 'chat/responsePart') && pattern.test(String(message.params.action.part?.content ?? '')));
  return { ...f, client, dispatch, answered, requested, replied };
}

test('a proposed Work Item asks its operator to approve or reject it, a rejection needs a reason, and an approval queues it as that person', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const session = (await f.client.rpc('subscribe', { channel: 'unfold:/wi-203' })).snapshot.state;
  assert.equal(session.inputNeeded.length, 1);
  const asked = session.inputNeeded[0];
  assert.equal(asked.kind, 'chatInput');
  assert.equal(asked.request.message, workItemCommandText.decideQuestion('203'));
  assert.deepEqual(asked.request.questions[0].options.map((option: Json) => option.id), ['approve', 'reject']);
  const chat = defaultChatOf('unfold:/wi-203');
  const state = (await f.client.rpc('subscribe', { channel: chat })).snapshot.state;
  assert.ok(state.activeTurn.responseParts.some((part: Json) => part.kind === 'inputRequest' && part.request.id === asked.id), 'the question is the open turn of the chat');

  const mark = f.client.inbox.length;
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers: picked('reject', ' ') });
  await f.replied(chat, /needs a reason/);
  assert.equal(f.state.writes.length, 0, 'a rejection without a reason calls nothing');
  const again = (await f.requested(chat, mark)).params.action.request;
  assert.notEqual(again.id, asked.id, 'the question is asked again');

  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: again.id, response: 'accept', answers: picked('approve') });
  await f.replied(chat, /^Approved\. #203 is queued for delivery\.$/);
  assert.deepEqual(f.state.writes.map(write => [write.path, write.actor, write.acting]), [['work-items/203/approve', 'op-1', 'op-1']]);
  assert.equal((f.state.writes[0].pending as Json).actingUser, 'op-1', 'the command was recorded before Ploeg was called');
  assert.match((f.state.writes[0].pending as Json).commandId, /^[0-9a-f-]{36}$/);
  await f.client.until(message => message.method === 'root/sessionSummaryChanged' && message.params.session === 'unfold:/wi-203' && message.params.changes.activity === 'Queued for delivery');
  const after = (await f.client.rpc('subscribe', { channel: 'unfold:/wi-203' })).snapshot.state;
  assert.deepEqual(after.inputNeeded, [], 'nothing waits on the person once it is decided');
});

test('rejecting a proposed Work Item sends the reason to Ploeg', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const asked = (await f.client.rpc('subscribe', { channel: 'unfold:/wi-203' })).snapshot.state.inputNeeded[0];
  const chat = defaultChatOf('unfold:/wi-203');
  await f.client.rpc('subscribe', { channel: chat });
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: asked.id, response: 'accept', answers: picked('reject', 'Out of scope for this quarter.') });
  await f.replied(chat, /^Rejected #203: Out of scope for this quarter\.$/);
  assert.deepEqual(f.state.writes.map(write => [write.path, JSON.parse(write.body)]), [['work-items/203/reject', { reason: 'Out of scope for this quarter.' }]]);
});

test('Stop on a running Work Item only asks whether to withdraw it, and nothing happens without a confirmation', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: 'unfold:/wi-202' });
  await f.client.rpc('subscribe', { channel: chat });
  const stop = f.dispatch(chat, { type: 'chat/turnCancelled', turnId: 'wi-202-round-1-1' });
  assert.equal((await f.answered(stop)).params.rejectionReason, workItemCommandText.confirmStop('202'), 'the click is refused, not carried out');
  const question = (await f.requested(chat)).params.action.request;
  assert.equal(question.message, 'Withdraw #202? This stops the running Run, blocks its keys and comments on the tracker. It can\'t be resumed.');
  const part = f.client.inbox.find(message => action(message, chat, 'chat/responsePart'))!.params.action;
  assert.equal(part.turnId, 'wi-202-round-1-1', 'asked in the running Round\'s turn');
  await settled(f.client);
  assert.equal(f.state.writes.length, 0, 'Stop alone calls nothing');

  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: question.id, response: 'cancel' });
  await f.replied(chat, /^Nothing changed\.$/);
  const second = f.dispatch(chat, { type: 'chat/turnCancelled', turnId: 'wi-202-round-1-1' });
  await f.answered(second);
  const keep = (await f.requested(chat, f.client.inbox.findIndex(message => message.params?.origin?.clientSeq === second))).params.action.request;
  assert.notEqual(keep.id, question.id);
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: keep.id, response: 'accept', answers: picked('keep') });
  await settled(f.client);
  await f.client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.part.id === `${keep.id}-reply`);
  assert.equal(f.state.writes.length, 0, 'keeping it running calls nothing');
});

test('confirming Stop withdraws the Work Item once, as the person, with a command recorded first', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  f.dispatch(chat, { type: 'chat/turnCancelled', turnId: 'wi-202-round-1-1' });
  const question = (await f.requested(chat)).params.action.request;
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: question.id, response: 'accept', answers: picked('withdraw') });
  await f.replied(chat, /^Withdrew #202\. Ploeg stopped 1 Run and blocked their keys/);
  assert.equal(f.state.writes.length, 1, 'exactly one cancel');
  const [write] = f.state.writes;
  assert.deepEqual([write.path, write.actor, write.acting], ['work-items/202/cancel', 'op-1', 'op-1']);
  assert.match((write.pending as Json).commandId, /^[0-9a-f-]{36}$/, 'the command id was persisted before the call');
  assert.deepEqual(JSON.parse(write.body), { commandId: (write.pending as Json).commandId, expectedShiftId: '9202' }, 'the cancel names the Shift the person saw');
  assert.equal(f.server.app.store.getSecret('work-item-command:op-1:202'), undefined, 'and forgotten once Ploeg answered');
  await f.client.until(message => message.method === 'root/sessionSummaryChanged' && message.params.session === 'unfold:/wi-202' && message.params.changes.status === 1);
});

test('a viewer of the team is refused every command and asked nothing', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t, 'viewer-2');
  assert.deepEqual((await f.client.rpc('subscribe', { channel: 'unfold:/wi-203' })).snapshot.state.inputNeeded, [], 'no approval question for a viewer');
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  const stop = f.dispatch(chat, { type: 'chat/turnCancelled', turnId: 'wi-202-round-1-1' });
  assert.equal((await f.answered(stop)).params.rejectionReason, workItemCommandText.viewer('delivery'));
  await settled(f.client);
  assert.ok(!f.client.inbox.some(message => message.method === 'action' && message.params.action.type === 'chat/inputRequested'), 'no question is raised');
  assert.equal(f.state.writes.length, 0);
});

test('a message on a Work Item that needs a person restarts it from Round 1 with that note only after a confirmation, and a retry reuses the command', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-204');
  await f.client.rpc('subscribe', { channel: 'unfold:/wi-204' });
  await f.client.rpc('subscribe', { channel: chat });
  const note = 'Use the decimal rounding helper in totals.ts.';
  const sent = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-1', message: { text: note, origin: { kind: 'user' } } });
  const echoed = await f.answered(sent);
  assert.equal(echoed.params.rejectionReason, undefined, 'the message keeps its own turn');
  const question = (await f.requested(chat)).params.action.request;
  assert.equal(question.message, 'Restart from Round 1 with this note? This spends from delivery\'s pool.');
  assert.deepEqual(question.questions[0].options.map((option: Json) => option.id), ['restart', 'keep']);
  await settled(f.client);
  assert.equal(f.state.writes.length, 0, 'the message alone restarts nothing');

  f.state.down = true;
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: question.id, response: 'accept', answers: picked('restart') });
  await f.client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.part.id === `${question.id}-reply`);
  const first = JSON.parse(f.state.writes[0].body);
  assert.ok(f.server.app.store.getSecret('work-item-command:op-1:204'), 'an unanswered command stays recorded');

  f.state.down = false;
  const mark = f.client.inbox.length;
  f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-2', message: { text: note, origin: { kind: 'user' } } });
  const retry = (await f.requested(chat, mark)).params.action.request;
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: retry.id, response: 'accept', answers: picked('restart') });
  await f.replied(chat, /^Restarted #204 from Round 1 with a .+ pool\.$/);
  assert.deepEqual(f.state.writes.map(write => [write.path, write.actor, write.acting]), [['work-items/204/requeue', 'op-1', 'op-1'], ['work-items/204/requeue', 'op-1', 'op-1']]);
  const second = JSON.parse(f.state.writes[1].body);
  assert.deepEqual(second, { commandId: first.commandId, expectedState: 'needs_human', note }, 'the retry reuses the command id, with the note and the state the person saw');
  assert.equal((f.state.writes[1].pending as Json).commandId, second.commandId, 'recorded before the call');
  assert.equal(f.server.app.store.getSecret('work-item-command:op-1:204'), undefined);
});

test('Try Again on a stale Work Item asks the same question without a note and restarts it on confirmation', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-206');
  await f.client.rpc('subscribe', { channel: chat });
  const resume = f.dispatch(chat, { type: 'chat/turnResume', turnId: 'wi-206-round-0-1' });
  assert.equal((await f.answered(resume)).params.rejectionReason, workItemCommandText.confirmTryAgain('206'));
  const question = (await f.requested(chat)).params.action.request;
  assert.equal(question.message, 'Restart from Round 1? This spends from delivery\'s pool.');
  await settled(f.client);
  assert.equal(f.state.writes.length, 0, 'Try Again alone restarts nothing');
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: question.id, response: 'accept', answers: picked('restart') });
  await f.replied(chat, /^Restarted #206 from Round 1/);
  assert.equal(f.state.writes.length, 1);
  const body = JSON.parse(f.state.writes[0].body);
  assert.deepEqual(Object.keys(body).sort(), ['commandId', 'expectedState']);
  assert.equal(body.expectedState, 'stale');
});

test('a withdrawn Work Item is restarted only by assigning its task again', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-208');
  await f.client.rpc('subscribe', { channel: chat });
  const sent = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-1', message: { text: 'Try once more.', origin: { kind: 'user' } } });
  const resume = f.dispatch(chat, { type: 'chat/turnResume', turnId: 'x' });
  assert.equal((await f.answered(sent)).params.rejectionReason, 'Ploeg restarts a withdrawn Work Item only when its task is assigned to the team again.');
  assert.equal((await f.answered(resume)).params.rejectionReason, workItemCommandText.withdrawn);
  await settled(f.client);
  assert.ok(!f.client.inbox.some(message => message.method === 'action' && message.params.action.type === 'chat/inputRequested'));
  assert.equal(f.state.writes.length, 0);
});

test('when the budget ran out a restart offers a raised pool, and a pool above Ploeg\'s limit asks to raise the Team\'s budget', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  f.state.details.set('204', workItem('204', { state: 'needs_human', closeReason: 'budget exhausted', updated: minutesAgo(30), runs: [{ id: '302', role: 'implementer', round: 1, outcome: 'pr_opened' }] }));
  const chat = defaultChatOf('unfold:/wi-204');
  await f.client.rpc('subscribe', { channel: chat });
  f.dispatch(chat, { type: 'chat/turnResume', turnId: 'x' });
  const question = (await f.requested(chat)).params.action.request;
  const max = f.server.config.maxBudgetUsd;
  assert.deepEqual(question.questions[0].options, [{ id: 'restart', label: 'Restart from Round 1' }, { id: 'restart_raised', label: `Restart with a ${money(max)} pool` }, { id: 'keep', label: 'Leave it stopped' }]);
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: question.id, response: 'accept', answers: picked('restart_raised') });
  await f.replied(chat, /^Raise the Team's budget to try again with more\.$/);
  assert.equal(JSON.parse(f.state.writes[0].body).poolUsd, max);
  assert.equal(f.state.details.get('204')!.item.state, 'needs_human', 'nothing restarted');
});

const newAttempt = (state: World, id: string) => {
  const detail = state.details.get(id)!;
  const shift = { ...detail.item.latestShift, id: `99${id}`, openedAt: minutesAgo(1) };
  detail.item.latestShift = shift; detail.shifts = [shift];
  for (const run of detail.runs) run.shiftId = shift.id;
};

test('a message on a running Work Item is saved as a note for the next Round, naming the Shift the person saw and a command recorded first', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  const text = 'Use the decimal rounding helper in totals.ts.';
  const sent = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-1', message: { text, origin: { kind: 'user' } } });
  assert.equal((await f.answered(sent)).params.rejectionReason, undefined, 'the message keeps its own turn');
  await f.replied(chat, /^Saved for the next Round\. The running agent won't see it until then\.$/);
  await f.client.until(message => action(message, chat, 'chat/turnComplete') && message.params.action.turnId === 'note-1');
  assert.deepEqual(f.state.writes.map(write => [write.path, write.actor, write.acting]), [['work-items/202/notes', 'op-1', 'op-1']], 'only a note: nothing is cancelled or restarted');
  const body = JSON.parse(f.state.writes[0].body);
  assert.deepEqual(body, { commandId: body.commandId, text, expectedShiftId: '9202' });
  assert.equal((f.state.writes[0].pending as Json).commandId, body.commandId, 'the command id was persisted before the call');
  assert.equal(f.server.app.store.getSecret('work-item-command:op-1:202'), undefined, 'and forgotten once Ploeg answered');
  assert.ok(!f.client.inbox.some(message => message.method === 'action' && /interrupt/i.test(JSON.stringify(message.params.action))), 'it never claims to interrupt the running Run');
  const state = (await f.client.rpc('subscribe', { channel: chat })).snapshot.state;
  const turn = state.turns.find((entry: Json) => entry.id === 'note-1');
  assert.equal(turn.message.text, text);
  assert.equal(turn.responseParts[0].content, workItemCommandText.noteSaved, 'the saved note stays in the chat');

  const queuedChat = defaultChatOf('unfold:/wi-201');
  await f.client.rpc('subscribe', { channel: queuedChat });
  const pending = f.dispatch(queuedChat, { type: 'chat/pendingMessageSet', kind: 'steering', id: 'p1', message: { text: 'Start with the tests.', origin: { kind: 'user' } } });
  assert.equal((await f.answered(pending)).params.rejectionReason, undefined);
  await f.replied(queuedChat, /^Saved for the next Round/);
  assert.deepEqual(JSON.parse(f.state.writes[1].body), { commandId: JSON.parse(f.state.writes[1].body).commandId, text: 'Start with the tests.' }, 'queued work has no open Shift to name');
});

test('a note Ploeg could not take is retried under the same command id', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  const text = 'Prefer the existing helper.';
  f.state.down = true;
  const first = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-1', message: { text, origin: { kind: 'user' } } });
  assert.equal((await f.answered(first)).params.rejectionReason, noteFailures.unreachable());
  assert.ok(f.server.app.store.getSecret('work-item-command:op-1:202'), 'an unanswered note stays recorded');
  f.state.down = false;
  const second = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-2', message: { text, origin: { kind: 'user' } } });
  assert.equal((await f.answered(second)).params.rejectionReason, undefined);
  await f.replied(chat, /^Saved for the next Round/);
  const [failed, saved] = f.state.writes.map(write => JSON.parse(write.body));
  assert.equal(saved.commandId, failed.commandId, 'the retry reuses the command id');
  assert.equal(f.state.notes.size, 1);
});

test('a note on an attempt newer than the one the person saw is not saved, and says so', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  newAttempt(f.state, '202');
  const sent = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-1', message: { text: 'Use the helper.', origin: { kind: 'user' } } });
  assert.equal((await f.answered(sent)).params.rejectionReason, noteFailures.shift_changed('202'));
  assert.equal(JSON.parse(f.state.writes[0].body).expectedShiftId, '9202', 'it named the Shift the person saw');
  assert.equal(f.state.notes.size, 0);
});

test('a viewer\'s message on a running Work Item is refused and reaches no Ploeg note', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t, 'viewer-2');
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  const sent = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-1', message: { text: 'Hurry up.', origin: { kind: 'user' } } });
  assert.equal((await f.answered(sent)).params.rejectionReason, workItemCommandText.viewer('delivery'));
  await settled(f.client);
  assert.equal(f.state.writes.length, 0);
});

test('a Ploeg without the notes route refuses instructions for running work, and the process stops asking it', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  f.state.notesRoute = false;
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  const first = f.dispatch(chat, { type: 'chat/turnStarted', turnId: 'note-1', message: { text: 'Use the helper.', origin: { kind: 'user' } } });
  assert.equal((await f.answered(first)).params.rejectionReason, 'Ploeg can\'t take instructions for running work yet. Stop it, or wait until it needs you.');
  const second = f.dispatch(chat, { type: 'chat/pendingMessageSet', kind: 'steering', id: 'p1', message: { text: 'Again.', origin: { kind: 'user' } } });
  assert.equal((await f.answered(second)).params.rejectionReason, workItemRefusals.message);
  assert.deepEqual(f.state.writes.map(write => write.path), ['work-items/202/notes'], 'the missing route is learnt once and nothing else is called');
  assert.equal(f.server.app.store.getSecret('work-item-command:op-1:202'), undefined, 'and no command waits for a retry');
});

test('a confirmed Stop on an attempt newer than the one the person saw withdraws nothing', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  f.dispatch(chat, { type: 'chat/turnCancelled', turnId: 'wi-202-round-1-1' });
  const question = (await f.requested(chat)).params.action.request;
  newAttempt(f.state, '202');
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: question.id, response: 'accept', answers: picked('withdraw') });
  await f.replied(chat, /started a new attempt/);
  const reply = f.client.inbox.find(message => action(message, chat, 'chat/responsePart') && message.params.action.part.id === `${question.id}-reply`)!;
  assert.equal(reply.params.action.part.content, cancelShiftChanged('202'));
  assert.equal(reply.params.action.part.content, '#202 started a new attempt since you looked; nothing was withdrawn. Look again and stop it if you still want to.');
  assert.equal(JSON.parse(f.state.writes[0].body).expectedShiftId, '9202');
  assert.equal(f.state.details.get('202')!.item.state, 'leased', 'nothing was withdrawn');
});

test('a Ploeg that takes no cancel body still withdraws on a confirmed Stop, unguarded', { timeout: testTimeout(20_000) }, async t => {
  const f = await commanding(t);
  f.state.cancelBody = false;
  const chat = defaultChatOf('unfold:/wi-202');
  await f.client.rpc('subscribe', { channel: chat });
  f.dispatch(chat, { type: 'chat/turnCancelled', turnId: 'wi-202-round-1-1' });
  const question = (await f.requested(chat)).params.action.request;
  f.dispatch(chat, { type: 'chat/inputCompleted', requestId: question.id, response: 'accept', answers: picked('withdraw') });
  await f.replied(chat, /^Withdrew #202\./);
  assert.deepEqual(f.state.writes.map(write => write.body === '' ? '' : Object.keys(JSON.parse(write.body)).sort().join()), ['commandId,expectedShiftId', '']);
});
