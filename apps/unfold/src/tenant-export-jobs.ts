import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ServerResponse } from 'node:http';
import type { AppConfig, User } from './types.ts';
import type { Store } from './store.ts';
import type { DeliveryRow } from './delivery-ledger.ts';
import { defaultTenant, validTenancyId } from './tenancy.ts';
import { buildTenantExport, type ExportSources } from './tenant-export.ts';

/** How long a finished export can be downloaded before its bundle is deleted. */
export const tenantExportTtlMs = 24 * 60 * 60 * 1000;
/** The feature flag that turns Tenant export on. Off by default. */
export const tenantExportFlag = 'tenant.export';

/** One Tenant export as the API answers it. */
export type TenantExportJob = {
  id: string; tenant: string; state: 'running' | 'ready' | 'failed';
  requestedBy: { id: string; name: string }; createdAt: string; finishedAt: string | null; expiresAt: string | null;
  bytes: number | null; sha256: string | null; rows: number | null; error: string | null; downloadUrl: string | null;
};

/** What the export service needs from the application. */
export type TenantExportOptions = {
  config: Pick<AppConfig, 'dataDir' | 'repositories' | 'taskSources' | 'tenancy'>;
  store: Store;
  secrets: readonly string[];
  application: { name: string; version: string };
  /** Whether the `tenant.export` flag is on for this person. */
  enabled: (user: User) => Promise<boolean>;
  flagDocument?: () => unknown;
  deliveryLedger?: (user: User) => Promise<{ rows: DeliveryRow[]; window: string } | { unavailable: string }>;
  workItemsInTenant?: (user: User, tenant: string, ids: string[]) => Promise<Set<string>>;
  now?: () => Date;
  ttlMs?: number;
};

function refuse(status: number, code: string, message: string): never { throw Object.assign(new Error(message), { status, code }); }

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', event, ...fields }));
}

/**
 * Runs Tenant exports as background jobs, one at a time per installation. A finished bundle stays on the data volume
 * until it expires, then it is deleted. Jobs live in memory; a restart deletes every bundle left on the volume.
 */
export class TenantExports {
  private readonly options: TenantExportOptions;
  private readonly jobs = new Map<string, TenantExportJob>();
  private readonly directory: string;
  private readonly timer: NodeJS.Timeout;

  constructor(options: TenantExportOptions) {
    this.options = options;
    this.directory = join(options.config.dataDir, 'exports');
    rmSync(this.directory, { recursive: true, force: true });
    this.timer = setInterval(() => this.sweep(), 10 * 60 * 1000);
    this.timer.unref();
  }

  private now(): Date { return this.options.now?.() ?? new Date(); }
  private bundle(id: string): string { return join(this.directory, `${id}.tar.gz`); }

  /** Whether `user` may export: an administrator, with the flag on, and while Tenant checks are enforced an admin membership of `tenant`. */
  async authorize(user: User, tenant?: string): Promise<void> {
    if (user.role !== 'admin') refuse(403, 'forbidden', 'Only administrators export a Tenant.');
    if (!(await this.options.enabled(user))) refuse(403, 'tenant_export_off', `Tenant export is off. An administrator turns it on with the ${tenantExportFlag} flag.`);
    if (tenant === undefined) return;
    if (!validTenancyId(tenant)) refuse(400, 'tenant', 'A Tenant id is lower-case letters, digits and inner hyphens.');
    if (this.options.config.tenancy?.enforce !== true) {
      if (tenant !== defaultTenant) refuse(404, 'tenant_not_found', `Tenant checks are off, so this installation is the one Tenant ${defaultTenant}.`);
      return;
    }
    if (!(user.memberships ?? []).some(held => held.kind === 'tenant' && held.tenant === tenant && held.role === 'admin')) refuse(404, 'tenant_not_found', 'You are not an Admin of this Tenant.');
  }

  /** Starts an export of `tenant` for `user` and answers the running job. */
  async start(user: User, tenant: string, confirm: unknown): Promise<TenantExportJob> {
    await this.authorize(user, tenant);
    if (confirm !== tenant) refuse(400, 'tenant_export_confirm', 'Type the Tenant id in confirm to export everything Unfold holds for it.');
    if ([...this.jobs.values()].some(job => job.state === 'running')) refuse(409, 'tenant_export_running', 'An export is already running. Wait for it to finish.');
    this.sweep();
    const id = randomBytes(16).toString('hex');
    const job: TenantExportJob = { id, tenant, state: 'running', requestedBy: { id: user.id, name: user.name }, createdAt: this.now().toISOString(), finishedAt: null, expiresAt: null, bytes: null, sha256: null, rows: null, error: null, downloadUrl: null };
    this.jobs.set(id, job);
    log('tenant_export.started', { actor: user.id, tenant, export: id });
    void this.run(job, user);
    return { ...job };
  }

  private async run(job: TenantExportJob, user: User): Promise<void> {
    const work = join(this.directory, `${job.id}.work`);
    const location = this.options.store.db.location();
    const snapshot = location ? new DatabaseSync(location, { readOnly: true }) : undefined;
    const db = snapshot ?? this.options.store.db;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      if (snapshot) { snapshot.exec('PRAGMA busy_timeout=5000; BEGIN'); snapshot.prepare('SELECT count(*) FROM sqlite_master').get(); }
      const sources: ExportSources = {
        db, config: this.options.config, secrets: this.options.secrets, application: this.options.application,
        requestedBy: { id: user.id, name: user.name },
        ...(this.options.flagDocument ? { flagDocument: this.options.flagDocument } : {}),
        ...(this.options.deliveryLedger ? { deliveryLedger: () => this.options.deliveryLedger!(user) } : {}),
        ...(this.options.workItemsInTenant ? { workItemsInTenant: (ids: string[]) => this.options.workItemsInTenant!(user, job.tenant, ids) } : {}),
        ...(this.options.now ? { now: this.options.now } : {}),
      };
      const built = await buildTenantExport(sources, job.tenant, work, this.bundle(job.id));
      const finished = this.now();
      Object.assign(job, { state: 'ready', finishedAt: finished.toISOString(), expiresAt: new Date(finished.getTime() + (this.options.ttlMs ?? tenantExportTtlMs)).toISOString(), bytes: built.bytes, sha256: built.sha256, rows: built.manifest.entities.reduce((sum, entity) => sum + entity.rows, 0), downloadUrl: `/api/admin/tenant-exports/${job.id}/download` });
      log('tenant_export.ready', { actor: user.id, tenant: job.tenant, export: job.id, rows: job.rows, bytes: job.bytes, sha256: job.sha256 });
    } catch (error) {
      rmSync(this.bundle(job.id), { force: true });
      Object.assign(job, { state: 'failed', finishedAt: this.now().toISOString(), error: 'The export could not be completed. Check the server log.' });
      console.error(JSON.stringify({ level: 'error', event: 'tenant_export.failed', actor: user.id, tenant: job.tenant, export: job.id, message: String((error as Error).message).slice(0, 300) }));
    } finally {
      if (snapshot) { if (snapshot.isTransaction) snapshot.exec('COMMIT'); snapshot.close(); }
      rmSync(work, { recursive: true, force: true });
    }
  }

  /** Deletes every bundle past its expiry and forgets its job. */
  sweep(): void {
    const now = this.now().getTime();
    for (const job of this.jobs.values()) {
      if (job.state === 'running') continue;
      const due = job.expiresAt ? Date.parse(job.expiresAt) : Date.parse(job.finishedAt ?? job.createdAt) + (this.options.ttlMs ?? tenantExportTtlMs);
      if (due > now) continue;
      rmSync(this.bundle(job.id), { force: true });
      this.jobs.delete(job.id);
      log('tenant_export.expired', { tenant: job.tenant, export: job.id });
    }
  }

  /** The exports `user` may see, newest first. */
  async list(user: User): Promise<TenantExportJob[]> {
    await this.authorize(user);
    this.sweep();
    return [...this.jobs.values()].filter(job => this.visible(user, job)).reverse().map(job => ({ ...job }));
  }

  private visible(user: User, job: TenantExportJob): boolean {
    return job.requestedBy.id === user.id;
  }

  private find(user: User, id: string): TenantExportJob {
    this.sweep();
    const job = this.jobs.get(id);
    if (!job || !this.visible(user, job)) refuse(404, 'tenant_export_not_found', 'This export is unknown, expired or not yours.');
    return job;
  }

  /** One export of `user`. */
  async get(user: User, id: string): Promise<TenantExportJob> {
    await this.authorize(user);
    return { ...this.find(user, id) };
  }

  /** Deletes an export and its bundle before it expires. */
  async remove(user: User, id: string): Promise<void> {
    await this.authorize(user);
    const job = this.find(user, id);
    if (job.state === 'running') refuse(409, 'tenant_export_running', 'Wait for the export to finish before deleting it.');
    rmSync(this.bundle(id), { force: true });
    this.jobs.delete(id);
    log('tenant_export.deleted', { actor: user.id, tenant: job.tenant, export: id });
  }

  /** Streams a ready bundle to `res`, logs the download and records it as an action of `user`. */
  async download(user: User, id: string, res: ServerResponse): Promise<void> {
    await this.authorize(user);
    const job = this.find(user, id);
    if (job.state !== 'ready') refuse(409, 'tenant_export_not_ready', job.state === 'failed' ? 'This export failed. Start a new one.' : 'This export is still running.');
    const path = this.bundle(id);
    const size = statSync(path).size;
    const stamp = job.createdAt.replace(/[:.]/g, '-');
    res.writeHead(200, {
      'Content-Type': 'application/gzip', 'Content-Length': String(size), 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="unfold-tenant-${job.tenant}-${stamp}.tar.gz"`,
      'Repr-Digest': `sha-256=:${Buffer.from(job.sha256!, 'hex').toString('base64')}:`,
    });
    log('tenant_export.downloaded', { actor: user.id, tenant: job.tenant, export: id, bytes: size });
    this.options.store.recordAction({ at: this.now().toISOString(), userId: user.id, userName: user.name, role: user.role, channel: 'browser', action: 'GET /api/admin/tenant-exports/:id/download', method: 'GET', target: null, inputs: { export: id, tenant: job.tenant }, confirmation: null, status: 200, outcome: 'done' });
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(path);
      stream.once('error', reject);
      res.once('close', () => { stream.destroy(); resolve(); });
      stream.pipe(res);
    });
  }
}

const routes = {
  collection: /^\/api\/admin\/tenant-exports$/,
  one: /^\/api\/admin\/tenant-exports\/([0-9a-f]{32})$/,
  download: /^\/api\/admin\/tenant-exports\/([0-9a-f]{32})\/download$/,
};

/** Whether `path` is one of the Tenant export routes. */
export function isTenantExportRoute(path: string): boolean {
  return path.startsWith('/api/admin/tenant-exports');
}

/** What a Tenant export route needs from the request. */
export type TenantExportRequest = { method: string; path: string; user: User; scope: string | undefined; body: () => Promise<Record<string, unknown>>; res: ServerResponse };

/**
 * Serves the Tenant export routes. Answers the status and JSON body, or `null` when it streamed the bundle itself.
 * Every route takes a browser sign-in: an editor or MCP credential cannot export a Tenant.
 */
export async function tenantExportRoute(service: TenantExports, request: TenantExportRequest): Promise<{ status: number; body: unknown } | null> {
  const { method, path, user } = request;
  if (request.scope !== 'browser') refuse(403, 'browser_only', 'Export a Tenant from the workbench in your browser.');
  let match: RegExpExecArray | null;
  if (routes.collection.test(path)) {
    if (method === 'GET') return { status: 200, body: { exports: await service.list(user) } };
    if (method === 'POST') {
      const input = await request.body();
      const tenant = input.tenant === undefined ? defaultTenant : input.tenant;
      if (typeof tenant !== 'string') refuse(400, 'tenant', 'A Tenant id is lower-case letters, digits and inner hyphens.');
      return { status: 202, body: { export: await service.start(user, tenant, input.confirm) } };
    }
    refuse(405, 'method', 'List exports with GET or start one with POST.');
  }
  if ((match = routes.download.exec(path))) {
    if (method !== 'GET') refuse(405, 'method', 'Download an export with GET.');
    await service.download(user, match[1], request.res);
    return null;
  }
  if ((match = routes.one.exec(path))) {
    if (method === 'GET') return { status: 200, body: { export: await service.get(user, match[1]) } };
    if (method === 'DELETE') { await service.remove(user, match[1]); return { status: 200, body: { deleted: match[1] } }; }
    refuse(405, 'method', 'Read an export with GET or delete it with DELETE.');
  }
  return refuse(404, 'not_found', 'API route not found.');
}
