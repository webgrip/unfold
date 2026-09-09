import type { Session, SessionStatus } from './types.js';

export type StatusPresentation = { name: string; icon: string; color?: string; group: 'attention' | 'active' | 'ready' | 'history' };

export const statuses: Record<SessionStatus, StatusPresentation> = {
  waiting_input: { name: 'Needs your decision', icon: 'bell-dot', color: 'list.warningForeground', group: 'attention' },
  failed: { name: 'Needs attention', icon: 'error', color: 'list.errorForeground', group: 'attention' },
  interrupted: { name: 'Interrupted', icon: 'debug-disconnect', color: 'list.warningForeground', group: 'attention' },
  paused: { name: 'Paused', icon: 'debug-pause', color: 'list.warningForeground', group: 'attention' },
  running: { name: 'Running remotely', icon: 'sync~spin', group: 'active' },
  exporting: { name: 'Preparing review', icon: 'package', group: 'active' },
  queued: { name: 'Ready to start', icon: 'circle-outline', group: 'ready' },
  completed: { name: 'Ready for human review', icon: 'pass', color: 'testing.iconPassed', group: 'history' },
  cancelled: { name: 'Cancelled', icon: 'circle-slash', group: 'history' },
};

export const groups: { id: StatusPresentation['group']; label: string }[] = [
  { id: 'attention', label: 'Needs attention' }, { id: 'active', label: 'In progress' }, { id: 'ready', label: 'Ready' }, { id: 'history', label: 'History' },
];

export function presentation(status: string): StatusPresentation {
  return statuses[status as SessionStatus] ?? { name: status.replaceAll('_', ' '), icon: 'circle-outline', group: 'history' };
}

export function activeRole(session: Session): string | undefined {
  return session.runs.find(run => ['running', 'waiting_input', 'paused'].includes(run.status))?.roleName;
}

export const stageNames: Record<string, string> = { credentials: 'Gateway authorization', workspace: 'Workspace setup', runtime: 'Runtime startup', prompt: 'Prompt submission', execution: 'Agent execution' };

export function situation(session: Session): { headline: string; next: string } {
  const role = activeRole(session);
  const reviewers = session.runs.filter(run => run.mode === 'read');
  const rejected = reviewers.find(run => run.verdict === 'request_changes');
  switch (session.status) {
    case 'waiting_input': return { headline: `${role ?? 'The crew'} is waiting for your decision.`, next: 'Answer the pending request below; nothing continues until you do.' };
    case 'failed': return session.failure
      ? { headline: `${stageNames[session.failure.stage] ?? 'Execution'} failed: ${session.failure.message}`, next: session.failure.remediation }
      : rejected
        ? { headline: `${rejected.roleName} requested changes.`, next: 'Read the review findings, then send a revised instruction and resume, or cancel.' }
        : { headline: session.blocker || 'Execution stopped without approval.', next: 'Inspect the activity and checks, then decide whether to resume with new instructions.' };
    case 'interrupted': return { headline: 'Execution was interrupted; no replacement run started.', next: 'Inspect retained evidence and spend, then resume deliberately.' };
    case 'paused': return { headline: `Paused${role ? ` while ${role} was working` : ''}.`, next: 'Add instructions if needed, then resume to continue with them.' };
    case 'running': return { headline: `${role ?? 'The crew'} is working in the remote workspace.`, next: 'You can keep editing. Pause to steer, or wait for the next decision.' };
    case 'exporting': return { headline: 'Capturing the repository state for review.', next: 'The candidate download appears when the snapshot is complete.' };
    case 'queued': return { headline: 'Authorized and ready; nothing has run yet.', next: 'Start the remote crew when the brief is right.' };
    case 'completed': return { headline: `Required reviewers approved (${reviewers.filter(run => run.verdict === 'approve').length} of ${reviewers.length}).`, next: 'Machine review is done. Human review and your repository checks are still required.' };
    case 'cancelled': return { headline: 'Cancelled by an operator.', next: 'Evidence stays available. Create a new session to try again.' };
  }
  return { headline: presentation(session.status).name, next: '' };
}

export function relativeTime(value: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(value)) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function money(value: number): string { return `$${value.toFixed(2)}`; }

export function spendLabel(session: Session): string {
  return session.costStatus === 'demo' ? 'demo · $0' : `${money(session.spentUsd)} of ${money(session.budgetUsd)}`;
}

export function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; } catch { return undefined; }
}
