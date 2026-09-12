import type { CrewRole, Emit, ExecutionContext, RuntimeKind, Workspace } from '../src/types.ts';

export function executionFixture(options: { workspace: Workspace; role: CrewRole; runtime: RuntimeKind; verify: string[]; prompt: string; signal: AbortSignal; emit: Emit }): ExecutionContext {
  const repository = { id: 'repository', name: 'Repository', description: 'Runtime protocol fixture', url: 'https://forge.example/team/repository.git', baseBranch: 'main', verify: options.verify };
  const run = { id: 'run', sessionId: 'session', roleId: options.role.id, roleName: options.role.name, mode: options.role.mode, status: 'running' as const, costUsd: 0 };
  return {
    session: { id: 'session', title: 'Task', objective: options.prompt, repositoryId: repository.id, crewId: 'delivery', runtime: options.runtime, ownerId: 'operator', ownerName: 'Operator', status: 'running', budgetUsd: 3, spentUsd: 0, costStatus: 'pending', createdAt: '2026-09-09T12:00:00.000Z', updatedAt: '2026-09-09T12:00:00.000Z', branch: 'vloer/session', runs: [run], artifacts: [] },
    run,
    repository,
    role: options.role,
    workspace: options.workspace,
    prompt: options.prompt,
    signal: options.signal,
    emit: options.emit,
  };
}
