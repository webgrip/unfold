import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { WebSocket } from 'ws';
import { KubernetesClient } from './runtime/kubernetes.ts';
import { digest, type DeliveryCheck, type DeliveryPolicy, type KubernetesVerifierConfig } from './delivery-config.ts';
import { deliveryFailure, type CanonicalCandidate } from './trusted-candidate.ts';
import { verificationResult, type CheckResult, type VerificationResult } from './delivery-verifier.ts';
import { archiveOwner, verificationArchive } from './delivery-archive.ts';

type KubernetesObject = Record<string, any>;
type ChannelOutcome = { stdout: Buffer; stderr: Buffer; exitCode?: number };

export const verifierPodLabels: Readonly<Record<string, string>> = { 'app.kubernetes.io/name': 'unfold-verifier', 'dev.webgrip.unfold/network': 'none' };
export const helperDirectory = '/unfold-verifier';
export const helperBinary = `${helperDirectory}/busybox`;
export const outputLimit = 1024 * 1024;
export const podPollMs = { value: 200 };
const channelProtocols = ['v5.channel.k8s.io', 'v4.channel.k8s.io'];
const stdinChunk = 32 * 1024;
const probeTimeoutMs = 15_000;
const failedWaitReasons = new Set(['ErrImagePull', 'ImagePullBackOff', 'InvalidImageName', 'CreateContainerConfigError', 'CreateContainerError', 'RunContainerError']);
const loadProgram = `/bin/busybox tar -x -o -C / && /bin/busybox test -f ${helperDirectory}/complete && /bin/busybox cp /bin/busybox ${helperBinary}`;

const podsPath = (config: KubernetesVerifierConfig, name = ''): string => `/api/v1/namespaces/${config.namespace}/pods${name ? '/' + name : ''}`;
const networkPoliciesPath = (config: KubernetesVerifierConfig): string => `/apis/networking.k8s.io/v1/namespaces/${config.namespace}/networkpolicies`;

function selects(selector: KubernetesObject | undefined, labels: Readonly<Record<string, string>>): boolean {
  if (!selector) return false;
  const matchLabels = Object.entries(selector.matchLabels ?? {}).every(([key, value]) => labels[key] === value);
  const matchExpressions = (selector.matchExpressions ?? []).every((rule: KubernetesObject) => {
    const present = Object.hasOwn(labels, rule.key);
    if (rule.operator === 'In') return present && (rule.values ?? []).includes(labels[rule.key]);
    if (rule.operator === 'NotIn') return !present || !(rule.values ?? []).includes(labels[rule.key]);
    if (rule.operator === 'Exists') return present;
    if (rule.operator === 'DoesNotExist') return !present;
    return true;
  });
  return matchLabels && matchExpressions;
}

/** True when some NetworkPolicy selecting pods with these labels denies all ingress and egress, and no policy selecting them allows any traffic back. */
export function networkIsolated(policies: KubernetesObject[], labels: Readonly<Record<string, string>> = verifierPodLabels): boolean {
  const selecting = policies.filter(policy => selects(policy.spec?.podSelector, labels));
  const allows = (policy: KubernetesObject): boolean => Boolean(policy.spec?.ingress?.length || policy.spec?.egress?.length);
  const denies = (policy: KubernetesObject): boolean => ['Ingress', 'Egress'].every(type => policy.spec?.policyTypes?.includes(type)) && !allows(policy);
  return selecting.some(denies) && !selecting.some(allows);
}

/** The address a check pod must fail to reach: the configured probe or the API server's in-cluster service address. */
export function networkProbeTarget(config: KubernetesVerifierConfig): { host: string; port: number } | undefined {
  if (config.networkProbe) return config.networkProbe;
  const host = process.env.KUBERNETES_SERVICE_HOST; const port = Number(process.env.KUBERNETES_SERVICE_PORT ?? '443');
  return host && Number.isInteger(port) ? { host, port } : undefined;
}

/** Refuses verification before any pod exists when the verifier namespace has no deny-all NetworkPolicy for check pods, or no probe target is known. */
export async function kubernetesVerifierPreflight(config: KubernetesVerifierConfig, client: KubernetesClient): Promise<void> {
  if (!networkProbeTarget(config)) deliveryFailure('verifier_network_probe_unset');
  let policies: KubernetesObject[];
  try { policies = (await client.request(networkPoliciesPath(config)))?.items ?? []; } catch { return deliveryFailure('verifier_network_policy_unreadable'); }
  if (!networkIsolated(policies)) deliveryFailure('verifier_network_policy_missing');
}

export function verifierPod(candidate: CanonicalCandidate, policy: DeliveryPolicy, check: DeliveryCheck, config: KubernetesVerifierConfig, name: string): KubernetesObject {
  const securityContext = { runAsNonRoot: true, runAsUser: archiveOwner, runAsGroup: archiveOwner, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, privileged: false, capabilities: { drop: ['ALL'] }, seccompProfile: { type: 'RuntimeDefault' } };
  const resources = { requests: { ...config.resources.requests }, limits: { ...config.resources.limits } };
  return { apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace: config.namespace,
    labels: { ...verifierPodLabels, 'dev.webgrip.unfold/purpose': 'verifier', 'dev.webgrip.unfold/candidate': candidate.canonicalSha },
    annotations: { 'dev.webgrip.unfold/policy': candidate.policySha, 'dev.webgrip.unfold/check': check.id } }, spec: {
    runtimeClassName: config.runtimeClassName, automountServiceAccountToken: false, enableServiceLinks: false, restartPolicy: 'Never',
    activeDeadlineSeconds: config.timeoutSeconds, terminationGracePeriodSeconds: 1,
    securityContext: { runAsNonRoot: true, runAsUser: archiveOwner, runAsGroup: archiveOwner, seccompProfile: { type: 'RuntimeDefault' } },
    ...(config.nodeSelector ? { nodeSelector: config.nodeSelector } : {}), ...(config.affinity ? { affinity: config.affinity } : {}), ...(config.tolerations ? { tolerations: config.tolerations } : {}),
    ...(config.imagePullSecrets ? { imagePullSecrets: config.imagePullSecrets.map(secret => ({ name: secret })) } : {}),
    initContainers: [{ name: 'load', image: config.image, imagePullPolicy: 'IfNotPresent', command: ['/bin/busybox', 'sh', '-c', loadProgram], stdin: true, stdinOnce: true, tty: false, securityContext, resources,
      volumeMounts: [{ name: 'candidate', mountPath: '/candidate' }, { name: 'policy', mountPath: '/policy' }, { name: 'helper', mountPath: helperDirectory }] }],
    containers: [{ name: 'check', image: policy.image, imagePullPolicy: 'IfNotPresent', command: [helperBinary, 'sleep', String(config.timeoutSeconds)], workingDir: '/candidate',
      env: [{ name: 'HOME', value: '/tmp' }, { name: 'TMPDIR', value: '/tmp' }, { name: 'LANG', value: 'C.UTF-8' }], securityContext, resources,
      volumeMounts: [{ name: 'candidate', mountPath: '/candidate', readOnly: true }, { name: 'policy', mountPath: '/policy', readOnly: true }, { name: 'helper', mountPath: helperDirectory, readOnly: true }, { name: 'tmp', mountPath: '/tmp' }] }],
    volumes: [{ name: 'candidate', emptyDir: { sizeLimit: '96Mi' } }, { name: 'policy', emptyDir: { sizeLimit: '128Mi' } }, { name: 'helper', emptyDir: { sizeLimit: '16Mi' } }, { name: 'tmp', emptyDir: { medium: 'Memory', sizeLimit: '64Mi' } }],
  } };
}

const containerState = (pod: KubernetesObject, group: 'initContainerStatuses' | 'containerStatuses', name: string): KubernetesObject | undefined => pod?.status?.[group]?.find((status: KubernetesObject) => status.name === name);

function podBroken(pod: KubernetesObject): boolean {
  if (['Failed', 'Succeeded'].includes(pod?.status?.phase)) return true;
  const statuses = [...(pod?.status?.initContainerStatuses ?? []), ...(pod?.status?.containerStatuses ?? [])];
  return statuses.some(status => failedWaitReasons.has(status.state?.waiting?.reason) || (status.state?.terminated && (status.name !== 'load' || status.state.terminated.exitCode !== 0)) || status.restartCount > 0);
}

async function awaitPod(client: KubernetesClient, path: string, ready: (pod: KubernetesObject) => boolean, deadline: number): Promise<KubernetesObject> {
  while (Date.now() < deadline) {
    const pod = await client.request(path);
    if (ready(pod)) return pod;
    if (podBroken(pod)) throw new Error('verifier pod failed');
    await new Promise(done => setTimeout(done, podPollMs.value));
  }
  throw new Error('verifier pod deadline');
}

function exitStatus(text: string): number | undefined {
  try {
    const status = JSON.parse(text);
    if (status.status === 'Success') return 0;
    const code = Number(status.details?.causes?.find((cause: KubernetesObject) => cause.reason === 'ExitCode')?.message);
    return status.reason === 'NonZeroExitCode' && Number.isInteger(code) && code >= 0 && code <= 255 ? code : undefined;
  } catch { return undefined; }
}

function exchange(socket: WebSocket, timeoutMs: number, input?: AsyncIterable<Buffer>): Promise<ChannelOutcome> {
  const stdout: Buffer[] = []; const stderr: Buffer[] = []; let status = ''; const sizes = [0, 0];
  const closed = new Promise<void>((done, fail) => {
    const timer = setTimeout(() => { socket.terminate(); fail(new Error('stream deadline')); }, timeoutMs);
    socket.on('message', (data: Buffer) => {
      const channel = data[0]; const payload = data.subarray(1);
      if (channel === 1 || channel === 2) { const index = channel - 1; const room = outputLimit - sizes[index]; if (room > 0) { (channel === 1 ? stdout : stderr).push(payload.subarray(0, room)); sizes[index] += Math.min(room, payload.length); } }
      else if (channel === 3) status += payload.toString('utf8');
    });
    socket.once('close', () => { clearTimeout(timer); done(); });
    socket.once('error', error => { clearTimeout(timer); fail(error); });
  });
  closed.catch(() => undefined);
  socket.resume();
  const send = (data: Buffer): Promise<void> => new Promise((done, fail) => socket.send(data, error => error ? fail(error) : done()));
  return (async () => {
    if (input) {
      for await (const chunk of input) for (let offset = 0; offset < chunk.length; offset += stdinChunk) await send(Buffer.concat([Buffer.from([0]), chunk.subarray(offset, offset + stdinChunk)]));
      if (socket.protocol === 'v5.channel.k8s.io') await send(Buffer.from([255, 0]));
      socket.close(1000);
    }
    await closed;
    return { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), exitCode: status ? exitStatus(status) : undefined };
  })();
}

async function execute(client: KubernetesClient, config: KubernetesVerifierConfig, name: string, argv: string[], timeoutMs: number): Promise<ChannelOutcome> {
  const query = ['container=check', 'stdout=true', 'stderr=true', ...argv.map(part => `command=${encodeURIComponent(part)}`)].join('&');
  return exchange(await client.stream(`${podsPath(config, name)}/exec?${query}`, channelProtocols), timeoutMs);
}

async function upload(client: KubernetesClient, config: KubernetesVerifierConfig, name: string, candidate: CanonicalCandidate, deadline: number): Promise<void> {
  const socket = await client.stream(`${podsPath(config, name)}/attach?container=load&stdin=true&stdout=true&stderr=true`, channelProtocols);
  const archive = verificationArchive([{ directory: candidate.directory, prefix: 'candidate' }, { directory: join(dirname(candidate.directory), 'policy'), prefix: 'policy' }], helperDirectory.slice(1));
  await exchange(socket, Math.max(1, deadline - Date.now()), archive);
}

function imagePinned(pod: KubernetesObject, image: string): boolean {
  const imageId = String(containerState(pod, 'containerStatuses', 'check')?.imageID ?? '');
  return imageId.endsWith(image.slice(image.indexOf('@')));
}

async function verifyCheck(candidate: CanonicalCandidate, policy: DeliveryPolicy, check: DeliveryCheck, config: KubernetesVerifierConfig, client: KubernetesClient, probe: { host: string; port: number }): Promise<CheckResult> {
  const name = `unfold-verify-${randomBytes(12).toString('hex')}`;
  const unconfirmed = (reason: string): CheckResult => ({ id: check.id, passed: false, exitCode: null, stdoutSha256: digest(''), stderrSha256: digest(''), reason });
  let result = unconfirmed('verification_unconfirmed');
  try {
    const deadline = Date.now() + config.timeoutSeconds * 1000;
    await client.request(podsPath(config), 'POST', verifierPod(candidate, policy, check, config, name));
    await awaitPod(client, podsPath(config, name), pod => Boolean(containerState(pod, 'initContainerStatuses', 'load')?.state?.running), deadline);
    await upload(client, config, name, candidate, deadline);
    const running = await awaitPod(client, podsPath(config, name), pod => Boolean(containerState(pod, 'containerStatuses', 'check')?.state?.running), deadline);
    if (!imagePinned(running, policy.image)) result = unconfirmed('image_digest_mismatch');
    else {
      const reach = await execute(client, config, name, [helperBinary, 'nc', '-z', '-n', '-w', '3', probe.host, String(probe.port)], probeTimeoutMs);
      if (reach.exitCode === 0) result = unconfirmed('network_reachable');
      else if (reach.exitCode === 1) {
        const outcome = await execute(client, config, name, check.argv, policy.timeoutMs);
        const after = await client.request(podsPath(config, name));
        if (outcome.exitCode !== undefined && containerState(after, 'containerStatuses', 'check')?.state?.running && !podBroken(after)) {
          const stdout = outcome.stdout.toString('utf8');
          const passed = outcome.exitCode === check.exitCode && stdout === check.stdout;
          result = { id: check.id, passed, exitCode: outcome.exitCode, stdoutSha256: digest(stdout), stderrSha256: digest(outcome.stderr.toString('utf8')), ...(passed ? {} : { reason: 'assertion_failed' }) };
        }
      }
    }
  } catch { result = unconfirmed('verification_unconfirmed'); }
  finally { try { await client.request(podsPath(config, name), 'DELETE', { gracePeriodSeconds: 0, propagationPolicy: 'Background' }, true); } catch { result = { ...result, passed: false, reason: 'cleanup_unconfirmed' }; } }
  return result;
}

/** Runs each policy check in its own fresh, network-less pod under the configured runtime class and returns the same result shape the Docker verifier does. */
export async function verifyCandidateInKubernetes(candidate: CanonicalCandidate, policy: DeliveryPolicy, config: KubernetesVerifierConfig, client: KubernetesClient): Promise<VerificationResult> {
  if (!policy.checks.length) deliveryFailure('zero_checks');
  const probe = networkProbeTarget(config) ?? deliveryFailure('verifier_network_probe_unset');
  const checks: CheckResult[] = [];
  for (const check of policy.checks) checks.push(await verifyCheck(candidate, policy, check, config, client, probe));
  return verificationResult('unfold-kubernetes-v1', candidate, policy, checks);
}
