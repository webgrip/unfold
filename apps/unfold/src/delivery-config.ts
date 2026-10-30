import { isAbsolute, resolve } from 'node:path';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import type { AppConfig } from './types.ts';
import { deliveryPublishers, findDeliveryPublisher, type PublisherConfig } from './delivery-publishers/index.ts';

export type DeliveryCheck = { id: string; argv: string[]; stdout: string; exitCode: number };
export type DeliveryPolicy = { repositoryId: string; approvedBaseSha: string; approvedBaseBundle: string; image: string; directory: string; files: Record<string, string>; protectedPaths: string[]; checks: DeliveryCheck[]; timeoutMs: number };
export type VerifierResources = { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } };
export type KubernetesVerifierConfig = { kind: 'kubernetes'; namespace: string; runtimeClassName: string; image: string; resources: VerifierResources; timeoutSeconds: number; networkProbe?: { host: string; port: number }; nodeSelector?: Record<string, string>; affinity?: Record<string, unknown>; tolerations?: Record<string, unknown>[]; imagePullSecrets?: string[] };
export type VerifierConfig = { kind: 'docker' } | KubernetesVerifierConfig;
export type DeliveryConfig = { verifierTokenEnv: string; socketPath?: string; policies: DeliveryPolicy[]; publisher?: PublisherConfig; verifier?: VerifierConfig };
export const defaultVerifierResources: VerifierResources = { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } };
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const policyDigest = (policy: DeliveryPolicy): string => digest(JSON.stringify({ version: 1, repositoryId: policy.repositoryId, approvedBaseSha: policy.approvedBaseSha, image: policy.image, files: Object.fromEntries(Object.entries(policy.files).sort(([a], [b]) => a.localeCompare(b))), protectedPaths: [...policy.protectedPaths].sort(), checks: policy.checks, timeoutMs: policy.timeoutMs }));
const object = (value: any): boolean => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const deliveryPath = (value: string): boolean => typeof value === 'string' && value.length > 0 && value.length < 1024 && !isAbsolute(value) && !/[\\\x00-\x1f\x7f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');
const invalid = (): never => { throw new Error('delivery requires a scoped verifier credential and pinned, nonempty verification policies.'); };
const invalidPublisher = (): never => { throw new Error(`delivery.publisher requires a kind of ${deliveryPublishers().map(adapter => adapter.kind).join(', ')}, an https apiUrl of that forge without credentials, a tokenEnv no agent workspace, Ploeg consumer or verifier shares, an optional forge username, and https delivery repositories.`); };
const invalidVerifier = (): never => { throw new Error('delivery.verifier requires kind docker, or kind kubernetes with a namespace, a runtimeClassName, a digest-pinned helper image, digest-pinned policy images, bounded resources, a timeoutSeconds that outlasts every check by 30 seconds and an IP networkProbe.'); };
const pinnedImage = (value: unknown): boolean => typeof value === 'string' && /^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$/.test(value);
const dnsLabel = (value: unknown): boolean => typeof value === 'string' && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const quantity = (value: unknown): boolean => typeof value === 'string' && /^[0-9]+(\.[0-9]+)?(m|k|M|G|Ki|Mi|Gi)?$/.test(value);
const environmentName = (value: unknown): boolean => typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,100}$/.test(value);

function validatePublisher(raw: any, config: AppConfig, verifierTokenEnv: string, policies: DeliveryPolicy[]): PublisherConfig | undefined {
  if (raw === undefined) return undefined;
  if (!object(raw) || Object.keys(raw).some(key => !['kind', 'apiUrl', 'tokenEnv', 'username'].includes(key)) || typeof raw.kind !== 'string' || !findDeliveryPublisher(raw.kind) || (raw.username !== undefined && (typeof raw.username !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(raw.username))) || !environmentName(raw.tokenEnv) || raw.tokenEnv === verifierTokenEnv || raw.tokenEnv === config.ploeg?.tokenEnv || config.runtime.agentEnvironment?.includes(raw.tokenEnv) || typeof raw.apiUrl !== 'string') invalidPublisher();
  let api: URL;
  try { api = new URL(raw.apiUrl); } catch { return invalidPublisher(); }
  const forge = findDeliveryPublisher(raw.kind)!;
  if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || !forge.acceptsApiUrl(api)) invalidPublisher();
  for (const policy of policies) {
    const repository = config.repositories.find(repo => repo.id === policy.repositoryId);
    if (!repository || !forge.acceptsRepository(repository.url)) invalidPublisher();
  }
  return { kind: forge.kind, apiUrl: api.toString().replace(/\/+$/, ''), tokenEnv: raw.tokenEnv, username: raw.username ?? 'unfold-publisher' };
}

function validateVerifier(raw: any, policies: DeliveryPolicy[]): VerifierConfig | undefined {
  if (raw === undefined) return undefined;
  if (!object(raw) || !['docker', 'kubernetes'].includes(raw.kind)) invalidVerifier();
  if (raw.kind === 'docker') return Object.keys(raw).length === 1 ? { kind: 'docker' } : invalidVerifier();
  const keys = ['kind', 'namespace', 'runtimeClassName', 'image', 'resources', 'timeoutSeconds', 'networkProbe', 'nodeSelector', 'affinity', 'tolerations', 'imagePullSecrets'];
  const resources = raw.resources ?? defaultVerifierResources;
  const timeoutSeconds = raw.timeoutSeconds ?? 300;
  const probe = raw.networkProbe;
  if (Object.keys(raw).some(key => !keys.includes(key)) || !dnsLabel(raw.namespace) || !dnsLabel(raw.runtimeClassName ?? 'kata') || !pinnedImage(raw.image) || policies.some(policy => !pinnedImage(policy.image))) invalidVerifier();
  if (!object(resources) || Object.keys(resources).some(key => !['requests', 'limits'].includes(key)) || ['requests', 'limits'].some(group => !object(resources[group]) || Object.keys(resources[group]).some(key => !['cpu', 'memory'].includes(key)) || !quantity(resources[group].cpu) || !quantity(resources[group].memory))) invalidVerifier();
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds > 3600 || policies.some(policy => timeoutSeconds * 1000 < policy.timeoutMs + 30000)) invalidVerifier();
  if (probe !== undefined && (!object(probe) || Object.keys(probe).some(key => !['host', 'port'].includes(key)) || !isIP(String(probe.host)) || !Number.isInteger(probe.port) || probe.port < 1 || probe.port > 65535)) invalidVerifier();
  if (raw.nodeSelector !== undefined && (!object(raw.nodeSelector) || Object.values(raw.nodeSelector).some(value => typeof value !== 'string'))) invalidVerifier();
  if ((raw.affinity !== undefined && !object(raw.affinity)) || (raw.tolerations !== undefined && (!Array.isArray(raw.tolerations) || !raw.tolerations.every(object))) || (raw.imagePullSecrets !== undefined && (!Array.isArray(raw.imagePullSecrets) || !raw.imagePullSecrets.every((name: unknown) => typeof name === 'string' && /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(name))))) invalidVerifier();
  return { kind: 'kubernetes', namespace: raw.namespace, runtimeClassName: raw.runtimeClassName ?? 'kata', image: raw.image, resources: { requests: { ...resources.requests }, limits: { ...resources.limits } }, timeoutSeconds, ...(probe ? { networkProbe: { host: probe.host, port: probe.port } } : {}), ...(raw.nodeSelector && Object.keys(raw.nodeSelector).length ? { nodeSelector: raw.nodeSelector } : {}), ...(raw.affinity && Object.keys(raw.affinity).length ? { affinity: raw.affinity } : {}), ...(raw.tolerations?.length ? { tolerations: raw.tolerations } : {}), ...(raw.imagePullSecrets?.length ? { imagePullSecrets: raw.imagePullSecrets } : {}) };
}

export function validateDeliveryConfig(raw: any, config: AppConfig): DeliveryConfig | undefined {
  if (raw === undefined) return undefined;
  if (!config.execution || !object(raw) || Object.keys(raw).some(key => !['verifierTokenEnv', 'socketPath', 'policies', 'publisher', 'verifier'].includes(key)) || !/^[A-Z][A-Z0-9_]{2,100}$/.test(raw.verifierTokenEnv ?? '') || raw.verifierTokenEnv === config.ploeg?.tokenEnv || config.runtime.agentEnvironment?.includes(raw.verifierTokenEnv) || !Array.isArray(raw.policies) || !raw.policies.length || raw.policies.length > 100) invalid();
  if (raw.socketPath !== undefined && (typeof raw.socketPath !== 'string' || !isAbsolute(raw.socketPath))) invalid();
  const seen = new Set<string>();
  const policies: DeliveryPolicy[] = raw.policies.map((policy: any) => {
    if (!object(policy) || Object.keys(policy).some(key => !['repositoryId', 'approvedBaseSha', 'approvedBaseBundle', 'image', 'directory', 'files', 'protectedPaths', 'checks', 'timeoutMs'].includes(key)) || !config.repositories.some(repo => repo.id === policy.repositoryId) || seen.has(policy.repositoryId) || !/^[a-f0-9]{40}$/.test(policy.approvedBaseSha ?? '') || !/^(?:[a-zA-Z0-9._:/-]+@)?sha256:[a-f0-9]{64}$/.test(policy.image ?? '') || typeof policy.approvedBaseBundle !== 'string' || !isAbsolute(policy.approvedBaseBundle) || typeof policy.directory !== 'string' || !isAbsolute(policy.directory) || !object(policy.files) || !Object.keys(policy.files).length || Object.keys(policy.files).length > 100 || Object.entries(policy.files).some(([path, sha]) => !deliveryPath(path) || !/^[a-f0-9]{64}$/.test(String(sha))) || !Array.isArray(policy.protectedPaths) || policy.protectedPaths.some((path: string) => !deliveryPath(path)) || !Array.isArray(policy.checks) || !policy.checks.length || policy.checks.length > 50) invalid();
    const ids = new Set();
    for (const check of policy.checks) {
      if (!object(check) || Object.keys(check).some(key => !['id', 'argv', 'stdout', 'exitCode'].includes(key)) || !/^[a-zA-Z0-9_-]{1,80}$/.test(check.id ?? '') || ids.has(check.id) || !Array.isArray(check.argv) || !check.argv.length || check.argv.length > 40 || check.argv.some((part: unknown) => typeof part !== 'string' || part.length > 4096 || part.includes('\0')) || !isAbsolute(check.argv[0]) || typeof check.stdout !== 'string' || Buffer.byteLength(check.stdout) > 65536 || !Number.isInteger(check.exitCode) || check.exitCode < 0 || check.exitCode > 255) invalid();
      ids.add(check.id);
    }
    const timeoutMs = policy.timeoutMs ?? 30000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) invalid();
    for (const path of [policy.directory, policy.approvedBaseBundle]) if (resolve(path).startsWith(resolve(config.dataDir) + '/')) invalid();
    seen.add(policy.repositoryId);
    return { ...policy, timeoutMs };
  });
  const publisher = validatePublisher(raw.publisher, config, raw.verifierTokenEnv, policies);
  const verifier = validateVerifier(raw.verifier, policies);
  return { verifierTokenEnv: raw.verifierTokenEnv, ...(raw.socketPath ? { socketPath: raw.socketPath } : {}), policies, ...(publisher ? { publisher } : {}), ...(verifier ? { verifier } : {}) };
}
