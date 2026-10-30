import { randomBytes } from 'node:crypto';
import type { Store } from '../store.ts';
import { ClientSignOffStore } from '../client-sign-off.ts';
import { matchesFilter, type CloudEvent } from './catalogue.ts';

/** One webhook subscription, without its secret. */
export type Subscription = {
  id: string; tenant: string; client: string | null; url: string; types: string[]; description: string;
  active: boolean; disabledReason: string | null; createdAt: string; createdBy: string; updatedAt: string;
};
/** Where one delivery stands: waiting to be sent or retried, answered with 2xx, or given up on. */
export type DeliveryStatus = 'pending' | 'delivered' | 'dead';
/** One event's delivery to one subscription. */
export type Delivery = {
  id: number; subscriptionId: string; eventId: string; eventType: string; status: DeliveryStatus; attempts: number;
  nextAttemptAt: string | null; lastStatus: number | null; lastError: string | null; deliveredAt: string | null; createdAt: string;
};
/** A subscription's secrets: the current one, and the one it replaced while that one still signs. */
export type SubscriptionSecrets = { current: string; previous?: string; previousUntil?: string };
/** A Client Sign-off state change the triggers recorded, waiting to become an event. */
export type SignOffChange = { seq: number; signOffId: string; state: string; at: string };

const secretId = (id: string) => `outbound-secret:${id}`;

function subscriptionFrom(row: Record<string, unknown>): Subscription {
  return {
    id: String(row.id), tenant: String(row.tenant), client: row.client === null ? null : String(row.client), url: String(row.url), types: JSON.parse(String(row.types)),
    description: String(row.description), active: Number(row.active) === 1, disabledReason: row.disabled_reason === null ? null : String(row.disabled_reason),
    createdAt: String(row.created_at), createdBy: String(row.created_by), updatedAt: String(row.updated_at),
  };
}

function deliveryFrom(row: Record<string, unknown>): Delivery {
  const text = (value: unknown) => value === null || value === undefined ? null : String(value);
  return {
    id: Number(row.id), subscriptionId: String(row.subscription_id), eventId: String(row.event_id), eventType: String(row.event_type), status: String(row.status) as DeliveryStatus,
    attempts: Number(row.attempts), nextAttemptAt: text(row.next_attempt_at), lastStatus: row.last_status === null ? null : Number(row.last_status), lastError: text(row.last_error),
    deliveredAt: text(row.delivered_at), createdAt: String(row.created_at),
  };
}

/**
 * The outbound event tables in Unfold's store: subscriptions, the events and their deliveries (the outbox), source
 * cursors, and the Client Sign-off changes that triggers on `client_sign_offs` record in the Sign-off's own transaction.
 */
export class OutboundStore {
  readonly store: Store;
  constructor(store: Store) {
    this.store = store;
    new ClientSignOffStore(store.db);
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS outbound_subscriptions (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, client TEXT, url TEXT NOT NULL, types TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL, disabled_reason TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbound_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, tenant TEXT NOT NULL, client TEXT, time TEXT NOT NULL, recorded_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS outbound_events_recorded ON outbound_events(recorded_at);
      CREATE TABLE IF NOT EXISTS outbound_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id TEXT NOT NULL REFERENCES outbound_subscriptions(id) ON DELETE CASCADE, event_id TEXT NOT NULL REFERENCES outbound_events(id), event_type TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_status INTEGER, last_error TEXT, delivered_at TEXT, created_at TEXT NOT NULL, UNIQUE(subscription_id, event_id));
      CREATE INDEX IF NOT EXISTS outbound_deliveries_due ON outbound_deliveries(status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS outbound_deliveries_subscription ON outbound_deliveries(subscription_id, id);
      CREATE TABLE IF NOT EXISTS outbound_cursors (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbound_sign_off_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, sign_off_id TEXT NOT NULL, state TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS outbound_sign_off_recorded AFTER INSERT ON client_sign_offs BEGIN
        INSERT INTO outbound_sign_off_changes(sign_off_id, state, at) VALUES (NEW.id, NEW.state, NEW.recorded_at);
      END;
      CREATE TRIGGER IF NOT EXISTS outbound_sign_off_ended AFTER UPDATE OF state ON client_sign_offs WHEN NEW.state <> OLD.state BEGIN
        INSERT INTO outbound_sign_off_changes(sign_off_id, state, at) VALUES (NEW.id, NEW.state, COALESCE(json_extract(NEW.body, '$.endedAt'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
      END;
    `);
  }

  /** Every subscription, oldest first. */
  subscriptions(): Subscription[] {
    return (this.store.db.prepare('SELECT * FROM outbound_subscriptions ORDER BY created_at, id').all() as Record<string, unknown>[]).map(subscriptionFrom);
  }
  /** One subscription, or `undefined`. */
  subscription(id: string): Subscription | undefined {
    const row = this.store.db.prepare('SELECT * FROM outbound_subscriptions WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? subscriptionFrom(row) : undefined;
  }
  /** Whether any active subscription exists, so sources that cost a Ploeg read can stay idle without one. */
  hasActive(): boolean { return Boolean(this.store.db.prepare('SELECT 1 FROM outbound_subscriptions WHERE active=1 LIMIT 1').get()); }

  /** Stores a new subscription and its secret. */
  createSubscription(input: Omit<Subscription, 'id' | 'active' | 'disabledReason' | 'updatedAt'>, secret: string): Subscription {
    const id = `sub_${randomBytes(12).toString('hex')}`;
    this.store.transaction(() => {
      this.store.db.prepare('INSERT INTO outbound_subscriptions(id,tenant,client,url,types,description,active,disabled_reason,created_at,created_by,updated_at) VALUES(?,?,?,?,?,?,1,NULL,?,?,?)')
        .run(id, input.tenant, input.client, input.url, JSON.stringify(input.types), input.description, input.createdAt, input.createdBy, input.createdAt);
      this.store.setSecret(secretId(id), { current: secret } satisfies SubscriptionSecrets);
    });
    return this.subscription(id)!;
  }
  /** Changes a subscription's URL, types, description or active state; turning it active clears its disabled reason. */
  updateSubscription(id: string, change: Partial<Pick<Subscription, 'url' | 'types' | 'description' | 'active' | 'disabledReason'>>, at: string): Subscription | undefined {
    const now = this.subscription(id);
    if (!now) return undefined;
    const next = { ...now, ...change };
    if (change.active === true) next.disabledReason = null;
    this.store.db.prepare('UPDATE outbound_subscriptions SET url=?, types=?, description=?, active=?, disabled_reason=?, updated_at=? WHERE id=?')
      .run(next.url, JSON.stringify(next.types), next.description, next.active ? 1 : 0, next.disabledReason, at, id);
    return this.subscription(id);
  }
  /** Deletes a subscription, its deliveries and its secret. */
  deleteSubscription(id: string): boolean {
    return this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM outbound_deliveries WHERE subscription_id=?').run(id);
      this.store.deleteSecret(secretId(id));
      return Number(this.store.db.prepare('DELETE FROM outbound_subscriptions WHERE id=?').run(id).changes) === 1;
    });
  }
  /** The subscription's secrets. */
  secrets(id: string): SubscriptionSecrets | undefined { return this.store.getSecret<SubscriptionSecrets>(secretId(id)); }
  /** Replaces the current secret, keeping the old one signing until `previousUntil`. */
  rotateSecret(id: string, secret: string, previousUntil: string): void {
    const now = this.secrets(id);
    this.store.setSecret(secretId(id), { current: secret, ...(now ? { previous: now.current, previousUntil } : {}) } satisfies SubscriptionSecrets);
  }

  /** A source's stored cursor, or `undefined` before its first read. */
  cursor(name: string): string | undefined {
    const row = this.store.db.prepare('SELECT value FROM outbound_cursors WHERE name=?').get(name) as { value: string } | undefined;
    return row?.value;
  }
  /** Stores a source's cursor. Call inside the transaction that wrote what the cursor moved past. */
  setCursor(name: string, value: string, at: string): void {
    this.store.db.prepare('INSERT INTO outbound_cursors(name,value,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(name, value, at);
  }

  /**
   * Writes an event once, and one pending delivery to each subscription that wants it: active, scoped to its Tenant
   * (and Client, when the subscription names one), its filter matching the type, created no later than the event, and
   * its Tenant's flag on. Writing the same event again changes nothing. Returns how many deliveries were queued.
   */
  enqueue(event: CloudEvent, recorded: string, tenantEnabled: (tenant: string) => boolean): number {
    const db = this.store.db;
    const at = new Date(recorded).toISOString();
    db.prepare('INSERT OR IGNORE INTO outbound_events(id,type,tenant,client,time,recorded_at,body) VALUES(?,?,?,?,?,?,?)').run(event.id, event.type, event.tenant, event.client ?? null, event.time, at, JSON.stringify(event));
    if (!tenantEnabled(event.tenant)) return 0;
    const insert = db.prepare("INSERT OR IGNORE INTO outbound_deliveries(subscription_id,event_id,event_type,status,attempts,next_attempt_at,created_at) VALUES(?,?,?,'pending',0,?,?)");
    let queued = 0;
    for (const subscription of this.subscriptions()) {
      if (!subscription.active || subscription.tenant !== event.tenant) continue;
      if (subscription.client !== null && subscription.client !== event.client) continue;
      if (!matchesFilter(subscription.types, event.type) || Date.parse(subscription.createdAt) > Date.parse(event.time)) continue;
      queued += Number(insert.run(subscription.id, event.id, event.type, at, at).changes);
    }
    return queued;
  }
  /** Queues one event to exactly one subscription, such as a test event; still at most once per event. */
  enqueueTo(subscriptionId: string, event: CloudEvent, recorded: string): number {
    const at = new Date(recorded).toISOString();
    this.store.db.prepare('INSERT OR IGNORE INTO outbound_events(id,type,tenant,client,time,recorded_at,body) VALUES(?,?,?,?,?,?,?)').run(event.id, event.type, event.tenant, event.client ?? null, event.time, at, JSON.stringify(event));
    return Number(this.store.db.prepare("INSERT OR IGNORE INTO outbound_deliveries(subscription_id,event_id,event_type,status,attempts,next_attempt_at,created_at) VALUES(?,?,?,'pending',0,?,?)").run(subscriptionId, event.id, event.type, at, at).changes);
  }

  /** Deliveries due at `now` to active subscriptions, oldest first, at most `limit`, with their event's stored body. */
  due(now: string, limit: number): { delivery: Delivery; body: string }[] {
    const rows = this.store.db.prepare(`SELECT d.*, e.body AS body FROM outbound_deliveries d JOIN outbound_events e ON e.id=d.event_id JOIN outbound_subscriptions s ON s.id=d.subscription_id
      WHERE d.status='pending' AND d.next_attempt_at <= ? AND s.active=1 ORDER BY d.next_attempt_at, d.id LIMIT ?`).all(now, limit) as Record<string, unknown>[];
    return rows.map(row => ({ delivery: deliveryFrom(row), body: String(row.body) }));
  }
  /** Records one attempt's result. */
  recordAttempt(id: number, result: { status: DeliveryStatus; attempts: number; nextAttemptAt: string | null; lastStatus: number | null; lastError: string | null; deliveredAt: string | null }): void {
    this.store.db.prepare('UPDATE outbound_deliveries SET status=?, attempts=?, next_attempt_at=?, last_status=?, last_error=?, delivered_at=? WHERE id=?')
      .run(result.status, result.attempts, result.nextAttemptAt, result.lastStatus, result.lastError, result.deliveredAt, id);
  }
  /** One delivery. */
  delivery(id: number): Delivery | undefined {
    const row = this.store.db.prepare('SELECT * FROM outbound_deliveries WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? deliveryFrom(row) : undefined;
  }
  /** A subscription's newest deliveries, newest first. */
  deliveries(subscriptionId: string, limit: number): Delivery[] {
    return (this.store.db.prepare('SELECT * FROM outbound_deliveries WHERE subscription_id=? ORDER BY id DESC LIMIT ?').all(subscriptionId, limit) as Record<string, unknown>[]).map(deliveryFrom);
  }
  /** Counts of a subscription's deliveries by status. */
  counts(subscriptionId: string): Record<DeliveryStatus, number> {
    const counts: Record<DeliveryStatus, number> = { pending: 0, delivered: 0, dead: 0 };
    for (const row of this.store.db.prepare('SELECT status, COUNT(*) AS n FROM outbound_deliveries WHERE subscription_id=? GROUP BY status').all(subscriptionId) as { status: DeliveryStatus; n: number }[]) counts[row.status] = Number(row.n);
    return counts;
  }
  /** Puts a dead delivery back in the queue, due at `at`, with a fresh attempt count. */
  resend(id: number, at: string): boolean {
    return Number(this.store.db.prepare("UPDATE outbound_deliveries SET status='pending', attempts=0, next_attempt_at=?, last_error=NULL WHERE id=? AND status='dead'").run(at, id).changes) === 1;
  }

  /** The Client Sign-off changes the triggers recorded, oldest first. */
  signOffChanges(limit: number): SignOffChange[] {
    return (this.store.db.prepare('SELECT * FROM outbound_sign_off_changes ORDER BY seq LIMIT ?').all(limit) as Record<string, unknown>[])
      .map(row => ({ seq: Number(row.seq), signOffId: String(row.sign_off_id), state: String(row.state), at: String(row.at) }));
  }
  /** Removes the changes up to and including `seq`. Call inside the transaction that queued their events. */
  dropSignOffChanges(seq: number): void { this.store.db.prepare('DELETE FROM outbound_sign_off_changes WHERE seq<=?').run(seq); }
  /** The stored body of one Client Sign-off, or `undefined`. */
  signOffBody(id: string): Record<string, unknown> | undefined {
    const row = this.store.db.prepare('SELECT body FROM client_sign_offs WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }

  /** Deletes finished deliveries and events older than `cutoff` that no pending delivery still needs. */
  prune(cutoff: string): number {
    return this.store.transaction(() => {
      const removed = Number(this.store.db.prepare("DELETE FROM outbound_deliveries WHERE status IN ('delivered','dead') AND created_at < ?").run(cutoff).changes);
      this.store.db.prepare('DELETE FROM outbound_events WHERE recorded_at < ? AND id NOT IN (SELECT event_id FROM outbound_deliveries)').run(cutoff);
      return removed;
    });
  }
}
