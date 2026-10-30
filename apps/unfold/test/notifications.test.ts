import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createECDH } from 'node:crypto';
import { Store } from '../src/store.ts';
import type { User } from '../src/types.ts';
import type { PloegEvent } from '../src/ploeg.ts';
import { Notifications, retrySchedule } from '../src/notify/service.ts';
import { NtfyChannel, WebPushChannel, ChannelRegistry, parseSubscription, publicAddress, type Transport, type HttpResult } from '../src/notify/channels.ts';
import { NotifyStore } from '../src/notify/store.ts';
import { notificationSettings } from '../src/notify/settings.ts';
import { parsePreferences, quietUntil } from '../src/notify/preferences.ts';
import { workItemMessage } from '../src/notify/triggers.ts';
import { decryptPayload, fromBase64Url, generateVapidKeys, toBase64Url, verifyVapidToken } from '../src/notify/web-push.ts';
import { reaches } from '../src/tenant-scope.ts';

type Sent = { url: string; headers: Record<string, string>; body: Buffer };
const recording = (answer: (sent: Sent) => HttpResult = () => ({ status: 201 })) => {
  const sent: Sent[] = [];
  const transport: Transport = async (url, headers, body) => { const entry = { url: url.href, headers, body }; sent.push(entry); return answer(entry); };
  return { sent, transport };
};

const browser = () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = Buffer.from('0123456789abcdef');
  return { ecdh, auth, json: { endpoint: 'https://push.example.net/send/abc', keys: { p256dh: toBase64Url(ecdh.getPublicKey()), auth: toBase64Url(auth) } } };
};

const vapid = generateVapidKeys();
const env = { UNFOLD_VAPID_PUBLIC_KEY: vapid.publicKey, UNFOLD_VAPID_PRIVATE_KEY: vapid.privateKey, UNFOLD_NTFY_TOKEN: 'tk_test' };
const settings = notificationSettings({ ntfy: { server: 'https://ntfy.example.org/', tokenEnv: 'UNFOLD_NTFY_TOKEN' }, webPush: { subject: 'mailto:ops@example.org', publicKeyEnv: 'UNFOLD_VAPID_PUBLIC_KEY', privateKeyEnv: 'UNFOLD_VAPID_PRIVATE_KEY' } });

type Fixture = { store: Store; notify: Notifications; sent: Sent[]; events: PloegEvent[]; facts: Record<string, any>; clock: { now: number }; user: (id: string, extra?: Partial<User>) => User };
function fixture(options: { demo?: boolean; flag?: (user: User) => boolean; answer?: (sent: Sent) => HttpResult; readable?: (user: User, team: string, target: any) => boolean } = {}): Fixture {
  const store = new Store(':memory:');
  const { sent, transport } = recording(options.answer);
  const events: PloegEvent[] = [];
  const facts: Record<string, any> = {};
  const clock = { now: Date.parse('2026-10-30T12:00:00Z') };
  const notifyStore = new NotifyStore(store);
  const ploeg = {
    latestEvents: async () => ({ lastCursor: '0' }),
    followEvents: async (after: string) => ({ events: events.filter(entry => BigInt(entry.id) > BigInt(after)), lastCursor: events.at(-1)?.id ?? after, more: false }),
    workItemFacts: async (id: string) => { if (!facts[id]) throw Object.assign(new Error('missing'), { status: 404 }); return facts[id]; },
  };
  const notify = new Notifications(store, {
    settings, demo: options.demo, baseUrl: 'https://unfold.example.org', clock: () => clock.now, ploeg,
    enabled: async user => options.flag ? options.flag(user) : true,
    canRead: options.readable ?? ((user, team) => user.role === 'admin' || team === 'bronze'),
    channels: [new NtfyChannel(notifyStore, settings.ntfy, transport, env), new WebPushChannel(notifyStore, settings.webPush, transport, env, () => clock.now)],
  });
  const user = (id: string, extra: Partial<User> = {}) => { const entry = { id, name: id, role: 'operator' as const, ...extra }; store.addUser({ ...entry, passwordHash: 'unused' }); return entry; };
  return { store, notify, sent, events, facts, clock, user };
}
const body = (value: unknown) => async () => value;
const event = (id: string, action: string, workItemId = '7', team = 'bronze', detail: Record<string, unknown> = {}): PloegEvent => ({ id, at: '2026-10-30T12:00:00Z', actor: 'ploeg', action, workItemId, team, detail });
const facts = (title: string, extra: Record<string, unknown> = {}) => ({ workItem: { title, team: 'bronze', target: null }, shifts: [], ...extra });

async function optIn(f: Fixture, user: User, channels: string[], triggers: string[], quietHours: unknown = null) {
  return f.notify.route(user, 'PUT', '/api/me/notifications', body({ channels, triggers, quietHours }));
}

test('settings name variables, never values, and refuse credentials in the ntfy URL', () => {
  assert.deepEqual(settings.budgetThresholds, [0.8, 1]);
  assert.equal(settings.ntfy?.server, 'https://ntfy.example.org');
  assert.throws(() => notificationSettings({ ntfy: { server: 'https://user:pw@ntfy.example.org' } }), /without credentials/);
  assert.throws(() => notificationSettings({ ntfy: { server: 'https://ntfy.example.org', tokenEnv: 'tk_abc' } }), /environment variable/);
  assert.throws(() => notificationSettings({ webPush: { subject: 'ops', publicKeyEnv: 'A', privateKeyEnv: 'B' } }), /mailto/);
  assert.throws(() => notificationSettings({ email: {} }), /does not take email/);
});

test('preferences default to nothing and refuse unknown channels, triggers and time zones', async () => {
  const f = fixture();
  const ann = f.user('ann');
  const view = await f.notify.route(ann, 'GET', '/api/me/notifications', body(undefined)) as any;
  assert.deepEqual(view.body.preferences, { channels: [], triggers: [], quietHours: null });
  assert.throws(() => parsePreferences({ channels: ['slack'], triggers: [] }, ['ntfy']), /Choose channels/);
  assert.throws(() => parsePreferences({ channels: [], triggers: ['everything'] }, ['ntfy']), /triggers/);
  assert.throws(() => parsePreferences({ channels: [], triggers: [], quietHours: { start: '22:00', end: '07:00', timeZone: 'Mars/Olympus' } }, []), /time zone/);
  f.events.push(event('1', 'work_item.needs_human'));
  f.facts['7'] = facts('Fix login');
  await f.notify.tick();
  await f.notify.tick();
  assert.equal(f.sent.length, 0);
});

test('ntfy publishes JSON with the bearer token to a real HTTP server, and the notice holds no reason, price or note', async () => {
  const received: { path: string; auth: string; json: any }[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { received.push({ path: req.url ?? '', auth: String(req.headers.authorization), json: JSON.parse(data) }); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"x"}'); });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const port = (server.address() as AddressInfo).port;
    const store = new Store(':memory:');
    const local = notificationSettings({ ntfy: { server: `http://127.0.0.1:${port}`, tokenEnv: 'UNFOLD_NTFY_TOKEN' } });
    const notifyStore = new NotifyStore(store);
    const channel = new NtfyChannel(notifyStore, local.ntfy, undefined, env);
    channel.enable('ann', '2026-10-30T12:00:00Z');
    const topic = notifyStore.targets('ann', 'ntfy')[0];
    assert.match(String(topic.address.topic), /^unfold-[A-Za-z0-9_-]{22}$/);
    const outcome = await channel.send(workItemMessage('needs_you', { id: '7', title: 'Fix login for token=abc123 at €1200' }, 'https://unfold.example.org'), topic);
    assert.deepEqual(outcome, { kind: 'delivered' });
    assert.equal(received[0].path, '/');
    assert.equal(received[0].auth, 'Bearer tk_test');
    assert.deepEqual(Object.keys(received[0].json).sort(), ['click', 'message', 'priority', 'tags', 'title', 'topic']);
    assert.equal(received[0].json.topic, topic.address.topic);
    assert.equal(received[0].json.title, 'A Work Item needs you');
    assert.equal(received[0].json.message, '#7 Fix login for token=[redacted] at €1200');
    assert.equal(received[0].json.click, 'https://unfold.example.org/#work/7');
  } finally { server.close(); }
});

test('Work Item notices are scoped: only people who read the Team and reach the owner are told', async () => {
  const f = fixture({ readable: (user, team, target) => team === 'bronze' && reaches(user, target?.owner === 'acme' ? { tenant: 'agency', client: 'acme' } : { tenant: 'agency', client: 'other' }) });
  const acme = f.user('acme-person', { memberships: [{ kind: 'client', tenant: 'agency', client: 'acme' }] });
  const other = f.user('other-person', { memberships: [{ kind: 'client', tenant: 'agency', client: 'other' }] });
  for (const person of [acme, other]) await optIn(f, person, ['ntfy'], ['needs_you']);
  await f.notify.tick();
  f.facts['7'] = facts('Acme checkout', { workItem: { title: 'Acme checkout', team: 'bronze', target: { forge: 'forgejo', owner: 'acme', repo: 'shop', baseBranch: 'main' } } });
  f.facts['8'] = facts('Gold work', { workItem: { title: 'Gold work', team: 'gold', target: null } });
  f.events.push(event('1', 'work_item.needs_human', '7'), event('2', 'work_item.needs_human', '8', 'gold'));
  await f.notify.tick();
  const topics = Object.fromEntries([acme, other].map(person => [person.id, f.notify.store.targets(person.id, 'ntfy')[0].address.topic]));
  assert.deepEqual(f.sent.map(entry => JSON.parse(entry.body.toString()).topic), [topics[acme.id]]);
});

test('each trigger occurrence is sent once, also when Ploeg events are read again', async () => {
  const f = fixture();
  const ann = f.user('ann');
  await optIn(f, ann, ['ntfy'], ['needs_you', 'question', 'review']);
  await f.notify.tick();
  f.facts['7'] = facts('Fix login', { shifts: [{ id: '3', closeReason: 'question_for_person: which locale?', budgetUsd: 10, spentUsd: 1, reservedUsd: 0 }] });
  f.facts['9'] = facts('Ship it');
  f.events.push(event('1', 'work_item.needs_human', '7'), event('2', 'work_item.awaiting_review', '9'), event('3', 'work_item.stale', '9'));
  await f.notify.tick();
  f.notify.store.setCursor('ploeg-events', '0', '2026-10-30T12:00:00Z');
  await f.notify.tick();
  const titles = f.sent.map(entry => JSON.parse(entry.body.toString()).title);
  assert.deepEqual(titles, ['A question waits for you', 'A pull request is ready for review', 'A Work Item needs you']);
  assert.ok(!f.sent.some(entry => entry.body.toString().includes('locale')));
});

test('a budget notice names the highest share crossed once per Shift, never an amount', async () => {
  const f = fixture();
  const ann = f.user('ann');
  await optIn(f, ann, ['ntfy'], ['budget']);
  await f.notify.tick();
  f.facts['7'] = facts('Big refactor', { shifts: [{ id: '4', closeReason: '', budgetUsd: 20, spentUsd: 15, reservedUsd: 1.5 }] });
  f.events.push(event('1', 'outcome.pr_opened', '7'), event('2', 'outcome.pr_updated', '7'));
  await f.notify.tick();
  assert.equal(f.sent.length, 1);
  const sent = JSON.parse(f.sent[0].body.toString());
  assert.equal(sent.title, 'A Work Item used 80 % of its budget');
  assert.doesNotMatch(f.sent[0].body.toString(), /20|16\.5|\$/);
  f.facts['7'].shifts[0].spentUsd = 20;
  f.events.push(event('3', 'outcome.failed', '7'));
  await f.notify.tick();
  assert.equal(JSON.parse(f.sent[1].body.toString()).title, 'A Work Item used 100 % of its budget');
});

test('a tool-permission request notifies only the owner of the Linked Session', async () => {
  const f = fixture();
  const ann = f.user('ann');
  const bob = f.user('bob');
  for (const person of [ann, bob]) await optIn(f, person, ['ntfy'], ['question']);
  f.store.db.exec('CREATE TABLE IF NOT EXISTS linked_session_permissions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, state TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL)');
  await f.notify.tick();
  f.store.db.prepare('INSERT INTO linked_session_permissions VALUES (?,?,?,?,?,?)').run('p1', 'session-abcdefgh', 'pending', '2026-10-30T13:00:00Z', '2026-10-30T12:00:00Z', JSON.stringify({ ownerId: 'ann', tool: 'Bash', summary: 'rm -rf /' }));
  await f.notify.tick();
  assert.equal(f.sent.length, 1);
  const sent = JSON.parse(f.sent[0].body.toString());
  assert.equal(sent.topic, f.notify.store.targets('ann', 'ntfy')[0].address.topic);
  assert.equal(sent.click, 'https://unfold.example.org/#linked-session/session-abcdefgh');
  assert.doesNotMatch(f.sent[0].body.toString(), /Bash|rm -rf/);
});

test('a Client Sign-off notifies the readers of its Work Item', async () => {
  const f = fixture();
  const ann = f.user('ann');
  await optIn(f, ann, ['ntfy'], ['sign_off']);
  f.store.db.exec('CREATE TABLE IF NOT EXISTS client_sign_offs (id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL, pull_request_id TEXT NOT NULL, head_sha TEXT NOT NULL, state TEXT NOT NULL, recorded_at TEXT NOT NULL, body TEXT NOT NULL)');
  await f.notify.tick();
  f.facts['7'] = facts('Landing page');
  f.store.db.prepare('INSERT INTO client_sign_offs VALUES (?,?,?,?,?,?,?)').run('s1', '7', 'pr', 'abc', 'current', '2026-10-30T12:00:00Z', JSON.stringify({ note: 'client secret note' }));
  await f.notify.tick();
  assert.equal(JSON.parse(f.sent[0].body.toString()).title, 'A Client Sign-off was recorded');
  assert.doesNotMatch(f.sent[0].body.toString(), /secret note/);
});

test('quiet hours hold a notice until they end, in the person\'s time zone', async () => {
  assert.equal(quietUntil({ start: '22:00', end: '07:00', timeZone: 'Europe/Amsterdam' }, Date.parse('2026-10-30T22:30:00Z')), Date.parse('2026-10-31T06:00:00Z'));
  assert.equal(quietUntil({ start: '22:00', end: '07:00', timeZone: 'Europe/Amsterdam' }, Date.parse('2026-10-30T12:00:00Z')), null);
  assert.equal(quietUntil({ start: '09:00', end: '17:00', timeZone: 'UTC' }, Date.parse('2026-10-30T16:59:30Z')), Date.parse('2026-10-30T17:00:00Z'));
  const f = fixture();
  const ann = f.user('ann');
  f.clock.now = Date.parse('2026-10-30T22:00:00Z');
  await optIn(f, ann, ['ntfy'], ['needs_you'], { start: '22:00', end: '07:00', timeZone: 'Europe/Amsterdam' });
  await f.notify.tick();
  f.facts['7'] = facts('Night work');
  f.events.push(event('1', 'work_item.needs_human'));
  await f.notify.tick();
  assert.equal(f.sent.length, 0);
  assert.equal(f.notify.store.recent('ann', 1)[0].nextAt, '2026-10-31T06:00:00.000Z');
  f.clock.now = Date.parse('2026-10-31T06:00:00Z');
  await f.notify.dispatch();
  assert.equal(f.sent.length, 1);
});

test('a failed send is retried on the schedule and given up after the last attempt', async () => {
  let status = 503;
  const f = fixture({ answer: () => ({ status }) });
  const ann = f.user('ann');
  await optIn(f, ann, ['ntfy'], ['review']);
  await f.notify.tick();
  f.facts['9'] = facts('Ship it');
  f.events.push(event('1', 'work_item.awaiting_review', '9'));
  await f.notify.tick();
  let entry = f.notify.store.recent('ann', 1)[0];
  assert.equal(entry.state, 'pending');
  assert.equal(Date.parse(entry.nextAt) - f.clock.now, retrySchedule[0]);
  for (let step = 1; step <= retrySchedule.length; step++) { f.clock.now = Date.parse(f.notify.store.recent('ann', 1)[0].nextAt); await f.notify.dispatch(); }
  entry = f.notify.store.recent('ann', 1)[0];
  assert.equal(entry.state, 'dead');
  assert.equal(entry.attempts, retrySchedule.length + 1);
  status = 400;
  const failed = fixture({ answer: () => ({ status: 400 }) });
  const bob = failed.user('bob');
  await optIn(failed, bob, ['ntfy'], ['review']);
  await failed.notify.route(bob, 'POST', '/api/me/notifications/test', body({}));
  await failed.notify.dispatch();
  assert.equal(failed.notify.store.recent('bob', 1)[0].state, 'dead');
});

test('Web Push sends an RFC 8291 message with a VAPID header, and a 410 deletes the subscription', async () => {
  let status = 201;
  const f = fixture({ answer: () => ({ status }) });
  const ann = f.user('ann');
  const device = browser();
  await optIn(f, ann, ['web-push'], ['review']);
  const subscribed = await f.notify.route(ann, 'POST', '/api/me/notifications/channels/web-push/subscriptions', body(device.json)) as any;
  assert.equal(subscribed.status, 201);
  const push = subscribed.body.channels.find((channel: any) => channel.id === 'web-push');
  assert.equal(push.publicKey, vapid.publicKey);
  assert.deepEqual(push.subscriptions.map((entry: any) => entry.host), ['push.example.net']);
  await f.notify.tick();
  f.facts['9'] = facts('Ship it');
  f.events.push(event('1', 'work_item.awaiting_review', '9'));
  await f.notify.tick();
  const sent = f.sent[0];
  assert.equal(sent.url, device.json.endpoint);
  assert.equal(sent.headers['content-encoding'], 'aes128gcm');
  assert.equal(sent.headers.ttl, '86400');
  const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(sent.headers.authorization)!;
  assert.equal(key, vapid.publicKey);
  assert.equal(verifyVapidToken(token, vapid.publicKey)?.aud, 'https://push.example.net');
  const notice = JSON.parse(decryptPayload(sent.body, device.ecdh.getPrivateKey(), device.auth).toString());
  assert.deepEqual(notice, { title: 'A pull request is ready for review', body: '#9 Ship it', url: 'https://unfold.example.org/#work/9', tag: 'review-9' });
  status = 410;
  f.events.push(event('2', 'work_item.awaiting_review', '9'));
  await f.notify.tick();
  assert.equal(f.notify.store.targets('ann', 'web-push').length, 0);
  assert.equal(f.notify.store.recent('ann', 1)[0].state, 'dropped');
});

test('a push endpoint must be HTTPS on a public host', () => {
  const device = browser();
  for (const endpoint of ['http://push.example.net/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://169.254.169.254/latest']) {
    assert.throws(() => parseSubscription({ ...device.json, endpoint }), /public host/, endpoint);
  }
  assert.throws(() => parseSubscription({ ...device.json, keys: { p256dh: 'AAAA', auth: device.json.keys.auth } }), /keys/);
  assert.equal(parseSubscription(device.json).endpoint, device.json.endpoint);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('192.168.1.10'), false);
  assert.equal(publicAddress('::ffff:10.0.0.1'), false);
});

test('a person can only remove their own subscription, and forgetting removes everything', async () => {
  const f = fixture();
  const ann = f.user('ann');
  const bob = f.user('bob');
  const added = await f.notify.route(ann, 'POST', '/api/me/notifications/channels/web-push/subscriptions', body(browser().json)) as any;
  await assert.rejects(f.notify.route(bob, 'DELETE', `/api/me/notifications/channels/web-push/subscriptions/${added.body.result.id}`, body(undefined)), { status: 404 });
  await optIn(f, ann, ['ntfy', 'web-push'], ['review']);
  await f.notify.route(ann, 'DELETE', '/api/me/notifications', body(undefined));
  assert.equal(f.notify.store.targets('ann', 'web-push').length, 0);
  assert.equal(f.notify.store.targets('ann', 'ntfy').length, 0);
  assert.deepEqual(f.notify.store.preferences('ann').channels, []);
});

test('while the flag is off for a person, nothing is queued and changes are refused', async () => {
  let on = true;
  const f = fixture({ flag: () => on });
  const ann = f.user('ann');
  await optIn(f, ann, ['ntfy'], ['needs_you']);
  on = false;
  assert.deepEqual((await f.notify.route(ann, 'GET', '/api/me/notifications', body(undefined))).body, { enabled: false, demo: false });
  await assert.rejects(optIn(f, ann, ['ntfy'], ['needs_you']), { status: 404, code: 'notifications_off' });
  await f.notify.tick();
  f.facts['7'] = facts('Fix login');
  f.events.push(event('1', 'work_item.needs_human'));
  await f.notify.tick();
  assert.equal(f.notify.store.recent('ann', 5).length, 0);
});

test('the demo follows nothing and sends nothing, and says so', async () => {
  const f = fixture({ demo: true });
  const ann = f.user('ann');
  await optIn(f, ann, ['ntfy'], ['needs_you']);
  f.facts['7'] = facts('Fix login');
  f.events.push(event('1', 'work_item.needs_human'));
  f.notify.start();
  await f.notify.tick();
  const answer = await f.notify.route(ann, 'POST', '/api/me/notifications/test', body({})) as any;
  f.notify.stop();
  assert.deepEqual(answer.body, { demo: true, queued: 0, message: 'The demo sends no notifications.' });
  assert.equal(f.sent.length, 0);
  assert.equal(f.notify.store.cursor('ploeg-events'), undefined);
  assert.equal((await f.notify.route(ann, 'GET', '/api/me/notifications', body(undefined)) as any).body.demo, true);
});

test('the registry refuses a second channel with the same id, and lists only configured channels as available', () => {
  const store = new NotifyStore(new Store(':memory:'));
  const registry = new ChannelRegistry().register(new NtfyChannel(store, settings.ntfy, undefined, env)).register(new WebPushChannel(store, undefined, undefined, env));
  assert.deepEqual(registry.available(), ['ntfy']);
  assert.throws(() => registry.register(new NtfyChannel(store, undefined)), /already registered/);
  assert.equal(new NtfyChannel(store, settings.ntfy, undefined, {}).available(), false);
  assert.equal(new WebPushChannel(store, settings.webPush, undefined, { UNFOLD_VAPID_PUBLIC_KEY: vapid.publicKey, UNFOLD_VAPID_PRIVATE_KEY: generateVapidKeys().privateKey }).available(), false);
  assert.ok(fromBase64Url(vapid.publicKey).length === 65);
});
