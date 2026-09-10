import { readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig, Repository, Crew, Placement, WorkspaceBackend } from './types.ts';
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

const backendOrder: WorkspaceBackend[] = ['docker', 'kubernetes', 'local'];
const reservedEnvironment = /^(LITELLM_MASTER_KEY|LITELLM_ADMIN_URL|OPENCODE_SERVER_|VLOER_|KUBERNETES_|DOCKER_HOST|BAO_TOKEN|VAULT_TOKEN|HOME|PATH)/;

function workspaceBackends(runtime: AppConfig['runtime'], explicitDefault: unknown): WorkspaceBackend[] {
  const declared = (runtime as { backends?: unknown }).backends;
  if (declared === undefined) return runtime.backend === 'external' ? [] : [runtime.backend];
  if (!Array.isArray(declared) || !declared.length || declared.some(item => !backendOrder.includes(item as WorkspaceBackend))) throw new Error('runtime.backends must list docker, kubernetes or local');
  const backends = [...new Set(declared as WorkspaceBackend[])];
  if (runtime.backend === 'external') throw new Error('An external OpenCode endpoint cannot be combined with managed workspace backends');
  if (explicitDefault === undefined) runtime.backend = backends[0];
  else if (!backends.includes(runtime.backend)) throw new Error('runtime.backend must be one of runtime.backends');
  return backends;
}

function agentEnvironmentNames(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64 || value.some(name => typeof name !== 'string' || !/^[A-Z_][A-Z0-9_]{0,127}$/.test(name))) throw new Error('runtime.agentEnvironment must list uppercase environment variable names');
  for (const name of value as string[]) if (reservedEnvironment.test(name)) throw new Error(`runtime.agentEnvironment must not pass ${name} to agent workspaces`);
  return [...new Set(value as string[])];
}

function transportSetting(value: unknown, name: string): 'publish' | 'pull' {
  if (value === undefined) return 'publish';
  if (value !== 'publish' && value !== 'pull') throw new Error(`${name} must be publish or pull`);
  return value;
}

function dockerSettings(raw: unknown): NonNullable<AppConfig['docker']> {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof value.image !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._\/:@-]{0,255}$/.test(value.image)) throw new Error('docker.image must name the agent image, for example de-vloer-agent:1.18.30');
  for (const key of ['socketPath', 'network', 'user']) if (value[key] !== undefined && (typeof value[key] !== 'string' || !(value[key] as string).length || (value[key] as string).length > 512)) throw new Error(`docker.${key} must be a non-empty string`);
  if (value.network !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.network as string)) throw new Error('docker.network must be a Docker network name');
  if (value.user !== undefined && !/^[0-9]{1,10}(:[0-9]{1,10})?$/.test(value.user as string)) throw new Error('docker.user must be a numeric uid or uid:gid');
  return {
    image: value.image, socketPath: value.socketPath as string | undefined, network: value.network as string | undefined, user: value.user as string | undefined,
    cpus: number(value.cpus, 2, 0.25, 64, 'docker.cpus'), memoryMb: number(value.memoryMb, 4096, 256, 262144, 'docker.memoryMb'), pidsLimit: number(value.pidsLimit, 512, 32, 65536, 'docker.pidsLimit'),
    gatewayUrl: value.gatewayUrl === undefined ? undefined : configuredUrl(String(value.gatewayUrl), 'docker.gatewayUrl'),
    transport: transportSetting(value.transport, 'docker.transport'),
    relayUrl: value.relayUrl === undefined ? undefined : configuredUrl(String(value.relayUrl), 'docker.relayUrl'),
    provisionTimeoutMs: number(value.provisionTimeoutMs, 180_000, 5_000, 3_600_000, 'docker.provisionTimeoutMs'),
  };
}

export function placements(config: AppConfig): Placement[] {
  if (config.mode === 'demo') return [];
  const names: Record<WorkspaceBackend, Placement['name']> = { docker: 'Container on the workbench host', kubernetes: 'Pod in the workspace namespace', local: 'Working directory on the workbench host (trusted only)' };
  const isolation: Record<WorkspaceBackend, Placement['isolation']> = { docker: 'container', kubernetes: 'pod', local: 'working-directory' };
  return (config.runtime.backends ?? []).map(id => ({ id, name: names[id], isolation: isolation[id], default: id === config.runtime.backend }));
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
  if (!['demo','opencode','command'].includes(runtime.kind) || !['local','external','docker','kubernetes'].includes(runtime.backend)) throw new Error('Unsupported runtime or workspace backend');
  if (mode === 'live' && runtime.kind === 'demo') throw new Error('The demonstration runtime requires demo mode');
  if (runtime.endpoint) configuredUrl(runtime.endpoint, 'runtime.endpoint');
  runtime.backends = workspaceBackends(runtime, raw.runtime?.backend);
  runtime.agentEnvironment = agentEnvironmentNames(raw.runtime?.agentEnvironment);
  const docker = runtime.backends.includes('docker') ? dockerSettings(raw.docker) : undefined;
  if (runtime.backends.includes('kubernetes') && !raw.kubernetes) throw new Error('The kubernetes workspace backend requires a kubernetes configuration block');
  if (raw.kubernetes) { raw.kubernetes.transport = transportSetting(raw.kubernetes.transport, 'kubernetes.transport'); if (raw.kubernetes.relayUrl !== undefined) raw.kubernetes.relayUrl = configuredUrl(String(raw.kubernetes.relayUrl), 'kubernetes.relayUrl'); if (raw.kubernetes.transport === 'pull' && !raw.kubernetes.relayUrl) throw new Error('kubernetes.transport pull requires kubernetes.relayUrl, the workbench URL reachable from agent pods'); }
  if (raw.kubernetes) {
    raw.kubernetes.provisioner = raw.kubernetes.provisioner ?? 'pod';
    if (raw.kubernetes.userNamespaces !== undefined && typeof raw.kubernetes.userNamespaces !== 'boolean') throw new Error('kubernetes.userNamespaces must be true or false');
    if (raw.kubernetes.userNamespaces && raw.kubernetes.provisioner === 'sandbox') throw new Error('kubernetes.userNamespaces cannot be combined with the sandbox provisioner; a Kata guest kernel already remaps the workload');
    if (!['pod', 'sandbox'].includes(raw.kubernetes.provisioner)) throw new Error('kubernetes.provisioner must be pod or sandbox');
    if (raw.kubernetes.provisioner === 'sandbox') {
      if (raw.kubernetes.transport !== 'pull') throw new Error('kubernetes.provisioner sandbox requires kubernetes.transport pull');
      const sandbox = raw.kubernetes.sandbox ?? {};
      for (const key of ['runtimeClassName', 'warmPool', 'poolTokenEnv']) if (sandbox[key] !== undefined && (typeof sandbox[key] !== 'string' || !/^[A-Za-z0-9_.-]{1,253}$/.test(sandbox[key]))) throw new Error(`kubernetes.sandbox.${key} must be a name`);
      raw.kubernetes.sandbox = { runtimeClassName: sandbox.runtimeClassName ?? 'kata', warmPool: sandbox.warmPool, poolTokenEnv: sandbox.poolTokenEnv ?? 'VLOER_POOL_TOKEN' };
    }
  }
  if (raw.kubernetes?.agentSecrets !== undefined && (!Array.isArray(raw.kubernetes.agentSecrets) || raw.kubernetes.agentSecrets.some((name: unknown) => typeof name !== 'string' || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(name)))) throw new Error('kubernetes.agentSecrets must list Kubernetes Secret names');
  if (raw.ploeg && (!Array.isArray(raw.ploeg.teams) || raw.ploeg.teams.length > 50 || raw.ploeg.teams.some((team: unknown) => typeof team !== 'string' || !team || team.length > 100))) throw new Error('ploeg.teams must contain at most 50 team names');
  if (raw.ploeg?.trackerUrl) configuredUrl(raw.ploeg.trackerUrl, 'ploeg.trackerUrl');
  let links: AppConfig['links'];
  if (raw.links !== undefined) {
    if (!raw.links || typeof raw.links !== 'object' || Array.isArray(raw.links)) throw new Error('links must be an object');
    if (raw.links.gitlab !== undefined) {
      const gitlab = raw.links.gitlab;
      if (!gitlab || typeof gitlab !== 'object' || Array.isArray(gitlab)) throw new Error('links.gitlab must be an object');
      const clientId = process.env.VLOER_GITLAB_CLIENT_ID || gitlab.clientId;
      if (clientId !== undefined && (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/.test(clientId))) throw new Error('links.gitlab.clientId must be an OAuth application ID');
      const scopes = gitlab.scopes ?? ['read_api', 'read_repository', 'write_repository'];
      if (!Array.isArray(scopes) || !scopes.length || scopes.length > 10 || scopes.some((scope: unknown) => typeof scope !== 'string' || !/^[a-z_]{1,40}$/.test(scope))) throw new Error('links.gitlab.scopes must list OAuth scope names');
      links = { gitlab: { baseUrl: configuredUrl(gitlab.baseUrl ?? 'https://gitlab.com', 'links.gitlab.baseUrl'), clientId, scopes } };
    }
  }
  let gatewayPolicy: AppConfig['gatewayPolicy'];
  if (raw.gatewayPolicy !== undefined) {
    if (!raw.gatewayPolicy || typeof raw.gatewayPolicy !== 'object' || Array.isArray(raw.gatewayPolicy)) throw new Error('gatewayPolicy must be an object');
    gatewayPolicy = {};
    for (const key of ['providers', 'regions'] as const) {
      const list = raw.gatewayPolicy[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || !list.length || list.length > 50 || list.some((item: unknown) => typeof item !== 'string' || !/^[a-z0-9_.-]{1,64}$/.test(item))) throw new Error(`gatewayPolicy.${key} must list lowercase names`);
      gatewayPolicy[key] = [...new Set(list as string[])];
    }
  }
  const config: AppConfig = {
    mode, host: process.env.VLOER_HOST || raw.host || '127.0.0.1', port: number(process.env.VLOER_PORT ?? raw.port, 4080, 0, 65535, 'port'),
    dataDir, publicDir: resolve(raw.publicDir || `${root}/public`), baseUrl: baseUrl ? configuredUrl(baseUrl, 'baseUrl') : undefined,
    repositories, crews, models, runtime, docker,
    taskSources: validateTaskSources(raw.taskSources, repositories, mode),
    auth: { secureCookies: baseUrl?.startsWith('https://') ?? false, sessionHours: 12, bootstrapName: process.env.VLOER_ADMIN_NAME || 'admin', ...raw.auth, bootstrapPassword: process.env.VLOER_ADMIN_PASSWORD },
    maxConcurrentSessions: number(raw.maxConcurrentSessions, 2, 1, 16, 'maxConcurrentSessions'), maxBudgetUsd: number(raw.maxBudgetUsd, 25, 0.01, 10000, 'maxBudgetUsd'),
    kubernetes: raw.kubernetes,
    ploeg: raw.ploeg ? { ...raw.ploeg, url: configuredUrl(raw.ploeg.url, 'ploeg.url') } : undefined,
    links,
    gatewayPolicy,
    litellm: litellmBase && adminKey ? { baseUrl: configuredUrl(litellmBase, 'litellm.baseUrl'), adminUrl: configuredUrl(process.env.LITELLM_ADMIN_URL || raw.litellm?.adminUrl || litellmBase.replace(/\/v1\/?$/, ''), 'litellm.adminUrl'), masterKey: adminKey, models: models.map((model: any) => model.modelId), ttl: raw.litellm?.ttl || '4h', settlementDelayMs: number(raw.litellm?.settlementDelayMs, 60000, 0, 3600000, 'litellm.settlementDelayMs') } : undefined
  };
  const oidc = (raw.auth ?? {}).oidc;
  if (oidc !== undefined) {
    if (!oidc || typeof oidc !== 'object' || Array.isArray(oidc)) throw new Error('auth.oidc must be an object');
    if (typeof oidc.clientId !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(oidc.clientId)) throw new Error('auth.oidc.clientId must be the application client id');
    const scopes = oidc.scopes ?? ['openid', 'email', 'profile'];
    if (!Array.isArray(scopes) || !scopes.length || scopes.length > 20 || scopes.some((scope: unknown) => typeof scope !== 'string' || !/^[a-z_:.-]{1,64}$/.test(scope)) || !scopes.includes('openid')) throw new Error('auth.oidc.scopes must list scope names including openid');
    const roles: Record<string, string[]> = { admin: ['vloer-admins'], operator: ['vloer-operators'], viewer: ['vloer-viewers'], ...(oidc.roles ?? {}) };
    for (const role of ['admin', 'operator', 'viewer']) if (!Array.isArray(roles[role]) || roles[role].length > 20 || roles[role].some((group: unknown) => typeof group !== 'string' || !/^[A-Za-z0-9_.:@ -]{1,100}$/.test(group))) throw new Error(`auth.oidc.roles.${role} must list group names`);
    for (const key of ['roleClaim', 'groupsClaim', 'displayName', 'clientSecretEnv']) if (oidc[key] !== undefined && (typeof oidc[key] !== 'string' || !oidc[key] || oidc[key].length > 100)) throw new Error(`auth.oidc.${key} must be a short string`);
    const clientSecret = oidc.clientSecretEnv ? process.env[oidc.clientSecretEnv] : undefined;
    if (oidc.clientSecretEnv && !clientSecret) throw new Error(`auth.oidc.clientSecretEnv names ${oidc.clientSecretEnv}, which is not set`);
    config.auth.oidc = { issuer: configuredUrl(oidc.issuer, 'auth.oidc.issuer'), clientId: oidc.clientId, ...(clientSecret ? { clientSecret } : {}), scopes, displayName: oidc.displayName ?? 'Authentik', roleClaim: oidc.roleClaim ?? 'vloer_role', groupsClaim: oidc.groupsClaim ?? 'groups', roles: roles as Record<'admin' | 'operator' | 'viewer', string[]> };
  } else delete (config.auth as { oidc?: unknown }).oidc;
  if (!existsSync(config.publicDir)) throw new Error('Browser application directory is missing');
  return config;
}
