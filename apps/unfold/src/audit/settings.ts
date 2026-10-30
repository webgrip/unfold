import type { AuditConfig } from '../types.ts';
import type { ObjectStoreSettings } from './object-store.ts';
import { serviceAccountTokenPath, type OpenBaoSettings } from './signer.ts';

/** How long audit records are kept when the configuration names no retention. */
export const defaultRetentionDays = 400;

/**
 * Reads the audit settings: `UNFOLD_AUDIT_RETENTION_DAYS` (else `audit.retentionDays`, else 400), the optional OTLP
 * logs endpoint `UNFOLD_AUDIT_OTLP_URL` (else `audit.otlpUrl`) with `UNFOLD_AUDIT_OTLP_HEADERS` as `key=value` pairs
 * separated by commas, as `OTEL_EXPORTER_OTLP_HEADERS` writes them, and the checkpoint signer and bucket.
 */
export function auditSettings(raw?: unknown, env: NodeJS.ProcessEnv = process.env): AuditConfig {
  const configured = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (raw !== undefined && raw !== configured) throw new Error('audit must be an object');
  const daysValue = env.UNFOLD_AUDIT_RETENTION_DAYS || configured.retentionDays;
  const retentionDays = daysValue === undefined ? defaultRetentionDays : Number(daysValue);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('UNFOLD_AUDIT_RETENTION_DAYS (or audit.retentionDays) must be a whole number of days from 1 to 3650');
  const signing = openBaoSettings(configured.openbao, env);
  const storage = checkpointStorageSettings(configured.checkpoints, env);
  const extra = { ...(signing ? { openbao: signing } : {}), ...(storage ? { checkpointStorage: storage } : {}) };
  const url = env.UNFOLD_AUDIT_OTLP_URL || (configured.otlpUrl as string | undefined);
  if (url === undefined) return { retentionDays, ...extra };
  let parsed: URL;
  try { parsed = new URL(String(url)); } catch { throw new Error('UNFOLD_AUDIT_OTLP_URL must be an absolute URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('UNFOLD_AUDIT_OTLP_URL must be an HTTP(S) URL without embedded credentials');
  const headers: Record<string, string> = {};
  for (const pair of (env.UNFOLD_AUDIT_OTLP_HEADERS ?? '').split(',').map(item => item.trim()).filter(Boolean)) {
    const at = pair.indexOf('=');
    const key = at > 0 ? decodeURIComponent(pair.slice(0, at).trim()) : '';
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(key)) throw new Error('UNFOLD_AUDIT_OTLP_HEADERS must be key=value pairs separated by commas');
    headers[key] = decodeURIComponent(pair.slice(at + 1).trim());
  }
  return { retentionDays, otlp: { url: String(url), headers }, ...extra };
}

const objectOf = (raw: unknown, name: string): Record<string, unknown> => {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${name} must be an object`);
  return raw as Record<string, unknown>;
};

const httpUrl = (value: string, name: string): string => {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(`${name} must be an HTTP(S) URL without credentials, query or fragment`);
  return value;
};

const pathPart = (value: unknown, fallback: string, name: string): string => {
  const text = value === undefined || value === '' ? fallback : String(value);
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(text)) throw new Error(`${name} must be a path of letters, digits, '.', '_' and '-' separated by '/'`);
  return text;
};

/**
 * Reads the OpenBao Transit key that signs audit checkpoints: `UNFOLD_AUDIT_OPENBAO_ADDR` (else `audit.openbao.address`),
 * the Transit mount and key, and either a token in `UNFOLD_AUDIT_OPENBAO_TOKEN` or a Kubernetes auth role. Absent
 * without an address. A token is read from the environment only.
 */
export function openBaoSettings(raw: unknown, env: NodeJS.ProcessEnv = process.env): OpenBaoSettings | undefined {
  const configured = objectOf(raw, 'audit.openbao');
  if ('token' in configured) throw new Error('audit.openbao.token is not read from the configuration file; set UNFOLD_AUDIT_OPENBAO_TOKEN from a secret');
  const address = env.UNFOLD_AUDIT_OPENBAO_ADDR || (configured.address as string | undefined);
  const token = env.UNFOLD_AUDIT_OPENBAO_TOKEN;
  const role = env.UNFOLD_AUDIT_OPENBAO_ROLE || (configured.role as string | undefined);
  if (!address) {
    if (token || role) throw new Error('UNFOLD_AUDIT_OPENBAO_ADDR (or audit.openbao.address) is required with an OpenBao token or role');
    return undefined;
  }
  if (!token && !role) throw new Error('Set UNFOLD_AUDIT_OPENBAO_TOKEN or UNFOLD_AUDIT_OPENBAO_ROLE (or audit.openbao.role) to sign audit checkpoints with OpenBao');
  const mount = pathPart(env.UNFOLD_AUDIT_OPENBAO_MOUNT || configured.mount, 'transit', 'UNFOLD_AUDIT_OPENBAO_MOUNT (or audit.openbao.mount)');
  const key = pathPart(env.UNFOLD_AUDIT_OPENBAO_KEY || configured.key, 'unfold-audit', 'UNFOLD_AUDIT_OPENBAO_KEY (or audit.openbao.key)');
  if (key.includes('/')) throw new Error('UNFOLD_AUDIT_OPENBAO_KEY (or audit.openbao.key) is one Transit key name');
  const auth: OpenBaoSettings['auth'] = token
    ? { kind: 'token', token }
    : { kind: 'kubernetes', role: pathPart(role, '', 'UNFOLD_AUDIT_OPENBAO_ROLE (or audit.openbao.role)'), mount: pathPart(env.UNFOLD_AUDIT_OPENBAO_AUTH_MOUNT || configured.authMount, 'kubernetes', 'UNFOLD_AUDIT_OPENBAO_AUTH_MOUNT (or audit.openbao.authMount)'), jwtPath: String(configured.jwtPath || serviceAccountTokenPath) };
  return { address: httpUrl(address, 'UNFOLD_AUDIT_OPENBAO_ADDR (or audit.openbao.address)'), mount, key, auth };
}

/**
 * Reads the S3-compatible bucket audit checkpoints are copied to: `UNFOLD_AUDIT_CHECKPOINT_URL` (else
 * `audit.checkpoints.url`), its region and prefix, the optional Object Lock days, and the access key pair from
 * `UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID` and `UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY` only. Absent without a URL.
 */
export function checkpointStorageSettings(raw: unknown, env: NodeJS.ProcessEnv = process.env): ObjectStoreSettings | undefined {
  const configured = objectOf(raw, 'audit.checkpoints');
  if ('accessKeyId' in configured || 'secretAccessKey' in configured) throw new Error('The checkpoint bucket\'s keys are not read from the configuration file; set UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID and UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY from a secret');
  const url = env.UNFOLD_AUDIT_CHECKPOINT_URL || (configured.url as string | undefined);
  if (!url) return undefined;
  const accessKeyId = env.UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID;
  const secretAccessKey = env.UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID and UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY are required with UNFOLD_AUDIT_CHECKPOINT_URL');
  const region = String(env.UNFOLD_AUDIT_CHECKPOINT_REGION || configured.region || 'us-east-1');
  if (!/^[a-z0-9-]{1,40}$/.test(region)) throw new Error('UNFOLD_AUDIT_CHECKPOINT_REGION (or audit.checkpoints.region) must be a region name such as eu-central-1 or auto');
  const prefix = pathPart(env.UNFOLD_AUDIT_CHECKPOINT_PREFIX || configured.prefix, 'unfold-audit', 'UNFOLD_AUDIT_CHECKPOINT_PREFIX (or audit.checkpoints.prefix)');
  const lockValue = env.UNFOLD_AUDIT_CHECKPOINT_LOCK_DAYS || configured.lockDays;
  const lockDays = lockValue === undefined || lockValue === '' ? undefined : Number(lockValue);
  if (lockDays !== undefined && (!Number.isInteger(lockDays) || lockDays < 1 || lockDays > 36500)) throw new Error('UNFOLD_AUDIT_CHECKPOINT_LOCK_DAYS (or audit.checkpoints.lockDays) must be a whole number of days from 1 to 36500');
  return { url: httpUrl(String(url), 'UNFOLD_AUDIT_CHECKPOINT_URL (or audit.checkpoints.url)'), region, prefix, accessKeyId, secretAccessKey, ...(lockDays ? { lockDays } : {}) };
}
