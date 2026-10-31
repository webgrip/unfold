import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PloegClient, PloegError, demoContextRefusal } from '../src/ploeg.ts';
import { DemoPloegPort, demoFactsRefusal } from '../src/ploeg-demo-port.ts';
import type { PloegPort } from '../src/ploeg-port.ts';
import { configuration } from './api-support.ts';

const admin = { id: 'admin', name: 'admin', role: 'admin' as const };
const refused = (status: number, code: string, message?: string) => (error: unknown) => error instanceof PloegError && error.status === status && error.code === code && (message === undefined || error.message === message);

test('the demo adapter stores no context, serves no delivery facts and opens no pull request', async () => {
  const port: PloegPort = new DemoPloegPort();
  assert.equal(port.kind, 'demo');
  assert.deepEqual(await port.listContext('101', false), []);
  await assert.rejects(port.addContext('101', { actor: 'admin', name: 'notes.md', note: '', bytes: new Uint8Array([1]) }), refused(409, 'ploeg_demo', demoContextRefusal));
  assert.equal(await port.factsSupported(true), false);
  await assert.rejects(port.workItemFacts('101'), refused(503, 'cards_facts_unavailable', demoFactsRefusal));
  await assert.rejects(port.factsPage({ limit: 1 }), refused(503, 'cards_facts_unavailable', demoFactsRefusal));
  await assert.rejects(port.putPullRequestComment('101', 'unfold-card', { markdown: 'x', number: 1 }), refused(409, 'ploeg_demo'));
});

test('a demo-mode client answers context and delivery facts from the demo adapter, after its own checks', async () => {
  const demo = new PloegClient(configuration('/unused', 'demo'));
  assert.equal(demo.isDemo, true);
  assert.deepEqual(await demo.listContext(admin, '101'), { workItemId: '101', context: [], demo: true });
  await assert.rejects(demo.addContext(admin, '101', 'notes.md', '', new Uint8Array([1])), refused(409, 'ploeg_demo', demoContextRefusal));
  await assert.rejects(demo.addContext(admin, '101', 'notes.md', '', new Uint8Array()), refused(400, 'context_empty'), 'the client checks the upload before the adapter sees it');
  await assert.rejects(demo.addContext({ ...admin, role: 'viewer' }, '101', 'notes.md', '', new Uint8Array([1])), refused(403, 'forbidden'));
  await assert.rejects(demo.listContext(admin, '999999'), refused(404, 'ploeg_not_found'), 'a Work Item the demo does not hold is refused before the adapter is asked');
  assert.equal(await demo.factsSupported(), false);
  assert.throws(() => demo.workItemFacts('not-a-number'), refused(400, 'ploeg_id'));
  await assert.rejects(demo.workItemFacts('101'), refused(503, 'cards_facts_unavailable', demoFactsRefusal));
});

test('a client without a Ploeg reports no delivery facts instead of failing', async () => {
  const unconfigured = new PloegClient(configuration('/unused', 'live'));
  assert.equal(unconfigured.isDemo, false);
  assert.equal(await unconfigured.factsSupported(true), false);
});
