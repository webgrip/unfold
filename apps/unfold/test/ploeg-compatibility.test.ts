import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PloegClient, PloegContractIncompatible, PloegError } from '../src/ploeg.ts';
import { PloegCompatibilityMonitor, legacyServed, missingContracts, ploegExpectationsUrl, ploegRequirements, type PloegContractGate, type PloegServed } from '../src/ploeg-compatibility.ts';
import { ExecutionAuthority } from '../src/execution-authority.ts';
import { DeliveryService } from '../src/delivery.ts';
import { lookupTaskBinding } from '../src/task-binding.ts';
import { LinkedHandoff } from '../src/linked-handoff.ts';
import type { LinkedSessions } from '../src/linked-sessions.ts';
import type { Store } from '../src/store.ts';
import type { AppConfig, Session } from '../src/types.ts';
import type { TaskSnapshot } from '../src/tasks.ts';
import { application, configuration, login, request } from './api-support.ts';

const unfold = resolve(import.meta.dirname, '..');
const contracts = resolve(unfold, '../ploeg/docs/contracts');
const expectations = JSON.parse(readFileSync(ploegExpectationsUrl, 'utf8')) as { consumer: string; line: string; requires: { contract: string; version: number }[]; interactions: { contract: string; method: string; path: string; request?: { definition: string }; response?: string; reads?: { pointer: string; types: string[]; required?: boolean }[] }[] };
const servedAll = (versions: Record<string, number[]> = {}): PloegServed => ({ ploeg: '0.2.0-rc.60', legacy: false, contracts: ploegRequirements.map(requirement => ({ name: requirement.contract, versions: versions[requirement.contract] ?? [requirement.version] })) });

function recorder() {
  const lines: Record<string, unknown>[] = [];
  return { lines, log: (line: Record<string, unknown>) => { lines.push(line); }, events: () => lines.map(line => line.event) };
}

test('a Ploeg that serves every contract major Unfold requires, or predates the version route, is compatible', async () => {
  for (const served of [servedAll(), servedAll({ 'operator-api': [1, 2] }), legacyServed()]) {
    const logged = recorder();
    const monitor = new PloegCompatibilityMonitor(async () => served, '0.4.0', logged.log);
    assert.equal(monitor.status.state, 'unchecked', 'not checked yet refuses nothing: an unreachable Ploeg must not pause Unfold');
    assert.equal((await monitor.check()).state, 'compatible');
    assert.deepEqual(logged.events(), ['ploeg.contract_compatible']);
  }
});

test('a Ploeg that no longer serves a required major is incompatible, names both versions and logs it once', async () => {
  const logged = recorder();
  let served = servedAll({ 'operator-api': [2] });
  const monitor = new PloegCompatibilityMonitor(async () => served, '0.4.0-rc.112', logged.log);
  const status = await monitor.check();
  assert(status.state === 'incompatible');
  assert.deepEqual(status.missing, [{ contract: 'operator-api', version: 1 }]);
  assert.equal(status.unfold, '0.4.0-rc.112');
  assert.equal(status.ploeg, '0.2.0-rc.60');
  assert.match(status.message, /Unfold 0\.4\.0-rc\.112 requires Ploeg contract operator-api v1, but this Ploeg \(0\.2\.0-rc\.60\) serves operator-api v2/);
  await monitor.check();
  assert.deepEqual(logged.events(), ['ploeg.contract_incompatible'], 'an unchanged mismatch is logged once');
  served = servedAll();
  assert.equal((await monitor.check()).state, 'compatible');
  assert.deepEqual(logged.events(), ['ploeg.contract_incompatible', 'ploeg.contract_compatible']);
});

test('a contract Ploeg does not list at all is missing too', () => {
  const served: PloegServed = { ploeg: '9.0.0', legacy: false, contracts: [] };
  assert.deepEqual(missingContracts(served), ploegRequirements);
});

test('an unreachable Ploeg keeps the last answer instead of flipping it', async () => {
  const logged = recorder();
  let reachable = true;
  const monitor = new PloegCompatibilityMonitor(async () => { if (!reachable) throw new Error('connect ECONNREFUSED'); return servedAll({ 'operator-api': [2] }); }, '0.4.0', logged.log);
  await monitor.check();
  reachable = false;
  await monitor.check();
  await monitor.check();
  assert.equal(monitor.status.state, 'incompatible');
  assert.deepEqual(logged.events(), ['ploeg.contract_incompatible', 'ploeg.version_unreadable'], 'an outage is logged once');
  const fresh = new PloegCompatibilityMonitor(async () => { throw new Error('down'); }, '0.4.0', recorder().log);
  await fresh.check();
  assert.equal(fresh.status.state, 'unchecked');
});

async function versionServer(t: TestContext, answer: (res: import('node:http').ServerResponse) => void) {
  const env = `UNFOLD_PLOEG_VERSION_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  const paths: string[] = [];
  const server = createServer((req, res) => { paths.push(req.url!); if (req.url === '/api/v1/operator/version' && req.headers.authorization === `Bearer ${process.env[env]}`) answer(res); else res.writeHead(404).end(); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); delete process.env[env]; });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, paths };
}

test('the client reads Ploeg\'s version route, and reads a Ploeg without it as serving major 1 of each contract', async t => {
  const body = { schemaVersion: '1.0', ploeg: '0.2.0-rc.60', contracts: [{ name: 'operator-api', versions: [1] }, { name: 'run-api', versions: [1, 2] }] };
  const current = await versionServer(t, res => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body)));
  assert.deepEqual(await new PloegClient({ ...configuration('/unused', 'live'), ploeg: current.config }).served(), { ploeg: '0.2.0-rc.60', legacy: false, contracts: body.contracts });
  const older = await versionServer(t, res => res.writeHead(404).end());
  assert.deepEqual(await new PloegClient({ ...configuration('/unused', 'live'), ploeg: older.config }).served(), legacyServed());
  const broken = await versionServer(t, res => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ploeg: '1', contracts: [{ name: 'operator-api', versions: ['1'] }] })));
  await assert.rejects(new PloegClient({ ...configuration('/unused', 'live'), ploeg: broken.config }).served(), (error: unknown) => error instanceof PloegError && error.code === 'ploeg_response');
});

type FakePloeg = { config: { url: string; tokenEnv: string }; paths: string[]; serve(contracts: { name: string; versions: number[] }[]): void };

async function fakePloeg(t: TestContext): Promise<FakePloeg> {
  const env = `UNFOLD_PLOEG_CONTRACT_${randomBytes(6).toString('hex').toUpperCase()}`;
  process.env[env] = randomBytes(24).toString('hex');
  const paths: string[] = [];
  let contracts = ploegRequirements.map(requirement => ({ name: requirement.contract, versions: [requirement.version] }));
  const send = (res: import('node:http').ServerResponse, body: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...body }));
  const server = createServer((req, res) => {
    paths.push(req.url!);
    if (req.headers.authorization !== `Bearer ${process.env[env]}`) return void res.writeHead(401).end();
    if (req.url === '/api/v1/operator/version') return send(res, { ploeg: '0.3.0', contracts });
    if (req.url === '/api/v1/operator/teams') return send(res, { teams: [{ id: 'delivery', paused: false, queueDepth: 0, roles: [] }] });
    res.writeHead(404).end();
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); delete process.env[env]; });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env }, paths, serve(next) { contracts = next; } };
}

const withoutOperatorApiV1 = () => [{ name: 'operator-api', versions: [2] }, ...ploegRequirements.filter(requirement => requirement.contract !== 'operator-api').map(requirement => ({ name: requirement.contract, versions: [requirement.version] }))];
const callsBesideTheProbe = (paths: string[]) => paths.filter(path => path !== '/api/v1/operator/version');

test('while Ploeg is incompatible Unfold stays ready, shows the mismatch, keeps its own data and refuses every call to Ploeg before sending it', async t => {
  const ploeg = await fakePloeg(t);
  ploeg.serve(withoutOperatorApiV1());
  const server = await application('live', config => { config.ploeg = { ...ploeg.config, userTeams: {} }; });
  t.after(() => server.close());
  const monitor = server.app.ploegCompatibility;
  assert(monitor, 'a configured Ploeg gets a compatibility monitor');
  await monitor.check();
  assert.equal(monitor.status.state, 'incompatible');

  const ready = await request(server.url, '/readyz');
  assert.equal(ready.status, 200, `readiness never depends on Ploeg's contract: one replica with Recreate would take the screens that fix it offline. ${ready.text}`);
  assert.equal(ready.body.status, 'ok');
  const health = await request(server.url, '/healthz');
  assert.equal(health.status, 200);
  assert.equal(health.body.ploegContract.state, 'incompatible', 'an operator reads the mismatch from /healthz without signing in');
  assert.match(health.body.ploegContract.message, /requires Ploeg contract operator-api v1, but this Ploeg \(0\.3\.0\) serves operator-api v2/);

  const { cookie } = await login(server.url);
  const status = await request(server.url, '/api/status', { cookie });
  assert.equal(status.status, 200, status.text);
  assert.equal(status.body.ploegContract.state, 'incompatible');
  assert.deepEqual(status.body.ploegContract.missing, [{ contract: 'operator-api', version: 1 }]);
  assert.equal(status.body.checks.find((check: { id: string }) => check.id === 'ploeg').state, 'down');
  assert.equal((await request(server.url, '/api/sessions', { cookie })).status, 200, 'Unfold\'s own data stays readable');

  const before = callsBesideTheProbe(ploeg.paths).length;
  const refused = await request(server.url, '/api/ploeg/teams?fresh=1', { cookie });
  assert.equal(refused.status, 503, refused.text);
  assert.equal(refused.body.error.code, 'ploeg_contract_incompatible');
  assert.match(refused.body.error.message, /Unfold \S+ requires Ploeg contract operator-api v1, but this Ploeg \(0\.3\.0\) serves operator-api v2/);
  assert.equal(callsBesideTheProbe(ploeg.paths).length, before, 'nothing reached Ploeg');

  ploeg.serve(ploegRequirements.map(requirement => ({ name: requirement.contract, versions: [requirement.version] })));
  await monitor.check();
  const flows = await request(server.url, '/api/ploeg/teams?fresh=1', { cookie });
  assert.equal(flows.status, 200, flows.text);
  assert(callsBesideTheProbe(ploeg.paths).includes('/api/v1/operator/teams'), 'a compatible Ploeg receives the call');
  const recovered = await request(server.url, '/api/status', { cookie });
  assert.equal(recovered.body.ploegContract.state, 'compatible');
  assert.equal((await request(server.url, '/healthz')).body.ploegContract.state, 'compatible');
});

const incompatible: PloegContractGate = { status: { state: 'incompatible', unfold: '0.4.0', ploeg: '0.3.0', missing: [{ contract: 'operator-api', version: 1 }], served: [{ name: 'operator-api', versions: [2] }], checkedAt: '2026-10-24T08:00:00Z', message: 'Unfold 0.4.0 requires Ploeg contract operator-api v1, but this Ploeg (0.3.0) serves operator-api v2.' } };
const compatible: PloegContractGate = { status: { state: 'compatible', ploeg: '0.3.0', checkedAt: '2026-10-24T08:00:00Z' } };
const namesBothVersions = (error: unknown) => error instanceof PloegContractIncompatible && error.status === 503 && error.code === 'ploeg_contract_incompatible' && error.unfold === '0.4.0' && error.ploeg === '0.3.0' && /requires Ploeg contract operator-api v1, but this Ploeg \(0\.3\.0\) serves operator-api v2/.test(error.message);

test('the Ploeg client refuses an incompatible Ploeg with a typed error before sending, and sends again once it is compatible', async t => {
  const ploeg = await fakePloeg(t);
  const config = { ...configuration('/unused', 'live'), ploeg: { ...ploeg.config, userTeams: {} } };
  const admin = { id: 'admin', name: 'admin', role: 'admin' as const };
  await assert.rejects(new PloegClient(config, incompatible).teams(admin, true), namesBothVersions);
  assert.equal(ploeg.paths.length, 0);
  assert.equal((await new PloegClient(config, incompatible).served()).ploeg, '0.3.0', 'the version probe itself is never refused, or Unfold could not see Ploeg recover');
  assert.deepEqual(await new PloegClient(config, compatible).teams(admin, true), [{ id: 'delivery', paused: false, queueDepth: 0, roles: [], assignees: [], pinnedScopes: [] }]);
  assert(ploeg.paths.includes('/api/v1/operator/teams'));
});

test('execution authority, delivery, task binding and the linked hand-off refuse an incompatible Ploeg before sending', async t => {
  const ploeg = await fakePloeg(t);
  process.env[ploeg.config.tokenEnv] = randomBytes(32).toString('hex');
  const config = { ...configuration('/unused', 'live'), ploeg: { ...ploeg.config, userTeams: {} }, execution: { team: 'delivery' }, delivery: { policies: [] } } as unknown as AppConfig;
  const secrets = new Map<string, unknown>();
  const store = { getSecret: (id: string) => secrets.get(id), setSecret: (id: string, value: unknown) => { secrets.set(id, value); }, deleteSecret: (id: string) => { secrets.delete(id); } } as unknown as Store;
  const session = { id: 'session-1', ownerId: 'admin', repositoryId: 'order-service', title: 'Fix rounding', objective: 'Fix it.', runtime: 'opencode', budgetUsd: 1, execution: { id: 'a'.repeat(32) } } as unknown as Session;

  await assert.rejects(new ExecutionAuthority(store, config, incompatible).admit(session), (error: unknown) => namesBothVersions(error) && (error as { failure?: { cause: string } }).failure?.cause === 'incompatible');
  const delivery = new DeliveryService(config, store);
  delivery.useContract(incompatible);
  await assert.rejects((delivery as unknown as { exchange(session: Session): Promise<unknown> }).exchange(session), namesBothVersions);
  await assert.rejects(lookupTaskBinding(config, { id: '7', sourceId: 'vikunja' } as unknown as TaskSnapshot, incompatible), namesBothVersions);
  const claim = { userId: 'admin', workItemId: '7', runToken: 'run-token', controlToken: null, workerId: null, environmentId: 'env', baseBranch: 'main', title: 'Fix', reference: 'ref', deadline: '2026-10-24T09:00:00Z' };
  let handoffFetches = 0;
  const handoff = new LinkedHandoff({} as LinkedSessions, new PloegClient(config, incompatible), { getSecret: <T>() => claim as T, setSecret: () => undefined, deleteSecret: () => undefined, secretIds: () => [] }, config, { fetch: async () => { handoffFetches++; return new Response(null, { status: 204 }); } });
  await assert.rejects(handoff.recordSession({ id: 'admin', name: 'admin', role: 'admin' }, '7', { runId: '12', sessionId: 'session_abcdef' }), namesBothVersions);
  assert.equal(handoffFetches, 0);
  assert.equal(ploeg.paths.length, 0, 'nothing reached Ploeg');

  await assert.rejects(new ExecutionAuthority(store, config, compatible).admit(session), (error: unknown) => error instanceof PloegError && !(error instanceof PloegContractIncompatible));
  assert(ploeg.paths.includes('/api/v1/operator/executions'), 'a compatible Ploeg receives the admission');
});

test('the demo without a Ploeg has no compatibility monitor', async t => {
  const server = await application('demo');
  t.after(() => server.close());
  assert.equal(server.app.ploegCompatibility, undefined);
});

test('the expectation set names this release line and requires only contracts Ploeg publishes', () => {
  const version = String(JSON.parse(readFileSync(join(unfold, 'package.json'), 'utf8')).version);
  assert.equal(expectations.consumer, 'unfold');
  assert.equal(expectations.line, version.split('.').slice(0, 2).join('.'), `src/ploeg-expectations.json must name the line of package.json ${version}; on a new minor, add the new line to Ploeg's docs/contracts/consumers/unfold/ as well`);
  for (const requirement of expectations.requires) assert(schemaFile(requirement.contract, requirement.version), `Unfold requires ${requirement.contract} v${requirement.version}, which the pinned Ploeg bundle does not publish`);
});

function schemaFile(contract: string, version: number): string | undefined {
  for (const name of [`${contract}.v${version}.schema.json`, ...(version === 1 ? [`${contract}.schema.json`] : [])]) if (statSync(join(contracts, name), { throwIfNoEntry: false })) return join(contracts, name);
  return undefined;
}

const comesWithPloegAfterThePin = new Set(['GET /api/v1/operator/version']);

test('every request and value the expectation set records exists in the pinned Ploeg\'s schemas', () => {
  type Node = Record<string, any>;
  for (const interaction of expectations.interactions) {
    const call = `${interaction.method} ${interaction.path}`;
    const document = JSON.parse(readFileSync(schemaFile(interaction.contract, expectations.requires.find(each => each.contract === interaction.contract)!.version)!, 'utf8')) as Node;
    const defs = document.$defs as Node;
    const resolve = (node: Node): Node => { for (let hops = 0; typeof node?.$ref === 'string' && hops < 32; hops++) node = defs[node.$ref.replace('#/$defs/', '')]; return node ?? {}; };
    const alternatives = (node: Node): Node[] => { node = resolve(node); const nested = [...(node.anyOf ?? []), ...(node.oneOf ?? [])]; return nested.length ? nested.flatMap(alternatives) : [node]; };
    const definitions = [interaction.request?.definition, interaction.response].filter((name): name is string => Boolean(name));
    if (comesWithPloegAfterThePin.has(call) && definitions.some(name => !defs[name])) continue;
    for (const name of definitions) assert(defs[name], `${call} uses ${name}, which the pinned ${interaction.contract} schema does not define`);
    for (const read of interaction.reads ?? []) {
      let nodes: Node[] = [defs[interaction.response!]];
      for (const segment of read.pointer.split('/').slice(1)) nodes = nodes.flatMap(alternatives).map(node => segment === '*' ? (node.items ?? node.additionalProperties) : node.properties?.[segment]).filter((node): node is Node => Boolean(node) && typeof node === 'object');
      assert(nodes.length, `${call} reads ${interaction.response} ${read.pointer}, which the pinned Ploeg schema does not have`);
    }
  }
});

test('the expectation set records every operator route Unfold calls', () => {
  const recorded = expectations.interactions.map(interaction => `${interaction.method} ${interaction.path}`.replace(/\{[^}/]+\}/g, '{}'));
  const covers = (method: string, path: string) => recorded.some(entry => { const [m, p] = entry.split(' '); return (method === '*' || m === method) && p.split('/').length === path.split('/').length && path.split('/').every((segment, i) => segment === '{}' || p.split('/')[i] === '{}' || p.split('/')[i] === segment); });
  const client = readFileSync(join(unfold, 'src/ploeg.ts'), 'utf8');
  const called = [...client.matchAll(/this\.request\(\s*(['`])(.*?)\1/g)].map(match => `/api/v1/operator/${match[2].split('?')[0].replace(/\$\{[^}]*\}/g, '{}')}`);
  assert(called.length > 20, 'the scan of src/ploeg.ts found too few requests; update this test with the client');
  for (const path of new Set(called)) assert(covers('*', path), `src/ploeg.ts requests ${path}, which src/ploeg-expectations.json does not record. Record it, with what Unfold reads, so Ploeg's CI keeps it working.`);
  for (const [file, path] of [['src/task-binding.ts', '/api/v1/operator/work-items/lookup'], ['src/delivery.ts', '/api/v1/operator/executions/{}/delivery'], ['src/execution-authority.ts', '/api/v1/operator/executions']] as const) {
    assert(readFileSync(join(unfold, file), 'utf8').includes(path.replace(/\{\}.*$/, '')), `${file} no longer calls ${path}; update this test`);
    assert(covers('*', path), `${file} calls ${path}, which src/ploeg-expectations.json does not record`);
  }
});
