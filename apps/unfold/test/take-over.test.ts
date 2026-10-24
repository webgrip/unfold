import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { detail as parseDetail } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { hashPassword } from '../src/auth.ts';
import { harnessRefusal, takeOverRefusal, takeOverRefusals } from '../public/core/take-over.js';
import { application, login, request } from './api-support.ts';

const head = 'b'.repeat(40), wip = 'c'.repeat(40);
const heldBy = (by: string, state = 'taken_over') => ({ id: '7', state, by, shiftId: '13', round: 2, branch: 'demo/rounding-review', requestedAt: '2026-10-24T10:00:00Z', yieldedAt: state === 'yielding' ? null : '2026-10-24T10:00:40Z', commit: state === 'yielding' ? null : head, workInProgress: state === 'yielding' ? null : wip, pushed: state === 'yielding' ? null : true, detail: null, handedBackAt: null, handedBackShiftId: null });

test('a Work Item detail reads its take-over, the taken_over resume offer and each Run\'s harness, and drops what it cannot read', () => {
  const data = structuredClone(ploegDemo.details['101']) as any;
  data.schemaVersion = '1.0';
  data.takeOver = heldBy('op');
  data.resume = { shiftId: '13', askedRound: 2, fromRound: 2, roundCapUsd: 1.5, poolUsd: 3.25, ready: true, waitingQuestionIds: [], reason: 'taken_over' };
  data.runs[0].harness = 'acp';
  const parsed = parseDetail(data);
  assert.deepEqual(parsed.takeOver, heldBy('op'));
  assert.equal(parsed.resume?.reason, 'taken_over');
  assert.equal(parsed.runs[0].harness, 'acp');
  data.takeOver = { ...heldBy('op'), state: 'paused' };
  data.resume.reason = 'something_new';
  data.runs[0].harness = 'Not A Harness!';
  const odd = parseDetail(data);
  assert.equal(odd.takeOver, null, 'an unknown take-over state is not guessed at');
  assert.equal(odd.resume?.reason, undefined);
  assert.equal(odd.runs[0].harness, null);
  delete data.takeOver; delete data.runs[0].harness;
  const older = parseDetail(data);
  assert.equal('takeOver' in older, false, 'an older Ploeg sends no take-over and none is invented');
  assert.equal('harness' in older.runs[0], false);
  data.takeOver = { ...heldBy('op'), commit: 'not-a-sha' };
  assert.equal(parseDetail(data).takeOver?.commit, null);
});

test('every refusal code Ploeg ADR-0142 lists reads as a plain sentence, and yield_unsupported names the harness', () => {
  for (const code of ['nothing_running', 'run_client_carried', 'yield_unsupported', 'take_over_pending', 'shift_changed', 'operator_owned', 'command_conflict', 'person_forbidden', 'taken_over_by_another']) {
    const sentence = takeOverRefusal(code);
    assert.ok(sentence && /^[A-Z].*\.$/.test(sentence) && !sentence.includes('_'), `${code}: ${sentence}`);
    assert.equal(sentence, takeOverRefusals[code as keyof typeof takeOverRefusals] ?? sentence);
  }
  assert.match(takeOverRefusal('yield_unsupported', 'run 812 uses harness claude-code, which cannot yield'), /^Claude Code Runs cannot stop between steps yet\. Cancel it instead/);
  assert.match(takeOverRefusal('yield_unsupported', 'harnesses exec and openhands cannot yield'), /OpenHands Runs.*command Run is not an agent|command Run.*OpenHands/s);
  assert.match(takeOverRefusal('yield_unsupported', 'harness mystery cannot yield'), /harness cannot stop at a safe point/);
  assert.equal(takeOverRefusal('no_such_code'), '');
  assert.equal(harnessRefusal(['acp', 'acp', null]), '', 'ACP Runs and unknown harnesses are left to Ploeg');
  assert.match(harnessRefusal(['custom-thing']), /The custom-thing harness cannot stop/);
});

async function fakePloeg(t: TestContext) {
  const env = `UNFOLD_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const details = structuredClone(ploegDemo.details) as Record<string, any>;
  details['102'].runs.find((run: any) => run.state === 'running').harness = 'acp';
  details['101'].takeOver = heldBy('op');
  details['101'].resume = { shiftId: '13', askedRound: 1, fromRound: 1, roundCapUsd: 1, poolUsd: 2, ready: true, waitingQuestionIds: [], reason: 'taken_over' };
  const calls: { method: string; path: string; actor?: string; acting?: string; via?: string; body: any }[] = [];
  const refusals: Record<string, { status: number; code: string; message: string }> = {};
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url!, 'http://fixture.invalid');
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const path = url.pathname.replace('/api/v1/operator/', '');
    if (req.method === 'POST') calls.push({ method: req.method, path, actor: req.headers['x-ploeg-actor'] as string, acting: req.headers['x-ploeg-acting-user'] as string, via: req.headers['x-ploeg-via'] as string, body: text ? JSON.parse(text) : null });
    const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data as object }));
    const refused = refusals[path];
    if (refused && req.method === 'POST') return res.writeHead(refused.status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: refused.code, message: refused.message } }));
    let match = /^work-items\/(\d+)\/take-over$/.exec(path);
    if (match) { const body = JSON.parse(text); return send(202, { takeOver: { id: '7', workItemId: match[1], shiftId: body.expectedShiftId ?? '20', round: 1, branch: 'demo/regression-investigation', state: 'yielding', runs: [{ id: '820', role: 'implementer' }], cancelledPendingRuns: 0, commandId: body.commandId, replayed: false } }); }
    match = /^work-items\/(\d+)\/requeue$/.exec(path);
    if (match) { const body = JSON.parse(text); return send(200, { requeue: { workItemId: match[1], team: 'delivery', state: 'queued', fromRound: 1, poolUsd: 2, shiftId: '30', previousShiftId: '13', commandId: body.commandId, replayed: false, resume: body.resume === true } }); }
    match = /^work-items\/(\d+)$/.exec(path);
    if (match && details[match[1]]) return send(200, details[match[1]]);
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, calls, details, refusals };
}

async function people(t: TestContext) {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = { ...ploeg.config, userTeams: { op: ['delivery'], other: ['delivery'], watcher: ['delivery'], boss: ['delivery'] } }; });
  t.after(() => server.close());
  const password = randomBytes(24).toString('hex');
  for (const [id, role] of [['op', 'operator'], ['other', 'operator'], ['watcher', 'viewer'], ['boss', 'admin']] as const) server.app.store.addUser({ id, name: id, role, passwordHash: await hashPassword(password) });
  return { ploeg, server, op: await login(server.url, 'op', password), other: await login(server.url, 'other', password), watcher: await login(server.url, 'watcher', password), boss: await login(server.url, 'boss', password) };
}

test('Take control asks Ploeg as the person, with the Shift they saw and the channel, and is an Action Record', async t => {
  const { ploeg, server, op, watcher } = await people(t);
  const status = await request(server.url, '/api/ploeg/work-items/102/take-over', op);
  assert.equal(status.status, 200, status.text);
  assert.deepEqual(status.body.takeControl, { enabled: true, reason: '' });
  assert.equal(status.body.handBack, null);
  const taken = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...op, method: 'POST', body: { commandId: 'take-1' } });
  assert.equal(taken.status, 202, taken.text);
  assert.equal(taken.body.takeOver.state, 'yielding');
  assert.deepEqual(taken.body.takeOver.runs, [{ id: '820', role: 'implementer' }]);
  const call = ploeg.calls.find(entry => entry.path === 'work-items/102/take-over')!;
  assert.deepEqual(call.body, { commandId: 'take-1', expectedShiftId: '20' }, 'the open Shift the person saw goes along');
  assert.equal(call.actor, 'op');
  assert.equal(call.acting, 'op');
  assert.equal(call.via, 'browser');
  const viewer = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...watcher, method: 'POST', body: {} });
  assert.equal(viewer.status, 403);
  assert.equal(ploeg.calls.filter(entry => entry.path.endsWith('/take-over')).length, 1, 'a viewer reaches nothing');
  const forOther = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...op, method: 'POST', body: { actFor: 'other' } });
  assert.equal(forOther.status, 403);
  assert.match(forOther.body.error.message, /Only an administrator/);
  const actions = await request(server.url, '/api/actions', op);
  const records = actions.body.actions.filter((record: { action: string }) => record.action === 'POST /api/ploeg/work-items/:id/take-over');
  assert.deepEqual(records.map((record: { outcome: string; target: unknown }) => [record.outcome, record.target]), [['refused', { kind: 'work-item', id: '102' }], ['done', { kind: 'work-item', id: '102' }]]);
});

test('Take control is refused before Ploeg is asked when nothing runs, a harness cannot yield, it is already held, or it acts for someone else; an administrator acts for that person', async t => {
  const { ploeg, server, op, other, boss } = await people(t);
  const idle = await request(server.url, '/api/ploeg/work-items/108/take-over', { ...op, method: 'POST', body: {} });
  assert.equal(idle.status, 409);
  assert.equal(idle.body.error.code, 'nothing_running');
  ploeg.details['102'].runs.find((run: any) => run.state === 'running').harness = 'claude-code';
  const claude = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...op, method: 'POST', body: {} });
  assert.equal(claude.status, 409);
  assert.equal(claude.body.error.code, 'yield_unsupported');
  assert.match(claude.body.error.message, /Claude Code Runs cannot stop between steps yet/);
  ploeg.details['102'].runs.find((run: any) => run.state === 'running').harness = 'acp';
  ploeg.details['102'].takeOver = { ...heldBy('other', 'yielding'), shiftId: '20' };
  const pending = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...op, method: 'POST', body: {} });
  assert.equal(pending.body.error.code, 'take_over_pending');
  delete ploeg.details['102'].takeOver;
  ploeg.details['102'].events.push({ id: '9999', at: '2026-10-24T09:00:00Z', actor: 'other', action: 'operator.work_item.admitted', workItemId: '102', team: 'delivery', detail: {} });
  const someoneElse = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...op, method: 'POST', body: {} });
  assert.equal(someoneElse.status, 403);
  assert.equal(someoneElse.body.error.code, 'person_forbidden');
  assert.match(someoneElse.body.error.message, /acts for other/);
  assert.equal(ploeg.calls.filter(entry => entry.path.endsWith('/take-over')).length, 0, 'none of these reached Ploeg');
  const theirs = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...other, method: 'POST', body: {} });
  assert.equal(theirs.status, 202, theirs.text);
  const admin = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...boss, method: 'POST', body: {} });
  assert.equal(admin.status, 202, admin.text);
  const calls = ploeg.calls.filter(entry => entry.path.endsWith('/take-over'));
  assert.deepEqual(calls.map(entry => [entry.actor, entry.acting]), [['other', 'other'], ['other', 'boss']], 'an administrator acts for the person the Work Item acts for (ADR-0108)');
});

test('Ploeg\'s own refusals of a take-over come back as plain sentences with their codes', async t => {
  const { ploeg, server, op } = await people(t);
  const cases: [number, string, string, RegExp][] = [
    [409, 'shift_changed', 'open shift is 21', /another attempt since you looked/],
    [409, 'run_client_carried', 'run 820 is client-carried', /own Claude Code/],
    [409, 'operator_owned', 'operator-owned', /workbench session/],
    [409, 'command_conflict', 'conflict', /different take-over under this command/],
    [403, 'person_forbidden', 'acts for someone', /Only they, or an administrator/],
    [409, 'yield_unsupported', 'run 820 uses harness exec', /command Run is not an agent/],
    [409, 'take_over_pending', 'pending', /already took this Work Item over/],
    [409, 'nothing_running', 'nothing', /nothing to take over/],
  ];
  for (const [status, code, message, sentence] of cases) {
    ploeg.refusals['work-items/102/take-over'] = { status, code, message };
    const answer = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...op, method: 'POST', body: {} });
    assert.equal(answer.status, status, `${code}: ${answer.text}`);
    assert.equal(answer.body.error.code, code);
    assert.match(answer.body.error.message, sentence);
  }
  ploeg.refusals['work-items/102/take-over'] = { status: 404, code: '', message: '' };
  const older = await request(server.url, '/api/ploeg/work-items/102/take-over', { ...op, method: 'POST', body: {} });
  assert.equal(older.status, 501);
  assert.match(older.body.error.message, /0\.2\.0-rc\.53/);
});

test('Hand back is a resume with the person\'s note, only by the person who took it over or an administrator acting for them', async t => {
  const { ploeg, server, op, other, boss, watcher } = await people(t);
  const status = await request(server.url, '/api/ploeg/work-items/101/take-over', op);
  assert.equal(status.body.takeOver.state, 'taken_over');
  assert.deepEqual(status.body.handBack, { enabled: true, reason: '' });
  const notYours = await request(server.url, '/api/ploeg/work-items/101/take-over', other);
  assert.equal(notYours.body.handBack.enabled, false);
  assert.match(notYours.body.handBack.reason, /op took this over/);
  const refused = await request(server.url, '/api/ploeg/work-items/101/hand-back', { ...other, method: 'POST', body: {} });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'taken_over_by_another');
  assert.equal((await request(server.url, '/api/ploeg/work-items/101/hand-back', { ...watcher, method: 'POST', body: {} })).status, 403);
  assert.equal(ploeg.calls.filter(entry => entry.path.endsWith('/requeue')).length, 0);
  const back = await request(server.url, '/api/ploeg/work-items/101/hand-back', { ...op, method: 'POST', body: { commandId: 'back-1', note: '  Fixed the rounding in cents.  ' } });
  assert.equal(back.status, 200, back.text);
  assert.equal(back.body.resumed, true);
  const requeue = ploeg.calls.find(entry => entry.path === 'work-items/101/requeue')!;
  assert.deepEqual(requeue.body, { commandId: 'back-1', expectedState: 'needs_human', note: 'Fixed the rounding in cents.', resume: true });
  assert.deepEqual([requeue.actor, requeue.acting], ['op', 'op']);
  const admin = await request(server.url, '/api/ploeg/work-items/101/hand-back', { ...boss, method: 'POST', body: {} });
  assert.equal(admin.status, 200, admin.text);
  const adminCall = ploeg.calls.filter(entry => entry.path === 'work-items/101/requeue')[1];
  assert.deepEqual([adminCall.actor, adminCall.acting], ['op', 'boss'], 'the hand-back names the person who holds it, and the administrator as acting user');
  ploeg.refusals['work-items/101/requeue'] = { status: 409, code: 'taken_over_by_another', message: 'held by op' };
  const ploegSays = await request(server.url, '/api/ploeg/work-items/101/hand-back', { ...op, method: 'POST', body: {} });
  assert.match(ploegSays.body.error.message, /Another person took this Work Item over/);
  const nothing = await request(server.url, '/api/ploeg/work-items/108/hand-back', { ...op, method: 'POST', body: {} });
  assert.equal(nothing.status, 409);
  assert.equal(nothing.body.error.code, 'nothing_to_hand_back');
  const long = await request(server.url, '/api/ploeg/work-items/101/hand-back', { ...op, method: 'POST', body: { note: 'x'.repeat(4097) } });
  assert.equal(long.status, 400);
  const actions = await request(server.url, '/api/actions', op);
  assert.ok(actions.body.actions.some((record: { action: string; outcome: string; inputs: Record<string, unknown> }) => record.action === 'POST /api/ploeg/work-items/:id/hand-back' && record.outcome === 'done' && record.inputs.note === '  Fixed the rounding in cents.  '), 'the hand-back is an Action Record with its note');
});

test('the demo takes nothing over', async t => {
  const server = await application('demo');
  t.after(() => server.close());
  const answer = await request(server.url, '/api/ploeg/work-items/102/take-over', { method: 'POST', body: {} });
  assert.equal(answer.status, 409);
  assert.match(answer.body.error.message, /demo runs no agents/);
});
