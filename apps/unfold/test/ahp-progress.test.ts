import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { application, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { activity, closedToMessages } from '../src/ahp/host.ts';
import type { Event, Session } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));

async function stoppedSession(t: { after: (fn: () => unknown) => void }) {
  const server = await application();
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: fixture.session.title, objective: fixture.session.objective, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  const session: Session = { ...created, ...fixture.session, id: created.id, repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', ownerId: created.ownerId, ownerName: created.ownerName, runs: fixture.session.runs.map((run: Json) => ({ ...run, sessionId: created.id })) };
  server.app.store.saveSession(session);
  for (const event of fixture.events as Event[]) server.app.store.appendEvent(created.id, event.type, event.actor, event.data, event.runId);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'progress' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'progress', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true }, initialSubscriptions: ['ahp-root://'] });
  const channel = `ahp-session:/${created.id}`;
  return { server, client, id: created.id, channel, chat: defaultChatOf(channel), session };
}

test('the 059675b9 session reads as stopped in the Agents window: activity, an outcome that ends the turn, and a blocked composer', { timeout: testTimeout(60_000) }, async t => {
  const { client, channel, chat, session } = await stoppedSession(t);
  assert.equal(activity(session), 'Stopped · Ploeg holds it for reconciliation');
  assert.equal(closedToMessages(session), true);
  const [summary] = (await client.rpc('listSessions', { channel: 'ahp-root://' })).items;
  assert.equal(summary.activity, 'Stopped · Ploeg holds it for reconciliation');
  const state = (await client.rpc('subscribe', { channel })).snapshot.state;
  const blocked = state._meta['vscode.chatInputState'][state.defaultChat];
  assert.equal(blocked.kind, 'blocked');
  assert.equal(blocked.error.errorType, 'UnfoldSessionClosed');
  assert.match(blocked.error.message, /^Stopped: Reviewer approved in its transcript · stopped before delivery\. No crew will read a message here\./);
  assert.ok(state._meta['dev.webgrip.unfold'], 'Unfold\'s own facts stay beside the block');
  const turns = (await client.rpc('subscribe', { channel: chat })).snapshot.state.turns;
  const parts = turns.flatMap((turn: Json) => turn.responseParts);
  assert.ok(parts.some((part: Json) => part.kind === 'systemNotification' && part.content === 'Implementer started · writes the change'));
  assert.ok(parts.some((part: Json) => part.kind === 'systemNotification' && part.content === 'Reviewer started · reads the change and gives a verdict'));
  assert.ok(parts.some((part: Json) => part.kind === 'markdown' && /^\*\*Implementer\*\* finished\./.test(part.content)));
  const outcome = turns.at(-1).responseParts.at(-1);
  assert.equal(outcome.kind, 'markdown');
  assert.match(outcome.content, /^\*\*Stopped\*\* · Reviewer approved in its transcript · stopped before delivery/);
  assert.match(outcome.content, /approved in its transcript \(not recorded\)/);
  assert.match(outcome.content, /Spend: US\$\s0,03 \(observed, not settled · of US\$\s0,25\)/);
  assert.match(outcome.content, /Next: Investigate · View change/);
  assert.equal(turns.at(-1).state, 'complete');
  assert.equal(parts.filter((part: Json) => part.kind === 'markdown' && /^\*\*Stopped\*\*/.test(part.content)).length, 1, 'the outcome is said once');
});

test('a message into a session that will not run again is answered, not silently accepted', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, chat } = await stoppedSession(t);
  await client.rpc('subscribe', { channel: chat });
  server.app.store.appendEvent(id, 'message', 'demo-operator', { role: 'operator', text: 'Make it even funnier.' });
  const notice = await client.until(message => action(message, chat, 'chat/responsePart') && message.params.action.part.kind === 'systemNotification');
  assert.match(notice.params.action.part.content, /^No crew will read this message: ploeg stopped the execution and holds it for reconciliation\./);
  assert.match(notice.params.action.part.content, /Instead: Investigate, View change, from VS Code's Work Item view or the session page\./);
});

test('a session that stops while a client watches gets the composer block through session/metaChanged', { timeout: testTimeout(60_000) }, async t => {
  const { server, client, id, channel, session } = await stoppedSession(t);
  server.app.store.saveSession({ ...session, status: 'running', blocker: undefined, execution: { ...session.execution!, state: 'running', stopConfirmed: false } });
  const before = (await client.rpc('subscribe', { channel })).snapshot.state;
  assert.equal(before._meta['vscode.chatInputState'], undefined, 'a running session takes messages');
  server.app.store.saveSession({ ...server.app.store.getSession(id)!, status: 'interrupted', blocker: fixture.session.blocker, updatedAt: new Date().toISOString() });
  const changed = await client.until(message => action(message, channel, 'session/metaChanged'));
  assert.equal(Object.values(changed.params.action._meta['vscode.chatInputState'] as Record<string, Json>)[0].kind, 'blocked');
});
