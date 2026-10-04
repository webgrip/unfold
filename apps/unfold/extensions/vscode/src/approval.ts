import type { Approval, Session } from './types.js';

export type ApprovalChoice = { label: string; description: string; detail: string; value: Approval };

export type ApprovalClient = { setApproval(id: string, approval: Approval): Promise<Session> };
export type ApprovalUi = { pick(choices: ApprovalChoice[], current: Approval | undefined): Promise<Approval | undefined>; info(message: string): void };

export const approvalChoices: ApprovalChoice[] = [
  { label: '$(shield) Approve automatically', description: 'auto', detail: 'Tool use inside the sandbox is approved without asking. Questions from the crew still wait for you.', value: 'auto' },
  { label: '$(bell-dot) Ask me again', description: 'manual', detail: 'Every read, search and shell command waits for your decision.', value: 'manual' },
];

export function approvalAvailable(session: Pick<Session, 'status' | 'placement'>): { available: boolean; reason?: string } {
  if (['completed', 'failed', 'cancelled'].includes(session.status)) return { available: false, reason: 'This session has finished; its approval mode can no longer change.' };
  if (session.placement !== 'docker' && session.placement !== 'kubernetes') return { available: false, reason: 'Automatic approval needs a container or pod placement. Sessions on the local backend always ask.' };
  return { available: true };
}

export function approvalMessage(approval: Approval): string {
  return approval === 'auto' ? 'The crew now works without asking for each tool.' : 'The crew asks you again before each tool.';
}

export async function setApproval(client: ApprovalClient, ui: ApprovalUi, session: Session): Promise<Approval | undefined> {
  const availability = approvalAvailable(session);
  if (!availability.available) throw new Error(availability.reason);
  const choice = await ui.pick(approvalChoices, session.approval);
  if (!choice) return undefined;
  if (choice === (session.approval ?? 'manual')) { ui.info(choice === 'auto' ? 'This session already approves tool use automatically.' : 'This session already asks before each tool.'); return undefined; }
  const updated = await client.setApproval(session.id, choice);
  ui.info(approvalMessage(updated.approval ?? choice));
  return updated.approval ?? choice;
}
