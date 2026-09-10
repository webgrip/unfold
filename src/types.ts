import type { ExecutionFailure } from './failures.ts';
import type { Candidate } from './candidates.ts';
import type { TaskSourceConfig, TaskSnapshot } from './tasks.ts';

export type SessionStatus = 'queued' | 'running' | 'waiting_input' | 'exporting' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type RunStatus = 'queued' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type UserRole = 'admin' | 'operator' | 'viewer';
export type User = { id: string; name: string; role: UserRole };
export type Repository = { id: string; name: string; description: string; url: string; baseBranch: string; verify: string[]; trackerUrl?: string; executionOwner?: 'interactive' | 'ploeg' };
export type CrewRole = { id: string; name: string; mode: 'write' | 'read'; instruction: string; model?: string };
export type Crew = { id: string; name: string; description: string; roles: CrewRole[] };
export type RuntimeKind = 'demo' | 'opencode' | 'command';
export type WorkspaceBackend = 'local' | 'docker' | 'kubernetes';
export type WorkspaceTransport = 'publish' | 'pull';
export type Placement = { id: WorkspaceBackend; name: string; isolation: 'working-directory' | 'container' | 'pod'; default: boolean };
export type Artifact = { id: string; name: string; kind: 'diff' | 'test' | 'summary' | 'link'; content: string; url?: string };
export type Run = { id: string; sessionId: string; roleId: string; roleName: string; mode: 'write' | 'read'; status: RunStatus; startedAt?: string; finishedAt?: string; summary?: string; verdict?: 'approve' | 'request_changes' | 'inconclusive'; nativeId?: string; costUsd: number };
export type Session = { id: string; title: string; objective: string; repositoryId: string; crewId: string; runtime: RuntimeKind; placement?: WorkspaceBackend; ownerId: string; ownerName: string; status: SessionStatus; budgetUsd: number; spentUsd: number; costStatus: 'demo' | 'pending' | 'settled' | 'unknown'; createdAt: string; updatedAt: string; branch: string; trackerUrl?: string; sourceTask?: TaskSnapshot; candidate?: Candidate; workspace?: Workspace; runs: Run[]; artifacts: Artifact[]; blocker?: string; failure?: ExecutionFailure };
export type Event = { id: number; sessionId: string; type: string; at: string; actor: string; runId?: string; data: Record<string, unknown> };
export type Workspace = { id: string; backend: 'demo' | 'local' | 'external' | 'docker' | 'kubernetes'; directory: string; endpoint?: string; nativeSessionId?: string; metadata?: Record<string, string> };
export type PermissionRequest = { id: string; sessionId: string; runId: string; nativeId: string; kind: 'permission' | 'question'; title: string; detail: string; options?: string[]; questions?: unknown[]; resolved?: boolean };
export type ModelConfig = { id: string; name: string; providerId: string; modelId: string };
export type AppConfig = {
  mode: 'demo' | 'live'; host: string; port: number; dataDir: string; publicDir: string; baseUrl?: string;
  repositories: Repository[]; crews: Crew[]; models: ModelConfig[];
  taskSources?: TaskSourceConfig[];
  runtime: { kind: RuntimeKind; backend: WorkspaceBackend | 'external'; backends?: WorkspaceBackend[]; endpoint?: string; username?: string; password?: string; binary?: string; image?: string; command?: string[]; timeoutMs: number; agentEnvironment?: string[] };
  docker?: { image: string; socketPath?: string; network?: string; cpus?: number; memoryMb?: number; pidsLimit?: number; gatewayUrl?: string; provisionTimeoutMs?: number; user?: string; transport?: WorkspaceTransport; relayUrl?: string };
  litellm?: { baseUrl: string; adminUrl: string; masterKey: string; models: string[]; ttl: string; settlementDelayMs?: number };
  kubernetes?: { namespace: string; image: string; storageClass?: string; storageSize: string; cpu: string; memory: string; apiUrl?: string; tokenFile?: string; caFile?: string; pullPolicy?: string; ingressFrom?: Record<string, unknown>[]; egress?: Record<string, unknown>[]; gitSecretName?: string; agentSecrets?: string[]; imagePullSecrets?: string[]; provisionTimeoutMs?: number; transport?: WorkspaceTransport; relayUrl?: string; provisioner?: 'pod' | 'sandbox'; sandbox?: { runtimeClassName?: string; warmPool?: string; poolTokenEnv?: string } };
  auth: { secureCookies: boolean; sessionHours: number; bootstrapPassword?: string; bootstrapName: string };
  maxConcurrentSessions: number; maxBudgetUsd: number;
  ploeg?: { url: string; teams: string[]; trackerUrl?: string };
};
export type RuntimeEvent = { type: string; data: Record<string, unknown> };
export type Emit = (event: RuntimeEvent) => void;
export type Credential = { key: string; alias: string; budgetUsd: number; reference: string };
export type ExecutionContext = { session: Session; run: Run; repository: Repository; role: CrewRole; workspace: Workspace; model?: ModelConfig; prompt: string; signal: AbortSignal; emit: Emit };
export type ExecutionResult = { summary: string; verdict?: 'approve' | 'request_changes' | 'inconclusive'; artifacts: Artifact[]; costUsd?: number; nativeId?: string };
export interface AgentRuntime {
  kind: RuntimeKind;
  prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal): Promise<Workspace>;
  execute(context: ExecutionContext): Promise<ExecutionResult>;
  captureCandidate?(session: Session, repository: Repository): Promise<Candidate>;
  respond?(workspace: Workspace, request: PermissionRequest, answer: { decision?: 'once' | 'always' | 'reject'; answers?: string[][] }): Promise<void>;
  interrupt(workspace: Workspace): Promise<void>;
  dispose(workspace: Workspace): Promise<void>;
}
