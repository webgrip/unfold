import * as vscode from 'vscode';
import { ploegLanes as lanes, type PloegItem, type PloegLane, type PloegOverview, type PloegTeam } from './ploeg-types.js';
import { plainText, plural, teamDescription } from './status.js';

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
  constructor(load: (team?: string, fresh?: boolean) => Promise<PloegOverview>, loaded: (at: Date) => void = () => undefined) { this.load = load; this.loaded = loaded; }
  reset(message = '') { this.generation++; this.message = message; this.fresh = true; this.cache.clear(); this.changed.fire(undefined); }
  connected() { if (this.message) this.reset(); }
  /** Re-reads the snapshot through the workbench's short cache instead of forcing Ploeg queries. */
  soften() { if (this.message) return; this.generation++; this.fresh = false; this.cache.clear(); this.changed.fire(undefined); }
  getTreeItem(entry: PloegEntry): vscode.TreeItem {
    if (entry.kind === 'message') {
      const item = new vscode.TreeItem(entry.label);
      item.iconPath = new vscode.ThemeIcon('info');
      if (entry.open) item.command = { command: 'vloer.openPloeg', title: 'Open Ploeg workbench' };
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
      const item = new vscode.TreeItem(lane.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `ploeg:lane:${entry.team.id}:${entry.lane}`;
      item.description = `${page?.items.length ?? 0}${page?.nextCursor ? '+' : ''}`;
      item.tooltip = entry.lane === 'leased' ? 'Ploeg holds an execution lease for these items. This snapshot does not imply an active model call.' : 'Records in the current operator snapshot.';
      item.iconPath = new vscode.ThemeIcon(lane.icon);
      return item;
    }
    const item = new vscode.TreeItem(entry.item.title || `Work item ${entry.item.id}`);
    item.id = `ploeg:item:${entry.item.id}`;
    item.description = `${entry.demo ? 'illustration · ' : ''}${entry.item.provider} #${entry.item.externalId || entry.item.id}`;
    item.tooltip = `${entry.item.title}\n${entry.item.team} · ${entry.item.state.replaceAll('_', ' ')} · ${plural(entry.item.attempts, 'attempt')}\n${plainText(entry.item.description).slice(0, 600)}\nOpen the task, or its shifts, runs, review findings and costs in the web workbench.`;
    item.iconPath = new vscode.ThemeIcon(entry.item.state === 'needs_human' ? 'bell-dot' : entry.item.state === 'leased' ? 'pulse' : entry.item.state === 'awaiting_review' ? 'git-pull-request' : 'issues');
    item.contextValue = 'ploeg:item';
    item.command = { command: 'vloer.openPloegItem', title: 'Open task', arguments: [entry] };
    item.accessibilityInformation = { label: `${entry.item.title}, ${entry.item.state.replaceAll('_', ' ')}, ${entry.item.team}` };
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
        if (entry) return lanes.map(lane => ({ kind: 'lane', team: entry.team, lane: lane.id, overview }));
        return [...(overview.demo ? [{ kind: 'message' as const, label: 'Illustrative records · no model calls or spend' }] : []), ...overview.teams.map(team => ({ kind: 'team' as const, team })), ...(!overview.teams.length ? [{ kind: 'message' as const, label: 'No teams available to your account' }] : [])];
      }
      if (entry.kind !== 'lane') return [];
      const page = entry.overview.lanes?.[entry.lane];
      return [...(page?.items ?? []).map(item => ({ kind: 'item' as const, item, demo: entry.overview.demo })), ...(page?.nextCursor ? [{ kind: 'message' as const, label: 'More work in the web workbench…', open: true }] : []), ...(!page?.items.length ? [{ kind: 'message' as const, label: 'No work in this snapshot' }] : [])];
    } catch (error) { if (generation !== this.generation) return []; return [{ kind: 'message', label: error instanceof Error ? error.message : 'Ploeg operator data is unavailable. Refresh to try again.' }]; }
  }
  dispose() { this.generation++; this.cache.clear(); this.changed.dispose(); }
}
