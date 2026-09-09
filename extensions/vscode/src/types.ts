export type User = { id: string; name: string; role: 'admin' | 'operator' | 'viewer' };
export type SessionStatus = 'queued' | 'running' | 'exporting' | 'waiting_input' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type Artifact = { id: string; name: string; kind: 'diff' | 'test' | 'summary' | 'link'; content: string; url?: string };
export type ExecutionFailure = { category: string; stage: string; message: string; remediation: string; promptAcceptance: 'not_submitted' | 'rejected' | 'accepted' | 'unknown'; automaticRetry: false };
export type Session = {
  id: string; title: string; objective: string; repositoryId: string; crewId: string; runtime: string;
  ownerId: string; ownerName: string; status: SessionStatus; budgetUsd: number; spentUsd: number;
  costStatus: 'demo' | 'pending' | 'settled' | 'unknown'; createdAt: string; updatedAt: string; branch: string; blocker?: string;
  failure?: ExecutionFailure;
  sourceTask?: TaskSnapshot;
  candidate?: Candidate;
  runs: { id: string; roleName: string; mode: string; status: string; summary?: string; verdict?: string }[];
  artifacts: Artifact[];
};
export type Bootstrap = {
  user: User; mode: 'demo' | 'live'; maxBudgetUsd: number; maxConcurrentSessions: number;
  repositories: { id: string; name: string; description: string; baseBranch: string }[];
  crews: { id: string; name: string; description: string; roles: { name: string; mode: string }[] }[];
  models: { id: string; name: string }[];
  runtimes: { id: string; name: string; available: boolean }[];
  taskSources?: TaskSource[];
};
export type SessionInput = { title: string; objective: string; repositoryId: string; crewId: string; runtime: string; budgetUsd: number };
export type SessionEvent = { id: number; sessionId: string; type: string; at: string; actor: string; data: Record<string, unknown> };
export type Permission = { id: string; kind: 'permission' | 'question'; title: string; detail: string; options?: string[]; questions?: { question: string; header?: string; options?: { label: string; description?: string }[]; multiple?: boolean; custom?: boolean }[]; resolved?: boolean };
export type SessionDetail = { session: Session; events: SessionEvent[]; permissions: Permission[]; user: User; mode: 'demo' | 'live' };

export type TaskProvider = 'demo' | 'forgejo' | 'github' | 'gitlab' | 'clickup' | 'vikunja';
export type TaskSource = { id: string; name: string; provider: TaskProvider; repositoryId: string; executionOwner: 'interactive' | 'ploeg' };
export type TaskSnapshot = { key: string; sourceId: string; provider: TaskProvider; id: string; revision: string; title: string; description: string; url: string; status: 'open' | 'closed' | 'unknown'; updatedAt?: string; repositoryId: string };
export type TaskPage = { tasks: TaskSnapshot[]; nextPage?: number };
export type TaskImportInput = { sourceId: string; taskId: string; revision: string; crewId: string; runtime: string; budgetUsd: number };
export type Candidate = { status: 'ready' | 'unavailable'; reason?: string; message?: string; createdAt?: string; baseSha?: string; snapshotBaseSha?: string; headSha?: string; treeSha?: string; fileCount?: number; bytes?: number; sha256?: { bundle: string; patch: string }; formats?: CandidateFormat[] };
export type CandidateFormat = 'bundle' | 'patch' | 'manifest';
