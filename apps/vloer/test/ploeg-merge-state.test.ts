import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { PloegClient } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { configuration } from './api-support.ts';

const admin = { id: 'admin', name: 'admin', role: 'admin' as const };
const conflicted = { url: 'https://forge.example.invalid/example/order-service/pulls/5', number: 5, mergeState: 'conflicted', baseBranch: 'main', headSha: 'abc123', checkedAt: '2026-10-03T09:00:00Z', agentVerdict: '', agentVerdictRound: null, humanChangesRequested: false, repairFollowUps: 0, reviews: [] };

async function ploegWith(t: TestContext, pullRequests: Record<string, unknown>) {
  const env = `VLOER_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const details = structuredClone(ploegDemo.details) as Record<string, { item: Record<string, unknown> }>;
  for (const [id, pullRequest] of Object.entries(pullRequests)) details[id].item.pullRequest = pullRequest;
  const paths: string[] = [];
  const server = createServer((req, res) => {
    paths.push(req.url!);
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (url.pathname.endsWith('/teams')) { send({ teams: ploegDemo.teams }); return; }
    if (url.pathname.endsWith('/runs')) { send({ runs: [], nextBefore: null }); return; }
    if (url.pathname.endsWith('/work-items')) {
      const items = Object.values(details).map(detail => detail.item).filter(item => item.team === url.searchParams.get('team') && (!url.searchParams.has('state') || item.state === url.searchParams.get('state')));
      send({ items, nextCursor: null }); return;
    }
    const id = url.pathname.split('/').at(-1)!;
    if (details[id]) { send(details[id]); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  const client = new PloegClient({ ...configuration('/unused', 'live'), ploeg: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env } });
  return { client, paths };
}

test('the Now projection carries a Work Item’s pull request merge state from the list, with no detail read for it', async t => {
  const { client, paths } = await ploegWith(t, { 105: conflicted });
  const now = await client.now(admin);
  const row = now.waiting.find(entry => entry.id === '105');
  assert.deepEqual(row?.pullRequest, { url: conflicted.url, number: 5, mergeState: 'conflicted', baseBranch: 'main', headSha: 'abc123', checkedAt: '2026-10-03T09:00:00Z' });
  assert.equal(row?.pullRequestUrl, conflicted.url, 'the pull request link comes from the list too');
  assert(!paths.some(path => /\/work-items\/105(\?|$)/.test(path)), `no detail read for item 105: ${paths.join(' ')}`);
});

test('the parsed pull request tells a Ploeg that reported no merge state apart from one that has not checked yet', async t => {
  const { client } = await ploegWith(t, {
    105: { url: conflicted.url, agentVerdict: '', agentVerdictRound: null, humanChangesRequested: false, repairFollowUps: 0 },
    101: null,
  });
  const page = await client.items(admin, 'delivery', 'all', '0');
  const byId = Object.fromEntries(page.items.map(entry => [entry.id, entry]));
  assert.deepEqual(byId['105'].pullRequest, { url: conflicted.url, number: null, mergeState: null, baseBranch: null, headSha: '', checkedAt: null }, 'an older Ploeg sends a pull request without a merge state');
  assert.equal(byId['101'].pullRequest, null, 'null means the Work Item has no pull request');
  assert.equal('pullRequest' in byId['102'], false, 'a Ploeg that sends no field leaves it absent');
  const detail = await client.detail(admin, '105');
  assert.equal(detail.item.pullRequest?.mergeState, null);
});

test('an unsupported merge state is read as not reported, and a malformed pull request is refused', async t => {
  const { client } = await ploegWith(t, { 105: { ...conflicted, mergeState: 'mergeable-ish' } });
  const page = await client.items(admin, 'delivery', 'all', '0');
  assert.equal(page.items.find(entry => entry.id === '105')?.pullRequest?.mergeState, null);
  const broken = await ploegWith(t, { 105: { ...conflicted, number: 'five' } });
  await assert.rejects(broken.client.items(admin, 'delivery', 'all', '0'));
});
