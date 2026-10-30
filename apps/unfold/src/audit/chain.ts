import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OcsfEvent } from './ocsf.ts';

/** The previous hash stored for a Tenant's first record, which has no `prev_event`. */
export const genesisHash = '0'.repeat(64);

/** The `chain_uid` of a Tenant's audit chain in each record's attestation. */
export const chainUid = (tenant: string): string => `unfold-audit:${tenant}`;

/** An OCSF fingerprint of a SHA-256 hash in hex over a record's JCS serialization. */
export const sha256Fingerprint = (value: string) => ({ algorithm_id: 3, algorithm: 'SHA-256', encoding_id: 1, encoding: 'Hex', serialization_id: 2, serialization: 'JCS', value });

/** Canonical JSON as RFC 8785 (JCS) writes JSON data: keys sorted by UTF-16 code units, no whitespace, `undefined` left out. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

type Attestation = { uid?: string; chain_uid?: string; prev_event?: { uid: string; type_uid?: number; fingerprint?: { value: string } }; fingerprint?: { value: string } };

const ours = (entry: Attestation | undefined): boolean => typeof entry?.chain_uid === 'string' && entry.chain_uid.startsWith('unfold-audit:');

/** The attestation of Unfold's chain in a record's `attestation_list` (the OCSF Record Integrity profile), if any. */
export function chainAttestation(event: Record<string, unknown>): Attestation | undefined {
  return (Array.isArray(event.attestation_list) ? event.attestation_list as Attestation[] : []).find(ours);
}

/**
 * A record's hash: SHA-256 in lower-case hex of the record's JCS serialization without its own attestation's
 * fingerprint. Its `prev_event.fingerprint` holds the previous record's hash, so each hash covers the chain before it.
 */
export function recordHash(event: Record<string, unknown>): string {
  const list = Array.isArray(event.attestation_list) ? event.attestation_list as Attestation[] : [];
  const body = { ...event, attestation_list: list.map(entry => ours(entry) ? Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'fingerprint')) : entry) };
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

/** One stored audit record of one Tenant's chain. */
export type StoredAuditRecord = { tenant: string; sequence: number; at: string; previousHash: string; hash: string; event: OcsfEvent };

/** Where a Tenant's chain starts after pruning: the sequence, hash, uid and type of the last record retention removed. */
export type AuditAnchor = { sequence: number; hash: string; uid: string; typeUid: number; pruned: number; at: string };

/** The result of checking one Tenant's chain from its newest anchor to its head. */
export type AuditVerification = {
  tenant: string;
  ok: boolean;
  checked: number;
  anchor: AuditAnchor | null;
  head: { sequence: number; hash: string } | null;
  break?: { sequence: number; reason: 'sequence_gap' | 'previous_hash' | 'hash' | 'unreadable' };
};

type Row = { tenant_id: string; seq: number; at: string; event: string; prev_hash: string; hash: string };
type Head = { sequence: number; hash: string; uid: string; typeUid: number };

const record = (row: Row): StoredAuditRecord => ({ tenant: row.tenant_id, sequence: Number(row.seq), at: row.at, previousHash: row.prev_hash, hash: row.hash, event: JSON.parse(row.event) });
const headQuery = "SELECT seq, hash, json_extract(event, '$.metadata.uid') AS uid, json_extract(event, '$.type_uid') AS type_uid FROM audit_records";

/**
 * Unfold's security audit in its SQLite store: one append-only hash chain per Tenant. Triggers refuse any update and
 * any delete that no retention anchor covers. Someone who can write the database file can still drop the triggers and
 * rewrite the chain, so tampering is detectable against a copy kept elsewhere, not prevented.
 */
export class AuditChain {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_records (tenant_id TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT NOT NULL, class_uid INTEGER NOT NULL, activity_id INTEGER NOT NULL, event TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (tenant_id, seq)) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS audit_records_by_time ON audit_records(tenant_id, at);
      CREATE TABLE IF NOT EXISTS audit_anchors (tenant_id TEXT NOT NULL, seq INTEGER NOT NULL, hash TEXT NOT NULL, uid TEXT NOT NULL, type_uid INTEGER NOT NULL, pruned INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, seq)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS audit_exports (tenant_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS audit_records_append_only BEFORE UPDATE ON audit_records BEGIN SELECT RAISE(ABORT, 'audit records are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_records_anchored_delete BEFORE DELETE ON audit_records WHEN NOT EXISTS (SELECT 1 FROM audit_anchors WHERE tenant_id = OLD.tenant_id AND seq >= OLD.seq) BEGIN SELECT RAISE(ABORT, 'audit records are removed only behind a retention anchor'); END;
      CREATE TRIGGER IF NOT EXISTS audit_anchors_append_only BEFORE UPDATE ON audit_anchors BEGIN SELECT RAISE(ABORT, 'audit anchors are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_anchors_kept BEFORE DELETE ON audit_anchors BEGIN SELECT RAISE(ABORT, 'audit anchors are never removed'); END;
    `);
  }

  private transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); throw error; }
  }

  /** The newest anchor of a Tenant's chain, or null before any pruning. */
  anchor(tenant: string): AuditAnchor | null {
    const row = this.db.prepare('SELECT seq, hash, uid, type_uid, pruned, at FROM audit_anchors WHERE tenant_id=? ORDER BY seq DESC LIMIT 1').get(tenant) as { seq: number; hash: string; uid: string; type_uid: number; pruned: number; at: string } | undefined;
    return row ? { sequence: Number(row.seq), hash: row.hash, uid: row.uid, typeUid: Number(row.type_uid), pruned: Number(row.pruned), at: row.at } : null;
  }

  /** The newest record's sequence, hash, uid and type, else the anchor's, else null for a Tenant with no records. */
  head(tenant: string): Head | null {
    const row = this.db.prepare(`${headQuery} WHERE tenant_id=? ORDER BY seq DESC LIMIT 1`).get(tenant) as { seq: number; hash: string; uid: string; type_uid: number } | undefined;
    if (row) return { sequence: Number(row.seq), hash: row.hash, uid: String(row.uid), typeUid: Number(row.type_uid) };
    const anchor = this.anchor(tenant);
    return anchor ? { sequence: anchor.sequence, hash: anchor.hash, uid: anchor.uid, typeUid: anchor.typeUid } : null;
  }

  /**
   * Appends `event` to `tenant`'s chain: completes `metadata.uid`, `metadata.tenant_uid`, `metadata.sequence` and the
   * `record_integrity` profile, and adds an attestation naming the chain, the previous record and its fingerprint, and
   * this record's own SHA-256 fingerprint.
   */
  append(tenant: string, event: OcsfEvent): StoredAuditRecord {
    return this.transaction(() => {
      const head = this.head(tenant);
      const sequence = (head?.sequence ?? 0) + 1;
      const previousHash = head?.hash ?? genesisHash;
      const profiles = [...new Set([...((event.metadata.profiles as string[] | undefined) ?? []), 'record_integrity'])].sort();
      const attestation = { uid: `${chainUid(tenant)}:${sequence}`, chain_uid: chainUid(tenant), ...(head ? { prev_event: { uid: head.uid, type_uid: head.typeUid, fingerprint: sha256Fingerprint(head.hash) } } : {}) };
      const body: OcsfEvent = { ...event, metadata: { ...event.metadata, uid: randomUUID(), tenant_uid: tenant, sequence, profiles }, attestation_list: [attestation] };
      const hash = recordHash(body);
      const stored: OcsfEvent = { ...body, attestation_list: [{ ...attestation, fingerprint: sha256Fingerprint(hash) }] };
      const at = new Date(stored.time).toISOString();
      this.db.prepare('INSERT INTO audit_records(tenant_id,seq,at,class_uid,activity_id,event,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?)').run(tenant, sequence, at, stored.class_uid, stored.activity_id, canonicalJson(stored), previousHash, hash);
      return { tenant, sequence, at, previousHash, hash, event: stored };
    });
  }

  /** Every Tenant with a chain. */
  tenants(): string[] {
    return (this.db.prepare('SELECT tenant_id FROM audit_records UNION SELECT tenant_id FROM audit_anchors ORDER BY 1').all() as { tenant_id: string }[]).map(row => row.tenant_id);
  }

  /** Up to `limit` records of a Tenant after sequence `cursor`, oldest first, from `since` (an ISO time) when given. */
  page(tenant: string, options: { cursor?: number; since?: string; limit: number }): StoredAuditRecord[] {
    const rows = options.since
      ? this.db.prepare('SELECT * FROM audit_records WHERE tenant_id=? AND seq>? AND at>=? ORDER BY seq LIMIT ?').all(tenant, options.cursor ?? 0, options.since, options.limit)
      : this.db.prepare('SELECT * FROM audit_records WHERE tenant_id=? AND seq>? ORDER BY seq LIMIT ?').all(tenant, options.cursor ?? 0, options.limit);
    return (rows as Row[]).map(record);
  }

  /** Checks a Tenant's chain from its newest anchor: contiguous sequences, each link to the previous hash, each recomputed hash. */
  verify(tenant: string): AuditVerification {
    const anchor = this.anchor(tenant);
    let expectedSequence = (anchor?.sequence ?? 0) + 1;
    let previous = anchor?.hash ?? genesisHash;
    let checked = 0;
    const result = (extra: Partial<AuditVerification>): AuditVerification => ({ tenant, ok: !extra.break, checked, anchor, head: checked || anchor ? { sequence: expectedSequence - 1, hash: previous } : null, ...extra });
    for (const row of this.db.prepare('SELECT * FROM audit_records WHERE tenant_id=? AND seq>? ORDER BY seq').iterate(tenant, anchor?.sequence ?? 0) as Iterable<Row>) {
      const sequence = Number(row.seq);
      if (sequence !== expectedSequence) return result({ break: { sequence: expectedSequence, reason: 'sequence_gap' } });
      let event: OcsfEvent;
      try { event = JSON.parse(row.event); } catch { return result({ break: { sequence, reason: 'unreadable' } }); }
      const own = chainAttestation(event);
      const linked = own?.prev_event?.fingerprint?.value ?? genesisHash;
      if (row.prev_hash !== previous || linked !== previous || (previous === genesisHash) === Boolean(own?.prev_event)) return result({ break: { sequence, reason: 'previous_hash' } });
      if (event.metadata?.sequence !== sequence || event.metadata.tenant_uid !== tenant || own?.fingerprint?.value !== row.hash || recordHash(event) !== row.hash) return result({ break: { sequence, reason: 'hash' } });
      previous = row.hash;
      expectedSequence++;
      checked++;
    }
    return result({});
  }

  /** Removes every Tenant's records older than `before` (an ISO time), each behind a new anchor; returns what each lost. */
  prune(before: string, now = new Date()): { tenant: string; pruned: number; anchor: AuditAnchor }[] {
    const pruned: { tenant: string; pruned: number; anchor: AuditAnchor }[] = [];
    for (const tenant of this.tenants()) {
      this.transaction(() => {
        const last = this.db.prepare(`${headQuery} WHERE tenant_id=? AND at<? ORDER BY seq DESC LIMIT 1`).get(tenant, before) as { seq: number; hash: string; uid: string; type_uid: number } | undefined;
        if (!last) return;
        const count = Number((this.db.prepare('SELECT COUNT(*) AS count FROM audit_records WHERE tenant_id=? AND seq<=?').get(tenant, last.seq) as { count: number }).count);
        const anchor: AuditAnchor = { sequence: Number(last.seq), hash: last.hash, uid: String(last.uid), typeUid: Number(last.type_uid), pruned: count, at: now.toISOString() };
        if ((this.anchor(tenant)?.sequence ?? 0) < anchor.sequence) this.db.prepare('INSERT INTO audit_anchors(tenant_id,seq,hash,uid,type_uid,pruned,at) VALUES(?,?,?,?,?,?,?)').run(tenant, anchor.sequence, anchor.hash, anchor.uid, anchor.typeUid, anchor.pruned, anchor.at);
        this.db.prepare('DELETE FROM audit_records WHERE tenant_id=? AND seq<=?').run(tenant, anchor.sequence);
        pruned.push({ tenant, pruned: count, anchor });
      });
    }
    return pruned;
  }

  /** The last sequence of a Tenant the OTLP collector accepted, 0 before the first export. */
  exportedThrough(tenant: string): number {
    const row = this.db.prepare('SELECT seq FROM audit_exports WHERE tenant_id=?').get(tenant) as { seq: number } | undefined;
    return row ? Number(row.seq) : 0;
  }

  /** Records that the collector accepted a Tenant's records through `sequence`. */
  markExported(tenant: string, sequence: number, now = new Date()): void {
    this.db.prepare('INSERT INTO audit_exports(tenant_id,seq,at) VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET seq=MAX(seq, excluded.seq), at=excluded.at').run(tenant, sequence, now.toISOString());
  }
}
