import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/store.ts';
import type { User } from '../src/types.ts';
import type { PloegEvent } from '../src/ploeg.ts';
import { Notifications } from '../src/notify/service.ts';
import { httpTransport, type Transport } from '../src/notify/channels.ts';
import { NotifyStore } from '../src/notify/store.ts';
import { notificationSettings } from '../src/notify/settings.ts';
import { SlackChannel, chatRefusal, slackActions, verifySlackSignature } from '../src/notify/slack.ts';
import { TeamsChannel, adaptiveCardMessage, parseWorkflowUrl } from '../src/notify/teams.ts';
import { workItemMessage } from '../src/notify/triggers.ts';
import { LinkedPermissions, type PermissionCaller } from '../src/linked-permissions.ts';
import { LinkedSessionStore, type LinkedSession } from '../src/linked-sessions.ts';
import { application, login, request } from './api-support.ts';

type Recorded = { method: string; path: string; headers: IncomingMessage['headers']; body: string };
type Answer = (entry: Recorded) => { status?: number; headers?: Record<string, string>; body?: unknown };

async function fakeServer(t: test.TestContext, answer: Answer) {
  const requests: Recorded[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const entry = { method: req.method ?? '', path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
    requests.push(entry);
    const reply = answer(entry);
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json', ...reply.headers });
    res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? { ok: true }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return { requests, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const secret = 'slack-signing-secret-for-tests';
const env = { UNFOLD_SLACK_BOT_TOKEN: 'xoxb-test-token', UNFOLD_SLACK_SIGNING_SECRET: secret };
const slackPeople: Record<string, { id: string; team_id: string }> = { 'ann@agency.example': { id: 'U0ANN', team_id: 'T0AGENCY' }, 'bob@agency.example': { id: 'U0BOB', team_id: 'T0AGENCY' } };
const sessionId = '0f6c1c9e-1111-4222-8333-944445555666';

const slackApi: Answer = entry => {
  if (entry.path === '/api/users.lookupByEmail') {
    const found = slackPeople[new URLSearchParams(entry.body).get('email') ?? ''];
    return { body: found ? { ok: true, user: found } : { ok: false, error: 'users_not_found' } };
  }
  if (entry.path === '/api/conversations.open') return { body: { ok: true, channel: { id: `D${JSON.parse(entry.body).users.slice(1)}` } } };
  return { body: entry.path.startsWith('/hooks/') ? 'ok' : { ok: true } };
};

function linkedSession(ownerId: string): LinkedSession {
  return { id: sessionId, harness: 'claude-code', harnessVersion: '', ownerId, ownerName: ownerId, title: '', repository: '', branch: '', model: '', remoteUrl: '', status: 'waiting', waitingFor: 'permission_prompt', startedAt: '2026-10-30T11:00:00.000Z', lastSeenAt: '2026-10-30T11:00:00.000Z', endedAt: null, workItems: [], dismissed: [], resolvedBranch: '', pullRequests: [], commits: [] };
}

async function fixture(t: test.TestContext, options: { flags?: Record<string, boolean>; permissionAnswers?: boolean; demo?: boolean; slackAnswer?: Answer; teamsAnswer?: Answer; readable?: (user: User, team: string) => boolean } = {}) {
  const slack = await fakeServer(t, options.slackAnswer ?? slackApi);
  const teams = await fakeServer(t, options.teamsAnswer ?? (() => ({ status: 202, body: '' })));
  const settings = notificationSettings({
    slack: { tokenEnv: 'UNFOLD_SLACK_BOT_TOKEN', signingSecretEnv: 'UNFOLD_SLACK_SIGNING_SECRET', apiUrl: `${slack.origin}/api`, permissionAnswers: options.permissionAnswers ?? true },
    teams: {},
  });
  const store = new Store(':memory:');
  const clock = { now: Date.parse('2026-10-30T12:00:00Z') };
  const sessions = new LinkedSessionStore(store.db);
  sessions.save(linkedSession('ann'));
  const permissions = new LinkedPermissions(store.db, sessions, { now: () => new Date(clock.now) });
  const notifyStore = new NotifyStore(store);
  const teamsTransport: Transport = (url, headers, body) => httpTransport(new URL(`${url.pathname}${url.search}`, teams.origin), headers, body, false);
  const events: PloegEvent[] = [];
  const facts: Record<string, any> = {};
  const notify = new Notifications(store, {
    settings, demo: options.demo, baseUrl: 'https://unfold.example.org', clock: () => clock.now,
    enabled: async () => true,
    flagOn: async (_user, flag) => options.flags?.[flag] ?? true,
    canRead: options.readable ?? ((_user, team) => team === 'bronze'),
    ploeg: {
      latestEvents: async () => ({ lastCursor: '0' }),
      followEvents: async (after: string) => ({ events: events.filter(entry => BigInt(entry.id) > BigInt(after)), lastCursor: events.at(-1)?.id ?? after, more: false }),
      workItemFacts: async (id: string) => facts[id],
    },
    channels: [
      new SlackChannel(notifyStore, settings.slack, { permissions, baseUrl: 'https://unfold.example.org', clock: () => clock.now, env }),
      new TeamsChannel(notifyStore, settings.teams, teamsTransport),
    ],
  });
  const user = (id: string) => { const entry = { id, name: `${id}@agency.example`, role: 'operator' as const }; store.addUser({ ...entry, passwordHash: 'unused' }); return entry; };
  return { slack, teams, store, notify, permissions, sessions, clock, events, facts, user };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const body = (value: unknown) => async () => value;
const calls = (f: Fixture, path: string) => f.slack.requests.filter(entry => entry.path === path);
const signed = (raw: string, at: number, key = secret) => ({ 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': String(at), 'x-slack-signature': `v0=${createHmac('sha256', key).update(`v0:${at}:${raw}`).digest('hex')}` });
const formOf = (payload: unknown) => `payload=${encodeURIComponent(JSON.stringify(payload))}`;
async function interact(f: Fixture, payload: Record<string, unknown>, options: { at?: number; key?: string } = {}) {
  const raw = formOf({ type: 'block_actions', team: { id: 'T0AGENCY' }, response_url: `${f.slack.origin}/hooks/response`, trigger_id: '1234.5678.abcdef', ...payload });
  return f.notify.publicRoute('POST', '/api/notifications/channels/slack/interactions', signed(raw, options.at ?? Math.floor(f.clock.now / 1000), options.key), Buffer.from(raw));
}

async function linkSlack(f: Fixture, person: User, slackUserId: string) {
  const asked = await f.notify.route(person, 'POST', '/api/me/notifications/channels/slack/link', body({ email: person.name }));
  assert.equal(asked.status, 202);
  const posted = calls(f, '/api/chat.postMessage').at(-1)!;
  const nonce = JSON.parse(posted.body).blocks[1].elements[0].value;
  const confirmed = await interact(f, { user: { id: slackUserId, team_id: 'T0AGENCY' }, container: { type: 'message' }, actions: [{ action_id: slackActions.linkConfirm, value: nonce }] });
  assert.deepEqual(confirmed.body, { linked: true });
  return nonce;
}

test('settings name the Slack token and signing secret by variable and default the Teams hosts', () => {
  const settings = notificationSettings({ slack: { tokenEnv: 'UNFOLD_SLACK_BOT_TOKEN', signingSecretEnv: 'UNFOLD_SLACK_SIGNING_SECRET' }, teams: {} });
  assert.deepEqual(settings.slack, { tokenEnv: 'UNFOLD_SLACK_BOT_TOKEN', signingSecretEnv: 'UNFOLD_SLACK_SIGNING_SECRET', apiUrl: 'https://slack.com/api', permissionAnswers: false });
  assert.deepEqual(settings.teams, { allowedHosts: ['logic.azure.com', 'api.powerplatform.com'] });
  assert.throws(() => notificationSettings({ slack: { tokenEnv: 'xoxb-123', signingSecretEnv: 'UNFOLD_SLACK_SIGNING_SECRET' } }), /environment variable/);
  assert.throws(() => notificationSettings({ slack: { tokenEnv: 'A', signingSecretEnv: 'B', teamId: 'acme' } }), /workspace id/);
  assert.throws(() => notificationSettings({ teams: { allowedHosts: ['https://evil.example'] } }), /host names/);
});

test('a Slack signature verifies only with the secret, the raw body and a timestamp within five minutes', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const at = Math.floor(now / 1000);
  const raw = Buffer.from('payload=%7B%7D');
  assert.equal(verifySlackSignature(secret, signed(raw.toString(), at), raw, now), 'ok');
  assert.equal(verifySlackSignature(secret, signed(raw.toString(), at, 'another-secret'), raw, now), 'invalid');
  assert.equal(verifySlackSignature(secret, signed(raw.toString(), at), Buffer.from('payload=%7B%22x%22%7D'), now), 'invalid', 'a changed body fails');
  assert.equal(verifySlackSignature(secret, signed(raw.toString(), at - 301), raw, now), 'stale');
  assert.equal(verifySlackSignature(secret, signed(raw.toString(), at - 299), raw, now), 'ok');
  assert.equal(verifySlackSignature(secret, { 'x-slack-signature': 'v0=00' }, raw, now), 'missing');
});

test('an unsigned, wrongly signed or stale interaction is refused before anything is read', async t => {
  const f = await fixture(t);
  await assert.rejects(interact(f, { actions: [{ action_id: 'anything' }] }, { key: 'wrong' }), { status: 401, code: 'slack_signature' });
  await assert.rejects(interact(f, { actions: [{ action_id: 'anything' }] }, { at: Math.floor(f.clock.now / 1000) - 600 }), { status: 401, code: 'slack_signature', message: /too far from now/ });
  await assert.rejects(f.notify.publicRoute('POST', '/api/notifications/channels/slack/interactions', {}, Buffer.from('payload=%7B%7D')), { status: 401 });
  assert.equal(f.slack.requests.length, 0, 'nothing reached Slack');
});

test('linking finds the Slack account by email and links it only when that account confirms', async t => {
  const f = await fixture(t);
  const ann = f.user('ann');
  await assert.rejects(f.notify.route(ann, 'POST', '/api/me/notifications/channels/slack/link', body({ email: 'nobody@agency.example' })), { status: 404, code: 'slack_user_not_found' });
  f.clock.now += 61_000;
  const asked = await f.notify.route(ann, 'POST', '/api/me/notifications/channels/slack/link', body({ email: 'ann@agency.example' }));
  assert.equal(asked.status, 202);
  const lookup = calls(f, '/api/users.lookupByEmail').at(-1)!;
  assert.equal(lookup.headers.authorization, 'Bearer xoxb-test-token');
  assert.equal(lookup.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(lookup.body, 'email=ann%40agency.example');
  const opened = calls(f, '/api/conversations.open')[0];
  assert.equal(opened.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(opened.body), { users: 'U0ANN' });
  const ask = JSON.parse(calls(f, '/api/chat.postMessage')[0].body);
  assert.equal(ask.channel, 'D0ANN');
  assert.equal(ask.blocks[1].elements[0].action_id, 'unfold.link.confirm');
  const nonce = ask.blocks[1].elements[0].value;
  assert.equal(f.notify.store.db.prepare('SELECT COUNT(*) AS n FROM notify_slack_pending WHERE nonce_hash=?').get(nonce)!.n, 0, 'only a hash of the code is kept');
  await assert.rejects(f.notify.route(ann, 'POST', '/api/me/notifications/channels/slack/link', body({ email: 'ann@agency.example' })), { status: 429 });

  const wrong = await interact(f, { user: { id: 'U0BOB', team_id: 'T0AGENCY' }, actions: [{ action_id: slackActions.linkConfirm, value: nonce }] });
  assert.deepEqual(wrong.body, { linked: false }, 'another Slack account cannot confirm');
  assert.equal(f.notify.store.targets('ann', 'slack').length, 0);
  const right = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, actions: [{ action_id: slackActions.linkConfirm, value: nonce }] });
  assert.deepEqual(right.body, { linked: true });
  assert.deepEqual(f.notify.store.targets('ann', 'slack')[0].address, { teamId: 'T0AGENCY', slackUserId: 'U0ANN', channel: 'D0ANN' });
  const reply = f.slack.requests.filter(entry => entry.path === '/hooks/response').at(-1)!;
  assert.equal(JSON.parse(reply.body).replace_original, true);
  const again = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, actions: [{ action_id: slackActions.linkConfirm, value: nonce }] });
  assert.deepEqual(again.body, { linked: false }, 'the code works once');

  const view = await f.notify.route(ann, 'GET', '/api/me/notifications', body(undefined)) as any;
  const described = view.body.channels.find((channel: any) => channel.id === 'slack');
  assert.equal(described.linked.slackUserId, 'U0ANN');
  assert.equal(JSON.stringify(view.body).includes('xoxb-test-token'), false);
  assert.equal(JSON.stringify(view.body).includes(secret), false);

  const bob = f.user('bob');
  slackPeople['bob@agency.example'] = { id: 'U0ANN', team_id: 'T0AGENCY' };
  await assert.rejects(f.notify.route(bob, 'POST', '/api/me/notifications/channels/slack/link', body({ email: 'bob@agency.example' })), { status: 409, code: 'slack_user_linked' });
  slackPeople['bob@agency.example'] = { id: 'U0BOB', team_id: 'T0AGENCY' };

  await f.notify.route(ann, 'DELETE', '/api/me/notifications/channels/slack/link', body(undefined));
  assert.equal(f.notify.store.targets('ann', 'slack').length, 0);
  assert.equal(f.notify.store.db.prepare('SELECT COUNT(*) AS n FROM notify_slack_links').get()!.n, 0);
});

test('a Slack notice is a direct message in Block Kit with an Open link and nothing else from the Work Item', async t => {
  const f = await fixture(t);
  const ann = f.user('ann');
  await linkSlack(f, ann, 'U0ANN');
  await f.notify.route(ann, 'PUT', '/api/me/notifications', body({ channels: ['slack'], triggers: ['review', 'budget'] }));
  await f.notify.tick();
  f.facts['7'] = { workItem: { title: 'Fix rounding token=sk-live-abcdefghijklmnop', team: 'bronze', target: null }, shifts: [{ id: 's1', budgetUsd: 20, spentUsd: 16.5, reservedUsd: 0 }] };
  f.events.push({ id: '1', at: '2026-10-30T12:00:00Z', actor: 'ploeg', action: 'work_item.awaiting_review', workItemId: '7', team: 'bronze', detail: {} });
  f.events.push({ id: '2', at: '2026-10-30T12:00:00Z', actor: 'ploeg', action: 'outcome.succeeded', workItemId: '7', team: 'bronze', detail: {} });
  await f.notify.tick();
  const posts = calls(f, '/api/chat.postMessage').slice(1).map(entry => JSON.parse(entry.body));
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0], {
    channel: 'D0ANN', text: 'A pull request is ready for review: #7 Fix rounding token=[redacted]', unfurl_links: false, unfurl_media: false,
    blocks: [
      { type: 'section', text: { type: 'plain_text', text: 'A pull request is ready for review\n#7 Fix rounding token=[redacted]', emoji: false } },
      { type: 'actions', block_id: 'unfold.notice', elements: [{ type: 'button', action_id: 'unfold.open', text: { type: 'plain_text', text: 'Open in Unfold', emoji: false }, url: 'https://unfold.example.org/#work/7' }] },
    ],
  });
  assert.doesNotMatch(JSON.stringify(posts), /16\.5|\$|sk-live/);
  assert.equal(posts[1].blocks[0].text.text.startsWith('A Work Item used 80 % of its budget'), true);
});

test('Slack rate limits are retried after Retry-After and a gone DM drops its target', async t => {
  let mode = 'limit';
  const f = await fixture(t, { slackAnswer: entry => entry.path === '/api/chat.postMessage' && mode !== 'ok' && !JSON.parse(entry.body).blocks[1]?.elements[0]?.action_id?.startsWith('unfold.link') ? (mode === 'limit' ? { status: 429, headers: { 'retry-after': '900' }, body: { ok: false, error: 'ratelimited' } } : { body: { ok: false, error: 'channel_not_found' } }) : slackApi(entry) });
  const ann = f.user('ann');
  await linkSlack(f, ann, 'U0ANN');
  await f.notify.route(ann, 'PUT', '/api/me/notifications', body({ channels: ['slack'], triggers: ['review'] }));
  await f.notify.route(ann, 'POST', '/api/me/notifications/test', body({}));
  await f.notify.dispatch();
  const [held] = f.notify.store.recent('ann', 1);
  assert.equal(held.state, 'pending');
  assert.equal(held.lastError, 'slack_ratelimited');
  assert.equal(held.nextAt, new Date(f.clock.now + 900_000).toISOString());
  mode = 'gone';
  f.clock.now += 900_000;
  await f.notify.dispatch();
  assert.equal(f.notify.store.recent('ann', 1)[0].state, 'dropped');
  assert.equal(f.notify.store.targets('ann', 'slack').length, 0);
});

async function prompt(f: Fixture, owner: User) {
  f.permissions.setOptIn(owner, sessionId, true);
  const plugin: PermissionCaller = { user: owner, scope: 'editor', credential: 'plugin-digest' };
  return f.permissions.create(plugin, sessionId, { tool: 'Bash', summary: 'Remove node_modules', waitSeconds: 120 });
}

test('a tool-permission notice offers Review and answer, and only its owner can allow it, after reviewing and confirming', async t => {
  const f = await fixture(t);
  const ann = f.user('ann');
  const bob = f.user('bob');
  await linkSlack(f, ann, 'U0ANN');
  f.clock.now += 61_000;
  await linkSlack(f, bob, 'U0BOB');
  for (const person of [ann, bob]) await f.notify.route(person, 'PUT', '/api/me/notifications', body({ channels: ['slack'], triggers: ['question'] }));
  await f.notify.tick();
  const request = await prompt(f, ann);
  await f.notify.tick();
  const notices = calls(f, '/api/chat.postMessage').slice(2).map(entry => JSON.parse(entry.body));
  assert.equal(notices.length, 1, 'only the owner is told');
  assert.equal(notices[0].channel, 'D0ANN');
  assert.deepEqual(notices[0].blocks[1].elements.map((element: any) => [element.action_id, element.text.text, element.value ?? element.url]), [
    ['unfold.open', 'Answer in Unfold', `https://unfold.example.org/#linked-session/${sessionId}`],
    ['unfold.permission.review', 'Review and answer', request.id],
  ]);
  assert.doesNotMatch(JSON.stringify(notices[0]), /Bash|node_modules/, 'the notice carries no prompt text');

  const asBob = await interact(f, { user: { id: 'U0BOB', team_id: 'T0AGENCY' }, container: { type: 'message' }, actions: [{ action_id: slackActions.permissionReview, value: request.id }] });
  assert.deepEqual(asBob.body, { answered: false, code: 'not_owner' });
  const allowBob = await interact(f, { user: { id: 'U0BOB', team_id: 'T0AGENCY' }, container: { type: 'view' }, view: { id: 'V1', hash: 'h' }, actions: [{ action_id: slackActions.permissionAllow, value: request.id }] });
  assert.deepEqual(allowBob.body, { answered: false, code: 'not_owner' });
  const stranger = await interact(f, { user: { id: 'U0EVE', team_id: 'T0AGENCY' }, actions: [{ action_id: slackActions.permissionAllow, value: request.id }] });
  assert.deepEqual(stranger.body, { answered: false, code: 'slack_not_linked' });
  assert.equal(calls(f, '/api/views.open').length, 0);

  const direct = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, container: { type: 'message' }, actions: [{ action_id: slackActions.permissionAllow, value: request.id }] });
  assert.deepEqual(direct.body, { answered: false, code: 'review_first' }, 'no one-click allow from the notice');

  const review = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, container: { type: 'message' }, actions: [{ action_id: slackActions.permissionReview, value: request.id }] });
  assert.deepEqual(review.body, { answered: false, code: 'reviewing' });
  const modal = JSON.parse(calls(f, '/api/views.open')[0].body);
  assert.equal(modal.trigger_id, '1234.5678.abcdef');
  assert.equal(modal.view.type, 'modal');
  const buttons = modal.view.blocks.at(-1).elements;
  assert.deepEqual(buttons.map((element: any) => [element.action_id, element.value, Boolean(element.confirm)]), [['unfold.permission.allow', request.id, true], ['unfold.permission.deny', request.id, true]]);
  assert.equal(f.permissions.store.get(request.id)!.state, 'pending', 'reviewing answers nothing');

  const allowed = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, container: { type: 'view' }, view: { id: 'V1', hash: 'h1' }, actions: [{ action_id: slackActions.permissionAllow, value: request.id, action_ts: '1730289600.1' }] });
  assert.deepEqual(allowed.body, { answered: true, decision: 'allow' });
  const answered = f.permissions.store.get(request.id)!;
  assert.equal(answered.state, 'answered');
  assert.equal(answered.decision, 'allow');
  assert.equal(answered.answeredBy, 'ann@agency.example');
  const [record] = f.store.actionRecords({ userId: 'ann', limit: 5 });
  assert.deepEqual([record.channel, record.action, record.target, record.inputs, record.outcome, record.confirmation], ['slack', 'POST /api/linked-sessions/:id/permissions/:requestId/answer', { kind: 'session', id: sessionId }, { decision: 'allow', request: request.id }, 'done', 'slack:V1:1730289600.1']);
  const updated = JSON.parse(calls(f, '/api/views.update')[0].body);
  assert.equal(updated.view_id, 'V1');
  assert.equal(updated.hash, 'h1');
  const twice = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, container: { type: 'view' }, view: { id: 'V1' }, actions: [{ action_id: slackActions.permissionDeny, value: request.id }] });
  assert.deepEqual(twice.body, { answered: false, code: 'permission_closed' }, 'a prompt is answered once');
});

test('with permission answers off, the notice has no Review button and Slack cannot answer', async t => {
  const f = await fixture(t, { permissionAnswers: false });
  const ann = f.user('ann');
  await linkSlack(f, ann, 'U0ANN');
  await f.notify.route(ann, 'PUT', '/api/me/notifications', body({ channels: ['slack'], triggers: ['question'] }));
  await f.notify.tick();
  const request = await prompt(f, ann);
  await f.notify.tick();
  const notice = JSON.parse(calls(f, '/api/chat.postMessage').at(-1)!.body);
  assert.deepEqual(notice.blocks[1].elements.map((element: any) => element.action_id), ['unfold.open']);
  const tried = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, container: { type: 'view' }, view: { id: 'V1' }, actions: [{ action_id: slackActions.permissionAllow, value: request.id }] });
  assert.deepEqual(tried.body, { answered: false, code: 'permission_answers_off' });
  assert.equal(f.permissions.store.get(request.id)!.state, 'pending');
});

test('anything that spends money, or any other action, is refused from Slack with a pointer to Unfold', async t => {
  const f = await fixture(t);
  const ann = f.user('ann');
  await linkSlack(f, ann, 'U0ANN');
  for (const actionId of ['unfold.work.retry', 'unfold.work.approve', 'unfold.budget.raise', 'unfold.ask']) {
    const before = f.slack.requests.length;
    const answer = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, actions: [{ action_id: actionId, value: '7' }] });
    assert.deepEqual(answer.body, { refused: actionId });
    const sent = f.slack.requests.slice(before);
    assert.deepEqual(sent.map(entry => entry.path), ['/hooks/response'], 'only the refusal is sent');
    assert.deepEqual(JSON.parse(sent[0].body), { response_type: 'ephemeral', replace_original: false, text: chatRefusal });
  }
  const opened = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, actions: [{ action_id: slackActions.open }] });
  assert.equal(opened.status, 200, 'an Open link click is acknowledged');
});

test('a response_url outside Slack is never called', async t => {
  const f = await fixture(t);
  const before = f.slack.requests.length;
  await interact(f, { user: { id: 'U0ANN' }, response_url: 'https://attacker.example/collect', actions: [{ action_id: 'unfold.work.retry' }] });
  assert.equal(f.slack.requests.length, before);
});

test('a Teams workflow URL must be HTTPS on a Power Automate host and is never shown back', async t => {
  const hosts = ['logic.azure.com', 'api.powerplatform.com'];
  assert.equal(parseWorkflowUrl('https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=s3cret', hosts).host, 'prod-12.westeurope.logic.azure.com');
  assert.equal(parseWorkflowUrl('https://default0123.ab.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/abc/triggers/manual/paths/invoke?api-version=1&sig=s3cret', hosts).hostname, 'default0123.ab.environment.api.powerplatform.com');
  for (const bad of ['http://prod-12.westeurope.logic.azure.com/x', 'https://evil.example/logic.azure.com', 'https://logic.azure.com.evil.example/x', 'https://user:pw@prod.logic.azure.com/x', 'https://10.0.0.5/x', 'not a url']) {
    assert.throws(() => parseWorkflowUrl(bad, hosts), { status: 400, code: 'teams_webhook' }, bad);
  }
  const f = await fixture(t);
  const ann = f.user('ann');
  const added = await f.notify.route(ann, 'POST', '/api/me/notifications/channels/teams/webhooks', body({ url: 'https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=s3cret', label: 'Client chat' })) as any;
  assert.equal(added.status, 201);
  assert.equal(JSON.stringify(added.body).includes('s3cret'), false, 'the API shows the host, never the URL');
  assert.deepEqual(added.body.channels.find((channel: any) => channel.id === 'teams').webhooks.map((entry: any) => [entry.host, entry.label]), [['prod-12.westeurope.logic.azure.com', 'Client chat']]);
});

test('a Teams notice is an Adaptive Card with an Open link, posted to the workflow; a deleted workflow drops its target', async t => {
  let status = 202;
  const f = await fixture(t, { teamsAnswer: () => ({ status, body: '' }) });
  const ann = f.user('ann');
  await f.notify.route(ann, 'POST', '/api/me/notifications/channels/teams/webhooks', body({ url: 'https://prod-12.westeurope.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=s3cret' }));
  await f.notify.route(ann, 'PUT', '/api/me/notifications', body({ channels: ['teams'], triggers: ['question'] }));
  await f.notify.tick();
  f.facts['9'] = { workItem: { title: 'See [this](https://evil.example) **now**', team: 'bronze', target: null }, shifts: [{ closeReason: 'question_for_person: which locale?' }] };
  f.events.push({ id: '1', at: '2026-10-30T12:00:00Z', actor: 'ploeg', action: 'work_item.needs_human', workItemId: '9', team: 'bronze', detail: {} });
  await f.notify.tick();
  assert.equal(f.teams.requests.length, 1);
  const sent = f.teams.requests[0];
  assert.equal(sent.method, 'POST');
  assert.equal(sent.path, '/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=s3cret');
  assert.equal(sent.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(sent.body), {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
        body: [
          { type: 'RichTextBlock', inlines: [{ type: 'TextRun', text: 'A question waits for you', weight: 'Bolder', size: 'Medium' }] },
          { type: 'RichTextBlock', inlines: [{ type: 'TextRun', text: '#9 See [this](https://evil.example) **now**' }] },
        ],
        actions: [{ type: 'Action.OpenUrl', title: 'Answer in Unfold', url: 'https://unfold.example.org/#work/9' }],
      },
    }],
  });
  assert.doesNotMatch(sent.body, /locale/, 'no question text');
  assert.equal(JSON.stringify(adaptiveCardMessage(workItemMessage('review', { id: '1', title: '{{DATE(2026-10-30T00:00:00Z)}}' }))).includes('{{'), false);
  status = 404;
  await f.notify.route(ann, 'POST', '/api/me/notifications/test', body({}));
  await f.notify.dispatch();
  assert.equal(f.notify.store.targets('ann', 'teams').length, 0);
});

test('one trigger occurrence is one notice per target, even when the source is read again', async t => {
  const f = await fixture(t);
  const ann = f.user('ann');
  await linkSlack(f, ann, 'U0ANN');
  await f.notify.route(ann, 'POST', '/api/me/notifications/channels/teams/webhooks', body({ url: 'https://prod-1.logic.azure.com/workflows/a?sig=one' }));
  await f.notify.route(ann, 'PUT', '/api/me/notifications', body({ channels: ['slack', 'teams'], triggers: ['review'] }));
  await f.notify.tick();
  f.facts['7'] = { workItem: { title: 'Fix rounding', team: 'bronze', target: null }, shifts: [] };
  f.events.push({ id: '5', at: '2026-10-30T12:00:00Z', actor: 'ploeg', action: 'work_item.awaiting_review', workItemId: '7', team: 'bronze', detail: {} });
  await f.notify.tick();
  f.notify.store.setCursor('ploeg-events', '0', '2026-10-30T12:00:00Z');
  await f.notify.tick();
  assert.equal(calls(f, '/api/chat.postMessage').length, 2, 'the link request and one notice');
  assert.equal(f.teams.requests.length, 1);
});

test('notices reach only readers of the Work Item, and only on channels whose flag is on for them', async t => {
  const f = await fixture(t, { flags: { 'notifications.teams': false }, readable: (user, team) => team === 'bronze' || user.id === 'bob' });
  const ann = f.user('ann');
  const bob = f.user('bob');
  await linkSlack(f, ann, 'U0ANN');
  f.clock.now += 61_000;
  await linkSlack(f, bob, 'U0BOB');
  for (const person of [ann, bob]) await f.notify.route(person, 'PUT', '/api/me/notifications', body({ channels: ['slack'], triggers: ['review'] }));
  await assert.rejects(f.notify.route(ann, 'PUT', '/api/me/notifications', body({ channels: ['teams'], triggers: ['review'] })), { code: 'notify_channel' });
  await assert.rejects(f.notify.route(ann, 'POST', '/api/me/notifications/channels/teams/webhooks', body({ url: 'https://prod-1.logic.azure.com/w?sig=x' })), { status: 404 });
  const view = await f.notify.route(ann, 'GET', '/api/me/notifications', body(undefined)) as any;
  assert.deepEqual(view.body.channels.map((channel: any) => channel.id), ['slack']);
  await f.notify.tick();
  f.facts['8'] = { workItem: { title: 'Gold work', team: 'gold', target: null }, shifts: [] };
  f.events.push({ id: '1', at: '2026-10-30T12:00:00Z', actor: 'ploeg', action: 'work_item.awaiting_review', workItemId: '8', team: 'gold', detail: {} });
  await f.notify.tick();
  const notices = calls(f, '/api/chat.postMessage').slice(2).map(entry => JSON.parse(entry.body));
  assert.deepEqual(notices.map(entry => entry.channel), ['D0BOB']);
});

test('a notice waiting for a channel whose flag went off is dropped, not sent', async t => {
  const flags: Record<string, boolean> = { 'notifications.slack': true };
  const f = await fixture(t, { flags });
  const ann = f.user('ann');
  await linkSlack(f, ann, 'U0ANN');
  await f.notify.route(ann, 'PUT', '/api/me/notifications', body({ channels: ['slack'], triggers: ['review'] }));
  await f.notify.route(ann, 'POST', '/api/me/notifications/test', body({}));
  flags['notifications.slack'] = false;
  await f.notify.dispatch();
  assert.deepEqual([f.notify.store.recent('ann', 1)[0].state, f.notify.store.recent('ann', 1)[0].lastError], ['dropped', 'channel_off']);
  const confirmed = await interact(f, { user: { id: 'U0ANN', team_id: 'T0AGENCY' }, actions: [{ action_id: slackActions.permissionReview, value: 'x' }] });
  assert.deepEqual(confirmed.body, { answered: false, code: 'notifications_off' });
});

test('the demo serves no Slack interactions', async t => {
  const f = await fixture(t, { demo: true });
  await assert.rejects(interact(f, { actions: [{ action_id: slackActions.open }] }), { status: 404 });
});

test('the Slack interactions route is public, outside the browser guard, and refuses an unsigned request', async t => {
  process.env.UNFOLD_TEST_SLACK_TOKEN = 'xoxb-api-test';
  process.env.UNFOLD_TEST_SLACK_SECRET = 'api-test-signing-secret';
  const app = await application('live', config => { config.notifications = notificationSettings({ slack: { tokenEnv: 'UNFOLD_TEST_SLACK_TOKEN', signingSecretEnv: 'UNFOLD_TEST_SLACK_SECRET' } }); });
  t.after(() => { delete process.env.UNFOLD_TEST_SLACK_TOKEN; delete process.env.UNFOLD_TEST_SLACK_SECRET; return app.close(); });
  const unsigned = await fetch(`${app.url}/api/notifications/channels/slack/interactions`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'payload=%7B%7D' });
  assert.equal(unsigned.status, 401);
  assert.equal((await unsigned.json()).error.code, 'slack_signature');
  const at = Math.floor(Date.now() / 1000);
  const raw = formOf({ type: 'block_actions', user: { id: 'U1' }, actions: [{ action_id: slackActions.open }] });
  const good = await fetch(`${app.url}/api/notifications/channels/slack/interactions`, { method: 'POST', headers: signed(raw, at, 'api-test-signing-secret'), body: raw });
  assert.equal(good.status, 200);
  const admin = await login(app.url);
  assert.equal((await request(app.url, '/api/me/notifications/channels/slack/link', { method: 'POST', cookie: admin.cookie, body: { email: 'a@b.example' } })).status, 404, 'off while notifications.push is off');
});
