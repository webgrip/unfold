import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/** The database the queue lives in: the workbench store, or anything with its `db` and `transaction`. */
export type JobDatabase = { db: DatabaseSync; transaction<T>(fn: () => T): T };
/** A {@link JobDatabase} over a bare SQLite connection. */
export function jobDatabase(db: DatabaseSync): JobDatabase {
  return {
    db,
    transaction<T>(fn: () => T): T {
      db.exec('BEGIN IMMEDIATE');
      try { const value = fn(); db.exec('COMMIT'); return value; }
      catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
    },
  };
}

/** Where a job stands: waiting for its time, held by a worker under a lease, finished, or given up (dead-lettered). */
export type JobState = 'pending' | 'running' | 'done' | 'dead';
/**
 * What happens when a lease runs out before its worker settled the job. `at_least_once` puts the job back, so it runs
 * again; `at_most_once` makes it dead with an unknown outcome, for work that must never be repeated blindly.
 */
export type JobGuarantee = 'at_least_once' | 'at_most_once';
/** One unit of background work in the queue. */
export type Job<P = unknown> = {
  id: number; kind: string; key: string; payload: P; state: JobState; guarantee: JobGuarantee;
  attempts: number; maxAttempts: number; runAt: string; leaseOwner: string | null; leaseUntil: string | null;
  lastError: string | null; createdAt: string; updatedAt: string; finishedAt: string | null;
};
/** How {@link JobQueue.enqueue} treats a key it already holds. */
export type JobRepeat = 'never' | 'when_finished';
/** The options of {@link JobQueue.enqueue}. */
export type EnqueueOptions = {
  /** When the job may run first; now when absent. */
  runAt?: number;
  /** How many attempts it gets before it is dead. */
  maxAttempts?: number;
  guarantee?: JobGuarantee;
  /**
   * `never` (the default) keeps the key forever: a second enqueue changes nothing, even after the job finished.
   * `when_finished` coalesces only while the job waits or runs; once done or dead, the key starts a new job.
   */
  repeat?: JobRepeat;
};
/** What one queue row looks like to an operator: no key and no payload, which may carry personal data. */
export type JobView = Omit<Job, 'payload' | 'key' | 'leaseOwner'>;
/** The counts of one kind of job by state, with when its oldest waiting job became due. */
export type JobKindSummary = { kind: string; pending: number; running: number; done: number; dead: number; oldestDueAt: string | null };

/** The defaults of the queue. */
export const jobDefaults = { maxAttempts: 8, leaseMs: 300_000, errorLength: 500 } as const;

/** The wait settings of {@link backoff}. */
export type BackoffPolicy = { baseMs: number; maxMs: number; factor?: number; jitter?: number };
/** The default backoff: 30 seconds, doubling, capped at an hour, with 20% jitter either way. */
export const defaultBackoff: BackoffPolicy = { baseMs: 30_000, maxMs: 3_600_000, factor: 2, jitter: 0.2 };

/** The wait before the next attempt after `attempts` failed ones: exponential, capped, then spread by jitter from `random`. */
export function backoff(attempts: number, policy: BackoffPolicy = defaultBackoff, random: () => number = Math.random): number {
  const factor = policy.factor ?? 2;
  const jitter = policy.jitter ?? 0.2;
  const base = Math.min(policy.maxMs, policy.baseMs * factor ** Math.max(0, attempts - 1));
  return Math.max(0, Math.round(base * (1 - jitter + 2 * jitter * random())));
}

type Row = Record<string, string | number | null>;
const text = (value: string | number | null) => value === null ? null : String(value);
function jobFrom<P>(row: Row): Job<P> {
  return {
    id: Number(row.id), kind: String(row.kind), key: String(row.key), payload: JSON.parse(String(row.payload)) as P, state: String(row.state) as JobState,
    guarantee: String(row.guarantee) as JobGuarantee, attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts), runAt: String(row.run_at),
    leaseOwner: text(row.lease_owner), leaseUntil: text(row.lease_until), lastError: text(row.last_error),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), finishedAt: text(row.finished_at),
  };
}
const iso = (ms: number) => new Date(ms).toISOString();
const owners = new WeakMap<DatabaseSync, string>();

/**
 * Unfold's one durable job queue, a table in the workbench database. A job is enqueued once per kind and idempotency
 * key, leased by a worker for a visibility timeout, and settled as done, retried at a later time, or dead after its
 * last attempt. A lease that runs out puts the job back, or makes an at-most-once job dead. Unfold has one writer
 * (ADR-0002), so the first queue opened on a store takes over every lease an earlier opening held.
 */
export class JobQueue {
  readonly store: JobDatabase;
  /** The lease holder of this opening of the store. */
  readonly owner: string;

  constructor(store: JobDatabase | DatabaseSync, now: number = Date.now()) {
    this.store = 'transaction' in store && 'db' in store ? store : jobDatabase(store as DatabaseSync);
    store = this.store;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, guarantee TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL, run_at TEXT NOT NULL, lease_owner TEXT, lease_until TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, UNIQUE (kind, key));
      CREATE INDEX IF NOT EXISTS jobs_due ON jobs(kind, state, run_at);
      CREATE INDEX IF NOT EXISTS jobs_lease ON jobs(state, lease_until);
    `);
    const known = owners.get(store.db);
    if (known) { this.owner = known; return; }
    this.owner = `lease_${randomBytes(9).toString('hex')}`;
    owners.set(store.db, this.owner);
    this.takeOver(now);
  }

  private release(where: string, at: string, ...values: (string | number)[]): number {
    return this.store.transaction(() => {
      const dead = Number(this.store.db.prepare(`UPDATE jobs SET state='dead', lease_owner=NULL, lease_until=NULL, last_error=?, updated_at=?, finished_at=? WHERE state='running' AND (guarantee='at_most_once' OR attempts>=max_attempts) AND ${where}`)
        .run('lease_lost: the worker stopped before it recorded an outcome', at, at, ...values).changes);
      const back = Number(this.store.db.prepare(`UPDATE jobs SET state='pending', lease_owner=NULL, lease_until=NULL, last_error=COALESCE(last_error, 'lease_lost'), updated_at=? WHERE state='running' AND ${where}`)
        .run(at, ...values).changes);
      return dead + back;
    });
  }

  /** Releases the leases an earlier opening of the store held, as {@link expire} would once they ran out. */
  takeOver(now: number): number { return this.release('lease_owner<>?', iso(now), this.owner); }
  /** Releases every lease that ran out by `now`: the job waits again, or is dead when at-most-once or out of attempts. */
  expire(now: number): number { const at = iso(now); return this.release('lease_until<=?', at, at); }

  /**
   * Adds a job unless its kind and key are known (see {@link EnqueueOptions.repeat}). Answers the job and whether this
   * call queued it. Safe inside a caller's transaction.
   */
  enqueue<P>(kind: string, key: string, payload: P, now: number, options: EnqueueOptions = {}): { job: Job<P>; queued: boolean } {
    const at = iso(now);
    const runAt = iso(options.runAt ?? now);
    const maxAttempts = options.maxAttempts ?? jobDefaults.maxAttempts;
    const guarantee = options.guarantee ?? 'at_least_once';
    const body = JSON.stringify(payload);
    let queued = Number(this.store.db.prepare("INSERT OR IGNORE INTO jobs(kind,key,payload,state,guarantee,attempts,max_attempts,run_at,created_at,updated_at) VALUES(?,?,?,'pending',?,0,?,?,?,?)")
      .run(kind, key, body, guarantee, maxAttempts, runAt, at, at).changes) === 1;
    if (!queued && options.repeat === 'when_finished') {
      queued = Number(this.store.db.prepare("UPDATE jobs SET payload=?, state='pending', guarantee=?, attempts=0, max_attempts=?, run_at=?, lease_owner=NULL, lease_until=NULL, last_error=NULL, created_at=?, updated_at=?, finished_at=NULL WHERE kind=? AND key=? AND state IN ('done','dead')")
        .run(body, guarantee, maxAttempts, runAt, at, at, kind, key).changes) === 1;
    }
    return { job: this.get<P>(kind, key)!, queued };
  }

  /** The job of `kind` and `key`, or `undefined`. */
  get<P = unknown>(kind: string, key: string): Job<P> | undefined {
    const row = this.store.db.prepare('SELECT * FROM jobs WHERE kind=? AND key=?').get(kind, key) as Row | undefined;
    return row ? jobFrom<P>(row) : undefined;
  }
  /** The job `id`, or `undefined`. */
  byId<P = unknown>(id: number): Job<P> | undefined {
    const row = this.store.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Row | undefined;
    return row ? jobFrom<P>(row) : undefined;
  }

  /**
   * Leases up to `limit` jobs of `kind` that are due at `now`, oldest due first, after releasing leases that ran out.
   * Each leased job counts one attempt and is held until `now + leaseMs`.
   */
  lease<P = unknown>(kind: string, now: number, limit: number, leaseMs: number = jobDefaults.leaseMs): Job<P>[] {
    this.expire(now);
    const at = iso(now);
    const until = iso(now + leaseMs);
    return this.store.transaction(() => {
      const rows = this.store.db.prepare("SELECT id FROM jobs WHERE kind=? AND state='pending' AND run_at<=? ORDER BY run_at, id LIMIT ?").all(kind, at, limit) as { id: number }[];
      const take = this.store.db.prepare("UPDATE jobs SET state='running', attempts=attempts+1, lease_owner=?, lease_until=?, updated_at=? WHERE id=? AND state='pending'");
      const leased: Job<P>[] = [];
      for (const { id } of rows) if (Number(take.run(this.owner, until, at, id).changes) === 1) leased.push(this.byId<P>(id)!);
      return leased;
    });
  }

  private settle(job: Job, now: number, set: string, ...values: (string | number | null)[]): boolean {
    return Number(this.store.db.prepare(`UPDATE jobs SET ${set}, lease_owner=NULL, lease_until=NULL, updated_at=? WHERE id=? AND state='running' AND lease_owner=? AND lease_until=?`)
      .run(...values, iso(now), job.id, this.owner, job.leaseUntil).changes) === 1;
  }
  private error(message: string): string { return message.slice(0, jobDefaults.errorLength); }

  /** Records that the leased `job` finished. False when its lease was lost first. */
  complete(job: Job, now: number): boolean { return this.settle(job, now, "state='done', last_error=NULL, finished_at=?", iso(now)); }
  /** Puts the leased `job` back to run at `runAt`, or makes it dead when it has used its last attempt. Answers its state. */
  retry(job: Job, now: number, error: string, runAt: number): JobState | undefined {
    if (job.attempts >= job.maxAttempts) return this.bury(job, now, error) ? 'dead' : undefined;
    return this.settle(job, now, "state='pending', run_at=?, last_error=?", iso(runAt), this.error(error)) ? 'pending' : undefined;
  }
  /** Gives the leased `job` up now: it stays in the queue as dead until an operator sends it again. */
  bury(job: Job, now: number, error: string): boolean { return this.settle(job, now, "state='dead', last_error=?, finished_at=?", this.error(error), iso(now)); }
  /** Puts the leased `job` back to run at `runAt` without counting the attempt, because nothing was tried. */
  defer(job: Job, now: number, runAt: number): boolean { return this.settle(job, now, "state='pending', attempts=attempts-1, run_at=?", iso(runAt)); }
  /** Replaces the payload of a waiting or running job, for work whose input changes while it waits. */
  update<P>(kind: string, key: string, payload: P, now: number): boolean {
    return Number(this.store.db.prepare("UPDATE jobs SET payload=?, updated_at=? WHERE kind=? AND key=? AND state IN ('pending','running')").run(JSON.stringify(payload), iso(now), kind, key).changes) === 1;
  }

  /** Makes waiting jobs of `kind` whose key starts with `prefix` due now, such as after their receiver came back. */
  wake(kind: string, prefix: string, now: number): number {
    return Number(this.store.db.prepare("UPDATE jobs SET run_at=?, updated_at=? WHERE kind=? AND state='pending' AND substr(key,1,length(?))=? AND run_at>?").run(iso(now), iso(now), kind, prefix, prefix, iso(now)).changes);
  }
  /** Puts a dead job back in the queue, due at `now`, with a fresh attempt count. False when it is not dead. */
  resend(kind: string, key: string, now: number): boolean {
    return Number(this.store.db.prepare("UPDATE jobs SET state='pending', attempts=0, run_at=?, last_error=NULL, updated_at=?, finished_at=NULL WHERE kind=? AND key=? AND state='dead'").run(iso(now), iso(now), kind, key).changes) === 1;
  }
  /** Removes the jobs of `kind` whose key starts with `prefix` that have not finished, such as when their target is deleted. */
  drop(kind: string, prefix: string): number {
    return Number(this.store.db.prepare("DELETE FROM jobs WHERE kind=? AND substr(key,1,length(?))=? AND state IN ('pending','dead')").run(kind, prefix, prefix).changes);
  }

  /** Every kind's counts by state, by kind. */
  summary(): JobKindSummary[] {
    const kinds = new Map<string, JobKindSummary>();
    for (const row of this.store.db.prepare("SELECT kind, state, COUNT(*) AS n, MIN(CASE WHEN state='pending' THEN run_at END) AS oldest FROM jobs GROUP BY kind, state ORDER BY kind").all() as { kind: string; state: JobState; n: number; oldest: string | null }[]) {
      const entry = kinds.get(row.kind) ?? { kind: row.kind, pending: 0, running: 0, done: 0, dead: 0, oldestDueAt: null };
      entry[row.state] = Number(row.n);
      if (row.state === 'pending') entry.oldestDueAt = row.oldest;
      kinds.set(row.kind, entry);
    }
    return [...kinds.values()];
  }
  /** Jobs that need an operator's eye: dead ones, and waiting ones that failed at least once. Newest change first. */
  troubled(limit: number, kind?: string): JobView[] {
    const rows = this.store.db.prepare(`SELECT * FROM jobs WHERE (state='dead' OR (state IN ('pending','running') AND last_error IS NOT NULL))${kind ? ' AND kind=?' : ''} ORDER BY updated_at DESC, id DESC LIMIT ?`)
      .all(...(kind ? [kind, limit] : [limit])) as Row[];
    return rows.map(row => { const { payload: _payload, key: _key, leaseOwner: _owner, ...view } = jobFrom(row); return view; });
  }
  /** Deletes finished jobs whose last change is older than `before`; with `kind`, only that kind's. */
  prune(before: number, kind?: string): number {
    return Number(this.store.db.prepare(`DELETE FROM jobs WHERE state IN ('done','dead') AND updated_at<?${kind ? ' AND kind=?' : ''}`).run(...(kind ? [iso(before), kind] : [iso(before)])).changes);
  }
}
