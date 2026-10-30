import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { WorkItemFacts } from './cards/facts.ts';
import { BillingSendError, billingCsv, billingSizes, billingTarget, priceCents, ublInvoiceLines, type BilledAcceptance, type BillingExporter, type BillingExporterDefinition, type BillingLine, type BillingSettings, type BillingSize, type BillingTarget } from './billing-export.ts';
import { economicsPageBound, economicsWindows, type FactsSource } from './delivery-economics.ts';
import { defaultAcceptanceCalendar, deliveryRow, type AcceptanceCalendar } from './delivery-ledger.ts';
import { ownership, validTenancyId, type Ownership } from './tenancy.ts';
import { actsFor, reaches, type TenantScope } from './tenant-scope.ts';
import type { User } from './types.ts';
import { JobQueue } from './jobs/queue.ts';
import { JobWorker, type JobOutcome } from './jobs/worker.ts';

/** The job kind of sending one billing line. At most once: a lost lease makes it dead, never sends it again. */
export const billingLineJob = 'billing.line';

/**
 * Where a line stands. `pending` waits for its next attempt, `needs_price` waits for an administrator to enter its price,
 * `sending` is being handed over, `sent` was taken by the tool, `failed` needs a person, and `cancelled` was reversed
 * before it was ever sent.
 */
export type BillingLineState = 'pending' | 'needs_price' | 'sending' | 'sent' | 'failed' | 'cancelled';
/** One line in Unfold's billing outbox, with every attempt's outcome. */
export type BillingRecord = {
  id: string; line: BillingLine; exporter: string; state: BillingLineState;
  attempts: number; nextAttemptAt: string | null; lastError: string | null; uncertain: boolean;
  remoteId: string | null; createdAt: string; updatedAt: string; sentAt: string | null;
  revertDetected: { reference: string; mergedAt: string } | null; reversedBy: string | null; cancelReason: string | null;
};
/** Where one Client's lines go, and the Agency's own price for them. `client` is null for the Tenant's work that no Client owns. */
export type BillingMapping = {
  tenant: string; client: string | null; target: BillingTarget;
  price: { perTicketCents: number | null; perSizeCents: Partial<Record<BillingSize, number>> };
  since: string; updatedAt: string; updatedBy: string;
};

/** The limits the outbox works within. */
export const billingLimits = { firstRetryMs: 60_000, lastRetryGapMs: 3_600_000, automaticAttempts: 8, sendsPerSweep: 30, reversalDays: 14, listed: 200, reasonLength: 500 } as const;

/** A billing request Unfold refuses, with the HTTP status and code it answers. */
export class BillingError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'BillingError'; this.status = status; this.code = code; }
}
const fail = (status: number, code: string, message: string): never => { throw new BillingError(status, code, message); };

/** The billing outbox and the Client mappings, in the workbench database. */
export class BillingStore {
  private readonly db: DatabaseSync;
  /** The durable job queue that holds each pending line's next attempt. */
  readonly jobs: JobQueue;
  constructor(db: DatabaseSync) {
    this.db = db;
    this.jobs = new JobQueue(db);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS billing_mappings (tenant TEXT NOT NULL, client TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (tenant, client));
      CREATE TABLE IF NOT EXISTS billing_lines (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, tenant TEXT NOT NULL, client TEXT NOT NULL, work_item_id TEXT NOT NULL, state TEXT NOT NULL, next_attempt_at TEXT, created_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS billing_lines_due ON billing_lines(state, next_attempt_at);
      CREATE INDEX IF NOT EXISTS billing_lines_created ON billing_lines(created_at);
    `);
    for (const record of this.inState('pending')) this.queue(record);
  }
  private queue(record: BillingRecord): void {
    if (record.state !== 'pending') return;
    const now = Date.parse(record.updatedAt);
    this.jobs.enqueue(billingLineJob, record.id, { lineId: record.id }, now, { runAt: record.nextAttemptAt ? Date.parse(record.nextAttemptAt) : now, guarantee: 'at_most_once', maxAttempts: 64, repeat: 'when_finished' });
  }
  /** Every mapping, by Tenant then Client. */
  mappings(): BillingMapping[] { return (this.db.prepare('SELECT body FROM billing_mappings ORDER BY tenant, client').all() as { body: string }[]).map(row => JSON.parse(row.body)); }
  /** The mapping of `owner`, or undefined. */
  mapping(owner: Ownership): BillingMapping | undefined {
    const row = this.db.prepare('SELECT body FROM billing_mappings WHERE tenant=? AND client=?').get(owner.tenant, owner.client ?? '') as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  /** Saves `mapping`, replacing the one of the same owner. */
  setMapping(mapping: BillingMapping): void {
    this.db.prepare('INSERT INTO billing_mappings(tenant,client,updated_at,body) VALUES(?,?,?,?) ON CONFLICT(tenant,client) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body').run(mapping.tenant, mapping.client ?? '', mapping.updatedAt, JSON.stringify(mapping));
  }
  /** Removes the mapping of `owner`; true when there was one. */
  deleteMapping(owner: Ownership): boolean { return Number(this.db.prepare('DELETE FROM billing_mappings WHERE tenant=? AND client=?').run(owner.tenant, owner.client ?? '').changes) === 1; }
  /** Adds `record` unless a line with its key exists; true when it was added. */
  add(record: BillingRecord): boolean {
    const added = Number(this.db.prepare('INSERT OR IGNORE INTO billing_lines(id,key,tenant,client,work_item_id,state,next_attempt_at,created_at,body) VALUES(?,?,?,?,?,?,?,?,?)').run(record.id, record.line.key, record.line.tenant, record.line.client ?? '', record.line.workItemId, record.state, record.nextAttemptAt, record.createdAt, JSON.stringify(record)).changes) === 1;
    if (added) this.queue(record);
    return added;
  }
  /** Saves a changed `record`. */
  save(record: BillingRecord): void {
    this.db.prepare('UPDATE billing_lines SET state=?, next_attempt_at=?, body=? WHERE id=?').run(record.state, record.nextAttemptAt, JSON.stringify(record), record.id);
    this.queue(record);
  }
  /** Moves `record` from `from` to its own state, only when it is still in `from`; true when this caller moved it. */
  claim(record: BillingRecord, from: BillingLineState): boolean {
    return Number(this.db.prepare('UPDATE billing_lines SET state=?, next_attempt_at=?, body=? WHERE id=? AND state=?').run(record.state, record.nextAttemptAt, JSON.stringify(record), record.id, from).changes) === 1;
  }
  /** The line `id`, or undefined. */
  get(id: string): BillingRecord | undefined { const row = this.db.prepare('SELECT body FROM billing_lines WHERE id=?').get(id) as { body: string } | undefined; return row ? JSON.parse(row.body) : undefined; }
  /** The line with `key`, or undefined. */
  byKey(key: string): BillingRecord | undefined { const row = this.db.prepare('SELECT body FROM billing_lines WHERE key=?').get(key) as { body: string } | undefined; return row ? JSON.parse(row.body) : undefined; }
  /** Lines in `state`, oldest first. */
  inState(state: BillingLineState): BillingRecord[] { return (this.db.prepare('SELECT body FROM billing_lines WHERE state=? ORDER BY created_at, id').all(state) as { body: string }[]).map(row => JSON.parse(row.body)); }
  /** The newest lines, newest first, at most `limit`. */
  recent(limit: number): BillingRecord[] { return (this.db.prepare('SELECT body FROM billing_lines ORDER BY created_at DESC, id DESC LIMIT ?').all(limit) as { body: string }[]).map(row => JSON.parse(row.body)); }
}

/** What the billing service needs from the rest of Unfold. */
export type BillingOptions = {
  settings?: BillingSettings; definition?: BillingExporterDefinition; exporter?: BillingExporter;
  facts?: FactsSource; tenants: TenantScope; enabled: (tenant: string) => Promise<boolean>;
  calendar?: AcceptanceCalendar; demo: boolean; now?: () => number; schedule?: boolean;
  log?: (level: 'info' | 'warn', event: string, fields: Record<string, unknown>) => void;
};
/** What one sync did: lines added, Work Items without a mapping, and lines sent or failed by the sweep that followed. */
export type BillingSyncResult = { added: number; unmapped: number; sent: number; failed: number; waiting: number };

const day = 86_400_000;
const dateText = /^\d{4}-\d{2}-\d{2}$/;
const billed = new Set<string>(['merged', 'approved', 'silent']);
const ownerOf = (line: BillingLine): Ownership => ({ tenant: line.tenant, ...(line.client ? { client: line.client } : {}) });
const pull = (facts: WorkItemFacts, url: string | null) => facts.pullRequests.find(entry => entry.shiftId !== null && entry.url === url);

/**
 * Writes one line per accepted Work Item, and one credit line per confirmed Reversal, into the Agency's billing tool
 * through the configured exporter. A line is keyed per Work Item and per Reversal, saved before its first attempt, and
 * sent at most once: Unfold retries only when the tool certainly took nothing, and leaves any other failure to a person.
 */
export class BillingService {
  readonly store: BillingStore;
  private readonly options: BillingOptions;
  private readonly now: () => number;
  private timers: NodeJS.Timeout[] = [];
  private readonly jobs: JobWorker;
  private tally: Pick<BillingSyncResult, 'sent' | 'failed' | 'waiting'> | undefined;

  constructor(store: BillingStore, options: BillingOptions) {
    this.store = store;
    this.options = options;
    this.now = options.now ?? Date.now;
    this.jobs = new JobWorker(store.jobs, { clock: this.now, ...(options.log ? { log: options.log } : {}) });
    this.jobs.register<{ lineId: string }>({ kind: billingLineJob, leaseMs: 300_000, retainMs: 90 * day, run: job => this.sendJob(job.payload.lineId) });
    for (const record of store.inState('sending')) this.finish(record, { state: 'failed', uncertain: true, lastError: 'Unfold stopped while it was sending this line, so the tool may have it. Check the tool before you send it again.' });
    if (options.schedule !== false && this.active) {
      const sync = () => { void this.sync().catch(error => this.log('warn', 'billing.sync_failed', { message: String((error as Error).message).slice(0, 200) })); };
      const send = () => { void this.sendDue().catch(error => this.log('warn', 'billing.send_failed', { message: String((error as Error).message).slice(0, 200) })); };
      this.timers.push(setTimeout(sync, 60_000).unref(), setInterval(sync, options.settings!.syncMinutes * 60_000).unref(), setInterval(send, 60_000).unref());
      this.timers.push(setInterval(() => store.jobs.prune(this.now() - 90 * day, billingLineJob), 3_600_000).unref());
    }
  }

  /** Whether billing is configured with an exporter, outside the demo. */
  get active(): boolean { return !this.options.demo && Boolean(this.options.settings && this.options.exporter); }

  /** Stops the timers. */
  stop(): void { for (const timer of this.timers) clearTimeout(timer); this.timers = []; }

  private log(level: 'info' | 'warn', event: string, fields: Record<string, unknown>): void {
    if (this.options.log) this.options.log(level, event, fields);
    else console.error(JSON.stringify({ level, event, ...fields }));
  }

  private iso(ms = this.now()): string { return new Date(ms).toISOString(); }

  private price(mapping: BillingMapping, size: BillingSize | null): number | null {
    if (size && mapping.price.perSizeCents[size] !== undefined) return mapping.price.perSizeCents[size]!;
    return mapping.price.perTicketCents;
  }

  /**
   * Reads the delivery facts of the last 30 days, adds a line for each Work Item accepted on or after its mapping's
   * `since` date whose Tenant has `billing.export` on, notes reverts found within 14 days of a sent line's Acceptance,
   * then sends what is due.
   */
  async sync(): Promise<BillingSyncResult> {
    const result: BillingSyncResult = { added: 0, unmapped: 0, sent: 0, failed: 0, waiting: 0 };
    if (!this.active) return result;
    if (this.options.facts) {
      const until = this.now();
      const since = until - economicsWindows['30d'];
      const seen = new Set<string>();
      let before: string | undefined;
      for (let page = 0; page < economicsPageBound; page++) {
        const found = await this.options.facts.factsPage({ since: this.iso(since), limit: 25, ...(before ? { before } : {}) }, true);
        for (const facts of found.facts) {
          if (seen.has(facts.workItem.id)) continue;
          seen.add(facts.workItem.id);
          const outcome = await this.consider(facts, until);
          if (outcome === 'added') result.added++;
          if (outcome === 'unmapped') result.unmapped++;
        }
        if (!found.nextBefore) break;
        before = found.nextBefore;
      }
    }
    return { ...result, ...(await this.sendDue()) };
  }

  private async consider(facts: WorkItemFacts, until: number): Promise<'added' | 'unmapped' | 'skipped'> {
    const row = deliveryRow(facts, { until, calendar: this.options.calendar ?? defaultAcceptanceCalendar });
    if (!billed.has(row.acceptance.kind) || !row.acceptance.at) return 'skipped';
    const owner = this.options.tenants.workItemOwner(facts.workItem.target);
    if (!owner || !(await this.options.enabled(owner.tenant))) return 'skipped';
    const key = `unfold:${owner.tenant}:${facts.workItem.id}:acceptance`;
    const existing = this.store.byKey(key);
    if (existing) { this.noteRevert(existing, facts); return 'skipped'; }
    const mapping = this.store.mapping(owner);
    if (!mapping) return 'unmapped';
    if (row.acceptance.at.slice(0, 10) < mapping.since) return 'skipped';
    const unitPriceCents = this.price(mapping, null);
    const line: BillingLine = {
      key, kind: 'acceptance', tenant: owner.tenant, client: owner.client ?? null,
      workItemId: facts.workItem.id, externalRef: facts.workItem.externalRef, title: facts.workItem.title, workItemUrl: facts.workItem.url || null,
      acceptance: { kind: row.acceptance.kind as BilledAcceptance, at: row.acceptance.at, pullRequestUrl: row.acceptance.pullRequestUrl },
      size: null, quantity: 1, unitPriceCents, currency: this.options.settings!.currency,
    };
    const at = this.iso();
    const added = this.store.add({ id: randomUUID(), line, exporter: this.options.settings!.exporter, state: unitPriceCents === null ? 'needs_price' : 'pending', attempts: 0, nextAttemptAt: null, lastError: null, uncertain: false, remoteId: null, createdAt: at, updatedAt: at, sentAt: null, revertDetected: null, reversedBy: null, cancelReason: null });
    return added ? 'added' : 'skipped';
  }

  private noteRevert(record: BillingRecord, facts: WorkItemFacts): void {
    if (record.revertDetected || record.line.kind !== 'acceptance') return;
    const accepted = Date.parse(record.line.acceptance.at);
    const revert = pull(facts, record.line.acceptance.pullRequestUrl)?.reverts.find(entry => entry.mergedAt && Date.parse(entry.mergedAt) - accepted <= billingLimits.reversalDays * day);
    if (!revert?.mergedAt) return;
    this.store.save({ ...record, revertDetected: { reference: `${revert.owner}/${revert.repo}#${revert.number}`, mergedAt: revert.mergedAt }, updatedAt: this.iso() });
  }

  /**
   * Sends the lines that are due through the job queue, one at a time and at most `billingLimits.sendsPerSweep`; a
   * line whose Tenant has its flag off waits a minute and is not counted.
   */
  async sendDue(): Promise<Pick<BillingSyncResult, 'sent' | 'failed' | 'waiting'>> {
    const tally = { sent: 0, failed: 0, waiting: 0 };
    if (!this.active) return tally;
    this.tally = tally;
    try { await this.jobs.drain(billingLineJob, billingLimits.sendsPerSweep); } finally { this.tally = undefined; }
    return tally;
  }

  private async sendJob(id: string): Promise<JobOutcome> {
    const record = this.store.get(id);
    const now = this.now();
    if (!record || record.state !== 'pending') return { done: true };
    if (!this.active) return { later: now + 3_600_000 };
    if (record.nextAttemptAt && Date.parse(record.nextAttemptAt) > now) return { later: Date.parse(record.nextAttemptAt) };
    if (!(await this.options.enabled(record.line.tenant))) return { later: now + 60_000 };
    const after = await this.attempt(record);
    const tally = this.tally ?? { sent: 0, failed: 0, waiting: 0 };
    if (after.state === 'sent') { tally.sent++; return { done: true }; }
    if (after.state === 'failed') { tally.failed++; return { dead: after.lastError ?? 'failed' }; }
    tally.waiting++;
    if (after.state === 'pending') return { retry: after.lastError ?? 'retrying', afterMs: Math.max(0, Date.parse(after.nextAttemptAt ?? '') - this.now() || 0) };
    return { done: true };
  }

  private finish(record: BillingRecord, change: Partial<BillingRecord>): BillingRecord {
    const next = { ...record, ...change, updatedAt: this.iso() };
    this.store.save(next);
    return next;
  }

  private async attempt(record: BillingRecord): Promise<BillingRecord> {
    const mapping = this.store.mapping(ownerOf(record.line));
    if (!mapping) return this.finish(record, { state: 'failed', uncertain: false, lastError: 'This Client has no billing mapping any more. Map it again, then send the line again.' });
    if (record.line.unitPriceCents === null) return this.finish(record, { state: 'needs_price', nextAttemptAt: null });
    const sending: BillingRecord = { ...record, state: 'sending', nextAttemptAt: null, updatedAt: this.iso() };
    if (!this.store.claim(sending, 'pending')) return this.store.get(record.id) ?? record;
    const attempts = record.attempts + 1;
    try {
      const sent = await this.options.exporter!.send({ ...record.line, unitPriceCents: record.line.unitPriceCents }, mapping.target);
      this.log('info', 'billing.line_sent', { line: record.id, kind: record.line.kind, attempts });
      return this.finish(sending, { state: 'sent', attempts, remoteId: sent.remoteId, sentAt: this.iso(), lastError: null, uncertain: false });
    } catch (error) {
      const outcome = error instanceof BillingSendError ? error.outcome : 'uncertain';
      const message = error instanceof BillingSendError ? error.message : `The exporter failed: ${String((error as Error)?.message ?? error).slice(0, 200)}. The line may have been created.`;
      this.log('warn', 'billing.line_failed', { line: record.id, attempts, outcome, message });
      if (outcome === 'retry' && attempts < billingLimits.automaticAttempts) {
        const gap = Math.min(billingLimits.lastRetryGapMs, billingLimits.firstRetryMs * 2 ** (attempts - 1));
        return this.finish(sending, { state: 'pending', attempts, nextAttemptAt: this.iso(this.now() + gap), lastError: message, uncertain: false });
      }
      return this.finish(sending, { state: 'failed', attempts, nextAttemptAt: null, lastError: message, uncertain: outcome === 'uncertain' });
    }
  }

  private visible(user: User, owner: Ownership, change = false): boolean {
    if (user.role !== 'admin') return false;
    if (!this.options.tenants.enforced) return true;
    return change ? actsFor(user, owner) : reaches(user, owner);
  }

  private record(user: User, id: string, change = true): BillingRecord {
    const record = this.store.get(id);
    if (!record || !this.visible(user, ownerOf(record.line), change)) fail(404, 'billing_line_not_found', 'There is no such billing line. Choose one from the billing page.');
    return record!;
  }

  private requireAdmin(user: User): void { if (user.role !== 'admin') fail(403, 'forbidden', 'Only administrators see and change billing.'); }
  private requireActive(): void {
    if (this.options.demo) fail(409, 'billing_demo', 'The demo has no billing: it never writes a line into a real tool.');
    if (!this.active) fail(409, 'billing_unconfigured', 'Billing is not configured. Add a billing block to the configuration first.');
  }

  /** The Owners `user` may map: the default Tenant and every Tenant and Client a registered repository or task source names. */
  private owners(user: User): Ownership[] {
    const found = new Map<string, Ownership>();
    const add = (owner: Ownership) => { if (this.visible(user, owner)) found.set(`${owner.tenant}/${owner.client ?? ''}`, owner); };
    add({ tenant: 'default' });
    for (const entry of [...this.options.tenants.repositories(user), ...this.options.tenants.sources(user)]) { const owner = ownership(entry); add({ tenant: owner.tenant }); add(owner); }
    for (const mapping of this.store.mappings()) add({ tenant: mapping.tenant, ...(mapping.client ? { client: mapping.client } : {}) });
    return [...found.values()].sort((a, b) => a.tenant.localeCompare(b.tenant) || (a.client ?? '').localeCompare(b.client ?? ''));
  }

  /** What the Billing settings page shows `user`: whether billing is on, the exporter's fields, every Owner with its mapping, and the newest lines. */
  async view(user: User): Promise<Record<string, unknown>> {
    this.requireAdmin(user);
    if (this.options.demo) return { demo: true };
    const definition = this.options.definition;
    const owners = await Promise.all(this.owners(user).map(async owner => ({ tenant: owner.tenant, client: owner.client ?? null, enabled: this.active ? await this.options.enabled(owner.tenant) : false, mapping: this.store.mapping(owner) ?? null })));
    const lines = this.store.recent(billingLimits.listed).filter(record => this.visible(user, ownerOf(record.line)));
    const counts = Object.fromEntries((['pending', 'needs_price', 'sending', 'sent', 'failed', 'cancelled'] as const).map(state => [state, lines.filter(record => record.state === state).length]));
    return {
      demo: false, configured: this.active,
      exporter: definition ? { name: definition.name, title: definition.title, targetFields: definition.targetFields } : null,
      currency: this.options.settings?.currency ?? null, sizes: billingSizes, reversalDays: billingLimits.reversalDays,
      owners, lines, counts,
    };
  }

  /** Saves the mapping of one Owner from `data`: `{ tenant, client?, target, price: { perTicket?, perSize? }, since? }`. */
  setMapping(user: User, data: Record<string, unknown>): BillingMapping {
    this.requireAdmin(user);
    this.requireActive();
    const tenant = data.tenant ?? 'default';
    const client = data.client === undefined || data.client === null || data.client === '' ? null : data.client;
    if (!validTenancyId(tenant) || (client !== null && !validTenancyId(client))) fail(400, 'billing_owner', 'Name the Tenant and Client by their ids.');
    const owner: Ownership = { tenant: tenant as string, ...(client ? { client: client as string } : {}) };
    if (!this.visible(user, owner, true)) fail(404, 'billing_owner', 'No such Tenant or Client.');
    const read = <T>(work: () => T): T => { try { return work(); } catch (error) { return fail(400, 'billing_mapping', (error as Error).message); } };
    const target = read(() => billingTarget(data.target, this.options.definition!.targetFields));
    const price = (data.price && typeof data.price === 'object' && !Array.isArray(data.price) ? data.price : {}) as Record<string, unknown>;
    const perTicketCents = price.perTicket === undefined || price.perTicket === null || price.perTicket === '' ? null : read(() => priceCents(price.perTicket, 'Price per ticket'));
    const perSizeCents: Partial<Record<BillingSize, number>> = {};
    const sizes = (price.perSize && typeof price.perSize === 'object' ? price.perSize : {}) as Record<string, unknown>;
    for (const size of billingSizes) if (sizes[size] !== undefined && sizes[size] !== null && sizes[size] !== '') perSizeCents[size] = read(() => priceCents(sizes[size], `Price for ${size}`));
    if (perTicketCents === null && !Object.keys(perSizeCents).length) fail(400, 'billing_mapping', 'Enter your price per ticket, or per Size.');
    const since = data.since === undefined || data.since === '' ? this.iso().slice(0, 10) : data.since;
    if (typeof since !== 'string' || !dateText.test(since) || Number.isNaN(Date.parse(`${since}T00:00:00Z`))) fail(400, 'billing_mapping', 'Give the first acceptance date to bill as YYYY-MM-DD.');
    const mapping: BillingMapping = { tenant: owner.tenant, client: owner.client ?? null, target, price: { perTicketCents, perSizeCents }, since: since as string, updatedAt: this.iso(), updatedBy: user.id };
    this.store.setMapping(mapping);
    return mapping;
  }

  /** Removes the mapping of one Owner. Lines already saved keep their state; pending ones fail until the Owner is mapped again. */
  deleteMapping(user: User, tenant: string, client: string | null): void {
    this.requireAdmin(user);
    const owner: Ownership = { tenant, ...(client ? { client } : {}) };
    if (!validTenancyId(tenant) || (client !== null && !validTenancyId(client)) || !this.visible(user, owner, true) || !this.store.deleteMapping(owner)) fail(404, 'billing_owner', 'No such mapping.');
  }

  /**
   * Sends a failed line again. A line whose outcome is uncertain is sent again only when `checked` says a person looked
   * in the tool and found no such line, because the tool may already have it.
   */
  async sendAgain(user: User, id: string, data: Record<string, unknown>): Promise<BillingRecord> {
    this.requireAdmin(user);
    this.requireActive();
    const record = this.record(user, id);
    if (record.state !== 'failed') fail(409, 'billing_not_failed', 'Only a failed line can be sent again.');
    if (record.uncertain && data.checked !== true) fail(409, 'billing_check_first', 'The tool may already have this line. Check it there first, then confirm that it is missing.');
    const ready = this.finish(record, { state: 'pending', attempts: 0, nextAttemptAt: null, uncertain: false });
    return this.attempt(ready);
  }

  /** Records that a person found an uncertain line in the tool, so it counts as sent and is never sent again. */
  markSent(user: User, id: string): BillingRecord {
    this.requireAdmin(user);
    this.requireActive();
    const record = this.record(user, id);
    if (record.state !== 'failed' || !record.uncertain) fail(409, 'billing_not_uncertain', 'Only a line whose outcome is uncertain can be marked as found in the tool.');
    return this.finish(record, { state: 'sent', sentAt: this.iso(), lastError: null, uncertain: false });
  }

  /** Sets the price of a line that waits for one, in the Agency's own price, then sends it. */
  async setPrice(user: User, id: string, data: Record<string, unknown>): Promise<BillingRecord> {
    this.requireAdmin(user);
    this.requireActive();
    const record = this.record(user, id);
    if (record.state !== 'needs_price') fail(409, 'billing_priced', 'This line already has its price.');
    let unitPriceCents: number;
    try { unitPriceCents = priceCents(data.price); } catch (error) { return fail(400, 'billing_price', (error as Error).message); }
    const size = billingSizes.includes(data.size as BillingSize) ? data.size as BillingSize : record.line.size;
    return this.attempt(this.finish(record, { state: 'pending', line: { ...record.line, unitPriceCents, size }, nextAttemptAt: null }));
  }

  /**
   * Reverses an accepted line within 14 days of its Acceptance, for the reason a person gives (system ADR-0006). A sent
   * line gets one credit line with quantity -1, keyed after it; a line never sent is cancelled instead.
   */
  async reverse(user: User, id: string, data: Record<string, unknown>): Promise<BillingRecord> {
    this.requireAdmin(user);
    this.requireActive();
    const record = this.record(user, id);
    if (record.line.kind !== 'acceptance') fail(409, 'billing_not_reversible', 'Only an accepted ticket’s line can be reversed.');
    if (record.reversedBy || record.state === 'cancelled') fail(409, 'billing_reversed', 'This line is already reversed.');
    const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
    if (!reason || reason.length > billingLimits.reasonLength) fail(400, 'billing_reason', `Say which defect inside the Acceptance Conditions the revert fixed, in at most ${billingLimits.reasonLength} characters.`);
    const revertUrl = typeof data.revertUrl === 'string' && data.revertUrl.trim() ? data.revertUrl.trim() : null;
    if (revertUrl && (!/^https?:\/\//.test(revertUrl) || revertUrl.length > 500)) fail(400, 'billing_reason', 'The revert link must be an http or https address.');
    if (this.now() - Date.parse(record.line.acceptance.at) > billingLimits.reversalDays * day) fail(409, 'billing_reversal_late', `A Reversal must come within ${billingLimits.reversalDays} days of Acceptance.`);
    if (record.state === 'sending' || (record.state === 'failed' && record.uncertain)) fail(409, 'billing_check_first', 'The tool may already have this line. Check it there and resolve the line first.');
    if (record.state !== 'sent') return this.finish(record, { state: 'cancelled', nextAttemptAt: null, cancelReason: reason });
    const at = this.iso();
    const credit: BillingRecord = {
      id: randomUUID(), exporter: record.exporter, state: 'pending', attempts: 0, nextAttemptAt: null, lastError: null, uncertain: false, remoteId: null, createdAt: at, updatedAt: at, sentAt: null, revertDetected: null, reversedBy: null, cancelReason: null,
      line: { ...record.line, key: `${record.line.key}:reversal`, kind: 'reversal', quantity: -1, reversal: { reverses: record.line.key, reason, revertUrl, at, by: user.id } },
    };
    if (!this.store.add(credit)) fail(409, 'billing_reversed', 'This line is already reversed.');
    this.finish(record, { reversedBy: credit.id });
    return this.attempt(credit);
  }

  /** The lines `user` may see, as RFC 4180 CSV or as UBL 2.1 JSON invoice lines, with sent lines first. */
  export(user: User, format: string): { contentType: string; filename: string; text: string } {
    this.requireAdmin(user);
    if (!['csv', 'ubl'].includes(format)) fail(400, 'billing_format', 'Choose a format of csv or ubl.');
    const lines = this.options.demo ? [] : this.store.recent(10_000).filter(record => this.visible(user, ownerOf(record.line)) && record.state !== 'cancelled').map(record => record.line);
    if (format === 'csv') return { contentType: 'text/csv; charset=utf-8', filename: 'unfold-billing-lines.csv', text: billingCsv(lines) };
    const reference = (line: BillingLine) => this.store.mapping(ownerOf(line))?.target.reference ?? null;
    return { contentType: 'application/json; charset=utf-8', filename: 'unfold-billing-lines.ubl.json', text: `${JSON.stringify(ublInvoiceLines(lines, reference), null, 2)}\n` };
  }

  /** Runs a sync now for an administrator and says what it did. */
  async syncNow(user: User): Promise<BillingSyncResult> {
    this.requireAdmin(user);
    this.requireActive();
    return this.sync();
  }
}

/** One answer from the billing routes: JSON, or a file to download. */
export type BillingAnswer = { status: number; json: unknown } | { status: number; file: { contentType: string; filename: string; text: string } };

/**
 * Answers `/api/billing` and the routes under it for `user`. `body` reads the JSON request body. Throws a BillingError
 * for a refused request and answers 404 for an unknown route.
 */
export async function billingRoute(service: BillingService, user: User, method: string, path: string, query: URLSearchParams, body: () => Promise<Record<string, unknown>>): Promise<BillingAnswer> {
  if (path === '/api/billing') {
    if (method !== 'GET') fail(405, 'method', 'Read billing with GET.');
    return { status: 200, json: await service.view(user) };
  }
  if (path === '/api/billing/mappings') {
    if (method === 'PUT') return { status: 200, json: service.setMapping(user, await body()) };
    if (method === 'DELETE') { service.deleteMapping(user, query.get('tenant') ?? 'default', query.get('client') || null); return { status: 200, json: { ok: true } }; }
    fail(405, 'method', 'Set a mapping with PUT and remove it with DELETE.');
  }
  if (path === '/api/billing/sync') {
    if (method !== 'POST') fail(405, 'method', 'Sync with POST.');
    return { status: 200, json: await service.syncNow(user) };
  }
  if (path === '/api/billing/lines') {
    if (method !== 'GET') fail(405, 'method', 'Download lines with GET.');
    return { status: 200, file: service.export(user, query.get('format') ?? 'csv') };
  }
  const action = /^\/api\/billing\/lines\/([0-9a-f-]{36})\/(send|found|price|reverse)$/.exec(path);
  if (action) {
    if (method !== 'POST') fail(405, 'method', 'Act on a line with POST.');
    const data = await body();
    if (action[2] === 'send') return { status: 200, json: await service.sendAgain(user, action[1], data) };
    if (action[2] === 'found') return { status: 200, json: service.markSent(user, action[1]) };
    if (action[2] === 'price') return { status: 200, json: await service.setPrice(user, action[1], data) };
    return { status: 200, json: await service.reverse(user, action[1], data) };
  }
  return fail(404, 'not_found', 'The API has no such address. The API reference at /api/openapi.yaml lists the addresses it has.');
}
