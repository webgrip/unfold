import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { channelOf, confirmationOf, type ActionTarget } from '../action-records.ts';
import { signedInUser, type Auth } from '../auth.ts';
import type { AccountChange, Store, StoredUser } from '../store.ts';
import { defaultMemberships, defaultTenant, ownership, type Membership } from '../tenancy.ts';
import type { AppConfig, AuditConfig, User } from '../types.ts';
import { capture, readsUserFirst } from './capture.ts';
import { clientAddress } from '../client-address.ts';
import { AuditChain, type StoredAuditRecord } from './chain.ts';
import { AuditOtlpExporter, maxPage, ndjson } from './export.ts';
import { AuditCheckpoints } from './checkpoints.ts';
import { ObjectStore } from './object-store.ts';
import { OpenBaoTransitSigner } from './signer.ts';
import { defaultRetentionDays } from './settings.ts';
import { JobQueue } from '../jobs/queue.ts';
import { JobWorker } from '../jobs/worker.ts';

/** The job kind that sends the audit records the OTLP collector has not taken yet. */
export const auditExportJob = 'audit.export';
import { ocsfEvent, type AuditActor, type AuditEntry, type AuditFact, type AuditOrigin, type AuditOutcome, type AuditPerson } from './ocsf.ts';

const hourMs = 3_600_000;
const dayMs = 86_400_000;
const startupCheckpointDelayMs = 1_000;

/** What the audit trail receives: a fact, who did it, from where, and optionally its Tenants and target. */
export type AuditInput = { fact: AuditFact; actor?: AuditActor; origin?: AuditOrigin; at?: Date; tenants?: string[]; target?: ActionTarget | null };

/** One request to `unfold-mcp` over HTTP, as the MCP endpoint reports it. */
export type McpAuditEntry = { user?: User; client?: string; method?: string; tool?: string; status: number; outcome: AuditOutcome; reason?: string; ip?: string; userAgent?: string; delegation?: string; issuer?: string };

export type AuditTrailOptions = {
  store: Store;
  settings?: AuditConfig;
  config?: Pick<AppConfig, 'mode' | 'repositories' | 'taskSources' | 'auth' | 'trustedProxies'>;
  /** Whether a Tenant's records may leave Unfold: the `audit.export` flag. Off when absent. */
  exportEnabled?: (tenant: string) => Promise<boolean>;
  /** Runs retention and checkpoints at start and hourly, and sends to the OTLP endpoint after each record. */
  schedule?: boolean;
  fetch?: typeof fetch;
  now?: () => Date;
  log?: (line: string) => void;
  /** The application's job worker; with `schedule` and no worker, the trail makes its own. */
  jobs?: JobWorker;
};

const person = (user: User | StoredUser): AuditPerson => ({ id: user.id, name: user.name, role: user.role, ...(user.memberships ? { memberships: user.memberships } : {}) });
const effectiveMemberships = (user: StoredUser): Membership[] => user.passwordHash === '' ? user.memberships ?? [] : defaultMemberships(user.role);
const tokenUid = (token: string): string => createHash('sha256').update(token).digest('hex').slice(0, 32);
const personal = new Set<AuditFact['kind']>(['sign_in', 'sign_out', 'credential', 'account', 'role']);

/**
 * Unfold's security audit (system ADR-0050 rule 3, proposed): each security-relevant event becomes an OCSF 1.9.0
 * record appended to the hash chain of every Tenant it concerns, kept for the configured retention, and sent out as
 * OTLP logs or read as NDJSON only while the Tenant's `audit.export` flag is on.
 */
export class AuditTrail {
  readonly chain: AuditChain;
  readonly retentionDays: number;
  /** The daily signed and copied chain heads, when a signer or a bucket is configured. */
  readonly checkpoints: AuditCheckpoints | undefined;
  private readonly store: Store;
  private readonly config: AuditTrailOptions['config'];
  private readonly exportEnabled: (tenant: string) => Promise<boolean>;
  private readonly now: () => Date;
  private readonly log: (line: string) => void;
  private readonly exporter: AuditOtlpExporter | undefined;
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly schedule: boolean;
  private readonly jobs: JobWorker | undefined;
  private readonly ownJobs: boolean;
  private readonly lastWarnAt = new Map<string, number>();

  constructor(options: AuditTrailOptions) {
    this.store = options.store;
    this.config = options.config;
    this.chain = new AuditChain(options.store.db);
    this.retentionDays = options.settings?.retentionDays ?? defaultRetentionDays;
    this.exportEnabled = options.exportEnabled ?? (async () => false);
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? (line => console.error(line));
    this.schedule = options.schedule === true;
    this.exporter = options.settings?.otlp ? new AuditOtlpExporter({ chain: this.chain, target: options.settings.otlp, enabled: this.exportEnabled, environment: options.config?.mode ?? 'live', ...(options.fetch ? { fetch: options.fetch } : {}), warn: message => this.warn('audit.export_failed', message) }) : undefined;
    const settings = options.settings;
    const signer = settings?.openbao ? new OpenBaoTransitSigner(settings.openbao, options.fetch ? { fetch: options.fetch } : {}) : undefined;
    const storage = settings?.checkpointStorage ? new ObjectStore(settings.checkpointStorage, { now: this.now, ...(options.fetch ? { fetch: options.fetch } : {}) }) : undefined;
    this.checkpoints = signer || storage ? new AuditCheckpoints({ chain: this.chain, ...(signer ? { signer } : {}), ...(storage ? { storage } : {}), now: this.now, warn: message => this.warn('audit.checkpoint_failed', message), info: fields => this.log(JSON.stringify({ level: 'info', ...fields })) }) : undefined;
    options.store.observeAccounts(change => this.account(change));
    this.ownJobs = this.schedule && Boolean(this.exporter) && !options.jobs;
    this.jobs = this.schedule && this.exporter ? options.jobs ?? new JobWorker(new JobQueue(options.store), { clock: () => this.now().getTime() }) : undefined;
    this.jobs?.register({
      kind: auditExportJob, leaseMs: 120_000, backoff: { baseMs: 30_000, maxMs: hourMs }, retainMs: dayMs,
      run: async () => (await this.exporter!.flush()) ? { done: true } : { retry: 'the collector did not take the records' },
    });
    if (this.ownJobs) this.jobs!.start();
    if (this.schedule) {
      this.prune();
      if (this.checkpoints) {
        const first = setTimeout(() => void this.checkpoint(), startupCheckpointDelayMs);
        first.unref();
        this.timers.push(first);
      }
      const hourly = setInterval(() => { this.prune(); this.queueExport(0); void this.checkpoint(); }, hourMs);
      hourly.unref();
      this.timers.push(hourly);
    }
  }

  /** Appends one fact to the chain of each Tenant it concerns and returns the stored records; never throws. */
  record(input: AuditInput): StoredAuditRecord[] {
    try {
      const entry: AuditEntry = { fact: input.fact, actor: input.actor ?? {}, ...(input.origin ? { origin: input.origin } : {}), at: input.at ?? this.now() };
      const event = ocsfEvent(entry);
      const stored = this.tenantsFor(input).map(tenant => this.chain.append(tenant, event));
      this.queueExport(1000);
      return stored;
    } catch (error) {
      this.log(JSON.stringify({ level: 'error', event: 'audit.record_failed', kind: input.fact.kind, message: String((error as Error)?.message ?? error).slice(0, 300) }));
      return [];
    }
  }

  private tenantsFor(input: AuditInput): string[] {
    if (input.tenants?.length) return [...new Set(input.tenants)];
    const fact = input.fact;
    if (fact.kind === 'membership') return [fact.tenant];
    const of = (memberships: Membership[] | undefined) => [...new Set((memberships ?? []).map(entry => entry.tenant))];
    if (personal.has(fact.kind)) {
      const subject = 'user' in fact ? fact.user : undefined;
      const tenants = of(subject?.memberships ?? input.actor?.user?.memberships);
      return tenants.length ? tenants : [defaultTenant];
    }
    const target = this.targetTenant(input.target ?? (fact.kind === 'api' ? fact.target : undefined) ?? null);
    if (target) return [target];
    const actorTenants = of(input.actor?.user?.memberships);
    return actorTenants.length === 1 ? actorTenants : [defaultTenant];
  }

  private targetTenant(target: { kind: string; id: string } | null): string | undefined {
    if (!target || !this.config) return undefined;
    if (target.kind === 'task') {
      const source = this.config.taskSources?.find(entry => entry.id === target.id.split(':')[0]);
      return source ? ownership(source).tenant : undefined;
    }
    if (target.kind === 'session') {
      const repositoryId = this.store.getSession(target.id)?.repositoryId;
      const repository = this.config.repositories.find(entry => entry.id === repositoryId);
      return repository ? ownership(repository).tenant : undefined;
    }
    return undefined;
  }

  private account(change: AccountChange): void {
    const { before, after } = change;
    const sso = after.passwordHash === '';
    const oidc = this.config?.auth.oidc;
    const actor: AuditActor = sso ? { ...(oidc ? { idp: { name: oidc.displayName, uid: oidc.issuer } } : {}), invokedBy: 'single sign-on at sign-in' } : { invokedBy: 'local account administration' };
    const subject = person(after);
    const held = effectiveMemberships(after);
    const subjectTenants = [...new Set(held.map(entry => entry.tenant))];
    const facts: AuditFact[] = [];
    if (!before) facts.push({ kind: 'account', action: 'create', user: subject });
    else {
      if (before.name !== after.name) facts.push({ kind: 'account', action: 'rename', user: subject, previousName: before.name });
      if (before.role !== after.role) facts.push({ kind: 'role', user: subject, role: after.role, previous: before.role });
    }
    const was = before ? effectiveMemberships(before) : [];
    const key = (entry: Membership) => entry.kind === 'tenant' ? `t:${entry.tenant}` : `c:${entry.tenant}/${entry.client}`;
    const previous = new Map(was.map(entry => [key(entry), entry]));
    for (const entry of held) {
      const old = previous.get(key(entry));
      previous.delete(key(entry));
      const client = entry.kind === 'client' ? { client: entry.client } : {};
      if (!old) facts.push({ kind: 'membership', action: 'add', user: subject, tenant: entry.tenant, ...client, ...(entry.kind === 'tenant' ? { role: entry.role } : {}) });
      else if (entry.kind === 'tenant' && old.kind === 'tenant' && old.role !== entry.role) facts.push({ kind: 'membership', action: 'role', user: subject, tenant: entry.tenant, role: entry.role, previous: old.role });
    }
    for (const entry of previous.values()) facts.push({ kind: 'membership', action: 'remove', user: subject, tenant: entry.tenant, ...(entry.kind === 'client' ? { client: entry.client } : { previous: entry.role }) });
    const allTenants = [...new Set([...subjectTenants, ...was.map(entry => entry.tenant)])];
    for (const fact of facts) this.record({ fact, actor, ...(fact.kind !== 'membership' ? { tenants: allTenants.length ? allTenants : [defaultTenant] } : {}) });
  }

  /**
   * Watches one request and records what it did once the response finishes: the server's request listener calls it
   * first. `inputs` returns the parsed JSON body, if the handler read one.
   */
  watch(req: IncomingMessage, res: ServerResponse, auth: Auth, inputs: () => Record<string, unknown> | undefined): void {
    try {
      const method = req.method || 'GET';
      const url = new URL(req.url || '/', 'http://localhost');
      if (!url.pathname.startsWith('/api/')) return;
      const first = readsUserFirst(method, url.pathname);
      const before = first ? auth.user(req) : undefined;
      const firstScope = first ? auth.scope(req) : undefined;
      const firstSignIn = first ? auth.signIn(req) : undefined;
      res.once('finish', () => {
        try {
          let user: User | undefined | null = null;
          let scope: ReturnType<Auth['scope']> | null = first ? firstScope : null;
          const scopeOf = () => scope === null ? scope = auth.scope(req) : scope;
          const userOf = () => user === null ? user = auth.user(req) : user;
          const location = res.getHeader('location');
          const captured = capture({
            method, path: url.pathname, query: url.searchParams, status: res.statusCode, ...(typeof location === 'string' ? { location } : {}), ...(before ? { before } : {}),
            get scope() { return scopeOf(); },
            user: userOf,
            inputs: () => inputs() ?? {},
            userByName: name => { const record = this.store.getUserByName(name); return record ? signedInUser(record) : undefined; },
            signedInByResponse: () => {
              const cookies = res.getHeader('set-cookie');
              const pair = (Array.isArray(cookies) ? cookies : [String(cookies ?? '')]).map(cookie => cookie.split(';')[0]).find(cookie => cookie.startsWith(`${auth.cookieName}=`) && cookie.length > auth.cookieName.length + 1);
              return pair ? auth.user({ headers: { cookie: pair } } as IncomingMessage) : undefined;
            },
            editorLabel: (code, signedIn) => auth.editorRequest(code, signedIn)?.label,
          });
          if (!captured) return;
          const credentialScope = scopeOf();
          const signIn = first ? firstSignIn : credentialScope === 'browser' || credentialScope === 'editor' ? auth.signIn(req) : undefined;
          const channel = channelOf(credentialScope, credentialScope === 'editor' && signIn ? this.store.getEditorCredential(signIn)?.label : undefined, req.headers['x-unfold-client']);
          const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : undefined;
          const origin: AuditOrigin = { method, channel, confirmation: confirmationOf(req.headers['x-unfold-confirmation']), ...(req.socket.remoteAddress ? { ip: clientAddress(req, this.config?.trustedProxies) } : {}), ...(userAgent ? { userAgent } : {}) };
          let fact = captured.fact;
          if (fact.kind === 'api' && credentialScope === 'mcp') {
            const bearer = auth.bearer(req);
            fact = { ...fact, agent: { name: channel.replace(/^mcp:/, '') }, ...(bearer ? { delegation: { uid: tokenUid(bearer) } } : {}) };
          }
          const actor: AuditActor = { ...(captured.actor ? { user: person(captured.actor) } : {}), ...(signIn ? { session: signIn.slice(0, 16) } : {}) };
          this.record({ fact, actor, origin, ...(captured.target !== undefined ? { target: captured.target } : {}), ...(captured.tenants ? { tenants: captured.tenants } : {}) });
        } catch (error) {
          this.log(JSON.stringify({ level: 'error', event: 'audit.record_failed', message: String((error as Error)?.message ?? error).slice(0, 300) }));
        }
      });
    } catch (error) {
      this.log(JSON.stringify({ level: 'error', event: 'audit.record_failed', message: String((error as Error)?.message ?? error).slice(0, 300) }));
    }
  }

  /** Records one `unfold-mcp` request over HTTP as API Activity, with the MCP client as its AI agent and the delegated credential it acted with. */
  mcp(entry: McpAuditEntry): void {
    const operation = entry.method === 'tools/call' && entry.tool ? `tools/call ${entry.tool}` : entry.method ?? 'mcp';
    this.record({
      fact: { kind: 'api', service: 'unfold-mcp', operation, method: 'POST', status: entry.status, outcome: entry.outcome, ...(entry.client ? { agent: { name: entry.client, uid: entry.client } } : {}), ...(entry.delegation ? { delegation: { uid: tokenUid(entry.delegation), ...(entry.issuer ? { issuer: entry.issuer } : {}), createdAt: this.now().getTime() } } : {}), ...(entry.reason ? { inputs: { refused: entry.reason } } : {}) },
      actor: entry.user ? { user: person(entry.user) } : {},
      origin: { method: 'POST', channel: `mcp:${entry.client ?? 'unnamed client'}`, ...(entry.ip ? { ip: entry.ip } : {}), ...(entry.userAgent ? { userAgent: entry.userAgent.slice(0, 512) } : {}) },
    });
  }

  /** Removes records older than the retention behind an anchor per Tenant; never throws. */
  prune(now = this.now()): void {
    try {
      for (const pruned of this.chain.prune(new Date(now.getTime() - this.retentionDays * dayMs).toISOString(), now)) this.log(JSON.stringify({ level: 'info', event: 'audit.pruned', tenant: pruned.tenant, pruned: pruned.pruned, anchor: pruned.anchor.sequence }));
    } catch (error) { this.warn('audit.prune_failed', String((error as Error)?.message ?? error)); }
  }

  /** Signs and copies each Tenant's chain head once a day, when a signer or a bucket is configured; never throws. */
  async checkpoint(): Promise<void> {
    try { await this.checkpoints?.run(); } catch (error) { this.warn('audit.checkpoint_failed', String((error as Error)?.message ?? error)); }
  }

  /** Sends pending records to the OTLP endpoint, when one is configured. */
  async flush(): Promise<void> { await this.exporter?.flush(); }

  private queueExport(delayMs: number): void {
    if (!this.jobs) return;
    const now = this.now().getTime();
    this.jobs.queue.enqueue(auditExportJob, 'otlp', {}, now, { runAt: now + delayMs, maxAttempts: 24, repeat: 'when_finished' });
  }

  private warn(event: string, message: string): void {
    const now = this.now().getTime();
    if (now - (this.lastWarnAt.get(event) ?? -Infinity) < hourMs) return;
    this.lastWarnAt.set(event, now);
    this.log(JSON.stringify({ level: 'warn', event, message: message.slice(0, 200) }));
  }

  /**
   * Serves `GET /api/admin/audit` (NDJSON, paged by sequence) and `GET /api/admin/audit/verify` (the chain check, and
   * the check of its checkpoints when they are configured; `checkpoints=all` checks every one) to an administrator of the
   * Tenant asked for. The records route answers only while the Tenant's `audit.export` flag is on.
   */
  async serve(res: ServerResponse, request: { method: string; path: string; query: URLSearchParams; user: User }): Promise<void> {
    const fail = (status: number, code: string, message: string) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: { code, message } })); };
    if (request.method !== 'GET') return fail(405, 'method', 'Read the audit with GET.');
    if (request.user.role !== 'admin') return fail(403, 'forbidden', 'Only administrators read the audit.');
    const administered = [...new Set((request.user.memberships ?? []).filter(entry => entry.kind === 'tenant' && entry.role === 'admin').map(entry => entry.tenant))];
    const tenant = request.query.get('tenant') || (administered.length === 1 ? administered[0] : undefined);
    if (!tenant) return fail(400, 'audit_tenant', `Name the Tenant with ?tenant=. You administer ${administered.length ? administered.join(', ') : 'no Tenant'}.`);
    if (!administered.includes(tenant)) return fail(403, 'audit_tenant_forbidden', 'You are not an administrator of this Tenant.');
    if (request.path === '/api/admin/audit/verify') {
      const chain = this.chain.verify(tenant);
      const checkpoints = this.checkpoints ? await this.checkpoints.verify(tenant, { all: request.query.get('checkpoints') === 'all' }) : null;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ...chain, ok: chain.ok && (checkpoints?.ok ?? true), checkpoints }));
      return;
    }
    if (request.path !== '/api/admin/audit') return fail(404, 'not_found', 'API route not found.');
    if (!await this.exportEnabled(tenant)) return fail(404, 'audit_export_off', 'Audit export is off for this Tenant. Turn on the audit.export flag to read it here or send it to a SIEM.');
    const since = request.query.get('since');
    if (since !== null && (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(since) || Number.isNaN(Date.parse(since)))) return fail(400, 'audit_since', 'since must be an ISO 8601 UTC time, such as 2026-10-01T00:00:00Z.');
    const cursorText = request.query.get('cursor');
    const cursor = cursorText === null ? 0 : Number(cursorText);
    if (!Number.isSafeInteger(cursor) || cursor < 0) return fail(400, 'audit_cursor', 'cursor must be the sequence number of the last record you read.');
    const limitText = request.query.get('limit');
    const limit = limitText === null ? 500 : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > maxPage) return fail(400, 'audit_limit', `limit must be from 1 to ${maxPage}.`);
    const page = this.chain.page(tenant, { cursor, ...(since ? { since: new Date(since).toISOString() } : {}), limit: limit + 1 });
    const records = page.slice(0, limit);
    const head = this.chain.head(tenant);
    const headers: Record<string, string> = { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Unfold-Audit-Tenant': tenant, ...(head ? { 'X-Unfold-Audit-Head': `${head.sequence}:${head.hash}` } : {}) };
    if (page.length > limit) {
      const next = new URLSearchParams({ tenant, cursor: String(records[records.length - 1].sequence), ...(since ? { since } : {}), ...(limitText ? { limit: limitText } : {}) });
      headers['X-Unfold-Audit-Next-Cursor'] = String(records[records.length - 1].sequence);
      headers.Link = `</api/admin/audit?${next}>; rel="next"`;
    }
    res.writeHead(200, headers);
    res.end(ndjson(records));
  }

  /** Stops the retention and export timers. */
  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    if (this.ownJobs) this.jobs!.stop();
  }
}
