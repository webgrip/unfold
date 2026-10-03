import * as vscode from 'vscode';
import type { Core, StateMeta } from './core.js';
import type { PloegNow, PloegNowItem, PloegRunRow } from './ploeg-types.js';
import { codicon, toneColors } from './tones.js';
import type { Session } from './types.js';
import { describeItem, describeRun, groupTruncated, nowGroup, pullRequestNumber } from './now.js';

export { nowGroup, waitingCount } from './now.js';

import type { NowGroup } from './now.js';
export type { NowGroup };
export type NowEntry =
  | { kind: 'group'; id: NowGroup; label: string; count: number }
  | { kind: 'item'; item: PloegNowItem; demo: boolean }
  | { kind: 'run'; run: PloegRunRow; demo: boolean }
  | { kind: 'session'; session: Session }
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
  private sessions: Session[] = [];
  private message?: { label: string; icon: string; command?: string } = { label: 'Connecting to your workbench…', icon: 'sync~spin' };
  private disconnected = false;
  private ploegMessage?: string;
  private shown = '';

  constructor(core: Core) { this.core = core; }

  /** Shows a fresh Now snapshot. `ploegMessage` replaces the Work Item groups when Ploeg could not be read. */
  update(now: PloegNow | undefined, sessions: Session[], ploegMessage?: string) {
    this.now = now; this.sessions = sessions.filter(session => session.status === 'waiting_input'); this.ploegMessage = ploegMessage; this.message = undefined; this.disconnected = false;
    this.fire();
  }

  /** Empties the view, so its welcome content offers to connect; the view message says why. */
  offline() { this.now = undefined; this.sessions = []; this.ploegMessage = undefined; this.message = undefined; this.disconnected = true; this.fire(); }

  current(): PloegNow | undefined { return this.now; }

  private fire() {
    const key = JSON.stringify([this.now?.waiting, this.now?.running, this.now?.errors, this.now?.truncatedStates, this.sessions.map(session => [session.id, session.updatedAt]), this.message, this.ploegMessage, this.disconnected]);
    if (key === this.shown) return;
    this.shown = key;
    this.changed.fire(undefined);
  }

  private items(group: NowGroup): PloegNowItem[] { return (this.now?.waiting ?? []).filter(item => nowGroup(item) === group); }

  getChildren(entry?: NowEntry): NowEntry[] {
    if (!entry) {
      if (this.disconnected) return [];
      if (this.message) return [{ kind: 'message', ...this.message }];
      const groups = (['review', 'needs', 'proposed'] as const).map(id => ({ id, count: this.items(id).length + (id === 'needs' ? this.sessions.length : 0) }));
      const running = this.now?.running.length ?? 0;
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
    if (entry.id === 'running') return (this.now?.running ?? []).map(run => ({ kind: 'run' as const, run, demo }));
    return [
      ...(entry.id === 'needs' ? this.sessions.map(session => ({ kind: 'session' as const, session })) : []),
      ...this.items(entry.id).map(item => ({ kind: 'item' as const, item, demo })),
      ...(groupTruncated(this.now, entry.id) ? [{ kind: 'message' as const, label: 'More wait in Ploeg: open the full list', icon: 'link-external', command: entry.id === 'proposed' ? 'vloer.openNow' : 'vloer.openPloeg' }] : []),
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
        const item = new vscode.TreeItem(entry.label, entry.id === 'running' && this.items('review').length + this.items('needs').length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
        item.id = `now:${entry.id}`;
        item.description = `${entry.count}${groupTruncated(this.now, entry.id) ? '+' : ''}`;
        item.contextValue = `now:group:${entry.id}`;
        return item;
      }
      case 'item': return this.itemRow(entry.item, entry.demo);
      case 'run': return this.runRow(entry.run, entry.demo);
      case 'session': {
        const item = new vscode.TreeItem(entry.session.title);
        item.id = `now:session:${entry.session.id}`;
        const meta = this.core.sessionStatus(entry.session);
        item.description = `${meta.label} · session`;
        item.tooltip = `${entry.session.title}\n${meta.label}. A supervised session is waiting for your answer.`;
        item.iconPath = icon(meta);
        item.contextValue = 'now:session';
        item.command = { command: 'vloer.reviewDecision', title: 'Review decision', arguments: [entry.session.id] };
        return item;
      }
    }
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
    row.command = { command: 'vloer.openWorkItem', title: 'Open Work Item', arguments: [{ id: item.id, title: item.title, provider: item.provider, externalId: item.externalId } satisfies WorkItemRef] };
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
    row.command = { command: 'vloer.openWorkItem', title: 'Open Work Item', arguments: [{ id: run.workItemId, title: run.workItemTitle } satisfies WorkItemRef] };
    return row;
  }

  dispose() { this.changed.dispose(); }
}

/** The tree icon for a state: its glyph as a codicon in its tone's theme colour. */
export function icon(meta: StateMeta): vscode.ThemeIcon {
  const color = toneColors[meta.tone];
  return new vscode.ThemeIcon(codicon(meta.glyph, false), color ? new vscode.ThemeColor(color) : undefined);
}
