import type { AppConfig, Session, User } from './types.ts';
import type { Store } from './store.ts';
import { policyDigest } from './delivery-config.ts';
import { canonicalizeCandidate, deliveryFailure, deliveryRead, type CanonicalCandidate } from './trusted-candidate.ts';
import { verifyCandidate, type VerificationResult } from './delivery-verifier.ts';
import { DockerClient } from './runtime/docker.ts';
import { ExecutionAuthority } from './execution-authority.ts';

type LocalDelivery = { candidate: CanonicalCandidate; generation: number; phase: 'captured' | 'verifying' | 'verified' | 'recorded'; result?: VerificationResult };
export type DeliveryView = { configured: boolean; policySha256?: string; localPhase?: string; checks?: VerificationResult['checks']; candidate?: any; receipt?: any; approval?: any; operation?: any; publicationEnabled: false };

export function validatedDelivery(value: any, session: Session): Pick<DeliveryView, 'candidate' | 'receipt' | 'approval' | 'operation'> {
  const identity = (id: unknown): boolean => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
  const hash = (id: unknown, length: number): boolean => typeof id === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(id);
  if (!value || typeof value !== 'object' || Array.isArray(value)) deliveryFailure('delivery_contract');
  const { candidate: c, receipt: r, approval: a, operation: o } = value;
  if (c && (!identity(c.id) || c.executionId !== session.execution?.id || c.workItemId !== session.execution?.workItemId || c.repositoryId !== session.repositoryId || !Number.isSafeInteger(c.generation) || c.generation < 1 || !hash(c.canonicalSha, 40) || !hash(c.baseSha, 40) || !hash(c.treeSha, 40) || !hash(c.policySha256, 64) || !hash(c.artifactSha256, 64))) deliveryFailure('delivery_contract');
  if (r && (!c || !identity(r.id) || r.candidateId !== c.id || r.policySha256 !== c.policySha256 || r.canonicalSha !== c.canonicalSha || r.treeSha !== c.treeSha || r.artifactSha256 !== c.artifactSha256 || typeof r.passed !== 'boolean' || !Number.isSafeInteger(r.testCount) || r.testCount < 0 || r.testCount > 100000 || !hash(r.evidenceSha256, 64))) deliveryFailure('delivery_contract');
  if (a && (!c || !r || !identity(a.id) || a.candidateId !== c.id || a.receiptId !== r.id || a.policySha256 !== c.policySha256 || typeof a.actor !== 'string' || a.actor.length > 128)) deliveryFailure('delivery_contract');
  if (o && (!c || !r || !a || typeof o.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(o.id) || o.executionId !== session.execution?.id || o.candidateId !== c.id || o.receiptId !== r.id || o.approvalId !== a.id || o.canonicalSha !== c.canonicalSha || !['reserved', 'unknown', 'published'].includes(o.state))) deliveryFailure('delivery_contract');
  return { candidate: c ? { id: c.id, executionId: c.executionId, workItemId: c.workItemId, repositoryId: c.repositoryId, generation: c.generation, canonicalSha: c.canonicalSha, baseSha: c.baseSha, treeSha: c.treeSha, policySha256: c.policySha256, artifactSha256: c.artifactSha256 } : null, receipt: r ? { id: r.id, candidateId: r.candidateId, policySha256: r.policySha256, passed: r.passed, testCount: r.testCount, evidenceSha256: r.evidenceSha256 } : null, approval: a ? { id: a.id, candidateId: a.candidateId, receiptId: a.receiptId, policySha256: a.policySha256, actor: a.actor } : null, operation: o ? { id: o.id, state: o.state, canonicalSha: o.canonicalSha } : null };
}

export class DeliveryService {
  private config: AppConfig;
  private store: Store;
  private queues = new Map<string, Promise<unknown>>();
  constructor(config: AppConfig, store: Store) { this.config = config; this.store = store; }

  private async request(session: Session, suffix = '', payload?: unknown, verifier = false, actingUser = session.ownerId): Promise<any> {
    const name = verifier ? this.config.delivery?.verifierTokenEnv : this.config.ploeg?.tokenEnv;
    const token = name ? process.env[name] : undefined;
    if (!token || token.length < 32 || token.length > 4096 || /[^\x21-\x7e]/.test(token) || !session.execution) deliveryFailure('delivery_authority_unavailable');
    try {
      const response = await fetch(`${this.config.ploeg!.url}/api/v1/operator/executions/${session.execution!.id}/delivery${suffix}`, { method: payload === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'X-Ploeg-Actor': session.ownerId, 'X-Ploeg-Acting-User': actingUser, accept: 'application/json', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(10000), redirect: 'manual' });
      if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json') || !response.body) { await response.body?.cancel(); deliveryFailure('delivery_authority_rejected'); }
      const chunks: Uint8Array[] = []; let size = 0; const reader = response.body!.getReader();
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 262144) deliveryFailure('delivery_response_too_large'); chunks.push(part.value); } } finally { await reader.cancel().catch(() => undefined); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (data?.schemaVersion !== '1.0') deliveryFailure('delivery_contract'); return data;
    } catch (error) { if ((error as any)?.code?.startsWith('delivery_')) throw error; return deliveryFailure('delivery_authority_unconfirmed'); }
  }

  private session(id: string, user: User, mutate = false): Session {
    const session = this.store.getSession(id);
    if (!session || session.ownerId !== user.id && user.role !== 'admin') throw Object.assign(new Error('Session not found.'), { status: 404, code: 'not_found' });
    if (!session.execution || !this.config.execution) deliveryFailure('shared_execution_required');
    if (mutate) new ExecutionAuthority(this.store, this.config).authorize(user);
    return session;
  }

  private serial<T>(id: string, work: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(id) ?? Promise.resolve(); const next = prior.catch(() => undefined).then(work); this.queues.set(id, next);
    void next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id); }).catch(() => undefined); return next;
  }

  async view(id: string, user: User): Promise<DeliveryView> {
    const session = this.session(id, user); const policy = this.config.delivery?.policies.find(policy => policy.repositoryId === session.repositoryId);
    if (!policy) return { configured: false, publicationEnabled: false };
    const data = await this.request(session); const local = this.store.getSecret<LocalDelivery>(`delivery:${id}`);
    return { configured: true, policySha256: policyDigest(policy), localPhase: local?.phase === 'verifying' && !this.queues.has(id) ? 'interrupted' : local?.phase, checks: local?.result?.checks, ...validatedDelivery(data.delivery, session), publicationEnabled: false };
  }

  verify(id: string, user: User): Promise<DeliveryView> {
    return this.serial(id, async () => {
      const session = this.session(id, user, true); const policy = this.config.delivery?.policies.find(policy => policy.repositoryId === session.repositoryId);
      if (!policy || session.status !== 'completed' || session.candidate?.status !== 'ready' || session.execution?.state !== 'completed' || !session.execution.stopConfirmed) deliveryFailure('completed_candidate_required');
      const repository = this.config.repositories.find(repo => repo.id === session.repositoryId)!;
      let local = this.store.getSecret<LocalDelivery>(`delivery:${id}`);
      if (!local) { local = { candidate: await canonicalizeCandidate(this.config.dataDir, id, policy!), generation: session.execution!.generation, phase: 'captured' }; this.store.setSecret(`delivery:${id}`, local); }
      if (local.candidate.policySha !== policyDigest(policy!) || local.generation !== session.execution!.generation) deliveryFailure('delivery_policy_changed');
      if (local.phase === 'verifying' && !local.result) deliveryFailure('verification_interrupted');
      const candidate = local.candidate;
      const admitted = await this.request(session, '/candidates', { generation: local.generation, repositoryId: candidate.repositoryId, repositoryUrl: repository.url, baseSha: candidate.baseSha, canonicalSha: candidate.canonicalSha, treeSha: candidate.treeSha, artifactSha256: candidate.artifactSha, policySha256: candidate.policySha }, true, user.id);
      if (!admitted.candidate?.id || admitted.candidate.canonicalSha !== candidate.canonicalSha || admitted.candidate.policySha256 !== candidate.policySha || admitted.candidate.generation !== local.generation) deliveryFailure('delivery_contract');
      if (!local.result) {
        local.phase = 'verifying'; this.store.setSecret(`delivery:${id}`, local); this.store.appendEvent(id, 'delivery.verification_started', user.id, { canonicalSha: candidate.canonicalSha, policySha256: candidate.policySha });
        local.result = await verifyCandidate(candidate, policy!, new DockerClient(this.config.delivery!.socketPath ?? this.config.docker?.socketPath));
        local.phase = 'verified'; this.store.setSecret(`delivery:${id}`, local); this.store.appendEvent(id, 'delivery.verification_finished', 'verifier', { passed: local.result.passed, testCount: local.result.testCount, evidenceSha256: local.result.evidenceSha256 });
      }
      const result = local.result;
      const recorded = await this.request(session, '/verification', { candidateId: admitted.candidate.id, policySha256: candidate.policySha, canonicalSha: candidate.canonicalSha, treeSha: candidate.treeSha, artifactSha256: candidate.artifactSha, passed: result.passed, testCount: result.testCount, verifierId: result.verifierId, evidenceSha256: result.evidenceSha256 }, true, user.id);
      if (recorded.receipt?.candidateId !== admitted.candidate.id || recorded.receipt.evidenceSha256 !== result.evidenceSha256 || recorded.receipt.passed !== result.passed) deliveryFailure('delivery_contract');
      local.phase = 'recorded'; this.store.setSecret(`delivery:${id}`, local); return this.view(id, user);
    });
  }

  approve(id: string, user: User, input: Record<string, unknown>): Promise<DeliveryView> {
    return this.serial(id, async () => {
      const session = this.session(id, user, true);
      const policy = this.config.delivery?.policies.find(policy => policy.repositoryId === session.repositoryId);
      if (!policy || input.policySha256 !== policyDigest(policy)) deliveryFailure('delivery_policy_changed');
      if (Object.keys(input).some(key => !['candidateId', 'receiptId', 'policySha256'].includes(key)) || ![input.candidateId, input.receiptId].every(value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)) || typeof input.policySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.policySha256)) deliveryFailure('candidate_bound_approval_required');
      await this.request(session, '/approval', input, false, user.id); this.store.appendEvent(id, 'delivery.approved', user.id, input); return this.view(id, user);
    });
  }

  async download(id: string, user: User): Promise<Buffer> {
    this.session(id, user); const local = this.store.getSecret<LocalDelivery>(`delivery:${id}`); if (!local) deliveryFailure('canonical_candidate_unavailable');
    return deliveryRead(local!.candidate.bundlePath);
  }
}
