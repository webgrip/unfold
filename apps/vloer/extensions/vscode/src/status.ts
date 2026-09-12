import type { ExecutionFailure, Run, Session, SessionStatus } from './types.js';

export type StatusPresentation = { name: string; icon: string; color?: string; group: 'attention' | 'active' | 'ready' | 'history' };

export const statuses: Record<SessionStatus, StatusPresentation> = {
  waiting_input: { name: 'Needs your decision', icon: 'bell-dot', color: 'list.warningForeground', group: 'attention' },
  failed: { name: 'Needs attention', icon: 'error', color: 'list.errorForeground', group: 'attention' },
  interrupted: { name: 'Interrupted', icon: 'debug-disconnect', color: 'list.warningForeground', group: 'attention' },
  paused: { name: 'Paused', icon: 'debug-pause', color: 'list.warningForeground', group: 'attention' },
  running: { name: 'Working', icon: 'sync~spin', group: 'active' },
  exporting: { name: 'Preparing review', icon: 'package', group: 'active' },
  queued: { name: 'Ready to start', icon: 'circle-outline', group: 'ready' },
  completed: { name: 'Awaiting your review', icon: 'eye', color: 'testing.iconPassed', group: 'ready' },
  cancelled: { name: 'Cancelled', icon: 'circle-slash', group: 'history' },
};

export const groups: { id: StatusPresentation['group']; label: string }[] = [
  { id: 'attention', label: 'Needs attention' }, { id: 'active', label: 'In progress' }, { id: 'ready', label: 'Ready' }, { id: 'history', label: 'History' },
];

export function presentationFor(session: { status: string; review?: { decision: 'accepted' | 'rejected' } }): StatusPresentation {
  if (session.status === 'completed' && session.review) return session.review.decision === 'accepted' ? { name: 'Accepted', icon: 'pass', color: 'testing.iconPassed', group: 'history' } : { name: 'Rejected', icon: 'circle-slash', color: 'list.warningForeground', group: 'history' };
  return presentation(session.status);
}

export function presentation(status: string): StatusPresentation {
  return statuses[status as SessionStatus] ?? { name: status.replaceAll('_', ' '), icon: 'circle-outline', group: 'history' };
}

export function activeRole(session: Session): string | undefined {
  return session.runs.find(run => ['running', 'waiting_input', 'paused'].includes(run.status))?.roleName;
}

export const stageNames: Record<string, string> = { credentials: 'Gateway authorization', workspace: 'Workspace setup', runtime: 'Runtime startup', prompt: 'Prompt submission', execution: 'Agent execution' };

export type RunLabel = 'implementation' | 'analysis' | 'independent review';

export function isReviewer(session: Session, run: Run): boolean {
  return run.mode === 'read' && session.runs.at(-1)?.id === run.id;
}

export function placementLabel(placement: string | undefined, origin?: string): string {
  const host = origin ? new URL(origin).hostname : undefined;
  const here = !host || ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (placement === 'docker') return here ? 'a container on this machine' : `a container on ${host}`;
  if (placement === 'kubernetes') return 'a pod in the cluster';
  if (placement === 'local') return here ? 'a working directory on this machine' : `a working directory on ${host}`;
  return 'the workbench workspace';
}

export function runLabel(session: Session, run: Run): RunLabel {
  if (run.mode === 'write') return 'implementation';
  return isReviewer(session, run) ? 'independent review' : 'analysis';
}

export function reviewers(session: Session): Run[] {
  return session.runs.filter(run => isReviewer(session, run));
}

export function failureStage(failure: ExecutionFailure | undefined): string {
  if (!failure) return 'Execution';
  if (failure.category === 'policy_violation') return 'Gateway policy';
  return stageNames[failure.stage] ?? 'Execution';
}

export function isolatedPlacement(placement: string | undefined): boolean {
  return placement === 'docker' || placement === 'kubernetes';
}

export function approvalLabel(session: Session): string {
  return session.approval === 'auto' ? 'tool use approved automatically' : 'tool use asks you';
}

export function observedSpend(session: Session): number | undefined {
  const finished = ['completed', 'failed', 'cancelled'].includes(session.status);
  return !finished && typeof session.observedUsd === 'number' && session.observedUsd > session.spentUsd ? session.observedUsd : undefined;
}

export function situation(session: Session): { headline: string; next: string } {
  const role = activeRole(session);
  const reviewing = reviewers(session);
  const rejected = reviewing.find(run => run.verdict === 'request_changes');
  switch (session.status) {
    case 'waiting_input': return { headline: `${role ?? 'The crew'} is waiting for your decision.`, next: 'Answer the pending request below; nothing continues until you do.' };
    case 'failed': return session.failure
      ? { headline: `${failureStage(session.failure)} failed: ${session.failure.message}`, next: session.failure.remediation }
      : rejected
        ? { headline: `${rejected.roleName} requested changes.`, next: 'Read the review findings, then send a revised instruction and resume, or cancel.' }
        : { headline: session.blocker || 'Execution stopped without approval.', next: 'Inspect the activity and checks, then decide whether to resume with new instructions.' };
    case 'interrupted': return { headline: 'Execution was interrupted; no replacement run started.', next: 'Inspect retained evidence and spend, then resume deliberately.' };
    case 'paused': return { headline: `Paused${role ? ` while ${role} was working` : ''}.`, next: 'Add instructions if needed, then resume to continue with them.' };
    case 'running': return { headline: `${role ?? 'The crew'} is working in ${placementLabel(session.placement)}.`, next: 'You can keep editing. Pause to steer, or wait for the next decision.' };
    case 'exporting': return { headline: 'Capturing the repository state for review.', next: 'The candidate download appears when the snapshot is complete.' };
    case 'queued': return { headline: 'Authorized and ready; nothing has run yet.', next: 'Start the crew when the brief is right.' };
    case 'completed': return session.review ? { headline: `${session.review.decision === 'accepted' ? 'Accepted' : 'Rejected'} by ${session.review.byName}.`, next: session.review.note ?? 'Recorded in the session history. Nothing was pushed or merged by the workbench.' } : { headline: 'The crew finished and the candidate is captured. Your review is next.', next: 'Inspect the changes, checks and transcripts, then accept or reject. Nothing has been pushed or merged.' };
    case 'cancelled': return { headline: 'Cancelled by an operator.', next: 'Evidence stays available. Create a new session to try again.' };
  }
  return { headline: presentationFor(session).name, next: '' };
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
  if (session.costStatus === 'demo') return 'demo · $0';
  const observed = observedSpend(session);
  return observed === undefined ? `${money(session.spentUsd)} of ${money(session.budgetUsd)}` : `${money(observed)} observed at the gateway of ${money(session.budgetUsd)}`;
}

export function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; } catch { return undefined; }
}
