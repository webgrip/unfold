import { createHmac, randomBytes } from 'node:crypto';
import type { AppConfig, InsightEvent, User } from './types.ts';
import type { ProductEventDaily, Store, StoredProductEvent } from './store.ts';

/** Every event name RFC-0001 lists, with the properties its entry allows. `screen` is always a top-level field. */
export const insightCatalogue: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'screen.viewed': [],
  'needs_you.verdict_shown': ['verdict', 'path', 'group_size'],
  'needs_you.command_sent': ['command', 'path', 'suggested', 'batch_size'],
  'needs_you.undone': ['command', 'seconds_after'],
  'work_item.back_in_needs_you': ['days_after', 'previous_command'],
  'link_out.opened': ['target'],
  'review.viewed': ['active_seconds'],
  'ui.rage_click': ['element'],
  'ui.dead_click': ['element'],
  'ui.u_turn': [],
  'ui.link_out_burst': ['count'],
});

/** The Tenant every self-hosted install starts with, until ADR-0017's per-tenant checks ship. */
export const defaultTenant = 'default';
export const maxEventsPerCall = 50;
export const maxEventPayloadBytes = 32768;
export const maxEventsPerMinute = 600;
/** How far before its arrival an event may say it happened. An older `at`, or one in the future, is clamped into this window. */
export const lateArrivalMs = 3_600_000;
/** The Faro `domain` and OTLP `event.domain` of one exported event. */
export const eventDomain = 'unfold.insight';
/** The Faro `domain` and OTLP `event.domain` of one exported daily rollup row. */
export const dailyDomain = 'unfold.insight.daily';
const maxPropLength = 64;
const maxSessionLength = 64;
const actorIdLength = 16;
const hourMs = 3_600_000;
const dayMs = 86_400_000;
const firstMaintenanceMs = 60_000;
const retentionMonths = 25;
const actorKeyMonths = 13;
const exportBatchRows = 500;
const maxPendingRows = 5000;
const actorKeyId = 'insight:actorKey';
const exportStateId = 'insight:export';

type RawEvent = Record<string, unknown>;
type Scalar = string | number | boolean;
type Sink = { url: string; mode: 'faro' | 'otlp'; level: 'aggregate' | 'events' };
type ActorKey = { key: string; createdAt: string };
type ExportState = { foldedThrough?: string; sentThrough?: string };

/** One row the sink sends: a stored event (`events` level) or a daily rollup row (`aggregate` level). */
export type ExportedRow =
  | (StoredProductEvent & { kind: 'event' })
  | (ProductEventDaily & { kind: 'daily' });

function scalar(value: unknown): Scalar | undefined {
  if (typeof value === 'string') return value.length <= maxPropLength ? value : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  return undefined;
}

/** A Work Item or Shift id: a non-negative integer, or the digit string Unfold's screens hold it as. */
function identifier(value: unknown): number | undefined {
  if (typeof value === 'string' && /^\d{1,15}$/.test(value)) return Number(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  return undefined;
}

function eventTime(value: unknown, now: string): string {
  const arrived = Date.parse(now);
  const claimed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(claimed)) return now;
  return new Date(Math.min(arrived, Math.max(arrived - lateArrivalMs, claimed))).toISOString();
}

/**
 * Checks a posted batch against the catalogue. An unknown event name is dropped, and so is any property its entry
 * does not list or whose value is not a short scalar. An `at` outside the hour before `now` is clamped into it, so a
 * day's rollup is final an hour after the day ends. It returns the events that passed, in the order posted.
 */
export function parseInsightEvents(raw: unknown, now: string): InsightEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: InsightEvent[] = [];
  for (const item of raw.slice(0, maxEventsPerCall)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const value = item as RawEvent;
    const name = typeof value.name === 'string' ? value.name : '';
    const allowed = Object.hasOwn(insightCatalogue, name) ? insightCatalogue[name] : undefined;
    if (!allowed) continue;
    const session = typeof value.session === 'string' && value.session.length <= maxSessionLength ? value.session : '';
    const screen = typeof value.screen === 'string' && value.screen.length <= maxPropLength ? value.screen : '';
    const props: Record<string, Scalar> = {};
    if (value.props && typeof value.props === 'object' && !Array.isArray(value.props)) {
      for (const key of allowed) {
        const parsed = scalar((value.props as RawEvent)[key]);
        if (parsed !== undefined) props[key] = parsed;
      }
    }
    const workItemId = identifier(value.workItemId);
    const shiftId = identifier(value.shiftId);
    events.push({ name, at: eventTime(value.at, now), session, screen, ...(workItemId !== undefined ? { workItemId } : {}), ...(shiftId !== undefined ? { shiftId } : {}), props });
  }
  return events;
}

/** RFC 4648 base32, lowercased, for a pseudonymous actor id that cannot be mistaken for a user id. */
function base32(bytes: Buffer): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

/**
 * The pseudonymous actor id for one user in one tenant: the first 16 base32 characters of
 * HMAC-SHA256(tenant actor key, `tenant:user`). It cannot be reversed to the user id without the key.
 */
export function actorHash(actorKey: string, tenantId: string, userId: string): string {
  return base32(createHmac('sha256', actorKey).update(`${tenantId}:${userId}`).digest()).slice(0, actorIdLength);
}

function addMonths(date: Date, months: number): Date {
  const shifted = new Date(date.getTime());
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  return shifted;
}

function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function attributes(row: ExportedRow): Record<string, Scalar> {
  const common = { 'event.name': row.name, ...(row.screen ? { screen: row.screen } : {}), 'tenant.id': row.tenantId };
  if (row.kind === 'daily') return { ...common, day: row.day, count: row.count, actors: row.actors };
  return {
    ...common,
    ...(row.session ? { 'session.id': row.session } : {}),
    ...(row.workItemId !== undefined ? { 'work_item.id': row.workItemId } : {}),
    ...(row.shiftId !== undefined ? { 'shift.id': row.shiftId } : {}),
    actor: row.actor,
    at_ms: Date.parse(row.at),
    ...row.props,
  };
}

function rowTime(row: ExportedRow): string {
  return row.kind === 'daily' ? `${row.day}T00:00:00.000Z` : row.at;
}

function rowDomain(row: ExportedRow): string {
  return row.kind === 'daily' ? dailyDomain : eventDomain;
}

/**
 * Builds the Faro `/collect` payload: one `event` per exported row. Faro event attributes are strings only, so a
 * number or boolean travels as its text; Alloy's `faro.receiver` refuses the whole batch otherwise.
 */
export function faroPayload(rows: ExportedRow[], version: string, environment: string): Record<string, unknown> {
  return {
    meta: { sdk: { name: 'unfold-server', version }, app: { name: 'unfold', version, environment } },
    events: rows.map(row => ({
      name: row.name,
      domain: rowDomain(row),
      timestamp: rowTime(row),
      attributes: Object.fromEntries(Object.entries(attributes(row)).map(([key, value]) => [key, String(value)])),
    })),
  };
}

function otlpValue(value: Scalar): Record<string, unknown> {
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  return { stringValue: value };
}

/** Builds an OTLP/HTTP JSON logs payload: one log record per exported row, its event name in the body and in `event.name`. */
export function otlpPayload(rows: ExportedRow[], version: string, environment: string): Record<string, unknown> {
  return {
    resourceLogs: [{
      resource: { attributes: [
        { key: 'service.name', value: { stringValue: 'unfold' } },
        { key: 'service.version', value: { stringValue: version } },
        { key: 'deployment.environment', value: { stringValue: environment } },
      ] },
      scopeLogs: [{
        scope: { name: eventDomain, version },
        logRecords: rows.map(row => ({
          timeUnixNano: `${BigInt(Date.parse(rowTime(row))) * 1_000_000n}`,
          severityNumber: 9,
          severityText: 'INFO',
          body: { stringValue: row.name },
          attributes: Object.entries({ 'event.domain': rowDomain(row), ...attributes(row) }).map(([key, value]) => ({ key, value: otlpValue(value) })),
        })),
      }],
    }],
  };
}

/**
 * The server-side product-event sink. It stores what the browser posts, folds, prunes and exports on an hourly
 * timer, and forwards to the collector the operator named without ever letting a failed send reach the event route.
 * An `events` sink forwards each batch as it arrives and drops it if the collector refuses; the stored rows stay.
 * An `aggregate` sink sends each finished UTC day once, and retries a day the collector refused on the next hour.
 */
export class InsightService {
  private store: Store;
  private config: AppConfig;
  private version: string;
  private now: () => Date;
  private actorKey: ActorKey | undefined;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;
  private sending = false;
  private maintaining: Promise<void> | undefined;
  private lastErrorAt = Number.NEGATIVE_INFINITY;
  private pending: ExportedRow[] = [];
  private admitted = new Map<string, { since: number; count: number }>();

  constructor(store: Store, config: AppConfig, version: string, now: () => Date = () => new Date(), options: { schedule?: boolean } = {}) {
    this.store = store;
    this.config = config;
    this.version = version;
    this.now = now;
    if (options.schedule !== false) {
      const first = setTimeout(() => { void this.maintain(); }, firstMaintenanceMs);
      const hourly = setInterval(() => { void this.maintain(); }, hourMs);
      first.unref?.();
      hourly.unref?.();
      this.timers.push(first, hourly);
    }
  }

  private sink(): Sink | undefined {
    const insight = this.config.insight;
    if (!insight || insight.export === 'off' || !insight.url) return undefined;
    return { url: insight.url, mode: insight.export, level: insight.level };
  }

  /** The tenant actor key, replaced by a fresh one once it is 13 months old so old and new actor ids cannot be linked. */
  private currentActorKey(): string {
    const now = this.now();
    if (!this.actorKey) this.actorKey = this.store.getSecret<ActorKey>(actorKeyId);
    if (!this.actorKey || addMonths(new Date(this.actorKey.createdAt), actorKeyMonths) <= now) {
      this.actorKey = { key: randomBytes(32).toString('base64url'), createdAt: now.toISOString() };
      this.store.setSecret(actorKeyId, this.actorKey);
    }
    return this.actorKey.key;
  }

  private admit(user: User, count: number): void {
    const now = this.now().getTime();
    const window = this.admitted.get(user.id);
    const current = window && now - window.since < 60_000 ? window : { since: now, count: 0 };
    if (current.count + count > maxEventsPerMinute) throw Object.assign(new Error(`At most ${maxEventsPerMinute} product events a minute are accepted. Try again shortly.`), { status: 429, code: 'rate_limited' });
    current.count += count;
    this.admitted.set(user.id, current);
    if (this.admitted.size > 10_000) for (const [id, entry] of this.admitted) if (now - entry.since >= 60_000) this.admitted.delete(id);
  }

  /** Stores one checked batch and queues the rows an `events` sink forwards. Throws a 429 failure past the per-person rate. */
  ingest(events: InsightEvent[], user: User): number {
    if (!events.length) return 0;
    this.admit(user, events.length);
    const sink = this.sink();
    const actor = actorHash(this.currentActorKey(), defaultTenant, user.id);
    const rows: StoredProductEvent[] = events.map(event => ({ tenantId: defaultTenant, actor, ...event }));
    this.store.recordProductEvents(rows);
    if (sink?.level === 'events') {
      this.pending.push(...rows.map(row => ({ ...row, kind: 'event' as const })));
      if (this.pending.length > maxPendingRows) this.pending.splice(0, this.pending.length - maxPendingRows);
      void this.deliver();
    }
    return events.length;
  }

  /**
   * Prunes events past retention, folds every day that can still change into the daily rollup, and sends an
   * `aggregate` sink each finished day it has not accepted yet. Concurrent calls share one run.
   */
  maintain(): Promise<void> {
    this.maintaining ??= this.runMaintenance().finally(() => { this.maintaining = undefined; });
    return this.maintaining;
  }

  private async runMaintenance(): Promise<void> {
    if (this.stopped) return;
    try {
      const now = this.now();
      this.store.pruneProductEventsBefore(addMonths(now, -retentionMonths).toISOString());
      const finished = utcDay(now.getTime() - lateArrivalMs - dayMs);
      const state = this.store.getSecret<ExportState>(exportStateId) ?? {};
      for (const day of this.store.productEventDays(state.foldedThrough)) this.store.foldProductEventDay(day);
      state.foldedThrough = finished;
      this.store.setSecret(exportStateId, state);
      const sink = this.sink();
      if (sink?.level !== 'aggregate') return;
      const rows = this.store.productEventDaily(state.sentThrough, finished);
      for (let start = 0; start < rows.length; start += exportBatchRows) {
        if (this.stopped || !await this.send(sink, rows.slice(start, start + exportBatchRows).map(row => ({ ...row, kind: 'daily' as const })))) return;
      }
      state.sentThrough = finished;
      this.store.setSecret(exportStateId, state);
    } catch (error) {
      if (!this.stopped) this.warn('insight.maintenance_failed', error);
    }
  }

  private async deliver(): Promise<void> {
    const sink = this.sink();
    if (!sink || this.sending) return;
    this.sending = true;
    try {
      while (this.pending.length && !this.stopped) await this.send(sink, this.pending.splice(0, exportBatchRows));
    } finally {
      this.sending = false;
    }
  }

  private async send(sink: Sink, rows: ExportedRow[]): Promise<boolean> {
    try {
      const body = sink.mode === 'faro' ? faroPayload(rows, this.version, this.config.mode) : otlpPayload(rows, this.version, this.config.mode);
      const response = await fetch(sink.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`collector answered HTTP ${response.status}`);
      return true;
    } catch (error) {
      this.warn('insight.export_failed', error);
      return false;
    }
  }

  private warn(event: string, error: unknown): void {
    const now = this.now().getTime();
    if (now - this.lastErrorAt < hourMs) return;
    this.lastErrorAt = now;
    console.error(JSON.stringify({ level: 'warn', event, message: String((error as Error)?.message ?? error).slice(0, 200) }));
  }

  /** Stops the timers. A send already in flight finishes, but nothing new starts. */
  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.pending = [];
  }
}
