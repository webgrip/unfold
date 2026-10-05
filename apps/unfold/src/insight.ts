import { createHmac, randomBytes } from 'node:crypto';
import type { AppConfig, InsightEvent, User } from './types.ts';
import type { Store } from './store.ts';

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
const maxPropLength = 64;
const actorIdLength = 16;
const eventExportHourMs = 3_600_000;
const retentionMonths = 25;

type RawEvent = Record<string, unknown>;

function scalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') return value.length <= maxPropLength ? value : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  return undefined;
}

function identifier(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/**
 * Checks a posted batch against the catalogue. An unknown event name is dropped, and so is any property its entry
 * does not list or whose value is not a short scalar. It returns the events that passed, oldest first as posted.
 */
export function parseInsightEvents(raw: unknown, now: string): InsightEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: InsightEvent[] = [];
  for (const item of raw.slice(0, maxEventsPerCall)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const value = item as RawEvent;
    const name = typeof value.name === 'string' ? value.name : '';
    const allowed = insightCatalogue[name];
    if (!allowed) continue;
    const session = typeof value.session === 'string' && value.session.length <= 64 ? value.session : '';
    const screen = typeof value.screen === 'string' && value.screen.length <= maxPropLength ? value.screen : '';
    const props: Record<string, string | number | boolean> = {};
    if (value.props && typeof value.props === 'object' && !Array.isArray(value.props)) {
      for (const key of allowed) {
        const parsed = scalar((value.props as RawEvent)[key]);
        if (parsed !== undefined) props[key] = parsed;
      }
    }
    const at = typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at)) ? new Date(value.at).toISOString() : now;
    events.push({ name, at, session, screen, ...(identifier(value.workItemId) !== undefined ? { workItemId: identifier(value.workItemId) } : {}), ...(identifier(value.shiftId) !== undefined ? { shiftId: identifier(value.shiftId) } : {}), props });
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
    value = (value << 8) | byte;
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

type ExportedRow = { tenantId: string; actor: string; session: string; name: string; screen: string; workItemId?: number; shiftId?: number; props: Record<string, string | number | boolean>; at: string; day?: string; count?: number; actors?: number };

function attributes(row: { name: string; screen?: string; tenantId: string; session?: string; workItemId?: number; shiftId?: number; props?: Record<string, string | number | boolean>; actor?: string; count?: number; actors?: number; day?: string }): Record<string, string | number | boolean> {
  return {
    'event.name': row.name,
    ...(row.screen ? { screen: row.screen } : {}),
    'tenant.id': row.tenantId,
    ...(row.session ? { 'session.id': row.session } : {}),
    ...(row.workItemId !== undefined ? { 'work_item.id': row.workItemId } : {}),
    ...(row.shiftId !== undefined ? { 'shift.id': row.shiftId } : {}),
    ...(row.actor ? { actor: row.actor } : {}),
    ...(row.day ? { day: row.day } : {}),
    ...(row.count !== undefined ? { count: row.count } : {}),
    ...(row.actors !== undefined ? { actors: row.actors } : {}),
    ...(row.props ?? {}),
  };
}

/** Builds the Faro `/collect` payload: one `event` per exported row, with its attributes. */
export function faroPayload(rows: ExportedRow[], version: string, environment: string): Record<string, unknown> {
  return {
    meta: { sdk: { name: 'unfold', version }, app: { name: 'unfold', environment } },
    events: rows.map(row => ({ name: row.name, timestamp: row.at, attributes: attributes(row) })),
  };
}

function otlpValue(value: string | number | boolean): Record<string, unknown> {
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') return { intValue: value };
  return { stringValue: value };
}

/** Builds an OTLP/HTTP JSON logs payload: one log record per exported row. */
export function otlpPayload(rows: ExportedRow[], version: string, environment: string): Record<string, unknown> {
  return {
    resourceLogs: [{
      resource: { attributes: [
        { key: 'service.name', value: { stringValue: 'unfold' } },
        { key: 'service.version', value: { stringValue: version } },
        { key: 'deployment.environment', value: { stringValue: environment } },
      ] },
      scopeLogs: [{
        scope: { name: 'unfold.insight' },
        logRecords: rows.map(row => ({
          timeUnixNano: `${Date.parse(row.at) * 1_000_000}`,
          severityNumber: 9,
          severityText: 'INFO',
          body: { stringValue: row.name },
          attributes: Object.entries(attributes(row)).map(([key, value]) => ({ key, value: otlpValue(value) })),
        })),
      }],
    }],
  };
}

/**
 * The server-side product-event sink. It stores what the browser posts, folds and prunes on a timer, and forwards
 * to the collector the operator named without ever letting a failed send reach the event route.
 */
export class InsightService {
  private store: Store;
  private config: AppConfig;
  private version: string;
  private now: () => Date;
  private actorKey: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sending = false;
  private lastErrorAt = 0;
  private pending: ExportedRow[] = [];

  constructor(store: Store, config: AppConfig, version: string, now: () => Date = () => new Date()) {
    this.store = store;
    this.config = config;
    this.version = version;
    this.now = now;
    const existing = store.getSecret<string>('insight:actorKey');
    this.actorKey = existing ?? randomBytes(32).toString('base64url');
    if (!existing) store.setSecret('insight:actorKey', this.actorKey);
    this.timer = setInterval(() => { void this.maintain(); }, eventExportHourMs);
    this.timer.unref?.();
  }

  private sink(): { url: string; mode: 'faro' | 'otlp'; level: 'aggregate' | 'events' } | undefined {
    const insight = this.config.insight;
    if (!insight || insight.export === 'off' || !insight.url) return undefined;
    return { url: insight.url, mode: insight.export, level: insight.level };
  }

  /** Stores one checked batch and queues the rows an `events` sink forwards. */
  ingest(events: InsightEvent[], user: User): number {
    const sink = this.sink();
    for (const event of events) {
      const row: ExportedRow = { tenantId: defaultTenant, actor: actorHash(this.actorKey, defaultTenant, user.id), session: event.session, name: event.name, screen: event.screen, ...(event.workItemId !== undefined ? { workItemId: event.workItemId } : {}), ...(event.shiftId !== undefined ? { shiftId: event.shiftId } : {}), props: event.props, at: event.at };
      this.store.recordProductEvent(row);
      if (sink?.level === 'events') this.pending.push(row);
    }
    if (this.pending.length) void this.deliver();
    return events.length;
  }

  /** Folds every stored day into the daily rollup, prunes past retention, and sends an aggregate sink its rows. */
  async maintain(): Promise<void> {
    const cutoff = new Date(this.now().getTime());
    cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
    this.store.pruneProductEventsBefore(cutoff.toISOString());
    for (const day of this.store.productEventDays()) this.store.foldProductEventDay(day);
    const sink = this.sink();
    if (sink?.level === 'aggregate') await this.send(sink, this.store.productEventDaily().map(row => ({ tenantId: row.tenantId, actor: '', session: '', name: row.name, screen: row.screen, day: row.day, count: row.count, actors: row.actors, props: {}, at: `${row.day}T00:00:00.000Z` })));
  }

  private async deliver(): Promise<void> {
    const sink = this.sink();
    if (!sink || this.sending) return;
    this.sending = true;
    try {
      while (this.pending.length) await this.send(sink, this.pending.splice(0, this.pending.length));
    } finally {
      this.sending = false;
    }
  }

  private async send(sink: { url: string; mode: 'faro' | 'otlp'; level: 'aggregate' | 'events' }, rows: ExportedRow[]): Promise<void> {
    try {
      const body = sink.mode === 'faro' ? faroPayload(rows, this.version, this.config.mode) : otlpPayload(rows, this.version, this.config.mode);
      const response = await fetch(sink.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`collector answered HTTP ${response.status}`);
    } catch (error) {
      const now = this.now().getTime();
      if (now - this.lastErrorAt >= eventExportHourMs) {
        this.lastErrorAt = now;
        console.error(JSON.stringify({ level: 'warn', event: 'insight.export_failed', message: String((error as Error).message).slice(0, 200) }));
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
