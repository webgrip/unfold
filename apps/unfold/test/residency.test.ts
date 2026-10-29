import test from 'node:test';
import assert from 'node:assert/strict';
import { outsidePolicy, readsGatewayLedger, residencyPlaces, residencyReport } from '../src/residency.ts';
import { Store } from '../src/store.ts';
import { StatusBoard } from '../src/status.ts';
import type { AppConfig, GatewayRequest, Session, User } from '../src/types.ts';

const now = new Date('2026-10-29T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const live = { mode: 'live', runtime: { kind: 'opencode', backend: 'kubernetes', timeoutMs: 30_000 }, kubernetes: { namespace: 'workspaces', image: 'agent', storageSize: '1Gi', cpu: '1', memory: '1Gi', runtimeClassName: 'kata' }, litellm: { baseUrl: 'https://gateway.example/v1', adminUrl: 'https://gateway.example', masterKey: 'key', models: ['coding'], ttl: '4h' }, ploeg: { url: 'http://ploeg.internal:8080', tokenEnv: 'PLOEG_TOKEN' }, gatewayPolicy: { providers: ['anthropic'], regions: ['eu'] } } as unknown as AppConfig;
const managed = { ...live, gatewayPolicy: undefined, execution: { team: 'bronze' }, litellm: { ...live.litellm!, masterKey: '' } } as AppConfig;
const demo = { ...live, mode: 'demo', gatewayPolicy: undefined, ploeg: { url: 'http://demo', demo: true } } as AppConfig;

function request(id: string, at: string, provider?: string, geo?: string, extra: Partial<GatewayRequest> = {}): GatewayRequest {
  return { id, at, model: 'coding', ...(provider ? { provider } : {}), ...(geo ? { geo } : {}), retries: 0, fallbacks: 0, guardrails: [], cacheHit: false, cachedTokens: 0, inputTokens: 10, outputTokens: 5, usd: 0.01, status: 'success', ...extra };
}

function session(id: string, ownerId: string, requests: GatewayRequest[], extra: Partial<Session> = {}): Session {
  return { id, ownerId, title: `Session ${id}`, status: 'completed', updatedAt: now.toISOString(), requests, runs: [{ id: `${id}-writer`, roleId: 'writer', roleName: 'Writer', startedAt: hoursAgo(200) }], artifacts: [], ...extra } as unknown as Session;
}

test('a request is outside the policy only for a provider or region the policy names and the request reports', () => {
  const policy = { providers: ['anthropic'], regions: ['eu'] };
  assert.equal(outsidePolicy(policy, { provider: 'anthropic', geo: 'eu' }), '');
  assert.equal(outsidePolicy(policy, { provider: 'openai', geo: 'us' }), 'provider openai, region us');
  assert.equal(outsidePolicy(policy, { provider: 'anthropic', geo: 'global' }), 'region global');
  assert.equal(outsidePolicy(policy, {}), '');
  assert.equal(outsidePolicy({ regions: ['eu'] }, { provider: 'openai', geo: 'eu' }), '');
  assert.equal(outsidePolicy(undefined, { provider: 'openai', geo: 'us' }), '');
});

test('the line counts providers and regions per window and marks each against the policy', () => {
  const sessions = [session('a', 'u1', [request('1', hoursAgo(1), 'anthropic', 'eu'), request('2', hoursAgo(2), 'anthropic', 'eu'), request('3', hoursAgo(50), 'anthropic'), request('4', hoursAgo(400), 'openai', 'us')])];
  const report = residencyReport({ config: live, sessions, now, admin: true, visible: () => true });
  assert.equal(report.state, 'ok');
  assert.equal(report.summary, 'Every request in the last 7 days stayed within the policy (3 requests).');
  assert.deepEqual(report.policy, { providers: ['anthropic'], regions: ['eu'], enforcedBy: 'unfold' });
  assert.equal(report.source, 'gateway_ledger');
  const [day, week] = report.windows;
  assert.deepEqual([day.id, day.requests, day.outside], ['24h', 2, 0]);
  assert.deepEqual(day.providers, [{ name: 'anthropic', requests: 2, allowed: true }]);
  assert.deepEqual(week.regions, [{ name: 'eu', requests: 2, allowed: true }]);
  assert.deepEqual(week.unreported, { provider: 0, region: 1 });
  assert.equal(week.since, hoursAgo(168));
});

test('requests outside the policy make the line degraded and link the reader’s own sessions, Runs and Work Items only', () => {
  const mine = session('mine', 'u1', [request('1', hoursAgo(1), 'openai', 'us'), request('2', hoursAgo(3), 'anthropic', 'eu', { roleId: 'writer' })], { execution: { workItemId: '245' } as Session['execution'] });
  mine.requests![0].roleId = 'writer';
  const theirs = session('theirs', 'u2', [request('3', hoursAgo(30), 'anthropic', 'global', { violation: 'region global' })]);
  const report = residencyReport({ config: live, sessions: [mine, theirs], now, admin: false, visible: id => id === 'mine' });
  assert.equal(report.state, 'degraded');
  assert.equal(report.summary, '2 requests in the last 7 days went to a provider or region outside the policy.');
  assert.deepEqual(report.windows.map(window => window.outside), [1, 2]);
  assert.deepEqual(report.windows[0].providers, [{ name: 'anthropic', requests: 1, allowed: true }, { name: 'openai', requests: 1, allowed: false }]);
  assert.deepEqual(report.outside, [
    { at: hoursAgo(1), model: 'coding', provider: 'openai', region: 'us', reason: 'provider openai, region us', session: { id: 'mine', title: 'Session mine' }, run: { id: 'mine-writer', roleName: 'Writer' }, workItemId: '245' },
    { at: hoursAgo(30), model: 'coding', provider: 'anthropic', region: 'global', reason: 'region global' },
  ]);
  assert.equal(JSON.stringify(report).includes('Session theirs'), false);
});

test('a recorded violation counts even after the policy changed, and the list stops at twenty with the rest counted', () => {
  const requests = Array.from({ length: 25 }, (_, index) => request(String(index), hoursAgo(index + 1), 'openai', 'us', { violation: 'provider openai' }));
  const report = residencyReport({ config: { ...live, gatewayPolicy: { providers: ['anthropic', 'openai'] } } as AppConfig, sessions: [session('a', 'u1', requests)], now, admin: true, visible: () => true });
  assert.equal(report.outside.length, 20);
  assert.equal(report.outsideHidden, 5);
  assert.equal(report.outside[0].reason, 'provider openai');
  assert.equal(report.outside[0].at, hoursAgo(1));
});

test('without a policy nothing counts as outside it, and without requests the line is idle', () => {
  const sessions = [session('a', 'u1', [request('1', hoursAgo(1), 'openai', 'us')])];
  const open = residencyReport({ config: { ...live, gatewayPolicy: undefined } as AppConfig, sessions, now, admin: true, visible: () => true });
  assert.equal(open.state, 'unchecked');
  assert.equal(open.summary, 'No provider or region policy is set, so nothing counts as outside it. One request reached the gateway in the last 7 days.');
  assert.deepEqual(open.windows[0].providers, [{ name: 'openai', requests: 1, allowed: null }]);
  assert.deepEqual(open.policy, { providers: null, regions: null, enforcedBy: 'none' });
  const quiet = residencyReport({ config: live, sessions: [], now, admin: true, visible: () => true });
  assert.equal(quiet.state, 'idle');
});

test('under managed execution Unfold reads no request log, says the gateway enforces the policy and never guesses what answered', () => {
  assert.equal(readsGatewayLedger(managed), false);
  assert.equal(readsGatewayLedger(live), true);
  const report = residencyReport({ config: managed, sessions: [session('a', 'u1', [])], now, admin: true, visible: () => true });
  assert.equal(report.state, 'unknown');
  assert.equal(report.source, 'none');
  assert.deepEqual(report.policy, { providers: null, regions: null, enforcedBy: 'gateway' });
  assert.match(report.summary, /the gateway’s own policy decides where requests go/);
  assert.deepEqual(report.windows.map(window => window.requests), [0, 0]);
});

test('the demo says it is a demo and shows no requests, even when stored sessions carry some', () => {
  const report = residencyReport({ config: demo, sessions: [session('a', 'u1', [request('1', hoursAgo(1), 'openai', 'us')])], now, admin: true, visible: () => true });
  assert.equal(report.state, 'not_used');
  assert.match(report.summary, /^This is a demo\. It makes no model calls/);
  assert.deepEqual([report.windows, report.outside], [[], []]);
  assert.equal(report.places.find(place => place.id === 'ploeg')!.where, 'Illustrative demo data inside Unfold');
});

test('places name what the configuration says, give hosts and namespaces to administrators only and never a region', () => {
  const forAdmin = residencyPlaces(live, true);
  assert.deepEqual(forAdmin.map(place => [place.id, place.where, place.region]), [
    ['unfold', 'The machine or cluster that runs this workbench', null],
    ['ploeg', 'The Ploeg API at ploeg.internal:8080', null],
    ['workspaces', 'Kubernetes pods in namespace workspaces under RuntimeClass kata', null],
  ]);
  assert.match(forAdmin[0].detail!, /region is unknown/);
  const forViewer = residencyPlaces(live, false);
  assert.deepEqual(forViewer.map(place => place.where), ['The machine or cluster that runs this workbench', 'The connected Ploeg API', 'Kubernetes pods']);
  assert.equal(residencyPlaces({ ...live, ploeg: undefined, runtime: { ...live.runtime, backend: 'docker' } } as AppConfig, true).map(place => place.where).join(' | '), 'The machine or cluster that runs this workbench | Not connected | Containers on this workbench’s Docker host');
});

test('the Status report carries the line without changing the overall answer', async () => {
  const store = new Store(':memory:');
  store.saveSession(session('a', 'u1', [request('1', new Date(Date.now() - 3_600_000).toISOString(), 'openai', 'us')]));
  const board = new StatusBoard(live, store, () => [], { gateway: async () => true, ploeg: async () => 'ok' });
  const admin: User = { id: 'u-admin', name: 'admin', role: 'admin' };
  const report = await board.report(admin);
  assert.equal(report.residency.state, 'degraded');
  assert.equal(report.residency.outside[0].session?.id, 'a');
  assert.equal(report.checks.some(check => check.state === 'degraded'), false);
  assert.equal(report.overall, 'operational');
});
