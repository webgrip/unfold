import { randomUUID } from 'node:crypto';
import { EngineError, type Provisioning } from './engine.ts';
import { executionFailure, type FailureCategory } from './failures.ts';
import type { StatusNote, Store } from './store.ts';
import type { AppConfig, User } from './types.ts';

export type CheckState = 'ok' | 'degraded' | 'down' | 'idle' | 'not_used';
export type StatusCheck = { id: 'workspaces' | 'gateway' | 'ploeg'; title: string; state: CheckState; summary: string; checkedAt: string; detail?: string };
export type WaitingSession = { sessionId?: string; title?: string; own: boolean; phase: Provisioning['phase']; since: string; reason?: string };
export type FailureCause = { category: FailureCategory; message: string; count: number; lastAt: string; sessions: { id: string; title: string }[] };
/** What the Status page shows: whether sessions can start now, what waits, what failed recently and what administrators wrote. */
export type StatusReport = {
  generatedAt: string;
  overall: 'operational' | 'degraded' | 'down';
  checks: StatusCheck[];
  startLimitSeconds?: number;
  waiting: WaitingSession[];
  failures: { since: string; total: number; causes: FailureCause[] };
  notes: StatusNote[];
};
export type PloegProbe = 'ok' | 'unconfigured' | 'down';
export type StatusProbes = { gateway(): Promise<boolean>; ploeg(user: User): Promise<PloegProbe>; cards?(): string | null };

const hour = 3_600_000;
export const failureWindowMs = 24 * hour;
export const capacityMemoryMs = hour / 2;
export const resolvedNoteWindowMs = 7 * 24 * hour;
const probeCacheMs = 15_000;
const noteSeverities = new Set<StatusNote['severity']>(['info', 'degraded', 'outage']);
const notPlatformFailures = new Set<FailureCategory>(['cancelled', 'review_incomplete']);
/** Causes that describe the workbench rather than one session's work, counted for everyone on the Status page. */
export const workbenchCauses: ReadonlySet<FailureCategory> = new Set<FailureCategory>(['capacity', 'timeout', 'connectivity', 'missing_executable', 'gateway_rejected', 'workspace_setup']);
const rank: Record<CheckState, number> = { not_used: 0, idle: 0, ok: 0, degraded: 1, down: 2 };

function ago(from: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(from)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** Probes the model gateway's unauthenticated liveness route. */
export function gatewayProbe(config: AppConfig, fetcher: typeof fetch = fetch): () => Promise<boolean> {
  return async () => {
    if (!config.litellm) return false;
    try {
      const response = await fetcher(`${config.litellm.adminUrl.replace(/\/$/, '')}/health/liveliness`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      return response.ok;
    } catch { return false; }
  };
}

export class StatusBoard {
  readonly config: AppConfig;
  readonly store: Store;
  readonly provisioning: () => Provisioning[];
  readonly probes: StatusProbes;
  private gatewayCache?: { at: number; up: boolean };
  private ploegCache?: { at: number; probe: PloegProbe };

  constructor(config: AppConfig, store: Store, provisioning: () => Provisioning[], probes: StatusProbes) {
    this.config = config; this.store = store; this.provisioning = provisioning; this.probes = probes;
  }

  async report(user: User, now = new Date()): Promise<StatusReport> {
    const admin = user.role === 'admin';
    const sessions = this.store.listSessions();
    const titles = new Map(sessions.map(session => [session.id, { title: session.title, owner: session.ownerId }]));
    const visible = (id: string) => admin || titles.get(id)?.owner === user.id;
    const waits = this.provisioning();
    const since = new Date(now.getTime() - failureWindowMs).toISOString();
    const failed = sessions.filter(session => session.status === 'failed' && session.failure && !notPlatformFailures.has(session.failure.category) && session.updatedAt >= since && (visible(session.id) || workbenchCauses.has(session.failure.category)));
    const [gateway, ploeg] = await Promise.all([this.gatewayCheck(admin), this.ploegCheck(user)]);
    const checks = [ploeg, gateway, this.workspaceCheck(waits, failed, admin, now)];
    const backend = this.config.runtime.backend;
    const startLimitMs = backend === 'kubernetes' ? this.config.kubernetes?.provisionTimeoutMs ?? 180_000 : backend === 'docker' ? this.config.docker?.provisionTimeoutMs ?? 180_000 : undefined;
    const notes = this.store.statusNotes(new Date(now.getTime() - resolvedNoteWindowMs).toISOString());
    const noted = notes.filter(note => !note.resolvedAt).reduce((worst, note) => Math.max(worst, note.severity === 'outage' ? 2 : note.severity === 'degraded' ? 1 : 0), 0);
    const worst = Math.max(noted, ...checks.map(check => rank[check.state]));
    const causes = new Map<FailureCategory, FailureCause>();
    for (const session of failed) {
      const category = session.failure!.category;
      const cause = causes.get(category) ?? { category, message: executionFailure(category, session.failure!.stage, session.failure!.promptAcceptance).message, count: 0, lastAt: session.updatedAt, sessions: [] };
      cause.count += 1;
      if (session.updatedAt > cause.lastAt) cause.lastAt = session.updatedAt;
      if (visible(session.id)) cause.sessions.push({ id: session.id, title: session.title });
      causes.set(category, cause);
    }
    return {
      generatedAt: now.toISOString(),
      overall: worst === 2 ? 'down' : worst === 1 ? 'degraded' : 'operational',
      checks,
      ...(this.config.mode !== 'demo' && startLimitMs ? { startLimitSeconds: Math.round(startLimitMs / 1000) } : {}),
      waiting: waits.map(wait => visible(wait.sessionId)
        ? { sessionId: wait.sessionId, title: titles.get(wait.sessionId)?.title, own: titles.get(wait.sessionId)?.owner === user.id, phase: wait.phase, since: wait.since, ...(admin && wait.reason ? { reason: wait.reason } : {}) }
        : { own: false, phase: wait.phase, since: wait.since }),
      failures: { since, total: failed.length, causes: [...causes.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)) },
      notes,
    };
  }

  private workspaceCheck(waits: Provisioning[], failed: { updatedAt: string; failure?: { category: FailureCategory; detail?: string } }[], admin: boolean, now: Date): StatusCheck {
    const base = { id: 'workspaces' as const, title: 'Starting workspaces', checkedAt: now.toISOString() };
    if (this.config.mode === 'demo') return { ...base, state: 'not_used', summary: 'The demo prepares its repository fixture on this machine.' };
    const full = waits.filter(wait => wait.phase === 'capacity');
    if (full.length) return { ...base, state: 'down', summary: `Every machine is busy. ${full.length === 1 ? 'A workspace has' : `${full.length} workspaces have`} been waiting since ${ago(full.map(wait => wait.since).sort()[0], now)}.`, ...(admin && full[0].reason ? { detail: full[0].reason } : {}) };
    const image = waits.find(wait => wait.phase === 'image_unavailable');
    if (image) return { ...base, state: 'down', summary: 'The workspace image cannot be downloaded, so new workspaces cannot start.', ...(admin && image.reason ? { detail: image.reason } : {}) };
    const ready = this.store.lastEventAt('workspace.ready');
    const recentCapacity = failed.filter(session => session.failure?.category === 'capacity' && now.getTime() - Date.parse(session.updatedAt) < capacityMemoryMs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (recentCapacity && (!ready || ready < recentCapacity.updatedAt)) return { ...base, state: 'degraded', summary: `A workspace found no free machine ${ago(recentCapacity.updatedAt, now)}, and none has started since.`, ...(admin && recentCapacity.failure?.detail ? { detail: recentCapacity.failure.detail } : {}) };
    if (ready && now.getTime() - Date.parse(ready) < failureWindowMs) return { ...base, state: 'ok', summary: `The last workspace started ${ago(ready, now)}.` };
    return { ...base, state: 'idle', summary: 'No workspace started in the last 24 hours, so there is nothing recent to go on.' };
  }

  private async gatewayCheck(admin: boolean): Promise<StatusCheck> {
    const base = { id: 'gateway' as const, title: 'Model gateway', checkedAt: new Date().toISOString() };
    if (this.config.mode === 'demo') return { ...base, state: 'not_used', summary: 'The demo makes no model calls.' };
    if (!this.config.litellm) return { ...base, state: 'down', summary: 'No model gateway is configured, so sessions cannot call a model.' };
    if (!this.gatewayCache || Date.now() - this.gatewayCache.at > probeCacheMs) this.gatewayCache = { at: Date.now(), up: await this.probes.gateway() };
    base.checkedAt = new Date(this.gatewayCache.at).toISOString();
    const host = admin ? { detail: `LiteLLM at ${new URL(this.config.litellm.adminUrl).host}` } : {};
    return this.gatewayCache.up
      ? { ...base, state: 'ok', summary: 'The gateway answered.', ...host }
      : { ...base, state: 'down', summary: 'The gateway did not answer. Sessions cannot call a model until it is back.', ...host };
  }

  private async ploegCheck(user: User): Promise<StatusCheck> {
    const base = { id: 'ploeg' as const, title: 'Ploeg', checkedAt: new Date().toISOString() };
    if (this.config.mode === 'demo' && (!this.config.ploeg || this.config.ploeg.demo === true)) return { ...base, state: 'not_used', summary: 'Ploeg shows illustrative demo data. Nothing is dispatched and no model is called.' };
    if (!this.ploegCache || Date.now() - this.ploegCache.at > probeCacheMs) this.ploegCache = { at: Date.now(), probe: await this.probes.ploeg(user).catch((): PloegProbe => 'down') };
    const probe = this.ploegCache.probe;
    base.checkedAt = new Date(this.ploegCache.at).toISOString();
    if (probe === 'unconfigured') return { ...base, state: 'not_used', summary: 'This workbench is not connected to Ploeg.' };
    const cards = this.probes.cards?.() ?? null;
    const detail = cards ? { detail: `Run cards: ${cards}` } : {};
    return probe === 'ok'
      ? { ...base, state: 'ok', summary: 'Ploeg answered. Work Items and Runs are up to date.', ...detail }
      : { ...base, state: 'down', summary: 'Ploeg did not answer. Work it dispatches waits, and pages show the last data they read.', ...detail };
  }

  addNote(user: User, input: { severity?: unknown; text?: unknown }): StatusNote {
    if (user.role !== 'admin') throw new EngineError(403, 'forbidden', 'Only administrators post status notes.');
    const severity = input.severity as StatusNote['severity'];
    if (!noteSeverities.has(severity)) throw new EngineError(400, 'severity', 'Choose info, degraded or outage.');
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text || text.length > 500) throw new EngineError(400, 'text', 'Write the note in 1 to 500 characters.');
    const note: StatusNote = { id: randomUUID(), severity, text, author: user.name, createdAt: new Date().toISOString() };
    this.store.addStatusNote(note);
    return note;
  }

  resolveNote(user: User, id: string): StatusNote {
    if (user.role !== 'admin') throw new EngineError(403, 'forbidden', 'Only administrators resolve status notes.');
    const note = this.store.resolveStatusNote(id, user.name, new Date().toISOString());
    if (!note) throw new EngineError(404, 'not_found', 'This status note does not exist.');
    return note;
  }
}
