import * as vscode from 'vscode';
import { groups, presentation, situation, relativeTime, spendLabel, activeRole, safeHttpsUrl } from './status.js';
import type { Session, Run, Artifact, Permission, TaskSource, TaskSnapshot, TaskPage } from './types.js';

export type SessionEntry =
  | { kind: 'group'; id: string; label: string; sessions: Session[] }
  | { kind: 'session'; session: Session }
  | { kind: 'decision'; session: Session; request: Permission }
  | { kind: 'run'; session: Session; run: Run; index: number }
  | { kind: 'artifact'; session: Session; artifact: Artifact }
  | { kind: 'candidate'; session: Session }
  | { kind: 'task'; session: Session }
  | { kind: 'message'; label: string; command?: string };

const runIcons: Record<string, string> = { completed: 'pass', running: 'sync~spin', waiting_input: 'bell-dot', failed: 'error', cancelled: 'circle-slash', paused: 'debug-pause', queued: 'circle-outline' };
const artifactIcons: Record<Artifact['kind'], string> = { diff: 'diff', test: 'beaker', summary: 'book', link: 'link-external' };

export function sessionTooltip(session: Session): vscode.MarkdownString {
  const state = presentation(session.status);
  const { headline, next } = situation(session);
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.appendMarkdown(`**${session.title}**\n\n$(${state.icon.replace('~spin', '')}) ${state.name}\n\n${headline}\n\n_${next}_\n\n`);
  tooltip.appendMarkdown(`${session.repositoryId} · ${session.crewId} · ${session.runtime}  \n${session.ownerName} · ${spendLabel(session)} · updated ${relativeTime(session.updatedAt)}`);
  if (session.sourceTask) tooltip.appendMarkdown(`  \nImported from ${session.sourceTask.provider} #${session.sourceTask.id}`);
  return tooltip;
}

export class SessionTree implements vscode.TreeDataProvider<SessionEntry>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<SessionEntry | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly loadPermissions: (sessionId: string) => Promise<Permission[]>;
  sessions: Session[] = [];
  message = '';
  messageCommand?: string;
  constructor(loadPermissions: (sessionId: string) => Promise<Permission[]>) { this.loadPermissions = loadPermissions; }

  update(sessions: Session[], message = '', messageCommand?: string) {
    this.sessions = [...sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    this.message = message;
    this.messageCommand = messageCommand;
    this.changed.fire(undefined);
  }

  find(id: string): Session | undefined { return this.sessions.find(session => session.id === id); }

  getTreeItem(entry: SessionEntry): vscode.TreeItem {
    switch (entry.kind) {
      case 'message': {
        const item = new vscode.TreeItem(entry.label);
        item.iconPath = new vscode.ThemeIcon(entry.command ? 'plug' : 'info');
        if (entry.command) item.command = { command: entry.command, title: entry.label };
        return item;
      }
      case 'group': {
        const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.Expanded);
        item.id = `group:${entry.id}`;
        item.description = String(entry.sessions.length);
        item.contextValue = `group:${entry.id}`;
        return item;
      }
      case 'session': return this.sessionItem(entry.session);
      case 'decision': {
        const item = new vscode.TreeItem(entry.request.title);
        item.id = `decision:${entry.session.id}:${entry.request.id}`;
        item.description = entry.request.kind === 'question' ? 'question' : 'permission';
        item.tooltip = entry.request.detail.slice(0, 600);
        item.iconPath = new vscode.ThemeIcon('bell-dot', new vscode.ThemeColor('list.warningForeground'));
        item.contextValue = 'decision';
        item.command = { command: 'vloer.reviewDecision', title: 'Review decision', arguments: [entry.session.id, entry.request.id] };
        return item;
      }
      case 'run': {
        const item = new vscode.TreeItem(entry.run.roleName);
        item.id = `run:${entry.session.id}:${entry.run.id}`;
        item.description = `${entry.run.mode === 'write' ? 'implementation' : 'review'} · ${entry.run.verdict ? entry.run.verdict.replaceAll('_', ' ') : entry.run.status.replaceAll('_', ' ')}`;
        item.tooltip = entry.run.summary ? entry.run.summary.slice(0, 800) : `${entry.run.roleName} · ${entry.run.status}`;
        item.iconPath = new vscode.ThemeIcon(runIcons[entry.run.status] ?? 'circle-outline', entry.run.verdict === 'approve' ? new vscode.ThemeColor('testing.iconPassed') : entry.run.verdict === 'request_changes' || entry.run.status === 'failed' ? new vscode.ThemeColor('list.warningForeground') : undefined);
        item.contextValue = 'run';
        item.command = { command: 'vloer.openTab', title: 'Open crew', arguments: [entry.session.id, 'brief', entry.run.id] };
        return item;
      }
      case 'artifact': {
        const item = new vscode.TreeItem(entry.artifact.name);
        item.id = `artifact:${entry.session.id}:${entry.artifact.id}`;
        item.description = entry.artifact.kind === 'diff' ? 'changes' : entry.artifact.kind === 'test' ? 'checks' : entry.artifact.kind;
        item.iconPath = new vscode.ThemeIcon(artifactIcons[entry.artifact.kind] ?? 'file');
        item.contextValue = `artifact:${entry.artifact.kind}`;
        item.command = { command: 'vloer.openArtifact', title: 'Open evidence', arguments: [entry.session.id, entry.artifact.id] };
        return item;
      }
      case 'candidate': {
        const candidate = entry.session.candidate!;
        const item = new vscode.TreeItem(candidate.status === 'ready' ? 'Review candidate' : 'Candidate unavailable');
        item.id = `candidate:${entry.session.id}`;
        item.description = candidate.status === 'ready' ? `${candidate.fileCount ?? '?'} files · ${(candidate.headSha ?? '').slice(0, 8)}` : candidate.reason ?? '';
        item.tooltip = candidate.status === 'ready' ? 'Download the captured repository change as a Git bundle, patch or manifest.' : candidate.message ?? candidate.reason ?? '';
        item.iconPath = new vscode.ThemeIcon(candidate.status === 'ready' ? 'git-commit' : 'warning');
        item.contextValue = `candidate:${candidate.status}`;
        if (candidate.status === 'ready') item.command = { command: 'vloer.downloadCandidate', title: 'Download review candidate', arguments: [entry.session.id] };
        return item;
      }
      case 'task': {
        const task = entry.session.sourceTask!;
        const item = new vscode.TreeItem(`${task.provider} #${task.id}`);
        item.id = `task:${entry.session.id}`;
        item.description = task.title;
        item.tooltip = `${task.title}\nImported revision ${task.revision.slice(0, 12)} · ${task.status}`;
        item.iconPath = new vscode.ThemeIcon('issues');
        item.contextValue = safeHttpsUrl(task.url) ? 'task:linked' : 'task';
        item.command = { command: 'vloer.sourceTask', title: 'Open imported task snapshot', arguments: [entry.session.id] };
        return item;
      }
    }
  }

  private sessionItem(session: Session): vscode.TreeItem {
    const state = presentation(session.status);
    const item = new vscode.TreeItem(session.title, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = session.id;
    const role = activeRole(session);
    const parts = [session.repositoryId, session.status === 'waiting_input' || session.status === 'running' ? (role ?? state.name) : state.name, session.costStatus === 'demo' ? 'demo' : `$${session.spentUsd.toFixed(2)}`, relativeTime(session.updatedAt)];
    item.description = parts.filter(Boolean).join(' · ');
    item.tooltip = sessionTooltip(session);
    item.iconPath = new vscode.ThemeIcon(state.icon, state.color ? new vscode.ThemeColor(state.color) : undefined);
    item.contextValue = `session:${session.status}`;
    item.command = { command: 'vloer.open', title: 'Open remote session', arguments: [session.id] };
    item.accessibilityInformation = { label: `${session.title}, ${state.name}, ${session.repositoryId}, ${spendLabel(session)}` };
    return item;
  }

  async getChildren(entry?: SessionEntry): Promise<SessionEntry[]> {
    if (!entry) {
      if (this.message) return [{ kind: 'message', label: this.message, command: this.messageCommand }];
      return groups.map(group => ({ kind: 'group' as const, id: group.id, label: group.label, sessions: this.sessions.filter(session => presentation(session.status).group === group.id) })).filter(group => group.sessions.length);
    }
    if (entry.kind === 'group') return entry.sessions.map(session => ({ kind: 'session', session }));
    if (entry.kind !== 'session') return [];
    const session = entry.session;
    const children: SessionEntry[] = [];
    if (session.status === 'waiting_input') {
      try { for (const request of (await this.loadPermissions(session.id)).filter(request => !request.resolved)) children.push({ kind: 'decision', session, request }); }
      catch { children.push({ kind: 'message', label: 'Decisions could not be loaded; refresh.' }); }
    }
    session.runs.forEach((run, index) => children.push({ kind: 'run', session, run, index }));
    for (const artifact of session.artifacts) children.push({ kind: 'artifact', session, artifact });
    if (session.candidate) children.push({ kind: 'candidate', session });
    if (session.sourceTask) children.push({ kind: 'task', session });
    return children;
  }

  getParent(entry: SessionEntry): SessionEntry | undefined {
    if (entry.kind === 'group' || entry.kind === 'message') return undefined;
    if (entry.kind === 'session') {
      const group = groups.find(group => group.id === presentation(entry.session.status).group)!;
      return { kind: 'group', id: group.id, label: group.label, sessions: this.sessions.filter(session => presentation(session.status).group === group.id) };
    }
    return { kind: 'session', session: entry.session };
  }

  dispose() { this.changed.dispose(); }
}

export type TaskEntry = { kind: 'source'; source: TaskSource } | { kind: 'task'; source: TaskSource; task: TaskSnapshot } | { kind: 'more'; source: TaskSource; page: number } | { kind: 'message'; label: string };

export class TaskTree implements vscode.TreeDataProvider<TaskEntry>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<TaskEntry | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private sources: TaskSource[] = [];
  private cache = new Map<string, TaskPage>();
  private message = 'Connect to browse linked tasks';
  private readonly load: (sourceId: string, page: number) => Promise<TaskPage>;
  constructor(load: (sourceId: string, page: number) => Promise<TaskPage>) { this.load = load; }

  update(sources: TaskSource[], message = '') {
    if (JSON.stringify(sources) === JSON.stringify(this.sources) && message === this.message) return;
    this.sources = sources; this.message = message; this.cache.clear(); this.changed.fire(undefined);
  }

  refresh() { this.cache.clear(); this.changed.fire(undefined); }

  getTreeItem(entry: TaskEntry): vscode.TreeItem {
    if (entry.kind === 'message') {
      const item = new vscode.TreeItem(entry.label);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }
    if (entry.kind === 'source') {
      const item = new vscode.TreeItem(entry.source.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `source:${entry.source.id}`;
      const page = this.cache.get(entry.source.id);
      item.description = `${entry.source.provider} · ${entry.source.repositoryId}${page ? ` · ${page.tasks.length}${page.nextPage ? '+' : ''} open` : ''}`;
      item.tooltip = `${entry.source.name}\n${entry.source.provider} → ${entry.source.repositoryId}\n${entry.source.executionOwner === 'ploeg' ? 'Ploeg owns execution; inspect tasks here.' : 'Operator-led sessions; import is a separate action.'}`;
      item.iconPath = new vscode.ThemeIcon(entry.source.executionOwner === 'ploeg' ? 'server-process' : 'checklist');
      item.contextValue = `source:${entry.source.executionOwner}`;
      return item;
    }
    if (entry.kind === 'more') {
      const item = new vscode.TreeItem('Browse more tasks…');
      item.iconPath = new vscode.ThemeIcon('ellipsis');
      item.command = { command: 'vloer.browseTasks', title: 'Browse more linked tasks', arguments: [entry] };
      return item;
    }
    const item = new vscode.TreeItem(entry.task.title);
    item.id = `task:${entry.source.id}:${entry.task.id}`;
    item.description = `#${entry.task.id}${entry.task.updatedAt ? ` · ${relativeTime(entry.task.updatedAt)}` : ''}`;
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${entry.task.title}**\n\n${entry.task.provider} #${entry.task.id} · ${entry.task.status} → ${entry.task.repositoryId}\n\n`);
    tooltip.appendText(entry.task.description.slice(0, 500));
    item.tooltip = tooltip;
    item.iconPath = new vscode.ThemeIcon('issues');
    item.contextValue = `task:${entry.source.executionOwner}${safeHttpsUrl(entry.task.url) ? ':linked' : ''}`;
    item.command = { command: 'vloer.importTask', title: 'Preview linked task', arguments: [entry] };
    item.accessibilityInformation = { label: `${entry.task.title}, ${entry.task.status}, ${entry.source.name}` };
    return item;
  }

  async getChildren(entry?: TaskEntry): Promise<TaskEntry[]> {
    if (!entry) return this.message ? [{ kind: 'message', label: this.message }] : this.sources.map(source => ({ kind: 'source', source }));
    if (entry.kind !== 'source') return [];
    try {
      const cached = this.cache.get(entry.source.id);
      const page = cached ?? await this.load(entry.source.id, 1);
      if (!cached) { this.cache.set(entry.source.id, page); this.changed.fire(entry); }
      return [...page.tasks.map(task => ({ kind: 'task' as const, source: entry.source, task })), ...(page.nextPage ? [{ kind: 'more' as const, source: entry.source, page: page.nextPage }] : []), ...(!page.tasks.length ? [{ kind: 'message' as const, label: 'No open tasks in this source' }] : [])];
    } catch (error) { return [{ kind: 'message', label: error instanceof Error ? error.message : 'Could not load tasks. Refresh to try again.' }]; }
  }

  dispose() { this.changed.dispose(); }
}
