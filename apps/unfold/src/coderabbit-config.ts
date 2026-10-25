import { isAbsolute, resolve } from 'node:path';
import type { AppConfig } from './types.ts';

export type CodeRabbitRepository = { repositoryId: string; github: string; base: string; region: 'us' | 'eu'; agenticKeyEnv?: string; security?: { keyEnv: string; repositoryId: string; organizationId: string } };
export type CodeRabbitConfig = { cli?: { binary: string; sha256: string; timeoutMs: number }; dailyReviewLimit: number; repositories: CodeRabbitRepository[] };
const object = (value: any): boolean => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keys = (value: any, allowed: string[]): boolean => object(value) && Object.keys(value).every(key => allowed.includes(key));
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const environment = (value: unknown): value is string => typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,100}$/.test(value);
const invalid = (): never => { throw new Error('coderabbit requires registered repositories, scoped credentials outside agent environments, a pinned absolute CLI binary for reviews, and bounded limits.'); };

export function validateCodeRabbitConfig(raw: any, config: AppConfig): CodeRabbitConfig | undefined {
  if (raw === undefined) return undefined;
  if (config.mode !== 'live' || !config.execution || !keys(raw, ['cli', 'dailyReviewLimit', 'repositories']) || !Array.isArray(raw.repositories) || !raw.repositories.length || raw.repositories.length > 100) invalid();
  const dailyReviewLimit = raw.dailyReviewLimit ?? 5;
  if (!Number.isInteger(dailyReviewLimit) || dailyReviewLimit < 1 || dailyReviewLimit > 100) invalid();
  let cli: CodeRabbitConfig['cli'];
  if (raw.cli !== undefined) {
    const c = raw.cli;
    if (!keys(c, ['binary', 'sha256', 'timeoutMs']) || typeof c.binary !== 'string' || !isAbsolute(c.binary) || /[\x00-\x1f]/.test(c.binary) || !/^[a-f0-9]{64}$/.test(c.sha256 ?? '') || !Number.isInteger(c.timeoutMs ?? 1200000) || (c.timeoutMs ?? 1200000) < 900000 || (c.timeoutMs ?? 1200000) > 3600000) invalid();
    if (config.dataDir && (resolve(c.binary) === resolve(config.dataDir) || resolve(c.binary).startsWith(resolve(config.dataDir) + '/'))) invalid();
    cli = { binary: c.binary, sha256: c.sha256, timeoutMs: c.timeoutMs ?? 1200000 };
  }
  const forbidden = ['UNFOLD_STORE_KEY', 'UNFOLD_BOOTSTRAP_PASSWORD', config.ploeg?.tokenEnv, config.ploeg?.personTokens?.clientSecretEnv, config.delivery?.verifierTokenEnv, config.delivery?.publisher?.tokenEnv, config.decider?.keyEnv, config.cardThemes?.ai?.keyEnv, ...(config.runtime.agentEnvironment ?? [])];
  const seen = new Set<string>();
  const repositories: CodeRabbitRepository[] = raw.repositories.map((r: any) => {
    if (!keys(r, ['repositoryId', 'github', 'base', 'region', 'agenticKeyEnv', 'security']) || !config.repositories.some(repo => repo.id === r.repositoryId) || seen.has(r.repositoryId) || typeof r.github !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(r.github) || typeof r.base !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,200}$/.test(r.base) || r.base.includes('..') || !['us', 'eu'].includes(r.region ?? 'us')) invalid();
    if (r.agenticKeyEnv !== undefined && (!cli || !environment(r.agenticKeyEnv) || forbidden.includes(r.agenticKeyEnv))) invalid();
    if (r.security !== undefined && (!keys(r.security, ['keyEnv', 'repositoryId', 'organizationId']) || !environment(r.security.keyEnv) || forbidden.includes(r.security.keyEnv) || r.security.keyEnv === r.agenticKeyEnv || !identifier(r.security.repositoryId) || !identifier(r.security.organizationId))) invalid();
    if (!r.agenticKeyEnv && !r.security) invalid();
    seen.add(r.repositoryId);
    return { repositoryId: r.repositoryId, github: r.github, base: r.base, region: r.region ?? 'us', ...(r.agenticKeyEnv ? { agenticKeyEnv: r.agenticKeyEnv } : {}), ...(r.security ? { security: { ...r.security } } : {}) };
  });
  const reviewKeys = new Set(repositories.map(repo => repo.agenticKeyEnv).filter(Boolean));
  if (repositories.some(repo => reviewKeys.has(repo.security?.keyEnv))) invalid();
  return { ...(cli ? { cli } : {}), dailyReviewLimit, repositories };
}
