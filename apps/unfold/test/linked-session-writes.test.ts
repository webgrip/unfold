import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LinkedSessions, parseLinkedEvent, type LinkedPloeg } from '../src/linked-sessions.ts';
import type { User } from '../src/types.ts';

const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
const id = '0f6c1c9e-1111-4222-8333-944445555666';
const at = new Date('2026-10-24T10:00:00.000Z');
const base = 'https://unfold.example.org';

function gatedPloeg() {
  let open: () => void = () => {};
  const gate = new Promise<void>(resolve => { open = resolve; });
  const ploeg: LinkedPloeg = {
    async detail(_user, item) { await gate; return { item: { id: item, title: 'Fix login', provider: 'vikunja', externalId: '2051' } }; },
    async trackerItems(_user, provider, externalId) { await gate; return { items: provider === 'vikunja' && externalId === '2051' ? [{ id: '184', state: 'active' }] : [] }; },
  };
  return { ploeg, open: () => open() };
}

const event = (fields: Record<string, unknown>) => parseLinkedEvent({ harness: 'claude-code', sessionId: id, event: 'prompt', ...fields }, at);

function writeBehind(linked: LinkedSessions): void {
  const current = linked.store.get(id)!;
  current.handovers = [...(current.handovers ?? []), { kind: 'handoff', workItemId: '184', at: at.toISOString() }];
  linked.store.save(current);
}

test('a hook report that waits on Ploeg keeps a hand-over recorded while it waited', async () => {
  const { ploeg, open } = gatedPloeg();
  const linked = new LinkedSessions(new DatabaseSync(':memory:'), {} as never, ploeg, { now: () => at });
  linked.store.save({ id, harness: 'claude-code', harnessVersion: '', ownerId: owner.id, ownerName: owner.name, title: '', repository: '', branch: '', model: '', remoteUrl: '', status: 'idle', waitingFor: '', startedAt: at.toISOString(), lastSeenAt: at.toISOString(), endedAt: null, workItems: [], dismissed: [], resolvedBranch: '', pullRequests: [], commits: [] });
  const pending = linked.report(owner, event({ branch: 'feat/vik-2051-login' }), base);
  writeBehind(linked);
  open();
  const { session } = await pending;
  assert.deepEqual(session.workItems.map(entry => entry.id), ['184']);
  assert.equal(linked.store.get(id)!.handovers?.length, 1, 'the report did not overwrite the hand-over');
  assert.equal(linked.store.get(id)!.resolvedBranch, 'feat/vik-2051-login');
});

test('linking a Work Item that waits on Ploeg keeps what a hook report wrote meanwhile', async () => {
  const { ploeg, open } = gatedPloeg();
  const linked = new LinkedSessions(new DatabaseSync(':memory:'), {} as never, ploeg, { now: () => at });
  await (async () => { open(); await linked.report(owner, event({}), base); })();
  const gated = gatedPloeg();
  const slow = new LinkedSessions((linked.store as unknown as { db: DatabaseSync }).db, {} as never, gated.ploeg, { now: () => at });
  const pending = slow.setLink(owner, id, '185', true, base);
  writeBehind(slow);
  gated.open();
  await pending;
  const stored = slow.store.get(id)!;
  assert.deepEqual(stored.workItems.map(entry => entry.id), ['185']);
  assert.equal(stored.handovers?.length, 1, 'the link did not overwrite the hand-over');
});
