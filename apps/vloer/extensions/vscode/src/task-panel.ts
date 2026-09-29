import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ApiError, type VloerClient } from './client.js';
import { providerNames, safeHttpsUrl } from './status.js';
import { awaitingPloeg, sessionEligibility, unsupportedStatus } from './task-view.js';
import type { Bootstrap, TaskPloegStatus, TaskSnapshot, TaskSource } from './types.js';

export interface TaskPanelHost {
  readonly extensionUri: vscode.Uri;
  client(): VloerClient;
  revision(): number;
  bootstrap(): Promise<Bootstrap>;
  startSession(source: TaskSource, task: TaskSnapshot): Promise<void>;
  openPloeg(id: string): Promise<void>;
  lastTeam(): string | undefined;
  rememberTeam(team: string): Promise<void>;
  report(error: unknown): Promise<void>;
}

export type TaskView = {
  task: TaskSnapshot; source: { id: string; name: string; provider: string; handoff: boolean; executionOwner: string };
  repositoryName: string; status: TaskPloegStatus; session: { allowed: boolean; reason?: string }; host: string; loadedAt: string; preferredTeam?: string;
};

type Inbound = { type?: unknown; id?: unknown; team?: unknown; url?: unknown };

const teamName = (value: unknown): string | undefined => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;

export class TaskPanel implements vscode.Disposable {
  readonly key: string;
  readonly panel: vscode.WebviewPanel;
  private readonly host: TaskPanelHost;
  private readonly source: TaskSource;
  private readonly taskId: string;
  private readonly onDispose: () => void;
  private view?: TaskView;
  private timer?: ReturnType<typeof setTimeout>;
  private fastUntil = 0;
  private loading = false;
  private pending?: { reloadTask: boolean; problem: string };
  private mutations = 0;
  private disposed = false;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(host: TaskPanelHost, source: TaskSource, taskId: string, panel: vscode.WebviewPanel, onDispose: () => void) {
    this.host = host; this.source = source; this.taskId = taskId; this.panel = panel; this.onDispose = onDispose;
    this.key = `${source.id}:${taskId}`;
    panel.webview.html = this.html();
    this.subscriptions.push(panel.onDidDispose(() => this.dispose()));
    this.subscriptions.push(panel.webview.onDidReceiveMessage(message => void this.receive(message)));
    this.subscriptions.push(panel.onDidChangeViewState(event => { if (event.webviewPanel.visible) void this.load(false); else this.stop(); }));
  }

  static create(host: TaskPanelHost, source: TaskSource, taskId: string, title: string, onDispose: () => void): TaskPanel {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(taskId) || !/^[a-z0-9-]{1,64}$/.test(source.id)) throw new Error('Invalid linked task identifier.');
    const panel = vscode.window.createWebviewPanel('vloer.task', title, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(host.extensionUri, 'media')], retainContextWhenHidden: true, enableFindWidget: true });
    panel.iconPath = vscode.Uri.joinPath(host.extensionUri, 'media', 'vloer.svg');
    return new TaskPanel(host, source, taskId, panel, onDispose);
  }

  reveal() { this.panel.reveal(undefined, false); void this.load(false); }

  offline() { this.stop(); void this.panel.webview.postMessage({ type: 'connection', connected: false }); }

  async load(reloadTask: boolean, problem = ''): Promise<void> {
    if (this.disposed) return;
    if (this.loading) { this.pending = { reloadTask: reloadTask || Boolean(this.pending?.reloadTask), problem: problem || this.pending?.problem || '' }; return; }
    this.loading = true;
    const client = this.host.client();
    const revision = this.host.revision();
    const mutations = this.mutations;
    try {
      const bootstrap = await this.host.bootstrap();
      const task = reloadTask || !this.view ? await client.task(this.source.id, this.taskId, true) : this.view.task;
      const status = await this.status(client, task, reloadTask);
      if (this.disposed || client !== this.host.client() || revision !== this.host.revision() || mutations !== this.mutations) return;
      const repository = bootstrap.repositories.find(item => item.id === task.repositoryId);
      this.view = {
        task, status, host: new URL(client.origin).host, loadedAt: new Date().toISOString(),
        source: { id: this.source.id, name: this.source.name, provider: this.source.provider, handoff: Boolean(this.source.handoff), executionOwner: this.source.executionOwner },
        repositoryName: repository?.name ?? task.repositoryId, session: sessionEligibility(bootstrap, this.source, task), preferredTeam: this.host.lastTeam(),
      };
      this.panel.title = task.title;
      await this.panel.webview.postMessage({ type: 'state', view: this.view, problem });
    } catch (error) {
      await this.panel.webview.postMessage({ type: 'problem', message: error instanceof Error ? error.message : 'The task could not be loaded.' });
    } finally {
      this.loading = false;
      const next = this.pending;
      this.pending = undefined;
      if (next && !this.disposed) void this.load(next.reloadTask, next.problem); else this.schedule();
    }
  }

  private async status(client: VloerClient, task: TaskSnapshot, fresh: boolean): Promise<TaskPloegStatus> {
    if (task.provider === 'demo') return unsupportedStatus('Demo fixture tasks are not linked to Ploeg. No model calls or spend.');
    try { return await client.taskPloeg(this.source.id, task.id, fresh); }
    catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405) && ['not_found', 'request_failed', 'invalid_response'].includes(error.code)) return unsupportedStatus();
      if (error instanceof ApiError && error.status === 401) throw error;
      return unsupportedStatus(`Ploeg status could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private schedule() {
    this.stop();
    if (this.disposed || !this.panel.visible) return;
    const delay = Date.now() >= this.fastUntil ? 15000 : this.view && awaitingPloeg(this.view.status) ? 3000 : 6000;
    this.timer = setTimeout(() => void this.load(false), delay);
  }

  private stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }

  private async receive(raw: unknown): Promise<void> {
    const message = (raw && typeof raw === 'object' ? raw : {}) as Inbound;
    try {
      switch (message.type) {
        case 'ready': await this.load(!this.view); return;
        case 'refresh': await this.load(true); return;
        case 'open-tracker': { const url = safeHttpsUrl(this.view?.task.url); if (url) await vscode.env.openExternal(vscode.Uri.parse(url)); return; }
        case 'open-url': { const url = typeof message.url === 'string' ? safeHttpsUrl(message.url) : undefined; if (url) await vscode.env.openExternal(vscode.Uri.parse(url)); return; }
        case 'open-ploeg': if (typeof message.id === 'string' && /^[1-9][0-9]{0,19}$/.test(message.id)) await this.host.openPloeg(message.id); return;
        case 'handoff': { const team = teamName(message.team); if (team) await this.handoff(team); return; }
        case 'take-back': { const team = teamName(message.team); if (team) await this.takeBack(team); return; }
        case 'start-session': if (this.view) await this.host.startSession(this.source, this.view.task); await this.panel.webview.postMessage({ type: 'idle' }); return;
      }
    } catch (error) {
      await this.panel.webview.postMessage({ type: 'problem', message: error instanceof Error ? error.message : 'The action could not be completed.' });
      if (error instanceof ApiError && error.status === 401) await this.host.report(error);
    }
  }

  private async handoff(teamId: string): Promise<void> {
    const view = this.view;
    const team = view?.status.teams.find(entry => entry.id === teamId);
    if (!view || !team) { await this.panel.webview.postMessage({ type: 'problem', message: 'That team is no longer offered. Refresh the task.' }); return; }
    const tracker = providerNames[view.task.provider] ?? view.task.provider;
    const choice = await vscode.window.showInformationMessage(`Hand “${view.task.title}” to Ploeg team ${team.id}?`, { modal: true, detail: [
      `Vloer assigns “${team.assignee}” on ${tracker} ${view.task.identifier ?? `#${view.task.id}`} and adds a comment saying you handed it over.`,
      `Ploeg queues it for ${team.id}${team.roles.length ? ` (${team.roles.join(' → ')})` : ''}, works on a branch of ${view.repositoryName} and opens a pull request for your review. Nothing merges without review.`,
      `${team.queueDepth === 0 ? 'Nothing is queued ahead of it.' : `${team.queueDepth} ${team.queueDepth === 1 ? 'item is' : 'items are'} queued ahead of it.`} You can take it back until Ploeg starts.`,
    ].join('\n\n') }, `Hand to ${team.id}`);
    if (choice !== `Hand to ${team.id}`) { await this.panel.webview.postMessage({ type: 'idle' }); return; }
    const client = this.host.client();
    this.mutations++;
    try {
      const status = await client.handoff(this.source.id, view.task.id, team.id, view.task.revision);
      await this.host.rememberTeam(team.id);
      this.fastUntil = Date.now() + 90_000;
      this.view = { ...view, status, loadedAt: new Date().toISOString() };
      await this.panel.webview.postMessage({ type: 'state', view: this.view });
      for (const warning of status.warnings ?? []) void vscode.window.showWarningMessage(warning);
      this.schedule();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'task_changed') { await this.load(true, 'The task changed in the tracker since you opened it. Review this version, then hand it over again.'); return; }
      throw error;
    }
  }

  private async takeBack(teamId: string): Promise<void> {
    const view = this.view;
    if (!view) return;
    const choice = await vscode.window.showWarningMessage(`Take “${view.task.title}” back from team ${teamId}?`, { modal: true, detail: `Vloer removes ${teamId}'s assignee in the tracker and comments that you took it back. Ploeg withdraws the item while it is still queued; work that already started must be cancelled from the Ploeg view.` }, 'Take back');
    if (choice !== 'Take back') { await this.panel.webview.postMessage({ type: 'idle' }); return; }
    this.mutations++;
    const status = await this.host.client().takeBack(this.source.id, view.task.id, teamId);
    this.fastUntil = Date.now() + 30_000;
    this.view = { ...view, status, loadedAt: new Date().toISOString() };
    await this.panel.webview.postMessage({ type: 'state', view: this.view });
    for (const warning of status.warnings ?? []) void vscode.window.showWarningMessage(warning);
    this.schedule();
  }

  private html(): string {
    const webview = this.panel.webview;
    const nonce = randomBytes(24).toString('base64');
    const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.host.extensionUri, 'media', file));
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource}; connect-src 'none'; font-src ${webview.cspSource}; base-uri 'none'; form-action 'none';"><title>Linked task</title><link rel="stylesheet" href="${media('session.css')}"><link rel="stylesheet" href="${media('task.css')}"></head><body data-task-key="${this.key}"><main id="app"><div class="loading" role="status">Loading the task…</div></main><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><script nonce="${nonce}" src="${media('common.js')}"></script><script nonce="${nonce}" src="${media('task.js')}"></script></body></html>`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    for (const subscription of this.subscriptions) subscription.dispose();
    this.onDispose();
    this.panel.dispose();
  }
}

export class TaskPanels implements vscode.Disposable {
  private readonly panels = new Map<string, TaskPanel>();
  private readonly host: TaskPanelHost;
  constructor(host: TaskPanelHost) { this.host = host; }

  open(source: TaskSource, taskId: string, title: string): TaskPanel {
    const key = `${source.id}:${taskId}`;
    const existing = this.panels.get(key);
    if (existing) { existing.reveal(); return existing; }
    const panel = TaskPanel.create(this.host, source, taskId, title, () => this.panels.delete(key));
    this.panels.set(key, panel);
    return panel;
  }

  offline() { for (const panel of this.panels.values()) panel.offline(); }
  closeAll() { for (const panel of [...this.panels.values()]) panel.dispose(); }
  dispose() { this.closeAll(); }
}
