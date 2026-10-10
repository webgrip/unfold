import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { createServer, request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { WebSocketServer, type WebSocket } from 'ws';
import { KubernetesClient } from '../src/runtime/kubernetes.ts';
import { canonicalizeCandidate, type CanonicalCandidate } from '../src/trusted-candidate.ts';
import { validateDeliveryConfig, type DeliveryPolicy, type KubernetesVerifierConfig } from '../src/delivery-config.ts';
import { verifyCandidate } from '../src/delivery-verifier.ts';
import { helperBinary, kubernetesVerifierPreflight, networkIsolated, podPollMs, verifierPod, verifierPodLabels, verifyCandidateInKubernetes } from '../src/delivery-kubernetes-verifier.ts';
import { DockerClient } from '../src/runtime/docker.ts';
import { deliveryFixture } from './delivery-fixture.ts';
import type { AppConfig } from '../src/types.ts';

type Behavior = { stdout?: string; stderr?: string; exitCode?: number; hang?: boolean };
type ArchiveEntry = { name: string; mode: number; type: string; content: Buffer };
type Scenario = {
  protocol: 'v5.channel.k8s.io' | 'v4.channel.k8s.io';
  networkPolicies: Record<string, any>[];
  checks: Record<string, Behavior>;
  imageId?: string;
  pullFailure?: boolean;
  deleteFails?: boolean;
};

const nodeImage = 'harbor.example/library/node@sha256:' + '1'.repeat(64);
const helperImage = 'harbor.example/library/busybox@sha256:' + '2'.repeat(64);
const denyAll = { metadata: { name: 'unfold-verifier-deny-all' }, spec: { podSelector: { matchLabels: { 'dev.webgrip.unfold/network': 'none' } }, policyTypes: ['Ingress', 'Egress'] } };
const verifier: KubernetesVerifierConfig = { kind: 'kubernetes', namespace: 'unfold-verifier', runtimeClassName: 'kata', image: helperImage, resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } }, timeoutSeconds: 60, networkProbe: { host: '10.96.0.1', port: 443 } };

function readArchive(archive: Buffer): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []; let offset = 0; let longName: string | undefined;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const field = (start: number, length: number) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12), 8); const type = field(156, 1); const content = archive.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { longName = /path=([^\n]*)\n/.exec(content.toString('utf8'))?.[1]; continue; }
    entries.push({ name: longName ?? field(0, 100), mode: parseInt(field(100, 8), 8), type, content: Buffer.from(content) }); longName = undefined;
  }
  return entries;
}

function isolatedByFake(policies: Record<string, any>[], labels: Record<string, string>): boolean {
  return policies.some(policy => Object.entries(policy.spec?.podSelector?.matchLabels ?? {}).every(([key, value]) => labels[key] === value) && policy.spec?.policyTypes?.includes('Egress') && !policy.spec?.egress?.length);
}

async function fakeKubernetes(t: TestContext, scenario: Scenario) {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-kubernetes-verifier-'));
  const tokenFile = join(directory, 'token'); const caFile = join(directory, 'ca.crt');
  await writeFile(tokenFile, 'fixture-token'); await writeFile(caFile, 'unused-by-plain-http-fixture');
  const pods = new Map<string, { spec: any; phase: 'loading' | 'running' | 'failed' }>();
  const record = { created: [] as any[], deleted: [] as string[], execs: [] as string[][], archives: [] as ArchiveEntry[][], unauthorized: 0 };
  const status = (name: string) => {
    const pod = pods.get(name)!;
    if (scenario.pullFailure) return { phase: 'Pending', initContainerStatuses: [{ name: 'load', state: { waiting: { reason: 'ImagePullBackOff' } }, restartCount: 0 }] };
    if (pod.phase === 'loading') return { phase: 'Pending', initContainerStatuses: [{ name: 'load', state: { running: {} }, restartCount: 0 }], containerStatuses: [{ name: 'check', state: { waiting: { reason: 'PodInitializing' } }, restartCount: 0 }] };
    if (pod.phase === 'failed') return { phase: 'Pending', initContainerStatuses: [{ name: 'load', state: { terminated: { exitCode: 1 } }, restartCount: 0 }] };
    return { phase: 'Running', initContainerStatuses: [{ name: 'load', state: { terminated: { exitCode: 0 } }, restartCount: 0 }], containerStatuses: [{ name: 'check', state: { running: {} }, restartCount: 0, imageID: scenario.imageId ?? nodeImage.replace('harbor.example/library', 'docker.io/library') }] };
  };
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const reply = (code: number, body: unknown) => { response.writeHead(code, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
      if (request.headers.authorization !== 'Bearer fixture-token') { record.unauthorized++; return reply(401, {}); }
      const url = new URL(request.url!, 'http://fixture');
      if (url.pathname === '/apis/networking.k8s.io/v1/namespaces/unfold-verifier/networkpolicies') return reply(200, { items: scenario.networkPolicies });
      const match = /^\/api\/v1\/namespaces\/unfold-verifier\/pods(?:\/([^/]+))?$/.exec(url.pathname);
      if (!match) return reply(404, {});
      if (request.method === 'POST') { const spec = JSON.parse(Buffer.concat(chunks).toString()); record.created.push(spec); pods.set(spec.metadata.name, { spec, phase: 'loading' }); return reply(201, spec); }
      if (request.method === 'DELETE') { record.deleted.push(match[1]); if (scenario.deleteFails) return reply(500, {}); pods.delete(match[1]); return reply(200, {}); }
      if (!pods.has(match[1])) return reply(404, {});
      return reply(200, { ...pods.get(match[1])!.spec, status: status(match[1]) });
    });
  });
  const sockets = new WebSocketServer({ noServer: true, handleProtocols: protocols => protocols.has(scenario.protocol) ? scenario.protocol : false });
  const exit = (code: number) => JSON.stringify(code === 0 ? { metadata: {}, status: 'Success' } : { metadata: {}, status: 'Failure', reason: 'NonZeroExitCode', details: { causes: [{ reason: 'ExitCode', message: String(code) }] } });
  const answer = (socket: WebSocket, behavior: Behavior) => {
    if (behavior.hang) return;
    if (behavior.stdout) socket.send(Buffer.concat([Buffer.from([1]), Buffer.from(behavior.stdout)]));
    if (behavior.stderr) socket.send(Buffer.concat([Buffer.from([2]), Buffer.from(behavior.stderr)]));
    socket.send(Buffer.concat([Buffer.from([3]), Buffer.from(exit(behavior.exitCode ?? 0))]));
    socket.close(1000);
  };
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    if (request.headers.authorization !== 'Bearer fixture-token') { record.unauthorized++; socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, connection => {
      const url = new URL(request.url!, 'http://fixture');
      const name = /\/pods\/([^/]+)\/(attach|exec)$/.exec(url.pathname)![1];
      const pod = pods.get(name)!;
      if (url.pathname.endsWith('/attach')) {
        const received: Buffer[] = [];
        const finish = () => {
          if (pod.phase !== 'loading') return;
          try { const entries = readArchive(Buffer.concat(received)); record.archives.push(entries); pod.phase = entries.some(entry => entry.name === 'unfold-verifier/complete') ? 'running' : 'failed'; } catch { pod.phase = 'failed'; }
        };
        connection.on('message', (data: Buffer) => { if (data[0] === 0) received.push(data.subarray(1)); else if (data[0] === 255 && data[1] === 0) finish(); });
        connection.on('close', finish);
        return;
      }
      const argv = url.searchParams.getAll('command'); record.execs.push(argv);
      if (argv[0] === helperBinary && argv[1] === 'nc') return answer(connection, { exitCode: isolatedByFake(scenario.networkPolicies, pod.spec.metadata.labels ?? {}) ? 1 : 0 });
      answer(connection, scenario.checks[argv.join(' ')] ?? { exitCode: 127 });
    });
  });
  const originalRequest = https.request;
  t.mock.method(https, 'request', (...args: any[]) => {
    if (args[0] instanceof URL || typeof args[0] === 'string') { const target = new URL(args[0]); target.protocol = 'http:'; return httpRequest(target, { ...(args[1] as RequestOptions), agent: false }, args[2]); }
    return httpRequest({ ...(args[0] as RequestOptions), protocol: 'http:', createConnection: undefined, agent: false }, args[1]);
  });
  syncBuiltinESMExports();
  t.after(async () => {
    https.request = originalRequest; syncBuiltinESMExports();
    for (const client of sockets.clients) client.terminate();
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = new KubernetesClient({ apiUrl: `https://127.0.0.1:${(server.address() as { port: number }).port}`, tokenFile, caFile });
  return { client, record };
}

async function verifiedCandidate(t: TestContext): Promise<{ candidate: CanonicalCandidate; policy: DeliveryPolicy; behaviors: Record<string, Behavior> }> {
  podPollMs.value = 5;
  const f = await deliveryFixture(); t.after(() => f.cleanup());
  const policy = { ...f.policy, image: nodeImage, timeoutMs: 500 };
  await f.fix(); assert.equal((await f.capture('kubernetes')).status, 'ready');
  const candidate = await canonicalizeCandidate(f.dataDir, 'kubernetes', policy);
  const behaviors = Object.fromEntries(policy.checks.map(check => [check.argv.join(' '), { stdout: check.stdout, exitCode: check.exitCode }]));
  return { candidate, policy, behaviors };
}

test('a check pod runs under kata with no service account token, no network, a read-only non-root root and a deadline', async t => {
  const { candidate, policy } = await verifiedCandidate(t);
  const pod = verifierPod(candidate, policy, policy.checks[0], { ...verifier, nodeSelector: { pool: 'worker' } }, 'unfold-verify-fixture');
  assert.equal(pod.spec.runtimeClassName, 'kata');
  assert.equal(pod.spec.automountServiceAccountToken, false);
  assert.equal(pod.spec.enableServiceLinks, false);
  assert.equal(pod.spec.hostNetwork, undefined);
  assert.equal(pod.spec.restartPolicy, 'Never');
  assert.equal(pod.spec.activeDeadlineSeconds, verifier.timeoutSeconds);
  assert.deepEqual(pod.spec.nodeSelector, { pool: 'worker' });
  for (const [key, value] of Object.entries(verifierPodLabels)) assert.equal(pod.metadata.labels[key], value, key);
  assert.ok(networkIsolated([denyAll], pod.metadata.labels));
  assert.equal(pod.spec.securityContext.seccompProfile.type, 'RuntimeDefault');
  for (const container of [...pod.spec.initContainers, ...pod.spec.containers]) {
    assert.equal(container.securityContext.readOnlyRootFilesystem, true, container.name);
    assert.equal(container.securityContext.runAsNonRoot, true, container.name);
    assert.equal(container.securityContext.allowPrivilegeEscalation, false, container.name);
    assert.deepEqual(container.securityContext.capabilities.drop, ['ALL'], container.name);
    assert.equal((container.env ?? []).some((item: any) => /TOKEN|KEY|SECRET|PASSWORD/.test(item.name)), false, container.name);
  }
  const check = pod.spec.containers[0];
  assert.equal(check.image, policy.image);
  assert.equal(check.workingDir, '/candidate');
  for (const path of ['/candidate', '/policy', '/unfold-verifier']) assert.equal(check.volumeMounts.find((mount: any) => mount.mountPath === path)?.readOnly, true, path);
  assert.ok(pod.spec.volumes.every((volume: any) => Object.keys(volume).length === 2 && volume.emptyDir), 'only emptyDir volumes');
  assert.equal(pod.spec.initContainers[0].image, helperImage);
});

test('a passing check yields the same receipt evidence as the Docker verifier for the same candidate, and every pod is deleted', async t => {
  const { candidate, policy, behaviors } = await verifiedCandidate(t);
  const { client, record } = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [denyAll], checks: behaviors });
  await kubernetesVerifierPreflight(verifier, client);
  const result = await verifyCandidateInKubernetes(candidate, policy, verifier, client);
  class PassingDocker extends DockerClient {
    private current = 0;
    async request(path: string, method?: string, body?: any): Promise<any> { if (path.startsWith('/images/')) return { RepoDigests: [policy.image] }; if (path.startsWith('/containers/create')) this.current = policy.checks.findIndex(check => check.argv === body.Cmd); if (path.endsWith('/json')) return { State: { Running: false, ExitCode: 0 } }; if (path.includes('/wait')) return { StatusCode: 0 }; return {}; }
    async raw(): Promise<Buffer> { return Buffer.from(policy.checks[this.current].stdout); }
  }
  const docker = await verifyCandidate(candidate, policy, new PassingDocker());
  assert.equal(result.passed, true);
  assert.equal(result.verifierId, 'unfold-kubernetes-v1');
  assert.deepEqual({ ...result, verifierId: docker.verifierId }, docker);
  assert.equal(record.created.length, policy.checks.length);
  assert.deepEqual(record.deleted.sort(), record.created.map(pod => pod.metadata.name).sort());
  assert.equal(record.unauthorized, 0);
  for (const archive of record.archives) {
    assert.deepEqual(archive.find(entry => entry.name === 'candidate/price.mjs')?.content.toString(), 'export const total = (price, count) => price * count;\n');
    assert.equal(archive.find(entry => entry.name === 'candidate/price.mjs')?.mode, 0o444);
    assert.ok(archive.some(entry => entry.name === 'policy/check.mjs'));
    assert.equal(archive.at(-1)?.name, 'unfold-verifier/complete');
  }
  const probes = record.execs.filter(argv => argv[1] === 'nc');
  assert.equal(probes.length, policy.checks.length);
  assert.deepEqual(probes[0].slice(-2), ['10.96.0.1', '443']);
});

test('the v4 channel protocol delivers the archive by closing the stream', async t => {
  const { candidate, policy, behaviors } = await verifiedCandidate(t);
  const { client, record } = await fakeKubernetes(t, { protocol: 'v4.channel.k8s.io', networkPolicies: [denyAll], checks: behaviors });
  assert.equal((await verifyCandidateInKubernetes(candidate, policy, verifier, client)).passed, true);
  assert.equal(record.archives.length, policy.checks.length);
});

test('a check pod that can reach the network fails verification without running the check', async t => {
  const { candidate, policy, behaviors } = await verifiedCandidate(t);
  const allowing = { metadata: { name: 'other' }, spec: { podSelector: { matchLabels: { app: 'something-else' } }, policyTypes: ['Ingress', 'Egress'] } };
  const { client, record } = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [allowing], checks: behaviors });
  const result = await verifyCandidateInKubernetes(candidate, policy, verifier, client);
  assert.equal(result.passed, false);
  assert.equal(result.testCount, 0);
  assert.ok(result.checks.every(check => check.reason === 'network_reachable' && check.exitCode === null));
  assert.equal(record.execs.some(argv => argv[1] !== 'nc'), false);
  assert.equal(record.deleted.length, policy.checks.length);
});

test('preflight refuses a namespace without a deny-all policy for check pods, or with one that lets traffic back in', async t => {
  const { client } = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [], checks: {} });
  await assert.rejects(kubernetesVerifierPreflight(verifier, client), { code: 'verifier_network_policy_missing' });
  assert.equal(networkIsolated([denyAll]), true);
  assert.equal(networkIsolated([{ spec: { ...denyAll.spec, policyTypes: ['Ingress'] } }]), false);
  assert.equal(networkIsolated([denyAll, { spec: { podSelector: {}, policyTypes: ['Egress'], egress: [{ to: [{ ipBlock: { cidr: '0.0.0.0/0' } }] }] } }]), false);
  assert.equal(networkIsolated([{ spec: { podSelector: { matchExpressions: [{ key: 'dev.webgrip.unfold/network', operator: 'In', values: ['none'] }] }, policyTypes: ['Ingress', 'Egress'] } }]), true);
  const previous = process.env.KUBERNETES_SERVICE_HOST; delete process.env.KUBERNETES_SERVICE_HOST;
  try { await assert.rejects(kubernetesVerifierPreflight({ ...verifier, networkProbe: undefined }, client), { code: 'verifier_network_probe_unset' }); }
  finally { if (previous !== undefined) process.env.KUBERNETES_SERVICE_HOST = previous; }
});

test('a fake PASS with a failing exit, a timeout and a failed image pull never pass, and their pods are deleted', async t => {
  const { candidate, policy } = await verifiedCandidate(t);
  const lying = Object.fromEntries(policy.checks.map(check => [check.argv.join(' '), { stdout: check.stdout, exitCode: 1 }]));
  const failing = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [denyAll], checks: lying });
  const failed = await verifyCandidateInKubernetes(candidate, policy, verifier, failing.client);
  assert.equal(failed.passed, false); assert.equal(failed.testCount, 2);
  assert.ok(failed.checks.every(check => check.exitCode === 1 && check.reason === 'assertion_failed'));
  const hanging = Object.fromEntries(policy.checks.map(check => [check.argv.join(' '), { hang: true }]));
  const slow = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [denyAll], checks: hanging });
  const timedOut = await verifyCandidateInKubernetes(candidate, policy, verifier, slow.client);
  assert.equal(timedOut.passed, false); assert.equal(timedOut.testCount, 0);
  assert.ok(timedOut.checks.every(check => check.reason === 'verification_unconfirmed'));
  assert.equal(slow.record.deleted.length, policy.checks.length);
  const unpulled = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [denyAll], checks: {}, pullFailure: true });
  const pull = await verifyCandidateInKubernetes(candidate, policy, verifier, unpulled.client);
  assert.ok(pull.checks.every(check => !check.passed && check.reason === 'verification_unconfirmed'));
  assert.equal(unpulled.record.deleted.length, policy.checks.length);
});

test('an unconfirmed pod deletion or a foreign image digest fails the check', async t => {
  const { candidate, policy, behaviors } = await verifiedCandidate(t);
  const sticky = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [denyAll], checks: behaviors, deleteFails: true });
  const result = await verifyCandidateInKubernetes(candidate, policy, verifier, sticky.client);
  assert.equal(result.passed, false);
  assert.ok(result.checks.every(check => !check.passed && check.reason === 'cleanup_unconfirmed'));
  const foreign = await fakeKubernetes(t, { protocol: 'v5.channel.k8s.io', networkPolicies: [denyAll], checks: behaviors, imageId: 'docker.io/library/node@sha256:' + '9'.repeat(64) });
  const mismatch = await verifyCandidateInKubernetes(candidate, policy, verifier, foreign.client);
  assert.ok(mismatch.checks.every(check => !check.passed && check.reason === 'image_digest_mismatch'));
  assert.equal(foreign.record.execs.length, 0);
});

test('delivery.verifier accepts docker or a pinned kubernetes verifier and rejects unpinned images', async t => {
  const f = await deliveryFixture(); t.after(() => f.cleanup());
  const config = { dataDir: f.dataDir, repositories: [{ id: 'prices' }], execution: { team: 'silver' }, ploeg: { tokenEnv: 'EXECUTOR_TOKEN' }, runtime: { agentEnvironment: [] } } as unknown as AppConfig;
  const policy = { ...f.policy, image: nodeImage };
  const raw = (value: unknown, policies = [policy]) => ({ verifierTokenEnv: 'VERIFIER_TOKEN', policies, verifier: value });
  assert.deepEqual(validateDeliveryConfig(raw({ kind: 'docker' }), config)?.verifier, { kind: 'docker' });
  assert.equal(validateDeliveryConfig({ verifierTokenEnv: 'VERIFIER_TOKEN', policies: [policy] }, config)?.verifier, undefined);
  const parsed = validateDeliveryConfig(raw({ kind: 'kubernetes', namespace: 'unfold-verifier', image: helperImage, nodeSelector: { pool: 'worker' } }), config)?.verifier;
  assert.deepEqual(parsed, { kind: 'kubernetes', namespace: 'unfold-verifier', runtimeClassName: 'kata', image: helperImage, resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } }, timeoutSeconds: 300, nodeSelector: { pool: 'worker' } });
  const valid = { kind: 'kubernetes', namespace: 'unfold-verifier', image: helperImage };
  for (const broken of [{ ...valid, image: 'busybox:latest' }, { ...valid, namespace: 'Bad_Namespace' }, { ...valid, timeoutSeconds: 10 }, { ...valid, networkProbe: { host: 'kubernetes.default.svc', port: 443 } }, { ...valid, resources: { requests: { cpu: 'lots', memory: '1Mi' }, limits: { cpu: '1', memory: '1Mi' } } }, { ...valid, hostNetwork: true }, { kind: 'docker', socketPath: '/var/run/docker.sock' }])
    assert.throws(() => validateDeliveryConfig(raw(broken), config), /delivery.verifier/, JSON.stringify(broken));
  assert.throws(() => validateDeliveryConfig(raw(valid, [f.policy]), config), /delivery.verifier/);
});

const helm = (args: string[]) => spawnSync('helm', ['template', 'unfold', fileURLToPath(new URL('../ops/helm/unfold', import.meta.url)), '--namespace', 'unfold', ...args], { encoding: 'utf8' });
const chartValues = (directory: string) => ['--set', 'mode=live', '--set', 'workspaceNamespace=unfold-workspaces', '--set', 'delivery.enabled=true', '--set-json', `config={"execution":{"team":"delivery"},"repositories":[{"id":"prices","name":"Prices","url":"https://forge.example/acme/prices.git","baseBranch":"main","verify":["node","--test"]}]}`,
  '--set-json', `delivery.policies=[{"repositoryId":"prices","approvedBaseSha":"${'a'.repeat(40)}","approvedBaseBundle":"${directory}/approved.bundle","image":"${nodeImage}","directory":"${directory}/policy","files":{"check.mjs":"${'b'.repeat(64)}"},"protectedPaths":[],"checks":[{"id":"one","argv":["/usr/local/bin/node","/policy/check.mjs"],"stdout":"1\\n","exitCode":0}]}]`,
  '--set-json', 'delivery.inputs.volume={"persistentVolumeClaim":{"claimName":"unfold-delivery-inputs","readOnly":true}}', '--set', `delivery.verifier.image=${helperImage}`, '--set-json', 'delivery.verifier.nodeSelector={"pool":"worker"}',
  '--set', 'delivery.publisher.enabled=true', '--set', 'delivery.publisher.apiUrl=https://forge.example/api/v1', '--set', 'delivery.publisher.existingSecret=unfold-publisher'];

test('the chart renders delivery the server accepts: kubernetes verifier, inputs volume, publisher token, deny-all policy and minimal RBAC', { skip: spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable' }, () => {
  const rendered = helm(chartValues('/var/lib/unfold-delivery/prices'));
  assert.equal(rendered.status, 0, rendered.stderr);
  const configJson = /config\.json: (".*")$/m.exec(rendered.stdout)![1];
  const cfg = JSON.parse(JSON.parse(configJson));
  const app = { dataDir: cfg.dataDir, repositories: cfg.repositories, execution: cfg.execution, ploeg: cfg.ploeg, runtime: { agentEnvironment: [] } } as unknown as AppConfig;
  const delivery = validateDeliveryConfig(cfg.delivery, app)!;
  assert.deepEqual(delivery.verifier, { kind: 'kubernetes', namespace: 'unfold-verifier', runtimeClassName: 'kata', image: helperImage, resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } }, timeoutSeconds: 300, nodeSelector: { pool: 'worker' } });
  assert.deepEqual(delivery.publisher, { kind: 'forgejo', apiUrl: 'https://forge.example/api/v1', tokenEnv: 'UNFOLD_PUBLISHER_TOKEN', username: 'unfold-publisher' });
  assert.match(rendered.stdout, /- name: UNFOLD_PUBLISHER_TOKEN\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: unfold-publisher\n\s+key: token/);
  assert.match(rendered.stdout, /- name: delivery-inputs\n\s+mountPath: \/var\/lib\/unfold-delivery\n\s+readOnly: true/);
  assert.ok(delivery.policies[0].approvedBaseBundle.startsWith('/var/lib/unfold-delivery/'));
  const policy = /kind: NetworkPolicy\n[\s\S]*?(?=\n---|$)/.exec(rendered.stdout)![0];
  assert.match(policy, /namespace: unfold-verifier/);
  assert.match(policy, /matchLabels:\n\s+dev\.webgrip\.unfold\/network: none\n\s+policyTypes: \[Ingress, Egress\]\s*$/);
  assert.ok(networkIsolated([{ spec: { podSelector: { matchLabels: { 'dev.webgrip.unfold/network': 'none' } }, policyTypes: ['Ingress', 'Egress'] } }]));
  const role = /kind: Role\nmetadata:\n\s+name: unfold-verifier\n[\s\S]*?(?=\n---)/.exec(rendered.stdout)![0];
  assert.match(role, /resources: \[pods\]\n\s+verbs: \[get, create, delete\]/);
  assert.match(role, /resources: \[pods\/attach, pods\/exec\]\n\s+verbs: \[get, create\]/);
  assert.doesNotMatch(role, /secrets|list, watch|\*/);
});

test('the chart refuses delivery that would leak the publisher token or misplace the verifier', { skip: spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable' }, () => {
  const values = chartValues('/var/lib/unfold-delivery/prices');
  const leaked = helm([...values, '--set', 'workspaceAgentSecrets={unfold-publisher}']);
  assert.notEqual(leaked.status, 0); assert.match(leaked.stderr, /must not list delivery.publisher.existingSecret/);
  const credentials = helm([...values, '--set', 'workspaceAgentSecrets={unfold-credentials}']);
  assert.notEqual(credentials.status, 0); assert.match(credentials.stderr, /must not list credentialsSecret/);
  const sameNamespace = helm([...values, '--set', 'delivery.verifier.namespace=unfold']);
  assert.notEqual(sameNamespace.status, 0); assert.match(sameNamespace.stderr, /must differ from the workbench namespace/);
  const unpinned = helm([...values, '--set', 'delivery.verifier.image=busybox:latest']);
  assert.notEqual(unpinned.status, 0);
  const insideData = helm([...values, '--set', 'delivery.inputs.mountPath=/data/delivery']);
  assert.notEqual(insideData.status, 0); assert.match(insideData.stderr, /outside \/data/);
  assert.equal(helm(values).status, 0);
});
