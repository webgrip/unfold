import test from 'node:test';
import assert from 'node:assert/strict';
import { application, request } from './api-support.ts';
import { action, connect, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { testTimeout } from './timeframes.ts';
import { awaitingReview, publishable, reviewOperationIds, reviewOperations } from '../src/ahp/review.ts';
import type { DeliveryService, DeliveryView, PublicationReadiness } from '../src/delivery.ts';
import type { Session, User } from '../src/types.ts';

const completed = { status: 'completed' } as unknown as Session;
const verified: PublicationReadiness = { enabled: true, verified: true };
const pullRequest = { number: 42, url: 'https://forge.example/acme/orders/pulls/42' };
const branch = 'unfold/wi-7/cccccccccccc';

test('a gated candidate offers only Accept and open pull request, and only once its passing receipt is recorded and publishing is enabled', () => {
  assert.deepEqual(reviewOperations(completed, true, verified).map(operation => [operation.id, operation.label]), [[reviewOperationIds.publish, 'Accept and open pull request']]);
  assert.doesNotMatch(reviewOperations(completed, true, verified)[0].description, /Nothing is pushed/);
  assert.deepEqual(reviewOperations(completed, true, { enabled: true, verified: false }), [], 'a receipt that did not pass never offers publishing');
  assert.deepEqual(reviewOperations(completed, true, { enabled: false, verified: true }), [], 'a workbench without a publisher offers nothing');
  assert.deepEqual(reviewOperations(completed, true, undefined), []);
  assert.deepEqual(reviewOperations(completed, true, { ...verified, publication: { phase: 'published', operationId: 'pub-c', branch, pullRequest } }), [], 'a published pull request is not offered again');
  assert.equal(publishable({ ...verified, publication: { phase: 'pushed', operationId: 'pub-c', branch } }), true, 'an interrupted publication can be resumed');
  assert.equal(awaitingReview({ ...completed, review: { decision: 'accepted' } } as unknown as Session, true, verified), false);
});

test('an ungated candidate keeps the note-only Accept, which says it pushes nothing', () => {
  const operations = reviewOperations(completed, false, verified);
  assert.deepEqual(operations.map(operation => operation.id), ['accept', 'request-changes', 'reject']);
  assert.match(operations[0].description, /Nothing is pushed or merged/);
});

type Published = { sessionId: string; user: User };

async function gatedSession(t: { after: (fn: () => unknown) => void }, readiness: PublicationReadiness) {
  const server = await application('demo', config => { config.delivery = { verifierTokenEnv: 'UNFOLD_TEST_VERIFIER', policies: [{ repositoryId: 'order-service' }] } as unknown as typeof config.delivery; });
  t.after(() => server.close());
  const operator = { id: 'demo-operator', name: 'Demo operator', role: 'operator' as const };
  const created = server.app.engine.create({ title: 'Gated', objective: 'Reproduce the rounding regression and fix it with the tests intact.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 }, operator);
  server.app.store.saveSession({ ...created, status: 'completed', candidate: { status: 'ready', fileCount: 1 }, execution: { id: 'a'.repeat(32), workItemId: '7', team: 'delivery', state: 'completed', stopConfirmed: true } } as unknown as Session);
  const published: Published[] = [];
  const state = { readiness };
  const delivery = {
    readiness: () => state.readiness,
    publishCurrent: async (sessionId: string, user: User): Promise<DeliveryView> => {
      published.push({ sessionId, user });
      state.readiness = { ...state.readiness, publication: { phase: 'published', operationId: 'pub-c', branch, pullRequest } };
      return { configured: true, publicationEnabled: true, publication: state.readiness.publication };
    },
  } as unknown as DeliveryService;
  server.app.agentHost!.useDelivery(delivery);
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'publish' } });
  const client = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => client.close());
  await client.open;
  await client.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId: 'publish', clientInfo: vscodeAgentsWindow, _meta: { 'vscode.ahpSessionUris': true } });
  return { client, id: created.id, session: `ahp-session:/${created.id}`, changeset: `ahp-changeset:/${created.id}`, published };
}

test('the Agents window lists Accept and open pull request on a verified gated candidate and invoking it calls the publish route', { timeout: testTimeout(60_000) }, async t => {
  const { client, id, session, changeset, published } = await gatedSession(t, verified);
  const operations = (await client.rpc('subscribe', { channel: changeset })).snapshot.state.operations as Json[];
  assert.deepEqual(operations.map(operation => operation.id), [reviewOperationIds.publish]);
  const result = await client.rpc('invokeChangesetOperation', { channel: changeset, operationId: reviewOperationIds.publish });
  assert.deepEqual(published.map(entry => entry.sessionId), [id]);
  assert.match(result.message, /Pull request #42 is open on the forge: https:\/\/forge\.example\/acme\/orders\/pulls\/42\. Merging it stays with you\./);
  const changed = await client.until(message => action(message, changeset, 'changeset/operationsChanged'));
  assert.deepEqual(changed.params.action.operations, []);
  const git = (await client.rpc('subscribe', { channel: session })).snapshot.state._meta.git;
  assert.equal(git.branchName, branch, '_meta.git names the published branch');
  assert.deepEqual(git.pullRequest, pullRequest);
});

test('Agent Merge on a verified gated candidate publishes instead of refusing, and a failing receipt is refused without publishing', { timeout: testTimeout(60_000) }, async t => {
  const { client, session, published } = await gatedSession(t, verified);
  await client.rpc('subscribe', { channel: session });
  client.notify('dispatchAction', { channel: session, clientSeq: 1, action: { type: 'session/configChanged', config: { agentMerge: { enabled: true } } } });
  const echoed = await client.until(message => action(message, session, 'session/configChanged'));
  assert.equal(echoed.params.rejectionReason, undefined);
  assert.equal(published.length, 1);

  const failing = await gatedSession(t, { enabled: true, verified: false });
  assert.deepEqual((await failing.client.rpc('subscribe', { channel: failing.changeset })).snapshot.state.operations, undefined, 'a receipt that did not pass lists no publish operation');
  await failing.client.rpc('subscribe', { channel: failing.session });
  failing.client.notify('dispatchAction', { channel: failing.session, clientSeq: 1, action: { type: 'session/configChanged', config: { agentMerge: { enabled: true } } } });
  const refused = await failing.client.until(message => action(message, failing.session, 'session/configChanged'));
  assert.match(refused.params.rejectionReason, /independent checks passed/);
  assert.equal(failing.published.length, 0);
});
