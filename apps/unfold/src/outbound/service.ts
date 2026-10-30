import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Store } from '../store.ts';
import type { User } from '../types.ts';
import type { PloegEvent } from '../ploeg.ts';
import type { FactsQuery } from '../cards/service.ts';
import type { FactsPage, WorkItemFacts } from '../cards/facts.ts';
import type { TenantScope } from '../tenant-scope.ts';
import { defaultTenant, validTenancyId } from '../tenancy.ts';
import { deliveryRow, defaultAcceptanceCalendar, type AcceptanceCalendar } from '../delivery-ledger.ts';
import { cloudEvent, eventTypes, validFilter, type CloudEvent, type EventOwner } from './catalogue.ts';
import { webhookHeaders, newSecret } from './signing.ts';
import { TargetError, guardedLookup, parseTarget, resolveTarget, targetAllowlist, type OutboundEventsSettings, type TargetAllowlist } from './address.ts';
import { OutboundStore, type Delivery, type Subscription } from './store.ts';

/** The waits after each failed attempt, in milliseconds: Standard Webhooks' example schedule. The tenth failure is final. */
export const retrySchedule: readonly number[] = [5_000, 300_000, 1_800_000, 7_200_000, 18_000_000, 36_000_000, 50_400_000, 72_000_000, 86_400_000];
/** How many attempts a delivery gets before it is dead. */
export const maxAttempts = retrySchedule.length + 1;
/** How long Unfold waits for a receiver's answer. */
export const deliveryTimeoutMs = 15_000;
/** How long a rotated-out secret keeps signing next to the new one. */
export const rotationOverlapMs = 86_400_000;
/** How long finished deliveries are kept for the delivery log. */
export const deliveryRetentionDays = 30;
const jitter = 0.1;
const maxResponseBytes = 65_536;
const cursorName = 'ploeg-events';
const ledgerDays = 30;

/** The wait before the next attempt after `attempts` failed ones, with jitter from `random`; `null` once the delivery is dead. */
export function nextDelay(attempts: number, random: () => number = Math.random, retryAfterMs?: number): number | null {
  if (attempts >= maxAttempts) return null;
  const base = retrySchedule[attempts - 1];
  const jittered = Math.round(base * (1 - jitter + 2 * jitter * random()));
  return Math.max(jittered, retryAfterMs ?? 0);
}

/** A refusal from the admin API, with the HTTP status and code it answers with. */
export class OutboundError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = 'OutboundError'; }
}
const fail = (status: number, code: string, message: string): never => { throw new OutboundError(status, code, message); };

/** What the outbound events need from Ploeg's operator API, in the consumer's scope. */
export type OutboundPloeg = {
  followEvents(after: string): Promise<{ events: PloegEvent[]; lastCursor: string; more: boolean }>;
  latestEvents(before?: string): Promise<{ lastCursor: string }>;
  workItemFacts(id: string, fresh?: boolean): Promise<WorkItemFacts>;
  factsPage(query: FactsQuery, fresh?: boolean): Promise<FactsPage>;
};

/** One attempt's answer from a receiver: its status code and `Retry-After` in milliseconds, or the error that stopped it. */
export type SendResult = { status: number; retryAfterMs?: number } | { error: string };
/** Sends one signed POST; replaceable in tests. */
export type Transport = (url: URL, headers: Record<string, string>, body: string, allow: TargetAllowlist) => Promise<SendResult>;

function retryAfter(value: string | string[] | undefined): number | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text) return undefined;
  if (/^\d{1,7}$/.test(text)) return Number(text) * 1000;
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Sends with `node:http(s)`, checking every address it connects to, following no redirect, waiting at most 15 seconds. */
export const httpTransport: Transport = (url, headers, body, allow) => new Promise(resolve => {
  try { parseTarget(url.href, allow); } catch (error) { resolve({ error: error instanceof TargetError ? error.code : 'webhook_url' }); return; }
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const request = send(url, { method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(body) }, lookup: guardedLookup(allow) as never, timeout: deliveryTimeoutMs }, (response: IncomingMessage) => {
    let size = 0;
    response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maxResponseBytes) response.destroy(); });
    response.on('close', () => resolve({ status: response.statusCode ?? 0, retryAfterMs: retryAfter(response.headers['retry-after']) }));
  });
  request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'timeout' })));
  request.on('error', (error: NodeJS.ErrnoException) => resolve({ error: String(error.code ?? 'request_failed').slice(0, 64) }));
  request.end(body);
});

/** A subscription as the admin API shows it: never its secret, with its delivery counts. */
export type SubscriptionView = Subscription & { deliveries: Record<'pending' | 'delivered' | 'dead', number> };

/** The options of {@link OutboundEvents}. */
export type OutboundOptions = {
  settings?: OutboundEventsSettings;
  tenancy: TenantScope;
  enabled: (tenant: string) => Promise<boolean>;
  ploeg?: OutboundPloeg;
  ploegTeams?: readonly string[];
  baseUrl?: string;
  calendar?: AcceptanceCalendar;
  demo?: boolean;
  transport?: Transport;
  clock?: () => number;
  random?: () => number;
  resolver?: Parameters<typeof resolveTarget>[2];
};

const ploegSuffixes: Record<string, string> = {
  'work_item.proposed': 'work_item.proposed',
  'work_item.approved': 'work_item.approved',
  'operator.work_item.admitted': 'work_item.handed_off',
  'work_item.needs_human': 'work_item.needs_you',
  'work_item.stale': 'work_item.needs_you',
  'work_item.awaiting_review': 'work_item.ready_for_review',
  'work_item.done': 'work_item.done',
};

/** The catalogue type a Ploeg audit event becomes, or `undefined` when Unfold publishes nothing for it. */
export function ploegEventType(event: Pick<PloegEvent, 'action' | 'detail'>): string | undefined {
  if (Object.hasOwn(ploegSuffixes, event.action)) return ploegSuffixes[event.action];
  if (event.action === 'checkpoint.written' && event.detail.phase === 'pr_opened') return 'pull_request.opened';
  if (/^outcome\.[a-z_]{1,64}$/.test(event.action)) return 'run.finished';
  return undefined;
}

/**
 * Unfold's outbound events: it turns recorded facts into CloudEvents, keeps them in a durable outbox in the store, and
 * delivers them to admin-managed subscriptions as Standard Webhooks, retrying with backoff until a delivery is dead.
 */
export class OutboundEvents {
  readonly store: OutboundStore;
  private readonly options: OutboundOptions;
  private readonly allow: TargetAllowlist;
  private readonly transport: Transport;
  private readonly clock: () => number;
  private readonly random: () => number;
  private timers: NodeJS.Timeout[] = [];
  private busy = { dispatch: false, follow: false, ledger: false };
  private stopped = false;

  constructor(store: Store, options: OutboundOptions) {
    this.store = new OutboundStore(store);
    this.options = options;
    this.allow = targetAllowlist(options.settings?.allowedPrivateTargets ?? []);
    this.transport = options.transport ?? httpTransport;
    this.clock = options.clock ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  private now(): string { return new Date(this.clock()).toISOString(); }
  private log(level: 'info' | 'warn', event: string, fields: Record<string, unknown>): void {
    (level === 'warn' ? console.error : console.log)(JSON.stringify({ level, event, ...fields }));
  }

  /** Starts the background loops: delivery every 5 s, Ploeg's events and Sign-offs every 15 s, Acceptance hourly. */
  start(): void {
    const every = (ms: number, work: () => Promise<unknown>, first = ms) => {
      const run = () => { if (!this.stopped) void work().catch(error => this.log('warn', 'outbound.loop_failed', { message: String(error?.message ?? error).slice(0, 200) })); };
      this.timers.push(setTimeout(run, first).unref(), setInterval(run, ms).unref());
    };
    every(5_000, () => this.dispatch());
    every(15_000, async () => { await this.collectSignOffs(); await this.followPloeg(); });
    every(3_600_000, async () => { await this.sweepAcceptance(); this.store.prune(new Date(this.clock() - deliveryRetentionDays * 86_400_000).toISOString()); }, 60_000);
  }
  /** Stops the loops. A delivery in flight finishes; one not yet recorded is sent again after the next start. */
  stop(): void { this.stopped = true; for (const timer of this.timers) clearTimeout(timer); this.timers = []; }

  /** One round of every source and then of delivery; public so a test can drive it. */
  async tick(): Promise<void> { await this.collectSignOffs(); await this.followPloeg(); await this.dispatch(); }

  private async enabledTenants(tenants: Iterable<string>): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    for (const tenant of new Set(tenants)) result.set(tenant, await this.options.enabled(tenant).catch(() => false));
    return result;
  }

  private ownerOf(facts: WorkItemFacts | undefined): EventOwner | undefined {
    const owner = this.options.tenancy.workItemOwner(facts?.workItem.target ?? null);
    return owner ? { tenant: owner.tenant, ...(owner.client !== undefined ? { client: owner.client } : {}) } : undefined;
  }

  private workItemData(facts: WorkItemFacts | undefined, id: string, team: string): Record<string, unknown> {
    const item = facts?.workItem;
    return {
      id, title: item?.title ?? '', team: item?.team ?? team, state: item?.state ?? '', externalRef: item?.externalRef ?? '',
      trackerUrl: item?.url || null, unfoldUrl: this.options.baseUrl ? `${this.options.baseUrl.replace(/\/+$/, '')}/#work/${encodeURIComponent(id)}` : null,
    };
  }

  private pullRequestData(facts: WorkItemFacts | undefined): Record<string, unknown> | null {
    const prs = (facts?.pullRequests ?? []).filter(pr => pr.shiftId !== null);
    const pr = prs.find(entry => entry.state === 'open') ?? prs.at(-1);
    return pr ? { url: pr.url, number: pr.number, repository: `${pr.owner}/${pr.repo}` } : null;
  }

  private async factsFor(id: string, cache: Map<string, WorkItemFacts | undefined>): Promise<WorkItemFacts | undefined> {
    if (cache.has(id)) return cache.get(id);
    let facts: WorkItemFacts | undefined;
    try { facts = await this.options.ploeg!.workItemFacts(id, true); }
    catch (error: any) { if (![400, 404].includes(error?.status) && error?.code !== 'ploeg_unsupported') throw error; }
    cache.set(id, facts);
    return facts;
  }

  private async fromPloeg(event: PloegEvent, cache: Map<string, WorkItemFacts | undefined>): Promise<CloudEvent | undefined> {
    const suffix = ploegEventType(event);
    if (!suffix) return undefined;
    const facts = await this.factsFor(event.workItemId, cache);
    const owner = this.ownerOf(facts);
    if (!owner) return undefined;
    const data: Record<string, unknown> = { workItem: this.workItemData(facts, event.workItemId, event.team) };
    const reason = typeof event.detail.reason === 'string' && event.detail.reason ? event.detail.reason : null;
    if (['work_item.proposed', 'work_item.approved', 'work_item.needs_you', 'work_item.ready_for_review', 'work_item.done'].includes(suffix)) data.reason = reason;
    if (suffix === 'work_item.ready_for_review' || suffix === 'pull_request.opened') data.pullRequest = this.pullRequestData(facts);
    if (suffix === 'run.finished') data.run = { outcome: event.action.slice('outcome.'.length), role: typeof event.detail.role === 'string' ? event.detail.role : null, round: typeof event.detail.round === 'number' ? event.detail.round : null, shiftId: typeof event.detail.shiftId === 'string' ? event.detail.shiftId : null };
    return cloudEvent({ id: `ploeg-${event.id}`, suffix, owner, subject: `work-items/${event.workItemId}`, time: event.at, data });
  }

  /**
   * Follows Ploeg's audit events from the stored cursor and queues an event for each one that maps to the catalogue.
   * Each page's events, deliveries and the moved cursor commit together; a failed read moves nothing. The first read
   * starts at Ploeg's newest event, so no history is sent. Idle while no subscription is active.
   */
  async followPloeg(): Promise<number> {
    const ploeg = this.options.ploeg;
    if (!ploeg || this.busy.follow || !this.store.hasActive()) return 0;
    this.busy.follow = true;
    let queued = 0;
    try {
      let cursor = this.store.cursor(cursorName);
      if (cursor === undefined) { cursor = (await ploeg.latestEvents()).lastCursor; this.store.setCursor(cursorName, cursor, this.now()); return 0; }
      for (let page = 0; page < 10 && !this.stopped; page++) {
        const read = await ploeg.followEvents(cursor);
        const cache = new Map<string, WorkItemFacts | undefined>();
        const allowedTeams = this.options.ploegTeams;
        const events: CloudEvent[] = [];
        for (const entry of read.events) {
          if (allowedTeams && !allowedTeams.includes(entry.team)) continue;
          const built = await this.fromPloeg(entry, cache);
          if (built) events.push(built);
        }
        const enabled = await this.enabledTenants(events.map(entry => entry.tenant));
        const at = this.now();
        const next = read.lastCursor;
        queued += this.store.store.transaction(() => {
          let count = 0;
          for (const entry of events) count += this.store.enqueue(entry, at, tenant => enabled.get(tenant) === true);
          this.store.setCursor(cursorName, next, at);
          return count;
        });
        cursor = next;
        if (!read.more) break;
      }
    } finally { this.busy.follow = false; }
    return queued;
  }

  /** Turns the Client Sign-off changes the store's triggers recorded into events, and drops them in the same transaction. */
  async collectSignOffs(): Promise<number> {
    const changes = this.store.signOffChanges(100);
    if (!changes.length) return 0;
    const last = changes.at(-1)!.seq;
    if (!this.store.hasActive()) { this.store.dropSignOffChanges(last); return 0; }
    const suffixes: Record<string, string> = { current: 'client_sign_off.recorded', withdrawn: 'client_sign_off.withdrawn', dismissed: 'client_sign_off.dismissed' };
    const cache = new Map<string, WorkItemFacts | undefined>();
    const events: CloudEvent[] = [];
    for (const change of changes) {
      const suffix = suffixes[change.state];
      const body = this.store.signOffBody(change.signOffId);
      if (!suffix || !body) continue;
      const workItemId = String(body.workItemId);
      const facts = this.options.ploeg ? await this.factsFor(workItemId, cache) : undefined;
      const owner = this.ownerOf(facts);
      if (!owner) continue;
      const client = typeof body.client === 'string' && validTenancyId(body.client) ? body.client : owner.client;
      const signOffOwner: EventOwner = { tenant: owner.tenant, ...(client ? { client } : {}) };
      const pr = (body.pullRequest ?? {}) as Record<string, unknown>;
      const person = (body.person ?? {}) as Record<string, unknown>;
      const prUrl = (facts?.pullRequests ?? []).find(entry => entry.id === pr.id)?.url ?? null;
      events.push(cloudEvent({
        id: `sign-off-${change.signOffId}-${change.state}`, suffix, owner: signOffOwner, subject: `work-items/${workItemId}`, time: change.at,
        data: { workItem: this.workItemData(facts, workItemId, ''), signOff: { id: change.signOffId, answer: body.answer, state: change.state, headSha: body.headSha, pullRequestUrl: prUrl, attribution: person.attribution === 'proven' ? 'proven' : 'asserted' } },
      }));
    }
    const enabled = await this.enabledTenants(events.map(entry => entry.tenant));
    const at = this.now();
    return this.store.store.transaction(() => {
      let count = 0;
      for (const entry of events) count += this.store.enqueue(entry, at, tenant => enabled.get(tenant) === true);
      this.store.dropSignOffChanges(last);
      return count;
    });
  }

  /**
   * Reads the Delivery read model over the last 30 days and queues `delivery.accepted` once per accepted Work Item,
   * dated at its Acceptance. Idle without an active subscription or a connected Ploeg.
   */
  async sweepAcceptance(): Promise<number> {
    const ploeg = this.options.ploeg;
    if (!ploeg || this.busy.ledger || !this.store.hasActive()) return 0;
    this.busy.ledger = true;
    try {
      const until = this.clock();
      const since = new Date(until - ledgerDays * 86_400_000).toISOString();
      const events: CloudEvent[] = [];
      let before: string | undefined;
      for (let page = 0; page < 20; page++) {
        const read = await ploeg.factsPage({ since, limit: 25, ...(before ? { before } : {}) }, true);
        for (const facts of read.facts) {
          if (this.options.ploegTeams && !this.options.ploegTeams.includes(facts.workItem.team)) continue;
          if (!facts.shifts.length && !facts.pullRequests.some(pr => pr.shiftId !== null)) continue;
          const row = deliveryRow(facts, { until, calendar: this.options.calendar ?? defaultAcceptanceCalendar });
          if (!['merged', 'approved', 'silent'].includes(row.acceptance.kind) || !row.acceptance.at) continue;
          const owner = this.ownerOf(facts);
          if (!owner) continue;
          events.push(cloudEvent({ id: `delivery-accepted-${facts.workItem.id}`, suffix: 'delivery.accepted', owner, subject: `work-items/${facts.workItem.id}`, time: row.acceptance.at, data: { workItem: this.workItemData(facts, facts.workItem.id, facts.workItem.team), acceptance: { kind: row.acceptance.kind, at: row.acceptance.at, pullRequestUrl: row.acceptance.pullRequestUrl } } }));
        }
        if (!read.nextBefore) break;
        before = read.nextBefore;
      }
      const enabled = await this.enabledTenants(events.map(entry => entry.tenant));
      const at = this.now();
      return this.store.store.transaction(() => events.reduce((count, entry) => count + this.store.enqueue(entry, at, tenant => enabled.get(tenant) === true), 0));
    } finally { this.busy.ledger = false; }
  }

  private secretsFor(id: string): string[] {
    const secrets = this.store.secrets(id);
    if (!secrets) return [];
    return [secrets.current, ...(secrets.previous && secrets.previousUntil && Date.parse(secrets.previousUntil) > this.clock() ? [secrets.previous] : [])];
  }

  private async attempt(delivery: Delivery, body: string, subscription: Subscription): Promise<void> {
    const attempts = delivery.attempts + 1;
    const timestamp = Math.floor(this.clock() / 1000);
    const headers = { 'content-type': 'application/cloudevents+json; charset=utf-8', 'user-agent': 'Unfold-Webhooks/1', ...webhookHeaders(this.secretsFor(subscription.id), delivery.eventId, timestamp, body) };
    let result: SendResult;
    try { result = await this.transport(new URL(subscription.url), headers, body, this.allow); }
    catch (error: any) { result = { error: String(error?.code ?? 'request_failed').slice(0, 64) }; }
    const now = this.now();
    if ('status' in result && result.status >= 200 && result.status < 300) {
      this.store.recordAttempt(delivery.id, { status: 'delivered', attempts, nextAttemptAt: null, lastStatus: result.status, lastError: null, deliveredAt: now });
      return;
    }
    if ('status' in result && result.status === 410) {
      this.store.store.transaction(() => {
        this.store.recordAttempt(delivery.id, { status: 'dead', attempts, nextAttemptAt: null, lastStatus: 410, lastError: 'gone', deliveredAt: null });
        this.store.updateSubscription(subscription.id, { active: false, disabledReason: 'The receiver answered 410 Gone.' }, now);
      });
      this.log('warn', 'outbound.subscription_disabled', { subscription: subscription.id, reason: 'gone' });
      return;
    }
    const lastStatus = 'status' in result ? result.status : null;
    const lastError = 'error' in result ? result.error : result.status >= 300 && result.status < 400 ? 'redirect' : `status_${result.status}`;
    const wait = nextDelay(attempts, this.random, 'status' in result ? result.retryAfterMs : undefined);
    this.store.recordAttempt(delivery.id, { status: wait === null ? 'dead' : 'pending', attempts, nextAttemptAt: wait === null ? null : new Date(this.clock() + wait).toISOString(), lastStatus, lastError, deliveredAt: null });
    if (wait === null) this.log('warn', 'outbound.delivery_dead', { subscription: subscription.id, eventId: delivery.eventId, attempts, lastStatus, lastError });
  }

  /** Sends every delivery that is due, up to 50 per round and 8 at once; a Tenant whose flag is off waits. */
  async dispatch(): Promise<number> {
    if (this.busy.dispatch) return 0;
    this.busy.dispatch = true;
    try {
      const due = this.store.due(this.now(), 50);
      const subscriptions = new Map(this.store.subscriptions().map(entry => [entry.id, entry]));
      const enabled = await this.enabledTenants([...subscriptions.values()].map(entry => entry.tenant));
      const ready = due.filter(entry => { const subscription = subscriptions.get(entry.delivery.subscriptionId); return subscription && enabled.get(subscription.tenant); });
      for (let index = 0; index < ready.length && !this.stopped; index += 8) {
        await Promise.all(ready.slice(index, index + 8).map(entry => this.attempt(entry.delivery, entry.body, subscriptions.get(entry.delivery.subscriptionId)!)));
      }
      return ready.length;
    } finally { this.busy.dispatch = false; }
  }

  private administers(user: User, tenant: string): boolean {
    if (user.role !== 'admin') return false;
    if (!this.options.tenancy.enforced) return true;
    return (user.memberships ?? []).some(held => held.kind === 'tenant' && held.tenant === tenant && held.role === 'admin');
  }

  private view(subscription: Subscription): SubscriptionView { return { ...subscription, deliveries: this.store.counts(subscription.id) }; }

  private owned(user: User, id: string): Subscription {
    const subscription = this.store.subscription(id);
    if (!subscription || !this.administers(user, subscription.tenant)) return fail(404, 'webhook_not_found', 'No such webhook subscription.');
    return subscription;
  }

  private types(value: unknown): string[] {
    if (!Array.isArray(value) || !value.length || value.length > 50) return fail(400, 'webhook_types', 'Choose between 1 and 50 event types, such as dev.unfold.work_item.needs_you or dev.unfold.work_item.*.');
    const invalid = value.find(entry => !validFilter(entry));
    if (invalid !== undefined) return fail(400, 'webhook_types', `${String(invalid).slice(0, 200)} is not an event type Unfold publishes, nor a prefix of one ending in .*.`);
    return [...new Set(value as string[])];
  }

  private async target(value: unknown): Promise<string> {
    try { const url = parseTarget(value, this.allow); await resolveTarget(url, this.allow, this.options.resolver); return url.href; }
    catch (error) { if (error instanceof TargetError) return fail(400, error.code, error.message); throw error; }
  }

  /** The admin API's answer to `GET /api/admin/webhooks`. */
  async list(user: User): Promise<Record<string, unknown>> {
    const tenants = this.options.tenancy.enforced ? (user.memberships ?? []).filter(held => held.kind === 'tenant' && held.role === 'admin').map(held => held.tenant) : [defaultTenant];
    const enabled = await this.enabledTenants(tenants);
    return {
      demo: this.options.demo === true, sources: { ploeg: Boolean(this.options.ploeg), signOffs: true },
      tenants: tenants.map(tenant => ({ tenant, enabled: enabled.get(tenant) === true })),
      eventTypes: eventTypes.map(spec => ({ type: `dev.unfold.${spec.type}`, title: spec.title, summary: spec.summary })),
      allowedPrivateTargets: this.allow.entries,
      subscriptions: this.store.subscriptions().filter(entry => this.administers(user, entry.tenant)).map(entry => this.view(entry)),
    };
  }

  /**
   * Answers the admin API under `/api/admin/webhooks`. `read` gives the parsed JSON body. Returns the status and body, or
   * throws an {@link OutboundError}.
   */
  async route(user: User, method: string, path: string, read: () => Promise<Record<string, unknown>>): Promise<{ status: number; body: unknown }> {
    if (user.role !== 'admin') fail(403, 'forbidden', 'Only administrators manage webhooks.');
    const match = /^\/api\/admin\/webhooks(?:\/(sub_[a-f0-9]{24})(?:\/(rotate-secret|test|deliveries)(?:\/(\d{1,15})\/resend)?)?)?$/.exec(path);
    if (!match) return fail(404, 'not_found', 'Webhook route not found.');
    const [, id, action, deliveryId] = match;
    const at = this.now();
    if (!id) {
      if (method === 'GET') return { status: 200, body: await this.list(user) };
      if (method !== 'POST') fail(405, 'method', 'List webhooks with GET and create one with POST.');
      const data = await read();
      const tenant = data.tenant === undefined ? defaultTenant : data.tenant;
      if (!validTenancyId(tenant)) fail(400, 'webhook_scope', 'Name the Tenant as lower-case letters, digits and inner hyphens.');
      if (data.client !== undefined && data.client !== null && !validTenancyId(data.client)) fail(400, 'webhook_scope', 'Name the Client as lower-case letters, digits and inner hyphens, or leave it out for the whole Tenant.');
      if (!this.administers(user, tenant as string)) fail(403, 'forbidden', 'Only an administrator of this Tenant manages its webhooks.');
      if (!await this.options.enabled(tenant as string).catch(() => false)) fail(409, 'webhooks_off', 'Webhooks are off for this Tenant. An administrator turns them on with the events.webhooks flag.');
      const description = data.description === undefined ? '' : typeof data.description === 'string' && data.description.length <= 200 ? data.description.trim() : fail(400, 'webhook_description', 'A description is at most 200 characters.');
      const url = await this.target(data.url);
      const types = this.types(data.types);
      if (this.store.subscriptions().length >= 100) fail(409, 'webhook_limit', 'This workbench holds at most 100 webhook subscriptions.');
      const secret = newSecret();
      const created = this.store.createSubscription({ tenant: tenant as string, client: (data.client as string | undefined) ?? null, url, types, description, createdAt: at, createdBy: user.id }, secret);
      this.log('info', 'outbound.subscription_created', { subscription: created.id, actor: user.id, tenant: created.tenant, client: created.client, types: created.types.length });
      return { status: 201, body: { subscription: this.view(created), secret } };
    }
    const subscription = this.owned(user, id);
    if (!action) {
      if (method === 'GET') return { status: 200, body: { subscription: this.view(subscription) } };
      if (method === 'DELETE') { this.store.deleteSubscription(id); this.log('info', 'outbound.subscription_deleted', { subscription: id, actor: user.id }); return { status: 200, body: { deleted: id } }; }
      if (method !== 'PATCH') fail(405, 'method', 'Read a webhook with GET, change it with PATCH or delete it with DELETE.');
      const data = await read();
      const change: Parameters<OutboundStore['updateSubscription']>[1] = {};
      if (data.url !== undefined) change.url = await this.target(data.url);
      if (data.types !== undefined) change.types = this.types(data.types);
      if (data.description !== undefined) change.description = typeof data.description === 'string' && data.description.length <= 200 ? data.description.trim() : fail(400, 'webhook_description', 'A description is at most 200 characters.');
      if (data.active !== undefined) change.active = typeof data.active === 'boolean' ? data.active : fail(400, 'webhook_active', 'active is true or false.');
      return { status: 200, body: { subscription: this.view(this.store.updateSubscription(id, change, at)!) } };
    }
    if (method !== (action === 'deliveries' && !deliveryId ? 'GET' : 'POST')) fail(405, 'method', action === 'deliveries' && !deliveryId ? 'List deliveries with GET.' : 'Use POST.');
    if (action === 'rotate-secret') {
      const secret = newSecret();
      this.store.rotateSecret(id, secret, new Date(this.clock() + rotationOverlapMs).toISOString());
      this.log('info', 'outbound.secret_rotated', { subscription: id, actor: user.id });
      return { status: 200, body: { subscription: this.view(subscription), secret, previousSignsUntil: new Date(this.clock() + rotationOverlapMs).toISOString() } };
    }
    if (action === 'test') {
      const event = cloudEvent({ id: `test-${id}-${this.clock()}`, suffix: 'webhook.test', owner: { tenant: subscription.tenant, ...(subscription.client ? { client: subscription.client } : {}) }, subject: `webhooks/${id}`, time: at, data: { test: true, message: 'A test event from Unfold. It reports nothing that happened.' } });
      this.store.enqueueTo(id, event, at);
      return { status: 202, body: { queued: event.id } };
    }
    if (deliveryId) {
      const delivery = this.store.delivery(Number(deliveryId));
      if (!delivery || delivery.subscriptionId !== id) fail(404, 'webhook_delivery_not_found', 'No such delivery for this webhook.');
      if (!this.store.resend(Number(deliveryId), at)) fail(409, 'webhook_delivery_not_dead', 'Only a dead delivery can be sent again; a pending one retries by itself.');
      return { status: 202, body: { delivery: this.store.delivery(Number(deliveryId)) } };
    }
    return { status: 200, body: { deliveries: this.store.deliveries(id, 100) } };
  }
}
