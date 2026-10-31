import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import type { User } from '../src/types.ts';
import type { PloegEvent } from '../src/ploeg.ts';
import type { ActionRecord } from '../src/action-records.ts';
import { Notifications } from '../src/notify/service.ts';
import { NtfyChannel, type Transport } from '../src/notify/channels.ts';
import { NotifyStore } from '../src/notify/store.ts';
import { notificationSettings } from '../src/notify/settings.ts';
import { parsePreferences } from '../src/notify/preferences.ts';
import { handedOffMessage } from '../src/notify/triggers.ts';
import { handedOffBy } from '../src/notify/handed-off.ts';

const env = { UNFOLD_NTFY_TOKEN: 'tk_test' };
const settings = notificationSettings({ ntfy: { server: 'https://ntfy.example.org', tokenEnv: 'UNFOLD_NTFY_TOKEN' } });
const sources = ['board', 'other-board'];

type Sent = { to: string; notice: Record<string, unknown> };

function fixture(options: { readable?: (user: User, team: string) => boolean } = {}) {
  const store = new Store(':memory:');
  const sent: Sent[] = [];
  const transport: Transport = async (_url, _headers, body) => { const notice = JSON.parse(body.toString()); sent.push({ to: String(notice.topic), notice }); return { status: 200 }; };
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
    settings, baseUrl: 'https://unfold.example.org', clock: () => clock.now, ploeg,
    enabled: async () => true,
    canRead: (user, team) => options.readable ? options.readable(user, team) : team === 'bronze',
    handedOffBy: (item, before) => handedOffBy(store, item, sources, before),
    channels: [new NtfyChannel(notifyStore, settings.ntfy, transport, env)],
  });
  const user = (id: string) => { const entry = { id, name: id, role: 'operator' as const }; store.addUser({ ...entry, passwordHash: 'unused' }); return entry; };
  const topic = (id: string) => String(notify.store.targets(id, 'ntfy')[0].address.topic);
  const record = (person: User, partial: Partial<Omit<ActionRecord, 'id'>>) => store.recordAction({
    at: '2026-10-30T11:00:00.000Z', userId: person.id, userName: person.name, role: person.role, channel: 'mcp:ChatGPT', action: 'POST /api/task-sources/board/tasks/DEMO-7/handoff', method: 'POST',
    target: { kind: 'task', id: 'board:DEMO-7' }, inputs: { team: 'bronze', revision: 'r1' }, confirmation: null, status: 200, outcome: 'done', ...partial,
  });
  return { store, notify, sent, events, facts, clock, user, topic, record };
}

const event = (id: string, action: string, workItemId = '7', detail: Record<string, unknown> = {}): PloegEvent => ({ id, at: '2026-10-30T12:00:00Z', actor: 'ploeg', action, workItemId, team: 'bronze', detail });
const facts = (title: string, closeReason = '') => ({ workItem: { id: '7', title, team: 'bronze', target: null, provider: 'vikunja', externalId: 'DEMO-7' }, shifts: closeReason ? [{ id: '1', closeReason, budgetUsd: 0, spentUsd: 0, reservedUsd: 0 }] : [] });
const optIn = (f: ReturnType<typeof fixture>, person: User, triggers: string[] = [], extra: Record<string, unknown> = {}) => f.notify.route(person, 'PUT', '/api/me/notifications', async () => ({ channels: ['ntfy'], triggers, quietHours: null, ...extra }));

test('the person who handed a task off from any channel is found, and a take-back or another Team is not', () => {
  const f = fixture();
  const ann = f.user('ann');
  const bob = f.user('bob');
  const cas = f.user('cas');
  const dee = f.user('dee');
  f.record(ann, {});
  f.record(bob, { channel: 'browser' });
  f.record(bob, { at: '2026-10-30T11:30:00.000Z', action: 'DELETE /api/task-sources/board/tasks/DEMO-7/handoff', method: 'DELETE', inputs: { query: { team: 'bronze' } } });
  f.record(cas, { inputs: { team: 'silver' } });
  f.record(dee, { outcome: 'refused', status: 409 });
  const eve = f.user('eve');
  f.record(eve, { channel: 'VS Code (copilot)', action: 'POST /api/linked-sessions/abcdefgh12/work-items/7/handoff', target: { kind: 'work-item', id: '7' }, inputs: {} });
  const item = { id: '7', team: 'bronze', externalId: 'DEMO-7' };
  assert.deepEqual(handedOffBy(f.store, item, sources, '2026-10-30T12:00:00Z').sort(), ['ann', 'eve']);
  assert.deepEqual(handedOffBy(f.store, item, sources, '2026-10-30T10:00:00Z'), [], 'a hand-off recorded after the event is not its cause');
  assert.deepEqual(handedOffBy(f.store, item, ['unrelated'], '2026-10-30T12:00:00Z'), ['eve'], 'a task of a connection of another tracker is not this Work Item');
});

test('a handed-off Work Item notifies its person once per transition, with only the clipped title and a deep link', async () => {
  const f = fixture();
  const ann = f.user('ann');
  f.record(ann, {});
  await optIn(f, ann);
  await f.notify.tick();
  f.facts['7'] = facts(`Fix login <script>alert(1)</script> token=abc123 ${'x'.repeat(200)}`, 'question_for_person');
  f.events.push(event('1', 'work_item.needs_human'));
  await f.notify.tick();
  assert.equal(f.sent.length, 1);
  const notice = f.sent[0].notice;
  assert.deepEqual(Object.keys(notice).sort(), ['click', 'message', 'priority', 'tags', 'title', 'topic']);
  assert.equal(notice.title, 'Work you handed off asks you a question');
  assert.equal(notice.click, 'https://unfold.example.org/#work/7');
  assert.match(String(notice.message), /^#7 Fix login <script>alert\(1\)<\/script> token=\[redacted\] x+… · Vikunja DEMO-7$/, 'the clipped title, then the tracker task it came from');
  assert.ok(String(notice.message).length <= 125 + ' · '.length + 80, 'the title is cut to 120 characters and the task to 80');

  f.events.push(event('2', 'work_item.stale'));
  await f.notify.tick();
  assert.equal(f.sent.length, 1, 'stale after needs_human is the same transition');

  f.events.push(event('3', 'outcome.pr_opened'), event('4', 'work_item.awaiting_review'));
  await f.notify.tick();
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1].notice.title, 'Work you handed off has a pull request ready');

  f.events.push(event('5', 'work_item.awaiting_review'));
  await f.notify.tick();
  assert.equal(f.sent.length, 2, 'a second ready-for-review without a Run between is the same transition');

  f.events.push(event('6', 'outcome.review_rejected'), event('7', 'work_item.needs_human'));
  f.facts['7'] = facts('Fix login');
  await f.notify.tick();
  assert.equal(f.sent.length, 3, 'needing the person again after a Run is a new transition');
  assert.equal(f.sent[2].notice.title, 'Work you handed off needs you');
});

test('a replayed event and the general trigger never send a second notice to the person who handed it off', async () => {
  const f = fixture();
  const ann = f.user('ann');
  const bob = f.user('bob');
  f.record(ann, {});
  await optIn(f, ann, ['needs_you']);
  await optIn(f, bob, ['needs_you']);
  await f.notify.tick();
  f.facts['7'] = facts('Fix login');
  f.events.push(event('1', 'work_item.needs_human'));
  await f.notify.tick();
  f.notify.store.setCursor('ploeg-events', '0', '2026-10-30T12:00:00Z');
  await f.notify.tick();
  const byTopic = (id: string) => f.sent.filter(entry => entry.to === f.topic(id));
  assert.equal(byTopic('ann').length, 1);
  assert.equal(byTopic('ann')[0].notice.title, 'Work you handed off needs you');
  assert.equal(byTopic('bob').length, 1);
  assert.equal(byTopic('bob')[0].notice.title, 'A Work Item needs you');
});

test('turning off work I handed off stops the notices, also those already queued, and it defaults on', async () => {
  assert.equal(parsePreferences({ channels: [], triggers: [] }, []).handedOff, undefined);
  assert.equal(parsePreferences({ channels: [], triggers: [], handedOff: true }, []).handedOff, undefined);
  assert.equal(parsePreferences({ channels: [], triggers: [], handedOff: false }, []).handedOff, false);
  assert.throws(() => parsePreferences({ channels: [], triggers: [], handedOff: 'yes' }, []), /handedOff/);
  const f = fixture();
  const ann = f.user('ann');
  f.record(ann, {});
  await optIn(f, ann, [], { handedOff: false });
  await f.notify.tick();
  f.facts['7'] = facts('Fix login');
  f.events.push(event('1', 'work_item.needs_human'));
  await f.notify.tick();
  assert.equal(f.sent.length, 0);

  const g = fixture();
  const bob = g.user('bob');
  g.record(bob, {});
  await optIn(g, bob);
  g.clock.now = Date.parse('2026-10-30T12:00:00Z');
  await g.notify.tick();
  g.facts['7'] = facts('Fix login');
  g.events.push(event('1', 'work_item.needs_human'));
  await g.notify.collect();
  await optIn(g, bob, [], { handedOff: false });
  await g.notify.dispatch();
  assert.equal(g.sent.length, 0);
  assert.equal(g.notify.store.recent('bob', 1)[0].state, 'dropped');
});

test('quiet hours hold a hand-off notice, and someone who lost the Team gets none', async () => {
  const f = fixture({ readable: (user, team) => user.id === 'ann' && team === 'bronze' });
  const ann = f.user('ann');
  const gone = f.user('gone');
  f.record(ann, {});
  f.record(gone, {});
  await optIn(f, ann, [], { quietHours: { start: '11:00', end: '13:00', timeZone: 'UTC' } });
  await optIn(f, gone);
  await f.notify.tick();
  f.facts['7'] = facts('Fix login');
  f.events.push(event('1', 'work_item.needs_human'));
  await f.notify.tick();
  assert.equal(f.sent.length, 0);
  assert.equal(f.notify.store.recent('ann', 1)[0].nextAt, '2026-10-30T13:00:00.000Z');
  assert.equal(f.notify.store.recent('gone', 1).length, 0);
  f.clock.now = Date.parse('2026-10-30T13:00:00Z');
  await f.notify.dispatch();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, f.topic('ann'));
});

test('the hand-off notice keeps the trigger a channel needs for its button and urgency', () => {
  const message = handedOffMessage('question', { id: '42', title: 'Answer me' }, 'https://unfold.example.org/');
  assert.deepEqual(message, { trigger: 'question', title: 'Work you handed off asks you a question', body: '#42 Answer me', url: 'https://unfold.example.org/#work/42', tag: 'question-42', about: 'handed_off' });
});
