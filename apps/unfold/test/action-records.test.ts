import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { channelOf, confirmationOf, describeAction, isAction, outcomeOf, recordedInputs } from '../src/action-records.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { application, login, request } from './api-support.ts';

test('an action is named by its route with identifiers replaced, and knows what it targets', () => {
  assert.equal(isAction('POST', '/api/ploeg/work-items/106/approve'), true);
  assert.equal(isAction('GET', '/api/ploeg/work-items/106'), false);
  for (const path of ['/api/login', '/api/auth/editor', '/api/insight/events', '/api/ofrep/v1/evaluate/flags']) assert.equal(isAction('POST', path), false, path);
  assert.deepEqual(describeAction('POST', '/api/ploeg/work-items/106/approve'), { action: 'POST /api/ploeg/work-items/:id/approve', target: { kind: 'work-item', id: '106' } });
  assert.deepEqual(describeAction('POST', '/api/sessions/3b1f2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/messages'), { action: 'POST /api/sessions/:id/messages', target: { kind: 'session', id: '3b1f2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' } });
  assert.deepEqual(describeAction('POST', '/api/task-sources/board/tasks/1897/handoff'), { action: 'POST /api/task-sources/board/tasks/:id/handoff', target: { kind: 'task', id: 'board:1897' } });
  assert.deepEqual(describeAction('POST', '/api/status/notes'), { action: 'POST /api/status/notes', target: null });
});

test('recorded inputs drop secrets and clip long text, and channel and confirmation are bounded', () => {
  const inputs = recordedInputs({ reason: 'x'.repeat(600), token: 'vle_secret', nested: { apiKey: 'k', note: 'fine' }, list: Array.from({ length: 30 }, (_, index) => index) }) as Record<string, any>;
  assert.equal(inputs.token, '[redacted]');
  assert.equal(inputs.nested.apiKey, '[redacted]');
  assert.equal(inputs.nested.note, 'fine');
  assert.equal(inputs.reason.length, 501);
  assert.equal(inputs.list.length, 20);
  assert.equal(channelOf('browser', undefined, undefined), 'browser');
  assert.equal(channelOf('editor', 'unfold-mcp on ryan-pc-mint', 'Claude Code 2.1.296'), 'unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)');
  assert.equal(channelOf('editor', undefined, 'x\u0000\u001by'), 'editor (xy)');
  assert.equal(channelOf('mcp', undefined, 'Claude Code 2.1.296'), 'mcp:Claude Code 2.1.296');
  assert.equal(channelOf('mcp', 'ignored', undefined), 'mcp:unnamed client');
  const confirmation = `c-1:${createHash('sha256').update('Approve 106?').digest('hex')}`;
  assert.equal(confirmationOf(confirmation), confirmation);
  assert.equal(confirmationOf('anything at all'), null);
  assert.deepEqual([outcomeOf(200), outcomeOf(201), outcomeOf(404), outcomeOf(409), outcomeOf(502)], ['done', 'done', 'refused', 'refused', 'failed']);
});

async function fakePloeg(t: TestContext) {
  const env = `UNFOLD_ACTION_TEST_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  const posted: { path: string; headers: IncomingHttpHeaders }[] = [];
  const details = structuredClone(ploegDemo.details);
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data as object }));
    if (req.method === 'POST') {
      posted.push({ path: url.pathname, headers: req.headers });
      const id = url.pathname.split('/').at(-2)!;
      if (!details[id]) return send(404, { error: { code: 'not_found', message: 'No such Work Item.' } });
      return send(200, { decision: { workItemId: id, team: details[id].item.team, state: 'queued' } });
    }
    if (url.pathname.endsWith('/teams')) return send(200, { teams: ploegDemo.teams });
    const id = url.pathname.split('/').at(-1)!;
    return details[id] ? send(200, details[id]) : send(404, { error: { code: 'not_found', message: 'No such Work Item.' } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env, teams: ['delivery'] }, posted, proposed: Object.values(details).find(detail => detail.item.state === 'proposed')!.item.id };
}

test('every action through the API is recorded with its person, channel, confirmation and result, and the channel reaches Ploeg', async t => {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  const admin = await login(server.url);

  const approved = await request(server.url, `/api/ploeg/work-items/${ploeg.proposed}/approve`, { method: 'POST', body: { reason: 'Looks right', token: 'never-recorded' }, ...admin });
  assert.equal(approved.status, 200, approved.text);
  assert.equal(ploeg.posted.at(-1)!.headers['x-ploeg-via'], 'browser');
  assert.equal(ploeg.posted.at(-1)!.headers['x-ploeg-confirmation'], undefined);

  const adminUser = server.app.store.getUserByName('admin')!;
  const token = `vle_${randomBytes(32).toString('base64url')}`;
  server.app.store.createEditorCredential({ id: randomBytes(12).toString('hex'), tokenHash: createHash('sha256').update(token).digest('hex'), userId: adminUser.id, label: 'unfold-mcp on ryan-pc-mint', scope: 'editor', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  const confirmation = `c-7:${createHash('sha256').update(`Approve Work Item ${ploeg.proposed}?`).digest('hex')}`;
  const viaMcp = await request(server.url, `/api/ploeg/work-items/${ploeg.proposed}/approve`, { method: 'POST', body: {}, headers: { authorization: `Bearer ${token}`, 'x-unfold-client': 'Claude Code 2.1.296', 'x-unfold-confirmation': confirmation } });
  assert.equal(viaMcp.status, 200, viaMcp.text);
  assert.equal(ploeg.posted.at(-1)!.headers['x-ploeg-via'], 'unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)');
  assert.equal(ploeg.posted.at(-1)!.headers['x-ploeg-confirmation'], confirmation);

  const refused = await request(server.url, '/api/ploeg/work-items/999999/approve', { method: 'POST', body: {}, ...admin });
  assert.notEqual(refused.status, 200);

  const listed = await request(server.url, `/api/actions?workItemId=${ploeg.proposed}`, admin);
  assert.equal(listed.status, 200, listed.text);
  const [mcp, browser] = listed.body.actions;
  assert.equal(listed.body.actions.length, 2);
  assert.deepEqual({ action: browser.action, target: browser.target, channel: browser.channel, outcome: browser.outcome, user: browser.userName, confirmation: browser.confirmation }, { action: 'POST /api/ploeg/work-items/:id/approve', target: { kind: 'work-item', id: ploeg.proposed }, channel: 'browser', outcome: 'done', user: 'admin', confirmation: null });
  assert.equal(browser.inputs.reason, 'Looks right');
  assert.equal(browser.inputs.token, '[redacted]');
  assert.equal(mcp.channel, 'unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)');
  assert.equal(mcp.confirmation, confirmation);
  const failed = (await request(server.url, '/api/actions?workItemId=999999', admin)).body.actions[0];
  assert.equal(failed.outcome, 'refused');
  assert(failed.status >= 400 && failed.status < 500);
});

test('a person sees only their own actions; an administrator sees everyone\'s', async t => {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  const admin = await login(server.url);
  await request(server.url, `/api/ploeg/work-items/${ploeg.proposed}/approve`, { method: 'POST', body: {}, ...admin });
  const password = randomBytes(24).toString('hex');
  const { hashPassword } = await import('../src/auth.ts');
  server.app.store.addUser({ id: 'reader', name: 'reader', role: 'operator', passwordHash: hashPassword(password) });
  const reader = await login(server.url, 'reader', password);
  assert.equal((await request(server.url, '/api/actions', reader)).body.actions.length, 0, 'the administrator\'s approval is not shown to another person');
  assert.equal((await request(server.url, '/api/actions', admin)).body.actions.length >= 1, true);
  assert.equal((await request(server.url, '/api/actions', { method: 'POST', body: {}, ...admin })).status, 405);
});

test('actions filter by outcome and channel, and the filters list people for an administrator and only yourself for anyone else', async t => {
  const ploeg = await fakePloeg(t);
  const server = await application('live', config => { config.ploeg = ploeg.config; }); t.after(() => server.close());
  const admin = await login(server.url);
  await request(server.url, `/api/ploeg/work-items/${ploeg.proposed}/approve`, { method: 'POST', body: {}, ...admin });
  await request(server.url, '/api/ploeg/work-items/999999/approve', { method: 'POST', body: {}, ...admin });
  const password = randomBytes(24).toString('hex');
  const { hashPassword } = await import('../src/auth.ts');
  server.app.store.addUser({ id: 'reader', name: 'reader', role: 'operator', passwordHash: hashPassword(password) });
  const reader = await login(server.url, 'reader', password);
  await request(server.url, '/api/ploeg/work-items/999998/reject', { method: 'POST', body: { reason: 'no' }, ...reader });

  const refused = (await request(server.url, '/api/actions?outcome=refused', admin)).body.actions;
  assert(refused.length >= 2 && refused.every((record: { outcome: string }) => record.outcome === 'refused'));
  const done = (await request(server.url, '/api/actions?outcome=done', admin)).body.actions;
  assert.equal(done.length, 1);
  assert.equal((await request(server.url, '/api/actions?channel=browser', admin)).body.actions.length >= 3, true);
  assert.equal((await request(server.url, '/api/actions?channel=nowhere', admin)).body.actions.length, 0);
  assert.equal((await request(server.url, '/api/actions?outcome=maybe', admin)).status, 400);

  const everyone = (await request(server.url, '/api/actions/filters', admin)).body;
  assert.deepEqual(everyone.people.map((person: { userName: string }) => person.userName).sort(), ['admin', 'reader']);
  assert.deepEqual(everyone.channels.map((entry: { channel: string }) => entry.channel), ['browser']);
  const adminUser = server.app.store.getUserByName('admin')!;
  assert.deepEqual((await request(server.url, `/api/actions/filters?userId=${adminUser.id}`, admin)).body.people.map((person: { count: number }) => person.count), [2]);
  const own = (await request(server.url, `/api/actions/filters?userId=${adminUser.id}`, reader)).body;
  assert.deepEqual(own.people.map((person: { userId: string; count: number }) => [person.userId, person.count]), [['reader', 1]], 'a person sees only themselves, whoever they ask for');
  assert.equal((await request(server.url, '/api/actions/filters', { method: 'POST', body: {}, ...admin })).status, 405);
});
