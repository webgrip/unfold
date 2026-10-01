import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ApiError, type VloerClient } from './client.js';
import { providerNames, safeHttpsUrl } from './status.js';
import { awaitingPloeg, currentWorkItemId, ploegFacts, sessionEligibility, unsupportedStatus, workItemMoving } from './task-view.js';
import type { PloegCard, PloegDetail } from './ploeg-types.js';
import type { Bootstrap, TaskPloegStatus, TaskPreview, TaskSnapshot, TaskSource } from './types.js';

export interface TaskPanelHost {
  readonly extensionUri: vscode.Uri;
  client(): VloerClient;
  revision(): number;
  bootstrap(): Promise<Bootstrap>;
  startSession(source: TaskSource, task: TaskSnapshot): Promise<void>;
  openPloeg(id: string): Promise<void>;
  checkoutBranch(id: string): Promise<void>;
  lastTeam(): string | undefined;
  rememberTeam(team: string): Promise<void>;
  report(error: unknown): Promise<void>;
}

/** The state a task panel posts to its webview: the tracker task, its Ploeg status and, once Ploeg has a Work Item, its detail and Run card. */
export type TaskView = {
  kind: 'task'; task: TaskPreview; source: { id: string; name: string; provider: string; handoff: boolean; executionOwner: string };
  repositoryName: string; status: TaskPloegStatus; session: { allowed: boolean; reason?: string }; host: string; loadedAt: string; preferredTeam?: string;
  workItemId?: string; detail?: PloegDetail; card?: PloegCard; ploegProblem?: string;
};

/** The state a Work Item panel posts to its webview: a Ploeg Work Item without a tracker task the workbench knows. */
export type WorkItemView = { kind: 'work'; workItemId: string; detail: PloegDetail; card?: PloegCard; host: string; loadedAt: string };

type PanelTarget = { kind: 'task'; source: TaskSource; taskId: string } | { kind: 'work'; workItemId: string };

type Inbound = { type?: unknown; id?: unknown; team?: unknown; url?: unknown };

const teamName = (value: unknown): string | undefined => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;
const workItemPattern = /^[1-9][0-9]{0,19}$/;
const reason = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export class TaskPanel implements vscode.Disposable {
  readonly key: string;
  readonly panel: vscode.WebviewPanel;
  private readonly host: TaskPanelHost;
  private readonly target: PanelTarget;
  private readonly onDispose: () => void;
  private view?: TaskView | WorkItemView;
  private timer?: ReturnType<typeof setTimeout>;
  private fastUntil = 0;
  private loading = false;
  private pending?: { reloadTask: boolean; problem: string };
  private mutations = 0;
  private disposed = false;
  private readonly subscriptions: vscode.Disposable[] = [];

  private constructor(host: TaskPanelHost, target: PanelTarget, panel: vscode.WebviewPanel, onDispose: () => void) {
    this.host = host; this.target = target; this.panel = panel; this.onDispose = onDispose;
    this.key = target.kind === 'task' ? `${target.source.id}:${target.taskId}` : `work:${target.workItemId}`;
    panel.webview.html = this.html();
    this.subscriptions.push(panel.onDidDispose(() => this.dispose()));
    this.subscriptions.push(panel.webview.onDidReceiveMessage(message => void this.receive(message)));
    this.subscriptions.push(panel.onDidChangeViewState(event => { if (event.webviewPanel.visible) void this.load(false); else this.stop(); }));
  }

  /** Opens a panel for a tracker task. */
  static create(host: TaskPanelHost, source: TaskSource, taskId: string, title: string, onDispose: () => void): TaskPanel {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(taskId) || !/^[a-z0-9-]{1,64}$/.test(source.id)) throw new Error('Invalid linked task identifier.');
    return new TaskPanel(host, { kind: 'task', source, taskId }, TaskPanel.webviewPanel(host, title), onDispose);
  }

  /** Opens a panel for a Ploeg Work Item that has no tracker task the workbench knows. */
  static createWorkItem(host: TaskPanelHost, workItemId: string, title: string, onDispose: () => void): TaskPanel {
    if (!workItemPattern.test(workItemId)) throw new Error('Invalid Work Item identifier.');
    return new TaskPanel(host, { kind: 'work', workItemId }, TaskPanel.webviewPanel(host, title), onDispose);
  }

  private static webviewPanel(host: TaskPanelHost, title: string): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel('vloer.task', title, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(host.extensionUri, 'media')], retainContextWhenHidden: true, enableFindWidget: true });
    panel.iconPath = vscode.Uri.joinPath(host.extensionUri, 'media', 'vloer.svg');
    return panel;
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
      const view = this.target.kind === 'task' ? await this.loadTask(client, this.target.source, this.target.taskId, reloadTask) : await this.loadWorkItem(client, this.target.workItemId, reloadTask);
      if (this.disposed || client !== this.host.client() || revision !== this.host.revision() || mutations !== this.mutations) return;
      this.view = view;
      this.panel.title = view.kind === 'task' ? view.task.title : view.detail.item.title || `Work Item ${view.workItemId}`;
      await this.panel.webview.postMessage({ type: 'state', view: this.view, problem });
    } catch (error) {
      await this.panel.webview.postMessage({ type: 'problem', message: reason(error, this.target.kind === 'task' ? 'The task could not be loaded.' : 'The Work Item could not be loaded.') });
    } finally {
      this.loading = false;
      const next = this.pending;
      this.pending = undefined;
      if (next && !this.disposed) void this.load(next.reloadTask, next.problem); else this.schedule();
    }
  }

  private async loadTask(client: VloerClient, source: TaskSource, taskId: string, reloadTask: boolean): Promise<TaskView> {
    const bootstrap = await this.host.bootstrap();
    const previous = this.view?.kind === 'task' ? this.view : undefined;
    const task = reloadTask || !previous ? await client.task(source.id, taskId, true) : previous.task;
    const known = previous?.workItemId ?? (task.ploeg?.workItemId && workItemPattern.test(task.ploeg.workItemId) ? task.ploeg.workItemId : undefined);
    const early = known ? ploegFacts(client, known, reloadTask) : undefined;
    const status = await this.status(client, source, task, reloadTask);
    const workItemId = currentWorkItemId(status);
    const facts = !workItemId ? {} : workItemId === known && early ? await early : await ploegFacts(client, workItemId, reloadTask);
    const repository = bootstrap.repositories.find(item => item.id === task.repositoryId);
    return {
      kind: 'task', task, status, host: new URL(client.origin).host, loadedAt: new Date().toISOString(),
      source: { id: source.id, name: source.name, provider: source.provider, handoff: Boolean(source.handoff), executionOwner: source.executionOwner },
      repositoryName: repository?.name ?? task.repositoryId, session: sessionEligibility(bootstrap, source, task), preferredTeam: this.host.lastTeam(),
      ...(workItemId ? { workItemId } : {}), ...(facts.detail ? { detail: facts.detail } : {}), ...(facts.card ? { card: facts.card } : {}), ...(facts.problem ? { ploegProblem: facts.problem } : {}),
    };
  }

  private async loadWorkItem(client: VloerClient, workItemId: string, fresh: boolean): Promise<WorkItemView> {
    const [detail, card] = await Promise.allSettled([client.workItem(workItemId, fresh), client.workItemCard(workItemId)]);
    if (detail.status === 'rejected') throw detail.reason;
    return { kind: 'work', workItemId, detail: detail.value, ...(card.status === 'fulfilled' && card.value && String(card.value.workItemId) === workItemId ? { card: card.value } : {}), host: new URL(client.origin).host, loadedAt: new Date().toISOString() };
  }

  private async status(client: VloerClient, source: TaskSource, task: TaskSnapshot, fresh: boolean): Promise<TaskPloegStatus> {
    if (task.provider === 'demo') return unsupportedStatus('Demo fixture tasks are not linked to Ploeg. No model calls or spend.');
    try { return await client.taskPloeg(source.id, task.id, fresh); }
    catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405) && ['not_found', 'request_failed', 'invalid_response'].includes(error.code)) return unsupportedStatus();
      if (error instanceof ApiError && error.status === 401) throw error;
      return unsupportedStatus(`Ploeg status could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private schedule() {
    this.stop();
    if (this.disposed || !this.panel.visible) return;
    const view = this.view;
    const moving = workItemMoving(view?.detail?.item.state);
    const delay = Date.now() >= this.fastUntil ? moving ? 6000 : 15000 : view?.kind === 'task' && awaitingPloeg(view.status) ? 3000 : 6000;
    this.timer = setTimeout(() => void this.load(false), delay);
  }

  private stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }

  private async receive(raw: unknown): Promise<void> {
    const message = (raw && typeof raw === 'object' ? raw : {}) as Inbound;
    try {
      switch (message.type) {
        case 'ready': await this.load(!this.view); return;
        case 'refresh': await this.load(true); return;
        case 'open-tracker': { const url = safeHttpsUrl(this.view?.kind === 'task' ? this.view.task.url : this.view?.detail.item.url); if (url) await vscode.env.openExternal(vscode.Uri.parse(url)); return; }
        case 'open-url': { const url = typeof message.url === 'string' ? safeHttpsUrl(message.url) : undefined; if (url) await vscode.env.openExternal(vscode.Uri.parse(url)); return; }
        case 'checkout': { const id = this.view?.kind === 'work' ? this.view.workItemId : this.view?.workItemId; if (id) await this.host.checkoutBranch(id); await this.panel.webview.postMessage({ type: 'idle' }); return; }
        case 'open-ploeg': if (typeof message.id === 'string' && workItemPattern.test(message.id)) await this.host.openPloeg(message.id); return;
        case 'handoff': { const team = teamName(message.team); if (team) await this.handoff(team); return; }
        case 'take-back': { const team = teamName(message.team); if (team) await this.takeBack(team); return; }
        case 'start-session': if (this.target.kind === 'task' && this.view?.kind === 'task') await this.host.startSession(this.target.source, this.view.task); await this.panel.webview.postMessage({ type: 'idle' }); return;
      }
    } catch (error) {
      await this.panel.webview.postMessage({ type: 'problem', message: error instanceof Error ? error.message : 'The action could not be completed.' });
      if (error instanceof ApiError && error.status === 401) await this.host.report(error);
    }
  }

  private async handoff(teamId: string): Promise<void> {
    const view = this.view?.kind === 'task' ? this.view : undefined;
    const team = view?.status.teams.find(entry => entry.id === teamId);
    if (this.target.kind !== 'task' || !view || !team) { await this.panel.webview.postMessage({ type: 'problem', message: 'That team is no longer offered. Refresh the task.' }); return; }
    const tracker = providerNames[view.task.provider] ?? view.task.provider;
    const choice = await vscode.window.showInformationMessage(`Hand “${view.task.title}” to Ploeg team ${team.id}?`, { modal: true, detail: [
      `Vloer assigns “${team.assignee}” on ${tracker} ${view.task.identifier ?? `#${view.task.id}`} and adds a comment saying you handed it over.`,
      `Ploeg queues it for ${team.id}${team.roles.filter(Boolean).length ? ` (${team.roles.filter(Boolean).join(' → ')})` : ''}, works on a branch of ${view.repositoryName} and opens a pull request for your review. Nothing merges without review.`,
      `${team.queueDepth === 0 ? 'Nothing is queued ahead of it.' : `${team.queueDepth} ${team.queueDepth === 1 ? 'item is' : 'items are'} queued ahead of it.`} You can take it back until Ploeg starts.`,
    ].join('\n\n') }, `Hand to ${team.id}`);
    if (choice !== `Hand to ${team.id}`) { await this.panel.webview.postMessage({ type: 'idle' }); return; }
    const client = this.host.client();
    this.mutations++;
    try {
      const status = await client.handoff(this.target.source.id, view.task.id, team.id, view.task.revision);
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
    const view = this.view?.kind === 'task' ? this.view : undefined;
    if (this.target.kind !== 'task' || !view) return;
    const choice = await vscode.window.showWarningMessage(`Take “${view.task.title}” back from team ${teamId}?`, { modal: true, detail: `Vloer removes ${teamId}'s assignee in the tracker and comments that you took it back. Ploeg withdraws the item while it is still queued; work that already started must be cancelled from the Ploeg view.` }, 'Take back');
    if (choice !== 'Take back') { await this.panel.webview.postMessage({ type: 'idle' }); return; }
    this.mutations++;
    const status = await this.host.client().takeBack(this.target.source.id, view.task.id, teamId);
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
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource}; connect-src 'none'; font-src ${webview.cspSource}; base-uri 'none'; form-action 'none';"><title>${this.target.kind === 'task' ? 'Linked task' : 'Work Item'}</title><link rel="stylesheet" href="${media('tokens.css')}"><link rel="stylesheet" href="${media('session.css')}"><link rel="stylesheet" href="${media('task.css')}"></head><body data-task-key="${this.key}"><main id="app"><div class="loading" role="status">Loading…</div></main><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><script nonce="${nonce}" src="${media('common.js')}"></script><script type="module" nonce="${nonce}" src="${media('task.js')}"></script></body></html>`;
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

  /** Opens, or reveals, the panel of a Ploeg Work Item without a tracker task: header, state, pull requests, Runs and brief, without the hand-off. */
  openWorkItem(workItemId: string, title: string): TaskPanel {
    if (!workItemPattern.test(workItemId)) throw new Error('Invalid Work Item identifier.');
    const key = `work:${workItemId}`;
    const existing = this.panels.get(key);
    if (existing) { existing.reveal(); return existing; }
    const panel = TaskPanel.createWorkItem(this.host, workItemId, title, () => this.panels.delete(key));
    this.panels.set(key, panel);
    return panel;
  }

  offline() { for (const panel of this.panels.values()) panel.offline(); }
  closeAll() { for (const panel of [...this.panels.values()]) panel.dispose(); }
  dispose() { this.closeAll(); }
}
