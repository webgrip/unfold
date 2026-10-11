import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { UnfoldClient, type Secrets } from '../src/client.ts';
import { deliveryGated, publicationOffer, readPublication } from '../src/publication.ts';
import type { Bootstrap, DeliveryView, Session } from '../src/types.ts';

const secrets: Secrets = { get: async () => undefined, store: async () => undefined, delete: async () => undefined };
const policy = 'b'.repeat(64);
const candidate = { id: 'c'.repeat(32), policySha256: policy, canonicalSha: 'a'.repeat(40) };
const receipt = { id: 'd'.repeat(32), passed: true };
const delivery = (extra: Partial<DeliveryView> = {}): DeliveryView => ({ configured: true, policySha256: policy, candidate, receipt, approval: null, publicationEnabled: true, ...extra });
const session = { id: 's1', status: 'completed', repositoryId: 'orders', execution: { id: 'e', workItemId: '7', team: 'silver', state: 'completed' }, candidate: { status: 'ready' } } as unknown as Session;
const bootstrap = { user: { id: 'u', name: 'Ryan', role: 'operator' }, deliveryRepositories: ['orders'] } as unknown as Bootstrap;

test('a verified candidate under an enabled publisher is offered with exactly the displayed identities', () => {
  const offer = publicationOffer(delivery(), false)!;
  assert.equal(offer.offered, true);
  assert.deepEqual(offer.binding, { candidateId: candidate.id, receiptId: receipt.id, policySha256: policy });
  assert.equal(offer.title, 'Opens after your decision');
});

test('a receipt that did not pass, a changed policy, a viewer or a disabled publisher is never offered', () => {
  assert.equal(publicationOffer(delivery({ receipt: { ...receipt, passed: false } }), false)?.offered, false);
  assert.equal(publicationOffer(delivery({ policySha256: 'e'.repeat(64) }), false)?.offered, false);
  assert.equal(publicationOffer(delivery(), true)?.offered, false);
  assert.equal(publicationOffer(delivery({ publicationEnabled: false }), false), undefined, 'without a publisher the panel keeps its note-only Accept');
});

test('each publication phase reads as its stage, and only a verified https pull request becomes a link', () => {
  const at = (phase: NonNullable<DeliveryView['publication']>['phase'], extra = {}) => publicationOffer(delivery({ publication: { phase, operationId: 'pub-c', branch: 'unfold/wi-7/cccc', ...extra } }), false)!;
  assert.deepEqual([at('pushed').state, at('pushed').title, at('pushed').offered], ['publishing', 'Publishing…', true]);
  const published = at('published', { pullRequest: { number: 7, url: 'https://forge.example/acme/orders/pulls/7' } });
  assert.deepEqual([published.state, published.title, published.offered, published.pullRequest?.number], ['published', 'Pull request #7', false, 7]);
  assert.equal(at('published', { pullRequest: { number: 7, url: 'javascript:alert(1)' } }).pullRequest, undefined);
  assert.match(at('recovery_required').detail, /Nothing was pushed/);
  assert.equal(at('unknown').title, 'Needs recovery');
  const refused = publicationOffer(delivery({ publicationEnabled: false, publication: { phase: 'refused', operationId: 'pub-c', branch: 'b' } }), false)!;
  assert.deepEqual([refused.title, refused.offered], ['Refused', false]);
});

test('only a completed gated session with a captured candidate reads its delivery', () => {
  assert.equal(deliveryGated(session, bootstrap), true);
  assert.equal(deliveryGated({ ...session, execution: undefined }, bootstrap), false);
  assert.equal(deliveryGated(session, { ...bootstrap, deliveryRepositories: [] }), false);
  assert.equal(deliveryGated({ ...session, status: 'running' }, bootstrap), false);
});

async function serve(handler: (request: IncomingMessage, body: string, response: ServerResponse) => void) {
  const server = createServer((request, response) => { let body = ''; request.on('data', chunk => { body += chunk; }); request.on('end', () => handler(request, body, response)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('the panel reads the delivery view and publish posts exactly the displayed identities to the publish route', async () => {
  const seen: { method?: string; url?: string; body: string }[] = [];
  const server = await serve((request, body, response) => {
    seen.push({ method: request.method, url: request.url, body });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(request.method === 'GET' ? delivery() : delivery({ publication: { phase: 'published', operationId: 'pub-c', branch: 'b', pullRequest: { number: 7, url: 'https://forge.example/p/7' } } })));
  });
  try {
    const client = new UnfoldClient(server.url, secrets);
    const offer = await readPublication(client, session, bootstrap);
    assert.equal(offer?.offered, true);
    const view = await client.publish(session.id, offer!.binding!);
    assert.equal(view.publication?.pullRequest?.number, 7);
    assert.deepEqual(seen.map(entry => [entry.method, entry.url]), [['GET', '/api/sessions/s1/delivery'], ['POST', '/api/sessions/s1/delivery/publish']]);
    assert.deepEqual(JSON.parse(seen[1].body), { candidateId: candidate.id, receiptId: receipt.id, policySha256: policy });
    assert.equal(await readPublication(client, { ...session, execution: undefined }, bootstrap), undefined, 'an ungated session never asks for delivery');
    assert.equal(seen.length, 2);
  } finally { await server.close(); }
});
