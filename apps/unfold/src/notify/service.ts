import type { Store } from '../store.ts';
import type { User } from '../types.ts';
import type { PloegEvent } from '../ploeg.ts';
import type { WorkItemFacts } from '../cards/facts.ts';
import type { TaskTarget } from '../tasks.ts';
import { ploegEventType } from '../outbound/catalogue.ts';
import { ChannelRegistry, NtfyChannel, WebPushChannel, type NotificationChannel, type SendOutcome, type Transport } from './channels.ts';
import { NotifyError, parsePreferences, quietUntil, refuse, type Preferences } from './preferences.ts';
import { defaultBudgetThresholds, type NotificationSettings } from './settings.ts';
import { NotifyStore, type OutboxEntry } from './store.ts';
import { permissionMessage, testMessage, triggers, workItemMessage, type NotificationMessage, type TriggerId } from './triggers.ts';

export { NotifyError };

/** The waits after each failed attempt, in milliseconds. After the last one the notice is given up. */
export const retrySchedule: readonly number[] = [30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000];
/** A notice older than this is given up instead of sent late. */
export const maxNoticeAgeMs = 86_400_000;
/** How long finished notices are kept for the person's recent list. */
export const retentionDays = 14;
const ploegCursor = 'ploeg-events';
const permissionCursor = 'linked-permissions';
const signOffCursor = 'client-sign-offs';

/** What the notifier needs from Ploeg's operator API, in the consumer's scope. */
export type NotifyPloeg = {
  followEvents(after: string): Promise<{ events: PloegEvent[]; lastCursor: string; more: boolean }>;
  latestEvents(before?: string): Promise<{ lastCursor: string }>;
  workItemFacts(id: string, fresh?: boolean): Promise<WorkItemFacts>;
};

/** The options of {@link Notifications}. */
export type NotificationsOptions = {
  settings?: NotificationSettings;
  /** Whether the `notifications.push` flag is on for a person. */
  enabled: (user: User) => Promise<boolean>;
  /** Whether a person may read a Work Item of `team` with `target`: its Team in their scope and its owner within their reach. */
  canRead: (user: User, team: string, target: TaskTarget | null) => boolean;
  ploeg?: NotifyPloeg;
  baseUrl?: string;
  demo?: boolean;
  /** Channels to register instead of ntfy and Web Push from `settings`. */
  channels?: NotificationChannel[];
  transport?: Transport;
  clock?: () => number;
};

type Recipient = { user: User; preferences: Preferences };
const reasonOf = (facts: WorkItemFacts | undefined) => facts?.shifts.at(-1)?.closeReason ?? '';

/**
 * Tells people that something waits for them, over the channels they chose. It reads Ploeg's audit events, the
 * Linked Session permission requests and the Client Sign-offs, queues one notice per person, channel, target and
 * trigger occurrence in a durable outbox, and delivers it outside the person's quiet hours, retrying with backoff.
 * In the demo it follows nothing and sends nothing.
 */
export class Notifications {
  readonly store: NotifyStore;
  readonly registry = new ChannelRegistry();
  private readonly options: NotificationsOptions;
  private readonly clock: () => number;
  private readonly thresholds: readonly number[];
  private timers: NodeJS.Timeout[] = [];
  private busy = { dispatch: false, follow: false };
  private stopped = false;

  constructor(store: Store, options: NotificationsOptions) {
    this.store = new NotifyStore(store);
    this.options = options;
    this.clock = options.clock ?? Date.now;
    this.thresholds = options.settings?.budgetThresholds ?? defaultBudgetThresholds;
    const channels = options.channels ?? [
      new NtfyChannel(this.store, options.settings?.ntfy, options.transport),
      new WebPushChannel(this.store, options.settings?.webPush, options.transport, process.env, this.clock),
    ];
    for (const channel of channels) this.registry.register(channel);
  }

  private now(): string { return new Date(this.clock()).toISOString(); }
  private log(event: string, fields: Record<string, unknown>): void { console.error(JSON.stringify({ level: 'warn', event, ...fields })); }

  /** Starts delivery every 5 seconds and the sources every 15; finished notices are pruned hourly. Does nothing in the demo. */
  start(): void {
    if (this.options.demo) return;
    const every = (ms: number, work: () => Promise<unknown>) => {
      const run = () => { if (!this.stopped) void work().catch(error => this.log('notify.loop_failed', { message: String(error?.message ?? error).slice(0, 200) })); };
      this.timers.push(setInterval(run, ms).unref());
    };
    every(5_000, () => this.dispatch());
    every(15_000, () => this.collect());
    every(3_600_000, async () => this.store.prune(new Date(this.clock() - retentionDays * 86_400_000).toISOString()));
  }
  /** Stops the loops. A send in flight finishes; a notice not yet settled is sent again after the next start. */
  stop(): void { this.stopped = true; for (const timer of this.timers) clearInterval(timer); this.timers = []; }

  /** One round of every source and then of delivery; public so a test can drive it. */
  async tick(): Promise<void> { await this.collect(); await this.dispatch(); }

  /** Reads every source once. Idle while nobody chose a trigger, and always in the demo. */
  async collect(): Promise<void> {
    if (this.options.demo) return;
    await this.collectPermissions();
    await this.collectSignOffs();
    await this.followPloeg();
  }

  private async recipients(want: TriggerId, filter: (user: User) => boolean): Promise<Recipient[]> {
    const found: Recipient[] = [];
    for (const { userId, preferences } of this.store.subscribers()) {
      if (!preferences.triggers.includes(want)) continue;
      const stored = this.store.store.getUser(userId);
      if (!stored) continue;
      const user: User = { id: stored.id, name: stored.name, role: stored.role, ...(stored.memberships ? { memberships: stored.memberships } : {}) };
      if (!filter(user) || !await this.options.enabled(user).catch(() => false)) continue;
      found.push({ user, preferences });
    }
    return found;
  }

  /** Queues `message` for each recipient on each chosen, available channel and each of its targets, once per `key`. */
  private queue(recipients: Recipient[], key: string, message: NotificationMessage): number {
    const at = this.now();
    let queued = 0;
    for (const { user, preferences } of recipients) {
      for (const id of preferences.channels) {
        const channel = this.registry.get(id);
        if (!channel?.available()) continue;
        for (const target of this.store.targets(user.id, id)) if (this.store.enqueue(user.id, id, target.id, key, message, at)) queued++;
      }
    }
    return queued;
  }

  private readersOf(facts: WorkItemFacts | undefined, team: string): (user: User) => boolean {
    return user => this.options.canRead(user, facts?.workItem.team ?? team, (facts?.workItem.target ?? null) as TaskTarget | null);
  }

  private async factsFor(id: string, cache: Map<string, WorkItemFacts | undefined>): Promise<WorkItemFacts | undefined> {
    if (cache.has(id)) return cache.get(id);
    let facts: WorkItemFacts | undefined;
    try { facts = await this.options.ploeg!.workItemFacts(id, true); }
    catch (error: any) { if (![400, 404].includes(error?.status) && error?.code !== 'ploeg_unsupported') throw error; }
    cache.set(id, facts);
    return facts;
  }

  /** The budget share a Work Item's latest open Shift crossed, the highest configured one, or `undefined`. */
  private crossedShare(facts: WorkItemFacts | undefined): { shiftId: string; share: number } | undefined {
    const shift = facts?.shifts.filter(entry => entry.budgetUsd > 0).at(-1);
    if (!shift) return undefined;
    const used = (shift.spentUsd + shift.reservedUsd) / shift.budgetUsd;
    const share = [...this.thresholds].reverse().find(entry => used >= entry);
    return share === undefined ? undefined : { shiftId: shift.id, share };
  }

  private async fromPloeg(event: PloegEvent, cache: Map<string, WorkItemFacts | undefined>): Promise<number> {
    const wanted = new Set(this.store.subscribers().flatMap(entry => entry.preferences.triggers));
    const type = ploegEventType(event);
    const outcome = type === 'run.finished';
    const parked = type === 'work_item.needs_you';
    const review = type === 'work_item.ready_for_review';
    if (!(outcome && wanted.has('budget')) && !(parked && (wanted.has('needs_you') || wanted.has('question'))) && !(review && wanted.has('review'))) return 0;
    const facts = await this.factsFor(event.workItemId, cache);
    const item = { id: event.workItemId, title: facts?.workItem.title ?? '' };
    const readers = this.readersOf(facts, event.team);
    if (outcome) {
      const crossed = this.crossedShare(facts);
      if (!crossed) return 0;
      const message = workItemMessage('budget', item, this.options.baseUrl, crossed.share);
      return this.queue(await this.recipients('budget', readers), `budget:${crossed.shiftId}:${crossed.share}`, message);
    }
    const trigger: TriggerId = review ? 'review' : event.action === 'work_item.needs_human' && reasonOf(facts).startsWith('question_for_person') ? 'question' : 'needs_you';
    return this.queue(await this.recipients(trigger, readers), `${trigger}:ploeg-${event.id}`, workItemMessage(trigger, item, this.options.baseUrl));
  }

  /**
   * Follows Ploeg's audit events from its own stored cursor and classifies them with the outbound event catalogue's
   * {@link ploegEventType}. The first read starts at Ploeg's newest event, so no history is sent; a failed read moves
   * nothing, and a replayed event queues nothing new because each notice is keyed by it.
   */
  async followPloeg(): Promise<number> {
    const ploeg = this.options.ploeg;
    if (!ploeg || this.busy.follow || !this.store.subscribers().length) return 0;
    this.busy.follow = true;
    let queued = 0;
    try {
      let cursor = this.store.cursor(ploegCursor);
      if (cursor === undefined) { this.store.setCursor(ploegCursor, (await ploeg.latestEvents()).lastCursor, this.now()); return 0; }
      for (let page = 0; page < 10 && !this.stopped; page++) {
        const read = await ploeg.followEvents(cursor);
        const cache = new Map<string, WorkItemFacts | undefined>();
        for (const event of read.events) queued += await this.fromPloeg(event, cache);
        cursor = read.lastCursor;
        this.store.setCursor(ploegCursor, cursor, this.now());
        if (!read.more) break;
      }
    } finally { this.busy.follow = false; }
    return queued;
  }

  private rowsAfter(table: string, cursorName: string, columns: string): { rowid: number; [key: string]: unknown }[] {
    if (!this.store.hasTable(table)) return [];
    const cursor = this.store.cursor(cursorName);
    if (cursor === undefined) {
      const last = (this.store.db.prepare(`SELECT COALESCE(MAX(rowid),0) AS last FROM ${table}`).get() as { last: number }).last;
      this.store.setCursor(cursorName, String(last), this.now());
      return [];
    }
    const rows = this.store.db.prepare(`SELECT rowid, ${columns} FROM ${table} WHERE rowid>? ORDER BY rowid LIMIT 200`).all(Number(cursor)) as { rowid: number }[];
    if (rows.length) this.store.setCursor(cursorName, String(rows.at(-1)!.rowid), this.now());
    return rows;
  }

  /** Queues a `question` notice to the owner of each Linked Session that asked for a tool permission since the last read. */
  async collectPermissions(): Promise<number> {
    let queued = 0;
    for (const row of this.rowsAfter('linked_session_permissions', permissionCursor, 'id, session_id, state, body')) {
      if (row.state !== 'pending') continue;
      const ownerId = String(JSON.parse(String(row.body)).ownerId ?? '');
      queued += this.queue(await this.recipients('question', user => user.id === ownerId), `question:permission-${row.id}`, permissionMessage(String(row.session_id), this.options.baseUrl));
    }
    return queued;
  }

  /** Queues a `sign_off` notice to the readers of each Work Item that got a current Client Sign-off since the last read. */
  async collectSignOffs(): Promise<number> {
    const rows = this.rowsAfter('client_sign_offs', signOffCursor, 'id, work_item_id, state');
    if (!this.options.ploeg) return 0;
    let queued = 0;
    const cache = new Map<string, WorkItemFacts | undefined>();
    for (const row of rows) {
      if (row.state !== 'current') continue;
      const id = String(row.work_item_id);
      const facts = await this.factsFor(id, cache);
      if (!facts) continue;
      queued += this.queue(await this.recipients('sign_off', this.readersOf(facts, facts.workItem.team)), `sign_off:${row.id}`, workItemMessage('sign_off', { id, title: facts.workItem.title }, this.options.baseUrl));
    }
    return queued;
  }

  private async attempt(entry: OutboxEntry, at: number): Promise<void> {
    const iso = new Date(at).toISOString();
    if (at - Date.parse(entry.createdAt) > maxNoticeAgeMs) return this.store.settle(entry.id, 'dead', iso, { lastError: 'too_old' });
    const preferences = this.store.preferences(entry.userId);
    const channel = this.registry.get(entry.channel);
    const target = this.store.target(entry.targetId);
    if (!channel || !target || (entry.message.trigger !== 'test' && !preferences.channels.includes(entry.channel))) return this.store.settle(entry.id, 'dropped', iso, { lastError: 'not_chosen' });
    if (entry.message.trigger !== 'test') {
      const until = quietUntil(preferences.quietHours, at);
      if (until !== null) return this.store.settle(entry.id, 'pending', iso, { nextAt: new Date(until).toISOString() });
    }
    const outcome: SendOutcome = await channel.send(entry.message, target).catch((error: Error) => ({ kind: 'retry' as const, reason: String(error?.message ?? 'send_failed').slice(0, 64) }));
    const attempts = entry.attempts + 1;
    if (outcome.kind === 'delivered') return this.store.settle(entry.id, 'delivered', iso, { attempts, lastError: '' });
    if (outcome.kind === 'gone') {
      this.store.settle(entry.id, 'dropped', iso, { attempts, lastError: outcome.reason });
      this.store.deleteTarget(target.id);
      return;
    }
    if (outcome.kind === 'failed' || attempts > retrySchedule.length) return this.store.settle(entry.id, 'dead', iso, { attempts, lastError: outcome.reason });
    const wait = Math.max(retrySchedule[attempts - 1], (outcome.kind === 'retry' ? outcome.retryAfterMs : undefined) ?? 0);
    this.store.settle(entry.id, 'pending', iso, { attempts, lastError: outcome.reason, nextAt: new Date(at + wait).toISOString() });
  }

  /** Sends every due notice once. Never in the demo. */
  async dispatch(): Promise<number> {
    if (this.options.demo || this.busy.dispatch) return 0;
    this.busy.dispatch = true;
    try {
      const at = this.clock();
      const due = this.store.due(new Date(at).toISOString(), 50);
      for (const entry of due) { if (this.stopped) break; await this.attempt(entry, at); }
      return due.length;
    } finally { this.busy.dispatch = false; }
  }

  private view(user: User, enabled: boolean): Record<string, unknown> {
    const demo = this.options.demo === true;
    if (!enabled) return { enabled: false, demo };
    return {
      enabled: true, demo, triggers,
      preferences: this.store.preferences(user.id),
      channels: this.registry.list().map(channel => ({ id: channel.id, label: channel.label, available: channel.available(), ...(channel.available() ? channel.describe(user.id) : {}) })),
      recent: this.store.recent(user.id, 20).map(entry => ({ id: entry.id, trigger: entry.message.trigger, title: entry.message.title, channel: entry.channel, state: entry.state, attempts: entry.attempts, createdAt: entry.createdAt, updatedAt: entry.updatedAt, lastError: entry.lastError })),
    };
  }

  /**
   * Answers `/api/me/notifications` and below for the signed-in person: read and replace their preferences, forget
   * everything, send themselves a test notice, and each channel's own routes under `channels/<id>/`.
   */
  async route(user: User, method: string, path: string, readBody: () => Promise<unknown>): Promise<{ status: number; body: unknown }> {
    const enabled = await this.options.enabled(user).catch(() => false);
    const rest = path.slice('/api/me/notifications'.length).split('/').filter(Boolean);
    const at = this.now();
    if (!rest.length && method === 'GET') return { status: 200, body: this.view(user, enabled) };
    if (!enabled) return refuse(404, 'notifications_off', 'Notifications are not switched on for you.');
    if (!rest.length && method === 'PUT') {
      const preferences = parsePreferences(await readBody(), this.registry.available());
      for (const id of preferences.channels) this.registry.get(id)!.enable(user.id, at);
      this.store.setPreferences(user.id, preferences, at);
      return { status: 200, body: this.view(user, true) };
    }
    if (!rest.length && method === 'DELETE') { this.store.forget(user.id); return { status: 200, body: this.view(user, true) }; }
    if (rest.length === 1 && rest[0] === 'test' && method === 'POST') {
      if (this.options.demo) return { status: 200, body: { demo: true, queued: 0, message: 'The demo sends no notifications.' } };
      const preferences = this.store.preferences(user.id);
      const queued = this.queue([{ user, preferences }], `test:${at}`, testMessage(this.options.baseUrl));
      return { status: 202, body: { demo: false, queued } };
    }
    if (rest[0] === 'channels' && rest[1]) {
      const channel = this.registry.get(rest[1]);
      if (!channel?.route) return refuse(404, 'not_found', 'Unknown notification channel.');
      const answer = await channel.route(user.id, method, rest.slice(2), readBody, at);
      return { status: answer.status, body: { ...this.view(user, true), result: answer.body } };
    }
    return refuse(rest.length ? 404 : 405, rest.length ? 'not_found' : 'method', rest.length ? 'Unknown notifications route.' : 'Unsupported method.');
  }
}
