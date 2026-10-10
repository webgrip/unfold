import * as vscode from 'vscode';
import type { Core, StateMeta } from './core.js';
import type { PloegNow, PloegNowItem, PloegRunRow } from './ploeg-types.js';
import { codicon, toneColors } from './tones.js';
import { describeItem, describeRun, describeSession, groupTruncated, linkedWorkItems, nowGroup, pullRequestNumber, type SessionRow } from './now.js';

export { nowGroup, waitingCount } from './now.js';

import type { NowGroup } from './now.js';
export type { NowGroup };
export type NowEntry =
  | { kind: 'group'; id: NowGroup; label: string; count: number }
  | { kind: 'item'; item: PloegNowItem; demo: boolean }
  | { kind: 'run'; run: PloegRunRow; demo: boolean }
  | { kind: 'session'; row: SessionRow }
  | { kind: 'message'; label: string; icon: string; command?: string };

/** What a Now row opens: the Work Item, and its tracker task when the row names one. */
export type WorkItemRef = { id: string; title: string; provider?: string; externalId?: string };

const groupLabels: Record<NowGroup, string> = { review: 'Ready for your review', needs: 'Needs you', proposed: 'Proposed', running: 'Running' };

/** The sidebar's first view: what waits on you across every Team, then what runs, as the browser's Now page lists it. */
export class NowTree implements vscode.TreeDataProvider<NowEntry>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<NowEntry | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly core: Core;
  private now?: PloegNow;
  private sessions: SessionRow[] = [];
  private linked = new Set<string>();
  private message?: { label: string; icon: string; command?: string } = { label: 'Connecting to your workbench…', icon: 'sync~spin' };
  private disconnected = false;
  private ploegMessage?: string;
  private shown = '';

  constructor(core: Core) { this.core = core; }

  /** Shows a fresh Now snapshot. `ploegMessage` replaces the Work Item groups when Ploeg could not be read. A Ploeg row for a Work Item a session drives is shown once, as the session. */
  update(now: PloegNow | undefined, sessions: SessionRow[], ploegMessage?: string) {
    this.now = now; this.sessions = sessions; this.linked = linkedWorkItems(sessions); this.ploegMessage = ploegMessage; this.message = undefined; this.disconnected = false;
    this.fire();
  }

  /** Empties the view, so its welcome content offers to connect; the view message says why. */
  offline() { this.now = undefined; this.sessions = []; this.linked = new Set(); this.ploegMessage = undefined; this.message = undefined; this.disconnected = true; this.fire(); }

  current(): PloegNow | undefined { return this.now; }

  private fire() {
    const minute = Math.floor(Date.now() / 60_000);
    const key = JSON.stringify([this.now?.waiting, this.now?.running, this.now?.errors, this.now?.truncatedStates, this.sessions.map(row => [row.session.id, row.session.updatedAt, row.group, row.progress.headline, row.group === 'running' ? minute : 0]), this.message, this.ploegMessage, this.disconnected]);
    if (key === this.shown) return;
    this.shown = key;
    this.changed.fire(undefined);
  }

  private items(group: NowGroup): PloegNowItem[] { return (this.now?.waiting ?? []).filter(item => nowGroup(item) === group && !this.linked.has(item.id)); }
  private rows(group: NowGroup): SessionRow[] { return this.sessions.filter(row => row.group === group); }
  private runs(): PloegRunRow[] { return (this.now?.running ?? []).filter(run => !this.linked.has(run.workItemId)); }

  getChildren(entry?: NowEntry): NowEntry[] {
    if (!entry) {
      if (this.disconnected) return [];
      if (this.message) return [{ kind: 'message', ...this.message }];
      const groups = (['review', 'needs', 'proposed'] as const).map(id => ({ id, count: this.items(id).length + this.rows(id).length }));
      const running = this.runs().length + this.rows('running').length;
      const entries: NowEntry[] = [];
      if (this.ploegMessage) entries.push({ kind: 'message', label: this.ploegMessage, icon: 'info' });
      if (this.now?.errors.waiting) entries.push({ kind: 'message', label: `Waiting work could not be read: ${this.now.errors.waiting}`, icon: 'warning' });
      for (const group of groups) if (group.count) entries.push({ kind: 'group', id: group.id, label: groupLabels[group.id], count: group.count });
      if (!entries.some(item => item.kind === 'group') && !this.ploegMessage && !this.now?.errors.waiting) entries.push({ kind: 'message', label: 'Nothing waits on you', icon: 'pass' });
      if (running) entries.push({ kind: 'group', id: 'running', label: groupLabels.running, count: running });
      return entries;
    }
    if (entry.kind !== 'group') return [];
    const demo = Boolean(this.now?.demo);
    if (entry.id === 'running') return [...this.rows('running').map(row => ({ kind: 'session' as const, row })), ...this.runs().map(run => ({ kind: 'run' as const, run, demo }))];
    return [
      ...this.rows(entry.id).map(row => ({ kind: 'session' as const, row })),
      ...this.items(entry.id).map(item => ({ kind: 'item' as const, item, demo })),
      ...(groupTruncated(this.now, entry.id) ? [{ kind: 'message' as const, label: 'More wait in Ploeg: open the full list', icon: 'link-external', command: entry.id === 'proposed' ? 'unfold.openNow' : 'unfold.openPloeg' }] : []),
    ];
  }

  getTreeItem(entry: NowEntry): vscode.TreeItem {
    switch (entry.kind) {
      case 'message': {
        const item = new vscode.TreeItem(entry.label);
        item.iconPath = new vscode.ThemeIcon(entry.icon, entry.icon === 'pass' ? new vscode.ThemeColor(toneColors.success!) : entry.icon === 'warning' ? new vscode.ThemeColor(toneColors.attention!) : undefined);
        if (entry.command) item.command = { command: entry.command, title: entry.label };
        return item;
      }
      case 'group': {
        const item = new vscode.TreeItem(entry.label, entry.id === 'running' && this.items('review').length + this.items('needs').length + this.rows('review').length + this.rows('needs').length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
        item.id = `now:${entry.id}`;
        item.description = `${entry.count}${groupTruncated(this.now, entry.id) ? '+' : ''}`;
        item.contextValue = `now:group:${entry.id}`;
        return item;
      }
      case 'item': return this.itemRow(entry.item, entry.demo);
      case 'run': return this.runRow(entry.run, entry.demo);
      case 'session': return this.sessionRow(entry.row);
    }
  }

  private sessionRow(row: SessionRow): vscode.TreeItem {
    const { session, progress } = row;
    const text = describeSession(this.core, row);
    const item = new vscode.TreeItem(text.label);
    item.id = `now:session:${session.id}`;
    item.description = text.description;
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`$(${codicon(progress.meta.glyph, false)}) **`).appendText(progress.meta.label).appendMarkdown('**');
    for (const line of text.lines) tooltip.appendMarkdown('\n\n').appendText(line);
    item.tooltip = tooltip;
    item.iconPath = row.group === 'running' ? new vscode.ThemeIcon(codicon('activity', true), new vscode.ThemeColor(toneColors.live!)) : icon({ key: progress.phase, label: progress.meta.label, tone: progress.meta.tone, glyph: progress.meta.glyph });
    item.contextValue = `now:session:${progress.phase}`;
    item.accessibilityInformation = { label: text.accessible };
    item.command = progress.phase === 'asking' ? { command: 'unfold.reviewDecision', title: 'Answer', arguments: [session.id] }
      : progress.workItemId ? { command: 'unfold.openWorkItem', title: 'Open Work Item', arguments: [{ id: progress.workItemId, title: session.title } satisfies WorkItemRef] }
      : { command: 'unfold.open', title: 'Open session', arguments: [session.id] };
    return item;
  }

  private itemRow(item: PloegNowItem, demo: boolean): vscode.TreeItem {
    const meta = this.core.workItemState(item.state);
    const text = describeItem(this.core, item, demo);
    const row = new vscode.TreeItem(text.label);
    row.id = `now:item:${item.id}`;
    row.description = text.description;
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`$(${codicon(meta.glyph)}) **`).appendText(text.heading).appendMarkdown('**');
    for (const line of text.lines) tooltip.appendMarkdown('\n\n').appendText(line);
    row.tooltip = tooltip;
    row.iconPath = icon(meta);
    row.contextValue = `now:item:${item.state}${pullRequestNumber(item.pullRequestUrl) ? ':pr' : ''}`;
    row.command = { command: 'unfold.openWorkItem', title: 'Open Work Item', arguments: [{ id: item.id, title: item.title, provider: item.provider, externalId: item.externalId } satisfies WorkItemRef] };
    row.accessibilityInformation = { label: text.accessible };
    return row;
  }

  private runRow(run: PloegRunRow, demo: boolean): vscode.TreeItem {
    const text = describeRun(this.core, run, demo);
    const row = new vscode.TreeItem(text.label);
    row.id = `now:run:${run.id}`;
    row.description = text.description;
    row.tooltip = text.lines.join('\n');
    row.iconPath = new vscode.ThemeIcon(codicon('activity', true), new vscode.ThemeColor(toneColors.live!));
    row.contextValue = 'now:run';
    row.command = { command: 'unfold.openWorkItem', title: 'Open Work Item', arguments: [{ id: run.workItemId, title: run.workItemTitle } satisfies WorkItemRef] };
    return row;
  }

  dispose() { this.changed.dispose(); }
}

/** The tree icon for a state: its glyph as a codicon in its tone's theme colour. */
export function icon(meta: StateMeta): vscode.ThemeIcon {
  const color = toneColors[meta.tone];
  return new vscode.ThemeIcon(codicon(meta.glyph, false), color ? new vscode.ThemeColor(color) : undefined);
}
