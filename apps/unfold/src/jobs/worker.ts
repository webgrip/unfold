import { backoff, defaultBackoff, jobDefaults, type BackoffPolicy, type Job, type JobQueue } from './queue.ts';

/**
 * What a handler says about one attempt. `done` finishes the job. `retry` tries again after `afterMs`, or after the
 * handler's backoff when absent, until the job's attempts run out. `dead` gives it up now. `later` waits until `at`
 * (epoch milliseconds) without counting the attempt, because nothing was tried.
 */
export type JobOutcome = { done: true } | { retry: string; afterMs?: number } | { dead: string } | { later: number };

/** The work of one kind of job. */
export type JobHandler<P = unknown> = {
  kind: string;
  run(job: Job<P>): Promise<JobOutcome>;
  /** How many jobs of this kind run at once. One when absent. */
  concurrency?: number;
  /** How long a lease holds before the job is released, in milliseconds. */
  leaseMs?: number;
  /** The waits between attempts when the handler names none. */
  backoff?: BackoffPolicy;
  /** How long finished jobs of this kind are kept, in milliseconds; `undefined` keeps them for {@link JobWorker}'s default. */
  retainMs?: number;
};

/** The options of {@link JobWorker}. */
export type JobWorkerOptions = {
  clock?: () => number;
  random?: () => number;
  log?: (level: 'info' | 'warn', event: string, fields: Record<string, unknown>) => void;
  /** How long finished jobs are kept by default. */
  retainMs?: number;
};

const message = (error: unknown) => String((error as Error)?.message ?? error ?? 'failed').slice(0, 200);

/**
 * Runs the handlers registered for each kind against the {@link JobQueue}: leases what is due, runs it, and records the
 * outcome. One worker serves the whole application; {@link drain} lets a service or a test run one kind now.
 */
export class JobWorker {
  readonly queue: JobQueue;
  private readonly handlers = new Map<string, JobHandler<any>>();
  private readonly busy = new Map<string, Promise<number>>();
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly log: NonNullable<JobWorkerOptions['log']>;
  private readonly retainMs: number;
  private timers: NodeJS.Timeout[] = [];
  private stopped = false;

  constructor(queue: JobQueue, options: JobWorkerOptions = {}) {
    this.queue = queue;
    this.clock = options.clock ?? Date.now;
    this.random = options.random ?? Math.random;
    this.log = options.log ?? ((level, event, fields) => (level === 'warn' ? console.error : console.log)(JSON.stringify({ level, event, ...fields })));
    this.retainMs = options.retainMs ?? 14 * 86_400_000;
  }

  /** Adds the handler of one kind; a second handler for the same kind replaces the first. */
  register<P>(handler: JobHandler<P>): void { this.handlers.set(handler.kind, handler); }
  /** The kinds with a handler. */
  kinds(): string[] { return [...this.handlers.keys()]; }

  /**
   * Runs the due jobs of `kind`, at most `limit`, `concurrency` at a time, and answers how many it attempted; jobs a
   * handler put off with `later` do not count. A drain asked for while one of the same kind runs waits for it and adds nothing.
   */
  async drain(kind: string, limit = 50): Promise<number> {
    const running = this.busy.get(kind);
    if (running) { await running.catch(() => 0); return 0; }
    const work = this.run(kind, limit);
    this.busy.set(kind, work);
    try { return await work; } finally { this.busy.delete(kind); }
  }

  private async run(kind: string, limit: number): Promise<number> {
    const handler = this.handlers.get(kind);
    if (!handler) return 0;
    const width = Math.max(1, handler.concurrency ?? 1);
    let attempted = 0;
    let taken = 0;
    while (taken < limit && !this.stopped) {
      const jobs = this.queue.lease(kind, this.clock(), Math.min(width, limit - taken), handler.leaseMs ?? jobDefaults.leaseMs);
      if (!jobs.length) break;
      taken += jobs.length;
      const counted = await Promise.all(jobs.map(job => this.attempt(handler, job)));
      attempted += counted.filter(Boolean).length;
    }
    return attempted;
  }

  private async attempt(handler: JobHandler<any>, job: Job): Promise<boolean> {
    let outcome: JobOutcome;
    try { outcome = await handler.run(job); }
    catch (error) { outcome = { retry: message(error) }; }
    const now = this.clock();
    if ('later' in outcome) { this.queue.defer(job, now, outcome.later); return false; }
    if ('done' in outcome) { this.queue.complete(job, now); return true; }
    if ('dead' in outcome) {
      if (this.queue.bury(job, now, outcome.dead)) this.log('warn', 'job.dead', { kind: job.kind, job: job.id, attempts: job.attempts, error: outcome.dead.slice(0, 200) });
      return true;
    }
    const wait = outcome.afterMs ?? backoff(job.attempts, handler.backoff ?? defaultBackoff, this.random);
    if (this.queue.retry(job, now, outcome.retry, now + wait) === 'dead') this.log('warn', 'job.dead', { kind: job.kind, job: job.id, attempts: job.attempts, error: outcome.retry.slice(0, 200) });
    return true;
  }

  /** Drains every kind every `intervalMs` and prunes finished jobs hourly. */
  start(intervalMs = 5_000): void {
    this.stopped = false;
    const tick = () => {
      if (this.stopped) return;
      for (const kind of this.kinds()) void this.drain(kind).catch(error => this.log('warn', 'job.drain_failed', { kind, message: message(error) }));
    };
    const prune = () => {
      const now = this.clock();
      for (const kind of this.kinds()) this.queue.prune(now - (this.handlers.get(kind)!.retainMs ?? this.retainMs), kind);
    };
    this.timers.push(setInterval(tick, intervalMs).unref(), setInterval(() => { try { prune(); } catch (error) { this.log('warn', 'job.prune_failed', { message: message(error) }); } }, 3_600_000).unref());
  }
  /** Stops the loop. A job in flight finishes; one whose outcome is not recorded is released when its lease runs out or at the next start. */
  stop(): void { this.stopped = true; for (const timer of this.timers) clearInterval(timer); this.timers = []; }
}
