import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ApiError, type VloerClient } from './client.js';
import type { Approval, Bootstrap, CandidateFormat, Decision, Freshness, SessionDetail, SessionEvent } from './types.js';

export type PanelTab = 'brief' | 'changes' | 'checks' | 'activity' | 'gateway';
export type InstructionOutcome = { state: 'saved' | 'unknown' | 'failed'; message?: string };

export interface PanelHost {
  readonly extensionUri: vscode.Uri;
  client(): VloerClient;
  revision(): number;
  bootstrap(): Promise<Bootstrap>;
  liveUpdates(): boolean;
  lifecycle(id: string, action: 'start' | 'pause' | 'resume' | 'cancel'): Promise<void>;
  instruction(id: string, text: string, pauseFirst: boolean): Promise<InstructionOutcome>;
  decide(id: string, requestId: string, decision: Decision): Promise<void>;
  openArtifact(id: string, artifactId: string, file?: string): Promise<void>;
  downloadCandidate(id: string, format: CandidateFormat): Promise<void>;
  dashboard(id: string): Promise<void>;
  history(id: string): Promise<void>;
  sourceTask(id: string): Promise<void>;
  tracker(id: string): Promise<void>;
  copyLink(id: string): Promise<void>;
  budget(id: string, amountUsd: number): Promise<void>;
  setApproval(id: string, approval: Approval): Promise<void>;
  report(error: unknown): Promise<void>;
}

type Inbound = { type: string; [key: string]: unknown };

function text(value: unknown, max: number): string | undefined { return typeof value === 'string' && value.trim() && value.length <= max ? value : undefined; }
function identifier(value: unknown): string | undefined { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : undefined; }

export class SessionPanel implements vscode.Disposable {
  readonly id: string;
  readonly panel: vscode.WebviewPanel;
  private readonly host: PanelHost;
  private readonly onDispose: () => void;
  private events: SessionEvent[] = [];
  private busy = false;
  private queued = false;
  private disposed = false;
  private stream?: AbortController;
  private streamDelay = 1500;
  private freshness: Freshness = { transport: 'polling', observedAt: new Date().toISOString() };
  private snapshotTimer?: ReturnType<typeof setTimeout>;
  private pendingFocus?: { tab: PanelTab; requestId?: string; runId?: string };
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(host: PanelHost, id: string, panel: vscode.WebviewPanel, onDispose: () => void) {
    this.host = host; this.id = id; this.panel = panel; this.onDispose = onDispose;
    panel.webview.html = this.html();
    this.subscriptions.push(panel.onDidDispose(() => this.dispose()));
    this.subscriptions.push(panel.webview.onDidReceiveMessage(message => void this.receive(message)));
    this.subscriptions.push(panel.onDidChangeViewState(event => { if (event.webviewPanel.visible) { void this.refresh(); this.connectStream(); } else this.disconnectStream(); }));
    this.connectStream();
  }

  static create(host: PanelHost, id: string, title: string, onDispose: () => void): SessionPanel {
    const panel = vscode.window.createWebviewPanel('vloer.session', title, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(host.extensionUri, 'media')], retainContextWhenHidden: true, enableFindWidget: true });
    panel.iconPath = vscode.Uri.joinPath(host.extensionUri, 'media', 'vloer.svg');
    return new SessionPanel(host, id, panel, onDispose);
  }

  reveal() { this.panel.reveal(undefined, false); }

  focus(tab: PanelTab, requestId?: string, runId?: string) {
    this.pendingFocus = { tab, requestId, runId };
    void this.panel.webview.postMessage({ type: 'focus', tab, requestId, runId });
  }

  offline(message: string) {
    this.freshness = { transport: 'offline', observedAt: this.freshness.observedAt };
    this.disconnectStream();
    void this.panel.webview.postMessage({ type: 'connection', connected: false, message, freshness: this.freshness });
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    if (this.busy) { this.queued = true; return; }
    this.busy = true;
    const client = this.host.client();
    const revision = this.host.revision();
    try {
      const [session, events, permissions, bootstrap] = await Promise.all([client.session(this.id), client.history(this.id, this.events.at(-1)?.id || 0), client.permissions(this.id), this.host.bootstrap()]);
      if (this.disposed || client !== this.host.client() || revision !== this.host.revision()) return;
      this.merge(events);
      this.freshness = { transport: this.stream ? 'live' : this.freshness.transport === 'offline' ? 'polling' : this.freshness.transport, observedAt: new Date().toISOString() };
      const detail: SessionDetail = { session, events: this.events.slice(-300), permissions, user: bootstrap.user, mode: bootstrap.mode, origin: client.origin, freshness: this.freshness, ...(typeof bootstrap.gateway === 'string' ? { gateway: bootstrap.gateway } : {}) };
      this.panel.title = session.title;
      await this.panel.webview.postMessage({ type: 'session', detail, focus: this.pendingFocus });
      this.pendingFocus = undefined;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 0)) this.offline(error.status === 401 ? 'Session expired. Use Vloer: Connect to sign in.' : 'Connection lost. Remote work keeps its last server state.');
      else await this.host.report(error);
    } finally {
      this.busy = false;
      if (this.queued) { this.queued = false; void this.refresh(); }
    }
  }

  private merge(events: SessionEvent[]) {
    if (!events.length) return;
    const merged = new Map(this.events.map(event => [event.id, event]));
    for (const event of events) merged.set(event.id, event);
    this.events = [...merged.values()].sort((a, b) => a.id - b.id).slice(-2000);
  }

  private scheduleSnapshot() {
    if (this.snapshotTimer) return;
    this.snapshotTimer = setTimeout(() => { this.snapshotTimer = undefined; void this.refresh(); }, 250);
  }

  private connectStream() {
    if (this.disposed || this.stream || !this.panel.visible || !this.host.liveUpdates()) return;
    const controller = new AbortController();
    this.stream = controller;
    const client = this.host.client();
    const revision = this.host.revision();
    void client.stream(this.id, this.events.at(-1)?.id || 0, {
      onOpen: () => { this.streamDelay = 1500; this.freshness = { ...this.freshness, transport: 'live' }; },
      onEvent: event => { this.merge([event]); this.scheduleSnapshot(); },
    }, controller.signal).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { this.stream = undefined; this.offline('Session expired. Use Vloer: Connect to sign in.'); return; }
    }).finally(() => {
      if (this.stream !== controller) return;
      this.stream = undefined;
      if (this.disposed || controller.signal.aborted || client !== this.host.client() || revision !== this.host.revision()) return;
      this.freshness = { ...this.freshness, transport: this.freshness.transport === 'offline' ? 'offline' : 'polling' };
      const delay = this.streamDelay;
      this.streamDelay = Math.min(30_000, this.streamDelay * 2);
      setTimeout(() => this.connectStream(), delay);
    });
  }

  private disconnectStream() {
    this.stream?.abort();
    this.stream = undefined;
  }

  private async receive(message: Inbound): Promise<void> {
    if (this.disposed || !message || typeof message.type !== 'string') return;
    try {
      switch (message.type) {
        case 'ready': case 'refresh': await this.refresh(); this.connectStream(); return;
        case 'dashboard': await this.host.dashboard(this.id); return;
        case 'history': await this.host.history(this.id); return;
        case 'source-task': await this.host.sourceTask(this.id); return;
        case 'tracker': await this.host.tracker(this.id); return;
        case 'copy-link': await this.host.copyLink(this.id); return;
        case 'download-candidate': if (['bundle', 'patch', 'manifest'].includes(String(message.format))) await this.host.downloadCandidate(this.id, message.format as CandidateFormat); return;
        case 'artifact': { const id = identifier(message.id); if (id) await this.host.openArtifact(this.id, id, text(message.file, 500)); return; }
        case 'decide': {
          const id = identifier(message.id);
          const decision = ['once', 'always', 'reject'].includes(String(message.decision)) ? message.decision as Decision['decision'] : undefined;
          if (id && decision) await this.host.decide(this.id, id, { decision });
          return;
        }
        case 'answer': {
          const id = identifier(message.id);
          const answers = Array.isArray(message.answers) && message.answers.length <= 20 && message.answers.every(group => Array.isArray(group) && group.length <= 20 && group.every(value => typeof value === 'string' && value.length <= 4000)) ? message.answers as string[][] : undefined;
          if (id && answers) await this.host.decide(this.id, id, { answers });
          return;
        }
        case 'instruction': {
          const value = text(message.text, 16000);
          if (!value) return;
          const outcome = await this.host.instruction(this.id, value, message.pauseFirst === true);
          await this.panel.webview.postMessage({ type: 'instruction', ...outcome });
          return;
        }
        case 'budget': { if (typeof message.amountUsd === 'number') await this.host.budget(this.id, message.amountUsd); return; }
        case 'approval': { if (message.approval === 'auto' || message.approval === 'manual') await this.host.setApproval(this.id, message.approval); return; }
        case 'start': case 'pause': case 'resume': case 'cancel': await this.host.lifecycle(this.id, message.type); return;
      }
    } catch (error) {
      if (message.type === 'instruction') await this.panel.webview.postMessage({ type: 'instruction', state: 'failed', message: error instanceof Error ? error.message : 'The instruction could not be saved.' });
      await this.host.report(error);
    } finally {
      if (!this.disposed) await this.panel.webview.postMessage({ type: 'idle' });
    }
  }

  private html(): string {
    const webview = this.panel.webview;
    const nonce = randomBytes(24).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.host.extensionUri, 'media', 'session.css'));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.host.extensionUri, 'media', 'session.js'));
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource}; connect-src 'none'; font-src ${webview.cspSource}; base-uri 'none'; form-action 'none';"><title>De Vloer remote session</title><link rel="stylesheet" href="${css}"></head><body data-session-id="${this.id}"><main id="app"><div class="loading" role="status">Connecting to your remote session…</div></main><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disconnectStream();
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    for (const subscription of this.subscriptions) subscription.dispose();
    this.onDispose();
    this.panel.dispose();
  }
}

export class SessionPanels implements vscode.Disposable {
  private readonly panels = new Map<string, SessionPanel>();
  private readonly host: PanelHost;
  constructor(host: PanelHost) { this.host = host; }

  get(id: string): SessionPanel | undefined { return this.panels.get(id); }
  get visible(): boolean { return [...this.panels.values()].some(panel => panel.panel.visible); }

  open(id: string, title: string): SessionPanel {
    const existing = this.panels.get(id);
    if (existing) { existing.reveal(); void existing.refresh(); return existing; }
    const panel = SessionPanel.create(this.host, id, title, () => this.panels.delete(id));
    this.panels.set(id, panel);
    void panel.refresh();
    return panel;
  }

  adopt(id: string, webviewPanel: vscode.WebviewPanel): SessionPanel {
    this.panels.get(id)?.dispose();
    const panel = new SessionPanel(this.host, id, webviewPanel, () => this.panels.delete(id));
    this.panels.set(id, panel);
    void panel.refresh();
    return panel;
  }

  async refreshVisible(): Promise<void> { for (const panel of this.panels.values()) if (panel.panel.visible) await panel.refresh(); }
  offline(message: string) { for (const panel of this.panels.values()) panel.offline(message); }
  closeAll() { for (const panel of [...this.panels.values()]) panel.dispose(); this.panels.clear(); }
  dispose() { this.closeAll(); }
}
