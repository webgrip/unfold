import type { UnfoldClient } from './client.js';
import type { PloegCard, PloegDetail } from './ploeg-types.js';
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

/** The Ploeg Work Item a task panel follows: the first one that is not settled, else the first listed. */
export function currentWorkItemId(status: TaskPloegStatus): string | undefined {
  const item = status.workItems.find(entry => !settled.includes(entry.state)) ?? status.workItems[0];
  return item && /^[1-9][0-9]{0,19}$/.test(item.id) ? item.id : undefined;
}

/** Whether a Work Item is still moving, so its panel refreshes sooner. */
export function workItemMoving(state: string | undefined): boolean {
  return state === 'leased' || state === 'queued' || state === 'ingested';
}

/** What Ploeg reported for one Work Item. `problem` explains a detail that could not be read; an older server without the card route leaves `card` absent. */
export type PloegFacts = { detail?: PloegDetail; card?: PloegCard; problem?: string };

/** Reads a Work Item's detail and Run card side by side. It never throws: a failed detail becomes `problem`, a missing one (404) or a missing card leaves the field absent. */
export async function ploegFacts(client: Pick<UnfoldClient, 'workItem' | 'workItemCard'>, id: string, fresh: boolean): Promise<PloegFacts> {
  const [detail, card] = await Promise.allSettled([client.workItem(id, fresh), client.workItemCard(id)]);
  const facts: PloegFacts = {};
  if (detail.status === 'fulfilled') facts.detail = detail.value;
  else if ((detail.reason as { status?: unknown } | undefined)?.status !== 404) facts.problem = `Ploeg’s Runs for this Work Item could not be loaded: ${(detail.reason instanceof Error ? detail.reason.message : 'unknown error').replace(/\.$/, '')}. The panel shows the task’s Ploeg status only.`;
  if (card.status === 'fulfilled' && card.value && String(card.value.workItemId) === id) facts.card = card.value;
  return facts;
}
