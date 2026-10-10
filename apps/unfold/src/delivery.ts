import type { AppConfig, Session, User } from './types.ts';
import type { Store } from './store.ts';
import { policyDigest } from './delivery-config.ts';
import { canonicalizeCandidate, deliveryFailure, deliveryRead, type CanonicalCandidate } from './trusted-candidate.ts';
import { verifyCandidate, type VerificationResult } from './delivery-verifier.ts';
import { DockerClient } from './runtime/docker.ts';
import { ExecutionAuthority } from './execution-authority.ts';
import { ForgejoPublisher, publicationBranch, publicationOperationId, pullRequestBody, pullRequestTitle, type PublicationRecord, type PullRequestEvidence } from './delivery-publisher.ts';

type LocalDelivery = { candidate: CanonicalCandidate; generation: number; phase: 'captured' | 'verifying' | 'verified' | 'recorded'; result?: VerificationResult };
export type DeliveryView = { configured: boolean; policySha256?: string; localPhase?: string; checks?: VerificationResult['checks']; candidate?: any; receipt?: any; approval?: any; operation?: any; publication?: { phase: PublicationRecord['phase']; operationId: string; branch: string; pullRequest?: PullRequestEvidence }; publicationEnabled: boolean };
type PloegReply = { status: number; data: any };
const reconcilablePhases: ReadonlyArray<PublicationRecord['phase']> = ['authorized', 'pushed', 'proposed', 'unknown', 'recovery_required'];
const publicationKey = (id: string): string => `publication:${id}`;

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
  private publisher?: ForgejoPublisher;
  private queues = new Map<string, Promise<unknown>>();
  constructor(config: AppConfig, store: Store, publisher?: ForgejoPublisher) {
    this.config = config; this.store = store;
    this.publisher = publisher ?? (config.delivery?.publisher ? new ForgejoPublisher(config.delivery.publisher) : undefined);
  }

  private async exchange(session: Session, suffix = '', payload?: unknown, verifier = false, actingUser = session.ownerId): Promise<PloegReply> {
    const name = verifier ? this.config.delivery?.verifierTokenEnv : this.config.ploeg?.tokenEnv;
    const token = name ? process.env[name] : undefined;
    if (!token || token.length < 32 || token.length > 4096 || /[^\x21-\x7e]/.test(token) || !session.execution) deliveryFailure('delivery_authority_unavailable');
    try {
      const response = await fetch(`${this.config.ploeg!.url}/api/v1/operator/executions/${session.execution!.id}/delivery${suffix}`, { method: payload === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'X-Ploeg-Actor': session.ownerId, 'X-Ploeg-Acting-User': actingUser, accept: 'application/json', ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(10000), redirect: 'manual' });
      if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json') || !response.body) { await response.body?.cancel(); throw Object.assign(new Error('Candidate delivery blocked: delivery authority rejected.'), { status: 409, code: 'delivery_authority_rejected', upstreamStatus: response.status }); }
      const chunks: Uint8Array[] = []; let size = 0; const reader = response.body!.getReader();
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 262144) deliveryFailure('delivery_response_too_large'); chunks.push(part.value); } } finally { await reader.cancel().catch(() => undefined); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (data?.schemaVersion !== '1.0') deliveryFailure('delivery_contract'); return { status: response.status, data };
    } catch (error) { if ((error as any)?.code?.startsWith('delivery_')) throw error; return deliveryFailure('delivery_authority_unconfirmed'); }
  }

  private async request(session: Session, suffix = '', payload?: unknown, verifier = false, actingUser = session.ownerId): Promise<any> {
    return (await this.exchange(session, suffix, payload, verifier, actingUser)).data;
  }

  private session(id: string, user: User, mutate = false): Session {
    const session = this.store.getSession(id);
    if (!session || session.ownerId !== user.id && user.role !== 'admin') throw Object.assign(new Error('Session not found.'), { status: 404, code: 'not_found' });
    if (!session.execution || !this.config.execution) deliveryFailure('shared_execution_required');
    if (mutate) new ExecutionAuthority(this.store, this.config).authorize(user);
    return session;
  }

  private policy(session: Session) { return this.config.delivery?.policies.find(policy => policy.repositoryId === session.repositoryId); }

  private serial<T>(id: string, work: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(id) ?? Promise.resolve(); const next = prior.catch(() => undefined).then(work); this.queues.set(id, next);
    void next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id); }).catch(() => undefined); return next;
  }

  async view(id: string, user: User): Promise<DeliveryView> {
    const session = this.session(id, user);
    const record = this.store.getSecret<PublicationRecord>(publicationKey(id));
    if (record && reconcilablePhases.includes(record.phase) && !this.queues.has(id)) await this.serial(id, () => this.reconcile(session)).catch(() => undefined);
    return this.render(session);
  }

  private async render(session: Session): Promise<DeliveryView> {
    const id = session.id; const policy = this.policy(session);
    if (!policy) return { configured: false, publicationEnabled: false };
    const data = await this.request(session); const local = this.store.getSecret<LocalDelivery>(`delivery:${id}`);
    const record = this.store.getSecret<PublicationRecord>(publicationKey(id));
    return { configured: true, policySha256: policyDigest(policy), localPhase: local?.phase === 'verifying' && !this.queues.has(id) ? 'interrupted' : local?.phase, checks: local?.result?.checks, ...validatedDelivery(data.delivery, session), ...(record ? { publication: { phase: record.phase, operationId: record.operationId, branch: record.branch, ...(record.pullRequest ? { pullRequest: record.pullRequest } : {}) } } : {}), publicationEnabled: Boolean(this.publisher) && record?.phase !== 'refused' };
  }

  verify(id: string, user: User): Promise<DeliveryView> {
    return this.serial(id, async () => { const session = this.session(id, user, true); await this.verifyLocked(session, user); return this.render(session); });
  }

  private async verifyLocked(session: Session, user: User): Promise<void> {
    const id = session.id; const policy = this.policy(session);
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
    local.phase = 'recorded'; this.store.setSecret(`delivery:${id}`, local);
  }

  approve(id: string, user: User, input: Record<string, unknown>): Promise<DeliveryView> {
    return this.serial(id, async () => { const session = this.session(id, user, true); await this.approveLocked(session, user, input); return this.render(session); });
  }

  private async approveLocked(session: Session, user: User, input: Record<string, unknown>): Promise<void> {
    const policy = this.policy(session);
    if (!policy || input.policySha256 !== policyDigest(policy)) deliveryFailure('delivery_policy_changed');
    if (Object.keys(input).some(key => !['candidateId', 'receiptId', 'policySha256'].includes(key)) || ![input.candidateId, input.receiptId].every(value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)) || typeof input.policySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.policySha256)) deliveryFailure('candidate_bound_approval_required');
    await this.request(session, '/approval', input, false, user.id); this.store.appendEvent(session.id, 'delivery.approved', user.id, input);
  }

  publish(id: string, user: User, input: Record<string, unknown>): Promise<DeliveryView> {
    return this.serial(id, async () => {
      const session = this.session(id, user, true); const policy = this.policy(session);
      if (!this.publisher) deliveryFailure('publication_disabled');
      if (!policy || input.policySha256 !== policyDigest(policy)) deliveryFailure('delivery_policy_changed');
      if (Object.keys(input).some(key => !['candidateId', 'receiptId', 'policySha256'].includes(key)) || [input.candidateId, input.receiptId].some(value => value !== undefined && (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)))) deliveryFailure('candidate_bound_approval_required');
      let record = this.store.getSecret<PublicationRecord>(publicationKey(id));
      if (!record || record.phase === 'refused') record = await this.prepare(session, user, input, policyDigest(policy!));
      if (record.phase === 'reserving') record = await this.reserve(session, user, record);
      if (record.phase === 'recovery_required' || record.phase === 'unknown') {
        record = await this.recover(session, record);
        if (record.phase === 'recovery_required' || record.phase === 'unknown') deliveryFailure(record.phase === 'unknown' ? 'publication_unknown' : 'publication_recovery_required');
      }
      if (record.phase === 'authorized') record = await this.push(session, record);
      if (record.phase === 'pushed') record = await this.propose(session, record);
      if (record.phase === 'proposed') record = await this.report(session, record);
      return this.render(session);
    });
  }

  private save(session: Session, record: PublicationRecord, event?: string): PublicationRecord {
    this.store.setSecret(publicationKey(session.id), record);
    if (event) this.store.appendEvent(session.id, event, 'publisher', { operationId: record.operationId, branch: record.branch, phase: record.phase, ...(record.pullRequest ? { pullRequest: record.pullRequest } : {}) });
    return record;
  }

  private async prepare(session: Session, user: User, input: Record<string, unknown>, policySha256: string): Promise<PublicationRecord> {
    let delivery = validatedDelivery((await this.request(session)).delivery, session);
    if (!delivery.receipt) { await this.verifyLocked(session, user); delivery = validatedDelivery((await this.request(session)).delivery, session); }
    const { candidate, receipt } = delivery;
    if (!candidate || !receipt || (input.candidateId !== undefined && input.candidateId !== candidate.id) || (input.receiptId !== undefined && input.receiptId !== receipt.id) || candidate.policySha256 !== policySha256) deliveryFailure('candidate_bound_approval_required');
    if (!receipt.passed) deliveryFailure('passing_receipt_required');
    if (!delivery.approval) { await this.approveLocked(session, user, { candidateId: candidate.id, receiptId: receipt.id, policySha256 }); delivery = validatedDelivery((await this.request(session)).delivery, session); }
    const approval = delivery.approval;
    if (!approval || approval.candidateId !== candidate.id || approval.receiptId !== receipt.id) deliveryFailure('candidate_bound_approval_required');
    const repository = this.config.repositories.find(repo => repo.id === session.repositoryId)!;
    const local = this.store.getSecret<LocalDelivery>(`delivery:${session.id}`);
    if (!local || local.candidate.canonicalSha !== candidate.canonicalSha) deliveryFailure('canonical_candidate_unavailable');
    const operationId = publicationOperationId(candidate.id);
    return this.save(session, {
      operationId, branch: publicationBranch(session.execution?.workItemId, session.id, candidate.id), baseBranch: repository.baseBranch, repositoryUrl: repository.url, phase: 'reserving',
      facts: { workItemId: session.execution!.workItemId, sessionId: session.id, sessionUrl: `${this.config.baseUrl ?? `http://${this.config.host}:${this.config.port}`}/#session/${session.id}`, ...(session.trackerUrl ?? repository.trackerUrl ? { trackerUrl: session.trackerUrl ?? repository.trackerUrl } : {}), title: session.title, candidateId: candidate.id, receiptId: receipt.id, approvalId: approval.id, canonicalSha: candidate.canonicalSha, baseSha: candidate.baseSha, treeSha: candidate.treeSha, policySha256, verifierId: local!.result?.verifierId ?? 'unfold-docker-v1', approver: approval.actor },
    }, 'delivery.publication_reserving');
  }

  private async reserve(session: Session, user: User, record: PublicationRecord): Promise<PublicationRecord> {
    const payload = { operationId: record.operationId, candidateId: record.facts.candidateId, receiptId: record.facts.receiptId, approvalId: record.facts.approvalId, policySha256: record.facts.policySha256, branch: record.branch };
    let reply: PloegReply;
    try { reply = await this.exchange(session, '/publication', payload, false, user.id); }
    catch (error) {
      if ((error as { upstreamStatus?: number }).upstreamStatus !== 409) throw error;
      const existing = validatedDelivery((await this.request(session)).delivery, session).operation;
      if (existing) { this.save(session, { ...record, phase: 'recovery_required' }, 'delivery.publication_recovery_required'); return deliveryFailure('publication_recovery_required'); }
      this.save(session, { ...record, phase: 'refused' }, 'delivery.publication_refused'); return deliveryFailure('publication_refused');
    }
    const operation = reply.data?.operation;
    const bound = operation?.id === record.operationId && operation.canonicalSha === record.facts.canonicalSha && operation.branch === record.branch && operation.repositoryUrl === record.repositoryUrl && typeof operation.baseBranch === 'string';
    if (!bound) deliveryFailure('delivery_contract');
    const reserved = { ...record, baseBranch: operation.baseBranch };
    if (reply.status === 201 && reply.data.effectAuthorized === true) return this.save(session, { ...reserved, phase: 'authorized' }, 'delivery.publication_authorized');
    const recovered = await this.recover(session, { ...reserved, phase: 'recovery_required' });
    if (recovered.phase === 'recovery_required') { this.save(session, recovered, 'delivery.publication_recovery_required'); await this.status(session, recovered, 'unknown').catch(() => undefined); return deliveryFailure('publication_recovery_required'); }
    return recovered;
  }

  private gitDirectory(session: Session): string {
    const local = this.store.getSecret<LocalDelivery>(`delivery:${session.id}`);
    return local?.candidate.gitDirectory ?? deliveryFailure('canonical_candidate_unavailable');
  }

  private async push(session: Session, record: PublicationRecord): Promise<PublicationRecord> {
    const outcome = await this.publisher!.push(this.gitDirectory(session), record.repositoryUrl, record.facts.canonicalSha, record.branch);
    if (outcome === 'foreign') return this.unknown(session, record);
    return this.save(session, { ...record, phase: 'pushed' }, 'delivery.publication_pushed');
  }

  private async unknown(session: Session, record: PublicationRecord): Promise<never> {
    const unknown = this.save(session, { ...record, phase: 'unknown' }, 'delivery.publication_unknown');
    await this.status(session, unknown, 'unknown').catch(() => undefined);
    return deliveryFailure('publication_unknown');
  }

  private async propose(session: Session, record: PublicationRecord): Promise<PublicationRecord> {
    const created = await this.publisher!.createPullRequest(record.repositoryUrl, { head: record.branch, base: record.baseBranch, title: pullRequestTitle(record.facts), body: pullRequestBody(record.operationId, record.facts) });
    const pr = created === 'exists' ? await this.publisher!.findPullRequest(record.repositoryUrl, record.branch, record.baseBranch) : created;
    if (!pr) deliveryFailure('publication_unconfirmed');
    const evidence = await this.publisher!.verifiedPullRequest(record, pr!.number);
    if (!evidence) return this.unknown(session, record);
    return this.save(session, { ...record, phase: 'proposed', pullRequest: evidence }, 'delivery.publication_proposed');
  }

  private async status(session: Session, record: PublicationRecord, state: 'unknown' | 'published'): Promise<any> {
    const evidence = state === 'published' ? { remoteId: String(record.pullRequest!.number), remoteUrl: record.pullRequest!.url } : {};
    const reply = await this.request(session, `/publication/${encodeURIComponent(record.operationId)}/status`, { state, canonicalSha: record.facts.canonicalSha, branch: record.branch, ...evidence }, true);
    if (reply.operation?.id !== record.operationId || reply.operation.state !== state && reply.operation.state !== 'published') deliveryFailure('delivery_contract');
    return reply.operation;
  }

  private async report(session: Session, record: PublicationRecord): Promise<PublicationRecord> {
    await this.status(session, record, 'published');
    return this.save(session, { ...record, phase: 'published' }, 'delivery.publication_published');
  }

  private async evidence(session: Session, record: PublicationRecord): Promise<PullRequestEvidence | undefined> {
    if (await this.publisher!.remoteHead(this.gitDirectory(session), record.repositoryUrl, record.branch) !== record.facts.canonicalSha) return undefined;
    const pr = await this.publisher!.findPullRequest(record.repositoryUrl, record.branch, record.baseBranch);
    return pr ? this.publisher!.verifiedPullRequest(record, pr.number) : undefined;
  }

  private async recover(session: Session, record: PublicationRecord): Promise<PublicationRecord> {
    const evidence = await this.evidence(session, record);
    return evidence ? this.save(session, { ...record, phase: 'proposed', pullRequest: evidence }, 'delivery.publication_proposed') : record;
  }

  private async reconcile(session: Session): Promise<void> {
    let record = this.store.getSecret<PublicationRecord>(publicationKey(session.id));
    if (!record || !this.publisher || !reconcilablePhases.includes(record.phase)) return;
    if (record.phase === 'authorized') {
      const head = await this.publisher.remoteHead(this.gitDirectory(session), record.repositoryUrl, record.branch);
      if (head === null) return;
      if (head !== record.facts.canonicalSha) { await this.unknown(session, record).catch(() => undefined); return; }
      record = this.save(session, { ...record, phase: 'pushed' }, 'delivery.publication_pushed');
    }
    if (record.phase === 'pushed') {
      const pr = await this.publisher.findPullRequest(record.repositoryUrl, record.branch, record.baseBranch);
      const evidence = pr ? await this.publisher.verifiedPullRequest(record, pr.number) : undefined;
      if (!evidence) return;
      record = this.save(session, { ...record, phase: 'proposed', pullRequest: evidence }, 'delivery.publication_proposed');
    }
    if (record.phase === 'unknown' || record.phase === 'recovery_required') record = await this.recover(session, record);
    if (record.phase === 'proposed') await this.report(session, record);
  }

  async reconcileAll(): Promise<void> {
    if (!this.publisher) return;
    for (const session of this.store.listSessions()) {
      const record = this.store.getSecret<PublicationRecord>(publicationKey(session.id));
      if (record && reconcilablePhases.includes(record.phase) && session.execution) await this.serial(session.id, () => this.reconcile(session)).catch(() => undefined);
    }
  }

  async download(id: string, user: User): Promise<Buffer> {
    this.session(id, user); const local = this.store.getSecret<LocalDelivery>(`delivery:${id}`); if (!local) deliveryFailure('canonical_candidate_unavailable');
    return deliveryRead(local!.candidate.bundlePath);
  }
}
