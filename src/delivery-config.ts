import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { AppConfig } from './types.ts';

export type DeliveryCheck = { id: string; argv: string[]; stdout: string; exitCode: number };
export type DeliveryPolicy = { repositoryId: string; approvedBaseSha: string; approvedBaseBundle: string; image: string; directory: string; files: Record<string, string>; protectedPaths: string[]; checks: DeliveryCheck[]; timeoutMs: number };
export type DeliveryConfig = { verifierTokenEnv: string; socketPath?: string; policies: DeliveryPolicy[] };
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const policyDigest = (policy: DeliveryPolicy): string => digest(JSON.stringify({ version: 1, repositoryId: policy.repositoryId, approvedBaseSha: policy.approvedBaseSha, image: policy.image, files: Object.fromEntries(Object.entries(policy.files).sort(([a], [b]) => a.localeCompare(b))), protectedPaths: [...policy.protectedPaths].sort(), checks: policy.checks, timeoutMs: policy.timeoutMs }));
const object = (value: any): boolean => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const deliveryPath = (value: string): boolean => typeof value === 'string' && value.length > 0 && value.length < 1024 && !isAbsolute(value) && !/[\\\x00-\x1f\x7f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');
const invalid = (): never => { throw new Error('delivery requires a scoped verifier credential and pinned, nonempty verification policies.'); };

export function validateDeliveryConfig(raw: any, config: AppConfig): DeliveryConfig | undefined {
  if (raw === undefined) return undefined;
  if (!config.execution || !object(raw) || Object.keys(raw).some(key => !['verifierTokenEnv', 'socketPath', 'policies'].includes(key)) || !/^[A-Z][A-Z0-9_]{2,100}$/.test(raw.verifierTokenEnv ?? '') || raw.verifierTokenEnv === config.ploeg?.tokenEnv || config.runtime.agentEnvironment?.includes(raw.verifierTokenEnv) || !Array.isArray(raw.policies) || !raw.policies.length || raw.policies.length > 100) invalid();
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
  return { verifierTokenEnv: raw.verifierTokenEnv, ...(raw.socketPath ? { socketPath: raw.socketPath } : {}), policies };
}
