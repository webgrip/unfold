import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { VloerClient, type Secrets } from '../src/client.ts';
import { setApproval, approvalAvailable, approvalChoices, type ApprovalChoice } from '../src/approval.ts';
import type { Approval, Session } from '../src/types.ts';

class MemorySecrets implements Secrets {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key); }
  async store(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

function session(overrides: Partial<Session> = {}): Session {
  return { id: 'session-1', title: 'Fix rounding', objective: 'Fix it', repositoryId: 'order-service', crewId: 'delivery', runtime: 'opencode', placement: 'docker', approval: 'manual', ownerId: 'u1', ownerName: 'Ryan', status: 'running', budgetUsd: 5, spentUsd: 0, costStatus: 'pending', createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z', branch: 'vloer/session-1', runs: [], artifacts: [], ...overrides };
}

test('the approval route receives the authenticated mutation contract with the chosen mode', async t => {
  const seen: { method?: string; url?: string; body?: string; headers?: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    seen.push({ method: request.method, url: request.url, body, headers: request.headers });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ...session(), approval: JSON.parse(body).approval }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const secrets = new MemorySecrets();
  const client = new VloerClient(origin, secrets);
  await secrets.store(client.secretKey, 'vloer=abcdefghijklmnopqrstuvwxyz0123456789ABCDEF');
  const updated = await client.setApproval('session-1', 'auto');
  assert.equal(updated.approval, 'auto');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].url, '/api/sessions/session-1/approval');
  assert.deepEqual(JSON.parse(seen[0].body!), { approval: 'auto' });
  assert.equal(seen[0].headers!['x-vloer-request'], '1');
  assert.equal(seen[0].headers!.origin, origin);
  assert.equal(seen[0].headers!.cookie, 'vloer=abcdefghijklmnopqrstuvwxyz0123456789ABCDEF');
  await client.setApproval('session-1', 'manual');
  assert.deepEqual(JSON.parse(seen[1].body!), { approval: 'manual' });
  assert.throws(() => client.setApproval('session-1', 'sometimes' as Approval), /manual or auto/);
  assert.throws(() => client.setApproval('../admin', 'auto'), /Invalid remote session/);
});

test('automatic approval is offered only for active sessions on an isolated placement', () => {
  assert.equal(approvalAvailable(session()).available, true);
  assert.equal(approvalAvailable(session({ placement: 'kubernetes', status: 'queued' })).available, true);
  assert.match(approvalAvailable(session({ placement: 'local' })).reason!, /container or pod/);
  assert.match(approvalAvailable(session({ status: 'completed' })).reason!, /finished/);
  assert.deepEqual(approvalChoices.map(choice => choice.value), ['auto', 'manual']);
});

test('the set-approval command sends the picked mode and skips a no-op choice', async () => {
  const calls: [string, Approval][] = [];
  const messages: string[] = [];
  const client = { setApproval: async (id: string, approval: Approval) => { calls.push([id, approval]); return session({ approval }); } };
  const ui = (pickValue: Approval | undefined) => ({ pick: async (choices: ApprovalChoice[], current: Approval | undefined) => { assert.equal(current, 'manual'); assert.equal(choices.length, 2); return pickValue; }, info: (message: string) => { messages.push(message); } });
  assert.equal(await setApproval(client, ui(undefined), session()), undefined);
  assert.deepEqual(calls, []);
  assert.equal(await setApproval(client, ui('manual'), session()), undefined);
  assert.deepEqual(calls, []);
  assert.match(messages.at(-1)!, /already asks/);
  assert.equal(await setApproval(client, ui('auto'), session()), 'auto');
  assert.deepEqual(calls, [['session-1', 'auto']]);
  assert.match(messages.at(-1)!, /without asking/);
  await assert.rejects(setApproval(client, ui('auto'), session({ placement: 'local' })), /container or pod/);
  assert.equal(calls.length, 1, 'a refused session never reaches the client');
});
