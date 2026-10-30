import type { AuditConfig } from '../types.ts';

/** How long audit records are kept when the configuration names no retention. */
export const defaultRetentionDays = 400;

/**
 * Reads the audit settings: `UNFOLD_AUDIT_RETENTION_DAYS` (else `audit.retentionDays`, else 400), and the optional OTLP
 * logs endpoint `UNFOLD_AUDIT_OTLP_URL` (else `audit.otlpUrl`) with `UNFOLD_AUDIT_OTLP_HEADERS` as `key=value` pairs
 * separated by commas, as `OTEL_EXPORTER_OTLP_HEADERS` writes them.
 */
export function auditSettings(raw?: unknown, env: NodeJS.ProcessEnv = process.env): AuditConfig {
  const configured = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (raw !== undefined && raw !== configured) throw new Error('audit must be an object');
  const daysValue = env.UNFOLD_AUDIT_RETENTION_DAYS || configured.retentionDays;
  const retentionDays = daysValue === undefined ? defaultRetentionDays : Number(daysValue);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('UNFOLD_AUDIT_RETENTION_DAYS (or audit.retentionDays) must be a whole number of days from 1 to 3650');
  const url = env.UNFOLD_AUDIT_OTLP_URL || (configured.otlpUrl as string | undefined);
  if (url === undefined) return { retentionDays };
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
  return { retentionDays, otlp: { url: String(url), headers } };
}
