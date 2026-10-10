import { readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig, Repository, Crew, Placement, WorkspaceBackend } from './types.ts';
import { validateTaskSources } from './tasks.ts';
import { validatePloeg } from './ploeg.ts';
import { validateCardRules } from './cards/settings.ts';
import { validateDeliveryConfig } from './delivery-config.ts';

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
const reservedEnvironment = /^(LITELLM_MASTER_KEY|LITELLM_ADMIN_URL|OPENCODE_SERVER_|UNFOLD_|PLOEG_|KUBERNETES_|DOCKER_HOST|BAO_TOKEN|VAULT_TOKEN|HOME|PATH)/;

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
  if (typeof value.image !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._\/:@-]{0,255}$/.test(value.image)) throw new Error('docker.image must name the agent image, for example unfold-agent:1.18.30');
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

/**
 * Validates the binder and pack settings: `backfillPeriods`, how many closed periods before a person's first visit
 * their packs reach back (0–12; 1 by default, 4 in the demo), and `teams`, a sprint per Team (`lengthDays` 7–42 and
 * an `anchor` date on which a sprint starts) in place of the ISO week.
 */
const gatewayName = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function validateRepositoryMcp(value: unknown, repositoryId: string): void {
  const invalid = () => new Error(`Repository ${repositoryId} mcp requires litellmTeamId and 1–16 unique accessGroups, and nothing else`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const { litellmTeamId, accessGroups, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length || typeof litellmTeamId !== 'string' || !gatewayName.test(litellmTeamId)) throw invalid();
  if (!Array.isArray(accessGroups) || !accessGroups.length || accessGroups.length > 16 || new Set(accessGroups).size !== accessGroups.length || accessGroups.some(group => typeof group !== 'string' || !gatewayName.test(group))) throw invalid();
}

export function validateCards(raw: unknown, mode: AppConfig['mode']): NonNullable<AppConfig['cards']> {
  const value = raw === undefined ? {} : raw;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cards must be an object');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['backfillPeriods', 'teams', 'publishPullRequestComment', 'rules'].includes(key))) throw new Error('cards accepts backfillPeriods, teams, publishPullRequestComment and rules');
  if (data.publishPullRequestComment !== undefined && typeof data.publishPullRequestComment !== 'boolean') throw new Error('cards.publishPullRequestComment must be true or false');
  const rules = validateCardRules(data.rules);
  const backfillPeriods = number(data.backfillPeriods, mode === 'demo' ? 4 : 1, 0, 12, 'cards.backfillPeriods');
  if (!Number.isInteger(backfillPeriods)) throw new Error('cards.backfillPeriods must be a whole number');
  const teams: Record<string, { lengthDays: number; anchor: string }> = {};
  if (data.teams !== undefined) {
    if (!data.teams || typeof data.teams !== 'object' || Array.isArray(data.teams) || Object.keys(data.teams).length > 50) throw new Error('cards.teams must map at most 50 Teams to a sprint');
    for (const [team, sprint] of Object.entries(data.teams as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,99}$/.test(team) || team.includes('~')) throw new Error('cards.teams keys must be Team names');
      const rule = (sprint && typeof sprint === 'object' && !Array.isArray(sprint) ? sprint : {}) as Record<string, unknown>;
      const lengthDays = number(rule.lengthDays, Number.NaN, 7, 42, `cards.teams.${team}.lengthDays`);
      if (!Number.isInteger(lengthDays)) throw new Error(`cards.teams.${team}.lengthDays must be a whole number of days`);
      const anchor = typeof rule.anchor === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rule.anchor) ? Date.parse(`${rule.anchor}T00:00:00Z`) : Number.NaN;
      if (!Number.isFinite(anchor) || new Date(anchor).toISOString().slice(0, 10) !== rule.anchor) throw new Error(`cards.teams.${team}.anchor must be a date such as 2026-09-28`);
      teams[team] = { lengthDays, anchor: rule.anchor as string };
    }
  }
  return { backfillPeriods, teams, ...(data.publishPullRequestComment === true ? { publishPullRequestComment: true } : {}), ...(data.rules !== undefined ? { rules } : {}) };
}

/**
 * Checks the `cardThemes` block: an optional read-only themes folder, the asset quota, and optional art generation
 * through an OpenAI-compatible endpoint with its own key. The key is named by a `UNFOLD_` environment variable, which
 * `runtime.agentEnvironment` can never pass to an agent workspace, must be set, and must not be the gateway master
 * key. The demo ignores art generation, because it never calls a model.
 */
export function cardThemeSettings(raw: unknown, mode: AppConfig['mode']): AppConfig['cardThemes'] {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('cardThemes must be an object');
  const value = raw as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!['directory', 'assetQuotaMb', 'ai'].includes(key)) throw new Error(`cardThemes.${key} is not a setting; custom code skins are not supported`);
  if (value.directory !== undefined && (typeof value.directory !== 'string' || !value.directory.trim() || value.directory.length > 1024)) throw new Error('cardThemes.directory must be a folder path');
  const directory = typeof value.directory === 'string' ? resolve(value.directory) : undefined;
  if (directory && !existsSync(directory)) throw new Error(`cardThemes.directory ${directory} does not exist`);
  const settings: NonNullable<AppConfig['cardThemes']> = { ...(directory ? { directory } : {}), assetQuotaMb: number(value.assetQuotaMb, 256, 1, 4096, 'cardThemes.assetQuotaMb') };
  if (value.ai === undefined || mode === 'demo') return settings;
  const ai = value.ai as Record<string, unknown>;
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) throw new Error('cardThemes.ai must be an object');
  for (const key of Object.keys(ai)) if (!['baseUrl', 'model', 'keyEnv', 'maxTokens', 'timeoutMs', 'requestsPerHour'].includes(key)) throw new Error(`cardThemes.ai.${key} is not a setting; put the key in the environment variable keyEnv names`);
  if (typeof ai.baseUrl !== 'string') throw new Error('cardThemes.ai.baseUrl must be the OpenAI-compatible base URL, for example https://litellm.example/v1');
  if (typeof ai.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,127}$/.test(ai.model)) throw new Error('cardThemes.ai.model must name a model the endpoint serves');
  if (typeof ai.keyEnv !== 'string' || !/^UNFOLD_[A-Z0-9_]{1,100}$/.test(ai.keyEnv)) throw new Error('cardThemes.ai.keyEnv must name a UNFOLD_ environment variable that holds Unfold’s own virtual key');
  const key = process.env[ai.keyEnv];
  if (!key || key.length > 4096 || /[^\x21-\x7e]/.test(key)) throw new Error(`cardThemes.ai.keyEnv names ${ai.keyEnv}, which is not set to a valid key`);
  if (process.env.LITELLM_MASTER_KEY && key === process.env.LITELLM_MASTER_KEY) throw new Error('cardThemes.ai must use its own low-budget virtual key, never the LiteLLM master key');
  settings.ai = { baseUrl: configuredUrl(ai.baseUrl, 'cardThemes.ai.baseUrl'), model: ai.model, keyEnv: ai.keyEnv, maxTokens: number(ai.maxTokens, 4096, 256, 16000, 'cardThemes.ai.maxTokens'), timeoutMs: number(ai.timeoutMs, 90_000, 5_000, 300_000, 'cardThemes.ai.timeoutMs'), requestsPerHour: number(ai.requestsPerHour, 30, 1, 500, 'cardThemes.ai.requestsPerHour') };
  return settings;
}

export function placements(config: AppConfig): Placement[] {
  if (config.mode === 'demo') return [];
  const names: Record<WorkspaceBackend, Placement['name']> = { docker: 'Container on the workbench host', kubernetes: 'Pod in the workspace namespace', local: 'Working directory on the workbench host (trusted only)' };
  const isolation: Record<WorkspaceBackend, Placement['isolation']> = { docker: 'container', kubernetes: 'pod', local: 'working-directory' };
  return (config.runtime.backends ?? []).map(id => ({ id, name: names[id], isolation: isolation[id], default: id === config.runtime.backend }));
}

/**
 * Reads the optional product-event export sink. `UNFOLD_INSIGHT_EXPORT` is `off`, `faro` or `otlp`;
 * `UNFOLD_INSIGHT_EXPORT_URL` names the collector and is required unless the sink is off; and
 * `UNFOLD_INSIGHT_EXPORT_LEVEL` is `aggregate` (the daily rollup) or `events` (each event with its actor hash).
 */
export function insightSettings(): AppConfig['insight'] {
  const mode = process.env.UNFOLD_INSIGHT_EXPORT || 'off';
  if (!['off', 'faro', 'otlp'].includes(mode)) throw new Error('UNFOLD_INSIGHT_EXPORT must be off, faro or otlp');
  const url = process.env.UNFOLD_INSIGHT_EXPORT_URL;
  if (mode === 'off') return url === undefined ? undefined : { export: 'off', level: insightLevel(process.env.UNFOLD_INSIGHT_EXPORT_LEVEL) };
  if (!url) throw new Error('UNFOLD_INSIGHT_EXPORT_URL is required when UNFOLD_INSIGHT_EXPORT is faro or otlp');
  return { export: mode as 'faro' | 'otlp', url: configuredUrl(url, 'UNFOLD_INSIGHT_EXPORT_URL'), level: insightLevel(process.env.UNFOLD_INSIGHT_EXPORT_LEVEL) };
}

function insightLevel(value: string | undefined): 'aggregate' | 'events' {
  if (value === undefined || value === '') return 'aggregate';
  if (!['aggregate', 'events'].includes(value)) throw new Error('UNFOLD_INSIGHT_EXPORT_LEVEL must be aggregate or events');
  return value as 'aggregate' | 'events';
}

/** Reads `UNFOLD_INSIGHT_EVENTS`: product events are recorded unless it is `off`, as ADR-0023's tenant default says. */
export function productEventsSetting(): boolean {
  const value = process.env.UNFOLD_INSIGHT_EVENTS || 'on';
  if (!['on', 'off'].includes(value)) throw new Error('UNFOLD_INSIGHT_EVENTS must be on or off');
  return value === 'on';
}

export function loadConfig(argv = process.argv.slice(2)): AppConfig {
  const fileIndex = argv.indexOf('--config');
  const configFile = fileIndex >= 0 ? argv[fileIndex + 1] : process.env.UNFOLD_CONFIG;
  if (fileIndex >= 0 && !configFile) throw new Error('--config requires a file path');
  const raw = configFile ? JSON.parse(readFileSync(resolve(configFile), 'utf8')) : {};
  const mode = argv.includes('--demo') ? 'demo' : process.env.UNFOLD_MODE || raw.mode || 'live';
  if (!['live', 'demo'].includes(mode)) throw new Error('mode must be live or demo');
  const dataDir = resolve(process.env.UNFOLD_DATA_DIR || raw.dataDir || '.unfold');
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
    if (repo.mcp !== undefined) validateRepositoryMcp(repo.mcp, repo.id);
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
      if (role.maxToolCalls !== undefined) number(role.maxToolCalls, 80, 1, 2000, `crews.${crew.id}.roles.${role.id}.maxToolCalls`);
      roleIds.add(role.id);
    }
  }
  const baseUrl = process.env.UNFOLD_BASE_URL || raw.baseUrl;
  const litellmBase = process.env.LITELLM_BASE_URL || raw.litellm?.baseUrl;
  const adminKey = process.env.LITELLM_MASTER_KEY || '';
  if (raw.litellm?.masterKey) throw new Error('Set LITELLM_MASTER_KEY in the environment, not in a configuration file');
  if (mode === 'live' && !litellmBase && repositories.some(repo => repo.mcp)) throw new Error('Repository mcp requires the LiteLLM gateway base URL');
  const models = raw.models || [{ id: 'coding', name: 'Coding', providerId: 'litellm', modelId: 'coding' }];
  const runtime = { kind: mode === 'demo' ? 'demo' : 'opencode', backend: 'local', binary: 'opencode', timeoutMs: 20 * 60 * 1000, ...raw.runtime };
  if (mode === 'demo') runtime.kind = 'demo';
  if (process.env.OPENCODE_URL) { runtime.endpoint = configuredUrl(process.env.OPENCODE_URL, 'OPENCODE_URL'); runtime.backend = 'external'; }
  if (process.env.OPENCODE_SERVER_PASSWORD) runtime.password = process.env.OPENCODE_SERVER_PASSWORD;
  if (process.env.OPENCODE_SERVER_USERNAME) runtime.username = process.env.OPENCODE_SERVER_USERNAME;
  if (!['demo','opencode','command'].includes(runtime.kind) || !['local','external','docker','kubernetes'].includes(runtime.backend)) throw new Error('Unsupported runtime or workspace backend');
  if (mode === 'live' && runtime.kind === 'demo') throw new Error('The demonstration runtime requires demo mode');
  if (mode === 'live' && runtime.backend === 'external') throw new Error(`${process.env.OPENCODE_URL ? 'OPENCODE_URL selects' : 'runtime.backend external is'} an external OpenCode endpoint, which cannot run a live session: every live session receives a scoped model credential, and an external endpoint cannot receive one safely. Unset OPENCODE_URL and use the local, docker or kubernetes workspace backend.`);
  if (runtime.endpoint) configuredUrl(runtime.endpoint, 'runtime.endpoint');
  runtime.backends = workspaceBackends(runtime, raw.runtime?.backend);
  runtime.agentEnvironment = agentEnvironmentNames(raw.runtime?.agentEnvironment);
  const docker = runtime.backends.includes('docker') ? dockerSettings(raw.docker) : undefined;
  if (runtime.backends.includes('kubernetes') && !raw.kubernetes) throw new Error('The kubernetes workspace backend requires a kubernetes configuration block');
  if (raw.kubernetes) { raw.kubernetes.transport = transportSetting(raw.kubernetes.transport, 'kubernetes.transport'); if (raw.kubernetes.relayUrl !== undefined) raw.kubernetes.relayUrl = configuredUrl(String(raw.kubernetes.relayUrl), 'kubernetes.relayUrl'); if (raw.kubernetes.transport === 'pull' && !raw.kubernetes.relayUrl) throw new Error('kubernetes.transport pull requires kubernetes.relayUrl, the workbench URL reachable from agent pods'); }
  if (raw.kubernetes) {
    raw.kubernetes.provisioner = raw.kubernetes.provisioner ?? 'pod';
    for (const key of ['cpu', 'memory', 'cpuRequest', 'memoryRequest']) if (raw.kubernetes[key] !== undefined && (typeof raw.kubernetes[key] !== 'string' || !/^[0-9]+(\.[0-9]+)?(m|[KMGT]i?)?$/.test(raw.kubernetes[key]))) throw new Error(`kubernetes.${key} must be a Kubernetes quantity such as 500m or 1Gi`);
    if (raw.kubernetes.userNamespaces !== undefined && typeof raw.kubernetes.userNamespaces !== 'boolean') throw new Error('kubernetes.userNamespaces must be true or false');
    if (raw.kubernetes.userNamespaces && raw.kubernetes.provisioner === 'sandbox') throw new Error('kubernetes.userNamespaces cannot be combined with the sandbox provisioner; a Kata guest kernel already remaps the workload');
    if (!['pod', 'sandbox'].includes(raw.kubernetes.provisioner)) throw new Error('kubernetes.provisioner must be pod or sandbox');
    if (raw.kubernetes.provisioner === 'sandbox') {
      if (raw.kubernetes.transport !== 'pull') throw new Error('kubernetes.provisioner sandbox requires kubernetes.transport pull');
      const sandbox = raw.kubernetes.sandbox ?? {};
      for (const key of ['runtimeClassName', 'warmPool', 'poolTokenEnv']) if (sandbox[key] !== undefined && (typeof sandbox[key] !== 'string' || !/^[A-Za-z0-9_.-]{1,253}$/.test(sandbox[key]))) throw new Error(`kubernetes.sandbox.${key} must be a name`);
      raw.kubernetes.sandbox = { runtimeClassName: sandbox.runtimeClassName ?? 'kata', warmPool: sandbox.warmPool, poolTokenEnv: sandbox.poolTokenEnv ?? 'UNFOLD_POOL_TOKEN' };
    }
  }
  if (raw.kubernetes?.agentSecrets !== undefined && (!Array.isArray(raw.kubernetes.agentSecrets) || raw.kubernetes.agentSecrets.some((name: unknown) => typeof name !== 'string' || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(name)))) throw new Error('kubernetes.agentSecrets must list Kubernetes Secret names');
  let links: AppConfig['links'];
  if (raw.links !== undefined) {
    if (!raw.links || typeof raw.links !== 'object' || Array.isArray(raw.links)) throw new Error('links must be an object');
    if (raw.links.gitlab !== undefined) {
      const gitlab = raw.links.gitlab;
      if (!gitlab || typeof gitlab !== 'object' || Array.isArray(gitlab)) throw new Error('links.gitlab must be an object');
      const clientId = process.env.UNFOLD_GITLAB_CLIENT_ID || gitlab.clientId;
      if (clientId !== undefined && (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/.test(clientId))) throw new Error('links.gitlab.clientId must be an OAuth application ID');
      const scopes = gitlab.scopes ?? ['read_api', 'read_repository', 'write_repository'];
      if (!Array.isArray(scopes) || !scopes.length || scopes.length > 10 || scopes.some((scope: unknown) => typeof scope !== 'string' || !/^[a-z_]{1,40}$/.test(scope))) throw new Error('links.gitlab.scopes must list OAuth scope names');
      links = { gitlab: { baseUrl: configuredUrl(gitlab.baseUrl ?? 'https://gitlab.com', 'links.gitlab.baseUrl'), clientId, scopes } };
    }
    if (raw.links.clickup !== undefined) {
      const clickup = raw.links.clickup;
      if (!clickup || typeof clickup !== 'object' || Array.isArray(clickup)) throw new Error('links.clickup must be an object');
      const clientId = process.env.UNFOLD_CLICKUP_CLIENT_ID || clickup.clientId;
      if (clientId !== undefined && (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{4,200}$/.test(clientId))) throw new Error('links.clickup.clientId must be an OAuth application ID');
      if (clickup.clientSecretEnv !== undefined && (typeof clickup.clientSecretEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(clickup.clientSecretEnv))) throw new Error('links.clickup.clientSecretEnv must name an environment variable');
      const clientSecret = clickup.clientSecretEnv ? process.env[clickup.clientSecretEnv] : undefined;
      if (clickup.clientSecretEnv && (!clientSecret || clientSecret.length > 4096 || /[^\x21-\x7e]/.test(clientSecret))) throw new Error(`links.clickup.clientSecretEnv names ${clickup.clientSecretEnv}, which is not set to a valid secret`);
      links = { ...(links ?? {}), clickup: { clientId, ...(clientSecret ? { clientSecret } : {}), apiUrl: configuredUrl(clickup.apiUrl ?? 'https://api.clickup.com', 'links.clickup.apiUrl'), appUrl: configuredUrl(clickup.appUrl ?? 'https://app.clickup.com', 'links.clickup.appUrl') } };
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
  const cards = validateCards(raw.cards, mode);
  let observability: AppConfig['observability'];
  if (raw.observability !== undefined) {
    const o = raw.observability;
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('observability must be an object');
    observability = {};
    if (o.grafanaUrl !== undefined) observability.grafanaUrl = configuredUrl(o.grafanaUrl, 'observability.grafanaUrl');
    if (o.logsUrl !== undefined) observability.logsUrl = configuredUrl(o.logsUrl, 'observability.logsUrl');
    if (o.dashboards !== undefined) {
      if (!o.dashboards || typeof o.dashboards !== 'object' || Array.isArray(o.dashboards) || Object.entries(o.dashboards).some(([key, value]) => !/^[a-z0-9-]{1,40}$/.test(key) || typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value))) throw new Error('observability.dashboards maps short names to Grafana dashboard uids');
      observability.dashboards = o.dashboards;
    }
    for (const key of ['tracesDatasource', 'logsDatasource'] as const) if (o[key] !== undefined) { if (typeof o[key] !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(o[key])) throw new Error(`observability.${key} must be a datasource uid`); observability[key] = o[key]; }
    for (const key of ['traceQuery', 'logsQuery'] as const) if (o[key] !== undefined) { if (typeof o[key] !== 'string' || o[key].length > 500) throw new Error(`observability.${key} must be a query template`); observability[key] = o[key]; }
  }
  const config: AppConfig = {
    mode, host: process.env.UNFOLD_HOST || raw.host || '127.0.0.1', port: number(process.env.UNFOLD_PORT ?? raw.port, 4080, 0, 65535, 'port'),
    dataDir, publicDir: resolve(raw.publicDir || `${root}/public`), baseUrl: baseUrl ? configuredUrl(baseUrl, 'baseUrl') : undefined,
    repositories, crews, models, runtime, docker,
    taskSources: validateTaskSources(raw.taskSources, repositories, mode),
    auth: { secureCookies: baseUrl?.startsWith('https://') ?? false, sessionHours: 12, bootstrapName: process.env.UNFOLD_ADMIN_NAME || 'admin', ...raw.auth, bootstrapPassword: process.env.UNFOLD_ADMIN_PASSWORD },
    maxConcurrentSessions: number(raw.maxConcurrentSessions, 2, 1, 16, 'maxConcurrentSessions'), maxBudgetUsd: number(raw.maxBudgetUsd, 25, 0.01, 10000, 'maxBudgetUsd'),
    kubernetes: raw.kubernetes,
    ploeg: validatePloeg(raw.ploeg, mode),
    execution: raw.execution,
    links,
    gatewayPolicy,
    observability,
    insight: insightSettings(),
    productEvents: productEventsSetting(),
    cards,
    cardThemes: cardThemeSettings(raw.cardThemes, mode),
    litellm: litellmBase && (adminKey || raw.execution) ? { baseUrl: configuredUrl(litellmBase, 'litellm.baseUrl'), adminUrl: configuredUrl(process.env.LITELLM_ADMIN_URL || raw.litellm?.adminUrl || litellmBase.replace(/\/v1\/?$/, ''), 'litellm.adminUrl'), masterKey: adminKey, models: models.map((model: any) => model.modelId), ttl: raw.litellm?.ttl || '4h', settlementDelayMs: number(raw.litellm?.settlementDelayMs, 60000, 0, 3600000, 'litellm.settlementDelayMs') } : undefined
  };
  if (config.execution !== undefined) {
    const value = config.execution;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['team', 'heartbeatMs'].includes(key)) || typeof value.team !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(value.team)) throw new Error('execution requires a configured Ploeg team');
    if (!config.ploeg || config.ploeg.demo || !config.ploeg.tokenEnv) throw new Error('execution requires a real Ploeg API connection with a server credential');
    if (config.ploeg.teams && !config.ploeg.teams.includes(value.team)) throw new Error('execution.team must be within the Ploeg consumer scope');
    value.heartbeatMs = number(value.heartbeatMs, 15000, 1000, 20000, 'execution.heartbeatMs');
    if (config.runtime.agentEnvironment?.includes(config.ploeg.tokenEnv)) throw new Error('The Ploeg consumer credential must never enter an agent workspace');
    if (config.litellm) config.litellm.masterKey = '';
    if (mode === 'live' && !config.litellm?.baseUrl) throw new Error('Ploeg execution requires an inference gateway base URL');
    if (mode === 'live' && config.gatewayPolicy) throw new Error('Ploeg execution requires provider and region restrictions to be enforced in the control-plane gateway policy');
  }
  const oidc = (raw.auth ?? {}).oidc;
  if (oidc !== undefined) {
    if (!oidc || typeof oidc !== 'object' || Array.isArray(oidc)) throw new Error('auth.oidc must be an object');
    if (typeof oidc.clientId !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(oidc.clientId)) throw new Error('auth.oidc.clientId must be the application client id');
    const scopes = oidc.scopes ?? ['openid', 'email', 'profile'];
    if (!Array.isArray(scopes) || !scopes.length || scopes.length > 20 || scopes.some((scope: unknown) => typeof scope !== 'string' || !/^[a-z_:.-]{1,64}$/.test(scope)) || !scopes.includes('openid')) throw new Error('auth.oidc.scopes must list scope names including openid');
    const roles: Record<string, string[]> = { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'], ...(oidc.roles ?? {}) };
    for (const role of ['admin', 'operator', 'viewer']) if (!Array.isArray(roles[role]) || roles[role].length > 20 || roles[role].some((group: unknown) => typeof group !== 'string' || !/^[A-Za-z0-9_.:@ -]{1,100}$/.test(group))) throw new Error(`auth.oidc.roles.${role} must list group names`);
    for (const key of ['roleClaim', 'groupsClaim', 'displayName', 'clientSecretEnv']) if (oidc[key] !== undefined && (typeof oidc[key] !== 'string' || !oidc[key] || oidc[key].length > 100)) throw new Error(`auth.oidc.${key} must be a short string`);
    if (oidc.subjectNamespace !== undefined && (typeof oidc.subjectNamespace !== 'string' || !oidc.subjectNamespace.trim() || oidc.subjectNamespace.length > 300)) throw new Error('auth.oidc.subjectNamespace must be a non-empty string of at most 300 characters');
    const clientSecret = oidc.clientSecretEnv ? process.env[oidc.clientSecretEnv] : undefined;
    if (oidc.clientSecretEnv && !clientSecret) throw new Error(`auth.oidc.clientSecretEnv names ${oidc.clientSecretEnv}, which is not set`);
    config.auth.oidc = { issuer: configuredUrl(oidc.issuer, 'auth.oidc.issuer'), ...(oidc.subjectNamespace !== undefined ? { subjectNamespace: oidc.subjectNamespace.replace(/\/$/, '') } : {}), clientId: oidc.clientId, ...(clientSecret ? { clientSecret } : {}), scopes, displayName: oidc.displayName ?? 'Authentik', roleClaim: oidc.roleClaim ?? 'unfold_role', groupsClaim: oidc.groupsClaim ?? 'groups', roles: roles as Record<'admin' | 'operator' | 'viewer', string[]> };
  } else delete (config.auth as { oidc?: unknown }).oidc;
  config.runtime.maxToolCalls = number(raw.runtime?.maxToolCalls, 80, 1, 2000, 'runtime.maxToolCalls');
  if (raw.runtime?.briefCheck !== undefined && typeof raw.runtime.briefCheck !== 'boolean') throw new Error('runtime.briefCheck must be true or false');
  config.runtime.briefCheck = raw.runtime?.briefCheck ?? true;
  if (!existsSync(config.publicDir)) throw new Error('Browser application directory is missing');
  if (config.taskSources?.some(source => source.ploeg) && !config.execution) throw new Error('Ploeg tracker targets require shared execution configuration');
  config.delivery = validateDeliveryConfig(raw.delivery, config);
  return config;
}
