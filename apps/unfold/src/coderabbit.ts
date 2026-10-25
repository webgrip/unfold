import { createHash } from 'node:crypto';
import { ExecutionAuthority } from './execution-authority.ts';
import { knownSecrets, plainRedactedText, withoutKnownSecrets } from './redaction.ts';
import { codeRabbitProvider, type CodeRabbitProvider, type CodeRabbitReview, type CodeRabbitSecurityFinding } from './coderabbit-provider.ts';
import type { CodeRabbitRepository } from './coderabbit-config.ts';
import type { Store } from './store.ts';
import type { AppConfig, Session, User } from './types.ts';

type ReviewRecord = { id: string; actor: string; at: string; finishedAt?: string; github: string; base: string; headSha: string; state: 'running' | 'cancelled' | 'interrupted' | 'failed' | CodeRabbitReview['state']; costStatus: 'unknown'; result?: CodeRabbitReview; error?: string };
type SecurityRecord = { at: string; github: string; repositoryId: string; organizationId: string; findings: CodeRabbitSecurityFinding[] };
function fault(status: number, code: string, message: string): never { throw Object.assign(new Error(message), { status, code }); }
const reviewKey = (id: string, requestId: string): string => `coderabbit:review:${id}:${requestId}`;
const indexKey = (id: string): string => `coderabbit:index:${id}`;
const securityKey = (id: string): string => `coderabbit:security:${id}`;

export class CodeRabbitService {
  private active = new Map<string, AbortController>();
  private importing = new Set<string>();
  private config: AppConfig;
  private store: Store;
  private provider: CodeRabbitProvider;

  constructor(config: AppConfig, store: Store, provider: CodeRabbitProvider = codeRabbitProvider) { this.config = config; this.store = store; this.provider = provider; }

  private session(id: string, user: User, mutate = false): Session {
    const session = this.store.getSession(id);
    if (!session || (session.ownerId !== user.id && user.role !== 'admin')) fault(404, 'not_found', 'Session not found.');
    if (mutate) {
      if (this.config.mode !== 'live' || !session.execution || !this.config.execution) fault(409, 'coderabbit_execution', 'CodeRabbit requires a live session under Ploeg authority.');
      new ExecutionAuthority(this.store, this.config).authorize(user);
    }
    return session;
  }

  private repository(session: Session): CodeRabbitRepository {
    return this.config.coderabbit?.repositories.find(repo => repo.repositoryId === session.repositoryId) ?? fault(409, 'coderabbit_disabled', 'CodeRabbit is not configured for this repository.');
  }

  private credential(name: string | undefined): string {
    const key = name ? process.env[name] : undefined;
    if (!key || key.length < 16 || key.length > 4096 || /[^\x21-\x7e]/.test(key)) fault(503, 'coderabbit_credential', 'The scoped CodeRabbit credential is unavailable.');
    return key;
  }

  private clean<T>(value: T, requestSecrets: string[] = []): T {
    const secrets = [...knownSecrets(this.config), ...requestSecrets];
    return JSON.parse(JSON.stringify(value), (_key, entry) => typeof entry === 'string' ? plainRedactedText(withoutKnownSecrets(entry, secrets)) : entry);
  }

  private save(id: string, record: ReviewRecord, type: string, actor: string): void {
    this.store.setSecret(reviewKey(id, record.id), record);
    this.store.appendEvent(id, `coderabbit.${type}`, actor, { requestId: record.id, github: record.github, base: record.base, headSha: record.headSha, state: record.state, costStatus: record.costStatus });
  }

  view(id: string, user: User) {
    const session = this.session(id, user);
    const repository = this.config.coderabbit?.repositories.find(repo => repo.repositoryId === session.repositoryId);
    const reviews = (this.store.getSecret<string[]>(indexKey(id)) ?? []).map((requestId, index) => {
      const record = this.store.getSecret<ReviewRecord>(reviewKey(id, requestId))!;
      if (record.state === 'running' && !this.active.has(reviewKey(id, requestId))) {
        record.state = 'interrupted'; record.finishedAt = new Date().toISOString();
        record.error = 'The workbench restarted before recording the result. No automatic retry was made. Provider billing is unknown.';
        this.save(id, record, 'review_interrupted', 'system');
      }
      return { ...record, findingCount: record.result?.findings.length, ...(index ? { result: undefined } : {}) };
    });
    return { configured: Boolean(repository), github: repository?.github, base: repository?.base, reviewEnabled: Boolean(repository?.agenticKeyEnv && this.config.coderabbit?.cli), securityEnabled: Boolean(repository?.security), dailyReviewLimit: this.config.coderabbit?.dailyReviewLimit, reviews, security: this.store.getSecret<SecurityRecord>(securityKey(id)) ?? null };
  }

  review(id: string, user: User, requestId: string): ReviewRecord {
    this.session(id, user);
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) fault(400, 'coderabbit_request', 'Choose a review request.');
    this.view(id, user);
    return this.store.getSecret<ReviewRecord>(reviewKey(id, requestId)) ?? fault(404, 'not_found', 'Review not found.');
  }

  startReview(id: string, user: User, data: any) {
    const session = this.session(id, user, true); const repository = this.repository(session); const config = this.config.coderabbit!;
    if (!data || Object.keys(data).some(key => !['requestId', 'headSha', 'acceptProviderBilling'].includes(key)) || !/^[A-Za-z0-9_-]{16,80}$/.test(data.requestId ?? '') || !/^[a-f0-9]{40}$/.test(data.headSha ?? '') || data.acceptProviderBilling !== true) fault(400, 'coderabbit_request', 'Provide a unique requestId, the full pushed GitHub commit SHA, and explicit acceptance of provider billing.');
    const key = reviewKey(id, data.requestId); const existing = this.store.getSecret<ReviewRecord>(key);
    if (existing) {
      if (existing.headSha !== data.headSha || existing.github !== repository.github || existing.base !== repository.base) fault(409, 'coderabbit_replay', 'This requestId already names another review.');
      return this.view(id, user);
    }
    if (!config.cli || !repository.agenticKeyEnv) fault(409, 'coderabbit_disabled', 'Headless reviews are not configured.');
    const credential = this.credential(repository.agenticKeyEnv);
    if (this.active.size >= 4 || this.active.has(`repository:${session.repositoryId}`)) fault(409, 'coderabbit_busy', 'A CodeRabbit review is already running. Wait for its result.');
    const day = new Date().toISOString().slice(0, 10);
    const quotaKey = `coderabbit:quota:${createHash('sha256').update(session.repositoryId).digest('hex')}:${day}`;
    const count = this.store.getSecret<number>(quotaKey) ?? 0;
    if (count >= config.dailyReviewLimit) fault(429, 'coderabbit_limit', 'This repository reached its daily review request limit. No review was started.');
    const record: ReviewRecord = { id: data.requestId, actor: user.id, at: new Date().toISOString(), github: repository.github, base: repository.base, headSha: data.headSha, state: 'running', costStatus: 'unknown' };
    this.store.setSecret(quotaKey, count + 1);
    this.save(id, record, 'review_requested', user.id);
    this.store.setSecret(indexKey(id), [record.id, ...(this.store.getSecret<string[]>(indexKey(id)) ?? [])].slice(0, 20));
    const controller = new AbortController(); this.active.set(key, controller); this.active.set(`repository:${session.repositoryId}`, controller);
    void this.provider.review(config.cli, repository, data.headSha, credential, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      record.result = this.clean(result, [credential]); record.state = result.state; record.finishedAt = new Date().toISOString();
      this.save(id, record, 'review_finished', user.id);
    }).catch(() => {
      if (controller.signal.aborted) return;
      record.state = 'failed'; record.finishedAt = new Date().toISOString();
      record.error = 'CodeRabbit did not return a usable review. Check the CLI pin, key, region, GitHub installation, pushed commit and provider limits. No retry was made. Provider billing is unknown.';
      this.save(id, record, 'review_failed', user.id);
    }).finally(() => { this.active.delete(key); this.active.delete(`repository:${session.repositoryId}`); });
    return this.view(id, user);
  }

  cancelReview(id: string, user: User, requestId: unknown) {
    this.session(id, user, true);
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) fault(400, 'coderabbit_request', 'Choose a review request.');
    const key = reviewKey(id, requestId); const record = this.store.getSecret<ReviewRecord>(key);
    if (!record) fault(404, 'not_found', 'Review not found.');
    if (record.state === 'running') {
      this.active.get(key)?.abort(); record.state = 'cancelled'; record.finishedAt = new Date().toISOString();
      record.error = 'Local review supervision stopped. CodeRabbit may already have processed or billed this review.';
      this.save(id, record, 'review_cancelled', user.id);
    }
    return this.view(id, user);
  }

  async importSecurity(id: string, user: User) {
    const session = this.session(id, user, true); const repository = this.repository(session);
    if (!repository.security) fault(409, 'coderabbit_disabled', 'Security findings import is not configured.');
    const credential = this.credential(repository.security.keyEnv);
    if (this.importing.has(id) || this.importing.size >= 2) fault(409, 'coderabbit_busy', 'A findings import is already running.');
    this.importing.add(id);
    try {
      const findings = this.clean(await this.provider.security(repository, credential, AbortSignal.timeout(30000)), [credential]);
      if (Buffer.byteLength(JSON.stringify(findings)) > 8388608) fault(502, 'coderabbit_response', 'The findings inventory exceeds the import limit. The previous snapshot was kept.');
      this.store.setSecret(securityKey(id), { at: new Date().toISOString(), github: repository.github, repositoryId: repository.security.repositoryId, organizationId: repository.security.organizationId, findings } satisfies SecurityRecord);
      this.store.appendEvent(id, 'coderabbit.security_imported', user.id, { findings: findings.length, repositoryId: session.repositoryId });
      return this.view(id, user);
    } catch { return fault(502, 'coderabbit_import', 'CodeRabbit findings could not be imported completely within the configured scope. The previous snapshot was kept.'); }
    finally { this.importing.delete(id); }
  }

  stop(): void { for (const controller of this.active.values()) controller.abort(); }
}
