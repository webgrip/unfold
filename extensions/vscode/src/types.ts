export type User = { id: string; name: string; role: 'admin' | 'operator' | 'viewer' };
export type SessionStatus = 'queued' | 'running' | 'waiting_input' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type Artifact = { id: string; name: string; kind: 'diff' | 'test' | 'summary' | 'link'; content: string; url?: string };
export type Session = {
  id: string; title: string; objective: string; repositoryId: string; crewId: string; runtime: string;
  ownerId: string; ownerName: string; status: SessionStatus; budgetUsd: number; spentUsd: number;
  costStatus: 'demo' | 'pending' | 'settled' | 'unknown'; createdAt: string; updatedAt: string; branch: string; blocker?: string;
  runs: { id: string; roleName: string; mode: string; status: string; summary?: string; verdict?: string }[];
  artifacts: Artifact[];
};
export type Bootstrap = {
  user: User; mode: 'demo' | 'live'; maxBudgetUsd: number; maxConcurrentSessions: number;
  repositories: { id: string; name: string; description: string; baseBranch: string }[];
  crews: { id: string; name: string; description: string; roles: { name: string; mode: string }[] }[];
  models: { id: string; name: string }[];
  runtimes: { id: string; name: string; available: boolean }[];
};
export type SessionInput = { title: string; objective: string; repositoryId: string; crewId: string; runtime: string; budgetUsd: number };
export type SessionEvent = { id: number; sessionId: string; type: string; at: string; actor: string; data: Record<string, unknown> };
export type Permission = { id: string; kind: 'permission' | 'question'; title: string; detail: string; options?: string[]; questions?: { question: string; header?: string; options?: { label: string; description?: string }[]; multiple?: boolean; custom?: boolean }[]; resolved?: boolean };
export type SessionDetail = { session: Session; events: SessionEvent[]; permissions: Permission[]; user: User; mode: 'demo' | 'live' };
