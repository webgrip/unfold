import { canonicalJson, chainUid, type AuditChain } from './chain.ts';
import type { ObjectStore } from './object-store.ts';
import type { CheckpointSigner, SignerIdentity } from './signer.ts';

/** How often each Tenant's chain head is checkpointed. */
export const checkpointIntervalMs = 86_400_000;
/** How old a Tenant's newest checkpoint may be before verification calls the checkpoints stale. */
export const staleAfterMs = 2 * checkpointIntervalMs;

/** One signed statement of a Tenant's chain head: its sequence and hash at a time, with the signer that vouches for it. */
export type AuditCheckpoint = {
  type: 'unfold.audit.checkpoint';
  version: 1;
  tenant: string;
  chain_uid: string;
  sequence: number;
  head_hash: string;
  time: string;
  signer: SignerIdentity | null;
  signature: string | null;
  key_version: number | null;
};

/** Why a checkpoint does not vouch for the chain as it is now. */
export type CheckpointProblem = {
  sequence?: number;
  time?: string;
  key?: string;
  reason: 'ahead_of_chain' | 'hash_mismatch' | 'missing_record' | 'bad_signature' | 'unsigned' | 'signer_unavailable' | 'unreadable' | 'wrong_tenant' | 'stale' | 'storage_unavailable';
  detail?: string;
};

/** The result of checking a Tenant's checkpoints against its chain. */
export type CheckpointVerification = {
  source: 'object_storage' | 'local';
  ok: boolean;
  checked: number;
  newest: { sequence: number; hash: string; time: string; signed: boolean; keyVersion: number | null } | null;
  pruned: number;
  problems: CheckpointProblem[];
};

/** The bytes a checkpoint's signature covers: the JCS serialization of every checkpoint field but `signature` and `key_version`. */
export function checkpointPayload(checkpoint: AuditCheckpoint): string {
  const { type, version, tenant, chain_uid, sequence, head_hash, time, signer } = checkpoint;
  return canonicalJson({ type, version, tenant, chain_uid, sequence, head_hash, time, signer });
}

/** The object key of a checkpoint: `<prefix>/<tenant>/<12-digit sequence>-<time>.json`, so keys sort by sequence, then time. */
export function checkpointKey(prefix: string, checkpoint: Pick<AuditCheckpoint, 'tenant' | 'sequence' | 'time'>): string {
  const time = checkpoint.time.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `${prefix ? `${prefix.replace(/\/+$/, '')}/` : ''}${encodeURIComponent(checkpoint.tenant)}/${String(checkpoint.sequence).padStart(12, '0')}-${time}.json`;
}

const parse = (text: string): AuditCheckpoint | undefined => {
  try {
    const value = JSON.parse(text) as AuditCheckpoint;
    return value?.type === 'unfold.audit.checkpoint' && Number.isSafeInteger(value.sequence) && typeof value.head_hash === 'string' && typeof value.time === 'string' ? value : undefined;
  } catch { return undefined; }
};

type Row = { tenant_id: string; at: string; seq: number; hash: string; checkpoint: string; stored_at: string | null };

/**
 * Once a day per Tenant, signs the audit chain head with the configured signer and copies it to object storage, where
 * Unfold cannot shorten its retention. Checkpoints are also kept in `audit_checkpoints`, which `AuditChain` creates
 * and whose triggers refuse deletes and any update but the one that marks a checkpoint stored.
 */
export class AuditCheckpoints {
  readonly signer: CheckpointSigner | undefined;
  readonly storage: ObjectStore | undefined;
  private readonly chain: AuditChain;
  private readonly now: () => Date;
  private readonly warn: (message: string) => void;
  private readonly info: (fields: Record<string, unknown>) => void;
  private running: Promise<void> | undefined;

  constructor(options: { chain: AuditChain; signer?: CheckpointSigner; storage?: ObjectStore; now?: () => Date; warn: (message: string) => void; info?: (fields: Record<string, unknown>) => void }) {
    this.chain = options.chain;
    this.signer = options.signer;
    this.storage = options.storage;
    this.now = options.now ?? (() => new Date());
    this.warn = options.warn;
    this.info = options.info ?? (() => {});
  }

  /** Every checkpoint of a Tenant kept here, oldest first. */
  local(tenant: string): (AuditCheckpoint & { storedAt: string | null })[] {
    return (this.chain.db.prepare('SELECT * FROM audit_checkpoints WHERE tenant_id=? ORDER BY at').all(tenant) as Row[]).flatMap(row => {
      const checkpoint = parse(row.checkpoint);
      return checkpoint ? [{ ...checkpoint, storedAt: row.stored_at }] : [];
    });
  }

  /** Checkpoints every Tenant whose newest checkpoint is a day old or missing, then stores what is not stored yet. A call while one runs waits for it. */
  run(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        for (const tenant of this.chain.tenants()) {
          if (!await this.checkpoint(tenant)) return;
        }
        await this.store();
      } finally { this.running = undefined; }
    })();
    return this.running;
  }

  private async checkpoint(tenant: string): Promise<boolean> {
    const now = this.now();
    const newest = this.chain.db.prepare('SELECT at FROM audit_checkpoints WHERE tenant_id=? ORDER BY at DESC LIMIT 1').get(tenant) as { at: string } | undefined;
    if (newest && now.getTime() - Date.parse(newest.at) < checkpointIntervalMs) return true;
    const head = this.chain.head(tenant);
    if (!head) return true;
    const unsigned: AuditCheckpoint = { type: 'unfold.audit.checkpoint', version: 1, tenant, chain_uid: chainUid(tenant), sequence: head.sequence, head_hash: head.hash, time: now.toISOString(), signer: this.signer?.identity ?? null, signature: null, key_version: null };
    let checkpoint = unsigned;
    if (this.signer) {
      try {
        const signed = await this.signer.sign(checkpointPayload(unsigned));
        checkpoint = { ...unsigned, signature: signed.signature, key_version: signed.keyVersion };
      } catch (error) {
        this.warn(`signing the checkpoint of ${tenant} failed: ${String((error as Error)?.message ?? error)}`);
        return false;
      }
    }
    this.chain.db.prepare('INSERT INTO audit_checkpoints(tenant_id,at,seq,hash,checkpoint,stored_at) VALUES(?,?,?,?,?,NULL)').run(tenant, checkpoint.time, checkpoint.sequence, checkpoint.head_hash, canonicalJson(checkpoint));
    this.info({ event: 'audit.checkpoint', tenant, sequence: checkpoint.sequence, signed: Boolean(checkpoint.signature), key_version: checkpoint.key_version });
    return true;
  }

  private async store(): Promise<void> {
    if (!this.storage) return;
    for (const row of this.chain.db.prepare('SELECT * FROM audit_checkpoints WHERE stored_at IS NULL ORDER BY at').all() as Row[]) {
      const checkpoint = parse(row.checkpoint);
      if (!checkpoint) continue;
      try {
        await this.storage.put(checkpointKey(this.storage.settings.prefix, checkpoint), `${row.checkpoint}\n`, 'application/json', this.now());
      } catch (error) {
        this.warn(`storing the checkpoint of ${row.tenant_id} failed: ${String((error as Error)?.message ?? error)}`);
        return;
      }
      this.chain.db.prepare('UPDATE audit_checkpoints SET stored_at=? WHERE tenant_id=? AND at=?').run(this.now().toISOString(), row.tenant_id, row.at);
    }
  }

  /**
   * Checks a Tenant's checkpoints against its chain: from object storage when it is configured, else the ones kept here.
   * Without `all`, only the newest is checked: the chain links every earlier record to it. Each checked checkpoint's
   * signature is verified with the signer, and its sequence must hold its hash in the chain or its retention anchor.
   */
  async verify(tenant: string, options: { all?: boolean } = {}): Promise<CheckpointVerification> {
    const source: CheckpointVerification['source'] = this.storage ? 'object_storage' : 'local';
    const result: CheckpointVerification = { source, ok: true, checked: 0, newest: null, pruned: 0, problems: [] };
    const found: { key?: string; text: string }[] = [];
    try {
      if (this.storage) {
        const keys = (await this.storage.list(`${checkpointKey(this.storage.settings.prefix, { tenant, sequence: 0, time: '' }).replace(/[^/]*$/, '')}`)).filter(key => key.endsWith('.json')).sort();
        for (const key of options.all ? keys : keys.slice(-1)) {
          const text = await this.storage.get(key);
          if (text !== undefined) found.push({ key, text });
        }
      } else {
        const rows = this.chain.db.prepare('SELECT checkpoint FROM audit_checkpoints WHERE tenant_id=? ORDER BY seq, at').all(tenant) as { checkpoint: string }[];
        for (const row of options.all ? rows : rows.slice(-1)) found.push({ text: row.checkpoint });
      }
    } catch (error) {
      result.problems.push({ reason: 'storage_unavailable', detail: String((error as Error)?.message ?? error).slice(0, 200) });
      result.ok = false;
      return result;
    }
    const head = this.chain.head(tenant);
    const anchor = this.chain.anchor(tenant);
    for (const entry of found) {
      const checkpoint = parse(entry.text);
      const where = { ...(entry.key ? { key: entry.key } : {}) };
      if (!checkpoint) { result.problems.push({ ...where, reason: 'unreadable' }); continue; }
      const at = { ...where, sequence: checkpoint.sequence, time: checkpoint.time };
      result.checked++;
      result.newest = { sequence: checkpoint.sequence, hash: checkpoint.head_hash, time: checkpoint.time, signed: Boolean(checkpoint.signature), keyVersion: checkpoint.key_version };
      if (checkpoint.tenant !== tenant || checkpoint.chain_uid !== chainUid(tenant)) { result.problems.push({ ...at, reason: 'wrong_tenant' }); continue; }
      if (this.signer) {
        if (!checkpoint.signature) result.problems.push({ ...at, reason: 'unsigned' });
        else {
          try { if (!await this.signer.verify(checkpointPayload(checkpoint), checkpoint.signature)) result.problems.push({ ...at, reason: 'bad_signature' }); }
          catch (error) { result.problems.push({ ...at, reason: 'signer_unavailable', detail: String((error as Error)?.message ?? error).slice(0, 200) }); }
        }
      }
      if (!head || checkpoint.sequence > head.sequence) { result.problems.push({ ...at, reason: 'ahead_of_chain' }); continue; }
      if (anchor && checkpoint.sequence <= anchor.sequence) {
        if (checkpoint.sequence === anchor.sequence && checkpoint.head_hash !== anchor.hash) result.problems.push({ ...at, reason: 'hash_mismatch' });
        else if (checkpoint.sequence < anchor.sequence) result.pruned++;
        continue;
      }
      const record = this.chain.page(tenant, { cursor: checkpoint.sequence - 1, limit: 1 })[0];
      if (!record || record.sequence !== checkpoint.sequence) result.problems.push({ ...at, reason: 'missing_record' });
      else if (record.hash !== checkpoint.head_hash) result.problems.push({ ...at, reason: 'hash_mismatch' });
    }
    const newestTime = result.newest ? Date.parse(result.newest.time) : undefined;
    const oldest = this.chain.page(tenant, { limit: 1 })[0];
    const due = newestTime !== undefined ? newestTime : oldest ? Date.parse(oldest.at) : undefined;
    if (due !== undefined && this.now().getTime() - due > staleAfterMs) result.problems.push({ reason: 'stale', ...(result.newest ? { time: result.newest.time } : {}) });
    result.ok = result.problems.length === 0;
    return result;
  }
}
