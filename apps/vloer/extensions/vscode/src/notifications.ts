import * as vscode from 'vscode';
import { situation } from './status.js';
import type { Session } from './types.js';

export type NotificationPolicy = 'all' | 'decisions-and-failures' | 'none';
export type Alert = { session: Session; kind: 'decision' | 'failure' | 'interrupted' | 'completed'; title: string; actions: { label: string; command: string; args?: unknown[] }[] };

export class AttentionWatcher {
  private known?: Map<string, string>;
  private readonly policy: () => NotificationPolicy;
  constructor(policy: () => NotificationPolicy) { this.policy = policy; }

  reset() { this.known = undefined; }

  observe(sessions: Session[]): Alert[] {
    const previous = this.known;
    this.known = new Map(sessions.map(session => [session.id, session.status]));
    if (!previous) return [];
    const alerts: Alert[] = [];
    for (const session of sessions) {
      const before = previous.get(session.id);
      if (before === session.status) continue;
      const alert = this.alertFor(session, before);
      if (alert) alerts.push(alert);
    }
    return alerts;
  }

  private alertFor(session: Session, before: string | undefined): Alert | undefined {
    const policy = this.policy();
    if (policy === 'none') return undefined;
    const open = { label: 'Open session', command: 'vloer.open', args: [session.id] };
    if (session.status === 'waiting_input') return { session, kind: 'decision', title: `${session.title}: ${situation(session).headline}`, actions: [{ label: 'Review decision', command: 'vloer.reviewDecision', args: [session.id] }, open] };
    if (session.status === 'failed') return { session, kind: 'failure', title: `${session.title}: ${situation(session).headline}`, actions: [open, { label: 'Open activity', command: 'vloer.openTab', args: [session.id, 'activity'] }] };
    if (session.status === 'interrupted') return { session, kind: 'interrupted', title: `${session.title}: ${situation(session).headline}`, actions: [open] };
    if (session.status === 'completed' && before && policy === 'all') return { session, kind: 'completed', title: `${session.title} is ready for human review.`, actions: [{ label: 'Open changes', command: 'vloer.openTab', args: [session.id, 'changes'] }, open] };
    return undefined;
  }
}

export async function show(alert: Alert): Promise<void> {
  const labels = alert.actions.map(action => action.label);
  const chosen = alert.kind === 'completed' ? await vscode.window.showInformationMessage(alert.title, ...labels) : await vscode.window.showWarningMessage(alert.title, ...labels);
  const action = alert.actions.find(item => item.label === chosen);
  if (action) await vscode.commands.executeCommand(action.command, ...(action.args ?? []));
}
