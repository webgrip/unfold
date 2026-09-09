import { readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig, Repository, Crew } from './types.ts';
import { validateTaskSources } from './tasks.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export const defaultCrews: Crew[] = [
  { id: 'delivery', name: 'Delivery crew', description: 'An implementer makes the change. An independent reviewer checks the evidence.', roles: [
    { id: 'implementer', name: 'Implementer', mode: 'write', instruction: 'Implement the objective in the assigned repository. Make the smallest coherent change. Run the configured verification commands. Record actual results and unresolved risks. Do not merge or deploy. End with a concise summary.' },
    { id: 'reviewer', name: 'Reviewer', mode: 'read', instruction: 'Independently inspect the diff and verification evidence. Do not modify source or push. Return a verdict on its own line: VERDICT: approve, VERDICT: request_changes, or VERDICT: inconclusive. Approve only if the acceptance criteria are demonstrably satisfied. Explain concrete findings.' }
  ]},
  { id: 'investigation', name: 'Investigation crew', description: 'An analyst investigates. A second reader challenges the findings.', roles: [
    { id: 'analyst', name: 'Analyst', mode: 'read', instruction: 'Investigate the objective without modifying source or pushing. Cite files and evidence. Identify what is verified and what remains uncertain. End with VERDICT: approve if the investigation is complete, otherwise VERDICT: inconclusive.' },
    { id: 'challenger', name: 'Challenger', mode: 'read', instruction: 'Review the investigation independently. Look for unsupported conclusions and overlooked constraints. Do not modify source. End with VERDICT: approve, VERDICT: request_changes, or VERDICT: inconclusive.' }
  ]}
];

function number(value: unknown, fallback: number, min: number, max: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return parsed;
}

function configuredUrl(value: string, name: string): string {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${name} must be an HTTP(S) URL without embedded credentials`);
  return value.replace(/\/$/, '');
}

export function loadConfig(argv = process.argv.slice(2)): AppConfig {
  const fileIndex = argv.indexOf('--config');
  const configFile = fileIndex >= 0 ? argv[fileIndex + 1] : process.env.VLOER_CONFIG;
  if (fileIndex >= 0 && !configFile) throw new Error('--config requires a file path');
  const raw = configFile ? JSON.parse(readFileSync(resolve(configFile), 'utf8')) : {};
  const mode = argv.includes('--demo') ? 'demo' : process.env.VLOER_MODE || raw.mode || 'live';
  if (!['live', 'demo'].includes(mode)) throw new Error('mode must be live or demo');
  const dataDir = resolve(process.env.VLOER_DATA_DIR || raw.dataDir || '.vloer');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const repositories: Repository[] = mode === 'demo' ? [{ id: 'order-service', name: 'Order service', description: 'A small checkout service with a reproducible rounding regression.', url: fileURLToPath(new URL('../examples/order-service/', import.meta.url)), baseBranch: 'main', verify: ['node', '--test'] }] : raw.repositories || [];
  const ids = new Set<string>();
  for (const repo of repositories) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(repo.id) || ids.has(repo.id)) throw new Error('Repository IDs must be unique lowercase slugs');
    ids.add(repo.id);
    if (!repo.name || !repo.url || !repo.baseBranch || !Array.isArray(repo.verify) || repo.verify.some((v: unknown) => typeof v !== 'string')) throw new Error(`Invalid repository ${repo.id}`);
    if (mode === 'live') configuredUrl(repo.url, `Repository ${repo.id}`);
    if (repo.trackerUrl) configuredUrl(repo.trackerUrl, `Repository ${repo.id} trackerUrl`);
    if (repo.executionOwner !== undefined && !['interactive', 'ploeg'].includes(repo.executionOwner)) throw new Error(`Invalid execution owner for repository ${repo.id}`);
  }
  const crews = mode === 'demo' ? defaultCrews.filter(crew => crew.id === 'delivery') : raw.crews || defaultCrews;
  if (!Array.isArray(crews) || !crews.length) throw new Error('At least one crew is required');
  const crewIds = new Set<string>();
  for (const crew of crews) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(crew.id) || crewIds.has(crew.id)) throw new Error('Crew IDs must be unique lowercase slugs');
    crewIds.add(crew.id);
    if (!Array.isArray(crew.roles) || !crew.roles.length || crew.roles.length > 8) throw new Error(`Crew ${crew.id} requires 1–8 roles`);
    const roleIds = new Set();
    for (const role of crew.roles) {
      if (!role.id || roleIds.has(role.id) || !role.name || !role.instruction || !['read','write'].includes(role.mode)) throw new Error(`Invalid role in ${crew.id}`);
      roleIds.add(role.id);
    }
  }
  const baseUrl = process.env.VLOER_BASE_URL || raw.baseUrl;
  const litellmBase = process.env.LITELLM_BASE_URL || raw.litellm?.baseUrl;
  const adminKey = process.env.LITELLM_MASTER_KEY || '';
  if (raw.litellm?.masterKey) throw new Error('Set LITELLM_MASTER_KEY in the environment, not in a configuration file');
  const models = raw.models || [{ id: 'coding', name: 'Coding', providerId: 'litellm', modelId: 'coding' }];
  const runtime = { kind: mode === 'demo' ? 'demo' : 'opencode', backend: 'local', binary: 'opencode', timeoutMs: 20 * 60 * 1000, ...raw.runtime };
  if (mode === 'demo') runtime.kind = 'demo';
  if (process.env.OPENCODE_URL) { runtime.endpoint = configuredUrl(process.env.OPENCODE_URL, 'OPENCODE_URL'); runtime.backend = 'external'; }
  if (process.env.OPENCODE_SERVER_PASSWORD) runtime.password = process.env.OPENCODE_SERVER_PASSWORD;
  if (process.env.OPENCODE_SERVER_USERNAME) runtime.username = process.env.OPENCODE_SERVER_USERNAME;
  if (!['demo','opencode','command'].includes(runtime.kind) || !['local','external','kubernetes'].includes(runtime.backend)) throw new Error('Unsupported runtime or workspace backend');
  if (mode === 'live' && runtime.kind === 'demo') throw new Error('The demonstration runtime requires demo mode');
  if (runtime.endpoint) configuredUrl(runtime.endpoint, 'runtime.endpoint');
  if (raw.ploeg && (!Array.isArray(raw.ploeg.teams) || raw.ploeg.teams.length > 50 || raw.ploeg.teams.some((team: unknown) => typeof team !== 'string' || !team || team.length > 100))) throw new Error('ploeg.teams must contain at most 50 team names');
  if (raw.ploeg?.trackerUrl) configuredUrl(raw.ploeg.trackerUrl, 'ploeg.trackerUrl');
  const config: AppConfig = {
    mode, host: process.env.VLOER_HOST || raw.host || '127.0.0.1', port: number(process.env.VLOER_PORT ?? raw.port, 4080, 0, 65535, 'port'),
    dataDir, publicDir: resolve(raw.publicDir || `${root}/public`), baseUrl: baseUrl ? configuredUrl(baseUrl, 'baseUrl') : undefined,
    repositories, crews, models, runtime,
    taskSources: validateTaskSources(raw.taskSources, repositories, mode),
    auth: { secureCookies: baseUrl?.startsWith('https://') ?? false, sessionHours: 12, bootstrapName: process.env.VLOER_ADMIN_NAME || 'admin', ...raw.auth, bootstrapPassword: process.env.VLOER_ADMIN_PASSWORD },
    maxConcurrentSessions: number(raw.maxConcurrentSessions, 2, 1, 16, 'maxConcurrentSessions'), maxBudgetUsd: number(raw.maxBudgetUsd, 25, 0.01, 10000, 'maxBudgetUsd'),
    kubernetes: raw.kubernetes,
    ploeg: raw.ploeg ? { ...raw.ploeg, url: configuredUrl(raw.ploeg.url, 'ploeg.url') } : undefined,
    litellm: litellmBase && adminKey ? { baseUrl: configuredUrl(litellmBase, 'litellm.baseUrl'), adminUrl: configuredUrl(process.env.LITELLM_ADMIN_URL || raw.litellm?.adminUrl || litellmBase.replace(/\/v1\/?$/, ''), 'litellm.adminUrl'), masterKey: adminKey, models: models.map((model: any) => model.modelId), ttl: raw.litellm?.ttl || '4h', settlementDelayMs: number(raw.litellm?.settlementDelayMs, 60000, 0, 3600000, 'litellm.settlementDelayMs') } : undefined
  };
  if (!existsSync(config.publicDir)) throw new Error('Browser application directory is missing');
  return config;
}
