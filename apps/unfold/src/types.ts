import type { CardRuleSettings } from './cards/settings.ts';
import type { ExecutionFailure } from './failures.ts';
import type { Candidate } from './candidates.ts';
import type { TaskSourceConfig, TaskSnapshot } from './tasks.ts';
import type { DeliveryConfig } from './delivery-config.ts';
import type { FlagSettings } from './flags.ts';
import type { McpHttpSettings } from './mcp-auth.ts';

export type SessionStatus = 'queued' | 'running' | 'waiting_input' | 'exporting' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type RunStatus = 'queued' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type UserRole = 'admin' | 'operator' | 'viewer';
export type User = { id: string; name: string; role: UserRole };
export type RepositoryAccess = { username: string; password: string };
/** A git URL prefix fetched from another address: `insteadOf` is what repository URLs say, `url` is where git goes. */
export type GitRewrite = { url: string; insteadOf: string };
/** Read-only gateway MCP tools for sessions on one repository: keys are minted into this LiteLLM team with exactly these MCP access groups. */
export type RepositoryMcp = { litellmTeamId: string; accessGroups: string[] };
export type Repository = { id: string; name: string; description: string; url: string; baseBranch: string; verify: string[]; trackerUrl?: string; executionOwner?: 'interactive' | 'ploeg'; access?: RepositoryAccess; mcp?: RepositoryMcp };
export type TeamRole = { id: string; name: string; mode: 'write' | 'read'; instruction: string; model?: string; maxToolCalls?: number };
export type Team = { id: string; name: string; description: string; roles: TeamRole[] };
export type RuntimeKind = 'demo' | 'opencode' | 'command';
export type WorkspaceBackend = 'local' | 'docker' | 'kubernetes';
export type WorkspaceTransport = 'publish' | 'pull';
export type Placement = { id: WorkspaceBackend; name: string; isolation: 'working-directory' | 'container' | 'pod'; default: boolean };
export type Artifact = { id: string; name: string; kind: 'diff' | 'test' | 'summary' | 'link' | 'transcript'; content: string; url?: string };
export type GatewayRequest = { id: string; at: string; durationMs?: number; firstTokenMs?: number; provider?: string; host?: string; geo?: string; model: string; group?: string; tier?: string; cause?: string; savingsUsd?: number; retries: number; fallbacks: number; guardrails: string[]; cacheHit: boolean; cachedTokens: number; inputTokens: number; outputTokens: number; usd: number; status: 'success' | 'failure'; error?: string; callId?: string; harness?: string; roleId?: string; violation?: string };
export type SessionReview = { decision: 'accepted' | 'rejected'; by: string; byName: string; at: string; note?: string };
export type ModelUsage = { model: string; group?: string; requests: number; failures: number; usd: number; inputTokens: number; outputTokens: number };
export type Run = { id: string; sessionId: string; roleId: string; roleName: string; mode: 'write' | 'read'; status: RunStatus; startedAt?: string; finishedAt?: string; summary?: string; verdict?: 'approve' | 'request_changes' | 'inconclusive'; verdictSource?: 'result' | 'transcript'; nativeId?: string; costUsd: number; promptSha?: string };
export type SessionOutcome = { work: 'change' | 'investigation'; candidate: 'captured' | 'unavailable'; verification: 'not_performed'; review: 'approved' | 'changes_requested' | 'inconclusive' | 'not_required' };
export type ExecutionBinding = { id: string; workItemId: string; team: string; state: string; revision: number; generation: number; supervision: 'human' | 'background'; expiresAt: string; stopConfirmed: boolean };
export type Session = { execution?: ExecutionBinding; id: string; title: string; objective: string; repositoryId: string; teamId: string; /** @deprecated The same Team as `teamId`, kept in stored and served sessions for one release (system ADR-0036). */ crewId?: string; runtime: RuntimeKind; placement?: WorkspaceBackend; approval?: 'manual' | 'auto'; model?: string; ownerId: string; ownerName: string; status: SessionStatus; budgetUsd: number; spentUsd: number; observedUsd?: number; usage?: ModelUsage[]; requests?: GatewayRequest[]; review?: SessionReview; costStatus: 'demo' | 'observed' | 'settled' | 'unknown'; createdAt: string; updatedAt: string; branch: string; trackerUrl?: string; sourceTask?: TaskSnapshot; candidate?: Candidate; outcome?: SessionOutcome; workspace?: Workspace; runs: Run[]; artifacts: Artifact[]; blocker?: string; failure?: ExecutionFailure; workItemClosedAt?: string; previousSessionId?: string };
export type Event = { id: number; sessionId: string; type: string; at: string; actor: string; runId?: string; data: Record<string, unknown> };
export type WorkspaceWaitPhase = 'scheduling' | 'capacity' | 'creating' | 'image_unavailable' | 'container_error' | 'cloning' | 'starting' | 'connecting';
export type WorkspaceWait = { sessionId: string; phase: WorkspaceWaitPhase; since: string; reason?: string };
export type Workspace = { id: string; backend: 'demo' | 'local' | 'external' | 'docker' | 'kubernetes'; directory: string; endpoint?: string; nativeSessionId?: string; metadata?: Record<string, string> };
export type PermissionRequest = { id: string; sessionId: string; runId: string; nativeId: string; kind: 'permission' | 'question'; title: string; detail: string; options?: string[]; questions?: unknown[]; resolved?: boolean };
export type ModelConfig = { id: string; name: string; providerId: string; modelId: string };
export type AppConfig = {
  delivery?: DeliveryConfig;
  mode: 'demo' | 'live'; host: string; port: number; dataDir: string; publicDir: string; baseUrl?: string;
  repositories: Repository[]; teams: Team[]; models: ModelConfig[];
  taskSources?: TaskSourceConfig[];
  execution?: { team: string; heartbeatMs?: number };
  runtime: { kind: RuntimeKind; backend: WorkspaceBackend | 'external'; backends?: WorkspaceBackend[]; endpoint?: string; username?: string; password?: string; binary?: string; image?: string; command?: string[]; timeoutMs: number; agentEnvironment?: string[]; maxToolCalls?: number; briefCheck?: boolean; reconnectGraceMs?: number };
  docker?: { image: string; socketPath?: string; network?: string; cpus?: number; memoryMb?: number; pidsLimit?: number; gatewayUrl?: string; provisionTimeoutMs?: number; user?: string; transport?: WorkspaceTransport; relayUrl?: string };
  litellm?: { baseUrl: string; adminUrl: string; masterKey: string; models: string[]; ttl: string; settlementDelayMs?: number };
  kubernetes?: { namespace: string; image: string; storageClass?: string; storageSize: string; cpu: string; memory: string; cpuRequest?: string; memoryRequest?: string; apiUrl?: string; tokenFile?: string; caFile?: string; pullPolicy?: string; ingressFrom?: Record<string, unknown>[]; egress?: Record<string, unknown>[]; gitSecretName?: string; gitRewrites?: GitRewrite[]; agentSecrets?: string[]; imagePullSecrets?: string[]; provisionTimeoutMs?: number; transport?: WorkspaceTransport; relayUrl?: string; provisioner?: 'pod' | 'sandbox'; userNamespaces?: boolean; runtimeClassName?: string; sandbox?: { runtimeClassName?: string; warmPool?: string; poolTokenEnv?: string }; workspaceRetentionDays?: number };
  auth: { secureCookies: boolean; sessionHours: number; bootstrapPassword?: string; bootstrapName: string; oidc?: { issuer: string; subjectNamespace?: string; clientId: string; clientSecret?: string; scopes: string[]; displayName: string; roleClaim: string; groupsClaim: string; roles: Record<UserRole, string[]> } };
  /** `unfold-mcp` served over Streamable HTTP on its own path, from `UNFOLD_MCP_*`; off when absent. */
  mcp?: McpHttpSettings;
  maxConcurrentSessions: number; maxBudgetUsd: number;
  ploeg?: { url: string; tokenEnv?: string; teams?: string[]; userTeams?: Record<string, string[]>; forgeLogins?: Record<string, string>; trackerUrl?: string; demo?: boolean };
  links?: { gitlab?: { baseUrl: string; clientId?: string; scopes: string[] }; clickup?: { clientId?: string; clientSecret?: string; apiUrl: string; appUrl: string } };
  gatewayPolicy?: { providers?: string[]; regions?: string[] };
  cards?: { backfillPeriods: number; teams: Record<string, { lengthDays: number; anchor: string }>; publishPullRequestComment?: boolean; rules?: CardRuleSettings };
  /** The Run health judge's gateway models, in order of preference (RFC-0007). */
  runHealth?: { judgeModels: string[] };
  /** What each Team pinned of the Work Kind expectations Run health judges against (RFC-0009), by Team and Work Kind. */
  judgement?: { teams: Record<string, { expectations: Record<string, { readMinutes?: number; firstChangeMinutes?: number; cycles?: number; verifyBeforeShip?: boolean }> }> };
  /** The decider the tripwire asks (RFC-0008): an OpenAI-compatible gateway, Unfold's own key named by `keyEnv`, and a cap on requests per minute. Absent, the tripwire is off. */
  decider?: { baseUrl: string; keyEnv: string; model: string; name: string; requestsPerMinute: number };
  cardThemes?: { directory?: string; assetQuotaMb: number; ai?: { baseUrl: string; model: string; keyEnv: string; maxTokens: number; timeoutMs: number; requestsPerHour: number } };
  observability?: { grafanaUrl?: string; dashboards?: Record<string, string>; tracesDatasource?: string; logsDatasource?: string; logsUrl?: string; metricsUrl?: string; traceQuery?: string; logsQuery?: string };
  insight?: InsightConfig;
  errorReports?: ErrorReportConfig;
  mcpServers?: McpServersConfig;
  productEvents?: boolean;
  /** The deployment's feature flag rules (ADR 0043): an inline flagd document and an optional watched flagd file. */
  flags?: FlagSettings;
  reports?: ReportTarget | null;
};

/** Where Report a problem files: a Forgejo or Vikunja connection (a named task source, or one of its own), the repository or project, and an optional line the success screen shows. */
export type ReportTarget = { source: TaskSourceConfig; project: string; acknowledgement?: string };
/** Where errors and notable failures are reported: a Sentry-protocol DSN, an OTLP/HTTP logs URL, or both, and the environment name reports carry. */
export type ErrorReportConfig = { sentryDsn?: string; otlpUrl?: string; environment: string };
/** Remote MCP servers people connect their own editor to: each an exact URL and the public OAuth client their sign-in uses. Never a token. */
export type McpServersConfig = { ploeg?: { url: string; clientId: string } };
export type InsightConfig = { export: 'off' | 'faro' | 'otlp'; url?: string; level: 'aggregate' | 'events' };
/** One product event the browser or VS Code extension posted, after the catalogue checked it. */
export type InsightEvent = { name: string; at: string; session: string; screen: string; workItemId?: number; shiftId?: number; props: Record<string, string | number | boolean> };
export type RuntimeEvent = { type: string; data: Record<string, unknown> };
export type Emit = (event: RuntimeEvent) => void;
export type Credential = { key: string; alias: string; budgetUsd: number; reference: string };
/** One Run's turn. `continuing` marks a turn whose prompt the workspace accepted before the workbench restarted: the runtime observes it to the end and never prompts again. */
export type ExecutionContext = { session: Session; run: Run; repository: Repository; role: TeamRole; workspace: Workspace; model?: ModelConfig; prompt: string; signal: AbortSignal; emit: Emit; continuing?: boolean };
export type ExecutionResult = { summary: string; verdict?: 'approve' | 'request_changes' | 'inconclusive'; artifacts: Artifact[]; costUsd?: number; nativeId?: string };
export interface AgentRuntime {
  kind: RuntimeKind;
  prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal): Promise<Workspace>;
  provisioning?(): WorkspaceWait[];
  execute(context: ExecutionContext): Promise<ExecutionResult>;
  captureCandidate?(session: Session, repository: Repository): Promise<Candidate>;
  respond?(workspace: Workspace, request: PermissionRequest, answer: { decision?: 'once' | 'always' | 'reject'; answers?: string[][] }): Promise<void>;
  interrupt(workspace: Workspace): Promise<void>;
  dispose(workspace: Workspace): Promise<void>;
  /** Deletes a disposed workspace's retained volume; true when this runtime keeps one and asked for it to go. */
  releaseVolume?(workspace: Workspace): Promise<boolean>;
  /** Whether this workspace keeps working while the workbench restarts and can be reattached afterwards. */
  reattachable?(workspace: Workspace): boolean;
  /** Reattaches a workspace that kept working through a workbench restart; false when it is gone or its worker did not reconnect within `withinMs`. */
  reattach?(workspace: Workspace, signal: AbortSignal, withinMs: number): Promise<boolean>;
  /** Revokes the workspace worker's relay credential and keeps the workspace's storage. */
  revokeWorker?(workspace: Workspace): Promise<void>;
}
