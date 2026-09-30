import type { Bootstrap, TaskPloegStatus, TaskSnapshot, TaskSource } from './types.js';

const settled = ['done', 'withdrawn', 'stale'];

/** Describes a server that predates the task hand-off routes, so the panel can still show the task. */
export function unsupportedStatus(message = 'Update the workbench server to see Ploeg status and hand tasks to Ploeg from here.'): TaskPloegStatus {
  return { available: false, message, demo: false, handoff: { allowed: false, reason: message }, teams: [], assignedTeams: [], workItems: [], fetchedAt: new Date().toISOString() };
}

/** Whether an operator-led session may be created from this task, mirroring the import rules the server enforces. */
export function sessionEligibility(bootstrap: Bootstrap, source: TaskSource, task: TaskSnapshot): { allowed: boolean; reason?: string } {
  if (bootstrap.user.role === 'viewer') return { allowed: false, reason: 'An operator account is required to start a session.' };
  if (task.status !== 'open') return { allowed: false, reason: 'Only open tasks can start a session.' };
  if (bootstrap.sharedExecution) return task.ploeg && !task.ploegUnavailable ? { allowed: true } : { allowed: false, reason: task.ploegUnavailable?.message || 'This task has no queued Ploeg work item to supervise.' };
  return source.executionOwner === 'ploeg' ? { allowed: false, reason: 'Ploeg owns execution for this board.' } : { allowed: true };
}

/** Whether a fresh status still waits for Ploeg to react to an assignment the operator just made. */
export function awaitingPloeg(status: TaskPloegStatus): boolean {
  return status.available && status.assignedTeams.length > 0 && !status.workItems.some(item => !settled.includes(item.state));
}
