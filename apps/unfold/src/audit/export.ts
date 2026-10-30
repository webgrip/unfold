import { otlpLogsPayload, type OtlpLogRecord } from '../insight.ts';
import { chainAttestation, recordHash, type AuditChain, type StoredAuditRecord } from './chain.ts';
import { ocsfVersion, productVersion, type OcsfEvent } from './ocsf.ts';

/** The OTLP instrumentation scope of exported audit records. */
export const auditScope = 'unfold.audit';
/** The most records one OTLP request or one NDJSON page carries. */
export const exportBatch = 200;
export const maxPage = 1000;

/** The NDJSON body of a page of records: one OCSF event per line, each line ending in a newline. */
export function ndjson(records: StoredAuditRecord[]): string {
  return records.map(record => `${JSON.stringify(record.event)}\n`).join('');
}

/**
 * Re-verifies exported events without Unfold, in sequence order: each event's own attestation fingerprint must be the
 * SHA-256 of its JCS serialization without that fingerprint, and its `prev_event.fingerprint` must be the fingerprint
 * of the event before it. `previousHash` is the hash before the first event: a retention anchor's or the last one a
 * reader already checked; without it the first event must be its chain's genesis.
 */
export function verifyExported(events: OcsfEvent[], previousHash?: string): { ok: boolean; checked: number; break?: { sequence: number; reason: 'previous_hash' | 'hash' } } {
  let previous = previousHash;
  let checked = 0;
  for (const event of events) {
    const own = chainAttestation(event);
    const sequence = Number(event.metadata?.sequence ?? checked + 1);
    if (!own || own.prev_event?.fingerprint?.value !== previous) return { ok: false, checked, break: { sequence, reason: 'previous_hash' } };
    if (!own.fingerprint || recordHash(event) !== own.fingerprint.value) return { ok: false, checked, break: { sequence, reason: 'hash' } };
    previous = own.fingerprint.value;
    checked++;
  }
  return { ok: true, checked };
}

const otlpSeverity: Record<number, [number, string]> = { 1: [9, 'INFO'], 2: [10, 'INFO2'], 3: [13, 'WARN'], 4: [17, 'ERROR'], 5: [21, 'FATAL'], 6: [21, 'FATAL'] };

/** One stored record as an OTLP log record: the OCSF event as JSON in the body, its class and place in the chain as attributes. */
export function otlpRecord(record: StoredAuditRecord): OtlpLogRecord {
  const event = record.event;
  const [severityNumber, severityText] = otlpSeverity[Number(event.severity_id)] ?? [9, 'INFO'];
  return {
    timeMs: event.time, severityNumber, severityText, body: JSON.stringify(event),
    attributes: { 'event.name': 'unfold.audit', 'ocsf.version': ocsfVersion, 'ocsf.class_uid': event.class_uid, 'ocsf.activity_id': event.activity_id, 'ocsf.type_uid': Number(event.type_uid), 'unfold.tenant': record.tenant, 'unfold.audit.sequence': record.sequence, 'unfold.audit.hash': record.hash },
  };
}

/** Where the OTLP exporter sends: an OTLP/HTTP JSON logs endpoint and the headers it needs, such as an authorization. */
export type AuditOtlpTarget = { url: string; headers: Record<string, string> };

/**
 * Sends each Tenant's new records, oldest first, to the OTLP endpoint while `enabled(tenant)` holds. A batch the
 * collector refuses stays unsent and is retried from the last accepted sequence on the next flush; the records stay.
 */
export class AuditOtlpExporter {
  private readonly chain: AuditChain;
  private readonly target: AuditOtlpTarget;
  private readonly enabled: (tenant: string) => Promise<boolean>;
  private readonly environment: string;
  private readonly fetcher: typeof fetch;
  private readonly warn: (message: string) => void;
  private flushing: Promise<void> | undefined;
  private again = false;

  constructor(options: { chain: AuditChain; target: AuditOtlpTarget; enabled: (tenant: string) => Promise<boolean>; environment: string; fetch?: typeof fetch; warn: (message: string) => void }) {
    this.chain = options.chain;
    this.target = options.target;
    this.enabled = options.enabled;
    this.environment = options.environment;
    this.fetcher = options.fetch ?? fetch;
    this.warn = options.warn;
  }

  /** Sends what is pending; a flush asked for while one runs runs once more after it. */
  flush(): Promise<void> {
    if (this.flushing) { this.again = true; return this.flushing; }
    this.flushing = (async () => {
      try {
        do { this.again = false; await this.sendAll(); } while (this.again);
      } finally { this.flushing = undefined; }
    })();
    return this.flushing;
  }

  private async sendAll(): Promise<void> {
    for (const tenant of this.chain.tenants()) {
      if (!await this.enabled(tenant)) continue;
      for (;;) {
        const records = this.chain.page(tenant, { cursor: this.chain.exportedThrough(tenant), limit: exportBatch });
        if (!records.length) break;
        if (!await this.send(records)) return;
        this.chain.markExported(tenant, records[records.length - 1].sequence);
        if (records.length < exportBatch) break;
      }
    }
  }

  private async send(records: StoredAuditRecord[]): Promise<boolean> {
    try {
      const body = otlpLogsPayload(auditScope, productVersion, this.environment, records.map(otlpRecord));
      const response = await this.fetcher(this.target.url, { method: 'POST', headers: { ...this.target.headers, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`collector answered HTTP ${response.status}`);
      return true;
    } catch (error) {
      this.warn(String((error as Error)?.message ?? error).slice(0, 200));
      return false;
    }
  }
}
