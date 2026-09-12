import { randomUUID } from 'node:crypto';
import type { AppConfig, Credential, ExecutionBinding, Session, User } from './types.ts';
import type { Store } from './store.ts';
import { PloegError } from './ploeg.ts';

type Command = { commandId: string; action: string; expectedRevision: number; generation: number; state?: string; text?: string; stopConfirmed?: boolean; authenticatedBy?: string };
const states = ['admitted', 'running', 'waiting_input', 'pause_requested', 'paused', 'cancel_requested', 'cancelled', 'completed', 'failed', 'interrupted'];
const unavailable = () => new PloegError(503, 'execution_unconfirmed', 'Ploeg could not confirm this operation. Execution remains fenced; reconnect and reconcile before continuing.');

export class ExecutionAuthority {
  private queues = new Map<string, Promise<unknown>>();
  private store: Store;
  private config: AppConfig;
  constructor(store: Store, config: AppConfig) {
    this.store = store;
    this.config = config;
    if (!config.ploeg?.url || config.ploeg.demo || !config.ploeg.tokenEnv || !config.execution) throw unavailable();
  }

  current(id: string): ExecutionBinding | undefined { return this.store.getSecret<ExecutionBinding>(`authority:${id}`); }

  authorize(user: User): void {
    const team = this.config.execution!.team;
    if (user.role === 'viewer' || (this.config.ploeg!.teams && !this.config.ploeg!.teams.includes(team)) || (user.role !== 'admin' && !this.config.ploeg!.userTeams?.[user.id]?.includes(team))) throw new PloegError(403, 'execution_scope', 'Your account is not authorized to execute work for this Ploeg team.');
  }

  private async request(session: Session, path: string, body?: unknown, actingUser = session.ownerId): Promise<Record<string, any>> {
    const token = process.env[this.config.ploeg!.tokenEnv!];
    if (!token || token.length < 32 || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw unavailable();
    try {
      const response = await fetch(`${this.config.ploeg!.url}/api/v1/operator/executions${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'X-Ploeg-Actor': session.ownerId, 'X-Ploeg-Acting-User': actingUser, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.endsWith('/credential') ? 30000 : 5000), redirect: 'manual' });
      if (!response.ok) { await response.body?.cancel(); throw new PloegError(response.status === 409 ? 409 : 503, 'execution_unconfirmed', response.status === 409 ? 'Ploeg rejected a stale or incompatible operation. Reconcile this execution before continuing.' : 'Ploeg could not confirm this operation. No replacement execution was started.'); }
      if (!response.body || !(response.headers.get('content-type') ?? '').includes('application/json')) throw unavailable();
      const chunks: Uint8Array[] = []; let size = 0;
      const reader = response.body.getReader();
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 262144) throw unavailable(); chunks.push(part.value); } } finally { await reader.cancel().catch(() => undefined); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!data || data.schemaVersion !== '1.0') throw unavailable();
      return data;
    } catch (error) { if (error instanceof PloegError) throw error; throw unavailable(); }
  }

  private bind(session: Session, value: any): ExecutionBinding {
    if (!value || !/^[a-f0-9]{32}$/.test(value.id) || !/^[1-9][0-9]{0,19}$/.test(value.workItemId) || value.sessionId !== session.id || value.actor !== session.ownerId || value.team !== this.config.execution!.team || value.demo !== (session.runtime === 'demo') || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isSafeInteger(value.generation) || value.generation < 1 || !states.includes(value.state) || !['human', 'background'].includes(value.supervision) || typeof value.stopConfirmed !== 'boolean' || !Number.isFinite(Date.parse(value.expiresAt))) throw unavailable();
    const binding: ExecutionBinding = { id: value.id, workItemId: value.workItemId, team: value.team, state: value.state, revision: value.revision, generation: value.generation, supervision: value.supervision, expiresAt: value.expiresAt, stopConfirmed: value.stopConfirmed };
    const prior = this.current(session.id);
    if (prior && prior.id !== binding.id || session.sourceTask?.ploeg && session.sourceTask.ploeg.workItemId !== binding.workItemId) throw unavailable();
    if (prior && prior.revision > binding.revision) return prior;
    this.store.transaction(() => {
      this.store.setSecret(`authority:${session.id}`, binding);
      const latest = this.store.getSession(session.id)!;
      latest.execution = binding;
      this.store.saveSession(latest);
      if (!prior || prior.state !== binding.state || prior.supervision !== binding.supervision || prior.generation !== binding.generation) this.store.appendEvent(session.id, 'execution.authority', 'ploeg', binding);
    });
    return binding;
  }

  private serial<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(id, next);
    void next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id); }).catch(() => undefined);
    return next;
  }

  private async accepted(session: Session, value: unknown): Promise<ExecutionBinding> {
    const binding = this.bind(session, value);
    if ((value as { revision: number }).revision < binding.revision) return this.bind(session, (await this.request(session, `/${binding.id}`)).execution);
    return binding;
  }

  async admit(session: Session): Promise<void> {
    await this.serial(session.id, async () => {
      if (this.current(session.id)) return;
      const repository = this.config.repositories.find(item => item.id === session.repositoryId)!;
      const payload = this.store.getSecret<Record<string, unknown>>(`admission:${session.id}`) ?? { sessionId: session.id, team: this.config.execution!.team, title: session.title, objective: session.objective, repositoryId: repository.id, repositoryUrl: repository.url, baseBranch: repository.baseBranch, crewId: session.crewId, budgetUsd: session.budgetUsd, demo: session.runtime === 'demo', ...(session.sourceTask?.ploeg ? { source: session.sourceTask.ploeg } : {}) };
      this.store.setSecret(`admission:${session.id}`, payload);
      const data = await this.request(session, '', payload);
      this.bind(session, data.execution);
    });
  }

  async command(session: Session, action: string, detail: Pick<Command, 'state' | 'text' | 'stopConfirmed'> = {}, actingUser = session.ownerId): Promise<ExecutionBinding> {
    return this.serial(session.id, async () => {
      let binding = this.current(session.id);
      if (!binding) throw unavailable();
      const pendingKey = `command:${session.id}`;
      const pending = this.store.getSecret<Command>(pendingKey);
      if (pending) {
        try { binding = await this.accepted(session, (await this.request(session, `/${binding.id}/commands`, pending, pending.authenticatedBy)).execution); }
        catch (error) { if (error instanceof PloegError && error.status === 409) this.store.deleteSecret(pendingKey); throw error; }
        this.store.deleteSecret(pendingKey);
        if (pending.action === action && pending.state === detail.state && pending.text === detail.text && Boolean(pending.stopConfirmed) === Boolean(detail.stopConfirmed)) return binding;
      }
      const command: Command = { commandId: randomUUID(), action, expectedRevision: binding.revision, generation: binding.generation, authenticatedBy: actingUser, ...detail };
      this.store.setSecret(pendingKey, command);
      try { binding = await this.accepted(session, (await this.request(session, `/${binding.id}/commands`, command, actingUser)).execution); }
      catch (error) { if (error instanceof PloegError && error.status === 409) this.store.deleteSecret(pendingKey); throw error; }
      this.store.deleteSecret(pendingKey);
      return binding;
    });
  }

  async refresh(session: Session): Promise<ExecutionBinding> {
    return this.serial(session.id, async () => {
      const current = this.current(session.id);
      if (!current) throw unavailable();
      return this.bind(session, (await this.request(session, `/${current.id}`)).execution);
    });
  }

  async verify(session: Session, generation = session.execution?.generation): Promise<void> {
    const binding = await this.refresh(session);
    if (generation !== binding.generation || !['running', 'waiting_input'].includes(binding.state) || Date.parse(binding.expiresAt) <= Date.now() + 5000) throw unavailable();
  }

  async credential(session: Session): Promise<Credential | undefined> {
    if (session.runtime === 'demo') return undefined;
    return this.serial(session.id, async () => {
      const binding = this.current(session.id)!;
      const saved = this.store.getSecret<Credential>(`inference:${session.id}`);
      const account = await this.request(session, `/${binding.id}/spend`);
      if (saved) {
        if (account.capabilityState !== 'issued') throw new PloegError(409, 'inference_blocked', 'This execution capability was blocked or became uncertain. Reconcile it before authorizing further paid work.');
        return saved;
      }
      if (account.capabilityState !== 'reserved') throw new PloegError(409, 'inference_unresolved', 'No recoverable execution credential is available. Reconcile the existing authorization before another paid attempt.');
      const data = await this.request(session, `/${binding.id}/credential`, { generation: binding.generation });
      const c = data.credential;
      if (!c || typeof c.key !== 'string' || !c.key || c.key.length > 4096 || typeof c.alias !== 'string' || c.alias.length > 256 || c.reference !== binding.id || !Number.isFinite(c.budgetUsd) || c.budgetUsd <= 0 || c.budgetUsd > session.budgetUsd) throw unavailable();
      const credential = { key: c.key, alias: c.alias, reference: c.reference, budgetUsd: c.budgetUsd };
      this.store.setSecret(`inference:${session.id}`, credential);
      return credential;
    });
  }

  async checkResume(session: Session): Promise<void> {
    const binding = this.current(session.id)!;
    const account = await this.request(session, `/${binding.id}/spend`);
    const saved = this.store.getSecret<Credential>(`inference:${session.id}`);
    if ((account.capabilityState === 'reserved' && !saved) || (account.capabilityState === 'issued' && saved)) return;
    throw new PloegError(409, 'inference_blocked', 'This execution capability is blocked or uncertain. Reconcile it before authorizing further paid work.');
  }

  async block(session: Session): Promise<void> {
    const binding = this.current(session.id);
    if (!binding) return;
    const data = await this.request(session, `/${binding.id}/block`, {});
    if (data.blocked !== true) throw unavailable();
    this.store.deleteSecret(`inference:${session.id}`);
  }

  async observe(session: Session): Promise<void> {
    const binding = this.current(session.id);
    if (!binding || session.runtime === 'demo') return;
    const data = await this.request(session, `/${binding.id}/spend`);
    const latest = this.store.getSession(session.id)!;
    if (data.costStatus === 'observed' && typeof data.observedUsd === 'number' && Number.isFinite(data.observedUsd) && data.observedUsd >= 0) { latest.observedUsd = Math.max(latest.observedUsd ?? 0, data.observedUsd); latest.costStatus = 'pending'; }
    else latest.costStatus = 'unknown';
    this.store.saveSession(latest);
  }
}
