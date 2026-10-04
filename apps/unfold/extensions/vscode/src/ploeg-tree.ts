import * as vscode from 'vscode';
import { ploegLanes as lanes, type PloegItem, type PloegLane, type PloegOverview, type PloegTeam } from './ploeg-types.js';
import { plainText, plural, teamDescription } from './status.js';
import type { Core } from './core.js';
import { icon } from './now-tree.js';

export type PloegEntry = { kind: 'team'; team: PloegTeam } | { kind: 'lane'; team: PloegTeam; lane: PloegLane; overview: PloegOverview } | { kind: 'item'; item: PloegItem; demo: boolean } | { kind: 'message'; label: string; open?: boolean };

export class PloegTree implements vscode.TreeDataProvider<PloegEntry>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<PloegEntry | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly load: (team?: string, fresh?: boolean) => Promise<PloegOverview>;
  private readonly loaded: (at: Date) => void;
  private cache = new Map<string, PloegOverview>();
  private message = 'Connect to inspect Ploeg work';
  private generation = 0;
  private fresh = true;
  private readonly core: Core;
  constructor(core: Core, load: (team?: string, fresh?: boolean) => Promise<PloegOverview>, loaded: (at: Date) => void = () => undefined) { this.core = core; this.load = load; this.loaded = loaded; }
  reset(message = '') { this.generation++; this.message = message; this.fresh = true; this.cache.clear(); this.changed.fire(undefined); }
  connected() { if (this.message) this.reset(); }
  /** Re-reads the snapshot through the workbench's short cache instead of forcing Ploeg queries. */
  soften() { if (this.message) return; this.generation++; this.fresh = false; this.cache.clear(); this.changed.fire(undefined); }
  getTreeItem(entry: PloegEntry): vscode.TreeItem {
    if (entry.kind === 'message') {
      const item = new vscode.TreeItem(entry.label);
      item.iconPath = new vscode.ThemeIcon('info');
      if (entry.open) item.command = { command: 'unfold.openPloeg', title: 'Open Ploeg workbench' };
      return item;
    }
    if (entry.kind === 'team') {
      const item = new vscode.TreeItem(entry.team.id, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `ploeg:team:${entry.team.id}`;
      item.description = teamDescription(entry.team);
      item.tooltip = `Team ${entry.team.id}${entry.team.paused ? ' · paused' : ''}\nRoles: ${entry.team.roles.map(role => role.id).join(', ') || 'none'}\nPloeg owns dispatch. Expand to inspect authorized work and open execution evidence.`;
      item.iconPath = new vscode.ThemeIcon(entry.team.paused ? 'debug-pause' : 'server-process');
      return item;
    }
    if (entry.kind === 'lane') {
      const lane = lanes.find(lane => lane.id === entry.lane)!;
      const page = entry.overview.lanes?.[entry.lane];
      const meta = entry.lane === 'all' ? undefined : this.core.workItemState(entry.lane);
      const item = new vscode.TreeItem(meta?.heading ?? meta?.label ?? lane.label, entry.lane === 'needs_human' || entry.lane === 'awaiting_review' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `ploeg:lane:${entry.team.id}:${entry.lane}`;
      item.description = `${page?.items.length ?? 0}${page?.nextCursor ? '+' : ''}`;
      item.tooltip = meta?.description ?? 'Every Work Item of this Team in the snapshot, newest first.';
      item.iconPath = meta ? icon(meta) : new vscode.ThemeIcon(lane.icon);
      return item;
    }
    const meta = this.core.workItemState(entry.item.state);
    const reason = this.core.listReason(entry.item, { demo: entry.demo });
    const item = new vscode.TreeItem(entry.item.title || `Work Item ${entry.item.id}`);
    item.id = `ploeg:item:${entry.item.id}`;
    item.description = [reason?.chip, `${entry.item.provider} #${entry.item.externalId || entry.item.id}`, entry.demo ? 'illustration' : ''].filter(Boolean).join(' · ');
    item.tooltip = `${entry.item.title}\n${entry.item.team} · ${meta.label}${reason ? ` · ${reason.chip}` : ''} · ${plural(entry.item.attempts, 'attempt')}\n${reason ? `${reason.sentence}\n${reason.action}\n` : ''}${plainText(entry.item.description).slice(0, 600)}`;
    item.iconPath = icon(meta);
    item.contextValue = 'ploeg:item';
    item.command = { command: 'unfold.openPloegItem', title: 'Open Work Item', arguments: [entry] };
    item.accessibilityInformation = { label: `${entry.item.title}, ${meta.label}, ${entry.item.team}` };
    return item;
  }
  async getChildren(entry?: PloegEntry): Promise<PloegEntry[]> {
    if (this.message) return entry ? [] : [{ kind: 'message', label: this.message }];
    const generation = this.generation;
    try {
      if (!entry || entry.kind === 'team') {
        const key = entry?.team.id ?? '';
        let overview = this.cache.get(key);
        if (!overview) { overview = await this.load(entry?.team.id, this.fresh); if (generation !== this.generation) return []; this.cache.set(key, overview); this.loaded(new Date()); }
        if (!overview.available) return [{ kind: 'message', label: overview.message, open: true }];
        if (entry) return lanes.filter(lane => lane.id === 'all' || overview!.lanes?.[lane.id]?.items.length).map(lane => ({ kind: 'lane', team: entry.team, lane: lane.id, overview: overview! }));
        return [...(overview.demo ? [{ kind: 'message' as const, label: 'Illustrative records · no model calls or spend' }] : []), ...overview.teams.map(team => ({ kind: 'team' as const, team })), ...(!overview.teams.length ? [{ kind: 'message' as const, label: 'No teams available to your account' }] : [])];
      }
      if (entry.kind !== 'lane') return [];
      const page = entry.overview.lanes?.[entry.lane];
      return [...(page?.items ?? []).map(item => ({ kind: 'item' as const, item, demo: entry.overview.demo })), ...(page?.nextCursor ? [{ kind: 'message' as const, label: 'More work in the web workbench…', open: true }] : []), ...(!page?.items.length ? [{ kind: 'message' as const, label: 'No work in this snapshot' }] : [])];
    } catch (error) { if (generation !== this.generation) return []; return [{ kind: 'message', label: error instanceof Error ? error.message : 'Ploeg operator data is unavailable. Refresh to try again.' }]; }
  }
  dispose() { this.generation++; this.cache.clear(); this.changed.dispose(); }
}
